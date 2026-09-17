## 2026-09-17T01:43:32Z

<USER_REQUEST>
You are the SWE Light Orchestrator for KienTaoHub.
Your working directory is: /home/trung/Documents/2026/project/test-v6/.agents/swe_orchestrator_gen5
Your project root is: /home/trung/Documents/2026/project/test-v6
The authoritative user request is recorded in: /home/trung/Documents/2026/project/test-v6/.agents/ORIGINAL_REQUEST.md

Mission:
Implement and integrate the launch-blocking P0 Reviews & Ratings system for KienTaoHub: create the Payload CMS `Reviews` collection with BR-05 verified-purchase enforcement (entitlement-backed), implement secure API routes for submitting and fetching product reviews, and build the customer-facing reviews UI (ratings breakdown, verified badge, and review submission form) on the product details page (`/products/[slug]`).

Key Requirements:
R1. Payload CMS `Reviews` Collection (FR-20, BR-05) in `web/src/collections/` with required relationships (product, user, entitlement), rating 1-5, title, content (trimmed, min length 5), status (default published), sellerReply, proper access control (create only for active entitlement holders; read published public), and unique constraint per buyer-product pair.
R2. Reviews API Endpoints & Business Logic:
- `GET /api/v1/products/[id]/reviews`: paginated published reviews, summary statistics (average rating, total count, 1-5 distribution breakdown).
- `POST /api/v1/products/[id]/reviews`: auth check (401), BR-05 entitlement check (403), duplicate check (409), input validation (400), review record creation linked to entitlement and product.
R3. Storefront UI Reviews & Ratings Integration on `/products/[slug]`:
- Rating summary (average, stars, total count, 5-bar distribution breakdown).
- Review list with verified purchase badge ("Đã mua hàng").
- Interactive review action/form for eligible buyers ("Viết đánh giá"), view/edit existing review, or notice for non-purchasers/guests.
R4. Automated Testing & Verification Suite:
- Dedicated test suite (`web/tests/challenger/reviews-flow.spec.tsx` or `web/tests/int/reviews.int.spec.ts`) covering 401, 403, 201, 409, 400, GET stats aggregation.
- 100% green assertions and zero regressions across existing 28 integration test files (419 tests).
R5. Repository Quality & Build Gates:
- `pnpm --prefix web lint` exits 0 with 0 errors.
- `pnpm --prefix web build` compiles cleanly with exit code 0.
- Database triggers and financial invariants remain untouched and healthy.

Follow the SWE Light protocol:
Spawn one implementer on the whole task, then run repeated adversarial reviewer rounds carrying a cumulative open-issues ledger until all issues are resolved and tests pass cleanly.
Report status in progress.md and BRIEFING.md in your working directory.
When complete, notify the Sentinel with a full handoff and victory claim.
</USER_REQUEST>
