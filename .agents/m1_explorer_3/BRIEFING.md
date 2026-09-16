# BRIEFING — 2026-09-15T10:56:00Z

## Mission
Explore requirements and exact implementation design for Phase 6 Focus Area 3: Refunds collection, Payload config registration, and PostgreSQL Migration Batch 7.

## 🔒 My Identity
- Archetype: explorer
- Roles: investigation, synthesis
- Working directory: /home/trung/Documents/2026/project/test-v6/.agents/m1_explorer_3
- Original parent: 97815561-5c1e-4548-8e83-6acb89c4e2aa
- Milestone: Milestone 1

## 🔒 Key Constraints
- Read-only investigation — do NOT implement
- No changes to repository source code files; generate plans, designs, schemas, and reports within .agents/m1_explorer_3
- Follow 5-component handoff report standard

## Current Parent
- Conversation ID: 97815561-5c1e-4548-8e83-6acb89c4e2aa
- Updated: 2026-09-15T10:56:00Z

## Investigation State
- **Explored paths**:
  - `ORIGINAL_REQUEST.md` (lines 73–150, Phase 6 Seller Revenue requirements R1–R5)
  - `PLAN.md` (§5.5, §6.3, §10 BR-01..BR-07, §11, §12, §18, §22 authorization matrix, FLOW-U15)
  - `web/src/collections/Orders/index.ts` (status enum, code generator hook, relations)
  - `web/src/collections/OrderItems/index.ts` (financial fields snapshot BR-07, relations)
  - `web/src/collections/SellerProfiles.ts` (commissionRate field extension)
  - `web/src/collections/WalletLedger.ts` (ledger immutability BR-03, reference types)
  - `web/src/access/canEditMoney.ts`, `financialAccess.ts`, `orderAccess.ts`, `isFinanceAdmin.ts`
  - `web/src/payload.config.ts` (collection registry, postgresAdapter push: false)
  - `web/src/migrations/20260915_064708_phase4_payment_wallet.ts` (Batch 5 patterns)
  - `web/src/migrations/20260915_071500_phase5_purchase_download.ts` (Batch 6 patterns)
  - `web/src/migrations/index.ts` (migration registry)
  - Peer focus areas 1 (`SellerEarnings`) and 2 (`Withdrawals`, `WithdrawalEvents`)
- **Key findings**:
  - `Refunds` collection must strictly enforce `canEditMoney` for create/update/delete via REST.
  - `refundReadAccess` allows `admin`, `financeAdmin`, or `buyer === user.id`, or `seller === user.id`.
  - Auto-generated `code` hook: `REF-YYYYMMDD-XXXXX` using `crypto.randomBytes`.
  - `payload.config.ts` imports and registers `SellerEarnings`, `Withdrawals`, `WithdrawalEvents`, `Refunds`.
  - Batch 7 migration creates 4 tables, alters `seller_profiles` (`commission_rate`), alters `enum_orders_status` ('REFUNDED'), configures foreign keys, check constraints, locked document relations, and down migrations.
- **Unexplored areas**: None for Focus Area 3 scope; all requirements investigated.

## Key Decisions Made
- `refundReadAccess` partitioned into dedicated file `web/src/access/refundAccess.ts` for clean unit-testability.
- DDL strictly adheres to Payload PostgreSQL column naming conventions (`payout_info_bank_name`, `order_item_id`, etc.).
- Complete DDL includes check constraints (`amount >= 50000 AND amount <= 50000000` for withdrawals; non-negative monetary checks for earnings and refunds).
- Unique index on `order_item_id` in `seller_earnings` prevents duplicate earnings records.

## Artifact Index
- DISPATCH.md — Dispatch log from orchestrator
- BRIEFING.md — Persistent working memory and situational awareness
- progress.md — Heartbeat and step tracking
- handoff.md — Comprehensive 5-component handoff report
