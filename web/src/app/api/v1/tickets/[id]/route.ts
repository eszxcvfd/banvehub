import { NextResponse } from 'next/server'
import { getPayload } from 'payload'
import configPromise from '@payload-config'
import { headers as getHeaders } from 'next/headers'
import {
  parseTicketInvariantError,
  resolveTicketActor,
  ticketErrorName,
  withTicketLock,
  type TicketActor,
} from '@/collections/Tickets/hooks/enforceTicketInvariants'

const VALID_STATUSES = ['OPEN', 'IN_PROGRESS', 'WAITING_USER', 'RESOLVED', 'CLOSED']
const VALID_PRIORITIES = ['LOW', 'NORMAL', 'HIGH', 'URGENT']
const VALID_RESOLUTIONS = ['EXPLAINED', 'FIX_PROVIDED', 'REFUNDED', 'REJECTED']

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

/** Response-shaped error so the locked write path keeps the route's JSON contract. */
class TicketRouteError extends Error {
  status: number
  errorCode: string

  constructor(status: number, errorCode: string, message: string) {
    super(message)
    this.name = 'TicketRouteError'
    this.status = status
    this.errorCode = errorCode
  }
}

type TicketUpdatePlan =
  | { updateData: Record<string, any> }
  | { rejection: { status: number; error: string; message: string } }

/**
 * Field-level authorization + validation for PATCH, evaluated against a specific
 * snapshot of the ticket so it can be re-checked on the row-locked document.
 */
function planTicketUpdate(ticket: any, actor: TicketActor, body: any): TicketUpdatePlan {
  const { status, priority, resolution } = body || {}
  const updateData: Record<string, any> = {}

  // If author (buyer only, not admin or seller): can only close ticket or accept resolution
  if (!actor.isAdmin && !actor.isSeller) {
    if (priority || resolution) {
      return {
        rejection: {
          status: 403,
          error: 'FORBIDDEN',
          message: 'Người mua không có quyền cập nhật mức độ ưu tiên hoặc kết luận xử lý.',
        },
      }
    }
    if (status && !['CLOSED', 'RESOLVED'].includes(status)) {
      return {
        rejection: {
          status: 403,
          error: 'FORBIDDEN',
          message: 'Người mua chỉ có thể đánh dấu Đã giải quyết hoặc Đóng khiếu nại.',
        },
      }
    }
  }

  if (status) {
    if (!VALID_STATUSES.includes(status)) {
      return {
        rejection: {
          status: 400,
          error: 'BAD_REQUEST',
          message: `Trạng thái không hợp lệ. Phải là một trong: ${VALID_STATUSES.join(', ')}`,
        },
      }
    }
    updateData.status = status
  }

  if (priority) {
    if (!VALID_PRIORITIES.includes(priority)) {
      return {
        rejection: {
          status: 400,
          error: 'BAD_REQUEST',
          message: `Mức độ ưu tiên không hợp lệ. Phải là một trong: ${VALID_PRIORITIES.join(', ')}`,
        },
      }
    }
    updateData.priority = priority
  }

  if (resolution) {
    if (!VALID_RESOLUTIONS.includes(resolution)) {
      return {
        rejection: {
          status: 400,
          error: 'BAD_REQUEST',
          message: `Kết luận xử lý không hợp lệ. Phải là một trong: ${VALID_RESOLUTIONS.join(', ')}`,
        },
      }
    }
    updateData.resolution = resolution
    // If resolution is marked, status defaults to RESOLVED if not explicitly passed
    if (!updateData.status && ticket.status !== 'CLOSED') {
      updateData.status = 'RESOLVED'
    }
  }

  if (Object.keys(updateData).length === 0) {
    return {
      rejection: {
        status: 400,
        error: 'BAD_REQUEST',
        message: 'Không có thông tin nào cần cập nhật.',
      },
    }
  }

  return { updateData }
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> | { id: string } },
) {
  try {
    const { payload, user } = await getAuthContext(req)
    if (!user) {
      return NextResponse.json(
        { error: 'UNAUTHORIZED', message: 'Yêu cầu đăng nhập để xem chi tiết khiếu nại.' },
        { status: 401 },
      )
    }

    const { id } = await Promise.resolve(params)
    const ticketId = Number(id)
    if (isNaN(ticketId) || ticketId <= 0) {
      return NextResponse.json(
        { error: 'BAD_REQUEST', message: 'Mã khiếu nại không hợp lệ.' },
        { status: 400 },
      )
    }

    let ticket: any = null
    try {
      ticket = await payload.findByID({
        collection: 'tickets',
        id: ticketId,
        depth: 2,
        overrideAccess: true,
      })
    } catch {
      ticket = null
    }

    if (!ticket) {
      return NextResponse.json(
        { error: 'NOT_FOUND', message: 'Khiếu nại không tồn tại.' },
        { status: 404 },
      )
    }

    const authorId = typeof ticket.user === 'object' ? ticket.user?.id : ticket.user
    const sellerId = typeof ticket.seller === 'object' ? ticket.seller?.id : ticket.seller
    const isAdmin = user.roles?.some((r: string) => ['admin', 'moderator', 'financeAdmin'].includes(r))
    const isAuthor = Number(authorId) === Number(user.id)
    const isSeller = Number(sellerId) === Number(user.id)

    if (!isAdmin && !isAuthor && !isSeller) {
      return NextResponse.json(
        { error: 'FORBIDDEN', message: 'Bạn không có quyền xem khiếu nại này.' },
        { status: 403 },
      )
    }

    return NextResponse.json({
      success: true,
      ticket,
    })
  } catch (error: any) {
    console.error('Error getting ticket details:', error)
    return NextResponse.json(
      { error: 'INTERNAL_SERVER_ERROR', message: error.message || 'Lỗi hệ thống khi tải khiếu nại.' },
      { status: 500 },
    )
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> | { id: string } },
) {
  try {
    const { payload, user } = await getAuthContext(req)
    if (!user) {
      return NextResponse.json(
        { error: 'UNAUTHORIZED', message: 'Yêu cầu đăng nhập để cập nhật khiếu nại.' },
        { status: 401 },
      )
    }

    const { id } = await Promise.resolve(params)
    const ticketId = Number(id)
    if (isNaN(ticketId) || ticketId <= 0) {
      return NextResponse.json(
        { error: 'BAD_REQUEST', message: 'Mã khiếu nại không hợp lệ.' },
        { status: 400 },
      )
    }

    let ticket: any = null
    try {
      ticket = await payload.findByID({
        collection: 'tickets',
        id: ticketId,
        depth: 1,
        overrideAccess: true,
      })
    } catch {
      ticket = null
    }

    if (!ticket) {
      return NextResponse.json(
        { error: 'NOT_FOUND', message: 'Khiếu nại không tồn tại.' },
        { status: 404 },
      )
    }

    const authorId = typeof ticket.user === 'object' ? ticket.user?.id : ticket.user
    const sellerId = typeof ticket.seller === 'object' ? ticket.seller?.id : ticket.seller
    const isAdmin = user.roles?.some((r: string) => ['admin', 'moderator', 'financeAdmin'].includes(r))
    const isAuthor = Number(authorId) === Number(user.id)
    const isSeller = Number(sellerId) === Number(user.id)

    if (!isAdmin && !isAuthor && !isSeller) {
      return NextResponse.json(
        { error: 'FORBIDDEN', message: 'Bạn không có quyền chỉnh sửa khiếu nại này.' },
        { status: 403 },
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

    // Fast path: reject invalid input before opening a transaction. The authoritative
    // re-check happens on the row-locked document below.
    const preflight = planTicketUpdate(ticket, resolveTicketActor(ticket, user), body)
    if ('rejection' in preflight) {
      return NextResponse.json(
        { error: preflight.rejection.error, message: preflight.rejection.message },
        { status: preflight.rejection.status },
      )
    }

    // Every ticket write shares one serialization point (the ticket row lock): the
    // status/resolution update must not interleave with a concurrent reply that
    // rewrites the `messages` array, and the permissions are re-checked on the locked
    // document in case the ticket changed while this request waited.
    const updatedTicket = await withTicketLock(payload, ticketId, async (txReq) => {
      const currentTicket: any = await payload.findByID({
        collection: 'tickets',
        id: ticketId,
        depth: 1,
        overrideAccess: true,
        req: txReq,
      })

      if (!currentTicket) {
        throw new TicketRouteError(404, 'NOT_FOUND', 'Khiếu nại không tồn tại.')
      }

      const lockedActor = resolveTicketActor(currentTicket, user)
      if (!lockedActor.isAdmin && !lockedActor.isAuthor && !lockedActor.isSeller) {
        throw new TicketRouteError(403, 'FORBIDDEN', 'Bạn không có quyền chỉnh sửa khiếu nại này.')
      }

      const plan = planTicketUpdate(currentTicket, lockedActor, body)
      if ('rejection' in plan) {
        throw new TicketRouteError(
          plan.rejection.status,
          plan.rejection.error,
          plan.rejection.message,
        )
      }

      return payload.update({
        collection: 'tickets',
        id: ticketId,
        data: plan.updateData,
        overrideAccess: true,
        req: txReq,
      })
    })

    return NextResponse.json({
      success: true,
      ticket: updatedTicket,
    })
  } catch (error: any) {
    if (error instanceof TicketRouteError) {
      return NextResponse.json(
        { error: error.errorCode, message: error.message },
        { status: error.status },
      )
    }

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

    console.error('Error updating ticket:', error)
    return NextResponse.json(
      { error: 'INTERNAL_SERVER_ERROR', message: error.message || 'Lỗi hệ thống khi cập nhật khiếu nại.' },
      { status: 500 },
    )
  }
}
