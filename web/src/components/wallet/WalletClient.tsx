'use client'

import React, { useState, useEffect, useRef } from 'react'
import {
  Row,
  Col,
  Card,
  Statistic,
  Button,
  Modal,
  InputNumber,
  Radio,
  Typography,
  Alert,
  Table,
  Tag,
  Spin,
  Result,
  Empty,
  Descriptions,
  Space,
} from 'antd'
import type { ColumnsType } from 'antd/es/table'
import {
  WalletOutlined,
  ShoppingOutlined,
  TrophyOutlined,
  PlusCircleOutlined,
  ReloadOutlined,
  ClockCircleOutlined,
  QrcodeOutlined,
  LoadingOutlined,
  SafetyCertificateFilled,
} from '@ant-design/icons'
import { useSearchParams } from 'next/navigation'

// Vitest jsdom safety polyfills
if (typeof window !== 'undefined') {
  if (!window.matchMedia) {
    window.matchMedia = (query) =>
      ({
        matches: false,
        media: query,
        onchange: null,
        addListener: () => {},
        removeListener: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => false,
      } as any)
  }
  if (!window.ResizeObserver) {
    window.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    } as any
  }
}

export interface WalletData {
  id: number | string
  balance: number
  pendingBalance: number
  currency: string
  status: string
}

export interface LedgerEntry {
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
  const [isTopupModalOpen, setIsTopupModalOpen] = useState(false)
  const [selectedPreset, setSelectedPreset] = useState<number>(100000)
  const [customAmount, setCustomAmount] = useState<number>(100000)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [activeIntent, setActiveIntent] = useState<TopupIntentResponse | null>(null)
  const [pollStatus, setPollStatus] = useState<'idle' | 'polling' | 'paid' | 'expired'>('idle')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const pollingRef = useRef<NodeJS.Timeout | null>(null)

  // The checkout's VietQR branch creates the top-up intent and hands its code over in the URL, so the
  // buyer lands on the payment step that already renders the QR, the transfer reference and the
  // polling for the credit, instead of having to create a second intent by hand.
  const searchParams = useSearchParams()
  const resumedIntentCode = searchParams?.get('topup') ?? null

  useEffect(() => {
    if (!resumedIntentCode || activeIntent) return

    let cancelled = false

    fetch(`/api/v1/payments/${encodeURIComponent(resumedIntentCode)}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        const intent = data?.intent as TopupIntentResponse | undefined
        if (cancelled || !intent?.code) return

        setActiveIntent(intent)
        setIsTopupModalOpen(true)
        setPollStatus(intent.status === 'PENDING' ? 'polling' : intent.status === 'PAID' ? 'paid' : 'expired')
      })
      .catch(() => {
        // An unreadable hand-off leaves the wallet page as it was: the buyer can still start a top-up.
      })

    return () => {
      cancelled = true
    }
  }, [resumedIntentCode, activeIntent])

  // Calculate metrics
  const totalSpent = ledger
    .filter((e) => e.direction === 'debit' && e.type === 'purchase')
    .reduce((sum, e) => sum + e.amount, 0)

  // No loyalty derivation: the schema stores no points/rewards, so nothing may display a points figure.

  const effectiveAmount = customAmount || selectedPreset

  const handleCreateTopup = async () => {
    if (!effectiveAmount || effectiveAmount < 10000) {
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

  const refreshData = async () => {
    setIsRefreshing(true)
    try {
      const [wRes, lRes] = await Promise.all([
        fetch('/api/v1/me/wallet'),
        fetch('/api/v1/me/wallet/ledger?limit=50'),
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
    } finally {
      setIsRefreshing(false)
    }
  }

  // Polling for payment status
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

  const handleCloseModal = () => {
    setIsTopupModalOpen(false)
    if (pollStatus === 'paid' || pollStatus === 'expired') {
      setActiveIntent(null)
      setPollStatus('idle')
      setErrorMessage(null)
    }
  }

  const handleResetTopup = () => {
    setActiveIntent(null)
    setPollStatus('idle')
    setErrorMessage(null)
  }

  // Ledger Table Columns
  const ledgerColumns: ColumnsType<LedgerEntry> = [
    {
      title: 'Thời gian',
      dataIndex: 'createdAt',
      key: 'createdAt',
      width: 170,
      render: (dateStr: string) => (
        <span className="text-xs text-muted-foreground">
          {new Date(dateStr).toLocaleString('vi-VN')}
        </span>
      ),
    },
    {
      title: 'Loại giao dịch',
      dataIndex: 'type',
      key: 'type',
      width: 150,
      render: (type: string) => {
        if (type === 'topup') {
          return <Tag color="green">Nạp tiền</Tag>
        }
        if (type === 'purchase') {
          return <Tag color="blue">Mua bản vẽ</Tag>
        }
        if (type === 'refund') {
          return <Tag color="purple">Hoàn tiền</Tag>
        }
        return <Tag color="orange">{type || 'Điều chỉnh'}</Tag>
      },
    },
    {
      title: 'Mã tham chiếu',
      dataIndex: 'referenceId',
      key: 'referenceId',
      width: 180,
      render: (refId: string, record: LedgerEntry) => (
        <Typography.Text copyable code className="text-xs">
          {refId || String(record.id)}
        </Typography.Text>
      ),
    },
    {
      title: 'Biến động',
      key: 'amount',
      width: 160,
      align: 'right',
      render: (_: any, record: LedgerEntry) => {
        const isCredit = record.direction === 'credit'
        return (
          <span
            className={`font-mono font-bold text-sm ${
              isCredit ? 'text-emerald-600' : 'text-rose-600'
            }`}
          >
            {isCredit ? '+' : '-'}
            {record.amount.toLocaleString('vi-VN')} ₫
          </span>
        )
      },
    },
    {
      title: 'Số dư sau',
      dataIndex: 'balanceAfter',
      key: 'balanceAfter',
      width: 160,
      align: 'right',
      render: (bal: number) => (
        <span className="font-mono text-xs font-semibold text-foreground">
          {bal.toLocaleString('vi-VN')} ₫
        </span>
      ),
    },
    {
      title: 'Nội dung',
      dataIndex: 'description',
      key: 'description',
      ellipsis: true,
      render: (desc: string) => (
        <span className="text-xs text-muted-foreground">{desc || '-'}</span>
      ),
    },
  ]

  return (
    <div className="space-y-6">
      {/* Top Hero Section: Digital Wallet Card + Quick VietQR Top-up */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        {/* Left: Luxury Digital Payment Card */}
        <div className="lg:col-span-7 relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#0f172a] via-[#1e293b] to-[#020617] p-5 sm:p-6 text-white shadow-xl border border-slate-700/60 flex flex-col justify-between min-h-[280px]">
          {/* Background Ambient Glow & Blueprint Grid Pattern */}
          <div className="absolute -right-16 -top-16 w-64 h-64 rounded-full bg-blue-600/20 blur-3xl pointer-events-none" />
          <div className="absolute -left-12 -bottom-12 w-48 h-48 rounded-full bg-indigo-600/15 blur-2xl pointer-events-none" />
          <div
            className="absolute inset-0 opacity-[0.03] pointer-events-none"
            style={{
              backgroundImage:
                'radial-gradient(#ffffff 1px, transparent 1px), radial-gradient(#ffffff 1px, transparent 1px)',
              backgroundSize: '20px 20px',
              backgroundPosition: '0 0, 10px 10px',
            }}
          />

          {/* Card Header: Brand & Contactless Icon */}
          <div className="relative z-10 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-blue-500/20 border border-blue-400/40 flex items-center justify-center font-bold text-white shadow-inner text-base">
                K
              </div>
              <div>
                <div className="font-bold text-sm tracking-wide leading-none text-white">
                  KienTaoHub Pay
                </div>
                <div className="text-[10px] text-blue-300 font-mono tracking-wider mt-0.5">
                  DIGITAL ASSET WALLET
                </div>
              </div>
            </div>

            {/* NFC / Contactless Wave SVG */}
            <div className="text-slate-400/80">
              <svg
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              >
                <path d="M8.5 16.5a5 5 0 0 1 0-9" />
                <path d="M12 19a8.5 8.5 0 0 0 0-14" />
                <path d="M15.5 21.5a12 12 0 0 0 0-19" />
              </svg>
            </div>
          </div>

          {/* Middle: EMV Chip & Available Balance */}
          <div className="relative z-10 my-4">
            <div className="flex items-center gap-3 mb-2">
              {/* Metallic Gold EMV Chip */}
              <div className="w-10 h-7 rounded-md bg-gradient-to-br from-amber-200 via-amber-400 to-amber-500 p-0.5 shadow-sm flex items-center justify-center">
                <div className="w-full h-full border border-amber-600/40 rounded-[3px] flex flex-col justify-around py-0.5 px-1">
                  <div className="h-[1px] bg-amber-700/50 w-full" />
                  <div className="h-[1px] bg-amber-700/50 w-full" />
                </div>
              </div>
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">
                Số dư khả dụng
              </span>
            </div>

            <div className="text-3xl sm:text-4xl font-black text-white font-mono tracking-tight drop-shadow-sm flex items-baseline gap-2">
              <span>{wallet.balance.toLocaleString('vi-VN')}</span>
              <span className="text-xl sm:text-2xl text-blue-400 font-bold">₫</span>
            </div>
          </div>

          {/* Card Footer: Status, ID & Action Button */}
          <div className="relative z-10 flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-700/60">
            <div className="flex items-center gap-3">
              <div className="text-xs text-emerald-400 flex items-center gap-1.5 font-medium">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shadow-xs" />
                <span>Sổ cái BR-03</span>
              </div>
              <span className="text-xs text-slate-400 font-mono">
                ID: KT-{String(wallet.id || '88').padStart(4, '0')}
              </span>
            </div>

            <Button
              type="primary"
              size="middle"
              icon={<PlusCircleOutlined />}
              onClick={() => setIsTopupModalOpen(true)}
              className="!bg-[#1677ff] hover:!bg-blue-500 text-white font-bold text-xs rounded-xl h-9 px-4 shadow-md border-0 shrink-0"
            >
              Nạp tiền
            </Button>
          </div>
        </div>

        {/* Right: Quick VietQR Top-up Showcase Card */}
        <div className="lg:col-span-5 rounded-3xl bg-white border border-slate-200/80 p-5 sm:p-6 shadow-sm flex flex-col justify-between overflow-hidden min-h-[280px]">
          <div>
            <div className="flex items-center justify-between gap-2 mb-2 pb-2.5 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-blue-50 text-[#1677ff] border border-blue-100/60 flex items-center justify-center text-lg shadow-2xs shrink-0">
                  <QrcodeOutlined />
                </div>
                <div>
                  <div className="font-bold text-slate-900 text-sm sm:text-base leading-tight">
                    Nạp tiền vào ví qua VietQR (SePay)
                  </div>
                  <div className="text-xs text-slate-400 mt-0.5">
                    Thanh toán tự động 24/7 với VietQR Napas247
                  </div>
                </div>
              </div>
              <span className="hidden sm:inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-600 border border-emerald-200 shrink-0">
                24/7 Auto
              </span>
            </div>

            <div className="space-y-2 my-3">
              <div className="flex items-start gap-2 text-xs text-slate-600">
                <div className="w-4 h-4 rounded-full bg-blue-100 text-[#1677ff] flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">
                  1
                </div>
                <span>Chọn số tiền linh hoạt (tối thiểu chỉ từ 10.000₫)</span>
              </div>
              <div className="flex items-start gap-2 text-xs text-slate-600">
                <div className="w-4 h-4 rounded-full bg-blue-100 text-[#1677ff] flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">
                  2
                </div>
                <span>Quét mã VietQR trên bất kỳ ứng dụng ngân hàng di động nào</span>
              </div>
              <div className="flex items-start gap-2 text-xs text-slate-600">
                <div className="w-4 h-4 rounded-full bg-blue-100 text-[#1677ff] flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">
                  3
                </div>
                <span>Số dư tự động được cộng vào ví trong 3-5 giây qua SePay Webhook</span>
              </div>
            </div>
          </div>

          <div className="pt-1">
            <Button
              type="primary"
              size="large"
              icon={<PlusCircleOutlined />}
              onClick={() => setIsTopupModalOpen(true)}
              className="w-full !bg-[#1677ff] hover:!bg-blue-600 rounded-2xl font-bold text-xs sm:text-sm h-10 shadow-sm"
            >
              Mở cửa sổ nạp tiền
            </Button>

            <div className="flex flex-wrap items-center justify-center gap-1.5 mt-2.5 pt-2.5 border-t border-slate-100">
              <Tag color="green" className="!m-0 text-[11px] px-2.5 py-0.5 rounded-full font-medium">
                Miễn phí giao dịch
              </Tag>
              <Tag color="blue" className="!m-0 text-[11px] px-2.5 py-0.5 rounded-full font-medium">
                Cộng tiền sau 3-5s
              </Tag>
              <Tag color="purple" className="!m-0 text-[11px] px-2.5 py-0.5 rounded-full font-medium">
                Bảo mật chuẩn ngân hàng
              </Tag>
            </div>
          </div>
        </div>
      </div>

      {/* Row 2: 3 Financial Activity Metric Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-6">
        {/* Card 1: Tạm giữ / Chờ xử lý */}
        <div className="bg-white border border-slate-200/80 rounded-2xl p-5 sm:p-6 shadow-sm flex flex-col justify-between hover:shadow-md transition-all">
          <div className="flex items-center justify-between gap-2 mb-3">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Tạm giữ / Chờ xử lý
            </span>
            <div className="w-9 h-9 rounded-xl bg-amber-50 text-amber-500 border border-amber-100 flex items-center justify-center text-base">
              <ClockCircleOutlined />
            </div>
          </div>
          <div>
            <div className="text-2xl font-extrabold text-slate-900 font-mono tracking-tight">
              {wallet.pendingBalance.toLocaleString('vi-VN')} ₫
            </div>
            <div className="text-xs text-slate-400 mt-1">
              Đơn hàng đang xử lý hoặc yêu cầu rút
            </div>
          </div>
        </div>

        {/* Card 2: Đã chi tiêu mua bản vẽ */}
        <div className="bg-white border border-slate-200/80 rounded-2xl p-5 sm:p-6 shadow-sm flex flex-col justify-between hover:shadow-md transition-all">
          <div className="flex items-center justify-between gap-2 mb-3">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Đã chi tiêu mua bản vẽ
            </span>
            <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-600 border border-emerald-100 flex items-center justify-center text-base">
              <ShoppingOutlined />
            </div>
          </div>
          <div>
            <div className="text-2xl font-extrabold text-slate-900 font-mono tracking-tight">
              {totalSpent.toLocaleString('vi-VN')} ₫
            </div>
            <div className="text-xs text-slate-400 mt-1">
              Tổng chi tiêu mua tài nguyên số
            </div>
          </div>
        </div>
      </div>

      {/* VietQR Top-up Ant Design Modal: presets → live intent → QR + transfer details */}
      <Modal
        open={isTopupModalOpen}
        onCancel={handleCloseModal}
        footer={null}
        title={
          <Space>
            <QrcodeOutlined className="text-[#1677ff] text-lg" />
            <span className="font-semibold">Nạp tiền vào ví qua VietQR (Tự động 24/7)</span>
          </Space>
        }
      >
        {!activeIntent ? (
          <div className="space-y-4">
            {errorMessage && <Alert type="warning" showIcon title={errorMessage} />}
            <div>
              <div className="text-xs font-semibold text-slate-600 dark:text-slate-300 mb-2">
                Chọn mệnh giá nạp
              </div>
              <Radio.Group
                value={selectedPreset}
                onChange={(e) => {
                  setSelectedPreset(e.target.value)
                  setCustomAmount(e.target.value)
                }}
                className="grid grid-cols-2 sm:grid-cols-3 gap-2 w-full"
              >
                {PRESET_AMOUNTS.map((amount) => (
                  <Radio.Button key={amount} value={amount} className="!rounded-lg text-center">
                    {amount.toLocaleString('vi-VN')}₫
                  </Radio.Button>
                ))}
              </Radio.Group>
            </div>
            <div>
              <div className="text-xs font-semibold text-slate-600 dark:text-slate-300 mb-2">
                Hoặc nhập số tiền khác
              </div>
              <Space.Compact className="w-full">
                <InputNumber
                  min={10000}
                  step={10000}
                  placeholder="Nhập tối thiểu 10,000₫"
                  value={customAmount}
                  onChange={(value) => setCustomAmount(Number(value) || 0)}
                  className="w-full"
                />
                <Button disabled className="!bg-slate-100 dark:!bg-neutral-800 !text-slate-600 dark:!text-slate-300 font-medium cursor-default">
                  ₫
                </Button>
              </Space.Compact>
            </div>
            <Button
              type="primary"
              size="large"
              block
              loading={isSubmitting}
              onClick={handleCreateTopup}
              icon={<PlusCircleOutlined />}
              className="!bg-[#1677ff]"
            >
              Tạo mã QR nạp {effectiveAmount.toLocaleString('vi-VN')}₫
            </Button>
            <div className="text-[11px] text-slate-500 dark:text-slate-400">
              Quét mã QR từ ứng dụng ngân hàng bất kỳ. Tiền vào ví tự động sau 3-5 giây (Tự động 24/7).
            </div>
          </div>
        ) : pollStatus === 'paid' ? (
          <Result
            status="success"
            title={`Nạp tiền thành công ${activeIntent.amount.toLocaleString('vi-VN')}₫!`}
            subTitle="Số dư ví của bạn đã được cập nhật."
            extra={
              <Button type="primary" key="ok" onClick={handleCloseModal} className="!bg-[#1677ff]">
                Hoàn tất
              </Button>
            }
          />
        ) : (
          <div className="space-y-4">
            {activeIntent.checkoutUrl && (
              <div className="flex justify-center">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={activeIntent.checkoutUrl}
                  alt="VietQR Chuyển khoản"
                  className="w-56 h-56 rounded-lg border border-slate-200 dark:border-slate-700"
                />
              </div>
            )}

            <Descriptions column={1} size="small" bordered>
              <Descriptions.Item label="Ngân hàng">{activeIntent.bankCode || 'MBBank'}</Descriptions.Item>
              <Descriptions.Item label="Số tài khoản">
                {activeIntent.accountNo || '0987654321'}
              </Descriptions.Item>
              <Descriptions.Item label="Chủ tài khoản">
                {activeIntent.accountName || 'KIENTAOHUB'}
              </Descriptions.Item>
              <Descriptions.Item label="Số tiền">
                <Typography.Text copyable={{ text: String(activeIntent.amount) }}>
                  {activeIntent.amount.toLocaleString('vi-VN')}₫
                </Typography.Text>
              </Descriptions.Item>
              <Descriptions.Item label="Nội dung chuyển khoản">
                <Typography.Text strong copyable={{ text: activeIntent.code }}>
                  {activeIntent.code}
                </Typography.Text>
              </Descriptions.Item>
            </Descriptions>

            {pollStatus === 'polling' && (
              <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                <LoadingOutlined className="text-[#1677ff]" />
                <span>Đang chờ chuyển khoản...</span>
              </div>
            )}

            {pollStatus === 'expired' && (
              <Alert type="error" showIcon title="Mã QR đã hết hạn. Vui lòng tạo giao dịch khác." />
            )}

            <Alert
              title="Lưu ý: Giữ nguyên nội dung chuyển khoản để hệ thống nhận diện và cộng tiền tự động ngay lập tức."
              type="warning"
              showIcon
            />

            <div className="flex justify-end gap-2 pt-2 border-t">
              <Button onClick={handleResetTopup}>Hủy và tạo giao dịch khác</Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
