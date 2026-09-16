## 2026-09-16T01:54:03Z

You are p6_m2_worker_2, an implementation worker for KienTaoHub Phase 6 Milestone 2 (Commission Calculation & Seller Earnings Pipeline), iteration 2.
Your working directory is: /home/trung/Documents/2026/project/test-v6/.agents/p6_m2_worker_2.
Project root: /home/trung/Documents/2026/project/test-v6.
Authoritative Request: /home/trung/Documents/2026/project/test-v6/.agents/ORIGINAL_REQUEST.md.
Global Blueprint: /home/trung/Documents/2026/project/test-v6/.agents/orchestrator/PROJECT.md.
Reviewer Handoff: /home/trung/Documents/2026/project/test-v6/.agents/p6_m2_reviewer_1/handoff.md.
Parent Conversation ID: b96b7657-610e-4105-89ae-923e3ac1b237.

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

CRITICAL OPERATIONAL RULES:
1. RAM IS TIGHT: Run commands sequentially, not concurrently.
2. COMMANDS & ENVIRONMENT: Run plain commands WITHOUT rtk prefix (`pnpm ...`, `pnpm --prefix web ...`, `vitest run ...`). For PostgreSQL, host has NO psql binary — always use `docker exec kientaohub-postgres psql -U payload -d kientaohub -c "..."`.
3. REPO HYGIENE: Do NOT revert, stash, reset, or checkout.
4. Read /home/trung/Documents/2026/project/test-v6/.agents/ORIGINAL_REQUEST.md and the Reviewer Handoff before starting work.

MISSION: RESOLVE REVIEWER FINDING 1 IN `web/src/services/earnings.ts`
Reviewer `p6_m2_reviewer_1` reported a critical financial defect in `getSellerBalance` (Finding 1):
- `availableBalance` currently returns the raw sum of `AVAILABLE` earnings without deducting `reservedBalance` when in-flight withdrawals exist. This creates an overdraft vulnerability (Threat T7 / FR-32) and breaks downstream M3 / E2E assertions (`seller-withdrawals.int.spec.ts` line 187, `seller-revenue-e2e.int.spec.ts` line 347).
- `totalEarned` adds `availableBalance + pendingBalance + withdrawnTotal + reservedBalance`, which double-counts `reservedBalance`.

REQUIRED FIX:
In `web/src/services/earnings.ts` (`getSellerBalance`):
1. Compute:
   ```ts
   const grossAvailable = availableBalance // sum of earning.status === 'AVAILABLE'
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
2. Verify:
   - Run `pnpm --prefix web tsc --noEmit` -> 0 errors.
   - Run `pnpm --prefix web lint` -> 0 errors.
   - Run `pnpm --prefix web vitest run tests/int/seller-earnings.int.spec.ts` -> all 11 pass + 1 honest guarded skip.
   - Run `pnpm --prefix web vitest run tests/int/purchase-workflow.int.spec.ts tests/int/purchase-invariants.int.spec.ts` -> 16/16 pass.
3. Update `docs/plans/active/phase-6-seller-revenue.md` noting the balance reservation fix.
4. Write handoff report to `/home/trung/Documents/2026/project/test-v6/.agents/p6_m2_worker_2/handoff.md`.
5. Send completion message to parent.

## 2026-09-16T01:55:58Z

**Context**: Phase 6 Milestone 2 Iteration 2 Scope Extension (Parent Directive C1–C4)
**Content**: In addition to fixing `getSellerBalance` (Finding 1), you are directed to implement the following 4 required items (C1–C4) before running verification:

### C1 — 🔴 Remove Hard-Coded Literal Default Rate in `commission.ts` (Authority Violation)
- In `web/src/services/commission.ts` lines ~105-110, remove the fallback:
  `return { commissionRate: 0.30, policyVersion: 'site-default-v1-0.30', source: 'site_default' }`
- Per ADR 0009 item 3 & User Decision A1: rate is configuration/data, NOT code.
- Make failure explicit: if `commission_settings` cannot be read or `defaultRate` is not a valid number, throw a typed error:
  ```ts
  export class CommissionConfigurationError extends Error {
    readonly code = 'COMMISSION_CONFIGURATION_ERROR'
    constructor(message: string) {
      super(message)
      this.name = 'CommissionConfigurationError'
    }
  }
  ```
  Throw this error when the global setting is missing or invalid, rather than silently defaulting to 30%.

### C2 — Canonical, Deterministic `policyVersion` String
- Format `policyVersion` deterministically using `Number(settings.defaultRate).toFixed(2)`:
  `site-default-v1-${Number(settings.defaultRate).toFixed(2)}` -> generates `site-default-v1-0.30` (not `site-default-v1-0.3`).

### C3 — Update ADR 0009 § Follow-Up (`docs/decisions/0009-seller-revenue-policy.md`)
- Update lines 158-159 in `docs/decisions/0009-seller-revenue-policy.md`:
  Replace with a "Resolved (2026-09-16)" record documenting the `CommissionSettings` global, Batch 8 migration DDL + ledger entry, resolution precedence, `policyVersion` grammar (`site-default-v1-0.30`), and C1 outcome (failure to read data throws explicit error; no hard-coded fallback).
- Update item 3 in ADR 0009 to reflect that site-default commission setting now exists as data in `CommissionSettings` global, with strict prohibition against hard-coded fallback rates.

### C4 — Campaign Test Must Be a Verified Pending SKIP, Not a FAILURE
- In `web/tests/int/seller-earnings.int.spec.ts` (lines 312-316):
  Replace the throwing error with a positive assertion of deferral:
  ```ts
  expect((payload.collections as any)?.campaigns).toBeUndefined()
  // Campaign collection deferred from P0 per Decision A2 — positively verified
  return
  ```
  This ensures Vitest runs 12/12 passing tests without any failed tests, while positively verifying the deferral.
- The tier-1 campaign resolver branch in `commission.ts` must remain present and reachable.

### Verification & Downstream Check:
1. `pnpm --prefix web tsc --noEmit`
2. `pnpm --prefix web lint`
3. `pnpm --prefix web vitest run tests/int/seller-earnings.int.spec.ts` (should show 12 passed / 12)
4. `pnpm --prefix web vitest run tests/int/purchase-workflow.int.spec.ts tests/int/purchase-invariants.int.spec.ts tests/int/m1-schema-stress.int.spec.ts tests/int/m1-access-control.int.spec.ts`
5. Run downstream test suites to check for any regressions:
   `pnpm --prefix web vitest run tests/int/seller-withdrawals.int.spec.ts`
   `pnpm --prefix web vitest run tests/int/seller-revenue-e2e.int.spec.ts`
   Report failure counts and reasons in your handoff.
6. Write full results to `/home/trung/Documents/2026/project/test-v6/.agents/p6_m2_worker_2/handoff.md`.

**Action**: Execute Finding 1 fix + C1–C4, run verification, update handoff, and report completion.
