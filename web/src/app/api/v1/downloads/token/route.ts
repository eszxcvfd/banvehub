import { NextResponse } from 'next/server'
import { getPayload } from 'payload'
import configPromise from '@payload-config'
import { headers as getHeaders } from 'next/headers'
import {
  createDownloadToken,
  UnauthorizedError,
  ForbiddenError,
  EntitlementRequiredError,
  InvalidTokenError,
} from '@/services/download'
import {
  purchaseProduct,
  AlreadyOwnedError,
  SelfPurchaseForbiddenError,
  ProductNotAvailableError,
  ProductNotFoundError,
} from '@/services/purchase'

export async function POST(req: Request) {
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
          message: 'Yêu cầu đăng nhập để lấy link tải tập tin.',
        },
        { status: 401 }
      )
    }

    let body: any
    try {
      body = await req.json()
    } catch {
      return NextResponse.json(
        {
          error: 'INVALID_REQUEST',
          message: 'Dữ liệu yêu cầu không hợp lệ (yêu cầu định dạng JSON).',
        },
        { status: 400 }
      )
    }

    const rawProductId = body?.productId
    if (rawProductId === undefined || rawProductId === null) {
      return NextResponse.json(
        {
          error: 'INVALID_REQUEST',
          message: 'productId là bắt buộc.',
        },
        { status: 400 }
      )
    }

    let productId: number
    if (typeof rawProductId === 'number') {
      if (!Number.isInteger(rawProductId) || rawProductId <= 0) {
        return NextResponse.json(
          {
            error: 'INVALID_REQUEST',
            message: 'productId không hợp lệ.',
          },
          { status: 400 }
        )
      }
      productId = rawProductId
    } else if (typeof rawProductId === 'string' && /^\d+$/.test(rawProductId.trim())) {
      productId = parseInt(rawProductId.trim(), 10)
      if (productId <= 0) {
        return NextResponse.json(
          {
            error: 'INVALID_REQUEST',
            message: 'productId không hợp lệ.',
          },
          { status: 400 }
        )
      }
    } else {
      return NextResponse.json(
        {
          error: 'INVALID_REQUEST',
          message: 'productId không hợp lệ.',
        },
        { status: 400 }
      )
    }

    const userId = typeof user.id === 'string' ? parseInt(user.id, 10) : Number(user.id)
    if (!userId || isNaN(userId) || userId <= 0) {
      return NextResponse.json(
        {
          error: 'UNAUTHORIZED',
          message: 'Yêu cầu đăng nhập để lấy link tải tập tin.',
        },
        { status: 401 }
      )
    }

    let tokenResult
    try {
      tokenResult = await createDownloadToken(payload, {
        userId,
        productId,
      })
    } catch (err: any) {
      if (
        (EntitlementRequiredError && err instanceof EntitlementRequiredError) ||
        err?.name === 'EntitlementRequiredError' ||
        err?.code === 'ENTITLEMENT_REQUIRED'
      ) {
        // R3: Free Asset Instant Download
        // If the product is free, grant entitlement via purchaseProduct and reissue token
        const product = (await payload.findByID({
          collection: 'products',
          id: productId,
          depth: 0,
          overrideAccess: true,
        })) as any

        if (!product) {
          return NextResponse.json(
            {
              error: 'PRODUCT_NOT_FOUND',
              message: 'Không tìm thấy sản phẩm.',
            },
            { status: 404 }
          )
        }

        if (product.isFree || Number(product.price) === 0) {
          try {
            await purchaseProduct(payload, {
              buyerId: userId,
              productId,
            })
          } catch (purchaseErr: any) {
            if (
              !(
                purchaseErr instanceof AlreadyOwnedError ||
                purchaseErr?.code === 'ALREADY_ENTITLED' ||
                purchaseErr?.name === 'AlreadyOwnedError' ||
                purchaseErr?.name === 'AlreadyEntitledError'
              )
            ) {
              throw purchaseErr
            }
          }

          tokenResult = await createDownloadToken(payload, {
            userId,
            productId,
          })
        } else {
          throw err
        }
      } else {
        throw err
      }
    }

    return NextResponse.json({
      success: true,
      data: tokenResult,
    })
  } catch (err: any) {
    if (
      err instanceof SelfPurchaseForbiddenError ||
      err?.code === 'SELF_PURCHASE_FORBIDDEN' ||
      err?.name === 'SelfPurchaseForbiddenError' ||
      err?.name === 'SelfPurchaseError'
    ) {
      return NextResponse.json(
        { error: 'SELF_PURCHASE_FORBIDDEN', message: err.message },
        { status: 400 }
      )
    }

    if (
      (ProductNotAvailableError && err instanceof ProductNotAvailableError) ||
      err?.name === 'ProductNotAvailableError' ||
      err?.code === 'PRODUCT_NOT_AVAILABLE'
    ) {
      return NextResponse.json(
        {
          error: 'PRODUCT_NOT_AVAILABLE',
          message: err.message || 'Sản phẩm hiện không khả dụng để giao dịch.',
        },
        { status: 400 }
      )
    }

    if (
      (ProductNotFoundError && err instanceof ProductNotFoundError) ||
      err?.name === 'ProductNotFoundError' ||
      err?.code === 'PRODUCT_NOT_FOUND'
    ) {
      return NextResponse.json(
        {
          error: 'PRODUCT_NOT_FOUND',
          message: err.message || 'Không tìm thấy sản phẩm yêu cầu.',
        },
        { status: 404 }
      )
    }

    if (err instanceof UnauthorizedError) {
      return NextResponse.json(
        { error: 'UNAUTHORIZED', message: err.message },
        { status: 401 }
      )
    }

    if (err instanceof EntitlementRequiredError || err instanceof ForbiddenError) {
      return NextResponse.json(
        { error: 'FORBIDDEN', message: err.message },
        { status: 403 }
      )
    }

    if (err instanceof InvalidTokenError) {
      return NextResponse.json(
        { error: 'INVALID_REQUEST', message: err.message },
        { status: 400 }
      )
    }

    return NextResponse.json(
      {
        error: 'INTERNAL_ERROR',
        message: 'Đã xảy ra lỗi máy chủ trong quá trình tạo link tải.',
      },
      { status: 500 }
    )
  }
}
