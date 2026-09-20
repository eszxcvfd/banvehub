# Execution Plan: Operator-executed, fault-based refunds with a contact channel

Date: 2026-09-19

## Status

Proposed — drafted by the captain while the §13 notifications team finishes. No team is
staged and no work is scheduled from this file; the increment is created only after
`notifications-inapp` closes. Authority already exists in decision 0012; the two mechanism
choices below are the ones an owner review should settle before implementation starts.

## Outcome

A refund happens only when the operator decides it, only for the seller's fault or the
platform's, and only within 5 days of the purchase — and no surface ever tells a buyer they
were refunded when no money moved. Buyers can reach the operator, because the website
finally publishes contact information.

## Context

Decision 0012 fixes the policy; three measured facts in the tree at `6fc7710` are the work:

- A **seller** can set `resolution = 'REFUNDED'` on a ticket (`web/src/app/api/v1/tickets/[id]/route.ts`,
  `planTicketUpdate` refuses only the buyer) and the ticket UI renders "Đã hoàn tiền"
  (`web/src/collections/Tickets/index.ts:189`) while no refund record exists.
- `processRefund` (`web/src/services/refund.ts`) validates the reason, the acting principal
  and that the order is `COMPLETED`, then reverses **every** seller earning unconditionally
  (step c) with no fault basis and no time window.
- The storefront publishes no contact information: the `footer` global holds only `navItems`
  (`web/src/globals/Footer.ts:14`).

## Scope

In:

- `web/src/app/api/v1/tickets/[id]/route.ts` — refund resolutions become operator-only and may
  not exist without an executed refund for that ticket's order.
- `web/src/services/refund.ts` — required fault basis; branch the seller-earning reversal;
  enforce the 5-day window against `orders.paidAt`; record an out-of-window override.
- `web/src/app/api/v1/admin/refunds/route.ts` — accept the fault basis (and the override).
- `web/src/collections/Refunds/index.ts` + a schema migration — carry the fault basis and the
  window state on the refund record.
- `web/src/globals/Footer.ts` + the same migration — contact fields the operator can edit.
- The storefront footer and the ticket/order surfaces — render the contact channel and point
  refund copy at it, stating the 5-day window.
- Tests: integration specs for the authorization, the fault branching and the window; an e2e
  assertion for the published contact channel.

Out:

- Email delivery (decision 0003), web push/Zalo/SMS (§13 P1), automated payout (§26 P1),
  provider-side reversal, the F3 notification fixture hygiene, and any change to
  `web/src/collections/Products/**` or the notification access rules.

## Approach

Keep the money path exactly where decision 0002 put it: the operator's refund route is the
only writer, and it keeps `processedBy`, the reason and the ledger transaction. The fault
basis becomes a required input rather than free text, because decision 0012 makes it decide
who bears the cost: seller fault reverses the earning, platform fault leaves it to mature and
books no revenue on the order.

The ticket label follows the money, not the other way round: a ticket may only display
"Đã hoàn tiền" when an executed refund exists for its order, and a seller never sets it.

## Two mechanism choices for the owner review

1. **How a `REFUNDED` resolution is produced.** (a) The operator's refund action resolves the
   related ticket(s) automatically — one action, no drift; or (b) the operator marks the
   ticket manually and the API refuses unless an executed refund exists for the order — two
   actions, but no automatic state change. Recommendation: (a) with (b)'s guard kept as the
   invariant, so the label can never precede the money.
2. **Where the contact information lives.** (a) Fields on the `footer` global rendered in the
   footer, which the operator edits in the admin panel; or (b) a dedicated contact page linked
   from the footer. Recommendation: (a), plus a link, because it is where users already look
   and it needs no new route.

## Risks And Recovery

- The fault basis is a new required input on an existing money path: every existing caller and
  test that refunds must be updated deliberately, and the spec suite is the guard that no
  refund silently defaults to seller fault.
- The 5-day window must not become a soft suggestion in code: an out-of-window refund is
  allowed only with the override recorded, and the record must say which case it was.
- Adding fields to a global and a collection means a migration; `payload migrate` in CI proves
  it applies, and the down path must stay idempotent (the `IF EXISTS` rule that
  `0d29332` established).
- If the operator's surface for refunds is exercised only through the admin API today, the
  increment must not invent a storefront refund button — decision 0012 keeps requests out of
  band.

## Progress

- 2026-09-19: plan drafted from decision 0012 (policy) and the three measured facts above. Not
  staged; the increment waits for the §13 team to close.

## Decisions

- 2026-09-19: the increment implements decision 0012 rather than re-opening it; the two
  mechanism choices above are the only open questions, and both are recorded there as
  belonging to this plan.

## Validation

- Focused proof: a seller cannot set `REFUNDED` (403); a ticket cannot display it without an
  executed refund; a platform-fault refund leaves the seller earning intact and records
  `sellerAmountRefunded = 0`; a seller-fault refund reverses it; a refund requested at day 6
  is refused without the override and recorded with it.
- Integration or end-to-end proof: the contact channel renders on the storefront and the
  ticket/order copy points at it.
- Repository-required checks: `payload migrate`, `test:int`, `test:challenger`, `lint`
  (0 errors), `build`, `test:e2e`.

## Result

Pending.
