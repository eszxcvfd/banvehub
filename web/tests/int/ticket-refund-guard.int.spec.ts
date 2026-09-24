import { getPayload, type Payload } from 'payload'
import config from '@/payload.config'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import type { Product, User } from '@/payload-types'
import { creditWallet, getOrCreateWallet } from '@/services/wallet'
import { purchaseProduct } from '@/services/purchase'
import { processRefund } from '@/services/refund'
import { POST as createTicket } from '@/app/api/v1/tickets/route'
import { PATCH as updateTicket } from '@/app/api/v1/tickets/[id]/route'
import {
  REFUNDED_RESOLUTION,
  TICKET_REFUND_NOT_EXECUTED,
  TICKET_REFUND_OPERATOR_ONLY,
} from '@/collections/Tickets/hooks/enforceTicketInvariants'

interface PurchaseResult {
  success: boolean
  orderId: string
  orderCode: string
  entitlementId: number
  productTitle: string
  pricePaid: number
}

/**
 * Decision 0012 §1 and §4: the ticket's "Đã hoàn tiền" label follows the money.
 *
 * - Only the refund operator (`financeAdmin`/`admin`) may set `resolution = 'REFUNDED'`; a seller, a
 *   moderator and the buyer are refused while their other transitions stay exactly as they were.
 * - A ticket may only carry the resolution when an executed refund exists for its order, enforced by
 *   the collection's independent guard — so it also refuses a collection-API / local-API write, not
 *   just the PATCH route.
 * - The operator's refund resolves the order's ticket(s) automatically, and the §13 refund
 *   notification keeps its dedupe key and still fires exactly once.
 * - Only that order's tickets are touched: an unrelated ticket is untouched and an order without a
 *   ticket is a no-op.
 */
describe('Decision 0012 §1/§4: the ticket refund label follows the money', () => {
  let payload: Payload
  let bootstrapUser: User
  let sellerUser: User
  let buyerUser: User
  let moderatorUser: User
  let financeAdminUser: User
  let adminUser: User

  let productA: Product
  let productB: Product
  let productC: Product
  let productD: Product

  let orderA: PurchaseResult
  let orderB: PurchaseResult
  let orderC: PurchaseResult
  let orderD: PurchaseResult

  let ticketAId: number
  let ticketBId: number
  let ticketCId: number

  const cleanup = {
    tickets: [] as (number | string)[],
    refunds: [] as (number | string)[],
    notifications: [] as (number | string)[],
    orders: [] as (number | string)[],
    products: [] as (number | string)[],
    productFiles: [] as (number | string)[],
    users: [] as (number | string)[],
  }

  let seq = 0
  const getSeq = () => ++seq

  /**
   * ONE persistent `payload.auth` mock for the whole file: the custom ticket routes resolve the
   * caller through `payload.auth`, and `actAs()` picks the acting user per request. Local-API
   * writes in this spec never call it, so they can carry an explicit `user` of their own.
   */
  let currentUser: any = null
  let authSpy: ReturnType<typeof vi.spyOn> | null = null
  const actAs = (user: any) => {
    currentUser = user
  }

  const createUser = async (email: string, roles: User['roles']): Promise<User> => {
    const user = (await payload.create({
      collection: 'users',
      data: {
        email,
        password: 'test-password-ticket-refund-123',
        name: email.split('@')[0],
        roles,
      },
      overrideAccess: true,
    })) as User
    cleanup.users.push(user.id)
    return user
  }

  const createProduct = async (price: number, label: string): Promise<Product> => {
    const content = Buffer.from(`TICKET_REFUND_FIXTURE_${label}_${Date.now()}`)
    const fileDoc = await payload.create({
      collection: 'product_files',
      data: {
        seller: sellerUser.id,
        originalFilename: `ticket-refund-${label}-${getSeq()}.dwg`,
        fileFormat: '.dwg',
      },
      file: {
        data: content,
        name: `ticket-refund-${label}-${getSeq()}.dwg`,
        mimetype: 'application/octet-stream',
        size: content.length,
      },
      overrideAccess: true,
    })
    cleanup.productFiles.push(fileDoc.id)

    const product = (await payload.create({
      collection: 'products',
      data: {
        title: `Ticket refund fixture ${label} ${getSeq()}`,
        slug: `ticket-refund-${label}-${Date.now()}-${getSeq()}`,
        price,
        isFree: false,
        seller: sellerUser.id,
        originalFiles: [fileDoc.id],
        copyrightDeclared: true,
        moderationStatus: 'approved',
        _status: 'published',
      },
      overrideAccess: true,
    })) as Product
    cleanup.products.push(product.id)
    return product
  }

  const buy = async (buyerId: number, product: Product, price: number): Promise<PurchaseResult> => {
    await creditWallet(payload, {
      userId: buyerId,
      amount: price,
      type: 'topup',
      referenceType: 'payment_intent',
      referenceId: `TOPUP_TICKET_REFUND_${Date.now()}_${getSeq()}`,
      description: 'Topup for ticket refund guard tests',
    })

    const purchase = (await purchaseProduct(payload, {
      buyerId,
      productId: Number(product.id),
    })) as PurchaseResult
    cleanup.orders.push(purchase.orderId)
    return purchase
  }

  const openTicket = async (
    label: string,
    order: PurchaseResult,
    product: Product,
  ): Promise<number> => {
    actAs(buyerUser)
    const res = await createTicket(
      new Request('http://localhost:3000/api/v1/tickets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderId: Number(order.orderId),
          productId: Number(product.id),
          reason: 'MISLEADING_CONTENT',
          subject: `Khiếu nại ${label}`,
          description: `Nội dung không đúng mô tả: ${label}`,
        }),
      }),
    )
    const data = await res.json()
    expect(res.status).toBe(201)
    const ticketId = Number(data.ticket.id)
    cleanup.tickets.push(ticketId)
    return ticketId
  }

  const ticketContext = (ticketId: number) => ({ params: Promise.resolve({ id: String(ticketId) }) })

  const patchTicket = async (
    actor: any,
    ticketId: number,
    body: Record<string, unknown>,
  ): Promise<Response> => {
    actAs(actor)
    return updateTicket(
      new Request(`http://localhost:3000/api/v1/tickets/${ticketId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }),
      ticketContext(ticketId),
    )
  }

  const storedTicket = async (ticketId: number): Promise<any> =>
    payload.findByID({ collection: 'tickets', id: ticketId, depth: 0, overrideAccess: true })

  const findRefundNotifications = async (orderCode: string) => {
    const found = await payload.find({
      collection: 'notifications',
      where: {
        and: [
          { recipient: { equals: buyerUser.id } },
          { type: { equals: 'REFUND' } },
          { dedupeKey: { equals: `order:${orderCode}:refunded` } },
        ],
      },
      limit: 10,
      depth: 0,
      overrideAccess: true,
    })
    for (const doc of found.docs) cleanup.notifications.push(doc.id)
    return found
  }

  beforeAll(async () => {
    payload = await getPayload({ config })
    authSpy = vi.spyOn(payload, 'auth').mockImplementation(
      async () => ({ user: currentUser }) as any,
    )

    const timestamp = Date.now()

    // `ensureFirstUserIsAdmin` promotes the FIRST user of an EMPTY users table. Absorb that
    // promotion with a throwaway user so the role-sensitive fixtures below hold exactly the roles
    // they declare (otherwise `sellerUser` would silently be ['seller', 'admin']).
    bootstrapUser = await createUser(
      `bootstrap-ticket-refund-${timestamp}-${getSeq()}@kientaohub.local`,
      ['buyer'],
    )
    sellerUser = await createUser(`seller-tref-${timestamp}-${getSeq()}@kientaohub.local`, ['seller'])
    buyerUser = await createUser(`buyer-tref-${timestamp}-${getSeq()}@kientaohub.local`, ['buyer'])
    moderatorUser = await createUser(`mod-tref-${timestamp}-${getSeq()}@kientaohub.local`, [
      'moderator',
    ])
    financeAdminUser = await createUser(`finance-tref-${timestamp}-${getSeq()}@kientaohub.local`, [
      'financeAdmin',
    ])
    adminUser = await createUser(`admin-tref-${timestamp}-${getSeq()}@kientaohub.local`, ['admin'])

    expect(sellerUser.roles).toEqual(['seller'])
    expect(buyerUser.roles).toEqual(['buyer'])
    expect(moderatorUser.roles).toEqual(['moderator'])
    expect(financeAdminUser.roles).toEqual(['financeAdmin'])

    await getOrCreateWallet(payload, { userId: buyerUser.id })

    productA = await createProduct(150000, 'a')
    productB = await createProduct(120000, 'b')
    productC = await createProduct(100000, 'c')
    productD = await createProduct(90000, 'd')

    orderA = await buy(buyerUser.id, productA, 150000)
    orderB = await buy(buyerUser.id, productB, 120000)
    orderC = await buy(buyerUser.id, productC, 100000)
    orderD = await buy(buyerUser.id, productD, 90000)

    // ticketA: refunded later (auto-resolution). ticketB: the refusal matrix. ticketC: must stay
    // untouched by another order's refund. orderD intentionally has no ticket at all.
    ticketAId = await openTicket('A', orderA, productA)
    ticketBId = await openTicket('B', orderB, productB)
    ticketCId = await openTicket('C', orderC, productC)
  })

  afterAll(async () => {
    authSpy?.mockRestore()

    const deleteByOrder = async (
      collection: 'order_items' | 'seller_earnings' | 'entitlements',
      orderIds: (number | string)[],
    ) => {
      for (const orderId of orderIds) {
        const found = await payload
          .find({
            collection: collection as any,
            where: { order: { equals: orderId } } as any,
            limit: 0,
            depth: 0,
            overrideAccess: true,
          })
          .catch(() => null)
        for (const doc of found?.docs ?? []) {
          try {
            await payload.delete({ collection: collection as any, id: doc.id, overrideAccess: true })
          } catch (_ignore) {}
        }
      }
    }

    for (const id of cleanup.tickets) {
      try {
        await payload.delete({ collection: 'tickets' as any, id, overrideAccess: true })
      } catch (_ignore) {}
    }
    for (const id of cleanup.refunds) {
      try {
        await payload.delete({ collection: 'refunds' as any, id, overrideAccess: true })
      } catch (_ignore) {}
    }
    for (const id of cleanup.notifications) {
      try {
        await payload.delete({ collection: 'notifications' as any, id, overrideAccess: true })
      } catch (_ignore) {}
    }
    await deleteByOrder('seller_earnings', cleanup.orders)
    await deleteByOrder('entitlements', cleanup.orders)
    await deleteByOrder('order_items', cleanup.orders)
    for (const id of cleanup.orders) {
      try {
        await payload.delete({ collection: 'orders' as any, id, overrideAccess: true })
      } catch (_ignore) {}
    }
    for (const id of cleanup.products) {
      try {
        await payload.delete({ collection: 'products' as any, id, overrideAccess: true })
      } catch (_ignore) {}
    }
    for (const id of cleanup.productFiles) {
      try {
        await payload.delete({ collection: 'product_files' as any, id, overrideAccess: true })
      } catch (_ignore) {}
    }
    for (const id of cleanup.users) {
      try {
        await payload.delete({ collection: 'users' as any, id, overrideAccess: true })
      } catch (_ignore) {}
    }

    const countOwned = async (collection: string, where: Record<string, unknown>): Promise<number> => {
      const found = await payload.find({
        collection: collection as any,
        where: where as any,
        limit: 0,
        depth: 0,
        overrideAccess: true,
      })
      return found.totalDocs
    }

    expect(await countOwned('tickets', { id: { in: cleanup.tickets } })).toBe(0)
    expect(await countOwned('refunds', { buyer: { in: cleanup.users } })).toBe(0)
    expect(await countOwned('orders', { id: { in: cleanup.orders } })).toBe(0)
    expect(await countOwned('order_items', { order: { in: cleanup.orders } })).toBe(0)
    expect(await countOwned('seller_earnings', { order: { in: cleanup.orders } })).toBe(0)
    expect(await countOwned('entitlements', { user: { in: cleanup.users } })).toBe(0)
    expect(await countOwned('products', { id: { in: cleanup.products } })).toBe(0)

    // Any remaining fixture user must own a `wallets` row: `wallets.user_id` is NOT NULL and the
    // DB triggers forbid_wallet_delete make wallet rows undeletable, so their owners can never be
    // removed. BR-03 is never bypassed; any other survivor is a real cleanup regression.
    const survivors = await payload.find({
      collection: 'users',
      where: { id: { in: cleanup.users } },
      limit: 0,
      depth: 0,
      overrideAccess: true,
    })
    const walletOwners = await payload.find({
      collection: 'wallets',
      where: { user: { in: cleanup.users } },
      limit: 0,
      depth: 0,
      overrideAccess: true,
    })
    const walletBound = new Set(walletOwners.docs.map((wallet) => String(wallet.user)))
    expect(
      survivors.docs.filter((user) => !walletBound.has(String(user.id))).map((user) => user.email),
    ).toEqual([])
  })

  it('refuses a seller, a moderator and the buyer setting REFUNDED (403) while their other transitions stay unchanged', async () => {
    // Seller: refused for the refund resolution...
    const sellerRefund = await patchTicket(sellerUser, ticketBId, {
      resolution: REFUNDED_RESOLUTION,
    })
    expect(sellerRefund.status).toBe(403)
    expect((await sellerRefund.json()).error).toBe('FORBIDDEN')
    expect((await storedTicket(ticketBId)).resolution ?? null).toBeNull()

    // ...but their ordinary transitions are untouched.
    const sellerProgress = await patchTicket(sellerUser, ticketBId, { status: 'IN_PROGRESS' })
    expect(sellerProgress.status).toBe(200)

    // Moderator: refused for the refund resolution (a moderator manages tickets, never money)...
    const moderatorRefund = await patchTicket(moderatorUser, ticketBId, {
      resolution: REFUNDED_RESOLUTION,
    })
    expect(moderatorRefund.status).toBe(403)
    expect((await moderatorRefund.json()).error).toBe('FORBIDDEN')
    expect((await storedTicket(ticketBId)).resolution ?? null).toBeNull()

    // ...including when it is smuggled in beside an ordinary field.
    const moderatorSmuggle = await patchTicket(moderatorUser, ticketBId, {
      status: 'RESOLVED',
      resolution: REFUNDED_RESOLUTION,
    })
    expect(moderatorSmuggle.status).toBe(403)

    // ...while their own allowed transitions still work.
    const moderatorPriority = await patchTicket(moderatorUser, ticketBId, { priority: 'URGENT' })
    expect(moderatorPriority.status).toBe(200)

    // The buyer stays refused exactly as before.
    const buyerRefund = await patchTicket(buyerUser, ticketBId, { resolution: REFUNDED_RESOLUTION })
    expect(buyerRefund.status).toBe(403)
    expect((await buyerRefund.json()).error).toBe('FORBIDDEN')

    const buyerClose = await patchTicket(buyerUser, ticketBId, { status: 'CLOSED' })
    expect(buyerClose.status).toBe(200)

    const stored = await storedTicket(ticketBId)
    expect(stored.resolution ?? null).toBeNull()
    expect(stored.status).toBe('CLOSED')
  })

  it('refuses REFUNDED when no executed refund exists — on the route and on the collection path alike', async () => {
    // The operator is allowed to refund, but the label still may not precede the money.
    const financeAttempt = await patchTicket(financeAdminUser, ticketBId, {
      resolution: REFUNDED_RESOLUTION,
    })
    expect(financeAttempt.status).toBe(409)
    const financeBody = await financeAttempt.json()
    expect(financeBody.error).toBe('CONFLICT')
    expect(financeBody.code).toBe(TICKET_REFUND_NOT_EXECUTED)

    const adminAttempt = await patchTicket(adminUser, ticketBId, { resolution: REFUNDED_RESOLUTION })
    expect(adminAttempt.status).toBe(409)

    // The guard is independent of the route: a direct collection/local-API write is refused too,
    // with `overrideAccess: true` (which bypasses access control but never the collection hooks).
    await expect(
      payload.update({
        collection: 'tickets',
        id: ticketBId,
        data: { resolution: REFUNDED_RESOLUTION },
        overrideAccess: true,
        user: financeAdminUser,
      }),
    ).rejects.toThrow(new RegExp(`${TICKET_REFUND_NOT_EXECUTED}|hoàn tiền`))

    // A non-operator cannot reach the resolution through the collection path either.
    await expect(
      payload.update({
        collection: 'tickets',
        id: ticketBId,
        data: { resolution: REFUNDED_RESOLUTION },
        overrideAccess: true,
        user: moderatorUser,
      }),
    ).rejects.toThrow(new RegExp(`${TICKET_REFUND_OPERATOR_ONLY}|hoàn tiền`))

    await expect(
      payload.update({
        collection: 'tickets',
        id: ticketBId,
        data: { resolution: REFUNDED_RESOLUTION },
        user: sellerUser,
      }),
    ).rejects.toThrow(new RegExp(`${TICKET_REFUND_OPERATOR_ONLY}|hoàn tiền`))

    expect((await storedTicket(ticketBId)).resolution ?? null).toBeNull()
  })

  it('resolves the refunded order ticket automatically and keeps the refund notification exactly once', async () => {
    expect((await findRefundNotifications(orderA.orderCode)).totalDocs).toBe(0)

    const refund = await processRefund(payload, {
      orderId: Number(orderA.orderId),
      reason: 'File bàn giao không đúng mô tả',
      actorId: financeAdminUser.id,
      faultBasis: 'SELLER',
    })
    cleanup.refunds.push(refund.refundId)

    // The label now agrees with the money, in one action.
    expect(refund.resolvedTicketIds).toContain(ticketAId)
    const ticketA = await storedTicket(ticketAId)
    expect(ticketA.resolution).toBe(REFUNDED_RESOLUTION)
    expect(ticketA.status).toBe('RESOLVED')

    // §13: the buyer's in-app refund notification still fires exactly once, with its dedupe key.
    expect((await findRefundNotifications(orderA.orderCode)).totalDocs).toBe(1)

    // A retried refund cannot announce it a second time (the label stays where it is too).
    await expect(
      processRefund(payload, {
        orderId: Number(orderA.orderId),
        reason: 'Thử hoàn tiền lần hai',
        actorId: financeAdminUser.id,
        faultBasis: 'SELLER',
      }),
    ).rejects.toThrow(/already|refund/i)
    expect((await findRefundNotifications(orderA.orderCode)).totalDocs).toBe(1)
    expect((await storedTicket(ticketAId)).resolution).toBe(REFUNDED_RESOLUTION)
  })

  it("cannot touch another order's tickets, and an order with no ticket is a no-op", async () => {
    // ticketC belongs to orderC, which was never refunded: the orderA refund left it alone.
    const ticketC = await storedTicket(ticketCId)
    expect(ticketC.resolution ?? null).toBeNull()
    expect(ticketC.status).toBe('OPEN')

    // Refunding an order that has no ticket resolves nothing and raises no error.
    const refund = await processRefund(payload, {
      orderId: Number(orderD.orderId),
      reason: 'Lỗi hệ thống khi tải file',
      actorId: financeAdminUser.id,
      faultBasis: 'PLATFORM',
    })
    cleanup.refunds.push(refund.refundId)
    expect(refund.resolvedTicketIds).toEqual([])

    const ticketCAfter = await storedTicket(ticketCId)
    expect(ticketCAfter.resolution ?? null).toBeNull()
    expect(ticketCAfter.status).toBe('OPEN')
  })
})
