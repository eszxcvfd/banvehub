# Reviewer Round 2 Handoff Report: Storefront Purchase & Download Flow

> [!WARNING] **Skepticism Disclaimer**
> Moderate-to-high confidence across storefront purchase, user session isolation, wallet debit, and download token endpoints; remaining external risks center on real-world browser pop-up blockers, cross-tab session storage sync, and physical network drops during large binary streaming.

---

## 1. What the Prior Attempt Got Wrong

### Issue 1: Cross-User Account Switch & Session Desync Bug (Unauthorized Ownership Assumption)
- **Input**: User 1 (owns Product 10) logs out in an active tab. User 2 (does NOT own Product 10) logs in within the same browser tab and navigates to Product 10.
- **Expected**: User 2 sees "Mua ngay — [Price] ₫" and commercial licensing badges.
- **Actual**: User 2 immediately saw "Tải xuống ngay" and "Đã sở hữu". When User 2 clicked download, the server rejected the request with HTTP 403 Forbidden because User 2 has no entitlement in the database. User 2 was locked out of purchasing the product.
- **Root Cause**: In `DigitalProductCTA.tsx`, component state `purchasedProductId` and `serverEntitledProductId` tracked only `productId: number | null` without scoping to `userId`. When `user` changed from User 1 to User 2, `purchased = Boolean(productId && purchasedProductId === productId)` and `isOwned = Boolean(user) && !isSeller && (purchased || hasServerEntitlement)` evaluated to `true` for User 2 using User 1's lingering `purchasedProductId`.

### Issue 2: Negative Entitlement Query Failed to Clear Server Entitlement State
- **Input**: User views Product 10 where `serverEntitledProductId` was previously set to 10 (e.g. prior session or revoked/refunded entitlement). Server `GET /api/v1/me/entitlements?productId=10` responds with `{ success: true, hasEntitlement: false }`.
- **Expected**: Component resets ownership state, transitioning button from "Tải xuống ngay" to "Mua ngay".
- **Actual**: Component remained in "Đã sở hữu" / "Tải xuống ngay".
- **Root Cause**: In `DigitalProductCTA.tsx`, `useEffect` only called `setServerEntitledProductId(productId)` when `data?.hasEntitlement` was truthy (`if (mounted && data?.hasEntitlement)`), lacking an `else` branch to clear stale entitlement state when `hasEntitlement` was false.

### Issue 3: Insufficient Funds Modal Trapped Buyers without In-Modal Retry Flow
- **Input**: Authenticated buyer with insufficient wallet balance clicks "Mua ngay", opening the Insufficient Funds modal. Buyer tops up their balance in another browser tab or via QR code.
- **Expected**: Modal provides a seamless action to re-verify funds and retry the purchase, and opening `/wallet` retains the checkout page.
- **Actual**: Modal only offered "Để sau" and a same-tab `<Link href="/wallet">` that navigated away from the product page. Buyers who topped up via another tab had no way to retry without closing the modal and re-triggering checkout from the main button. In addition, `setInsufficientFunds(null)` was not called upon successful purchase.
- **Root Cause**: Lack of retry handler in modal actions, and lack of `target="_blank" rel="noopener noreferrer"` on top-up link.

### Issue 4: Non-Integer and Malformed Query Parameters in Entitlements and Download Token APIs
- **Input**:
  a) Client calls `GET /api/v1/me/entitlements?productId=10abc` or `productId=10.5`.
  b) Client calls `POST /api/v1/downloads/token` with `{ productId: true }` or `{ productId: 1.5 }`.
- **Expected**: Both endpoints strictly validate input and return HTTP 400 Bad Request with `{ error: 'INVALID_REQUEST' }`.
- **Actual**:
  a) `parseInt('10abc', 10)` in JavaScript parsed `10`, treating malformed input as valid.
  b) `Number(true)` coerced to `1`, and `Number(1.5)` parsed float `1.5`, causing integer relation query errors in PostgreSQL.
- **Root Cause**: Loose numeric validation using `Number(rawProductId)` and unanchored `parseInt` without regex integer validation (`/^\d+$/`).

### Issue 5: Potential Type Mismatch on User ID in Download Token Endpoint
- **Input**: User session where `user.id` is populated as a string (e.g., `'42'`).
- **Expected**: `POST /api/v1/downloads/token` normalizes `user.id` to an integer before querying relations and issuing tokens.
- **Actual**: `user.id` was passed directly as string to `createDownloadToken` and `purchaseProduct`, which expect numeric user IDs for relation queries.
- **Root Cause**: Missing numeric coercion for `user.id` in `web/src/app/api/v1/downloads/token/route.ts`.

### Issue 6: Runtime Crash Risk on Null Price Props
- **Input**: Component receives `price={null as any}`.
- **Expected**: Safe display with default `0 ₫` or free asset styling without crashing.
- **Actual**: Direct calls to `price.toLocaleString('vi-VN')` threw a runtime `TypeError` (`Cannot read properties of null (reading 'toLocaleString')`).
- **Root Cause**: Bypassing the computed `numericPrice` guard in price and modal display strings.

---

## 2. What I Changed

### `web/src/components/product/DigitalProductCTA.tsx`
1. **User & Product Scoped State**:
   - Refactored `serverEntitled`, `purchased`, and `insufficientFunds` states to record `{ userId, productId }`.
   - Ownership `hasServerEntitlement`, `hasLocalPurchase`, `isOwned`, and `activeInsufficientFunds` strictly verify `currentUserId === state.userId && productId === state.productId`. Switching user accounts or navigating products cleanly prevents cross-user state inheritance.
2. **Robust Entitlement Synchronization**:
   - Added `AbortController` to cancel in-flight entitlement requests on unmount or prop change.
   - Handled negative (`hasEntitlement: false`) responses and network errors by clearing `serverEntitled` state for that user and product.
   - Eliminated synchronous `setState` in the effect body to satisfy React 19 / Next.js ESLint rules (`react-hooks/set-state-in-effect`).
3. **Enhanced Insufficient Funds Modal**:
   - Added "Đã nạp tiền, thử lại" action button with `RefreshCw` icon that triggers `handlePurchase()` directly from the modal.
   - Added `target="_blank" rel="noopener noreferrer"` to `/wallet` top-up link to preserve the buyer's checkout tab.
   - Cleared `insufficientFunds` on successful purchase or when 409 already owned.
4. **Crash-Proof Price Display**:
   - Swapped all `price.toLocaleString('vi-VN')` occurrences for `numericPrice.toLocaleString('vi-VN')`.
5. **Download Resilience**:
   - Added toast description indicating manual retry instructions if automatic browser download is blocked.

### `web/src/app/api/v1/downloads/token/route.ts`
1. Strictly validated `productId` using integer checks (`Number.isInteger` and `/^\d+$/`), rejecting booleans, floats, and malformed strings with 400 `INVALID_REQUEST`.
2. Normalized `user.id` to an integer (`userId`), ensuring consistency with Payload relation queries.
3. Enhanced error checking for `EntitlementRequiredError` to support both `instanceof` and `err?.name === 'EntitlementRequiredError'`.

### `web/src/app/api/v1/me/entitlements/route.ts`
1. Enforced regex integer validation (`/^\d+$/`) on `productIdParam`, rejecting partial text (e.g. `'10abc'`) and floats with 400 `INVALID_REQUEST`.
2. Coerced `user.id` to integer and verified positive ID.
3. Safely mapped `doc.product` to prevent null property access if a product relation is null.

### `web/src/components/product/ProductDescription.tsx`
1. Refined `sellerId` extraction to ensure it safely falls back to `null` if `sellerObj.id` is missing.

### `web/tests/challenger/digital-product-cta-e2e.spec.tsx`
- Added adversarial tests:
  - User session switch in same tab (User 2 does not inherit User 1 ownership).
  - Insufficient funds modal direct retry via "Đã nạp tiền, thử lại".
  - Price null/zero resilience.

### `web/tests/challenger/purchase-routes.spec.tsx`
- Added adversarial tests:
  - Strict rejection of float / partial alphabetic `productId` in `GET /api/v1/me/entitlements`.
  - Strict rejection of boolean / float `productId` in `POST /api/v1/downloads/token`.
  - Coercion of string `user.id` to integer in `POST /api/v1/downloads/token`.

---

## 3. Verification Record

- **Deep Verification (ran actual tests):**
  - `pnpm --prefix web test:challenger`: **50/50 passed** across 3 test files (100% pass rate in 1.23s).
    - `product-detail.spec.tsx`: 22 passed
    - `digital-product-cta-e2e.spec.tsx`: 15 passed
    - `purchase-routes.spec.tsx`: 13 passed
  - `pnpm --prefix web test:int`: **419/419 passed** across 28 files (100% pass rate in 65.47s against `kientaohub_test`). Zero regressions.
  - `pnpm --prefix web lint`: **0 errors**, 740 pre-existing warnings in repo. Exit code 0.
  - `pnpm --prefix web build`: **Exit code 0**, compiled successfully in 4.4s, **43/43 routes generated cleanly** via Turbopack.

- **Shallow Verification (manual only):**
  - Inspected button labels and Vietnamese copy across states: "Mua ngay — [Price] ₫", "Tải xuống ngay", "Tải xuống ngay (Miễn phí)", "Sản phẩm của bạn", "Đã nạp tiền, thử lại".
  - Verified ARIA dialog semantics (Radix UI `DialogTitle` and `DialogDescription` present in both Login and Insufficient Funds modals).

- **Unverified aspects:**
  - Real-world browser popup/download blocker behaviors on strict mobile Safari or embedded webviews.
  - Live bank webhook callback latency during concurrent high-traffic checkout spikes.

---

## 4. Known Issues
- `Minor Robustness Risk`: If a user has multiple tabs open on the same product and purchases on Tab A, Tab B's DOM will update when the user clicks the CTA button or when the page re-focuses/refreshes.
- `Minor Robustness Risk`: If a user's network connection drops completely mid-stream during binary download from `/api/v1/downloads/[token]`, the client must re-click "Tải xuống ngay" to obtain a fresh token and resume.

---

## 5. Remaining risk & next step
- The implementation has survived two full rounds of adversarial review. All functional requirements (R1 through R5), edge cases (user account switching, negative entitlement caching, partial integer parsing, null price props, insufficient balance retry), and quality gates are completely satisfied.
- The feature is complete and production-ready.
