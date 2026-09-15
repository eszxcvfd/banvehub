# Phase 5 Storefront & Buyer Interface Survey (R4) — Investigation & Architecture Report

## 1. Observation

### 1.1 Technology Stack & Architecture Baseline
- **Next.js & React**: Next.js `16.3.3` (App Router) with React `19.2.6` and Payload CMS `3.89.0` (`web/package.json:57-63`).
- **Styling**: Tailwind CSS v4 (`@tailwindcss/postcss` 4.1.18, `web/src/app/(app)/globals.css`) with OKLCH CSS variables (`--primary`, `--card`, `--muted`, `--accent`, `--border`, `--ring`, etc.) and dark mode support via `data-theme='dark'`.
- **UI System**: Radix UI primitives configured with shadcn/ui components (`web/components.json`):
  - Dialog / Modal: `web/src/components/ui/dialog.tsx` (exports `Dialog`, `DialogTrigger`, `DialogContent`, `DialogHeader`, `DialogFooter`, `DialogTitle`, `DialogDescription`, `DialogClose`).
  - Button: `web/src/components/ui/button.tsx` (cva variants: `default`, `destructive`, `outline`, `secondary`, `ghost`, `link`, `nav`; sizes: `clear`, `default`, `sm`, `lg`, `icon`).
  - Card: `web/src/components/ui/card.tsx` (`Card`, `CardHeader`, `CardTitle`, `CardDescription`, `CardContent`, `CardFooter`).
  - Toast: `sonner` 1.7.2 (`web/src/providers/Sonner.tsx`), already globally mounted in the root provider stack with `richColors position="bottom-left"`.
  - Icons: `lucide-react` 0.563.0 (`DownloadCloud`, `ShoppingBag`, `Wallet`, `CheckCircle`, `AlertCircle`, `ShieldCheck`, `FileText`, `RefreshCw`, `Clock`, etc.).

### 1.2 Product Detail Page Structure & Insertion Point
- **Route**: `web/src/app/(app)/products/[slug]/page.tsx` (Async RSC):
  - Fetches product using `queryProductBySlug({ slug })` at lines 226–251 with `depth: 3`.
  - Lines 159–177 render the Hero Section with `Gallery` (left) and `ProductDescription` (right):
    ```tsx
    <div className="flex flex-col gap-10 rounded-2xl border p-6 sm:p-8 md:py-10 lg:flex-row lg:gap-10 bg-card text-card-foreground shadow-xs">
      <div className="h-full w-full basis-full lg:basis-1/2">
        <Gallery previewGallery={product.previewGallery} gallery={product.gallery} fallbackImage={metaImage} />
      </div>
      <div className="basis-full lg:basis-1/2">
        <ProductDescription product={product} />
      </div>
    </div>
    ```
- **Client Product Description Component**: `web/src/components/product/ProductDescription.tsx` (`'use client'`):
  - Takes `{ product: Product }`.
  - Lines 53–59 render `DigitalProductCTA`:
    ```tsx
    <DigitalProductCTA
      isFree={isFree}
      price={price}
      fileFormat={product.technicalSpecs?.fileFormat}
      fileSize={product.technicalSpecs?.fileSize}
      productTitle={product.title}
    />
    ```
- **Digital Product CTA Component**: `web/src/components/product/DigitalProductCTA.tsx` (`'use client'`):
  - Lines 26–34 currently have placeholder alerts:
    ```tsx
    const handleAction = () => {
      if (free) {
        alert(`Đang chuẩn bị tệp tải xuống: ${productTitle || 'Tài nguyên số'}`)
      } else {
        alert(`Khởi tạo thanh toán số cho: ${productTitle || 'Tài nguyên số'} (${price.toLocaleString('vi-VN')} ₫)`)
      }
    }
    ```
  - Lines 76–93 render:
    - Free state: Green button with `DownloadCloud` icon ("Tải xuống ngay (Miễn phí)").
    - Commercial state: Primary button with `ShoppingBag` icon ("Mua ngay — {price.toLocaleString('vi-VN')} ₫").
  - Formatting: Vietnamese currency is formatted inline via `price.toLocaleString('vi-VN')} ₫`.

### 1.3 Account Layout & Navigation Structure
- **Route Group**: `web/src/app/(app)/(account)/`:
  - `web/src/app/(app)/(account)/layout.tsx`: Server component that fetches session user via `payload.auth({ headers })`. If `user` is truthy, renders `<AccountNav className="max-w-62 grow flex-col items-start gap-4 hidden md:flex" />` on the left and `{children}` on the right within `container mt-16 pb-8 flex gap-8`.
  - `web/src/components/AccountNav/index.tsx`: Client navigation sidebar with active link matching via `usePathname()`. Currently includes:
    - `/account` (Account settings)
    - `/account/addresses` (Addresses)
    - `/orders` (Orders)
    - `/logout` (Log out)
  - Sub-pages currently present:
    - `/account` (`web/src/app/(app)/(account)/account/page.tsx`): Profile settings, recent 5 orders using `<OrderItem order={order} />`.
    - `/orders` (`web/src/app/(app)/(account)/orders/page.tsx`): Full order history.
    - `/orders/[id]` (`web/src/app/(app)/(account)/orders/[id]/page.tsx`): Order details, date, total, status, and `<ProductItem product={item.product} quantity={item.quantity} />`.

### 1.4 Wallet Balance & Financial Data Flow
- **Wallet Service Authority**: `web/src/services/wallet.ts` (Money Write Layer per Decision 0002).
  - Provides `getOrCreateWallet`, `debitWallet`, `creditWallet`.
  - Typed error classes: `InsufficientFundsError`, `WalletNotFoundError`, `WalletFrozenError`, `InvalidAmountError`.
- **Wallet REST API**:
  - `GET /api/v1/me/wallet` (`web/src/app/api/v1/me/wallet/route.ts`): Authenticated endpoint returning:
    ```json
    { "success": true, "wallet": { "id": 1, "balance": 500000, "pendingBalance": 0, "currency": "VND", "status": "active" } }
    ```
  - `GET /api/v1/me/wallet/ledger?limit=20` (`web/src/app/api/v1/me/wallet/ledger/route.ts`): Returns ledger transactions for the user.
- **Wallet Frontend Display**:
  - Top navigation: `web/src/components/Header/index.client.tsx:56-61` renders a badge button pointing to `/wallet` ("Ví tiền").
  - Dedicated Wallet Page: `web/src/app/(app)/wallet/page.tsx` renders `WalletClient.tsx` (`web/src/components/wallet/WalletClient.tsx`) displaying available balance (`wallet.balance.toLocaleString('vi-VN')}₫`), pending balance, status badge, VietQR top-up box, and immutable ledger table.

### 1.5 Auth Context & Session Management
- **Client Auth**: `web/src/providers/Auth/index.tsx` provides `useAuth()`.
  - Exposes `user: User | null | undefined`, `status: 'loggedIn' | 'loggedOut' | undefined`, `login`, `logout`, `create`, etc.
  - Automatically bootstraps on mount via `GET /api/users/me`.
- **Server Auth**: In RSC routes, session is resolved via:
  ```ts
  const headers = await getHeaders()
  const payload = await getPayload({ config: configPromise })
  const { user } = await payload.auth({ headers })
  ```

### 1.6 Existing Tests & Quality Gates Baseline
- **Integration Tests**: `pnpm --prefix web test:int` executed all 17 test suites (242 tests) with 100% pass (34.30s).
- **Challenger Tests**: `pnpm --prefix web test:challenger` executed `tests/challenger/product-detail.spec.tsx` (22 tests) with 100% pass (1.03s).
  - Line 510–538 tests button interaction on `DigitalProductCTA` expecting `window.alert` in its default state.
- **Stress Tests**: `pnpm --prefix web test:stress` executed `tests/stress/privilege-escalation.spec.ts` (28 tests) with 100% pass (2.51s).
- **Linter**: `pnpm --prefix web lint` executed with **exit code 0** (0 errors, 199 warnings across legacy files).

---

## 2. Logic Chain

1. **R4 Storefront Purchase Flow Needs Live Wallet Balance & Atomic Mutation**:
   - `ProductDescription.tsx` already receives the complete `product` object (including `id`, `seller`, `price`, `isFree`, `technicalSpecs`).
   - Clicking "Mua ngay" on `DigitalProductCTA` must not be a dumb alert. It must trigger a modal (`WalletPurchaseModal`) that uses `useAuth()` to check login status, checks anti-self-purchase (BR-04: `user.id === product.seller.id`), fetches current wallet balance from `/api/v1/me/wallet`, and renders two distinct branches:
     - **Branch 1 (Insufficient Balance)**: Displays `wallet.balance` vs `product.price`, calculates shortfall `(product.price - wallet.balance)`, shows alert message, and provides CTA button to `/wallet` ("Nạp thêm tiền vào ví").
     - **Branch 2 (Sufficient Balance)**: Shows snapshot price confirmation, remaining balance preview `(wallet.balance - product.price)`, and button "Xác nhận thanh toán ngay".
   - Executing confirmation posts to `/api/v1/purchases` (or purchase endpoint). On success, it displays receipt info, updates wallet balance, shows instant download CTA button, and triggers `toast.success`.

2. **R4 Free Product Flow Requires Zero-Cost Entitlement & Instant Stream**:
   - Per Decision 0006 and FR-18, free downloads cannot bypass the entitlement ledger; they must record an active entitlement row in `entitlements` collection.
   - For free items (`product.isFree || product.price === 0`), clicking "Tải miễn phí ngay" calls the purchase API with 0 VND debit. Once active entitlement is confirmed, it calls `POST /api/v1/downloads/token` and triggers direct browser download via `/api/v1/downloads/[token]`.

3. **Preserving Challenger Test Compatibility (`product-detail.spec.tsx`)**:
   - `tests/challenger/product-detail.spec.tsx:510-538` explicitly tests `DigitalProductCTA` directly with only `isFree`, `price`, `productTitle`, expecting `alert(...)` when clicked.
   - Therefore, `DigitalProductCTA` should accept optional `product?: Product` or `onPurchase?: () => void`. When `product` or interactive callbacks are provided (as in `ProductDescription.tsx`), it activates the modal/purchase flow. When neither is provided (as in the headless component test), it preserves the alert behavior. This guarantees 100% pass across `test:challenger` with zero regressions.

4. **Buyer Library Location & Navigation Integration**:
   - Next.js App Router route groups keep clean URLs: creating `web/src/app/(app)/(account)/account/downloads/page.tsx` establishes `/account/downloads` while automatically inheriting `(app)/(account)/layout.tsx` (container and `AccountNav` sidebar).
   - In `web/src/components/AccountNav/index.tsx`, adding a tab for `/account/downloads` ("Tài nguyên đã mua" / "Thư viện tệp") gives buyers permanent 1-click access to all their acquired digital assets.
   - The page queries `entitlements` where `user = currentUser.id` and `status = 'active'`, populated with `product` and `order`. Each row displays product thumbnail, title, technical specs (software version, format, size), license type, order reference, and an interactive `DownloadButton` component.

---

## 3. Caveats

- **No existing `entitlements`, `orders`, or `download_events` collections in current Payload schema**:
  - The collections `orders`, `order_items`, `entitlements`, and `download_events` are part of Phase 5 backend implementation (R1, R2, R3). Frontend components must interface with the typed contracts defined in Decision 0002, Decision 0006, and PLAN.md §27.
- **Client download triggering**:
  - Downloads are initiated via ephemeral token (`GET /api/v1/downloads/[token]`). The browser download is triggered cleanly by either opening the URL or creating a transient anchor `<a href="/api/v1/downloads/[token]" download>` element.

---

## 4. Conclusion & Component Architecture Plan

### 4.1 Reusable UI Components to Introduce or Extend

| Component | Path | Responsibility |
|---|---|---|
| `WalletPurchaseModal` | `web/src/components/product/WalletPurchaseModal.tsx` | Dialog using shadcn `Dialog`, `DialogContent`, `DialogHeader`, `DialogFooter`. Performs live balance check via `GET /api/v1/me/wallet`, validates BR-04 (seller self-purchase block), renders balance confirmation vs shortfall top-up CTA, executes purchase mutation, and presents direct download prompt. |
| `DigitalProductCTA` (Enhanced) | `web/src/components/product/DigitalProductCTA.tsx` | Wire up `WalletPurchaseModal` for commercial assets and automated zero-cost entitlement checkout for free products, while retaining test fallback. |
| `ProductDescription` (Updated) | `web/src/components/product/ProductDescription.tsx` | Pass full `product` object (including `product.id`, `product.seller`, `product.title`, `product.price`, `product.isFree`) into `DigitalProductCTA`. |
| `AccountNav` (Updated) | `web/src/components/AccountNav/index.tsx` | Add navigation item for `/account/downloads` ("Tài nguyên đã mua"). |
| `BuyerDownloadsClient` | `web/src/components/account/BuyerDownloadsClient.tsx` | Client table/grid rendering acquired assets with instant download action, loading state, error toasts, and direct links to `/orders/[id]`. |
| `DownloadAssetButton` | `web/src/components/product/DownloadAssetButton.tsx` | Reusable button handling `POST /api/v1/downloads/token` -> `GET /api/v1/downloads/[token]` trigger with spinner and toast notifications. |
| `DownloadsPage` | `web/src/app/(app)/(account)/account/downloads/page.tsx` | Server component fetching user entitlements and rendering the Buyer Library. |

### 4.2 API Contract Dependencies for Frontend

1. **Purchase Mutation Endpoint**:
   - `POST /api/v1/purchases`
   - Request Body: `{ productId: number }`
   - Response (Success): `{ success: true, orderId: string, entitlementId: number, productTitle: string, pricePaid: number }`
   - Response (Insufficient Funds): `{ error: string, code: 'INSUFFICIENT_FUNDS', required: number, balance: number }`
   - Response (Self Purchase Block): `{ error: string, code: 'SELF_PURCHASE_PROHIBITED' }`
   - Response (Already Owned): `{ error: string, code: 'ALREADY_OWNED', entitlementId: number }`

2. **Download Token Endpoint** (per R3 & Decision 0006):
   - `POST /api/v1/downloads/token`
   - Request Body: `{ productId: number }`
   - Response: `{ success: true, token: string, downloadUrl: string, expiresAt: string }`

3. **Download Stream Endpoint** (per R3 & Decision 0006):
   - `GET /api/v1/downloads/[token]`
   - Streams file bytes with headers `Content-Disposition: attachment; filename="..."` and `Content-Type`.

---

## 5. Verification Method

### 5.1 Programmatic Quality Commands
```bash
# 1. Vitest Integration Suite (Must retain 242/242 tests passing)
pnpm --prefix web test:int

# 2. Challenger UI Component Suite (Must pass all 22 tests including DigitalProductCTA)
pnpm --prefix web test:challenger

# 3. Adversarial Stress Suite (Must pass all 28 tests)
pnpm --prefix web test:stress

# 4. Linter Check (Must return exit code 0)
pnpm --prefix web lint

# 5. Production Build (Next.js App Router build verification)
pnpm --prefix web build
```

### 5.2 Manual / E2E Verification Checkpoints
1. **Unauthenticated PDP**: Visiting `/products/[slug]` as a guest and clicking "Mua ngay" or "Tải miễn phí ngay" redirects to `/login?warning=...`.
2. **Seller Self-Purchase Block**: Logging in as product author and attempting to buy own item shows disabled button or BR-04 alert warning.
3. **Insufficient Funds**: With 50,000 VND balance and 200,000 VND product, modal clearly displays shortage (150,000 VND) and provides link to `/wallet`.
4. **Successful Purchase**: With sufficient balance, clicking "Xác nhận thanh toán" debits balance, displays success receipt, and triggers single-click file download.
5. **Buyer Library**: Navigating to `/account/downloads` lists the purchased asset with correct specs, order receipt link, and functional download button.
