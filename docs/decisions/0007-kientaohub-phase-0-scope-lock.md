# 0007 P0 Scope Lock

Date: 2026-09-14

## Status

Accepted

## Context

`PLAN.md` §26 (`PLAN.md:2665-2691`) lists the P0 launch set; §27
(`PLAN.md:2743-2747`) gates Phase 0 closure on exactly three criteria:
P0 scope locked, financial state machine approved, payment provider
chosen. §27 also names Wireframe and Design system as deliverables —
both are owner visual-design artifacts beyond repository authority (no
wireframe or token file exists in this repo to verify against), so they
are re-scoped OUT of this package here and do not block the exit
criteria.

Three adjudications are forced by verified architecture (locking §26
verbatim would claim capabilities the repo proves absent):

- daptin serves no sitemap/robots/cache headers (decision 0005) — "SEO
  cơ bản" cannot be a daptin deliverable.
- No SMTP exists (`docs/product/overview.md:74-76`) — "Email" cannot be
  launch-blocking.
- Logs/monitoring and Backup are Phase 1 exit criteria
  (`PLAN.md:2765-2771`), i.e. the ops track, not the P0 product scope.

Table form (mandatory): every row carries "P0 launch scope: in/out"
(derived from §26 only) and "build owner / execution phase", so §26
priority tiers, §27 roadmap phases, and build order are never
conflated.

Authority: `PLAN.md` §26/§27; decision 0005; decision 0002; the owner
grant of full selection authority conveyed with this package
(2026-09-14), superseding decision 0006:35-36's reservation of product
policy for these three selections only. If revoked, Proposed.

## Decision

P0 launch scope is exactly the §26 P0 list, adjudicated as follows.

| §26 row | P0 launch scope | Build owner / execution phase |
|---|---|---|
| Auth | in | Phase 1 slice (daptin signin exists; app wiring pending) |
| Categories | in | done: `schema/schema_catalog.yaml` (boot-verified 2026-09-14) |
| Product catalog | in | done (schema) / Phase 1 slices (upload, moderation) |
| Search cơ bản | in | daptin JSON:API filtering — decision 0011 (diacritics/typo gap accepted) |
| Product detail | in | Phase 1 catalog slice |
| Preview | in | done (schema: `product_previews`) / Phase 1 slice |
| Seller | in | Phase 1 slice (`seller_profiles`) |
| Product upload | in | Phase 1 upload slice (+ scan worker, §42.12) |
| Moderation | in | Phase 1 moderation slice — INCLUDES the publish flow that grants a guest read on a published product row; without it the catalog is unusable (phase-0 plan row 205). No product row is guest-readable until it lands |
| Wallet | in | done: `$wallet` performer + triggers, measured |
| Top-up | in | Phase 1 payment slice (decisions 0008/0009; tables declared in this package) |
| Payment webhook | in | Phase 1 payment slice (SePay webhook, BR-02 index in this package) |
| Purchase | in | Phase 1 order slice (FLOW-U03 idempotency; `order_code` mechanism decided by the order ADR) |
| Entitlement | in | Phase 1 order slice |
| Secure download | in | Phase 1 `$download` action — decision 0010 |
| Orders | in | Phase 1 order slice (`orders`, `order_items` with full snapshot columns) |
| Seller earning | in | Phase 1 earning slice (`seller_earnings`; rate is owner policy, no number in Phase 0 docs) |
| Withdrawal manual approval | in | Phase 1 withdrawal slice (FR-32; reserve design + race test) |
| Review | in | Phase 1 slice (`reviews`) |
| Admin | in | `web/` console track + ops (credential custody; live admin matrix pending) |
| Audit | in | daptin per-table audit exists (CREATE unaudited, no actor column — known limits); money audit = ledger itself |
| SEO cơ bản | in (relocated, not cut) | Next.js storefront workstream (decision 0005: daptin serves no sitemap/robots/cache headers); schema keeps SEO columns/slugs (`schema_catalog.yaml`) |
| Email | OUT of launch-blocking scope (deferred) | deferred; re-enters only by explicit owner decision. Every P0 flow must be buildable without email (no SMTP exists, `docs/product/overview.md:74-76`) |
| Logs/monitoring | OUT of launch-blocking scope (deferred) | ops track — Phase 1 exit criteria (`PLAN.md:2765-2771`) |
| Backup | OUT of launch-blocking scope (deferred) | ops track — Phase 1 exit criteria (`PLAN.md:2765-2771`) |
| Wireframe (§27 deliverable) | OUT of this package | owner visual-design artifact beyond repository authority; does not block exit criteria |
| Design system (§27 deliverable) | OUT of this package | owner visual-design artifact beyond repository authority; does not block exit criteria |

Deferred to P1 per §26 (`PLAN.md:2695-2707`): direct payment (FR-13
already marks it P1, `PLAN.md:599-603` — the "Wallet purchase là P0"
line at :601 sits inside FR-13), coupon, advanced search engine
(decision 0011), collections, product-versioning UI, web push, seller
analytics, automated payout, fraud detection, watermark engine,
recommendations. P2 (`PLAN.md:2711-2724`) untouched.

Cut from P0 entirely: nothing from §26. Provider integration (even
test mode), Next.js implementation, and deployment/TLS/CDN/backups are
out of scope by the task brief and earlier decisions.

ERD of record (entity list): `user_account` (existing),
`seller_profiles`, the six catalog tables (`categories`,
`software_types`, `tags`, `products`, `product_files`,
`product_previews`), `wallets`/`wallet_ledger` (existing), and new
`payment_intents`, `payment_transactions`, `payment_webhook_events`,
`orders`, `order_items`, `entitlements`, `download_events`,
`seller_earnings`, `withdrawals`, `withdrawal_events`, `reviews`.
`product_tags` stays replaced by daptin's generated join table
(`products_products_id_has_tags_tags_id`, measured, phase-0 plan
rows 254-257). `order_items` carries the full snapshot column set
(sale_price, platform_fee, seller_amount, tax, applied_policy_version)
from day one so the commission rate lands later as configuration.
`payment_intents`/`payment_transactions`/`payment_webhook_events` are
physically declared by this package (`schema/schema_payment.yaml`);
the rest are Phase 1 schema slices, each under the 0006 extension
rule.

Ledger append-only enforcement — CONFIRMED, not re-opened (decided by
0006c): triggers boot-installed and fatal-on-failure
(`daptin/server/resource/financial_guard.go:53-99,116`), denylist
before the admin early-return, extension rule (0006:79-83) applying to
every new money table. The one missing enforcement primitive — the
BR-02 unique index on `payment_transactions (provider,
provider_transaction_id)` — lands with this package's schema step.
Residuals stand unchanged: no DB barrier on `wallet_ledger` INSERT
(forged append) or `wallets` UPDATE; the `$transaction` refusal is
lexical (table-name regex); money is PostgreSQL-only by construction;
no live administrator HTTP measurement exists (mechanism-level proof
only).

## Alternatives Considered

1. **Lock §26 verbatim without adjudication** — rejected: would claim
   capabilities the repo proves absent (email delivery, SEO surface)
   and misstate build ownership.
2. **Cut Withdrawal or Review to shrink scope** — rejected: §26 lists
   both as launch-required; FR-32 and §22 assume them.
3. **Pull Direct payment into P0** — rejected: `PLAN.md:601-602` marks
   it P1.

## Consequences

Positive:

- Phase 1 has a fixed, checkable scope table; every row names its
  owner and phase.
- No Phase 0 document promises email, SEO headers, or deployment.

Tradeoffs:

- Email deferred out of launch-blocking scope is a product-priority
  call — flagged for owner confirm-or-overrule on review.
- Wireframe/design system re-scoped as owner artifacts: Phase 0
  closes on the three §27 exit criteria, not on visual deliverables.

## Follow-Up

- Phase 1 schema slices per the entity list, each under decision 0002
  (explicit `AccessGroups` + non-zero `Permission`) and the 0006
  extension rule.
- Publish flow (moderation slice) is the gap that makes a product row
  guest-readable; until it lands, no product row is guest-readable.
- Owner items pending: commission rate + hold period, top-up bounds,
  FR-17 TTL final values, email re-entry (see
  `docs/plans/active/notes/phase0-decisions-plan.md`, needsOwner).
