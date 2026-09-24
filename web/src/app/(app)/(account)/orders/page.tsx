import type { Metadata } from 'next'
import { mergeOpenGraph } from '@/utilities/mergeOpenGraph'
import { headers as getHeaders } from 'next/headers'
import configPromise from '@payload-config'
import { getPayload } from 'payload'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { OrdersTableClient, type OrderTableRow } from '@/components/orders/OrdersTableClient'

export const dynamic = 'force-dynamic'

export default async function OrdersPage() {
  const headers = await getHeaders()
  const payload = await getPayload({ config: configPromise })
  const { user } = await payload.auth({ headers })

  if (!user) {
    redirect(`/login?warning=${encodeURIComponent('Vui lòng đăng nhập để xem danh sách đơn hàng.')}`)
  }

  let ordersData: OrderTableRow[] = []

  try {
    const ordersResult = await payload.find({
      collection: 'orders',
      limit: 100,
      user,
      overrideAccess: false,
      where: {
        buyer: {
          equals: user.id,
        },
      },
      sort: '-createdAt',
      depth: 2,
    })

    const rawOrders = ordersResult?.docs || []

    ordersData = rawOrders.map((order: any) => {
      const seenProductIds = new Set<number>()
      const disputeProducts = (order.items?.docs || []).flatMap((item: any) => {
        if (typeof item !== 'object' || item === null) return []
        const product = item.product
        if (typeof product !== 'object' || product === null) return []
        if (seenProductIds.has(product.id)) return []
        seenProductIds.add(product.id)
        return [{ id: product.id, title: product.title }]
      })

      const productTitles = (order.items?.docs || [])
        .map((item: any) => {
          const product = typeof item.product === 'object' ? item.product : null
          return product?.title || ''
        })
        .filter(Boolean)

      return {
        id: order.id,
        code: order.code || `#${order.id}`,
        createdAt: order.createdAt,
        totalAmount: order.totalAmount ?? 0,
        currency: order.currency ?? 'VND',
        status: order.status || 'PENDING',
        itemsCount: (order.items?.docs || []).length,
        productTitles,
        disputeProducts,
      }
    })
  } catch (error) {
    console.error('Error fetching orders:', error)
  }

  return (
    <div className="w-full flex flex-col gap-6" data-testid="orders-page">
      {/* Top Breadcrumb */}
      <div className="flex items-center gap-1.5 text-xs text-slate-400">
        <Link href="/" className="hover:text-slate-600 transition-colors">
          Trang chủ
        </Link>
        <span>&gt;</span>
        <Link href="/account" className="text-slate-600 font-medium hover:text-slate-900 transition-colors">
          Tài khoản
        </Link>
        <span>&gt;</span>
        <span className="text-slate-900 font-semibold">Lịch sử đơn hàng</span>
      </div>

      <div className="bg-white border border-slate-200/80 rounded-2xl shadow-sm p-6 sm:p-8 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-slate-100">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-xl bg-blue-50 text-[#1677ff] border border-blue-100/60 flex items-center justify-center shrink-0 shadow-xs text-xl">
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
              </svg>
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 !mb-0">
                Đơn hàng của tôi
              </h1>
              <p className="text-xs sm:text-sm text-slate-400 mt-1 mb-0">
                Lịch sử giao dịch và quyền truy cập tải tài nguyên kỹ thuật số
              </p>
            </div>
          </div>
          <span className="hidden sm:inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-slate-100 text-slate-600 border border-slate-200">
            {ordersData.length} đơn hàng
          </span>
        </div>

        <OrdersTableClient initialOrders={ordersData} />
      </div>
    </div>
  )
}

export const metadata: Metadata = {
  description: 'Danh sách đơn hàng của bạn tại KienTaoHub.',
  openGraph: mergeOpenGraph({
    title: 'Đơn hàng của tôi',
    url: '/orders',
  }),
  title: 'Đơn hàng của tôi',
}
