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
import { createNotification } from '@/services/notifications'

/** Relationship fields arrive as an id or a populated doc; normalise to the id. */
function toTicketUserId(value: unknown): number | null {
  const raw = typeof value === 'object' && value !== null ? (value as { id?: unknown }).id : value
  if (raw === null || raw === undefined || raw === '') return null
  const parsed = Number(raw)
  return Number.isFinite(parsed) ? parsed : null
}

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
    const { newMessage, replyOrdinal, updatedTicket } = await withTicketLock(
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

        // Hand the reply ordinal back to the caller so the §13 notification below can be
        // keyed on the exact appended entry instead of on wall-clock time.
        return {
          newMessage: appendedMessage,
          replyOrdinal: existingMessages.length + 1,
          updatedTicket: updated,
        }
      },
    )

    // §13 in-app channel (added): notify the OTHER side of the thread — the seller/staff when
    // the author replied, the author when the seller or staff replied.
    //
    // Deliberately AFTER `withTicketLock` resolved (the reply is committed by then) and
    // fire-and-forget: `createNotification` does not join this transaction and does not own a
    // pool — it draws a connection from the shared pool, waiting at most
    // `POOL_ACQUISITION_TIMEOUT_MS` (payload.config.ts) — and it swallows every failure, so the
    // 201 contract above, the append-only thread and the ticket status transition are exactly what
    // they were before.
    //
    // The dedupeKey is the appended reply's ordinal in the thread, which is unique per reply and
    // stable across a retry that `mergeTicketMessages` collapses, so no reply is announced twice.
    const authorId = toTicketUserId((updatedTicket as any)?.user)
    const sellerId = toTicketUserId((updatedTicket as any)?.seller)
    const senderIsAuthor = Number(authorId) === Number(user.id)
    const recipientId = senderIsAuthor ? sellerId : authorId
    // The recipient is whoever did NOT send this reply: the author when a seller/staff member
    // replied, the seller when the author replied.
    const recipientIsAuthor = !senderIsAuthor

    if (recipientId !== null && recipientId !== undefined) {
      // The link is honest per recipient (review finding F4).
      //
      // The ticket author DOES have a reachable thread view: `OrderTicketsSection` renders the
      // dispute thread on `/orders/[id]` (`app/(app)/(account)/orders/[id]/page.tsx`), and the
      // ticket carries the `order` relation that names it, so an author-facing notification
      // deep-links to that thread — the same buyer convention the rest of the channel already
      // uses (`services/purchase.ts`, `services/refund.ts`).
      //
      // For a ticket nobody bought (no order) and for every seller/staff recipient there is
      // genuinely no screen to open — `(app)/seller` has no ticket view — so those keep `null`
      // rather than a link into a page that would not show the thread.
      const orderId = toTicketUserId((updatedTicket as any)?.order)
      const link = recipientIsAuthor && orderId !== null ? `/orders/${orderId}` : null

      await createNotification(payload, {
        recipient: Number(recipientId),
        type: 'TICKET_REPLY',
        title: 'Có phản hồi mới trong khiếu nại',
        body: `Khiếu nại "${(updatedTicket as any)?.subject ?? ticketId}" vừa có phản hồi mới từ ${
          newMessage?.senderRole === 'buyer'
            ? 'người mua'
            : newMessage?.senderRole === 'seller'
              ? 'người bán'
              : 'bộ phận hỗ trợ'
        }.`,
        link,
        dedupeKey: `ticket:${ticketId}:reply:${replyOrdinal}`,
      })
    }

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
