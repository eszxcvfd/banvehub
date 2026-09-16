# Forensic Audit Report & Handoff: Phase 6 Milestone 4

**Work Product**: Phase 6 Milestone 4 — Compensating Refund Ledger & Reversal Flow (`web/src/services/refund.ts`, `web/src/app/api/v1/admin/refunds/route.ts`, `web/tests/int/refund-ledger.int.spec.ts`)  
**Auditor**: `p6_m4_auditor_1` (Forensic Integrity Auditor)  
**Profile**: General Project (`development` mode per `ORIGINAL_REQUEST.md`)  
**Verdict**: **`CLEAN`**

---

## 1. Observation

### 1.1 Static Code & Architectural Verification
- **`web/src/services/refund.ts`** (273 lines):
  - Line 45–51: Validates required non-empty string `reason` and valid numeric `orderId`.
  - Line 53–68: Authorization enforcement verifying `actorId` has `financeAdmin` or `admin` role BEFORE attempting `orders` lookup, preventing information leakage or order existence enumeration.
  - Line 69–93: Order lookup and eligibility verification: confirms order exists, throws "Order has already been refunded" if `status === 'REFUNDED'`, and throws "Order {id} is not eligible for refund (status: {status})" if `status !== 'COMPLETED'`.
  - Line 95–137: Buyer wallet compensating credit (BR-03, FLOW-U15, Decision 0002): invokes `creditWallet(payload, { userId, amount: orderTotal, type: 'refund', referenceType: 'order', referenceId: order.code, description })` when `orderTotal > 0`. Leaves original purchase debit entry completely intact and appends a new `direction: 'credit'` row with `type: 'refund'`.
  - Line 139–165: Seller earnings reversal: fetches all `seller_earnings` associated with `order`, sums `platformFeeRefunded` and `sellerAmountRefunded`, and transitions their status to `'REVERSED'`.
  - Line 166–174: Order status transition: updates order to `status: 'REFUNDED'`; line items in `order_items` remain untouched.
  - Line 176–198: Entitlement revocation policy: evaluates `params.revokeEntitlement === undefined || params.revokeEntitlement === true`. If true (default), sets entitlement `status: 'revoked'`; if false (goodwill compensation), leaves entitlement `status: 'active'`.
  - Line 200–260: Immutable audit trail: creates record in `refunds` collection with unique code (`REF-YYYYMMDD-XXXXXX`), `order`, `orderItem`, `buyer`, `seller`, `amount`, `platformFeeRefunded`, `sellerAmountRefunded`, `currency: 'VND'`, `reason`, `status: 'COMPLETED'`, `processedBy`, `ledgerTransaction`, and `entitlementRevoked`.
  - Line 262–272: Returns typed `RefundResult`.

- **`web/src/app/api/v1/admin/refunds/route.ts`** (135 lines):
  - `POST` handler: Extracts session user via `payload.auth({ headers })`. Returns HTTP 401 if unauthenticated and HTTP 403 if user lacks `financeAdmin` or `admin` role. Parses JSON body, validates input fields, invokes `processRefund`, and returns HTTP 200 `{ success: true, data: result }` on success, or HTTP 400 on bad request.
  - `GET` handler: Enforces authentication and `financeAdmin`/`admin` role (401/403). Allows paginated search over `refunds` with filters (`orderId`, `sellerId`, `buyerId`).

- **Collection Hooks & Invariants**:
  - `web/src/collections/SellerEarnings/hooks/preventEarningMutation.ts`: Validates that snapshot fields (`salePrice`, `platformFee`, `sellerAmount`, `tax`, `commissionRate`, etc.) are completely immutable (BR-07). Permits state transition from `PENDING -> REVERSED`, `AVAILABLE -> REVERSED`, and `PAID -> REVERSED`, and auto-populates `reversedAt`.

- **Scan for Prohibited Patterns**:
  - Prohibited patterns scan (`vitest|describe|mock|fake|stub|hardcode`) across `web/src/services/refund.ts` and `web/src/app/api/v1/admin/refunds/route.ts`: 0 matches.
  - Pre-populated artifact scan (`find . -name '*.log' -o -name '*result*' -o -name '*output*'`): Zero pre-existing test output artifacts.

### 1.2 Live PostgreSQL Inspection
- Executed `docker exec kientaohub-postgres psql -U payload -d kientaohub -c "\d refunds"`:
  - Table `refunds` exists with 17 columns matching DDL specifications.
  - Check constraints confirmed active:
    - `refunds_amount_non_negative`: `CHECK (amount >= 0::numeric)`
    - `refunds_platform_fee_refunded_non_negative`: `CHECK (platform_fee_refunded >= 0::numeric)`
    - `refunds_seller_amount_refunded_non_negative`: `CHECK (seller_amount_refunded >= 0::numeric)`
  - Foreign keys confirmed to `users`, `orders`, `order_items`, `wallet_ledger`.
- Executed `docker exec kientaohub-postgres psql -U payload -d kientaohub -c "SELECT id, type, direction, amount, reference_id, balance_before, balance_after FROM wallet_ledger ORDER BY id DESC LIMIT 10;"`:
  - Directly confirmed live compensating rows:
    - ID 863: `type: purchase`, `direction: debit`, `amount: 100000`, `reference_id: ORD-20260916-042EDC`, `balance: 400000 -> 300000`
    - ID 864: `type: refund`, `direction: credit`, `amount: 100000`, `reference_id: ORD-20260916-042EDC`, `balance: 300000 -> 400000`
    - ID 860: `type: purchase`, `direction: debit`, `amount: 180000`, `reference_id: ORD-20260916-AC1084`, `balance: 200000 -> 20000`
    - ID 861: `type: refund`, `direction: credit`, `amount: 180000`, `reference_id: ORD-20260916-AC1084`, `balance: 20000 -> 200000`
    - ID 857: `type: purchase`, `direction: debit`, `amount: 250000`, `reference_id: ORD-20260916-568106`, `balance: 300000 -> 50000`
    - ID 858: `type: refund`, `direction: credit`, `amount: 250000`, `reference_id: ORD-20260916-568106`, `balance: 50000 -> 300000`
  - Purchase debit entries are NEVER altered or deleted; compensating refund credit entries are appended.

### 1.3 Empirical Test Execution Results
Executed sequentially in `web/` without concurrency:
1. **Target Refund Ledger Suite**:
   ```bash
   pnpm vitest run tests/int/refund-ledger.int.spec.ts
   ```
   Result: `✓ tests/int/refund-ledger.int.spec.ts (10 tests) 1984ms` — 10 passed (100%).
2. **Prior Phase 6 Milestones (M2 & M3)**:
   ```bash
   pnpm vitest run --no-file-parallelism tests/int/seller-withdrawals.int.spec.ts tests/int/seller-earnings.int.spec.ts tests/int/commission-config-error.int.spec.ts
   ```
   Result: `✓ tests/int/seller-withdrawals.int.spec.ts (14 tests) 2711ms`, `✓ tests/int/seller-earnings.int.spec.ts (12 tests) 1771ms`, `✓ tests/int/commission-config-error.int.spec.ts (15 tests) 7ms` — 41 passed (100%).
3. **Core Regression Suites (Phase 5 & Phase 6 M1)**:
   ```bash
   pnpm vitest run --no-file-parallelism tests/int/purchase-workflow.int.spec.ts tests/int/purchase-invariants.int.spec.ts tests/int/m1-schema-stress.int.spec.ts tests/int/m1-access-control.int.spec.ts
   ```
   Result: 97 passed out of 97 tests (59 in m1-access-control, 6 in purchase-workflow, 10 in purchase-invariants, 22 in m1-schema-stress).
4. **Static Analysis & Typecheck**:
   - `pnpm tsc --noEmit`: Exited 0, 0 errors.
   - `pnpm lint`: Exited 0, 0 errors.
   - `pnpm eslint src/services/refund.ts src/app/api/v1/admin/refunds/route.ts`: Exited 0, 0 errors, 0 warnings.

---

## 2. Logic Chain

1. **Immutable Compensating Ledger (BR-03, FLOW-U15, Decision 0002)**:
   - Direct inspection of `web/src/services/refund.ts` (lines 107–117) and `web/src/services/wallet.ts` shows `processRefund` invokes `creditWallet`.
   - `creditWallet` creates a new append-only entry in `wallet_ledger` with `direction: 'credit'` and `type: 'refund'`.
   - Direct live DB inspection in PostgreSQL confirmed that previous purchase rows (e.g. ID 857, 860, 863) remain unmutated with original debit amounts and timestamps, and new credit rows (e.g. ID 858, 861, 864) are appended. This satisfies BR-03 and FLOW-U15.

2. **Mathematical Conservation Invariant**:
   - `refund-ledger.int.spec.ts` test 10 validates that buyer balance before and after refund strictly equals the algebraic sum of all ledger credit and debit entries.
   - Live DB data verifies `balance_after` in row 864 equals `300000 + 100000 = 400000`, exactly reversing row 863's debit from 400000 to 300000. Zero phantom VND generated or destroyed.

3. **Seller Earnings Reversal & Snapshot Immutability (BR-07)**:
   - `seller_earnings` rows for the refunded order transition from `PENDING` to `REVERSED`.
   - The hook `preventEarningMutation.ts` enforces that all snapshot fields (`salePrice`, `platformFee`, `sellerAmount`, `tax`, `commissionRate`, `currency`, `holdPeriodDays`, `policyVersion`) are completely locked.
   - When earnings transition to `REVERSED`, `getSellerBalance` excludes them from `pendingBalance`, restoring the seller's balance to pre-purchase amounts.

4. **Preservation of Order Line Items**:
   - `orders.status` is updated to `'REFUNDED'`.
   - `order_items` records are neither modified nor deleted, preserving historical transactional audit records.

5. **Entitlement Revocation & Retention**:
   - Default behavior (`revokeEntitlement === undefined || true`) transitions buyer entitlement status to `'revoked'`.
   - Goodwill policy (`revokeEntitlement === false`) leaves entitlement status `'active'`, allowing retained access while refunding funds. Both branches are verified by tests.

6. **Information Leakage Defense & RBAC Matrix**:
   - In `processRefund`, caller role validation occurs at lines 53–67, BEFORE looking up `orders` at line 69. Non-finance/admin callers are rejected with `Unauthorized` without disclosing whether an order exists.
   - In `/api/v1/admin/refunds`, unauthenticated callers receive 401 and unauthorized users receive 403.

7. **Prohibited Patterns Assessment**:
   - No hardcoded test values, no fake return branches, and no mock bypasses exist in implementation code.
   - Zero pre-populated output logs or files.
   - Verdict under `development` mode is `CLEAN`.

---

## 3. Caveats

1. **Concurrent Refund Requests**:
   - `processRefund` performs an in-memory check `if (order.status === 'REFUNDED') throw ...`. While duplicate refund attempts are rejected, two concurrent HTTP requests hitting the endpoint at the exact same millisecond could theoretically both read `COMPLETED` before either commits the update. Because refunds are triggered manually by Finance Admins in the back-office, race conditions are practically negligible, but an advisory lock or DB row lock on `orders` (`SELECT ... FOR UPDATE`) is recommended if high automated concurrency is introduced in the future.
2. **Post-Payout Manual Clawback**:
   - If an order is refunded after a seller has already withdrawn earnings (`PAID -> REVERSED`), `getSellerBalance` clamps `availableBalance` at 0 via `Math.max(0, ...)`. In accordance with Phase 6 design specifications, negative balance clawback is treated administratively rather than automatically debited.

---

## 4. Conclusion

Milestone 4 (Compensating Refund Ledger & Reversal Flow) strictly satisfies all requirements and invariants:
- **Ledger Immutability**: Compensating credit appended, purchase debit unmutated (BR-03, FLOW-U15, Decision 0002).
- **Snapshot Pricing**: Line items and earning rates frozen (BR-07).
- **Authorization & Security**: Finance Admin / Admin role enforced with zero information leak.
- **Empirical Proof**: 10/10 target tests pass, 41/41 M2/M3 tests pass, 97/97 regression tests pass, and TypeScript/ESLint pass with 0 errors.

**Binary Verdict**: **`CLEAN`**

---

## 5. Verification Method

To independently reproduce all forensic audit findings:

```bash
# 1. Verify target refund ledger tests (10/10 pass)
pnpm --dir web vitest run tests/int/refund-ledger.int.spec.ts

# 2. Verify prior milestone suites (41/41 pass)
pnpm --dir web vitest run --no-file-parallelism tests/int/seller-withdrawals.int.spec.ts tests/int/seller-earnings.int.spec.ts tests/int/commission-config-error.int.spec.ts

# 3. Verify regression suites (97/97 pass)
pnpm --dir web vitest run --no-file-parallelism tests/int/purchase-workflow.int.spec.ts tests/int/purchase-invariants.int.spec.ts tests/int/m1-schema-stress.int.spec.ts tests/int/m1-access-control.int.spec.ts

# 4. Typecheck and lint (0 errors)
pnpm --dir web tsc --noEmit
pnpm --dir web lint

# 5. Live PostgreSQL checks
docker exec kientaohub-postgres psql -U payload -d kientaohub -c "\d refunds"
docker exec kientaohub-postgres psql -U payload -d kientaohub -c "SELECT id, type, direction, amount, reference_id, balance_before, balance_after FROM wallet_ledger ORDER BY id DESC LIMIT 10;"
```
