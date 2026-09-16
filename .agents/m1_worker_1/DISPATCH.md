## 2026-09-15T07:19:00Z
You are m1_worker_1, a teamwork_preview_worker subagent for Milestone 1 (Schema & Migration Batch 6).
Your working directory is: /home/trung/Documents/2026/project/test-v6/.agents/m1_worker_1
Workspace root: /home/trung/Documents/2026/project/test-v6

MANDATORY FIRST STEP:
Read /home/trung/Documents/2026/project/test-v6/.agents/ORIGINAL_REQUEST.md.

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

INPUT SPECIFICATIONS TO READ:
1. /home/trung/Documents/2026/project/test-v6/.agents/orchestrator/PROJECT.md
2. /home/trung/Documents/2026/project/test-v6/.agents/m1_explorer_1/handoff.md (Orders & OrderItems design, hooks, access rules, Users join alignment)
3. /home/trung/Documents/2026/project/test-v6/.agents/m1_explorer_2/handoff.md (Entitlements & DownloadEvents design, hooks, access rules)
4. /home/trung/Documents/2026/project/test-v6/.agents/m1_explorer_3/handoff.md (PostgreSQL migration Batch 6 exact DDL, up/down scripts, triggers, indices)

YOUR EXCLUSIVE WRITE OWNERSHIP:
- web/src/collections/Orders/index.ts
- web/src/collections/OrderItems/index.ts
- web/src/collections/Entitlements/index.ts
- web/src/collections/DownloadEvents/index.ts
- web/src/access/orderAccess.ts
- web/src/access/entitlementAccess.ts
- web/src/access/downloadEventAccess.ts
- web/src/collections/Users/index.ts (update join field `orders` to `on: 'buyer'`)
- web/src/plugins/index.ts (disable plugin orders: `orders: false`, clean up schema override)
- web/src/payload.config.ts (register Orders, OrderItems, Entitlements, DownloadEvents)
- web/src/migrations/20260915_071500_phase5_purchase_download.ts
- web/src/migrations/20260915_071500_phase5_purchase_download.json
- web/src/migrations/index.ts
- web/src/payload-types.ts

TASKS TO EXECUTE:
1. Implement `orderAccess.ts`, `entitlementAccess.ts`, and `downloadEventAccess.ts` according to the explorer specifications.
2. Implement `web/src/collections/Orders/index.ts` with code, buyer, totalAmount, currency, status, paymentSource, paidAt, notes.
3. Implement `web/src/collections/OrderItems/index.ts` with order, product, seller, salePrice (BR-07 immutable snapshot), platformFee, sellerAmount, tax, policyVersion. Include hooks for BR-04 (buyer !== seller) and BR-07 immutability.
4. Implement `web/src/collections/Entitlements/index.ts` with user, product, order, orderItem, status, grantedAt, downloadCount, maxDownloads, expiresAt, revokedAt, reason, and hooks for unique active entitlement per user & product.
5. Implement `web/src/collections/DownloadEvents/index.ts` with user, product, entitlement, ipAddress, userAgent, downloadedAt, status, downloadTokenHash, errorReason.
6. In `web/src/plugins/index.ts`, set `orders: false` in `ecommercePlugin` and clean up typescript schema override.
7. In `web/src/collections/Users/index.ts`, update `orders` join to `on: 'buyer'`.
8. In `web/src/payload.config.ts`, register the 4 collections.
9. Implement migration Batch 6: `web/src/migrations/20260915_071500_phase5_purchase_download.ts` and `.json` with the exact SQL DDL from `m1_explorer_3/handoff.md` (dropping old 0-row template tables, creating new digital tables, partial unique index `entitlements_user_product_active_idx`, BR-04 check/trigger, locked document relations, and symmetric rollback). Register in `web/src/migrations/index.ts`.
10. Run migration using `pnpm --prefix web payload migrate`. Verify migration status: `pnpm --prefix web payload migrate:status`.
11. Run `pnpm --prefix web payload generate:types` (or `pnpm --prefix web generate:types`) to regenerate `payload-types.ts`.
12. Run verification:
47:     - `pnpm --prefix web test:int` (all 17 existing suites must pass 100%)
48:     - `pnpm --prefix web lint` (0 errors)

## 2026-09-15T11:10:00Z
You are m1_worker_1, a teamwork_preview_worker subagent for Phase 6 Milestone 1: Data Models, Access Controls & Migration Batch 7.
Your working directory is: /home/trung/Documents/2026/project/test-v6/.agents/m1_worker_1
Workspace root: /home/trung/Documents/2026/project/test-v6
Your parent is: orchestrator (conversation ID: 7c1d229b-1583-4f43-924a-e6290887757a)

MANDATORY FIRST STEP:
Read /home/trung/Documents/2026/project/test-v6/.agents/ORIGINAL_REQUEST.md.

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

INPUT SPECIFICATIONS TO READ:
1. /home/trung/Documents/2026/project/test-v6/.agents/orchestrator/PROJECT.md
2. /home/trung/Documents/2026/project/test-v6/.agents/m1_explorer_1/handoff.md (Orders status extension, SellerProfiles commissionRate, SellerEarnings collection & hooks)
3. /home/trung/Documents/2026/project/test-v6/.agents/m1_explorer_2/handoff.md (Withdrawals & WithdrawalEvents collections, hooks, access rules)
4. /home/trung/Documents/2026/project/test-v6/.agents/m1_explorer_3/handoff.md (Refunds collection, payload.config.ts registration, PostgreSQL migration Batch 7 DDL)

YOUR EXCLUSIVE WRITE OWNERSHIP:
- web/src/collections/Orders/index.ts (extend status with 'REFUNDED', add earnings join)
- web/src/app/api/v1/me/orders/route.ts (support 'REFUNDED' status filter)
- web/src/components/OrderStatus/index.tsx (support 'REFUNDED' badge)
- web/src/collections/SellerProfiles.ts (add commissionRate override)
- web/src/access/sellerProfileAccess.ts (add adminOrFinanceAdminFieldAccess and commissionRateReadAccess)
- web/src/collections/SellerEarnings/index.ts & hooks:
  - web/src/collections/SellerEarnings/hooks/calculateHoldUntil.ts
  - web/src/collections/SellerEarnings/hooks/validateEarningMath.ts
  - web/src/collections/SellerEarnings/hooks/preventEarningMutation.ts
- web/src/access/sellerEarningsAccess.ts
- web/src/collections/Withdrawals/index.ts & hooks:
  - web/src/collections/Withdrawals/hooks/generateWithdrawalCode.ts
  - web/src/collections/Withdrawals/hooks/validateWithdrawalInvariants.ts
- web/src/collections/WithdrawalEvents/index.ts & hooks:
  - web/src/collections/WithdrawalEvents/hooks/preventWithdrawalEventMutation.ts
- web/src/access/withdrawalAccess.ts
- web/src/collections/Refunds/index.ts
- web/src/access/refundAccess.ts
- web/src/payload.config.ts (register SellerEarnings, Withdrawals, WithdrawalEvents, Refunds)
- web/src/migrations/20260915_100000_phase6_seller_revenue.ts (Batch 7 DDL)
- web/src/migrations/index.ts (register Batch 7 migration)
- web/src/payload-types.ts (regenerated types)

TASKS TO EXECUTE:
1. Implement Focus Area 1 (per m1_explorer_1/handoff.md):
   - In `web/src/collections/Orders/index.ts`, add `'REFUNDED'` to status enum options, add `earnings` join relationship to `seller_earnings`.
   - In `web/src/app/api/v1/me/orders/route.ts`, allow `'REFUNDED'` in the status filter query.
   - In `web/src/components/OrderStatus/index.tsx`, add styling badge for `'REFUNDED'`.
   - In `web/src/access/sellerProfileAccess.ts`, add `adminOrFinanceAdminFieldAccess` and `commissionRateReadAccess`.
   - In `web/src/collections/SellerProfiles.ts`, add `commissionRate` field (number, min 0, max 1, step 0.01) with the field access rules.
   - Create `web/src/access/sellerEarningsAccess.ts` with `sellerEarningsReadAccess`.
   - Create `web/src/collections/SellerEarnings/hooks/` (`calculateHoldUntil.ts`, `validateEarningMath.ts`, `preventEarningMutation.ts`).
   - Create `web/src/collections/SellerEarnings/index.ts` with all fields, hooks, and canEditMoney write denial.

2. Implement Focus Area 2 (per m1_explorer_2/handoff.md):
   - Create `web/src/access/withdrawalAccess.ts` with `withdrawalReadAccess`, `withdrawalEventReadAccess`, and canEditMoney write denial.
   - Create `web/src/collections/Withdrawals/hooks/generateWithdrawalCode.ts` and `validateWithdrawalInvariants.ts`.
   - Create `web/src/collections/Withdrawals/index.ts` with code, seller, amount, currency, status, bankInfo, timestamps, review fields, notes, and events join.
   - Create `web/src/collections/WithdrawalEvents/hooks/preventWithdrawalEventMutation.ts`.
   - Create `web/src/collections/WithdrawalEvents/index.ts` with withdrawal, fromStatus, toStatus, actor, actorRole, reason, notes, timestamp, metadata.

3. Implement Focus Area 3 (per m1_explorer_3/handoff.md):
   - Create `web/src/access/refundAccess.ts` with `refundReadAccess`.
   - Create `web/src/collections/Refunds/index.ts` with code autogeneration hook, order, orderItem, buyer, seller, amount, platformFeeRefunded, sellerAmountRefunded, currency, reason, status, processedBy, ledgerTransaction, entitlementRevoked.
   - Update `web/src/payload.config.ts` to register `SellerEarnings`, `Withdrawals`, `WithdrawalEvents`, `Refunds`.
   - Create PostgreSQL Migration Batch 7: `web/src/migrations/20260915_100000_phase6_seller_revenue.ts` with exact DDL (up and down) per m1_explorer_3 handoff.
   - Register migration in `web/src/migrations/index.ts`.

4. Execute Migrations & Type Generation:
   - Run `pnpm --prefix web payload migrate`
   - Run `pnpm --prefix web generate:types`

5. Verification & Testing:
   - Run `pnpm --prefix web build` (clean build check)
   - Run `pnpm --prefix web lint` (0 errors)
   - Run `pnpm --prefix web test:int` (all existing 347 tests across 22 suites continue to pass 100%)

6. Output:
   - Deliver handoff report to `/home/trung/Documents/2026/project/test-v6/.agents/m1_worker_1/handoff.md`.
   - Include terminal output of migration, type generation, lint, and test runs.
   - Send completion message to parent orchestrator.
