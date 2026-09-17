# Reviewer Round 2 Briefing

- **Verdict**: PASS with critical adversarial hardening fixes applied.
- **Key Issues Identified and Fixed**:
  1. **User Impersonation / Anti-Spoofing Vulnerability**:
     - Non-privileged users could create reviews on behalf of other users who hold active entitlements because `enforceReviewInvariants.ts` only assigned `data.user = req.user.id` if `data.user` was falsy. Fixed by strictly enforcing `data.user = req.user.id` whenever `!isPrivileged`.
  2. **Privilege Conflation (`overrideAccess` vs Admin Role)**:
     - Internal API routes invoke Payload methods with `overrideAccess: true`. `enforceReviewInvariants.ts` previously evaluated `isPrivileged = Boolean(overrideAccess || checkRole(['admin', 'moderator']))`, causing regular buyer requests coming through the API routes to be treated as privileged and bypassing role-separation guards. Fixed with strict user role check: `req.user ? checkRole(['admin', 'moderator'], req.user) : Boolean(req.overrideAccess)`.
  3. **Review Title Deletion Bug on Edit**:
     - When an author edited a review and cleared the title input, the client coerced empty title to `undefined`, dropping the field in `JSON.stringify`. The server PUT endpoint therefore omitted `title` from `updateData`, preventing users from clearing optional titles. Fixed in `ProductReviewsSection.tsx` (sending `null`) and in `PUT /api/v1/products/[id]/reviews` (assigning `updateData.title = null`).
  4. **Untrimmed and Unbounded Seller Reply Comment**:
     - `sellerReply.comment` lacked trimming and upper bound validation. Added trimming and a 5,000-character max length constraint in `enforceReviewInvariants.ts`.
  5. **Type Coercion Mismatch on Entitlement Verification**:
     - `activeEntitlements.docs.some(doc => doc.id === entId)` used strict equality, failing when string IDs were provided. Fixed with string normalization `String(doc.id) === String(entId)`.
  6. **Null and Boolean Rating Validation Hole**:
     - Rating validation did not reject booleans or null on review update, risking database constraint violations. Fixed in hook and API routes.
  7. **Test Order-Coupling in Integration Suite**:
     - Isolated runs of `it('returns aggregated summary statistics and review list')` via `-t` failed because the test relied on prior tests having created reviews. Added self-healing review initialization so the test passes hermetically in isolation or in any execution order.
  8. **Accessibility & UX Enhancements**:
     - Star picker buttons now feature explicit `aria-label` attributes.
     - Review content textarea now enforces `maxLength={5000}` on the client.
     - Highlighted `userReview` card now displays moderation badges (`Chờ kiểm duyệt`, `Bị từ chối`) when reviews are pending or rejected.
     - Added Playwright browser test contract `T1-F3-06` verifying `#reviews-section` rendering on the product details page.
- **Test Suite Results**:
  - Integration Tests: 29/29 files passed, 447/447 tests passed (28 reviews tests + 419 existing tests; 0 regressions).
  - Challenger Tests: 4/4 files passed, 72/72 tests passed (12 reviews tests + 60 existing tests).
  - Lint: 0 errors (817 pre-existing warnings, 0 errors).
  - Build: clean Next.js build compilation with exit code 0 (43/43 routes).
  - Seed / Ledger Invariants: 165 PASS / 0 FAIL; 5/5 database triggers active; 55/55 wallets reconciled.
