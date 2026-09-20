'use client'

import { Button } from '@/components/ui/button'
import clsx from 'clsx'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'

/** One row of the §25 #21 inbox, pre-formatted on the server (no hydration-time locale drift). */
export type NotificationRow = {
  id: number
  type: string
  title: string
  body: string
  link: null | string
  isRead: boolean
  createdAtLabel: string
}

type Props = {
  initialDocs: NotificationRow[]
  initialUnreadCount: number
}

/**
 * §25 #21 — the caller's in-app notification list.
 *
 * - Renders the rows the server already scoped to the authenticated caller.
 * - "Đánh dấu đã đọc" per row and "Đánh dấu tất cả đã đọc" both go through
 *   `/api/v1/me/notifications` (never through Payload directly), so the browser exercises the
 *   same access-checked route every other client uses.
 * - Both actions are idempotent on the server; the local state follows the server's answer, and
 *   a failed call surfaces an inline message instead of silently lying in the UI.
 */
export function NotificationsList({ initialDocs, initialUnreadCount }: Props) {
  const router = useRouter()
  const [docs, setDocs] = useState<NotificationRow[]>(initialDocs)
  const [unreadCount, setUnreadCount] = useState<number>(initialUnreadCount)
  const [error, setError] = useState<null | string>(null)
  const [busyId, setBusyId] = useState<null | number>(null)
  const [isPending, startTransition] = useTransition()

  const markRead = async (id: number) => {
    setError(null)
    setBusyId(id)

    try {
      const res = await fetch(`/api/v1/me/notifications/${id}/read`, { method: 'POST' })
      const data = await res.json().catch(() => null)

      if (!res.ok) {
        setError(data?.message || 'Không thể đánh dấu thông báo đã đọc.')
        return
      }

      setDocs((current) =>
        current.map((doc) => (doc.id === id ? { ...doc, isRead: true } : doc)),
      )
      setUnreadCount((current) => Math.max(0, current - 1))
      startTransition(() => router.refresh())
    } catch {
      setError('Không thể kết nối tới máy chủ để cập nhật thông báo.')
    } finally {
      setBusyId(null)
    }
  }

  const markAllRead = async () => {
    setError(null)

    try {
      const res = await fetch('/api/v1/me/notifications/read-all', { method: 'POST' })
      const data = await res.json().catch(() => null)

      if (!res.ok) {
        setError(data?.message || 'Không thể đánh dấu tất cả thông báo đã đọc.')
        return
      }

      setDocs((current) => current.map((doc) => ({ ...doc, isRead: true })))
      setUnreadCount(Number(data?.unreadCount ?? 0))
      startTransition(() => router.refresh())
    } catch {
      setError('Không thể kết nối tới máy chủ để cập nhật thông báo.')
    }
  }

  if (docs.length === 0) {
    return (
      <div className="py-12 text-center" data-testid="notifications-empty">
        <p className="text-muted-foreground">Bạn chưa có thông báo nào.</p>
      </div>
    )
  }

  return (
    <div className="flex w-full flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <p className="text-sm text-muted-foreground" data-testid="notifications-unread-count">
          {unreadCount > 0
            ? `Bạn có ${unreadCount} thông báo chưa đọc.`
            : 'Tất cả thông báo đã được đọc.'}
        </p>

        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={markAllRead}
          disabled={isPending || unreadCount === 0}
          data-testid="mark-all-read"
        >
          Đánh dấu tất cả đã đọc
        </Button>
      </div>

      {error ? (
        <p className="text-sm text-destructive" role="alert" data-testid="notifications-error">
          {error}
        </p>
      ) : null}

      <ul className="flex flex-col gap-4" data-testid="notifications-list">
        {docs.map((doc) => (
          <li
            key={doc.id}
            data-testid="notification-item"
            data-notification-id={doc.id}
            data-read={doc.isRead ? 'true' : 'false'}
            className={clsx('rounded-lg border p-6', {
              'bg-card': doc.isRead,
              'bg-card border-primary/40': !doc.isRead,
            })}
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex items-center gap-2">
                {!doc.isRead ? (
                  <span
                    aria-hidden="true"
                    className="size-2 rounded-full bg-primary"
                    data-testid="notification-unread-dot"
                  />
                ) : null}
                <h2 className="text-lg font-medium" data-testid="notification-title">
                  {doc.title}
                </h2>
              </div>

              <span
                className={clsx('text-xs uppercase tracking-wide', {
                  'text-primary': !doc.isRead,
                  'text-muted-foreground': doc.isRead,
                })}
                data-testid="notification-read-state"
              >
                {doc.isRead ? 'Đã đọc' : 'Chưa đọc'}
              </span>
            </div>

            <p className="mt-2 text-sm text-muted-foreground" data-testid="notification-body">
              {doc.body}
            </p>

            <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
              <span className="text-xs text-muted-foreground" data-testid="notification-date">
                {doc.createdAtLabel}
              </span>

              <div className="flex items-center gap-3">
                {doc.link ? (
                  <Button asChild variant="link" size="sm">
                    <Link href={doc.link} data-testid="notification-link">
                      Xem chi tiết
                    </Link>
                  </Button>
                ) : null}

                {!doc.isRead ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => markRead(doc.id)}
                    disabled={busyId === doc.id}
                    data-testid="mark-read"
                  >
                    Đánh dấu đã đọc
                  </Button>
                ) : null}
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
