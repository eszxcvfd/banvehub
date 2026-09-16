## 2026-09-16T02:22:43Z
You are p6_m3_reviewer_1, an independent code reviewer and verifier for KienTaoHub Phase 6 Milestone 3 (Withdrawal Request, Balance Reservation & Approval Workflow).
Your working directory is: /home/trung/Documents/2026/project/test-v6/.agents/p6_m3_reviewer_1.
Project root: /home/trung/Documents/2026/project/test-v6.
Authoritative Request: /home/trung/Documents/2026/project/test-v6/.agents/ORIGINAL_REQUEST.md.
Global Blueprint: /home/trung/Documents/2026/project/test-v6/.agents/orchestrator/PROJECT.md.
Worker Handoff: /home/trung/Documents/2026/project/test-v6/.agents/p6_m3_worker_1/handoff.md.
Target Test Suite: /home/trung/Documents/2026/project/test-v6/web/tests/int/seller-withdrawals.int.spec.ts.
Parent Conversation ID: b96b7657-610e-4105-89ae-923e3ac1b237.

CRITICAL OPERATIONAL RULES:
1. RAM IS TIGHT: Run commands sequentially, not concurrently.
2. COMMANDS & ENVIRONMENT: Run plain commands WITHOUT rtk prefix (`pnpm ...`, `pnpm --prefix web ...`, `vitest run ...`). For PostgreSQL, host has NO psql binary — always use `docker exec kientaohub-postgres psql -U payload -d kientaohub -c "..."`.
3. REPO HYGIENE: Do NOT revert, stash, reset, or checkout.
4. Read /home/trung/Documents/2026/project/test-v6/.agents/ORIGINAL_REQUEST.md and Worker 1 Handoff before starting your evaluation.

MISSION: INDEPENDENT REVIEW & ADVERSARIAL VERIFICATION OF MILESTONE 3
Review and verify all artifacts delivered by p6_m3_worker_1:

1. Code Inspection:
   - `web/src/services/withdrawal.ts`:
     - Inspect `requestWithdrawal`: Verify input validation (bank details, amount limits 50,000–50,000,000 VND).
     - Verify anti-race condition overdraft protection (Threat T7): Inspect `withSellerLock` (in-memory async FIFO mutex per seller) ensuring concurrent requests for the same seller strictly serialize balance check and reservation.
     - Inspect state machine transitions: `reviewWithdrawal`, `approveWithdrawal`, `processWithdrawal`, `finalizeWithdrawalPaid`, `rejectWithdrawal`, `cancelWithdrawal`.
     - Verify terminal state immutability: Ensure transitions from terminal states (`PAID`, `REJECTED`, `CANCELLED`, `FAILED`) are strictly rejected with an error matching `/invalid|status/i`.
     - Verify audit logging: Ensure every transition writes an append-only event to `withdrawal_events` tracking `withdrawal`, `fromStatus`, `toStatus`, `actor`, `actorRole`, `reason`, `notes`, and `timestamp`.
     - Verify authorization: Ensure only `financeAdmin` and `admin` can review/approve/reject/process/finalize, and sellers can only request and cancel their own withdrawals.
   - `web/src/services/earnings.ts`:
     - Verify `getSellerBalance`: Confirms `withdrawnTotal` is computed from `withdrawals` with status `'PAID'`, and `netAvailable = Math.max(0, grossAvailable - reservedBalance - withdrawnTotal)`. Verify that `reservedBalance` only counts in-flight statuses, so rejection/cancellation automatically releases funds.
   - `web/src/services/commission.ts`:
     - Verify bounds check `[0, 1]` on commission rates throwing `CommissionConfigurationError`.
   - `web/src/collections/Withdrawals/hooks/validateWithdrawalInvariants.ts`:
     - Verify `VALID_TRANSITIONS` additions (`APPROVED -> PAID`, `PROCESSING -> REJECTED`).
   - REST API Route Handlers:
     - `web/src/app/api/v1/seller/withdrawals/route.ts` (GET, POST)
     - `web/src/app/api/v1/admin/withdrawals/route.ts` (GET)
     - `web/src/app/api/v1/admin/withdrawals/[id]/approve/route.ts` (POST)
     - `web/src/app/api/v1/admin/withdrawals/[id]/reject/route.ts` (POST)
     - Verify 401 unauthenticated and 403 unauthorized handling.
   - Test suite helper update:
     - `web/tests/int/seller-withdrawals.int.spec.ts`: Verify `seedAvailableEarning` relational order chain and cleanup fixture reverse-dependency teardown.

2. Empirical Verification Commands to Run (Sequentially):
   - `pnpm --prefix web tsc --noEmit`
   - `pnpm --prefix web lint`
   - `pnpm --prefix web vitest run tests/int/seller-withdrawals.int.spec.ts`
   - `pnpm --prefix web vitest run tests/int/seller-earnings.int.spec.ts tests/int/commission-config-error.int.spec.ts`
   - `pnpm --prefix web vitest run tests/int/purchase-workflow.int.spec.ts tests/int/purchase-invariants.int.spec.ts tests/int/m1-schema-stress.int.spec.ts tests/int/m1-access-control.int.spec.ts`
   - Check downstream: `pnpm --prefix web vitest run tests/int/seller-revenue-e2e.int.spec.ts` (verify withdrawal and balance tests pass, and report remaining pending failures for M4/M5).

3. Adversarial / Edge Case Evaluation:
   - Verify boundary condition handling at 49,999; 50,000; 50,000,000; 50,000,001 VND.
   - Verify concurrent request race condition (Tier 3 Threat T7 test).
   - Verify that reserved balance is strictly restored to available balance upon rejection or cancellation.
   - Verify that balance is never negative.

4. Deliverables:
   - Write your review and verification findings to `/home/trung/Documents/2026/project/test-v6/.agents/p6_m3_reviewer_1/handoff.md`.
   - State your explicit verdict: `APPROVE` or `REQUEST_CHANGES`.
   - Send completion message to parent with summary and handoff path.
