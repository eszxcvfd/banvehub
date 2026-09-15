import type { Metadata } from 'next'
import { Price } from '@/components/Price'
import { Button } from '@/components/ui/button'
import { formatDateTime } from '@/utilities/formatDateTime'
import { mergeOpenGraph } from '@/utilities/mergeOpenGraph'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { ChevronLeftIcon, FileCode, CheckCircle2 } from 'lucide-react'
import { headers as getHeaders } from 'next/headers'
import configPromise from '@payload-config'
import { getPayload } from 'payload'
import { OrderStatus } from '@/components/OrderStatus'
import { DownloadButton } from '@/components/download/DownloadButton'

export const dynamic = 'force-dynamic'

type PageProps = {
  params: Promise<{ id: string }>
}

export default async function OrderPage({ params }: PageProps) {
  const headers = await getHeaders()
  const payload = await getPayload({ config: configPromise })
  const { user } = await payload.auth({ headers })

  if (!user) {
    redirect(`/login?warning=${encodeURIComponent('Vui lòng đăng nhập để xem đơn hàng.')}`)
  }

  const { id } = await params
  const orderId = Number(id)
  if (isNaN(orderId) || orderId <= 0) {
    notFound()
  }

  let order: any = null
  let orderItems: any[] = []

  try {
    order = await payload.findByID({
      collection: 'orders',
      id: orderId,
      user,
      overrideAccess: false,
    })

    if (!order) {
      notFound()
    }

    // Fetch order items
    const itemsResult = await payload.find({
      collection: 'order_items',
      where: {
        order: {
          equals: orderId,
        },
      },
      depth: 2,
      overrideAccess: true,
    })

    orderItems = itemsResult?.docs || []
  } catch (error) {
    console.error('Error loading order:', error)
    notFound()
  }

  const orderIdentifier = order.code || `#${order.id}`

  return (
    <div className="space-y-6">
      <div className="flex gap-4 justify-between items-center">
        <Button asChild variant="ghost" size="sm">
          <Link href="/orders" className="flex items-center gap-1">
            <ChevronLeftIcon className="w-4 h-4" />
            Tất cả đơn hàng
          </Link>
        </Button>

        <h1 className="text-sm font-mono px-3 py-1 bg-primary/10 rounded-full tracking-wider font-semibold">
          {orderIdentifier}
        </h1>
      </div>

      <div className="bg-card border rounded-xl p-6 md:p-8 flex flex-col gap-8 shadow-sm">
        {/* Order Header Summary */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 pb-6 border-b">
          <div>
            <p className="font-mono uppercase text-muted-foreground text-xs font-semibold">Ngày đặt</p>
            <p className="text-base font-medium mt-1">
              <time dateTime={order.createdAt}>
                {formatDateTime({ date: order.createdAt, format: 'dd/MM/yyyy HH:mm' })}
              </time>
            </p>
          </div>

          <div>
            <p className="font-mono uppercase text-muted-foreground text-xs font-semibold">Tổng thanh toán</p>
            <p className="text-xl font-bold font-mono text-primary mt-1">
              {order.totalAmount !== undefined && (
                <Price as="span" amount={order.totalAmount} currencyCode={order.currency ?? 'VND'} />
              )}
            </p>
          </div>

          <div>
            <p className="font-mono uppercase text-muted-foreground text-xs font-semibold mb-1">Trạng thái</p>
            <OrderStatus status={order.status} />
          </div>
        </div>

        {/* Digital Items List */}
        <div>
          <h2 className="text-base font-semibold mb-4 flex items-center gap-2">
            <FileCode className="w-5 h-5 text-primary" />
            Tài nguyên kỹ thuật số ({orderItems.length})
          </h2>

          {orderItems.length === 0 ? (
            <p className="text-sm text-muted-foreground">Không có mục chi tiết đơn hàng.</p>
          ) : (
            <ul className="flex flex-col divide-y border rounded-lg overflow-hidden bg-background">
              {orderItems.map((item) => {
                const product = typeof item.product === 'object' ? item.product : null
                const productId = product ? product.id : item.product
                const productTitle = product?.title || `Sản phẩm #${productId}`

                return (
                  <li
                    key={item.id}
                    className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                  >
                    <div className="space-y-1">
                      <Link
                        href={`/products/${product?.slug || productId}`}
                        className="font-semibold hover:text-primary transition-colors line-clamp-1"
                      >
                        {productTitle}
                      </Link>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground">
                        <span>Đơn giá: {item.salePrice?.toLocaleString('vi-VN')} ₫</span>
                        <span>•</span>
                        <span className="flex items-center gap-1 text-emerald-600 font-medium">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          Đã cấp quyền tải vĩnh viễn
                        </span>
                      </div>
                    </div>

                    <div className="shrink-0">
                      <DownloadButton
                        productId={productId}
                        productTitle={productTitle}
                        buttonText="Tải tệp ngay"
                        size="sm"
                      />
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params

  return {
    description: `Chi tiết đơn hàng #${id} tại KienTaoHub.`,
    openGraph: mergeOpenGraph({
      title: `Đơn hàng #${id}`,
      url: `/orders/${id}`,
    }),
    title: `Đơn hàng #${id}`,
  }
}
