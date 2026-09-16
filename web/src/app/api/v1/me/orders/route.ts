import { NextResponse } from 'next/server'
import { getPayload } from 'payload'
import configPromise from '@payload-config'
import { headers as getHeaders } from 'next/headers'
import type { Where } from 'payload'

export async function GET(req: Request) {
  try {
    let headers: Headers
    try {
      headers = await getHeaders()
    } catch {
      headers = req.headers
    }
    const payload = await getPayload({ config: configPromise })
    const { user } = await payload.auth({ headers })

    if (!user) {
      return NextResponse.json(
        {
          error: 'UNAUTHORIZED',
          message: 'Yêu cầu đăng nhập để xem danh sách đơn hàng.',
        },
        { status: 401 }
      )
    }

    const { searchParams } = new URL(req.url)
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10) || 1)
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '20', 10) || 20))
    const statusParam = searchParams.get('status')

    const where: Where = {
      buyer: {
        equals: user.id,
      },
    }

    if (statusParam && ['PENDING', 'COMPLETED', 'CANCELLED', 'REFUNDED'].includes(statusParam.toUpperCase())) {
      where.status = {
        equals: statusParam.toUpperCase(),
      }
    }

    const orders = await payload.find({
      collection: 'orders',
      where,
      sort: '-createdAt',
      page,
      limit,
      depth: 2,
      overrideAccess: true,
    })

    return NextResponse.json({
      success: true,
      docs: orders.docs.map((doc: any) => ({
        id: doc.id,
        code: doc.code,
        totalAmount: Number(doc.totalAmount),
        currency: doc.currency,
        status: doc.status,
        paymentSource: doc.paymentSource,
        paidAt: doc.paidAt,
        createdAt: doc.createdAt,
        items: Array.isArray(doc.items?.docs)
          ? doc.items.docs.map((item: any) => ({
              id: item.id,
              productId: typeof item.product === 'object' ? item.product?.id : item.product,
              productTitle: typeof item.product === 'object' ? item.product?.title : undefined,
              productSlug: typeof item.product === 'object' ? item.product?.slug : undefined,
              salePrice: Number(item.salePrice),
              sellerId: typeof item.seller === 'object' ? item.seller?.id : item.seller,
            }))
          : [],
      })),
      totalDocs: orders.totalDocs,
      totalPages: orders.totalPages,
      page: orders.page,
      limit: orders.limit,
      hasNextPage: orders.hasNextPage,
      hasPrevPage: orders.hasPrevPage,
    })
  } catch (error: any) {
    return NextResponse.json(
      {
        error: 'INTERNAL_ERROR',
        message: error?.message || 'Có lỗi xảy ra khi truy vấn danh sách đơn hàng.',
      },
      { status: 500 }
    )
  }
}
