# BRIEFING — 2026-09-16T02:22:00Z

## Mission
Deliver Phase 6 Milestone 3: Withdrawal Request, Balance Reservation & Approval Workflow, including withdrawal service, earnings service updates, commission rate validation, REST API routes, and verification against all target and regression suites.

## 🔒 My Identity
- Archetype: worker
- Roles: implementer, qa, specialist
- Working directory: /home/trung/Documents/2026/project/test-v6/.agents/p6_m3_worker_1
- Original parent: b96b7657-610e-4105-89ae-923e3ac1b237
- Milestone: Phase 6 Milestone 3

## 🔒 Key Constraints
- Plain commands WITHOUT rtk prefix (`pnpm ...`, `pnpm --prefix web ...`, `vitest run ...`).
- RAM IS TIGHT: Run commands sequentially, not concurrently.
- For PostgreSQL, host has NO psql binary — always use `docker exec kientaohub-postgres psql -U payload -d kientaohub -c "..."`.
- REPO HYGIENE: 55+ uncommitted files carry prior milestone work. Do NOT revert, stash, reset, or checkout. Treat working tree as source of truth.
- DO NOT CHEAT: Genuine implementations only; no dummy/facade implementations, no hardcoded test results.
- Maintain `docs/plans/active/phase-6-seller-revenue.md`.

## Current Parent
- Conversation ID: b96b7657-610e-4105-89ae-923e3ac1b237
- Updated: 2026-09-16T02:22:00Z

## Task Summary
- **What to build**:
  1. `web/src/services/withdrawal.ts`: Full withdrawal service lifecycle (`requestWithdrawal`, `reviewWithdrawal`, `approveWithdrawal`, `processWithdrawal`, `finalizeWithdrawalPaid`, `rejectWithdrawal`, `cancelWithdrawal`), in-memory mutex concurrency serialization per seller (T7 anti-race), input validations.
  2. `web/src/services/earnings.ts`: In `getSellerBalance`, compute `withdrawnTotal` from PAID withdrawals and factor into `netAvailable = Math.max(0, grossAvailable - reservedBalance - withdrawnTotal)`.
  3. `web/src/services/commission.ts`: Add range check `if (rate < 0 || rate > 1) throw new CommissionConfigurationError(...)` in `resolveCommissionRate`.
  4. 4 REST API endpoints:
     - `web/src/app/api/v1/seller/withdrawals/route.ts` (GET, POST)
     - `web/src/app/api/v1/admin/withdrawals/route.ts` (GET)
     - `web/src/app/api/v1/admin/withdrawals/[id]/approve/route.ts` (POST)
     - `web/src/app/api/v1/admin/withdrawals/[id]/reject/route.ts` (POST)
  5. Update `docs/plans/active/phase-6-seller-revenue.md`.
  6. Verification: 14/14 tests in `seller-withdrawals.int.spec.ts`, 27/27 in `seller-earnings.int.spec.ts` + `commission-config-error.int.spec.ts`, 97/97 regression tests, tsc, lint.
- **Success criteria**: All tests pass, tsc passes, lint passes, handoff.md written, message sent to parent.

## Key Decisions Made
- Implemented FIFO Promise-chained async mutex per seller (`withSellerLock`) to serialize concurrent withdrawal checks and creations, preventing overdrafts (Threat T7).
- Updated `VALID_TRANSITIONS` in `validateWithdrawalInvariants.ts` to support `APPROVED -> PAID` and `PROCESSING -> REJECTED`.
- Enforced strict authorization: actor role checked before entity query so unauthorized callers always receive 403/unauthorized error without entity leakage.
- Corrected test setup helper `seedAvailableEarning` in `seller-withdrawals.int.spec.ts` to instantiate required relational chain (product, order, orderItem) and commission rate, with clean teardown in `afterAll`.

## Artifact Index
- `.agents/p6_m3_worker_1/DISPATCH.md` — assignment
- `.agents/p6_m3_worker_1/BRIEFING.md` — working memory
- `.agents/p6_m3_worker_1/progress.md` — liveness heartbeat
- `.agents/p6_m3_worker_1/handoff.md` — final handoff report
- `web/src/services/withdrawal.ts` — full withdrawal lifecycle service
- `web/src/app/api/v1/seller/withdrawals/route.ts` — seller withdrawals REST route
- `web/src/app/api/v1/admin/withdrawals/route.ts` — admin withdrawals list route
- `web/src/app/api/v1/admin/withdrawals/[id]/approve/route.ts` — admin approve route
- `web/src/app/api/v1/admin/withdrawals/[id]/reject/route.ts` — admin reject route

## Change Tracker
- **Files modified**:
  - `web/src/services/withdrawal.ts`: Created full withdrawal service
  - `web/src/services/earnings.ts`: Updated `getSellerBalance` calculation for `withdrawnTotal` and `netAvailable`
  - `web/src/services/commission.ts`: Added rate range validation (`[0, 1]`)
  - `web/src/collections/Withdrawals/hooks/validateWithdrawalInvariants.ts`: Added transitions `APPROVED -> PAID` and `PROCESSING -> REJECTED`
  - `web/src/app/api/v1/seller/withdrawals/route.ts`: Created GET/POST route
  - `web/src/app/api/v1/admin/withdrawals/route.ts`: Created GET route
  - `web/src/app/api/v1/admin/withdrawals/[id]/approve/route.ts`: Created POST route
  - `web/src/app/api/v1/admin/withdrawals/[id]/reject/route.ts`: Created POST route
  - `web/tests/int/seller-withdrawals.int.spec.ts`: Fixed `seedAvailableEarning` relational seed helper
  - `docs/plans/active/phase-6-seller-revenue.md`: Documented M3 deliverables and marked COMPLETED
- **Build status**: PASS (tsc: 0 errors, lint: 0 errors)
- **Pending issues**: none

## Quality Status
- **Build/test result**:
  - `seller-withdrawals.int.spec.ts`: 14/14 PASS
  - `seller-earnings.int.spec.ts` + `commission-config-error.int.spec.ts`: 27/27 PASS
  - Regression (4 suites): 97/97 PASS
  - TypeScript (`tsc --noEmit`): 0 errors
  - ESLint (`pnpm lint`): 0 errors
- **Lint status**: 0 errors
- **Tests added/modified**: `seller-withdrawals.int.spec.ts` seed helper updated with complete DB relational lifecycle

## Loaded Skills
None required.
