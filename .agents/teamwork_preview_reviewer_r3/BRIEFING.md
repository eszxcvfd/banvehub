# Reviewer Round 3 Briefing: Reviews & Ratings System (P0 Launch Blocker)

## Executive Summary
Round 3 adversarial review examined the P0 Reviews & Ratings system across data integrity, database foreign key constraints, API input edge cases, authorization boundaries, and live service lifecycle interactions. 6 concrete defects were discovered and fixed, including foreign key `ON DELETE SET NULL` on `NOT NULL` columns in PostgreSQL, unhandled `null` and non-object JSON payloads in POST/PUT routes, rogue seller authorization holes in the invariant hook, and lack of test coverage for revoked entitlements and live wallet-to-review lifecycle.

Following all fixes, the entire repository test suite (455 integration tests in 29 files, 74 challenger tests in 4 files) passed with 100% green assertions, 0 lint errors, clean Next.js build compilation (43/43 routes), and 165/165 seed/trigger verification checks.

## Key Defects Identified & Resolved in Round 3
1. **Database Foreign Key Action Mismatch with NOT NULL Columns**:
   - `reviews` table had `NOT NULL` on `user_id` and `entitlement_id`, but foreign key constraint used `ON DELETE set null`. Deletion of a user or entitlement triggered a PostgreSQL NOT NULL violation. Fixed to `ON DELETE cascade` in PostgreSQL and migration `20260917_000000_phase7_reviews.ts`.
2. **Unhandled Non-Object and Null JSON Request Body in API Routes**:
   - `PUT /api/v1/products/[id]/reviews` with `body: null` crashed with a 500 error (`TypeError: Cannot read properties of null`). Hardened both POST and PUT routes with strict object validation `if (!body || typeof body !== 'object' || Array.isArray(body)) return 400`.
   - PUT route now also validates that at least one updatable field (`rating`, `content`, or `title`) is provided, preventing empty no-op updates.
3. **Rogue Seller / Non-Author Privilege Bypass in Invariant Hook**:
   - In `enforceReviewInvariants.ts`, non-author updaters (`!isAuthor`) were assumed to be the product seller without verifying `req.user.id === product.seller`. A rogue seller or third-party could update the seller reply if `overrideAccess: true` was invoked. Added strict ownership check throwing `Unauthorized: You do not have permission to update this review.`
4. **Unhandled Primitive Types and Clearing Logic on Seller Reply**:
   - In `enforceReviewInvariants.ts`, non-string `comment` (numbers, booleans) bypassed length validation. Also, setting `comment: ''` deleted the property instead of setting `comment = null` and `repliedAt = null`, leaving orphaned timestamps. Added strict object and type validation and proper clearing to null.
5. **Untested Invariant: Entitlement Lifecycle (Active vs Revoked)**:
   - Added integration test verifying that a user with a `revoked` entitlement (e.g. following refund) is blocked with HTTP 403 `VERIFIED_PURCHASE_REQUIRED` (BR-05 compliance).
   - Added end-to-end integration test verifying that a wallet purchase via `purchaseProduct` immediately allows review submission with HTTP 201 Created.
6. **Storefront UI Resiliency**:
   - In `ProductReviewsSection.tsx`, `handleSubmitReview` and `refreshReviews` now safely catch `res.json()` SyntaxError exceptions if the server returns a non-JSON error (e.g. 502 HTML page).
   - Rating summary and breakdown calculations are defensive against missing or partial distributions.
   - Verified badge is guarded with `rev.verifiedPurchase`.

## Final Test Execution Evidence
- `pnpm --prefix web test:int tests/int/reviews.int.spec.ts`: 36/36 passed (33 prior + 3 new tests: null body, revoked entitlement, live purchase e2e, rogue seller, reply clearing, deletion access control).
- `pnpm --prefix web test:int`: 29/29 files passed, 455/455 tests passed (0 regressions).
- `pnpm --prefix web test:challenger`: 4/4 files passed, 74/74 tests passed (14/14 reviews flow tests).
- `pnpm --prefix web lint`: 0 errors (831 pre-existing warnings, 0 errors).
- `pnpm --prefix web build`: exit code 0; 43/43 routes generated cleanly.
- `pnpm --prefix web verify:seed`: 165 PASS / 0 FAIL / 14 INFO across 11 probe files.
