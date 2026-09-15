import { NextResponse } from 'next/server'
import { getPayload } from 'payload'
import configPromise from '@payload-config'
import { handleSePayWebhook, InvalidWebhookSignatureError } from '@/services/payment'

export async function POST(req: Request) {
  try {
    const payload = await getPayload({ config: configPromise })

    // Extract headers as plain object
    const headersObj: Record<string, string> = {}
    req.headers.forEach((value, key) => {
      headersObj[key.toLowerCase()] = value
    })

    const body = await req.json()

    const result = await handleSePayWebhook(payload, {
      headers: headersObj,
      payloadJson: body,
    })

    return NextResponse.json(result, { status: result.statusCode || 200 })
  } catch (error: any) {
    if (error instanceof InvalidWebhookSignatureError) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized: Invalid webhook signature/secret' },
        { status: 401 }
      )
    }

    return NextResponse.json(
      { success: false, error: error?.message || 'Webhook processing failed' },
      { status: 500 }
    )
  }
}
