# BRIEFING — 2026-09-16T09:03:00+07:00

## Mission
Independent review and adversarial verification of Phase 6 Milestone 2 Iteration 2 deliverables.

## 🔒 My Identity
- Archetype: reviewer_critic
- Roles: reviewer, critic
- Working directory: /home/trung/Documents/2026/project/test-v6/.agents/p6_m2_reviewer_2
- Original parent: b96b7657-610e-4105-89ae-923e3ac1b237
- Milestone: p6_m2
- Instance: 2 of 2

## 🔒 Key Constraints
- Review-only — do NOT modify implementation code
- RAM IS TIGHT: Run commands sequentially, not concurrently
- Plain commands WITHOUT rtk prefix
- For PostgreSQL: docker exec kientaohub-postgres psql -U payload -d kientaohub -c "..."
- REPO HYGIENE: Do NOT revert, stash, reset, or checkout

## Current Parent
- Conversation ID: b96b7657-610e-4105-89ae-923e3ac1b237
- Updated: 2026-09-16T02:02:20Z (C1 coverage gap & path correction received)

## Review Scope
- **Files to review**:
  - `web/src/services/earnings.ts`
  - `web/src/services/commission.ts`
  - `docs/decisions/0009-seller-revenue-policy.md`
  - `web/tests/int/seller-earnings.int.spec.ts`
  - `web/src/globals/CommissionSettings.ts`
  - `web/src/migrations/20260916_000000_phase6_commission_settings.ts`
  - `web/src/services/purchase.ts`
- **Interface contracts**: PROJECT.md, ORIGINAL_REQUEST.md
- **Review criteria**: Correctness, Logical Completeness, Quality, Adversarial Robustness, Integrity

## Key Decisions Made
- Confirmed Finding 1 (overdraft & phantom revenue) is completely resolved in `earnings.ts`.
- Confirmed Directives C1–C4 are properly implemented in source and documentation.
- Empirical testing passed 100%: `tsc` (0 errors), `lint` (0 errors), `seller-earnings.int.spec.ts` (12/12), regression suites (97/97).
- Evaluated Parent Directive on C1 test coverage gap: `CommissionConfigurationError` error-throw branches currently lack committed test coverage in `web/tests/`.
- Path resolution: `vitest.config.mts` includes `tests/int/**/*.int.spec.ts`. The committed test should be `web/tests/int/commission-config-error.int.spec.ts`.
- Issuing `REQUEST_CHANGES` to dispatch worker for `commission-config-error.int.spec.ts`.

## Artifact Index
- `DISPATCH.md` — Incoming dispatch instructions
- `progress.md` — Liveness heartbeat and step tracking
- `handoff.md` — Final review report

## Review Checklist
- **Items reviewed**: `earnings.ts`, `commission.ts`, `0009-seller-revenue-policy.md`, `seller-earnings.int.spec.ts`, `CommissionSettings.ts`, Batch 8 migration, `purchase.ts`.
- **Verdict**: `REQUEST_CHANGES` (Coverage Gap on `CommissionConfigurationError` error throw branches).
- **Unverified claims**: none; all claims verified empirically.

## Attack Surface
- **Hypotheses tested**:
  - Balance math with arbitrary in-flight withdrawals and oversubscription: PASSED (clamped at 0, no phantom revenue).
  - Commission split arithmetic conservation across arbitrary prices: PASSED.
  - `CommissionConfigurationError` throwing on DB drop and invalid defaultRate: PASSED in adversarial script.
  - Snapshot immutability: PASSED.
- **Vulnerabilities found**:
  - Zero committed test coverage in `web/tests/int/` for `CommissionConfigurationError` throw branches.
- **Untested angles**:
  - Committed vitest execution of `commission-config-error.int.spec.ts` awaiting worker creation.
