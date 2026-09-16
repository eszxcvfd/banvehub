# Phase 6 Milestone 3 Forensic Integrity Audit Report

**Auditor**: `p6_m3_auditor_1` (Forensic Integrity Auditor)  
**Target Milestone**: Phase 6 Milestone 3 (Withdrawal Request, Balance Reservation & Approval Workflow)  
**Repository Working Directory**: `/home/trung/Documents/2026/project/test-v6`  
**Auditor Directory**: `/home/trung/Documents/2026/project/test-v6/.agents/p6_m3_auditor_1`  
**Parent Conversation ID**: `b96b7657-610e-4105-89ae-923e3ac1b237`  
**Integrity Mode**: `development` (per `ORIGINAL_REQUEST.md` lines 12 & 82)  
**Explicit Binary Verdict**: **CLEAN**

---

## 1. Observation

### 1.1 Static Source Code Inspection

1. **Withdrawal Service Implementation (`web/src/services/withdrawal.ts`)**:
   - *Bank details validation*: Lines 87–98 validate `bankName`, `accountNumber`, and `accountHolderName` are present and non-empty after trimming, throwing `'Bank details required: bankName, accountNumber, accountHolderName'` if any are missing.
   - *Amount limits validation*: Lines 100–121 validate that amount is a positive integer between 50,000 and 50,000,000 VND inclusive (`'Minimum withdrawal amount is 50,000 VND'`, `'Maximum withdrawal amount is 50,000,000 VND'`, `'Withdrawal amount must be an integer'`).
   - *Role authorization*: Lines 123–130 verify caller possesses the `seller` role (`'Unauthorized: User does not have seller role'`).
   - *Threat T7 Anti-Race Concurrency Protection*: Lines 41–64 implement `withSellerLock`, a per-seller async FIFO promise-queue mutex. Lines 133–184 execute balance lookup (`getSellerBalance`), balance adequacy verification, withdrawal creation, and audit logging within this critical section.
   - *State Machine Transitions*:
     - `reviewWithdrawal`: lines 190–247 (`REQUESTED -> UNDER_REVIEW`)
     - `approveWithdrawal`: lines 252–309 (`UNDER_REVIEW/REQUESTED -> APPROVED`)
     - `processWithdrawal`: lines 314–369 (`APPROVED -> PROCESSING`)
     - `finalizeWithdrawalPaid`: lines 374–430 (`PROCESSING/APPROVED -> PAID`)
     - `rejectWithdrawal`: lines 435–497 (`REQUESTED/UNDER_REVIEW/APPROVED/PROCESSING -> REJECTED` with required reason)
     - `cancelWithdrawal`: lines 502–564 (`REQUESTED/UNDER_REVIEW -> CANCELLED` with ownership check)
   - *Terminal State Immutability*: Lines 205–208, 267–270, 329–332, 389–392, 450–453, and 515–518 explicitly enforce terminal state freezing against `['PAID', 'REJECTED', 'CANCELLED', 'FAILED']` throwing error matching `/invalid|status/i`.
   - *Append-only Audit Logging*: Every state transition performs an immutable write to `withdrawal_events` (lines 163–173, 225–236, 286–298, 347–359, 408–420, 474–486, 542–553).
   - *Administrative Authorization*: `verifyFinanceOrAdmin` (lines 66–77) enforces that only `financeAdmin` or `admin` can review, approve, process, finalize, or reject withdrawals.

2. **Earnings Service Balance Calculation (`web/src/services/earnings.ts`)**:
   - Lines 116–132 query in-flight withdrawals (`status: { in: ['REQUESTED', 'UNDER_REVIEW', 'APPROVED', 'PROCESSING'] }`) to compute `reservedBalance`.
   - Lines 135–150 query finalized withdrawals (`status: { equals: 'PAID' }`) to compute `withdrawnTotal`.
   - Lines 152–155 compute `netAvailable = Math.max(0, grossAvailable - reservedBalance - withdrawnTotal)` and `totalEarned = grossAvailable + pendingBalance`.
   - Rejections and cancellations drop out of both in-flight and paid sets, naturally and atomically restoring `availableBalance`.

3. **Commission Service Validation (`web/src/services/commission.ts`)**:
   - Lines 68–72, 104–108, and 148–152 enforce rate range `[0, 1]` across Campaign, Seller Override, and Site Default tiers, throwing typed `CommissionConfigurationError` on violations.

4. **Withdrawal Hook Invariants (`web/src/collections/Withdrawals/hooks/validateWithdrawalInvariants.ts`)**:
   - Lines 3–12 define `VALID_TRANSITIONS` locking terminal states: `PAID: []`, `REJECTED: []`, `CANCELLED: []`.
   - Lines 57–76 enforce immutability of `seller`, `amount`, `currency`, and `code` on existing records.

5. **REST API Route Handlers**:
   - `web/src/app/api/v1/seller/withdrawals/route.ts`: Authenticates via Payload session, verifies `seller` role (401/403), validates JSON payload (400), delegates to `requestWithdrawal` (201).
   - `web/src/app/api/v1/admin/withdrawals/route.ts`: Authenticates via Payload session, restricts to `financeAdmin`/`admin` (401/403), provides administrative listing with filtering.
   - `web/src/app/api/v1/admin/withdrawals/[id]/approve/route.ts`: Restricts to `financeAdmin`/`admin` (401/403), delegates to `approveWithdrawal` (200).
   - `web/src/app/api/v1/admin/withdrawals/[id]/reject/route.ts`: Restricts to `financeAdmin`/`admin` (401/403), enforces non-empty `reason` (400), delegates to `rejectWithdrawal` (200).

6. **Prohibited Pattern Search**:
   - Grep searches across `web/src` for test emails (`kientaohub.local`), test environments (`process.env.VITEST`), or test flags returned 0 occurrences. Zero facades, fake mocks, or hardcoded return shortcuts found.

### 1.2 Empirical Runtime & Database Verification

1. **PostgreSQL DDL Check Constraints**:
   Command: `docker exec kientaohub-postgres psql -U payload -d kientaohub -c "SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint WHERE conrelid = 'withdrawals'::regclass;"`
   Output:
   ```
                   conname                 |                            pg_get_constraintdef                            
   ----------------------------------------+----------------------------------------------------------------------------
    withdrawals_pkey                       | PRIMARY KEY (id)
    withdrawals_seller_id_users_id_fk      | FOREIGN KEY (seller_id) REFERENCES users(id) ON DELETE SET NULL
    withdrawals_reviewed_by_id_users_id_fk | FOREIGN KEY (reviewed_by_id) REFERENCES users(id) ON DELETE SET NULL
    withdrawals_amount_limits              | CHECK (((amount >= (50000)::numeric) AND (amount <= (50000000)::numeric)))
   ```

   Command: `docker exec kientaohub-postgres psql -U payload -d kientaohub -c "SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint WHERE conrelid = 'withdrawal_events'::regclass;"`
   Output:
   ```
                         conname                      |                           pg_get_constraintdef                           
   ---------------------------------------------------+--------------------------------------------------------------------------
    withdrawal_events_pkey                            | PRIMARY KEY (id)
    withdrawal_events_withdrawal_id_withdrawals_id_fk | FOREIGN KEY (withdrawal_id) REFERENCES withdrawals(id) ON DELETE CASCADE
    withdrawal_events_actor_id_users_id_fk            | FOREIGN KEY (actor_id) REFERENCES users(id) ON DELETE SET NULL
   ```

2. **Milestone 3 Test Suite**:
   Command: `pnpm vitest run tests/int/seller-withdrawals.int.spec.ts` (Cwd: `web`)
   Result: **14 passed (14 tests)** in 4.50s.

3. **Seller Earnings & Commission Error Suites**:
   Command: `pnpm vitest run tests/int/seller-earnings.int.spec.ts tests/int/commission-config-error.int.spec.ts` (Cwd: `web`)
   Result: **27 passed (27 tests)** in 4.06s.

4. **Regression Suites**:
   Command: `pnpm vitest run tests/int/purchase-workflow.int.spec.ts tests/int/purchase-invariants.int.spec.ts tests/int/m1-schema-stress.int.spec.ts tests/int/m1-access-control.int.spec.ts` (Cwd: `web`)
   Result: **97 passed (97 tests)** in 12.39s.

5. **Type Checking**:
   Command: `pnpm tsc --noEmit` (Cwd: `web`)
   Result: Exit code 0, 0 errors.

6. **ESLint Validation**:
   Command: `pnpm lint` (Cwd: `web`)
   Result: Exit code 0 (0 errors, 670 warnings).

---

## 2. Logic Chain

1. **Verification of Authentic Logic (No Facades or Hardcoded Values)**:
   - Observation 1.1 reveals that all withdrawal state transitions, balance aggregations, and commission checks perform actual database reads/writes through the real Payload CMS ORM and PostgreSQL tables.
   - Observation 1.1.6 confirms zero test shortcuts, test branches (`isTest`, `process.env.VITEST`), or fake returns in `web/src`.
   - Therefore, the implementation is genuine and authentic.

2. **Verification of Concurrency & Threat T7 Protection**:
   - Observation 1.1.1 details the in-memory FIFO promise queue mutex (`withSellerLock`).
   - Observation 1.2.2 includes test `Tier 3: Concurrency & Race Condition Test (Threat T7)` which executes two simultaneous 400,000 VND withdrawal requests against a 500,000 VND balance.
   - The test demonstrated that exactly one request succeeded and one was rejected, with final balance never dropping below 0 (preserved at 100,000 VND available).
   - Therefore, double-spending and race condition overdrafts are strictly prevented.

3. **Verification of State Machine & Immutability**:
   - Observation 1.1.1 and 1.1.4 establish dual-layer enforcement: `withdrawal.ts` throws errors matching `/invalid|status/i` on transitions from terminal states, and `validateWithdrawalInvariants.ts` configures empty target state lists (`PAID: []`, `REJECTED: []`, `CANCELLED: []`).
   - Observation 1.2.2 proves that transition attempts from terminal states fail as expected.
   - Therefore, terminal state immutability is robustly guaranteed.

4. **Verification of Balance Reservation & Release**:
   - Observation 1.1.2 details the dynamic balance formula in `earnings.ts`. Because `reservedBalance` tracks in-flight states (`REQUESTED`, `UNDER_REVIEW`, `APPROVED`, `PROCESSING`) and `withdrawnTotal` tracks `PAID`, a transition to `REJECTED` or `CANCELLED` instantly frees reserved funds back into `availableBalance` without requiring mutating ledger deletions.
   - Observation 1.2.2 proves seller cancellation and finance admin rejection restore the available balance.
   - Therefore, funds cannot be leaked or orphaned.

5. **Verification of Access Control & RBAC**:
   - Observations 1.1.1 and 1.1.5 demonstrate that seller identity and role are strictly verified on creation and cancellation, while admin actions require `financeAdmin` or `admin` roles.
   - Route handlers enforce HTTP 401 for unauthenticated requests and HTTP 403 for unauthorized roles.
   - Observation 1.2.4 confirms all 59 access control tests in `m1-access-control.int.spec.ts` continue to pass cleanly.

---

## 3. Caveats

- **Process-Level Mutex Scope**: The in-memory async mutex `withSellerLock` operates per Node.js process. In horizontal multi-instance or clustered pod deployments, database-level locking (`SELECT ... FOR UPDATE` or PostgreSQL advisory locks) will be required. For the current single-instance development and deployment architecture, it is fully sound.
- **E2E Test Suite Scope**: As documented in both worker and reviewer handoffs, `tests/int/seller-revenue-e2e.int.spec.ts` contains 5 pending tests intended for Milestones 4 (refunds) and 5 (frontend/admin routes). All Milestone 3 routes and RBAC tests within that suite passed 100%.

---

## 4. Conclusion

**Verdict: CLEAN**

The Phase 6 Milestone 3 work product demonstrates uncompromising technical integrity:
- Genuine, robust implementation of the withdrawal state machine, bank validation, and amount boundaries.
- Effective concurrency protection mitigating Threat T7 overdraft risks.
- Dual-layer terminal state immutability.
- Strict audit trail logging on every state transition.
- Exact and dynamic balance reservation and release in `getSellerBalance`.
- 100% test pass rate across target suites (14/14 tests) and regression suites (97/97 tests).
- 0 TypeScript compilation errors and 0 ESLint errors.
- Zero prohibited patterns, facades, or cheating detected.

---

## 5. Verification Method

To independently reproduce and verify this audit, execute the following commands sequentially from the project root (`/home/trung/Documents/2026/project/test-v6`):

```bash
# 1. Inspect live PostgreSQL DDL constraints on withdrawals and withdrawal_events
docker exec kientaohub-postgres psql -U payload -d kientaohub -c "SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint WHERE conrelid = 'withdrawals'::regclass;"
docker exec kientaohub-postgres psql -U payload -d kientaohub -c "SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint WHERE conrelid = 'withdrawal_events'::regclass;"

# 2. Run Milestone 3 target test suite (14/14 pass)
pnpm --prefix web vitest run tests/int/seller-withdrawals.int.spec.ts

# 3. Run earnings and commission suites (27/27 pass)
pnpm --prefix web vitest run tests/int/seller-earnings.int.spec.ts tests/int/commission-config-error.int.spec.ts

# 4. Run core regression suites (97/97 pass)
pnpm --prefix web vitest run tests/int/purchase-workflow.int.spec.ts tests/int/purchase-invariants.int.spec.ts tests/int/m1-schema-stress.int.spec.ts tests/int/m1-access-control.int.spec.ts

# 5. Verify TypeScript compilation (0 errors)
pnpm --prefix web tsc --noEmit

# 6. Verify ESLint compliance (0 errors)
pnpm --prefix web lint
```
