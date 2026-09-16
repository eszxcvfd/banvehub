# Handoff Report: Phase 6 (Seller Revenue) Backend Architecture & Design

## 1. Observation

Direct observations from codebase inspection, schema analysis, and integration verification:

### 1.1 Existing Collections & Schema Status
- **`web/src/payload.config.ts`** (lines 56-76): Registers 19 collections (`Users`, `Pages`, `Categories`, `Media`, `SoftwareTypes`, `Tags`, `ProductPreviews`, `ProductFiles`, `Products`, `SellerProfiles`, `Wallets`, `WalletLedger`, `PaymentIntents`, `PaymentTransactions`, `PaymentWebhookEvents`, `Orders`, `OrderItems`, `Entitlements`, `DownloadEvents`). Uses `postgresAdapter` with `push: false` (line 83), requiring strict versioned migrations for any schema alteration.
- **`web/src/collections/Orders/index.ts`**:
  - `status` field (lines 92-106) currently has options: `PENDING`, `COMPLETED`, `CANCELLED`. It lacks `REFUNDED`.
  - Direct writes (`create`, `update`, `delete`) are denied for all principals via `orderAccess.ts` (lines 30-32).
  - Read access allows `admin`, `financeAdmin`, or buyer (`orderAccess.ts:10-24`).
- **`web/src/collections/OrderItems/index.ts`**:
  - Already contains snapshot fields: `salePrice`, `platformFee` (lines 85-96), `sellerAmount` (lines 98-109), `tax`, and `policyVersion`.
  - Protected by hooks `validateAntiSelfPurchase` (line 35) and `preventOrderItemMutation` (line 36) implementing BR-04 and BR-07.
- **`web/src/collections/Users/index.ts`** (lines 35-69): Already contains roles: `admin`, `buyer`, `seller`, `moderator`, `financeAdmin`.
- **`web/src/collections/SellerProfiles.ts`**:
  - Contains `payoutInfo` group (lines 57-76) with `bankName`, `accountNumber`, `accountHolderName`.
  - Currently has `totalSales` and `rating`, but lacks `commissionRate` override field.
- **`web/src/collections/Wallets.ts` & `WalletLedger.ts`**:
  - `Wallets` (lines 44-70) tracks integer VND `balance` and `pendingBalance`. Direct writes are denied for all principals (`canEditMoney.ts`).
  - `WalletLedger` (lines 48-62) enum `enum_wallet_ledger_type` already defines: `topup`, `purchase`, `refund`, `adjustment`, `withdrawal`, `payout`.
  - `referenceType` defines: `payment_intent`, `order`, `adjustment`, `withdrawal`, `system`.

### 1.2 Purchase & Wallet Services (`purchase.ts` and `wallet.ts`)
- **`web/src/services/purchase.ts`**:
  - Executes purchase inside an atomic database transaction using Payload transaction utilities:
    `const shouldCommit = await initTransaction(effectiveReq)` (line 130), with `commitTransaction` (line 257) and `killTransaction` (line 270) on error.
  - In lines 223-237: `order_items` line items are currently created with hard-coded values:
    `platformFee: 0`, `sellerAmount: pricePaid`.
  - No `seller_earnings` record is created yet upon order completion.
- **`web/src/services/wallet.ts`**:
  - Lines 207-234: `debitWallet` retrieves the Drizzle session instance from `(payload.db as any).sessions[txId]?.db` when inside `req.transactionID`.
  - Implements BR-01 atomic conditional update:
    `UPDATE "wallets" SET "balance" = "balance" - ${amount}, "updated_at" = NOW() WHERE "id" = ${wallet.id} AND "balance" >= ${amount} RETURNING "id", "balance";`
  - Throws typed `InsufficientFundsError` if affected rows is 0.
  - Generates append-only `wallet_ledger` row inside the transaction.

### 1.3 Migrations & Postgres Invariants
- **`web/src/migrations/`**:
  - Batches 1 to 6 applied cleanly (verified via `pnpm payload migrate:status`):
    - Batch 1: `20260915_020514_initial`
    - Batch 2: `20260915_023701_user_roles_from_plan_5`
    - Batch 3: `20260915_033625_phase2_digital_catalog`
    - Batch 4: `20260915_062953_phase3_seller_moderation`
    - Batch 5: `20260915_064708_phase4_payment_wallet` (triggers: `forbid_ledger_mutation`, `forbid_ledger_truncate`, `forbid_wallet_delete`, `forbid_wallet_truncate`, `CHECK (balance >= 0)`)
    - Batch 6: `20260915_071500_phase5_purchase_download` (trigger: `enforce_br04_seller_anti_self_purchase`)
  - Batch 7 is needed for Phase 6 to create `seller_earnings`, `withdrawals`, `withdrawal_events`, `refunds`, and alter `enum_orders_status`.

### 1.4 API Surface in `web/src/app/api/`
- Standard pattern across routes:
  - Auth via `payload.auth({ headers: await getHeaders() })`.
  - Role verification via `checkRole(['admin', 'financeAdmin', 'seller'], user)`.
  - Proper HTTP error mapping (400 for bad parameters, 401 for unauthenticated, 403 for unauthorized role, 404 for not found, 409 for conflicts, 500 for unhandled exceptions).
  - Business operations delegated to service layer functions rather than executing raw Payload CRUD directly in route handlers.

---

## 2. Logic Chain

### 2.1 Schema Design for Phase 6 Entities
1. **`seller_earnings`**:
   - Must capture immutable financial snapshot of earned revenue from an `order_item`.
   - Fields:
     - `seller` (rel: `users`, required, indexed)
     - `order` (rel: `orders`, required, indexed)
     - `orderItem` (rel: `order_items`, required, unique/indexed)
     - `product` (rel: `products`, required)
     - `salePrice` (number VND, snapshot)
     - `platformFee` (number VND, snapshot)
     - `sellerAmount` (number VND, snapshot)
     - `commissionRate` (number, snapshot rate applied, e.g. 0.30)
     - `currency` (select 'VND', default 'VND')
     - `status` (enum: `PENDING`, `AVAILABLE`, `REVERSED`, `PAID`)
     - `holdPeriodDays` (number, default 7 per FR-31)
     - `availableAt` (date, computed at creation as `createdAt + holdPeriodDays`)
     - `paidAt` (date, populated when withdrawal is paid)
     - `reversedAt` (date, populated if refunded)
     - `notes` (text)
   - DB constraints: `CHECK (seller_amount >= 0)`, `CHECK (platform_fee >= 0)`, `CHECK (sale_price >= 0)`.
   - Access control: Direct writes denied (`canEditMoney`). Read access allowed for `admin`, `financeAdmin`, or if `seller.id === user.id`.

2. **`withdrawals`**:
   - Represents a seller's payout request to an external bank account (FR-32).
   - Fields:
     - `code` (text, unique, indexed, e.g. `WTH-YYYYMMDD-XXXXX`)
     - `seller` (rel: `users`, required, indexed)
     - `amount` (number VND, required, `min: 50000`, `max: 50000000`)
     - `currency` (select 'VND', default 'VND')
     - `status` (enum: `REQUESTED`, `UNDER_REVIEW`, `APPROVED`, `PROCESSING`, `PAID`, `REJECTED`, `CANCELLED`, `FAILED`)
     - `bankInfo` (group):
       - `bankName` (text, required)
       - `accountNumber` (text, required)
       - `accountHolderName` (text, required)
     - `requestedAt` (date, default now)
     - `reviewedAt` (date)
     - `reviewedBy` (rel: `users`, Finance Admin or Super Admin)
     - `paidAt` (date)
     - `rejectionReason` (text)
     - `failureReason` (text)
     - `notes` (text)
   - DB constraints: `CHECK (amount > 0)`.
   - Access control: Direct writes denied. Read access allowed for `admin`, `financeAdmin`, or `seller.id === user.id`.

3. **`withdrawal_events`**:
   - Append-only audit trail recording every state transition of a withdrawal (FR-32).
   - Fields:
     - `withdrawal` (rel: `withdrawals`, required, indexed)
     - `fromStatus` (text, required)
     - `toStatus` (text, required)
     - `actor` (rel: `users`, required)
     - `actorRole` (text, required, e.g. `seller`, `financeAdmin`, `admin`, `system`)
     - `reason` (text)
     - `metadata` (json)
   - DB constraints: Refuse `UPDATE`, `DELETE`, `TRUNCATE` via PostgreSQL triggers (Decision 0002).

4. **`refunds`**:
   - Represents compensating reversal records for orders (FLOW-U15, BR-03).
   - Fields:
     - `code` (text, unique, indexed, e.g. `REF-YYYYMMDD-XXXXX`)
     - `order` (rel: `orders`, required, indexed)
     - `orderItem` (rel: `order_items`, optional/indexed)
     - `buyer` (rel: `users`, required, indexed)
     - `seller` (rel: `users`, required, indexed)
     - `amount` (number VND, required)
     - `reason` (text, required)
     - `status` (enum: `COMPLETED`, `FAILED`)
     - `processedBy` (rel: `users`, required, Finance Admin or Super Admin)
     - `sellerEarning` (rel: `seller_earnings`)
     - `buyerLedgerEntry` (rel: `wallet_ledger`)
     - `entitlementRevoked` (checkbox, default true)
   - DB constraints: `CHECK (amount > 0)`.
   - Access control: Direct writes denied. Read allowed for `admin`, `financeAdmin`, buyer, or seller.

5. **`orders` & `users` / `seller_profiles` modifications**:
   - Alter `enum_orders_status` to add `REFUNDED`.
   - Add `commissionRate` (number, min 0, max 1, e.g. 0.25) to `SellerProfiles` to support per-seller override.

### 2.2 Commission Calculation Hierarchy (PLAN.md §6.3, BR-07)
- Resolution order:
  1. Campaign override rate (if campaign code / discount active on product/order).
  2. Seller profile override rate (`sellerProfile.commissionRate` if specified and > 0).
  3. System default rate (`DEFAULT_COMMISSION_RATE = 0.30`, 30% per PLAN.md §6.3, overridable via env `PLATFORM_COMMISSION_RATE`).
- Computation:
  - `platformFee = Math.round(salePrice * commissionRate)`
  - `sellerAmount = salePrice - platformFee`
  - Free product (`salePrice === 0`): `platformFee = 0`, `sellerAmount = 0`.
- Snapshot immutability:
  - Both `platformFee` and `sellerAmount` are stored on `order_items` snapshot and `seller_earnings` row. Future changes to commission configuration never affect historical records (BR-07).

### 2.3 Hold Period Lifecycle & State Transitions (FR-31)
- When purchase completes:
  `seller_earnings.status = 'PENDING'`, `availableAt = new Date(Date.now() + holdPeriodDays * 86400000).toISOString()`.
- Matured transitions (`PENDING -> AVAILABLE`):
  - Handled via `releaseMaturedEarnings(payload, { sellerId? })`:
    `UPDATE "seller_earnings" SET "status" = 'AVAILABLE', "updated_at" = NOW() WHERE "status" = 'PENDING' AND "available_at" <= NOW()`.
  - Evaluated lazily whenever seller checks dashboard/earnings or requests withdrawal, and callable programmatically or via cron/reconciler.

### 2.4 Concurrency, Locking, and Atomicity

#### A. Atomic Purchase Pipeline
1. `purchaseProduct` initializes transaction (`effectiveReq`).
2. Validates product availability & anti-self-purchase (BR-04).
3. If commercial: `debitWallet` executes conditional update `UPDATE "wallets" SET "balance" = "balance" - ... WHERE "balance" >= ...` and creates debit row in `wallet_ledger`.
4. Creates `orders` document (status `COMPLETED`).
5. Resolves commission rate and calculates `platformFee` and `sellerAmount`.
6. Creates `order_items` document with populated snapshot fields.
7. Creates `seller_earnings` document with status `PENDING`.
8. Creates `entitlements` document with status `active`.
9. Commits transaction. (All 6 artifacts commit or roll back together atomically).

#### B. Atomic Withdrawal Request & Balance Reservation
1. Seller invokes `POST /api/v1/seller/withdrawals` with `{ amount, bankName, accountNumber, accountHolderName }`.
2. Starts database transaction.
3. Acquires PostgreSQL lock on seller:
   `SELECT id FROM users WHERE id = :sellerId FOR UPDATE;`
   (or `SELECT pg_advisory_xact_lock(:sellerId);`).
4. Evaluates withdrawable balance:
   - Total available: `SELECT COALESCE(SUM(seller_amount), 0) FROM seller_earnings WHERE seller_id = :sellerId AND status = 'AVAILABLE'`.
   - Total reserved: `SELECT COALESCE(SUM(amount), 0) FROM withdrawals WHERE seller_id = :sellerId AND status IN ('REQUESTED', 'UNDER_REVIEW', 'APPROVED', 'PROCESSING')`.
   - Withdrawable balance = `total_available - total_reserved`.
5. If `withdrawable_balance < amount`, throws typed `InsufficientWithdrawableBalanceError` and aborts transaction.
6. If within bounds (`50000 <= amount <= 50000000`), inserts `withdrawals` row with status `'REQUESTED'`.
7. Inserts `withdrawal_events` audit row (`from: 'NONE', to: 'REQUESTED'`).
8. Commits transaction.
- **Race condition prevented**: Any simultaneous withdrawal requests for the same seller block at the row/advisory lock; the second request will re-compute reserved balance, discover insufficient funds, and fail cleanly.

#### C. Withdrawal Approval / Rejection Lifecycle
1. Finance Admin or Admin triggers approval/rejection via `reviewWithdrawal`:
   - Role verified: `checkRole(['admin', 'financeAdmin'], user)` required.
2. Starts transaction, locks withdrawal row: `SELECT * FROM withdrawals WHERE id = :withdrawalId FOR UPDATE`.
3. If `action === 'reject'`:
   - Updates status to `REJECTED`, sets `rejectionReason`.
   - Logs `withdrawal_events` (`from: currentStatus, to: 'REJECTED'`).
   - **Reservation Release**: Because `total_reserved` excludes `REJECTED`, the seller's available balance is immediately released.
4. If `action === 'approve'`:
   - Updates status to `APPROVED`. Logs `withdrawal_events`.
5. If `action === 'payout'` (marking paid):
   - Updates status to `PAID`, sets `paidAt = now()`.
   - Marks corresponding matured `seller_earnings` as `PAID` (FIFO matching or direct allocation).
   - Logs `withdrawal_events`.
6. Commits transaction.

#### D. Atomic Refund with Compensating Ledger Entries (FLOW-U15, BR-03)
1. Triggered by Finance Admin / Admin via `processRefund`.
2. Starts database transaction.
3. Locks order row: `SELECT * FROM orders WHERE id = :orderId FOR UPDATE`.
4. Asserts order status is `COMPLETED`. (If already `REFUNDED`, reject).
5. Compensating credit to buyer wallet:
   - Invokes `creditWallet(payload, { userId: buyerId, amount: refundAmount, type: 'refund', referenceType: 'order', referenceId: order.code, description: 'Hoàn tiền đơn hàng...', req: effectiveReq })`.
   - Adds credit row to `wallet_ledger` (immutable append-only; original purchase debit row is untouched).
6. Reverses seller earning:
   - Finds `seller_earnings` for this order.
   - Updates status: `'PENDING'` or `'AVAILABLE'` -> `'REVERSED'`, sets `reversedAt = now()`.
7. Updates order status:
   - `orders.status = 'REFUNDED'`.
8. Revokes buyer entitlement:
   - `entitlements.status = 'revoked'`, `revokedAt = now()`, `reason = 'Thu hồi do hoàn tiền'`.
9. Inserts `refunds` audit document linking order, buyer, seller, ledger entry, and earning.
10. Commits transaction.

---

## 3. Caveats

1. **Database-Level Enums in PostgreSQL**:
   Altering existing `enum_orders_status` to add `'REFUNDED'` requires:
   `ALTER TYPE "public"."enum_orders_status" ADD VALUE IF NOT EXISTS 'REFUNDED';`.
   PostgreSQL enforces that `ALTER TYPE ... ADD VALUE` cannot run inside certain multi-statement transaction blocks in older PG versions; in PostgreSQL 12+, it is safe if committed cleanly.
2. **Payload Local API Hook Bypass**:
   As established in Decision 0002, money operations run through server services using `overrideAccess: true`. Therefore, validation hooks on collections are bypassed; all business logic invariants (balance checks, commission math, status guards) must be strictly enforced in the service layer itself.
3. **Withdrawal Limits**:
   Default limits suggested: Minimum 50,000 VND, Maximum 50,000,000 VND per withdrawal. These should be configurable via constants/environment variables.
4. **Hold Period Duration**:
   Default hold period is 7 days (604,800,000 ms) per FR-31. In integration tests, a configurable option or time-override parameter in `releaseMaturedEarnings` is required to test maturation without waiting real days.

---

## 4. Conclusion

The Phase 6 backend architecture is clear, consistent with existing decisions (0001, 0002, 0004, 0005, 0006), and can be implemented cleanly with zero regressions on existing 347 tests:

1. **Schema & Collections to Add**:
   - `seller_earnings` (`web/src/collections/SellerEarnings.ts`)
   - `withdrawals` (`web/src/collections/Withdrawals.ts`)
   - `withdrawal_events` (`web/src/collections/WithdrawalEvents.ts`)
   - `refunds` (`web/src/collections/Refunds.ts`)
   - Register in `web/src/payload.config.ts`.
   - Update `web/src/collections/Orders/index.ts` to add `'REFUNDED'` status.
   - Update `web/src/collections/SellerProfiles.ts` to add optional `commissionRate`.

2. **Database Migration Batch 7**:
   - Create `web/src/migrations/20260915_XXXXXX_phase6_seller_revenue.ts` and `.json`.
   - Define tables, foreign keys, unique indexes, check constraints (`amount > 0`, `seller_amount >= 0`), and append-only triggers on `withdrawal_events` and `refunds`.
   - Register in `web/src/migrations/index.ts`.

3. **Services to Implement / Update**:
   - `web/src/services/purchase.ts`: Update `purchaseProduct` to calculate commission and create `seller_earnings` in the same transaction.
   - `web/src/services/revenue.ts`: Seller balance queries (`getSellerEarningsSummary`, `releaseMaturedEarnings`).
   - `web/src/services/withdrawal.ts`: `requestWithdrawal`, `reviewWithdrawal` with concurrency row locking.
   - `web/src/services/refund.ts`: `processRefund` implementing FLOW-U15 and BR-03 compensating entries.

4. **API Endpoints to Deliver**:
   - `GET /api/v1/seller/earnings`
   - `POST /api/v1/seller/withdrawals`
   - `GET /api/v1/admin/withdrawals`
   - `POST /api/v1/admin/withdrawals/[id]/approve` (and reject)
   - `POST /api/v1/admin/refunds`

---

## 5. Verification Method

To independently verify this investigation and validate the downstream implementation:

1. **Verify Existing Tests Pass**:
   ```bash
   pnpm --prefix web test:int tests/int/purchase-workflow.int.spec.ts
   pnpm --prefix web test:int tests/int/wallet-ledger-invariants.int.spec.ts
   ```
2. **Verify Database Migrations Status**:
   ```bash
   pnpm --prefix web payload migrate:status
   ```
   Must display Batches 1 to 6 as "Yes".
3. **Verify Codebase Invariants via File Inspection**:
   - `view_file` on `web/src/collections/Orders/index.ts` lines 90-110: verify `status` options.
   - `view_file` on `web/src/services/purchase.ts` lines 220-240: verify `platformFee: 0` and missing `seller_earnings` creation.
   - `view_file` on `web/src/services/wallet.ts` lines 205-235: verify `debitWallet` Drizzle session transaction extraction and conditional SQL update.
   - `view_file` on `docs/decisions/0002-money-write-layer.md`: verify one write path and append-only ledger rules.
4. **Downstream Invalidation Conditions**:
   - Any design allowing direct REST/CRUD mutation on `seller_earnings`, `withdrawals`, or `refunds` invalidates Decision 0002.
   - Any withdrawal balance reservation that does not use database row/advisory locking violates BR-01 (concurrency race condition).
   - Any refund design that mutates or deletes existing `wallet_ledger` entries violates BR-03.
