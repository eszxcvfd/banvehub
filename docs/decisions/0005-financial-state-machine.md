# 0005 Financial State Machine (Payment Intents)

Date: 2026-09-15

Provenance: restored from `470bf41:docs/decisions/0009-kientaohub-financial-state-machine.md`
(accepted 2026-09-14). The state machine, its guards, and the entity rulings are
retained. The original evidence columns named daptin Go action performers and
measured HTTP results from the implementation removed in `366ac21`; those
mechanisms and measurements are gone and are replaced here by the owning slice,
with no capability claims.

## Status

Accepted

## Context

`PLAN.md` §11.2 (`PLAN.md:1513-1525`) fixes the payment status enum to exactly
seven states — CREATED, PENDING, PAID, EXPIRED, FAILED, CANCELLED, REFUNDED —
with no extensions. FR-12 (`PLAN.md:563-589`) chains intent creation, provider
checkout, verified webhook, idempotency check, PAID, and a ledger credit. §21
(`PLAN.md:2433-2507`) fixes the failure outcomes: duplicate webhooks never
double-credit, an amount mismatch flags reconciliation and manual review, a bad
signature is rejected, and a database error after webhook processing is retried.
BR-03 (`PLAN.md:1393-1401`) forbids ledger update and delete: corrections are
reversal entries. NFR-05 (`PLAN.md:1816-1826`) makes money operations atomic,
idempotent, auditable, and reversible by compensating entry.

Observed today: none of these tables exist in the Payload schema, and no webhook
route, adapter, or scheduler exists. Nothing in the table below is implemented
or measured.

Actors: buyer = signed-in user; provider = verified webhook (decision 0004:
SePay); system = lazy check on read, because no scheduler exists in P0; finance
= finance-administrator action.

## Decision

Entity split: `payment_intents` carries the §11.2 status and represents one
top-up attempt by a buyer; `payment_transactions` carries a per-provider-attempt
status. The §11.2 enum is adopted character for character, with no extensions.

| # | Transition | Event | Actor | Guard | Effect | Owner | Failure |
|---|---|---|---|---|---|---|---|
| T1 | — → CREATED | intent_create | buyer | signed in; amount is a whole positive integer VND (§6.2) | insert intent with status CREATED and `expires_at` | Phase 4 payment slice | invalid amount → 400, nothing written |
| T2 | CREATED → PENDING | provider_checkout | buyer or system | status CREATED and not expired | store provider checkout reference, status PENDING, show QR | Phase 4 payment slice | provider or database error → transaction rolls back, intent stays CREATED |
| T3 | PENDING → PAID (also from EXPIRED or CANCELLED: a late verified webhook wins, because money arrived) | webhook_paid | provider | signature or secret valid per the provider scheme (§11.3); amount equals intent amount; `(provider, provider_transaction_id)` unseen (BR-02) | one transaction: insert paid `payment_transactions` row, set intent PAID, write the ledger credit referencing the intent | Phase 4 payment slice | bad signature → reject, nothing written; amount mismatch → intent stays PENDING with a reconciliation flag (see ruling below); duplicate webhook → 200 no-op replay; database error after the webhook → rollback and provider retries |
| T4 | PENDING → FAILED | verified failure webhook | provider | signature valid; no paid transaction exists | insert transaction row with status FAILED; no money moves | Phase 4 payment slice | same rejection classes as T3 |
| T5 | PENDING → EXPIRED | expiry | system | status PENDING, now past `expires_at`, no paid transaction | status EXPIRED; no wallet write | Phase 4 reconciler | idempotent; a late webhook is still honoured by T3 |
| T6 | CREATED or PENDING → CANCELLED | buyer cancels | buyer | no paid transaction | status CANCELLED; no wallet write | Phase 4 payment slice | cancel after PAID refused; a late webhook is still honoured by T3 |
| T7 | PAID → REFUNDED | policy refund | finance | refund policy authorized (§22 restricted) — P1, no P0 flow | reversal ledger entry referencing the original, per BR-03; intent REFUNDED | Phase 4 or 6 slice | insufficient balance for the reversal is an explicit failure; refund-loss absorption is product policy |

Terminal states: EXPIRED, FAILED, CANCELLED, REFUNDED. Refunding a REFUNDED
intent is refused.

Rulings:

- **Amount mismatch keeps the intent PENDING with a reconciliation flag; it is
  not auto-FAILED.** `PLAN.md` §21 Case 5 says only "flag reconciliation and
  manual review". The stay-PENDING reading is this decision's interpretation,
  recorded as new policy so no reader mistakes it for quoted `PLAN.md` text.
- The wallet has no state machine. Any wallet status column is bookkeeping
  maintained by the write path; the balance derives from the ledger
  (decision 0002).
- Order statuses (`PLAN.md:654-664`) and withdrawal states
  (`PLAN.md:1041-1052`) are separate machines, each approved with its own slice.
- BR-02 idempotency is the unique constraint on
  `payment_transactions (provider, provider_transaction_id)`.
- Expiry is a lazy check on read in P0 because no scheduler exists, so an
  expired intent may still read PENDING until it is touched. This is documented
  behaviour, not an oversight.

## Alternatives Considered

1. **One combined state machine spanning payment, order, and withdrawal** —
   rejected: it couples lifecycles that fail independently; a refund must not
   reopen an order and a withdrawal race must not block a top-up.
2. **Wallet balance as the state carrier** — rejected: it would require a wallet
   update path that decision 0002 deliberately refuses.
3. **Extending the §11.2 enum** — rejected: it breaks the one-to-one mapping
   with §11.2 and invalidates the §21 case analysis.
4. **A scheduler for expiry in P0** — rejected: it is not in the §26 P0 scope
   and lazy expiry is sound for a top-up rail.

## Consequences

Positive:

- Phase 4 builds exactly one webhook handler against a fixed table, and every
  failure case in §21 has a pre-assigned row.
- The intent or transaction split keeps provider retries from corrupting the
  buyer-visible status.

Tradeoffs:

- Lazy expiry can show PENDING after the real expiry until the row is read.
- T7's finance gate and refund-loss absorption remain product policy to decide.
- Postgres row locking and the conditional-update rule (BR-01) are the
  concurrency mechanism; the removed implementation's concurrency measurement
  does not transfer and must be re-established.

## Follow-Up

- Declare `payment_intents`, `payment_transactions`, and
  `payment_webhook_events` per `PLAN.md` §11.1, each under decision 0002's
  extension rule, with the BR-02 index, in one commit.
- Phase 5: order machine plus purchase idempotency; Phase 6: withdrawal machine
  with the reserve design and a race test.
