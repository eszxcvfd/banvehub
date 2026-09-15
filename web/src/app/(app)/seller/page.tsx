import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getPayload } from 'payload'
import configPromise from '@payload-config'
import { headers as getHeaders } from 'next/headers'
import { Button } from '@/components/ui/button'
import { checkRole } from '@/access/utilities'

export const metadata = {
  title: 'Seller Dashboard | KienTaoHub',
  description: 'Trung tâm quản lý sản phẩm, tệp bản vẽ số và trạng thái kiểm duyệt.',
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

  // Load seller profile
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

  // Load seller's products (both draft and published)
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

  // KPI calculations
  const totalCount = products.length
  const pendingCount = products.filter((p) => p.moderationStatus === 'submitted' || p.moderationStatus === 'in_review').length
  const approvedCount = products.filter((p) => p.moderationStatus === 'approved' || p._status === 'published').length
  const changesCount = products.filter((p) => p.moderationStatus === 'changes_requested').length

  const getStatusBadge = (status?: string | null, pubStatus?: string | null) => {
    switch (status) {
      case 'submitted':
        return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-600 border border-amber-500/20">Chờ kiểm duyệt</span>
      case 'in_review':
        return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-500/10 text-blue-600 border border-blue-500/20">Đang thẩm định</span>
      case 'changes_requested':
        return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-orange-500/10 text-orange-600 border border-orange-500/20">Cần chỉnh sửa</span>
      case 'rejected':
        return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-500/10 text-rose-600 border border-rose-500/20">Từ chối</span>
      case 'approved':
        return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-600 border border-emerald-500/20">Đã duyệt (Công khai)</span>
      default:
        return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-secondary text-secondary-foreground border">Bản nháp (Draft)</span>
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
            {profile?.bio || 'Quản lý kho tài nguyên bản vẽ, theo dõi quy trình kiểm duyệt và trạng thái phát hành.'}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button asChild size="lg" className="font-semibold shadow-sm">
            <Link href="/seller/products/new">
              <svg className="w-5 h-5 mr-1.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Đăng bản vẽ mới
            </Link>
          </Button>
        </div>
      </div>

      {/* KPI Stats */}
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
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 13h6m-3-3v6m5 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
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
                        <div className="text-xs text-muted-foreground">ID: #{product.id} • Slug: {product.slug}</div>
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
