# 0012 Refund policy: operator-executed, contact-based, fault-based

Date: 2026-09-19

Provenance: owner decision of 2026-09-19, taken while closing the §13 in-app
notifications increment. The measured state of the code is as of commit `bad993b`.
The implementation is the next increment; this record is the authority it must
inherit.

## Status

Accepted

## Context

`PLAN.md` FLOW-U09 sends a broken-file dispute to "Refund theo policy", and the
refund flow that follows (`PLAN.md:1344-1356`) creates a refund record, credits the
buyer, reverses the seller earning, reverses platform revenue, updates the order and
optionally revokes the entitlement. The owner has now fixed what "theo policy" means,
because the product is an operator-run marketplace for drawing files: the operator
sells the files, the buyer receives the file when they pay, and a refund is the
exception rather than a self-service right.

Three facts about the repository at `bad993b` make the policy's gaps concrete rather
than theoretical:

- A **seller** can already set `resolution = 'REFUNDED'` on a ticket
  (`web/src/app/api/v1/tickets/[id]/route.ts`, `planTicketUpdate` refuses only the
  buyer), and the ticket UI renders that as "Đã hoàn tiền"
  (`web/src/collections/Tickets/index.ts:189`) while **no refund record exists** —
  a ticket can therefore tell a buyer they were refunded when no money moved.
- The refund path itself is already operator-only and audited: it requires
  `financeAdmin` or `admin` (`web/src/app/api/v1/admin/refunds/route.ts:31-37`),
  requires a reason, and records `processedBy`, `ledgerTransaction` and
  `entitlementRevoked` on the `refunds` document.
- The storefront publishes **no contact information**: the `footer` global holds only
  `navItems` (`web/src/globals/Footer.ts:14`), so "contact the operator through the
  site" has nowhere to point today.

## Decision

1. **Refunds are executed only by the operator.** The only path that may move money
   back to a buyer is the audited refund path, invoked by `financeAdmin` or `admin`.
   There is no automatic dispute-to-refund transition: a ticket never refunds by
   itself.
2. **Requests arrive out of band, through a contact channel published on the
   website.** The site must publish the operator's contact information, and the
   ticket and order surfaces must point at it. A user does not request a refund by
   pressing a button in the storefront.
3. **Eligibility is fault-based.** A refund is granted when the fault is the
   seller's or the platform's — a broken, invalid or not-as-described file, a
   delivery or platform failure. A change of mind is not a refund ground. The
   recorded reason must make that basis explicit rather than leaving free text.
4. **The label and the money must agree.** No surface may show a refund that did not
   happen: a ticket may only display "Đã hoàn tiền" when an executed refund record
   exists for its order, and a seller may not set that resolution.

## Alternatives Considered

1. **In-app automatic dispute-to-refund.** Rejected by the owner: the operator
   decides refunds, and automating them would let a buyer turn a claim into a payout
   without the operator's judgement.
2. **Let the seller mark a ticket REFUNDED.** Rejected: the seller is not the party
   who refunds, and the current behaviour ships a false money state to the buyer.
3. **Keep the label-only resolution and document it.** Rejected: the buyer reads
   "Đã hoàn tiền" as money received, so the disagreement is user-visible, not
   internal.
4. **Buyer self-service refunds.** Rejected by the owner's eligibility rule.

## Consequences

Positive:

- The refund decision stays with the party who can judge fault, and every refund
  remains attributable (`processedBy`, reason, ledger transaction).
- Fixing the ticket resolution removes a user-visible false statement about money.
- Publishing a contact channel gives support a single documented entry point, which
  the launch checklist's "support channel" item already assumes.

Tradeoffs:

- A refund is slower than an automated one: the buyer must contact the operator and
  wait for a human decision.
- The operator carries the support load, and no support/ops read path exists in the
  application today (decision 0011, decision 5, same open owner item).
- Eligibility is a judgement, so the reason field has to carry the basis; a free-text
  reason alone cannot be checked.

## Follow-Up

- **Increment (next):** tighten the ticket resolution so only an operator can mark a
  refund and only against an executed refund record; publish the contact channel and
  point the ticket/order surfaces at it; make the refund reason carry the fault basis.
  Mechanism choices (auto-resolving the ticket when the operator executes the refund
  versus a guarded manual mark, contact fields on the `footer` global versus a
  dedicated page) belong to that increment's plan, not to this record.
- **Open owner question:** when the fault is the platform's rather than the seller's,
  does the seller keep their earning and the platform absorb the refund? Today
  `processRefund` reverses the seller earning unconditionally
  (`web/src/services/refund.ts`, step 3), which is correct for seller fault and
  unexamined for platform fault.
- **Out of scope:** automated payout (a §26 P1 item) and provider-side reversal; the
  P0 rail remains an operator-executed compensating credit.
