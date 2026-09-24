import { getPayload, type Payload } from 'payload'
import config from '@/payload.config'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import type { User } from '@/payload-types'
import { processRefund } from '@/services/refund'
import { getOrCreateWallet } from '@/services/wallet'

/**
 * Decision 0012's F1/F2/F3 amendments, at the money-path level.
 *
 * F1 — a SELLER-basis refund against an earning that is already `PAID`: the buyer is refunded in
 * full and the refund always proceeds, but the paid earning is left EXACTLY as it stands and is
 * excluded from `sellerAmountRefunded`, because reversing it would record a recovery that did not
 * happen (a withdrawal has paid the seller, so the platform bore this refund). `AVAILABLE` is NOT
 * excluded: a matured earning has not been paid out, so reversing it is a real recovery.
 * F3 — a SELLER-basis refund on an order whose earnings belong to more than one seller is refused
 * with a deterministic error, writing nothing; a PLATFORM basis is unaffected.
 *
 * F2 is a field-description clarification in `web/src/collections/Refunds/index.ts` and has no
 * runtime behaviour to assert here.
 */
describe('Decision 0012 F1/F3: PAID-earning protection and the multi-seller refusal', () => {
  let payload: Payload
  let bootstrapUser: User
  let sellerA: User
  let sellerB: User
  let buyer: User
  let financeAdmin: User

  const cleanup = {
    refunds: [] as (number | string)[],
    orders: [] as (number | string)[],
    products: [] as (number | string)[],
    productFiles: [] as (number | string)[],
    users: [] as (number | string)[],
  }

  let seq = 0
  const getSeq = () => ++seq

  const createUser = async (email: string, roles: User['roles']): Promise<User> => {
    const user = (await payload.create({
      collection: 'users',
      data: { email, password: 'test-password-amendments-123', name: email.split('@')[0], roles },
      overrideAccess: true,
    })) as User
    cleanup.users.push(user.id)
    return user
  }

  const createProduct = async (sellerId: number, label: string, price: number) => {
    const content = Buffer.from(`AMENDMENT_FIXTURE_${label}_${Date.now()}`)
    const file = await payload.create({
      collection: 'product_files',
      data: {
        seller: sellerId,
        originalFilename: `amendment-${label}-${getSeq()}.dwg`,
        fileFormat: '.dwg',
      },
      file: {
        data: content,
        name: `amendment-${label}-${getSeq()}.dwg`,
        mimetype: 'application/octet-stream',
        size: content.length,
      },
      overrideAccess: true,
    })
    cleanup.productFiles.push(file.id)

    const product = await payload.create({
      collection: 'products',
      data: {
        title: `Amendment fixture ${label} ${getSeq()}`,
        slug: `amendment-${label}-${Date.now()}-${getSeq()}`,
        price,
        isFree: false,
        seller: sellerId,
        originalFiles: [file.id],
        copyrightDeclared: true,
        moderationStatus: 'approved',
        _status: 'published',
      },
      overrideAccess: true,
    })
    cleanup.products.push(product.id)
    return product
  }

  const createOrder = async (totalAmount: number, label: string) => {
    const order = await payload.create({
      collection: 'orders',
      data: {
        code: `ORD-AMEND-${Date.now()}-${label}-${getSeq()}`,
        buyer: buyer.id,
        totalAmount,
        currency: 'VND',
        status: 'COMPLETED',
        paymentSource: 'wallet',
        paidAt: new Date().toISOString(),
        notes: `amendment fixture ${label}`,
      },
      overrideAccess: true,
    })
    cleanup.orders.push(order.id)
    return order
  }

  /** One order line plus the PENDING/AVAILABLE/PAID earning a purchase would have produced. */
  const createLine = async (params: {
    orderId: number
    productId: number
    sellerId: number
    salePrice: number
    status: 'PENDING' | 'AVAILABLE' | 'PAID'
    label: string
  }) => {
    const platformFee = Math.round(params.salePrice * 0.3)
    const sellerAmount = params.salePrice - platformFee

    const item = await payload.create({
      collection: 'order_items',
      data: {
        order: params.orderId,
        product: params.productId,
        seller: params.sellerId,
        salePrice: params.salePrice,
        platformFee,
        sellerAmount,
        tax: 0,
        policyVersion: 'v1',
      },
      overrideAccess: true,
    })

    const earning = await payload.create({
      collection: 'seller_earnings',
      data: {
        seller: params.sellerId,
        order: params.orderId,
        orderItem: Number(item.id),
        product: params.productId,
        salePrice: params.salePrice,
        platformFee,
        sellerAmount,
        tax: 0,
        commissionRate: 0.3,
        currency: 'VND',
        status: params.status,
        holdPeriodDays: 7,
        holdUntil: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        ...(params.status === 'PAID' ? { paidAt: new Date().toISOString() } : {}),
        policyVersion: 'v1',
      },
      overrideAccess: true,
    })

    return { itemId: Number(item.id), earningId: Number(earning.id), platformFee, sellerAmount }
  }

  const refundRowsOfOrder = async (orderId: number) => {
    const found = await payload.find({
      collection: 'refunds',
      where: { order: { equals: orderId } },
      limit: 10,
      depth: 0,
      overrideAccess: true,
    })
    return found.docs
  }

  const refundLedgerRowsOfOrder = async (orderCode: string) => {
    const found = await payload.find({
      collection: 'wallet_ledger',
      where: {
        and: [{ referenceId: { equals: orderCode } }, { type: { equals: 'refund' } }],
      },
      limit: 10,
      depth: 0,
      overrideAccess: true,
    })
    return found.docs
  }

  const storedEarning = async (earningId: number) =>
    payload.findByID({ collection: 'seller_earnings', id: earningId, overrideAccess: true })

  const storedOrder = async (orderId: number) =>
    payload.findByID({ collection: 'orders', id: orderId, overrideAccess: true })

  beforeAll(async () => {
    payload = await getPayload({ config })

    const timestamp = Date.now()
    // `ensureFirstUserIsAdmin` promotes the first user of an empty users table; absorb it first so
    // the role-sensitive fixtures below hold exactly the roles they declare.
    bootstrapUser = await createUser(`bootstrap-amd-${timestamp}-${getSeq()}@kientaohub.local`, [
      'buyer',
    ])
    sellerA = await createUser(`seller-a-amd-${timestamp}-${getSeq()}@kientaohub.local`, ['seller'])
    sellerB = await createUser(`seller-b-amd-${timestamp}-${getSeq()}@kientaohub.local`, ['seller'])
    buyer = await createUser(`buyer-amd-${timestamp}-${getSeq()}@kientaohub.local`, ['buyer'])
    financeAdmin = await createUser(`finance-amd-${timestamp}-${getSeq()}@kientaohub.local`, [
      'financeAdmin',
    ])

    expect(sellerA.roles).toEqual(['seller'])
    expect(sellerB.roles).toEqual(['seller'])
    expect(financeAdmin.roles).toEqual(['financeAdmin'])

    await getOrCreateWallet(payload, { userId: buyer.id })
  })

  afterAll(async () => {
    for (const id of cleanup.refunds) {
      try {
        await payload.delete({ collection: 'refunds' as never, id, overrideAccess: true })
      } catch {
        /* ignore */
      }
    }
    for (const orderId of cleanup.orders) {
      for (const collection of ['order_items', 'seller_earnings'] as const) {
        const rows = await payload
          .find({
            collection: collection as 'order_items',
            where: { order: { equals: orderId } },
            limit: 100,
            depth: 0,
            overrideAccess: true,
          })
          .catch(() => null)
        for (const row of rows?.docs ?? []) {
          try {
            await payload.delete({ collection: collection as 'order_items', id: row.id, overrideAccess: true })
          } catch {
            /* ignore */
          }
        }
      }
      try {
        await payload.delete({ collection: 'orders', id: orderId, overrideAccess: true })
      } catch {
        /* ignore */
      }
    }
    for (const id of cleanup.products) {
      try {
        await payload.delete({ collection: 'products', id, overrideAccess: true })
      } catch {
        /* ignore */
      }
    }
    for (const id of cleanup.productFiles) {
      try {
        await payload.delete({ collection: 'product_files', id, overrideAccess: true })
      } catch {
        /* ignore */
      }
    }
    for (const id of cleanup.users) {
      try {
        await payload.delete({ collection: 'users', id, overrideAccess: true })
      } catch {
        /* ignore */
      }
    }
  })

  it('F1: leaves an already-PAID earning exactly as it stands and excludes it from sellerAmountRefunded', async () => {
    const product = await createProduct(sellerA.id, 'paid', 150000)
    const order = await createOrder(150000, 'paid-earning')
    const line = await createLine({
      orderId: Number(order.id),
      productId: Number(product.id),
      sellerId: sellerA.id,
      salePrice: 150000,
      status: 'PAID',
      label: 'paid',
    })
    const paidAtBefore = (await storedEarning(line.earningId)).paidAt

    const refund = await processRefund(payload, {
      orderId: Number(order.id),
      reason: 'File bàn giao lỗi, người bán đã được chi trả',
      actorId: financeAdmin.id,
      faultBasis: 'SELLER',
    })
    cleanup.refunds.push(refund.refundId)

    // The buyer side is unchanged: full credit through the one write path, order REFUNDED, row written.
    expect(refund.amountRefunded).toBe(150000)
    expect(refund.sellerAmountRefunded).toBe(0)
    expect(refund.platformFeeRefunded).toBe(line.platformFee)
    expect((await storedOrder(Number(order.id))).status).toBe('REFUNDED')

    const rows = await refundRowsOfOrder(Number(order.id))
    expect(rows).toHaveLength(1)
    expect(rows[0].faultBasis).toBe('SELLER')
    expect(Number(rows[0].sellerAmountRefunded)).toBe(0)
    expect(Number(rows[0].platformFeeRefunded)).toBe(line.platformFee)

    const ledgerRows = await refundLedgerRowsOfOrder(String(order.code))
    expect(ledgerRows).toHaveLength(1)
    expect(Number(ledgerRows[0].amount)).toBe(150000)
    expect(ledgerRows[0].direction).toBe('credit')

    // The seller's money already left the platform: the row is untouched, field by field.
    const earningAfter = await storedEarning(line.earningId)
    expect(earningAfter.status).toBe('PAID')
    expect(earningAfter.paidAt).toBe(paidAtBefore)
    expect(Number(earningAfter.sellerAmount)).toBe(line.sellerAmount)
    expect(earningAfter.reversedAt ?? null).toBeNull()
  })

  it('F1 regression guard: an AVAILABLE earning is still reversed and still counted', async () => {
    const product = await createProduct(sellerA.id, 'available', 200000)
    const order = await createOrder(200000, 'available-earning')
    const line = await createLine({
      orderId: Number(order.id),
      productId: Number(product.id),
      sellerId: sellerA.id,
      salePrice: 200000,
      status: 'AVAILABLE',
      label: 'available',
    })

    const refund = await processRefund(payload, {
      orderId: Number(order.id),
      reason: 'File không đúng mô tả, doanh thu đã khả dụng nhưng chưa chi trả',
      actorId: financeAdmin.id,
      faultBasis: 'SELLER',
    })
    cleanup.refunds.push(refund.refundId)

    // The platform still holds that money, so reversing it is a real recovery and must be counted.
    expect(refund.sellerAmountRefunded).toBe(line.sellerAmount)
    expect(refund.platformFeeRefunded).toBe(line.platformFee)

    const earningAfter = await storedEarning(line.earningId)
    expect(earningAfter.status).toBe('REVERSED')
    expect(earningAfter.reversedAt).toBeDefined()
  })

  it('F1 auditability: the untouched PAID case emits a structured log naming the order and the earning ids', async () => {
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => undefined)
    try {
      const product = await createProduct(sellerA.id, 'audit', 120000)
      const order = await createOrder(120000, 'paid-audit')
      const line = await createLine({
        orderId: Number(order.id),
        productId: Number(product.id),
        sellerId: sellerA.id,
        salePrice: 120000,
        status: 'PAID',
        label: 'audit',
      })

      const refund = await processRefund(payload, {
        orderId: Number(order.id),
        reason: 'Khiếu nại sau khi người bán đã được chi trả',
        actorId: financeAdmin.id,
        faultBasis: 'SELLER',
      })
      cleanup.refunds.push(refund.refundId)

      const emitted = infoSpy.mock.calls
        .map((call) => call.map(String).join(' '))
        .filter((text) => text.includes('paid_earning_left_untouched'))
      expect(emitted.length).toBeGreaterThan(0)

      const payloadLine = emitted[0].slice(emitted[0].indexOf('{'))
      const structured = JSON.parse(payloadLine) as {
        orderId?: number
        untouchedEarningIds?: number[]
      }
      expect(structured.orderId).toBe(Number(order.id))
      expect(structured.untouchedEarningIds).toContain(line.earningId)
    } finally {
      infoSpy.mockRestore()
    }
  })

  it('F3: refuses a SELLER-basis refund on a multi-seller order without writing anything', async () => {
    const productA = await createProduct(sellerA.id, 'multi-a', 100000)
    const productB = await createProduct(sellerB.id, 'multi-b', 50000)
    const order = await createOrder(150000, 'multi-seller')
    const lineA = await createLine({
      orderId: Number(order.id),
      productId: Number(productA.id),
      sellerId: sellerA.id,
      salePrice: 100000,
      status: 'PENDING',
      label: 'multi-a',
    })
    const lineB = await createLine({
      orderId: Number(order.id),
      productId: Number(productB.id),
      sellerId: sellerB.id,
      salePrice: 50000,
      status: 'PENDING',
      label: 'multi-b',
    })

    await expect(
      processRefund(payload, {
        orderId: Number(order.id),
        reason: 'Một người bán giao file lỗi',
        actorId: financeAdmin.id,
        faultBasis: 'SELLER',
      }),
    ).rejects.toThrow(/seller/i)

    // Deterministic error naming the condition, and nothing written by the attempt.
    expect(await refundRowsOfOrder(Number(order.id))).toHaveLength(0)
    expect(await refundLedgerRowsOfOrder(String(order.code))).toHaveLength(0)
    expect((await storedOrder(Number(order.id))).status).toBe('COMPLETED')
    expect((await storedEarning(lineA.earningId)).status).toBe('PENDING')
    expect((await storedEarning(lineB.earningId)).status).toBe('PENDING')

    // A PLATFORM basis reverses nothing, so the same order is refundable on that basis.
    const platformRefund = await processRefund(payload, {
      orderId: Number(order.id),
      reason: 'Lỗi hệ thống, nhiều người bán trong một đơn',
      actorId: financeAdmin.id,
      faultBasis: 'PLATFORM',
    })
    cleanup.refunds.push(platformRefund.refundId)

    expect(platformRefund.sellerAmountRefunded).toBe(0)
    expect((await storedOrder(Number(order.id))).status).toBe('REFUNDED')
    expect((await storedEarning(lineA.earningId)).status).toBe('PENDING')
    expect((await storedEarning(lineB.earningId)).status).toBe('PENDING')
  })
})
