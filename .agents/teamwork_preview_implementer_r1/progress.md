# Progress: P0 Reviews & Ratings System Implementation

## Completed Milestones

### 1. Payload CMS `Reviews` Collection (R1, FR-20, BR-05)
- Created `web/src/collections/Reviews/index.ts` with required fields:
  - `product`: relationship to `products` (required, indexed)
  - `user`: relationship to `users` (required, indexed)
  - `entitlement`: relationship to `entitlements` (required, indexed)
  - `rating`: integer 1-5 (required)
  - `title`: optional string
  - `content`: textarea string (required, trimmed, min 5 chars)
  - `status`: select (`published`, `pending`, `rejected`), default `published`
  - `sellerReply`: group with `comment` and `repliedAt`
- Created `web/src/access/reviewAccess.ts`:
  - `reviewReadAccess`: public read for `published` status; owners see own reviews; admins/moderators see all.
  - `reviewCreateAccess`: authenticated users.
  - `reviewUpdateAccess`: review owner can edit review, product seller can reply (`sellerReply`), admins/moderators can moderate.
  - `reviewDeleteAccess`: admin only.
- Created `web/src/collections/Reviews/hooks/enforceReviewInvariants.ts`:
  - BR-05 verified-purchase enforcement: user must hold an active entitlement for the product.
  - Uniqueness invariant: single review per buyer-product pair.
  - Rating range check (1 to 5 integer).
  - Content trimming & min-length validation (>= 5 chars).
  - Seller reply auto-timestamp.
  - Non-transferability of user, product, or entitlement on update by non-admins.
- Registered in `web/src/payload.config.ts`.
- Created and executed migration `web/src/migrations/20260917_000000_phase7_reviews.ts` on both `kientaohub` and `kientaohub_test`.
- Updated `payload-types.ts` with `Review` interface via `payload generate:types`.

### 2. Reviews API Endpoints (R2)
- Created `web/src/app/api/v1/products/[id]/reviews/route.ts`:
  - `GET`: resolves product ID or slug; returns paginated published reviews with author names/initials, verified badges, rating statistics (average rating rounded to 1 decimal place, total count, 1-5 star distribution breakdown), and current user's review status if authenticated.
  - `POST`: authenticates user (401), checks input validity (400 for invalid rating or content < 5 chars), enforces BR-05 active entitlement (403), blocks duplicates (409), resolves product (404 if not found), and creates review with status `published` (201).
  - `PUT`: allows review authors to edit their rating, title, and content (200).

### 3. Storefront UI Integration (R3)
- Created `web/src/components/product/ProductReviewsSection.tsx`:
  - Rating summary: overall average rating, filled star rating display, total review count, and 5-bar distribution breakdown with progress bars and percentages.
  - Review list: author avatar initials, author name, verified purchase badge ("Đã mua hàng"), star rating, date formatted in Vietnamese, title, content, and seller reply box.
  - Interactive "Viết đánh giá" modal dialog for eligible buyers with interactive 1-5 star picker, title input, and content textarea.
  - Existing review banner with "Đánh giá của bạn" badge and "Chỉnh sửa đánh giá" action.
  - Non-entitled / unauthenticated explanatory notice for visitors.
- Integrated into `web/src/app/(app)/products/[slug]/page.tsx` directly below the technical specifications table.
- Connected review anchor in `web/src/components/product/ProductDescription.tsx` under the product title for direct navigation to `#reviews-section`.

### 4. Verification & Testing Suite (R4, R5)
- Created `web/tests/int/reviews.int.spec.ts` (17 tests, all passing):
  - 401 unauthenticated check
  - 403 BR-05 non-purchaser rejection
  - 404 non-existent product
  - 400 invalid rating (< 1, > 5, non-integer, missing)
  - 400 blank/short content (< 5 chars)
  - 201 verified review creation
  - 409 duplicate review attempt
  - GET stats calculation (average rating, distribution counts)
  - GET empty state handling
  - PUT review updating
  - Payload collection hook enforcement (BR-05 & duplicate rejection)
  - Access control boundaries (guest cannot read pending reviews; admin can)
- Created `web/tests/challenger/reviews-flow.spec.tsx` (7 tests, all passing):
  - DOM rendering of rating summary, empty state, review list with verified badges
  - Notice display for unauthenticated/unentitled buyers
  - Form validation on short content
  - Form submission via POST and sonner toast feedback
  - User review highlighting and editing
- Full suite verification:
  - `pnpm --prefix web test:int`: 29/29 files passed, 436/436 tests passed (0 regressions).
  - `pnpm --prefix web test:challenger`: 4/4 files passed, 67/67 tests passed.
  - `pnpm --prefix web lint`: 0 errors, exit code 0.
  - `pnpm --prefix web build`: exit code 0, 43/43 routes generated.
  - Development database `kientaohub`: 5/5 triggers active and enabled, 0 ledger mismatches, row counts preserved.
