# 0002 Money-Path Write Layer: One Write Path, Append-Only Ledger

Date: 2026-09-15

Provenance: restored from `470bf41:docs/decisions/0006-kientaohub-money-write-layer.md`
(accepted 2026-09-14). The daptin mechanisms it described (`$wallet` Go action
performer, `FinancialWriteDeniedTables` middleware denylist, boot-installed
plpgsql guards) belonged to the implementation removed in `366ac21`. The policy
below is retained; every mechanism is restated for Payload and PostgreSQL and
none of it is implemented yet.

## Status

Accepted

## Context

`PLAN.md` BR-01 (`PLAN.md:1364-1377`) requires the wallet debit to run inside a
database transaction with a lock, and to proceed only when the conditional
update affected exactly one row. BR-02 (`PLAN.md:1381-1389`) requires a unique
constraint on `payment_transactions (provider, provider_transaction_id)`. BR-03
(`PLAN.md:1393-1401`) forbids updating or deleting financial ledger rows and
requires reversal or adjustment entries instead. NFR-05
(`PLAN.md:1816-1826`) requires every money-affecting operation to be atomic,
idempotent, auditable, and reversible by compensating entry. §12.2
(`PLAN.md:1577`) forbids letting an administrator type a balance into an
ordinary input.

Observed today: none of this exists. The Payload schema in `web/payload.db` (87
tables) contains no `wallets`, `wallet_ledger`, `payment_intents`,
`payment_transactions`, `entitlements`, `download_events`, or `reviews`. Its
`transactions` and `orders` collections are the template's Stripe
physical-goods bookkeeping, not the `PLAN.md` §11.1 ledger.

## Decision

Four rules, inherited by every money-shaped collection this repository adds:

- **One write path.** Every wallet balance change goes through a single
  server-side module using the Payload local API inside one database
  transaction, and is paired with a ledger row in the same transaction. No
  collection `create`/`update`/`delete` operation, no admin-panel field, and no
  REST or GraphQL write path may change a balance or write a ledger row.
- **Direct writes denied for every principal, including administrators.** Money
  collections deny `create`, `update`, and `delete` through Payload access
  control for all roles and expose read only. An administrator adjusts a
  balance through the dedicated adjustment form that records amount, direction,
  reason, and reference, never through a generic edit form.
- **Ledger append-only.** Ledger rows are never updated or deleted; corrections
  are reversal entries (BR-03). PostgreSQL triggers refusing `UPDATE`,
  `DELETE`, and `TRUNCATE` on the ledger table, and `DELETE` and `TRUNCATE` on
  the wallet table, are installed by versioned migration so the barrier
  survives a database rebuild.
- **Balance is derived, not the source of truth.** The wallet balance is
  bookkeeping maintained by the write path; the ledger is the record.
  Corrections use `PLAN.md` §6.2 integer VND, and timestamps are UTC.

Refusal must be distinguishable from success: insufficient funds returns an
explicit typed failure, never a success response with no money moved.

**Extension rule:** every new money table adds its access-control block, its
append-only or write-denial rule, and its trigger entry in the same commit. A
new server-side path that can write an arbitrary table requires a denial check
against the money tables.

Named residuals, carried forward honestly:

- Host or superuser database access can still mutate wallets and insert forged
  ledger rows, and can drop the triggers between boots. Mitigation is
  operational credential custody, not schema.
- `INSERT` on the wallet table (minting a balance row) is not blocked by the
  triggers, which cover update, delete, and truncate only.
- Balance updates are not blocked at the database level, because a database rule
  cannot distinguish the write path's legitimate debit from any other statement
  on the same connection.
- BR-02 idempotency lands as a unique index on
  `payment_transactions (provider, provider_transaction_id)`; until it exists,
  duplicate webhooks are not prevented by the schema.

## Alternatives Considered

1. **Money writes through ordinary collection CRUD with access control only** —
   rejected: access control cannot distinguish a legitimate debit from a manual
   edit by the same principal, and leaves no single place to enforce atomicity.
2. **A separate money service holding its own store** — rejected as the primary
   design: a second write authority for the same data. Retained only as a
   fallback if Postgres cannot hold the money path.
3. **Insufficient funds as a success response plus a status field** — rejected:
   a non-2xx is unambiguous at every client and prevents wrapper steps from
   continuing after money failed to move.
4. **Hand-applied SQL guards** — rejected: `PLAN.md` §37 requires versioned,
   reproducible migrations; enforcement living only in a live database silently
   disappears on rebuild.
5. **Audit-log table as enforcement** — rejected: an audit row is evidence, not
   a barrier.

## Consequences

Positive:

- One place to review for correctness, and every balance change paired with a
  ledger row.
- Direct writes to financial tables are refused for every principal, which the
  removed daptin implementation could not do for administrators.
- Enforcement is reproducible from the repository through migrations.

Tradeoffs:

- Money becomes unavailable through the Payload admin UI and REST API by
  construction; operator workflows need the dedicated adjustment path first.
- PostgreSQL-specific triggers; the money path is Postgres-only by design.
- The write path bypasses collection hooks, so the denial rules and the write
  path must be reviewed together on every money change.

## Follow-Up

- The payment slice declares `payment_intents`, `payment_transactions`, and
  `payment_webhook_events` per `PLAN.md` §11.1, each with its access-control
  block, ledger or write-denial rules, and the BR-02 unique index in one
  commit.
- The wallet and ledger collections are declared in the same slice as the
  write path, since the rules and the path must land together.
- Concurrency proof for BR-01 (no negative balance under simultaneous debits)
  belonged to the removed implementation and must be re-established against the
  Postgres write path; no such test exists today.
