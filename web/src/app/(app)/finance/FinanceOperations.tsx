'use client'

import React, { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export interface AdminWithdrawalItem {
  id: number
  code: string
  amount: number
  currency?: string
  status: string
  bankInfo?: {
    bankName?: string
    accountNumber?: string
    accountHolderName?: string
  } | null
  seller?: {
    id: number
    name?: string
    email?: string
  } | number | null
  requestedAt?: string
  reviewedAt?: string
  paidAt?: string
  rejectionReason?: string
  notes?: string
}

export interface AdminRefundItem {
  id: number
  code: string
  order?: { id: number; orderCode?: string } | number | null
  orderItem?: { id: number } | number | null
  buyer?: { id: number; name?: string; email?: string } | number | null
  seller?: { id: number; name?: string; email?: string } | number | null
  amount: number
  platformFeeRefunded: number
  sellerAmountRefunded: number
  reason: string
  status: string
  processedBy?: { id: number; name?: string; email?: string } | number | null
  createdAt: string
}

/**
 * The refund window state of one order, evaluated server-side in `page.tsx` by the same
 * `evaluateRefundWindow` the refund route enforces (Decision 0012 §6, measured from
 * `orders.paidAt`). `inWindow === null` means the console cannot judge this order — it is not in
 * the recent-order list — so the operator may submit, and the route's refusal is what tells them
 * (and the message is surfaced, never swallowed).
 */
export interface AdminOrderWindowItem {
  id: number
  code: string
  status: string
  totalAmount: number
  paidAt?: string | null
  inWindow: boolean | null
  windowClosesAt?: string | null
}

export type RefundFaultBasis = 'SELLER' | 'PLATFORM'

interface Props {
  initialWithdrawals: AdminWithdrawalItem[]
  initialRefunds: AdminRefundItem[]
  initialOrders?: AdminOrderWindowItem[]
  refundWindowDays?: number
}

export function FinanceOperations({
  initialWithdrawals,
  initialRefunds,
  initialOrders = [],
  refundWindowDays = 5,
}: Props) {
  const router = useRouter()
  const [activeTab, setActiveTab] = useState<'withdrawals' | 'refunds'>('withdrawals')
  const [withdrawals, setWithdrawals] = useState<AdminWithdrawalItem[]>(initialWithdrawals)
  const [refunds, setRefunds] = useState<AdminRefundItem[]>(initialRefunds)
  const [statusFilter, setStatusFilter] = useState<string>('ALL')

  // Modals state
  const [rejectModalWithdrawal, setRejectModalWithdrawal] = useState<AdminWithdrawalItem | null>(null)
  const [rejectReason, setRejectReason] = useState('')
  const [approveModalWithdrawal, setApproveModalWithdrawal] = useState<AdminWithdrawalItem | null>(null)
  const [approveNotes, setApproveNotes] = useState('')
  const [isRefundModalOpen, setIsRefundModalOpen] = useState(false)
  const [refundOrderId, setRefundOrderId] = useState('')
  const [refundReason, setRefundReason] = useState('')
  const [refundRevokeEntitlement, setRefundRevokeEntitlement] = useState(true)
  // Decision 0012 §7: the fault basis is not a default — the operator must choose who bears the
  // cost, because that choice decides the money (seller fault reverses the earning; platform fault
  // leaves it maturing and the platform absorbs it).
  const [refundFaultBasis, setRefundFaultBasis] = useState<RefundFaultBasis | ''>('')
  // Decision 0012 §6: an out-of-window refund is only allowed with this explicit, recorded override.
  const [refundOverrideWindow, setRefundOverrideWindow] = useState(false)
  const [refundWindowRefused, setRefundWindowRefused] = useState(false)

  // Loading & error
  const [actionLoading, setActionLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)

  const clearNotifications = () => {
    setError(null)
    setSuccessMessage(null)
  }

  // 1. Review
  const handleReview = async (id: number) => {
    clearNotifications()
    setActionLoading(true)
    try {
      const res = await fetch(`/api/v1/admin/withdrawals/${id}/review`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.message || data.error || 'Thẩm định thất bại.')

      setWithdrawals((prev) =>
        prev.map((w) => (w.id === id ? { ...w, status: 'UNDER_REVIEW' } : w)),
      )
      setSuccessMessage(`Yêu cầu #${id} đã chuyển sang trạng thái thẩm định (UNDER_REVIEW).`)
      router.refresh()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Có lỗi xảy ra.')
    } finally {
      setActionLoading(false)
    }
  }

  // 2. Approve
  const handleApproveSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!approveModalWithdrawal) return
    clearNotifications()
    setActionLoading(true)
    try {
      const res = await fetch(`/api/v1/admin/withdrawals/${approveModalWithdrawal.id}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes: approveNotes.trim() || undefined }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.message || data.error || 'Phê duyệt thất bại.')

      setWithdrawals((prev) =>
        prev.map((w) =>
          w.id === approveModalWithdrawal.id
            ? { ...w, status: 'APPROVED', notes: approveNotes.trim() }
            : w,
        ),
      )
      setSuccessMessage(`Đã phê duyệt yêu cầu ${approveModalWithdrawal.code}!`)
      setApproveModalWithdrawal(null)
      setApproveNotes('')
      router.refresh()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Có lỗi xảy ra khi phê duyệt.')
    } finally {
      setActionLoading(false)
    }
  }

  // 3. Reject
  const handleRejectSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!rejectModalWithdrawal) return
    if (!rejectReason.trim()) {
      setError('Vui lòng nhập lý do từ chối yêu cầu rút tiền.')
      return
    }
    clearNotifications()
    setActionLoading(true)
    try {
      const res = await fetch(`/api/v1/admin/withdrawals/${rejectModalWithdrawal.id}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: rejectReason.trim() }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.message || data.error || 'Từ chối thất bại.')

      setWithdrawals((prev) =>
        prev.map((w) =>
          w.id === rejectModalWithdrawal.id
            ? { ...w, status: 'REJECTED', rejectionReason: rejectReason.trim() }
            : w,
        ),
      )
      setSuccessMessage(`Đã từ chối yêu cầu ${rejectModalWithdrawal.code}. Số dư đã hoàn lại cho người bán.`)
      setRejectModalWithdrawal(null)
      setRejectReason('')
      router.refresh()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Có lỗi xảy ra khi từ chối.')
    } finally {
      setActionLoading(false)
    }
  }

  // 4. Process (Đang chuyển khoản)
  const handleProcess = async (id: number) => {
    clearNotifications()
    setActionLoading(true)
    try {
      const res = await fetch(`/api/v1/admin/withdrawals/${id}/process`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.message || data.error || 'Không thể chuyển trạng thái xử lý.')

      setWithdrawals((prev) =>
        prev.map((w) => (w.id === id ? { ...w, status: 'PROCESSING' } : w)),
      )
      setSuccessMessage(`Yêu cầu #${id} đang được thực hiện chuyển tiền (PROCESSING).`)
      router.refresh()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Có lỗi xảy ra.')
    } finally {
      setActionLoading(false)
    }
  }

  // 5. Finalize Paid (Đã hoàn tất thanh toán)
  const handleFinalize = async (id: number) => {
    if (!confirm('Xác nhận đã chuyển khoản thành công và hoàn tất giao dịch rút tiền này?')) {
      return
    }
    clearNotifications()
    setActionLoading(true)
    try {
      const res = await fetch(`/api/v1/admin/withdrawals/${id}/finalize`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.message || data.error || 'Không thể hoàn tất thanh toán.')

      setWithdrawals((prev) =>
        prev.map((w) => (w.id === id ? { ...w, status: 'PAID', paidAt: new Date().toISOString() } : w)),
      )
      setSuccessMessage(`Yêu cầu #${id} đã được ghi nhận hoàn tất chi trả (PAID).`)
      router.refresh()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Có lỗi xảy ra.')
    } finally {
      setActionLoading(false)
    }
  }

  // 6. Process Refund
  //
  // The route (`/api/v1/admin/refunds`) requires a fault basis and, for an order outside the
  // Decision 0012 §6 window, an explicit `overrideWindow`. This action therefore states the basis,
  // states the window, and surfaces every refusal the route returns as a message the operator can
  // act on — an out-of-window refusal re-opens the override checkbox instead of dead-ending.
  const orderWindowOf = (rawOrderId: string): AdminOrderWindowItem | null => {
    const parsed = parseInt(rawOrderId, 10)
    if (isNaN(parsed) || parsed <= 0) return null
    return initialOrders.find((order) => order.id === parsed) ?? null
  }

  const selectedOrderWindow = orderWindowOf(refundOrderId)
  // Three verdicts, not two: a row the console rendered while the order was not COMPLETED carries
  // `inWindow: null` (the server cannot judge it), exactly like an order that is not in the list at
  // all. Only an explicit `false` means "outside the window".
  const windowVerdict: 'IN' | 'OUT' | 'UNKNOWN' =
    selectedOrderWindow && selectedOrderWindow.inWindow !== null
      ? selectedOrderWindow.inWindow
        ? 'IN'
        : 'OUT'
      : 'UNKNOWN'
  // Known to be outside the window: the override is mandatory before this action may be submitted.
  const isKnownOutOfWindow = windowVerdict === 'OUT'

  const refundBlockedReason = (() => {
    if (!refundFaultBasis) return 'Vui lòng chọn cơ sở lỗi (lỗi người bán hoặc lỗi hệ thống).'
    if (isKnownOutOfWindow && !refundOverrideWindow) {
      return `Đơn hàng đã quá ${refundWindowDays} ngày kể từ thời điểm thanh toán: hoàn tiền ngoài chính sách, cần bật xác nhận ghi đè.`
    }
    return null
  })()

  const handleRefundSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    clearNotifications()

    const orderIdNum = parseInt(refundOrderId, 10)
    if (isNaN(orderIdNum) || orderIdNum <= 0) {
      setError('Mã đơn hàng (Order ID) phải là số hợp lệ.')
      return
    }

    if (!refundReason.trim()) {
      setError('Vui lòng nhập lý do hoàn tiền bồi hoàn.')
      return
    }

    // Decision 0012 §7: no refund may be submitted without stating who bore the cost.
    if (!refundFaultBasis) {
      setError('Vui lòng chọn cơ sở lỗi (lỗi người bán hoặc lỗi hệ thống).')
      return
    }

    // Decision 0012 §6: an order the console knows to be past the window needs the explicit
    // override, so the operator never sends it as an ordinary refund.
    if (isKnownOutOfWindow && !refundOverrideWindow) {
      setError(
        `Đơn hàng đã quá ${refundWindowDays} ngày kể từ thời điểm thanh toán. Hoàn tiền ngoài chính sách chỉ được thực hiện khi bật xác nhận ghi đè.`,
      )
      return
    }

    setActionLoading(true)
    try {
      const res = await fetch('/api/v1/admin/refunds', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderId: orderIdNum,
          reason: refundReason.trim(),
          faultBasis: refundFaultBasis,
          // Only an explicit operator acknowledgement is ever sent; the route refuses a
          // non-boolean value rather than coercing it.
          overrideWindow: refundOverrideWindow ? true : undefined,
          revokeEntitlement: refundRevokeEntitlement,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        const message = data.message || data.error || 'Thực hiện hoàn tiền thất bại.'
        // The order turned out to be out of window (the console could not know it, e.g. the list
        // was loaded before the window closed): make the override available instead of leaving the
        // operator with a dead button.
        if (/cửa sổ|window/i.test(String(message)) && !refundOverrideWindow) {
          setRefundWindowRefused(true)
        }
        throw new Error(message)
      }

      setSuccessMessage(
        `Đã thực hiện bồi hoàn đơn hàng #${orderIdNum} thành công (cơ sở lỗi: ${
          refundFaultBasis === 'SELLER' ? 'lỗi người bán' : 'lỗi hệ thống'
        }).`,
      )
      setIsRefundModalOpen(false)
      setRefundOrderId('')
      setRefundReason('')
      setRefundRevokeEntitlement(true)
      setRefundFaultBasis('')
      setRefundOverrideWindow(false)
      setRefundWindowRefused(false)

      // Refresh refunds list
      const refundsRes = await fetch('/api/v1/admin/refunds')
      if (refundsRes.ok) {
        const refundsData = await refundsRes.json()
        if (refundsData.docs) setRefunds(refundsData.docs)
      }
      router.refresh()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Lỗi khi xử lý hoàn tiền.')
    } finally {
      setActionLoading(false)
    }
  }

  const filteredWithdrawals =
    statusFilter === 'ALL'
      ? withdrawals
      : withdrawals.filter((w) => w.status === statusFilter)

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'REQUESTED':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-blue-500/10 text-blue-600 border border-blue-500/20">
            Yêu cầu mới
          </span>
        )
      case 'UNDER_REVIEW':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-600 border border-amber-500/20">
            Đang thẩm định
          </span>
        )
      case 'APPROVED':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-indigo-500/10 text-indigo-600 border border-indigo-500/20">
            Đã duyệt chi
          </span>
        )
      case 'PROCESSING':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-purple-500/10 text-purple-600 border border-purple-500/20">
            Đang chuyển tiền
          </span>
        )
      case 'PAID':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-600 border border-emerald-500/20">
            Đã thanh toán
          </span>
        )
      case 'REJECTED':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-rose-500/10 text-rose-600 border border-rose-500/20">
            Từ chối
          </span>
        )
      case 'CANCELLED':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-zinc-500/10 text-zinc-600 border border-zinc-500/20">
            Người bán hủy
          </span>
        )
      default:
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-secondary text-secondary-foreground border">
            {status}
          </span>
        )
    }
  }

  const getSellerDisplay = (seller: AdminWithdrawalItem['seller']) => {
    if (!seller) return 'N/A'
    if (typeof seller === 'object') {
      return seller.name || seller.email || `User #${seller.id}`
    }
    return `User #${seller}`
  }

  return (
    <div className="space-y-6">
      {/* Notifications */}
      {error && (
        <div className="p-4 rounded-xl bg-destructive/10 text-destructive border border-destructive/20 text-sm font-medium flex items-center justify-between">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="text-xs font-semibold hover:underline">
            Đóng
          </button>
        </div>
      )}

      {successMessage && (
        <div className="p-4 rounded-xl bg-emerald-500/10 text-emerald-600 border border-emerald-500/20 text-sm font-medium flex items-center justify-between">
          <span>{successMessage}</span>
          <button onClick={() => setSuccessMessage(null)} className="text-xs font-semibold hover:underline">
            Đóng
          </button>
        </div>
      )}

      {/* Navigation Tabs */}
      <div className="flex items-center justify-between border-b pb-2">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setActiveTab('withdrawals')}
            className={`px-4 py-2 font-semibold text-sm rounded-lg transition-colors ${
              activeTab === 'withdrawals'
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
            }`}
          >
            Hàng đợi rút tiền ({withdrawals.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('refunds')}
            className={`px-4 py-2 font-semibold text-sm rounded-lg transition-colors ${
              activeTab === 'refunds'
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
            }`}
          >
            Lịch sử bồi hoàn & hoàn tiền ({refunds.length})
          </button>
        </div>

        {activeTab === 'refunds' && (
          <Button
            onClick={() => {
              // A fresh decision every time the modal opens: no basis, no override, no stale
              // window verdict from a previous order.
              setRefundFaultBasis('')
              setRefundOverrideWindow(false)
              setRefundWindowRefused(false)
              clearNotifications()
              setIsRefundModalOpen(true)
            }}
            size="sm"
            className="bg-rose-600 hover:bg-rose-700 text-white font-semibold shadow-sm"
          >
            <svg className="w-4 h-4 mr-1.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Thực hiện hoàn tiền bồi hoàn
          </Button>
        )}
      </div>

      {/* Tab 1: Withdrawal Queue */}
      {activeTab === 'withdrawals' && (
        <div className="space-y-4">
          {/* Status Filters */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-xs font-semibold text-muted-foreground mr-1">Bộ lọc:</span>
            {[
              { label: 'Tất cả', value: 'ALL' },
              { label: 'Yêu cầu mới', value: 'REQUESTED' },
              { label: 'Đang thẩm định', value: 'UNDER_REVIEW' },
              { label: 'Đã duyệt', value: 'APPROVED' },
              { label: 'Đang chuyển tiền', value: 'PROCESSING' },
              { label: 'Đã thanh toán', value: 'PAID' },
              { label: 'Từ chối', value: 'REJECTED' },
              { label: 'Đã hủy', value: 'CANCELLED' },
            ].map((f) => (
              <button
                key={f.value}
                type="button"
                onClick={() => setStatusFilter(f.value)}
                className={`text-xs px-3 py-1.5 rounded-full font-medium transition-colors ${
                  statusFilter === f.value
                    ? 'bg-foreground text-background shadow-xs'
                    : 'bg-muted/60 text-muted-foreground hover:text-foreground'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          {/* Table */}
          <div className="border rounded-xl bg-card shadow-sm overflow-hidden">
            {filteredWithdrawals.length === 0 ? (
              <div className="py-16 text-center text-muted-foreground text-sm">
                Không có yêu cầu rút tiền nào phù hợp với bộ lọc.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="border-b bg-muted/40 text-muted-foreground font-medium text-xs uppercase tracking-wider">
                    <tr>
                      <th className="py-3.5 px-4">Mã GD</th>
                      <th className="py-3.5 px-4">Người bán</th>
                      <th className="py-3.5 px-4">Số tiền</th>
                      <th className="py-3.5 px-4">Tài khoản ngân hàng</th>
                      <th className="py-3.5 px-4">Trạng thái</th>
                      <th className="py-3.5 px-4">Thời gian</th>
                      <th className="py-3.5 px-4 text-right">Hành động nghiệp vụ</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {filteredWithdrawals.map((w) => {
                      const formattedDate = w.requestedAt
                        ? new Date(w.requestedAt).toLocaleString('vi-VN')
                        : '—'

                      return (
                        <tr key={w.id} className="hover:bg-muted/30 transition-colors">
                          <td className="py-4 px-4 font-mono text-xs font-semibold text-foreground">
                            {w.code}
                          </td>
                          <td className="py-4 px-4 font-medium text-foreground text-xs">
                            {getSellerDisplay(w.seller)}
                          </td>
                          <td className="py-4 px-4 font-bold text-foreground">
                            {Number(w.amount).toLocaleString('vi-VN')} ₫
                          </td>
                          <td className="py-4 px-4 text-xs">
                            {w.bankInfo ? (
                              <div>
                                <div className="font-semibold text-foreground">{w.bankInfo.bankName}</div>
                                <div className="font-mono text-muted-foreground">
                                  {w.bankInfo.accountNumber} • {w.bankInfo.accountHolderName}
                                </div>
                              </div>
                            ) : (
                              <span className="text-muted-foreground italic">Không có</span>
                            )}
                          </td>
                          <td className="py-4 px-4">{getStatusBadge(w.status)}</td>
                          <td className="py-4 px-4 text-xs text-muted-foreground">{formattedDate}</td>
                          <td className="py-4 px-4 text-right">
                            <div className="flex items-center justify-end gap-1.5 flex-wrap">
                              {/* 1. Review button for REQUESTED */}
                              {w.status === 'REQUESTED' && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  disabled={actionLoading}
                                  onClick={() => handleReview(w.id)}
                                  className="text-xs text-amber-600 border-amber-500/20 hover:bg-amber-500/10"
                                >
                                  Tiếp nhận thẩm định
                                </Button>
                              )}

                              {/* 2. Approve button for REQUESTED or UNDER_REVIEW */}
                              {(w.status === 'REQUESTED' || w.status === 'UNDER_REVIEW') && (
                                <Button
                                  size="sm"
                                  disabled={actionLoading}
                                  onClick={() => {
                                    setApproveModalWithdrawal(w)
                                    setApproveNotes('')
                                  }}
                                  className="text-xs bg-indigo-600 hover:bg-indigo-700 text-white font-semibold"
                                >
                                  Phê duyệt
                                </Button>
                              )}

                              {/* 3. Process button for APPROVED */}
                              {w.status === 'APPROVED' && (
                                <Button
                                  size="sm"
                                  disabled={actionLoading}
                                  onClick={() => handleProcess(w.id)}
                                  className="text-xs bg-purple-600 hover:bg-purple-700 text-white font-semibold"
                                >
                                  Đang chuyển khoản
                                </Button>
                              )}

                              {/* 4. Finalize button for PROCESSING or APPROVED */}
                              {(w.status === 'PROCESSING' || w.status === 'APPROVED') && (
                                <Button
                                  size="sm"
                                  disabled={actionLoading}
                                  onClick={() => handleFinalize(w.id)}
                                  className="text-xs bg-emerald-600 hover:bg-emerald-700 text-white font-semibold"
                                >
                                  Đã hoàn tất thanh toán
                                </Button>
                              )}

                              {/* 5. Reject button for non-terminal statuses */}
                              {['REQUESTED', 'UNDER_REVIEW', 'APPROVED', 'PROCESSING'].includes(w.status) && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  disabled={actionLoading}
                                  onClick={() => {
                                    setRejectModalWithdrawal(w)
                                    setRejectReason('')
                                  }}
                                  className="text-xs text-rose-600 border-rose-500/20 hover:bg-rose-500/10"
                                >
                                  Từ chối
                                </Button>
                              )}

                              {w.status === 'PAID' && (
                                <span className="text-xs text-emerald-600 font-semibold">
                                  ✓ Hoàn tất
                                </span>
                              )}

                              {w.status === 'REJECTED' && (
                                <span className="text-xs text-rose-600 italic" title={w.rejectionReason}>
                                  Lý do: {w.rejectionReason || 'Không có'}
                                </span>
                              )}

                              {w.status === 'CANCELLED' && (
                                <span className="text-xs text-muted-foreground italic">
                                  Người bán đã hủy
                                </span>
                              )}
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tab 2: Refunds & Reversals */}
      {activeTab === 'refunds' && (
        <div className="space-y-4">
          <div className="border rounded-xl bg-card shadow-sm overflow-hidden">
            <div className="p-5 border-b flex items-center justify-between bg-muted/20">
              <div>
                <h3 className="text-base font-bold text-foreground">Sổ cái hoàn tiền & Bút toán bù trừ (Compensating Ledger)</h3>
                <p className="text-xs text-muted-foreground">
                  Lịch sử các giao dịch hoàn tiền bồi hoàn tuân thủ nguyên tắc bất biến (BR-03, Decision 0002)
                </p>
              </div>
              <span className="text-xs text-muted-foreground">{refunds.length} bản ghi</span>
            </div>

            {refunds.length === 0 ? (
              <div className="py-16 text-center text-muted-foreground text-sm">
                Chưa có giao dịch hoàn tiền nào được thực hiện.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="border-b bg-muted/40 text-muted-foreground font-medium text-xs uppercase tracking-wider">
                    <tr>
                      <th className="py-3.5 px-4">Mã hoàn tiền</th>
                      <th className="py-3.5 px-4">Đơn hàng gốc</th>
                      <th className="py-3.5 px-4 text-right">Hoàn người mua</th>
                      <th className="py-3.5 px-4 text-right">Phí sàn hoàn</th>
                      <th className="py-3.5 px-4 text-right">Thu nhập seller đảo ngược</th>
                      <th className="py-3.5 px-4">Lý do bồi hoàn</th>
                      <th className="py-3.5 px-4">Người thực hiện</th>
                      <th className="py-3.5 px-4">Thời gian</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {refunds.map((ref) => {
                      const orderCode =
                        typeof ref.order === 'object' && ref.order !== null
                          ? ref.order.orderCode || `#${ref.order.id}`
                          : `#${ref.order}`
                      const processedByName =
                        typeof ref.processedBy === 'object' && ref.processedBy !== null
                          ? ref.processedBy.name || ref.processedBy.email || `User #${ref.processedBy.id}`
                          : ref.processedBy
                          ? `User #${ref.processedBy}`
                          : 'Hệ thống'

                      return (
                        <tr key={ref.id} className="hover:bg-muted/30 transition-colors">
                          <td className="py-4 px-4 font-mono text-xs font-semibold text-foreground">
                            {ref.code}
                          </td>
                          <td className="py-4 px-4 font-semibold text-primary text-xs">
                            {orderCode}
                          </td>
                          <td className="py-4 px-4 text-right font-bold text-emerald-600">
                            +{Number(ref.amount).toLocaleString('vi-VN')} ₫
                          </td>
                          <td className="py-4 px-4 text-right text-xs text-muted-foreground">
                            -{Number(ref.platformFeeRefunded).toLocaleString('vi-VN')} ₫
                          </td>
                          <td className="py-4 px-4 text-right font-semibold text-rose-600">
                            -{Number(ref.sellerAmountRefunded).toLocaleString('vi-VN')} ₫
                          </td>
                          <td className="py-4 px-4 text-xs max-w-xs truncate" title={ref.reason}>
                            {ref.reason}
                          </td>
                          <td className="py-4 px-4 text-xs text-muted-foreground">
                            {processedByName}
                          </td>
                          <td className="py-4 px-4 text-xs text-muted-foreground">
                            {new Date(ref.createdAt).toLocaleString('vi-VN')}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modal: Approve Withdrawal */}
      {approveModalWithdrawal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-card border rounded-xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <h3 className="text-lg font-bold text-foreground">Phê duyệt yêu cầu rút tiền</h3>
            <p className="text-xs text-muted-foreground">
              Mã giao dịch:{' '}
              <span className="font-mono font-bold text-foreground">{approveModalWithdrawal.code}</span> • Số
              tiền:{' '}
              <span className="font-bold text-emerald-600">
                {Number(approveModalWithdrawal.amount).toLocaleString('vi-VN')} ₫
              </span>
            </p>

            <form onSubmit={handleApproveSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="approveNotes">Ghi chú phê duyệt (Tùy chọn)</Label>
                <Input
                  id="approveNotes"
                  placeholder="Ví dụ: Đã đối soát thông tin tài khoản hợp lệ..."
                  value={approveNotes}
                  onChange={(e) => setApproveNotes(e.target.value)}
                  disabled={actionLoading}
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setApproveModalWithdrawal(null)}
                  disabled={actionLoading}
                >
                  Hủy bỏ
                </Button>
                <Button
                  type="submit"
                  disabled={actionLoading}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold"
                >
                  {actionLoading ? 'Đang duyệt...' : 'Xác nhận phê duyệt'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Reject Withdrawal */}
      {rejectModalWithdrawal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-card border rounded-xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <h3 className="text-lg font-bold text-destructive">Từ chối yêu cầu rút tiền</h3>
            <p className="text-xs text-muted-foreground">
              Mã giao dịch:{' '}
              <span className="font-mono font-bold text-foreground">{rejectModalWithdrawal.code}</span> • Số
              tiền:{' '}
              <span className="font-bold text-foreground">
                {Number(rejectModalWithdrawal.amount).toLocaleString('vi-VN')} ₫
              </span>
            </p>
            <p className="text-xs text-amber-600 bg-amber-500/10 p-2.5 rounded-lg border border-amber-500/20">
              Khi từ chối, toàn bộ số tiền đang tạm giữ sẽ được tự động giải phóng và hoàn trả lại số dư khả
              dụng của người bán.
            </p>

            <form onSubmit={handleRejectSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="rejectReason">
                  Lý do từ chối <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="rejectReason"
                  placeholder="Ví dụ: Thông tin tài khoản nhận không khớp với tên đăng ký..."
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  disabled={actionLoading}
                  required
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setRejectModalWithdrawal(null)}
                  disabled={actionLoading}
                >
                  Hủy bỏ
                </Button>
                <Button
                  type="submit"
                  disabled={actionLoading}
                  variant="destructive"
                  className="font-semibold"
                >
                  {actionLoading ? 'Đang từ chối...' : 'Xác nhận từ chối'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Process Refund. The panel scrolls internally (`max-h-[90vh]`): with the fault basis,
          the window panel, the override and the refusal message the modal can outgrow the viewport,
          and a submit button the operator cannot reach is the dead button this action must not be. */}
      {isRefundModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-card border rounded-xl max-w-md w-full p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b pb-2">
              <h3 className="text-lg font-bold text-foreground">Thực hiện hoàn tiền bồi hoàn</h3>
              <button
                type="button"
                onClick={() => setIsRefundModalOpen(false)}
                className="text-muted-foreground hover:text-foreground"
              >
                ✕
              </button>
            </div>
            <p className="text-xs text-muted-foreground">
              Hệ thống sẽ ghi nhận bút toán hoàn tiền vào ví người mua, cập nhật trạng thái đơn hàng sang
              REFUNDED và xử lý doanh thu người bán theo cơ sở lỗi được chọn.
            </p>

            <form onSubmit={handleRefundSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="refundOrderId">
                  Mã đơn hàng (Order ID) <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="refundOrderId"
                  type="number"
                  placeholder="Ví dụ: 12"
                  value={refundOrderId}
                  onChange={(e) => {
                    setRefundOrderId(e.target.value)
                    // The window verdict belongs to the order, so a new id re-opens the question.
                    setRefundOverrideWindow(false)
                    setRefundWindowRefused(false)
                    clearNotifications()
                  }}
                  disabled={actionLoading}
                  required
                />
              </div>

              {/* Decision 0012 §6: the window is measured from orders.paidAt, and the operator is
                  told which case they are in instead of being left to guess. */}
              {windowVerdict === 'IN' && selectedOrderWindow && (
                <div
                  data-testid="refund-window-status"
                  className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3 text-xs space-y-1"
                >
                  <p className="font-semibold text-emerald-700">
                    Trong cửa sổ {refundWindowDays} ngày
                  </p>
                  <p className="text-muted-foreground">
                    Đơn {selectedOrderWindow.code} đã thanh toán lúc{' '}
                    {selectedOrderWindow.paidAt
                      ? new Date(selectedOrderWindow.paidAt).toLocaleString('vi-VN')
                      : '—'}{' '}
                    — trong chính sách hoàn tiền.
                  </p>
                </div>
              )}

              {windowVerdict === 'OUT' && selectedOrderWindow && (
                <div
                  data-testid="refund-window-status"
                  className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-xs space-y-1"
                >
                  <p className="font-semibold text-amber-700">
                    ⚠ Ngoài cửa sổ {refundWindowDays} ngày — ngoài chính sách hoàn tiền
                  </p>
                  <p className="text-muted-foreground">
                    Đơn {selectedOrderWindow.code} đã thanh toán lúc{' '}
                    {selectedOrderWindow.paidAt
                      ? new Date(selectedOrderWindow.paidAt).toLocaleString('vi-VN')
                      : '—'}
                    {selectedOrderWindow.windowClosesAt
                      ? `, cửa sổ đã đóng lúc ${new Date(
                          selectedOrderWindow.windowClosesAt,
                        ).toLocaleString('vi-VN')}`
                      : ''}
                    . Hoàn tiền vẫn thực hiện được, nhưng bản ghi hoàn tiền sẽ ghi rõ là ngoài cửa sổ.
                  </p>
                </div>
              )}

              {windowVerdict === 'UNKNOWN' &&
                refundOrderId.trim() !== '' &&
                !isNaN(parseInt(refundOrderId, 10)) && (
                  <div
                    data-testid="refund-window-status"
                    className="rounded-lg border border-muted-foreground/30 bg-muted/40 p-3 text-xs space-y-1"
                  >
                    <p className="font-semibold text-foreground">
                      Chưa xác định được cửa sổ {refundWindowDays} ngày
                    </p>
                    <p className="text-muted-foreground">
                      Trung tâm vận hành chưa có trạng thái cửa sổ của đơn này. Nếu đơn đã quá{' '}
                      {refundWindowDays} ngày kể từ thời điểm thanh toán, hệ thống sẽ từ chối và yêu cầu
                      xác nhận ghi đè bên dưới.
                    </p>
                  </div>
                )}

              {/* Decision 0012 §7: the basis decides who bears the refund — never a default. */}
              <fieldset className="space-y-2" disabled={actionLoading}>
                <legend className="text-sm font-medium">
                  Cơ sở lỗi (bắt buộc) <span className="text-destructive">*</span>
                </legend>
                <label
                  htmlFor="faultBasisSeller"
                  className="flex items-start gap-2 rounded-lg border p-2.5 text-xs cursor-pointer hover:bg-muted/40"
                >
                  <input
                    type="radio"
                    id="faultBasisSeller"
                    name="refundFaultBasis"
                    value="SELLER"
                    checked={refundFaultBasis === 'SELLER'}
                    onChange={() => setRefundFaultBasis('SELLER')}
                    disabled={actionLoading}
                    className="mt-0.5 w-4 h-4"
                    required
                  />
                  <span>
                    <span className="font-semibold text-foreground">Lỗi người bán</span>
                    <span className="block text-muted-foreground">
                      Đảo ngược doanh thu người bán và hoàn luôn phí sàn cho người mua.
                    </span>
                  </span>
                </label>
                <label
                  htmlFor="faultBasisPlatform"
                  className="flex items-start gap-2 rounded-lg border p-2.5 text-xs cursor-pointer hover:bg-muted/40"
                >
                  <input
                    type="radio"
                    id="faultBasisPlatform"
                    name="refundFaultBasis"
                    value="PLATFORM"
                    checked={refundFaultBasis === 'PLATFORM'}
                    onChange={() => setRefundFaultBasis('PLATFORM')}
                    disabled={actionLoading}
                    className="mt-0.5 w-4 h-4"
                  />
                  <span>
                    <span className="font-semibold text-foreground">Lỗi hệ thống (nền tảng)</span>
                    <span className="block text-muted-foreground">
                      Chỉ hoàn người mua: doanh thu người bán giữ nguyên và vẫn được trả đủ, đơn hàng không
                      tính doanh thu nền tảng.
                    </span>
                  </span>
                </label>
              </fieldset>

              <div className="space-y-1.5">
                <Label htmlFor="refundReason">
                  Lý do bồi hoàn <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="refundReason"
                  placeholder="Ví dụ: Tệp bản vẽ lỗi kỹ thuật, người mua khiếu nại..."
                  value={refundReason}
                  onChange={(e) => setRefundReason(e.target.value)}
                  disabled={actionLoading}
                  required
                />
              </div>

              {(isKnownOutOfWindow || refundWindowRefused) && (
                <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 space-y-2">
                  <p className="text-xs font-semibold text-amber-700">
                    Xác nhận ghi đè ngoài cửa sổ {refundWindowDays} ngày (bắt buộc)
                  </p>
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="overrideWindow"
                      checked={refundOverrideWindow}
                      onChange={(e) => setRefundOverrideWindow(e.target.checked)}
                      disabled={actionLoading}
                      className="rounded border-border text-primary focus:ring-primary w-4 h-4"
                    />
                    <Label htmlFor="overrideWindow" className="text-xs font-normal cursor-pointer">
                      Tôi xác nhận đơn hàng đã quá {refundWindowDays} ngày kể từ thời điểm thanh toán và
                      thực hiện hoàn tiền ngoài chính sách (bản ghi sẽ ghi rõ out-of-window).
                    </Label>
                  </div>
                </div>
              )}

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="revokeEntitlement"
                  checked={refundRevokeEntitlement}
                  onChange={(e) => setRefundRevokeEntitlement(e.target.checked)}
                  disabled={actionLoading}
                  className="rounded border-border text-primary focus:ring-primary w-4 h-4"
                />
                <Label htmlFor="revokeEntitlement" className="text-xs font-normal cursor-pointer">
                  Thu hồi quyền truy cập & tải bản vẽ (Revoke Entitlement)
                </Label>
              </div>

              {refundBlockedReason && (
                <p data-testid="refund-blocked-reason" className="text-xs text-destructive">
                  {refundBlockedReason}
                </p>
              )}

              {/* The route's refusal, where the operator is actually looking: the page-level
                  banner sits behind this modal's overlay, so a rejection would otherwise read as a
                  dead button. */}
              {error && (
                <div
                  data-testid="refund-error"
                  role="alert"
                  className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs font-medium text-destructive"
                >
                  {error}
                </div>
              )}

              <div className="flex items-center justify-end gap-3 pt-3 border-t">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsRefundModalOpen(false)}
                  disabled={actionLoading}
                >
                  Đóng
                </Button>
                <Button
                  type="submit"
                  disabled={actionLoading || Boolean(refundBlockedReason)}
                  className="bg-rose-600 hover:bg-rose-700 text-white font-semibold"
                >
                  {actionLoading ? 'Đang bồi hoàn...' : 'Xác nhận hoàn tiền'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
