# Adversarial Reviewer Round 1 Progress

## Task: P0 Launch-Blocking Reviews & Ratings System Review & Hardening

### Bugs Identified in Prior Attempt:
1. **Concurrency Race Condition (Duplicate POST 500 error instead of 409)**:
   - *Input*: Simultaneous concurrent review submission by the same entitled buyer (`Promise.all([POST, POST])`).
   - *Expected*: One succeeds (201), the other encounters the unique constraint on `(user_id, product_id)` and returns 409 `ALREADY_REVIEWED`.
   - *Actual*: Second request threw 500 `INTERNAL_ERROR`.
   - *Root Cause*: PostgreSQL unique constraint violation was wrapped by Payload CMS into `ValidationError` with message `"The following field is invalid: user_id, product_id"` / `"Value must be unique"`, which failed the substring match `error.message.includes('Duplicate review')`.

2. **In-Memory Summary Aggregation Scalability Bottleneck**:
   - *Input*: `GET /api/v1/products/[id]/reviews` on products with many reviews.
   - *Expected*: Performant O(1) memory database aggregation across all reviews.
   - *Actual*: Loaded up to 1,000 documents into Node.js heap via `payload.find` (`limit: 1000, pagination: false`), truncating total review count and skewing average rating for products > 1,000 reviews.
   - *Root Cause*: In-memory loop over document array instead of PostgreSQL SQL aggregation (`AVG`, `COUNT FILTER`).

3. **Field Security & Role Separation Invariant Bypass**:
   - *Input*: Review update or creation by buyer or seller.
   - *Expected*: Buyer cannot forge seller replies; seller cannot modify buyer rating/content; non-privileged users cannot alter moderation status or transfer core relationships.
   - *Actual*: Hook allowed buyers to set `sellerReply` on create/update and allowed sellers to alter buyer's `rating` or `content` on update.
   - *Root Cause*: `enforceReviewInvariants` did not distinguish author vs seller updates when checking non-privileged updates.

4. **Missing Seller Reply in Highlighted User Review UI**:
   - *Input*: Product page loaded for buyer whose review had a seller reply.
   - *Expected*: Both the reviews list and the user's pinned review highlight card display the seller's reply.
   - *Actual*: `userReview` in GET route lacked `sellerReply` mapping, and `ProductReviewsSection` did not render seller replies in the highlighted card.
   - *Root Cause*: Omission in route response serializer and component JSX.

5. **Hung Infinite Spinner on API Fetch Failure**:
   - *Input*: Network error or 500 response in `ProductReviewsSection.tsx`.
   - *Expected*: Loading state resets (`setLoading(false)`) and UI displays graceful state.
   - *Actual*: Early `return` prevented `setLoading(false)` from ever being called.
   - *Root Cause*: `if (!mounted || !data?.success) return` before `setLoading(false)`.

6. **Missing Input Upper Bounds**:
   - *Input*: Submitting review with arbitrary length content or title.
   - *Expected*: Enforce reasonable upper limits (content <= 5000, title <= 200).
   - *Actual*: Unbounded text lengths accepted.
   - *Root Cause*: Omission of max-length validations.

### Changes Applied:
- `web/src/app/api/v1/products/[id]/reviews/route.ts`:
  - Implemented performant PostgreSQL SQL aggregation via Drizzle (`SELECT COUNT(*), AVG(rating), COUNT(*) FILTER ...`) with safe in-memory fallback.
  - Added max length bounds checks on `content` (5000) and `title` (200).
  - Passed `user` context to `payload.create` and `payload.update`.
  - Added robust detection of Payload's `ValidationError` on `user_id, product_id` to reliably return 409 `ALREADY_REVIEWED`.
  - Added `sellerReply` mapping to `userReview` in GET response.
- `web/src/collections/Reviews/hooks/enforceReviewInvariants.ts`:
  - Enforced role separation: author cannot forge `sellerReply`; seller cannot alter buyer `rating`, `title`, or `content`.
  - Enforced status immutability: non-privileged users cannot alter `status` on update.
  - Stripped `sellerReply` on unprivileged review creation.
  - Enforced upper bounds on content and title.
  - Handled `req.overrideAccess` safely in TypeScript.
- `web/src/components/product/ProductReviewsSection.tsx`:
  - Guaranteed `setLoading(false)` executes even on failed API responses.
  - Rendered seller replies inside the user's pinned review highlight card.
- `web/tests/int/reviews.int.spec.ts`:
  - Added concurrent duplicate POST race condition test (asserting 1 × 201, 1 × 409).
  - Added upper bounds validation tests.
  - Added seller reply creation, role separation, and moderation status immutability tests.
- `web/tests/challenger/reviews-flow.spec.tsx`:
  - Added test verifying seller reply rendering in userReview highlight card.
  - Added test verifying graceful recovery from fetch errors without hanging spinner.

### Verification Results:
- `pnpm --prefix web test:int`: 29/29 files passed, 442/442 tests passed (23 reviews tests + 419 existing tests; 0 regressions).
- `pnpm --prefix web test:challenger`: 4/4 files passed, 69/69 tests passed (9 reviews tests + 60 existing tests).
- `pnpm --prefix web lint`: 0 errors.
- `pnpm --prefix web build`: exit code 0; 43/43 static & dynamic routes compiled cleanly.
- `pnpm --prefix web verify:seed`: 165 PASS / 0 FAIL across 11 probe files; all 5 database triggers active; 55/55 wallets reconciled with 0 ledger mismatches.
