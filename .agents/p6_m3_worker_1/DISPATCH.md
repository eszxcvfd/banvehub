## 2026-09-16T02:13:19Z

You are p6_m3_worker_1, an implementation worker for KienTaoHub Phase 6 Milestone 3 (Withdrawal Request, Balance Reservation & Approval Workflow).
Your working directory is: /home/trung/Documents/2026/project/test-v6/.agents/p6_m3_worker_1.
Project root: /home/trung/Documents/2026/project/test-v6.
Authoritative Request: /home/trung/Documents/2026/project/test-v6/.agents/ORIGINAL_REQUEST.md.
Global Blueprint: /home/trung/Documents/2026/project/test-v6/.agents/orchestrator/PROJECT.md.
Target Test Suite: /home/trung/Documents/2026/project/test-v6/web/tests/int/seller-withdrawals.int.spec.ts.
Parent Conversation ID: b96b7657-610e-4105-89ae-923e3ac1b237.

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

CRITICAL OPERATIONAL RULES:
1. RAM IS TIGHT: Run commands sequentially, not concurrently.
2. COMMANDS & ENVIRONMENT: Run plain commands WITHOUT rtk prefix (`pnpm ...`, `pnpm --prefix web ...`, `vitest run ...`). For PostgreSQL, host has NO psql binary — always use `docker exec kientaohub-postgres psql -U payload -d kientaohub -c "..."`.
3. REPO HYGIENE: 55+ uncommitted files carry prior milestone work. Do NOT revert, stash, reset, or checkout. Treat working tree as source of truth. Maintain `docs/plans/active/phase-6-seller-revenue.md`.
4. Read /home/trung/Documents/2026/project/test-v6/.agents/ORIGINAL_REQUEST.md first before starting work.

MISSION: DELIVER MILESTONE 3 (Withdrawal Request, Reservation & Approval Workflow)
Deliver the following 4 components:

1. `web/src/services/withdrawal.ts`:
   Implement and export the full withdrawal service interface contracts required by `web/tests/int/seller-withdrawals.int.spec.ts` and `PROJECT.md`:
   - Export interfaces:
     ```ts
     export interface WithdrawalRequestParams {
       sellerId: number
       amount: number
       bankInfo: {
         bankName: string
         accountNumber: string
         accountHolderName: string
       }
     }

     export interface WithdrawalResult {
       id: number
       code: string
       amount: number
       status: string
       bankInfo?: any
       requestedAt?: string
       updatedAt?: string
     }
     ```
   - Functions to implement:
     a) `requestWithdrawal(payload: Payload, params: WithdrawalRequestParams): Promise<WithdrawalResult>`:
        - Validate bank details: `bankName`, `accountNumber`, `accountHolderName` must all be non-empty strings (after trim). If missing or empty, throw an Error (`Bank details required: bankName, accountNumber, accountHolderName`).
        - Validate amount: must be positive integer.
          - If amount < 50000, throw Error matching `/min|50,?000/i` (e.g., `Minimum withdrawal amount is 50,000 VND`).
          - If amount > 50000000, throw Error matching `/max|50,?000,?000/i` (e.g., `Maximum withdrawal amount is 50,000,000 VND`).
          - If amount <= 0, throw Error (`Invalid withdrawal amount: must be greater than 0`).
        - Concurrency & Anti-Race Overdraft Protection (Threat T7):
          - In `withdrawal.ts`, maintain an in-memory lock/queue keyed by `sellerId` (or async mutex per seller) so concurrent requests for the same seller are strictly serialized when checking balance and creating withdrawal.
          - Call `getSellerBalance(payload, params.sellerId)`.
          - If `params.amount > balance.availableBalance`, throw Error matching `/insufficient|balance/i` (e.g., `Insufficient available balance: requested ${params.amount} VND, available ${balance.availableBalance} VND`).
          - Generate withdrawal code: use `generateWithdrawalCode()` from `@/collections/Withdrawals/hooks/generateWithdrawalCode` or format `WTH-YYYYMMDD-XXXXXXXX` (32-bit hex suffix, matching `^WTH-`).
          - Create record in `withdrawals` collection:
            ```ts
            const withdrawal = await payload.create({
              collection: 'withdrawals',
              data: {
                seller: params.sellerId,
                amount: params.amount,
                currency: 'VND',
                status: 'REQUESTED',
                bankInfo: {
                  bankName: params.bankInfo.bankName.trim(),
                  accountNumber: params.bankInfo.accountNumber.trim(),
                  accountHolderName: params.bankInfo.accountHolderName.trim().toUpperCase(),
                },
                code: withdrawalCode,
                requestedAt: new Date().toISOString(),
              },
              overrideAccess: true,
            })
            ```
          - Insert audit event in `withdrawal_events` collection:
            ```ts
            await payload.create({
              collection: 'withdrawal_events',
              data: {
                withdrawal: withdrawal.id,
                toStatus: 'REQUESTED',
                actor: params.sellerId,
                actorRole: 'seller',
                timestamp: new Date().toISOString(),
              },
              overrideAccess: true,
            })
            ```
          - Release the seller lock and return `WithdrawalResult`.

     b) `reviewWithdrawal(payload: Payload, params: { withdrawalId: number; actorId: number }): Promise<WithdrawalResult>`:
        - Fetch existing withdrawal by ID.
        - Terminal state immutability check: If status is in `['PAID', 'REJECTED', 'CANCELLED', 'FAILED']`, throw Error matching `/invalid|status/i`.
        - Verify status is `REQUESTED`.
        - Update withdrawal: `status: 'UNDER_REVIEW'`, `reviewedAt: new Date().toISOString()`, `reviewedBy: params.actorId`.
        - Insert audit event in `withdrawal_events`:
          `withdrawal: params.withdrawalId`, `fromStatus: 'REQUESTED'`, `toStatus: 'UNDER_REVIEW'`, `actor: params.actorId`, `actorRole: 'financeAdmin'`, `timestamp: new Date().toISOString()`.
        - Return updated `WithdrawalResult`.

     c) `approveWithdrawal(payload: Payload, params: { withdrawalId: number; actorId: number; notes?: string }): Promise<WithdrawalResult>`:
        - Fetch existing withdrawal.
        - Terminal check: If status in `['PAID', 'REJECTED', 'CANCELLED', 'FAILED']`, throw Error matching `/invalid|status/i`.
        - Verify status is `UNDER_REVIEW` or `REQUESTED`.
        - Update withdrawal: `status: 'APPROVED'`, `notes: params.notes || existing.notes`.
        - Insert audit event in `withdrawal_events`:
          `withdrawal: params.withdrawalId`, `fromStatus: existing.status`, `toStatus: 'APPROVED'`, `actor: params.actorId`, `actorRole: 'financeAdmin'`, `notes: params.notes`, `timestamp: new Date().toISOString()`.
        - Return updated `WithdrawalResult`.

     d) `processWithdrawal(payload: Payload, params: { withdrawalId: number; actorId: number }): Promise<WithdrawalResult>`:
        - Fetch existing withdrawal.
        - Terminal check: If status in `['PAID', 'REJECTED', 'CANCELLED', 'FAILED']`, throw Error matching `/invalid|status/i`.
        - Verify status is `APPROVED`.
        - Update withdrawal: `status: 'PROCESSING'`.
        - Insert audit event in `withdrawal_events`:
          `withdrawal: params.withdrawalId`, `fromStatus: 'APPROVED'`, `toStatus: 'PROCESSING'`, `actor: params.actorId`, `actorRole: 'financeAdmin'`, `timestamp: new Date().toISOString()`.
        - Return updated `WithdrawalResult`.

     e) `finalizeWithdrawalPaid(payload: Payload, params: { withdrawalId: number; actorId: number }): Promise<WithdrawalResult>`:
        - Fetch existing withdrawal.
        - Terminal check: If status in `['PAID', 'REJECTED', 'CANCELLED', 'FAILED']`, throw Error matching `/invalid|status/i`.
        - Verify status is `PROCESSING` or `APPROVED`.
        - Update withdrawal: `status: 'PAID'`, `paidAt: new Date().toISOString()`.
        - Insert audit event in `withdrawal_events`:
          `withdrawal: params.withdrawalId`, `fromStatus: existing.status`, `toStatus: 'PAID'`, `actor: params.actorId`, `actorRole: 'financeAdmin'`, `timestamp: new Date().toISOString()`.
        - Return updated `WithdrawalResult`.

     f) `rejectWithdrawal(payload: Payload, params: { withdrawalId: number; actorId: number; reason: string }): Promise<WithdrawalResult>`:
        - Fetch existing withdrawal.
        - Terminal check: If status in `['PAID', 'REJECTED', 'CANCELLED', 'FAILED']`, throw Error matching `/invalid|status/i`.
        - Verify status is rejectable (`REQUESTED`, `UNDER_REVIEW`, `APPROVED`, `PROCESSING`).
        - Update withdrawal: `status: 'REJECTED'`, `rejectionReason: params.reason`.
        - Insert audit event in `withdrawal_events`:
          `withdrawal: params.withdrawalId`, `fromStatus: existing.status`, `toStatus: 'REJECTED'`, `actor: params.actorId`, `actorRole: 'financeAdmin'`, `reason: params.reason`, `timestamp: new Date().toISOString()`.
        - Return updated `WithdrawalResult`. (Note: in `getSellerBalance`, `reservedBalance` only counts in-flight statuses, so setting status to `REJECTED` immediately and automatically restores reserved funds back to available balance!).

     g) `cancelWithdrawal(payload: Payload, params: { withdrawalId: number; sellerId: number }): Promise<WithdrawalResult>`:
        - Fetch existing withdrawal.
        - Terminal check: If status in `['PAID', 'REJECTED', 'CANCELLED', 'FAILED']`, throw Error matching `/invalid|status/i`.
        - Verify seller ownership: `Number(existing.seller?.id || existing.seller) === Number(params.sellerId)`. If mismatch, throw Error.
        - Verify status is cancellable (`REQUESTED` or `UNDER_REVIEW`).
        - Update withdrawal: `status: 'CANCELLED'`.
        - Insert audit event in `withdrawal_events`:
          `withdrawal: params.withdrawalId`, `fromStatus: existing.status`, `toStatus: 'CANCELLED'`, `actor: params.sellerId`, `actorRole: 'seller'`, `timestamp: new Date().toISOString()`.
        - Return updated `WithdrawalResult`. (Releases reserved balance automatically!).

2. Update `web/src/services/earnings.ts` (`getSellerBalance`):
   - In `getSellerBalance`:
     Ensure `withdrawnTotal` accurately aggregates from `withdrawals` with status `'PAID'`:
     ```ts
     const paidWithdrawalsResult = await payload.find({
       collection: 'withdrawals',
       where: {
         and: [
           { seller: { equals: numericSellerId } },
           { status: { equals: 'PAID' } },
         ],
       },
       limit: 1000,
       overrideAccess: true,
     })

     let withdrawnTotal = 0
     for (const w of paidWithdrawalsResult.docs) {
       withdrawnTotal += Number(w.amount || 0)
     }
     ```
     Compute balances:
     `const grossAvailable = availableBalance` (from `seller_earnings` with status `AVAILABLE`)
     `const netAvailable = Math.max(0, grossAvailable - reservedBalance - withdrawnTotal)`
     `const totalEarned = grossAvailable + pendingBalance`
     Add pagination note/TODO comment on `limit: 5000`.
   - In `web/src/services/commission.ts`:
     Add range check in `resolveCommissionRate`: `if (rate < 0 || rate > 1) throw new CommissionConfigurationError(...)` per parent directive recommendation.

3. REST API routes for Milestone 3:
   Implement the 4 Next.js REST API routes:
   - `web/src/app/api/v1/seller/withdrawals/route.ts`:
     - `GET`: Authenticated seller lists own withdrawals (return 401 if unauthenticated).
     - `POST`: Authenticated seller requests withdrawal (401 if unauthenticated, parses `{ amount, bankInfo }`, calls `requestWithdrawal`, returns 201 or 400).
   - `web/src/app/api/v1/admin/withdrawals/route.ts`:
     - `GET`: Admin / financeAdmin lists all withdrawals (401 if unauthenticated, 403 if unauthorized).
   - `web/src/app/api/v1/admin/withdrawals/[id]/approve/route.ts`:
     - `POST`: Admin / financeAdmin approves withdrawal (401 if unauthenticated, 403 if unauthorized, calls `approveWithdrawal`, returns 200).
   - `web/src/app/api/v1/admin/withdrawals/[id]/reject/route.ts`:
     - `POST`: Admin / financeAdmin rejects withdrawal (401 if unauthenticated, 403 if unauthorized, calls `rejectWithdrawal`, returns 200).

4. Update `docs/plans/active/phase-6-seller-revenue.md` noting Milestone 3 scope and checklist.

5. Verification:
   - Run `pnpm --prefix web vitest run tests/int/seller-withdrawals.int.spec.ts` -> all 14 tests must PASS.
   - Run `pnpm --prefix web vitest run tests/int/seller-earnings.int.spec.ts tests/int/commission-config-error.int.spec.ts` -> all 27 tests must PASS.
   - Run regression suites: `pnpm --prefix web vitest run tests/int/purchase-workflow.int.spec.ts tests/int/purchase-invariants.int.spec.ts tests/int/m1-schema-stress.int.spec.ts tests/int/m1-access-control.int.spec.ts` -> 97/97 must PASS.
   - Run `pnpm --prefix web tsc --noEmit` -> 0 errors.
   - Run `pnpm --prefix web lint` -> 0 errors.
   - Write `.agents/p6_m3_worker_1/handoff.md` with full details of changes and verification output.
   - Send completion message to parent when done.
