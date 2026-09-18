import type { CollectionBeforeChangeHook, CollectionBeforeValidateHook, Payload } from 'payload'
import { commitTransaction, initTransaction, killTransaction } from 'payload'
import { sql } from '@payloadcms/db-postgres'
import crypto from 'crypto'

/**
 * Ticket invariants for FR-23 / FLOW-U09.
 *
 * Two security/correctness boundaries live here and are shared by the custom HTTP
 * routes and the collection (REST/admin) API:
 *
 * 1. **Attribution** — the `seller` field is an authorization boundary
 *    (`src/access/ticketAccess.ts` grants ticket read/update to the assigned seller).
 *    `resolveTicketAttribution()` is the single source of truth for which product a
 *    ticket is about and who really owns it; a wrong seller would leak the buyer's
 *    dispute content to an unrelated seller.
 *
 * 2. **Thread serialization** — `messages` is an array field, so any write that carries
 *    a `messages` array is a read-modify-write of the whole thread. Every ticket write
 *    therefore goes through one serialization point: `withTicketLock()` (custom PATCH
 *    and reply routes) and `beforeChangeTicket` (collection-API/admin writes), both
 *    taking `SELECT ... FOR UPDATE` on the ticket row and re-reading the committed
 *    thread inside that same transaction. Thread entries are append-only: a write can
 *    add a message but can never drop or rewrite an already committed one.
 */

/** The order holds several distinct products: the caller must pick one explicitly. */
export const TICKET_PRODUCT_SELECTION_REQUIRED = 'TICKET_PRODUCT_SELECTION_REQUIRED'
/** The referenced product is not part of the referenced order. */
export const TICKET_PRODUCT_NOT_IN_ORDER = 'TICKET_PRODUCT_NOT_IN_ORDER'
/** The referenced product does not exist. */
export const TICKET_PRODUCT_NOT_FOUND = 'TICKET_PRODUCT_NOT_FOUND'
/** An explicit seller was supplied that does not own the ticket's product. */
export const TICKET_SELLER_NOT_PRODUCT_OWNER = 'TICKET_SELLER_NOT_PRODUCT_OWNER'
/** A product was supplied without an order and the author never bought it. */
export const TICKET_PRODUCT_NOT_PURCHASED = 'TICKET_PRODUCT_NOT_PURCHASED'
/** Only an admin may re-attribute an existing ticket to another user. */
export const TICKET_USER_CHANGE_FORBIDDEN = 'TICKET_USER_CHANGE_FORBIDDEN'
/** Another write held the ticket row lock longer than the bounded wait allows. */
export const TICKET_LOCK_TIMEOUT = 'TICKET_LOCK_TIMEOUT'

const INVARIANT_ERROR_CODES = new Set<string>([
  TICKET_PRODUCT_SELECTION_REQUIRED,
  TICKET_PRODUCT_NOT_IN_ORDER,
  TICKET_PRODUCT_NOT_FOUND,
  TICKET_SELLER_NOT_PRODUCT_OWNER,
  TICKET_PRODUCT_NOT_PURCHASED,
  TICKET_USER_CHANGE_FORBIDDEN,
  TICKET_LOCK_TIMEOUT,
])

/**
 * How long a write may wait for the ticket row lock before it fails fast. Bounded so
 * that a saturated database can never leave a request (or a transaction) waiting
 * without bound - see the concurrency blocker: with an unbounded `FOR UPDATE` wait,
 * N >= pool.max concurrent replies ended up with every connection held by a
 * transaction that was itself waiting, and the pool never recovered.
 */
const TICKET_LOCK_WAIT_TIMEOUT_MS = 5000

const ELEVATED_ROLES = ['admin', 'moderator', 'financeAdmin'] as const

/** Roles that may manage tickets across users (mirrors `src/access/ticketAccess.ts`). */
export const isElevatedTicketUser = (user: any): boolean =>
  Boolean(user?.roles?.some((role: string) => (ELEVATED_ROLES as readonly string[]).includes(role)))

type ID = number | string

/**
 * Invariant violation that callers (HTTP routes) must map to a user-facing
 * rejection instead of a generic 500. `status` carries the intended HTTP status.
 */
export class TicketInvariantError extends Error {
  code: string
  status: number

  constructor(code: string, message: string, status = 400) {
    super(message)
    this.name = 'TicketInvariantError'
    this.code = code
    this.status = status
  }
}

/**
 * Detect an invariant violation raised by this module. The `code` check keeps the
 * mapping working even if the class identity is lost across bundles.
 */
export const isTicketInvariantError = (error: unknown): error is TicketInvariantError => {
  if (error instanceof TicketInvariantError) return true
  const code = (error as { code?: unknown } | null | undefined)?.code
  return typeof code === 'string' && INVARIANT_ERROR_CODES.has(code)
}

/** Flatten the messages of a (possibly wrapped) Payload error to recover an invariant code. */
const collectErrorText = (error: unknown, depth = 0): string => {
  if (!error || depth > 3) return ''

  const err = error as {
    cause?: unknown
    code?: unknown
    data?: { errors?: unknown }
    message?: unknown
  }

  const parts: string[] = []
  if (typeof err.message === 'string') parts.push(err.message)
  if (typeof err.code === 'string') parts.push(err.code)

  if (Array.isArray(err.data?.errors)) {
    for (const entry of err.data.errors) parts.push(collectErrorText(entry, depth + 1))
  }
  if (err.cause) parts.push(collectErrorText(err.cause, depth + 1))

  return parts.join(' | ')
}

export type TicketInvariantRejection = {
  errorCode: string
  status: number
  message: string
}

/**
 * Map any thrown value onto the user-facing rejection of an attribution invariant,
 * or `null` when the error is unrelated. Handles Payload wrapping the hook error.
 */
export const parseTicketInvariantError = (error: unknown): TicketInvariantRejection | null => {
  if (isTicketInvariantError(error)) {
    return {
      errorCode: error.code,
      status: error.status ?? 400,
      message: error.message,
    }
  }

  const text = collectErrorText(error)
  const errorCode = Array.from(INVARIANT_ERROR_CODES).find((code) => text.includes(code))
  if (!errorCode) return null

  const status =
    errorCode === TICKET_PRODUCT_NOT_FOUND
      ? 404
      : errorCode === TICKET_USER_CHANGE_FORBIDDEN
        ? 403
        : errorCode === TICKET_LOCK_TIMEOUT
          ? 503
          : 400

  return { errorCode, status, message: text }
}

/** Map an invariant status onto the API error names this repo already uses. */
export const ticketErrorName = (status: number): string => {
  if (status === 404) return 'NOT_FOUND'
  if (status === 403) return 'FORBIDDEN'
  if (status === 409) return 'CONFLICT'
  if (status === 503) return 'SERVICE_UNAVAILABLE'
  return 'BAD_REQUEST'
}

const toId = (value: unknown): ID | null => {
  if (value === null || value === undefined || value === '') return null
  if (typeof value === 'object') {
    const id = (value as { id?: unknown }).id
    return id === null || id === undefined || id === '' ? null : (id as ID)
  }
  return value as ID
}

const sameId = (a: unknown, b: unknown): boolean => {
  const left = toId(a)
  const right = toId(b)
  return left !== null && right !== null && String(left) === String(right)
}

/**
 * Ticket/order/product ids in this schema are integers, so normalise relationship
 * values (raw ids or populated docs) to `number` for both comparisons and writes.
 */
const toNumericId = (value: unknown): number | null => {
  const id = toId(value)
  if (id === null) return null
  const numeric = Number(id)
  return Number.isFinite(numeric) ? numeric : null
}

// ---------------------------------------------------------------------------
// Shared serialization point for every ticket write
// ---------------------------------------------------------------------------

type TransactionSession = { db?: { execute?: (query: unknown) => Promise<unknown> } }

/**
 * Lock the ticket row for the remainder of the transaction. Callers must already be
 * inside a transaction (`withTicketLock`, or the transaction Payload opens for a
 * collection operation) so that the lock and the write share one session.
 */
export async function lockTicketRow(
  payload: Payload,
  transactionID: unknown,
  ticketId: number,
  waitTimeoutMs: number = TICKET_LOCK_WAIT_TIMEOUT_MS,
): Promise<void> {
  const sessions = (payload?.db as { sessions?: Record<string, TransactionSession | undefined> })
    ?.sessions
  const transaction = sessions?.[transactionID == null ? '' : String(transactionID)]?.db

  if (!transaction || typeof transaction.execute !== 'function') {
    throw new Error('Không thể bắt đầu giao dịch khoá khiếu nại để ghi an toàn. Vui lòng thử lại.')
  }

  try {
    // `SET LOCAL` does not accept bind parameters, so use set_config(..., true) which is
    // transaction-scoped. This bounds every lock wait of this transaction.
    await transaction.execute(
      sql`SELECT set_config('lock_timeout', ${String(waitTimeoutMs)}, true)`,
    )
    await transaction.execute(sql`SELECT id FROM tickets WHERE id = ${ticketId} FOR UPDATE`)
  } catch (error) {
    if (isLockTimeoutError(error)) {
      throw new TicketInvariantError(
        TICKET_LOCK_TIMEOUT,
        'Khiếu nại đang được xử lý bởi một yêu cầu khác. Vui lòng thử lại sau ít giây.',
        503,
      )
    }
    throw error
  }
}

/** PostgreSQL lock_timeout surfaces as 55P03 ("canceling statement due to lock timeout"). */
const isLockTimeoutError = (error: unknown): boolean => {
  const code =
    (error as { code?: unknown } | null)?.code ??
    (error as { cause?: { code?: unknown } } | null)?.cause?.code
  if (code === '55P03' || code === '57014') return true
  return /lock timeout/i.test(collectErrorText(error))
}

/**
 * Run `write` inside a transaction that holds a row lock on the ticket. This is the
 * single serialization point for the custom PATCH and reply routes: without it two
 * concurrent read-modify-write cycles on the same ticket can silently drop writes
 * (lost update), because `messages` is rewritten as a whole array on every write.
 */
export async function withTicketLock<T>(
  payload: Payload,
  ticketId: number,
  write: (txReq: any) => Promise<T>,
): Promise<T> {
  // Same shape the money-write service uses (`services/purchase.ts`): a partial
  // request that only carries `payload` + `transactionID`.
  const txReq: any = { payload }
  const ownsTransaction = await initTransaction(txReq)

  if (!ownsTransaction) {
    throw new Error('Không thể bắt đầu giao dịch để ghi khiếu nại an toàn.')
  }

  try {
    await lockTicketRow(payload, txReq.transactionID, ticketId)
    const result = await write(txReq)
    await commitTransaction(txReq)
    return result
  } catch (error) {
    await killTransaction(txReq)
    throw error
  }
}

/** Which party of a ticket is the current caller (mirrors the access control rules). */
export type TicketActor = {
  isAdmin: boolean
  isAuthor: boolean
  isSeller: boolean
}

export const resolveTicketActor = (ticket: any, user: any): TicketActor => {
  const authorId = typeof ticket?.user === 'object' ? ticket.user?.id : ticket?.user
  const sellerId = typeof ticket?.seller === 'object' ? ticket.seller?.id : ticket?.seller

  return {
    isAdmin: isElevatedTicketUser(user),
    isAuthor: Number(authorId) === Number(user?.id),
    isSeller: Number(sellerId) === Number(user?.id),
  }
}

// ---------------------------------------------------------------------------
// Message thread (append-only)
// ---------------------------------------------------------------------------

const messageSignature = (entry: any): string =>
  JSON.stringify([
    toId(entry?.sender),
    entry?.senderRole ?? null,
    entry?.message ?? null,
    entry?.createdAt ?? null,
  ])

/**
 * Merge a client supplied `messages` array into the committed thread without ever
 * dropping or rewriting what is already stored: committed entries win, incoming
 * entries are only appended when they are genuinely new. This is what makes a stale
 * admin/collection-API write (thread snapshot taken before a reply) harmless.
 *
 * Two dedupe keys are applied, in order:
 *  1. row id - an incoming entry whose id already exists in the committed thread is
 *     ignored, so a committed row can never be rewritten, reordered or deleted;
 *  2. content signature (sender, senderRole, message, createdAt to the millisecond) -
 *     the fallback for entries WITHOUT an id, so re-sending a thread (or a client retry
 *     of the same append) cannot duplicate a message.
 *
 * Consequence, by design: two genuinely distinct id-less entries that are identical down
 * to the millisecond collapse into one, and an id-less append whose signature matches a
 * committed row is treated as that row. Those entries are indistinguishable in the stored
 * format, and a per-append server token would require a schema field (migrations are out
 * of scope for this repair round), so the collapse is documented here and pinned by unit
 * tests instead of being eliminated. Payload assigns an id to every persisted array row,
 * so committed messages always take the id path in practice.
 */
export const mergeTicketMessages = (committed: unknown, incoming: unknown): any[] => {
  const merged: any[] = Array.isArray(committed) ? [...committed] : []
  const knownIds = new Set<string>(
    merged
      .map((entry) => toId(entry?.id))
      .filter((id): id is ID => id !== null)
      .map(String),
  )
  const knownSignatures = new Set<string>(merged.map(messageSignature))

  for (const entry of Array.isArray(incoming) ? incoming : []) {
    const id = toId(entry?.id)
    if (id !== null && knownIds.has(String(id))) continue // existing row: never rewritten
    if (knownSignatures.has(messageSignature(entry))) continue // already part of the thread

    merged.push(entry)
    if (id !== null) knownIds.add(String(id))
    knownSignatures.add(messageSignature(entry))
  }

  return merged
}

// ---------------------------------------------------------------------------
// Product / seller attribution
// ---------------------------------------------------------------------------

type OrderItemAttribution = { productId: number; sellerId: number | null }

const findOrderItemAttributions = async (
  payload: Payload,
  orderId: number,
  req?: unknown,
): Promise<OrderItemAttribution[]> => {
  const items = await payload.find({
    collection: 'order_items',
    where: { order: { equals: orderId } },
    limit: 0,
    pagination: false,
    depth: 0,
    overrideAccess: true,
    // Inside a locked transaction every lookup must reuse that transaction's session,
    // otherwise it needs a second pool connection while holding one (pool starvation).
    req: req as any,
  })

  return items.docs
    .map((item: any) => ({
      productId: toNumericId(item.product),
      sellerId: toNumericId(item.seller),
    }))
    .filter((item): item is OrderItemAttribution => item.productId !== null)
}

const distinctProductIds = (items: OrderItemAttribution[]): number[] => {
  const ids: number[] = []
  for (const item of items) {
    if (!ids.some((id) => sameId(id, item.productId))) ids.push(item.productId)
  }
  return ids
}

/** True when the given user bought the product in one of their own orders. */
const hasPurchasedProduct = async (
  payload: Payload,
  buyerId: number,
  productId: number,
  req?: unknown,
): Promise<boolean> => {
  const buyerOrders = await payload.find({
    collection: 'orders',
    where: { buyer: { equals: buyerId } },
    limit: 0,
    pagination: false,
    depth: 0,
    overrideAccess: true,
    req: req as any,
  })

  const orderIds = buyerOrders.docs.map((order) => order.id)
  if (orderIds.length === 0) return false

  const purchasedItems = await payload.find({
    collection: 'order_items',
    where: {
      and: [{ order: { in: orderIds } }, { product: { equals: productId } }],
    },
    limit: 1,
    depth: 0,
    overrideAccess: true,
    req: req as any,
  })

  return purchasedItems.docs.length > 0
}

export type TicketAttribution = {
  productId: number | null
  sellerId: number | null
}

/**
 * Resolve which product — and therefore which seller — a ticket belongs to.
 *
 * Policy (decided for FR-23):
 * - Order with exactly one distinct product: auto-assign that product and its seller
 *   (keeps the convenient path for single-item orders).
 * - Order with several distinct products: never guess — reject and require an
 *   explicit `productId`.
 * - An explicitly selected product must really belong to the order.
 * - A `productId` given without an `orderId` must have been bought by the ticket
 *   author, otherwise the dispute would name a product (and grant its seller access)
 *   without any purchase relationship.
 * - The seller is always the true owner of the resolved product: the seller snapshot
 *   of the matching order item, falling back to the product's own seller.
 */
export async function resolveTicketAttribution({
  payload,
  orderId,
  productId,
  buyerId,
  buyerIsAdmin = false,
  enforcePurchase = true,
  req,
}: {
  payload: Payload
  orderId?: unknown
  productId?: unknown
  buyerId?: unknown
  buyerIsAdmin?: boolean
  enforcePurchase?: boolean
  /** Request to run the lookups with; pass the locked transaction request inside one. */
  req?: unknown
}): Promise<TicketAttribution> {
  const normalizedOrderId = toNumericId(orderId)
  let resolvedProductId = toNumericId(productId)
  let sellerId: number | null = null

  if (normalizedOrderId !== null) {
    const items = await findOrderItemAttributions(payload, normalizedOrderId, req)

    if (resolvedProductId === null) {
      const products = distinctProductIds(items)

      if (products.length > 1) {
        throw new TicketInvariantError(
          TICKET_PRODUCT_SELECTION_REQUIRED,
          'Đơn hàng có nhiều sản phẩm khác nhau. Vui lòng chọn sản phẩm cụ thể (productId) cần khiếu nại trước khi tạo yêu cầu hỗ trợ.',
        )
      }

      if (products.length === 1) {
        resolvedProductId = products[0]
        sellerId = items.find((item) => sameId(item.productId, products[0]))?.sellerId ?? null
      }
    } else {
      const item = items.find((entry) => sameId(entry.productId, resolvedProductId))
      if (!item) {
        throw new TicketInvariantError(
          TICKET_PRODUCT_NOT_IN_ORDER,
          'Sản phẩm được chọn không thuộc đơn hàng này.',
        )
      }
      sellerId = item.sellerId
    }
  }

  if (resolvedProductId !== null) {
    let product: any = null
    try {
      product = await payload.findByID({
        collection: 'products',
        id: resolvedProductId,
        depth: 0,
        overrideAccess: true,
        req: req as any,
      })
    } catch {
      product = null
    }

    if (!product) {
      throw new TicketInvariantError(TICKET_PRODUCT_NOT_FOUND, 'Sản phẩm không tồn tại.', 404)
    }

    if (sellerId === null) {
      sellerId = toNumericId(product.seller)
    }

    // Without an order the purchase relationship must be proven, otherwise a caller
    // could name any product (and grant its seller access) without ever buying it.
    // Internal ownership lookups (`enforcePurchase: false`) skip this rule: the caller
    // facing check always runs where the request's buyer context is known.
    if (normalizedOrderId === null && !buyerIsAdmin && enforcePurchase) {
      const normalizedBuyerId = toNumericId(buyerId)
      if (
        normalizedBuyerId === null ||
        !(await hasPurchasedProduct(payload, normalizedBuyerId, resolvedProductId, req))
      ) {
        throw new TicketInvariantError(
          TICKET_PRODUCT_NOT_PURCHASED,
          'Sản phẩm được chọn không thuộc đơn hàng nào của bạn. Vui lòng cung cấp mã đơn hàng (orderId) hoặc chọn sản phẩm bạn đã mua.',
        )
      }
    }
  }

  return { productId: resolvedProductId, sellerId }
}

export const beforeValidateTicket: CollectionBeforeValidateHook = async ({
  data,
  operation,
  originalDoc,
  req,
}) => {
  if (!data) return data

  const requester = req?.user
  const isCreate = operation === 'create'
  const requesterIsAdmin = isElevatedTicketUser(requester)

  // 1. The author is always the authenticated caller unless an admin files the ticket
  //    on behalf of somebody else (documented assist/transfer flow). A non-admin can
  //    never create a ticket attributed to another user.
  if (isCreate && requester) {
    if (!requesterIsAdmin || !data.user) {
      data.user = requester.id
    }
  }

  // 2. `user` is the ticket author and therefore an authorization boundary: only an
  //    admin may re-attribute an existing ticket (documented transfer flow). Server
  //    side writes without a requester (internal/system context) stay trusted.
  if (
    !isCreate &&
    requester &&
    !requesterIsAdmin &&
    data.user != null &&
    originalDoc?.user != null &&
    !sameId(data.user, originalDoc.user)
  ) {
    throw new TicketInvariantError(
      TICKET_USER_CHANGE_FORBIDDEN,
      'Chỉ quản trị viên mới có thể thay đổi người tạo khiếu nại.',
      403,
    )
  }

  // 2. Generate unique code if not set
  if (operation === 'create' && !data.code) {
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '')
    const randomSuffix = crypto.randomBytes(3).toString('hex').toUpperCase()
    data.code = `TCK-${dateStr}-${randomSuffix}`
  }

  // 3. Trim string fields
  if (typeof data.subject === 'string') {
    data.subject = data.subject.trim()
  }
  if (typeof data.description === 'string') {
    data.description = data.description.trim()
  }

  // 3. Validate order ownership when the ticket is (re)attributed to an order or to
  //    another author. Payload merges the stored document into `data`, so compare
  //    against `originalDoc` instead of trusting the mere presence of the fields.
  const orderChanging = isCreate || (data.order != null && !sameId(data.order, originalDoc?.order))
  const authorChanging = isCreate || (data.user != null && !sameId(data.user, originalDoc?.user))

  if (data.order && req.payload && (orderChanging || authorChanging)) {
    try {
      const orderId = typeof data.order === 'object' ? data.order.id : data.order
      const order = await req.payload.findByID({
        collection: 'orders',
        id: orderId,
        overrideAccess: true,
        req,
      })

      if (order) {
        const orderBuyerId = typeof order.buyer === 'object' ? order.buyer.id : order.buyer
        const ticketUserId = typeof data.user === 'object' ? data.user.id : data.user

        if (
          !requesterIsAdmin &&
          orderBuyerId &&
          ticketUserId &&
          Number(orderBuyerId) !== Number(ticketUserId)
        ) {
          throw new Error('Bạn không thể khiếu nại đơn hàng của người dùng khác.')
        }
      }
    } catch (err: any) {
      if (err.message?.includes('khiếu nại đơn hàng')) {
        throw err
      }
      // If order not found, let schema validation or route handle it
    }
  }

  return data
}

export const beforeChangeTicket: CollectionBeforeChangeHook = async ({
  data,
  operation,
  originalDoc,
  req,
}) => {
  if (!data) return data

  const payload = req?.payload
  const requester = req?.user
  const requesterIsAdmin = isElevatedTicketUser(requester)

  const explicitOrderId = toId(data.order)
  const explicitProductId = toId(data.product)
  const storedOrderId = operation === 'update' ? toId(originalDoc?.order) : null
  const storedProductId = operation === 'update' ? toId(originalDoc?.product) : null

  if (payload) {
    // 1. The thread is append-only. Re-read the committed messages inside the
    //    operation transaction while holding the ticket row lock, so a write carrying
    //    a stale snapshot (admin panel / collection API) cannot drop or rewrite
    //    replies that landed after the snapshot was taken. Payload opens a transaction
    //    for every collection operation by default; if a caller explicitly disables it
    //    there is no transaction to lock, so the merge still happens, just unlocked.
    if (operation === 'update' && Array.isArray(data.messages)) {
      const ticketId = toNumericId(originalDoc?.id ?? data.id)
      if (ticketId !== null) {
        if (req?.transactionID) {
          await lockTicketRow(payload, req.transactionID, ticketId)
        }
        const committedTicket: any = await payload.findByID({
          collection: 'tickets',
          id: ticketId,
          depth: 0,
          overrideAccess: true,
          req,
        })
        data.messages = mergeTicketMessages(committedTicket?.messages ?? [], data.messages)
      }
    }

    // 2. Guard the security boundary: whoever ends up in `seller` receives read and
    //    update access to this ticket, so a seller supplied by the caller must really
    //    own the ticket's product. Never auto-pick the first order item. Payload merges
    //    the stored document into `data`, so only an actually provided/changed seller
    //    is validated (otherwise every update would re-litigate stored data).
    const productToVerify = explicitProductId ?? storedProductId
    const storedSellerId = operation === 'update' ? toId(originalDoc?.seller) : null
    const sellerProvided =
      data.seller != null && (operation === 'create' || !sameId(data.seller, storedSellerId))

    if (sellerProvided && productToVerify !== null) {
      const owner = await resolveTicketAttribution({
        payload,
        orderId: explicitOrderId ?? storedOrderId,
        productId: productToVerify,
        // Ownership lookup only: the purchase rule is enforced below, where the
        // request's buyer context is known.
        enforcePurchase: false,
        req,
      })

      if (owner.sellerId !== null && !sameId(data.seller, owner.sellerId)) {
        throw new TicketInvariantError(
          TICKET_SELLER_NOT_PRODUCT_OWNER,
          'Người bán được gán không sở hữu sản phẩm của khiếu nại này.',
        )
      }
    }

    // 3. Without a product there is nothing to confirm ownership against, so a
    //    client-supplied `seller` is stripped: the server never grants a seller access
    //    to a ticket just because a client asked for it. Admins may still file a
    //    seller-scoped ticket explicitly (documented).
    if (sellerProvided && productToVerify === null && !requesterIsAdmin) {
      data.seller = undefined
    }

    // 4. Resolve product + seller: infer from the order on create, or refuse an
    //    ambiguous multi-product order so an unrelated seller can never be granted
    //    access by accident. On update only an actual product is (re)resolved.
    const shouldResolveAttribution =
      operation === 'create'
        ? explicitOrderId !== null || explicitProductId !== null
        : explicitProductId !== null

    if (shouldResolveAttribution) {
      const attribution = await resolveTicketAttribution({
        payload,
        orderId: explicitOrderId,
        productId: explicitProductId,
        buyerId:
          toNumericId(data.user) ?? toNumericId(originalDoc?.user) ?? toNumericId(requester?.id),
        buyerIsAdmin: requesterIsAdmin,
        req,
      })

      if (attribution.productId !== null) data.product = attribution.productId
      if (attribution.sellerId !== null) data.seller = attribution.sellerId
    }
  }

  // 5. Initialize messages thread on create if messages is empty
  if (operation === 'create' && (!data.messages || data.messages.length === 0) && data.description) {
    const senderId = typeof data.user === 'object' ? data.user.id : data.user || req.user?.id
    if (senderId) {
      data.messages = [
        {
          sender: senderId,
          senderRole: 'buyer',
          message: data.description,
          createdAt: new Date().toISOString(),
        },
      ]
    }
  }

  return data
}
