/**
 * web/src/services/refund.ts
 *
 * Compensating Refund Ledger & Reversal Service
 * References: PLAN.md FLOW-U15, BR-03, Decision 0002, Decision 0006
 */

import crypto from 'crypto'
import type { Payload } from 'payload'
import type { Order, User } from '@/payload-types'
import { creditWallet } from '@/services/wallet'
import { createNotification } from '@/services/notifications'

export interface RefundParams {
  orderId: number
  reason: string
  actorId: number
  revokeEntitlement?: boolean
  req?: unknown
}

export interface RefundResult {
  refundId: number
  orderId: number
  buyerId: number
  amountRefunded: number
  reversalLedgerEntryId?: number
  entitlementRevoked: boolean
  status: string
}

/**
 * Executes a compensating refund for an eligible completed order:
 * 1. Validates reason, order eligibility, and actor authorization (financeAdmin or admin).
 * 2. Credits buyer wallet with compensating credit entry (BR-03, FLOW-U15, Decision 0002) without touching original purchase ledger entries.
 * 3. Transitions seller earnings to REVERSED and computes refunded seller/platform amounts.
 * 4. Updates order status to REFUNDED while snapshot line items remain intact.
 * 5. Revokes entitlements if requested (default: true).
 * 6. Records an immutable refund audit entry in the `refunds` collection.
 */
export async function processRefund(
  payload: Payload,
  params: RefundParams,
): Promise<RefundResult> {
  // a) Validation
  if (!params.reason || typeof params.reason !== 'string' || !params.reason.trim()) {
    throw new Error('Refund reason is required')
  }

  if (!params.orderId || isNaN(Number(params.orderId))) {
    throw new Error('Order ID is required and must be a valid number')
  }

  // Verify actor authorization
  let actor: User | null = null
  try {
    actor = (await payload.findByID({
      collection: 'users',
      id: params.actorId,
      overrideAccess: true,
    })) as User | null
  } catch {
    throw new Error('Unauthorized: User does not have financeAdmin or admin role')
  }

  if (!actor || (!actor.roles?.includes('financeAdmin') && !actor.roles?.includes('admin'))) {
    throw new Error('Unauthorized: User does not have financeAdmin or admin role')
  }

  // Verify order exists
  let order: Order | null = null
  try {
    order = (await payload.findByID({
      collection: 'orders',
      id: params.orderId,
      overrideAccess: true,
    })) as Order | null
  } catch {
    throw new Error(`Order ${params.orderId} not found or not eligible for refund`)
  }

  if (!order) {
    throw new Error(`Order ${params.orderId} not found or not eligible for refund`)
  }

  // Verify order eligibility
  if (order.status === 'REFUNDED') {
    throw new Error('Order has already been refunded')
  }

  if (order.status !== 'COMPLETED') {
    throw new Error(`Order ${params.orderId} is not eligible for refund (status: ${order.status})`)
  }

  // b) Buyer Wallet Compensating Credit (BR-03, FLOW-U15, Decision 0002)
  const buyerId =
    typeof order.buyer === 'object' && order.buyer !== null
      ? order.buyer.id
      : order.buyer

  if (!buyerId) {
    throw new Error(`Cannot identify buyer for order ${params.orderId}`)
  }

  const orderTotal = Number(order.totalAmount || 0)
  let reversalLedgerEntryId: number | undefined

  if (orderTotal > 0) {
    const creditResult = await creditWallet(payload, {
      userId: Number(buyerId),
      amount: orderTotal,
      type: 'refund',
      referenceType: 'order',
      referenceId: order.code,
      description: `Hoàn tiền đơn hàng ${order.code}: ${params.reason.trim()}`,
    })
    reversalLedgerEntryId = creditResult.ledgerEntry?.id
  }

  // Fallback: Query latest refund ledger entry if ID not directly available
  if (!reversalLedgerEntryId && orderTotal > 0) {
    const ledgerDocs = await payload.find({
      collection: 'wallet_ledger',
      where: {
        and: [
          { referenceId: { equals: order.code } },
          { direction: { equals: 'credit' } },
          { type: { equals: 'refund' } },
        ],
      },
      sort: '-createdAt',
      limit: 1,
      overrideAccess: true,
    })
    if (ledgerDocs.docs.length > 0) {
      reversalLedgerEntryId = ledgerDocs.docs[0].id
    }
  }

  // c) Seller Earnings Reversal
  const earningsResult = await payload.find({
    collection: 'seller_earnings',
    where: { order: { equals: params.orderId } },
    limit: 100,
    overrideAccess: true,
  })

  let platformFeeRefunded = 0
  let sellerAmountRefunded = 0

  for (const earning of earningsResult.docs) {
    platformFeeRefunded += Number(earning.platformFee || 0)
    sellerAmountRefunded += Number(earning.sellerAmount || 0)

    if (earning.status !== 'REVERSED') {
      await payload.update({
        collection: 'seller_earnings',
        id: earning.id,
        data: {
          status: 'REVERSED',
        },
        overrideAccess: true,
      })
    }
  }

  // d) Order Status Update
  await payload.update({
    collection: 'orders',
    id: params.orderId,
    data: {
      status: 'REFUNDED',
    },
    overrideAccess: true,
  })

  // e) Entitlement Revocation
  const shouldRevoke = params.revokeEntitlement === undefined || params.revokeEntitlement === true

  if (shouldRevoke) {
    const entitlementsResult = await payload.find({
      collection: 'entitlements',
      where: { order: { equals: params.orderId } },
      limit: 100,
      overrideAccess: true,
    })

    for (const ent of entitlementsResult.docs) {
      await payload.update({
        collection: 'entitlements',
        id: ent.id,
        data: {
          status: 'revoked',
          reason: `Hoàn tiền: ${params.reason.trim()}`,
        },
        overrideAccess: true,
      })
    }
  }

  // f) Refund Audit Record
  const orderItemsResult = await payload.find({
    collection: 'order_items',
    where: { order: { equals: params.orderId } },
    limit: 100,
    overrideAccess: true,
  })

  const firstItem = orderItemsResult.docs[0]
  let orderItemId = firstItem ? firstItem.id : undefined
  let sellerId = firstItem
    ? typeof firstItem.seller === 'object' && firstItem.seller !== null
      ? firstItem.seller.id
      : firstItem.seller
    : undefined

  // Fallback to earnings if order_items has no seller
  if ((!sellerId || !orderItemId) && earningsResult.docs.length > 0) {
    const firstEarning = earningsResult.docs[0]
    if (!sellerId) {
      sellerId =
        typeof firstEarning.seller === 'object' && firstEarning.seller !== null
          ? firstEarning.seller.id
          : firstEarning.seller
    }
    if (!orderItemId) {
      orderItemId =
        typeof firstEarning.orderItem === 'object' && firstEarning.orderItem !== null
          ? firstEarning.orderItem.id
          : firstEarning.orderItem
    }
  }

  if (!sellerId) {
    sellerId = buyerId
  }

  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '')
  const randomSuffix = crypto.randomBytes(3).toString('hex').toUpperCase()
  const refundCode = `REF-${dateStr}-${randomSuffix}`

  const refundDoc = await payload.create({
    collection: 'refunds',
    data: {
      code: refundCode,
      order: params.orderId,
      orderItem: Number(orderItemId),
      buyer: Number(buyerId),
      seller: Number(sellerId),
      amount: orderTotal,
      platformFeeRefunded: platformFeeRefunded || 0,
      sellerAmountRefunded: sellerAmountRefunded || 0,
      currency: 'VND',
      reason: params.reason.trim(),
      status: 'COMPLETED',
      processedBy: params.actorId,
      ledgerTransaction: reversalLedgerEntryId,
      entitlementRevoked: shouldRevoke,
    },
    overrideAccess: true,
  })

  // g) §13 in-app channel (added): the compensating credit is applied and the refund audit
  // row exists, so tell the buyer. Fire-and-forget: `createNotification` does not join this
  // flow's writes and does not own a pool — it draws a connection from the shared pool, waiting
  // at most `POOL_ACQUISITION_TIMEOUT_MS` (payload.config.ts) — and it swallows every failure, so
  // it cannot alter the refund result, the reversal
  // ledger entry or the entitlement revocation above.
  // The dedupeKey is the order, not the refund row: an order can only be refunded once (the
  // COMPLETED -> REFUNDED guard above), so a retry can never announce it twice.
  await createNotification(payload, {
    recipient: Number(buyerId),
    type: 'REFUND',
    title: 'Đã hoàn tiền đơn hàng',
    body: `Đơn hàng ${order.code} đã được hoàn ${orderTotal.toLocaleString('vi-VN')}₫ vào ví của bạn. Lý do: ${params.reason.trim()}`,
    link: `/orders/${params.orderId}`,
    dedupeKey: `order:${order.code}:refunded`,
  })

  // h) Return RefundResult
  return {
    refundId: refundDoc.id,
    orderId: params.orderId,
    buyerId: Number(buyerId),
    amountRefunded: orderTotal,
    reversalLedgerEntryId,
    entitlementRevoked: shouldRevoke,
    status: 'COMPLETED',
  }
}
