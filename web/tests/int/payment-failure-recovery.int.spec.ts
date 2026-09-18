import { getPayload, type Payload } from 'payload'
import config from '@/payload.config'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { User } from '@/payload-types'
import {
  createTopupIntent,
  handleSePayWebhook,
  getPaymentIntentWithLazyExpiry,
  InvalidWebhookSignatureError,
} from '@/services/payment'
import { getOrCreateWallet } from '@/services/wallet'

describe('Phase 4: Payment Failure Scenarios & Recovery (§21, Decision 0005)', () => {
  let payload: Payload
  let bootstrapUser: User
  let buyerUser: User
  const cleanup = {
    users: [] as (number | string)[],
    intents: [] as (number | string)[],
  }

  const validHeaders = {
    authorization: 'Apikey test_sepay_webhook_secret',
  }

  beforeAll(async () => {
    process.env.SEPAY_WEBHOOK_SECRET = 'test_sepay_webhook_secret'
    payload = await getPayload({ config })

    const timestamp = Date.now()

    // `ensureFirstUserIsAdmin` (src/collections/Users/hooks) appends 'admin' to the roles of the
    // FIRST user created while the users table is EMPTY - which is exactly the CI state: CI applies
    // only the versioned migrations and every spec's afterAll deletes its own users, so each spec
    // file can start from an empty table. Absorb that promotion with a throwaway user BEFORE the
    // fixtures below so `buyerUser` cannot silently become ['buyer', 'admin'] and invalidate the
    // role assumptions this suite is built on.
    bootstrapUser = (await payload.create({
      collection: 'users',
      data: {
        email: `bootstrap-failure-${timestamp}@kientaohub.local`,
        password: 'test-password-payment-123',
        name: 'Bootstrap Failure Tester',
        roles: ['buyer'],
      },
      overrideAccess: true,
    })) as User
    cleanup.users.push(bootstrapUser.id)

    buyerUser = (await payload.create({
      collection: 'users',
      data: {
        email: `buyer-failure-${timestamp}@kientaohub.local`,
        password: 'test-password-payment-123',
        name: 'Buyer Failure Tester',
        roles: ['buyer'],
      },
      overrideAccess: true,
    })) as User
    cleanup.users.push(buyerUser.id)

    // Guard: the fixture must hold EXACTLY the role it declares, whether or not the users table
    // started empty. If the first-user promotion ever lands on it again this fails loudly instead
    // of silently changing the actor every authorization assumption is anchored to.
    expect(buyerUser.roles).toEqual(['buyer'])
    expect(buyerUser.roles).not.toContain('admin')
  })

  afterAll(async () => {
    for (const id of cleanup.intents) {
      try {
        await payload.delete({ collection: 'payment_intents', id, overrideAccess: true })
      } catch (_ignore) {}
    }
    for (const id of cleanup.users) {
      try {
        await payload.delete({ collection: 'users', id, overrideAccess: true })
      } catch (_ignore) {}
    }
  })

  it('Case 6: Rejects webhook with invalid or missing signature/secret', async () => {
    const intent = await createTopupIntent(payload, {
      userId: buyerUser.id,
      amount: 100000,
    })
    cleanup.intents.push(intent.id)

    const invalidHeaders = {
      authorization: 'Apikey WRONG_SECRET_KEY',
    }

    const webhookPayload = {
      id: 991001,
      gateway: 'MBBank',
      transferAmount: 100000,
      content: `Chuyen khoan ${intent.code}`,
    }

    // Must throw InvalidWebhookSignatureError (which turns into 401 in route handler)
    await expect(
      handleSePayWebhook(payload, {
        headers: invalidHeaders,
        payloadJson: webhookPayload,
      })
    ).rejects.toThrow(InvalidWebhookSignatureError)

    // Intent must remain PENDING
    const unchangedIntent = await payload.findByID({
      collection: 'payment_intents',
      id: intent.id,
      overrideAccess: true,
    })
    expect(unchangedIntent.status).toBe('PENDING')

    // Wallet balance must NOT be credited
    const wallet = await getOrCreateWallet(payload, { userId: buyerUser.id })
    expect(Number(wallet.balance)).toBe(0)

    // Event must be logged with status: 'invalid_signature'
    const events = await payload.find({
      collection: 'payment_webhook_events',
      where: {
        status: { equals: 'invalid_signature' },
      },
      overrideAccess: true,
    })
    expect(events.docs.length).toBeGreaterThanOrEqual(1)
  })

  it('Case 5 & Decision 0005 Ruling 1: Amount mismatch flags reconciliation and stays PENDING', async () => {
    const intent = await createTopupIntent(payload, {
      userId: buyerUser.id,
      amount: 500000,
    })
    cleanup.intents.push(intent.id)

    // Customer transferred 400,000 instead of 500,000
    const mismatchTxId = `MISMATCH_${Date.now()}_${Math.floor(Math.random() * 1000000)}`
    const mismatchPayload = {
      id: mismatchTxId,
      gateway: 'MBBank',
      transferAmount: 400000,
      content: `Nap tien ${intent.code}`,
      referenceCode: `MB_REF_${mismatchTxId}`,
    }

    const res = await handleSePayWebhook(payload, {
      headers: validHeaders,
      payloadJson: mismatchPayload,
    })

    expect(res.success).toBe(true)
    expect(res.reconciliationFlag).toBe(true)
    expect(res.paid).toBeFalsy()

    // Intent MUST remain PENDING (not auto-FAILED) with reconciliationFlag = true
    const updatedIntent = await payload.findByID({
      collection: 'payment_intents',
      id: intent.id,
      overrideAccess: true,
    })
    expect(updatedIntent.status).toBe('PENDING')
    expect(updatedIntent.reconciliationFlag).toBe(true)
    expect(updatedIntent.reconciliationNote).toContain('Lệch số tiền')

    // Wallet balance must NOT be credited
    const wallet = await getOrCreateWallet(payload, { userId: buyerUser.id })
    expect(Number(wallet.balance)).toBe(0)

    // Webhook event logged with amount_mismatch
    const events = await payload.find({
      collection: 'payment_webhook_events',
      where: {
        status: { equals: 'amount_mismatch' },
      },
      overrideAccess: true,
    })
    expect(events.docs.length).toBeGreaterThanOrEqual(1)
  })

  it('Decision 0005 T3: Late verified webhook wins for EXPIRED or CANCELLED intent', async () => {
    // Customer created intent, it expired or got cancelled, but transfer arrived late
    const intent = await createTopupIntent(payload, {
      userId: buyerUser.id,
      amount: 150000,
    })
    cleanup.intents.push(intent.id)

    // Manually mark intent as EXPIRED
    await payload.update({
      collection: 'payment_intents',
      id: intent.id,
      data: {
        status: 'EXPIRED',
      },
      overrideAccess: true,
    })

    const lateTxId = `LATE_TX_${Date.now()}_${Math.floor(Math.random() * 1000000)}`
    const latePayload = {
      id: lateTxId,
      gateway: 'MBBank',
      transferAmount: 150000,
      content: `Thanh toan tre ${intent.code}`,
      referenceCode: `MB_REF_${lateTxId}`,
    }

    const res = await handleSePayWebhook(payload, {
      headers: validHeaders,
      payloadJson: latePayload,
    })

    // Late verified webhook must be honored: money arrived
    expect(res.success).toBe(true)
    expect(res.paid).toBe(true)

    // Intent transitions to PAID
    const paidIntent = await payload.findByID({
      collection: 'payment_intents',
      id: intent.id,
      overrideAccess: true,
    })
    expect(paidIntent.status).toBe('PAID')

    // Buyer wallet is credited with 150,000 VND
    const wallet = await getOrCreateWallet(payload, { userId: buyerUser.id })
    expect(Number(wallet.balance)).toBe(150000)
  })

  it('Decision 0005 T5: Lazy expiry marks PENDING intent as EXPIRED when past expiresAt', async () => {
    // Create intent with expired timestamp
    const pastDate = new Date(Date.now() - 30 * 60 * 1000).toISOString() // 30 mins ago
    const expiredIntent = await payload.create({
      collection: 'payment_intents',
      data: {
        code: `KTHEXPIRED${Date.now().toString(36).toUpperCase()}`,
        user: buyerUser.id,
        provider: 'sepay',
        amount: 200000,
        currency: 'VND',
        status: 'PENDING',
        expiresAt: pastDate,
      },
      overrideAccess: true,
    })
    cleanup.intents.push(expiredIntent.id)

    // Reading with lazy check
    const checked = await getPaymentIntentWithLazyExpiry(payload, { code: expiredIntent.code })
    expect(checked).not.toBeNull()
    expect(checked?.status).toBe('EXPIRED')

    // Confirm DB record was lazily updated
    const freshDb = await payload.findByID({
      collection: 'payment_intents',
      id: expiredIntent.id,
      overrideAccess: true,
    })
    expect(freshDb.status).toBe('EXPIRED')
  })
})
