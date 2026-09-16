# Execution Plan: Phase 6 Seller Revenue

Date: 2026-09-16
Status: COMPLETED (M6 completion independently confirmed by `.agents/victory_auditor_1/handoff.md` — VERDICT: VICTORY CONFIRMED)
Milestones:
- M1: Data Layer & Batch 7 Migration — CLOSED (2026-09-15)
- M2: Commission Calculation & Seller Earnings Pipeline — CLOSED / PASSED (2026-09-16)
- M3: Withdrawal Request, Reservation & Approval Workflow — CLOSED / PASSED (2026-09-16)
- M4: Compensating Refund Ledger & Reversal Flow — CLOSED / PASSED (2026-09-16)
- M5: Seller Dashboard & Finance Admin Operations — CLOSED / PASSED (2026-09-16)
- M6: Final Verification, Full Regression & Adversarial Hardening — CLOSED / PASSED (2026-09-16). Evidence: worker `p6_m6_worker_1` PASS + independent Victory Auditor `VERDICT: VICTORY CONFIRMED`. Unlike M1–M5, M6 had no separate per-gate reviewer/auditor pair; the Victory Auditor is the independent check for this gate.
Owner: Project Orchestrator

## Context
- `PLAN.md` §6.2 (Platform Fee & Commission), §6.3 (3-Tier Commission Hierarchy), §18 (API Endpoints), §22 (Authorization Matrix), §27 (Phase 6 Scope).
- `ORIGINAL_REQUEST.md` (Phase 6 requirements R1–R5, User Governing Decisions A1 and A2).
- `docs/plans/active/phase-6-seller-revenue.md` per AGENTS.md and User Rule 5.

## Milestone 6 Scope & Objectives
1. **Phase 6 E2E & Milestone Integration Verification**:
   - `tests/int/seller-revenue-e2e.int.spec.ts`: 11 passed / 11 total (100%).
   - `tests/int/m5-seller-dashboard-finance.int.spec.ts`: 10 passed / 10 total (100%).
   - `tests/int/seller-withdrawals.int.spec.ts`: 14 passed / 14 total (100%).
   - `tests/int/refund-ledger.int.spec.ts`: 10 passed / 10 total (100%).
   - `tests/int/seller-earnings.int.spec.ts`: 12 passed / 12 total (100%).
   - `tests/int/commission-config-error.int.spec.ts`: 15 passed / 15 total (100%).
   - Phase 6 Integration Tests Total: 72 passed / 72 total (100%).

2. **Integration Suite Regression Verification (Phase 1–5 Integration Test Suites)**:
   > Scope note: the 419/419 figure below covers `tests/int/` only (28 files, run via `pnpm test:int`).
   > Two further suites live in separate vitest configs and are **not** part of `test:int`:
   > `tests/challenger/product-detail.spec.tsx` (22 tests, `pnpm test:challenger`) and
   > `tests/stress/privilege-escalation.spec.ts` (28 tests, `pnpm test:stress`).
   > Playwright E2E (`tests/e2e/`, 3 files, 70 tests) is likewise a separate `pnpm test:e2e` track.
   > Both non-`int` vitest suites were executed and passed on 2026-09-16 (22/22 and 28/28).
   - Purchase & Wallet suites (6 files, 38 tests):
     - `purchase-workflow.int.spec.ts`: 6 passed / 6 total (100%)
     - `purchase-invariants.int.spec.ts`: 10 passed / 10 total (100%)
     - `secure-download.int.spec.ts`: 10 passed / 10 total (100%)
     - `wallet-ledger-invariants.int.spec.ts`: 5 passed / 5 total (100%)
     - `payment-failure-recovery.int.spec.ts`: 4 passed / 4 total (100%)
     - `payment-webhook-duplicate.int.spec.ts`: 3 passed / 3 total (100%)
   - Data & Access suites (4 files, 100 tests):
     - `m1-access-control.int.spec.ts`: 59 passed / 59 total (100%)
     - `m1-schema-stress.int.spec.ts`: 22 passed / 22 total (100%)
     - `rbac.int.spec.ts`: 14 passed / 14 total (100%)
     - `product-files-security.int.spec.ts`: 5 passed / 5 total (100%)
   - Storefront & Moderation suites (5 files + api, 73 tests):
     - `catalog-rbac.int.spec.ts`: 36 passed / 36 total (100%)
     - `catalog-m3-storefront.int.spec.ts`: 9 passed / 9 total (100%)
     - `moderation-lifecycle.int.spec.ts`: 6 passed / 6 total (100%)
     - `seller-onboarding.int.spec.ts`: 4 passed / 4 total (100%)
     - `seo-sitemap.int.spec.ts`: 17 passed / 17 total (100%)
     - `api.int.spec.ts`: 1 passed / 1 total (100%)
   - Challenger suites (6 files, 136 tests):
     - `challenger-m1-invariants.int.spec.ts`: 20 passed / 20 total (100%)
     - `challenger-m2.int.spec.ts`: 27 passed / 27 total (100%)
     - `challenger-m3.int.spec.ts`: 43 passed / 43 total (100%)
     - `challenger-m3-detail.int.spec.ts`: 11 passed / 11 total (100%)
     - `challenger-m4-seo.int.spec.ts`: 20 passed / 20 total (100%)
     - `challenger-m4-sitemap.int.spec.ts`: 15 passed / 15 total (100%)
   - Prior Phases Regression Total: 347 passed / 347 total (100% - Zero Regressions).
   - Integration Suite Total: 419 passed / 419 total across all 28 `tests/int/` files.

3. **Code Standards & Build Quality Gates**:
   - TypeScript (`pnpm tsc --noEmit`): 0 errors.
   - ESLint (`pnpm lint`): 0 errors (699 warnings).
   - Next.js Production Build (`pnpm build`): Clean compilation with exit code 0 (all 43 routes generated).

## Milestone 6 Task Checklist
- [x] Task 1: Verify Phase 6 E2E & Milestone Integration suites (72/72 tests pass).
- [x] Task 2: Verify Purchase & Wallet regression suites (38/38 tests pass).
- [x] Task 3: Verify Data & Access regression suites (100/100 tests pass).
- [x] Task 4: Verify Storefront & Moderation regression suites (73/73 tests pass).
- [x] Task 5: Verify Challenger regression suites (136/136 tests pass).
- [x] Task 6: Verify TypeScript type check (0 errors).
- [x] Task 7: Verify ESLint rules (0 errors).
- [x] Task 8: Verify Next.js production build (exit code 0, 43 routes).
- [x] Task 9: Update documentation and execution plan.
- [x] Task 10: Deliver 5-component handoff report.

## Milestone 5 Scope & Objectives
1. **Seller Earnings REST API Route (`web/src/app/api/v1/seller/earnings/route.ts`)**:
   - Authenticate request via Payload session (return 401 if unauthenticated, 403 if unauthorized non-seller/admin).
   - Query seller balance via `getSellerBalance(payload, sellerId)` (`totalEarned`, `pendingBalance`, `availableBalance`, `reservedBalance`, `withdrawnTotal`).
   - Query `seller_earnings` collection for `seller: sellerId` with pagination (`page`, `limit`) and sorting (`createdAt: 'desc'`).
   - Return JSON `{ success: true, data: { summary: balanceSummary, earnings: docs, totalDocs, totalPages, page } }`.
   - Satisfy `tests/int/seller-revenue-e2e.int.spec.ts` line 672 (401 on unauthenticated, 200 on authenticated).
2. **Seller Dashboard UI (`web/src/app/(app)/seller/page.tsx`)**:
   - Financial KPI summary cards (Available Balance, Pending 7-Day Hold, Reserved in Withdrawals, Total Withdrawn, All-Time Earned).
   - Withdrawal request modal/form with validation (50,000 to 50,000,000 VND, <= available balance) posting to `/api/v1/seller/withdrawals`.
   - Withdrawal history table with status badges and cancellation action for pending requests.
   - Per-product earnings breakdown table showing total sales count, gross revenue, platform fee, and net seller earnings.
3. **Finance Admin Operations UI (`web/src/app/(app)/finance/page.tsx`)**:
   - Accessible only to users with `admin` or `financeAdmin` role.
   - Operations dashboard displaying pending withdrawal requests, review/approval/processing/finalization/rejection actions.
   - Refund operations interface displaying recent refunds and initiation form.
4. **Verification & Quality Gates**:
   - `tests/int/seller-revenue-e2e.int.spec.ts`: 11 passed / 11 total (100%).
   - All Phase 6 suites (`seller-earnings`, `commission-config-error`, `seller-withdrawals`, `refund-ledger`): 51 passed / 51 total (100%).
   - Regression suites (`purchase-workflow`, `purchase-invariants`, `m1-schema-stress`, `m1-access-control`): 97 passed / 97 total (100%).
   - `pnpm tsc --noEmit`: 0 errors.
   - `pnpm lint`: 0 errors.

## Milestone 5 Task Checklist
- [x] Task 1: Implement `web/src/app/api/v1/seller/earnings/route.ts` (`GET`).
- [x] Task 2: Implement Seller Financial UI & Withdrawal Modal in `web/src/app/(app)/seller/`.
- [x] Task 3: Implement Finance Admin Operations UI in `web/src/app/(app)/finance/`.
- [x] Task 4: Verify `tests/int/seller-revenue-e2e.int.spec.ts` (11/11 tests pass).
- [x] Task 5: Verify all M2, M3, M4 test suites (51/51 tests pass).
- [x] Task 6: Verify all 4 regression suites (97/97 tests pass).
- [x] Task 7: Run TypeScript typecheck and ESLint (0 errors).
- [x] Task 8: Generate handoff report.

## Milestone 4 Scope & Objectives
1. **Compensating Refund Ledger & Reversal Service (`web/src/services/refund.ts`)**:
   - `processRefund(payload, params)`:
     - Input validation: `reason` required non-empty trimmed string; `orderId` required valid number.
     - Role-based authorization: Requires `financeAdmin` or `admin` role checked prior to order lookup (information leakage prevention, FLOW-U15, §5.5, §22).
     - Order verification & eligibility: Asserts order exists, verifies `status === 'COMPLETED'`, and rejects already refunded orders (`status === 'REFUNDED'`).
     - Buyer compensating wallet credit (BR-03, Decision 0002): Credits buyer wallet with type `refund` and reference `order` without mutating or deleting original purchase debit ledger entries (ledger immutability). Captures `reversalLedgerEntryId`.
     - Seller earnings reversal: Transitions related `seller_earnings` to status `REVERSED` (supported state transitions: `PENDING -> REVERSED`, `AVAILABLE -> REVERSED`, `PAID -> REVERSED`), restoring seller pending balance, and aggregates refunded platform fees and seller amounts.
     - Order status transition: Updates order status to `REFUNDED` while preserving snapshot line items in `order_items` (BR-07).
     - Entitlement revocation: Updates related `entitlements` to `status: 'revoked'` by default (`revokeEntitlement !== false`); preserves active entitlements when `revokeEntitlement === false`.
     - Audit trail: Creates complete audit record in `refunds` collection storing `code` (`REF-YYYYMMDD-XXXXXX`), `order`, `orderItem`, `buyer`, `seller`, `amount`, `platformFeeRefunded`, `sellerAmountRefunded`, `reason`, `status`, `processedBy`, `ledgerTransaction`, and `entitlementRevoked`.
2. **Admin Refund REST API Route (`web/src/app/api/v1/admin/refunds/route.ts`)**:
   - `POST`: Authenticates via Payload session headers; verifies caller has `financeAdmin` or `admin` role (401 unauthenticated, 403 unauthorized); validates payload `{ orderId, reason, revokeEntitlement? }`; invokes `processRefund`; returns 200 with result.
   - `GET`: Lists paginated refunds with optional filters (`orderId`, `sellerId`, `buyerId`) for Finance Admin portal.
3. **Verification & Quality Gates**:
   - `tests/int/refund-ledger.int.spec.ts`: 10 passed / 10 total (100%).
   - `tests/int/seller-withdrawals.int.spec.ts`, `tests/int/seller-earnings.int.spec.ts`, `tests/int/commission-config-error.int.spec.ts`: 41 passed / 41 total (100%).
   - `tests/int/purchase-workflow.int.spec.ts`, `tests/int/purchase-invariants.int.spec.ts`, `tests/int/m1-schema-stress.int.spec.ts`, `tests/int/m1-access-control.int.spec.ts`: 97 passed / 97 total (100%).
   - `pnpm tsc --noEmit`: 0 errors.
   - `pnpm lint`: 0 errors.

## Milestone 4 Task Checklist
- [x] Task 1: Implement `web/src/services/refund.ts` (`processRefund`, `RefundParams`, `RefundResult`).
- [x] Task 2: Implement `web/src/app/api/v1/admin/refunds/route.ts` (`POST` & `GET`).
- [x] Task 3: Verify `tests/int/refund-ledger.int.spec.ts` (10/10 tests pass).
- [x] Task 4: Verify seller-withdrawals, seller-earnings, commission-config-error (41/41 tests pass).
- [x] Task 5: Verify regression suites (purchase-workflow, purchase-invariants, m1-schema-stress, m1-access-control: 97/97 tests pass).
- [x] Task 6: Run TypeScript typecheck and ESLint (0 errors).
- [x] Task 7: Update `docs/plans/active/phase-6-seller-revenue.md`.
- [x] Task 8: Generate handoff report.

## Milestone 3 Scope & Objectives
1. **Withdrawal Service (`web/src/services/withdrawal.ts`)**:
   - `requestWithdrawal(payload, params)`:
     - Input validation: Bank details (`bankName`, `accountNumber`, `accountHolderName`) required non-empty strings; amount within [50,000, 50,000,000] VND integer limits.
     - Role-based authorization: Requires `seller` role.
     - Concurrency & Anti-Race Overdraft Protection (Threat T7): In-memory async mutex keyed by `sellerId` (`withSellerLock`) strictly serializes balance verification and withdrawal creation per seller.
     - Balance check: Asserts `amount <= balance.availableBalance` before creation.
     - Generates unique code (`WTH-YYYYMMDD-XXXXXXXX` 32-bit hex suffix).
     - Inserts record in `withdrawals` with status `REQUESTED`.
     - Records immutable audit event in `withdrawal_events`.
   - `reviewWithdrawal(payload, { withdrawalId, actorId })`:
     - FinanceAdmin/Admin role verification.
     - State machine transition: `REQUESTED` -> `UNDER_REVIEW`.
     - Terminal state immutability enforcement (`PAID`, `REJECTED`, `CANCELLED`, `FAILED`).
     - Records audit event in `withdrawal_events`.
   - `approveWithdrawal(payload, { withdrawalId, actorId, notes? })`:
     - FinanceAdmin/Admin role verification.
     - State machine transition: `UNDER_REVIEW` or `REQUESTED` -> `APPROVED`.
     - Records audit event in `withdrawal_events`.
   - `processWithdrawal(payload, { withdrawalId, actorId })`:
     - FinanceAdmin/Admin role verification.
     - State machine transition: `APPROVED` -> `PROCESSING`.
     - Records audit event in `withdrawal_events`.
   - `finalizeWithdrawalPaid(payload, { withdrawalId, actorId })`:
     - FinanceAdmin/Admin role verification.
     - State machine transition: `PROCESSING` or `APPROVED` -> `PAID`. Sets `paidAt`.
     - Records audit event in `withdrawal_events`.
   - `rejectWithdrawal(payload, { withdrawalId, actorId, reason })`:
     - FinanceAdmin/Admin role verification. Requires non-empty reason.
     - State machine transition: `REQUESTED`, `UNDER_REVIEW`, `APPROVED`, or `PROCESSING` -> `REJECTED`.
     - Automatically restores reserved funds back to seller available balance.
     - Records audit event in `withdrawal_events`.
   - `cancelWithdrawal(payload, { withdrawalId, sellerId })`:
     - Seller ownership verification.
     - State machine transition: `REQUESTED` or `UNDER_REVIEW` -> `CANCELLED`.
     - Automatically restores reserved funds back to seller available balance.
     - Records audit event in `withdrawal_events`.
2. **Earnings Service Balance Calculation Update (`web/src/services/earnings.ts`)**:
   - Accurately computes `withdrawnTotal` from `withdrawals` with status `PAID`.
   - Calculates `netAvailable = Math.max(0, grossAvailable - reservedBalance - withdrawnTotal)`.
   - Calculates `totalEarned = grossAvailable + pendingBalance`.
   - Documents pagination note for `limit: 5000`.
3. **Commission Service Range Validation (`web/src/services/commission.ts`)**:
   - Added rate range checks (`0 <= rate <= 1`) across all three tiers (campaign, seller override, site default) throwing `CommissionConfigurationError`.
4. **State Machine Invariant Hook Update (`web/src/collections/Withdrawals/hooks/validateWithdrawalInvariants.ts`)**:
   - Allowed `APPROVED -> PAID` and `PROCESSING -> REJECTED` transitions in `VALID_TRANSITIONS`.
5. **REST API Route Handlers**:
   - `web/src/app/api/v1/seller/withdrawals/route.ts`: `GET` (list seller withdrawals), `POST` (submit request).
   - `web/src/app/api/v1/admin/withdrawals/route.ts`: `GET` (list all withdrawals with status/seller filter).
   - `web/src/app/api/v1/admin/withdrawals/[id]/approve/route.ts`: `POST` (FinanceAdmin approve).
   - `web/src/app/api/v1/admin/withdrawals/[id]/reject/route.ts`: `POST` (FinanceAdmin reject with reason).
6. **Verification & Quality Gates**:
   - `tests/int/seller-withdrawals.int.spec.ts`: 14 passed / 14 total (100%).
   - `tests/int/seller-earnings.int.spec.ts` + `tests/int/commission-config-error.int.spec.ts`: 27 passed / 27 total (100%).
   - `tests/int/purchase-workflow.int.spec.ts`, `tests/int/purchase-invariants.int.spec.ts`, `tests/int/m1-schema-stress.int.spec.ts`, `tests/int/m1-access-control.int.spec.ts`: 97 passed / 97 total (100%).
   - `pnpm tsc --noEmit`: 0 errors.
   - `pnpm lint`: 0 errors.

## Task Checklist
- [x] Task 1: Update `validateWithdrawalInvariants.ts` to allow `APPROVED -> PAID` and `PROCESSING -> REJECTED`.
- [x] Task 2: Update `web/src/services/earnings.ts` `getSellerBalance` to calculate `withdrawnTotal` from `PAID` withdrawals and compute `netAvailable`.
- [x] Task 3: Update `web/src/services/commission.ts` `resolveCommissionRate` to validate rate bounds `[0, 1]`.
- [x] Task 4: Implement `web/src/services/withdrawal.ts` with all 7 functions, mutex locking, and audit events.
- [x] Task 5: Implement REST API routes: `seller/withdrawals`, `admin/withdrawals`, `admin/withdrawals/[id]/approve`, `admin/withdrawals/[id]/reject`.
- [x] Task 6: Verify `tests/int/seller-withdrawals.int.spec.ts` (14/14 tests pass).
- [x] Task 7: Verify `tests/int/seller-earnings.int.spec.ts` and `tests/int/commission-config-error.int.spec.ts` (27/27 tests pass).
- [x] Task 8: Verify 4 regression test suites (97/97 tests pass).
- [x] Task 9: Run TypeScript typecheck and ESLint (0 errors).
- [x] Task 10: Generate handoff report.

## Context
- `PLAN.md` §6.2 (Platform Fee & Commission), §6.3 (3-Tier Commission Hierarchy), §18 (API Endpoints), §22 (Authorization Matrix), §27 (Phase 6 Scope).
- `ORIGINAL_REQUEST.md` (Phase 6 requirements R1–R5, User Governing Decisions A1 and A2).
- `docs/plans/active/phase-6-seller-revenue.md` per AGENTS.md and User Rule 5.

## Milestone 2 Scope & Objectives
1. **Payload Global `CommissionSettings`**:
   - Slug: `commission_settings`
   - Field: `defaultRate` (number, required: true, defaultValue: 0.30, min: 0, max: 1)
   - Access: read public, update adminOnly
   - Registered in `payload.config.ts`
   - Migration Batch 8: `web/src/migrations/20260916_000000_phase6_commission_settings.ts` + registered in `web/src/migrations/index.ts`
   - PostgreSQL table `commission_settings` created and tracked in `payload_migrations`.
2. **Commission Resolution & Arithmetic Service (`web/src/services/commission.ts`)**:
   - `resolveCommissionRate(payload, { sellerId, productId, campaignId?, req? })`:
     - Hierarchy: Campaign (deferred from P0 per A2) -> Seller override (`seller_profiles.commissionRate`) -> Site default (`commission_settings.defaultRate`, fallback 0.30).
     - Returns `{ commissionRate, policyVersion, source }`.
   - `calculateRevenueSplit(amountVnd, rate, tax?)`:
     - Integer VND round-half-safe arithmetic:
       `platformFee = Math.round(amountVnd * rate)`
       `sellerAmount = amountVnd - platformFee - tax`
       Guarantees `platformFee + sellerAmount + tax === amountVnd`.
3. **Seller Earnings & Balance Service (`web/src/services/earnings.ts`)**:
   - `releaseMaturedEarnings(payload, { sellerId?, asOf? })`:
     - Queries `seller_earnings` with status `PENDING` and `holdUntil <= asOf` (default `now`).
     - Transitions status to `AVAILABLE` and sets `availableAt`.
     - Returns `{ releasedCount, totalReleasedAmount }`.
   - `getSellerBalance(payload, sellerId)`:
     - Aggregates `seller_earnings` (pending, available, withdrawn) and in-flight `withdrawals` (reserved).
     - Net available balance calculation: `netAvailable = Math.max(0, grossAvailable - reservedBalance)` ensuring in-flight withdrawal reservations decrement withdrawable funds (FR-32, Threat T7 overdraft prevention).
     - Total earned calculation: `totalEarned = grossAvailable + pendingBalance + withdrawnTotal` eliminating double-counting of reserved balances.
     - Returns `{ totalEarned, pendingBalance, availableBalance, reservedBalance, withdrawnTotal }`.
4. **Atomic Purchase Integration (`web/src/services/purchase.ts`)**:
   - Atomically resolves commission rate and split in `purchaseProduct`.
   - Freezes snapshot values in `order_items` (`salePrice`, `platformFee`, `sellerAmount`, `tax`, `policyVersion`).
   - Atomically inserts `seller_earnings` row with status `PENDING` and 7-day hold period in the same transaction.
5. **Deterministic Policy Version & Strict Configuration Authority (`web/src/services/commission.ts`, ADR 0009)**:
   - Formats `policyVersion` canonically: `site-default-v1-${Number(rate).toFixed(2)}` (e.g. `site-default-v1-0.30`).
   - Strict configuration enforcement per ADR 0009 item 3 & Decision A1: Removed hard-coded 0.30 code fallback in `resolveCommissionRate`; throws explicit `CommissionConfigurationError` on missing/invalid configuration.
   - Updated ADR 0009 § Follow-Up documenting resolution of decision item 3 via Batch 8 `commission_settings` global.
6. **Campaign Deferral Verification (`web/tests/int/seller-earnings.int.spec.ts`)**:
   - Positively asserts campaign collection deferral: `expect(payload.collections.campaigns).toBeUndefined()` per Decision A2.
7. **Dedicated Configuration Error Integration Test Coverage (`web/tests/int/commission-config-error.int.spec.ts`)**:
   - Pure stubbed test suite verifying all `CommissionConfigurationError` throw branches:
     - `payload.findGlobal` rejections (Error and non-Error rejections).
     - Missing or invalid `defaultRate` (null, undefined, non-numeric strings, NaN, booleans).
     - Valid site-default resolution and canonical `policyVersion` formatting.
     - Error instance properties (`instanceof CommissionConfigurationError`, `code: 'COMMISSION_CONFIGURATION_ERROR'`).
8. **Verification & Quality Gates**:
   - `tests/int/seller-earnings.int.spec.ts`: 12 passed / 12 total.
   - `tests/int/commission-config-error.int.spec.ts`: 15 passed / 15 total.
   - `tests/int/purchase-workflow.int.spec.ts`, `tests/int/purchase-invariants.int.spec.ts`: 16 passed / 16 total.
   - `pnpm tsc --noEmit`: 0 errors.
   - `pnpm lint`: 0 errors.

## Task Checklist
- [x] Task 1: Create `CommissionSettings.ts`, register in `payload.config.ts`, create Batch 8 migration, register in migration index, run DDL on PostgreSQL, and regenerate payload types.
- [x] Task 2: Implement `web/src/services/commission.ts` (`resolveCommissionRate`, `calculateRevenueSplit`).
- [x] Task 3: Implement `web/src/services/earnings.ts` (`releaseMaturedEarnings`, `getSellerBalance`).
- [x] Task 4: Integrate commission calculation and `seller_earnings` creation into `purchaseProduct` in `web/src/services/purchase.ts`.
- [x] Task 5: Fix Finding 1 in `web/src/services/earnings.ts`: Deduct `reservedBalance` from `grossAvailable` and fix `totalEarned` arithmetic.
- [x] Task 6: Implement C1 & C2: Remove hardcoded fallback rate in `commission.ts`, add `CommissionConfigurationError`, format `policyVersion` as `site-default-v1-0.30`.
- [x] Task 7: Implement C3: Update ADR 0009 item 3 and § Follow-Up record.
- [x] Task 8: Implement C4: Update campaign test to verified positive deferral skip in `seller-earnings.int.spec.ts`.
- [x] Task 9: Author committed test suite `web/tests/int/commission-config-error.int.spec.ts` covering `CommissionConfigurationError` and error throw branches (15/15 tests passing).
- [x] Task 10: Run test suite, type check, and linter (all pass).
- [x] Task 11: Generate handoff report (`.agents/orchestrator/handoff.md`, 74 lines; plus `.agents/victory_auditor_1/handoff.md`).
