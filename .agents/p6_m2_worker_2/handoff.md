# Handoff Report: Resolution of Reviewer Finding 1 & Directives C1–C4 (Iteration 2)

**Agent ID**: `p6_m2_worker_2`  
**Parent Conversation ID**: `b96b7657-610e-4105-89ae-923e3ac1b237`  
**Milestone**: Phase 6 Milestone 2 (Commission Calculation & Seller Earnings Pipeline) — Iteration 2  
**Handoff Type**: Hard Handoff (Task Complete)  

---

## 1. Observation

### 1.1 Source Code Changes
1. **`web/src/services/earnings.ts` (`getSellerBalance`)**:
   - Lines 80–87: Updated docstring to clarify that `availableBalance` is the net withdrawable balance after deducting `reservedBalance` (minimum 0), and `totalEarned` is `grossAvailable + pendingBalance + withdrawnTotal`.
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
   - Eliminated Threat T7 / FR-32 overdraft vulnerability where available balance was not reduced by in-flight withdrawals.
   - Eliminated phantom revenue double counting where `reservedBalance` was added on top of unreduced `availableBalance`.

2. **`web/src/services/commission.ts` (Directives C1 & C2)**:
   - Lines 29–35: Exported typed error class:
     ```ts
     export class CommissionConfigurationError extends Error {
       readonly code = 'COMMISSION_CONFIGURATION_ERROR'
       constructor(message: string) {
         super(message)
         this.name = 'CommissionConfigurationError'
       }
     }
     ```
   - Lines 107–134: Removed hard-coded `0.30` literal fallback return value. Now, if `payload.findGlobal` fails or `defaultRate` is missing/not a number/null, `resolveCommissionRate` throws `CommissionConfigurationError` per ADR 0009 item 3 & User Governing Decision A1.
   - Formatted `policyVersion` deterministically using `Number(rate).toFixed(2)`:
     `site-default-v1-${Number(rate).toFixed(2)}` (generating `site-default-v1-0.30`).

3. **`web/tests/int/seller-earnings.int.spec.ts` (Directive C4)**:
   - Lines 311–317: Replaced throwing `Error('M2 pending: ...')` with a positive assertion of deferral:
     ```ts
     const hasCampaigns = Boolean((payload.collections as any)?.campaigns)
     if (!hasCampaigns) {
       expect((payload.collections as any)?.campaigns).toBeUndefined()
       // Campaign collection deferred from P0 per Decision A2 — positively verified
       return
     }
     ```
   - Tier-1 campaign resolution branch in `commission.ts` remains present and reachable. Vitest now executes 12/12 passing tests without any failure.

4. **`docs/decisions/0009-seller-revenue-policy.md` (Directive C3)**:
   - Line 76–80: Updated item 3 to state that the site-default commission setting exists as authoritative data in the `CommissionSettings` Payload global (`commission_settings` table seeded at 0.30 in Batch 8 migration), with strict prohibition against hard-coded fallback rates in code, throwing `CommissionConfigurationError` on failure.
   - Lines 161–173: Documented "Resolved (2026-09-16)" record in § Follow-Up covering `CommissionSettings`, Batch 8 migration DDL + ledger entry, resolution precedence, canonical `policyVersion` grammar (`site-default-v1-0.30`), and C1 outcome.

5. **`docs/plans/active/phase-6-seller-revenue.md`**:
   - Documented the balance reservation fix in `getSellerBalance`, strict configuration authority in `commission.ts`, canonical `policyVersion`, and positive campaign deferral verification. Updated task checklist to reflect all tasks complete.

### 1.2 Verification Commands & Empirical Results
1. **TypeScript Verification**:
   - Command: `pnpm tsc --noEmit` (cwd: `web`)
   - Exit code: `0`
   - Errors: `0`

2. **Linter Verification**:
   - Command: `pnpm lint` (cwd: `web`)
   - Exit code: `0`
   - Errors: `0` (657 existing warnings)

3. **Milestone 2 Integration Test Suite**:
   - Command: `pnpm vitest run tests/int/seller-earnings.int.spec.ts` (cwd: `web`)
   - Results: **12 passed / 12 total** (100% pass) in 3.18s:
     - `Tier 1: Rate Resolution Hierarchy - Site-wide default fallback returns 30% (0.30)`: PASS
     - `Tier 1: Rate Resolution Hierarchy - Per-seller override rate takes precedence over site default`: PASS
     - `Tier 1: Rate Resolution Hierarchy - Campaign rate takes highest precedence over seller override and default`: PASS (positively verified deferral)
     - `Tier 1: Integer VND Arithmetic Split - Platform fee and seller net computed accurately`: PASS
     - `Tier 2: Arithmetic Conservation Invariant - Zero remainder and no phantom VND across arbitrary prices`: PASS
     - `Tier 2: Boundary - 0 VND Free product produces 0 VND platform fee and 0 VND seller earning`: PASS
     - `Tier 2: Boundary - Extreme commission rates (0% and 100%) calculate without arithmetic error`: PASS
     - `Tier 1: OrderItem Snapshot Freeze (BR-07) - Snapshot fields locked and immune to subsequent catalog price updates`: PASS
     - `Tier 1: Earning Record Creation - Purchase completes and atomically creates seller_earnings with status PENDING`: PASS
     - `Tier 1: Hold Period Maturation - Maturation converts PENDING to AVAILABLE after 7-day hold expires`: PASS
     - `Tier 1: Balance Aggregation - getSellerBalance returns accurate totals before and after maturation`: PASS
     - `Tier 2: Balance Accumulation - Multiple completed sales accumulate accurately into seller pending balance`: PASS

4. **Regression Test Suites**:
   - Command: `pnpm vitest run tests/int/purchase-workflow.int.spec.ts tests/int/purchase-invariants.int.spec.ts tests/int/m1-schema-stress.int.spec.ts tests/int/m1-access-control.int.spec.ts` (cwd: `web`)
   - Results: **97 passed / 97 total** (100% pass) in 12.43s:
     - `m1-access-control.int.spec.ts`: 59/59 passed
     - `purchase-workflow.int.spec.ts`: 6/6 passed
     - `purchase-invariants.int.spec.ts`: 10/10 passed
     - `m1-schema-stress.int.spec.ts`: 22/22 passed

5. **Downstream Test Suites Check**:
   - `pnpm vitest run tests/int/seller-withdrawals.int.spec.ts`:
     - Result: 14 failed (14 tests). All 14 failures are explicit guards: `M3 pending: requestWithdrawal service not yet implemented in web/src/services/withdrawal.ts`. No regressions introduced; suite cleanly awaits Milestone 3 implementation.
   - `pnpm vitest run tests/int/seller-revenue-e2e.int.spec.ts`:
     - Result: 1 passed, 10 failed. The 10 failures are explicitly: 3 pending M3 withdrawal services, 2 pending M4 refund services, and 5 pending M5 REST API routes. No regressions introduced; suite cleanly awaits subsequent milestones.

6. **Direct Logic Verification via Node/TSX**:
   - Command: verified `netAvailable` math (`Math.max(0, 2000000 - 500000) === 1500000`) and `totalEarned` (`2000000 + 100000 + 300000 === 2400000`).
   - Verified `CommissionConfigurationError` throwing when global setting is missing or invalid.
   - Verified deterministic `policyVersion` returns `site-default-v1-0.30`.

---

## 2. Logic Chain

1. **Overdraft Vulnerability & Phantom Revenue Resolution (Finding 1)**:
   - *Observation*: Reviewer `p6_m2_reviewer_1` found that in `getSellerBalance`, `availableBalance` was raw gross available earnings and was not decremented by in-flight withdrawals (`reservedBalance`), and `totalEarned` added `availableBalance + ... + reservedBalance`, counting reserved earnings twice.
   - *Logic*: Deducting `reservedBalance` via `Math.max(0, grossAvailable - reservedBalance)` guarantees withdrawable funds accurately reflect active commitments, satisfying FR-32 and preventing race/overdraft attacks (Threat T7). Setting `totalEarned = grossAvailable + pendingBalance + withdrawnTotal` maintains true lifetime accrued revenue without phantom inflation.
   - *Conclusion*: Finding 1 is completely resolved.

2. **Strict Authority & Error Typing (Directives C1 & C2)**:
   - *Observation*: ADR 0009 item 3 and Decision A1 dictate that commission rate is authoritative configuration/data, never hard-coded literal numbers in code. The prior implementation had a silent `0.30` fallback in `catch`.
   - *Logic*: By exporting `CommissionConfigurationError` and throwing it whenever `commission_settings` global cannot be read or contains non-numeric data, missing configuration becomes an explicit, discoverable operational error instead of silent behavior. Deterministically formatting `policyVersion` with `.toFixed(2)` guarantees reproducible audit snapshots matching `site-default-v1-0.30`.
   - *Conclusion*: Directives C1 and C2 are fully satisfied.

3. **ADR 0009 Synchronization (Directive C3)**:
   - *Observation*: ADR 0009 lines 158–159 previously stated that site-default commission source must be declared before pipeline is built.
   - *Logic*: Now that Batch 8 migration and `CommissionSettings` global are implemented and live, updating item 3 and the § Follow-Up section with a "Resolved (2026-09-16)" entry keeps repository documentation aligned with implementation reality.
   - *Conclusion*: Directive C3 is fully satisfied.

4. **Test Cleanliness & Verified Deferral (Directive C4)**:
   - *Observation*: Test 3 in `seller-earnings.int.spec.ts` threw an error to signal deferral of campaigns collection from P0 per Decision A2, registering as a failed test.
   - *Logic*: Asserting `expect((payload.collections as any)?.campaigns).toBeUndefined()` positively validates that campaigns collection is deferred while allowing Vitest to exit 0 with 12/12 passing tests, without removing the tier-1 campaign resolver code path in `commission.ts`.
   - *Conclusion*: Directive C4 is fully satisfied.

---

## 3. Caveats

- **Downstream Milestones Pending**: As expected, `seller-withdrawals.int.spec.ts` (M3) and `seller-revenue-e2e.int.spec.ts` (M3–M5) have pending tests that require Milestone 3 (`src/services/withdrawal.ts`), Milestone 4 (`src/services/refund.ts`), and Milestone 5 (API routes).
- **Campaigns Collection**: Per Governing Decision A2, promotional campaigns collection is deferred from P0.

---

## 4. Conclusion

Milestone 2 Iteration 2 is **100% COMPLETE**:
- Finding 1 (balance reservation & totalEarned double-count) is resolved in `web/src/services/earnings.ts`.
- Directives C1 & C2 (hard-coded default removal, `CommissionConfigurationError`, deterministic `policyVersion`) are implemented in `web/src/services/commission.ts`.
- Directive C3 (ADR 0009 synchronization) is updated in `docs/decisions/0009-seller-revenue-policy.md`.
- Directive C4 (verified pending skip) is implemented in `web/tests/int/seller-earnings.int.spec.ts`.
- All quality gates pass: `tsc --noEmit` (0 errors), `lint` (0 errors), `seller-earnings.int.spec.ts` (12/12 passed), regression suites (97/97 passed).

---

## 5. Verification Method

To independently verify the implementation:

1. **TypeScript Type Check**:
   ```bash
   cd /home/trung/Documents/2026/project/test-v6/web && pnpm tsc --noEmit
   ```
   *Expected*: Exits with code 0, 0 errors.

2. **ESLint**:
   ```bash
   cd /home/trung/Documents/2026/project/test-v6/web && pnpm lint
   ```
   *Expected*: Exits with code 0, 0 errors.

3. **Milestone 2 Seller Earnings Suite**:
   ```bash
   cd /home/trung/Documents/2026/project/test-v6/web && pnpm vitest run tests/int/seller-earnings.int.spec.ts
   ```
   *Expected*: 12 passed / 12 total.

4. **Milestone 1 & Phase 5 Regression Suites**:
   ```bash
   cd /home/trung/Documents/2026/project/test-v6/web && pnpm vitest run tests/int/purchase-workflow.int.spec.ts tests/int/purchase-invariants.int.spec.ts tests/int/m1-schema-stress.int.spec.ts tests/int/m1-access-control.int.spec.ts
   ```
   *Expected*: 97 passed / 97 total.

5. **Direct Inspection of Error Handling and Versioning**:
   ```bash
   cd /home/trung/Documents/2026/project/test-v6/web && pnpm tsx -e "
   import { resolveCommissionRate, CommissionConfigurationError } from './src/services/commission';
   const err = new CommissionConfigurationError('test');
   console.log('Error code:', err.code);
   "
   ```
