import { NextResponse } from 'next/server'
import { getPayload } from 'payload'
import configPromise from '@payload-config'
import { headers as getHeaders } from 'next/headers'
import {
  parseTicketInvariantError,
  resolveTicketActor,
  ticketErrorName,
  withTicketLock,
} from '@/collections/Tickets/hooks/enforceTicketInvariants'

/**
 * POST /api/v1/tickets/[id]/messages — append a reply to a ticket thread.
 *
 * Contract (FR-23 / FLOW-U09):
 * - 401 unauthenticated, 400 invalid id or empty `message`, 404 unknown ticket,
 *   403 for a caller that is neither the author, the assigned seller nor an admin.
 * - 409 CONFLICT once the ticket is CLOSED: a closed dispute is an immutable thread,
 *   an admin must re-open it (PATCH status) before more replies are accepted.
 * - Status transitions: a buyer reply moves WAITING_USER -> IN_PROGRESS, a seller or
 *   admin reply moves OPEN/IN_PROGRESS -> WAITING_USER, anything else is preserved.
 * - The reply is appended inside a transaction holding `SELECT ... FOR UPDATE` on the
 *   ticket row and re-reads the committed `messages` array under that lock, so
 *   concurrent replies can never overwrite each other (lost update) and messages are
 *   only ever appended (the collection-level `messages` field is admin-only and the
 *   beforeChange hook merges writes into the committed thread).
 * - Success keeps the documented shape: `{ success, message, ticket }` with 201.
 */
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

type TicketStatus = 'OPEN' | 'IN_PROGRESS' | 'WAITING_USER' | 'RESOLVED' | 'CLOSED'

/** Status transition applied when a party replies to a ticket. */
function resolveReplyStatus(
  currentStatus: TicketStatus,
  senderRole: 'buyer' | 'seller' | 'admin',
): TicketStatus {
  if (senderRole === 'buyer') {
    return currentStatus === 'WAITING_USER' ? 'IN_PROGRESS' : currentStatus
  }

  // Seller or admin reply
  return ['OPEN', 'IN_PROGRESS'].includes(currentStatus) ? 'WAITING_USER' : currentStatus
}

/** Response-shaped error so early exits keep the route's JSON contract. */
class TicketReplyError extends Error {
  status: number
  errorCode: string

  constructor(status: number, errorCode: string, message: string) {
    super(message)
    this.name = 'TicketReplyError'
    this.status = status
    this.errorCode = errorCode
  }
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> | { id: string } },
) {
  try {
    const { payload, user } = await getAuthContext(req)
    if (!user) {
      return NextResponse.json(
        { error: 'UNAUTHORIZED', message: 'Yêu cầu đăng nhập để gửi phản hồi.' },
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

    const permissions = resolveTicketActor(ticket, user)
    if (!permissions.isAdmin && !permissions.isAuthor && !permissions.isSeller) {
      return NextResponse.json(
        { error: 'FORBIDDEN', message: 'Bạn không có quyền phản hồi khiếu nại này.' },
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

    const { message } = body || {}
    if (!message || typeof message !== 'string' || !message.trim()) {
      return NextResponse.json(
        { error: 'BAD_REQUEST', message: 'Nội dung phản hồi (message) không được để trống.' },
        { status: 400 },
      )
    }

    // Shared serialization point: the ticket row lock is held for the whole
    // read-modify-write below, so concurrent replies (and concurrent PATCH writes)
    // cannot overwrite each other's message array.
    const { newMessage, updatedTicket } = await withTicketLock(
      payload,
      ticketId,
      async (txReq) => {
        // Re-read inside the lock: the array being appended to must be the committed one.
        const currentTicket: any = await payload.findByID({
          collection: 'tickets',
          id: ticketId,
          depth: 0,
          overrideAccess: true,
          req: txReq,
        })

        if (!currentTicket) {
          throw new TicketReplyError(404, 'NOT_FOUND', 'Khiếu nại không tồn tại.')
        }

        // Re-check access against the locked document (user/seller may have changed
        // while this request waited for the lock).
        const lockedPermissions = resolveTicketActor(currentTicket, user)
        if (!lockedPermissions.isAdmin && !lockedPermissions.isAuthor && !lockedPermissions.isSeller) {
          throw new TicketReplyError(
            403,
            'FORBIDDEN',
            'Bạn không có quyền phản hồi khiếu nại này.',
          )
        }

        if (currentTicket.status === 'CLOSED') {
          throw new TicketReplyError(
            409,
            'CONFLICT',
            'Khiếu nại đã đóng, không thể gửi thêm phản hồi. Vui lòng mở lại khiếu nại nếu cần trao đổi tiếp.',
          )
        }

        const senderRole = lockedPermissions.isAdmin
          ? 'admin'
          : lockedPermissions.isSeller
            ? 'seller'
            : 'buyer'

        const appendedMessage = {
          sender: user.id,
          senderRole,
          message: message.trim(),
          createdAt: new Date().toISOString(),
        }

        const existingMessages = Array.isArray(currentTicket.messages)
          ? currentTicket.messages
          : []
        const newStatus = resolveReplyStatus(currentTicket.status, senderRole)

        const updated = await payload.update({
          collection: 'tickets',
          id: ticketId,
          data: {
            messages: [...existingMessages, appendedMessage],
            status: newStatus,
          },
          overrideAccess: true,
          req: txReq,
        })

        return { newMessage: appendedMessage, updatedTicket: updated }
      },
    )

    return NextResponse.json(
      {
        success: true,
        message: newMessage,
        ticket: updatedTicket,
      },
      { status: 201 },
    )
  } catch (error: any) {
    if (error instanceof TicketReplyError) {
      return NextResponse.json(
        { error: error.errorCode, message: error.message },
        { status: error.status },
      )
    }

    // Bounded-lock failures (and other attribution invariants) surface as coded errors
    // instead of an opaque 500 so a saturated database fails fast and visibly.
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

    console.error('Error posting ticket message:', error)
    return NextResponse.json(
      { error: 'INTERNAL_SERVER_ERROR', message: error.message || 'Lỗi hệ thống khi gửi phản hồi.' },
      { status: 500 },
    )
  }
}
