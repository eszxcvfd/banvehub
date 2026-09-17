# Implementation Briefing: Reviews & Ratings System (P0 Launch Blocker)

## Executive Summary
The launch-blocking Reviews & Ratings system (PLAN.md FR-20, BR-05, FLOW-U08) is fully implemented, integrated, and verified end-to-end.
All 5 requirements (R1 through R5) have been implemented and verified with automated test suites, zero lint errors, and a clean production build.

## System Architecture

### 1. Data Layer (`web/src/collections/Reviews/`)
- Collection registered in Payload CMS with table `"reviews"`.
- Required relations: `product` (-> `products`), `user` (-> `users`), `entitlement` (-> `entitlements`).
- Fields: `rating` (integer 1-5), `title` (optional string), `content` (trimmed text >= 5 chars), `status` (`published` | `pending` | `rejected`), `sellerReply` (`comment`, `repliedAt`).
- Migration `20260917_000000_phase7_reviews.ts` applied to both `kientaohub` and `kientaohub_test`.
- Unique constraint: partial/unique index on `("user_id", "product_id")` ensures at most one review per buyer-product pair.
- Check constraint: `CHECK ("rating" >= 1 AND "rating" <= 5)`.
- BeforeValidate hook enforces BR-05 active entitlement validation before write.

### 2. API Layer (`web/src/app/api/v1/products/[id]/reviews/route.ts`)
- `GET /api/v1/products/[id]/reviews`:
  - Returns paginated list of published reviews.
  - Aggregates rating stats: `averageRating` (rounded to 1 decimal place), `totalCount`, and 5-tier distribution `{ 1, 2, 3, 4, 5 }`.
  - Contextual authentication provides `userReview` and `canReview` boolean for seamless UI hydration.
- `POST /api/v1/products/[id]/reviews`:
  - Strict authentication: 401 if unauthenticated.
  - Input validation: 400 if rating not integer 1-5 or content < 5 characters.
  - BR-05 enforcement: 403 if user lacks active entitlement for the product.
  - Duplicate prevention: 409 if user already reviewed this product.
  - Returns 201 with created review.
- `PUT /api/v1/products/[id]/reviews`:
  - Author edit endpoint allowing buyers to update rating and content.

### 3. Storefront UI (`web/src/components/product/ProductReviewsSection.tsx`)
- Section embedded on `/products/[slug]`.
- Overall rating score banner and star display.
- 5-bar rating distribution progress breakdown.
- Verified purchase badge ("Đã mua hàng") on every review.
- Seller response thread display.
- Interactive modal with 1-5 star selector, title input, and content textarea.
- Quick navigation anchor added to `ProductDescription.tsx`.

## Verification Record
- **Deep Verification (Ran Actual Tests):**
  - `pnpm --prefix web test:int`: 29 test files, 436 tests passed (100% green, 0 failures, 0 regressions).
  - `pnpm --prefix web test:challenger`: 4 test files, 67 tests passed (100% green).
  - Dedicated integration suite `tests/int/reviews.int.spec.ts` covers 401, 403, 404, 400, 201, 409, GET stats aggregation, PUT updates, DB hook invariants, and access control boundaries.
  - Dedicated challenger suite `tests/challenger/reviews-flow.spec.tsx` covers UI rendering, forms, and validation.
- **Repository Quality Gates:**
  - `pnpm --prefix web lint`: 0 errors.
  - `pnpm --prefix web build`: 0 errors, 43/43 routes generated cleanly.
  - `kientaohub` dev database: all 5 triggers active and enabled, 0 ledger mismatches, row counts preserved.
