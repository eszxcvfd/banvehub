# Milestone 5 Handoff Report: Seller Dashboard, Finance Admin Operations & Seller Earnings API

**Agent**: `p6_m5_worker_1`  
**Milestone**: Phase 6 Milestone 5 (Seller Dashboard & Finance Admin Operations)  
**Parent Conversation ID**: `b96b7657-610e-4105-89ae-923e3ac1b237`  
**Date**: 2026-09-16  

---

## 1. Observation

### Codebase & Files Inspected
- Prior milestone implementations in `web/src/services/earnings.ts` (`getSellerBalance`, `releaseMaturedEarnings`), `web/src/services/withdrawal.ts` (`requestWithdrawal`, `reviewWithdrawal`, `approveWithdrawal`, `processWithdrawal`, `finalizeWithdrawalPaid`, `rejectWithdrawal`, `cancelWithdrawal`), and `web/src/services/refund.ts` (`processRefund`).
- REST API routes existing: `web/src/app/api/v1/seller/withdrawals/route.ts`, `web/src/app/api/v1/admin/withdrawals/route.ts`, `web/src/app/api/v1/admin/withdrawals/[id]/approve/route.ts`, `web/src/app/api/v1/admin/withdrawals/[id]/reject/route.ts`, `web/src/app/api/v1/admin/refunds/route.ts`.
- End-to-end integration test suite `web/tests/int/seller-revenue-e2e.int.spec.ts` line 672 checking `GET /api/v1/seller/earnings`. Initial run failed on line 674 with:
  ```
  FAIL  tests/int/seller-revenue-e2e.int.spec.ts > Tier 1: REST API Route Handler Integration - GET /api/v1/seller/earnings
  Error: M5 pending: GET /api/v1/seller/earnings route handler not yet implemented
  ```

### Files Created & Modified
1. `web/src/app/api/v1/seller/earnings/route.ts` (CREATED):
   - Authenticates caller via Payload session headers (`payload.auth({ headers })`).
   - Returns HTTP 401 `{ error: 'Unauthorized' }` if unauthenticated.
   - Enforces `checkRole(['seller', 'admin'], user)`, returning HTTP 403 `{ error: 'Forbidden' }` if unauthorized.
   - Supports `sellerId` query parameter override for `admin` users; defaults to `user.id`.
   - Fetches balance summary via `getSellerBalance(payload, sellerId)`.
   - Queries `seller_earnings` collection with `page`, `limit` (max 100), and optional `status` filter.
   - Returns structured JSON `{ success: true, data: { summary, earnings, totalDocs, totalPages, page, limit } }`.
2. `web/src/app/api/v1/seller/withdrawals/[id]/cancel/route.ts` (CREATED):
   - Allows authenticated seller to cancel an in-flight withdrawal (`REQUESTED` or `UNDER_REVIEW`) and automatically restores reserved funds to available balance.
3. `web/src/app/api/v1/admin/withdrawals/[id]/review/route.ts` (CREATED):
   - Role-guarded (`admin`, `financeAdmin`) endpoint moving withdrawal status `REQUESTED -> UNDER_REVIEW`.
4. `web/src/app/api/v1/admin/withdrawals/[id]/process/route.ts` (CREATED):
   - Role-guarded (`admin`, `financeAdmin`) endpoint moving withdrawal status `APPROVED -> PROCESSING`.
5. `web/src/app/api/v1/admin/withdrawals/[id]/finalize/route.ts` (CREATED):
   - Role-guarded (`admin`, `financeAdmin`) endpoint moving withdrawal status `PROCESSING -> PAID` with `paidAt` timestamp.
6. `web/src/app/(app)/seller/WithdrawalModal.tsx` (CREATED):
   - Client component for withdrawal requests.
   - Validates bank details (`bankName`, `accountNumber`, `accountHolderName`) and amount (`50,000 <= amount <= 50,000,000` VND and `amount <= availableBalance`).
   - Submits `POST /api/v1/seller/withdrawals` with loading state, error banner, and success notification.
7. `web/src/app/(app)/seller/WithdrawalHistoryTable.tsx` (CREATED):
   - Client component displaying withdrawal history with status badges (`REQUESTED`, `UNDER_REVIEW`, `APPROVED`, `PROCESSING`, `PAID`, `REJECTED`, `CANCELLED`).
   - Includes "Hủy" (Cancel) button for `REQUESTED` and `UNDER_REVIEW` rows, calling `/api/v1/seller/withdrawals/[id]/cancel` and refreshing page state.
8. `web/src/app/(app)/seller/page.tsx` (UPDATED):
   - Loads financial metrics using `getSellerBalance(payload, user.id)`.
   - Displays 5 Financial KPI cards:
     - Số dư khả dụng (Available Balance, VND) with active "Yêu cầu rút tiền" modal trigger button.
     - Tạm giữ 7 ngày (Pending Hold, VND).
     - Đang xử lý rút (Reserved Balance in Withdrawals, VND).
     - Tổng tiền đã rút (Total Withdrawn, VND).
     - Tổng thu nhập tích lũy (All-Time Earned, VND).
   - Renders Withdrawal / Payout History Table via `WithdrawalHistoryTable`.
   - Aggregates per-product earnings breakdown from `seller_earnings` (sales count, gross sales, platform fee, net seller amount).
   - Retains existing product catalog metrics and moderation status table.
9. `web/src/app/(app)/finance/page.tsx` (CREATED):
   - Server page guarded by `checkRole(['admin', 'financeAdmin'], user)`; redirects unauthorized requests to `/login?warning=...`.
   - Displays operational KPI banner (Pending Withdrawals count & amount, Total Paid amount, Total Refunds amount).
   - Fetches recent withdrawals and refunds and mounts `FinanceOperations`.
10. `web/src/app/(app)/finance/FinanceOperations.tsx` (CREATED):
    - Multi-tab operational portal:
      - Tab 1: Withdrawal Queue with status filters (`ALL`, `REQUESTED`, `UNDER_REVIEW`, `APPROVED`, `PROCESSING`, `PAID`, `REJECTED`, `CANCELLED`), seller details, bank info, and lifecycle actions:
        - "Tiếp nhận thẩm định" (Review)
        - "Phê duyệt" (Approve) with optional notes modal
        - "Từ chối" (Reject) with required reason modal (releasing reserved balance)
        - "Đang chuyển khoản" (Process)
        - "Đã hoàn tất thanh toán" (Finalize Paid)
      - Tab 2: Refunds & Reversals compensating ledger table (`REF-...`, order, buyer refund, platform fee refunded, seller amount reversed, reason, processed by, date) and "Thực hiện hoàn tiền bồi hoàn" modal submitting to `POST /api/v1/admin/refunds`.
11. `web/tests/int/m5-seller-dashboard-finance.int.spec.ts` (CREATED):
    - 10 integration tests verifying authentication, RBAC, query parameters, withdrawal cancellation, and admin lifecycle transitions.
12. `docs/plans/active/phase-6-seller-revenue.md` (UPDATED):
    - Milestone 5 status updated to `CLOSED / PASSED (2026-09-16)` and all 8 checklist tasks marked complete.

---

## 2. Logic Chain

1. **REST API Route Fulfillment**:
   - `tests/int/seller-revenue-e2e.int.spec.ts:672-683` asserts that calling `GET /api/v1/seller/earnings` with an unauthenticated request yields status 401.
   - Implementing `web/src/app/api/v1/seller/earnings/route.ts` with `getAuthContext` extracting session via `payload.auth({ headers })` directly satisfies line 682 (`expect(unauthRes.status).toBe(401)`).
   - Validating `checkRole(['seller', 'admin'], user)` guarantees that buyers and moderators receive 403 Forbidden.
   - Querying `getSellerBalance(payload, sellerId)` guarantees accurate balance metrics (`totalEarned`, `pendingBalance`, `availableBalance`, `reservedBalance`, `withdrawnTotal`) consistent with the business logic in `earnings.ts`.
   - Querying `seller_earnings` with pagination and optional status filter provides complete itemized accounting.

2. **Seller Dashboard Architecture**:
   - The seller requires real-time insight into both sales performance and cash availability.
   - Calling `getSellerBalance(payload, user.id)` provides the exact numbers for the 5 KPI cards.
   - Incorporating `WithdrawalModal` directly on the Available Balance card and top banner allows instantaneous action if `availableBalance >= 50000`.
   - Real-time client-side validation prevents submitting out-of-bounds amounts (`< 50,000` or `> 50,000,000` or `> availableBalance`) before hitting the server.
   - For pending requests (`REQUESTED`, `UNDER_REVIEW`), allowing the seller to cancel via `/api/v1/seller/withdrawals/[id]/cancel` immediately releases the reserved funds back into `availableBalance`.
   - Aggregating non-reversed `seller_earnings` by `product` produces an accurate per-product P&L breakdown (sales count, gross volume, platform fees deducted, net earnings).

3. **Finance Admin Operations Architecture**:
   - Finance Admins and Super Admins require a centralized console to oversee cash outflows and reversals.
   - The `/finance` page checks `checkRole(['admin', 'financeAdmin'], user)` at the server boundary before rendering any data.
   - The queue provides discrete state machine actions matching ADR 0009 and the withdrawal state machine:
     - `REQUESTED -> UNDER_REVIEW` via `POST /api/v1/admin/withdrawals/[id]/review`
     - `REQUESTED | UNDER_REVIEW -> APPROVED` via `POST /api/v1/admin/withdrawals/[id]/approve`
     - `APPROVED -> PROCESSING` via `POST /api/v1/admin/withdrawals/[id]/process`
     - `PROCESSING | APPROVED -> PAID` via `POST /api/v1/admin/withdrawals/[id]/finalize`
     - Any non-terminal status -> `REJECTED` via `POST /api/v1/admin/withdrawals/[id]/reject` with required reason.
   - The refund portal provides access to the immutable compensating ledger and permits issuing refunds with optional entitlement revocation via `POST /api/v1/admin/refunds`.

---

## 3. Caveats

- **Test Environment & Auth**: In Vitest with `environment: 'jsdom'`, `payload.login` encounters a Uint8Array cross-realm mismatch in `jose@5`. In unit/integration tests of Next.js Route handlers, auth was tested with unauthenticated HTTP requests (expecting 401) and authenticated requests using `vi.spyOn(payload, 'auth')` (expecting 200 / 403). In production Next.js runtime, standard HTTP cookies (`payload-token`) are processed natively by Payload CMS.
- **Large Dataset Pagination**: In `page.tsx` for `/seller` and `/finance`, queries use limits of 20 to 100 records for immediate display. For very high volume sellers (>1,000 transactions), REST APIs with pagination parameters should be used for lazy-loading.

---

## 4. Conclusion

Milestone 5 is 100% complete and fully verified.
- REST API `GET /api/v1/seller/earnings` is fully operational with authentication, authorization, balance summary, pagination, and status filters.
- Seller Dashboard UI (`/seller`) provides 5 financial KPI cards, withdrawal modal with client validation, withdrawal history table with cancellation, and per-product earnings breakdown.
- Finance Admin Operations UI (`/finance`) provides withdrawal review, approval, processing, payout finalization, rejection, and compensating refund ledger integration.
- All 169 test cases across all test suites pass with 0 failures, TypeScript compiles with 0 errors, and ESLint passes with 0 errors.

---

## 5. Verification Method

To independently verify this milestone, run the following sequential commands in `/home/trung/Documents/2026/project/test-v6/web`:

### 1. Milestone 5 & E2E Test Suite
```bash
pnpm vitest run tests/int/seller-revenue-e2e.int.spec.ts tests/int/m5-seller-dashboard-finance.int.spec.ts
```
**Expected Output**: 21 passed / 21 total tests (100%).

### 2. Milestone 2, 3, 4 Suites
```bash
pnpm vitest run tests/int/seller-earnings.int.spec.ts tests/int/commission-config-error.int.spec.ts tests/int/seller-withdrawals.int.spec.ts tests/int/refund-ledger.int.spec.ts
```
**Expected Output**: 51 passed / 51 total tests (100%).

### 3. Core Regression Suites
```bash
pnpm vitest run tests/int/purchase-workflow.int.spec.ts tests/int/purchase-invariants.int.spec.ts tests/int/m1-schema-stress.int.spec.ts tests/int/m1-access-control.int.spec.ts
```
**Expected Output**: 97 passed / 97 total tests (100%).

### 4. TypeScript Typecheck
```bash
pnpm tsc --noEmit
```
**Expected Output**: Exits with code 0 (0 errors).

### 5. ESLint Linter
```bash
pnpm lint
```
**Expected Output**: Exits with code 0 (0 errors).
