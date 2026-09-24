import { NextResponse } from 'next/server'
import { getPayload, type Where } from 'payload'
import configPromise from '@payload-config'
import { headers as getHeaders } from 'next/headers'
import { processRefund, normalizeFaultBasis } from '@/services/refund'

async function getAuthContext(req: Request) {
  let headers: Headers
  try {
    headers = await getHeaders()
  } catch {
    headers = req.headers
  }
  const payload = await getPayload({ config: configPromise })
  const { user } = await payload.auth({ headers })
  return { payload, user }
}

export async function POST(req: Request) {
  try {
    const { payload, user } = await getAuthContext(req)
    if (!user) {
      return NextResponse.json(
        { error: 'UNAUTHORIZED', message: 'Yêu cầu đăng nhập để thực hiện hoàn tiền.' },
        { status: 401 },
      )
    }

    if (!user.roles?.includes('financeAdmin') && !user.roles?.includes('admin')) {
      return NextResponse.json(
        { error: 'FORBIDDEN', message: 'Chỉ Finance Admin hoặc Admin mới có quyền thực hiện hoàn tiền.' },
        { status: 403 },
      )
    }

    let body: {
      orderId?: unknown
      reason?: unknown
      faultBasis?: unknown
      overrideWindow?: unknown
      revokeEntitlement?: unknown
    } | null = null
    try {
      body = await req.json()
    } catch {
      return NextResponse.json(
        { error: 'BAD_REQUEST', message: 'Dữ liệu yêu cầu không hợp lệ (Invalid JSON).' },
        { status: 400 },
      )
    }

    const { orderId, reason, faultBasis, overrideWindow, revokeEntitlement } = body || {}

    if (!orderId || isNaN(Number(orderId))) {
      return NextResponse.json(
        { error: 'BAD_REQUEST', message: 'Mã đơn hàng (orderId) là bắt buộc và phải là số hợp lệ.' },
        { status: 400 },
      )
    }

    if (!reason || typeof reason !== 'string' || !reason.trim()) {
      return NextResponse.json(
        { error: 'BAD_REQUEST', message: 'Lý do hoàn tiền (reason) là bắt buộc.' },
        { status: 400 },
      )
    }

    // Decision 0012 §7: the fault basis decides who bears the refund, so it is a required input
    // of the operator's action and there is no default. The shared normaliser keeps this check
    // and the service's check on exactly the same vocabulary.
    const normalizedFaultBasis = normalizeFaultBasis(faultBasis)

    if (!normalizedFaultBasis) {
      return NextResponse.json(
        {
          error: 'BAD_REQUEST',
          message:
            'Cơ sở lỗi (faultBasis) là bắt buộc và phải là "SELLER" (lỗi người bán) hoặc "PLATFORM" (lỗi hệ thống).',
        },
        { status: 400 },
      )
    }

    // The out-of-policy override must be an explicit boolean: coercing a truthy string such as
    // "false" would silently authorise an out-of-window refund, so anything but a real boolean is
    // rejected rather than interpreted.
    if (overrideWindow !== undefined && typeof overrideWindow !== 'boolean') {
      return NextResponse.json(
        {
          error: 'BAD_REQUEST',
          message: 'Cờ ghi đè ngoài cửa sổ (overrideWindow) nếu có phải là giá trị boolean.',
        },
        { status: 400 },
      )
    }

    const result = await processRefund(payload, {
      orderId: Number(orderId),
      reason: reason.trim(),
      actorId: user.id,
      faultBasis: normalizedFaultBasis,
      overrideWindow: overrideWindow === true ? true : undefined,
      revokeEntitlement: revokeEntitlement !== undefined ? Boolean(revokeEntitlement) : undefined,
    })

    return NextResponse.json({ success: true, data: result }, { status: 200 })
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : 'Không thể thực hiện hoàn tiền.'
    return NextResponse.json(
      { error: 'BAD_REQUEST', message: errorMsg },
      { status: 400 },
    )
  }
}

export async function GET(req: Request) {
  try {
    const { payload, user } = await getAuthContext(req)
    if (!user) {
      return NextResponse.json(
        { error: 'UNAUTHORIZED', message: 'Yêu cầu đăng nhập.' },
        { status: 401 },
      )
    }

    if (!user.roles?.includes('financeAdmin') && !user.roles?.includes('admin')) {
      return NextResponse.json(
        { error: 'FORBIDDEN', message: 'Chỉ Finance Admin hoặc Admin mới có quyền truy cập.' },
        { status: 403 },
      )
    }

    const url = new URL(req.url)
    const page = Math.max(1, parseInt(url.searchParams.get('page') || '1', 10) || 1)
    const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get('limit') || '20', 10) || 20))
    const orderIdParam = url.searchParams.get('orderId')
    const sellerIdParam = url.searchParams.get('sellerId')
    const buyerIdParam = url.searchParams.get('buyerId')

    const where: Where = {}
    if (orderIdParam) where.order = { equals: Number(orderIdParam) }
    if (sellerIdParam) where.seller = { equals: Number(sellerIdParam) }
    if (buyerIdParam) where.buyer = { equals: Number(buyerIdParam) }

    const refunds = await payload.find({
      collection: 'refunds',
      where,
      sort: '-createdAt',
      page,
      limit,
      overrideAccess: false,
      user,
    })

    return NextResponse.json({
      success: true,
      docs: refunds.docs,
      totalDocs: refunds.totalDocs,
      page: refunds.page,
      totalPages: refunds.totalPages,
      hasNextPage: refunds.hasNextPage,
      hasPrevPage: refunds.hasPrevPage,
    })
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : 'Lỗi hệ thống.'
    return NextResponse.json(
      { error: 'INTERNAL_ERROR', message: errorMsg },
      { status: 500 },
    )
  }
}
