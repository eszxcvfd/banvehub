import type { Notification } from '@/payload-types'
import type { Metadata } from 'next'
import { format } from 'date-fns'
import { headers as getHeaders } from 'next/headers'
import configPromise from '@payload-config'
import { getPayload } from 'payload'
import { redirect } from 'next/navigation'
import { mergeOpenGraph } from '@/utilities/mergeOpenGraph'
import { NotificationsList, type NotificationRow } from './NotificationsList'

export const dynamic = 'force-dynamic'

/**
 * §25 #21 — Notifications (account area).
 *
 * The server renders the caller's own inbox so the screen is correct on first paint (and for a
 * client without JS), and the client list owns the mark-read interactions. Rows are ALWAYS read
 * with `overrideAccess: false` + `user: user`, so this page can only ever show the authenticated
 * caller's notifications — the same access rules the API route relies on.
 *
 * Dates are formatted here, on the server, and shipped as strings: the list is re-rendered on the
 * client during hydration, and formatting a timestamp with a locale/timezone on both sides is a
 * classic hydration mismatch.
 */
export default async function NotificationsPage() {
  const headers = await getHeaders()
  const payload = await getPayload({ config: configPromise })
  const { user } = await payload.auth({ headers })

  if (!user) {
    redirect(
      `/login?warning=${encodeURIComponent('Vui lòng đăng nhập để xem thông báo của bạn.')}`,
    )
  }

  let rows: NotificationRow[] = []
  let unreadCount = 0

  try {
    const result = await payload.find({
      collection: 'notifications',
      where: {
        recipient: {
          equals: user.id,
        },
      },
      sort: '-createdAt',
      limit: 50,
      depth: 0,
      overrideAccess: false,
      user,
    })

    rows = (result?.docs || []).map((doc) => {
      const notification = doc as Notification
      return {
        id: Number(notification.id),
        type: notification.type,
        title: notification.title,
        body: notification.body,
        link: notification.link ?? null,
        isRead: Boolean(notification.readAt),
        createdAtLabel: notification.createdAt
          ? format(new Date(notification.createdAt), 'dd/MM/yyyy HH:mm')
          : '',
      }
    })

    const unread = await payload.find({
      collection: 'notifications',
      where: {
        and: [{ recipient: { equals: user.id } }, { readAt: { exists: false } }],
      },
      limit: 1,
      depth: 0,
      overrideAccess: false,
      user,
    })
    unreadCount = unread?.totalDocs ?? 0
  } catch (error) {
    console.error('Error fetching notifications:', error)
  }

  return (
    <div className="border p-8 rounded-lg bg-card w-full" data-testid="notifications-page">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-medium tracking-tight">Thông báo</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Sự kiện nạp tiền, đơn hàng, doanh thu, kiểm duyệt và hỗ trợ của bạn
          </p>
        </div>
      </div>

      <NotificationsList initialDocs={rows} initialUnreadCount={unreadCount} />
    </div>
  )
}

export const metadata: Metadata = {
  description: 'Danh sách thông báo trong ứng dụng của bạn tại KienTaoHub.',
  openGraph: mergeOpenGraph({
    title: 'Thông báo',
    url: '/notifications',
  }),
  title: 'Thông báo',
}
