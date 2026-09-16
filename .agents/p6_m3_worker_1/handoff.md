# Milestone 3 Handoff Report: Withdrawal Request, Balance Reservation & Approval Workflow

## 1. Observation
- Target test suite `web/tests/int/seller-withdrawals.int.spec.ts` imports from `web/src/services/withdrawal.ts` (`requestWithdrawal`, `reviewWithdrawal`, `approveWithdrawal`, `processWithdrawal`, `finalizeWithdrawalPaid`, `rejectWithdrawal`, `cancelWithdrawal`) and `web/src/services/earnings.ts` (`getSellerBalance`).
- The withdrawal service file `web/src/services/withdrawal.ts` was initially missing (`open /home/trung/Documents/2026/project/test-v6/web/src/services/withdrawal.ts: no such file or directory`).
- In `web/src/services/earnings.ts`, `withdrawnTotal` was aggregating from `seller_earnings` with status `'PAID'` rather than summing `amount` from `withdrawals` with status `'PAID'`, and `netAvailable` did not deduct `withdrawnTotal`.
- In `web/src/collections/Withdrawals/hooks/validateWithdrawalInvariants.ts`, `VALID_TRANSITIONS` lacked `APPROVED -> PAID` and `PROCESSING -> REJECTED`.
- In `web/src/services/commission.ts`, `resolveCommissionRate` lacked bounds validation for rates outside `[0, 1]`.
- In `web/tests/int/seller-withdrawals.int.spec.ts`, the pre-M1 author helper `seedAvailableEarning` failed with:
  `SEED AVAILABLE EARNING ERROR: The following fields are invalid: Đơn hàng, Chi tiết mục đơn hàng (1-1), Sản phẩm, Tỷ lệ hoa hồng áp dụng`
  because PostgreSQL schema Batch 7 requires `order_id`, `order_item_id`, `product_id`, and `commission_rate` for all `seller_earnings` records.
- 4 REST API route handlers were required per PROJECT.md and ORIGINAL_REQUEST:
  - `web/src/app/api/v1/seller/withdrawals/route.ts` (GET, POST)
  - `web/src/app/api/v1/admin/withdrawals/route.ts` (GET)
  - `web/src/app/api/v1/admin/withdrawals/[id]/approve/route.ts` (POST)
  - `web/src/app/api/v1/admin/withdrawals/[id]/reject/route.ts` (POST)

## 2. Logic Chain
1. **Withdrawal Service Implementation (`web/src/services/withdrawal.ts`)**:
   - Implemented `requestWithdrawal`: Validates bank details (`bankName`, `accountNumber`, `accountHolderName`) are non-empty after trimming. Validates integer VND amounts within `[50000, 50000000]`. Validates caller possesses `seller` role.
   - Enforced anti-race condition overdraft protection (Threat T7) using an in-memory FIFO promise-chained async mutex keyed by `sellerId` (`withSellerLock`). Under high concurrency, two simultaneous 400,000 VND withdrawal requests against a 500,000 VND balance serialize strictly, resulting in exactly one fulfillment and one rejection with an `insufficient balance` error, ensuring balance is never negative.
   - Implemented state transition services: `reviewWithdrawal` (`REQUESTED -> UNDER_REVIEW`), `approveWithdrawal` (`UNDER_REVIEW/REQUESTED -> APPROVED`), `processWithdrawal` (`APPROVED -> PROCESSING`), `finalizeWithdrawalPaid` (`PROCESSING/APPROVED -> PAID`), `rejectWithdrawal` (`* -> REJECTED` restoring reserved funds), and `cancelWithdrawal` (seller cancels own in-flight request, restoring reserved funds).
   - Each state transition writes an immutable audit record to `withdrawal_events` tracking `withdrawal`, `fromStatus`, `toStatus`, `actor`, `actorRole`, `reason`, `notes`, and `timestamp`.
   - Protected against entity probing: Authorization checks for `financeAdmin` / `admin` roles occur prior to database lookups, preventing information leakage on non-existent records.

2. **Earnings Balance Calculation Correction (`web/src/services/earnings.ts`)**:
   - Updated `getSellerBalance` to query `withdrawals` with status `'PAID'` to derive `withdrawnTotal`.
   - Computed `netAvailable = Math.max(0, grossAvailable - reservedBalance - withdrawnTotal)`.
   - Computed `totalEarned = grossAvailable + pendingBalance`.
   - Added pagination documentation note for queries exceeding 5,000 records.

3. **Commission Bounds Validation (`web/src/services/commission.ts`)**:
   - Added range check `if (rate < 0 || rate > 1) throw new CommissionConfigurationError(...)` across campaign, seller override, and site default tiers.

4. **Schema Transition Hook (`web/src/collections/Withdrawals/hooks/validateWithdrawalInvariants.ts`)**:
   - Updated `VALID_TRANSITIONS` to allow `APPROVED -> PAID` and `PROCESSING -> REJECTED`.

5. **REST API Route Handlers**:
   - `web/src/app/api/v1/seller/withdrawals/route.ts`: Authenticates seller via Payload auth headers; handles GET pagination and POST request withdrawal with 201/400 status codes.
   - `web/src/app/api/v1/admin/withdrawals/route.ts`: Authenticates financeAdmin/admin; handles GET listing with status and seller filtering.
   - `web/src/app/api/v1/admin/withdrawals/[id]/approve/route.ts`: Authenticates financeAdmin/admin; POST invokes `approveWithdrawal` and returns 200.
   - `web/src/app/api/v1/admin/withdrawals/[id]/reject/route.ts`: Authenticates financeAdmin/admin; POST validates reason, invokes `rejectWithdrawal`, and returns 200.

6. **Test Setup Helper Correction (`web/tests/int/seller-withdrawals.int.spec.ts`)**:
   - Updated `seedAvailableEarning` to create the required relational chain (`products`, `orders`, `order_items`) and set `commissionRate: 0.3` before creating `seller_earnings`.
   - Added `orderItems`, `orders`, and `products` tracking to the `cleanup` fixture with reverse-dependency teardown in `afterAll`.

## 3. Caveats
- `seller-revenue-e2e.int.spec.ts` has 5 failures expected for Milestones 4 and 5 (refund services and M5 frontend/admin refund routes). The withdrawal routes and RBAC tests inside `seller-revenue-e2e.int.spec.ts` passed 100%.
- In-memory async mutex (`withSellerLock`) is designed for single-node process environments. In a clustered multi-pod horizontal scale-out deployment, database-level locking (`SELECT ... FOR UPDATE` or advisory locks) would be required.

## 4. Conclusion
Phase 6 Milestone 3 is completely implemented, verified, and passes all acceptance criteria:
- `tests/int/seller-withdrawals.int.spec.ts`: 14/14 tests pass (100%).
- `tests/int/seller-earnings.int.spec.ts` + `tests/int/commission-config-error.int.spec.ts`: 27/27 tests pass (100%).
- Regression suites (`purchase-workflow`, `purchase-invariants`, `m1-schema-stress`, `m1-access-control`): 97/97 tests pass (100%).
- TypeScript compilation: 0 errors (`pnpm tsc --noEmit`).
- ESLint: 0 errors (`pnpm lint`).
- Active execution plan updated in `docs/plans/active/phase-6-seller-revenue.md`.

## 5. Verification Method
Execute the following verification commands from `/home/trung/Documents/2026/project/test-v6/web`:

```bash
# 1. Verify target withdrawal test suite (14/14 pass)
pnpm vitest run tests/int/seller-withdrawals.int.spec.ts

# 2. Verify earnings and commission error suites (27/27 pass)
pnpm vitest run tests/int/seller-earnings.int.spec.ts tests/int/commission-config-error.int.spec.ts

# 3. Verify regression suites (97/97 pass)
pnpm vitest run tests/int/purchase-workflow.int.spec.ts tests/int/purchase-invariants.int.spec.ts tests/int/m1-schema-stress.int.spec.ts tests/int/m1-access-control.int.spec.ts

# 4. Verify TypeScript compilation (0 errors)
pnpm tsc --noEmit

# 5. Verify ESLint compliance (0 errors)
pnpm lint
```
