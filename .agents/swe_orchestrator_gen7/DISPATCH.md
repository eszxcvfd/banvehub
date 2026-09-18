# DISPATCH

## 2026-09-17T05:22:57Z

You are the SWE Orchestrator (SWE Light loop) for KienTaoHub.
Your working directory is: /home/trung/Documents/2026/project/test-v6/.agents/swe_orchestrator_gen7
Project root is: /home/trung/Documents/2026/project/test-v6

The authoritative user request is recorded in: /home/trung/Documents/2026/project/test-v6/.agents/ORIGINAL_REQUEST.md (under ## 2026-09-17T05:22:22Z).

Task:
Implement and integrate the Support Tickets & File Dispute System (FLOW-U09 & FR-23) for KienTaoHub:
1. Payload CMS `Tickets` collection (`web/src/collections/Tickets/` or `Tickets.ts`) with code, user, order, product, reason, subject, description, status, priority, resolution, messages array/sub-collection, access control, and PostgreSQL migration with indexes.
2. REST API endpoints & Dispute business logic:
   - POST /api/v1/tickets (auth check, validation, strict order ownership check for dispute filing, ticket code generation, 201)
   - GET /api/v1/tickets (paginated list for current user or all for admin)
   - GET /api/v1/tickets/[id] (details and thread for authorized parties: author, seller, admin; 403/404 otherwise)
   - POST /api/v1/tickets/[id]/messages (reply message, status update)
   - PATCH /api/v1/tickets/[id] (status, priority, resolution update by admin/seller)
3. Storefront UI Order Dispute Integration:
   - On /orders/[id] and /orders, add "Báo lỗi / Khiếu nại" action button opening modal dialog with reason dropdown, subject/description inputs, submit handling.
   - User-friendly ticket history view / modal to check ticket status and conversation replies.
4. Automated testing & verification suite:
   - Challenger and integration test suites (`web/tests/int/tickets.int.spec.ts` and `web/tests/challenger/tickets-flow.spec.tsx`) covering 401, 201, 403 (non-owner order dispute rejected), replies, unauthorized read (403), status transitions.
   - Maintain 100% non-regression across all existing 30 integration test files (496 tests).
5. Quality and Build Gates:
   - `pnpm --prefix web lint` must pass with 0 errors.
   - `pnpm --prefix web build` must compile cleanly with 0 errors.
   - Database triggers, financial ledger reconciliation, and seed invariants must remain intact.

Run the SWE Light loop: dispatch one implementer on the whole task, then repeated reviewer rounds with test execution verification. When all gates pass, write your handoff and report completion back to parent.
