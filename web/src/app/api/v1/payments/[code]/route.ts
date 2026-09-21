import { NextResponse } from 'next/server'
import { getPayload } from 'payload'
import configPromise from '@payload-config'
import { headers as getHeaders } from 'next/headers'
import { checkRole } from '@/access/utilities'
import { getPaymentIntentWithLazyExpiry } from '@/services/payment'

export async function GET(
  req: Request,
  { params }: { params: Promise<{ code: string }> }
) {
  try {
    const { code } = await params
    const payload = await getPayload({ config: configPromise })

    // This route resolves the intent itself, so it has to enforce the collection's own rule
    // (`paymentIntentReadAccess`, src/access/financialAccess.ts): the owner, or admin/financeAdmin.
    // Without this, anyone holding a bank-transfer reference could read its amount, status and
    // bank details while every sibling `/api/v1/me/**` route answers 401 (inventory row A9).
    const headers = await getHeaders()
    const { user } = await payload.auth({ headers })

    if (!user) {
      return NextResponse.json(
        { error: 'Yêu cầu đăng nhập để tra cứu giao dịch nạp tiền.' },
        { status: 401 }
      )
    }

    const isPrivileged = checkRole(['admin', 'financeAdmin'], user)
    const intent = await getPaymentIntentWithLazyExpiry(payload, {
      code,
      scopeUserId: isPrivileged ? undefined : user.id,
    })

    // An intent the caller does not own answers exactly like an unknown code, so codes — which travel
    // to the payer as the transfer reference — cannot be probed for existence.
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
