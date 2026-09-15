# BRIEFING — 2026-09-15T07:10:00Z

## Mission
Investigate existing backend architecture in web/ covering Payload CMS, DB migrations, Money Write Layer, storage, integration tests, and commands.

## 🔒 My Identity
- Archetype: explorer
- Roles: backend survey, codebase investigation, architectural recommendations
- Working directory: /home/trung/Documents/2026/project/test-v6/.agents/explorer_backend_survey_1
- Original parent: 902fae86-8610-4959-9027-f4a48d29b1e8
- Milestone: Phase 5 Investigation

## 🔒 Key Constraints
- Read-only investigation — do NOT implement
- Inspect web/ backend patterns
- Deliver handoff.md with 5-component report to parent

## Current Parent
- Conversation ID: 902fae86-8610-4959-9027-f4a48d29b1e8
- Updated: 2026-09-15T07:01:00Z

## Investigation State
- **Explored paths**:
  - `web/src/payload.config.ts`, `web/src/plugins/index.ts`, `web/src/collections/`
  - `web/src/migrations/` (Batches 1–5, status checked via payload CLI and PostgreSQL)
  - `web/src/services/wallet.ts`, `web/src/services/payment.ts`
  - `web/src/access/` (financialAccess, canEditMoney, productFileAccess)
  - `web/private/product_files/`
  - `web/tests/int/` (all 17 suites inspected, baseline verified 242/242 passing)
  - `web/package.json` (lint, build, challenger, stress verified)
- **Key findings**:
  - `push: false` is enabled; schema is migration-driven.
  - Batches 1–5 are cleanly applied in Postgres. `orders` table from Batch 1 has 0 rows and was template-based; `orders: false` should be configured in `ecommercePlugin` and dedicated collections (`Orders`, `OrderItems`, `Entitlements`, `DownloadEvents`) created for Phase 5.
  - Payload/Drizzle transaction support via `payload.db.beginTransaction()` and `req.transactionID` allows atomic execution across `debitWallet`, `orders`, `order_items`, and `entitlements`.
  - `web/private/product_files` is outside Next.js `public/` and guarded by `productFileReadAccess`; download engine can use signed tokens (`jsonwebtoken`, 5m TTL) and file streaming.
  - All 17 integration suites (242 tests), challenger (22 tests), stress (28 tests), lint (0 errors), and build (34 routes) pass cleanly.
- **Unexplored areas**: None for backend survey. Investigation complete.

## Key Decisions Made
- Confirmed single-transaction coordination pattern using `payload.db.beginTransaction()` and `req.transactionID`.
- Recommended `orders: false` on `ecommercePlugin` and explicit Payload collections for digital purchase/entitlement ledger.
- Documented full handoff report in `handoff.md`.

## Artifact Index
- DISPATCH.md — Dispatch log
- BRIEFING.md — Working memory
- progress.md — Liveness heartbeat
- handoff.md — Final survey report
