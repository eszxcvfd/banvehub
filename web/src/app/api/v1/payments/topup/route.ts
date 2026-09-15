import { NextResponse } from 'next/server'
import { getPayload } from 'payload'
import configPromise from '@payload-config'
import { headers as getHeaders } from 'next/headers'
import { createTopupIntent } from '@/services/payment'

export async function POST(req: Request) {
  try {
    const headers = await getHeaders()
    const payload = await getPayload({ config: configPromise })
    const { user } = await payload.auth({ headers })

    if (!user) {
      return NextResponse.json({ error: 'Yêu cầu đăng nhập để nạp tiền vào ví.' }, { status: 401 })
    }

    const body = await req.json()
    const amount = Number(body.amount)

    if (!Number.isInteger(amount) || amount < 10000) {
      return NextResponse.json(
        { error: 'Số tiền nạp tối thiểu là 10.000₫ và phải là số nguyên (VND).' },
        { status: 400 }
      )
    }

    const intent = await createTopupIntent(payload, {
      userId: user.id,
      amount,
    })

    return NextResponse.json({
      success: true,
      intent: {
        id: intent.id,
        code: intent.code,
        amount: intent.amount,
        currency: intent.currency,
        status: intent.status,
        expiresAt: intent.expiresAt,
        checkoutUrl: intent.checkoutUrl,
        bankCode: process.env.SEPAY_BANK_CODE || 'MB',
        accountNo: process.env.SEPAY_ACCOUNT_NO || '0987654321',
        accountName: process.env.SEPAY_ACCOUNT_NAME || 'KIENTAOHUB',
      },
    })
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || 'Có lỗi xảy ra khi tạo giao dịch nạp tiền.' },
      { status: 500 }
    )
  }
}
