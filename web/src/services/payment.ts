import type { Payload } from 'payload'
import type { PaymentIntent, PaymentTransaction, PaymentWebhookEvent, User } from '@/payload-types'
import { creditWallet } from '@/services/wallet'
import { createNotification } from '@/services/notifications'

export class InvalidWebhookSignatureError extends Error {
  constructor(message = 'Chữ ký hoặc mã bảo mật Webhook không hợp lệ') {
    super(message)
    this.name = 'InvalidWebhookSignatureError'
  }
}

export interface CreateTopupIntentParams {
  userId: number | string
  amount: number
  req?: any
}

export interface SePayWebhookPayload {
  id?: number | string
  gateway?: string
  transactionDate?: string
  accountNumber?: string
  code?: string | null
  content?: string
  transferType?: string
  transferAmount?: number
  accumulated?: number
  subAccount?: string | null
  referenceCode?: string
  description?: string
  [key: string]: any
}

/**
 * Mask sensitive account details for webhook payload logging (PLAN.md §11.3).
 */
export function maskSensitivePayload(payload: Record<string, any>): Record<string, any> {
  const masked = { ...payload }

  if (typeof masked.accountNumber === 'string' && masked.accountNumber.length > 4) {
    const len = masked.accountNumber.length
    masked.accountNumber = `${masked.accountNumber.slice(0, 2)}***${masked.accountNumber.slice(len - 2)}`
  }

  return masked
}

/**
 * Validate SePay Webhook authorization header.
 * Supports "Apikey <SECRET>", "Bearer <SECRET>", or matching configured secret.
 */
export function verifySePayAuthorization(headers: Record<string, string | string[] | undefined>): boolean {
  const expectedSecret = process.env.SEPAY_WEBHOOK_SECRET || 'test_sepay_webhook_secret'

  // Look for authorization or apikey header
  const authHeader = (headers['authorization'] || headers['Authorization'] || headers['x-api-key'] || headers['X-Api-Key']) as string | undefined

  if (!authHeader) return false

  const cleanHeader = authHeader.trim()
  if (cleanHeader === expectedSecret) return true
  if (cleanHeader.startsWith('Apikey ') && cleanHeader.slice(7).trim() === expectedSecret) return true
  if (cleanHeader.startsWith('Bearer ') && cleanHeader.slice(7).trim() === expectedSecret) return true

  return false
}

/**
 * Create a new top-up Payment Intent with VietQR transfer code and QR link.
 */
export async function createTopupIntent(
  payload: Payload,
  params: CreateTopupIntentParams
): Promise<PaymentIntent> {
  const { userId, amount, req } = params
  const numericUserId = typeof userId === 'string' ? parseInt(userId, 10) : userId

  if (!Number.isInteger(amount) || amount < 10000) {
    throw new Error('Số tiền nạp tối thiểu là 10.000₫ (PLAN.md §6.2)')
  }

  // Generate unique transfer syntax code: KTH + timestamp36 + random
  const randomSuffix = Math.floor(100 + Math.random() * 900)
  const code = `KTH${Date.now().toString(36).toUpperCase()}${randomSuffix}`

  // VietQR parameters (configurable via env or defaults for VietinBank / MB)
  const bankCode = process.env.SEPAY_BANK_CODE || 'MB'
  const accountNo = process.env.SEPAY_ACCOUNT_NO || '0987654321'
  const accountName = process.env.SEPAY_ACCOUNT_NAME || 'KIENTAOHUB'

  // Compact VietQR image link with amount and addInfo embedded
  const checkoutUrl = `https://img.vietqr.io/image/${bankCode}-${accountNo}-compact2.png?amount=${amount}&addInfo=${encodeURIComponent(code)}&accountName=${encodeURIComponent(accountName)}`

  // 15-minute validity window
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString()

  const intent = await payload.create({
    collection: 'payment_intents',
    data: {
      code,
      user: numericUserId,
      provider: 'sepay',
      amount,
      currency: 'VND',
      status: 'PENDING',
      expiresAt,
      checkoutUrl,
    },
    overrideAccess: true,
    req,
  })

  return intent as PaymentIntent
}

/**
 * Handle incoming SePay webhook.
 * Guarantees:
 * - Chữ ký / Secret verification (§11.3, Case 6)
 * - Idempotency on (provider, provider_transaction_id) (BR-02, Case 1)
 * - Amount mismatch keeps intent PENDING with reconciliation flag (Decision 0005 Ruling 1, Case 5)
 * - Late webhook honor for expired/cancelled intents (Decision 0005 T3)
 * - Masked raw payload logging (§11.3)
 */
export async function handleSePayWebhook(
  payload: Payload,
  {
    headers,
    payloadJson,
    req,
  }: {
    headers: Record<string, any>
    payloadJson: SePayWebhookPayload
    req?: any
  }
): Promise<{
  success: boolean
  statusCode: number
  message: string
  reconciliationFlag?: boolean
  duplicate?: boolean
  paid?: boolean
}> {
  const isSignatureValid = verifySePayAuthorization(headers)
  const maskedPayload = maskSensitivePayload(payloadJson)
  const eventId = String(payloadJson.id || payloadJson.referenceCode || `evt_${Date.now()}`)
  const providerTransactionId = String(
    payloadJson.id || payloadJson.referenceCode || payloadJson.transactionId || ''
  )
  const transferAmount = Number(payloadJson.transferAmount || payloadJson.amount || 0)
  const content = String(payloadJson.content || payloadJson.description || '')

  // 1. Signature check (§11.3, Case 6)
  if (!isSignatureValid) {
    await payload.create({
      collection: 'payment_webhook_events',
      data: {
        provider: 'sepay',
        eventId,
        payload: maskedPayload,
        headers,
        signatureValid: false,
        status: 'invalid_signature',
        processedAt: new Date().toISOString(),
        errorDetails: 'Chữ ký hoặc Secret Webhook không hợp lệ (401)',
      },
      overrideAccess: true,
      req,
    })

    throw new InvalidWebhookSignatureError()
  }

  // 2. Check Idempotency (BR-02, Case 1)
  if (providerTransactionId) {
    const existingTx = await payload.find({
      collection: 'payment_transactions',
      where: {
        and: [
          { provider: { equals: 'sepay' } },
          { providerTransactionId: { equals: providerTransactionId } },
        ],
      },
      limit: 1,
      overrideAccess: true,
      req,
    })

    if (existingTx.docs.length > 0) {
      // Duplicate webhook! Do not credit again. Return 200 no-op replay.
      await payload.create({
        collection: 'payment_webhook_events',
        data: {
          provider: 'sepay',
          eventId,
          payload: maskedPayload,
          headers,
          signatureValid: true,
          status: 'duplicate_ignored',
          processedAt: new Date().toISOString(),
          errorDetails: `Giao dịch ${providerTransactionId} đã được xử lý trước đó (BR-02 Idempotency)`,
        },
        overrideAccess: true,
        req,
      })

      return {
        success: true,
        statusCode: 200,
        duplicate: true,
        message: 'Duplicate webhook ignored (BR-02 idempotent)',
      }
    }
  }

  // 3. Match Payment Intent via code in transfer content
  const codeMatch = content.match(/KTH[A-Z0-9]+/i)
  const searchCode = codeMatch ? codeMatch[0].toUpperCase() : content.trim()

  const intents = await payload.find({
    collection: 'payment_intents',
    where: {
      code: {
        equals: searchCode,
      },
    },
    limit: 1,
    overrideAccess: true,
    req,
  })

  if (intents.docs.length === 0) {
    await payload.create({
      collection: 'payment_webhook_events',
      data: {
        provider: 'sepay',
        eventId,
        payload: maskedPayload,
        headers,
        signatureValid: true,
        status: 'failed',
        processedAt: new Date().toISOString(),
        errorDetails: `Không tìm thấy Payment Intent khớp với mã chuyển khoản: "${searchCode}"`,
      },
      overrideAccess: true,
      req,
    })

    return {
      success: false,
      statusCode: 200,
      message: 'No matching payment intent found for transfer syntax',
    }
  }

  const intent = intents.docs[0] as PaymentIntent
  const intentUserId = typeof intent.user === 'object' ? (intent.user as User).id : intent.user

  // 4. Amount Mismatch verification (Decision 0005 Ruling 1, Case 5)
  if (transferAmount !== Number(intent.amount)) {
    // Flag reconciliation and keep PENDING
    await payload.update({
      collection: 'payment_intents',
      id: intent.id,
      data: {
        reconciliationFlag: true,
        reconciliationNote: `Lệch số tiền: Thực nhận ${transferAmount.toLocaleString('vi-VN')}₫, Yêu cầu ${Number(intent.amount).toLocaleString('vi-VN')}₫`,
      },
      overrideAccess: true,
      req,
    })

    await payload.create({
      collection: 'payment_webhook_events',
      data: {
        provider: 'sepay',
        eventId,
        payload: maskedPayload,
        headers,
        signatureValid: true,
        status: 'amount_mismatch',
        processedAt: new Date().toISOString(),
        errorDetails: `Lệch số tiền: Nhận ${transferAmount}₫ != Dự kiến ${intent.amount}₫`,
      },
      overrideAccess: true,
      req,
    })

    // §13 in-app channel (added): the buyer's attempted top-up did not go through — the
    // transfer landed with a different amount, so the intent stays PENDING and is flagged
    // for reconciliation. Fire-and-forget: `createNotification` writes on its own
    // connection and swallows every failure, so the reconciliation outcome, the intent
    // status and the `200` returned below are exactly what they were before.
    // The dedupeKey is the provider transaction, so replaying this webhook is a no-op here.
    await createNotification(payload, {
      recipient: intentUserId,
      type: 'PAYMENT_FAILED',
      title: 'Nạp tiền chưa thành công',
      body: `Giao dịch ${intent.code}: hệ thống nhận ${transferAmount.toLocaleString('vi-VN')}₫, không khớp số tiền yêu cầu ${Number(intent.amount).toLocaleString('vi-VN')}₫. Yêu cầu đang được đối soát.`,
      link: '/wallet',
      dedupeKey: `payment-mismatch:${providerTransactionId || eventId}`,
      req,
    })

    return {
      success: true,
      statusCode: 200,
      reconciliationFlag: true,
      message: 'Amount mismatch flagged for manual review; intent kept PENDING',
    }
  }

  // 5. Success state transition (Decision 0005 T3: PENDING -> PAID, late webhooks also win)
  // Record payment transaction (enforces composite unique index at DB level)
  try {
    await payload.create({
      collection: 'payment_transactions',
      data: {
        paymentIntent: intent.id,
        user: intentUserId,
        provider: 'sepay',
        providerTransactionId,
        amount: transferAmount,
        rawReference: maskedPayload,
        status: 'SUCCESS',
        paidAt: new Date().toISOString(),
      },
      overrideAccess: true,
      req,
    })
  } catch (err: any) {
    if (
      err?.message?.includes('payment_transactions_provider_tx_idx') ||
      err?.message?.includes('provider, provider_transaction_id') ||
      err?.message?.includes('provider_transaction_id') ||
      err?.message?.includes('duplicate key') ||
      err?.code === '23505'
    ) {
      // Concurrent race caught by PostgreSQL unique constraint (BR-02)
      return {
        success: true,
        statusCode: 200,
        duplicate: true,
        message: 'Concurrent duplicate webhook caught by unique constraint (BR-02)',
      }
    }
    throw err
  }

  // Mark Intent as PAID
  await payload.update({
    collection: 'payment_intents',
    id: intent.id,
    data: {
      status: 'PAID',
      reconciliationFlag: false,
    },
    overrideAccess: true,
    req,
  })

  // Credit user wallet and write append-only ledger entry (Decision 0002)
  await creditWallet(payload, {
    userId: intentUserId,
    amount: transferAmount,
    type: 'topup',
    referenceType: 'payment_intent',
    referenceId: intent.code,
    description: `Nạp tiền thành công qua SePay VietQR (Mã giao dịch: ${intent.code})`,
    metadata: {
      providerTransactionId,
      gateway: payloadJson.gateway || 'SePay',
      paidAt: payloadJson.transactionDate || new Date().toISOString(),
    },
    req,
  })

  // Log successful webhook event
  await payload.create({
    collection: 'payment_webhook_events',
    data: {
      provider: 'sepay',
      eventId,
      payload: maskedPayload,
      headers,
      signatureValid: true,
      status: 'processed',
      processedAt: new Date().toISOString(),
    },
    overrideAccess: true,
    req,
  })

  // §13 in-app channel (added): the buyer's top-up landed and the wallet was credited.
  // Fire-and-forget — `createNotification` does not join this transaction and does not own a
  // pool: it draws a connection from the shared pool, waiting at most
  // `POOL_ACQUISITION_TIMEOUT_MS` (payload.config.ts), and swallows every failure. The
  // `200 paid:true` contract of this webhook (and the BR-02 replay no-op above) is unchanged.
  // The dedupeKey is the payment intent, so the intent's top-up is announced exactly once no
  // matter how many webhooks arrive for it.
  await createNotification(payload, {
    recipient: intentUserId,
    type: 'PAYMENT_SUCCESS',
    title: 'Nạp tiền thành công',
    body: `Ví của bạn đã được cộng ${transferAmount.toLocaleString('vi-VN')}₫ (mã giao dịch ${intent.code}).`,
    link: '/wallet',
    dedupeKey: `payment-intent:${intent.code}`,
    req,
  })

  return {
    success: true,
    statusCode: 200,
    paid: true,
    message: 'Payment successfully verified and wallet credited',
  }
}

/**
 * Get payment intent with lazy expiry check (Decision 0005 T5).
 */
export async function getPaymentIntentWithLazyExpiry(
  payload: Payload,
  { code, req }: { code: string; req?: any }
): Promise<PaymentIntent | null> {
  const result = await payload.find({
    collection: 'payment_intents',
    where: {
      code: {
        equals: code,
      },
    },
    limit: 1,
    overrideAccess: true,
    req,
  })

  if (result.docs.length === 0) return null

  const intent = result.docs[0] as PaymentIntent

  // If status is PENDING and current time > expiresAt, transition to EXPIRED lazily
  if (intent.status === 'PENDING' && new Date() > new Date(intent.expiresAt)) {
    const updated = await payload.update({
      collection: 'payment_intents',
      id: intent.id,
      data: {
        status: 'EXPIRED',
      },
      overrideAccess: true,
      req,
    })

    return updated as PaymentIntent
  }

  return intent
}
