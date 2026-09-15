import type { Order } from '@/payload-types'
import type { Metadata } from 'next'
import { mergeOpenGraph } from '@/utilities/mergeOpenGraph'
import { OrderItem } from '@/components/OrderItem'
import { headers as getHeaders } from 'next/headers'
import configPromise from '@payload-config'
import { getPayload } from 'payload'
import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

export default async function Orders() {
  const headers = await getHeaders()
  const payload = await getPayload({ config: configPromise })
  const { user } = await payload.auth({ headers })

  if (!user) {
    redirect(`/login?warning=${encodeURIComponent('Vui lòng đăng nhập để xem danh sách đơn hàng.')}`)
  }

  let orders: Order[] = []

  try {
    const ordersResult = await payload.find({
      collection: 'orders',
      limit: 50,
      user,
      overrideAccess: false,
      where: {
        buyer: {
          equals: user.id,
        },
      },
      sort: '-createdAt',
    })

    orders = ordersResult?.docs || []
  } catch (error) {
    console.error('Error fetching orders:', error)
  }

  return (
    <div className="border p-8 rounded-lg bg-card w-full">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-medium tracking-tight">Đơn hàng của tôi</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Lịch sử giao dịch và mua sắm tài nguyên kỹ thuật số
          </p>
        </div>
      </div>

      {orders.length === 0 ? (
        <div className="py-12 text-center">
          <p className="text-muted-foreground">Bạn chưa có đơn hàng nào.</p>
        </div>
      ) : (
        <ul className="flex flex-col gap-6">
          {orders.map((order) => (
            <li key={order.id}>
              <OrderItem order={order} />
            </li>
          ))}
        </ul>
      )}
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
