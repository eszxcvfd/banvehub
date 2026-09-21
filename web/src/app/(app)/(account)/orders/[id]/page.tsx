import type { Metadata } from 'next'
import { mergeOpenGraph } from '@/utilities/mergeOpenGraph'
import { notFound, redirect } from 'next/navigation'
import { headers as getHeaders } from 'next/headers'
import configPromise from '@payload-config'
import { getPayload } from 'payload'
import {
  OrderDetailClient,
  type OrderDetailItem,
} from '@/components/orders/OrderDetailClient'

export const dynamic = 'force-dynamic'

type PageProps = {
  params: Promise<{ id: string }>
}

export default async function OrderPage({ params }: PageProps) {
  const headers = await getHeaders()
  const payload = await getPayload({ config: configPromise })
  const { user } = await payload.auth({ headers })

  if (!user) {
    redirect(
      `/login?warning=${encodeURIComponent('Vui lòng đăng nhập để xem đơn hàng.')}`,
    )
  }

  const { id } = await params
  const orderId = Number(id)
  if (isNaN(orderId) || orderId <= 0) {
    notFound()
  }

  let order: any = null
  let orderItems: any[] = []
  let tickets: any[] = []

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

    // Fetch existing dispute tickets for this order
    const ticketsResult = await payload.find({
      collection: 'tickets',
      where: {
        order: {
          equals: orderId,
        },
      },
      sort: '-createdAt',
      depth: 2,
      overrideAccess: true,
    })
    tickets = ticketsResult?.docs || []
  } catch (error) {
    console.error('Error loading order:', error)
    notFound()
  }

  const productsList = orderItems.map((item) => {
    const product = typeof item.product === 'object' ? item.product : null
    const productId = product ? product.id : item.product
    return {
      id: productId,
      title: product?.title || `Sản phẩm #${productId}`,
    }
  })

  const clientOrderItems: OrderDetailItem[] = orderItems.map((item) => {
    const product = typeof item.product === 'object' ? item.product : null
    const productId = product ? product.id : item.product
    const productTitle = product?.title || `Sản phẩm #${productId}`
    const productSlug = product?.slug || productId
    const technicalSpecs = product?.technicalSpecs || {}
    // Only `technicalSpecs.softwareVersion` exists on the Products schema (the sibling
    // `technicalSpecs.version` and `product.softwareSupport` this chain used to read are not fields at
    // all), and when the record has no version the order passes nothing rather than a claim
    // (decision 0018 clause 2).
    const softwareVersion = technicalSpecs.softwareVersion || undefined

    return {
      key: item.id,
      id: item.id,
      productId,
      productTitle,
      productSlug,
      // `product.format` does not exist on the Products schema (the value lives in
      // `technicalSpecs.fileFormat`), so every order used to print the literal 'CAD'. The record's own
      // format is passed through and the cell's matcher keys it on the stored extensions (.dwg, .rvt,
      // .skp, .max, .pdf, .ls) with an honest absence for an empty record (decision 0018 clause 2).
      format: product?.technicalSpecs?.fileFormat || undefined,
      softwareVersion,
      salePrice: item.salePrice || 0,
    }
  })

  return (
    <OrderDetailClient
      order={{
        id: order.id,
        code: order.code,
        createdAt: order.createdAt,
        status: order.status,
        totalAmount: order.totalAmount,
        currency: order.currency,
      }}
      user={{
        id: user.id,
        email: user.email,
        name: user.name,
      }}
      orderItems={clientOrderItems}
      productsList={productsList}
      tickets={tickets}
    />
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
