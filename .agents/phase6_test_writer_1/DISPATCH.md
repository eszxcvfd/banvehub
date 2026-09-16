## 2026-09-15T10:37:02Z
You are phase6_test_writer_1, a teamwork_preview_test_writer agent.
Your working directory is: /home/trung/Documents/2026/project/test-v6/.agents/phase6_test_writer_1
Your parent is: orchestrator (conversation ID: 97815561-5c1e-4548-8e83-6acb89c4e2aa)

MANDATORY FIRST STEP: Read the user request at:
/home/trung/Documents/2026/project/test-v6/.agents/ORIGINAL_REQUEST.md
Specifically review the Phase 6 (Seller Revenue) section starting from line 73.

YOUR MISSION:
Design and author the opaque-box integration test suites for Phase 6 (Seller Revenue) of KienTaoHub per Dual Track orchestration.
Read:
- /home/trung/Documents/2026/project/test-v6/.agents/orchestrator/PROJECT.md
- /home/trung/Documents/2026/project/test-v6/.agents/orchestrator/TEST_INFRA.md
- /home/trung/Documents/2026/project/test-v6/.agents/phase6_spec_miner_1/handoff.md
- /home/trung/Documents/2026/project/test-v6/.agents/phase6_explorer_frontend_test_1/handoff.md
- Existing tests: web/tests/int/purchase-workflow.int.spec.ts, web/tests/int/purchase-invariants.int.spec.ts, web/tests/int/wallet.int.spec.ts

Scope of Test Suites to Author in web/tests/int/:
1. web/tests/int/seller-earnings.int.spec.ts:
   - Tier 1: Commission rate resolution (3-tier: campaign -> seller override -> site default 30%), integer VND arithmetic, OrderItem snapshot fields populated, seller_earnings created with status PENDING, hold period maturation (7 days) transitioning to AVAILABLE, seller balance query.
   - Tier 2: Boundary cases: 0 VND / free products, fractional rounding conservation, zero remainder.
2. web/tests/int/seller-withdrawals.int.spec.ts:
   - Tier 1: Withdrawal request submission, bank details validation, balance reservation, 8-state machine (REQUESTED -> UNDER_REVIEW -> APPROVED -> PROCESSING -> PAID), cancellation and rejection releasing reserved balance, audit logging in withdrawal_events.
   - Tier 2: Boundaries: min limit (50,000 VND), max limit (50,000,000 VND), overdraft attempt rejection, exact balance withdrawal.
   - Tier 3: Concurrency & race condition test (Threat T7): multiple concurrent withdrawal requests cannot exceed available balance.
3. web/tests/int/refund-ledger.int.spec.ts:
   - Tier 1: Compensating refund flow (FLOW-U15, BR-03): buyer wallet credited via reversal entry, seller earning reversed (REVERSED), platform fee reversed, order status updated to REFUNDED, immutable ledger preservation (zero mutation of original records).
   - Tier 2: Refund with entitlement revocation vs retained entitlement, duplicate refund prevention.
4. web/tests/int/seller-revenue-e2e.int.spec.ts:
   - Tier 1 & 4: Full multi-actor lifecycle (Buyer top-up -> Purchase -> Seller earning PENDING -> Hold maturation -> Withdrawal requested -> Finance Admin approve -> Payout; and Purchase -> Refund flow).
   - Tier 1: RBAC matrix: only Finance Admin and Super Admin can approve/reject withdrawals or initiate refunds; sellers cannot approve; buyers cannot request withdrawals.
   - Tier 1: API endpoint integration: GET /api/v1/seller/earnings, POST /api/v1/seller/withdrawals, GET /api/v1/admin/withdrawals, POST /api/v1/admin/withdrawals/{id}/approve, POST /api/v1/admin/refunds.

Requirements:
- Tests must use standard Vitest syntax and Payload Local API / Next.js route handlers matching existing int specs.
- Maintain cleanup arrays in afterAll() to clean up created users, products, orders, etc.
- When test suites are authored, publish the test catalog in /home/trung/Documents/2026/project/test-v6/.agents/orchestrator/TEST_READY.md.
- Maintain BRIEFING.md and progress.md in your working directory.
- Deliver handoff.md and notify orchestrator when done.
