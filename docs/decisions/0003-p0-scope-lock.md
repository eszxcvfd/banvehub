# 0003 P0 Scope Lock

Date: 2026-09-15

Provenance: restored from `470bf41:docs/decisions/0007-kientaohub-phase-0-scope-lock.md`
(accepted 2026-09-14). The scope adjudications and the entity list are retained;
the build-owner column is restated for the Payload platform chosen in decision
0001, and one adjudication changed (see SEO).

## Status

Accepted

## Context

`PLAN.md` §26 (`PLAN.md:2665-2693`) lists the P0 launch set. §27
(`PLAN.md:2745-2749`) gates Phase 0 closure on three criteria: P0 scope locked,
financial state machine approved, payment provider chosen. §27 also names
wireframe and design system as deliverables; neither exists in this repository
and both remain owner visual-design artifacts, so they are out of this decision
and do not block the exit criteria.

Three adjudications are forced because locking §26 verbatim would claim
capabilities the repository does not have:

- No email delivery is configured (the Payload template ships a commented-out
  Nodemailer adapter), so "Email" cannot be a launch-blocking deliverable.
- Logs/monitoring and Backup are Phase 1 exit criteria (`PLAN.md:2769-2773`),
  i.e. the operations track, not the product scope.
- "SEO cơ bản" was previously relocated because the removed daptin backend
  served no sitemap, robots, or cache headers. Under Payload and Next.js the
  storefront can serve them, so SEO stays in P0 and is owned by the storefront
  track; the template already includes an SEO plugin and metadata handling.

Authority: `PLAN.md` §26 and §27; decision 0001 (platform); decision 0004
(payment provider); decision 0005 (state machine); the owner's instruction of
2026-09-15 to restore this artifact.

## Decision

P0 launch scope is exactly the §26 P0 list, adjudicated as follows. "Scope" is
derived from §26 only; the owner column is build order and never changes scope.

| §26 row | P0 launch scope | Build owner |
|---|---|---|
| Auth | in | Payload users collection (exists); app-level roles pending decision on §5/§22 |
| Categories | in | template `categories` collection exists; `PLAN.md` FR-02 fields pending |
| Product catalog | in | template `products` exists as physical goods; digital-file shape is a Phase 2 slice |
| Search cơ bản | in | decision 0007 |
| Product detail | in | storefront slice |
| Preview | in | Phase 2 slice; `PLAN.md` FR-06 |
| Seller | in | Phase 3 slice (`PLAN.md` FR-24, FR-25) |
| Product upload | in | Phase 3 slice; private originals per BR-06 |
| Moderation | in | Phase 3 slice; nothing is publicly purchasable before it lands |
| Wallet | in | Phase 4 slice; decision 0002 |
| Top-up | in | Phase 4 slice; decisions 0004 and 0005 |
| Payment webhook | in | Phase 4 slice; BR-02 unique index |
| Purchase | in | Phase 5 slice (`PLAN.md` FR-14; FLOW-U03 idempotency) |
| Entitlement | in | Phase 5 slice (`PLAN.md` FR-16) |
| Secure download | in | Phase 5 slice; decision 0006 |
| Orders | in | Phase 5 slice; `order_items` carries the full snapshot column set |
| Seller earning | in | Phase 6 slice (rate and hold period are owner policy) |
| Withdrawal manual approval | in | Phase 6 slice; `PLAN.md` FR-32 |
| Review | in | Phase 7 slice; verified purchase per BR-05 |
| Admin | in | Payload admin exists; the §22 authorization matrix and operational custody are pending |
| Audit | in | Payload document history plus the ledger; `PLAN.md` NFR-14 |
| SEO cơ bản | in | storefront track (Next.js metadata, sitemap, robots) |
| Email | OUT of launch-blocking scope | deferred; re-enters only by explicit owner decision |
| Logs/monitoring | OUT of launch-blocking scope | operations track, Phase 1 exit criteria |
| Backup | OUT of launch-blocking scope | operations track, Phase 1 exit criteria |
| Wireframe (§27 deliverable) | OUT of this decision | owner visual-design artifact |
| Design system (§27 deliverable) | OUT of this decision | owner visual-design artifact |

P1 per §26 (`PLAN.md:2697-2709`): direct payment, coupon, advanced search
engine, collections, product-versioning UI, web push, seller analytics,
automated payout, fraud detection, watermark engine, related recommendations.
P2 (`PLAN.md:2713-2726`) untouched. Nothing is cut from §26.

**ERD of record (entity list):** `users` (exists), `seller_profiles`,
`categories`, `software_types`, `tags`, `products`, `product_files`,
`product_previews`, `wallets`, `wallet_ledger`, `payment_intents`,
`payment_transactions`, `payment_webhook_events`, `orders`, `order_items`,
`entitlements`, `download_events`, `seller_earnings`, `withdrawals`,
`withdrawal_events`, `reviews`. `order_items` carries the full snapshot column
set (sale price, platform fee, seller amount, tax, applied policy version) from
the first version so the commission rate lands later as configuration only.

Mapping note: the template already ships `users`, `categories`, `products`,
`variants`, `orders`, `transactions`, `carts`, `addresses`, and `media`. Those
are a physical-goods storefront shape. This entity list is the target shape; the
reconciliation between the two is Phase 2 work and is not decided here. Variants
and carts have no row in this list.

## Alternatives Considered

1. **Lock §26 verbatim without adjudication** — rejected: it would promise email
   delivery and operator readiness the repository does not have.
2. **Cut Withdrawal or Review to shrink scope** — rejected: §26 lists both as
   launch-required, and FR-32 and §22 assume them.
3. **Pull direct payment into P0** — rejected: `PLAN.md:599-603` marks it P1.
4. **Keep SEO relocated out of P0** — rejected: the relocation reason was a
   daptin limitation that decision 0001 removed.

## Consequences

Positive:

- Phase 1 onward has a fixed, checkable scope table with one owner per row.
- The three §27 exit criteria are now satisfied on paper: scope locked (this
  decision), state machine approved (decision 0005), provider chosen
  (decision 0004).

Tradeoffs:

- Deferring email out of launch-blocking scope is a product-priority call and
  remains open to owner override.
- Wireframe and design system stay owner artifacts, so Phase 0 closes without
  visual deliverables.

## Follow-Up

- Reconcile the physical-goods template collections against this entity list
  before Phase 2 catalog work, including what happens to `variants` and `carts`.
- Owner items still open: commission rate and hold period, top-up bounds,
  secure-download token lifetime, and whether email re-enters launch scope.
