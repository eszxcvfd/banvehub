import { NextResponse } from 'next/server'
import { getPayload } from 'payload'
import configPromise from '@payload-config'
import { headers as getHeaders } from 'next/headers'
import type { Where } from 'payload'

/**
 * GET /api/v1/me/notifications — the caller's own in-app inbox (`PLAN.md` §13, §25 #21).
 *
 * Contract:
 * - 401 `{ error: 'UNAUTHORIZED', message }` for an anonymous caller.
 * - The result is ALWAYS scoped to the authenticated caller: the `where` is built from
 *   `user.id` and read through `overrideAccess: true`, so no query parameter and no
 *   collection access rule can widen it to somebody else's inbox.
 * - Pagination uses the same `page`/`limit` contract as the other `/api/v1/me` routes.
 * - `unreadCount` is the caller's total unread count (independent of paging), which is what
 *   the §25 #21 screen and any notification badge need.
 * - Errors keep the repository's `{ error, message }` envelope with a Vietnamese message.
 */

const NOTIFICATION_TYPES = [
  'PAYMENT_SUCCESS',
  'PAYMENT_FAILED',
  'ORDER_SUCCESS',
  'SELLER_SALE',
  'EARNINGS_AVAILABLE',
  'WITHDRAWAL_STATUS',
  'REFUND',
  'PRODUCT_APPROVED',
  'PRODUCT_REJECTED',
  'TICKET_REPLY',
] as const

export async function GET(req: Request) {
  try {
    let headers: Headers
    try {
      headers = await getHeaders()
    } catch {
      headers = req.headers
    }

    const payload = await getPayload({ config: configPromise })
    const { user } = await payload.auth({ headers })

    if (!user) {
      return NextResponse.json(
        {
          error: 'UNAUTHORIZED',
          message: 'Yêu cầu đăng nhập để xem danh sách thông báo.',
        },
        { status: 401 },
      )
    }

    const { searchParams } = new URL(req.url)
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10) || 1)
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '20', 10) || 20))
    const unreadOnly = searchParams.get('unread') === 'true'
    const typeParam = searchParams.get('type')?.toUpperCase()

    const where: Where = {
      recipient: {
        equals: user.id,
      },
    }

    if (unreadOnly) {
      where.readAt = { exists: false }
    }

    if (typeParam && (NOTIFICATION_TYPES as readonly string[]).includes(typeParam)) {
      where.type = { equals: typeParam as (typeof NOTIFICATION_TYPES)[number] }
    }

    const notifications = await payload.find({
      collection: 'notifications',
      where,
      sort: '-createdAt',
      page,
      limit,
      depth: 0,
      overrideAccess: true,
    })

    const unread = await payload.find({
      collection: 'notifications',
      where: {
        and: [{ recipient: { equals: user.id } }, { readAt: { exists: false } }],
      },
      limit: 1,
      depth: 0,
      overrideAccess: true,
    })

    return NextResponse.json({
      success: true,
      docs: notifications.docs.map((doc: any) => ({
        id: doc.id,
        type: doc.type,
        title: doc.title,
        body: doc.body,
        link: doc.link ?? null,
        readAt: doc.readAt ?? null,
        isRead: Boolean(doc.readAt),
        createdAt: doc.createdAt,
      })),
      unreadCount: unread.totalDocs,
      totalDocs: notifications.totalDocs,
      totalPages: notifications.totalPages,
      page: notifications.page,
      limit: notifications.limit,
      hasNextPage: notifications.hasNextPage,
      hasPrevPage: notifications.hasPrevPage,
    })
  } catch (error: any) {
    return NextResponse.json(
      {
        error: 'INTERNAL_ERROR',
        message: error?.message || 'Có lỗi xảy ra khi truy vấn danh sách thông báo.',
      },
      { status: 500 },
    )
  }
}
