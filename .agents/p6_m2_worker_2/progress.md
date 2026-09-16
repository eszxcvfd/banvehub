# Progress Log — p6_m2_worker_2

Last visited: 2026-09-16T08:58:35+07:00

## Status
- [x] Initialized workspace and briefing.
- [x] Inspected Reviewer Handoff (Finding 1) and Parent Directives C1–C4.
- [x] Implemented Finding 1 in `web/src/services/earnings.ts` (`getSellerBalance`):
  - `grossAvailable = availableBalance`
  - `netAvailable = Math.max(0, grossAvailable - reservedBalance)`
  - `totalEarned = grossAvailable + pendingBalance + withdrawnTotal`
  - `availableBalance: netAvailable` returned.
- [x] Implemented Directive C1 & C2 in `web/src/services/commission.ts`:
  - Exported `CommissionConfigurationError`
  - Removed hardcoded 0.30 literal fallback rate in `resolveCommissionRate`
  - Throws `CommissionConfigurationError` if global missing or rate not a number
  - Deterministic policy version: `site-default-v1-${Number(rate).toFixed(2)}` (`site-default-v1-0.30`)
- [x] Implemented Directive C3 in `docs/decisions/0009-seller-revenue-policy.md`:
  - Updated item 3 and added "Resolved (2026-09-16)" record in § Follow-Up
- [x] Implemented Directive C4 in `web/tests/int/seller-earnings.int.spec.ts`:
  - Verified positive skip for deferred campaigns collection (`expect(campaigns).toBeUndefined()`)
- [x] Updated active plan `docs/plans/active/phase-6-seller-revenue.md`
- [x] Verification completed:
  - `tsc --noEmit`: 0 errors
  - `lint`: 0 errors
  - `seller-earnings.int.spec.ts`: 12 passed / 12 total
  - Regression suites (`purchase-workflow`, `purchase-invariants`, `m1-schema-stress`, `m1-access-control`): 97 passed / 97 total
  - Downstream suites (`seller-withdrawals`, `seller-revenue-e2e`): run and documented
- [ ] Next: Write handoff report and send completion message to parent.
