import { NextResponse } from 'next/server'
import { getPayload } from 'payload'
import configPromise from '@payload-config'
import { headers as getHeaders } from 'next/headers'
import {
  purchaseProduct,
  SelfPurchaseForbiddenError,
  SelfPurchaseError,
  AlreadyOwnedError,
  AlreadyEntitledError,
  ProductNotAvailableError,
  ProductNotFoundError,
} from '@/services/purchase'
import { InsufficientFundsError } from '@/services/wallet'

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
          message: 'Yêu cầu đăng nhập để thực hiện mua sản phẩm.',
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

    const productId = typeof rawProductId === 'number' ? rawProductId : parseInt(String(rawProductId), 10)
    if (isNaN(productId) || productId <= 0) {
      return NextResponse.json(
        {
          error: 'INVALID_REQUEST',
          message: 'productId phải là số nguyên dương hợp lệ.',
        },
        { status: 400 }
      )
    }

    const buyerId = typeof user.id === 'string' ? parseInt(user.id, 10) : user.id

    const result = await purchaseProduct(payload, {
      buyerId,
      productId,
    })

    return NextResponse.json(
      {
        success: true,
        orderId: result.orderId,
        orderCode: result.orderCode,
        entitlementId: result.entitlementId,
        productTitle: result.productTitle,
        pricePaid: result.pricePaid,
      },
      { status: 200 }
    )
  } catch (err: any) {
    // 1. SelfPurchaseForbiddenError (BR-04 Anti-Self-Purchase) -> 400 Bad Request
    if (
      (SelfPurchaseForbiddenError && err instanceof SelfPurchaseForbiddenError) ||
      (SelfPurchaseError && err instanceof SelfPurchaseError) ||
      err?.name === 'SelfPurchaseForbiddenError' ||
      err?.name === 'SelfPurchaseError' ||
      err?.code === 'SELF_PURCHASE_FORBIDDEN' ||
      err?.message?.includes('SELF_PURCHASE') ||
      err?.message?.includes('BR-04') ||
      err?.message?.includes('Anti-self-purchase')
    ) {
      return NextResponse.json(
        {
          error: 'SELF_PURCHASE_FORBIDDEN',
          message: err.message || 'Người bán không thể mua sản phẩm của chính mình (BR-04).',
        },
        { status: 400 }
      )
    }

    // 2. InsufficientFundsError -> 400 Bad Request
    if (
      (InsufficientFundsError && err instanceof InsufficientFundsError) ||
      err?.name === 'InsufficientFundsError' ||
      err?.code === 'INSUFFICIENT_FUNDS' ||
      err?.message?.includes('Số dư ví không đủ')
    ) {
      return NextResponse.json(
        {
          error: 'INSUFFICIENT_FUNDS',
          message: err.message || 'Số dư ví không đủ để thực hiện giao dịch.',
          required: err.requiredAmount ?? err.required ?? 0,
          balance: err.balance ?? 0,
        },
        { status: 400 }
      )
    }

    // 3. ProductNotAvailableError (Draft / Rejected / Inactive) -> 400 Bad Request
    if (
      (ProductNotAvailableError && err instanceof ProductNotAvailableError) ||
      err?.name === 'ProductNotAvailableError' ||
      err?.code === 'PRODUCT_NOT_AVAILABLE' ||
      err?.message?.includes('PRODUCT_NOT_AVAILABLE') ||
      err?.message?.includes('không khả dụng')
    ) {
      return NextResponse.json(
        {
          error: 'PRODUCT_NOT_AVAILABLE',
          message: err.message || 'Sản phẩm hiện không khả dụng để giao dịch.',
        },
        { status: 400 }
      )
    }

    // 4. AlreadyOwnedError / AlreadyEntitledError -> 409 Conflict
    if (
      (AlreadyOwnedError && err instanceof AlreadyOwnedError) ||
      (AlreadyEntitledError && err instanceof AlreadyEntitledError) ||
      err?.name === 'AlreadyOwnedError' ||
      err?.name === 'AlreadyEntitledError' ||
      err?.code === 'ALREADY_OWNED' ||
      err?.code === 'ALREADY_ENTITLED' ||
      err?.message?.includes('ALREADY_ENTITLED') ||
      err?.message?.includes('already has an active entitlement') ||
      err?.message?.includes('sở hữu')
    ) {
      return NextResponse.json(
        {
          error: 'ALREADY_OWNED',
          message: err.message || 'Bạn đã sở hữu sản phẩm này.',
          entitlementId: err.entitlementId ?? null,
        },
        { status: 409 }
      )
    }

    // 5. ProductNotFoundError -> 404 Not Found
    if (
      (ProductNotFoundError && err instanceof ProductNotFoundError) ||
      err?.name === 'ProductNotFoundError' ||
      err?.code === 'PRODUCT_NOT_FOUND' ||
      err?.message?.includes('PRODUCT_NOT_FOUND') ||
      err?.message?.includes('Không tìm thấy')
    ) {
      return NextResponse.json(
        {
          error: 'PRODUCT_NOT_FOUND',
          message: err.message || 'Không tìm thấy sản phẩm yêu cầu.',
        },
        { status: 404 }
      )
    }

    // 6. Generic Internal Error -> 500 Internal Server Error
    return NextResponse.json(
      {
        error: 'INTERNAL_ERROR',
        message: err?.message || 'Có lỗi xảy ra trong quá trình xử lý đơn hàng.',
      },
      { status: 500 }
    )
  }
}
