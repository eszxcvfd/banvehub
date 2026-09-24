import type { Notification } from '@/payload-types'
import type { Metadata } from 'next'
import { format } from 'date-fns'
import { headers as getHeaders } from 'next/headers'
import configPromise from '@payload-config'
import { getPayload } from 'payload'
import { redirect } from 'next/navigation'
import Link from 'next/link'
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
    <div className="w-full flex flex-col gap-6" data-testid="notifications-page">
      {/* Top Breadcrumb */}
      <div className="flex items-center gap-1.5 text-xs text-slate-400">
        <Link href="/" className="hover:text-slate-600 transition-colors">
          Trang chủ
        </Link>
        <span>&gt;</span>
        <Link href="/account" className="text-slate-600 font-medium hover:text-slate-900 transition-colors">
          Tài khoản
        </Link>
        <span>&gt;</span>
        <span className="text-slate-900 font-semibold">Thông báo</span>
      </div>

      <div className="bg-white border border-slate-200/80 rounded-2xl shadow-sm p-6 sm:p-8 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-slate-100">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-xl bg-blue-50 text-[#1677ff] border border-blue-100/60 flex items-center justify-center shrink-0 shadow-xs">
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
              </svg>
            </div>
            <div>
              <div className="flex items-center gap-2.5">
                <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 !mb-0">
                  Thông báo
                </h1>
                {unreadCount > 0 && (
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-100 text-[#1677ff]">
                    {unreadCount} chưa đọc
                  </span>
                )}
              </div>
              <p className="text-xs sm:text-sm text-slate-400 mt-1 mb-0">
                Sự kiện nạp tiền, đơn hàng, doanh thu, kiểm duyệt và hỗ trợ của bạn
              </p>
            </div>
          </div>
        </div>

        <NotificationsList initialDocs={rows} initialUnreadCount={unreadCount} />
      </div>
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
