import { NextResponse } from 'next/server'
import { getPayload } from 'payload'
import configPromise from '@payload-config'
import { headers as getHeaders } from 'next/headers'

/**
 * POST /api/v1/me/notifications/[id]/read — mark ONE of the caller's notifications as read.
 *
 * Contract:
 * - 401 `{ error: 'UNAUTHORIZED', message }` for an anonymous caller.
 * - 400 for a non-numeric id.
 * - 404 for an unknown id AND for a notification that belongs to somebody else — the two are
 *   deliberately indistinguishable, so the route cannot be used to probe other users' inboxes.
 *   (The collection API is never trusted for this: the row is loaded with `overrideAccess: true`
 *   only to make the ownership decision, and the write itself goes through the collection's
 *   access rules with `overrideAccess: false`.)
 * - Idempotent: marking an already-read notification read again returns the SAME `readAt` and
 *   `updated: false`; it never re-stamps the timestamp.
 * - Errors keep the repository's `{ error, message }` envelope with a Vietnamese message.
 */

function toId(value: unknown): number | null {
  const raw = typeof value === 'object' && value !== null ? (value as { id?: unknown }).id : value
  const parsed = Number(raw)
  return Number.isFinite(parsed) ? parsed : null
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> | { id: string } },
) {
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
          message: 'Yêu cầu đăng nhập để cập nhật thông báo.',
        },
        { status: 401 },
      )
    }

    const { id } = await Promise.resolve(params)
    const notificationId = Number(id)
    if (!Number.isFinite(notificationId) || notificationId <= 0) {
      return NextResponse.json(
        { error: 'BAD_REQUEST', message: 'Mã thông báo không hợp lệ.' },
        { status: 400 },
      )
    }

    let notification: any = null
    try {
      notification = await payload.findByID({
        collection: 'notifications',
        id: notificationId,
        depth: 0,
        overrideAccess: true,
      })
    } catch {
      notification = null
    }

    // Same answer for "does not exist" and "not yours".
    if (!notification || toId(notification.recipient) !== Number(user.id)) {
      return NextResponse.json(
        { error: 'NOT_FOUND', message: 'Thông báo không tồn tại.' },
        { status: 404 },
      )
    }

    if (notification.readAt) {
      // Idempotent: the first read timestamp is the one that sticks.
      return NextResponse.json({
        success: true,
        id: notification.id,
        readAt: notification.readAt,
        isRead: true,
        updated: false,
      })
    }

    const readAt = new Date().toISOString()

    // Through the access rules on purpose (`overrideAccess: false`): the collection allows the
    // recipient to write `readAt` and nothing else on their own rows.
    const updated = await payload.update({
      collection: 'notifications',
      id: notification.id,
      data: { readAt },
      depth: 0,
      overrideAccess: false,
      user,
    })

    return NextResponse.json({
      success: true,
      id: updated.id,
      readAt: (updated as any).readAt ?? readAt,
      isRead: true,
      updated: true,
    })
  } catch (error: any) {
    return NextResponse.json(
      {
        error: 'INTERNAL_ERROR',
        message: error?.message || 'Có lỗi xảy ra khi cập nhật thông báo.',
      },
      { status: 500 },
    )
  }
}
