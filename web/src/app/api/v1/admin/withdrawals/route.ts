import { NextResponse } from 'next/server'
import { getPayload, type Where } from 'payload'
import configPromise from '@payload-config'
import { headers as getHeaders } from 'next/headers'

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
        { error: 'UNAUTHORIZED', message: 'Yêu cầu đăng nhập để truy cập danh sách rút tiền quản trị.' },
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
    const statusParam = url.searchParams.get('status')
    const sellerIdParam = url.searchParams.get('sellerId')

    const where: Where = {}
    if (statusParam) {
      where.status = { equals: statusParam }
    }
    if (sellerIdParam) {
      where.seller = { equals: Number(sellerIdParam) }
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
