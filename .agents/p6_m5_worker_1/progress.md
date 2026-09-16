# Progress Log — p6_m5_worker_1

Last visited: 2026-09-16T09:54:00+07:00

## Status: COMPLETE

### Completed
- Initialized workspace metadata (DISPATCH.md, BRIEFING.md, progress.md)
- Implemented `web/src/app/api/v1/seller/earnings/route.ts` (GET) with auth check, role check, seller balance summary, itemized earnings query, pagination, and status filtering.
- Implemented `web/src/app/api/v1/seller/withdrawals/[id]/cancel/route.ts` (POST) allowing sellers to cancel requests in `REQUESTED` or `UNDER_REVIEW` and restore reserved funds.
- Implemented admin withdrawal action routes:
  - `web/src/app/api/v1/admin/withdrawals/[id]/review/route.ts` (POST)
  - `web/src/app/api/v1/admin/withdrawals/[id]/process/route.ts` (POST)
  - `web/src/app/api/v1/admin/withdrawals/[id]/finalize/route.ts` (POST)
- Implemented Seller Financial UI & Components:
  - `web/src/app/(app)/seller/WithdrawalModal.tsx` (client-side validation: 50,000 to 50,000,000 VND, <= available balance, bank details)
  - `web/src/app/(app)/seller/WithdrawalHistoryTable.tsx` (history table with cancellation action for REQUESTED/UNDER_REVIEW)
  - `web/src/app/(app)/seller/page.tsx` (Financial KPI Cards, Withdrawal Request Modal, Withdrawal History Table, Per-Product Earnings Breakdown Table, preserved product catalog stats)
- Implemented Finance Admin Operations UI:
  - `web/src/app/(app)/finance/page.tsx` (role-guarded server page checking `admin` / `financeAdmin`, fetching initial data)
  - `web/src/app/(app)/finance/FinanceOperations.tsx` (tabbed queue with status filters, Review, Approve, Process, Finalize, and Reject modal with reason, plus Refunds ledger and Process Refund modal)
- Added comprehensive integration test suite `web/tests/int/m5-seller-dashboard-finance.int.spec.ts` (10 tests passing).
- Executed all test suites:
  - `tests/int/seller-revenue-e2e.int.spec.ts`: 11 passed (100%)
  - `tests/int/m5-seller-dashboard-finance.int.spec.ts`: 10 passed (100%)
  - M2/M3/M4 suites (`seller-earnings`, `commission-config-error`, `seller-withdrawals`, `refund-ledger`): 51 passed (100%)
  - Regression suites (`m1-access-control`, `purchase-workflow`, `purchase-invariants`, `m1-schema-stress`): 97 passed (100%)
  - Total: 169 passed / 169 total tests (100%)
- Verified type check: `pnpm tsc --noEmit` -> 0 errors.
- Verified linter: `pnpm lint` -> 0 errors.
- Updated `docs/plans/active/phase-6-seller-revenue.md` marking M5 as CLOSED / PASSED.
