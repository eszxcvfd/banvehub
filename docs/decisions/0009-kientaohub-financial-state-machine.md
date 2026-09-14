# 0009 Financial State Machine (Payment Intents)

Date: 2026-09-14

## Status

Accepted

## Context

`PLAN.md` §11.2 (`PLAN.md:1513-1523`) fixes the payment status enum to
exactly seven states — CREATED, PENDING, PAID, EXPIRED, FAILED, CANCELLED,
REFUNDED — with no extensions. FR-12 (`PLAN.md:563-587`) chains intent
creation → provider checkout → verified webhook → idempotency → PAID →
ledger CREDIT. §21 (`PLAN.md:2431-2500`) fixes the failure outcomes:
duplicate webhooks never double-credit (Case 1), amount mismatch flags
reconciliation/manual review (Case 5), bad signature rejects (Case 6),
post-webhook DB errors retry (Case 7). BR-03 (`PLAN.md:1393-1401`)
forbids ledger UPDATE/DELETE: corrections are reversal entries.

What exists today: only the `$wallet` credit/debit legs are live and
measured (`daptin/server/actions/action_wallet.go`; bound parameters
`$1..$13`; `SELECT ... FOR UPDATE`; 10 simultaneous debits of 30
against balance 100 → exactly 3 × HTTP 200 and 7 × HTTP 409, final
balance 10, ledger sum 90, zero chain violations — measured twice
independently). `payment_intents` and `payment_transactions` do not exist
until this package's schema step (`schema/schema_payment.yaml`).

Primitive markers used below: ✓ = exists and measured today; ⛳ = no
live primitive, owned by the Phase 1 `$payment` Go action performer.
Nothing in the table may be read as proven capability.

Actors: buyer = signed-in JWT user; provider = verified webhook
(decision 0008: SePay); system = lazy check on read in P0 (no scheduler
exists); finance = Finance-Admin action.

Authority: §11.2 + §21 + FR-12 + §42.5 (never process a webhook without
idempotency); the owner grant recorded in decision 0008 (2026-09-14,
superseding 0006:35-36 for these selections). If revoked, Proposed.

## Decision

Entity: `payment_intents` (top-up, FR-12). `payment_intents` carries the
§11.2 status; `payment_transactions` carries its own per-attempt status.
The §11.2 enum is adopted character-for-character — no extensions.

Transition table:

| # | Transition | Event | Actor | Guard | Effect | Primitive | Failure |
|---|---|---|---|---|---|---|---|
| T1 | — → CREATED | intent_create | buyer | signed-in; amount integer VND > 0 (§6.2) | INSERT payment_intents, status CREATED, expires_at set | ⛳ `$payment` (guard reuses `parseWalletAmount` semantics, `action_wallet.go:69-104`) | 400 invalid_amount, nothing written (proven class, `action_wallet.go:190`) |
| T2 | CREATED → PENDING | provider_checkout | buyer/system | status CREATED, not expired | store provider checkout ref, status PENDING, QR displayed | ⛳ `$payment` | 500: action transaction rolls back, stays CREATED (proven rollback class, `daptin/server/resource/handle_action.go:133-134`) |
| T3 | PENDING → PAID (also from EXPIRED/CANCELLED: a late verified webhook wins — money arrived) | webhook_paid | provider | signature/secret valid per provider scheme (§11.3); amount == intent amount; idempotency: (provider, provider_transaction_id) unseen (BR-02) | ONE action transaction: INSERT payment_transactions(PAID) + intent status PAID + `$wallet` credit with reference_type="payment_intent", reference_code=intent_code (✓ live primitive, `action_wallet.go:261-265`) | ✓ credit leg live; ⛳ webhook wrapper | bad signature → reject, nothing written (§21 Case 6); amount mismatch → intent STAYS PENDING + reconciliation flag per §21 Case 5 ("Flag reconciliation/manual review") — NOT auto-FAILED (new policy adopted here, see below); duplicate webhook → 200 no-op replay (Case 1, BR-02); DB error after webhook → 500 full rollback, provider retries (Case 7) |
| T4 | PENDING → FAILED | verified failure webhook | provider | signature valid, no PAID transaction | INSERT transaction row status FAILED, no money moves | ⛳ `$payment` | same 403/500 classes |
| T5 | PENDING → EXPIRED | expires_at passed | system | status PENDING ∧ now > expires_at ∧ no PAID transaction | status EXPIRED, no wallet write | ⛳ reconciler action | none (idempotent state set); late webhook still honored via T3 |
| T6 | CREATED/PENDING → CANCELLED | buyer cancels | buyer | no PAID transaction | status CANCELLED, no wallet write | ⛳ `$payment` | cancel-after-PAID refused (409 class); late webhook still honored via T3 |
| T7 | PAID → REFUNDED | policy refund | finance | refund policy authorized (§22 restricted) — P1, NO P0 FLOW | reversal LEDGER ENTRY via `$wallet` debit with reference_type="refund", reference_code=\<original ledger reference_code\> (✓ primitive exists; the finance-gating wrapper is ⛳), never UPDATE (BR-03; trigger-enforced, `daptin/server/resource/financial_guard.go:53-63); intent → REFUNDED | ✓ debit leg live; ⛳ finance gate | insufficient balance → 409 insufficient_funds (`action_wallet.go:221-227`); refund-loss policy (platform-absorb) is Phase 1 product policy |

Terminal states: EXPIRED, FAILED, CANCELLED, REFUNDED (refund of a
REFUNDED intent refused).

New policy adopted here (review fix m6): on amount mismatch the intent
STAYS PENDING with a reconciliation flag — it is NOT auto-FAILED.
`PLAN.md` §21 Case 5 says only "Flag reconciliation/manual review"; the
stay-PENDING reading is this ADR's interpretation, recorded as new
policy so a reader never mistakes it for quoted PLAN.md text.

Rulings:

- The wallet itself has NO state machine. Its `status` column stays
  performer-managed bookkeeping; the balance derives from the ledger.
- FR-15 order statuses (`PLAN.md:654-664`) and FR-32 withdrawal states
  (`PLAN.md:1043-1052`) are SEPARATE machines, approved with their own
  phase ADRs — not here.
- `payment_intents` vs `payment_transactions`: the intent carries the
  §11.2 lifecycle status; each provider attempt is a transaction row
  with its own status. BR-02 idempotency is the unique constraint on
  `payment_transactions (provider, provider_transaction_id)`, landing
  with `schema/schema_payment.yaml` in this package.

Honest capability statement: every §11.2 state is NOT live today,
because `payment_intents`/`payment_transactions` do not exist until
this package's schema step. Only the `$wallet` credit/debit legs are
live and measured. Invariants that ARE live and gate every transition:
no negative balance (BR-01, concurrency-proven 3×200/7×409),
money+state in exactly one action transaction, no UPDATE/DELETE on
`wallet_ledger` ever.

No live administrator HTTP measurement exists for the money path —
proof is mechanism-level (denylist ordering,
`TestFinancialDenylistBindsAdministrator`, role-independent triggers).

## Alternatives Considered

1. **Combined mega-machine spanning payment/order/withdrawal** —
   rejected: couples lifecycles that fail independently (a refund must
   not re-open an order; a withdrawal race must not block a top-up).
2. **Wallet balance as the state carrier** — rejected: would demand a
   `wallets` UPDATE path the architecture deliberately refuses (no
   trigger can distinguish the performer's debit from a same-connection
   edit; decision 0006).
3. **Extending the §11.2 enum** — rejected: breaks the 1:1 mapping with
   §11.2 and invalidates the §21 case analysis.

## Consequences

Positive:

- Phase 1 builds exactly one webhook handler against a fixed table.
- Every failure case in §21 has a pre-assigned row; no new decision is
  needed at integration time.

Tradeoffs:

- No scheduler exists, so expiry is a lazy check on read in P0 — an
  EXPIRED intent may read PENDING until touched. Documented, not
  hidden.
- T7's finance gate and refund-loss absorption are Phase 1 product
  policy (owner items 4–5 in
  `docs/plans/active/notes/phase0-decisions-plan.md`).

## Follow-Up

- The P0 scope / state-machine / payment-provider package declares
  `payment_intents`, `payment_transactions`, `payment_webhook_events`
  per `PLAN.md` §11.1 (`PLAN.md:1466-1494`), each with the decision-0002
  authorization block, a `FinancialWriteDeniedTables` entry, and a
  trigger entry, in one commit — per the 0006 extension rule
  (`docs/decisions/0006-kientaohub-money-write-layer.md:79-83,198-209`).
- Phase 1: `$payment` performer, adapter interface (decision 0008),
  order ADR (FR-15 machine + purchase idempotency), withdrawal ADR
  (FR-32 machine + reserve design + race test).
