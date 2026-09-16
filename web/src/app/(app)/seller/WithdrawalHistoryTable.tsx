'use client'

import React, { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'

export interface WithdrawalItem {
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
  requestedAt?: string
  createdAt?: string
}

interface Props {
  initialWithdrawals: WithdrawalItem[]
}

export function WithdrawalHistoryTable({ initialWithdrawals }: Props) {
  const router = useRouter()
  const [withdrawals, setWithdrawals] = useState<WithdrawalItem[]>(initialWithdrawals)
  const [cancellingId, setCancellingId] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)

  const handleCancel = async (id: number) => {
    if (!confirm('Bạn có chắc chắn muốn hủy yêu cầu rút tiền này? Số tiền tạm giữ sẽ được hoàn lại số dư khả dụng.')) {
      return
    }

    setCancellingId(id)
    setError(null)

    try {
      const res = await fetch(`/api/v1/seller/withdrawals/${id}/cancel`, {
        method: 'POST',
      })
      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.message || data.error || 'Không thể hủy yêu cầu rút tiền.')
      }

      setWithdrawals((prev) =>
        prev.map((w) => (w.id === id ? { ...w, status: 'CANCELLED' } : w)),
      )
      router.refresh()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Lỗi khi hủy yêu cầu.'
      setError(msg)
    } finally {
      setCancellingId(null)
    }
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'REQUESTED':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-blue-500/10 text-blue-600 border border-blue-500/20">
            Mới yêu cầu (REQUESTED)
          </span>
        )
      case 'UNDER_REVIEW':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-600 border border-amber-500/20">
            Đang thẩm định (UNDER_REVIEW)
          </span>
        )
      case 'APPROVED':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-indigo-500/10 text-indigo-600 border border-indigo-500/20">
            Đã duyệt chi (APPROVED)
          </span>
        )
      case 'PROCESSING':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-purple-500/10 text-purple-600 border border-purple-500/20">
            Đang chuyển tiền (PROCESSING)
          </span>
        )
      case 'PAID':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-600 border border-emerald-500/20">
            Đã thanh toán (PAID)
          </span>
        )
      case 'REJECTED':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-rose-500/10 text-rose-600 border border-rose-500/20">
            Từ chối (REJECTED)
          </span>
        )
      case 'CANCELLED':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-zinc-500/10 text-zinc-600 border border-zinc-500/20">
            Đã hủy (CANCELLED)
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

  return (
    <div className="space-y-3">
      {error && (
        <div className="p-3 rounded-lg bg-destructive/10 text-destructive border border-destructive/20 text-xs font-medium">
          {error}
        </div>
      )}

      {withdrawals.length === 0 ? (
        <div className="py-12 text-center space-y-2">
          <p className="text-sm text-muted-foreground">Bạn chưa thực hiện yêu cầu rút tiền nào.</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b bg-muted/40 text-muted-foreground font-medium text-xs uppercase tracking-wider">
              <tr>
                <th className="py-3.5 px-4">Mã giao dịch</th>
                <th className="py-3.5 px-4">Số tiền</th>
                <th className="py-3.5 px-4">Thông tin tài khoản</th>
                <th className="py-3.5 px-4">Trạng thái</th>
                <th className="py-3.5 px-4">Thời gian tạo</th>
                <th className="py-3.5 px-4 text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {withdrawals.map((w) => {
                const isCancellable = w.status === 'REQUESTED' || w.status === 'UNDER_REVIEW'
                const formattedDate = w.requestedAt || w.createdAt
                  ? new Date(w.requestedAt || w.createdAt!).toLocaleString('vi-VN')
                  : '—'

                return (
                  <tr key={w.id} className="hover:bg-muted/30 transition-colors">
                    <td className="py-3.5 px-4 font-mono text-xs font-semibold text-foreground">
                      {w.code}
                    </td>
                    <td className="py-3.5 px-4 font-semibold text-foreground">
                      {Number(w.amount).toLocaleString('vi-VN')} ₫
                    </td>
                    <td className="py-3.5 px-4 text-xs">
                      {w.bankInfo ? (
                        <div>
                          <div className="font-semibold text-foreground">{w.bankInfo.bankName}</div>
                          <div className="text-muted-foreground font-mono">
                            {w.bankInfo.accountNumber} • {w.bankInfo.accountHolderName}
                          </div>
                        </div>
                      ) : (
                        <span className="text-muted-foreground italic">Không có</span>
                      )}
                    </td>
                    <td className="py-3.5 px-4">{getStatusBadge(w.status)}</td>
                    <td className="py-3.5 px-4 text-xs text-muted-foreground">{formattedDate}</td>
                    <td className="py-3.5 px-4 text-right">
                      {isCancellable ? (
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={cancellingId === w.id}
                          onClick={() => handleCancel(w.id)}
                          className="text-xs text-destructive border-destructive/20 hover:bg-destructive/10"
                        >
                          {cancellingId === w.id ? 'Đang hủy...' : 'Hủy'}
                        </Button>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
