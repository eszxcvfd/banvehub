# Project: KienTaoHub — Phase 5: Purchase & Download

## Architecture
- **Overview**: Delivers digital product checkout from internal wallet balance, snapshot-price order creation, entitlement granting, secure authenticated file streaming from private storage, and responsive buyer storefront/library interfaces per PLAN.md §27, Decision 0002, and Decision 0006.
- **Module Boundaries**:
  - `web/src/collections/`: Data schema for `Orders`, `OrderItems`, `Entitlements`, and `DownloadEvents`.
  - `web/src/migrations/`: PostgreSQL Batch 6 migration with strict indices, constraints, and triggers.
  - `web/src/services/purchase.ts`: Money Write Layer integration, coordinating `debitWallet`, order creation, and entitlement grant in a single atomic database transaction.
  - `web/src/services/download.ts`: Token generation (JWT 5-min TTL) and authenticated private file streaming with audit logging.
  - `web/src/app/api/v1/`: Next.js Route handlers for purchase (`/api/v1/orders/purchase`), download token (`/api/v1/downloads/token`), and file streaming (`/api/v1/downloads/[token]`).
  - `web/src/components/product/`: Storefront purchase modal (`WalletPurchaseModal`), product CTA (`DigitalProductCTA`), and product description integration.
  - `web/src/app/(app)/(account)/account/downloads/`: Buyer library page displaying acquired assets with instant download capabilities.
  - `web/tests/int/`: Comprehensive test suites validating end-to-end flows, security boundaries, and financial invariants.

## Feature Inventory
| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| 1 | Digital Orders Collection | `orders` schema with code, buyer, totalAmount, currency, status, paymentSource, paidAt | M1 | ORIGINAL_REQUEST R1, PLAN.md FR-15 |
| 2 | Snapshot Order Items Collection | `order_items` schema with salePrice (BR-07), platformFee, sellerAmount, tax, policyVersion | M1 | ORIGINAL_REQUEST R1, Decision 0003 |
| 3 | Entitlements Ledger Collection | `entitlements` schema with user, product, order, status, grantedAt, downloadCount, partial unique active index | M1 | ORIGINAL_REQUEST R2, Decision 0006, PLAN.md FR-16 |
| 4 | Download Events Audit Collection | `download_events` append-only audit schema for tracking stream attempts, tokens, IPs, user agents, and status | M1 | ORIGINAL_REQUEST R3, Decision 0006, PLAN.md FR-17 |
| 5 | PostgreSQL Migration Batch 6 | DDL migration creating digital orders, order_items, entitlements, download_events, indices, and constraints | M1 | ORIGINAL_REQUEST Acceptance Criteria |
| 6 | Anti-Self-Purchase Invariant (BR-04) | Validation preventing sellers from buying their own products | M2 | ORIGINAL_REQUEST R1, PLAN.md BR-04 |
| 7 | Atomic Wallet Purchase Transaction | Single DB transaction combining `debitWallet`, order creation (COMPLETED), order item snapshot, and entitlement grant | M2 | ORIGINAL_REQUEST R1, Decision 0002, PLAN.md FR-14 |
| 8 | Free Product Instant Checkout | Zero-cost checkout granting active entitlement with 0 VND debit | M2 | ORIGINAL_REQUEST R1, PLAN.md FR-18 |
| 9 | Purchase API Endpoint | `POST /api/v1/orders/purchase` handling digital purchases with typed error responses | M2 | ORIGINAL_REQUEST R1 |
| 10 | Private Storage Boundary (BR-06) | Enforce `web/private/product_files` isolation with zero public URL exposure | M3 | ORIGINAL_REQUEST R3, Decision 0006, PLAN.md BR-06 |
| 11 | Signed One-Time Download Token Rail | `POST /api/v1/downloads/token` issuing 5-minute cryptographically signed JWT token for active entitlement holders | M3 | ORIGINAL_REQUEST R3, Decision 0006, PLAN.md FR-17 |
| 12 | Authenticated File Streaming Endpoint | `GET /api/v1/downloads/[token]` validating token/entitlement, logging audit event, and streaming file bytes | M3 | ORIGINAL_REQUEST R3, Decision 0006 |
| 13 | Storefront "Mua ngay bằng ví" Modal | Modal performing live balance check, shortfall warning, top-up redirect, and purchase confirmation | M4 | ORIGINAL_REQUEST R4, PLAN.md FR-14 |
| 14 | Storefront "Tải miễn phí ngay" CTA | Instant zero-cost entitlement claim and direct download trigger | M4 | ORIGINAL_REQUEST R4, PLAN.md FR-18 |
| 15 | Buyer Library / Downloads Interface | `/account/downloads` page displaying purchased assets, technical specs, order receipts, and download buttons | M4 | ORIGINAL_REQUEST R4, PLAN.md FR-19 |
| 16 | Account Navigation Integration | Update `AccountNav` to include `/account/downloads` link | M4 | ORIGINAL_REQUEST R4 |
| 17 | Test Suite: Purchase Workflow | `tests/int/purchase-workflow.int.spec.ts` validating wallet debit, order creation, and entitlement grant | M5 / Test Track | ORIGINAL_REQUEST R5 |
| 18 | Test Suite: Secure Download | `tests/int/secure-download.int.spec.ts` validating token generation, expiration rejection, entitlement checking, and private file streaming | M5 / Test Track | ORIGINAL_REQUEST R5 |
| 19 | Test Suite: Purchase Invariants | `tests/int/purchase-invariants.int.spec.ts` validating BR-04 (self-purchase), BR-07 (snapshot pricing), and insufficient funds | M5 / Test Track | ORIGINAL_REQUEST R5 |
| 20 | Final Quality Gates & Regression Verification | 100% pass across all 17 existing test suites (242 tests), challenger tests, stress tests, zero ESLint errors, clean build | M5 | ORIGINAL_REQUEST R5 |

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| TestTrack | E2E Testing Track | Design & implement opaque-box test suites (Tiers 1-4) in `tests/int/` deriving from requirements, publish `TEST_READY.md` | none | DONE |
| M1 | Schema & Migration Batch 6 | Collections `Orders`, `OrderItems`, `Entitlements`, `DownloadEvents`, Payload config, migration Batch 6, Drizzle indices & constraints | none | DONE |
| M2 | Atomic Purchase & Wallet Transaction | `purchaseProduct` service, atomic DB transaction (`debitWallet` + order + entitlement), free product checkout, `POST /api/v1/orders/purchase` | M1 | PLANNED |
| M3 | Secure Download Engine & Token Rail | `POST /api/v1/downloads/token` (5-min JWT), `GET /api/v1/downloads/[token]`, `download_events` audit logging, private file streaming | M1, M2 | PLANNED |
| M4 | Storefront Purchase Flow & Buyer Library UI | `WalletPurchaseModal`, `DigitalProductCTA` enhancement, `ProductDescription`, `/account/downloads` Buyer Library, `AccountNav` link | M2, M3 | PLANNED |
| M5 | Final Verification & Adversarial Hardening | Run all test suites against completed implementation, Phase 1 (100% E2E pass), Phase 2 (Adversarial coverage hardening Tier 5), ESLint, Next.js build | TestTrack, M1, M2, M3, M4 | PLANNED |

## Interface Contracts

### Purchase Service & API
```ts
export interface PurchaseResult {
  success: boolean
  orderId: string
  orderCode: string
  entitlementId: number
  productTitle: string
  pricePaid: number
}

export async function purchaseProduct(
  payload: Payload,
  params: {
    buyerId: number
    productId: number
    req?: PayloadRequest
  }
): Promise<PurchaseResult>
```

### Download Service & API
```ts
export interface DownloadTokenPayload {
  userId: number
  productId: number
  entitlementId: number
  jti: string
  exp: number
}

export async function createDownloadToken(
  payload: Payload,
  params: {
    userId: number
    productId: number
  }
): Promise<{ token: string; downloadUrl: string; expiresAt: Date }>

export async function verifyAndStreamDownload(
  payload: Payload,
  token: string,
  clientMetadata: { ipAddress?: string; userAgent?: string }
): Promise<{
  stream: NodeJS.ReadableStream
  filename: string
  mimeType: string
  filesize: number
}>
```

## Code Layout
- Collections:
  - `web/src/collections/Orders/index.ts`
  - `web/src/collections/OrderItems/index.ts`
  - `web/src/collections/Entitlements/index.ts`
  - `web/src/collections/DownloadEvents/index.ts`
- Access Control:
  - `web/src/access/orderAccess.ts`
  - `web/src/access/entitlementAccess.ts`
  - `web/src/access/downloadEventAccess.ts`
- Migrations:
  - `web/src/migrations/20260915_073000_phase5_purchase_download.ts`
  - `web/src/migrations/20260915_073000_phase5_purchase_download.json`
- Services:
  - `web/src/services/purchase.ts`
  - `web/src/services/download.ts`
- API Routes:
  - `web/src/app/api/v1/orders/purchase/route.ts`
  - `web/src/app/api/v1/downloads/token/route.ts`
  - `web/src/app/api/v1/downloads/[token]/route.ts`
  - `web/src/app/api/v1/me/orders/route.ts`
  - `web/src/app/api/v1/me/downloads/route.ts`
- UI Components:
  - `web/src/components/product/WalletPurchaseModal.tsx`
  - `web/src/components/product/DigitalProductCTA.tsx` (enhanced)
  - `web/src/components/product/ProductDescription.tsx` (enhanced)
  - `web/src/components/product/DownloadAssetButton.tsx`
  - `web/src/components/account/BuyerDownloadsClient.tsx`
  - `web/src/components/AccountNav/index.tsx` (updated)
  - `web/src/app/(app)/(account)/account/downloads/page.tsx`
- Tests:
  - `web/tests/int/purchase-workflow.int.spec.ts`
  - `web/tests/int/secure-download.int.spec.ts`
  - `web/tests/int/purchase-invariants.int.spec.ts`
