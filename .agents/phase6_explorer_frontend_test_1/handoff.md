# Phase 6: Seller Revenue — Frontend Dashboard, Admin Operations & Test Architecture Handoff Report

**Agent**: `phase6_explorer_frontend_test_1`  
**Date**: 2026-09-15  
**Mission**: Investigate frontend components, seller dashboard, admin operations, and test infrastructure for Phase 6 (Seller Revenue) and design a comprehensive 4-Tier test strategy.

---

## 1. Observation

### 1.1 Existing Frontend & Seller Components
1. **Current Seller Dashboard (`web/src/app/(app)/seller/page.tsx`)**:
   - Lines 23–26: Role enforcement redirects non-sellers/admins to `/seller/register` via `checkRole(['seller', 'admin'], user)`.
   - Lines 57–62: KPI cards calculate only product moderation metrics: `totalCount`, `pendingCount`, `approvedCount`, `changesCount`.
   - Lines 129–228: Product listing table shows product title, file format, unit price (`product.price`), moderation status, moderation notes, and a link to view the live product.
   - **Absence**: There are **no financial revenue metrics** (total earnings, pending earnings, available balance, completed withdrawals), **no withdrawal submission form**, **no withdrawal history table**, and **no per-product earnings breakdown table**.
2. **Seller Profile Payout Data (`web/src/collections/SellerProfiles.ts`)**:
   - Lines 57–77: Payout account group `payoutInfo` is already defined in the schema with fields:
     - `bankName` (Text)
     - `accountNumber` (Text)
     - `accountHolderName` (Text)
   - Status options (lines 97–102): `pending`, `active`, `suspended`, `rejected`.
3. **Reference Component Patterns**:
   - Buyer Wallet UI (`web/src/app/(app)/wallet/page.tsx` and `web/src/components/wallet/WalletClient.tsx`): Server component handles `payload.auth`, `getOrCreateWallet`, and initial ledger query, passing props to client component `WalletClient.tsx`.
   - Moderation Queue UI (`web/src/app/(app)/moderation/page.tsx` and `web/src/app/api/moderation/action/route.ts`): Server component enforces role `checkRole(['admin', 'moderator'], user)`, loads pending submissions via `payload.find`, and renders `ModerationQueue.tsx`, which submits to `POST /api/moderation/action`.
4. **Current Finance Admin UI**:
   - No dedicated `/finance` or `/admin/finance` frontend page exists currently in `web/src/app/(app)/`.
   - Payload Admin exists at `web/src/app/(payload)/admin` and auto-generates CRUD for registered collections, but operational workflows (one-click Approve/Reject withdrawal, Initiate Refund with reason) require dedicated API routes and an operations interface.
5. **Purchase Service Commission Gap (`web/src/services/purchase.ts`)**:
   - Lines 223–237: `order_items` record is created with:
     ```ts
     salePrice: pricePaid,
     platformFee: 0,
     sellerAmount: pricePaid,
     tax: 0,
     policyVersion: 'v1',
     ```
   - Platform fee is hardcoded to 0; no `seller_earnings` record is created.

### 1.2 Test Infrastructure & Performance
1. **Existing Test Suite Baseline**:
   - Executed `rtk pnpm --prefix web test:int` (Vitest run):
     - **Test Files**: 22 passed out of 22.
     - **Tests**: 347 passed out of 347 (100% pass rate).
     - **Duration**: 50.18s total execution time.
   - Vitest config (`web/vitest.config.mts`):
     - `environment: 'jsdom'`
     - `fileParallelism: false` (serial execution to guarantee database integrity across runs).
     - `include: ['tests/int/**/*.int.spec.ts']`.
2. **User Roles and RBAC in Tests**:
   - `web/src/collections/Users/index.ts` lines 47–68 defines role enum:
     - `'admin'` (Super Admin)
     - `'buyer'` (Buyer)
     - `'seller'` (Seller)
     - `'moderator'` (Moderator)
     - `'financeAdmin'` (Finance Admin)
   - RBAC helper: `checkRole(roles, user)` in `web/src/access/utilities.ts`.
   - `web/tests/int/m1-access-control.int.spec.ts` (lines 822–1332) and `web/tests/int/rbac.int.spec.ts` already verify that `financeAdmin` can read all orders, order items, entitlements, and download events, but cannot create products or edit wallet ledger directly.
3. **Database Reset and Isolation**:
   - Tests do not drop database tables between suites; each test suite maintains a local `cleanup` array of created entity IDs (users, products, product_files, orders, entitlements) and deletes them in `afterAll()`.
   - Unique email and slug strings are generated using timestamps and sequences (e.g. `buyer-flow-${timestamp}@kientaohub.local`).

---

## 2. Logic Chain

1. **Frontend Requirements & Architecture**:
   - Requirement R4 states: "Seller dashboard (`/seller`) must display: total earnings, pending earnings, available balance, withdrawal history, and per-product earnings breakdown."
   - Because `web/src/app/(app)/seller/page.tsx` is already a server component loading seller profile and products, it can be extended (or broken into modular client tabs) to query:
     - `seller_earnings` aggregated metrics (total earnings, pending earnings, available balance).
     - `withdrawals` history list for the authenticated seller.
     - Per-product financial roll-up by joining product sales with `order_items` / `seller_earnings`.
   - Withdrawal submission requires a client modal or tab component with inputs for amount, bank selection, account number, and account holder name (pre-filled from `seller_profiles.payoutInfo`). It submits to `POST /api/v1/seller/withdrawals`.
   - For Finance Admin operations (view all withdrawals, approve/reject, initiate refund), following the established pattern of `/moderation` (with server page `/finance` checking role `financeAdmin` or `admin`, rendering `FinanceOperationsClient.tsx`, and calling operational API routes) provides an immediate, user-friendly portal matching the wireframe in PLAN.md §5.5 and §22.

2. **Test Strategy Architecture**:
   - With 347 existing tests running in ~50s, new Phase 6 tests should follow the modular suite pattern:
     - `web/tests/int/seller-earnings.int.spec.ts`: Unit/integration validation of commission calculation, snapshot immutability, `seller_earnings` creation (`PENDING`), and hold period release (`AVAILABLE`).
     - `web/tests/int/seller-withdrawals.int.spec.ts`: Full lifecycle of withdrawal requests (`REQUESTED -> UNDER_REVIEW -> APPROVED -> PROCESSING -> PAID`), balance reservation, limit boundaries, and rejection restoration.
     - `web/tests/int/refund-ledger.int.spec.ts`: Compensating ledger transactions, wallet credit, seller earning reversal, and BR-03 immutability.
     - `web/tests/int/seller-revenue-e2e.int.spec.ts`: Multi-actor end-to-end flows (Buyer + Seller + Finance Admin), concurrency stress, and authorization boundaries.

---

## 3. Caveats

1. **Playwright E2E Environment**: E2E specs in `web/tests/e2e/` require a running Next.js server (`localhost:3000`). For CI/CD and rapid verification, Vitest integration tests in `web/tests/int/` directly mounting the Payload Local API and invoking Next.js route handlers are significantly faster, fully isolated, and test the exact same backend logic and data guarantees.
2. **Commission Configuration Hierarchy**: Plan §6.3 specifies support for site-wide default, per-seller override, and campaign rate. The database model must provide a clean fallback resolution: `Campaign Rate -> Seller Override -> Global Default (e.g. 20%)`.
3. **Database Migrations**: Any schema additions (`seller_earnings`, `withdrawals`, `withdrawal_events`, `refunds`, and any custom fields on `seller_profiles`) must have a corresponding versioned migration in `web/src/migrations/` to preserve PostgreSQL schema parity.

---

## 4. Conclusion & Actionable Design

### 4.1 Frontend Component Architecture

#### A. Seller Dashboard (`/seller`)
- **Top Financial KPI Cards**:
  1. *Số dư khả dụng (Available Balance)*: Ready for withdrawal. Includes a primary CTA button: "Yêu cầu rút tiền" (Request Withdrawal).
  2. *Đang tạm giữ (Pending Earnings)*: Earnings within the hold period (e.g., 7 days). Tooltip explains fraud/refund protection.
  3. *Tổng thu nhập (Lifetime Earnings)*: Gross platform earnings credited to seller.
  4. *Đã thanh toán (Paid Out)*: Total successfully withdrawn to bank account.
- **Tabs Interface**:
  - **Tab 1: Quản lý bản vẽ (Products)**: Existing product catalog & moderation status table.
  - **Tab 2: Doanh thu theo sản phẩm (Product Earnings Breakdown)**:
    - Columns: Product Title, Total Copies Sold, Gross Revenue (VND), Platform Fee (VND), Net Seller Earning (VND).
  - **Tab 3: Lịch sử rút tiền (Withdrawal History)**:
    - Columns: Mã yêu cầu (ID), Ngày tạo, Số tiền rút, Tài khoản nhận (Bank & masked account), Trạng thái (Badge: `REQUESTED`, `APPROVED`, `PAID`, `REJECTED`), Lý do từ chối (nếu có).
- **Withdrawal Modal / Form (`WithdrawalRequestModal.tsx`)**:
  - Input `amount`: Validated against `min_withdrawal` (50,000 VND), `max_withdrawal`, and current `availableBalance`.
  - Input `bankName`: Standard Vietnamese banking dropdown (Vietcombank, MBBank, Techcombank, ACB, VPBank, etc.).
  - Input `accountNumber`: Account number string.
  - Input `accountHolderName`: UPPERCASE account holder name.
  - Checkbox: "Ghi nhớ thông tin thanh toán cho lần sau" (updates `seller_profiles.payoutInfo`).
  - Action: Dispatches `POST /api/v1/seller/withdrawals`.

#### B. Finance Admin Operations (`/finance` or Payload Admin View)
- Accessible only to roles `admin` and `financeAdmin`.
- **KPI Overview**: Pending Withdrawals Count, Total Withdrawn This Month, Pending Refunds Count.
- **Withdrawal Review Queue**:
  - Filter by status (`REQUESTED`, `UNDER_REVIEW`, `APPROVED`, `REJECTED`, `PAID`).
  - Modal / Actions for each request:
    - "Duyệt yêu cầu (Approve)" -> transitions to `APPROVED` / `PROCESSING` / `PAID`.
    - "Từ chối (Reject)" -> requires text `reason`, transitions to `REJECTED`, releases reserved balance.
- **Refund Management Interface**:
  - Input Order ID or Order Item ID.
  - Displays original buyer, seller, amounts, and entitlement status.
  - Action "Xác nhận hoàn tiền (Execute Refund)": calls `POST /api/v1/admin/refunds`, creates compensating ledger entries, updates order status to `REFUNDED`, and revokes entitlement.

---

### 4.2 Comprehensive 4-Tier Test Strategy

```
+-------------------------------------------------------------------------------+
|                        Phase 6 Test Architecture                              |
+-------------------------------------------------------------------------------+
| Tier 1: Feature Coverage      | - Commission calculation (configurable rates) |
|                               | - OrderItem snapshots (salePrice/fee/amount)  |
|                               | - seller_earnings PENDING creation            |
|                               | - Hold period transition PENDING -> AVAILABLE |
|                               | - Withdrawal request & balance reservation    |
|                               | - Withdrawal state machine & approval flow    |
|                               | - Compensating refund ledger entries          |
|                               | - API route auth (financeAdmin, seller, buyer)|
+-------------------------------+-----------------------------------------------+
| Tier 2: Boundary & Corner     | - 0 VND / Free products (zero fee, no earning)|
|         Cases                 | - Min withdrawal limit enforcement (< 50,000) |
|                               | - Max withdrawal limit enforcement            |
|                               | - Exact balance withdrawal (balance = 0)      |
|                               | - Over-withdrawal attempt (amount > balance)  |
|                               | - Zero balance withdrawal rejection           |
|                               | - Invalid bank account / holder formats       |
|                               | - Duplicate refund prevention (idempotent)    |
|                               | - Negative amount injection prevention        |
+-------------------------------+-----------------------------------------------+
| Tier 3: Cross-Feature         | - Purchase -> Refund before hold expires      |
|         Combinations          | - Purchase -> Hold expires -> Refund executed |
|                               | - Purchase -> Hold expires -> Request payout  |
|                               |   -> Reject payout -> Balance restored        |
|                               | - Commission rate altered after order:        |
|                               |   previous order item snapshot preserved      |
|                               | - Partial refund vs Full refund               |
+-------------------------------+-----------------------------------------------+
| Tier 4: Real-World Workflows  | - Complete seller lifecycle: Onboard -> Sale  |
|         & Concurrency         |   -> Hold -> Available -> Payout -> Audit log |
|                               | - Concurrent purchases on seller catalog      |
|                               | - Concurrent withdrawal race condition test   |
|                               | - Audit trail integrity in withdrawal_events  |
|                               | - Ledger balance invariant (BR-03 compliance) |
+-------------------------------------------------------------------------------+
```

#### Detailed Test Suites to Implement:
1. `web/tests/int/seller-earnings.int.spec.ts` (Tiers 1 & 2):
   - Commission calculation formula verification: `platformFee = salePrice * commissionRate`, `sellerAmount = salePrice - platformFee`.
   - Rate resolution hierarchy: Campaign rate overrides Seller rate, which overrides Site default rate.
   - Snapshot fields in `order_items` populated accurately upon purchase.
   - `seller_earnings` record created with status `PENDING` and correct `holdExpiresAt`.
   - Hold period release function converts `PENDING` to `AVAILABLE` when `now >= holdExpiresAt`.
   - Free product purchase ($0) generates $0 fee and $0 seller earning (or is bypassed cleanly).

2. `web/tests/int/seller-withdrawals.int.spec.ts` (Tiers 1, 2, 3):
   - Request withdrawal: reserves balance from seller's available balance immediately.
   - Rejection path: rejected withdrawal returns reserved balance to available balance cleanly.
   - Boundaries:
     - Requesting less than min limit (e.g. 49,999 VND) throws `MIN_WITHDRAWAL_LIMIT`.
     - Requesting more than available balance throws `INSUFFICIENT_SELLER_BALANCE`.
     - Requesting with available balance of 0 throws `INSUFFICIENT_SELLER_BALANCE`.
     - Exact available balance withdrawal succeeds and leaves available balance at 0.
   - Status transitions: `REQUESTED -> UNDER_REVIEW -> APPROVED -> PROCESSING -> PAID`.
   - Rejection transition: `REQUESTED -> REJECTED` with rejection note.

3. `web/tests/int/refund-ledger.int.spec.ts` (Tiers 1, 2, 3):
   - Compensating ledger entry: Refund creates a reversal entry in `wallet_ledger` for buyer (credited).
   - Seller earning reversal: `seller_earnings` is marked as `REFUNDED` or compensating negative earning is logged.
   - Immutability check (BR-03): Verifies that original `wallet_ledger` entries and original `order_items` are NOT updated or deleted.
   - Order status updated to `REFUNDED`.
   - Entitlement status updated to `revoked`.
   - Duplicate refund prevention: Attempting to refund an already refunded order throws `ALREADY_REFUNDED`.

4. `web/tests/int/seller-revenue-e2e.int.spec.ts` (Tiers 3 & 4):
   - RBAC & Endpoint Authorization:
     - `GET /api/v1/seller/earnings`: Seller sees own earnings; Buyer gets 403; Unauthenticated gets 401.
     - `POST /api/v1/seller/withdrawals`: Seller can submit; Buyer gets 403.
     - `GET /api/v1/admin/withdrawals`: Only `financeAdmin` and `admin` can list all withdrawals; Seller gets 403.
     - `POST /api/v1/admin/withdrawals/{id}/approve`: Only `financeAdmin` and `admin` can approve.
     - `POST /api/v1/admin/refunds`: Only `financeAdmin` and `admin` can trigger refunds.
   - Full Lifecycle Workflow:
     - Buyer purchases product for 200,000 VND (10% fee).
     - OrderItem records snapshot: 200,000 VND price, 20,000 VND platform fee, 180,000 VND seller earning.
     - `seller_earnings` created with status `PENDING`, amount 180,000 VND.
     - Seller available balance is 0 VND.
     - Time travel / release trigger executes: `seller_earnings` status becomes `AVAILABLE`.
     - Seller available balance is now 180,000 VND.
     - Seller submits withdrawal for 180,000 VND -> available balance becomes 0 VND, reserved balance becomes 180,000 VND, status `REQUESTED`.
     - Finance Admin approves withdrawal -> status becomes `PAID`.
     - Audit log `withdrawal_events` records full transition chain with actor IDs.
   - Concurrent race condition: 2 simultaneous withdrawal requests each asking for the full balance -> exactly 1 succeeds, 1 fails with insufficient balance.

---

## 5. Verification Method

To independently verify all findings and test execution:

1. **Verify Existing Test Suite Baseline**:
   ```bash
   pnpm --prefix web test:int
   ```
   *Expected outcome*: 22 test files pass, 347 tests pass, duration ~50s.

2. **Verify User Roles and RBAC in Payload**:
   Inspect `web/src/collections/Users/index.ts` lines 65–68:
   - Confirm role enum contains `'financeAdmin'`.
   - Verify `checkRole(['admin', 'financeAdmin'], user)` pattern.

3. **Verify Payout Info Schema**:
   Inspect `web/src/collections/SellerProfiles.ts` lines 57–77:
   - Confirm `payoutInfo` group exists with `bankName`, `accountNumber`, `accountHolderName`.

4. **Verify Purchase Service Snapshot Fields**:
   Inspect `web/src/services/purchase.ts` lines 223–237:
   - Confirm `order_items` creation has snapshot fields `salePrice`, `platformFee`, `sellerAmount`.

5. **Verify New Test Suites (Post-Implementation)**:
   ```bash
   pnpm --prefix web test:int tests/int/seller-earnings.int.spec.ts
   pnpm --prefix web test:int tests/int/seller-withdrawals.int.spec.ts
   pnpm --prefix web test:int tests/int/refund-ledger.int.spec.ts
   pnpm --prefix web test:int tests/int/seller-revenue-e2e.int.spec.ts
   ```
   *Expected outcome*: 100% passing tests with 0 regressions on existing 347 tests (total tests ~380+).
