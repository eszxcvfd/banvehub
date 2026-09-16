# Handoff Report: Independent Review & Adversarial Verification of Phase 6 Milestone 2 (Iteration 2)

**Agent ID**: `p6_m2_reviewer_2`  
**Parent Conversation ID**: `b96b7657-610e-4105-89ae-923e3ac1b237`  
**Milestone**: Phase 6 Milestone 2 (Commission Calculation & Seller Earnings Pipeline) — Iteration 2  
**Status**: Hard Handoff (Review & Verification Complete)  
**Verdict**: **`REQUEST_CHANGES`**

---

## 1. Review Summary

- **Verdict**: **`REQUEST_CHANGES`**
- **Overall Assessment**:
  The implementation delivered by `p6_m2_worker_2` successfully resolves Finding 1 from Iteration 1 and implements Parent Directives C1–C4. The balance reservation and lifetime earnings math in `web/src/services/earnings.ts` is mathematically sound, eliminating Threat T7 overdraft risk and phantom earnings. The 3-tier commission resolver in `web/src/services/commission.ts` eliminates the hard-coded `0.30` literal fallback, exports typed `CommissionConfigurationError`, and deterministically formats `policyVersion` (`site-default-v1-0.30`). Integration into `purchase.ts` is atomic and robust. Zero regressions were detected across 97 regression tests.
- **Actionable Finding (Parent Directive C1 Coverage Gap)**:
  As highlighted by orchestrator directive `2026-09-16T02:01:21Z` and `2026-09-16T02:02:20Z`, while `CommissionConfigurationError` and its throw branches are genuinely implemented and verified by our adversarial harness, they currently have **0% committed test coverage** in `web/tests/`. Because `vitest.config.mts` only includes `tests/int/**/*.int.spec.ts` and all existing integration tests run against a valid seeded database, the error branches (`findGlobal` failure and invalid/non-numeric `defaultRate`) are never exercised during CI runs. A dedicated committed integration test file `web/tests/int/commission-config-error.int.spec.ts` must be added to provide permanent regression protection.

---

## 2. Findings

### [Major] Finding 1: Lack of Committed Test Coverage for `CommissionConfigurationError` Error Throw Branches

- **What**:
  `web/src/services/commission.ts` defines and throws `CommissionConfigurationError` when global settings cannot be loaded or when `defaultRate` is missing, null, NaN, or non-numeric. However, zero committed test files in `web/tests/` exercise these throw branches.
- **Where**:
  - `web/src/services/commission.ts`, lines 29–35, 118–122, and 124–133.
  - `web/vitest.config.mts`, line 10 (`include: ['tests/int/**/*.int.spec.ts']`).
- **Why this is a problem**:
  All existing integration tests (`tests/int/seller-earnings.int.spec.ts`, etc.) run against a live PostgreSQL database that was seeded by migration Batch 8 with `default_rate = 0.30`. The error branches are never executed in test suites. Without a committed test, future modifications or refactoring to `commission.ts` could accidentally swallow errors or reintroduce hard-coded fallbacks without failing any automated CI check.
- **Suggestion / Required Action**:
  Author and commit `web/tests/int/commission-config-error.int.spec.ts` (using lightweight stubbed/mocked Payload instances without requiring a database boot) covering:
  1. `CommissionConfigurationError` is thrown with `code: 'COMMISSION_CONFIGURATION_ERROR'` when `payload.findGlobal` throws an error.
  2. `CommissionConfigurationError` is thrown when `defaultRate` is `null`, `undefined`, `NaN`, or non-numeric.
  3. `resolveCommissionRate` succeeds and returns `site-default-v1-0.30` with `source: 'site_default'` when a valid `defaultRate` is present.
  4. Ensure `pnpm vitest run tests/int/commission-config-error.int.spec.ts` passes cleanly.

---

## 3. Observation

### 3.1 Code Inspection & Integrity Review

1. **`web/src/services/earnings.ts` (`getSellerBalance`)**:
   - Lines 136–146:
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
   - **Verification**:
     - `availableBalance` is net of `reservedBalance` and clamped at `0` via `Math.max(0, grossAvailable - reservedBalance)`. Threat T7 overdraft risk is eliminated.
     - `totalEarned` is `grossAvailable + pendingBalance + withdrawnTotal`. `reservedBalance` is not added a second time, resolving the phantom revenue double-counting defect.
     - Integrity check: Genuine arithmetic, no hardcoded return values or facades.

2. **`web/src/services/commission.ts` (Parent Directives C1 & C2)**:
   - Lines 29–35:
     ```ts
     export class CommissionConfigurationError extends Error {
       readonly code = 'COMMISSION_CONFIGURATION_ERROR'
       constructor(message: string) {
         super(message)
         this.name = 'CommissionConfigurationError'
       }
     }
     ```
   - Lines 118–133:
     ```ts
     } catch (err: any) {
       throw new CommissionConfigurationError(
         `Failed to load global commission_settings: ${err?.message || String(err)}`,
       )
     }

     if (
       !settings ||
       typeof settings.defaultRate !== 'number' ||
       isNaN(settings.defaultRate) ||
       settings.defaultRate === null
     ) {
       throw new CommissionConfigurationError(
         'Site default commission rate is missing or invalid in commission_settings global',
       )
     }
     ```
   - Line 138:
     ```ts
     policyVersion: `site-default-v1-${Number(rate).toFixed(2)}`,
     ```
   - **Verification**:
     - Literal `0.30` fallback in `commission.ts` is 100% eliminated.
     - Deterministic version formatting produces `site-default-v1-0.30` for `0.30`.
     - Integrity check: Real logic, zero cheating shortcuts.

3. **`docs/decisions/0009-seller-revenue-policy.md` (Parent Directive C3)**:
   - Lines 76–81: Item 3 updated to record authoritative data in `CommissionSettings` Payload global, strict prohibition against hard-coded fallback rates in code, throwing `CommissionConfigurationError` on failure.
   - Lines 161–173: § Follow-Up records "Resolved (2026-09-16)" detailing Batch 8 migration, resolution precedence, and deterministic `policyVersion` grammar.
   - **Verification**: Synchronized with implementation.

4. **`web/tests/int/seller-earnings.int.spec.ts` (Parent Directive C4)**:
   - Lines 311–317:
     ```ts
     const hasCampaigns = Boolean((payload.collections as any)?.campaigns)
     if (!hasCampaigns) {
       expect((payload.collections as any)?.campaigns).toBeUndefined()
       // Campaign collection deferred from P0 per Decision A2 — positively verified
       return
     }
     ```
   - **Verification**: Positively asserts `(payload.collections as any)?.campaigns` is undefined when campaigns are deferred. Allows Vitest to pass 12/12 tests cleanly without throwing an unhandled test error.

5. **`CommissionSettings.ts`, Migration Batch 8, and `purchase.ts`**:
   - `web/src/globals/CommissionSettings.ts`: Registered in `payload.config.ts`, `defaultRate` bounded between 0 and 1, admin-only update.
   - `web/src/migrations/20260916_000000_phase6_commission_settings.ts`: Creates table `commission_settings` and seeds initial row `default_rate = 0.30`. Registered in `web/src/migrations/index.ts`.
   - `web/src/services/purchase.ts`: Atomic integration of wallet debit, order creation, commission resolution, snapshot line item creation, and `seller_earnings` creation (`PENDING`, 7-day hold date) in a single database transaction.

---

### 3.2 Empirical Verification Commands & Verbatim Results

1. **TypeScript Typecheck**:
   - Command: `pnpm tsc --noEmit` (cwd: `web`)
   - Exit code: `0`
   - Output: `0` errors.

2. **Linter Check**:
   - Command: `pnpm lint` (cwd: `web`)
   - Exit code: `0`
   - Output: `0 errors, 657 warnings` (all pre-existing).

3. **Milestone 2 Integration Test Suite**:
   - Command: `pnpm vitest run tests/int/seller-earnings.int.spec.ts` (cwd: `web`)
   - Exit code: `0`
   - Output:
     ```text
      ✓ tests/int/seller-earnings.int.spec.ts (12 tests) 1574ms
        ✓ Phase 6: Commission Calculation & Seller Earnings Lifecycle (FR-31, BR-07, Decision 0002, Decision 0005) (12)
          ✓ Tier 1: Rate Resolution Hierarchy - Site-wide default fallback returns 30% (0.30)
          ✓ Tier 1: Rate Resolution Hierarchy - Per-seller override rate takes precedence over site default
          ✓ Tier 1: Rate Resolution Hierarchy - Campaign rate takes highest precedence over seller override and default
          ✓ Tier 1: Integer VND Arithmetic Split - Platform fee and seller net computed accurately
          ✓ Tier 2: Arithmetic Conservation Invariant - Zero remainder and no phantom VND across arbitrary prices
          ✓ Tier 2: Boundary - 0 VND Free product produces 0 VND platform fee and 0 VND seller earning
          ✓ Tier 2: Boundary - Extreme commission rates (0% and 100%) calculate without arithmetic error
          ✓ Tier 1: OrderItem Snapshot Freeze (BR-07) - Snapshot fields locked and immune to subsequent catalog price updates
          ✓ Tier 1: Earning Record Creation - Purchase completes and atomically creates seller_earnings with status PENDING
          ✓ Tier 1: Hold Period Maturation - Maturation converts PENDING to AVAILABLE after 7-day hold expires
          ✓ Tier 1: Balance Aggregation - getSellerBalance returns accurate totals before and after maturation
          ✓ Tier 2: Balance Accumulation - Multiple completed sales accumulate accurately into seller pending balance

      Test Files  1 passed (1)
           Tests  12 passed (12)
     ```

4. **Regression Integration Suites**:
   - Command: `pnpm vitest run tests/int/purchase-workflow.int.spec.ts tests/int/purchase-invariants.int.spec.ts tests/int/m1-schema-stress.int.spec.ts tests/int/m1-access-control.int.spec.ts` (cwd: `web`)
   - Exit code: `0`
   - Output:
     ```text
      ✓ tests/int/m1-access-control.int.spec.ts (59 tests) 2099ms
      ✓ tests/int/purchase-workflow.int.spec.ts (6 tests) 1667ms
      ✓ tests/int/m1-schema-stress.int.spec.ts (22 tests) 1232ms
      ✓ tests/int/purchase-invariants.int.spec.ts (10 tests) 1185ms

      Test Files  4 passed (4)
           Tests  97 passed (97)
        Duration  12.93s
     ```

5. **PostgreSQL Database Verification**:
   - Command: `docker exec kientaohub-postgres psql -U payload -d kientaohub -c "SELECT * FROM commission_settings;"`
   - Output:
     ```text
      id | default_rate |         updated_at         |         created_at         
     ----+--------------+----------------------------+----------------------------
       1 |         0.30 | 2026-09-16 01:44:57.287+00 | 2026-09-16 01:44:57.287+00
     (1 row)
     ```
   - Command: `docker exec kientaohub-postgres psql -U payload -d kientaohub -c "SELECT * FROM payload_migrations ORDER BY id DESC LIMIT 2;"`
   - Output:
     ```text
      id |                    name                    | batch |         updated_at         |         created_at         
     ----+--------------------------------------------+-------+----------------------------+----------------------------
      10 | 20260916_000000_phase6_commission_settings |     8 | 2026-09-16 01:44:59.329+00 | 2026-09-16 01:44:59.329+00
       9 | 20260915_100000_phase6_seller_revenue      |     7 | 2026-09-15 13:05:38.169+00 | 2026-09-15 13:05:38.168+00
     ```

---

### 3.3 Adversarial Stress Testing Results

1. **Seller Balance Aggregation Stress Matrix**:
   - Tested `getSellerBalance` with combinations of `grossAvailable`, `reservedBalance`, `pendingBalance`, and `withdrawnTotal`:
     - Case 1: Gross 2,000,000 VND, Reserved 500,000 VND, Pending 100,000 VND, Withdrawn 300,000 VND -> `availableBalance: 1,500,000`, `totalEarned: 2,400,000`, `reservedBalance: 500,000`. PASSED.
     - Case 2 (Oversubscription clamp): Gross 100,000 VND, Reserved 200,000 VND -> `availableBalance: 0` (clamped, not negative), `totalEarned: 100,000`. PASSED.
     - Case 3 (Zero state): All balances 0 -> `availableBalance: 0`, `totalEarned: 0`. PASSED.
   - Result: 0 violations, overdraft risk completely mitigated.

2. **Revenue Split Conservation Invariant**:
   - Evaluated `calculateRevenueSplit` across 300,000 price points (0 to 1,000,000 VND) and rates (0.0 to 1.0).
   - Invariant `platformFee + sellerAmount + tax === amountVnd` strictly holds with 0 remainder. PASSED.

3. **`CommissionConfigurationError` Throw Stress Test**:
   - Evaluated `resolveCommissionRate` against stubbed Payload objects:
     - When `findGlobal` throws an error -> throws `CommissionConfigurationError` with `code: 'COMMISSION_CONFIGURATION_ERROR'`. PASSED.
     - When `findGlobal` returns `{ defaultRate: null }` -> throws `CommissionConfigurationError`. PASSED.
     - When `findGlobal` returns `{ defaultRate: NaN }` -> throws `CommissionConfigurationError`. PASSED.
     - When `findGlobal` returns `{ defaultRate: 0.3 }` -> returns `site-default-v1-0.30`. PASSED.

---

## 4. Logic Chain

1. **Resolution of Finding 1**:
   - Observation 3.1.1 shows `availableBalance: Math.max(0, grossAvailable - reservedBalance)` and `totalEarned: grossAvailable + pendingBalance + withdrawnTotal`.
   - Adversarial stress tests in 3.3.1 confirm that reserved balance is deducted from available balance without inflating lifetime total earned.
   - Deduction: Finding 1 is fully resolved and safe from double-spending.

2. **Implementation of Directives C1–C4**:
   - Observation 3.1.2 shows typed `CommissionConfigurationError`, removal of fallback `0.30`, and deterministic `.toFixed(2)` policy versioning (Directives C1 and C2).
   - Observation 3.1.3 shows ADR 0009 updated and synchronized (Directive C3).
   - Observation 3.1.4 shows positive assertion of campaign deferral with 12/12 passing tests in Vitest (Directive C4).
   - Deduction: Directives C1–C4 are properly implemented.

3. **Test Coverage Gap for C1 Error Branches**:
   - Observations 3.2.3 and 3.2.4 confirm that all existing test suites pass against a healthy, seeded database.
   - Parent notices `2026-09-16T02:01:21Z` and `2026-09-16T02:02:20Z` correctly point out that `CommissionConfigurationError` has zero committed test coverage in `web/tests/`.
   - `vitest.config.mts` line 10 specifies `include: ['tests/int/**/*.int.spec.ts']`.
   - Deduction: Authoring `web/tests/int/commission-config-error.int.spec.ts` will provide committed test coverage for all error throw branches. Therefore, `REQUEST_CHANGES` is issued to enable the dispatch of a worker to commit this test suite.

---

## 5. Caveats

- **Out of Scope for M2**: Withdrawal submission/approval service (`web/src/services/withdrawal.ts`), compensating refund ledger service (`web/src/services/refund.ts`), and seller/admin REST API endpoints are scoped for Milestones 3, 4, and 5 respectively. Their pending tests in downstream suites are expected.
- **Promotional Campaigns Deferred**: Per User Governing Decision A2, promotional campaigns collection is deferred from P0.

---

## 6. Conclusion

The core implementation of Phase 6 Milestone 2 Iteration 2 is correct, robust, and verified with zero regressions. To close the remaining test coverage gap on `CommissionConfigurationError` per orchestrator guidance, the verdict is **`REQUEST_CHANGES`** with Finding 1 directing the creation of `web/tests/int/commission-config-error.int.spec.ts`.

---

## 7. Verification Method

To independently verify after worker commits `web/tests/int/commission-config-error.int.spec.ts`:

1. **Run TypeScript Check**:
   ```bash
   pnpm --prefix web tsc --noEmit
   ```
   *Expected*: Exit code 0, 0 errors.

2. **Run Linter**:
   ```bash
   pnpm --prefix web lint
   ```
   *Expected*: Exit code 0, 0 errors.

3. **Run Milestone 2 Test Suites**:
   ```bash
   pnpm --prefix web vitest run tests/int/seller-earnings.int.spec.ts tests/int/commission-config-error.int.spec.ts
   ```
   *Expected*: All tests pass (100%).

4. **Run Regression Suites**:
   ```bash
   pnpm --prefix web vitest run tests/int/purchase-workflow.int.spec.ts tests/int/purchase-invariants.int.spec.ts tests/int/m1-schema-stress.int.spec.ts tests/int/m1-access-control.int.spec.ts
   ```
   *Expected*: 97 passed / 97 total.
