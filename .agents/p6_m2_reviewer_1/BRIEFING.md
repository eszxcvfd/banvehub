# BRIEFING — 2026-09-16T01:53:00Z

## Mission
Independent review & adversarial verification of Phase 6 Milestone 2 (Commission Calculation & Seller Earnings Pipeline).

## 🔒 My Identity
- Archetype: reviewer_critic
- Roles: reviewer, critic
- Working directory: /home/trung/Documents/2026/project/test-v6/.agents/p6_m2_reviewer_1
- Original parent: b96b7657-610e-4105-89ae-923e3ac1b237
- Milestone: Phase 6 Milestone 2
- Instance: 1 of 1

## 🔒 Key Constraints
- Review-only — do NOT modify implementation code
- Run commands sequentially, not concurrently (RAM is tight)
- Run plain commands WITHOUT rtk prefix
- For PostgreSQL, use docker exec kientaohub-postgres psql -U payload -d kientaohub -c "..."
- REPO HYGIENE: Do NOT revert, stash, reset, or checkout
- Check for integrity violations (hardcoded test results, facade implementations, task bypassing, fabricated outputs)

## Current Parent
- Conversation ID: b96b7657-610e-4105-89ae-923e3ac1b237
- Updated: 2026-09-16T01:53:00Z

## Review Scope
- **Files to review**:
  - `web/src/globals/CommissionSettings.ts`
  - `web/src/payload.config.ts`
  - `web/src/migrations/20260916_000000_phase6_commission_settings.ts`
  - `web/src/migrations/index.ts`
  - `web/src/services/commission.ts`
  - `web/src/services/earnings.ts`
  - `web/src/services/purchase.ts`
  - `web/tests/int/seller-earnings.int.spec.ts`
- **Interface contracts**:
  - `/home/trung/Documents/2026/project/test-v6/.agents/ORIGINAL_REQUEST.md`
  - `/home/trung/Documents/2026/project/test-v6/.agents/orchestrator/PROJECT.md`
  - `/home/trung/Documents/2026/project/test-v6/.agents/p6_m2_worker_1/handoff.md`
- **Review criteria**: correctness, style, conformance, integer-VND arithmetic conservation, adversarial robustness, integrity

## Key Decisions Made
- Executed all empirical verification commands (tsc, lint, vitest suites, DB queries).
- Executed adversarial stress test on `calculateRevenueSplit` with 50,000 iterations: 0 violations.
- Executed adversarial checks on `SellerEarnings` hooks (`preventEarningMutation`, `calculateHoldUntil`, `validateEarningMath`): all passed.
- Discovered Critical Defect in `web/src/services/earnings.ts`: `getSellerBalance` fails to deduct `reservedBalance` from `availableBalance`, and double-counts `reservedBalance` in `totalEarned`.
- Verdict: REQUEST_CHANGES.

## Artifact Index
- `handoff.md` — Final review and verification findings with verdict REQUEST_CHANGES

## Review Checklist
- **Items reviewed**:
  - `web/src/globals/CommissionSettings.ts` (APPROVED)
  - `web/src/payload.config.ts` (APPROVED)
  - `web/src/migrations/20260916_000000_phase6_commission_settings.ts` (APPROVED)
  - `web/src/migrations/index.ts` (APPROVED)
  - `web/src/services/commission.ts` (APPROVED)
  - `web/src/services/purchase.ts` (APPROVED)
  - `web/tests/int/seller-earnings.int.spec.ts` (APPROVED)
  - `web/src/services/earnings.ts` (DEFECT FOUND: `getSellerBalance`)
- **Verdict**: REQUEST_CHANGES
- **Unverified claims**: none; all claims tested empirically

## Attack Surface
- **Hypotheses tested**:
  - Floating point inaccuracy in integer VND math: PASSED (0 phantom VND across 50,000 cases).
  - Snapshot field mutation in `seller_earnings`: BLOCKED (12/12 fields immutable).
  - Illegal status transitions in `seller_earnings`: BLOCKED (7/7 illegal transitions rejected).
  - Seller balance under in-flight withdrawals: FAILED (in-flight withdrawals do not deduct from `availableBalance`, creating double-spend vector and phantom `totalEarned`).
- **Vulnerabilities found**:
  - Critical: `getSellerBalance` does not reserve balance from `availableBalance` and double-counts `totalEarned`.
- **Untested angles**: none for M2 scope
