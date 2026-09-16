# Milestone 5 Review & Adversarial Verification Report

**Agent**: `p6_m5_reviewer_1`  
**Roles**: Reviewer & Adversarial Critic  
**Milestone**: Phase 6 Milestone 5 (Seller Dashboard & Finance Admin Operations)  
**Parent Conversation ID**: `b96b7657-610e-4105-89ae-923e3ac1b237`  
**Date**: 2026-09-16  
**Verdict**: **APPROVE**

---

## 1. Observation

### Code Inspection & Verified Findings

1. **Seller Earnings REST API (`web/src/app/api/v1/seller/earnings/route.ts`)**:
   - Authentication (lines 25-27): Enforces `if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })`.
   - Authorization (lines 30-32): Checks `if (!checkRole(['seller', 'admin'], user)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })`.
   - Data Isolation (lines 41-47): Only admin users can override `sellerId` via `sellerIdParam`; standard sellers are strictly constrained to `sellerId = user.id`.
   - Balance Summary Integration (line 50): Integrates directly with `getSellerBalance(payload, sellerId)` returning `totalEarned`, `pendingBalance`, `availableBalance`, `reservedBalance`, and `withdrawnTotal`.
   - Itemized Query & Pagination (lines 35-36, 53-64): Paginates `seller_earnings` with safe clamp `limit = Math.min(100, Math.max(1, ...))` and optional status filtering.

2. **Seller Dashboard UI (`web/src/app/(app)/seller/`)**:
   - Access Control (`page.tsx:36-38`): Redirects unauthenticated users to `/login` and non-seller/admin users to `/seller/register`.
   - Balance Loading (`page.tsx:54`): Calls `getSellerBalance(payload, user.id)`.
   - 5 Financial KPI Cards (`page.tsx:218-276`):
     1. Số dư khả dụng (Available Balance): Green theme with live pulse indicator and `WithdrawalModal` trigger.
     2. Tạm giữ 7 ngày (Pending Hold): 7-day maturation hold indicator.
     3. Đang xử lý rút (Reserved Balance): Reflects funds reserved in non-terminal withdrawals.
     4. Tổng tiền đã rút (Total Withdrawn): Reflects finalized paid withdrawals.
     5. Tổng thu nhập tích lũy (All-Time Earned): Total lifetime earnings.
   - Payout Modal (`WithdrawalModal.tsx`):
     - Amount validation: Enforces `50,000 <= amount <= 50,000,000` VND and `amount <= availableBalance`.
     - Required bank details: `bankName`, `accountNumber`, uppercase `accountHolderName`.
     - Submits to `POST /api/v1/seller/withdrawals`.
   - Payout History Table (`WithdrawalHistoryTable.tsx`):
     - Displays formatted transaction code (`w.code`), amount, bank details, and status badges (`REQUESTED`, `UNDER_REVIEW`, `APPROVED`, `PROCESSING`, `PAID`, `REJECTED`, `CANCELLED`).
     - Includes "Hủy" (Cancel) button active only for `REQUESTED` and `UNDER_REVIEW`, calling `/api/v1/seller/withdrawals/[id]/cancel`.
   - Per-Product Earnings Breakdown (`page.tsx:76-114, 295-350`):
     - Aggregates non-reversed `seller_earnings` by `productId`.
     - Accurately renders sales count, gross sales volume, platform fee deduction, and net seller earnings.

3. **Finance Admin Operations UI (`web/src/app/(app)/finance/`)**:
   - Access Control (`page.tsx:18-23`): Strictly guarded by `checkRole(['admin', 'financeAdmin'], user)`. Unauthorized users redirected to `/login`.
   - Operations Interface (`FinanceOperations.tsx`):
     - Tab 1 (Withdrawal Queue): Status filters, seller identification, bank info, and lifecycle actions:
       - "Tiếp nhận thẩm định" -> `POST /api/v1/admin/withdrawals/[id]/review` (`REQUESTED -> UNDER_REVIEW`).
       - "Phê duyệt" modal -> `POST /api/v1/admin/withdrawals/[id]/approve` (`REQUESTED | UNDER_REVIEW -> APPROVED`).
       - "Đang chuyển khoản" -> `POST /api/v1/admin/withdrawals/[id]/process` (`APPROVED -> PROCESSING`).
       - "Đã hoàn tất thanh toán" -> `POST /api/v1/admin/withdrawals/[id]/finalize` (`PROCESSING | APPROVED -> PAID`).
       - "Từ chối" modal with mandatory reason -> `POST /api/v1/admin/withdrawals/[id]/reject` (releases reserved balance back to seller).
     - Tab 2 (Refunds / Compensating Ledger): Displays immutable records from `refunds` collection (`REF-...`, original order, buyer credit, platform fee refund, seller earning reversal, reason, actor, timestamp) and "Thực hiện hoàn tiền bồi hoàn" modal calling `POST /api/v1/admin/refunds`.

4. **Additional Action REST Routes**:
   - `web/src/app/api/v1/seller/withdrawals/[id]/cancel/route.ts`: Guards against cross-seller cancellation; invokes `cancelWithdrawal` with `sellerId: user.id`.
   - `web/src/app/api/v1/admin/withdrawals/[id]/review/route.ts`: Guards role `['financeAdmin', 'admin']`; calls `reviewWithdrawal`.
   - `web/src/app/api/v1/admin/withdrawals/[id]/process/route.ts`: Guards role `['financeAdmin', 'admin']`; calls `processWithdrawal`.
   - `web/src/app/api/v1/admin/withdrawals/[id]/finalize/route.ts`: Guards role `['financeAdmin', 'admin']`; calls `finalizeWithdrawalPaid`.

5. **Test Suite Execution & Results**:
   - `pnpm tsc --noEmit`: Exited 0 with 0 errors.
   - `pnpm lint`: Exited 0 with 0 errors (699 non-blocking eslint warnings in tests/types).
   - Milestone 5 & E2E Suites:
     `pnpm vitest run tests/int/seller-revenue-e2e.int.spec.ts tests/int/m5-seller-dashboard-finance.int.spec.ts`
     -> **2 passed (2 files), 21 passed (21 tests), duration 6.77s**.
   - M2/M3/M4 Regression Suites:
     `pnpm vitest run tests/int/seller-earnings.int.spec.ts tests/int/commission-config-error.int.spec.ts tests/int/seller-withdrawals.int.spec.ts tests/int/refund-ledger.int.spec.ts`
     -> **4 passed (4 files), 51 passed (51 tests), duration 11.16s**.
   - Core System Regression Suites:
     `pnpm vitest run tests/int/purchase-workflow.int.spec.ts tests/int/purchase-invariants.int.spec.ts tests/int/m1-schema-stress.int.spec.ts tests/int/m1-access-control.int.spec.ts`
     -> **4 passed (4 files), 97 passed (97 tests), duration 12.82s**.
   - Total Tests Executed & Passed: **169 tests across 10 test files (100% pass rate)**.

---

## 2. Logic Chain

1. **Authentication & Authorization Integrity**:
   - Observation: All 5 routes (`/api/v1/seller/earnings`, `/api/v1/seller/withdrawals/[id]/cancel`, `/api/v1/admin/withdrawals/[id]/review`, `/api/v1/admin/withdrawals/[id]/process`, `/api/v1/admin/withdrawals/[id]/finalize`) check session identity via `payload.auth({ headers })` before any processing.
   - Observation: Unauthenticated requests return HTTP 401. Unauthorized roles (e.g. buyer attempting seller or admin routes, or seller attempting admin routes) return HTTP 403.
   - Inference: Role boundaries are fully preserved; privilege escalation is impossible.

2. **Data Isolation**:
   - Observation: In `/api/v1/seller/earnings/route.ts`, standard sellers cannot specify `sellerIdParam` (it is guarded by `checkRole(['admin'], user)`). Standard sellers always query using `sellerId = user.id`.
   - Observation: In `/api/v1/seller/withdrawals/[id]/cancel/route.ts`, the route invokes `cancelWithdrawal(payload, { withdrawalId, sellerId: user.id })`. In `cancelWithdrawal` (`withdrawal.ts:525-527`), if `existing.seller !== params.sellerId`, an error `'Unauthorized: You can only cancel your own withdrawals'` is thrown.
   - Inference: Multi-tenant data isolation is strictly enforced.

3. **Financial Invariants & Boundary Defense**:
   - Observation: Minimum withdrawal limit is 50,000 VND and maximum is 50,000,000 VND. This is validated on the client (`WithdrawalModal.tsx`), on the service layer (`withdrawal.ts:110-116`), and on the PostgreSQL schema (`CHECK (amount >= 50000)` and `CHECK (amount <= 50000000)`).
   - Observation: Overdraft protection uses an anti-race mutex lock per seller (`withSellerLock`), verifying `amount <= balance.availableBalance` inside the lock.
   - Inference: Double-spend and negative/overflow balance vulnerabilities are prevented.

4. **Terminal State Immutability**:
   - Observation: All lifecycle state transitions (`reviewWithdrawal`, `approveWithdrawal`, `processWithdrawal`, `finalizeWithdrawalPaid`, `rejectWithdrawal`, `cancelWithdrawal`) explicitly check `terminalStatuses = ['PAID', 'REJECTED', 'CANCELLED', 'FAILED']` and reject any modification attempts on terminal records.
   - Inference: Financial records are append-only and terminal states are immutable.

5. **Integrity & Authenticity of Work**:
   - Observation: No dummy mocks, hardcoded test results, facade services, or bypassed validation were found in any delivered source files.
   - Observation: The tests in `m5-seller-dashboard-finance.int.spec.ts` interact with real database entities and verify legitimate success and rejection paths.

---

## 3. Caveats

- **Vitest Environment Realm**: As noted in worker handoff, Vitest tests for route handlers simulate sessions using `vi.spyOn(payload, 'auth')` to avoid `jose@5` Uint8Array cross-realm issues in jsdom. In live Next.js execution, standard HTTP cookies (`payload-token`) are processed natively by Payload CMS.
- No other caveats.

---

## 4. Conclusion

**Verdict: APPROVE**

The implementation of Phase 6 Milestone 5 delivered by `p6_m5_worker_1` fulfills all requirements specified in `ORIGINAL_REQUEST.md`, `PROJECT.md`, and ADR 0009. The seller dashboard and finance admin operations consoles are functional, responsive, and secure. All REST endpoints enforce strict authentication, role-based authorization, and data isolation. All 169 integration tests pass with zero regressions, and TypeScript and ESLint checks pass cleanly with zero errors.

---

## 5. Verification Method

To independently reproduce and verify this review, execute the following commands sequentially from `/home/trung/Documents/2026/project/test-v6/web`:

```bash
# 1. TypeScript compilation check
pnpm tsc --noEmit

# 2. ESLint code standard check
pnpm lint

# 3. Milestone 5 & E2E suite
pnpm vitest run tests/int/seller-revenue-e2e.int.spec.ts tests/int/m5-seller-dashboard-finance.int.spec.ts

# 4. Milestone 2, 3, 4 regression suites
pnpm vitest run tests/int/seller-earnings.int.spec.ts tests/int/commission-config-error.int.spec.ts tests/int/seller-withdrawals.int.spec.ts tests/int/refund-ledger.int.spec.ts

# 5. Core platform regression suites
pnpm vitest run tests/int/purchase-workflow.int.spec.ts tests/int/purchase-invariants.int.spec.ts tests/int/m1-schema-stress.int.spec.ts tests/int/m1-access-control.int.spec.ts
```

All commands must exit with code 0 and 100% test pass rate.
