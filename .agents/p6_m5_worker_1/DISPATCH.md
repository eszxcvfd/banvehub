## 2026-09-16T02:46:20Z

You are p6_m5_worker_1, an implementation worker for KienTaoHub Phase 6 Milestone 5 (Seller Dashboard & Finance Admin Operations).
Your working directory is: /home/trung/Documents/2026/project/test-v6/.agents/p6_m5_worker_1.
Project root: /home/trung/Documents/2026/project/test-v6.
Authoritative Request: /home/trung/Documents/2026/project/test-v6/.agents/ORIGINAL_REQUEST.md.
Global Blueprint: /home/trung/Documents/2026/project/test-v6/.agents/orchestrator/PROJECT.md.
Parent Conversation ID: b96b7657-610e-4105-89ae-923e3ac1b237.

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

CRITICAL OPERATIONAL RULES:
1. RAM IS TIGHT: Run commands sequentially, not concurrently.
2. COMMANDS & ENVIRONMENT: Run plain commands WITHOUT rtk prefix (`pnpm ...`, `pnpm --prefix web ...`, `vitest run ...`). For PostgreSQL, host has NO psql binary — always use `docker exec kientaohub-postgres psql -U payload -d kientaohub -c "..."`.
3. REPO HYGIENE: 55+ uncommitted files carry prior milestone work. Do NOT revert, stash, reset, or checkout. Treat working tree as source of truth. Maintain `docs/plans/active/phase-6-seller-revenue.md`.
4. Read /home/trung/Documents/2026/project/test-v6/.agents/ORIGINAL_REQUEST.md first before starting work.

MISSION: DELIVER MILESTONE 5 (Seller Dashboard, Finance Admin Operations & Seller Earnings API)
Deliver the following 3 core components:

1. REST API Route: `web/src/app/api/v1/seller/earnings/route.ts` (GET):
   - Authenticate caller via Payload session headers:
     ```ts
     const headers = await getHeaders()
     const payload = await getPayload({ config: configPromise })
     const { user } = await payload.auth({ headers })
     ```
   - If `!user`: return `Response.json({ error: 'Unauthorized' }, { status: 401 })` (satisfies `tests/int/seller-revenue-e2e.int.spec.ts:682`!).
   - Role authorization: verify `checkRole(['seller', 'admin'], user)`. If not, return `Response.json({ error: 'Forbidden' }, { status: 403 })`.
   - Seller ID: if `checkRole(['admin'], user)` and query param `sellerId` is passed, allow querying that seller; otherwise use `user.id`.
   - Parse query params: `page` (default 1), `limit` (default 10, max 100), optional `status`.
   - Fetch balance summary using `getSellerBalance(payload, sellerId)` from `@/services/earnings`.
   - Query itemized earnings from `seller_earnings` collection:
     ```ts
     const earningsResult = await payload.find({
       collection: 'seller_earnings',
       where: {
         seller: { equals: sellerId },
         ...(status ? { status: { equals: status } } : {}),
       },
       sort: '-createdAt',
       page,
       limit,
       overrideAccess: true,
       depth: 1,
     })
     ```
   - Return JSON:
     ```ts
     return Response.json({
       success: true,
       data: {
         summary: balanceSummary,
         earnings: earningsResult.docs,
         totalDocs: earningsResult.totalDocs,
         totalPages: earningsResult.totalPages,
         page: earningsResult.page,
         limit: earningsResult.limit,
       },
     })
     ```

2. Seller Dashboard Financial UI (`/seller`):
   - Update `web/src/app/(app)/seller/page.tsx` and create any needed subcomponents (e.g. `web/src/app/(app)/seller/WithdrawalModal.tsx`):
     - Load financial metrics for the logged-in seller using `getSellerBalance(payload, user.id)`.
     - Load seller's withdrawal history (`payload.find({ collection: 'withdrawals', where: { seller: { equals: user.id } }, sort: '-createdAt', limit: 20, overrideAccess: true })`).
     - Load seller earnings breakdown by product: query `seller_earnings` for `seller: user.id` and aggregate per-product total sales count, gross revenue, platform fee, and net earnings.
     - Display Financial KPI Cards at the top of the dashboard:
       - Số dư khả dụng (Available Balance, VND) — with an active "Yêu cầu rút tiền" (Request Withdrawal) button.
       - Tạm giữ 7 ngày (Pending Hold, VND).
       - Đang xử lý rút (Reserved Balance in Withdrawals, VND).
       - Tổng tiền đã rút (Total Withdrawn, VND).
       - Tổng thu nhập tích lũy (All-Time Earned, VND).
     - Implement Withdrawal Request Modal (`WithdrawalModal.tsx`):
       - Form fields: Tên ngân hàng (Bank Name), Số tài khoản (Account Number), Tên chủ tài khoản (Account Holder Name), Số tiền rút (Amount in VND).
       - Client-side validation: amount between 50,000 VND and 50,000,000 VND, and amount <= availableBalance.
       - Submits `POST /api/v1/seller/withdrawals` with JSON body `{ amount, bankInfo: { bankName, accountNumber, accountHolderName } }`.
       - Handles responses gracefully (displays success message or error message).
     - Display Withdrawal / Payout History Table:
       - Columns: Mã giao dịch (Code), Số tiền (Amount), Thông tin tài khoản (Bank Details), Trạng thái (Status Badge: REQUESTED, UNDER_REVIEW, APPROVED, PROCESSING, PAID, REJECTED, CANCELLED), Thời gian tạo (Created At).
       - For rows in `REQUESTED` or `UNDER_REVIEW`, provide a "Hủy" (Cancel) button calling the cancellation logic.
     - Display Per-Product Earnings Breakdown Table:
       - Columns: Tên tài nguyên (Product Title), Lượt bán (Sales Count), Doanh số (Gross Sales), Phí nền tảng (Platform Fee), Thực nhận người bán (Net Seller Amount).

3. Finance Admin Operations UI (`/finance`):
   - Implement `web/src/app/(app)/finance/page.tsx` and client component `web/src/app/(app)/finance/FinanceOperations.tsx`:
     - Access control: restrict to `checkRole(['admin', 'financeAdmin'], user)`. If unauthorized, redirect to `/login` with appropriate warning.
     - Layout: Tabbed or multi-section interface:
       a) Hàng đợi rút tiền (Withdrawal Queue):
          - Lists all withdrawals with status filters (`REQUESTED`, `UNDER_REVIEW`, `APPROVED`, `PROCESSING`, `PAID`, `REJECTED`, `CANCELLED`).
          - Shows seller info, amount, bank details, code, and status.
          - Actions:
            - "Tiếp nhận thẩm định" (Review) -> calls `reviewWithdrawal` or API.
            - "Phê duyệt" (Approve) -> calls `POST /api/v1/admin/withdrawals/[id]/approve` (with optional notes).
            - "Từ chối" (Reject) -> modal with required reason -> calls `POST /api/v1/admin/withdrawals/[id]/reject`.
            - "Đang chuyển khoản" (Process) and "Đã hoàn tất thanh toán" (Finalize Paid).
       b) Lịch sử bồi hoàn & hoàn tiền (Refunds & Reversals):
          - Displays list of refunds from `refunds` collection (`REF-...`, order, amount, platformFeeRefunded, sellerAmountRefunded, reason, processedBy, timestamp).
          - "Thực hiện hoàn tiền bồi hoàn" (Process Refund) modal/form:
            - Inputs: `orderId` (Order ID), `reason` (Lý do hoàn tiền), `revokeEntitlement` (checkbox: thu hồi quyền truy cập bản vẽ).
            - Submits `POST /api/v1/admin/refunds`.

4. Verification:
   - Run: `pnpm --prefix web vitest run tests/int/seller-revenue-e2e.int.spec.ts` -> All 11 tests must pass (100%)!
   - Run all M2/M3/M4 suites: `pnpm --prefix web vitest run tests/int/seller-earnings.int.spec.ts tests/int/commission-config-error.int.spec.ts tests/int/seller-withdrawals.int.spec.ts tests/int/refund-ledger.int.spec.ts` -> All 51 tests must pass (100%)!
   - Run regression suites: `pnpm --prefix web vitest run tests/int/purchase-workflow.int.spec.ts tests/int/purchase-invariants.int.spec.ts tests/int/m1-schema-stress.int.spec.ts tests/int/m1-access-control.int.spec.ts` -> All 97 tests must pass (100%)!
   - Run: `pnpm --prefix web tsc --noEmit` -> 0 errors.
   - Run: `pnpm --prefix web lint` -> 0 errors.
   - Update `docs/plans/active/phase-6-seller-revenue.md` marking completed tasks.
   - Write `.agents/p6_m5_worker_1/handoff.md` with:
     - All files created and modified.
     - Exact test command execution results and pass/fail counts.
     - TypeScript and ESLint verification output.
   - Send completion message to parent with summary and handoff path.
