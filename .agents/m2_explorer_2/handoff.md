# Milestone 2: Purchase Service Logic Design (`web/src/services/purchase.ts`)

## 1. Observation

### 1.1 Test Suite Expectations & Dynamic Service Loading
Direct observation from `web/tests/int/purchase-workflow.int.spec.ts`:
- **Lines 8–15**:
  ```typescript
  export interface PurchaseResult {
    success: boolean
    orderId: string
    orderCode: string
    entitlementId: number
    productTitle: string
    pricePaid: number
  }
  ```
- **Lines 42–43**:
  ```typescript
  let purchaseProductFn: ((payload: Payload, params: { buyerId: number; productId: number; req?: any }) => Promise<PurchaseResult>) | null = null
  ```
- **Lines 101–105**:
  ```typescript
  const purchasePath = '../../src/services/purchase'
  const purchaseMod = await import(/* @vite-ignore */ purchasePath).catch(() => null)
  if (purchaseMod?.purchaseProduct) {
    purchaseProductFn = purchaseMod.purchaseProduct
  }
  ```
- **Lines 236–243**: Asserts `result.success === true`, `result.orderId`, `result.orderCode =~ /^ORD-/`, `result.entitlementId`, `result.productTitle === product.title`, and `result.pricePaid === 150000`.
- **Line 263**:
  ```typescript
  const purchaseLedger = ledger.docs.find((d) => d.referenceId === result.orderCode || d.referenceId === String(result.orderId))
  ```
- **Lines 268–281**: Finds order by `result.orderId`, checks `orderDoc.code === result.orderCode`, `status === 'COMPLETED'`, `paymentSource === 'wallet'`, `totalAmount === 150000`, `buyer === buyerUser.id`.
- **Lines 283–298**: Queries `order_items` by `order: result.orderId`, checks `salePrice === 150000`, `product === product.id`, `seller === seller.id`.
- **Lines 300–313**: Finds entitlement by `result.entitlementId`, checks `status === 'active'`, `downloadCount === 0`, `user === buyer.id`, `product === product.id`.
- **Lines 344–355**: Exact balance purchase reduces balance to 0 VND and sets order status `COMPLETED`.
- **Lines 367–400**: Free checkout (`isFree: true`, `price: 0`) charges 0 VND, leaves buyer wallet balance untouched, sets `paymentSource: 'free'`, creates completed order and active entitlement.

Direct observation from `web/tests/int/purchase-invariants.int.spec.ts`:
- **Lines 42–48 & 90–98**:
  ```typescript
  let purchaseProductFn: ((payload: Payload, params: { buyerId: number; productId: number; req?: any }) => Promise<PurchaseResult>) | null = null
  let purchaseErrors: {
    InsufficientFundsError?: any
    SelfPurchaseError?: any
    AlreadyEntitledError?: any
    ProductNotAvailableError?: any
  } = {}

  purchaseErrors = {
    InsufficientFundsError: purchaseMod.InsufficientFundsError || InsufficientFundsError,
    SelfPurchaseError: purchaseMod.SelfPurchaseError,
    AlreadyEntitledError: purchaseMod.AlreadyEntitledError,
    ProductNotAvailableError: purchaseMod.ProductNotAvailableError,
  }
  ```
- **Lines 238–244**:
  ```typescript
  const isSelfPurchaseError =
    thrownError?.name === 'SelfPurchaseError' ||
    thrownError?.code === 'SELF_PURCHASE_FORBIDDEN' ||
    thrownError?.message?.includes('SELF_PURCHASE') ||
    thrownError?.message?.includes('BR-04') ||
    (purchaseErrors.SelfPurchaseError && thrownError instanceof purchaseErrors.SelfPurchaseError)
  ```
- **Lines 272–290**: BR-04 applies to free products: seller cannot claim own free product; throws `SelfPurchaseError` / `SELF_PURCHASE_FORBIDDEN`.
- **Lines 323–379**: BR-07 Snapshot Pricing: altering product price post-order does not alter `order_item.salePrice` or `order.totalAmount`.
- **Lines 407–450**: Insufficient balance throws `InsufficientFundsError`, 0 VND debited, 0 orders created.
- **Lines 513–520**:
  ```typescript
  const isDuplicateRefused =
    caughtError?.name === 'AlreadyEntitledError' ||
    caughtError?.code === 'ALREADY_ENTITLED' ||
    caughtError?.message?.includes('ALREADY_ENTITLED') ||
    caughtError?.message?.includes('sở hữu') ||
    (purchaseErrors.AlreadyEntitledError && caughtError instanceof purchaseErrors.AlreadyEntitledError)
  ```
- **Lines 543–569**: Product with `_status: 'draft'` or `moderationStatus: 'rejected'` rejects purchase via `ProductNotAvailableError`.

### 1.2 Wallet Money Write Layer
Direct observation from `web/src/services/wallet.ts`:
- **Lines 5–17**: `InsufficientFundsError` class carries `balance: number` and `requiredAmount: number`.
- **Lines 179–285**: `debitWallet(payload, params: DebitWalletParams)`:
  - Takes `userId`, `amount`, `type`, `referenceType`, `referenceId`, `description`, `metadata`, `req`.
  - Checks `Number.isInteger(amount) && amount > 0`.
  - Verifies wallet exists, is `active`, and has `currentBalance >= amount`.
  - Atomically decrements balance and inserts a row into `wallet_ledger` with `direction: 'debit'`, `referenceType`, `referenceId`.
  - Threaded through `req` (enables participating in caller's active database transaction).

### 1.3 Collection Schemas & Hooks
- `web/src/collections/Orders/index.ts`:
  - Fields: `code` (string, unique), `buyer` (rel to users), `totalAmount` (number), `currency` ('VND'), `status` ('PENDING' | 'COMPLETED' | 'CANCELLED'), `paymentSource` ('wallet' | 'free'), `paidAt` (date), `notes` (textarea).
  - Code generation hook: `ORD-${dateStr}-${randomSuffix}`.
- `web/src/collections/OrderItems/index.ts`:
  - Fields: `order` (rel to orders), `product` (rel to products), `seller` (rel to users), `salePrice` (number), `platformFee` (number), `sellerAmount` (number), `tax` (number), `policyVersion` (text, default 'v1').
  - Hooks: `validateAntiSelfPurchase` (`beforeValidate`), `preventOrderItemMutation` (`beforeChange`).
- `web/src/collections/Entitlements/index.ts`:
  - Fields: `user` (rel to users), `product` (rel to products), `order` (rel to orders), `orderItem` (rel to order_items), `status` ('active' | 'revoked' | 'expired'), `grantedAt` (date), `downloadCount` (number).
  - Hooks: `enforceEntitlementInvariants` (`beforeChange`) ensures unique active entitlement per `(user, product)`.
- `web/src/collections/Products/index.ts`:
  - Fields: `title`, `slug`, `price`, `isFree`, `seller`, `moderationStatus` ('draft' | 'submitted' | 'in_review' | 'changes_requested' | 'approved' | 'rejected'), `_status` ('draft' | 'published').

### 1.4 Transaction Infrastructure
Direct observation from `@payloadcms/drizzle`:
- `beginTransaction()`: initiates a Drizzle transaction and returns a string `transactionID` stored in `sessions[id]`.
- Passing `req: { transactionID }` into `payload.findByID`, `payload.find`, `payload.create`, `payload.update` routes all Drizzle queries through the transactional session.
- `commitTransaction(transactionID)` resolves the transaction promise; `rollbackTransaction(transactionID)` rejects it, rolling back all SQL statements atomically.

---

## 2. Logic Chain

### 2.1 Pre-validation Before Money Movement
1. **Product Existence & Availability**:
   - `purchaseProduct` loads the product by `numericProductId`.
   - If missing: throws `ProductNotFoundError`.
   - If `_status !== 'published'` or `moderationStatus !== 'approved'`: throws `ProductNotAvailableError`.
   - Rationale: Prevents reserving funds or initiating checkout on unlisted, draft, or rejected catalog entries.
2. **BR-04 Anti-Self-Purchase**:
   - Extracts `sellerId` from `product.seller` (supporting scalar ID or populated user object).
   - Compares `String(numericBuyerId) === String(sellerId)`.
   - If matching: immediately throws `SelfPurchaseForbiddenError` (aliased as `SelfPurchaseError`).
   - Rationale: Enforces BR-04 invariant before debiting wallet or creating records. As observed in tests, this applies equally to free products.
3. **Duplicate Ownership (R2 / FR-16)**:
   - Queries `entitlements` where `user = numericBuyerId`, `product = numericProductId`, `status = 'active'`.
   - If exists: throws `AlreadyOwnedError` (aliased as `AlreadyEntitledError`) with the existing `entitlementId`.
   - Rationale: Protects buyer from accidental duplicate payments and maintains the single-active-entitlement invariant.

### 2.2 Payment & Execution Sequencing
1. **Free vs Commercial Determination**:
   - Free condition: `Boolean(product.isFree || Number(product.price) === 0)`.
   - If free: `pricePaid = 0`, `paymentSource = 'free'`, skips `debitWallet`.
   - If commercial: `pricePaid = Number(product.price)`, `paymentSource = 'wallet'`.
2. **Deterministic Order Code Generation**:
   - Generates `orderCode = "ORD-" + dateStr + "-" + randomSuffix` prior to debit.
   - Supplies `referenceId: orderCode` into `debitWallet`.
   - Rationale: Resolves chicken-and-egg dependency between wallet ledger `referenceId` and order record. `wallet_ledger` and `orders.code` match exactly as expected by `purchase-workflow.int.spec.ts:263`.
3. **Debit Wallet Executed Before Order Creation**:
   - Calls `debitWallet` for commercial products before `orders.create`.
   - Rationale: If balance is insufficient, `InsufficientFundsError` aborts execution before any `orders` row is created, strictly guaranteeing the test requirement: "0 orders created on insufficient funds".

### 2.3 Record Creation within Atomic Boundary
1. **Create `orders` Record**:
   - `status: 'COMPLETED'`, `totalAmount: pricePaid`, `paymentSource`, `paidAt: new Date().toISOString()`.
2. **Create `order_items` Record**:
   - Immutable snapshot: `salePrice: pricePaid`, `platformFee: 0`, `sellerAmount: pricePaid`, `tax: 0`, `policyVersion: 'v1'`.
   - Rationale: Ensures BR-07 price immutability if the product price is subsequently edited.
3. **Create `entitlements` Record**:
   - `user: numericBuyerId`, `product: numericProductId`, `order: orderDoc.id`, `orderItem: orderItemDoc.id`, `status: 'active'`, `downloadCount: 0`.
   - Rationale: Independent ownership authority per FR-16.

### 2.4 Atomicity & Rollback Handling
1. **Transaction Lifecycle**:
   - If caller does not pass `req?.transactionID`, `purchaseProduct` opens a managed transaction: `transactionID = await payload.db.beginTransaction()`.
   - Attaches `transactionID` to `effectiveReq`.
   - On success: `await payload.db.commitTransaction(transactionID)`.
   - On catch: `await payload.db.rollbackTransaction(transactionID)`.
2. **Concurrency Invariant Protection**:
   - If a concurrent duplicate purchase slips past the initial read check, the database partial unique index or hook throws a duplicate key error (`23505` / `Duplicate active entitlements`).
   - The catch block traps this and transforms it into `AlreadyOwnedError`, ensuring clean 409 client response without leaking unhandled database errors.

---

## 3. Caveats

1. **Non-Transactional DB Adapters**:
   - In environments where `payload.db.beginTransaction` is unavailable (e.g. unit mocks without a Postgres backend), `shouldManageTransaction` falls back gracefully without breaking. However, true ACID guarantees require PostgreSQL.
2. **Populated vs Unpopulated Seller Relation**:
   - In Payload, `product.seller` can be a number (scalar ID) or a populated `User` object depending on depth. The design extracts the scalar ID via `typeof product.seller === 'object' ? product.seller.id : product.seller`.
3. **Scope Boundary**:
   - `web/src/services/purchase.ts` is strictly responsible for purchase orchestration and error typing. HTTP routing (`/api/v1/orders/purchase`) belongs to Milestone 2 Task 3 (`m2_explorer_3`), and file streaming (`/api/v1/downloads/[token]`) belongs to Milestone 3.

---

## 4. Conclusion & Technical Design

The complete design of `web/src/services/purchase.ts` is specified below:

```typescript
/**
 * web/src/services/purchase.ts
 *
 * Money Write Layer - Digital Purchase & Entitlement Service
 * Reference: PLAN.md FR-14, FR-15, FR-16, FR-18, Decision 0002, Decision 0006, BR-04, BR-07
 */

import type { Payload } from 'payload'
import crypto from 'crypto'
import type { Product, Order, OrderItem, Entitlement } from '@/payload-types'
import { debitWallet, InsufficientFundsError } from '@/services/wallet'

// Re-export InsufficientFundsError for consumers
export { InsufficientFundsError }

// --- Typed Error Classes ---

export class SelfPurchaseForbiddenError extends Error {
  readonly code = 'SELF_PURCHASE_FORBIDDEN'
  readonly buyerId: number | string
  readonly sellerId: number | string

  constructor(buyerId: number | string, sellerId: number | string) {
    super(
      `Người bán không thể tự mua sản phẩm của chính mình (BR-04 Anti-Self-Purchase: buyer=${buyerId}, seller=${sellerId})`
    )
    this.name = 'SelfPurchaseForbiddenError'
    this.buyerId = buyerId
    this.sellerId = sellerId
    Object.setPrototypeOf(this, SelfPurchaseForbiddenError.prototype)
  }
}
// Alias for test suite compatibility
export { SelfPurchaseForbiddenError as SelfPurchaseError }

export class AlreadyOwnedError extends Error {
  readonly code = 'ALREADY_OWNED'
  readonly userId: number | string
  readonly productId: number | string
  readonly entitlementId?: number | string

  constructor(userId: number | string, productId: number | string, entitlementId?: number | string) {
    super(
      `Người dùng đã sở hữu sản phẩm này (ALREADY_OWNED / ALREADY_ENTITLED: user=${userId}, product=${productId})`
    )
    this.name = 'AlreadyOwnedError'
    this.userId = userId
    this.productId = productId
    this.entitlementId = entitlementId
    Object.setPrototypeOf(this, AlreadyOwnedError.prototype)
  }
}
// Alias for test suite compatibility
export { AlreadyOwnedError as AlreadyEntitledError }

export class ProductNotAvailableError extends Error {
  readonly code = 'PRODUCT_NOT_AVAILABLE'
  readonly productId: number | string
  readonly status?: string | null
  readonly moderationStatus?: string | null

  constructor(productId: number | string, status?: string | null, moderationStatus?: string | null) {
    super(
      `Sản phẩm không khả dụng để mua (PRODUCT_NOT_AVAILABLE: id=${productId}, status=${status}, moderationStatus=${moderationStatus})`
    )
    this.name = 'ProductNotAvailableError'
    this.productId = productId
    this.status = status
    this.moderationStatus = moderationStatus
    Object.setPrototypeOf(this, ProductNotAvailableError.prototype)
  }
}

export class ProductNotFoundError extends Error {
  readonly code = 'PRODUCT_NOT_FOUND'
  readonly productId: number | string

  constructor(productId: number | string) {
    super(`Không tìm thấy sản phẩm với ID ${productId} (PRODUCT_NOT_FOUND)`)
    this.name = 'ProductNotFoundError'
    this.productId = productId
    Object.setPrototypeOf(this, ProductNotFoundError.prototype)
  }
}

// --- Interface Contracts ---

export interface PurchaseResult {
  success: boolean
  orderId: string
  orderCode: string
  entitlementId: number
  productTitle: string
  pricePaid: number
}

export interface PurchaseParams {
  buyerId: number | string
  productId: number | string
  req?: any
}

// --- Primary Service Function ---

export async function purchaseProduct(
  payload: Payload,
  params: PurchaseParams
): Promise<PurchaseResult> {
  const { buyerId, productId, req } = params
  const numericBuyerId = typeof buyerId === 'string' ? parseInt(buyerId, 10) : buyerId
  const numericProductId = typeof productId === 'string' ? parseInt(productId, 10) : productId

  if (!numericBuyerId || isNaN(Number(numericBuyerId))) {
    throw new Error('ID người mua không hợp lệ')
  }
  if (!numericProductId || isNaN(Number(numericProductId))) {
    throw new ProductNotFoundError(productId)
  }

  // 0. Transaction Coordination (Decision 0002)
  const shouldManageTransaction = !req?.transactionID && typeof payload.db?.beginTransaction === 'function'
  let transactionID: string | undefined = req?.transactionID

  if (shouldManageTransaction) {
    try {
      transactionID = await payload.db.beginTransaction()
    } catch (_err) {
      transactionID = undefined
    }
  }

  const effectiveReq = {
    ...(req || {}),
    ...(transactionID ? { transactionID } : {}),
  }

  try {
    // 1. Load and validate product availability
    const product = (await payload.findByID({
      collection: 'products',
      id: numericProductId,
      depth: 0,
      overrideAccess: true,
      req: effectiveReq,
    })) as Product | null

    if (!product) {
      throw new ProductNotFoundError(numericProductId)
    }

    if (product._status !== 'published' || product.moderationStatus !== 'approved') {
      throw new ProductNotAvailableError(numericProductId, product._status, product.moderationStatus)
    }

    // 2. Enforce BR-04 Anti-Self-Purchase invariant
    const sellerId =
      typeof product.seller === 'object' && product.seller !== null
        ? (product.seller as any).id
        : product.seller

    if (sellerId !== undefined && sellerId !== null && String(numericBuyerId) === String(sellerId)) {
      throw new SelfPurchaseForbiddenError(numericBuyerId, sellerId)
    }

    // 3. Prevent duplicate purchase (check active entitlement)
    const existingEntitlement = await payload.find({
      collection: 'entitlements',
      where: {
        and: [
          { user: { equals: numericBuyerId } },
          { product: { equals: numericProductId } },
          { status: { equals: 'active' } },
        ],
      },
      limit: 1,
      overrideAccess: true,
      req: effectiveReq,
    })

    if (existingEntitlement.totalDocs > 0) {
      const existingDoc = existingEntitlement.docs[0]
      throw new AlreadyOwnedError(numericBuyerId, numericProductId, existingDoc.id)
    }

    // 4. Free vs Commercial calculation
    const isFreeProduct = Boolean(product.isFree || Number(product.price) === 0)
    const pricePaid = isFreeProduct ? 0 : Number(product.price)
    const paymentSource: 'wallet' | 'free' = isFreeProduct ? 'free' : 'wallet'

    // 5. Generate deterministic unique order code
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '')
    const randomSuffix = crypto.randomBytes(3).toString('hex').toUpperCase()
    const orderCode = `ORD-${dateStr}-${randomSuffix}`

    // 6. Debit buyer wallet if commercial (Decision 0002, BR-01)
    if (!isFreeProduct) {
      await debitWallet(payload, {
        userId: numericBuyerId,
        amount: pricePaid,
        type: 'purchase',
        referenceType: 'order',
        referenceId: orderCode,
        description: `Thanh toán đơn hàng ${orderCode} cho tài nguyên: ${product.title}`,
        req: effectiveReq,
      })
    }

    // 7. Create Orders record (BR-07 immutable snapshot)
    const orderDoc = (await payload.create({
      collection: 'orders',
      data: {
        code: orderCode,
        buyer: numericBuyerId,
        totalAmount: pricePaid,
        currency: 'VND',
        status: 'COMPLETED',
        paymentSource,
        paidAt: new Date().toISOString(),
        notes: isFreeProduct
          ? 'Đơn hàng tải miễn phí cộng đồng'
          : `Thanh toán số dư ví nội bộ (${orderCode})`,
      },
      overrideAccess: true,
      req: effectiveReq,
    })) as Order

    // 8. Create Order Items record (BR-07 snapshot line item)
    const orderItemDoc = (await payload.create({
      collection: 'order_items',
      data: {
        order: orderDoc.id,
        product: numericProductId,
        seller: sellerId || numericBuyerId,
        salePrice: pricePaid,
        platformFee: 0,
        sellerAmount: pricePaid,
        tax: 0,
        policyVersion: 'v1',
      },
      overrideAccess: true,
      req: effectiveReq,
    })) as OrderItem

    // 9. Create Entitlements record (PLAN.md FR-16, FR-18, Decision 0006)
    const entitlementDoc = (await payload.create({
      collection: 'entitlements',
      data: {
        user: numericBuyerId,
        product: numericProductId,
        order: orderDoc.id,
        orderItem: orderItemDoc.id,
        status: 'active',
        grantedAt: new Date().toISOString(),
        downloadCount: 0,
      },
      overrideAccess: true,
      req: effectiveReq,
    })) as Entitlement

    // 10. Commit transaction if self-managed
    if (shouldManageTransaction && transactionID) {
      await payload.db.commitTransaction(transactionID)
    }

    return {
      success: true,
      orderId: String(orderDoc.id),
      orderCode: orderDoc.code,
      entitlementId: entitlementDoc.id,
      productTitle: product.title,
      pricePaid,
    }
  } catch (error: any) {
    // Rollback transaction if self-managed
    if (shouldManageTransaction && transactionID) {
      try {
        await payload.db.rollbackTransaction(transactionID)
      } catch (_rollbackErr) {
        // Ignored or logged
      }
    }

    // Remap concurrent race constraint violation to AlreadyOwnedError
    if (
      error?.message?.includes('Duplicate active entitlements') ||
      error?.message?.includes('entitlements_user_product_active_idx') ||
      error?.message?.includes('unique constraint') ||
      error?.code === '23505'
    ) {
      throw new AlreadyOwnedError(numericBuyerId, numericProductId)
    }

    throw error
  }
}
```

---

## 5. Verification Method

Once implemented by the worker agent:

1. **Integration Test Execution**:
   ```bash
   pnpm --prefix web test:int web/tests/int/purchase-workflow.int.spec.ts
   pnpm --prefix web test:int web/tests/int/purchase-invariants.int.spec.ts
   ```
2. **Expected Verification Outcomes**:
   - `purchase-workflow.int.spec.ts`:
     - Commercial purchase creates order (`COMPLETED`), deducts 150,000 VND from wallet, records debit ledger row with `referenceId: orderCode`, and creates active entitlement with `downloadCount: 0`.
     - Exact balance checkout reduces balance to exactly 0 VND cleanly.
     - Free checkout creates 0 VND completed order and active entitlement with 0 VND wallet debit.
     - Multi-product purchases create distinct orders and active entitlements.
     - Ledger balance invariant is satisfied.
   - `purchase-invariants.int.spec.ts`:
     - Seller buying own commercial or free product is rejected with `SelfPurchaseForbiddenError` (code `SELF_PURCHASE_FORBIDDEN`).
     - Product price modifications post-checkout do not alter existing `order_items.salePrice` (BR-07).
     - Insufficient balance rejects checkout with `InsufficientFundsError`, leaving wallet balance untouched and 0 orders created.
     - Duplicate purchase attempts fail with `AlreadyOwnedError`.
     - Draft and unapproved products reject checkout with `ProductNotAvailableError`.
3. **Invalidation Conditions**:
   - Any failure where an order is created despite `InsufficientFundsError`.
   - Any failure where a seller successfully purchases their own product.
   - Any mismatch between `purchaseLedger.referenceId` and `orderCode`.
   - Any uncaught transaction deadlock or dangling session.
