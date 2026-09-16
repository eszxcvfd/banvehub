## 2026-09-15T10:37:03Z

<USER_REQUEST>
You are m1_explorer_3, a teamwork_preview_explorer agent.
Your working directory is: /home/trung/Documents/2026/project/test-v6/.agents/m1_explorer_3
Your parent is: orchestrator (conversation ID: 97815561-5c1e-4548-8e83-6acb89c4e2aa)

MANDATORY FIRST STEP: Read the user request at:
/home/trung/Documents/2026/project/test-v6/.agents/ORIGINAL_REQUEST.md
Specifically review the Phase 6 (Seller Revenue) section starting from line 73.

YOUR MISSION:
Explore requirements and exact implementation design for Milestone 1:
Focus Area 3: `refunds` Collection, Payload Config Registration, & PostgreSQL Migration Batch 7:
1. Design `refunds` collection (web/src/collections/Refunds/index.ts):
   - Fields: code (text, unique, indexed, e.g. REF-YYYYMMDD-XXXXX), order (rel: orders, indexed), orderItem (rel: order_items), buyer (rel: users, indexed), seller (rel: users, indexed), amount (number VND), platformFeeRefunded (number VND), sellerAmountRefunded (number VND), currency (select 'VND', default 'VND'), reason (text), status (select: COMPLETED, FAILED), processedBy (rel: users, Finance Admin or Super Admin), ledgerTransaction (rel: wallet_ledger or number), entitlementRevoked (checkbox), createdAt (date, default now).
   - Access control: canEditMoney (deny direct REST mutations), read for buyer, seller, financeAdmin, admin.
2. Review web/src/payload.config.ts to register all 4 new collections: `SellerEarnings`, `Withdrawals`, `WithdrawalEvents`, `Refunds`.
3. Design PostgreSQL Migration Batch 7 (web/src/migrations/20260915_100000_phase6_seller_revenue.ts):
   - Inspect existing migration patterns in Batch 5 (`20260915_064708_phase4_payment_wallet.ts`) and Batch 6 (`20260915_071500_phase5_purchase_download.ts`).
   - DDL for enum types, tables, foreign keys, indices (unique index on orderItem in seller_earnings, index on seller in withdrawals, etc.), check constraints (`amount >= 50000 AND amount <= 50000000`, `seller_amount >= 0`, `platform_fee >= 0`), and down migration statements.
   - Command to run migrations: `pnpm --prefix web payload migrate`.

Deliver a comprehensive handoff report to:
/home/trung/Documents/2026/project/test-v6/.agents/m1_explorer_3/handoff.md
Maintain BRIEFING.md and progress.md in your working directory. Notify orchestrator when done.
</USER_REQUEST>
