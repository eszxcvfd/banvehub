# Product Overview

Date: 2026-09-18 (refreshed; the previous revision was dated 2026-09-15)

This document maps the product and states what is observable today. It is not
the product contract: **`PLAN.md` at the repository root is the source of record
for product intent** (scope, functional requirements FR-01–FR-32,
non-functional requirements NFR-01–NFR-19, business rules BR-01–BR-09, flows
FLOW-U01–U15, roadmap §27). Where this document and `PLAN.md` disagree,
`PLAN.md` wins and this document is wrong.

Everything below was re-measured against the repository at commit `d7c81f8` and
against the development database on 2026-09-18. Each claim names the commit, file
or query that produced it, so a reader can re-derive it instead of trusting this
page. The previous revision claimed Phase 6 and the community surfaces were
unbuilt; they had already shipped, which is why this page was refreshed.

## Product

KienTaoHub: a Vietnamese marketplace for digital design and engineering files —
CAD, Revit, SketchUp, 3ds Max, BIM, PDF, Excel, CNC assets. Buyers search, preview,
pay from an internal wallet, and download controlled originals; sellers upload and
are paid after a hold period; administrators moderate content and finance.

Fixed product constraints taken from `PLAN.md`: VND as integer (never floating
point, §6.2), private originals that are never served by a fixed public URL
(BR-06), an append-only ledger with corrections by reversal entry (BR-03), a
verified-purchase requirement for reviews (BR-05), and no hard delete for
products, users, or financial records (BR-08, BR-09).

## Platform

Recorded in `docs/decisions/`:

- Platform is Payload CMS 3.89 on Next.js 16 at `web/` — admin, API, and
  storefront (decision 0001).
- Money-path rules are fixed before any money code exists (decision 0002).
- P0 scope is locked, with email and operations deferred (decision 0003).
- Wallet top-up rail is SePay behind an adapter; the template's Stripe adapter is
  not the product rail (decision 0004).
- The payment intent state machine is fixed (decision 0005).
- Downloads are entitlement-gated with a short-lived token (decision 0006).
- P0 search runs on PostgreSQL; Meilisearch is P1 (decision 0007).
- Roles are `admin`, `buyer`, `seller`, `moderator`, `financeAdmin`, with
  `buyer` as the default (decision 0008).
- Seller revenue policy: withdrawal bounds, per-earning hold period, commission
  precedence, and the tax-inclusive earning equation (decision 0009).
- Product reports: signed-in users only, a report never changes the product, and
  one open case per `(reporter, product)` (decision 0010).

## What Runs Today

Measured on 2026-09-18. The row counts come from
`docker exec -i kientaohub-postgres psql -U payload -d kientaohub` against the
seeded development database, so they describe that database, not production
capacity.

| Surface | Measured |
|---|---|
| Application | Next.js 16 + Payload CMS 3.89 in one process: Payload admin at `/admin`, collection REST at `/api/<collection>`, GraphQL at `/api/graphql`, and the KienTaoHub storefront |
| Storefront identity | `KienTaoHub - Sàn giao dịch tài nguyên bản vẽ & mô hình kỹ thuật số` (`web/src/app/(app)/layout.tsx`); the template's physical-goods collections (`variants`, `carts`, `addresses`) no longer exist |
| Schema | 104 tables in `public`, 28 Payload collections, 13 versioned migrations in `web/src/migrations` |
| Seeded data | products 161 · users 56 · orders 253 · entitlements 188 · wallet_ledger 201 · seller_earnings 145 · withdrawals 8 · refunds 16 |
| Empty by design | reviews 0 · comments 0 · tickets 0 · moderation_cases 0 · notifications 0 — these surfaces are delivered but the seed does not populate them |
| Money integrity | append-only triggers installed in the database: `forbid_ledger_mutation`, `forbid_ledger_truncate`, `forbid_wallet_delete`, `forbid_wallet_truncate`, `enforce_br04_seller_anti_self_purchase` |
| Roles | `admin`, `buyer`, `seller`, `moderator`, `financeAdmin`; default `buyer`; first user promoted to admin (decision 0008) |
| Tests | `test:int` 36 files / 630 tests · `test:challenger` 101 · `test:e2e` 62 (desktop Chrome, channel override via `PLAYWRIGHT_CHANNEL`) · `test:stress` a separate config |
| CI | lint, `pnpm audit --audit-level=high`, migrations, build/type-check, integration tests (`.github/workflows/ci.yml`) |

The running application is KienTaoHub, not the template: the storefront is
Vietnamese, prices are integer VND with `₫` formatting, and purchase, entitlement
and download all run through the digital-product flow (`fbd210d`). The template's
physical-goods shape was removed rather than repurposed.

## Built

Delivered in phases, each with a green check suite recorded in
`docs/plans/completed/`:

| Phase | Commit | Surface |
|---|---|---|
| 2 Catalog | `000e372` | digital catalog, products/files/previews/software types/tags, RBAC, storefront, SEO |
| 3 Seller & moderation | `caaae36` | seller profiles, upload, private originals, moderation workflow |
| 4 Payment & wallet | `a7a506f` | internal wallet, append-only ledger with triggers, payment intents and transactions, SePay webhook rail |
| 5 Purchase & download | `2ea1dee` | orders and order items with fee snapshots, entitlements, download events, tokenised download route |
| 6 Seller revenue | `a3ff032`, `030ac47`, `e12dbf2` | commission resolution, earnings pipeline and hold period, withdrawal request/approval, compensating refunds, seller dashboard and finance admin screens (decision 0009) |
| Community | `e271c29`, `6f04b54`, `0b3acc5` | reviews with verified purchase (FR-20, BR-05), comments and Q&A (FR-21), support tickets and file disputes (FR-23, FLOW-U09) |
| Product reports (FR-22) | `ebaac32`, `7647e95`, `3b38d03`, `d7c81f8` | report a product → `moderation_cases`, dedupe per `(reporter, product)`, unpublished products answer like nonexistent ones, entry point hidden in draft preview (decision 0010) |
| Storefront & data | `fbd210d`, `d41313f` | digital purchase/entitlement/download flow in the storefront; realistic seed with a causal timeline |

`web/tests/int/` holds the integration suites for these surfaces — RBAC, ledger
invariants, webhook duplication, purchase invariants, secure download, seller
onboarding and revenue, withdrawals, refunds, reviews, comments, tickets and the
report/visibility agreement matrix. `web/tests/e2e/` drives the storefront,
catalog and admin in a real browser.

## Not Built

- **Notifications (§13).** No in-app delivery and no email: the template's
  Nodemailer adapter is still commented out (`web/src/payload.config.ts:137`).
  Email is out of launch-blocking scope per decision 0003, and decision 0010
  records that reporters are not told the outcome of their report.
- **Object storage, Redis, queue/worker.** No async jobs, no malware scanning, no
  presigned URLs; media and private originals live on local disk.
- **Observability and abuse protection.** No structured logging configuration,
  metrics, tracing or alerting (NFR-08), and no rate limiting on any surface
  (NFR-17), including the payment webhook route.
- **Deployment.** No TLS, CDN, WAF, backups, staging, or immutable image builds.
  CI stops at lint, dependency audit, migrations, build and integration tests: it
  has no unit-test job and no e2e job, which `PLAN.md` §36 lists for pull
  requests, and no merge-to-main or production pipeline exists.
- **P1/P2 scope from §26** — direct payment, coupons, an external search engine,
  collections, web push, seller analytics, automated payout, watermarking,
  recommendations — is untouched.

## Open Owner Decisions

- **Top-up upper bound.** A minimum is enforced (`amount < 10000` rejected in
  `web/src/app/api/v1/payments/topup/route.ts`); no maximum was found, so the
  upper bound §26 requires is still unstated.
- **Email re-entering launch scope.** Decision 0003 defers it and decision 0010
  keeps notifications out of P0; only the owner can move it back in.
- **Secure-download token lifetime.** Decision 0006 leaves the exact value to
  owner policy (one to ten minutes). The implementation uses 300 seconds
  (`web/src/services/download.ts:142`); confirm that as policy or change it.
- **Commission default and hold period — resolved.** `commission_settings.defaultRate`
  is `0.30` (`web/src/globals/CommissionSettings.ts`) and the hold period is a
  per-earning snapshot defaulting to 7 days (decision 0009). The seeded database
  preserves `0.30`, with three seller profiles carrying a custom rate.
- **Vietnamese copy and VND presentation — delivered.** The storefront is
  Vietnamese with integer-VND `₫` formatting; no decision record pins the
  presentation conventions, so a future change to them has no written authority.
