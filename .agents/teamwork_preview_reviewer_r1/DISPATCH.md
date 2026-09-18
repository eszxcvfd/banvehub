# DISPATCH for teamwork_preview_reviewer_r1

Your working directory is: /home/trung/Documents/2026/project/test-v6/.agents/teamwork_preview_reviewer_r1
Project root is: /home/trung/Documents/2026/project/test-v6

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

<prior_attempt>
> [!WARNING] **Skepticism Disclaimer**
> I am confident in the schema migration, invariant enforcement, REST endpoints, and automated tests because all 31 integration test files (521 total tests), 6 challenger test suites (95 tests), ESLint (0 errors), and Next.js Turbopack build passed cleanly; however, the UI was tested within jsdom and component unit runners rather than live headless browser interaction with a running server.

## 1. What I changed
- `web/src/collections/Tickets/index.ts`: Defined the Payload CMS `Tickets` collection (FR-23 & FLOW-U09) with schema fields `code`, `user`, `seller`, `order`, `product`, `reason`, `subject`, `description`, `status` (`OPEN`, `IN_PROGRESS`, `WAITING_USER`, `RESOLVED`, `CLOSED`), `priority`, `resolution`, and `messages` array for conversation threads.
- `web/src/collections/Tickets/hooks/enforceTicketInvariants.ts`: Invariant hooks for auto-generating unique ticket codes (`TCK-YYYYMMDD-<HEX>`), trimming strings, resolving sellers from products/order items, auto-initializing message threads on creation, and enforcing strict order ownership validation.
- `web/src/access/ticketAccess.ts`: Access controls ensuring authenticated users can create tickets, authors and associated product sellers can view/update their tickets, and admins/moderators retain full management access.
- `web/src/payload.config.ts`: Registered `Tickets` collection.
- `web/src/migrations/20260917_052848_phase9_tickets.ts` & `web/src/migrations/index.ts`: PostgreSQL migration creating `tickets` and `tickets_messages` tables with foreign keys and compound indices (`(user_id, status)`, `(seller_id, status)`, `(order_id, user_id)`), applied to both dev and isolated test databases.
- `web/src/payload-types.ts`: Regenerated TypeScript types for `Tickets`.
- `web/src/app/api/v1/tickets/route.ts`: Built `POST /api/v1/tickets` (401 auth gate, 403 order ownership verification, input validation, 201 creation) and `GET /api/v1/tickets` (scoped listing by buyer/seller/admin role and status filter).
- `web/src/app/api/v1/tickets/[id]/route.ts`: Built `GET /api/v1/tickets/[id]` (authorized ticket detail + conversation retrieval) and `PATCH /api/v1/tickets/[id]` (status, priority, and resolution lifecycle transitions with strict role enforcement).
- `web/src/app/api/v1/tickets/[id]/messages/route.ts`: Built `POST /api/v1/tickets/[id]/messages` to append messages to the conversation thread, detect sender roles (`buyer`, `seller`, `admin`), and transition status between `WAITING_USER` and `IN_PROGRESS`.
- `web/src/components/dispute/OrderDisputeModal.tsx`: Accessible Radix UI modal dialog for customer dispute filing with reason selection, validation alerts, loading states, and toast notifications.
- `web/src/components/dispute/OrderTicketsSection.tsx`: Customer-facing ticket history component displaying ticket status badges, full conversation threads, and reply form.
- `web/src/app/(app)/(account)/orders/[id]/page.tsx`: Integrated `OrderDisputeModal` and `OrderTicketsSection` into the order detail view.
- `web/src/components/OrderItem/index.tsx`: Integrated "Báo lỗi / Khiếu nại" action button onto each order card in `/orders`.
- `web/tests/int/tickets.int.spec.ts`: Dedicated 25 integration tests covering 401 unauthenticated, 400 validation, 404 not found, 403 cross-user dispute attempts, 201 creation, conversation replies, lifecycle state transitions, and role-based ticket listing.
- `web/tests/challenger/tickets-flow.spec.tsx`: Dedicated 9 challenger tests verifying modal interaction, form validation, error banners, submission flow, conversation threads, and ticket closure.

## 2. Why
Fulfills FLOW-U09 and FR-23 requirements for order and product defect reporting/disputes, ensuring strict ownership verification to prevent unauthorized disputes, supporting buyer-seller-admin tripartite conversation threads, and providing clear "Báo lỗi / Khiếu nại" customer entry points on `/orders/[id]` and `/orders`.

## 3. Verification Record
- **Deep Verification (ran actual tests):**
  - `pnpm vitest run tests/int/tickets.int.spec.ts --config ./vitest.config.mts`: 25 passed out of 25.
  - `pnpm vitest run tests/challenger/tickets-flow.spec.tsx --config vitest.challenger.config.mts`: 9 passed out of 9.
  - `pnpm --prefix web test:int`: 31 test files passed, 521 tests passed out of 521 (0 regressions across entire test suite).
  - `pnpm --prefix web test:challenger`: 6 test files passed, 95 tests passed out of 95.
  - `pnpm --prefix web lint`: Exited 0 with 0 errors.
  - `pnpm --prefix web build`: Compiled Next.js 16 with Turbopack cleanly with exit code 0.
- **Shallow Verification (manual run only):**
  - Eyeballed component markup in `OrderDisputeModal.tsx` and `OrderTicketsSection.tsx` for responsive Tailwind classes and accessible Radix Dialog semantics.
- **Unverified aspects:**
  - Did not execute end-to-end browser tests with live running Next.js server and real cookies (`playwright test`).
  - Did not verify admin Payload UI visual appearance in browser when rendering complex nested message threads with Lexical rich text fields.

## 4. Known Issues
- `Minor Robustness Risk` — If an order contains multiple products from different sellers, a dispute created at the order level without selecting a product defaults to linking the first item's seller; selecting a product explicitly is recommended when multiple items exist.

## 5. Untested Edge Cases & Next Step
- Reviewer should test edge case of concurrent reply submissions to `POST /api/v1/tickets/[id]/messages` to ensure array appending under high concurrency does not overwrite messages if concurrent patch occurs.
</prior_attempt>

### Additional Context (Open-Issues Ledger)
The following items remain open from prior worker reports:
- [implementer_1] Did not execute end-to-end browser tests with live running Next.js server and real cookies (playwright test).
- [implementer_1] Did not verify admin Payload UI visual appearance in browser when rendering complex nested message threads with Lexical rich text fields.
- [implementer_1] Minor Robustness Risk — If an order contains multiple products from different sellers, a dispute created at the order level without selecting a product defaults to linking the first item's seller; selecting a product explicitly is recommended when multiple items exist.
- [implementer_1] Reviewer should test edge case of concurrent reply submissions to POST /api/v1/tickets/[id]/messages to ensure array appending under high concurrency does not overwrite messages if concurrent patch occurs.
