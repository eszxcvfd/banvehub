# BRIEFING — 2026-09-16T09:54:00+07:00

## Mission
Deliver KienTaoHub Phase 6 Milestone 5: Seller Dashboard, Finance Admin Operations UI, and Seller Earnings REST API.

## 🔒 My Identity
- Archetype: worker
- Roles: implementer, qa, specialist
- Working directory: /home/trung/Documents/2026/project/test-v6/.agents/p6_m5_worker_1
- Original parent: b96b7657-610e-4105-89ae-923e3ac1b237
- Milestone: Phase 6 Milestone 5

## 🔒 Key Constraints
- Run commands sequentially, not concurrently (RAM is tight).
- Run plain commands WITHOUT rtk prefix (`pnpm ...`, `pnpm --prefix web ...`, `vitest run ...`).
- For PostgreSQL, host has NO psql binary — always use `docker exec kientaohub-postgres psql -U payload -d kientaohub -c "..."`.
- Do not revert, stash, reset, or checkout working tree files (prior milestone work).
- DO NOT CHEAT. All implementations must be genuine.
- Update docs/plans/active/phase-6-seller-revenue.md.

## Current Parent
- Conversation ID: b96b7657-610e-4105-89ae-923e3ac1b237
- Updated: 2026-09-16T09:54:00+07:00

## Task Summary
- **What to build**:
  1. REST API Route: `web/src/app/api/v1/seller/earnings/route.ts` (GET)
  2. Seller Dashboard Financial UI: `web/src/app/(app)/seller/page.tsx` + `WithdrawalModal.tsx` + `WithdrawalHistoryTable.tsx`
  3. Finance Admin Operations UI: `web/src/app/(app)/finance/page.tsx` + `FinanceOperations.tsx`
  4. Supporting cancellation and admin lifecycle endpoints: `seller/withdrawals/[id]/cancel`, `admin/withdrawals/[id]/review`, `process`, `finalize`
- **Success criteria**:
  - `tests/int/seller-revenue-e2e.int.spec.ts` passes (11 tests, 100%).
  - `tests/int/m5-seller-dashboard-finance.int.spec.ts` passes (10 tests, 100%).
  - All M2/M3/M4 suites pass (51 tests, 100%).
  - Regression suites pass (97 tests, 100%).
  - `pnpm tsc --noEmit` clean (0 errors).
  - `pnpm lint` clean (0 errors).

## Key Decisions Made
- Implemented `web/src/app/api/v1/seller/earnings/route.ts` checking session auth via Payload headers, enforcing `checkRole(['seller', 'admin'], user)`, supporting optional `sellerId` override for admin, querying `getSellerBalance` and `seller_earnings` with pagination and status filter.
- Updated `web/src/app/(app)/seller/page.tsx` with Financial KPI Cards (Available Balance, 7-Day Pending Hold, In-Flight Reserved Balance, Total Withdrawn, All-Time Earned), integrated `WithdrawalModal.tsx` for client-side validated requests (`50,000 <= amount <= 50,000,000` and `<= availableBalance`), added `WithdrawalHistoryTable.tsx` with cancel action for `REQUESTED`/`UNDER_REVIEW`, and aggregated per-product earnings breakdown table.
- Created `web/src/app/(app)/finance/page.tsx` and `FinanceOperations.tsx` restricted to `admin` / `financeAdmin`, providing tabbed interface for Withdrawal Queue (filters, review, approve, process, finalize, reject with reason modal) and Refunds / Compensating Ledger (initiate refund modal with orderId, reason, revokeEntitlement flag, and history table).
- Added dedicated M5 integration test suite `web/tests/int/m5-seller-dashboard-finance.int.spec.ts` covering 10 behavioral test scenarios.

## Artifact Index
- `.agents/p6_m5_worker_1/DISPATCH.md` — Assignment prompt
- `.agents/p6_m5_worker_1/BRIEFING.md` — Agent state and briefing
- `.agents/p6_m5_worker_1/progress.md` — Liveness and progress log
- `.agents/p6_m5_worker_1/handoff.md` — Final handoff report

## Change Tracker
- **Files modified/created**:
  - `web/src/app/api/v1/seller/earnings/route.ts` (new GET endpoint)
  - `web/src/app/api/v1/seller/withdrawals/[id]/cancel/route.ts` (new POST endpoint)
  - `web/src/app/api/v1/admin/withdrawals/[id]/review/route.ts` (new POST endpoint)
  - `web/src/app/api/v1/admin/withdrawals/[id]/process/route.ts` (new POST endpoint)
  - `web/src/app/api/v1/admin/withdrawals/[id]/finalize/route.ts` (new POST endpoint)
  - `web/src/app/(app)/seller/page.tsx` (updated financial dashboard)
  - `web/src/app/(app)/seller/WithdrawalModal.tsx` (new modal component)
  - `web/src/app/(app)/seller/WithdrawalHistoryTable.tsx` (new history table component)
  - `web/src/app/(app)/finance/page.tsx` (new finance admin page)
  - `web/src/app/(app)/finance/FinanceOperations.tsx` (new operations component)
  - `web/tests/int/m5-seller-dashboard-finance.int.spec.ts` (new integration test suite)
  - `docs/plans/active/phase-6-seller-revenue.md` (updated milestone status & checklist)
- **Build status**: PASSED (`tsc --noEmit` 0 errors, `lint` 0 errors)
- **Pending issues**: None

## Quality Status
- **Build/test result**: PASSED (169 / 169 tests passed across all suites)
  - `seller-revenue-e2e.int.spec.ts`: 11/11 passed
  - `m5-seller-dashboard-finance.int.spec.ts`: 10/10 passed
  - M2/M3/M4 suites (`seller-earnings`, `commission-config-error`, `seller-withdrawals`, `refund-ledger`): 51/51 passed
  - Regression suites (`m1-access-control`, `purchase-workflow`, `purchase-invariants`, `m1-schema-stress`): 97/97 passed
- **Lint status**: 0 errors
- **Tests added/modified**: 10 tests in `m5-seller-dashboard-finance.int.spec.ts`

## Loaded Skills
- None
