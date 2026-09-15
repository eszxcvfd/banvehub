import { getPayload, type Payload } from 'payload'
import config from '@/payload.config'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { User } from '@/payload-types'
import { createTopupIntent, handleSePayWebhook } from '@/services/payment'
import { getOrCreateWallet } from '@/services/wallet'

describe('Phase 4: Duplicate Webhook Idempotency (BR-02, Case 1, Scenario C)', () => {
  let payload: Payload
  let buyerUser: User
  const cleanup = {
    users: [] as (number | string)[],
    intents: [] as (number | string)[],
    transactions: [] as (number | string)[],
    ledgers: [] as (number | string)[],
    events: [] as (number | string)[],
    wallets: [] as (number | string)[],
  }

  const validHeaders = {
    authorization: 'Apikey test_sepay_webhook_secret',
  }

  let sharedTxId: string

  beforeAll(async () => {
    process.env.SEPAY_WEBHOOK_SECRET = 'test_sepay_webhook_secret'
    payload = await getPayload({ config })

    const timestamp = Date.now()
    sharedTxId = `TX_${timestamp}_${Math.floor(Math.random() * 1000000)}`
    buyerUser = (await payload.create({
      collection: 'users',
      data: {
        email: `buyer-webhook-${timestamp}@kientaohub.local`,
        password: 'test-password-payment-123',
        name: 'Buyer Webhook Tester',
        roles: ['buyer'],
      },
      overrideAccess: true,
    })) as User
    cleanup.users.push(buyerUser.id)
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

  it('processes a valid initial SePay webhook and credits buyer wallet', async () => {
    const intent = await createTopupIntent(payload, {
      userId: buyerUser.id,
      amount: 100000,
    })
    cleanup.intents.push(intent.id)

    expect(intent.status).toBe('PENDING')
    expect(intent.code).toMatch(/^KTH/)

    const webhookPayload = {
      id: sharedTxId,
      gateway: 'MBBank',
      transactionDate: '2026-09-15 14:00:00',
      accountNumber: '0987654321',
      transferAmount: 100000,
      content: `Chuyen khoan ${intent.code} thanh toan`,
      referenceCode: `REF_${sharedTxId}`,
    }

    const res = await handleSePayWebhook(payload, {
      headers: validHeaders,
      payloadJson: webhookPayload,
    })

    expect(res.success).toBe(true)
    expect(res.paid).toBe(true)
    expect(res.statusCode).toBe(200)

    // Verify Payment Intent is now PAID
    const updatedIntent = await payload.findByID({
      collection: 'payment_intents',
      id: intent.id,
      overrideAccess: true,
    })
    expect(updatedIntent.status).toBe('PAID')
    expect(updatedIntent.reconciliationFlag).toBe(false)

    // Verify Wallet was credited with 100,000 VND
    const wallet = await getOrCreateWallet(payload, { userId: buyerUser.id })
    expect(Number(wallet.balance)).toBe(100000)

    // Verify Ledger contains exactly 1 CREDIT record
    const ledgers = await payload.find({
      collection: 'wallet_ledger',
      where: {
        user: { equals: buyerUser.id },
      },
      overrideAccess: true,
    })
    expect(ledgers.docs.length).toBe(1)
    expect(Number(ledgers.docs[0].amount)).toBe(100000)
    expect(ledgers.docs[0].direction).toBe('credit')
    expect(Number(ledgers.docs[0].balanceBefore)).toBe(0)
    expect(Number(ledgers.docs[0].balanceAfter)).toBe(100000)
    expect(ledgers.docs[0].referenceId).toBe(intent.code)

    // Verify Payment Transaction record exists
    const txs = await payload.find({
      collection: 'payment_transactions',
      where: {
        providerTransactionId: { equals: sharedTxId },
      },
      overrideAccess: true,
    })
    expect(txs.docs.length).toBe(1)
    expect(Number(txs.docs[0].amount)).toBe(100000)
    expect(txs.docs[0].status).toBe('SUCCESS')
  })

  it('handles duplicate webhook sequentially without crediting twice (BR-02, Case 1)', async () => {
    // Re-send the exact same webhook payload as previous test (sharedTxId)
    const duplicatePayload = {
      id: sharedTxId,
      gateway: 'MBBank',
      transactionDate: '2026-09-15 14:00:00',
      accountNumber: '0987654321',
      transferAmount: 100000,
      content: 'Chuyen khoan KTH thanh toan duplicate retry',
      referenceCode: `REF_${sharedTxId}`,
    }

    const res = await handleSePayWebhook(payload, {
      headers: validHeaders,
      payloadJson: duplicatePayload,
    })

    expect(res.success).toBe(true)
    expect(res.duplicate).toBe(true)
    expect(res.statusCode).toBe(200)

    // Wallet balance must NOT be credited again (must remain 100,000 VND, not 200,000 VND)
    const wallet = await getOrCreateWallet(payload, { userId: buyerUser.id })
    expect(Number(wallet.balance)).toBe(100000)

    // Ledger must still have only 1 entry
    const ledgers = await payload.find({
      collection: 'wallet_ledger',
      where: {
        user: { equals: buyerUser.id },
      },
      overrideAccess: true,
    })
    expect(ledgers.docs.length).toBe(1)

    // Verify duplicate webhook event was logged
    const events = await payload.find({
      collection: 'payment_webhook_events',
      where: {
        status: { equals: 'duplicate_ignored' },
      },
      overrideAccess: true,
    })
    expect(events.docs.length).toBeGreaterThanOrEqual(1)
  })

  it('handles burst of 5 duplicate webhooks sent concurrently (Scenario C)', async () => {
    const intent = await createTopupIntent(payload, {
      userId: buyerUser.id,
      amount: 250000,
    })
    cleanup.intents.push(intent.id)

    const burstTxId = `BURST_TX_${Date.now()}`
    const burstPayload = {
      id: burstTxId,
      gateway: 'MBBank',
      transactionDate: '2026-09-15 14:05:00',
      accountNumber: '0987654321',
      transferAmount: 250000,
      content: `Nap tien ${intent.code}`,
      referenceCode: burstTxId,
    }

    // Fire 5 concurrent webhook calls with identical providerTransactionId
    const concurrentCalls = Array.from({ length: 5 }, () =>
      handleSePayWebhook(payload, {
        headers: validHeaders,
        payloadJson: burstPayload,
      }).catch((err) => ({ error: err.message, statusCode: 500 }))
    )

    const results = await Promise.all(concurrentCalls)

    // Count successful credits vs duplicates
    const paidResults = results.filter((r: any) => r.paid === true)
    const duplicateResults = results.filter((r: any) => r.duplicate === true)

    // Exactly one call must perform the credit
    expect(paidResults.length).toBe(1)
    // The other 4 must be ignored as duplicates (or rejected by unique index)
    expect(duplicateResults.length + paidResults.length).toBe(5)

    // Balance before this test was 100,000, so new balance must be exactly 350,000 (100k + 250k)
    const wallet = await getOrCreateWallet(payload, { userId: buyerUser.id })
    expect(Number(wallet.balance)).toBe(350000)

    // Exactly one transaction record in database for burstTxId
    const txs = await payload.find({
      collection: 'payment_transactions',
      where: {
        providerTransactionId: { equals: burstTxId },
      },
      overrideAccess: true,
    })
    expect(txs.docs.length).toBe(1)
  })
})
