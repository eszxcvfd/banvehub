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

    const productId = Number(rawProductId)
    if (isNaN(productId) || productId <= 0) {
      return NextResponse.json(
        {
          error: 'INVALID_REQUEST',
          message: 'productId không hợp lệ.',
        },
        { status: 400 }
      )
    }

    const tokenResult = await createDownloadToken(payload, {
      userId: user.id,
      productId,
    })

    return NextResponse.json({
      success: true,
      data: tokenResult,
    })
  } catch (err: any) {
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
