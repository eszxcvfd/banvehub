import { NextResponse } from 'next/server'
import { getPayload } from 'payload'
import configPromise from '@payload-config'
import { headers as getHeaders } from 'next/headers'

export async function GET(req: Request) {
  try {
    const headers = await getHeaders()
    const payload = await getPayload({ config: configPromise })
    const { user } = await payload.auth({ headers })

    if (!user) {
      return NextResponse.json({ error: 'Yêu cầu đăng nhập để xem lịch sử giao dịch.' }, { status: 401 })
    }

    const { searchParams } = new URL(req.url)
    const page = parseInt(searchParams.get('page') || '1', 10)
    const limit = parseInt(searchParams.get('limit') || '20', 10)

    const ledger = await payload.find({
      collection: 'wallet_ledger',
      where: {
        user: {
          equals: user.id,
        },
      },
      sort: '-createdAt',
      page,
      limit,
      overrideAccess: true,
    })

    return NextResponse.json({
      success: true,
      docs: ledger.docs.map((doc: any) => ({
        id: doc.id,
        type: doc.type,
        amount: Number(doc.amount),
        direction: doc.direction,
        referenceType: doc.referenceType,
        referenceId: doc.referenceId,
        balanceBefore: Number(doc.balanceBefore),
        balanceAfter: Number(doc.balanceAfter),
        description: doc.description,
        createdAt: doc.createdAt,
      })),
      totalDocs: ledger.totalDocs,
      totalPages: ledger.totalPages,
      page: ledger.page,
      limit: ledger.limit,
    })
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || 'Có lỗi xảy ra khi truy vấn lịch sử sổ cái.' },
      { status: 500 }
    )
  }
}
