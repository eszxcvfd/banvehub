import { NextResponse } from 'next/server'
import { getPayload, type Where } from 'payload'
import configPromise from '@payload-config'
import { headers as getHeaders } from 'next/headers'
import crypto from 'crypto'
import type { Ticket } from '@/payload-types'
import {
  isElevatedTicketUser,
  parseTicketInvariantError,
  resolveTicketAttribution,
  ticketErrorName,
  type TicketAttribution,
} from '@/collections/Tickets/hooks/enforceTicketInvariants'

const VALID_REASONS = [
  'FILE_CORRUPTED',
  'MISLEADING_CONTENT',
  'DOWNLOAD_ERROR',
  'BILLING_DISPUTE',
  'OTHER',
]

const VALID_PRIORITIES = ['LOW', 'NORMAL', 'HIGH', 'URGENT']

async function getAuthContext(req: Request) {
  let headers: Headers
  try {
    headers = await getHeaders()
  } catch {
    headers = req.headers
  }
  const payload = await getPayload({ config: configPromise })
  const { user } = await payload.auth({ headers })
  return { payload, user }
}

/**
 * POST /api/v1/tickets — create a support ticket / dispute.
 *
 * Contract (FR-23 / FLOW-U09):
 * - 401 unauthenticated, 400 invalid `reason`/`subject`/`description`/id, 404 unknown
 *   order or product, 403 disputing somebody else's order.
 * - The disputed product and the seller are resolved by `resolveTicketAttribution`
 *   (never guessed): a multi-product order without an explicit `productId` is refused
 *   with 400 `TICKET_PRODUCT_SELECTION_REQUIRED`, an explicit product must belong to
 *   the order, and a `productId` without an `orderId` must have been bought by the
 *   caller (`TICKET_PRODUCT_NOT_PURCHASED`).
 * - `user`/`seller`/`product`/`order` are written by this server route through
 *   `overrideAccess: true` after those invariants passed; clients cannot set them
 *   through the collection API (see `src/collections/Tickets/index.ts`).
 */
export async function POST(req: Request) {
  try {
    const { payload, user } = await getAuthContext(req)
    if (!user) {
      return NextResponse.json(
        { error: 'UNAUTHORIZED', message: 'Yêu cầu đăng nhập để tạo khiếu nại.' },
        { status: 401 },
      )
    }

    let body: any = null
    try {
      body = await req.json()
    } catch {
      return NextResponse.json(
        { error: 'BAD_REQUEST', message: 'Dữ liệu JSON không hợp lệ.' },
        { status: 400 },
      )
    }

    const { reason, subject, description, orderId, order: orderProp, productId, product: productProp, priority } = body || {}

    // 1. Validate required fields
    if (!reason || !VALID_REASONS.includes(reason)) {
      return NextResponse.json(
        {
          error: 'BAD_REQUEST',
          message: `Lý do khiếu nại (reason) không hợp lệ. Phải là một trong: ${VALID_REASONS.join(', ')}`,
        },
        { status: 400 },
      )
    }

    if (!subject || typeof subject !== 'string' || !subject.trim()) {
      return NextResponse.json(
        { error: 'BAD_REQUEST', message: 'Tiêu đề khiếu nại (subject) là bắt buộc.' },
        { status: 400 },
      )
    }

    if (!description || typeof description !== 'string' || !description.trim()) {
      return NextResponse.json(
        { error: 'BAD_REQUEST', message: 'Mô tả chi tiết lỗi (description) là bắt buộc.' },
        { status: 400 },
      )
    }

    const targetOrderId = orderId || orderProp
    const targetProductId = productId || productProp

    let parsedProductId: number | null = null
    if (targetProductId !== undefined && targetProductId !== null && targetProductId !== '') {
      parsedProductId = Number(targetProductId)
      if (isNaN(parsedProductId) || parsedProductId <= 0) {
        return NextResponse.json(
          { error: 'BAD_REQUEST', message: 'Mã sản phẩm (productId) không hợp lệ.' },
          { status: 400 },
        )
      }
    }

    // 2. Validate order if provided
    let parsedOrderId: number | null = null
    if (targetOrderId) {
      parsedOrderId = Number(targetOrderId)
      if (isNaN(parsedOrderId) || parsedOrderId <= 0) {
        return NextResponse.json(
          { error: 'BAD_REQUEST', message: 'Mã đơn hàng (orderId) không hợp lệ.' },
          { status: 400 },
        )
      }

      let orderDoc: any = null
      try {
        orderDoc = await payload.findByID({
          collection: 'orders',
          id: parsedOrderId,
          overrideAccess: true,
        })
      } catch {
        orderDoc = null
      }

      if (!orderDoc) {
        return NextResponse.json(
          { error: 'NOT_FOUND', message: 'Đơn hàng không tồn tại.' },
          { status: 404 },
        )
      }

      const orderBuyerId = typeof orderDoc.buyer === 'object' ? orderDoc.buyer?.id : orderDoc.buyer
      const isAdmin = user.roles?.includes('admin') || user.roles?.includes('moderator')

      if (!isAdmin && Number(orderBuyerId) !== Number(user.id)) {
        return NextResponse.json(
          { error: 'FORBIDDEN', message: 'Bạn không có quyền khiếu nại đơn hàng của người khác.' },
          { status: 403 },
        )
      }
    }

    // 3. Resolve product + seller through the shared ticket attribution invariant.
    //    A multi-product order without an explicit productId is refused (400) instead
    //    of being attributed to an arbitrary first order item, and the seller is always
    //    the real owner of the resolved product (ticketAccess grants access from it).
    let attribution: TicketAttribution = { productId: null, sellerId: null }
    try {
      attribution = await resolveTicketAttribution({
        payload,
        orderId: parsedOrderId,
        productId: parsedProductId,
        buyerId: user.id,
        buyerIsAdmin: isElevatedTicketUser(user),
      })
    } catch (error) {
      const invariant = parseTicketInvariantError(error)
      if (invariant) {
        return NextResponse.json(
          {
            error: ticketErrorName(invariant.status),
            code: invariant.errorCode,
            message: invariant.message,
          },
          { status: invariant.status },
        )
      }
      throw error
    }

    const trimmedSubject = subject.trim()
    const trimmedDescription = description.trim()
    const selectedPriority = priority && VALID_PRIORITIES.includes(priority) ? priority : 'NORMAL'

    // 4. Create Ticket
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '')
    const randomSuffix = crypto.randomBytes(3).toString('hex').toUpperCase()
    const ticketCode = `TCK-${dateStr}-${randomSuffix}`

    const ticket = await payload.create({
      collection: 'tickets',
      data: {
        code: ticketCode,
        user: user.id,
        seller: attribution.sellerId || undefined,
        order: parsedOrderId || undefined,
        product: attribution.productId || undefined,
        reason: reason as Ticket['reason'],
        subject: trimmedSubject,
        description: trimmedDescription,
        status: 'OPEN',
        priority: selectedPriority as Ticket['priority'],
        messages: [
          {
            sender: user.id,
            senderRole: 'buyer',
            message: trimmedDescription,
            createdAt: new Date().toISOString(),
          },
        ],
      },
      overrideAccess: true,
    })

    return NextResponse.json(
      {
        success: true,
        ticket,
      },
      { status: 201 },
    )
  } catch (error: any) {
    const invariant = parseTicketInvariantError(error)
    if (invariant) {
      return NextResponse.json(
        {
          error: ticketErrorName(invariant.status),
          code: invariant.errorCode,
          message: invariant.message,
        },
        { status: invariant.status },
      )
    }

    console.error('Error creating ticket:', error)
    return NextResponse.json(
      { error: 'INTERNAL_SERVER_ERROR', message: error.message || 'Lỗi hệ thống khi tạo khiếu nại.' },
      { status: 500 },
    )
  }
}

export async function GET(req: Request) {
  try {
    const { payload, user } = await getAuthContext(req)
    if (!user) {
      return NextResponse.json(
        { error: 'UNAUTHORIZED', message: 'Yêu cầu đăng nhập để xem danh sách khiếu nại.' },
        { status: 401 },
      )
    }

    const { searchParams } = new URL(req.url)
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10) || 1)
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '20', 10) || 20))
    const statusParam = searchParams.get('status')
    const orderIdParam = searchParams.get('orderId')
    const productIdParam = searchParams.get('productId')

    const isAdmin = user.roles?.some((r: string) => ['admin', 'moderator', 'financeAdmin'].includes(r))
    const isSeller = user.roles?.includes('seller')

    const andConditions: Where[] = []

    if (!isAdmin) {
      if (isSeller) {
        andConditions.push({
          or: [
            { user: { equals: user.id } },
            { seller: { equals: user.id } },
          ],
        })
      } else {
        andConditions.push({
          user: { equals: user.id },
        })
      }
    }

    if (statusParam && ['OPEN', 'IN_PROGRESS', 'WAITING_USER', 'RESOLVED', 'CLOSED'].includes(statusParam.toUpperCase())) {
      andConditions.push({
        status: { equals: statusParam.toUpperCase() },
      })
    }

    if (orderIdParam && !isNaN(Number(orderIdParam))) {
      andConditions.push({
        order: { equals: Number(orderIdParam) },
      })
    }

    if (productIdParam && !isNaN(Number(productIdParam))) {
      andConditions.push({
        product: { equals: Number(productIdParam) },
      })
    }

    const where: Where = andConditions.length > 0 ? { and: andConditions } : {}

    const tickets = await payload.find({
      collection: 'tickets',
      where,
      sort: '-createdAt',
      page,
      limit,
      depth: 2,
      overrideAccess: true,
    })

    return NextResponse.json({
      success: true,
      docs: tickets.docs,
      totalDocs: tickets.totalDocs,
      page: tickets.page,
      totalPages: tickets.totalPages,
      limit: tickets.limit,
    })
  } catch (error: any) {
    console.error('Error fetching tickets:', error)
    return NextResponse.json(
      { error: 'INTERNAL_SERVER_ERROR', message: error.message || 'Lỗi hệ thống khi lấy danh sách khiếu nại.' },
      { status: 500 },
    )
  }
}
