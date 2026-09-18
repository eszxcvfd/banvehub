# DISPATCH for teamwork_preview_implementer_1

Your working directory is: /home/trung/Documents/2026/project/test-v6/.agents/teamwork_preview_implementer_1
Project root is: /home/trung/Documents/2026/project/test-v6

Execute the following original task verbatim:
<original_task>
# Teamwork Project Prompt

This is a single self-contained feature; keep it small and focused.
Requested team: Small, focused team (SWE Light: one implementing agent plus repeated adversarial review)

Implement and integrate the Support Tickets & File Dispute System (FLOW-U09 & FR-23) for KienTaoHub: create the Payload CMS `Tickets` collection supporting buyer dispute filing against orders/products, ticket conversation threads, and resolution states (`OPEN`, `IN_PROGRESS`, `WAITING_USER`, `RESOLVED`, `CLOSED`); build secure REST API routes for creating, viewing, replying to, and resolving tickets; integrate a customer-facing "Báo lỗi / Khiếu nại" action into order details (`/orders/[id]` and `/orders`); and provide comprehensive automated integration and challenger test suites.

Working directory: /home/trung/Documents/2026/project/test-v6
Integrity mode: development

### Reference Material & Authoritative Directives
- `PLAN.md`: `FLOW-U09 — Khiếu nại file lỗi` (§1226–1241), `FR-23 — Support Ticket` (§813–832), `FR-22 — Report sản phẩm` (§797–810).
- Existing order detail page: `web/src/app/(app)/orders/[id]/page.tsx`, `web/src/app/(app)/orders/page.tsx`.
- Existing collections: `web/src/collections/` (`Orders`, `OrderItems`, `Products`, `Users`, `Refunds`, `WalletLedger`).
- Existing domain services: `web/src/services/` (e.g. purchase, refund).

---

## Requirements

### R1. Payload CMS `Tickets` Collection (FR-23, FLOW-U09)
- Define and register the `Tickets` collection in Payload CMS (`web/src/collections/Tickets/` or `Tickets.ts`).
- Schema fields:
  - `code`: unique human-readable code (e.g. `TCK-YYYYMMDD-<HEX>` or indexed identifier).
  - `user`: relationship to `users` (buyer/creator, required, indexed).
  - `order`: relationship to `orders` (optional, linked order for purchase disputes).
  - `product`: relationship to `products` (optional, linked product).
  - `reason`: select (`FILE_CORRUPTED`, `MISLEADING_CONTENT`, `DOWNLOAD_ERROR`, `BILLING_DISPUTE`, `OTHER`), required.
  - `subject`: text (required, trimmed).
  - `description`: textarea (required, detailed defect explanation).
  - `status`: select (`OPEN`, `IN_PROGRESS`, `WAITING_USER`, `RESOLVED`, `CLOSED`), default `OPEN`, indexed.
  - `priority`: select (`LOW`, `NORMAL`, `HIGH`, `URGENT`), default `NORMAL`.
  - `resolution`: select (`EXPLAINED`, `FIX_PROVIDED`, `REFUNDED`, `REJECTED`), optional.
  - `messages`: array / sub-collection for conversation messages between buyer, seller, and admin (`sender` relationship to `users`, `senderRole` select `buyer`/`seller`/`admin`, `message` text, `createdAt`).
- Access control:
  - Read: ticket author, associated product seller, and admin/support staff.
  - Create: authenticated users (buyer).
  - Update/Reply: ticket author, associated seller, or admin.
- Migration: PostgreSQL migration to create `tickets` and related tables with foreign keys and compound indices.

### R2. Tickets REST Endpoints & Dispute Business Logic
- **`POST /api/v1/tickets`**:
  - Authenticate the requesting user (401 if unauthenticated).
  - Validate input: `reason`, `subject`, `description`.
  - If `orderId` is provided: verify the requesting user is the owner of that order (403 if attempting to dispute someone else's order).
  - Generate ticket code, set status to `OPEN`, create initial message, and return created ticket (201).
- **`GET /api/v1/tickets`**:
  - Return paginated list of tickets belonging to the current user (or all tickets if admin).
  - Include summary fields: code, reason, subject, status, createdAt, updatedAt, linked order/product.
- **`GET /api/v1/tickets/[id]`**:
  - Return full ticket details and conversation messages thread for authorized parties (ticket author, seller, admin). 403/404 for unauthorized.
- **`POST /api/v1/tickets/[id]/messages`**:
  - Add a reply message to the ticket conversation.
  - Update ticket `updatedAt` and optionally transition status (e.g. buyer reply -> `IN_PROGRESS`, support reply -> `WAITING_USER`).
- **`PATCH /api/v1/tickets/[id]`**:
  - Allow admin or seller to update status, priority, or mark resolution (e.g. `RESOLVED`, `CLOSED`).

### R3. Storefront UI Order Dispute Integration
- Add dispute / support action to the customer order views:
  - On `/orders/[id]` (order details page) and `/orders` (order history): add a clear "Báo lỗi / Khiếu nại" (Report issue / Dispute) button.
  - Clicking opens an accessible Modal Dialog:
    - Pre-selects the order / product.
    - Dropdown to choose reason (`File hỏng không mở được`, `Nội dung không đúng mô tả`, `Lỗi khi tải file`, `Vấn đề thanh toán`, `Khác`).
    - Input fields for subject and detailed description of the error encountered.
    - Submit button with loading state and error handling.
  - Provide a user-friendly ticket history view or modal to check ticket status and conversation replies.

### R4. Automated Testing & Verification Suite
- Create challenger and integration test suites (`web/tests/int/tickets.int.spec.ts` and `web/tests/challenger/tickets-flow.spec.tsx`) covering:
  - Unauthenticated creation rejected (401).
  - Buyer creating ticket with valid order/product (201).
  - Non-owner attempting to file dispute on another buyer's order rejected (403).
  - Adding messages / replies to conversation thread (201).
  - Unauthorized user attempting to read another user's ticket rejected (403).
  - Status transitions (`OPEN` -> `IN_PROGRESS` -> `RESOLVED` / `CLOSED`).
  - Non-regression across all existing 30 integration test files (496 tests).

### R5. Repository Quality & Build Gates
- `pnpm --prefix web lint` must exit 0 with 0 errors.
- `pnpm --prefix web build` must compile cleanly with exit code 0.
- PostgreSQL database triggers, financial ledger reconciliation, and seed invariants must remain intact.

---

## Acceptance Criteria

### Functional & Business Rule Gates
- [ ] `Tickets` collection registered in Payload CMS and visible in admin panel.
- [ ] Authenticated buyers can file support/dispute tickets linked to their purchased orders.
- [ ] Users cannot file disputes on orders belonging to other users (strict ownership check).
- [ ] Conversation thread allows buyers, sellers, and admins to post messages within the ticket.
- [ ] Tickets transition through standard lifecycle (`OPEN`, `IN_PROGRESS`, `WAITING_USER`, `RESOLVED`, `CLOSED`).
- [ ] Storefront order pages render "Báo lỗi / Khiếu nại" dialog and allow seamless ticket creation.

### Verification & Quality Gates
- [ ] Dedicated automated test suite passes with 100% green assertions across all cases (401, 403, 201, replies, transitions).
- [ ] `pnpm --prefix web test:int` passes with zero regressions.
- [ ] `pnpm --prefix web lint` passes with 0 errors.
- [ ] `pnpm --prefix web build` compiles cleanly with exit code 0.
</original_task>
