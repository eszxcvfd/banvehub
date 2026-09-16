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
      return NextResponse.json({
        success: true,
        isAuthenticated: false,
        hasEntitlement: false,
        docs: [],
      })
    }

    const { searchParams } = new URL(req.url)
    const productIdParam = searchParams.get('productId')
    let productId: number | null = null

    if (productIdParam !== null) {
      if (!/^\d+$/.test(productIdParam.trim())) {
        return NextResponse.json(
          {
            error: 'INVALID_REQUEST',
            message: 'productId không hợp lệ.',
          },
          { status: 400 }
        )
      }
      productId = parseInt(productIdParam.trim(), 10)
      if (productId <= 0) {
        return NextResponse.json(
          {
            error: 'INVALID_REQUEST',
            message: 'productId không hợp lệ.',
          },
          { status: 400 }
        )
      }
    }

    const userId = typeof user.id === 'string' ? parseInt(user.id, 10) : Number(user.id)
    if (!userId || isNaN(userId) || userId <= 0) {
      return NextResponse.json({
        success: true,
        isAuthenticated: false,
        hasEntitlement: false,
        docs: [],
      })
    }

    const andConditions: Where[] = [
      {
        user: {
          equals: userId,
        },
      },
      {
        status: {
          equals: 'active',
        },
      },
    ]

    if (productId !== null) {
      andConditions.push({
        product: {
          equals: productId,
        },
      })
    }

    const where: Where = {
      and: andConditions,
    }

    const entitlements = await payload.find({
      collection: 'entitlements',
      where,
      limit: productId !== null ? 1 : 100,
      overrideAccess: true,
    })

    const hasEntitlement = entitlements.totalDocs > 0

    return NextResponse.json({
      success: true,
      isAuthenticated: true,
      hasEntitlement,
      docs: entitlements.docs.map((doc: any) => ({
        id: doc.id,
        productId: doc.product
          ? typeof doc.product === 'object'
            ? doc.product?.id
            : doc.product
          : null,
        status: doc.status,
        grantedAt: doc.grantedAt,
        downloadCount: doc.downloadCount,
      })),
    })
  } catch (error: any) {
    return NextResponse.json(
      {
        error: 'INTERNAL_ERROR',
        message: error?.message || 'Có lỗi xảy ra khi kiểm tra quyền sở hữu.',
      },
      { status: 500 }
    )
  }
}
