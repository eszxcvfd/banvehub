'use client'

import React, { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

interface WithdrawalModalProps {
  availableBalance: number
}

export function WithdrawalModal({ availableBalance }: WithdrawalModalProps) {
  const router = useRouter()
  const [isOpen, setIsOpen] = useState(false)
  const [bankName, setBankName] = useState('')
  const [accountNumber, setAccountNumber] = useState('')
  const [accountHolderName, setAccountHolderName] = useState('')
  const [amount, setAmount] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const handleOpen = () => {
    setIsOpen(true)
    setError(null)
    setSuccess(null)
  }

  const handleClose = () => {
    if (loading) return
    setIsOpen(false)
    setError(null)
    setSuccess(null)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setSuccess(null)

    const trimmedBankName = bankName.trim()
    const trimmedAccountNumber = accountNumber.trim()
    const trimmedAccountHolderName = accountHolderName.trim()

    if (!trimmedBankName || !trimmedAccountNumber || !trimmedAccountHolderName) {
      setError('Vui lòng điền đầy đủ thông tin ngân hàng.')
      return
    }

    const numAmount = parseInt(amount, 10)
    if (isNaN(numAmount) || numAmount <= 0) {
      setError('Số tiền rút không hợp lệ.')
      return
    }

    if (numAmount < 50000) {
      setError('Số tiền rút tối thiểu là 50.000 ₫.')
      return
    }

    if (numAmount > 50000000) {
      setError('Số tiền rút tối đa là 50.000.000 ₫ cho mỗi giao dịch.')
      return
    }

    if (numAmount > availableBalance) {
      setError(
        `Số tiền rút (${numAmount.toLocaleString('vi-VN')} ₫) vượt quá số dư khả dụng (${availableBalance.toLocaleString('vi-VN')} ₫).`,
      )
      return
    }

    setLoading(true)

    try {
      const res = await fetch('/api/v1/seller/withdrawals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: numAmount,
          bankInfo: {
            bankName: trimmedBankName,
            accountNumber: trimmedAccountNumber,
            accountHolderName: trimmedAccountHolderName.toUpperCase(),
          },
        }),
      })

      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.message || data.error || 'Không thể tạo yêu cầu rút tiền.')
      }

      setSuccess('Yêu cầu rút tiền thành công! Đang chuyển tiếp thẩm định.')
      setAmount('')
      setTimeout(() => {
        setIsOpen(false)
        router.refresh()
      }, 1200)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Có lỗi xảy ra khi gửi yêu cầu.'
      setError(msg)
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <Button
        onClick={handleOpen}
        disabled={availableBalance < 50000}
        className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold shadow-sm text-sm"
      >
        <svg className="w-4 h-4 mr-1.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
        </svg>
        Yêu cầu rút tiền
      </Button>

      {isOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-card border rounded-xl max-w-lg w-full p-6 shadow-2xl space-y-5 animate-in fade-in duration-200">
            <div className="flex items-center justify-between border-b pb-3">
              <div className="space-y-0.5">
                <h3 className="text-lg font-bold text-foreground">Yêu cầu rút tiền về tài khoản</h3>
                <p className="text-xs text-muted-foreground">
                  Số dư khả dụng:{' '}
                  <span className="font-semibold text-emerald-600">
                    {availableBalance.toLocaleString('vi-VN')} ₫
                  </span>
                </p>
              </div>
              <button
                type="button"
                onClick={handleClose}
                className="text-muted-foreground hover:text-foreground p-1 rounded-lg"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {error && (
              <div className="p-3 rounded-lg bg-destructive/10 text-destructive border border-destructive/20 text-xs font-medium">
                {error}
              </div>
            )}

            {success && (
              <div className="p-3 rounded-lg bg-emerald-500/10 text-emerald-600 border border-emerald-500/20 text-xs font-medium">
                {success}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="bankName">
                  Tên ngân hàng <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="bankName"
                  placeholder="Ví dụ: Vietcombank, Techcombank, MB Bank..."
                  value={bankName}
                  onChange={(e) => setBankName(e.target.value)}
                  disabled={loading}
                  required
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="accountNumber">
                  Số tài khoản <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="accountNumber"
                  placeholder="Nhập số tài khoản ngân hàng"
                  value={accountNumber}
                  onChange={(e) => setAccountNumber(e.target.value)}
                  disabled={loading}
                  required
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="accountHolderName">
                  Tên chủ tài khoản <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="accountHolderName"
                  placeholder="VIET HOA KHONG DAU (ví dụ: NGUYEN VAN A)"
                  value={accountHolderName}
                  onChange={(e) => setAccountHolderName(e.target.value)}
                  disabled={loading}
                  required
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="amount">
                  Số tiền rút (VND) <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="amount"
                  type="number"
                  min={50000}
                  max={Math.min(50000000, availableBalance)}
                  step={1000}
                  placeholder="Tối thiểu 50.000 ₫"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  disabled={loading}
                  required
                />
                <p className="text-[11px] text-muted-foreground">
                  Hạn mức rút: 50.000 ₫ – 50.000.000 ₫ / giao dịch. Tiền sẽ được tạm giữ trong lúc chờ thẩm định.
                </p>
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t">
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleClose}
                  disabled={loading}
                >
                  Đóng
                </Button>
                <Button
                  type="submit"
                  disabled={loading}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold"
                >
                  {loading ? 'Đang xử lý...' : 'Xác nhận rút tiền'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  )
}
