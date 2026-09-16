import { NextResponse } from 'next/server'
import { getPayload } from 'payload'
import configPromise from '@payload-config'
import { headers as getHeaders } from 'next/headers'
import { approveWithdrawal } from '@/services/withdrawal'

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

export async function POST(
  req: Request,
  context: { params: Promise<{ id: string }> | { id: string } },
) {
  try {
    const { payload, user } = await getAuthContext(req)
    if (!user) {
      return NextResponse.json(
        { error: 'UNAUTHORIZED', message: 'Yêu cầu đăng nhập để phê duyệt yêu cầu rút tiền.' },
        { status: 401 },
      )
    }

    if (!user.roles?.includes('financeAdmin') && !user.roles?.includes('admin')) {
      return NextResponse.json(
        { error: 'FORBIDDEN', message: 'Chỉ Finance Admin hoặc Admin mới có quyền phê duyệt rút tiền.' },
        { status: 403 },
      )
    }

    const resolvedParams = await Promise.resolve(context?.params)
    const withdrawalId = Number(resolvedParams?.id)
    if (!withdrawalId || isNaN(withdrawalId)) {
      return NextResponse.json(
        { error: 'INVALID_REQUEST', message: 'Mã yêu cầu rút tiền (id) không hợp lệ.' },
        { status: 400 },
      )
    }

    let notes: string | undefined
    try {
      const body = await req.json()
      notes = body?.notes
    } catch {
      // notes is optional
    }

    const result = await approveWithdrawal(payload, {
      withdrawalId,
      actorId: user.id,
      notes,
    })

    return NextResponse.json({ success: true, data: result }, { status: 200 })
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : 'Không thể phê duyệt yêu cầu rút tiền.'
    return NextResponse.json(
      { error: 'BAD_REQUEST', message: errorMsg },
      { status: 400 },
    )
  }
}
