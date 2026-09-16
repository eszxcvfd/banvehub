# Reviewer Round 1 Handoff Report: Storefront Purchase & Download Flow

> [!WARNING] **Skepticism Disclaimer**
> High confidence on storefront purchase/download client-server integration; remaining risks center on unsimulated cross-browser download manager behaviors and live third-party bank webhook callbacks.

---

## 1. What the Prior Attempt Got Wrong

### Issue 1: Multi-Product Navigation and Session Desync Bug
- **Input**: User purchases Product A (`productId = 10`), transitioning CTA state to `purchased = true`. User then navigates via Next.js client router to Product B (`productId = 11`), which they do not own.
- **Expected**: Product B CTA renders "Mua ngay — [Price] ₫" with commercial licensing badges.
- **Actual**: Product B immediately displayed "Tải xuống ngay" and "Đã sở hữu" because `purchased` was a naked boolean state never reset or keyed to the active `productId`. Clicking download on Product B resulted in an unexpected 403 Forbidden failure.
- **Root Cause**: Unkeyed component state (`purchased`, `hasServerEntitlement`, `insufficientFunds`) retained stale values across product navigation in `DigitalProductCTA.tsx`. In addition, `setHasServerEntitlement` was only called when `data.hasEntitlement` was truthy, never resetting when navigating to an unowned product.

### Issue 2: Guest Entitlement Inheritance Flaw
- **Input**: User views Product A which they own (`hasServerEntitlement = true`). User logs out in the same browser session or page context.
- **Expected**: Guest sees "Mua ngay" (or "Tải xuống ngay (Miễn phí)" if free) and clicking it prompts the login modal.
- **Actual**: `isOwned = !isSeller && (purchased || hasServerEntitlement)` did not require `Boolean(user)`, meaning unauthenticated visitors could be treated as owning the asset if entitlement state was retained.
- **Root Cause**: Missing authentication check in `isOwned` computation (`Boolean(user)`).

### Issue 3: Unhandled Errors (HTTP 500) in Download Token Endpoint
- **Input**: Authenticated buyer requests a download token via `POST /api/v1/downloads/token` for:
  a) A product ID that does not exist in the database (`productId = 999999`).
  b) A free product that is unpublished or unapproved (e.g. `_status: 'draft'`, `moderationStatus: 'pending'`).
- **Expected**:
  a) HTTP 404 with `{ error: 'PRODUCT_NOT_FOUND', message: 'Không tìm thấy sản phẩm.' }`.
  b) HTTP 400 with `{ error: 'PRODUCT_NOT_AVAILABLE', message: 'Sản phẩm hiện không khả dụng để giao dịch.' }`.
- **Actual**:
  a) Returned HTTP 403 Forbidden with "No active entitlement found for this product", obscuring the fact that the product does not exist.
  b) `purchaseProduct` threw `ProductNotAvailableError`, which was unhandled in `POST /api/v1/downloads/token`, causing the server to throw an uncaught exception and return HTTP 500 `INTERNAL_ERROR`.
- **Root Cause**: Missing product existence check and missing error class mappings for `ProductNotAvailableError` and `ProductNotFoundError` in `web/src/app/api/v1/downloads/token/route.ts`.

### Issue 4: Query Leakage & False Positives in Entitlements Endpoint
- **Input**: Authenticated user queries `GET /api/v1/me/entitlements?productId=invalid` or `productId=-1` (and the user owns at least one other active entitlement in the database).
- **Expected**: HTTP 400 Bad Request with `{ error: 'INVALID_REQUEST', message: 'productId không hợp lệ.' }`.
- **Actual**: HTTP 200 OK with `hasEntitlement: true` and a list of unrelated active entitlements, falsely indicating ownership of the queried item.
- **Root Cause**: In `web/src/app/api/v1/me/entitlements/route.ts`, if `productIdParam` was malformed, the code skipped adding the `product` filter to `andConditions`, falling back to returning all entitlements for that user.

### Issue 5: String Seller ID Type Mismatch & Self-Purchase Bypass Risk
- **Input**: Product where `product.seller` is populated as a string ID (e.g., `"42"`).
- **Expected**: `sellerId = "42"` passed to `DigitalProductCTA`, matching `String(user.id) === String(sellerId)` and disabling purchase.
- **Actual**: `ProductDescription.tsx` checked `typeof product.seller === 'number' ? product.seller : null`. A string seller ID evaluated to `null`, allowing a seller to trigger the purchase flow on their own item.
- **Root Cause**: Overly strict type check omitting string representations of foreign keys.

### Issue 6: Premature Loading State Desync in CTA Button
- **Input**: Buyer clicks "Mua ngay", payment succeeds, and download token generation starts.
- **Expected**: Button shows "Đang tạo liên kết tải..." with spinner.
- **Actual**: Button continued to show "Đang xử lý thanh toán..." because `isPurchasing` remained `true` until the outer `finally` block finished, masking the actual download phase.
- **Root Cause**: `setIsPurchasing(false)` was not called before `await triggerDownload()`.

---

## 2. What I Changed

### `web/src/components/product/DigitalProductCTA.tsx`
1. **Keyed State Management**: Refactored component state to track `purchasedProductId: number | null` and `serverEntitledProductId: number | null`. State is dynamically derived via `productId && purchasedProductId === productId` and `productId && serverEntitledProductId === productId`. Navigating between products automatically resets ownership state with 0 cascading renders.
2. **Explicit Auth Guard**: Guarded `isOwned` with `Boolean(user) && !isSeller && (purchased || hasServerEntitlement)`.
3. **Double-Click Lock**: Added immediate guard `if (isSeller || isPurchasing || isDownloading) return` in `handleAction` to eliminate concurrent duplicate clicks.
4. **Accurate Loading Indicators**: Set `setIsPurchasing(false)` upon payment completion before initiating download token generation, updating the button text to `'Đang tạo liên kết tải...'`.
5. **Modal Keying**: Keyed `insufficientFunds` with `productId` so modals automatically unmount if product navigation occurs.

### `web/src/components/product/ProductDescription.tsx`
1. Widened `sellerId` extraction to support `typeof product.seller === 'number' || typeof product.seller === 'string'`.
2. Explicitly typed `sellerId: number | string | null` to satisfy Next.js/Turbopack TypeScript compilation.

### `web/src/app/api/v1/downloads/token/route.ts`
1. Added check for missing product (`!product -> 404 PRODUCT_NOT_FOUND`) when entitlement is absent.
2. Imported and mapped `ProductNotAvailableError` (HTTP 400) and `ProductNotFoundError` (HTTP 404).

### `web/src/app/api/v1/me/entitlements/route.ts`
1. Enforced strict validation on `productIdParam`: returns HTTP 400 `INVALID_REQUEST` if parameter is present but not a positive integer.
2. Coerced `userId` to integer to support both string and numeric user identities.

### `web/tests/challenger/digital-product-cta-e2e.spec.tsx`
- Added 5 new adversarial unit tests verifying:
  - Product navigation state reset
  - Guest never inheriting owned state
  - Guest downloading free product opens login modal
  - String seller ID prevents self-purchase
  - Rapid double-click prevention

### `web/tests/challenger/purchase-routes.spec.tsx` (New Suite)
- Added 9 unit tests verifying route handler edge cases:
  - Guest queries to `/api/v1/me/entitlements`
  - Malformed `productId` query strings (400)
  - Strict product filtering
  - Unauthenticated download token requests (401)
  - Missing productId (400)
  - Non-existent product download token (404)
  - Unapproved free product token generation (400)
  - Seller self-purchase prevention on free product auto-enrollment (400)

---

## 3. Verification Record

### Deep Verification (Ran Actual Tests)
1. **Integration Test Suite (`pnpm --prefix web test:int`)**:
   - **Command**: `pnpm --prefix web test:int`
   - **Result**: **All 28 files and 419 tests passed** (100% pass rate in 65.03s against `kientaohub_test`). Zero regressions.
2. **Challenger Test Suite (`pnpm --prefix web test:challenger`)**:
   - **Command**: `pnpm --prefix web test:challenger`
   - **Result**: **All 3 test files and 43 tests passed** (100% pass rate in 1.30s).
     - `product-detail.spec.tsx`: 22 passed
     - `digital-product-cta-e2e.spec.tsx`: 12 passed
     - `purchase-routes.spec.tsx`: 9 passed
3. **ESLint Gate (`pnpm --prefix web lint`)**:
   - **Command**: `pnpm --prefix web lint`
   - **Result**: **0 errors**, 733 pre-existing repo warnings. Exit code 0.
4. **Production Build Gate (`pnpm --prefix web build`)**:
   - **Command**: `pnpm --prefix web build`
   - **Result**: **Exit code 0**, compiled successfully, **43/43 routes generated cleanly** (including dynamic `/products/[slug]`, `/api/v1/me/entitlements`, `/api/v1/downloads/token`, and `/api/v1/orders/purchase`).

### Shallow Verification (Manual Only)
- Reviewed Vietnamese localization strings across dialog titles, descriptions, and button CTAs.
- Inspected modal accessibility properties (Radix UI `DialogTitle` and `DialogDescription` presence).

### Unverified Aspects
- Physical browser OS download dialog popups across mobile iOS/Android webviews vs desktop Safari/Chrome.
- Live SePay webhook round-trip from external bank IP during active purchase sessions.

---

## 4. Known Issues
- `Minor Robustness Risk`: If a user opens multiple browser tabs and tops up wallet balance in Tab B, Tab A's client DOM will not proactively reflect the new balance until the buyer clicks "Mua ngay", which initiates the real-time server check and displays the updated balance or completes the purchase.
- `Minor Robustness Risk`: In rare cases where an external pop-up blocker aggressively blocks programmatic link clicks (`<a>.click()`), the toast still informs the user and the button transitions to "Tải xuống ngay", allowing manual re-click to trigger download.

---

## 5. Remaining Risk & Next Step
- The feature implementation satisfies all requirements (R1 to R5) and acceptance criteria with 0 lint errors, 0 build errors, 419/419 passing integration tests, and 43/43 passing challenger tests.
- Task is complete and ready for production deployment or merge.
