/**
 * web/src/services/refund.ts
 *
 * Compensating Refund Ledger & Reversal Service
 * References: PLAN.md FLOW-U15, BR-03, Decision 0002, Decision 0006, Decision 0012
 *
 * Decision 0012 fixes who bears a refund and for how long a buyer may ask for one:
 *
 * - The fault basis is a REQUIRED input (§7): a seller fault reverses the seller's earning and
 *   returns the platform's fee with it, while a platform fault refunds the buyer ONLY, leaves the
 *   seller's earning to mature and is absorbed by the platform.
 * - Two amendments (2026-09-20, F1/F3) refine what a seller fault may do: an earning that is already
 *   `PAID` is left EXACTLY as it stands and excluded from the recovered share — the money left the
 *   platform, so the platform bears that refund — while `AVAILABLE` earnings (still held by the
 *   platform) keep being reversed; and an order whose earnings span more than one seller is refused
 *   on a seller basis, because an order-level basis cannot say which seller was at fault.
 * - The request window is 5 days from `orders.paidAt` (§6) — the instant payment completed and
 *   ownership was granted, never the first download. A refund requested after that is outside
 *   policy and only an explicit, recorded operator override (`overrideWindow`) may execute it.
 * - Money still moves through exactly one write path (Decision 0002): the buyer credit is a new
 *   compensating `wallet_ledger` row produced by `creditWallet`, never an edit of the original
 *   purchase rows (BR-03 keeps the ledger append-only).
 */

import crypto from 'crypto'
import type { Payload } from 'payload'
import type { Order, User } from '@/payload-types'
import { creditWallet } from '@/services/wallet'
import { createNotification } from '@/services/notifications'

/** Decision 0012 §6 — the buyer has 5 days from `orders.paidAt` to request a refund. */
export const REFUND_WINDOW_DAYS = 5

/** The same window as milliseconds, derived once so the two can never drift apart. */
export const REFUND_WINDOW_MS = REFUND_WINDOW_DAYS * 24 * 60 * 60 * 1000

/** Decision 0012 §7 — whose fault it was decides who bears the refund. */
export type RefundFaultBasis = 'SELLER' | 'PLATFORM'

/** The two accepted bases. There is deliberately no default: policy requires an explicit choice. */
export const REFUND_FAULT_BASES: readonly RefundFaultBasis[] = ['SELLER', 'PLATFORM']

/**
 * Normalises a caller-supplied fault basis (tolerating case and surrounding whitespace) and
 * returns `null` when the value is missing or unknown. Callers — the service and the admin route —
 * use this so the HTTP layer and the money layer agree on exactly which inputs are acceptable and
 * neither can invent one.
 */
export function normalizeFaultBasis(value: unknown): RefundFaultBasis | null {
  if (typeof value !== 'string') return null
  const normalized = value.trim().toUpperCase()
  return (REFUND_FAULT_BASES as readonly string[]).includes(normalized)
    ? (normalized as RefundFaultBasis)
    : null
}

/** The state of the Decision 0012 §6 window for one order, at one instant. */
export interface RefundWindowState {
  /** `orders.paidAt` — the window's anchor — or null when the order carries no anchor at all. */
  paidAt: Date | null
  /** `paidAt` + 5 days, or null when there is no anchor. */
  windowClosesAt: Date | null
  /** True while the request is inside the window. */
  inWindow: boolean
}

/**
 * Evaluates the 5-day request window against `orders.paidAt` (Decision 0012 §6).
 *
 * The anchor is the instant payment completed and ownership was granted — explicitly NOT the first
 * download, which a buyer could otherwise defer forever, and which is also what the 7-day seller
 * hold counts from, so both windows stay aligned on the same instant.
 *
 * An order with no (or an unparseable) `paidAt` has no anchor, so the window cannot be established
 * and the result is `inWindow: false` — the caller must then either refuse or require the explicit
 * operator override. Absence of an anchor is never treated as "inside the window".
 */
export function evaluateRefundWindow(
  paidAt: string | Date | null | undefined,
  now: Date = new Date(),
): RefundWindowState {
  const anchor = paidAt ? new Date(paidAt) : null

  if (!anchor || Number.isNaN(anchor.getTime())) {
    return { paidAt: null, windowClosesAt: null, inWindow: false }
  }

  const windowClosesAt = new Date(anchor.getTime() + REFUND_WINDOW_MS)

  return {
    paidAt: anchor,
    windowClosesAt,
    inWindow: now.getTime() <= windowClosesAt.getTime(),
  }
}

export interface RefundParams {
  orderId: number
  reason: string
  actorId: number
  /**
   * REQUIRED (Decision 0012 §7, F1/F3). `SELLER` reverses the seller's earning — except one that is
   * already `PAID`, which is left as it stands and excluded from the recovered share — and is
   * refused outright when the order's earnings span more than one seller; `PLATFORM` leaves every
   * earning to mature and the platform absorbs the fee and the payout. A missing or unknown value
   * refuses the refund — no path silently defaults to a seller fault.
   */
  faultBasis: RefundFaultBasis
  /**
   * The operator's explicit out-of-policy override for a request made after the 5-day window
   * (Decision 0012 §6). It only *permits* the refund; `outOfWindow` on the refund row records
   * whether an override was REQUIRED and RECORDED (F2), not whether the request was inside the
   * window — `false` also covers refunds executed before the 5-day rule existed.
   */
  overrideWindow?: boolean
  revokeEntitlement?: boolean
  req?: unknown
}

export interface RefundResult {
  refundId: number
  orderId: number
  buyerId: number
  amountRefunded: number
  /** The seller's share the refund recovered. Always 0 for a platform fault (Decision 0012 §7). */
  sellerAmountRefunded: number
  /** The platform's fee the refund returned; the platform books no revenue for the order. */
  platformFeeRefunded: number
  /** The fault the operator recorded, so the two money outcomes stay distinguishable after the fact. */
  faultBasis: RefundFaultBasis
  /** True when the request was outside the 5-day window and the operator overrode it. */
  outOfWindow: boolean
  /** The tickets this refund resolved automatically (Decision 0012 §4); empty when none exist. */
  resolvedTicketIds: number[]
  reversalLedgerEntryId?: number
  entitlementRevoked: boolean
  status: string
}

/**
 * Decision 0012 §4 — the label follows the money, in one action.
 *
 * Resolves the ticket(s) that belong to a refunded order, so "Đã hoàn tiền" is produced by the
 * refund itself instead of by somebody remembering to click a second time. The update passes the
 * collection's independent guard (`enforceRefundResolutionInvariant`), which requires an executed
 * refund for the ticket's order — the automatic path is a client of the rule, not an exemption
 * from it.
 *
 * Only this order's tickets are touched: the lookup is scoped by `order`, so an unrelated ticket is
 * never written and an order without a ticket is a no-op (empty result).
 *
 * The status mirrors the PATCH route's rule exactly: setting a resolution resolves the ticket
 * unless it was explicitly closed, in which case only the resolution is recorded.
 */
export async function resolveTicketsForRefundedOrder(
  payload: Payload,
  orderId: number,
): Promise<number[]> {
  const tickets = await payload.find({
    collection: 'tickets',
    where: { order: { equals: orderId } },
    limit: 100,
    depth: 0,
    overrideAccess: true,
  })

  const resolvedTicketIds: number[] = []

  for (const ticket of tickets.docs) {
    if (ticket.resolution === 'REFUNDED') continue

    const data: Record<string, unknown> = { resolution: 'REFUNDED' }
    if (ticket.status !== 'CLOSED') {
      data.status = 'RESOLVED'
    }

    await payload.update({
      collection: 'tickets',
      id: ticket.id,
      data,
      overrideAccess: true,
    })

    resolvedTicketIds.push(Number(ticket.id))
  }

  return resolvedTicketIds
}

/**
 * Executes a compensating refund for an eligible completed order:
 * 1. Validates the reason, the order id, the REQUIRED fault basis, the actor (financeAdmin or
 *    admin) and the order's eligibility.
 * 2. Enforces the Decision 0012 §6 window against `orders.paidAt`: a request after 5 days is
 *    refused unless the operator passes an explicit override, which is recorded on the refund.
 * 3. Credits the buyer wallet with a compensating credit entry (BR-03, FLOW-U15, Decision 0002)
 *    without touching original purchase ledger entries. The buyer's credit is identical under both
 *    fault bases — the fault decides the seller side, not the buyer side.
 * 4. Branches on the fault basis (Decision 0012 §7, F1/F3): a seller fault transitions the order's
 *    seller earnings to REVERSED and records the recovered share, except an earning already `PAID`,
 *    which is left exactly as it stands, excluded from the recovered share and named in a structured
 *    log; a seller fault is refused outright on a multi-seller order (F3); a platform fault leaves
 *    every earning untouched (still PENDING, still maturing on its hold schedule) and records
 *    `sellerAmountRefunded = 0`.
 * 5. Updates order status to REFUNDED while snapshot line items remain intact.
 * 6. Revokes entitlements if requested (default: true).
 * 7. Records an immutable refund audit entry in the `refunds` collection, including the fault basis
 *    and the out-of-window marker. Nothing is ever removed and no ledger row is ever mutated — a
 *    refund is a compensating entry, never an edit (BR-03).
 * 8. Resolves the ticket(s) of the refunded order (Decision 0012 §4) so the support surface's
 *    "Đã hoàn tiền" label is produced by the money event itself, through the same independent guard
 *    every other write path passes.
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

  // Decision 0012 §7: the fault basis decides who bears the refund, so it is a required input of
  // the money path itself — validated here, before the actor or the order are even loaded, so no
  // call site (route, admin panel, script) can execute a refund without stating it.
  const faultBasis = normalizeFaultBasis(params.faultBasis)

  if (!faultBasis) {
    throw new Error(
      `Refund fault basis is required and must be one of: ${REFUND_FAULT_BASES.join(', ')}`,
    )
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

  // Decision 0012 §6: the 5-day window runs from `orders.paidAt`. An out-of-window request is
  // refused unless the operator explicitly overrides it, and the override is recorded on the
  // refund row below so the record itself says the refund was out of window.
  const windowState = evaluateRefundWindow(order.paidAt)
  const overrideWindow = params.overrideWindow === true

  if (!windowState.inWindow && !overrideWindow) {
    if (!windowState.paidAt) {
      throw new Error(
        `Order ${params.orderId} has no paidAt, so the ${REFUND_WINDOW_DAYS}-day refund window cannot be established; pass overrideWindow to refund it out of policy`,
      )
    }

    throw new Error(
      `Refund is out of the ${REFUND_WINDOW_DAYS}-day window (paid at ${windowState.paidAt.toISOString()}, window closed at ${windowState.windowClosesAt?.toISOString()}); pass overrideWindow to refund it out of policy`,
    )
  }

  const outOfWindow = !windowState.inWindow

  // The order's seller earnings are loaded BEFORE any money moves, because two rules below refuse
  // the refund outright and a refusal must leave nothing behind: no buyer credit, no refund row, no
  // ledger row, no earning touched, the order still COMPLETED.
  const earningsResult = await payload.find({
    collection: 'seller_earnings',
    where: { order: { equals: params.orderId } },
    limit: 100,
    overrideAccess: true,
  })

  // Decision 0012 F3 (amended 2026-09-20): an order whose earnings belong to more than one seller
  // cannot be refunded on a SELLER basis. An order-level basis cannot say WHICH seller was at fault,
  // and reversing all of them would charge innocent sellers; per-seller attribution is a separate
  // increment. A PLATFORM basis is unaffected — it reverses nothing.
  if (faultBasis === 'SELLER') {
    const earningSellers = new Set(
      earningsResult.docs
        .map((earning) =>
          typeof earning.seller === 'object' && earning.seller !== null
            ? earning.seller.id
            : earning.seller,
        )
        .filter((sellerId) => sellerId !== null && sellerId !== undefined)
        .map(String),
    )

    if (earningSellers.size > 1) {
      throw new Error(
        `Refund refused: order ${params.orderId} has seller earnings for ${earningSellers.size} different sellers (${[...earningSellers].join(', ')}); a SELLER-basis refund cannot say which seller was at fault. Attribute fault per seller/order item, or refund on a PLATFORM basis, which reverses nothing.`,
      )
    }
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

  // c) Seller Earnings Reversal — fault-based (Decision 0012 §7, F1)
  let platformFeeRefunded = 0
  let sellerAmountRefunded = 0
  const paidEarningsLeftUntouched: number[] = []

  for (const earning of earningsResult.docs) {
    // The platform's fee leaves the platform under both bases: on a seller fault it is returned
    // together with the reversal of the seller's earning, and on a platform fault the platform
    // gives it back to the buyer itself — which is why the order books no platform revenue in
    // either case. Nothing else about the two cases is the same.
    platformFeeRefunded += Number(earning.platformFee || 0)

    if (faultBasis === 'PLATFORM') {
      // Decision 0012 §7 (platform fault): refund the buyer ONLY. Every seller earning is left
      // exactly as it stands — still PENDING, still holding its own `holdUntil` — so it matures on
      // schedule and the seller is paid their share in full. Nothing of the seller's share is
      // recovered: `sellerAmountRefunded` stays 0 and the platform absorbs the payout as the price
      // of its own failure.
      continue
    }

    // Decision 0012 F1 (amended 2026-09-20): a PAID earning is money that already left the platform,
    // so reversing it would record a recovery that did not happen and destroy the evidence that the
    // seller was paid. It is left exactly as it stands and excluded from the recovered share; the
    // platform bore this refund instead, and the refund row says so (`fault_basis = 'SELLER'` with
    // `sellerAmountRefunded = 0`). AVAILABLE is deliberately NOT excluded: a matured earning has not
    // been paid out — the platform still holds it and withdrawals pay from the withdrawable balance —
    // so reversing it is a real recovery.
    if (earning.status === 'PAID') {
      paidEarningsLeftUntouched.push(Number(earning.id))
      continue
    }

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

  // F1 auditability: the untouched case must be findable in the logs, not inferred from a zero.
  if (paidEarningsLeftUntouched.length > 0) {
    console.info(
      `[refund] SELLER-fault refund left already-PAID seller earning(s) untouched; the platform bore this refund. ${JSON.stringify(
        {
          event: 'refund.paid_earning_left_untouched',
          orderId: params.orderId,
          faultBasis,
          untouchedEarningIds: paidEarningsLeftUntouched,
        },
      )}`,
    )
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
      faultBasis,
      outOfWindow,
      currency: 'VND',
      reason: params.reason.trim(),
      status: 'COMPLETED',
      processedBy: params.actorId,
      ledgerTransaction: reversalLedgerEntryId,
      entitlementRevoked: shouldRevoke,
    },
    overrideAccess: true,
  })

  // g) Decision 0012 §4 — the label follows the money, in the same action. The refund row exists
  // by now, so resolving the order's ticket(s) passes the collection's independent guard; an order
  // without a ticket resolves nothing. Deliberately non-fatal: the refund is already committed
  // (money credited, ledger row written, order and earning updated) and this is a projection of
  // that event onto the support surface — a failure here must not turn a completed refund into an
  // error the operator would retry. The false direction stays impossible regardless, because the
  // guard refuses "Đã hoàn tiền" whenever no executed refund exists.
  let resolvedTicketIds: number[] = []
  try {
    resolvedTicketIds = await resolveTicketsForRefundedOrder(payload, params.orderId)
  } catch (ticketError) {
    console.error(
      `Refund ${refundCode} completed, but resolving the tickets of order ${params.orderId} failed:`,
      ticketError,
    )
  }

  // h) §13 in-app channel (added): the compensating credit is applied and the refund audit
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

  // i) Return RefundResult
  return {
    refundId: refundDoc.id,
    orderId: params.orderId,
    buyerId: Number(buyerId),
    amountRefunded: orderTotal,
    sellerAmountRefunded: sellerAmountRefunded || 0,
    platformFeeRefunded: platformFeeRefunded || 0,
    faultBasis,
    outOfWindow,
    resolvedTicketIds,
    reversalLedgerEntryId,
    entitlementRevoked: shouldRevoke,
    status: 'COMPLETED',
  }
}
