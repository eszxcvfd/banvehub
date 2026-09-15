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
