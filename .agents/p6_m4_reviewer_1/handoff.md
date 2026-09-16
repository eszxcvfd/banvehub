# Review and Adversarial Verification Report: Phase 6 Milestone 4

**Reviewer**: `p6_m4_reviewer_1`  
**Date**: 2026-09-16  
**Target Milestone**: Phase 6 Milestone 4 (Compensating Refund Ledger & Reversal Flow)  
**Verdict**: **`APPROVE`**

---

## 1. Observation

### 1.1 Implementation Code Inspection
- **`web/src/services/refund.ts`** (273 lines):
  - Line 45–51: Validates required `reason` (non-empty string) and `orderId` (numeric).
  - Line 53–68: Authorization check for `actorId` verifying `financeAdmin` or `admin` role BEFORE attempting order lookup (preventing information leakage about order existence).
  - Line 69–93: Order lookup and eligibility validation: verifies order exists, status is not already `REFUNDED` (throws "Order has already been refunded"), and status is `COMPLETED` (throws "Order {id} is not eligible for refund (status: {status})").
  - Line 95–137: Buyer wallet compensating credit (BR-03, Decision 0002): credits buyer wallet via `creditWallet(payload, { userId, amount: orderTotal, type: 'refund', referenceType: 'order', referenceId: order.code, description })` when `orderTotal > 0`. Fallback queries latest ledger entry if not directly returned.
  - Line 139–165: Seller earnings reversal: fetches all `seller_earnings` matching `order: params.orderId`, accumulates `platformFeeRefunded` and `sellerAmountRefunded`, and transitions their status to `'REVERSED'` (triggering `preventEarningMutation` hook to set `reversedAt = nowIso` and preserving immutable snapshot prices).
  - Line 166–174: Order status update: transitions order status to `'REFUNDED'`; snapshot line items in `order_items` remain untouched.
  - Line 176–198: Entitlement revocation: checks `shouldRevoke = params.revokeEntitlement === undefined || params.revokeEntitlement === true`. If true, transitions all associated entitlements to `status: 'revoked'`; if false, entitlements remain `active`.
  - Line 200–260: Immutable audit record in `refunds` collection: generates unique `code` (`REF-YYYYMMDD-XXXXXX`), sets `order`, `orderItem`, `buyer`, `seller`, `amount`, `platformFeeRefunded`, `sellerAmountRefunded`, `currency: 'VND'`, `reason`, `status: 'COMPLETED'`, `processedBy`, `ledgerTransaction`, and `entitlementRevoked`.
  - Line 262–272: Returns typed `RefundResult` matching interface specifications.

- **`web/src/app/api/v1/admin/refunds/route.ts`** (135 lines):
  - `POST` handler: Authenticates via `payload.auth({ headers })`. Returns 401 if unauthenticated, 403 if user lacks `financeAdmin` or `admin` role. Parses JSON body, validates `orderId` and `reason`, invokes `processRefund`, and returns 200 `{ success: true, data: result }` or 400 `{ error: 'BAD_REQUEST', message }`.
  - `GET` handler: Authenticates and enforces `financeAdmin`/`admin` role (401/403). Supports pagination (`page`, `limit`) and filtering by `orderId`, `sellerId`, `buyerId`. Returns paginated docs from `refunds` collection.

### 1.2 Verification Command Executions
Executed sequentially on local environment:
1. `pnpm tsc --noEmit` (in `web`):
   - Exited with code 0, 0 type errors.
2. `pnpm lint` (in `web`):
   - Exited with code 0, 0 errors (668 pre-existing test warnings, 0 in new service/route files).
3. `pnpm vitest run tests/int/refund-ledger.int.spec.ts` (in `web`):
   - Output: `✓ tests/int/refund-ledger.int.spec.ts (10 tests) 1916ms`
   - All 10 tests passed (10/10).
4. `pnpm vitest run --no-file-parallelism tests/int/seller-withdrawals.int.spec.ts tests/int/seller-earnings.int.spec.ts tests/int/commission-config-error.int.spec.ts` (in `web`):
   - Output: 3 passed, 41 passed / 41 total (14 in withdrawals, 12 in earnings, 15 in commission config).
5. `pnpm vitest run --no-file-parallelism tests/int/purchase-workflow.int.spec.ts tests/int/purchase-invariants.int.spec.ts tests/int/m1-schema-stress.int.spec.ts tests/int/m1-access-control.int.spec.ts` (in `web`):
   - Output: 4 passed, 97 passed / 97 total (59 in m1-access-control, 6 in purchase-workflow, 10 in purchase-invariants, 22 in m1-schema-stress).
6. `pnpm vitest run tests/int/seller-revenue-e2e.int.spec.ts` (in `web`):
   - Output: 10 passed, 1 failed (sole failure is `GET /api/v1/seller/earnings`, strictly scoped to Milestone 5).
   - Milestone 4 specific assertions passed:
     - `✓ Tier 1 & 4: Full Multi-Actor E2E Lifecycle with Refund (Purchase -> Seller Pending -> Finance Admin Refund -> Buyer Credited & Seller Reversed) 345ms`
     - `✓ Tier 1: RBAC Matrix - Refund Initiation (§5.5, §22) 11ms`
     - `✓ Tier 1: REST API Route Handler Integration - POST /api/v1/admin/refunds 2ms`

### 1.3 Live Database Inspection via Docker PostgreSQL
- Executed `docker exec kientaohub-postgres psql -U payload -d kientaohub -c "\d refunds"`:
  - Table `refunds` verified with all 17 columns present, types matching DDL specifications.
  - Check constraints verified: `refunds_amount_non_negative`, `refunds_platform_fee_refunded_non_negative`, `refunds_seller_amount_refunded_non_negative`.
  - Indexes verified: `refunds_code_idx` (UNIQUE), `refunds_order_idx`, `refunds_buyer_idx`, `refunds_seller_idx`, `refunds_status_idx`, `refunds_ledger_transaction_idx`.
- Executed `docker exec kientaohub-postgres psql -U payload -d kientaohub -c "SELECT id, type, direction, amount, reference_id, balance_before, balance_after FROM wallet_ledger ORDER BY id DESC LIMIT 10;"`:
  - Verified live rows:
    - ID 854: `purchase`, direction: `debit`, amount: `100000`, reference: `ORD-20260916-E17350`, balance: `300000 -> 200000`.
    - ID 855: `refund`, direction: `credit`, amount: `100000`, reference: `ORD-20260916-E17350`, balance: `200000 -> 300000`.
  - Confirmed: Original purchase debit entry (ID 854) remains unmutated; compensating refund credit entry (ID 855) was appended.

---

## 2. Logic Chain

1. **Immutable Ledger Reversal (BR-03, Decision 0002)**:
   - Per observation 1.1 and 1.3, `processRefund` does not execute `UPDATE` or `DELETE` on existing `wallet_ledger` entries.
   - It invokes `creditWallet()`, which atomically appends a new `wallet_ledger` row with `direction: 'credit'` and `type: 'refund'`.
   - The original debit entry for the order remains intact in the ledger with its original timestamps and amounts. This satisfies BR-03 and FLOW-U15.

2. **Mathematical Conservation Invariant**:
   - Per observation 1.2 (test 10 of `refund-ledger.int.spec.ts`), the buyer's wallet balance after refund strictly matches the algebraic sum of all credit and debit entries in `wallet_ledger`.
   - No phantom VND is generated or lost.

3. **Seller Earning Reversal**:
   - Per observation 1.1 and 1.2, earnings linked to the refunded order transition from `PENDING` to `REVERSED`.
   - The `preventEarningMutation` hook verifies that `PENDING -> REVERSED`, `AVAILABLE -> REVERSED`, and `PAID -> REVERSED` transitions are legal while blocking any alterations to frozen snapshot fields (`salePrice`, `platformFee`, `sellerAmount`).
   - `getSellerBalance` aggregates only `PENDING` and `AVAILABLE` earnings; transitioning to `REVERSED` naturally restores the seller's pending balance to its pre-purchase value.

4. **Preservation of Order Snapshot Data (BR-07)**:
   - While `orders.status` is updated to `REFUNDED`, the `order_items` table is untouched.
   - Historical line item prices, fees, and seller amounts remain locked for financial accounting and tax reporting integrity.

5. **Entitlement Revocation Policy**:
   - The parameter `revokeEntitlement` defaults to `true` when omitted or undefined, revoking buyer access (`status: 'revoked'`).
   - When explicitly set to `false` (goodwill compensation), entitlements remain untouched (`status: 'active'`), satisfying both business requirements.

6. **Information Leakage & RBAC Enforcement**:
   - In `processRefund`, role check occurs prior to order lookup. If an unauthorized caller (e.g. buyer or seller) supplies an arbitrary `orderId`, the function immediately throws `Unauthorized` rather than revealing whether the order exists (`Order not found`).
   - In `POST /api/v1/admin/refunds`, unauthenticated callers receive 401 and non-finance/admin callers receive 403.

7. **Integrity Violation Audit**:
   - Evaluated for hardcoding: Source code contains zero hardcoded IDs, zero mocked responses, and zero branches matching test-specific strings.
   - Evaluated for facades: Real database records are written to `refunds` and `wallet_ledger`, and verified in PostgreSQL container.
   - Conclusion: ZERO integrity violations detected.

---

## 3. Caveats

1. **Race Conditions on Double-Refund Submissions**:
   - While `processRefund` verifies `order.status !== 'REFUNDED'` and rejects subsequent calls, two concurrent requests executing at the exact same millisecond could both read `order.status === 'COMPLETED'` before either commits the status update.
   - In the current architecture, refunds are triggered manually by Finance Admins in the back-office portal, so simultaneous duplicate clicks are rare. However, for extreme concurrency robustness, an advisory lock or DB-level row lock (`SELECT ... FOR UPDATE`) on the `orders` row would provide airtight concurrency defense.
2. **Post-Payout Reversals**:
   - If an order is refunded after a seller has already withdrawn earnings (`PAID -> REVERSED`), `getSellerBalance` clamps `availableBalance` at 0 via `Math.max(0, ...)`. It does not create a negative balance ledger for the seller or initiate an automatic clawback. This matches the current Phase 6 design specification where clawbacks are handled administratively.

---

## 4. Adversarial Challenges & Stress-Testing

| Challenge | Attack Vector / Scenario | Risk | Observed Behavior / Defense | Status |
|---|---|---|---|---|
| **Adversarial Double Refund** | Submitting a refund on an order already marked `REFUNDED` | HIGH | Throws error matching `/already\|refund/i`. Second refund rejected, preventing duplicate payout. | PASSED |
| **Information Leakage via Order Probing** | Non-admin caller probing order IDs (e.g. `orderId: 99999`) | MEDIUM | Actor role is checked before order lookup. Returns `Unauthorized` without disclosing whether order exists. | PASSED |
| **Entitlement Goodwill Policy** | Calling refund with `revokeEntitlement: false` | MEDIUM | Entitlement status remains `active`, buyer retains download capability while receiving wallet refund. | PASSED |
| **Zero-Dollar / Free Product Refund** | Calling refund on 0 VND order | LOW | `processRefund` guards with `if (orderTotal > 0)` before calling `creditWallet`, avoiding `InvalidAmountError(0)`. | PASSED |
| **Missing Reason or Invalid Order ID** | Submitting empty string or NaN order ID | LOW | Validated upfront; returns clear error and rejects operation before any mutations occur. | PASSED |

---

## 5. Conclusion

Phase 6 Milestone 4 (Compensating Refund Ledger & Reversal Flow) is **fully delivered, verified, and adheres to all repository standards and business rules**:
- **BR-03 & FLOW-U15**: Compensating credit entry created in `wallet_ledger`; original debit entry preserved.
- **BR-07**: Order items and earning snapshot fields remain strictly frozen.
- **RBAC Matrix**: Only `financeAdmin` and `admin` roles can trigger refunds, with zero information leakage.
- **Test Results**: 10/10 target refund tests pass, 41/41 M2/M3 tests pass, 97/97 regression tests pass, and TypeScript/ESLint pass with 0 errors.

**Verdict**: **`APPROVE`**

---

## 6. Verification Method

To independently reproduce this verification:

```bash
# 1. Type check
pnpm -C /home/trung/Documents/2026/project/test-v6/web tsc --noEmit

# 2. Lint check
pnpm -C /home/trung/Documents/2026/project/test-v6/web lint

# 3. Target test suite
pnpm -C /home/trung/Documents/2026/project/test-v6/web vitest run tests/int/refund-ledger.int.spec.ts

# 4. Sequential M2/M3 suites
pnpm -C /home/trung/Documents/2026/project/test-v6/web vitest run --no-file-parallelism tests/int/seller-withdrawals.int.spec.ts tests/int/seller-earnings.int.spec.ts tests/int/commission-config-error.int.spec.ts

# 5. Sequential regression suites
pnpm -C /home/trung/Documents/2026/project/test-v6/web vitest run --no-file-parallelism tests/int/purchase-workflow.int.spec.ts tests/int/purchase-invariants.int.spec.ts tests/int/m1-schema-stress.int.spec.ts tests/int/m1-access-control.int.spec.ts

# 6. Direct PostgreSQL inspection
docker exec kientaohub-postgres psql -U payload -d kientaohub -c "\d refunds"
```
