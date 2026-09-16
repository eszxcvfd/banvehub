import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getPayload } from 'payload'
import configPromise from '@payload-config'
import { headers as getHeaders } from 'next/headers'
import { Button } from '@/components/ui/button'
import { checkRole } from '@/access/utilities'
import { getSellerBalance } from '@/services/earnings'
import { WithdrawalModal } from './WithdrawalModal'
import { WithdrawalHistoryTable, type WithdrawalItem } from './WithdrawalHistoryTable'

export const metadata = {
  title: 'Seller Dashboard | KienTaoHub',
  description: 'Trung tâm quản lý doanh thu, yêu cầu rút tiền và tài nguyên số của người bán.',
}

interface ProductEarningStat {
  productId: string | number
  productTitle: string
  salesCount: number
  grossRevenue: number
  platformFee: number
  netEarnings: number
}

export default async function SellerDashboardPage() {
  const headers = await getHeaders()
  const payload = await getPayload({ config: configPromise })
  const { user } = await payload.auth({ headers })

  if (!user) {
    redirect(`/login?warning=${encodeURIComponent('Vui lòng đăng nhập để truy cập Seller Dashboard.')}`)
  }

  // If not seller or admin, redirect to onboarding
  if (!checkRole(['seller', 'admin'], user)) {
    redirect('/seller/register')
  }

  // 1. Load seller profile
  const profileRes = await payload.find({
    collection: 'seller_profiles',
    where: {
      user: {
        equals: user.id,
      },
    },
    overrideAccess: true,
    limit: 1,
  })
  const profile = profileRes.docs[0]

  // 2. Load financial metrics for the logged-in seller
  const balance = await getSellerBalance(payload, user.id)

  // 3. Load seller's withdrawal history
  const withdrawalsRes = await payload.find({
    collection: 'withdrawals',
    where: { seller: { equals: user.id } },
    sort: '-createdAt',
    limit: 20,
    overrideAccess: true,
  })

  const formattedWithdrawals: WithdrawalItem[] = withdrawalsRes.docs.map((w: any) => ({
    id: Number(w.id),
    code: w.code,
    amount: Number(w.amount),
    currency: w.currency,
    status: w.status,
    bankInfo: w.bankInfo || null,
    requestedAt: w.requestedAt,
    createdAt: w.createdAt,
  }))

  // 4. Load seller earnings breakdown by product
  const earningsRes = await payload.find({
    collection: 'seller_earnings',
    where: { seller: { equals: user.id } },
    limit: 1000,
    overrideAccess: true,
    depth: 1,
  })

  const productStatsMap = new Map<string | number, ProductEarningStat>()

  for (const doc of earningsRes.docs) {
    if (doc.status === 'REVERSED') continue
    const prod = doc.product
    const prodId = typeof prod === 'object' && prod !== null ? prod.id : prod || 'unknown'
    const prodTitle =
      typeof prod === 'object' && prod !== null && (prod as any).title
        ? (prod as any).title
        : `Sản phẩm #${prodId}`

    const existing = productStatsMap.get(prodId) || {
      productId: prodId,
      productTitle: prodTitle,
      salesCount: 0,
      grossRevenue: 0,
      platformFee: 0,
      netEarnings: 0,
    }

    existing.salesCount += 1
    existing.grossRevenue += Number(doc.salePrice || 0)
    existing.platformFee += Number(doc.platformFee || 0)
    existing.netEarnings += Number(doc.sellerAmount || 0)

    productStatsMap.set(prodId, existing)
  }

  const productEarningsList = Array.from(productStatsMap.values())

  // 5. Load seller's products
  const productsRes = await payload.find({
    collection: 'products',
    where: {
      seller: {
        equals: user.id,
      },
    },
    overrideAccess: true,
    sort: '-createdAt',
    limit: 50,
  })
  const products = productsRes.docs

  // KPI calculations for products
  const totalCount = products.length
  const pendingCount = products.filter(
    (p) => p.moderationStatus === 'submitted' || p.moderationStatus === 'in_review',
  ).length
  const approvedCount = products.filter(
    (p) => p.moderationStatus === 'approved' || p._status === 'published',
  ).length
  const changesCount = products.filter((p) => p.moderationStatus === 'changes_requested').length

  const getStatusBadge = (status?: string | null, _pubStatus?: string | null) => {
    switch (status) {
      case 'submitted':
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-600 border border-amber-500/20">
            Chờ kiểm duyệt
          </span>
        )
      case 'in_review':
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-500/10 text-blue-600 border border-blue-500/20">
            Đang thẩm định
          </span>
        )
      case 'changes_requested':
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-orange-500/10 text-orange-600 border border-orange-500/20">
            Cần chỉnh sửa
          </span>
        )
      case 'rejected':
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-500/10 text-rose-600 border border-rose-500/20">
            Từ chối
          </span>
        )
      case 'approved':
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-600 border border-emerald-500/20">
            Đã duyệt (Công khai)
          </span>
        )
      default:
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-secondary text-secondary-foreground border">
            Bản nháp (Draft)
          </span>
        )
    }
  }

  return (
    <div className="container max-w-7xl py-10 px-4 mx-auto space-y-8">
      {/* Top Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-6 border rounded-xl bg-card shadow-sm">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-foreground tracking-tight">
              {profile?.displayName || user.name || 'Người bán'}
            </h1>
            <span className="text-xs px-2 py-0.5 font-semibold bg-primary/10 text-primary rounded-full">
              {profile?.status === 'active' ? 'Đối tác đã xác thực' : 'Tài khoản người bán'}
            </span>
          </div>
          <p className="text-sm text-muted-foreground">
            {profile?.bio || 'Quản lý tài chính doanh thu, số dư ví người bán và kho bản vẽ kỹ thuật số.'}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <WithdrawalModal availableBalance={balance.availableBalance} />
          <Button asChild size="default" variant="outline" className="font-semibold shadow-sm">
            <Link href="/seller/products/new">
              <svg className="w-4 h-4 mr-1.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Đăng bản vẽ mới
            </Link>
          </Button>
        </div>
      </div>

      {/* Financial KPI Cards */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-bold text-foreground">Tổng quan tài chính & Doanh thu</h2>
          <span className="text-xs text-muted-foreground">Cập nhật theo thời gian thực (VND)</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          {/* 1. Số dư khả dụng */}
          <div className="p-5 border rounded-xl bg-card shadow-sm space-y-2 border-emerald-500/20 bg-emerald-500/5">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-emerald-600 uppercase tracking-wider">
                Số dư khả dụng
              </p>
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
            </div>
            <p className="text-2xl font-bold text-emerald-600">
              {balance.availableBalance.toLocaleString('vi-VN')} ₫
            </p>
            <div className="pt-1">
              <WithdrawalModal availableBalance={balance.availableBalance} />
            </div>
          </div>

          {/* 2. Tạm giữ 7 ngày */}
          <div className="p-5 border rounded-xl bg-card shadow-sm space-y-1">
            <p className="text-xs font-semibold text-amber-600 uppercase tracking-wider">
              Tạm giữ 7 ngày
            </p>
            <p className="text-2xl font-bold text-amber-600">
              {balance.pendingBalance.toLocaleString('vi-VN')} ₫
            </p>
            <p className="text-[11px] text-muted-foreground">Tự động mở khóa sau chu kỳ giữ tiền</p>
          </div>

          {/* 3. Đang xử lý rút */}
          <div className="p-5 border rounded-xl bg-card shadow-sm space-y-1">
            <p className="text-xs font-semibold text-blue-600 uppercase tracking-wider">
              Đang xử lý rút
            </p>
            <p className="text-2xl font-bold text-blue-600">
              {balance.reservedBalance.toLocaleString('vi-VN')} ₫
            </p>
            <p className="text-[11px] text-muted-foreground">Lệnh rút tiền đang thẩm định/chuyển</p>
          </div>

          {/* 4. Tổng tiền đã rút */}
          <div className="p-5 border rounded-xl bg-card shadow-sm space-y-1">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Tổng tiền đã rút
            </p>
            <p className="text-2xl font-bold text-foreground">
              {balance.withdrawnTotal.toLocaleString('vi-VN')} ₫
            </p>
            <p className="text-[11px] text-muted-foreground">Đã chuyển thành công về ngân hàng</p>
          </div>

          {/* 5. Tổng thu nhập tích lũy */}
          <div className="p-5 border rounded-xl bg-card shadow-sm space-y-1">
            <p className="text-xs font-semibold text-primary uppercase tracking-wider">
              Tổng thu nhập tích lũy
            </p>
            <p className="text-2xl font-bold text-primary">
              {balance.totalEarned.toLocaleString('vi-VN')} ₫
            </p>
            <p className="text-[11px] text-muted-foreground">Tổng doanh thu bán bản vẽ từ trước tới nay</p>
          </div>
        </div>
      </div>

      {/* Withdrawal History Section */}
      <div className="border rounded-xl bg-card shadow-sm overflow-hidden">
        <div className="p-5 border-b flex items-center justify-between bg-muted/20">
          <div>
            <h2 className="text-lg font-bold text-foreground">Lịch sử rút tiền & Chi trả (Payouts)</h2>
            <p className="text-xs text-muted-foreground">
              Theo dõi trạng thái xử lý các lệnh rút tiền về tài khoản ngân hàng
            </p>
          </div>
          <span className="text-xs text-muted-foreground">{formattedWithdrawals.length} giao dịch gần nhất</span>
        </div>
        <div className="p-5">
          <WithdrawalHistoryTable initialWithdrawals={formattedWithdrawals} />
        </div>
      </div>

      {/* Per-Product Earnings Breakdown Table */}
      <div className="border rounded-xl bg-card shadow-sm overflow-hidden">
        <div className="p-5 border-b flex items-center justify-between bg-muted/20">
          <div>
            <h2 className="text-lg font-bold text-foreground">Doanh thu chi tiết theo từng sản phẩm</h2>
            <p className="text-xs text-muted-foreground">
              Báo cáo số lượt bán, doanh số snapshot, phí nền tảng và thực nhận của người bán
            </p>
          </div>
          <span className="text-xs text-muted-foreground">{productEarningsList.length} sản phẩm có lượt bán</span>
        </div>

        {productEarningsList.length === 0 ? (
          <div className="py-12 text-center space-y-2">
            <p className="text-sm text-muted-foreground">Chưa phát sinh giao dịch bán hàng nào.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b bg-muted/40 text-muted-foreground font-medium text-xs uppercase tracking-wider">
                <tr>
                  <th className="py-3.5 px-4">Tên tài nguyên</th>
                  <th className="py-3.5 px-4 text-center">Lượt bán</th>
                  <th className="py-3.5 px-4 text-right">Doanh số</th>
                  <th className="py-3.5 px-4 text-right">Phí nền tảng</th>
                  <th className="py-3.5 px-4 text-right">Thực nhận người bán</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {productEarningsList.map((stat) => (
                  <tr key={stat.productId} className="hover:bg-muted/30 transition-colors">
                    <td className="py-4 px-4 font-semibold text-foreground">
                      {stat.productTitle}
                      <span className="block text-xs text-muted-foreground font-mono">
                        ID: #{stat.productId}
                      </span>
                    </td>
                    <td className="py-4 px-4 text-center font-semibold">
                      {stat.salesCount.toLocaleString('vi-VN')}
                    </td>
                    <td className="py-4 px-4 text-right font-medium text-foreground">
                      {stat.grossRevenue.toLocaleString('vi-VN')} ₫
                    </td>
                    <td className="py-4 px-4 text-right text-xs text-muted-foreground">
                      -{stat.platformFee.toLocaleString('vi-VN')} ₫
                    </td>
                    <td className="py-4 px-4 text-right font-bold text-emerald-600">
                      {stat.netEarnings.toLocaleString('vi-VN')} ₫
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Product Repository Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="p-5 border rounded-xl bg-card shadow-sm space-y-1">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Tổng bản vẽ</p>
          <p className="text-3xl font-bold text-foreground">{totalCount}</p>
        </div>
        <div className="p-5 border rounded-xl bg-card shadow-sm space-y-1">
          <p className="text-xs font-medium text-amber-600 uppercase tracking-wider">Chờ kiểm duyệt</p>
          <p className="text-3xl font-bold text-amber-600">{pendingCount}</p>
        </div>
        <div className="p-5 border rounded-xl bg-card shadow-sm space-y-1">
          <p className="text-xs font-medium text-emerald-600 uppercase tracking-wider">Đã phát hành</p>
          <p className="text-3xl font-bold text-emerald-600">{approvedCount}</p>
        </div>
        <div className="p-5 border rounded-xl bg-card shadow-sm space-y-1">
          <p className="text-xs font-medium text-orange-600 uppercase tracking-wider">Cần chỉnh sửa</p>
          <p className="text-3xl font-bold text-orange-600">{changesCount}</p>
        </div>
      </div>

      {/* Products Table */}
      <div className="border rounded-xl bg-card shadow-sm overflow-hidden">
        <div className="p-5 border-b flex items-center justify-between bg-muted/20">
          <h2 className="text-lg font-bold text-foreground">Danh sách bản vẽ & tài nguyên số</h2>
          <span className="text-xs text-muted-foreground">{products.length} sản phẩm</span>
        </div>

        {products.length === 0 ? (
          <div className="py-16 text-center space-y-4">
            <div className="w-12 h-12 rounded-full bg-primary/10 text-primary mx-auto flex items-center justify-center">
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M9 13h6m-3-3v6m5 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                />
              </svg>
            </div>
            <div className="space-y-1">
              <h3 className="text-base font-semibold text-foreground">Chưa có bản vẽ nào</h3>
              <p className="text-sm text-muted-foreground max-w-sm mx-auto">
                Bắt đầu kiếm thêm thu nhập bằng cách đăng tải bản vẽ AutoCAD, Revit hoặc SketchUp đầu tiên của bạn.
              </p>
            </div>
            <Button asChild>
              <Link href="/seller/products/new">Đăng bản vẽ ngay</Link>
            </Button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b bg-muted/40 text-muted-foreground font-medium text-xs uppercase tracking-wider">
                <tr>
                  <th className="py-3.5 px-4">Tên tài nguyên / Sản phẩm</th>
                  <th className="py-3.5 px-4">Định dạng file</th>
                  <th className="py-3.5 px-4">Đơn giá (VND)</th>
                  <th className="py-3.5 px-4">Trạng thái kiểm duyệt</th>
                  <th className="py-3.5 px-4">Ghi chú từ ban kiểm duyệt</th>
                  <th className="py-3.5 px-4 text-right">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {products.map((product) => {
                  const specs = product.technicalSpecs
                  const isFree = product.isFree || product.price === 0

                  return (
                    <tr key={product.id} className="hover:bg-muted/30 transition-colors">
                      <td className="py-4 px-4">
                        <div className="font-semibold text-foreground">{product.title}</div>
                        <div className="text-xs text-muted-foreground">
                          ID: #{product.id} • Slug: {product.slug}
                        </div>
                      </td>
                      <td className="py-4 px-4 text-muted-foreground">
                        {specs?.fileFormat ? (
                          <span className="font-mono text-xs px-2 py-0.5 rounded bg-muted border">
                            {specs.fileFormat}
                          </span>
                        ) : (
                          '—'
                        )}
                        {specs?.softwareVersion && (
                          <span className="text-xs block text-muted-foreground mt-0.5">
                            {specs.softwareVersion}
                          </span>
                        )}
                      </td>
                      <td className="py-4 px-4 font-medium">
                        {isFree ? (
                          <span className="text-emerald-600 font-semibold">Miễn phí</span>
                        ) : (
                          <span>{Number(product.price).toLocaleString('vi-VN')} ₫</span>
                        )}
                      </td>
                      <td className="py-4 px-4">
                        {getStatusBadge(product.moderationStatus, product._status)}
                      </td>
                      <td className="py-4 px-4 max-w-xs">
                        {product.moderationNotes ? (
                          <div className="text-xs text-orange-600 bg-orange-500/10 p-2 rounded border border-orange-500/20 font-medium">
                            {product.moderationNotes}
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground italic">Không có</span>
                        )}
                      </td>
                      <td className="py-4 px-4 text-right">
                        {product._status === 'published' ? (
                          <Button asChild variant="outline" size="sm">
                            <Link href={`/products/${product.slug}`} target="_blank">
                              Xem trang live
                            </Link>
                          </Button>
                        ) : (
                          <span className="text-xs text-muted-foreground">Đang xử lý</span>
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
    </div>
  )
}
