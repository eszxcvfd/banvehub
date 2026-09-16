# BRIEFING — 2026-09-16T08:48:00+07:00

## Mission
Deliver KienTaoHub Phase 6 Milestone 2 (Commission Calculation & Seller Earnings Pipeline)

## 🔒 My Identity
- Archetype: implementer / qa / specialist
- Roles: implementer, qa, specialist
- Working directory: /home/trung/Documents/2026/project/test-v6/.agents/p6_m2_worker_1
- Original parent: b96b7657-610e-4105-89ae-923e3ac1b237
- Milestone: Phase 6 Milestone 2 (Commission Calculation & Seller Earnings Pipeline)

## 🔒 Key Constraints
- RAM is tight: run commands sequentially
- Plain commands without rtk prefix
- For PostgreSQL: docker exec kientaohub-postgres psql -U payload -d kientaohub -c "..."
- Repo hygiene: do NOT revert, stash, reset, or checkout
- Genuine implementations only: no cheats, no hardcoding
- Maintain docs/plans/active/phase-6-seller-revenue.md

## Current Parent
- Conversation ID: b96b7657-610e-4105-89ae-923e3ac1b237
- Updated: 2026-09-16T08:42:13Z

## Task Summary
- **What to build**: CommissionSettings global + migration batch 8 + DB table; services/commission.ts (resolveCommissionRate, calculateRevenueSplit); services/earnings.ts (releaseMaturedEarnings, getSellerBalance); atomic purchaseProduct integration in services/purchase.ts; test guard update in tests/int/seller-earnings.int.spec.ts.
- **Success criteria**: Vitest tests pass for seller-earnings.int.spec.ts, tsc passes, lint passes.
- **Interface contracts**: PROJECT.md / ORIGINAL_REQUEST.md
- **Code layout**: web/src/

## Change Tracker
- **Files modified**:
  - `web/src/globals/CommissionSettings.ts`: Created GlobalConfig with defaultRate field
  - `web/src/payload.config.ts`: Registered CommissionSettings in globals array
  - `web/src/migrations/20260916_000000_phase6_commission_settings.ts`: Created Batch 8 migration
  - `web/src/migrations/index.ts`: Appended Batch 8 migration to exports
  - `web/src/services/commission.ts`: Created commission resolution & revenue split functions
  - `web/src/services/earnings.ts`: Created releaseMaturedEarnings & getSellerBalance
  - `web/src/services/purchase.ts`: Integrated atomic commission resolution, OrderItem snapshot fields, and seller_earnings creation
  - `web/src/endpoints/seed/index.ts`: Fixed globals type narrowing for header & footer
  - `web/tests/int/seller-earnings.int.spec.ts`: Added Decision A2 honest campaign guard and sellerProfiles cleanup
- **Build status**: PASS (`pnpm tsc --noEmit` exit code 0)
- **Pending issues**: none

## Quality Status
- **Build/test result**: PASS (11 passed, 1 honest guarded pending skip on deferred campaigns)
- **Lint status**: PASS (0 errors, 654 warnings across repo)
- **Tests added/modified**: `tests/int/seller-earnings.int.spec.ts`

## Loaded Skills
- None

## Key Decisions Made
- Defer campaigns collection lookup per Governing Decision A2; fallback to seller override -> site default.
- Use integer VND round-half-safe math: platformFee = Math.round(amountVnd * rate), sellerAmount = amountVnd - platformFee - tax.
- Set holdUntil to +7 days in seller_earnings creation to satisfy Payload compile-time typing and DB constraints.

## Artifact Index
- docs/plans/active/phase-6-seller-revenue.md — Active repo plan
- .agents/p6_m2_worker_1/progress.md — Progress log
- .agents/p6_m2_worker_1/handoff.md — Final handoff report
