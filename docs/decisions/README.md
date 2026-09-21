# Decisions

Decision records preserve lasting product, architecture, data ownership,
security, compatibility, and validation choices that future work must inherit.

Use `docs/templates/decision.md`. Task-local implementation choices remain in
the active execution plan and do not require a separate decision.

An installed consumer begins with no fabricated decisions. Add local decision
documents here as real choices are accepted, then index them in this file.

## Decisions

| Record | Status | Constraint future work inherits |
|---|---|---|
| [0001 Payload CMS as the application platform](0001-payload-as-platform.md) | Accepted | Payload CMS 3.89 on Next.js 16 in `web/` is the admin, API, and storefront (replaces daptin); template and `@payloadcms/*` packages move together (template tag `v3.89.0` ↔ packages `3.89.0`); local development and production both run PostgreSQL, with versioned migrations in `web/src/migrations`; the internal wallet + SePay rail replaces the template's Stripe payment method |
| [0002 Money-path write layer](0002-money-write-layer.md) | Accepted | One write path changes any balance and always writes a paired ledger row; money collections deny create/update/delete to every principal including administrators; the ledger is append-only with correction by reversal entry; every new money table adds its access-control block, write-denial rule, and trigger entry in one commit |
| [0003 P0 scope lock](0003-p0-scope-lock.md) | Accepted | P0 launch scope is exactly `PLAN.md` §26 with email, logs/monitoring, and backup deferred out of launch-blocking scope, SEO owned by the storefront track, and wireframe/design system kept as owner artifacts; the ERD of record is the entity list in this record; nothing is cut from §26 |
| [0004 Payment provider: SePay](0004-payment-provider-sepay.md) | Accepted | P0 wallet top-up rail is SePay bank-transfer QR with bank-arrival webhooks, behind an adapter so VNPay or MoMo can be added at P1; no integration exists yet; the webhook auth scheme must be confirmed against provider documentation and never assumed to be HMAC |
| [0005 Financial state machine](0005-financial-state-machine.md) | Accepted | `payment_intents` carries the exact `PLAN.md` §11.2 seven-state enum with the T1–T7 transition table; a late verified webhook wins from EXPIRED or CANCELLED; an amount mismatch stays PENDING with a reconciliation flag rather than auto-failing; wallets have no state machine; expiry is lazy in P0 |
| [0006 Secure-download path](0006-secure-download-path.md) | Accepted | Downloads are entitlement-gated through an authenticated route with a one- to ten-minute one-time token, never a public URL; originals stay private; free downloads also create an entitlement; presigned storage GET replaces the proxy path when object storage lands |
| [0007 Search engine](0007-search-engine.md) | Accepted | P0 search runs on PostgreSQL through Payload's query API per `PLAN.md` §43; Meilisearch is the P1 engine; Vietnamese diacritics, toneless matching, and typo tolerance are an accepted P0 gap until the search slice, and storefront copy must not promise them |
| [0008 Role model](0008-role-model.md) | Accepted | Roles are `admin` (Super Admin), `buyer`, `seller`, `moderator`, and `financeAdmin` per `PLAN.md` §5; `buyer` replaces the template's `customer` and the default role is `buyer`; §22 rows are expressed as access helpers; money documents use `canEditMoney`, which denies every principal including administrators; changing a role value is a database migration of `enum_users_roles` |
| [0009 Seller revenue policy](0009-seller-revenue-policy.md) | Accepted | Withdrawal amounts are `50.000`–`50.000.000` VND inclusive, enforced identically in field, hook, and `CHECK`, and changing them is a migration; the hold period is a per-earning snapshot defaulting to 7 days and never read live; commission precedence is campaign, then seller, then site default, always snapshotted with its `policyVersion` and never hard-coded; the earning equation is `seller_amount + platform_fee + tax = sale_price`, with tax uncomputed in P0 |
| [0010 Product report policy](0010-product-report-policy.md) | Accepted | Reporting a product requires a signed-in user (`401` anonymous); a report never changes the product's moderation status, `_status`, or visibility; one open case per `(reporter, product)` in `moderation_cases`, where a duplicate is `409` and is also refused by the partial unique index `moderation_cases_open_reporter_product_idx` on `(reporter_id, product_id) WHERE status IN ('OPEN','IN_REVIEW')`; the seven FR-22 reasons are single-sourced in `web/src/collections/ModerationCases/reasons.ts` |

| [0011 In-app notification policy](0011-in-app-notification-policy.md) | Accepted | `PLAN.md` §13 P0 ships in-app only — email stays deferred by decision 0003 and web push is P1; at-most-once per business event is a required `dedupeKey` plus UNIQUE `(recipient_id, type, dedupe_key)`, where a duplicate is a no-op rather than an error, and the column is NOT NULL because Postgres never treats NULLs as equal; the notification write never joins the caller's transaction, so a notification can outlive a rolled-back business row (accepted trade-off; closing it needs a transactional outbox); reads are own-rows-only for every principal including administrators, create is closed to the collection API, update touches only `readAt`, delete is admin-only; a notification may only announce an event that happened — never from `beforeChange` |

| [0012 Refund policy](0012-refund-policy.md) | Accepted | Refunds are executed only by the operator (`financeAdmin`/`admin`) through the audited refund path — there is no automatic dispute-to-refund; requests arrive out of band through a contact channel the website must publish; eligibility is fault-based (seller or platform fault, never a buyer's change of mind) and the recorded reason must carry that basis; the buyer has 5 days from purchase (`orders.paidAt`, never the first download) to request a refund while the seller is paid 7 days after receipt, so an approved refund reverses a still-PENDING earning instead of paid money; the fault basis decides who bears it — a seller's fault reverses the seller's earning, the platform's fault refunds only the buyer, leaves that earning to mature and books no revenue on the order; no surface may show "Đã hoàn tiền" without an executed refund record, so a seller may not set that ticket resolution |

| [0013 Remove the unused template commerce ledger](0013-remove-unused-commerce-ledger.md) | Accepted | The template's `transactions`/`transactions_items` ledger and its Stripe payment endpoints are gone (phase-13 migration `20260920_160000_phase13_drop_unused_ecommerce_transactions`, which refuses to run while `transactions` holds a row); the plugin stays configured only for `customers` and `addresses`, which the account area reads through `useAddresses`; Stripe is not a rail of this application, so a future card provider arrives through `PLAN.md` FR-12's seam with a real writer, never by re-enabling the template ledger |

| [0014 The storefront cart lives in the browser session](0014-cart-in-browser-session.md) | Accepted | The cart is client-side state in `sessionStorage` — no `carts` collection, no cart table and no migration, so decision 0013 stands; the UI keeps the same `useCart` surface (`cart`, `isLoading`, `addItem`, `removeItem`, `incrementItem`, `decrementItem`, `clearCart`, addressed by item id) and only the store behind it is ours; checkout money paths use the APIs this repository owns — `POST /api/v1/orders/purchase` per item (0002) and `POST /api/v1/payments/topup` for a VietQR top-up (0004) — and the card option gets a deterministic refusal from an existing endpoint instead of a 404, because card is not a P0 rail |

## Superseded

The daptin-era decisions deleted in `366ac21` are not restored. They are
superseded by decision 0001 and remain readable at `470bf41`:

| Deleted record | Why it does not apply |
|---|---|
| `0001-run-locally-patched-daptin-image` | daptin is no longer the backend |
| `0002-business-table-authorization-pattern` | daptin `AccessGroups` and `Permission` bits have no equivalent here; Payload access control owns authorization |
| `0003-database-config-merge-rebuild` | the database is no longer a rebuilt schema merge target; Payload migrations own the schema |
| `0004-web-session-and-api-access` | the Vue console and its `localStorage` JWT are gone |
| `0005-kientaohub-builds-on-daptin` | replaced by decision 0001 |
