# 0006 Money-Path Write Layer: $wallet Performer, Financial Denylist, Append-Only Guards

Date: 2026-09-14

## Status

Accepted

## Context

The money-path spike (recorded in `docs/plans/active/kientaohub-phase-0.md`,
Validation rows 1–13) measured two gaps that disqualify the schema-only path
for money, plus one platform rule that disqualifies permission bits:

1. **No bound parameters.** `$n` placeholders are consumed by daptin's own
   `$`-substitution (`daptin/server/resource/handle_action.go:1257`), and
   `~field` substitutes only when the whole attribute starts with `~`
   (`:1229`). Measured: `$1` → 500 `pq: syntax error at or near "<"`;
   `~amount` inside query text → 500 `pq: column "amount" does not exist`
   (spike rows 10–11). A value can only reach SQL by string concatenation —
   an injection surface.
2. **No success signal.** The conditional `UPDATE` returned no affected-row
   count and the action replied `HTTP 200 {"Attributes":[]}` both when the
   debit applied and when the guard refused it (spike row 9). No order flow
   can branch on whether money moved.
3. **Administrators bypass table permission by platform rule**
   (`daptin/wiki/Permissions.md:242`;
   `daptin/server/resource/middleware_tableaccess_permission.go:88-90`; every
   `Can*` returns true for the admin group,
   `daptin/server/permission/permission.go:102-105, :127-130, :153-156`). No
   permission bit can deny an administrator.

Multi-table atomicity and rollback are real (spike rows 2–3), so the fallback
in decision 0005 alternative 3 (a separate money service) did not trigger.
Owner grant 2026-09-14 covers a Go change inside `daptin/`, but not product
policy (pricing, commission, provider, wallet ownership/entitlement shaping).

## Decision

Three mechanisms, selected together as one decision set (one commit —
splitting them leaves the performer without its enforcement):

**(a) Money-path write layer — a Go action performer `$wallet` inside
daptin** (`daptin/server/actions/action_wallet.go`), writing wallet + ledger
rows with bound parameters on the action's injected `*sqlx.Tx`, returning a
typed `ActionResponse` and a distinct HTTP 409 on refusal. Operations:
`create_wallet`, `debit`, `credit`. Refusal (insufficient funds) returns
`api2go.NewHTTPError(..., "insufficient_funds", 409)`, which propagates as
HTTP 409 (`handle_action.go:188-191`) and rolls the action transaction back
(`:133-134`). No caller value is ever interpolated into SQL text.

**(b) Admin-bypass closure — a financial-write denylist**
(`FinancialWriteDeniedTables` in `daptin/server/resource/financial_guard.go`)
checked in `TableAccessPermissionChecker.InterceptBefore` **before** the
administrator early-return, plus the same denylist applied to the
`__data_import` performer (which calls `DirectInsert`/`TruncateTable` with a
caller-supplied table name and bypasses the middleware —
`daptin/server/actions/action_import_data.go:165, :185`), with the decision-(c)
triggers as backstop for middleware-bypassing paths (notably the action DELETE
outcome's `DeleteWithoutFilters`, `handle_action.go:597`).

**(c) Ledger append-only enforcement — boot-installed, idempotent PostgreSQL
triggers** (`InstallFinancialGuards`, called from `InitialiseServerResources`
after `CreateIndexes`, fatal on failure via `log.Fatalf`, not `CheckErr`):
`wallet_ledger` refuses `UPDATE`/`DELETE`/`TRUNCATE`; `wallets` refuses
`DELETE`/`TRUNCATE`. `wallets` `UPDATE` is deliberately not blocked — the
performer's debit needs it, and a trigger cannot distinguish the performer's
legitimate debit from a same-connection edit; that path is closed at the app
layer only. Boot installation (not hand-applied psql) because decision 0003
makes the database a merge target that is periodically rebuilt — enforcement
living only in the DB would silently disappear.

The action path still runs as the caller's `sessionUser` with the
administrator group appended (`handle_action.go:401-403`), unchanged: an
`EXECUTE` outcome reaches its performer directly without the table-access
middleware, and the `$wallet` performer writes bound SQL on the action
transaction, never through `DbResource`, so the denylist never sees it.

**Extension rule:** every new money table = schema entry +
`FinancialWriteDeniedTables` entry + trigger entry, in the same commit. A new
arbitrary-table write performer requires a denylist check — review-blocking if
missed. The plpgsql installer is PostgreSQL-specific — correct for this
deployment (`daptin/docker-compose.yml` uses postgres:17-bookworm).

Named residuals: host/superuser psql can still `UPDATE wallets`, forge ledger
`INSERT`s, and `DROP TRIGGER` between boots (host access is already
administrator-equivalent; mitigation is operational credential custody); the
Execute gate is coarse (`Permission: 33` + action `Permission: 32` lets any
caller invoke `wallet_debit` on a known wallet `reference_id` —
row-ownership/entitlement shaping is deferred product policy); no actor column
on `wallet_ledger` in proof scope (attribution is in server logs); no
idempotency constraint yet (double-debit with the same reference is not
prevented; the unique constraint lands on `payment_transactions` later).

## Alternatives Considered

1. **Schema-only `$transaction query` action with `{{ }}`-concatenated SQL** —
   rejected: the measured gaps are disqualifying for money (injection surface,
   refusal unobservable).
2. **Separate Go money service** (decision 0005 alternative 3) — kept as the
   recorded fallback; its trigger ("daptin cannot hold the money path") did
   not fire.
3. **Insufficient-funds as HTTP 200 + status field** — rejected: a non-2xx is
   unambiguous at every client and aborts later outcomes of a wrapper action,
   which is the correct behavior when money did not move.
4. **Hand-applied psql triggers** — rejected as primary (violates decision
   0003; silently lost on rebuild); acceptable only as fallback if the Go-change
   grant is ever revoked.
5. **Measured-audit (`IsAuditEnabled`) as enforcement** — rejected: CREATE
   writes nothing, no actor column, no reason (spike row 12); kept only as
   optional secondary evidence.

## Consequences

Positive:

- One write surface for money (`POST /action/wallets/wallet_create|wallet_debit|wallet_credit`);
  every balance change paired with a ledger row (PLAN.md §42.3).
- Refusal is distinguishable: `200` + `wallet.mutation` = money moved; `409` +
  `insufficient_funds` = refused, nothing moved; `400` validation; `403`
  denylist/permission; `5xx` = rolled back.
- Direct writes to financial tables are refused for every principal including
  administrators (middleware denylist), and ledger UPDATE/DELETE are refused at
  the database level for every path and role (triggers).
- Enforcement survives a database rebuild (boot-installed from the image that
  owns all other DDL).

Tradeoffs:

- Commit #8 touches a hot upstream file
  (`middleware_tableaccess_permission.go`) — the denylist edit is ≤10 lines to
  minimize rebase conflict; decision 0001's stale patch count is corrected as
  part of this package.
- PostgreSQL-specific trigger installer; a session-GUC-guarded
  `wallets`-UPDATE trigger was considered and rejected (a psql superuser can
  set the same GUC — adds protocol, closes nothing).

## Follow-Up

- The P0 scope / state-machine / payment-provider package consumes: action
  names and request/response contract, `wallets`/`wallet_ledger` shapes, and
  the invariants (exactly one financial write path; corrections are reversal
  entries per BR-03, never UPDATE; BR-02 idempotency as a unique constraint on
  `payment_transactions (provider, provider_transaction_id)` from the
  `reference_type`/`reference_id` hooks; integer money, UTC; no
  `Permission: 0`).
- `payment_intents` and `payment_transactions` (PLAN.md §11.1/§11.2) are
  declared by that package, each with the decision-0002 authorization block, a
  `FinancialWriteDeniedTables` entry, and a trigger entry, in one commit.
