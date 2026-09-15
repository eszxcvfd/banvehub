'use client'

import React, { useState, useEffect, useRef } from 'react'
import {
  Wallet as WalletIcon,
  ArrowUpRight,
  ArrowDownLeft,
  QrCode,
  Copy,
  Check,
  RefreshCw,
  Clock,
  ShieldCheck,
  AlertCircle,
} from 'lucide-react'
import { Button } from '@/components/ui/button'

interface WalletData {
  id: number | string
  balance: number
  pendingBalance: number
  currency: string
  status: string
}

interface LedgerEntry {
  id: number | string
  type: string
  amount: number
  direction: 'credit' | 'debit'
  referenceType: string
  referenceId: string
  balanceBefore: number
  balanceAfter: number
  description?: string
  createdAt: string
}

interface TopupIntentResponse {
  id: number
  code: string
  amount: number
  currency: string
  status: string
  expiresAt: string
  checkoutUrl?: string
  bankCode?: string
  accountNo?: string
  accountName?: string
}

const PRESET_AMOUNTS = [50000, 100000, 200000, 500000, 1000000]

export function WalletClient({
  initialWallet,
  initialLedger,
}: {
  initialWallet: WalletData
  initialLedger: LedgerEntry[]
}) {
  const [wallet, setWallet] = useState<WalletData>(initialWallet)
  const [ledger, setLedger] = useState<LedgerEntry[]>(initialLedger)
  const [selectedAmount, setSelectedAmount] = useState<number>(100000)
  const [customAmount, setCustomAmount] = useState<string>('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [activeIntent, setActiveIntent] = useState<TopupIntentResponse | null>(null)
  const [copiedField, setCopiedField] = useState<string | null>(null)
  const [pollStatus, setPollStatus] = useState<'idle' | 'polling' | 'paid' | 'expired'>('idle')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const pollingRef = useRef<NodeJS.Timeout | null>(null)

  const effectiveAmount = customAmount ? parseInt(customAmount, 10) || 0 : selectedAmount

  const handleCopy = (text: string, field: string) => {
    navigator.clipboard.writeText(text)
    setCopiedField(field)
    setTimeout(() => setCopiedField(null), 2000)
  }

  const handleCreateTopup = async () => {
    if (effectiveAmount < 10000) {
      setErrorMessage('Số tiền nạp tối thiểu là 10.000₫')
      return
    }

    setIsSubmitting(true)
    setErrorMessage(null)

    try {
      const res = await fetch('/api/v1/payments/topup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: effectiveAmount }),
      })

      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.error || 'Tạo giao dịch nạp tiền thất bại.')
      }

      setActiveIntent(data.intent)
      setPollStatus('polling')
    } catch (err: any) {
      setErrorMessage(err.message || 'Lỗi kết nối máy chủ.')
    } finally {
      setIsSubmitting(false)
    }
  }

  // Refresh wallet and ledger data
  const refreshData = async () => {
    try {
      const [wRes, lRes] = await Promise.all([
        fetch('/api/v1/me/wallet'),
        fetch('/api/v1/me/wallet/ledger?limit=20'),
      ])
      if (wRes.ok) {
        const wData = await wRes.json()
        if (wData.wallet) setWallet(wData.wallet)
      }
      if (lRes.ok) {
        const lData = await lRes.json()
        if (lData.docs) setLedger(lData.docs)
      }
    } catch (err) {
      console.error('Error refreshing wallet:', err)
    }
  }

  // Polling for active intent payment status
  useEffect(() => {
    if (!activeIntent || pollStatus !== 'polling') return

    const checkStatus = async () => {
      try {
        const res = await fetch(`/api/v1/payments/${activeIntent.code}`)
        if (res.ok) {
          const data = await res.json()
          if (data.intent?.status === 'PAID') {
            setPollStatus('paid')
            if (pollingRef.current) clearInterval(pollingRef.current)
            await refreshData()
          } else if (data.intent?.status === 'EXPIRED') {
            setPollStatus('expired')
            if (pollingRef.current) clearInterval(pollingRef.current)
          }
        }
      } catch (err) {
        console.error('Polling error:', err)
      }
    }

    pollingRef.current = setInterval(checkStatus, 3000)

    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current)
    }
  }, [activeIntent, pollStatus])

  return (
    <div className="space-y-8">
      {/* Overview Balance Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-card border rounded-2xl p-6 shadow-sm relative overflow-hidden">
          <div className="flex items-center justify-between pb-4">
            <div className="text-sm font-medium text-muted-foreground">Số dư khả dụng</div>
            <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center text-primary">
              <WalletIcon className="h-5 w-5" />
            </div>
          </div>
          <div className="text-3xl font-extrabold text-foreground tracking-tight">
            {wallet.balance.toLocaleString('vi-VN')}₫
          </div>
          <p className="text-xs text-muted-foreground mt-2 flex items-center gap-1">
            <ShieldCheck className="h-3.5 w-3.5 text-emerald-500" /> Được bảo vệ bởi Sổ cái bất biến (BR-03)
          </p>
        </div>

        <div className="bg-card border rounded-2xl p-6 shadow-sm relative overflow-hidden">
          <div className="flex items-center justify-between pb-4">
            <div className="text-sm font-medium text-muted-foreground">Tạm giữ / Chờ xử lý</div>
            <div className="h-10 w-10 rounded-full bg-amber-500/10 flex items-center justify-center text-amber-500">
              <Clock className="h-5 w-5" />
            </div>
          </div>
          <div className="text-3xl font-extrabold text-foreground tracking-tight">
            {wallet.pendingBalance.toLocaleString('vi-VN')}₫
          </div>
          <p className="text-xs text-muted-foreground mt-2">Dành cho rút tiền hoặc đơn hàng đang xử lý</p>
        </div>

        <div className="bg-card border rounded-2xl p-6 shadow-sm relative overflow-hidden flex flex-col justify-between">
          <div className="flex items-center justify-between pb-4">
            <div className="text-sm font-medium text-muted-foreground">Trạng thái tài khoản</div>
            <span
              className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold ${
                wallet.status === 'active'
                  ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                  : 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300'
              }`}
            >
              {wallet.status === 'active' ? '● Đang hoạt động' : 'Tạm khóa'}
            </span>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={refreshData}
            className="w-fit text-xs flex items-center gap-1.5"
          >
            <RefreshCw className="h-3.5 w-3.5" /> Đồng bộ số dư
          </Button>
        </div>
      </div>

      {/* Top-up Box and VietQR Display */}
      <div className="bg-card border rounded-2xl p-6 md:p-8 shadow-sm">
        <div className="flex items-center gap-3 pb-6 border-b">
          <div className="h-9 w-9 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
            <QrCode className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-foreground">Nạp tiền vào ví qua VietQR (SePay)</h2>
            <p className="text-xs text-muted-foreground">
              Quét mã QR từ ứng dụng ngân hàng bất kỳ. Tiền vào ví tự động sau 3-5 giây (Tự động 24/7).
            </p>
          </div>
        </div>

        {errorMessage && (
          <div className="mt-4 p-3.5 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 rounded-xl text-rose-700 dark:text-rose-300 text-sm flex items-center gap-2">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        {!activeIntent ? (
          <div className="mt-6 space-y-6">
            <div>
              <label className="block text-sm font-medium text-foreground mb-3">Chọn số tiền nạp nhanh</label>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
                {PRESET_AMOUNTS.map((amt) => (
                  <button
                    key={amt}
                    type="button"
                    onClick={() => {
                      setSelectedAmount(amt)
                      setCustomAmount('')
                    }}
                    className={`py-3 px-4 rounded-xl border text-sm font-semibold transition-all ${
                      selectedAmount === amt && !customAmount
                        ? 'border-primary bg-primary/10 text-primary shadow-sm ring-2 ring-primary/20'
                        : 'border-border hover:bg-muted/60 text-foreground'
                    }`}
                  >
                    {amt.toLocaleString('vi-VN')}₫
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-foreground mb-2">Hoặc nhập số tiền khác (VND)</label>
              <div className="max-w-md">
                <input
                  type="number"
                  min="10000"
                  step="10000"
                  placeholder="Ví dụ: 250000"
                  value={customAmount}
                  onChange={(e) => setCustomAmount(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl border border-input bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
            </div>

            <div className="pt-2">
              <Button
                onClick={handleCreateTopup}
                disabled={isSubmitting || effectiveAmount < 10000}
                className="px-6 py-2.5 font-medium rounded-xl text-sm"
              >
                {isSubmitting ? 'Đang tạo mã QR...' : `Tạo mã nạp ${effectiveAmount.toLocaleString('vi-VN')}₫`}
              </Button>
            </div>
          </div>
        ) : (
          <div className="mt-6">
            {pollStatus === 'paid' ? (
              <div className="p-8 text-center bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900 rounded-2xl space-y-4">
                <div className="h-14 w-14 bg-emerald-500 text-white rounded-full flex items-center justify-center mx-auto shadow-md">
                  <Check className="h-7 w-7" />
                </div>
                <h3 className="text-xl font-bold text-emerald-900 dark:text-emerald-200">
                  Nạp tiền thành công {activeIntent.amount.toLocaleString('vi-VN')}₫!
                </h3>
                <p className="text-sm text-emerald-700 dark:text-emerald-400">
                  Hệ thống đã ghi nhận giao dịch vào Sổ cái bất biến và cập nhật số dư ví của bạn.
                </p>
                <div className="pt-2">
                  <Button
                    onClick={() => {
                      setActiveIntent(null)
                      setPollStatus('idle')
                    }}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white"
                  >
                    Tiếp tục nạp thêm
                  </Button>
                </div>
              </div>
            ) : pollStatus === 'expired' ? (
              <div className="p-8 text-center bg-muted/60 border rounded-2xl space-y-4">
                <Clock className="h-10 w-10 text-muted-foreground mx-auto" />
                <h3 className="text-lg font-bold text-foreground">Giao dịch đã hết hạn hiệu lực</h3>
                <p className="text-sm text-muted-foreground">
                  Vui lòng tạo giao dịch nạp mới để nhận mã chuyển khoản cập nhật.
                </p>
                <Button onClick={() => setActiveIntent(null)} variant="outline">
                  Tạo giao dịch mới
                </Button>
              </div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
                {/* VietQR Image */}
                <div className="lg:col-span-5 flex flex-col items-center p-4 bg-white dark:bg-zinc-900 rounded-2xl border shadow-sm">
                  {activeIntent.checkoutUrl ? (
                    <img
                      src={activeIntent.checkoutUrl}
                      alt="VietQR Chuyển khoản"
                      className="w-64 h-64 object-contain rounded-lg"
                    />
                  ) : (
                    <div className="w-64 h-64 flex items-center justify-center bg-muted rounded-lg">
                      <QrCode className="h-16 w-16 text-muted-foreground" />
                    </div>
                  )}
                  <div className="mt-3 flex items-center gap-2 text-xs font-semibold text-primary animate-pulse">
                    <RefreshCw className="h-3.5 w-3.5 animate-spin" /> Đang chờ hệ thống ngân hàng xác nhận...
                  </div>
                </div>

                {/* Transfer Info */}
                <div className="lg:col-span-7 space-y-4">
                  <div className="bg-muted/40 p-4 rounded-xl space-y-3 text-sm border">
                    <div className="flex items-center justify-between py-1 border-b border-border/50">
                      <span className="text-muted-foreground">Ngân hàng thụ hưởng:</span>
                      <span className="font-bold text-foreground">{activeIntent.bankCode || 'MBBank'}</span>
                    </div>

                    <div className="flex items-center justify-between py-1 border-b border-border/50">
                      <span className="text-muted-foreground">Số tài khoản:</span>
                      <div className="flex items-center gap-2 font-mono font-bold text-foreground">
                        <span>{activeIntent.accountNo || '0987654321'}</span>
                        <button
                          type="button"
                          onClick={() => handleCopy(activeIntent.accountNo || '0987654321', 'accountNo')}
                          className="text-muted-foreground hover:text-foreground"
                          title="Sao chép"
                        >
                          {copiedField === 'accountNo' ? <Check className="h-4 w-4 text-emerald-500" /> : <Copy className="h-4 w-4" />}
                        </button>
                      </div>
                    </div>

                    <div className="flex items-center justify-between py-1 border-b border-border/50">
                      <span className="text-muted-foreground">Chủ tài khoản:</span>
                      <span className="font-semibold text-foreground uppercase">{activeIntent.accountName || 'KIENTAOHUB'}</span>
                    </div>

                    <div className="flex items-center justify-between py-1 border-b border-border/50">
                      <span className="text-muted-foreground">Số tiền:</span>
                      <div className="flex items-center gap-2 font-bold text-primary text-base">
                        <span>{activeIntent.amount.toLocaleString('vi-VN')}₫</span>
                        <button
                          type="button"
                          onClick={() => handleCopy(String(activeIntent.amount), 'amount')}
                          className="text-muted-foreground hover:text-foreground"
                          title="Sao chép"
                        >
                          {copiedField === 'amount' ? <Check className="h-4 w-4 text-emerald-500" /> : <Copy className="h-4 w-4" />}
                        </button>
                      </div>
                    </div>

                    <div className="flex items-center justify-between py-1 bg-amber-50 dark:bg-amber-950/30 p-2.5 rounded-lg border border-amber-200 dark:border-amber-900">
                      <span className="text-amber-900 dark:text-amber-300 font-medium">Nội dung chuyển khoản (bắt buộc):</span>
                      <div className="flex items-center gap-2 font-mono font-extrabold text-amber-900 dark:text-amber-200 text-base">
                        <span>{activeIntent.code}</span>
                        <button
                          type="button"
                          onClick={() => handleCopy(activeIntent.code, 'code')}
                          className="text-amber-800 dark:text-amber-300 hover:text-foreground"
                          title="Sao chép mã"
                        >
                          {copiedField === 'code' ? <Check className="h-4 w-4 text-emerald-500" /> : <Copy className="h-4 w-4" />}
                        </button>
                      </div>
                    </div>
                  </div>

                  <p className="text-xs text-muted-foreground italic">
                    ⚠️ Lưu ý: Vui lòng giữ nguyên nội dung chuyển khoản <strong>{activeIntent.code}</strong> để hệ thống nhận diện và cộng tiền tự động ngay lập tức.
                  </p>

                  <div className="flex items-center gap-3 pt-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setActiveIntent(null)
                        setPollStatus('idle')
                      }}
                    >
                      Hủy giao dịch này
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Financial Ledger History Table */}
      <div className="bg-card border rounded-2xl p-6 md:p-8 shadow-sm">
        <div className="flex items-center justify-between pb-6 border-b">
          <div>
            <h2 className="text-lg font-bold text-foreground">Lịch sử biến động số dư (Ledger)</h2>
            <p className="text-xs text-muted-foreground">
              Hồ sơ ghi nhận minh bạch mọi giao dịch nạp tiền, chi tiêu và hoàn tiền.
            </p>
          </div>
        </div>

        {ledger.length === 0 ? (
          <div className="py-12 text-center text-muted-foreground text-sm">
            Chưa có giao dịch nào được ghi nhận trong sổ cái ví của bạn.
          </div>
        ) : (
          <div className="overflow-x-auto mt-4">
            <table className="w-full text-sm text-left">
              <thead className="text-xs uppercase bg-muted/50 text-muted-foreground font-semibold border-b">
                <tr>
                  <th className="px-4 py-3">Thời gian</th>
                  <th className="px-4 py-3">Loại giao dịch</th>
                  <th className="px-4 py-3">Mã tham chiếu</th>
                  <th className="px-4 py-3 text-right">Biến động</th>
                  <th className="px-4 py-3 text-right">Số dư sau</th>
                  <th className="px-4 py-3">Nội dung</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {ledger.map((entry) => (
                  <tr key={entry.id} className="hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                      {new Date(entry.createdAt).toLocaleString('vi-VN')}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                          entry.direction === 'credit'
                            ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                            : 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300'
                        }`}
                      >
                        {entry.type === 'topup'
                          ? 'Nạp tiền'
                          : entry.type === 'purchase'
                          ? 'Mua tài nguyên'
                          : entry.type === 'refund'
                          ? 'Hoàn tiền'
                          : entry.type === 'adjustment'
                          ? 'Điều chỉnh'
                          : entry.type}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                      {entry.referenceId}
                    </td>
                    <td
                      className={`px-4 py-3 text-right font-semibold ${
                        entry.direction === 'credit'
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : 'text-rose-600 dark:text-rose-400'
                      }`}
                    >
                      {entry.direction === 'credit' ? '+' : '-'}
                      {entry.amount.toLocaleString('vi-VN')}₫
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-xs text-foreground">
                      {entry.balanceAfter.toLocaleString('vi-VN')}₫
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground max-w-xs truncate">
                      {entry.description || '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
