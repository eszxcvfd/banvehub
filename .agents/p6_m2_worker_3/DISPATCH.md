## 2026-09-16T02:03:49Z

You are p6_m2_worker_3, an implementation worker for KienTaoHub Phase 6 Milestone 2 (Commission Calculation & Seller Earnings Pipeline) Iteration 3.
Your working directory is: /home/trung/Documents/2026/project/test-v6/.agents/p6_m2_worker_3.
Project root: /home/trung/Documents/2026/project/test-v6.
Authoritative Request: /home/trung/Documents/2026/project/test-v6/.agents/ORIGINAL_REQUEST.md.
Global Blueprint: /home/trung/Documents/2026/project/test-v6/.agents/orchestrator/PROJECT.md.
Reviewer 2 Handoff: /home/trung/Documents/2026/project/test-v6/.agents/p6_m2_reviewer_2/handoff.md.
Parent Conversation ID: b96b7657-610e-4105-89ae-923e3ac1b237.

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

CRITICAL OPERATIONAL RULES:
1. RAM IS TIGHT: Run commands sequentially, not concurrently.
2. COMMANDS & ENVIRONMENT: Run plain commands WITHOUT rtk prefix (`pnpm ...`, `pnpm --prefix web ...`, `vitest run ...`). For PostgreSQL, host has NO psql binary — always use `docker exec kientaohub-postgres psql -U payload -d kientaohub -c "..."`.
3. REPO HYGIENE: Do NOT revert, stash, reset, or checkout.
4. Read /home/trung/Documents/2026/project/test-v6/.agents/ORIGINAL_REQUEST.md before starting work.

MISSION: AUTHOR COMMITTED TEST FILE `web/tests/int/commission-config-error.int.spec.ts`
Per Reviewer 2 Finding 1 and Parent Directive, author committed integration test coverage for `CommissionConfigurationError` throw branches in `web/src/services/commission.ts`.

REQUIREMENTS:
1. Target File: `web/tests/int/commission-config-error.int.spec.ts`
   (Note: must be in `tests/int/` with `.int.spec.ts` suffix to match `vitest.config.mts` inclusion pattern).
2. Execution Mode: Pure stubbed test — do NOT boot database or call `getPayload`. Use a minimal stub:
   ```ts
   import { describe, expect, it, vi } from 'vitest'
   import type { Payload } from 'payload'
   import { resolveCommissionRate, CommissionConfigurationError } from '@/services/commission'
   ```
3. Test Cases to implement:
   - Case 1: `findGlobal` throws/rejects -> `await expect(resolveCommissionRate(mockPayload, { sellerId: 1, productId: 10 })).rejects.toThrow(CommissionConfigurationError)`. Also verify error message contains `'Failed to load global commission_settings'`.
   - Case 2: `findGlobal` returns null or undefined -> `await expect(resolveCommissionRate(mockPayload, { sellerId: 1, productId: 10 })).rejects.toThrow(CommissionConfigurationError)`.
   - Case 3: `defaultRate` is missing, null, undefined, non-numeric string ('0.30'), or NaN -> `await expect(resolveCommissionRate(mockPayload, { sellerId: 1, productId: 10 })).rejects.toThrow(CommissionConfigurationError)`.
   - Case 4: `findGlobal` returns valid number (e.g. 0.30) and no seller override -> resolves `{ commissionRate: 0.30, policyVersion: 'site-default-v1-0.30', source: 'site_default' }`.
   - Case 5: Verify error instance properties: `err instanceof CommissionConfigurationError === true`, `err.code === 'COMMISSION_CONFIGURATION_ERROR'`.

4. Verification Commands:
   - `pnpm --prefix web vitest run tests/int/commission-config-error.int.spec.ts` -> all pass.
   - `pnpm --prefix web vitest run tests/int/seller-earnings.int.spec.ts` -> 12/12 pass.
   - `pnpm --prefix web tsc --noEmit` -> 0 errors.
   - `pnpm --prefix web lint` -> 0 errors.

5. Update `docs/plans/active/phase-6-seller-revenue.md` noting committed test coverage for `CommissionConfigurationError`.
6. Write handoff report to `/home/trung/Documents/2026/project/test-v6/.agents/p6_m2_worker_3/handoff.md`.
7. Send completion message to parent.
