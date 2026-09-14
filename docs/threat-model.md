# Threat Model (preliminary, Phase 0)

Date: 2026-09-14. Maps `PLAN.md` §32's twenty threats
(`PLAN.md:3084-3103`) 1:1 onto this architecture. Each row: existing
control (`file:line` or the literal `none`) / missing control /
owning phase (§27 vocabulary). A row may claim a control only with
`file:line`; every "missing" cell is a grep-verifiable absence. The
§42 prohibitions are cited where they bind (T1←§42.1, T8←§42.12,
T4/T5←§42.4/§42.5).

| # | §32 threat | Existing control | Missing control | Owning phase |
|---|---|---|---|---|
| T1 | URL guessing for original files | `product_files` table gate 1 + owner-only rows (`schema/schema_catalog.yaml:222-228`); asset route checks per request (`daptin/server/asset_route_handler.go:72-91`) | storage-key unguessability not asserted; publish-flow row grants; download gate (decision 0010) | Phase 1 (§42.1) |
| T2 | Signed-URL sharing | none (no `PresignGetObject` — grep-verified absent; proxy ties to row permission, phase-0 plan rows 75-78) | short-TTL one-time token + entitlement check | Phase 1 (decision 0010) |
| T3 | Credential stuffing | daptin signin exists | no rate limit configured (default unlimited), no lockout | Phase 1 (`limit.rate` + observability) |
| T4 | Fake payment webhook | none (no integration); denylist limits blast radius today (`daptin/server/resource/financial_guard.go:24-27`) | provider signature/secret verification per provider scheme (§11.3) | Phase 1 payment slice (decisions 0008/0009; §42.4) |
| T5 | Webhook replay | design only (BR-02 rule stated, no constraint live yet) | BR-02 unique constraint on `payment_transactions (provider, provider_transaction_id)` | lands with this package's schema step (§42.5) |
| T6 | Double-spend wallet | PROVEN — `SELECT ... FOR UPDATE` + 409 refusal, measured 3×200/7×409 twice independently (`daptin/server/actions/action_wallet.go:207,221-227`; phase-0 plan rows 470-473) | none | standing gate: re-run the concurrency probe on every money-table commit |
| T7 | Withdrawal race | same `$wallet` debit primitive exists | `withdrawals` table + reserve-balance design + race test | Phase 1 withdrawal slice (FR-32) |
| T8 | Seller malware upload | none | async scan worker (§42.12 forbids in-request heavy work), status field on `product_files` | Phase 1 upload slice |
| T9 | Stored XSS | none server-side | Next.js escapes by default + sanitize policy for previews/comments + moderation | Phase 1 catalog + storefront |
| T10 | IDOR on others' orders | owner-scoped row permission pattern proven (decisions 0002/0006; `schema/schema_wallet.yaml` owner rows) | apply pattern to orders/entitlements | Phase 1 order slice |
| T11 | Admin privilege escalation | `become_an_administrator` closed (non-empty administrators group); denylist precedes the administrator early-return (`daptin/server/resource/middleware_tableaccess_permission.go:91` → `:96`); `TestFinancialDenylistBindsAdministrator`. no live administrator HTTP measurement was possible — no obtainable credential; proof is mechanism-level only | credential custody + live admin matrix when obtainable | ops (`docs/RUNBOOK.md:28-30`) |
| T12 | Spam product | FR-28 states designed | publish/moderation gate + rate caps | Phase 1 moderation |
| T13 | Copyright abuse | `copyright_declared` column (`schema/schema_catalog.yaml:183`) | report/dispute/takedown flow | Phase 1 (P2 acceptable) |
| T14 | Catalog scraping | offset pagination is crawl-easy — ACCEPTED for P0 because SEO wants crawlers | rate limits + storefront caching | Phase 1 / P1 |
| T15 | Bot download | none | download counters + heuristics (FR-17:711-714) + entitlement enforcement | Phase 1 with decision 0010 |
| T16 | CSRF | Bearer-token API, no cookies — classic CSRF largely inapplicable; JWT in `localStorage` (decision 0004) | re-evaluate if auth moves to cookies | pre-deployment decision-0004 review |
| T17 | SSRF via URL import | the feature does not exist — the existing control is exactly that (no URL-import surface exists) | if ever built, denylist-style review gate | cut at P0 |
| T18 | Zip bomb | none | scan stage + size caps | Phase 1 upload scan |
| T19 | MIME spoofing | none | MIME/checksum validation in scan | Phase 1 upload scan |
| T20 | Large-upload resource exhaustion | `limit.max_connections` per IP default 100 (`daptin/server/server.go:168-171`) | upload size caps + streaming limits | Phase 1 upload |

Standing residuals (apply wherever relevant, not papered over): no
live administrator HTTP measurement exists; no DB barrier on
`wallet_ledger` INSERT (forged append) or `wallets` UPDATE; the
`$transaction` refusal is lexical; money is PostgreSQL-only; no
product row is guest-readable until the publish flow lands; no SMTP,
no TLS, no deployment story; local-only single-tenant.
