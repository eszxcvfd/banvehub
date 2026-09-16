import { NextResponse } from 'next/server'
import { getPayload, type Where } from 'payload'
import configPromise from '@payload-config'
import { headers as getHeaders } from 'next/headers'
import { requestWithdrawal } from '@/services/withdrawal'

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

export async function GET(req: Request) {
  try {
    const { payload, user } = await getAuthContext(req)
    if (!user) {
      return NextResponse.json(
        { error: 'UNAUTHORIZED', message: 'Yêu cầu đăng nhập để xem danh sách rút tiền.' },
        { status: 401 },
      )
    }

    if (!user.roles?.includes('seller') && !user.roles?.includes('admin')) {
      return NextResponse.json(
        { error: 'FORBIDDEN', message: 'Chỉ người bán mới có quyền truy cập.' },
        { status: 403 },
      )
    }

    const url = new URL(req.url)
    const page = Math.max(1, parseInt(url.searchParams.get('page') || '1', 10) || 1)
    const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get('limit') || '20', 10) || 20))
    const statusParam = url.searchParams.get('status')

    const where: Where = {
      seller: { equals: user.id },
    }

    if (statusParam) {
      where.status = { equals: statusParam }
    }

    const withdrawals = await payload.find({
      collection: 'withdrawals',
      where,
      sort: '-requestedAt',
      page,
      limit,
      overrideAccess: false,
      user,
    })

    return NextResponse.json({
      success: true,
      docs: withdrawals.docs,
      totalDocs: withdrawals.totalDocs,
      page: withdrawals.page,
      totalPages: withdrawals.totalPages,
      hasNextPage: withdrawals.hasNextPage,
      hasPrevPage: withdrawals.hasPrevPage,
    })
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : 'Lỗi hệ thống.'
    return NextResponse.json(
      { error: 'INTERNAL_ERROR', message: errorMsg },
      { status: 500 },
    )
  }
}

export async function POST(req: Request) {
  try {
    const { payload, user } = await getAuthContext(req)
    if (!user) {
      return NextResponse.json(
        { error: 'UNAUTHORIZED', message: 'Yêu cầu đăng nhập để yêu cầu rút tiền.' },
        { status: 401 },
      )
    }

    if (!user.roles?.includes('seller') && !user.roles?.includes('admin')) {
      return NextResponse.json(
        { error: 'FORBIDDEN', message: 'Chỉ người bán mới có quyền yêu cầu rút tiền.' },
        { status: 403 },
      )
    }

    let body: Record<string, unknown> | null = null
    try {
      body = (await req.json()) as Record<string, unknown>
    } catch {
      return NextResponse.json(
        { error: 'INVALID_REQUEST', message: 'Dữ liệu yêu cầu không hợp lệ (yêu cầu JSON).' },
        { status: 400 },
      )
    }

    const { amount, bankInfo } = body || {}
    if (amount === undefined || amount === null) {
      return NextResponse.json(
        { error: 'INVALID_REQUEST', message: 'Số tiền rút (amount) là bắt buộc.' },
        { status: 400 },
      )
    }

    if (!bankInfo || typeof bankInfo !== 'object') {
      return NextResponse.json(
        { error: 'INVALID_REQUEST', message: 'Thông tin tài khoản ngân hàng (bankInfo) là bắt buộc.' },
        { status: 400 },
      )
    }

    const result = await requestWithdrawal(payload, {
      sellerId: user.id,
      amount: Number(amount),
      bankInfo: bankInfo as { bankName: string; accountNumber: string; accountHolderName: string },
    })

    return NextResponse.json({ success: true, data: result }, { status: 201 })
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : 'Không thể tạo yêu cầu rút tiền.'
    return NextResponse.json(
      { error: 'BAD_REQUEST', message: errorMsg },
      { status: 400 },
    )
  }
}
