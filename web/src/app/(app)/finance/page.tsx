import { redirect } from 'next/navigation'
import { getPayload } from 'payload'
import configPromise from '@payload-config'
import { headers as getHeaders } from 'next/headers'
import { checkRole } from '@/access/utilities'
import { FinanceOperations, type AdminWithdrawalItem, type AdminRefundItem } from './FinanceOperations'

export const metadata = {
  title: 'Trung tâm Vận hành Tài chính (Finance Operations) | KienTaoHub',
  description: 'Quản lý yêu cầu rút tiền của người bán, đối soát bồi hoàn và kiểm soát sổ cái tài chính.',
}

export default async function FinancePage() {
  const headers = await getHeaders()
  const payload = await getPayload({ config: configPromise })
  const { user } = await payload.auth({ headers })

  if (!user || !checkRole(['admin', 'financeAdmin'], user)) {
    redirect(
      '/login?warning=' +
        encodeURIComponent('Yêu cầu quyền Finance Admin hoặc Admin để truy cập trung tâm vận hành tài chính.'),
    )
  }

  // 1. Fetch recent withdrawals
  const withdrawalsRes = await payload.find({
    collection: 'withdrawals',
    sort: '-requestedAt',
    limit: 100,
    overrideAccess: true,
    depth: 1,
  })

  const formattedWithdrawals: AdminWithdrawalItem[] = withdrawalsRes.docs.map((w: any) => ({
    id: Number(w.id),
    code: w.code,
    amount: Number(w.amount),
    currency: w.currency,
    status: w.status,
    bankInfo: w.bankInfo || null,
    seller: typeof w.seller === 'object' && w.seller !== null ? w.seller : w.seller,
    requestedAt: w.requestedAt,
    reviewedAt: w.reviewedAt,
    paidAt: w.paidAt,
    rejectionReason: w.rejectionReason,
    notes: w.notes,
  }))

  // 2. Fetch recent refunds
  const refundsRes = await payload.find({
    collection: 'refunds',
    sort: '-createdAt',
    limit: 100,
    overrideAccess: true,
    depth: 1,
  })

  const formattedRefunds: AdminRefundItem[] = refundsRes.docs.map((r: any) => ({
    id: Number(r.id),
    code: r.code,
    order: r.order,
    orderItem: r.orderItem,
    buyer: r.buyer,
    seller: r.seller,
    amount: Number(r.amount),
    platformFeeRefunded: Number(r.platformFeeRefunded || 0),
    sellerAmountRefunded: Number(r.sellerAmountRefunded || 0),
    reason: r.reason || '',
    status: r.status,
    processedBy: r.processedBy,
    createdAt: r.createdAt,
  }))

  // KPI Quick Stats
  const requestedWithdrawals = formattedWithdrawals.filter(
    (w) => w.status === 'REQUESTED' || w.status === 'UNDER_REVIEW',
  )
  const totalRequestedAmount = requestedWithdrawals.reduce((sum, w) => sum + w.amount, 0)
  const paidWithdrawals = formattedWithdrawals.filter((w) => w.status === 'PAID')
  const totalPaidAmount = paidWithdrawals.reduce((sum, w) => sum + w.amount, 0)
  const totalRefundAmount = formattedRefunds.reduce((sum, r) => sum + r.amount, 0)

  return (
    <div className="container max-w-7xl py-10 px-4 mx-auto space-y-8">
      {/* Header Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-6 border rounded-xl bg-card shadow-sm">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="text-xs uppercase font-bold tracking-wider text-primary px-2.5 py-0.5 rounded-full bg-primary/10 border border-primary/20">
              Finance Hub
            </span>
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-foreground">
              Vận hành Tài chính & Quyết toán
            </h1>
          </div>
          <p className="text-sm text-muted-foreground">
            Xét duyệt chi trả rút tiền người bán, xử lý bồi hoàn và giám sát các giao dịch theo tiêu chuẩn kế toán bất biến.
          </p>
        </div>
        <div className="text-right">
          <span className="text-xs text-muted-foreground block">Tài khoản quản trị viên:</span>
          <span className="text-sm font-semibold text-foreground">
            {user.name || user.email} ({user.roles?.join(', ')})
          </span>
        </div>
      </div>

      {/* KPI Overview */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="p-5 border rounded-xl bg-card shadow-sm space-y-1 border-amber-500/20 bg-amber-500/5">
          <p className="text-xs font-semibold text-amber-600 uppercase tracking-wider">
            Chờ xử lý rút ({requestedWithdrawals.length})
          </p>
          <p className="text-2xl font-bold text-amber-600">
            {totalRequestedAmount.toLocaleString('vi-VN')} ₫
          </p>
          <p className="text-[11px] text-muted-foreground">Yêu cầu mới & đang thẩm định</p>
        </div>

        <div className="p-5 border rounded-xl bg-card shadow-sm space-y-1 border-emerald-500/20 bg-emerald-500/5">
          <p className="text-xs font-semibold text-emerald-600 uppercase tracking-wider">
            Đã thanh toán chi trả ({paidWithdrawals.length})
          </p>
          <p className="text-2xl font-bold text-emerald-600">
            {totalPaidAmount.toLocaleString('vi-VN')} ₫
          </p>
          <p className="text-[11px] text-muted-foreground">Đã chuyển khoản thành công</p>
        </div>

        <div className="p-5 border rounded-xl bg-card shadow-sm space-y-1 border-rose-500/20 bg-rose-500/5">
          <p className="text-xs font-semibold text-rose-600 uppercase tracking-wider">
            Tổng tiền đã bồi hoàn ({formattedRefunds.length})
          </p>
          <p className="text-2xl font-bold text-rose-600">
            {totalRefundAmount.toLocaleString('vi-VN')} ₫
          </p>
          <p className="text-[11px] text-muted-foreground">Bút toán bù trừ ví người mua</p>
        </div>
      </div>

      {/* Operations Interface */}
      <FinanceOperations
        initialWithdrawals={formattedWithdrawals}
        initialRefunds={formattedRefunds}
      />
    </div>
  )
}
