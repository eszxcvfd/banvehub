/**
 * web/src/services/purchase.ts
 *
 * Money Write Layer - Digital Purchase & Entitlement Service
 * Reference: PLAN.md FR-14, FR-15, FR-16, FR-18, Decision 0002, Decision 0006, BR-04, BR-07
 */

import type { Payload } from 'payload'
import { initTransaction, commitTransaction, killTransaction } from 'payload'
import crypto from 'crypto'
import type { Product, Order, OrderItem, Entitlement } from '@/payload-types'
import { debitWallet, InsufficientFundsError } from '@/services/wallet'

// Re-export InsufficientFundsError for consumers
export { InsufficientFundsError }

// --- Typed Error Classes ---

export class SelfPurchaseForbiddenError extends Error {
  readonly code = 'SELF_PURCHASE_FORBIDDEN'
  readonly buyerId?: number | string
  readonly sellerId?: number | string

  constructor(buyerId?: number | string, sellerId?: number | string) {
    super(
      `Người bán không thể tự mua sản phẩm của chính mình (BR-04 Anti-Self-Purchase${
        buyerId && sellerId ? `: buyer=${buyerId}, seller=${sellerId}` : ''
      })`
    )
    this.name = 'SelfPurchaseError'
    this.buyerId = buyerId
    this.sellerId = sellerId
    Object.setPrototypeOf(this, SelfPurchaseForbiddenError.prototype)
  }
}
// Alias for test suite compatibility
export { SelfPurchaseForbiddenError as SelfPurchaseError }

export class AlreadyOwnedError extends Error {
  readonly code = 'ALREADY_ENTITLED'
  readonly userId?: number | string
  readonly productId?: number | string
  readonly entitlementId?: number | string

  constructor(userId?: number | string, productId?: number | string, entitlementId?: number | string) {
    super(
      `Người dùng đã sở hữu sản phẩm này (ALREADY_ENTITLED / ALREADY_OWNED${
        userId && productId ? `: user=${userId}, product=${productId}` : ''
      })`
    )
    this.name = 'AlreadyEntitledError'
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
  readonly productId?: number | string
  readonly status?: string | null
  readonly moderationStatus?: string | null

  constructor(productId?: number | string, status?: string | null, moderationStatus?: string | null) {
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
  readonly productId?: number | string

  constructor(productId?: number | string) {
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
  const effectiveReq: any = {
    ...(req || {}),
    payload,
  }
  const shouldCommit = await initTransaction(effectiveReq)

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
        seller: Number(sellerId) || numericBuyerId,
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

    // 10. Commit transaction if owned by this function
    if (shouldCommit) {
      await commitTransaction(effectiveReq)
    }

    return {
      success: true,
      orderId: String(orderDoc.id),
      orderCode: orderDoc.code,
      entitlementId: Number(entitlementDoc.id),
      productTitle: product.title,
      pricePaid,
    }
  } catch (error: any) {
    if (shouldCommit) {
      await killTransaction(effectiveReq)
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

    // Remap hook anti-self-purchase error if thrown by hook
    if (
      error?.message?.includes('Anti-self-purchase') ||
      error?.message?.includes('BR-04') ||
      error?.code === 'SELF_PURCHASE_FORBIDDEN'
    ) {
      if (!(error instanceof SelfPurchaseForbiddenError)) {
        throw new SelfPurchaseForbiddenError(numericBuyerId, productId)
      }
    }

    throw error
  }
}
