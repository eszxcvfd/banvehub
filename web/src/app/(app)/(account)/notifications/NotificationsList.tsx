'use client'

import React, { useState, useTransition, useMemo } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import clsx from 'clsx'
import {
  Button,
  Tag,
  Empty,
  Badge,
  Segmented,
} from 'antd'
import {
  BellOutlined,
  CheckCircleFilled,
  CloseCircleFilled,
  ClockCircleOutlined,
  ShoppingOutlined,
  WalletOutlined,
  DollarCircleOutlined,
  RollbackOutlined,
  CustomerServiceOutlined,
  ExclamationCircleOutlined,
  RiseOutlined,
  ArrowRightOutlined,
  CheckOutlined,
  CheckCircleOutlined,
  InboxOutlined,
  SafetyCertificateOutlined,
} from '@ant-design/icons'

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

type FilterCategory = 'ALL' | 'UNREAD' | 'ORDERS' | 'WALLET' | 'SUPPORT'

function getNotificationMeta(type: string) {
  switch (type) {
    case 'PAYMENT_SUCCESS':
      return {
        label: 'Thanh toán thành công',
        tagColor: 'green',
        icon: <CheckCircleFilled className="text-emerald-500 text-lg" />,
        avatarBg: 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800',
      }
    case 'PAYMENT_FAILED':
      return {
        label: 'Thanh toán thất bại',
        tagColor: 'red',
        icon: <CloseCircleFilled className="text-rose-500 text-lg" />,
        avatarBg: 'bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-800',
      }
    case 'ORDER_SUCCESS':
      return {
        label: 'Đơn hàng hoàn tất',
        tagColor: 'blue',
        icon: <ShoppingOutlined className="text-[#1677ff] text-lg" />,
        avatarBg: 'bg-blue-50 dark:bg-blue-950/40 border-blue-200 dark:border-blue-800',
      }
    case 'SELLER_SALE':
      return {
        label: 'Đơn bán mới',
        tagColor: 'gold',
        icon: <RiseOutlined className="text-amber-500 text-lg" />,
        avatarBg: 'bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-800',
      }
    case 'EARNINGS_AVAILABLE':
      return {
        label: 'Doanh thu khả dụng',
        tagColor: 'cyan',
        icon: <DollarCircleOutlined className="text-teal-600 text-lg" />,
        avatarBg: 'bg-teal-50 dark:bg-teal-950/40 border-teal-200 dark:border-teal-800',
      }
    case 'WITHDRAWAL_STATUS':
      return {
        label: 'Yêu cầu rút tiền',
        tagColor: 'purple',
        icon: <WalletOutlined className="text-purple-500 text-lg" />,
        avatarBg: 'bg-purple-50 dark:bg-purple-950/40 border-purple-200 dark:border-purple-800',
      }
    case 'REFUND':
      return {
        label: 'Hoàn tiền',
        tagColor: 'orange',
        icon: <RollbackOutlined className="text-orange-500 text-lg" />,
        avatarBg: 'bg-orange-50 dark:bg-orange-950/40 border-orange-200 dark:border-orange-800',
      }
    case 'PRODUCT_APPROVED':
      return {
        label: 'Sản phẩm được duyệt',
        tagColor: 'green',
        icon: <SafetyCertificateOutlined className="text-emerald-500 text-lg" />,
        avatarBg: 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800',
      }
    case 'PRODUCT_REJECTED':
      return {
        label: 'Sản phẩm bị từ chối',
        tagColor: 'red',
        icon: <ExclamationCircleOutlined className="text-rose-500 text-lg" />,
        avatarBg: 'bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-800',
      }
    case 'TICKET_REPLY':
      return {
        label: 'Phản hồi hỗ trợ',
        tagColor: 'geekblue',
        icon: <CustomerServiceOutlined className="text-indigo-500 text-lg" />,
        avatarBg: 'bg-indigo-50 dark:bg-indigo-950/40 border-indigo-200 dark:border-indigo-800',
      }
    default:
      return {
        label: 'Thông báo',
        tagColor: 'default',
        icon: <BellOutlined className="text-[#1677ff] text-lg" />,
        avatarBg: 'bg-blue-50 dark:bg-blue-950/40 border-blue-200 dark:border-blue-800',
      }
  }
}

export function NotificationsList({ initialDocs, initialUnreadCount }: Props) {
  const router = useRouter()
  const [docs, setDocs] = useState<NotificationRow[]>(initialDocs)
  const [unreadCount, setUnreadCount] = useState<number>(initialUnreadCount)
  const [error, setError] = useState<null | string>(null)
  const [busyId, setBusyId] = useState<null | number>(null)
  const [isPending, startTransition] = useTransition()
  const [activeTab, setActiveTab] = useState<FilterCategory>('ALL')

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

  // Filtered rows based on selected tab
  const filteredDocs = useMemo(() => {
    switch (activeTab) {
      case 'UNREAD':
        return docs.filter((d) => !d.isRead)
      case 'ORDERS':
        return docs.filter((d) =>
          ['ORDER_SUCCESS', 'SELLER_SALE', 'PAYMENT_SUCCESS', 'PAYMENT_FAILED'].includes(d.type),
        )
      case 'WALLET':
        return docs.filter((d) =>
          ['EARNINGS_AVAILABLE', 'WITHDRAWAL_STATUS', 'REFUND'].includes(d.type),
        )
      case 'SUPPORT':
        return docs.filter((d) =>
          ['PRODUCT_APPROVED', 'PRODUCT_REJECTED', 'TICKET_REPLY'].includes(d.type),
        )
      case 'ALL':
      default:
        return docs
    }
  }, [docs, activeTab])

  // If there are zero notifications overall, render empty state (matching screenshot & test)
  if (docs.length === 0) {
    return (
      <div className="py-16 px-4 text-center" data-testid="notifications-empty">
        <div className="w-18 h-18 mx-auto mb-4 rounded-full bg-blue-50 border border-blue-100/80 flex items-center justify-center text-[#1677ff] shadow-xs">
          <BellOutlined style={{ fontSize: '32px', color: '#1677ff' }} />
        </div>
        <h3 className="text-base font-bold text-slate-800 mb-1.5">
          Hộp thư thông báo trống
        </h3>
        <p className="text-xs text-slate-500 mb-2 max-w-sm mx-auto">
          Bạn chưa có thông báo nào.
        </p>
        <p className="text-xs text-slate-400 max-w-md mx-auto mb-6 leading-relaxed">
          Khi phát sinh các giao dịch nạp tiền, biến động số dư ví, mua bản vẽ hoặc phản hồi hỗ trợ, thông báo sẽ hiển thị tại đây.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-3">
          <Link href="/shop">
            <Button
              type="primary"
              icon={<ShoppingOutlined />}
              className="!bg-[#1677ff] hover:!bg-blue-600 rounded-lg text-xs font-semibold h-9 px-5 shadow-xs"
            >
              Khám phá bản vẽ & mô hình
            </Button>
          </Link>
          <Link href="/wallet">
            <Button
              icon={<WalletOutlined />}
              className="rounded-lg text-xs font-medium h-9 px-4 border-slate-300 hover:border-slate-400"
            >
              Ví kỹ thuật số
            </Button>
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="flex w-full flex-col gap-6">
      {/* Top Filter & Action Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-2">
        {/* Category Tabs */}
        <div className="overflow-x-auto pb-1 md:pb-0">
          <Segmented<FilterCategory>
            value={activeTab}
            onChange={(val) => setActiveTab(val)}
            options={[
              {
                label: (
                  <span className="inline-flex items-center gap-1.5 px-1 py-0.5">
                    <InboxOutlined />
                    <span>Tất cả</span>
                    <span className="text-xs text-neutral-400">({docs.length})</span>
                  </span>
                ),
                value: 'ALL',
              },
              {
                label: (
                  <span className="inline-flex items-center gap-1.5 px-1 py-0.5">
                    <BellOutlined />
                    <span>Chưa đọc</span>
                    {unreadCount > 0 && (
                      <Badge
                        count={unreadCount}
                        size="small"
                        style={{ backgroundColor: '#1677ff' }}
                      />
                    )}
                  </span>
                ),
                value: 'UNREAD',
              },
              {
                label: (
                  <span className="inline-flex items-center gap-1.5 px-1 py-0.5">
                    <ShoppingOutlined />
                    <span>Đơn hàng</span>
                  </span>
                ),
                value: 'ORDERS',
              },
              {
                label: (
                  <span className="inline-flex items-center gap-1.5 px-1 py-0.5">
                    <WalletOutlined />
                    <span>Ví & Doanh thu</span>
                  </span>
                ),
                value: 'WALLET',
              },
              {
                label: (
                  <span className="inline-flex items-center gap-1.5 px-1 py-0.5">
                    <CustomerServiceOutlined />
                    <span>Hỗ trợ</span>
                  </span>
                ),
                value: 'SUPPORT',
              },
            ]}
            className="p-1 bg-slate-100 rounded-xl"
          />
        </div>

        {/* Counter and Mark All Read */}
        <div className="flex items-center justify-between md:justify-end gap-3 shrink-0">
          <p
            className="text-xs text-slate-400 mb-0"
            data-testid="notifications-unread-count"
          >
            {unreadCount > 0
              ? `Bạn có ${unreadCount} thông báo chưa đọc.`
              : 'Tất cả thông báo đã được đọc.'}
          </p>

          <Button
            type="default"
            size="small"
            icon={<CheckCircleOutlined className="text-slate-500" />}
            onClick={markAllRead}
            disabled={isPending || unreadCount === 0}
            data-testid="mark-all-read"
            className="rounded-xl text-xs font-medium hover:!text-[#1677ff] hover:!border-[#1677ff]"
          >
            Đánh dấu tất cả đã đọc
          </Button>
        </div>
      </div>

      {error ? (
        <div
          className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2"
          role="alert"
          data-testid="notifications-error"
        >
          <ExclamationCircleOutlined className="text-rose-500 shrink-0" />
          <span>{error}</span>
        </div>
      ) : null}

      {/* Filtered Empty State */}
      {filteredDocs.length === 0 ? (
        <div className="py-12 px-4 text-center border border-dashed border-slate-200 rounded-2xl">
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description="Không có thông báo nào trong danh mục này."
          >
            <Button
              type="link"
              onClick={() => setActiveTab('ALL')}
              className="text-[#1677ff] text-xs font-semibold"
            >
              Xem tất cả thông báo
            </Button>
          </Empty>
        </div>
      ) : (
        <ul className="flex flex-col gap-3.5 list-none p-0 m-0" data-testid="notifications-list">
          {filteredDocs.map((doc) => {
            const meta = getNotificationMeta(doc.type)

            return (
              <li
                key={doc.id}
                data-testid="notification-item"
                data-notification-id={doc.id}
                data-read={doc.isRead ? 'true' : 'false'}
                className={clsx(
                  'group relative rounded-2xl border transition-all duration-200 p-5 overflow-hidden',
                  {
                    'bg-white border-slate-200/80 hover:border-slate-300 hover:shadow-2xs':
                      doc.isRead,
                    'bg-gradient-to-r from-blue-50/50 via-white to-white border-blue-200/90 shadow-2xs':
                      !doc.isRead,
                  },
                )}
              >
                {/* Visual Unread Accent Bar */}
                {!doc.isRead && (
                  <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-[#1677ff] rounded-l" />
                )}

                <div className="flex items-start gap-4">
                  {/* Category Icon */}
                  <div
                    className={clsx(
                      'w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border shadow-2xs',
                      meta.avatarBg,
                    )}
                  >
                    {meta.icon}
                  </div>

                  {/* Body Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center justify-between gap-2 mb-1.5">
                      <div className="flex items-center gap-2 min-w-0">
                        {!doc.isRead && (
                          <span
                            aria-hidden="true"
                            className="size-2 rounded-full bg-[#1677ff] shrink-0 animate-pulse"
                            data-testid="notification-unread-dot"
                          />
                        )}
                        <Tag color={meta.tagColor} className="m-0 text-xs font-medium">
                          {meta.label}
                        </Tag>
                        <h2
                          className="text-base font-bold text-slate-900 truncate mb-0"
                          data-testid="notification-title"
                        >
                          {doc.title}
                        </h2>
                      </div>

                      <span
                        className={clsx('text-xs font-semibold px-2.5 py-0.5 rounded-full border', {
                          'bg-blue-50 text-[#1677ff] border-blue-200':
                            !doc.isRead,
                          'bg-slate-100 text-slate-500 border-slate-200':
                            doc.isRead,
                        })}
                        data-testid="notification-read-state"
                      >
                        {doc.isRead ? 'Đã đọc' : 'Chưa đọc'}
                      </span>
                    </div>

                    <p
                      className="text-sm text-slate-600 leading-relaxed break-words mb-0"
                      data-testid="notification-body"
                    >
                      {doc.body}
                    </p>

                    <div className="mt-3.5 pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3">
                      <span
                        className="inline-flex items-center gap-1.5 text-xs text-slate-400"
                        data-testid="notification-date"
                      >
                        <ClockCircleOutlined className="text-xs" />
                        {doc.createdAtLabel}
                      </span>

                      <div className="flex items-center gap-2">
                        {doc.link && (
                          <Link href={doc.link} data-testid="notification-link">
                            <Button
                              type="link"
                              size="small"
                              className="p-0 h-auto font-medium text-[#1677ff] inline-flex items-center gap-1"
                            >
                              <span>Xem chi tiết</span>
                              <ArrowRightOutlined className="text-xs" />
                            </Button>
                          </Link>
                        )}

                        {!doc.isRead && (
                          <Button
                            type="text"
                            size="small"
                            icon={<CheckOutlined className="text-xs text-[#1677ff]" />}
                            onClick={() => markRead(doc.id)}
                            loading={busyId === doc.id}
                            data-testid="mark-read"
                            className="text-xs font-medium text-neutral-600 dark:text-neutral-300 hover:text-[#1677ff] hover:bg-blue-50 dark:hover:bg-blue-950/30"
                          >
                            Đánh dấu đã đọc
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

