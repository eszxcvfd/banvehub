import { NextResponse } from 'next/server'
import { getPayload } from 'payload'
import configPromise from '@payload-config'
import { headers as getHeaders } from 'next/headers'
import { getOrCreateWallet } from '@/services/wallet'

export async function GET() {
  try {
    const headers = await getHeaders()
    const payload = await getPayload({ config: configPromise })
    const { user } = await payload.auth({ headers })

    if (!user) {
      return NextResponse.json({ error: 'Yêu cầu đăng nhập để xem thông tin ví.' }, { status: 401 })
    }

    const wallet = await getOrCreateWallet(payload, { userId: user.id })

    return NextResponse.json({
      success: true,
      wallet: {
        id: wallet.id,
        balance: Number(wallet.balance),
        pendingBalance: Number(wallet.pendingBalance),
        currency: wallet.currency,
        status: wallet.status,
      },
    })
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || 'Có lỗi xảy ra khi truy vấn thông tin ví.' },
      { status: 500 }
    )
  }
}
