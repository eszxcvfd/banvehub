# BRIEFING — 2026-09-16T08:58:40+07:00

## Mission
Resolve Reviewer Finding 1 in web/src/services/earnings.ts (deduct reservedBalance from availableBalance and fix totalEarned) and execute Parent Directives C1–C4.

## 🔒 My Identity
- Archetype: worker
- Roles: implementer, qa, specialist
- Working directory: /home/trung/Documents/2026/project/test-v6/.agents/p6_m2_worker_2
- Original parent: b96b7657-610e-4105-89ae-923e3ac1b237
- Milestone: Phase 6 Milestone 2 (Commission Calculation & Seller Earnings Pipeline), iteration 2

## 🔒 Key Constraints
- Run commands sequentially, not concurrently (RAM is tight).
- Run plain commands WITHOUT rtk prefix (`pnpm ...`, `pnpm --prefix web ...`, `vitest run ...`).
- For PostgreSQL, host has NO psql binary — always use `docker exec kientaohub-postgres psql -U payload -d kientaohub -c "..."`.
- REPO HYGIENE: Do NOT revert, stash, reset, or checkout.
- Integrity: No cheats, no dummy implementations, maintain real state.

## Current Parent
- Conversation ID: b96b7657-610e-4105-89ae-923e3ac1b237
- Updated: 2026-09-16T08:56:00+07:00

## Task Summary
- **What to build**:
  - Finding 1: In `web/src/services/earnings.ts` (`getSellerBalance`), deduct `reservedBalance` from `grossAvailable` to yield `netAvailable`, and calculate `totalEarned = grossAvailable + pendingBalance + withdrawnTotal`.
  - C1: In `web/src/services/commission.ts`, export `CommissionConfigurationError` and eliminate hard-coded literal fallback rate (0.30). Throw typed error on missing/invalid config.
  - C2: In `web/src/services/commission.ts`, format `policyVersion` canonically with `.toFixed(2)`: `site-default-v1-0.30`.
  - C3: Update `docs/decisions/0009-seller-revenue-policy.md` (item 3 and § Follow-Up).
  - C4: In `web/tests/int/seller-earnings.int.spec.ts`, positively assert campaign deferral: `expect(campaigns).toBeUndefined()`.
  - Update `docs/plans/active/phase-6-seller-revenue.md`.
- **Success criteria**:
  - `pnpm tsc --noEmit` -> 0 errors (verified: 0 errors)
  - `pnpm lint` -> 0 errors (verified: 0 errors)
  - `seller-earnings.int.spec.ts` -> 12 passed / 12 (verified: 12/12)
  - Regression suites -> 97 passed / 97 (verified: 97/97)
  - Downstream suites evaluated and documented
- **Interface contracts**: `PROJECT.md` and `docs/plans/active/phase-6-seller-revenue.md`
- **Code layout**: `web/src/services/`

## Change Tracker
- **Files modified**:
  - `web/src/services/earnings.ts`: Fixed `getSellerBalance` netAvailable and totalEarned calculation.
  - `web/src/services/commission.ts`: Added `CommissionConfigurationError`, removed hardcoded rate, canonical `policyVersion`.
  - `web/tests/int/seller-earnings.int.spec.ts`: Replaced throwing error with positive deferral assertion.
  - `docs/decisions/0009-seller-revenue-policy.md`: Documented resolution of item 3 with Batch 8 migration and CommissionSettings global.
  - `docs/plans/active/phase-6-seller-revenue.md`: Updated with iteration 2 fixes and verified test results.
- **Build status**: All checks and tests PASS cleanly.
- **Pending issues**: None.

## Quality Status
- **Build/test result**: PASS (tsc 0 errors, lint 0 errors, seller-earnings 12/12, regressions 97/97).
- **Lint status**: 0 errors (657 existing warnings in codebase).
- **Tests added/modified**: Positive deferral skip in `seller-earnings.int.spec.ts`, verified balance deduction math.

## Loaded Skills
None requested.

## Key Decisions Made
- Implemented net available balance deduction `Math.max(0, grossAvailable - reservedBalance)` to prevent overdraft Threat T7.
- Enforced strict configuration authority in `commission.ts` throwing typed `CommissionConfigurationError` with zero code fallbacks.
- Deterministic policy versioning `site-default-v1-${Number(rate).toFixed(2)}`.

## Artifact Index
- `/home/trung/Documents/2026/project/test-v6/.agents/p6_m2_worker_2/DISPATCH.md` — Assignment & parent directives
- `/home/trung/Documents/2026/project/test-v6/.agents/p6_m2_worker_2/BRIEFING.md` — Situational awareness
- `/home/trung/Documents/2026/project/test-v6/.agents/p6_m2_worker_2/progress.md` — Heartbeat & progress log
- `/home/trung/Documents/2026/project/test-v6/.agents/p6_m2_worker_2/handoff.md` — Handoff report
