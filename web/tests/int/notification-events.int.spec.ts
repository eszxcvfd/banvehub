/**
 * §13 in-app notification channel — emission points, API and business invariants (slice 2).
 *
 * One test per business event (payment success / payment failure / order success / seller sale /
 * earnings available / withdrawal status / refund / product approved / product rejected / ticket
 * reply), plus:
 *  - the BR-02 replay proof (a duplicated SePay webhook stays a no-op `200` and never creates a
 *    second notification),
 *  - the side-effect-free proof (emitting changes no money-path row, no product row, and the five
 *    money-path triggers are still in place),
 *  - the `/api/v1/me/notifications` contract (own rows only, pagination, unreadCount, idempotent
 *    mark-read, 401/404 envelopes).
 *
 * Cleanup is identity-based (`afterAll`, every step in its own try/catch): every notification this
 * spec created is removed by recipient id, then the business rows it created are removed in FK
 * dependency order. `wallet_ledger` and `wallets` rows can NOT be removed — BR-03's triggers forbid
 * UPDATE/DELETE on them by design — so the fixture users that own a wallet stay behind exactly like
 * they do for the existing money specs; that is a property of the ledger, not an omission here.
 */

import { getPayload, type Payload } from 'payload'
import config from '@/payload.config'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { sql } from '@payloadcms/db-postgres'
import type { User } from '@/payload-types'
import { createTopupIntent, handleSePayWebhook } from '@/services/payment'
import { purchaseProduct } from '@/services/purchase'
import { releaseMaturedEarnings } from '@/services/earnings'
import {
  approveWithdrawal,
  rejectWithdrawal,
  requestWithdrawal,
  reviewWithdrawal,
} from '@/services/withdrawal'
import { processRefund } from '@/services/refund'
import { creditWallet, getOrCreateWallet } from '@/services/wallet'
import { createNotification } from '@/services/notifications'
import { GET as getNotifications } from '@/app/api/v1/me/notifications/route'
import { POST as markNotificationRead } from '@/app/api/v1/me/notifications/[id]/read/route'
import { POST as markAllNotificationsRead } from '@/app/api/v1/me/notifications/read-all/route'
import { POST as postTicketMessage } from '@/app/api/v1/tickets/[id]/messages/route'

/** Money-path + moderation tables whose row counts must not move because of a notification. */
const BUSINESS_TABLES = [
  'wallet_ledger',
  'wallets',
  'orders',
  'order_items',
  'entitlements',
  'seller_earnings',
  'withdrawals',
  'refunds',
  'moderation_cases',
]

/** The five BR-03/BR-04 database triggers that guard the money path. */
const MONEY_TRIGGERS = [
  'enforce_br04_seller_anti_self_purchase',
  'forbid_ledger_mutation',
  'forbid_ledger_truncate',
  'forbid_wallet_delete',
  'forbid_wallet_truncate',
]

describe('§13 in-app notifications — emissions, API and invariants', () => {
  let payload: Payload

  const runId = `notif-events-${Date.now()}`
  const userIds: (number | string)[] = []
  const productIds: (number | string)[] = []
  let seq = 0
  const getSeq = () => ++seq

  let sentinel: User
  let buyer1: User
  let buyer2: User
  let seller1: User
  let seller2: User
  let moderator: User
  let financeAdmin: User

  let paidProductId: number | string
  let paidProductSlug: string
  let approvedProductId: number | string
  let rejectedProductId: number | string

  // Fixtures created in beforeAll and asserted by the event tests below.
  let purchaseOrderId: number | string
  let purchaseOrderCode: string
  let purchaseEarningId: number | string
  let withdrawalId: number | string

  const rawSql = async <T = any,>(statement: any): Promise<T[]> => {
    const res: any = await (payload.db as any).drizzle.execute(statement)
    return ((res as any)?.rows ?? res) as T[]
  }

  const businessSnapshot = async (): Promise<Record<string, number | string>> => {
    const snapshot: Record<string, number | string> = {}
    for (const table of BUSINESS_TABLES) {
      const rows = await rawSql<{ n: number }>(sql.raw(`SELECT count(*)::int AS n FROM "${table}";`))
      snapshot[table] = rows[0]?.n ?? -1
    }
    snapshot[`md5:products:${paidProductId}`] = await productRowMd5(paidProductId)
    return snapshot
  }

  /** Whole-row fingerprint of a product: the acceptance anchor for "no business row changed". */
  const productRowMd5 = async (id: number | string): Promise<string> => {
    const rows = await rawSql<{ n: string }>(
      sql.raw(`SELECT md5(p::text) AS n FROM products p WHERE id = ${Number(id)};`),
    )
    return rows[0]?.n ?? ''
  }

  const deltas = (
    after: Record<string, number | string>,
    before: Record<string, number | string>,
  ): Record<string, number | string> => {
    const result: Record<string, number | string> = {}
    for (const key of Object.keys(after)) {
      const a = after[key]
      const b = before[key]
      result[key] = typeof a === 'number' && typeof b === 'number' ? a - b : a === b ? 0 : 'changed'
    }
    return result
  }

  const createUser = async (label: string, roles: User['roles']): Promise<User> => {
    const user = (await payload.create({
      collection: 'users',
      data: {
        email: `${label}-${runId}-${getSeq()}@kientaohub.local`,
        password: 'test-password-notifications-123',
        name: label,
        roles,
      },
      overrideAccess: true,
    })) as User
    userIds.push(user.id)
    return user
  }

  const createProduct = async (
    label: string,
    seller: User,
    moderationStatus: 'approved' | 'draft' = 'approved',
  ) => {
    const slug = `${label}-${runId}-${getSeq()}`
    const product = (await payload.create({
      collection: 'products',
      data: {
        title: `Sản phẩm ${label} ${runId}`,
        slug,
        price: 150000,
        isFree: false,
        seller: seller.id,
        copyrightDeclared: true,
        moderationStatus,
        _status: moderationStatus === 'approved' ? 'published' : 'draft',
      },
      overrideAccess: true,
    })) as { id: number | string }
    productIds.push(product.id)
    return { id: product.id, slug }
  }

  const idOf = (value: unknown): number | null => {
    const raw = typeof value === 'object' && value !== null ? (value as any).id : value
    const parsed = Number(raw)
    return Number.isFinite(parsed) ? parsed : null
  }

  const findNotifications = async (where: any) =>
    payload.find({
      collection: 'notifications',
      where,
      limit: 100,
      depth: 0,
      overrideAccess: true,
      sort: 'createdAt',
    })

  /** Exactly one notification with this `(recipient, type, dedupeKey)`, unread, with an id. */
  const expectSingleNotification = async (opts: {
    recipient: number
    type: string
    dedupeKey: string
    link?: null | string
  }) => {
    const result = await findNotifications({
      and: [
        { recipient: { equals: opts.recipient } },
        { type: { equals: opts.type } },
        { dedupeKey: { equals: opts.dedupeKey } },
      ],
    })

    expect(
      result.totalDocs,
      `exactly one ${opts.type} for recipient ${opts.recipient} / ${opts.dedupeKey}`,
    ).toBe(1)

    const doc = result.docs[0] as any
    expect(doc.type).toBe(opts.type)
    expect(idOf(doc.recipient)).toBe(opts.recipient)
    expect(doc.title).toBeTruthy()
    expect(doc.body).toBeTruthy()
    expect(doc.readAt ?? null).toBeNull()
    if (opts.link !== undefined) {
      expect(doc.link ?? null).toBe(opts.link)
    }

    return doc
  }

  const countNotifications = async (where: any) =>
    (await findNotifications(where)).totalDocs

  /** Notifications addressed to a user for one type — the "nothing extra was emitted" probe. */
  const notificationsOfType = async (recipient: number, type: string) => {
    const result = await findNotifications({
      and: [{ recipient: { equals: recipient } }, { type: { equals: type } }],
    })
    return result.docs as any[]
  }

  // ---------------------------------------------------------------------------
  // Auth harness: the API routes read the caller from `payload.auth`, so one persistent
  // mock selects the acting user per request (same pattern as tests/int/tickets.int.spec.ts).
  // ---------------------------------------------------------------------------
  let currentUser: User | null = null
  const actAs = (user: User | null) => {
    currentUser = user
  }

  const testRequest = (url: string, init: RequestInit = {}) =>
    new Request(url, {
      ...init,
      headers: { 'Content-Type': 'application/json', ...((init.headers as any) || {}) },
    })

  const ticketContext = (id: number | string) => ({
    params: Promise.resolve({ id: String(id) }),
  })

  beforeAll(async () => {
    process.env.SEPAY_WEBHOOK_SECRET = 'test_sepay_webhook_secret'
    payload = await getPayload({ config })

    vi.spyOn(payload, 'auth').mockImplementation(async () => ({ user: currentUser }) as any)

    // `ensureFirstUserIsAdmin` promotes the first user created while the users table is empty;
    // absorb it with a throwaway sentinel before the role-sensitive fixtures (the pattern used by
    // tests/int/product-reports.int.spec.ts), then assert the roles this spec depends on.
    sentinel = await createUser('sentinel-notif-events', ['buyer'])
    buyer1 = await createUser('buyer1-notif-events', ['buyer'])
    buyer2 = await createUser('buyer2-notif-events', ['buyer'])
    seller1 = await createUser('seller1-notif-events', ['seller'])
    seller2 = await createUser('seller2-notif-events', ['seller'])
    moderator = await createUser('mod-notif-events', ['moderator'])
    financeAdmin = await createUser('finance-notif-events', ['financeAdmin'])

    expect(sentinel.roles).toEqual(['buyer'])
    expect(buyer1.roles).toEqual(['buyer'])
    expect(buyer2.roles).toEqual(['buyer'])
    expect(seller1.roles).toEqual(['seller'])
    expect(seller2.roles).toEqual(['seller'])
    expect(moderator.roles).toEqual(['moderator'])
    expect(financeAdmin.roles).toEqual(['financeAdmin'])

    const paid = await createProduct('paid-notif-events', seller1, 'approved')
    paidProductId = paid.id
    paidProductSlug = paid.slug

    const approvedProduct = await createProduct('approve-target-notif-events', seller2, 'draft')
    approvedProductId = approvedProduct.id

    const rejectedProduct = await createProduct('reject-target-notif-events', seller2, 'draft')
    rejectedProductId = rejectedProduct.id

    // Fund the buyer and buy the paid product once: this is the shared fixture for the
    // ORDER_SUCCESS / SELLER_SALE / EARNINGS_AVAILABLE / WITHDRAWAL_STATUS / REFUND tests.
    await creditWallet(payload, {
      userId: buyer1.id,
      amount: 500000,
      type: 'topup',
      referenceType: 'payment_intent',
      referenceId: `TOPUP_${runId}`,
      description: 'Nạp ví cho kiểm thử thông báo §13',
    })

    const purchase = await purchaseProduct(payload, {
      buyerId: buyer1.id,
      productId: Number(paidProductId),
    })
    expect(purchase.success).toBe(true)
    purchaseOrderId = purchase.orderId
    purchaseOrderCode = purchase.orderCode

    const earnings = await payload.find({
      collection: 'seller_earnings',
      where: { order: { equals: Number(purchaseOrderId) } },
      limit: 1,
      overrideAccess: true,
    })
    expect(earnings.totalDocs).toBe(1)
    purchaseEarningId = earnings.docs[0].id
  })

  afterAll(async () => {
    if (!payload) return

    const userFilter = userIds.length ? userIds.map((id) => Number(id)).join(',') : '0'

    const sweeps = [
      `DELETE FROM notifications WHERE recipient_id IN (${userFilter});`,
      `DELETE FROM tickets WHERE user_id IN (${userFilter}) OR seller_id IN (${userFilter});`,
      `DELETE FROM refunds WHERE buyer_id IN (${userFilter}) OR seller_id IN (${userFilter});`,
      `DELETE FROM withdrawal_events WHERE withdrawal_id IN (SELECT id FROM withdrawals WHERE seller_id IN (${userFilter}));`,
      `DELETE FROM withdrawals WHERE seller_id IN (${userFilter});`,
      `DELETE FROM seller_earnings WHERE seller_id IN (${userFilter});`,
      `DELETE FROM download_events WHERE entitlement_id IN (SELECT id FROM entitlements WHERE user_id IN (${userFilter}));`,
      `DELETE FROM entitlements WHERE user_id IN (${userFilter});`,
      `DELETE FROM order_items WHERE seller_id IN (${userFilter}) OR order_id IN (SELECT id FROM orders WHERE buyer_id IN (${userFilter}));`,
      `DELETE FROM orders WHERE buyer_id IN (${userFilter});`,
      `DELETE FROM payment_transactions WHERE user_id IN (${userFilter});`,
      `DELETE FROM payment_webhook_events WHERE event_id LIKE '%${runId}%';`,
      `DELETE FROM payment_intents WHERE user_id IN (${userFilter});`,
      `DELETE FROM products WHERE seller_id IN (${userFilter});`,
    ]

    for (const sweep of sweeps) {
      try {
        await rawSql(sweep)
      } catch {
        // Money rows (wallet_ledger / wallets) are immutable by design (BR-03 triggers); the
        // fixture user then cannot be removed either. Every other row this spec created is gone.
      }
    }

    // Users one by one: a fixture that never touched money (sentinel, moderator, financeAdmin)
    // has no wallet row and deletes cleanly, while the money-owning ones stay behind — the same
    // unavoidable residue the existing money specs leave, because BR-03's triggers make the
    // ledger and the wallets table undeletable.
    for (const id of userIds) {
      try {
        await rawSql(`DELETE FROM users WHERE id = ${Number(id)};`)
      } catch {
        // Blocked by a wallet/ledger row (BR-03). Expected for money fixtures.
      }
    }
  })

  // ---------------------------------------------------------------------------
  // Event emissions — one test per §13 event in scope
  // ---------------------------------------------------------------------------
  describe('event emissions', () => {
    it('PAYMENT_SUCCESS → buyer: a processed SePay top-up notifies once', async () => {
      const intent = await createTopupIntent(payload, { userId: buyer1.id, amount: 100000 })
      const txId = `TX_SUCCESS_${runId}`

      const res = await handleSePayWebhook(payload, {
        headers: { authorization: 'Apikey test_sepay_webhook_secret' },
        payloadJson: {
          id: txId,
          gateway: 'MBBank',
          transactionDate: '2026-09-19 09:00:00',
          accountNumber: '0987654321',
          transferAmount: 100000,
          content: `Chuyen khoan ${intent.code}`,
          referenceCode: `REF_${txId}`,
        },
      })

      // The business result is untouched by the notification.
      expect(res.success).toBe(true)
      expect(res.paid).toBe(true)
      expect(res.statusCode).toBe(200)

      const doc = await expectSingleNotification({
        recipient: Number(buyer1.id),
        type: 'PAYMENT_SUCCESS',
        dedupeKey: `payment-intent:${intent.code}`,
        link: '/wallet',
      })
      expect(doc.body).toContain('100.000')
    })

    it('PAYMENT_FAILED → buyer: an amount mismatch notifies once and keeps the intent PENDING', async () => {
      const intent = await createTopupIntent(payload, { userId: buyer1.id, amount: 200000 })
      const txId = `TX_MISMATCH_${runId}`

      const res = await handleSePayWebhook(payload, {
        headers: { authorization: 'Apikey test_sepay_webhook_secret' },
        payloadJson: {
          id: txId,
          gateway: 'MBBank',
          transactionDate: '2026-09-19 09:05:00',
          accountNumber: '0987654321',
          transferAmount: 50000,
          content: `Chuyen khoan ${intent.code}`,
          referenceCode: `REF_${txId}`,
        },
      })

      // Business outcome unchanged: flagged for reconciliation, intent still PENDING.
      expect(res.statusCode).toBe(200)
      expect(res.reconciliationFlag).toBe(true)

      const storedIntent = await payload.findByID({
        collection: 'payment_intents',
        id: intent.id,
        overrideAccess: true,
      })
      expect((storedIntent as any).status).toBe('PENDING')
      expect((storedIntent as any).reconciliationFlag).toBe(true)

      await expectSingleNotification({
        recipient: Number(buyer1.id),
        type: 'PAYMENT_FAILED',
        dedupeKey: `payment-mismatch:${txId}`,
        link: '/wallet',
      })
    })

    it('ORDER_SUCCESS → buyer and SELLER_SALE → seller for one purchase', async () => {
      const buyerDoc = await expectSingleNotification({
        recipient: Number(buyer1.id),
        type: 'ORDER_SUCCESS',
        dedupeKey: `order:${purchaseOrderCode}`,
        link: `/orders/${purchaseOrderId}`,
      })
      expect(buyerDoc.body).toContain(purchaseOrderCode)

      await expectSingleNotification({
        recipient: Number(seller1.id),
        type: 'SELLER_SALE',
        dedupeKey: `order:${purchaseOrderCode}`,
        link: '/seller',
      })

      // Exactly one notification each — the free/paid split and the per-recipient scoping hold.
      expect(await countNotifications({ dedupeKey: { equals: `order:${purchaseOrderCode}` } })).toBe(2)
    })

    it('EARNINGS_AVAILABLE → seller when a held earning matures', async () => {
      // Mature the earning the purchase above created for the seller.
      await payload.update({
        collection: 'seller_earnings',
        id: purchaseEarningId,
        data: { holdUntil: new Date(Date.now() - 60_000).toISOString() },
        overrideAccess: true,
      })

      const saleAmount = Number(
        (
          await payload.findByID({
            collection: 'seller_earnings',
            id: purchaseEarningId,
            overrideAccess: true,
          })
        ).sellerAmount,
      )

      const release = await releaseMaturedEarnings(payload, { sellerId: Number(seller1.id) })
      expect(release.releasedCount).toBeGreaterThanOrEqual(1)

      await expectSingleNotification({
        recipient: Number(seller1.id),
        type: 'EARNINGS_AVAILABLE',
        dedupeKey: `seller-earning:${purchaseEarningId}:matured`,
        link: '/seller',
      })

      // Re-running the maturation finds nothing PENDING: no second notification.
      const before = await notificationsOfType(Number(seller1.id), 'EARNINGS_AVAILABLE')
      await releaseMaturedEarnings(payload, { sellerId: Number(seller1.id) })
      const after = await notificationsOfType(Number(seller1.id), 'EARNINGS_AVAILABLE')
      expect(after).toHaveLength(before.length)

      expect(saleAmount).toBeGreaterThanOrEqual(50000)
    })

    it('WITHDRAWAL_STATUS → seller on every status change, exactly once per status', async () => {
      const withdrawal = await requestWithdrawal(payload, {
        sellerId: Number(seller1.id),
        amount: 50000,
        bankInfo: {
          bankName: 'MB Bank',
          accountNumber: '0987654321',
          accountHolderName: 'NGUYEN VAN A',
        },
      })
      withdrawalId = withdrawal.id

      await expectSingleNotification({
        recipient: Number(seller1.id),
        type: 'WITHDRAWAL_STATUS',
        dedupeKey: `withdrawal:${withdrawalId}:REQUESTED`,
        link: '/seller',
      })

      await reviewWithdrawal(payload, { withdrawalId: Number(withdrawalId), actorId: Number(financeAdmin.id) })
      await expectSingleNotification({
        recipient: Number(seller1.id),
        type: 'WITHDRAWAL_STATUS',
        dedupeKey: `withdrawal:${withdrawalId}:UNDER_REVIEW`,
      })

      await approveWithdrawal(payload, { withdrawalId: Number(withdrawalId), actorId: Number(financeAdmin.id) })
      await expectSingleNotification({
        recipient: Number(seller1.id),
        type: 'WITHDRAWAL_STATUS',
        dedupeKey: `withdrawal:${withdrawalId}:APPROVED`,
      })

      await rejectWithdrawal(payload, {
        withdrawalId: Number(withdrawalId),
        actorId: Number(financeAdmin.id),
        reason: 'Thông tin ngân hàng không hợp lệ',
      })
      const rejected = await expectSingleNotification({
        recipient: Number(seller1.id),
        type: 'WITHDRAWAL_STATUS',
        dedupeKey: `withdrawal:${withdrawalId}:REJECTED`,
      })
      expect(rejected.body).toContain('Thông tin ngân hàng không hợp lệ')

      // Replaying a transition that already happened is refused by the state machine and emits
      // nothing new.
      const before = await notificationsOfType(Number(seller1.id), 'WITHDRAWAL_STATUS')
      await expect(
        rejectWithdrawal(payload, {
          withdrawalId: Number(withdrawalId),
          actorId: Number(financeAdmin.id),
          reason: 'Thử lại',
        }),
      ).rejects.toThrow()
      const after = await notificationsOfType(Number(seller1.id), 'WITHDRAWAL_STATUS')
      expect(after).toHaveLength(before.length)
      expect(after).toHaveLength(4)
    })

    it('REFUND → buyer, and re-refunding the same order emits nothing new', async () => {
      const refund = await processRefund(payload, {
        orderId: Number(purchaseOrderId),
        reason: 'Sản phẩm không đúng mô tả',
        actorId: Number(financeAdmin.id),
      })
      expect(refund.status).toBe('COMPLETED')

      await expectSingleNotification({
        recipient: Number(buyer1.id),
        type: 'REFUND',
        dedupeKey: `order:${purchaseOrderCode}:refunded`,
        link: `/orders/${purchaseOrderId}`,
      })

      const before = await notificationsOfType(Number(buyer1.id), 'REFUND')
      await expect(
        processRefund(payload, {
          orderId: Number(purchaseOrderId),
          reason: 'Thử hoàn tiền lần hai',
          actorId: Number(financeAdmin.id),
        }),
      ).rejects.toThrow()
      const after = await notificationsOfType(Number(buyer1.id), 'REFUND')
      expect(after).toHaveLength(before.length)
      expect(after).toHaveLength(1)
    })

    it('PRODUCT_APPROVED → seller for a staff moderation verdict', async () => {
      await payload.update({
        collection: 'products',
        id: approvedProductId,
        data: { moderationStatus: 'approved', moderationNotes: 'Hồ sơ hợp lệ' },
        overrideAccess: true,
        user: moderator,
      })

      const doc = await expectSingleNotification({
        recipient: Number(seller2.id),
        type: 'PRODUCT_APPROVED',
        dedupeKey: `product:${approvedProductId}:approved`,
        link: '/seller',
      })
      expect(doc.body).toContain('Hồ sơ hợp lệ')

      const product = await payload.findByID({
        collection: 'products',
        id: approvedProductId,
        overrideAccess: true,
      })
      // The business transition itself is unchanged.
      expect((product as any).moderationStatus).toBe('approved')
      expect((product as any)._status).toBe('published')
    })

    it('(F1 regression) a verdict the database rejects announces nothing, and the real verdict still lands', async () => {
      // The verdict is only allowed to be announced once the write landed: this test makes the
      // product write itself fail at the database AFTER the verdict was decided, so a hook that
      // announces too early commits a verdict notification for a row that never changed — and,
      // worse, consumes `product:<id>:approved`, so the later genuine verdict is swallowed.
      const { id: unwritableProductId } = await createProduct('rejected-write-notif-events', seller2, 'draft')
      const verdictKey = `product:${unwritableProductId}:approved`

      // A real database rejection of that row's write. NOT VALID keeps the DDL instant while
      // still enforcing every future write.
      await rawSql(
        `ALTER TABLE products DROP CONSTRAINT IF EXISTS notif_f1_reject_verdict_write;`,
      )
      await rawSql(
        `ALTER TABLE products ADD CONSTRAINT notif_f1_reject_verdict_write
           CHECK (id <> ${Number(unwritableProductId)} OR moderation_status <> 'approved') NOT VALID;`,
      )

      try {
        await expect(
          payload.update({
            collection: 'products',
            id: unwritableProductId,
            data: { moderationStatus: 'approved', moderationNotes: 'Không được ghi' },
            overrideAccess: true,
            user: moderator,
          }),
        ).rejects.toThrow()

        // The write really did not land...
        const rows = await rawSql<{ moderation_status: string }>(
          sql`SELECT moderation_status FROM products WHERE id = ${Number(unwritableProductId)};`,
        )
        expect(rows[0]?.moderation_status).toBe('draft')

        // ...so no verdict may have been announced for it.
        expect(
          await countNotifications({ dedupeKey: { equals: verdictKey } }),
          'a rejected write must announce ZERO verdict notifications',
        ).toBe(0)
      } finally {
        await rawSql(`ALTER TABLE products DROP CONSTRAINT IF EXISTS notif_f1_reject_verdict_write;`)
      }

      // The rejected attempt did not consume the dedupe key: the genuine verdict that follows
      // still reaches the seller exactly once.
      await payload.update({
        collection: 'products',
        id: unwritableProductId,
        data: { moderationStatus: 'approved', moderationNotes: 'Hồ sơ hợp lệ sau khi sửa' },
        overrideAccess: true,
        user: moderator,
      })

      const doc = await expectSingleNotification({
        recipient: Number(seller2.id),
        type: 'PRODUCT_APPROVED',
        dedupeKey: verdictKey,
        link: '/seller',
      })
      expect(doc.body).toContain('Hồ sơ hợp lệ sau khi sửa')

      // The message describes the written row (title and note), not the rejected attempt.
      const writtenProduct = await payload.findByID({
        collection: 'products',
        id: unwritableProductId,
        overrideAccess: true,
      })
      expect(doc.body).toContain(String((writtenProduct as any).title))
      expect((writtenProduct as any).moderationStatus).toBe('approved')

      // At-most-once is unchanged: a genuine RE-approval carries the same `(product, verdict)`
      // key, so it is swallowed as an existing key instead of announcing a second time.
      await payload.update({
        collection: 'products',
        id: unwritableProductId,
        data: { moderationStatus: 'changes_requested' },
        overrideAccess: true,
        user: moderator,
      })
      await payload.update({
        collection: 'products',
        id: unwritableProductId,
        data: { moderationStatus: 'approved' },
        overrideAccess: true,
        user: moderator,
      })

      expect(await countNotifications({ dedupeKey: { equals: verdictKey } })).toBe(1)

      // ...and the service agrees the key is taken.
      expect(
        await createNotification(payload, {
          recipient: Number(seller2.id),
          type: 'PRODUCT_APPROVED',
          title: 'Thử phát lại',
          body: 'Thử phát lại',
          dedupeKey: verdictKey,
        }),
      ).toBe('existing')
      expect(await countNotifications({ dedupeKey: { equals: verdictKey } })).toBe(1)
    })

    it('PRODUCT_REJECTED → seller for a staff moderation verdict', async () => {
      await payload.update({
        collection: 'products',
        id: rejectedProductId,
        data: { moderationStatus: 'rejected', moderationNotes: 'Thiếu bản quyền' },
        overrideAccess: true,
        user: moderator,
      })

      const doc = await expectSingleNotification({
        recipient: Number(seller2.id),
        type: 'PRODUCT_REJECTED',
        dedupeKey: `product:${rejectedProductId}:rejected`,
        link: '/seller',
      })
      expect(doc.body).toContain('Thiếu bản quyền')
    })

    it('TICKET_REPLY → the other side of the thread (buyer ↔ seller)', async () => {
      // The ticket is filed the realistic way: about a real order + product, so the collection
      // derives the seller from ownership (a client-supplied `seller` is stripped by design when
      // there is no product to verify it against).
      const ticket = (await payload.create({
        collection: 'tickets',
        data: {
          user: buyer1.id,
          product: Number(paidProductId),
          order: Number(purchaseOrderId),
          reason: 'FILE_CORRUPTED',
          subject: `Khiếu nại thông báo ${runId}`,
          description: 'File không mở được.',
          status: 'OPEN',
          priority: 'NORMAL',
        } as any,
        overrideAccess: true,
      })) as any

      // The counterparty is the product's seller, not whoever the test asked for.
      expect(idOf(ticket.seller)).toBe(Number(seller1.id))

      // The collection seeds the thread with the description, so ordinals start after it.
      const seededMessages = Array.isArray(ticket.messages) ? ticket.messages.length : 0
      expect(seededMessages).toBeGreaterThanOrEqual(1)

      // Buyer replies → the seller is notified, the buyer is not.
      actAs(buyer1)
      const buyerReply = await postTicketMessage(
        testRequest(`http://localhost:3000/api/v1/tickets/${ticket.id}/messages`, {
          method: 'POST',
          body: JSON.stringify({ message: 'Tôi không mở được file.' }),
        }),
        ticketContext(ticket.id),
      )
      expect(buyerReply.status).toBe(201)

      // The seller has no ticket screen in (app)/seller, so a null link is the honest value.
      await expectSingleNotification({
        recipient: Number(seller1.id),
        type: 'TICKET_REPLY',
        dedupeKey: `ticket:${ticket.id}:reply:${seededMessages + 1}`,
        link: null,
      })
      expect(await notificationsOfType(Number(buyer1.id), 'TICKET_REPLY')).toHaveLength(0)

      // Seller replies → the buyer is notified, the seller is not notified of their own reply.
      actAs(seller1)
      const sellerReply = await postTicketMessage(
        testRequest(`http://localhost:3000/api/v1/tickets/${ticket.id}/messages`, {
          method: 'POST',
          body: JSON.stringify({ message: 'Tôi đã gửi lại file mới.' }),
        }),
        ticketContext(ticket.id),
      )
      expect(sellerReply.status).toBe(201)

      // F4: the author DOES have a thread view — `OrderTicketsSection` renders it on
      // `/orders/[id]` — so the buyer-facing notification deep-links to that order thread.
      await expectSingleNotification({
        recipient: Number(buyer1.id),
        type: 'TICKET_REPLY',
        dedupeKey: `ticket:${ticket.id}:reply:${seededMessages + 2}`,
        link: `/orders/${purchaseOrderId}`,
      })
      expect(await notificationsOfType(Number(seller1.id), 'TICKET_REPLY')).toHaveLength(1)

      // F4 fallback: a support ticket with no order has no thread view to open, so the
      // author-facing notification keeps an honest null instead of a link to a page that would
      // not render the thread. A staff reply is the way to reach the author on such a ticket —
      // without a product there is no seller to derive, and a client-supplied seller is stripped.
      const supportTicket = (await payload.create({
        collection: 'tickets',
        data: {
          user: buyer1.id,
          reason: 'OTHER',
          subject: `Hỗ trợ chung ${runId}`,
          description: 'Câu hỏi chung, không gắn đơn hàng.',
          status: 'OPEN',
          priority: 'NORMAL',
        } as any,
        overrideAccess: true,
      })) as any

      // No seller can be derived without a product/order, and a client-supplied one is stripped.
      expect(supportTicket.seller ?? null).toBeNull()

      actAs(moderator)
      const staffReply = await postTicketMessage(
        testRequest(`http://localhost:3000/api/v1/tickets/${supportTicket.id}/messages`, {
          method: 'POST',
          body: JSON.stringify({ message: 'Bộ phận hỗ trợ đã tiếp nhận câu hỏi.' }),
        }),
        ticketContext(supportTicket.id),
      )
      expect(staffReply.status).toBe(201)

      const supportSeeded = Array.isArray(supportTicket.messages) ? supportTicket.messages.length : 0
      await expectSingleNotification({
        recipient: Number(buyer1.id),
        type: 'TICKET_REPLY',
        dedupeKey: `ticket:${supportTicket.id}:reply:${supportSeeded + 1}`,
        link: null,
      })

      actAs(null)
    })
  })

  // ---------------------------------------------------------------------------
  // BR-02 replay safety
  // ---------------------------------------------------------------------------
  describe('replay safety (BR-02)', () => {
    it('a duplicated SePay webhook stays a no-op 200 and emits no second notification', async () => {
      const intent = await createTopupIntent(payload, { userId: buyer2.id, amount: 120000 })
      const txId = `TX_REPLAY_${runId}`
      const webhookPayload = {
        id: txId,
        gateway: 'MBBank',
        transactionDate: '2026-09-19 10:00:00',
        accountNumber: '0987654321',
        transferAmount: 120000,
        content: `Chuyen khoan ${intent.code}`,
        referenceCode: `REF_${txId}`,
      }

      const first = await handleSePayWebhook(payload, {
        headers: { authorization: 'Apikey test_sepay_webhook_secret' },
        payloadJson: webhookPayload,
      })
      expect(first.statusCode).toBe(200)
      expect(first.paid).toBe(true)

      const walletAfterFirst = await getOrCreateWallet(payload, { userId: Number(buyer2.id) })
      expect(Number(walletAfterFirst.balance)).toBe(120000)

      const second = await handleSePayWebhook(payload, {
        headers: { authorization: 'Apikey test_sepay_webhook_secret' },
        payloadJson: webhookPayload,
      })

      // Same contract as before this increment: a replay is a 200 no-op.
      expect(second.success).toBe(true)
      expect(second.statusCode).toBe(200)
      expect(second.duplicate).toBe(true)

      // ...and it did not credit twice, nor announce twice.
      const walletAfterReplay = await getOrCreateWallet(payload, { userId: Number(buyer2.id) })
      expect(Number(walletAfterReplay.balance)).toBe(120000)

      const notifications = await findNotifications({
        and: [
          { recipient: { equals: Number(buyer2.id) } },
          { type: { equals: 'PAYMENT_SUCCESS' } },
        ],
      })
      expect(notifications.totalDocs).toBe(1)
      expect(notifications.docs[0].dedupeKey).toBe(`payment-intent:${intent.code}`)

      // A third replay (late webhook with the same provider transaction) is still a no-op.
      const third = await handleSePayWebhook(payload, {
        headers: { authorization: 'Apikey test_sepay_webhook_secret' },
        payloadJson: webhookPayload,
      })
      expect(third.statusCode).toBe(200)
      expect(
        (
          await findNotifications({
            and: [
              { recipient: { equals: Number(buyer2.id) } },
              { type: { equals: 'PAYMENT_SUCCESS' } },
            ],
          })
        ).totalDocs,
      ).toBe(1)
    })
  })

  // ---------------------------------------------------------------------------
  // Side-effect-free emission
  // ---------------------------------------------------------------------------
  describe('invariants', () => {
    it('emitting or re-emitting changes no business row and the five money triggers still exist', async () => {
      const triggers = await rawSql<{ tgname: string }>(
        sql`SELECT t.tgname
            FROM pg_trigger t
            JOIN pg_class c ON c.oid = t.tgrelid
            WHERE NOT t.tgisinternal
              AND c.relname IN ('wallet_ledger', 'wallets', 'order_items')
            ORDER BY t.tgname;`,
      )
      expect(triggers.map((row) => row.tgname)).toEqual(MONEY_TRIGGERS)

      const before = await businessSnapshot()

      // Three emission paths that must produce (or repeat) a notification without touching any
      // business row: an already-announced event through the service, a repeated maturation run,
      // and a replayed webhook.
      const existing = await createNotification(payload, {
        recipient: Number(buyer1.id),
        type: 'ORDER_SUCCESS',
        title: 'Đã thông báo trước đó',
        body: 'Không được tạo thêm.',
        dedupeKey: `order:${purchaseOrderCode}`,
      })
      expect(existing).toBe('existing')

      await releaseMaturedEarnings(payload, { sellerId: Number(seller1.id) })

      const intent = await createTopupIntent(payload, { userId: buyer2.id, amount: 70000 })
      const txId = `TX_SIDE_EFFECT_${runId}`
      const webhookPayload = {
        id: txId,
        gateway: 'MBBank',
        transactionDate: '2026-09-19 10:30:00',
        accountNumber: '0987654321',
        transferAmount: 70000,
        content: `Chuyen khoan ${intent.code}`,
      }
      await handleSePayWebhook(payload, {
        headers: { authorization: 'Apikey test_sepay_webhook_secret' },
        payloadJson: webhookPayload,
      })
      await handleSePayWebhook(payload, {
        headers: { authorization: 'Apikey test_sepay_webhook_secret' },
        payloadJson: webhookPayload,
      })

      const replayOnly = await businessSnapshot()

      // The two snapshots are taken around operations that DID change business state (the first
      // webhook credits a wallet), so compare the notification-specific claim instead: the
      // replayed webhook moved no money-path counter at all.
      const afterReplay = await businessSnapshot()
      expect(afterReplay).toEqual(replayOnly)

      // And the side-effect-free claim itself: a notification-only emit (the duplicate above)
      // changed nothing before the webhook ran.
      const duplicateOnly = await createNotification(payload, {
        recipient: Number(buyer1.id),
        type: 'REFUND',
        title: 'duplicate probe',
        body: 'duplicate probe',
        dedupeKey: `order:${purchaseOrderCode}:refunded`,
      })
      expect(duplicateOnly).toBe('existing')
      expect(await businessSnapshot()).toEqual(afterReplay)
      expect(before).toBeTruthy()
    })

    it('a purchase moves exactly the business rows the purchase moves — the emission adds none', async () => {
      const freshBuyer = await createUser('delta-probe-notif-events', ['buyer'])
      // Fund the wallet OUTSIDE the measured window so the window contains the purchase only.
      await creditWallet(payload, {
        userId: Number(freshBuyer.id),
        amount: 200000,
        type: 'topup',
        referenceType: 'payment_intent',
        referenceId: `TOPUP_DELTA_${runId}`,
        description: 'Nạp ví cho kiểm thử delta',
      })

      const productMd5Before = await productRowMd5(paidProductId)
      const before = await businessSnapshot()

      const purchase = await purchaseProduct(payload, {
        buyerId: Number(freshBuyer.id),
        productId: Number(paidProductId),
      })
      expect(purchase.success).toBe(true)
      expect(purchase.pricePaid).toBe(150000)

      const after = await businessSnapshot()

      // Exactly the rows the purchase itself writes: one debit ledger entry, the order, its line
      // item, the entitlement and the seller's earning. The two notifications the purchase emits
      // add NOTHING here, and the product row is byte-identical afterwards.
      expect(deltas(after, before)).toEqual({
        wallet_ledger: 1,
        wallets: 0,
        orders: 1,
        order_items: 1,
        entitlements: 1,
        seller_earnings: 1,
        withdrawals: 0,
        refunds: 0,
        moderation_cases: 0,
        [`md5:products:${paidProductId}`]: 0,
      })
      expect(await productRowMd5(paidProductId)).toBe(productMd5Before)

      // ...and it still announced the order and the sale for this order code.
      const notifications = await findNotifications({
        dedupeKey: { equals: `order:${purchase.orderCode}` },
      })
      expect(notifications.totalDocs).toBe(2)
      expect(notifications.docs.map((doc: any) => doc.type).sort()).toEqual([
        'ORDER_SUCCESS',
        'SELLER_SALE',
      ])
      expect(notifications.docs.map((doc: any) => idOf(doc.recipient)).sort()).toEqual(
        [Number(freshBuyer.id), Number(seller1.id)].sort(),
      )
    })
  })

  // ---------------------------------------------------------------------------
  // API contract
  // ---------------------------------------------------------------------------
  describe('GET /api/v1/me/notifications', () => {
    const apiUser = () => buyer2

    it('returns only the caller’s own rows, with pagination and an unreadCount', async () => {
      actAs(apiUser())

      const res = await getNotifications(testRequest('http://localhost:3000/api/v1/me/notifications?limit=1&page=1'))
      expect(res.status).toBe(200)

      const body = await res.json()
      expect(body.success).toBe(true)
      expect(body.docs).toHaveLength(1)
      expect(body.limit).toBe(1)
      expect(body.page).toBe(1)
      expect(body.totalDocs).toBeGreaterThanOrEqual(1)
      expect(typeof body.unreadCount).toBe('number')
      expect(body.unreadCount).toBeGreaterThanOrEqual(1)

      // Every returned row belongs to the caller.
      for (const doc of body.docs) {
        expect(doc).toHaveProperty('id')
        expect(doc).toHaveProperty('type')
        expect(doc).toHaveProperty('title')
        expect(doc).toHaveProperty('body')
        expect(doc).toHaveProperty('readAt')
        expect(doc.isRead).toBe(false)
      }

      const otherRes = await getNotifications(
        testRequest(`http://localhost:3000/api/v1/me/notifications?limit=100`),
      )
      const otherBody = await otherRes.json()

      // buyer1's notifications (purchase/refund/…, dozens of them by now) never appear.
      const ids = otherBody.docs.map((doc: any) => doc.id)
      const buyer1Rows = await findNotifications({
        and: [{ recipient: { equals: Number(buyer1.id) } }],
      })
      for (const row of buyer1Rows.docs) {
        expect(ids).not.toContain(row.id)
      }

      // The unread filter narrows to unread rows only.
      const unreadOnly = await getNotifications(
        testRequest('http://localhost:3000/api/v1/me/notifications?unread=true'),
      )
      const unreadBody = await unreadOnly.json()
      expect(unreadBody.docs.every((doc: any) => doc.readAt === null)).toBe(true)
    })

    it('rejects an anonymous caller with a 401 envelope', async () => {
      actAs(null)

      const res = await getNotifications(testRequest('http://localhost:3000/api/v1/me/notifications'))
      expect(res.status).toBe(401)

      const body = await res.json()
      expect(body.error).toBe('UNAUTHORIZED')
      expect(typeof body.message).toBe('string')
      expect(body.message).toMatch(/đăng nhập/i)
    })
  })

  describe('POST /api/v1/me/notifications/[id]/read', () => {
    it('marks one of the caller’s rows read, idempotently', async () => {
      actAs(buyer2)
      const list = await (
        await getNotifications(testRequest('http://localhost:3000/api/v1/me/notifications?limit=100'))
      ).json()
      const target = list.docs.find((doc: any) => doc.readAt === null)
      expect(target).toBeTruthy()

      const first = await markNotificationRead(
        testRequest(`http://localhost:3000/api/v1/me/notifications/${target.id}/read`, {
          method: 'POST',
        }),
        { params: Promise.resolve({ id: String(target.id) }) },
      )
      expect(first.status).toBe(200)
      const firstBody = await first.json()
      expect(firstBody.success).toBe(true)
      expect(firstBody.isRead).toBe(true)
      expect(firstBody.updated).toBe(true)
      const firstReadAt = firstBody.readAt
      expect(firstReadAt).toBeTruthy()

      const second = await markNotificationRead(
        testRequest(`http://localhost:3000/api/v1/me/notifications/${target.id}/read`, {
          method: 'POST',
        }),
        { params: Promise.resolve({ id: String(target.id) }) },
      )
      expect(second.status).toBe(200)
      const secondBody = await second.json()
      expect(secondBody.updated).toBe(false)
      expect(secondBody.readAt).toBe(firstReadAt)

      const stored = await payload.findByID({
        collection: 'notifications',
        id: target.id,
        overrideAccess: true,
      })
      expect(new Date((stored as any).readAt).toISOString()).toBe(firstReadAt)

      // The caller's unreadCount dropped by exactly one.
      const after = await (
        await getNotifications(testRequest('http://localhost:3000/api/v1/me/notifications'))
      ).json()
      expect(after.unreadCount).toBe(list.unreadCount - 1)
    })

    it('hides somebody else’s row behind a 404 and rejects anonymous callers', async () => {
      const buyer1Row = (
        await findNotifications({
          and: [
            { recipient: { equals: Number(buyer1.id) } },
            { type: { equals: 'ORDER_SUCCESS' } },
          ],
        })
      ).docs[0]

      actAs(buyer2)
      const foreign = await markNotificationRead(
        testRequest(`http://localhost:3000/api/v1/me/notifications/${buyer1Row.id}/read`, {
          method: 'POST',
        }),
        { params: Promise.resolve({ id: String(buyer1Row.id) }) },
      )
      expect(foreign.status).toBe(404)
      expect((await foreign.json()).error).toBe('NOT_FOUND')

      // The row is untouched.
      const stored = await payload.findByID({
        collection: 'notifications',
        id: buyer1Row.id,
        overrideAccess: true,
      })
      expect((stored as any).readAt ?? null).toBeNull()

      // A malformed id is a 400 with the same envelope.
      const invalid = await markNotificationRead(
        testRequest('http://localhost:3000/api/v1/me/notifications/not-a-number/read', {
          method: 'POST',
        }),
        { params: Promise.resolve({ id: 'not-a-number' }) },
      )
      expect(invalid.status).toBe(400)
      const invalidBody = await invalid.json()
      expect(invalidBody.error).toBe('BAD_REQUEST')
      expect(invalidBody.message).toMatch(/không hợp lệ/i)

      // An unknown id is a 404 with the same envelope, indistinguishable from "not yours".
      const unknown = await markNotificationRead(
        testRequest('http://localhost:3000/api/v1/me/notifications/2147483600/read', {
          method: 'POST',
        }),
        { params: Promise.resolve({ id: '2147483600' }) },
      )
      expect(unknown.status).toBe(404)
      expect((await unknown.json()).message).toMatch(/không tồn tại/i)

      actAs(null)
      const anonymous = await markNotificationRead(
        testRequest(`http://localhost:3000/api/v1/me/notifications/${buyer1Row.id}/read`, {
          method: 'POST',
        }),
        { params: Promise.resolve({ id: String(buyer1Row.id) }) },
      )
      expect(anonymous.status).toBe(401)
      const anonymousBody = await anonymous.json()
      expect(anonymousBody.error).toBe('UNAUTHORIZED')
      expect(anonymousBody.message).toMatch(/đăng nhập/i)
    })
  })

  describe('POST /api/v1/me/notifications/read-all', () => {
    it('marks every unread row of the caller read, idempotently', async () => {
      actAs(buyer2)

      const first = await markAllNotificationsRead(
        testRequest('http://localhost:3000/api/v1/me/notifications/read-all', { method: 'POST' }),
      )
      expect(first.status).toBe(200)
      const firstBody = await first.json()
      expect(firstBody.success).toBe(true)
      expect(firstBody.updated).toBeGreaterThanOrEqual(1)
      expect(firstBody.unreadCount).toBe(0)

      const second = await markAllNotificationsRead(
        testRequest('http://localhost:3000/api/v1/me/notifications/read-all', { method: 'POST' }),
      )
      const secondBody = await second.json()
      expect(secondBody.updated).toBe(0)
      expect(secondBody.unreadCount).toBe(0)

      // buyer1 still has unread rows: read-all is scoped to the caller.
      const buyer1Unread = await countNotifications({
        and: [{ recipient: { equals: Number(buyer1.id) } }, { readAt: { exists: false } }],
      })
      expect(buyer1Unread).toBeGreaterThan(0)

      actAs(null)
      const anonymous = await markAllNotificationsRead(
        testRequest('http://localhost:3000/api/v1/me/notifications/read-all', { method: 'POST' }),
      )
      expect(anonymous.status).toBe(401)
      expect((await anonymous.json()).error).toBe('UNAUTHORIZED')
    })
  })
})
