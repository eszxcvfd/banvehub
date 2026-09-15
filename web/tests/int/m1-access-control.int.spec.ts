import { getPayload, type Payload } from 'payload'
import config from '@/payload.config'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { DownloadEvent, Entitlement, Order, OrderItem, Product, User } from '@/payload-types'
import {
  orderCreateAccess,
  orderDeleteAccess,
  orderItemCreateAccess,
  orderItemDeleteAccess,
  orderItemReadAccess,
  orderItemUpdateAccess,
  orderReadAccess,
  orderUpdateAccess,
} from '@/access/orderAccess'
import {
  entitlementNoDirectWrite,
  entitlementReadAccess,
  entitlementUpdateAccess,
} from '@/access/entitlementAccess'
import {
  downloadEventNoDirectWrite,
  downloadEventReadAccess,
} from '@/access/downloadEventAccess'
import { DELETE, PATCH, POST } from '@/app/(payload)/api/[...slug]/route'

describe('Milestone 1: Access Control & Security Boundaries Empirical Challenge', () => {
  let payload: Payload

  // Test principals
  let adminUser: User
  let financeAdminUser: User
  let buyer1User: User
  let buyer2User: User
  let seller1User: User
  let seller2User: User
  let moderatorUser: User

  // Auth tokens for REST handler tests
  let adminToken: string
  let buyer1Token: string
  let seller1Token: string

  // Seeded test documents
  let product1: Product
  let product2: Product
  let order1: Order
  let order2: Order
  let order3: Order
  let orderItem1: OrderItem
  let orderItem2: OrderItem
  let entitlement1: Entitlement
  let entitlement2: Entitlement
  let entitlement3: Entitlement
  let entitlement4: Entitlement
  let entitlement5: Entitlement
  let downloadEvent1: DownloadEvent
  let downloadEvent2: DownloadEvent
  let downloadEvent3: DownloadEvent

  // Cleanup tracking registry
  const cleanup = {
    downloadEvents: [] as (number | string)[],
    entitlements: [] as (number | string)[],
    orderItems: [] as (number | string)[],
    orders: [] as (number | string)[],
    products: [] as (number | string)[],
    users: [] as (number | string)[],
  }

  const createUser = async (email: string, roles: User['roles']): Promise<User> => {
    const user = (await payload.create({
      collection: 'users',
      data: {
        email,
        password: 'm1-challenge-password-123',
        name: email.split('@')[0],
        roles,
      },
      overrideAccess: true,
    })) as User
    cleanup.users.push(user.id)
    return user
  }

  beforeAll(async () => {
    payload = await getPayload({ config: await config })

    const timestamp = Date.now()

    // 1. Create all test users with specific roles
    adminUser = await createUser(`m1-admin-${timestamp}@example.test`, ['admin'])
    financeAdminUser = await createUser(`m1-finance-${timestamp}@example.test`, ['financeAdmin'])
    buyer1User = await createUser(`m1-buyer1-${timestamp}@example.test`, ['buyer'])
    buyer2User = await createUser(`m1-buyer2-${timestamp}@example.test`, ['buyer'])
    seller1User = await createUser(`m1-seller1-${timestamp}@example.test`, ['seller'])
    seller2User = await createUser(`m1-seller2-${timestamp}@example.test`, ['seller'])
    moderatorUser = await createUser(`m1-moderator-${timestamp}@example.test`, ['moderator'])

    // Auth tokens for REST testing (unauthenticated tests test public access denial)
    adminToken = ''
    buyer1Token = ''
    seller1Token = ''

    // 2. Create products for seller1 and seller2
    product1 = (await payload.create({
      collection: 'products',
      draft: true,
      data: {
        title: `M1 Challenge Product 1 - ${timestamp}`,
        seller: seller1User.id,
        price: 50000,
      } as any,
      overrideAccess: true,
    })) as Product
    cleanup.products.push(product1.id)

    product2 = (await payload.create({
      collection: 'products',
      draft: true,
      data: {
        title: `M1 Challenge Product 2 - ${timestamp}`,
        seller: seller2User.id,
        price: 75000,
      } as any,
      overrideAccess: true,
    })) as Product
    cleanup.products.push(product2.id)

    // 3. Create Orders (using overrideAccess: true since direct creation is denied by design)
    order1 = (await payload.create({
      collection: 'orders' as any,
      data: {
        buyer: buyer1User.id,
        totalAmount: 50000,
        currency: 'VND',
        status: 'COMPLETED',
        paymentSource: 'wallet',
        paidAt: new Date().toISOString(),
      },
      overrideAccess: true,
    })) as Order
    cleanup.orders.push(order1.id)

    order2 = (await payload.create({
      collection: 'orders' as any,
      data: {
        buyer: buyer1User.id,
        totalAmount: 100000,
        currency: 'VND',
        status: 'PENDING',
        paymentSource: 'wallet',
      },
      overrideAccess: true,
    })) as Order
    cleanup.orders.push(order2.id)

    order3 = (await payload.create({
      collection: 'orders' as any,
      data: {
        buyer: buyer2User.id,
        totalAmount: 75000,
        currency: 'VND',
        status: 'COMPLETED',
        paymentSource: 'wallet',
        paidAt: new Date().toISOString(),
      },
      overrideAccess: true,
    })) as Order
    cleanup.orders.push(order3.id)

    // 4. Create OrderItems
    orderItem1 = (await payload.create({
      collection: 'order_items' as any,
      data: {
        order: order1.id,
        product: product1.id,
        seller: seller1User.id,
        salePrice: 50000,
        platformFee: 5000,
        sellerAmount: 45000,
        tax: 0,
        policyVersion: 'v1',
      },
      overrideAccess: true,
    })) as OrderItem
    cleanup.orderItems.push(orderItem1.id)

    orderItem2 = (await payload.create({
      collection: 'order_items' as any,
      data: {
        order: order3.id,
        product: product2.id,
        seller: seller2User.id,
        salePrice: 75000,
        platformFee: 7500,
        sellerAmount: 67500,
        tax: 0,
        policyVersion: 'v1',
      },
      overrideAccess: true,
    })) as OrderItem
    cleanup.orderItems.push(orderItem2.id)

    // 5. Create Entitlements
    // E1: buyer1, product1, active
    entitlement1 = (await payload.create({
      collection: 'entitlements' as any,
      data: {
        user: buyer1User.id,
        product: product1.id,
        order: order1.id,
        orderItem: orderItem1.id,
        status: 'active',
        grantedAt: new Date().toISOString(),
      },
      overrideAccess: true,
    })) as Entitlement
    cleanup.entitlements.push(entitlement1.id)

    // E2: buyer1, product2, revoked
    entitlement2 = (await payload.create({
      collection: 'entitlements' as any,
      data: {
        user: buyer1User.id,
        product: product2.id,
        status: 'revoked',
        grantedAt: new Date().toISOString(),
        revokedAt: new Date().toISOString(),
        reason: 'Refunded',
      },
      overrideAccess: true,
    })) as Entitlement
    cleanup.entitlements.push(entitlement2.id)

    // E3: buyer1, product1, expired
    entitlement3 = (await payload.create({
      collection: 'entitlements' as any,
      data: {
        user: buyer1User.id,
        product: product1.id,
        status: 'expired',
        grantedAt: new Date(Date.now() - 86400000).toISOString(),
        expiresAt: new Date(Date.now() - 3600000).toISOString(),
      },
      overrideAccess: true,
    })) as Entitlement
    cleanup.entitlements.push(entitlement3.id)

    // E4: buyer2, product1, active
    entitlement4 = (await payload.create({
      collection: 'entitlements' as any,
      data: {
        user: buyer2User.id,
        product: product1.id,
        order: order3.id,
        status: 'active',
        grantedAt: new Date().toISOString(),
      },
      overrideAccess: true,
    })) as Entitlement
    cleanup.entitlements.push(entitlement4.id)

    // E5: buyer2, product2, revoked
    entitlement5 = (await payload.create({
      collection: 'entitlements' as any,
      data: {
        user: buyer2User.id,
        product: product2.id,
        status: 'revoked',
        grantedAt: new Date().toISOString(),
      },
      overrideAccess: true,
    })) as Entitlement
    cleanup.entitlements.push(entitlement5.id)

    // 6. Create DownloadEvents
    downloadEvent1 = (await payload.create({
      collection: 'download_events' as any,
      data: {
        product: product1.id,
        user: buyer1User.id,
        entitlement: entitlement1.id,
        status: 'SUCCESS',
        ipAddress: '127.0.0.1',
        userAgent: 'TestAgent/1.0',
        downloadedAt: new Date().toISOString(),
      },
      overrideAccess: true,
    })) as DownloadEvent
    cleanup.downloadEvents.push(downloadEvent1.id)

    downloadEvent2 = (await payload.create({
      collection: 'download_events' as any,
      data: {
        product: product2.id,
        user: buyer2User.id,
        entitlement: entitlement5.id,
        status: 'DENIED',
        ipAddress: '192.168.1.1',
        userAgent: 'MaliciousClient/2.0',
        downloadedAt: new Date().toISOString(),
        errorReason: 'Revoked entitlement',
      },
      overrideAccess: true,
    })) as DownloadEvent
    cleanup.downloadEvents.push(downloadEvent2.id)

    downloadEvent3 = (await payload.create({
      collection: 'download_events' as any,
      data: {
        product: product1.id,
        status: 'DENIED',
        ipAddress: '10.0.0.1',
        userAgent: 'AnonymousScraper',
        downloadedAt: new Date().toISOString(),
        errorReason: 'Unauthenticated attempt',
      },
      overrideAccess: true,
    })) as DownloadEvent
    cleanup.downloadEvents.push(downloadEvent3.id)
  })

  afterAll(async () => {
    // Cleanup in reverse dependency order
    for (const id of cleanup.downloadEvents) {
      await payload.delete({ collection: 'download_events' as any, id, overrideAccess: true }).catch(() => {})
    }
    for (const id of cleanup.entitlements) {
      await payload.delete({ collection: 'entitlements' as any, id, overrideAccess: true }).catch(() => {})
    }
    for (const id of cleanup.orderItems) {
      await payload.delete({ collection: 'order_items' as any, id, overrideAccess: true }).catch(() => {})
    }
    for (const id of cleanup.orders) {
      await payload.delete({ collection: 'orders' as any, id, overrideAccess: true }).catch(() => {})
    }
    for (const id of cleanup.products) {
      await payload.delete({ collection: 'products', id, overrideAccess: true }).catch(() => {})
    }
    for (const id of cleanup.users) {
      await payload.delete({ collection: 'users', id, overrideAccess: true }).catch(() => {})
    }
  })

  // =========================================================================
  // TASK 1: DIRECT REST MUTATION REQUESTS DENIAL (() => false)
  // =========================================================================
  describe('Task 1: Direct Mutation Rejection via Access Controls (() => false)', () => {
    describe('Orders: direct create, update, delete denied for ALL principals', () => {
      it('denies order creation for unauthenticated callers', async () => {
        await expect(
          payload.create({
            collection: 'orders' as any,
            data: { buyer: buyer1User.id, totalAmount: 1000 },
            overrideAccess: false,
            user: null as any,
          }),
        ).rejects.toThrow()
      })

      it('denies order creation for buyers', async () => {
        await expect(
          payload.create({
            collection: 'orders' as any,
            data: { buyer: buyer1User.id, totalAmount: 1000 },
            overrideAccess: false,
            user: buyer1User as any,
          }),
        ).rejects.toThrow()
      })

      it('denies order creation for sellers', async () => {
        await expect(
          payload.create({
            collection: 'orders' as any,
            data: { buyer: seller1User.id, totalAmount: 1000 },
            overrideAccess: false,
            user: seller1User as any,
          }),
        ).rejects.toThrow()
      })

      it('denies order creation for financeAdmins', async () => {
        await expect(
          payload.create({
            collection: 'orders' as any,
            data: { buyer: buyer1User.id, totalAmount: 1000 },
            overrideAccess: false,
            user: financeAdminUser as any,
          }),
        ).rejects.toThrow()
      })

      it('denies order creation even for admins', async () => {
        await expect(
          payload.create({
            collection: 'orders' as any,
            data: { buyer: buyer1User.id, totalAmount: 1000 },
            overrideAccess: false,
            user: adminUser as any,
          }),
        ).rejects.toThrow()
      })

      it('denies direct order update for admins and buyers', async () => {
        await expect(
          payload.update({
            collection: 'orders' as any,
            id: order1.id,
            data: { status: 'CANCELLED' },
            overrideAccess: false,
            user: adminUser as any,
          }),
        ).rejects.toThrow()

        await expect(
          payload.update({
            collection: 'orders' as any,
            id: order1.id,
            data: { totalAmount: 0 },
            overrideAccess: false,
            user: buyer1User as any,
          }),
        ).rejects.toThrow()
      })

      it('denies direct order deletion for all principals', async () => {
        await expect(
          payload.delete({
            collection: 'orders' as any,
            id: order1.id,
            overrideAccess: false,
            user: adminUser as any,
          }),
        ).rejects.toThrow()

        await expect(
          payload.delete({
            collection: 'orders' as any,
            id: order1.id,
            overrideAccess: false,
            user: buyer1User as any,
          }),
        ).rejects.toThrow()
      })
    })

    describe('OrderItems: direct create, update, delete denied for ALL principals', () => {
      it('denies order_items creation for unauthenticated callers', async () => {
        await expect(
          payload.create({
            collection: 'order_items' as any,
            data: { order: order1.id, product: product1.id, seller: seller1User.id, salePrice: 1000 },
            overrideAccess: false,
            user: null as any,
          }),
        ).rejects.toThrow()
      })

      it('denies order_items creation for buyers and sellers', async () => {
        await expect(
          payload.create({
            collection: 'order_items' as any,
            data: { order: order1.id, product: product1.id, seller: seller1User.id, salePrice: 1000 },
            overrideAccess: false,
            user: buyer1User as any,
          }),
        ).rejects.toThrow()

        await expect(
          payload.create({
            collection: 'order_items' as any,
            data: { order: order1.id, product: product1.id, seller: seller1User.id, salePrice: 1000 },
            overrideAccess: false,
            user: seller1User as any,
          }),
        ).rejects.toThrow()
      })

      it('denies order_items creation even for admins', async () => {
        await expect(
          payload.create({
            collection: 'order_items' as any,
            data: { order: order1.id, product: product1.id, seller: seller1User.id, salePrice: 1000 },
            overrideAccess: false,
            user: adminUser as any,
          }),
        ).rejects.toThrow()
      })

      it('denies order_items update for all principals (BR-07 immutability)', async () => {
        await expect(
          payload.update({
            collection: 'order_items' as any,
            id: orderItem1.id,
            data: { salePrice: 0 },
            overrideAccess: false,
            user: adminUser as any,
          }),
        ).rejects.toThrow()

        await expect(
          payload.update({
            collection: 'order_items' as any,
            id: orderItem1.id,
            data: { salePrice: 0 },
            overrideAccess: false,
            user: seller1User as any,
          }),
        ).rejects.toThrow()
      })

      it('denies order_items deletion for all principals', async () => {
        await expect(
          payload.delete({
            collection: 'order_items' as any,
            id: orderItem1.id,
            overrideAccess: false,
            user: adminUser as any,
          }),
        ).rejects.toThrow()
      })
    })

    describe('Entitlements: direct create and delete denied for ALL principals', () => {
      it('denies entitlement creation for anonymous callers', async () => {
        await expect(
          payload.create({
            collection: 'entitlements' as any,
            data: { user: buyer1User.id, product: product1.id, status: 'active' },
            overrideAccess: false,
            user: null as any,
          }),
        ).rejects.toThrow()
      })

      it('denies entitlement creation for buyers', async () => {
        await expect(
          payload.create({
            collection: 'entitlements' as any,
            data: { user: buyer1User.id, product: product1.id, status: 'active' },
            overrideAccess: false,
            user: buyer1User as any,
          }),
        ).rejects.toThrow()
      })

      it('denies entitlement creation even for admins', async () => {
        await expect(
          payload.create({
            collection: 'entitlements' as any,
            data: { user: buyer1User.id, product: product1.id, status: 'active' },
            overrideAccess: false,
            user: adminUser as any,
          }),
        ).rejects.toThrow()
      })

      it('denies entitlement deletion for all principals', async () => {
        await expect(
          payload.delete({
            collection: 'entitlements' as any,
            id: entitlement1.id,
            overrideAccess: false,
            user: adminUser as any,
          }),
        ).rejects.toThrow()

        await expect(
          payload.delete({
            collection: 'entitlements' as any,
            id: entitlement1.id,
            overrideAccess: false,
            user: buyer1User as any,
          }),
        ).rejects.toThrow()
      })

      it('denies entitlement update for buyers and financeAdmins, but allows admin', async () => {
        // Buyer cannot update
        await expect(
          payload.update({
            collection: 'entitlements' as any,
            id: entitlement1.id,
            data: { status: 'active' },
            overrideAccess: false,
            user: buyer1User as any,
          }),
        ).rejects.toThrow()

        // FinanceAdmin cannot update
        await expect(
          payload.update({
            collection: 'entitlements' as any,
            id: entitlement1.id,
            data: { reason: 'Finance inspection' },
            overrideAccess: false,
            user: financeAdminUser as any,
          }),
        ).rejects.toThrow()

        // Admin CAN update (for admin revocation/notes)
        const updated = await payload.update({
          collection: 'entitlements' as any,
          id: entitlement1.id,
          data: { reason: 'Admin audit check' },
          overrideAccess: false,
          user: adminUser as any,
        })
        expect(updated.reason).toBe('Admin audit check')
      })
    })

    describe('DownloadEvents: append-only audit trail denied for ALL direct mutations', () => {
      it('denies download_events creation for anonymous, buyers, and admins', async () => {
        await expect(
          payload.create({
            collection: 'download_events' as any,
            data: { product: product1.id, status: 'SUCCESS' },
            overrideAccess: false,
            user: null as any,
          }),
        ).rejects.toThrow()

        await expect(
          payload.create({
            collection: 'download_events' as any,
            data: { product: product1.id, status: 'SUCCESS' },
            overrideAccess: false,
            user: buyer1User as any,
          }),
        ).rejects.toThrow()

        await expect(
          payload.create({
            collection: 'download_events' as any,
            data: { product: product1.id, status: 'SUCCESS' },
            overrideAccess: false,
            user: adminUser as any,
          }),
        ).rejects.toThrow()
      })

      it('denies download_events update for all principals', async () => {
        await expect(
          payload.update({
            collection: 'download_events' as any,
            id: downloadEvent1.id,
            data: { status: 'DENIED' },
            overrideAccess: false,
            user: adminUser as any,
          }),
        ).rejects.toThrow()
      })

      it('denies download_events deletion for all principals', async () => {
        await expect(
          payload.delete({
            collection: 'download_events' as any,
            id: downloadEvent1.id,
            overrideAccess: false,
            user: adminUser as any,
          }),
        ).rejects.toThrow()
      })
    })

    describe('Direct REST Route Handler (HTTP) Mutation Verification', () => {
      it('rejects POST /api/orders via REST endpoint with 403 Forbidden', async () => {
        const req = new Request('http://localhost:3000/api/orders', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            Authorization: `JWT ${buyer1Token}`,
          },
          body: JSON.stringify({ buyer: buyer1User.id, totalAmount: 1000 }),
        })
        const res = await POST(req, { params: Promise.resolve({ slug: ['orders'] }) })
        expect(res.status).toBe(403)
      })

      it('rejects POST /api/order_items via REST endpoint with 403 Forbidden', async () => {
        const req = new Request('http://localhost:3000/api/order_items', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            Authorization: `JWT ${seller1Token}`,
          },
          body: JSON.stringify({ order: order1.id, product: product1.id, salePrice: 1000 }),
        })
        const res = await POST(req, { params: Promise.resolve({ slug: ['order_items'] }) })
        expect(res.status).toBe(403)
      })

      it('rejects POST /api/entitlements via REST endpoint with 403 Forbidden', async () => {
        const req = new Request('http://localhost:3000/api/entitlements', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            Authorization: `JWT ${buyer1Token}`,
          },
          body: JSON.stringify({ user: buyer1User.id, product: product1.id, status: 'active' }),
        })
        const res = await POST(req, { params: Promise.resolve({ slug: ['entitlements'] }) })
        expect(res.status).toBe(403)
      })

      it('rejects POST /api/download_events via REST endpoint with 403 Forbidden', async () => {
        const req = new Request('http://localhost:3000/api/download_events', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            Authorization: `JWT ${adminToken}`,
          },
          body: JSON.stringify({ product: product1.id, status: 'SUCCESS' }),
        })
        const res = await POST(req, { params: Promise.resolve({ slug: ['download_events'] }) })
        expect(res.status).toBe(403)
      })

      it('rejects DELETE /api/orders/:id via REST endpoint with 403 Forbidden', async () => {
        const req = new Request(`http://localhost:3000/api/orders/${order1.id}`, {
          method: 'DELETE',
          headers: {
            Authorization: `JWT ${adminToken}`,
          },
        })
        const res = await DELETE(req, { params: Promise.resolve({ slug: ['orders', String(order1.id)] }) })
        expect(res.status).toBe(403)
      })

      it('rejects PATCH /api/order_items/:id via REST endpoint with 403 Forbidden', async () => {
        const req = new Request(`http://localhost:3000/api/order_items/${orderItem1.id}`, {
          method: 'PATCH',
          headers: {
            'content-type': 'application/json',
            Authorization: `JWT ${adminToken}`,
          },
          body: JSON.stringify({ salePrice: 0 }),
        })
        const res = await PATCH(req, {
          params: Promise.resolve({ slug: ['order_items', String(orderItem1.id)] }),
        })
        expect(res.status).toBe(403)
      })
    })
  })

  // =========================================================================
  // TASK 2: READ ACCESS CONTROLS FOR ORDERS
  // =========================================================================
  describe('Task 2: Read Access Controls for Orders', () => {
    it('allows authenticated buyer1 to view only their own orders', async () => {
      const res = await payload.find({
        collection: 'orders' as any,
        overrideAccess: false,
        user: buyer1User as any,
      })

      const ids = res.docs.map((d) => d.id)
      expect(ids).toContain(order1.id)
      expect(ids).toContain(order2.id)
      expect(ids).not.toContain(order3.id)

      // Every returned document must have buyer === buyer1User.id
      for (const doc of res.docs) {
        const buyerId = typeof doc.buyer === 'object' ? doc.buyer.id : doc.buyer
        expect(buyerId).toBe(buyer1User.id)
      }
    })

    it('allows authenticated buyer2 to view only their own order', async () => {
      const res = await payload.find({
        collection: 'orders' as any,
        overrideAccess: false,
        user: buyer2User as any,
      })

      const ids = res.docs.map((d) => d.id)
      expect(ids).toContain(order3.id)
      expect(ids).not.toContain(order1.id)
      expect(ids).not.toContain(order2.id)

      for (const doc of res.docs) {
        const buyerId = typeof doc.buyer === 'object' ? doc.buyer.id : doc.buyer
        expect(buyerId).toBe(buyer2User.id)
      }
    })

    it('rejects buyer1 trying to findByID an order belonging to buyer2', async () => {
      await expect(
        payload.findByID({
          collection: 'orders' as any,
          id: order3.id,
          overrideAccess: false,
          user: buyer1User as any,
        }),
      ).rejects.toThrow()
    })

    it('allows admin to see all orders from all buyers', async () => {
      const res = await payload.find({
        collection: 'orders' as any,
        overrideAccess: false,
        user: adminUser as any,
      })

      const ids = res.docs.map((d) => d.id)
      expect(ids).toContain(order1.id)
      expect(ids).toContain(order2.id)
      expect(ids).toContain(order3.id)

      const doc1 = await payload.findByID({
        collection: 'orders' as any,
        id: order1.id,
        overrideAccess: false,
        user: adminUser as any,
      })
      expect(doc1.id).toBe(order1.id)
    })

    it('allows financeAdmin to see all orders from all buyers', async () => {
      const res = await payload.find({
        collection: 'orders' as any,
        overrideAccess: false,
        user: financeAdminUser as any,
      })

      const ids = res.docs.map((d) => d.id)
      expect(ids).toContain(order1.id)
      expect(ids).toContain(order2.id)
      expect(ids).toContain(order3.id)

      const doc3 = await payload.findByID({
        collection: 'orders' as any,
        id: order3.id,
        overrideAccess: false,
        user: financeAdminUser as any,
      })
      expect(doc3.id).toBe(order3.id)
    })

    it('denies unauthenticated guests from reading orders (throws Forbidden)', async () => {
      await expect(
        payload.find({
          collection: 'orders' as any,
          overrideAccess: false,
          user: null as any,
        }),
      ).rejects.toThrow(/Forbidden|not allowed/)

      await expect(
        payload.findByID({
          collection: 'orders' as any,
          id: order1.id,
          overrideAccess: false,
          user: null as any,
        }),
      ).rejects.toThrow()
    })

    describe('OrderItems read access: buyers and sellers access scoping', () => {
      it('allows admin and financeAdmin to view all order items', async () => {
        const adminRes = await payload.find({
          collection: 'order_items' as any,
          overrideAccess: false,
          user: adminUser as any,
        })
        const adminIds = adminRes.docs.map((d) => d.id)
        expect(adminIds).toContain(orderItem1.id)
        expect(adminIds).toContain(orderItem2.id)

        const financeRes = await payload.find({
          collection: 'order_items' as any,
          overrideAccess: false,
          user: financeAdminUser as any,
        })
        const financeIds = financeRes.docs.map((d) => d.id)
        expect(financeIds).toContain(orderItem1.id)
        expect(financeIds).toContain(orderItem2.id)
      })

      it('allows seller1 to see orderItem1 for their product, but NOT orderItem2', async () => {
        const res = await payload.find({
          collection: 'order_items' as any,
          overrideAccess: false,
          user: seller1User as any,
        })
        const ids = res.docs.map((d) => d.id)
        expect(ids).toContain(orderItem1.id)
        expect(ids).not.toContain(orderItem2.id)
      })

      it('allows buyer1 to see orderItem1 from their order, but NOT orderItem2', async () => {
        const res = await payload.find({
          collection: 'order_items' as any,
          overrideAccess: false,
          user: buyer1User as any,
        })
        const ids = res.docs.map((d) => d.id)
        expect(ids).toContain(orderItem1.id)
        expect(ids).not.toContain(orderItem2.id)
      })

      it('denies unauthenticated caller from reading order items', async () => {
        await expect(
          payload.find({
            collection: 'order_items' as any,
            overrideAccess: false,
            user: null as any,
          }),
        ).rejects.toThrow(/Forbidden|not allowed/)
      })
    })
  })

  // =========================================================================
  // TASK 3: READ ACCESS CONTROLS FOR ENTITLEMENTS
  // =========================================================================
  describe('Task 3: Read Access Controls for Entitlements', () => {
    it('allows buyer1 to see ONLY their own ACTIVE entitlement, filtering out revoked, expired, and foreign entitlements', async () => {
      const res = await payload.find({
        collection: 'entitlements' as any,
        overrideAccess: false,
        user: buyer1User as any,
      })

      const ids = res.docs.map((d) => d.id)

      // Must see own active entitlement
      expect(ids).toContain(entitlement1.id)

      // MUST NOT see own revoked entitlement
      expect(ids).not.toContain(entitlement2.id)

      // MUST NOT see own expired entitlement
      expect(ids).not.toContain(entitlement3.id)

      // MUST NOT see other user's active entitlement
      expect(ids).not.toContain(entitlement4.id)

      // MUST NOT see other user's revoked entitlement
      expect(ids).not.toContain(entitlement5.id)

      // All returned documents must be active and belong to buyer1User
      for (const doc of res.docs) {
        expect(doc.status).toBe('active')
        const userId = typeof doc.user === 'object' ? doc.user.id : doc.user
        expect(userId).toBe(buyer1User.id)
      }
    })

    it('allows buyer2 to see ONLY their own ACTIVE entitlement', async () => {
      const res = await payload.find({
        collection: 'entitlements' as any,
        overrideAccess: false,
        user: buyer2User as any,
      })

      const ids = res.docs.map((d) => d.id)
      expect(ids).toContain(entitlement4.id)
      expect(ids).not.toContain(entitlement1.id)
      expect(ids).not.toContain(entitlement2.id)
      expect(ids).not.toContain(entitlement3.id)
      expect(ids).not.toContain(entitlement5.id)

      for (const doc of res.docs) {
        expect(doc.status).toBe('active')
        const userId = typeof doc.user === 'object' ? doc.user.id : doc.user
        expect(userId).toBe(buyer2User.id)
      }
    })

    it('rejects buyer1 from accessing revoked or expired entitlements via findByID', async () => {
      // Accessing active entitlement succeeds
      const activeDoc = await payload.findByID({
        collection: 'entitlements' as any,
        id: entitlement1.id,
        overrideAccess: false,
        user: buyer1User as any,
      })
      expect(activeDoc.id).toBe(entitlement1.id)

      // Accessing revoked entitlement (even own) fails
      await expect(
        payload.findByID({
          collection: 'entitlements' as any,
          id: entitlement2.id,
          overrideAccess: false,
          user: buyer1User as any,
        }),
      ).rejects.toThrow()

      // Accessing expired entitlement (even own) fails
      await expect(
        payload.findByID({
          collection: 'entitlements' as any,
          id: entitlement3.id,
          overrideAccess: false,
          user: buyer1User as any,
        }),
      ).rejects.toThrow()

      // Accessing another user's active entitlement fails
      await expect(
        payload.findByID({
          collection: 'entitlements' as any,
          id: entitlement4.id,
          overrideAccess: false,
          user: buyer1User as any,
        }),
      ).rejects.toThrow()
    })

    it('allows admin to see ALL entitlements across all users and statuses', async () => {
      const res = await payload.find({
        collection: 'entitlements' as any,
        overrideAccess: false,
        user: adminUser as any,
      })

      const ids = res.docs.map((d) => d.id)
      expect(ids).toContain(entitlement1.id) // buyer1 active
      expect(ids).toContain(entitlement2.id) // buyer1 revoked
      expect(ids).toContain(entitlement3.id) // buyer1 expired
      expect(ids).toContain(entitlement4.id) // buyer2 active
      expect(ids).toContain(entitlement5.id) // buyer2 revoked
    })

    it('allows financeAdmin to see ALL entitlements across all users and statuses', async () => {
      const res = await payload.find({
        collection: 'entitlements' as any,
        overrideAccess: false,
        user: financeAdminUser as any,
      })

      const ids = res.docs.map((d) => d.id)
      expect(ids).toContain(entitlement1.id)
      expect(ids).toContain(entitlement2.id)
      expect(ids).toContain(entitlement3.id)
      expect(ids).toContain(entitlement4.id)
      expect(ids).toContain(entitlement5.id)
    })

    it('denies unauthenticated guests from reading entitlements', async () => {
      await expect(
        payload.find({
          collection: 'entitlements' as any,
          overrideAccess: false,
          user: null as any,
        }),
      ).rejects.toThrow(/Forbidden|not allowed/)

      await expect(
        payload.findByID({
          collection: 'entitlements' as any,
          id: entitlement1.id,
          overrideAccess: false,
          user: null as any,
        }),
      ).rejects.toThrow()
    })
  })

  // =========================================================================
  // TASK 4: READ ACCESS CONTROLS FOR DOWNLOAD EVENTS
  // =========================================================================
    // =========================================================================
    // ADVERSARIAL ATTACK SCENARIOS & QUERY INJECTION DEFENSE
    // =========================================================================
    describe('Adversarial Query Injection & Scope Escape Tests', () => {
      it('prevents buyer1 from reading buyer2 orders via injected where clause', async () => {
        // Attacker attempts to explicitly query for buyer2's order ID or buyer2 ID
        const res = await payload.find({
          collection: 'orders' as any,
          where: {
            buyer: {
              equals: buyer2User.id,
            },
          },
          overrideAccess: false,
          user: buyer1User as any,
        })
        expect(res.docs.length).toBe(0)
      })

      it('prevents buyer1 from reading revoked entitlements via adversarial OR query injection', async () => {
        // Attacker attempts to inject an OR clause: (status == 'revoked' OR id > 0)
        const res = await payload.find({
          collection: 'entitlements' as any,
          where: {
            or: [
              { status: { equals: 'revoked' } },
              { id: { not_equals: 0 } },
            ],
          },
          overrideAccess: false,
          user: buyer1User as any,
        })

        // Payload merges user where with access control using AND:
        // (status == 'active' AND user == buyer1) AND (status == 'revoked' OR id > 0)
        // All returned docs MUST still be active and belong to buyer1!
        for (const doc of res.docs) {
          expect(doc.status).toBe('active')
          const userId = typeof doc.user === 'object' ? doc.user.id : doc.user
          expect(userId).toBe(buyer1User.id)
        }
      })

      it('verifies seller cannot read orders where they are not the buyer, even if they are the seller of items within it', async () => {
        // seller1 is the seller of product1 in order1 (bought by buyer1).
        // seller1 should NOT be able to view order1 via orders collection.
        const res = await payload.find({
          collection: 'orders' as any,
          overrideAccess: false,
          user: seller1User as any,
        })

        const ids = res.docs.map((d) => d.id)
        expect(ids).not.toContain(order1.id)
        expect(ids).not.toContain(order2.id)
        expect(ids).not.toContain(order3.id)

        await expect(
          payload.findByID({
            collection: 'orders' as any,
            id: order1.id,
            overrideAccess: false,
            user: seller1User as any,
          }),
        ).rejects.toThrow()
      })

      it('prevents users with multiple non-admin roles (buyer + seller + financeAdmin) from updating entitlements', async () => {
        const multiRoleUser = await createUser(`m1-multi-${Date.now()}@example.test`, [
          'buyer',
          'seller',
          'financeAdmin',
        ])

        await expect(
          payload.update({
            collection: 'entitlements' as any,
            id: entitlement1.id,
            data: { reason: 'Escalation attempt' },
            overrideAccess: false,
            user: multiRoleUser as any,
          }),
        ).rejects.toThrow()
      })

      it('prevents large pagination limit or depth from leaking other users data', async () => {
        const res = await payload.find({
          collection: 'orders' as any,
          limit: 1000,
          depth: 5,
          overrideAccess: false,
          user: buyer1User as any,
        })

        for (const doc of res.docs) {
          const buyerId = typeof doc.buyer === 'object' ? doc.buyer.id : doc.buyer
          expect(buyerId).toBe(buyer1User.id)
        }
      })
    })

    describe('Task 4: Read Access Controls for DownloadEvents', () => {
    it('strictly allows admin to read all download events', async () => {
      const res = await payload.find({
        collection: 'download_events' as any,
        overrideAccess: false,
        user: adminUser as any,
      })

      const ids = res.docs.map((d) => d.id)
      expect(ids).toContain(downloadEvent1.id)
      expect(ids).toContain(downloadEvent2.id)
      expect(ids).toContain(downloadEvent3.id)

      const doc = await payload.findByID({
        collection: 'download_events' as any,
        id: downloadEvent1.id,
        overrideAccess: false,
        user: adminUser as any,
      })
      expect(doc.id).toBe(downloadEvent1.id)
    })

    it('strictly allows financeAdmin to read all download events', async () => {
      const res = await payload.find({
        collection: 'download_events' as any,
        overrideAccess: false,
        user: financeAdminUser as any,
      })

      const ids = res.docs.map((d) => d.id)
      expect(ids).toContain(downloadEvent1.id)
      expect(ids).toContain(downloadEvent2.id)
      expect(ids).toContain(downloadEvent3.id)
    })

    it('denies buyers from reading download events (even their own events)', async () => {
      await expect(
        payload.find({
          collection: 'download_events' as any,
          overrideAccess: false,
          user: buyer1User as any,
        }),
      ).rejects.toThrow(/Forbidden|not allowed/)

      await expect(
        payload.findByID({
          collection: 'download_events' as any,
          id: downloadEvent1.id,
          overrideAccess: false,
          user: buyer1User as any,
        }),
      ).rejects.toThrow()
    })

    it('denies sellers from reading download events (even for their own products)', async () => {
      await expect(
        payload.find({
          collection: 'download_events' as any,
          overrideAccess: false,
          user: seller1User as any,
        }),
      ).rejects.toThrow(/Forbidden|not allowed/)

      await expect(
        payload.findByID({
          collection: 'download_events' as any,
          id: downloadEvent1.id,
          overrideAccess: false,
          user: seller1User as any,
        }),
      ).rejects.toThrow()
    })

    it('denies moderators from reading download events', async () => {
      await expect(
        payload.find({
          collection: 'download_events' as any,
          overrideAccess: false,
          user: moderatorUser as any,
        }),
      ).rejects.toThrow(/Forbidden|not allowed/)
    })

    it('denies unauthenticated guests from reading download events', async () => {
      await expect(
        payload.find({
          collection: 'download_events' as any,
          overrideAccess: false,
          user: null as any,
        }),
      ).rejects.toThrow(/Forbidden|not allowed/)

      await expect(
        payload.findByID({
          collection: 'download_events' as any,
          id: downloadEvent1.id,
          overrideAccess: false,
          user: null as any,
        }),
      ).rejects.toThrow()
    })
  })

  // =========================================================================
  // TASK 5: ADVERSARIAL EDGE-CASE & UNIT CONTRACT TESTING
  // =========================================================================
  describe('Task 5: Adversarial Edge Cases & Access Control Function Oracles', () => {
    it('verifies orderReadAccess returns exact boolean or Where AST', () => {
      expect(orderReadAccess({ req: { user: null } } as any)).toBe(false)
      expect(orderReadAccess({ req: { user: undefined } } as any)).toBe(false)
      expect(orderReadAccess({ req: { user: { id: 10, roles: ['admin'] } } } as any)).toBe(true)
      expect(orderReadAccess({ req: { user: { id: 11, roles: ['financeAdmin'] } } } as any)).toBe(true)
      expect(orderReadAccess({ req: { user: { id: 12, roles: ['buyer'] } } } as any)).toEqual({
        buyer: { equals: 12 },
      })
      expect(orderReadAccess({ req: { user: { id: 13, roles: ['seller'] } } } as any)).toEqual({
        buyer: { equals: 13 },
      })
      // User with malformed/missing roles
      expect(orderReadAccess({ req: { user: { id: 14, roles: undefined } } } as any)).toEqual({
        buyer: { equals: 14 },
      })
    })

    it('verifies orderItemReadAccess returns exact boolean or Where AST', () => {
      expect(orderItemReadAccess({ req: { user: null } } as any)).toBe(false)
      expect(orderItemReadAccess({ req: { user: { id: 20, roles: ['admin'] } } } as any)).toBe(true)
      expect(orderItemReadAccess({ req: { user: { id: 21, roles: ['financeAdmin'] } } } as any)).toBe(true)
      expect(orderItemReadAccess({ req: { user: { id: 22, roles: ['buyer'] } } } as any)).toEqual({
        or: [
          { seller: { equals: 22 } },
          { 'order.buyer': { equals: 22 } },
        ],
      })
    })

    it('verifies entitlementReadAccess returns exact boolean or Where AST', () => {
      expect(entitlementReadAccess({ req: { user: null } } as any)).toBe(false)
      expect(entitlementReadAccess({ req: { user: { id: 30, roles: ['admin'] } } } as any)).toBe(true)
      expect(entitlementReadAccess({ req: { user: { id: 31, roles: ['financeAdmin'] } } } as any)).toBe(true)
      expect(entitlementReadAccess({ req: { user: { id: 32, roles: ['buyer'] } } } as any)).toEqual({
        and: [
          { user: { equals: 32 } },
          { status: { equals: 'active' } },
        ],
      })
    })

    it('verifies entitlementUpdateAccess returns true ONLY for admin', () => {
      expect(entitlementUpdateAccess({ req: { user: null } } as any)).toBe(false)
      expect(entitlementUpdateAccess({ req: { user: { id: 40, roles: ['buyer'] } } } as any)).toBe(false)
      expect(entitlementUpdateAccess({ req: { user: { id: 41, roles: ['seller'] } } } as any)).toBe(false)
      expect(entitlementUpdateAccess({ req: { user: { id: 42, roles: ['financeAdmin'] } } } as any)).toBe(false)
      expect(entitlementUpdateAccess({ req: { user: { id: 43, roles: ['moderator'] } } } as any)).toBe(false)
      expect(entitlementUpdateAccess({ req: { user: { id: 44, roles: ['admin'] } } } as any)).toBe(true)
    })

    it('verifies downloadEventReadAccess returns true ONLY for admin and financeAdmin', () => {
      expect(downloadEventReadAccess({ req: { user: null } } as any)).toBe(false)
      expect(downloadEventReadAccess({ req: { user: { id: 50, roles: ['buyer'] } } } as any)).toBe(false)
      expect(downloadEventReadAccess({ req: { user: { id: 51, roles: ['seller'] } } } as any)).toBe(false)
      expect(downloadEventReadAccess({ req: { user: { id: 52, roles: ['moderator'] } } } as any)).toBe(false)
      expect(downloadEventReadAccess({ req: { user: { id: 53, roles: ['admin'] } } } as any)).toBe(true)
      expect(downloadEventReadAccess({ req: { user: { id: 54, roles: ['financeAdmin'] } } } as any)).toBe(true)
    })

    it('verifies unconditional direct write denial functions', () => {
      expect(orderCreateAccess({} as any)).toBe(false)
      expect(orderUpdateAccess({} as any)).toBe(false)
      expect(orderDeleteAccess({} as any)).toBe(false)
      expect(orderItemCreateAccess({} as any)).toBe(false)
      expect(orderItemUpdateAccess({} as any)).toBe(false)
      expect(orderItemDeleteAccess({} as any)).toBe(false)
      expect(entitlementNoDirectWrite({} as any)).toBe(false)
      expect(downloadEventNoDirectWrite({} as any)).toBe(false)
    })
  })
})
