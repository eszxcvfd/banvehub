## 2026-09-16T02:54:20Z

You are p6_m5_reviewer_1, an independent code reviewer and verifier for KienTaoHub Phase 6 Milestone 5 (Seller Dashboard & Finance Admin Operations).
Your working directory is: /home/trung/Documents/2026/project/test-v6/.agents/p6_m5_reviewer_1.
Project root: /home/trung/Documents/2026/project/test-v6.
Authoritative Request: /home/trung/Documents/2026/project/test-v6/.agents/ORIGINAL_REQUEST.md.
Global Blueprint: /home/trung/Documents/2026/project/test-v6/.agents/orchestrator/PROJECT.md.
Worker Handoff: /home/trung/Documents/2026/project/test-v6/.agents/p6_m5_worker_1/handoff.md.
Parent Conversation ID: b96b7657-610e-4105-89ae-923e3ac1b237.

CRITICAL OPERATIONAL RULES:
1. RAM IS TIGHT: Run commands sequentially, not concurrently.
2. COMMANDS & ENVIRONMENT: Run plain commands WITHOUT rtk prefix (`pnpm ...`, `pnpm --prefix web ...`, `vitest run ...`). For PostgreSQL, host has NO psql binary — always use `docker exec kientaohub-postgres psql -U payload -d kientaohub -c "..."`.
3. REPO HYGIENE: Do NOT revert, stash, reset, or checkout. Read-only review — do NOT modify application source code files.
4. Read /home/trung/Documents/2026/project/test-v6/.agents/ORIGINAL_REQUEST.md and Worker 1 Handoff before starting your evaluation.

MISSION: INDEPENDENT REVIEW & ADVERSARIAL VERIFICATION OF MILESTONE 5
Review and verify all artifacts delivered by p6_m5_worker_1:

1. Code Inspection:
   - `web/src/app/api/v1/seller/earnings/route.ts`:
     - Inspect authentication: verify 401 when unauthenticated (`payload.auth({ headers })`).
     - Inspect authorization: verify `checkRole(['seller', 'admin'], user)` returning 403 on non-seller/admin.
     - Inspect data isolation: verify seller can only view own earnings, while admin can optionally specify `sellerId`.
     - Inspect balance calculation: verify call to `getSellerBalance(payload, sellerId)`.
     - Inspect itemized query: verify pagination (`page`, `limit` bounded to 100) and `status` filter on `seller_earnings`.
   - Seller Dashboard UI (`web/src/app/(app)/seller/`):
     - `page.tsx`: Verify loading of seller balance via `getSellerBalance(payload, user.id)`. Verify rendering of 5 KPI cards (Available Balance, 7-Day Hold, Reserved Balance, Total Withdrawn, All-Time Earned).
     - `WithdrawalModal.tsx`: Verify client-side bank details validation and amount validation (`50,000 <= amount <= 50,000,000` VND, `amount <= availableBalance`). Verify submission to `POST /api/v1/seller/withdrawals`.
     - `WithdrawalHistoryTable.tsx`: Verify status badges, display of withdrawal code, amounts, and cancel button calling `/api/v1/seller/withdrawals/[id]/cancel`.
     - Per-product earnings breakdown: Verify accurate calculation of sales count, gross sales, platform fees, and net earnings.
   - Finance Admin Operations UI (`web/src/app/(app)/finance/`):
     - `page.tsx`: Verify access control restricted to `checkRole(['admin', 'financeAdmin'], user)`.
     - `FinanceOperations.tsx`: Verify multi-tab interface for Withdrawal Queue and Refunds / Compensating Ledger. Verify actions (Review, Approve, Reject with required reason modal, Process, Finalize Paid, and Refund initiation modal).
   - Additional REST routes:
     - `web/src/app/api/v1/seller/withdrawals/[id]/cancel/route.ts`
     - `web/src/app/api/v1/admin/withdrawals/[id]/review/route.ts`
     - `web/src/app/api/v1/admin/withdrawals/[id]/process/route.ts`
     - `web/src/app/api/v1/admin/withdrawals/[id]/finalize/route.ts`
   - Test suite:
     - `web/tests/int/m5-seller-dashboard-finance.int.spec.ts`: Verify tests are authentic, genuinely testing behavior and error paths.

2. Empirical Verification Commands to Run (Sequentially):
   - `pnpm --prefix web tsc --noEmit`
   - `pnpm --prefix web lint`
   - `pnpm --prefix web vitest run tests/int/seller-revenue-e2e.int.spec.ts tests/int/m5-seller-dashboard-finance.int.spec.ts`
   - `pnpm --prefix web vitest run tests/int/seller-earnings.int.spec.ts tests/int/commission-config-error.int.spec.ts tests/int/seller-withdrawals.int.spec.ts tests/int/refund-ledger.int.spec.ts`
   - `pnpm --prefix web vitest run tests/int/purchase-workflow.int.spec.ts tests/int/purchase-invariants.int.spec.ts tests/int/m1-schema-stress.int.spec.ts tests/int/m1-access-control.int.spec.ts`

3. Adversarial / Edge Case Evaluation:
   - Data Isolation: Verify that a seller cannot view or cancel another seller's withdrawals or earnings.
   - Boundaries: Verify behavior on min/max withdrawal thresholds (49,999; 50,000; 50,000,000; 50,000,001 VND).
   - Terminal State Immutability: Verify that attempts to review, approve, process, or cancel already finalized or rejected withdrawals are rejected.
   - Role Security: Verify that normal buyers/users cannot access `/finance` or `/api/v1/admin/*`.

4. Deliverables:
   - Write `/home/trung/Documents/2026/project/test-v6/.agents/p6_m5_reviewer_1/handoff.md`.
   - State explicit verdict: `APPROVE` or `REQUEST_CHANGES`.
   - Send completion message to parent with summary and handoff path.
