import { NextResponse } from 'next/server'
import { getPayload } from 'payload'
import configPromise from '@payload-config'
import { headers as getHeaders } from 'next/headers'

/**
 * POST /api/v1/me/notifications/read-all — mark EVERY unread notification of the caller read.
 *
 * Contract:
 * - 401 `{ error: 'UNAUTHORIZED', message }` for an anonymous caller.
 * - Only the caller's own rows are touched: the candidate set is built from `user.id`, and each
 *   write goes through the collection access rules with `overrideAccess: false`.
 * - Idempotent: a second call reports `updated: 0` and leaves every stored `readAt` untouched
 *   (already-read rows are never re-stamped).
 * - A single failing row does not abort the batch; the caller gets the real remaining
 *   `unreadCount` so the UI never claims "all read" when it is not.
 */

export async function POST(req: Request) {
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

    const unread = await payload.find({
      collection: 'notifications',
      where: {
        and: [{ recipient: { equals: user.id } }, { readAt: { exists: false } }],
      },
      limit: 500,
      depth: 0,
      overrideAccess: true,
    })

    const readAt = new Date().toISOString()
    let updated = 0
    let failed = 0

    for (const doc of unread.docs) {
      try {
        await payload.update({
          collection: 'notifications',
          id: doc.id,
          data: { readAt },
          depth: 0,
          overrideAccess: false,
          user,
        })
        updated += 1
      } catch {
        failed += 1
      }
    }

    const remaining = await payload.find({
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
      updated,
      failed,
      readAt,
      unreadCount: remaining.totalDocs,
    })
  } catch (error: any) {
    return NextResponse.json(
      {
        error: 'INTERNAL_ERROR',
        message: error?.message || 'Có lỗi xảy ra khi cập nhật danh sách thông báo.',
      },
      { status: 500 },
    )
  }
}
