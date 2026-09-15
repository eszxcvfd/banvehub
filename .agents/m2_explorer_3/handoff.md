# Handoff Report: Milestone 2 — Purchase API & Test Integration Design

**Agent**: `m2_explorer_3` (teamwork_preview_explorer)  
**Milestone**: Milestone 2: Purchase API & Test Integration  
**Date**: 2026-09-15T07:44:00Z  

---

## 1. Observation

### 1.1 Existing Integration Test Specifications
Direct inspection of `web/tests/int/purchase-workflow.int.spec.ts` and `web/tests/int/purchase-invariants.int.spec.ts` revealed the exact contracts, signatures, and expectations:

1. **Service Function Contract**:
   - `web/tests/int/purchase-workflow.int.spec.ts:43`:
     ```ts
     let purchaseProductFn: ((payload: Payload, params: { buyerId: number; productId: number; req?: any }) => Promise<PurchaseResult>) | null = null
     ```
   - Import path tested: `web/src/services/purchase.ts` (loaded dynamically at line 101).

2. **PurchaseResult Return Contract**:
   - `web/tests/int/purchase-workflow.int.spec.ts:8-15`:
     ```ts
     export interface PurchaseResult {
       success: boolean
       orderId: string
       orderCode: string
       entitlementId: number
       productTitle: string
       pricePaid: number
     }
     ```
   - Assertions in `purchase-workflow.int.spec.ts:237-243`:
     - `expect(result.success).toBe(true)`
     - `expect(result.orderId).toBeDefined()`
     - `expect(result.orderCode).toMatch(/^ORD-/)`
     - `expect(result.entitlementId).toBeDefined()`
     - `expect(result.productTitle).toBe(...)`
     - `expect(result.pricePaid).toBe(...)`

3. **Invariants and Error Classes**:
   - `web/tests/int/purchase-invariants.int.spec.ts:43-48`:
     ```ts
     let purchaseErrors: {
       InsufficientFundsError?: any
       SelfPurchaseError?: any
       AlreadyEntitledError?: any
       ProductNotAvailableError?: any
     } = {}
     ```
   - **BR-04 Anti-Self-Purchase**: lines 238-244:
     - `thrownError?.name === 'SelfPurchaseError' || thrownError?.code === 'SELF_PURCHASE_FORBIDDEN' || thrownError?.message?.includes('SELF_PURCHASE') || thrownError?.message?.includes('BR-04') || (purchaseErrors.SelfPurchaseError && thrownError instanceof purchaseErrors.SelfPurchaseError)`
   - **Insufficient Funds**: lines 427-433:
     - `caughtError instanceof InsufficientFundsError || caughtError?.name === 'InsufficientFundsError' || caughtError?.code === 'INSUFFICIENT_FUNDS' || caughtError?.message?.includes('Số dư ví không đủ')`
     - In `web/src/services/wallet.ts:5-17`, `InsufficientFundsError` exposes:
       ```ts
       export class InsufficientFundsError extends Error {
         balance: number
         requiredAmount: number
         ...
       }
       ```
   - **Duplicate Purchase (Already Entitled / Already Owned)**: lines 513-519:
     - `caughtError?.name === 'AlreadyEntitledError' || caughtError?.code === 'ALREADY_ENTITLED' || caughtError?.message?.includes('ALREADY_ENTITLED') || caughtError?.message?.includes('sở hữu')`
   - **Product Not Available (Draft / Moderation Status)**: lines 543-569:
     - Throws when `_status === 'draft'` or `moderationStatus === 'rejected'`.

### 1.2 Access Control & Schema Enforcement
1. **Direct Mutation Restrictions**:
   - `web/src/access/orderAccess.ts:30-32`:
     ```ts
     export const orderCreateAccess: Access = () => false
     export const orderUpdateAccess: Access = () => false
     export const orderDeleteAccess: Access = () => false
     ```
   - `web/src/access/entitlementAccess.ts:51`:
     ```ts
     export const entitlementNoDirectWrite: Access = () => false
     ```
   - *Direct REST/GraphQL creation on `orders` and `entitlements` is permanently disabled.* All creations must execute through dedicated server routes utilizing `overrideAccess: true`.

2. **Order & OrderItem Schema Structure**:
   - `web/src/collections/Orders/index.ts:34-149`:
     - Fields: `code` (varchar, unique, pattern `ORD-YYYYMMDD-HEX`), `buyer` (rel: users), `totalAmount` (numeric), `currency` (select: 'VND'), `status` (PENDING | COMPLETED | CANCELLED), `paymentSource` (wallet | free), `paidAt` (timestamp), `items` (join on `order_items.order`).
   - `web/src/collections/OrderItems/index.ts:39-134`:
     - Fields: `order` (rel: orders), `product` (rel: products), `seller` (rel: users), `salePrice` (numeric snapshot), `platformFee`, `sellerAmount`, `tax`, `policyVersion`.
   - `web/src/collections/Entitlements/index.ts:25-145`:
     - Fields: `user` (rel: users), `product` (rel: products), `order` (rel: orders), `orderItem` (rel: order_items), `status` (active | revoked | expired), `grantedAt`, `downloadCount`.

3. **Collection Hook Invariants**:
   - `web/src/collections/OrderItems/hooks/validateAntiSelfPurchase.ts:74-84`: Throws `ValidationError` ("Anti-self-purchase invariant violated (BR-04): Sellers cannot purchase their own products.") if `buyerId === sellerId`.
   - `web/src/collections/Entitlements/hooks/enforceEntitlementInvariants.ts:48-56`: Throws `Error` ("Invariant Violation: User X already has an active entitlement for product Y...") if an active entitlement already exists.

### 1.3 Established API Route Conventions in KienTaoHub
Inspection of `web/src/app/api/v1/me/wallet/route.ts` and `web/src/app/api/v1/me/wallet/ledger/route.ts` shows the standard Next.js App Router pattern:
- Import payload instance: `import configPromise from '@payload-config'` and `const payload = await getPayload({ config: configPromise })`.
- Session authentication: `const headers = await getHeaders()` and `const { user } = await payload.auth({ headers })`.
- Unauthenticated rejection: `if (!user) return NextResponse.json({ error: '...' }, { status: 401 })`.
- Parameter handling: `const { searchParams } = new URL(req.url)`.

---

## 2. Logic Chain

1. **Authentication Boundary**:
   - Any purchase or order query requires an authenticated session. Calling `payload.auth({ headers: await getHeaders() })` validates cookies/tokens. If `user` is falsy, immediately short-circuit with HTTP 401 Unauthorized (`{ error: 'UNAUTHORIZED', message: ... }`).

2. **Request Validation**:
   - The purchase endpoints (`POST /api/v1/orders/purchase` and `POST /api/v1/purchases`) require a valid JSON payload containing `{ productId }`.
   - If parsing fails or `productId` is absent/non-numeric/<= 0, the route immediately returns HTTP 400 Bad Request (`{ error: 'INVALID_REQUEST', message: ... }`).

3. **Service Invocation & Buyer Identification**:
   - `user.id` from `payload.auth` is authoritative. Extract `buyerId = typeof user.id === 'string' ? parseInt(user.id, 10) : user.id`.
   - The route delegates core business logic and database transaction management to `purchaseProduct(payload, { buyerId, productId })`.

4. **Defensive Error Mapping**:
   Errors thrown during purchase can originate either as typed domain errors from `purchaseProduct` (e.g. `SelfPurchaseForbiddenError`, `InsufficientFundsError`, `AlreadyOwnedError`) or from collection hooks (e.g. `ValidationError` from `validateAntiSelfPurchase`, invariant violation from `enforceEntitlementInvariants`).
   Therefore, error matching must check:
   - `instanceof` typed error classes
   - `err?.name` and `err?.code`
   - Distinctive invariant error messages
   This ensures complete robustness regardless of whether validation caught the issue upfront in service logic or at the database hook level:
   - **BR-04 Self Purchase**: Map to **HTTP 400 Bad Request** with `{ error: 'SELF_PURCHASE_FORBIDDEN', message }`.
   - **Insufficient Balance**: Map to **HTTP 400 Bad Request** with `{ error: 'INSUFFICIENT_FUNDS', message, required, balance }`.
   - **Product Unavailable (Draft/Rejected)**: Map to **HTTP 400 Bad Request** with `{ error: 'PRODUCT_NOT_AVAILABLE', message }`.
   - **Duplicate Purchase (Active Entitlement)**: Map to **HTTP 409 Conflict** with `{ error: 'ALREADY_OWNED', message, entitlementId }`.
   - **Product Not Found**: Map to **HTTP 404 Not Found** with `{ error: 'PRODUCT_NOT_FOUND', message }`.
   - **Fallback**: Map unexpected errors to **HTTP 500 Internal Server Error** with `{ error: 'INTERNAL_ERROR', message }`.

5. **Success Response**:
   - On completion, `purchaseProduct` returns `PurchaseResult`.
   - The route responds with **HTTP 200 OK** (compatible with 200/201 expectations):
     `{ success: true, orderId, orderCode, entitlementId, productTitle, pricePaid }`.

6. **Route Symmetry & Parity**:
   - `POST /api/v1/orders/purchase` corresponds to PLAN.md §27.
   - `POST /api/v1/purchases` corresponds to standard REST resource naming.
   - By exporting `POST` in `web/src/app/api/v1/purchases/route.ts` directly from `web/src/app/api/v1/orders/purchase/route.ts`, 100% DRY parity is guaranteed without duplicate code.

7. **Order Listing Design (`GET /api/v1/me/orders` & `GET /api/v1/orders`)**:
   - Authenticates user via `payload.auth`.
   - Parses `page`, `limit` (default 20, max 100), and optional `status` filter (`PENDING`, `COMPLETED`, `CANCELLED`).
   - Queries `orders` where `buyer.equals = user.id`, sorted by `-createdAt`.
   - Uses `depth: 2` to fetch joined `order_items` and referenced `product` metadata.
   - Formats clean JSON output with pagination metadata (`totalDocs`, `totalPages`, `page`, `limit`, `hasNextPage`, `hasPrevPage`).
   - `web/src/app/api/v1/orders/route.ts` re-exports the handler from `web/src/app/api/v1/me/orders/route.ts` to satisfy PLAN.md §27 endpoint `GET /api/v1/orders`.

---

## 3. Caveats

1. **Dependency on Service Implementation**:
   - The API routes import `purchaseProduct` and typed error classes from `@/services/purchase` and `InsufficientFundsError` from `@/services/wallet`.
   - `m2_explorer_2` is designing the service layer, and workers will implement it.
   - The error handler in our design imports named error classes optionally or defensively inspects `err.name`, `err.code`, and error messages so that it functions seamlessly even if class export names differ slightly (e.g. `SelfPurchaseError` vs `SelfPurchaseForbiddenError`, `AlreadyEntitledError` vs `AlreadyOwnedError`).
2. **Payload Direct REST Access Disabled**:
   - Because `orderCreateAccess = () => false` and `entitlementNoDirectWrite = () => false`, frontend checkout MUST call these custom Next.js API endpoints (`/api/v1/orders/purchase` or `/api/v1/purchases`) instead of standard Payload REST endpoints (`/api/orders`).
3. **Transaction Context**:
   - Database atomicity across wallet debit, order creation, order_item creation, and entitlement creation is managed inside `purchaseProduct` (as investigated by `m2_explorer_1`). The API route initiates the top-level request and receives the atomic result or error.

---

## 4. Conclusion & Technical Designs

Below are the complete, production-ready designs for the four target API route files and a dedicated integration test suite.

### 4.1 Route: `web/src/app/api/v1/orders/purchase/route.ts`

```typescript
import { NextResponse } from 'next/server'
import { getPayload } from 'payload'
import configPromise from '@payload-config'
import { headers as getHeaders } from 'next/headers'
import {
  purchaseProduct,
  SelfPurchaseForbiddenError,
  SelfPurchaseError,
  AlreadyOwnedError,
  AlreadyEntitledError,
  ProductNotAvailableError,
  ProductNotFoundError,
} from '@/services/purchase'
import { InsufficientFundsError } from '@/services/wallet'

export async function POST(req: Request) {
  try {
    const headers = await getHeaders()
    const payload = await getPayload({ config: configPromise })
    const { user } = await payload.auth({ headers })

    if (!user) {
      return NextResponse.json(
        {
          error: 'UNAUTHORIZED',
          message: 'Yêu cầu đăng nhập để thực hiện mua sản phẩm.',
        },
        { status: 401 }
      )
    }

    let body: any
    try {
      body = await req.json()
    } catch {
      return NextResponse.json(
        {
          error: 'INVALID_REQUEST',
          message: 'Dữ liệu yêu cầu không hợp lệ (yêu cầu định dạng JSON).',
        },
        { status: 400 }
      )
    }

    const rawProductId = body?.productId
    if (rawProductId === undefined || rawProductId === null) {
      return NextResponse.json(
        {
          error: 'INVALID_REQUEST',
          message: 'productId là bắt buộc.',
        },
        { status: 400 }
      )
    }

    const productId = typeof rawProductId === 'number' ? rawProductId : parseInt(String(rawProductId), 10)
    if (isNaN(productId) || productId <= 0) {
      return NextResponse.json(
        {
          error: 'INVALID_REQUEST',
          message: 'productId phải là số nguyên dương hợp lệ.',
        },
        { status: 400 }
      )
    }

    const buyerId = typeof user.id === 'string' ? parseInt(user.id, 10) : user.id

    const result = await purchaseProduct(payload, {
      buyerId,
      productId,
    })

    return NextResponse.json(
      {
        success: true,
        orderId: result.orderId,
        orderCode: result.orderCode,
        entitlementId: result.entitlementId,
        productTitle: result.productTitle,
        pricePaid: result.pricePaid,
      },
      { status: 200 }
    )
  } catch (err: any) {
    // 1. SelfPurchaseForbiddenError (BR-04 Anti-Self-Purchase) -> 400 Bad Request
    if (
      (SelfPurchaseForbiddenError && err instanceof SelfPurchaseForbiddenError) ||
      (SelfPurchaseError && err instanceof SelfPurchaseError) ||
      err?.name === 'SelfPurchaseForbiddenError' ||
      err?.name === 'SelfPurchaseError' ||
      err?.code === 'SELF_PURCHASE_FORBIDDEN' ||
      err?.message?.includes('SELF_PURCHASE') ||
      err?.message?.includes('BR-04') ||
      err?.message?.includes('Anti-self-purchase')
    ) {
      return NextResponse.json(
        {
          error: 'SELF_PURCHASE_FORBIDDEN',
          message: err.message || 'Người bán không thể mua sản phẩm của chính mình (BR-04).',
        },
        { status: 400 }
      )
    }

    // 2. InsufficientFundsError -> 400 Bad Request
    if (
      (InsufficientFundsError && err instanceof InsufficientFundsError) ||
      err?.name === 'InsufficientFundsError' ||
      err?.code === 'INSUFFICIENT_FUNDS' ||
      err?.message?.includes('Số dư ví không đủ')
    ) {
      return NextResponse.json(
        {
          error: 'INSUFFICIENT_FUNDS',
          message: err.message || 'Số dư ví không đủ để thực hiện giao dịch.',
          required: err.requiredAmount ?? err.required ?? 0,
          balance: err.balance ?? 0,
        },
        { status: 400 }
      )
    }

    // 3. ProductNotAvailableError (Draft / Rejected / Inactive) -> 400 Bad Request
    if (
      (ProductNotAvailableError && err instanceof ProductNotAvailableError) ||
      err?.name === 'ProductNotAvailableError' ||
      err?.code === 'PRODUCT_NOT_AVAILABLE' ||
      err?.message?.includes('PRODUCT_NOT_AVAILABLE') ||
      err?.message?.includes('không khả dụng')
    ) {
      return NextResponse.json(
        {
          error: 'PRODUCT_NOT_AVAILABLE',
          message: err.message || 'Sản phẩm hiện không khả dụng để giao dịch.',
        },
        { status: 400 }
      )
    }

    // 4. AlreadyOwnedError / AlreadyEntitledError -> 409 Conflict
    if (
      (AlreadyOwnedError && err instanceof AlreadyOwnedError) ||
      (AlreadyEntitledError && err instanceof AlreadyEntitledError) ||
      err?.name === 'AlreadyOwnedError' ||
      err?.name === 'AlreadyEntitledError' ||
      err?.code === 'ALREADY_OWNED' ||
      err?.code === 'ALREADY_ENTITLED' ||
      err?.message?.includes('ALREADY_ENTITLED') ||
      err?.message?.includes('already has an active entitlement') ||
      err?.message?.includes('sở hữu')
    ) {
      return NextResponse.json(
        {
          error: 'ALREADY_OWNED',
          message: err.message || 'Bạn đã sở hữu sản phẩm này.',
          entitlementId: err.entitlementId ?? null,
        },
        { status: 409 }
      )
    }

    // 5. ProductNotFoundError -> 404 Not Found
    if (
      (ProductNotFoundError && err instanceof ProductNotFoundError) ||
      err?.name === 'ProductNotFoundError' ||
      err?.code === 'PRODUCT_NOT_FOUND' ||
      err?.message?.includes('PRODUCT_NOT_FOUND') ||
      err?.message?.includes('Không tìm thấy')
    ) {
      return NextResponse.json(
        {
          error: 'PRODUCT_NOT_FOUND',
          message: err.message || 'Không tìm thấy sản phẩm yêu cầu.',
        },
        { status: 404 }
      )
    }

    // 6. Generic Internal Error -> 500 Internal Server Error
    return NextResponse.json(
      {
        error: 'INTERNAL_ERROR',
        message: err?.message || 'Có lỗi xảy ra trong quá trình xử lý đơn hàng.',
      },
      { status: 500 }
    )
  }
}
```

---

### 4.2 Route: `web/src/app/api/v1/purchases/route.ts`

```typescript
import { POST as handlePurchase } from '../orders/purchase/route'

/**
 * RESTful resource endpoint for purchases.
 * Delegates 100% of execution to handlePurchase to guarantee complete feature and response parity.
 */
export const POST = handlePurchase
```

---

### 4.3 Route: `web/src/app/api/v1/me/orders/route.ts`

```typescript
import { NextResponse } from 'next/server'
import { getPayload } from 'payload'
import configPromise from '@payload-config'
import { headers as getHeaders } from 'next/headers'
import type { Where } from 'payload'

export async function GET(req: Request) {
  try {
    const headers = await getHeaders()
    const payload = await getPayload({ config: configPromise })
    const { user } = await payload.auth({ headers })

    if (!user) {
      return NextResponse.json(
        {
          error: 'UNAUTHORIZED',
          message: 'Yêu cầu đăng nhập để xem danh sách đơn hàng.',
        },
        { status: 401 }
      )
    }

    const { searchParams } = new URL(req.url)
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10) || 1)
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '20', 10) || 20))
    const statusParam = searchParams.get('status')

    const where: Where = {
      buyer: {
        equals: user.id,
      },
    }

    if (statusParam && ['PENDING', 'COMPLETED', 'CANCELLED'].includes(statusParam.toUpperCase())) {
      where.status = {
        equals: statusParam.toUpperCase(),
      }
    }

    const orders = await payload.find({
      collection: 'orders',
      where,
      sort: '-createdAt',
      page,
      limit,
      depth: 2,
      overrideAccess: true,
    })

    return NextResponse.json({
      success: true,
      docs: orders.docs.map((doc: any) => ({
        id: doc.id,
        code: doc.code,
        totalAmount: Number(doc.totalAmount),
        currency: doc.currency,
        status: doc.status,
        paymentSource: doc.paymentSource,
        paidAt: doc.paidAt,
        createdAt: doc.createdAt,
        items: Array.isArray(doc.items?.docs)
          ? doc.items.docs.map((item: any) => ({
              id: item.id,
              productId: typeof item.product === 'object' ? item.product?.id : item.product,
              productTitle: typeof item.product === 'object' ? item.product?.title : undefined,
              productSlug: typeof item.product === 'object' ? item.product?.slug : undefined,
              salePrice: Number(item.salePrice),
              sellerId: typeof item.seller === 'object' ? item.seller?.id : item.seller,
            }))
          : [],
      })),
      totalDocs: orders.totalDocs,
      totalPages: orders.totalPages,
      page: orders.page,
      limit: orders.limit,
      hasNextPage: orders.hasNextPage,
      hasPrevPage: orders.hasPrevPage,
    })
  } catch (error: any) {
    return NextResponse.json(
      {
        error: 'INTERNAL_ERROR',
        message: error?.message || 'Có lỗi xảy ra khi truy vấn danh sách đơn hàng.',
      },
      { status: 500 }
    )
  }
}
```

---

### 4.4 Route: `web/src/app/api/v1/orders/route.ts` (Convenience Alias)

```typescript
import { GET as handleListOrders } from './me/orders/route'

/**
 * Route alias for GET /api/v1/orders per PLAN.md §27 Buyer API Specification.
 * Lists orders for the authenticated buyer.
 */
export const GET = handleListOrders
```

---

### 4.5 Error Response Mapping Matrix

| Error Scenario | Thrown Class / Trigger | HTTP Code | Response Payload Structure |
|---|---|---|---|
| **Unauthenticated** | `!user` from `payload.auth` | `401 Unauthorized` | `{ error: 'UNAUTHORIZED', message: string }` |
| **Missing / Invalid Body** | Non-JSON or missing `productId` | `400 Bad Request` | `{ error: 'INVALID_REQUEST', message: string }` |
| **BR-04 Anti-Self-Purchase** | `SelfPurchaseForbiddenError` | `400 Bad Request` | `{ error: 'SELF_PURCHASE_FORBIDDEN', message: string }` |
| **Insufficient Wallet Funds** | `InsufficientFundsError` | `400 Bad Request` | `{ error: 'INSUFFICIENT_FUNDS', message: string, required: number, balance: number }` |
| **Product Unavailable** | `ProductNotAvailableError` | `400 Bad Request` | `{ error: 'PRODUCT_NOT_AVAILABLE', message: string }` |
| **Already Owned / Duplicate** | `AlreadyOwnedError` / `AlreadyEntitledError` | `409 Conflict` | `{ error: 'ALREADY_OWNED', message: string, entitlementId: number \| null }` |
| **Product Not Found** | `ProductNotFoundError` | `404 Not Found` | `{ error: 'PRODUCT_NOT_FOUND', message: string }` |
| **Successful Purchase** | Successful `purchaseProduct` | `200 OK` | `{ success: true, orderId: string, orderCode: string, entitlementId: number, productTitle: string, pricePaid: number }` |

---

## 5. Verification Method

Once Milestone 2 worker implements `web/src/services/purchase.ts` and the API routes:

1. **Integration Test Suites Execution**:
   ```bash
   pnpm --prefix web test:int tests/int/purchase-workflow.int.spec.ts
   pnpm --prefix web test:int tests/int/purchase-invariants.int.spec.ts
   ```
   *Expected Outcome*:
   - `purchase-workflow.int.spec.ts`: All 5 tests pass (Wallet purchase, Exact balance to 0, Free product checkout, Multiple products, End-to-End delivery).
   - `purchase-invariants.int.spec.ts`: All 8 tests pass (BR-04 anti-self-purchase commercial & free, snapshot pricing invariance, insufficient balance, duplicate entitlement rejection, draft & rejected product rejection).

2. **API Route Verification**:
   Invoke endpoint tests with mock Next.js requests or dedicated integration tests:
   ```bash
   # Test unauthenticated rejection
   curl -i -X POST http://localhost:3000/api/v1/orders/purchase \
     -H "Content-Type: application/json" \
     -d '{"productId": 1}'
   # Expect: HTTP 401 Unauthorized

   # Test purchases route alias parity
   curl -i -X POST http://localhost:3000/api/v1/purchases \
     -H "Content-Type: application/json" \
     -d '{"productId": 1}'
   # Expect: Same 401 Unauthorized
   ```

3. **Overall Suite & Lint**:
   ```bash
   pnpm --prefix web lint
   pnpm --prefix web build
   ```
