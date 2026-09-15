import { NextResponse } from 'next/server'
import { getPayload } from 'payload'
import configPromise from '@payload-config'
import { getPaymentIntentWithLazyExpiry } from '@/services/payment'

export async function GET(
  req: Request,
  { params }: { params: Promise<{ code: string }> }
) {
  try {
    const { code } = await params
    const payload = await getPayload({ config: configPromise })

    const intent = await getPaymentIntentWithLazyExpiry(payload, { code })

    if (!intent) {
      return NextResponse.json({ error: 'Không tìm thấy giao dịch nạp tiền.' }, { status: 404 })
    }

    return NextResponse.json({
      success: true,
      intent: {
        id: intent.id,
        code: intent.code,
        amount: intent.amount,
        currency: intent.currency,
        status: intent.status,
        reconciliationFlag: intent.reconciliationFlag,
        expiresAt: intent.expiresAt,
        checkoutUrl: intent.checkoutUrl,
        bankCode: process.env.SEPAY_BANK_CODE || 'MB',
        accountNo: process.env.SEPAY_ACCOUNT_NO || '0987654321',
        accountName: process.env.SEPAY_ACCOUNT_NAME || 'KIENTAOHUB',
      },
    })
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || 'Có lỗi xảy ra khi truy vấn giao dịch.' },
      { status: 500 }
    )
  }
}
