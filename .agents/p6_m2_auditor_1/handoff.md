# Forensic Audit Report & Handoff: Phase 6 Milestone 2

**Agent ID**: `p6_m2_auditor_1`  
**Parent Conversation ID**: `b96b7657-610e-4105-89ae-923e3ac1b237`  
**Milestone**: Phase 6 Milestone 2 (Commission Calculation & Seller Earnings Pipeline)  
**Status**: Hard Handoff (Audit Complete)  
**Profile**: General Project  
**Integrity Mode**: Development (per `ORIGINAL_REQUEST.md`)  
**Verdict**: **`CLEAN`**

---

## Forensic Audit Report

**Work Product**: Phase 6 Milestone 2 (Commission Calculation & Seller Earnings Pipeline)  
**Profile**: General Project  
**Verdict**: **`CLEAN`**

### Phase Results
- **Hardcoded Test Results**: PASS — 0 hardcoded test results, outputs, or strings found in project source.
- **Facade Implementations**: PASS — All services (`commission.ts`, `earnings.ts`, `purchase.ts`) contain authentic domain logic and database transactions.
- **Fabricated Verification Outputs**: PASS — 0 pre-populated logs, mock result files, or fake outputs found in workspace.
- **Self-Certifying Tests**: PASS — Integration tests assert against real database state, transaction rollbacks, and authentic class instances.
- **Execution Delegation**: PASS — Core logic is implemented directly within application services, without delegation to unauthorized external frameworks or tools.
- **Live Database Schema & Migration**: PASS — Table `commission_settings` exists with 1 row (`default_rate = 0.30`); Batch 8 migration tracked in `payload_migrations`.
- **Commission Resolution & Arithmetic**: PASS — 3-tier precedence hierarchy; strict `CommissionConfigurationError` on missing/invalid config; deterministic `site-default-v1-0.30` version format; integer-VND rounding conservation (`platformFee + sellerAmount + tax === amountVnd`).
- **Seller Balance Aggregation**: PASS — `availableBalance` properly reserves in-flight withdrawals (`Math.max(0, grossAvailable - reservedBalance)`); `totalEarned` eliminates phantom double-counting (`grossAvailable + pendingBalance + withdrawnTotal`).
- **Atomic Purchase Checkout**: PASS — Freezes snapshot line items in `order_items` and inserts `seller_earnings` (`PENDING`, 7-day hold) in the same database transaction.
- **Committed Test Coverage**: PASS — All 27 Milestone 2 integration tests pass (12 in `seller-earnings.int.spec.ts`, 15 in `commission-config-error.int.spec.ts`).
- **Typecheck & Linting**: PASS — `tsc --noEmit` exits 0 with 0 errors; `lint` exits 0 with 0 errors.
- **Regression Suites**: PASS — 97/97 tests pass across Phase 5 and Milestone 1 suites.

---

## 1. Observation

### 1.1 Source Code Static Inspection
1. **`web/src/globals/CommissionSettings.ts`**:
   - Slug: `'commission_settings'`.
   - Access: `read: () => true`, `update: adminOnly`.
   - Field `defaultRate`: `type: 'number'`, `required: true`, `defaultValue: 0.30`, `min: 0`, `max: 1`.
   - Registered in `web/src/payload.config.ts` line 131: `globals: [Header, Footer, CommissionSettings]`.
2. **`web/src/migrations/20260916_000000_phase6_commission_settings.ts`**:
   - Real DDL creating table `commission_settings` (`id serial PRIMARY KEY`, `default_rate numeric DEFAULT 0.30`, timestamps) and inserting initial seed row of 0.30 if not exists.
   - Down migration drops table with cascade.
   - Registered at index 8 in `web/src/migrations/index.ts`.
3. **`web/src/services/commission.ts`**:
   - `resolveCommissionRate`:
     - Tier 1: Checks `campaignId` and verifies existence of `campaigns` collection (deferred from P0 per Decision A2).
     - Tier 2: Queries `seller_profiles` by seller user ID; if valid `commissionRate` exists, returns `{ commissionRate, policyVersion: 'seller-override-...', source: 'seller_override' }`.
     - Tier 3: Queries `commission_settings` global via `payload.findGlobal`.
     - Error handling: Throws `CommissionConfigurationError` if `findGlobal` throws or if `defaultRate` is missing, null, undefined, NaN, or non-numeric. Zero hardcoded literal `0.30` return fallback.
     - Deterministic version formatting: `site-default-v1-${Number(rate).toFixed(2)}` produces `site-default-v1-0.30`.
   - `calculateRevenueSplit`:
     - `platformFee = Math.round(amountVnd * rate)`
     - `sellerAmount = amountVnd - platformFee - roundedTax`
     - Exact invariant: `platformFee + sellerAmount + tax === amountVnd`.
4. **`web/src/services/earnings.ts`**:
   - `releaseMaturedEarnings`:
     - Finds `seller_earnings` where `status === 'PENDING'` and `holdUntil <= asOfIso`.
     - Updates each doc to `status: 'AVAILABLE'` and sets `availableAt: new Date().toISOString()`.
   - `getSellerBalance`:
     - Fetches earnings for `sellerId`: aggregates `pendingBalance`, `availableBalance` (gross), and `withdrawnTotal`.
     - Fetches in-flight `withdrawals` (`REQUESTED`, `UNDER_REVIEW`, `APPROVED`, `PROCESSING`): aggregates `reservedBalance`.
     - Net available calculation: `netAvailable = Math.max(0, grossAvailable - reservedBalance)`.
     - Total earned calculation: `totalEarned = grossAvailable + pendingBalance + withdrawnTotal`.
5. **`web/src/services/purchase.ts`**:
   - Coordinates transactional purchase using `initTransaction`, `commitTransaction`, and `killTransaction`.
   - Populates snapshot line items in `order_items` (`salePrice`, `platformFee`, `sellerAmount`, `tax`, `policyVersion`).
   - Inserts `seller_earnings` record with `status: 'PENDING'`, `holdPeriodDays: 7`, and `holdUntil: new Date(Date.now() + 7 * 86400000).toISOString()` inside the same atomic transaction.
6. **`web/tests/int/seller-earnings.int.spec.ts` & `web/tests/int/commission-config-error.int.spec.ts`**:
   - Genuine integration tests asserting data persistence, snapshot immutability, hold maturation, balance aggregation, and error throwing.
   - Zero test bypasses or fakes.

---

### 1.2 Empirical Runtime Verification (Verbatim Outputs)

#### 1. PostgreSQL Live Database State
```bash
$ docker exec kientaohub-postgres psql -U payload -d kientaohub -c "SELECT * FROM commission_settings;"
 id | default_rate |         updated_at         |         created_at         
----+--------------+----------------------------+----------------------------
  1 |         0.30 | 2026-09-16 01:44:57.287+00 | 2026-09-16 01:44:57.287+00
(1 row)

$ docker exec kientaohub-postgres psql -U payload -d kientaohub -c "SELECT * FROM payload_migrations WHERE batch = 8;"
 id |                    name                    | batch |         updated_at         |         created_at         
----+--------------------------------------------+-------+----------------------------+----------------------------
 10 | 20260916_000000_phase6_commission_settings |     8 | 2026-09-16 01:44:59.329+00 | 2026-09-16 01:44:59.329+00
(1 row)
```

#### 2. Milestone 2 Integration Tests
```bash
$ pnpm vitest run tests/int/seller-earnings.int.spec.ts tests/int/commission-config-error.int.spec.ts
(cwd: /home/trung/Documents/2026/project/test-v6/web)

 ✓ tests/int/seller-earnings.int.spec.ts (12 tests) 1816ms
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
 ✓ tests/int/commission-config-error.int.spec.ts (15 tests) 7ms

 Test Files  2 passed (2)
      Tests  27 passed (27)
   Duration  3.92s
```

#### 3. TypeScript Compilation
```bash
$ pnpm tsc --noEmit
(cwd: /home/trung/Documents/2026/project/test-v6/web)
Exit code: 0 (0 errors)
```

#### 4. ESLint Quality Check
```bash
$ pnpm lint
(cwd: /home/trung/Documents/2026/project/test-v6/web)
Exit code: 0 (0 errors, 657 pre-existing warnings in legacy files)
```

#### 5. Phase 5 & Milestone 1 Regression Verification
```bash
$ pnpm vitest run tests/int/purchase-workflow.int.spec.ts tests/int/purchase-invariants.int.spec.ts tests/int/m1-schema-stress.int.spec.ts tests/int/m1-access-control.int.spec.ts
(cwd: /home/trung/Documents/2026/project/test-v6/web)

 ✓ tests/int/m1-access-control.int.spec.ts (59 tests) 2152ms
 ✓ tests/int/purchase-workflow.int.spec.ts (6 tests) 1742ms
 ✓ tests/int/purchase-invariants.int.spec.ts (10 tests) 1327ms
 ✓ tests/int/m1-schema-stress.int.spec.ts (22 tests) 1252ms

 Test Files  4 passed (4)
      Tests  97 passed (97)
   Duration  13.38s
```

---

## 2. Logic Chain

1. **Authority & Ground Truth**:
   - `ORIGINAL_REQUEST.md` specifies that commission rate must be configurable data (not hard-coded) and that `seller_earnings` must be created with `PENDING` status upon purchase and mature to `AVAILABLE` after 7 days.
   - Governing Decision A1 dictates that the site-wide default rate lives in the `CommissionSettings` global seeded to 0.30.
   - Observation 1.1.1 and 1.2.1 confirm that `CommissionSettings` and Batch 8 migration exist in code and in the live PostgreSQL database.
2. **Defect Resolution & Threat T7 Overdraft Mitigation**:
   - Reviewer 1 identified that `getSellerBalance` did not deduct `reservedBalance` from `availableBalance`, and added `reservedBalance` to `totalEarned`, causing overdraft risk and phantom earnings.
   - Worker 2 rectified this via `netAvailable = Math.max(0, grossAvailable - reservedBalance)` and `totalEarned = grossAvailable + pendingBalance + withdrawnTotal`.
   - Independent verification via AST inspection and TSX script execution proved that under `grossAvailable = 2,000,000` and `reserved = 500,000`, `netAvailable` is exactly `1,500,000` and `totalEarned` is `2,400,000` (zero inflation).
3. **Strict Error Handling & Version Grammar (Parent Directives C1–C3)**:
   - Worker 2 removed the silent fallback `0.30` in `commission.ts` and threw typed `CommissionConfigurationError` whenever global data is missing or invalid.
   - Reviewer 2 identified that these error throw branches lacked committed test coverage.
   - Worker 3 authored `web/tests/int/commission-config-error.int.spec.ts`, exercising all 15 error/success scenarios across 5 distinct test categories.
   - Empirical run verified 15/15 tests pass in 7ms.
4. **Conservation Invariant & Atomic Execution**:
   - `calculateRevenueSplit` guarantees `platformFee + sellerAmount + tax === amountVnd` across all price ranges and rates.
   - `purchaseProduct` integrates wallet debit, snapshot line item creation, and pending earning creation in a single transaction that rolls back cleanly via `killTransaction` if any step fails.
   - Empirical regression test runs show 97/97 tests pass without error.
5. **Absence of Prohibited Patterns**:
   - Zero hardcoded test outputs, zero facade dummy functions, zero fabricated log files, zero self-certifying tests, and zero execution delegation.

---

## 3. Caveats

- **Campaigns Collection**: Per User Governing Decision A2, the promotional campaigns collection is deferred from P0. The tier-1 resolution code in `commission.ts` safely inspects `payload.collections.campaigns`, and `seller-earnings.int.spec.ts` positively verifies its deferral.
- **Downstream Milestones Pending**: Milestone 3 (`services/withdrawal.ts`), Milestone 4 (`services/refund.ts`), and Milestone 5 (REST APIs / UI) are planned for subsequent milestones; pending checks in downstream test suites are expected and do not affect Milestone 2.
- **No Caveats on Milestone 2 Scope**: All Milestone 2 deliverables are fully implemented, verified, and operational.

---

## 4. Conclusion

Phase 6 Milestone 2 (Commission Calculation & Seller Earnings Pipeline) is authentically and flawlessly implemented. The work product adheres strictly to `ORIGINAL_REQUEST.md`, `PROJECT.md`, ADR 0009, and User Governing Decisions A1 and A2. All empirical runtime verification commands, database queries, typechecks, linters, and regression suites passed with 100% success.

Final Forensic Verdict: **`CLEAN`**

---

## 5. Verification Method

To independently verify this verdict:

1. **Verify Database Table and Migration**:
   ```bash
   docker exec kientaohub-postgres psql -U payload -d kientaohub -c "SELECT * FROM commission_settings;"
   docker exec kientaohub-postgres psql -U payload -d kientaohub -c "SELECT * FROM payload_migrations WHERE batch = 8;"
   ```
   *Expected*: 1 row with `default_rate = 0.30` in `commission_settings`; Batch 8 migration tracked.

2. **Run Milestone 2 Integration Tests**:
   ```bash
   cd /home/trung/Documents/2026/project/test-v6/web && pnpm vitest run tests/int/seller-earnings.int.spec.ts tests/int/commission-config-error.int.spec.ts
   ```
   *Expected*: 27 passed / 27 total.

3. **Run TypeScript Check & ESLint**:
   ```bash
   cd /home/trung/Documents/2026/project/test-v6/web && pnpm tsc --noEmit
   cd /home/trung/Documents/2026/project/test-v6/web && pnpm lint
   ```
   *Expected*: Exit code 0, 0 errors.

4. **Run Regression Suites**:
   ```bash
   cd /home/trung/Documents/2026/project/test-v6/web && pnpm vitest run tests/int/purchase-workflow.int.spec.ts tests/int/purchase-invariants.int.spec.ts tests/int/m1-schema-stress.int.spec.ts tests/int/m1-access-control.int.spec.ts
   ```
   *Expected*: 97 passed / 97 total.
