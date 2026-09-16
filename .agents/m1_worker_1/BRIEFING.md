# BRIEFING — 2026-09-15T11:15:00Z

## Mission
Implement Phase 6 Milestone 1 (Data Models, Access Controls & Migration Batch 7): Collections SellerEarnings, Withdrawals, WithdrawalEvents, Refunds, access controls, hooks, status enum updates in Orders, SellerProfiles commissionRate override, payload.config.ts registration, PostgreSQL Migration Batch 7, migrate & generate types, build, lint, and test verification.

## 🔒 My Identity
- Archetype: teamwork_preview_worker
- Roles: implementer, qa, specialist
- Working directory: /home/trung/Documents/2026/project/test-v6/.agents/m1_worker_1
- Original parent: 902fae86-8610-4959-9027-f4a48d29b1e8
- Milestone: Milestone 1 - Schema & Migration Batch 6
- Current parent: 7c1d229b-1583-4f43-924a-e6290887757a
- Phase 6 Milestone: Phase 6 Milestone 1 - Data Models, Access Controls & Migration Batch 7

## 🔒 Key Constraints
- DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results or create dummy implementations.
- Write only to exclusive write ownership files and own .agents/m1_worker_1 directory.
- Verify everything with `pnpm --prefix web test:int` (all 17 existing suites must pass 100%) and `pnpm --prefix web lint` (0 errors).
- All 5 digital marketplace invariants (BR-01, BR-04, BR-07, BR-10, BR-13) must be preserved in schema, access controls, hooks, and migration.
- Money write layer: direct writes denied for all principals (canEditMoney).
- Immutable ledger & reversal entries: refunds never delete or mutate existing ledger rows (BR-03).
- Snapshot price and commission rate immutability (BR-07).
- Strict RBAC: only Admin and FinanceAdmin can approve withdrawals, initiate refunds, and modify seller commissionRate.
- Existing 347 tests across 22 suites must continue to pass 100%.

## Current Parent
- Conversation ID: 7c1d229b-1583-4f43-924a-e6290887757a
- Updated: 2026-09-15T11:15:00Z

## Task Summary
- **What to build**: Phase 6 Milestone 1 data layer:
  1. `Orders`: add 'REFUNDED' to status options, add earnings join relation.
  2. `api/v1/me/orders/route.ts`: allow 'REFUNDED' status filter.
  3. `components/OrderStatus/index.tsx`: add 'REFUNDED' badge styling.
  4. `access/sellerProfileAccess.ts`: add `adminOrFinanceAdminFieldAccess` and `commissionRateReadAccess`.
  5. `collections/SellerProfiles.ts`: add `commissionRate` field with access control.
  6. `access/sellerEarningsAccess.ts`: add `sellerEarningsReadAccess`.
  7. `collections/SellerEarnings/`: hooks (`calculateHoldUntil.ts`, `validateEarningMath.ts`, `preventEarningMutation.ts`) and collection config.
  8. `access/withdrawalAccess.ts`: add withdrawal & event access controls.
  9. `collections/Withdrawals/`: hooks (`generateWithdrawalCode.ts`, `validateWithdrawalInvariants.ts`) and collection config.
  10. `collections/WithdrawalEvents/`: hooks (`preventWithdrawalEventMutation.ts`) and collection config.
  11. `access/refundAccess.ts`: add `refundReadAccess`.
  12. `collections/Refunds/index.ts`: collection config with code generator hook.
  13. `payload.config.ts`: register SellerEarnings, Withdrawals, WithdrawalEvents, Refunds.
  14. `migrations/20260915_100000_phase6_seller_revenue.ts`: Batch 7 DDL (up and down).
  15. `migrations/index.ts`: register Batch 7 migration.
  16. Execute migration `pnpm --prefix web payload migrate`, generate types `pnpm --prefix web generate:types`.
  17. Verify build, lint, and tests.
- **Success criteria**:
  - Batch 7 migration runs cleanly.
  - Types generated with zero errors.
  - All 347 tests across 22 test suites pass.
  - 0 lint errors, clean build.
- **Interface contracts**: PROJECT.md, m1_explorer_1/handoff.md, m1_explorer_2/handoff.md, m1_explorer_3/handoff.md

## Key Decisions Made
- Implemented standard canEditMoney protection on all financial collections (SellerEarnings, Withdrawals, WithdrawalEvents, Refunds).
- Commission rate on SellerProfiles is protected by `adminOrFinanceAdminFieldAccess` (updates) and `commissionRateReadAccess` (reads).
- Batch 7 migration provides atomic DDL with enum alterations, foreign keys, btree/unique indices, and check constraints for financial math and withdrawal limits.

## Artifact Index
- `.agents/m1_worker_1/DISPATCH.md` — assignment dispatch log
- `.agents/m1_worker_1/progress.md` — worker progress heartbeat
- `.agents/m1_worker_1/handoff.md` — final completion handoff report

## Change Tracker
- **Files modified**: [TBD]
- **Build status**: [TBD]
- **Pending issues**: None

## Quality Status
- **Build/test result**: [TBD]
- **Lint status**: [TBD]
- **Tests added/modified**: [TBD]
