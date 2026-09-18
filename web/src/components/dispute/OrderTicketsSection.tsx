'use client'

import React, { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { formatDateTime } from '@/utilities/formatDateTime'
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  HelpCircle,
  Loader2,
  MessageSquare,
  Send,
  User,
  Shield,
  Store,
} from 'lucide-react'
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

const STATUS_CONFIG: Record<
  string,
  { label: string; className: string; icon: React.ComponentType<{ className?: string }> }
> = {
  OPEN: {
    label: 'Mới mở',
    className: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300 border-blue-200',
    icon: Clock,
  },
  IN_PROGRESS: {
    label: 'Đang xử lý',
    className: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300 border-amber-200',
    icon: Clock,
  },
  WAITING_USER: {
    label: 'Chờ phản hồi',
    className: 'bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300 border-purple-200',
    icon: HelpCircle,
  },
  RESOLVED: {
    label: 'Đã giải quyết',
    className: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300 border-emerald-200',
    icon: CheckCircle2,
  },
  CLOSED: {
    label: 'Đã đóng',
    className: 'bg-slate-100 text-slate-800 dark:bg-slate-800/60 dark:text-slate-300 border-slate-200',
    icon: CheckCircle2,
  },
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
  const statusInfo = STATUS_CONFIG[activeTicket?.status] || STATUS_CONFIG.OPEN
  const StatusIcon = statusInfo.icon

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

      // Update ticket in local state
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
    <div className="border rounded-xl p-6 bg-card flex flex-col gap-6 shadow-sm">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b pb-4">
        <div>
          <h2 className="text-base font-semibold flex items-center gap-2">
            <MessageSquare className="w-5 h-5 text-primary" />
            Lịch sử khiếu nại & Hỗ trợ ({tickets.length})
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Theo dõi trao đổi với người bán và ban quản trị về đơn hàng #{orderId}
          </p>
        </div>

        {tickets.length > 1 && (
          <div className="flex gap-2">
            {tickets.map((t) => (
              <Button
                key={t.id}
                variant={t.id === activeTicket.id ? 'default' : 'outline'}
                size="sm"
                onClick={() => setActiveTicketId(t.id)}
                className="text-xs font-mono"
              >
                {t.code}
              </Button>
            ))}
          </div>
        )}
      </div>

      {activeTicket && (
        <div className="space-y-6">
          {/* Ticket Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-muted/40 p-4 rounded-lg">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="font-mono text-sm font-bold">{activeTicket.code}</span>
                <span
                  className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium border ${statusInfo.className}`}
                >
                  <StatusIcon className="w-3 h-3" />
                  {statusInfo.label}
                </span>
                <span className="text-xs text-muted-foreground bg-background px-2 py-0.5 rounded border">
                  {REASON_LABELS[activeTicket.reason] || activeTicket.reason}
                </span>
              </div>
              <h3 className="text-sm font-semibold pt-1">{activeTicket.subject}</h3>
            </div>

            {activeTicket.status !== 'CLOSED' && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleCloseTicket}
                disabled={isClosingTicket}
                className="text-xs text-muted-foreground hover:text-foreground self-start sm:self-auto"
              >
                {isClosingTicket ? 'Đang xử lý...' : 'Đóng khiếu nại này'}
              </Button>
            )}
          </div>

          {/* Conversation Thread */}
          <div className="space-y-4">
            <h4 className="text-xs uppercase font-semibold text-muted-foreground tracking-wider">
              Hội thoại trao đổi
            </h4>

            <div className="flex flex-col gap-3 max-h-96 overflow-y-auto pr-1">
              {(activeTicket.messages || []).map((msg, idx) => {
                const isBuyer = msg.senderRole === 'buyer'
                const isAdmin = msg.senderRole === 'admin'
                const isSeller = msg.senderRole === 'seller'

                return (
                  <div
                    key={msg.id || idx}
                    className={`flex flex-col p-3.5 rounded-lg border text-sm ${
                      isBuyer
                        ? 'bg-background border-border ml-0 mr-4'
                        : isAdmin
                          ? 'bg-blue-50/50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-900 ml-4 mr-0'
                          : 'bg-amber-50/50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-900 ml-4 mr-0'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2 mb-1.5 text-xs text-muted-foreground">
                      <div className="flex items-center gap-1.5 font-medium">
                        {isBuyer && (
                          <span className="inline-flex items-center gap-1 text-foreground">
                            <User className="w-3.5 h-3.5" />
                            Người mua (Bạn)
                          </span>
                        )}
                        {isSeller && (
                          <span className="inline-flex items-center gap-1 text-amber-700 dark:text-amber-400">
                            <Store className="w-3.5 h-3.5" />
                            Người bán
                          </span>
                        )}
                        {isAdmin && (
                          <span className="inline-flex items-center gap-1 text-blue-700 dark:text-blue-400">
                            <Shield className="w-3.5 h-3.5" />
                            Ban quản trị KienTaoHub
                          </span>
                        )}
                      </div>

                      {msg.createdAt && (
                        <time dateTime={msg.createdAt} className="text-muted-foreground text-xs">
                          {formatDateTime({ date: msg.createdAt, format: 'dd/MM/yyyy HH:mm' })}
                        </time>
                      )}
                    </div>

                    <p className="whitespace-pre-wrap leading-relaxed text-foreground text-xs sm:text-sm">
                      {msg.message}
                    </p>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Reply Form */}
          {activeTicket.status !== 'CLOSED' ? (
            <form onSubmit={handleSendReply} className="space-y-3 pt-2 border-t">
              <label htmlFor="ticket-reply" className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block">
                Gửi phản hồi mới
              </label>
              <div className="flex gap-2">
                <Textarea
                  id="ticket-reply"
                  rows={2}
                  placeholder="Nhập nội dung phản hồi, thông tin bổ sung cho người bán hoặc admin..."
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  className="text-sm"
                  required
                />
              </div>
              <div className="flex justify-end">
                <Button
                  type="submit"
                  size="sm"
                  disabled={isSendingReply || !replyText.trim()}
                  className="flex items-center gap-1.5"
                >
                  {isSendingReply ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      Đang gửi...
                    </>
                  ) : (
                    <>
                      <Send className="w-3.5 h-3.5" />
                      Gửi tin nhắn
                    </>
                  )}
                </Button>
              </div>
            </form>
          ) : (
            <div className="p-3 bg-muted/60 text-center rounded-lg text-xs text-muted-foreground border">
              Khiếu nại này đã được đóng. Nếu bạn vẫn gặp sự cố, vui lòng tạo khiếu nại mới.
            </div>
          )}
        </div>
      )}
    </div>
  )
}
