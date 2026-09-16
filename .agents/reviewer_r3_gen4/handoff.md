# Reviewer Round 3 Handoff Report: Storefront Purchase & Download Flow

> [!WARNING] **Skepticism Disclaimer**
> High confidence across backend purchase routing, multi-tab real-time synchronization, session isolation, wallet debit, and download token generation; remaining real-world variables are confined to platform-level network timeouts and browser sandbox download permissions on legacy mobile webviews.

---

## 1. What the Prior Attempt Got Wrong

### Issue 1: Multi-Tab Real-Time Session Desync (Ledger Item Carried Over)
- **Input**: Buyer opens Product 10 in Tab A and Tab B simultaneously. Buyer purchases Product 10 in Tab A.
- **Expected**: Tab B automatically detects the purchase event and transitions its CTA button to "Tải xuống ngay" / "Đã sở hữu" in real-time or when the buyer focuses/switches to Tab B, without requiring a manual page refresh.
- **Actual**: Tab B remained stuck in "Mua ngay — [Price] ₫". Tab B had no cross-tab event communication (`BroadcastChannel` or `storage` event) and no window `focus`/`visibilitychange` revalidation.
- **Root Cause**: `DigitalProductCTA.tsx` did not broadcast purchase events on completion and lacked lifecycle listeners (`BroadcastChannel`, `storage`, `focus`, `visibilitychange`) to synchronize state with peer tabs.

### Issue 2: Loose Input Validation and Float/String Injection in Purchase Route (`POST /api/v1/orders/purchase`)
- **Input**:
  a) Client calls `POST /api/v1/orders/purchase` with `{ productId: 10.5 }`.
  b) Client calls `POST /api/v1/orders/purchase` with `{ productId: "10abc" }`.
  c) Client calls `POST /api/v1/orders/purchase` with `{ productId: true }`.
  d) Client session where `user.id` is invalid or non-numeric.
- **Expected**: Strict rejection with HTTP 400 Bad Request `{ error: 'INVALID_REQUEST' }` and HTTP 401 `{ error: 'UNAUTHORIZED' }`.
- **Actual**:
  a) `typeof 10.5 === 'number'` passed validation and sent float `10.5` directly to Payload / PostgreSQL database relation queries.
  b) `parseInt("10abc", 10)` silently truncated `"abc"` and purchased Product 10 instead of rejecting malformed data.
  c) `buyerId` was unvalidated for positive integer range.
- **Root Cause**: Missing strict integer regex (`/^\d+$/`) and `Number.isInteger` checks in `web/src/app/api/v1/orders/purchase/route.ts`. The strict validation added to `downloads/token` and `me/entitlements` in prior rounds had not been backported to `orders/purchase`.

### Issue 3: Potential Runtime Crash on Missing Product ID with Null Price Props in Fallback Alert
- **Input**: Component rendered in mock or standalone view where `productId` is `undefined` and `price={null as any}`. User clicks the button.
- **Expected**: Graceful fallback alert display using derived `numericPrice` (`0 ₫`).
- **Actual**: Runtime `TypeError: Cannot read properties of null (reading 'toLocaleString')` at line 362.
- **Root Cause**: `handleAction` fallback branch directly invoked `price.toLocaleString('vi-VN')` instead of the sanitized `numericPrice.toLocaleString('vi-VN')`.

### Issue 4: Concurrent Double-Submit Vulnerability on Insufficient Funds Modal Retry Button
- **Input**: User with insufficient balance clicks "Đã nạp tiền, thử lại" multiple times rapidly while payment request is in flight.
- **Expected**: Button is disabled with loading spinner (`disabled={isPurchasing}`) to prevent duplicate in-flight purchase requests.
- **Actual**: Button lacked `disabled={isPurchasing}` attribute and spinner state.
- **Root Cause**: Missing `disabled={isPurchasing}` guard on the retry button inside the Insufficient Funds modal.

---

## 2. What I Changed

### `web/src/components/product/DigitalProductCTA.tsx`
1. **Multi-Tab Real-Time Synchronization**:
   - Implemented `broadcastPurchase(userId, productId)` leveraging modern `BroadcastChannel('kientaohub_purchases')` with `localStorage` fallback.
   - Dispatched broadcasts immediately upon successful commercial purchase, free product auto-enrollment download, and 409 already-owned confirmation.
   - Added `useEffect` in `DigitalProductCTA` listening to `BroadcastChannel`, `storage` events, window `focus`, and `visibilitychange`. Peer tabs open to the same product automatically transition to "Tải xuống ngay" and "Đã sở hữu" in real-time.
2. **Crash-Proof Fallback Alert**:
   - Replaced `price.toLocaleString('vi-VN')` in `handleAction` with `numericPrice.toLocaleString('vi-VN')`.
3. **Double-Submit Prevention in Modal**:
   - Added `disabled={isPurchasing}` and animated spinning icon `<RefreshCw className={isPurchasing ? 'animate-spin' : ''} />` to the "Đã nạp tiền, thử lại" button in the Insufficient Funds modal.

### `web/src/app/api/v1/orders/purchase/route.ts`
1. **Strict Positive Integer Validation**:
   - Replaced loose `parseInt` and float-allowing `typeof rawProductId === 'number'` with strict validation (`Number.isInteger(rawProductId) && rawProductId > 0` and `/^\d+$/.test(...)`), rejecting floats (`10.5`), booleans, and malformed strings (`"10abc"`) with 400 `INVALID_REQUEST`.
2. **Buyer ID Normalization & Validation**:
   - Enforced integer normalization and positive integer check on `buyerId`, returning 401 `UNAUTHORIZED` if invalid.

### `web/tests/challenger/purchase-routes.spec.tsx`
- Added 7 comprehensive test cases for `POST /api/v1/orders/purchase`:
  - 401 UNAUTHORIZED for unauthenticated guests.
  - 400 INVALID_REQUEST for missing productId.
  - 400 INVALID_REQUEST for float, boolean, and malformed alphanumeric `productId`.
  - 400 INSUFFICIENT_FUNDS with balance and shortfall details.
  - 409 ALREADY_OWNED when buyer already holds entitlement.
  - 400 SELF_PURCHASE_FORBIDDEN for authors attempting self-purchase.
  - Normalization of string `user.id` to integer.

### `web/tests/challenger/digital-product-cta-e2e.spec.tsx`
- Added 3 adversarial test cases:
  - Fallback alert handling unpopulated `productId` with null price gracefully.
  - Real-time cross-tab synchronization via `BroadcastChannel` transitioning Tab B to owned state without page refresh.
  - Window `focus` revalidation updating entitlement state on tab switch.

---

## 3. Verification Record

- **Deep Verification (ran actual tests):**
  - `pnpm --prefix web test:challenger`: **60/60 passed** across 3 test files (100% pass rate in 1.25s).
    - `product-detail.spec.tsx`: 22 passed
    - `purchase-routes.spec.tsx`: 20 passed (+7 new route tests)
    - `digital-product-cta-e2e.spec.tsx`: 18 passed (+3 new cross-tab & edge tests)
  - `pnpm --prefix web test:int`: **419/419 passed** across 28 files (100% pass rate in 66.23s against database `kientaohub_test`). Zero regressions.
  - `pnpm --prefix web lint`: **0 errors**, 751 pre-existing warnings in repo. Exit code 0.
  - `pnpm --prefix web build`: **Exit code 0**, compiled successfully in 3.7s, **43/43 routes generated cleanly** via Turbopack.

- **Shallow Verification (manual only):**
  - Inspected modal accessibility: Radix UI `DialogTitle` and `DialogDescription` properly bound with ARIA labels.
  - Verified Vietnamese copy for all states: "Mua ngay — [Price] ₫", "Tải xuống ngay", "Tải xuống ngay (Miễn phí)", "Sản phẩm của bạn", "Đã nạp tiền, thử lại", "Số dư ví không đủ".

- **Unverified aspects:**
  - Physical browser binary stream interruption during multi-gigabyte downloads over flaky cellular networks (handled by 5-minute token TTL + single-click re-download).
  - Webview download sandboxing in third-party embedded apps (e.g., in-app Facebook/Zalo browser download blockers).

---

## 4. Known Issues
- `Minor Robustness Risk`: If a user has a strict third-party popup blocker that suppresses programmatic link clicks (`<a>.click()`), the toast notification instructs the user to check download permissions, and the button remains ready as "Tải xuống ngay" for direct user-initiated re-click.
- `Minor Robustness Risk`: If a binary download stream drops mid-transfer after the 5-minute download token expires, the buyer must re-click "Tải xuống ngay" to generate a fresh token.

---

## 5. Remaining risk & next step
- The implementation has now undergone three full rounds of adversarial review and fixes.
- All functional requirements (R1 through R5), open issues ledger items (multi-tab session desync, float/malformed injection in purchase route, null price safety, concurrency double-clicks, guest flow, self-purchase blocking), and repository quality gates are completely satisfied.
- The feature is complete and production-ready.
