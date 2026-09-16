# Handoff Report: Phase 6 Milestone 4 (Compensating Refund Ledger & Reversal Flow)

## 1. Observation
- Target test suite: `web/tests/int/refund-ledger.int.spec.ts` imports `processRefund` from `@/services/refund`.
- Prior to implementation, `web/src/services/refund.ts` and `web/src/app/api/v1/admin/refunds/route.ts` were absent from the repository.
- Created `web/src/services/refund.ts` implementing `RefundParams`, `RefundResult`, and `processRefund(payload: Payload, params: RefundParams): Promise<RefundResult>`.
- Created `web/src/app/api/v1/admin/refunds/route.ts` implementing authenticated `POST` and `GET` handlers enforcing `financeAdmin` or `admin` role.
- Updated `docs/plans/active/phase-6-seller-revenue.md` noting Milestone 4 scope, objectives, verification gates, and task checklist.
- Command outputs:
  - `pnpm vitest run tests/int/refund-ledger.int.spec.ts` (in `web/`):
    ```
    ✓ tests/int/refund-ledger.int.spec.ts (10 tests) 1941ms
    Test Files  1 passed (1)
         Tests  10 passed (10)
    ```
  - `pnpm vitest run tests/int/seller-withdrawals.int.spec.ts tests/int/seller-earnings.int.spec.ts tests/int/commission-config-error.int.spec.ts` (in `web/`):
    ```
    ✓ tests/int/seller-withdrawals.int.spec.ts (14 tests) 2594ms
    ✓ tests/int/seller-earnings.int.spec.ts (12 tests) 1907ms
    ✓ tests/int/commission-config-error.int.spec.ts (15 tests) 8ms
    Test Files  3 passed (3)
         Tests  41 passed (41)
    ```
  - `pnpm vitest run tests/int/purchase-workflow.int.spec.ts tests/int/purchase-invariants.int.spec.ts` (in `web/`):
    ```
    ✓ tests/int/purchase-workflow.int.spec.ts (6 tests) 1889ms
    ✓ tests/int/purchase-invariants.int.spec.ts (10 tests) 1399ms
    Test Files  2 passed (2)
         Tests  16 passed (16)
    ```
  - `pnpm vitest run tests/int/m1-schema-stress.int.spec.ts tests/int/m1-access-control.int.spec.ts` (in `web/`):
    ```
    ✓ tests/int/m1-access-control.int.spec.ts (59 tests) 1993ms
    ✓ tests/int/m1-schema-stress.int.spec.ts (22 tests) 1144ms
    Test Files  2 passed (2)
         Tests  81 passed (81)
    ```
  - `pnpm tsc --noEmit` (in `web/`):
    Exited with 0 errors.
  - `pnpm eslint src/services/refund.ts src/app/api/v1/admin/refunds/route.ts` (in `web/`):
    0 errors, 0 warnings.
  - `pnpm lint` (in `web/`):
    Exited 0 with 0 errors (669 pre-existing warnings in test files, 0 in new service/route code).

## 2. Logic Chain
1. Per `PLAN.md` FLOW-U15, BR-03, Decision 0002, and Decision 0006, refunds must never mutate or delete original ledger entries. Instead, a compensating reversal credit entry must be appended to `wallet_ledger`.
2. By calling `creditWallet(payload, { userId, amount, type: 'refund', referenceType: 'order', referenceId: order.code, description })`, `creditWallet` creates a new row in `wallet_ledger` with `direction: 'credit'` and `type: 'refund'`, and updates the wallet balance atomically, preserving historical ledger rows verbatim.
3. Verification in `tests/int/refund-ledger.int.spec.ts` proves that:
   - Original purchase ledger entry remains `direction: 'debit'`, `type: 'purchase'`, with original balance and amounts untouched (observation step 1).
   - Reversal credit entry exists with exact order amount (observation step 1).
   - Buyer wallet balance equals the mathematical sum of all ledger entries before and after refund (Tier 3 conservation test).
4. Seller earnings reversal transitions `seller_earnings` to `REVERSED`. Per `SellerEarnings` hook `preventEarningMutation`, transitions `PENDING -> REVERSED`, `AVAILABLE -> REVERSED`, and `PAID -> REVERSED` are permitted and auto-stamp `reversedAt`. Earning reversal decrements pending balance back to its pre-purchase value as verified in Tier 1 tests.
5. Order status is updated to `REFUNDED` while line items in `order_items` remain intact with immutable snapshot prices (`salePrice`, `platformFee`, `sellerAmount`).
6. Entitlement revocation logic checks `revokeEntitlement !== false`: if true or omitted, entitlements transition to `revoked`; if explicitly false (goodwill compensation), entitlements remain `active`. Both paths verified passing in Tier 2 tests.
7. Role-based access control was verified: checking `financeAdmin` or `admin` role before order lookup prevents unauthorized users from learning about order existence, ensuring zero information leak and satisfying both `refund-ledger.int.spec.ts` and `seller-revenue-e2e.int.spec.ts`.
8. The REST API route `/api/v1/admin/refunds` authenticates via Payload headers, validates inputs, invokes `processRefund`, and returns typed JSON responses (200 on success, 400 on validation/business failure, 401 unauthenticated, 403 unauthorized).

## 3. Caveats
- No database migrations were required for Milestone 4 because the `refunds` collection and the `REFUNDED` status on `orders` were already fully provisioned in Milestone 1 (Batch 7 migration).
- The `seller-revenue-e2e.int.spec.ts` file contains one remaining failure (`GET /api/v1/seller/earnings`), which is explicitly scoped to Milestone 5 ("M5 pending: GET /api/v1/seller/earnings route handler not yet implemented"). All M1, M2, M3, and M4 tests in that suite pass.

## 4. Conclusion
Milestone 4 (Compensating Refund Ledger & Reversal Flow) is fully delivered, tested, and verified against all required contracts. The implementation strictly adheres to ledger immutability (BR-03), snapshot pricing (BR-07), anti-overdraft/anti-information-leak invariants, and RBAC matrix specifications. 10/10 target tests pass, 41/41 M2/M3 tests pass, 97/97 regression tests pass, and TypeScript/ESLint pass with 0 errors.

## 5. Verification Method
To independently reproduce and verify this milestone:

1. **Verify target refund ledger test suite**:
   ```bash
   pnpm --dir /home/trung/Documents/2026/project/test-v6/web vitest run tests/int/refund-ledger.int.spec.ts
   ```
   *Expected*: 10 passed / 10 total.

2. **Verify M2/M3 test suites**:
   ```bash
   pnpm --dir /home/trung/Documents/2026/project/test-v6/web vitest run tests/int/seller-withdrawals.int.spec.ts tests/int/seller-earnings.int.spec.ts tests/int/commission-config-error.int.spec.ts
   ```
   *Expected*: 41 passed / 41 total.

3. **Verify regression test suites**:
   ```bash
   pnpm --dir /home/trung/Documents/2026/project/test-v6/web vitest run tests/int/purchase-workflow.int.spec.ts tests/int/purchase-invariants.int.spec.ts tests/int/m1-schema-stress.int.spec.ts tests/int/m1-access-control.int.spec.ts
   ```
   *Expected*: 97 passed / 97 total.

4. **Verify TypeScript type checking**:
   ```bash
   pnpm --dir /home/trung/Documents/2026/project/test-v6/web tsc --noEmit
   ```
   *Expected*: Exit code 0, 0 errors.

5. **Verify ESLint linting**:
   ```bash
   pnpm --dir /home/trung/Documents/2026/project/test-v6/web lint
   ```
   *Expected*: Exit code 0, 0 errors.

6. **Files to inspect**:
   - `web/src/services/refund.ts`
   - `web/src/app/api/v1/admin/refunds/route.ts`
   - `docs/plans/active/phase-6-seller-revenue.md`
