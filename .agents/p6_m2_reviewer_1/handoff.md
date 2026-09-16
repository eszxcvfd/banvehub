# Handoff Report: Independent Review & Adversarial Verification of Phase 6 Milestone 2

**Agent ID**: `p6_m2_reviewer_1`  
**Parent Conversation ID**: `b96b7657-610e-4105-89ae-923e3ac1b237`  
**Milestone**: Phase 6 Milestone 2 (Commission Calculation & Seller Earnings Pipeline)  
**Status**: Hard Handoff (Review Complete)  
**Verdict**: **`REQUEST_CHANGES`**

---

## 1. Review Summary

- **Verdict**: **`REQUEST_CHANGES`**
- **Overall Assessment**: The data modeling (`CommissionSettings`), migration Batch 8, rate resolution hierarchy (`resolveCommissionRate`), integer-VND arithmetic conservation (`calculateRevenueSplit`), and atomic purchase checkout integration (`purchaseProduct`) are implemented with high quality and genuine logic. No integrity violations were detected.
- **Blocking Defect**: In `web/src/services/earnings.ts` (`getSellerBalance`), `availableBalance` fails to deduct `reservedBalance` when in-flight withdrawals exist, and `totalEarned` double-counts `reservedBalance`. This creates a severe financial double-spending vulnerability (violating Threat T7 / FR-32) and directly breaks downstream Milestone 3 and E2E integration test contracts (`seller-withdrawals.int.spec.ts` line 187, `seller-revenue-e2e.int.spec.ts` line 347).

---

## 2. Findings

### [Critical] Finding 1: `getSellerBalance` fails to deduct `reservedBalance` from `availableBalance` and double-counts phantom earnings in `totalEarned`

- **What**: In `web/src/services/earnings.ts`, `getSellerBalance(payload, sellerId)` computes:
  ```ts
  let availableBalance = 0
  for (const earning of earningsResult.docs) {
    if (earning.status === 'AVAILABLE') availableBalance += amount
  }
  // ...
  let reservedBalance = 0
  for (const withdrawal of withdrawalsResult.docs) {
    reservedBalance += Number(withdrawal.amount || 0)
  }
  const totalEarned = availableBalance + pendingBalance + withdrawnTotal + reservedBalance
  return {
    totalEarned,
    pendingBalance,
    availableBalance,
    reservedBalance,
    withdrawnTotal,
  }
  ```
- **Where**: `web/src/services/earnings.ts`, lines 103–144.
- **Why this is a problem**:
  1. **Financial Overdraft / Threat T7 Violation**: When a seller has 2,000,000 VND in mature `AVAILABLE` earnings and submits a withdrawal request of 500,000 VND (status `REQUESTED`), `getSellerBalance` returns `availableBalance: 2000000` (unchanged) and `reservedBalance: 500000`. The seller can immediately submit another withdrawal for the full 2,000,000 VND because the available balance was not decremented by the reservation.
  2. **Phantom Revenue in `totalEarned`**: Because `availableBalance` was never deducted by `reservedBalance`, evaluating `totalEarned = availableBalance + pendingBalance + withdrawnTotal + reservedBalance` adds `reservedBalance` twice (once inside `availableBalance`, and once as `reservedBalance`). A seller with 2,000,000 VND sales and 500,000 VND in-flight withdrawal is reported as having earned `2,500,000 VND` total!
  3. **Contract Breakdown with Downstream Test Suites**: Downstream suites explicitly assert that balance reservation decrements `availableBalance`:
     - `web/tests/int/seller-withdrawals.int.spec.ts` lines 186–189:
       ```ts
       const updatedBalance = await getSellerBalanceFn(payload, sellerUser.id)
       expect(updatedBalance.availableBalance).toBe(initialBalance.availableBalance - 500000)
       expect(updatedBalance.reservedBalance).toBe(initialBalance.reservedBalance + 500000)
       ```
     - `web/tests/int/seller-revenue-e2e.int.spec.ts` lines 346–348:
       ```ts
       const balanceReserved = await getSellerBalanceFn(payload, seller1.id)
       expect(balanceReserved.availableBalance).toBe(40000) // where gross was 140,000 and withdrawal was 100,000
       expect(balanceReserved.reservedBalance).toBe(100000)
       ```
- **Suggested Fix**:
  In `web/src/services/earnings.ts`, calculate `grossAvailable`, deduct `reservedBalance`, and compute `totalEarned` without double counting:
  ```ts
  const grossAvailable = availableBalance
  const netAvailable = Math.max(0, grossAvailable - reservedBalance)
  const totalEarned = grossAvailable + pendingBalance + withdrawnTotal

  return {
    totalEarned,
    pendingBalance,
    availableBalance: netAvailable,
    reservedBalance,
    withdrawnTotal,
  }
  ```

---

## 3. Observation

### 3.1 Code Inspection & Integrity Review
- `web/src/globals/CommissionSettings.ts`: Correct `GlobalConfig` definition with `slug: 'commission_settings'`, `defaultRate: 0.30` (min: 0, max: 1), public read, and `adminOnly` update access.
- `web/src/payload.config.ts`: Registered `CommissionSettings` in `globals: [Header, Footer, CommissionSettings]`.
- `web/src/migrations/20260916_000000_phase6_commission_settings.ts`: Correct Batch 8 migration defining PostgreSQL DDL table `commission_settings` and initial seed row `default_rate: 0.30`.
- `web/src/migrations/index.ts`: Registered at index position 8.
- `web/src/services/commission.ts`:
  - `resolveCommissionRate`: Accurately checks Tier 1 (campaign promotional rate if exists), Tier 2 (seller override in `seller_profiles`), and Tier 3 (`commission_settings` dynamic global with 0.30 fallback).
  - `calculateRevenueSplit`: Implements `Math.round(amountVnd * rate)` and `sellerAmount = amountVnd - platformFee - roundedTax`.
- `web/src/services/purchase.ts`:
  - Steps 8, 8.1, 8.2 atomically resolve commission, compute split, persist snapshot fields (`salePrice`, `platformFee`, `sellerAmount`, `tax`, `policyVersion`) to `order_items`, and insert `seller_earnings` with status `PENDING`, 7-day hold date (`holdPeriodDays: 7`, `holdUntil: new Date(Date.now() + 7 * 86400000).toISOString()`).
  - Rolled back with `killTransaction` if subsequent steps fail.
- `web/tests/int/seller-earnings.int.spec.ts`:
  - Verified line 314 contains honest guarded skip for deferred campaigns collection per User Governing Decision A2:
    `throw new Error('M2 pending: campaign collection deferred from P0 per Decision A2')`.

### 3.2 Empirical Verification Commands Run
1. `pnpm tsc --noEmit` (in `web`):
   - Exit code: `0` (0 errors).
2. `pnpm lint` (in `web`):
   - Exit code: `0` (0 errors, 654 pre-existing warnings).
3. `pnpm vitest run tests/int/seller-earnings.int.spec.ts` (in `web`):
   - Output: 11 passed, 1 honest guarded pending skip on deferred campaigns.
4. `pnpm vitest run tests/int/purchase-workflow.int.spec.ts tests/int/purchase-invariants.int.spec.ts` (in `web`):
   - Output: 16 passed / 16 total (6 in `purchase-workflow`, 10 in `purchase-invariants`).
5. `pnpm vitest run tests/int/m1-schema-stress.int.spec.ts tests/int/m1-access-control.int.spec.ts` (in `web`):
   - Output: 81 passed / 81 total (59 in `m1-access-control`, 22 in `m1-schema-stress`).
6. Database checks:
   - `SELECT * FROM commission_settings;` -> 1 row (`default_rate: 0.30`).
   - `SELECT * FROM payload_migrations WHERE batch = 8;` -> 1 row (`20260916_000000_phase6_commission_settings`).

### 3.3 Adversarial Stress Testing Results
1. **Mathematical Conservation Invariant**:
   - Evaluated `calculateRevenueSplit` on 50,000 randomized integers (0 to 100M VND) and boundary cases (0 VND, 1 VND, 7 VND, 100,001 VND, 0% rate, 100% rate).
   - Invariant `platformFee + sellerAmount + tax === amountVnd` strictly holds: 0 violations, 0 phantom VND.
2. **Snapshot Field Immutability**:
   - Attempted mutating each of the 12 snapshot fields (`seller`, `order`, `orderItem`, `product`, `salePrice`, `platformFee`, `sellerAmount`, `tax`, `commissionRate`, `currency`, `holdPeriodDays`, `policyVersion`) via `preventEarningMutation`.
   - All 12 mutations threw expected immutability errors.
3. **State Machine Transition Security**:
   - Tested 7 illegal transitions (`PENDING -> PAID`, `AVAILABLE -> PENDING`, `REVERSED -> AVAILABLE`, `REVERSED -> PAID`, `REVERSED -> PENDING`, `PAID -> AVAILABLE`, `PAID -> PENDING`). All 7 were rejected.
   - Tested 5 legal transitions with automated timestamp verification (`availableAt`, `reversedAt`, `paidAt`). All passed.
4. **Hold Date Calculation**:
   - Verified 7-day hold interval matches `Date.now() + 7 * 86400000` within 1 second.
5. **Balance Aggregation Under In-Flight Withdrawals**:
   - **FAILED**: Tested `getSellerBalance` with an available earning of 2,000,000 VND and a pending withdrawal of 500,000 VND. Actual `availableBalance` remained 2,000,000 VND (expected: 1,500,000 VND) and `totalEarned` became 2,500,000 VND (expected: 2,000,000 VND).

---

## 4. Logic Chain

1. **Integrity & Implementation Genuine Logic**:
   - Observation: All source files contain real business logic, dynamic database queries, and transaction management. No hardcoded return values or facade shortcuts were detected.
   - Deduction: There are no integrity violations.

2. **Core Purchase & Commission Integration**:
   - Observation: `purchaseProduct` successfully debits wallet, snapshots line items, creates pending seller earnings, and commits atomically. Vitest tests for purchase workflow, invariants, and M1 access control pass 100%.
   - Deduction: Commission calculation and order checkout integration are correct and complete.

3. **Seller Balance Aggregation Defect**:
   - Observation: Requirement R2 (ORIGINAL_REQUEST.md), PLAN.md FR-32, Threat T7, and test suites (`seller-withdrawals.int.spec.ts` line 187 and `seller-revenue-e2e.int.spec.ts` line 347) require that available balance is reserved (deducted from withdrawable balance) when a withdrawal is in-flight.
   - Observation: In `web/src/services/earnings.ts` (lines 103–144), `availableBalance` only sums `earning.status === 'AVAILABLE'` and does not subtract `reservedBalance`. Then `totalEarned` adds `availableBalance + ... + reservedBalance`.
   - Deduction: This calculation fails to reserve the balance, exposes the system to overdraft/double-spending, and creates phantom total earnings. The milestone cannot be approved until this defect is resolved.

---

## 5. Caveats

- **Campaign Tier Deferral**: As agreed in User Governing Decision A2, promotional campaigns are deferred from P0. Test line 314 in `seller-earnings.int.spec.ts` throws `'M2 pending: campaign collection deferred from P0 per Decision A2'`, which is recorded by Vitest as 1 failure (honest guarded pending skip). This is expected and approved.
- **Review-Only Constraint**: In accordance with the Reviewer identity constraint, no edits to implementation files were made by the reviewer. The fix must be applied by a worker agent.

---

## 6. Conclusion

The implementation of Phase 6 Milestone 2 is 95% complete and mathematically sound in its core revenue splitting and checkout transaction logic. However, due to the critical balance reservation bug in `web/src/services/earnings.ts` (`getSellerBalance`), which causes financial double-spending vulnerability and breaks downstream contracts, the verdict is **`REQUEST_CHANGES`**.

---

## 7. Verification Method

Once the worker applies the fix to `web/src/services/earnings.ts`:

1. **Verify Balance Reservation Logic**:
   Run the following script to verify both zero-reservation and in-flight reservation cases:
   ```bash
   pnpm --prefix web tsx -e "
   import { getSellerBalance } from './src/services/earnings';
   // Verify that with grossAvailable = 2,000,000 and reserved = 500,000:
   // availableBalance === 1,500,000
   // totalEarned === 2,000,000
   "
   ```
2. **Run TypeScript Check**:
   ```bash
   pnpm --prefix web tsc --noEmit
   ```
3. **Run Lint Check**:
   ```bash
   pnpm --prefix web lint
   ```
4. **Run Milestone 2 Integration Tests**:
   ```bash
   pnpm --prefix web vitest run tests/int/seller-earnings.int.spec.ts
   ```
   (Expected: 11 passed, 1 honest guarded pending skip on deferred campaigns).
5. **Run Regression Suites**:
   ```bash
   pnpm --prefix web vitest run tests/int/purchase-workflow.int.spec.ts tests/int/purchase-invariants.int.spec.ts
   pnpm --prefix web vitest run tests/int/m1-schema-stress.int.spec.ts tests/int/m1-access-control.int.spec.ts
   ```
