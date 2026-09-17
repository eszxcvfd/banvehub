# Adversarial Reviewer Round 2 Progress

## Task: P0 Launch-Blocking Reviews & Ratings System Review & Hardening

### Bugs Identified and Fixed in Round 2:
1. **User Impersonation / Anti-Spoofing Vulnerability**:
   - *Input*: Authenticated non-privileged user submitting a review via Payload CMS with `data.user` set to another user ID.
   - *Expected*: Non-privileged users must only be able to submit reviews under their own identity (`req.user.id`).
   - *Actual*: Hook only set `data.user = req.user.id` if `data.user` was falsy, allowing caller to spoof arbitrary user IDs if the target user held an active entitlement.
   - *Root Cause*: `enforceReviewInvariants.ts` lacked identity enforcement (`data.user = req.user.id`) for non-privileged users.

2. **Privilege Conflation (`overrideAccess` vs Admin Role)**:
   - *Input*: Controller or API route invoking Payload methods with `overrideAccess: true` for a regular user.
   - *Expected*: Invariant hook should only treat actual administrators and moderators as privileged (`checkRole(['admin', 'moderator'], req.user)`).
   - *Actual*: Evaluated `isPrivileged = Boolean(overrideAccess || checkRole(...))`, meaning any call from internal API routes with `overrideAccess: true` was considered privileged and bypassed role-separation invariants.
   - *Root Cause*: Incorrect logical OR conflating system-level `overrideAccess` with user-level administrator privileges. Fixed to: `req.user ? checkRole(['admin', 'moderator'], req.user) : Boolean(req.overrideAccess)`.

3. **Review Title Deletion Bug on Edit**:
   - *Input*: Author edits review, clears title input, and clicks "Lưu cập nhật".
   - *Expected*: Review title is cleared to `null` in the database.
   - *Actual*: Empty title string was converted to `undefined`, which `JSON.stringify` omitted from the request body. Server PUT handler checked `if (body.title !== undefined)` and skipped updating `title`, leaving the old title in the database.
   - *Root Cause*: Client-side premature coercion to `undefined` and missing `null` serialization for clearing optional fields.

4. **Untrimmed and Unbounded Seller Reply Comment**:
   - *Input*: Seller submits a reply with excessive length (> 5000 characters) or leading/trailing whitespace.
   - *Expected*: Input is trimmed, empty replies are omitted, and replies > 5000 chars are rejected with a 400 validation error.
   - *Actual*: Raw unbounded comment string was accepted directly into the database.
   - *Root Cause*: Omission of seller reply sanitization and validation in `enforceReviewInvariants.ts`.

5. **Type Coercion Mismatch on Entitlement Verification**:
   - *Input*: Entitlement ID supplied as string `"123"` while Payload database document ID is number `123`.
   - *Expected*: Entitlement match succeeds.
   - *Actual*: Strict equality `doc.id === entId` (`123 === "123"`) failed, throwing false-positive `Invalid entitlement` error.
   - *Root Cause*: Missing string normalization on ID comparison.

6. **Null and Boolean Rating Validation Hole**:
   - *Input*: `data.rating = null` on review update or `rating: true` on review creation.
   - *Expected*: 400 Bad Request error.
   - *Actual*: `null` bypassed hook validation and crashed database with NOT NULL constraint violation; `true` coerced to `1` in JavaScript and was accepted as a 1-star review.
   - *Root Cause*: Incomplete type checks in hook and API route.

7. **Test Order-Coupling in Integration Suite**:
   - *Input*: Executing `it('returns aggregated summary statistics and review list')` in isolation via `-t`.
   - *Expected*: Passes independently.
   - *Actual*: Failed with `expected 0 to be 2` because it relied on sequential test execution from previous `it` blocks.
   - *Root Cause*: Lack of self-healing / hermetic review initialization in the test case.

8. **Accessibility & UX Enhancements**:
   - Star picker buttons lacked accessible `aria-label`.
   - Review content textarea lacked `maxLength={5000}`.
   - Pinned `userReview` card now shows moderation badges (`Chờ kiểm duyệt`, `Bị từ chối`) when reviews are pending or rejected.
   - Added Playwright browser test contract `T1-F3-06` verifying `#reviews-section` on `/products/[slug]`.

### Verification Record:
- `pnpm --prefix web test:int`: 29/29 files passed, 447/447 tests passed (28 reviews tests + 419 existing tests; 0 regressions).
- `pnpm --prefix web test:challenger`: 4/4 files passed, 72/72 tests passed (12 reviews tests + 60 existing tests).
- `pnpm --prefix web lint`: 0 errors (817 pre-existing warnings, 0 errors).
- `pnpm --prefix web build`: exit code 0; 43/43 static & dynamic routes compiled cleanly.
- `pnpm --prefix web verify:seed`: 165 PASS / 0 FAIL across 11 probe files; all 5 database triggers active; 55/55 wallets reconciled with 0 ledger mismatches.
