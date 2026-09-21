import { NextResponse } from 'next/server'

/**
 * The card rail's initiation endpoint.
 *
 * Decision 0004 keeps international cards out of P0, and decision 0013 removed the plugin's
 * `/api/payments/stripe/initiate` (and the ledger behind it). The checkout's card option therefore
 * used to POST into a route that no longer exists and the buyer read a 404. Decision 0014 §5 requires
 * that option to get a deterministic, honest refusal from an endpoint that exists instead — this route
 * is that endpoint.
 *
 * It implements nothing, holds no provider SDK and no key, touches no collection, and answers the same
 * 501 to every caller: it can neither leak data nor move money. When a card rail is actually funded it
 * gets its own decision, its own provider and its own route; nothing here is a Stripe adapter.
 */
export async function POST() {
  return NextResponse.json(
    {
      error: 'PAYMENT_METHOD_NOT_IMPLEMENTED',
      message:
        'Thanh toán bằng thẻ quốc tế chưa được hỗ trợ. Vui lòng chọn Ví KienTaoHub hoặc chuyển khoản VietQR.',
    },
    { status: 501 },
  )
}
