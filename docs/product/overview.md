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

## Observable Today

Verified live on 2026-09-15 against `web/` on SQLite:

| Surface | Result |
|---|---|
| `GET /` (storefront) | 200, template storefront, `<title>Payload Ecommerce Template</title>` |
| `GET /admin` | 200, Payload admin |
| `GET /admin/create-first-user` | 200 |
| `GET /api/products` | 200, `{"docs":[],"totalDocs":0,...}` — the catalog is empty |
| Database | `web/payload.db`, 87 tables created by Payload |
| Roles | `admin` and `customer` only, default `customer`, first user promoted to admin (`web/src/collections/Users/index.ts`) |

The running application is the Payload ecommerce template, not the product. It
sells physical goods with variants, carts, shipping addresses, USD-style
currency presentation, English copy, and Stripe checkout. None of that is
KienTaoHub behaviour; it is the starting point recorded in decision 0001.

## Not Built

Nothing below exists, in any form:

- Wallet, ledger, payment intents, transactions, or webhook handling; the
  `transactions` collection in the schema is the template's Stripe bookkeeping.
- Entitlements, download events, or the `/downloads/{product}` route.
- Seller profiles, upload, moderation, or payouts.
- Orders in the product sense, reviews, comments, tickets, or disputes.
- The five §5 roles (Buyer, Seller, Moderator, Finance Admin, Super Admin) and
  the §22 authorization matrix.
- Postal database (PostgreSQL), object storage, Redis, CI, or observability.
- Email delivery, deployment, TLS, CDN, or backups.

## Open Owner Decisions

Commission rate and hold period; top-up bounds; secure-download token lifetime;
whether email re-enters launch scope; VND presentation and Vietnamese copy.
