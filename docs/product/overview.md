# Product Overview

Date: 2026-09-15

This document maps the product and states what is observable today. It is not
the product contract: **`PLAN.md` at the repository root is the source of record
for product intent** (scope, functional requirements FR-01–FR-32,
non-functional requirements NFR-01–15, business rules BR-01–09, flows FLOW-U01–15,
roadmap §27). Where this document and `PLAN.md` disagree, `PLAN.md` wins and this
document is wrong.

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

## Observable Today

Verified live on 2026-09-15 against `web/` on PostgreSQL:

| Surface | Result |
|---|---|
| `GET /` (storefront) | 200, template storefront, `<title>Payload Ecommerce Template</title>` |
| `GET /admin` | 200, Payload admin |
| `GET /admin/create-first-user` | 200 |
| `GET /api/products` | 200, `{"docs":[],"totalDocs":0,...}` — the catalog is empty |
| Database | PostgreSQL 16.15 in container `kientaohub-postgres` on `127.0.0.1:5433`, 87 base tables, applied through `web/src/migrations` |
| Roles | `admin`, `buyer`, `seller`, `moderator`, `financeAdmin` (decision 0008); default `buyer`; first user promoted to admin |
| Access rules | product create is Seller or Admin and product update is Moderator or Admin, per `PLAN.md` §22; 14 matrix tests pass (`web/tests/int/rbac.int.spec.ts`) |

The running application is the Payload ecommerce template, not the product. It
sells physical goods with variants, carts, shipping addresses, USD-style
currency presentation, English copy, and Stripe checkout. None of that is
KienTaoHub behaviour; it is the starting point recorded in decision 0001.

## Built

Delivered in phases, each with a green check suite recorded in
`docs/plans/completed/`:

| Phase | Commit | Surface |
|---|---|---|
| 2 Catalog | `000e372` | digital catalog, product/files/previews/software types/tags, RBAC, storefront, SEO |
| 3 Seller & moderation | `caaae36` | seller profiles, upload, private originals, moderation workflow |
| 4 Payment & wallet | `a7a506f` | internal wallet, append-only ledger, payment intents and transactions, SePay webhook rail |
| 5 Purchase & download | `2ea1dee` | orders and order items with fee snapshots, entitlements, download events, tokenised download route |

26 integration suites in `web/tests/int/` cover these surfaces, including RBAC,
ledger invariants, webhook duplication, purchase invariants, and secure
download.

## Not Built

- Seller earnings, withdrawals, withdrawal events, and refunds are **present on
  disk but uncommitted and unverified**: the Phase 6 Milestone 1 collections,
  access rules, and migration Batch 7 exist in the working tree and no
  environment has applied that migration. Treat them as unimplemented until
  the milestone's verification gate closes.
- Commission calculation, the earnings pipeline, withdrawal request and
  approval, compensating refunds, and the seller dashboard and finance admin
  screens.
- Reviews, comments, tickets, and disputes.
- Object storage and Redis.
- Email delivery, deployment, TLS, CDN, and backups.

## Open Owner Decisions

- The site-wide default commission rate, its storage, and `policyVersion`
  issuance. Decision 0009 fixes the precedence and the snapshot rule but no
  rate exists yet, so commission cannot be computed.
- Top-up bounds; secure-download token lifetime; whether email re-enters
  launch scope; VND presentation and Vietnamese copy. Commission rate and hold
  period were listed here and are now resolved by decision 0009 — the hold
  period as a per-earning snapshot defaulting to 7 days, and commission only
  partially, since the site default is still unset.

