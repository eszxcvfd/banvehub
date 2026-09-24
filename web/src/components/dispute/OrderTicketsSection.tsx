'use client'

import React, { useState } from 'react'

// Safe browser environment polyfills for test runners (jsdom)
if (typeof window !== 'undefined') {
  if (!window.matchMedia) {
    window.matchMedia = (query: string) =>
      ({
        matches: false,
        media: query,
        onchange: null,
        addListener: () => {},
        removeListener: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => false,
      }) as any
  }
  if (!window.ResizeObserver) {
    ;(window as any).ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  }
}

import { Card, Button, Tag, Input, Space, Avatar } from 'antd'
import {
  ClockCircleOutlined,
  CheckCircleOutlined,
  QuestionCircleOutlined,
  SendOutlined,
  UserOutlined,
  SafetyCertificateOutlined,
  ShopOutlined,
  CloseCircleOutlined,
} from '@ant-design/icons'
import { formatDateTime } from '@/utilities/formatDateTime'
import { toast } from 'sonner'

export type TicketMessage = {
  id?: string
  sender?: any
  senderRole: 'buyer' | 'seller' | 'admin'
  message: string
  createdAt?: string
}

export type TicketItem = {
  id: number
  code: string
  reason: string
  subject: string
  description: string
  status: 'OPEN' | 'IN_PROGRESS' | 'WAITING_USER' | 'RESOLVED' | 'CLOSED'
  priority: 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT'
  resolution?: string | null
  messages?: TicketMessage[]
  createdAt: string
  updatedAt: string
}

export type OrderTicketsSectionProps = {
  orderId: number
  initialTickets?: TicketItem[]
}

const STATUS_TAG_MAP: Record<
  string,
  { label: string; color: string; icon: React.ReactNode }
> = {
  OPEN: { label: 'Mới mở', color: 'blue', icon: <ClockCircleOutlined /> },
  IN_PROGRESS: { label: 'Đang xử lý', color: 'orange', icon: <ClockCircleOutlined /> },
  WAITING_USER: { label: 'Chờ phản hồi', color: 'purple', icon: <QuestionCircleOutlined /> },
  RESOLVED: { label: 'Đã giải quyết', color: 'green', icon: <CheckCircleOutlined /> },
  CLOSED: { label: 'Đã đóng', color: 'default', icon: <CloseCircleOutlined /> },
}

const REASON_LABELS: Record<string, string> = {
  FILE_CORRUPTED: 'File hỏng không mở được',
  MISLEADING_CONTENT: 'Nội dung không đúng mô tả',
  DOWNLOAD_ERROR: 'Lỗi khi tải file',
  BILLING_DISPUTE: 'Vấn đề thanh toán',
  OTHER: 'Khác',
}

export function OrderTicketsSection({ orderId, initialTickets = [] }: OrderTicketsSectionProps) {
  const [tickets, setTickets] = useState<TicketItem[]>(initialTickets)
  const [activeTicketId, setActiveTicketId] = useState<number | null>(
    initialTickets.length > 0 ? initialTickets[0].id : null,
  )
  const [replyText, setReplyText] = useState('')
  const [isSendingReply, setIsSendingReply] = useState(false)
  const [isClosingTicket, setIsClosingTicket] = useState(false)

  if (tickets.length === 0) {
    return null
  }

  const activeTicket = tickets.find((t) => t.id === activeTicketId) || tickets[0]
  const statusInfo = STATUS_TAG_MAP[activeTicket?.status] || STATUS_TAG_MAP.OPEN

  const handleSendReply = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!replyText.trim() || !activeTicket) return

    setIsSendingReply(true)
    try {
      const res = await fetch(`/api/v1/tickets/${activeTicket.id}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: replyText.trim() }),
      })

      const data = await res.json()
      if (!res.ok || !data.success) {
        throw new Error(data.message || 'Không thể gửi phản hồi.')
      }

      const updated = data.ticket
      setTickets((prev) => prev.map((t) => (t.id === updated.id ? updated : t)))
      setReplyText('')
      toast.success('Đã gửi phản hồi thành công!')
    } catch (err: any) {
      toast.error('Lỗi khi gửi phản hồi', { description: err.message })
    } finally {
      setIsSendingReply(false)
    }
  }

  const handleCloseTicket = async () => {
    if (!activeTicket) return
    setIsClosingTicket(true)
    try {
      const res = await fetch(`/api/v1/tickets/${activeTicket.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'CLOSED' }),
      })

      const data = await res.json()
      if (!res.ok || !data.success) {
        throw new Error(data.message || 'Không thể đóng khiếu nại.')
      }

      const updated = data.ticket
      setTickets((prev) => prev.map((t) => (t.id === updated.id ? updated : t)))
      toast.success('Đã đóng khiếu nại!')
    } catch (err: any) {
      toast.error('Lỗi khi đóng khiếu nại', { description: err.message })
    } finally {
      setIsClosingTicket(false)
    }
  }

  return (
    <Card
      className="shadow-sm"
      style={{ borderRadius: 12 }}
      title={
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <span className="font-bold text-neutral-900 dark:text-neutral-100">Phiếu hỗ trợ / Khiếu nại</span>
            <Tag color="blue">{tickets.length}</Tag>
          </div>

          {tickets.length > 1 && (
            <Space size="small" wrap>
              {tickets.map((t) => (
                <Button
                  key={t.id}
                  size="small"
                  type={t.id === activeTicket.id ? 'primary' : 'default'}
                  onClick={() => setActiveTicketId(t.id)}
                  className="font-mono text-xs"
                >
                  {t.code}
                </Button>
              ))}
            </Space>
          )}
        </div>
      }
    >
      <div className="space-y-6">
        {/* Ticket Header Metadata */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-neutral-100 dark:border-neutral-800">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="font-mono font-bold text-sm text-neutral-900 dark:text-neutral-100">{activeTicket.code}</span>
              <Tag color={statusInfo.color} icon={statusInfo.icon}>
                {statusInfo.label}
              </Tag>
              <Tag>{REASON_LABELS[activeTicket.reason] || activeTicket.reason}</Tag>
            </div>
            <h4 className="font-semibold text-base text-neutral-900 dark:text-neutral-100 mt-1">{activeTicket.subject}</h4>
          </div>

          {activeTicket.status !== 'CLOSED' && (
            <Button
              size="small"
              danger
              loading={isClosingTicket}
              onClick={handleCloseTicket}
            >
              Đóng khiếu nại này
            </Button>
          )}
        </div>

        {/* Message Thread */}
        <div className="space-y-4 max-h-96 overflow-y-auto pr-1">
          {/* Follow-up messages */}
          {(activeTicket.messages || []).map((msg, idx) => {
            const isBuyer = msg.senderRole === 'buyer'
            const isAdmin = msg.senderRole === 'admin'
            return (
              <div
                key={msg.id || idx}
                className={`p-4 rounded-lg space-y-2 border ${
                  isBuyer
                    ? 'bg-neutral-50 dark:bg-neutral-800/30 border-neutral-200 dark:border-neutral-700 ml-0 mr-4'
                    : isAdmin
                    ? 'bg-blue-50 dark:bg-blue-950/30 border-blue-200 mr-4'
                    : 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 mr-4'
                }`}
              >
                <div className="flex items-center justify-between text-xs text-neutral-500">
                  <span className="font-semibold text-neutral-900 dark:text-neutral-100 flex items-center gap-1.5">
                    <Avatar
                      size={20}
                      icon={
                        isAdmin ? (
                          <SafetyCertificateOutlined />
                        ) : isBuyer ? (
                          <UserOutlined />
                        ) : (
                          <ShopOutlined />
                        )
                      }
                      className={
                        isAdmin ? 'bg-blue-600' : isBuyer ? 'bg-[#1677ff]' : 'bg-emerald-600'
                      }
                    />
                    {isBuyer ? 'Người mua (Bạn)' : isAdmin ? 'Quản trị viên' : 'Người bán'}
                  </span>
                  {msg.createdAt && (
                    <time dateTime={msg.createdAt}>
                      {formatDateTime({ date: msg.createdAt, format: 'dd/MM/yyyy HH:mm' })}
                    </time>
                  )}
                </div>
                <p className="text-sm text-neutral-800 dark:text-neutral-200 whitespace-pre-wrap">{msg.message}</p>
              </div>
            )
          })}
        </div>

        {/* Reply Form */}
        {activeTicket.status !== 'CLOSED' ? (
          <form onSubmit={handleSendReply} className="space-y-3 pt-3 border-t border-neutral-100 dark:border-neutral-800">
            <Input.TextArea
              rows={3}
              placeholder="Nhập nội dung phản hồi của bạn..."
              value={replyText}
              onChange={(e) => setReplyText(e.target.value)}
              disabled={isSendingReply}
            />
            <div className="flex justify-end">
              <Button
                type="primary"
                htmlType="submit"
                icon={<SendOutlined />}
                loading={isSendingReply}
                disabled={!replyText.trim()}
                className="!bg-[#1677ff]"
              >
                Gửi tin nhắn
              </Button>
            </div>
          </form>
        ) : (
          <div className="py-3 text-center text-xs text-neutral-500 bg-neutral-50 dark:bg-neutral-800/20 rounded border border-neutral-200 dark:border-neutral-700">
            Khiếu nại này đã được đóng.
          </div>
        )}
      </div>
    </Card>
  )
}
