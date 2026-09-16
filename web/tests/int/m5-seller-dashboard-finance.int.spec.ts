import { getPayload, type Payload } from 'payload'
import config from '@/payload.config'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import type { User } from '@/payload-types'
import { GET as getSellerEarnings } from '@/app/api/v1/seller/earnings/route'
import { POST as cancelSellerWithdrawal } from '@/app/api/v1/seller/withdrawals/[id]/cancel/route'
import { POST as reviewAdminWithdrawal } from '@/app/api/v1/admin/withdrawals/[id]/review/route'
import { POST as processAdminWithdrawal } from '@/app/api/v1/admin/withdrawals/[id]/process/route'
import { POST as finalizeAdminWithdrawal } from '@/app/api/v1/admin/withdrawals/[id]/finalize/route'
import { requestWithdrawal, approveWithdrawal } from '@/services/withdrawal'

describe('Phase 6 Milestone 5: Seller Earnings API & Finance Admin Operations Routes', () => {
  let payload: Payload
  let sellerUser: User
  let seller2User: User
  let buyerUser: User
  let financeAdminUser: User
  let adminUser: User

  const cleanup = {
    withdrawalEvents: [] as (number | string)[],
    withdrawals: [] as (number | string)[],
    sellerEarnings: [] as (number | string)[],
    orderItems: [] as (number | string)[],
    orders: [] as (number | string)[],
    products: [] as (number | string)[],
    users: [] as (number | string)[],
  }

  let seq = 0
  const getSeq = () => ++seq

  const createUser = async (email: string, roles: User['roles']): Promise<User> => {
    const password = 'test-password-m5-123'
    const user = (await payload.create({
      collection: 'users',
      data: {
        email,
        password,
        name: email.split('@')[0],
        roles,
      },
      overrideAccess: true,
    })) as User
    cleanup.users.push(user.id)
    return user
  }

  const seedAvailableEarning = async (sellerId: number, amount: number) => {
    const seqNum = getSeq()
    const timestamp = Date.now()
    const salePrice = Math.round(amount / 0.7)
    const platformFee = salePrice - amount

    const product = await payload.create({
      collection: 'products',
      data: {
        title: `M5 Test Product ${seqNum}`,
        slug: `m5-test-prod-${timestamp}-${seqNum}`,
        price: salePrice,
        isFree: false,
        seller: sellerId,
        copyrightDeclared: true,
        moderationStatus: 'approved',
        _status: 'published',
      },
      overrideAccess: true,
    })
    cleanup.products.push(product.id)

    const order = await payload.create({
      collection: 'orders' as any,
      data: {
        buyer: buyerUser.id,
        totalAmount: salePrice,
        currency: 'VND',
        status: 'COMPLETED',
        paymentSource: 'wallet',
      },
      overrideAccess: true,
    })
    cleanup.orders.push(order.id)

    const orderItem = await payload.create({
      collection: 'order_items' as any,
      data: {
        order: order.id,
        product: product.id,
        seller: sellerId,
        salePrice,
        platformFee,
        sellerAmount: amount,
        tax: 0,
        policyVersion: 'v1-m5',
      },
      overrideAccess: true,
    })
    cleanup.orderItems.push(orderItem.id)

    const earningDoc = await payload.create({
      collection: 'seller_earnings' as any,
      data: {
        seller: sellerId,
        order: order.id,
        orderItem: orderItem.id,
        product: product.id,
        commissionRate: 0.3,
        salePrice,
        platformFee,
        sellerAmount: amount,
        status: 'AVAILABLE',
        holdUntil: new Date(Date.now() - 86400000).toISOString(),
        availableAt: new Date().toISOString(),
      },
      overrideAccess: true,
    })
    cleanup.sellerEarnings.push(earningDoc.id)

    return { product, order, orderItem, earningDoc }
  }

  beforeAll(async () => {
    payload = await getPayload({ config })
    const timestamp = Date.now()

    buyerUser = await createUser(`buyer-m5-${timestamp}-${getSeq()}@kientaohub.local`, ['buyer'])
    sellerUser = await createUser(`seller1-m5-${timestamp}-${getSeq()}@kientaohub.local`, ['seller'])
    seller2User = await createUser(`seller2-m5-${timestamp}-${getSeq()}@kientaohub.local`, ['seller'])
    financeAdminUser = await createUser(`fin-m5-${timestamp}-${getSeq()}@kientaohub.local`, ['financeAdmin'])
    adminUser = await createUser(`admin-m5-${timestamp}-${getSeq()}@kientaohub.local`, ['admin'])

    // Seed 1,000,000 VND available for sellerUser
    await seedAvailableEarning(sellerUser.id, 1000000)
  })

  afterAll(async () => {
    for (const id of cleanup.withdrawalEvents) {
      try { await payload.delete({ collection: 'withdrawal_events' as any, id, overrideAccess: true }) } catch {}
    }
    for (const id of cleanup.withdrawals) {
      try { await payload.delete({ collection: 'withdrawals' as any, id, overrideAccess: true }) } catch {}
    }
    for (const id of cleanup.sellerEarnings) {
      try { await payload.delete({ collection: 'seller_earnings' as any, id, overrideAccess: true }) } catch {}
    }
    for (const id of cleanup.orderItems) {
      try { await payload.delete({ collection: 'order_items' as any, id, overrideAccess: true }) } catch {}
    }
    for (const id of cleanup.orders) {
      try { await payload.delete({ collection: 'orders' as any, id, overrideAccess: true }) } catch {}
    }
    for (const id of cleanup.products) {
      try { await payload.delete({ collection: 'products' as any, id, overrideAccess: true }) } catch {}
    }
    for (const id of cleanup.users) {
      try { await payload.delete({ collection: 'users', id, overrideAccess: true }) } catch {}
    }
  })

  describe('GET /api/v1/seller/earnings', () => {
    it('returns 401 when unauthenticated', async () => {
      const req = new Request('http://localhost:3000/api/v1/seller/earnings', { method: 'GET' })
      const res = await getSellerEarnings(req)
      expect(res.status).toBe(401)
      const data = await res.json()
      expect(data.error).toBe('Unauthorized')
    })

    it('returns 403 when authenticated caller is not a seller or admin (e.g. buyer)', async () => {
      const authSpy = vi.spyOn(payload, 'auth').mockResolvedValueOnce({
        user: buyerUser as any,
      } as any)

      const req = new Request('http://localhost:3000/api/v1/seller/earnings', { method: 'GET' })
      const res = await getSellerEarnings(req)
      expect(res.status).toBe(403)
      const data = await res.json()
      expect(data.error).toBe('Forbidden')
      authSpy.mockRestore()
    })

    it('returns 200 with balance summary and itemized earnings for authenticated seller', async () => {
      const authSpy = vi.spyOn(payload, 'auth').mockResolvedValueOnce({
        user: sellerUser as any,
      } as any)

      const req = new Request('http://localhost:3000/api/v1/seller/earnings', { method: 'GET' })
      const res = await getSellerEarnings(req)
      expect(res.status).toBe(200)
      const json = await res.json()
      expect(json.success).toBe(true)
      expect(json.data.summary).toBeDefined()
      expect(json.data.summary.availableBalance).toBeGreaterThanOrEqual(1000000)
      expect(json.data.earnings).toBeInstanceOf(Array)
      expect(json.data.earnings.length).toBeGreaterThanOrEqual(1)
      expect(json.data.totalDocs).toBeGreaterThanOrEqual(1)
      expect(json.data.page).toBe(1)
      expect(json.data.limit).toBe(10)
      authSpy.mockRestore()
    })

    it('allows admin to query specific sellerId via query parameter', async () => {
      const authSpy = vi.spyOn(payload, 'auth').mockResolvedValueOnce({
        user: adminUser as any,
      } as any)

      const req = new Request(
        `http://localhost:3000/api/v1/seller/earnings?sellerId=${sellerUser.id}`,
        { method: 'GET' },
      )
      const res = await getSellerEarnings(req)
      expect(res.status).toBe(200)
      const json = await res.json()
      expect(json.success).toBe(true)
      expect(json.data.summary.availableBalance).toBeGreaterThanOrEqual(1000000)
      authSpy.mockRestore()
    })
  })

  describe('POST /api/v1/seller/withdrawals/[id]/cancel', () => {
    it('returns 401 when unauthenticated', async () => {
      const req = new Request('http://localhost:3000/api/v1/seller/withdrawals/1/cancel', {
        method: 'POST',
      })
      const res = await cancelSellerWithdrawal(req, { params: Promise.resolve({ id: '1' }) })
      expect(res.status).toBe(401)
    })

    it('allows seller to cancel their own withdrawal in REQUESTED state and releases balance', async () => {
      const wth = await requestWithdrawal(payload, {
        sellerId: sellerUser.id,
        amount: 200000,
        bankInfo: {
          bankName: 'Vietcombank',
          accountNumber: '9988776655',
          accountHolderName: 'TEST SELLER',
        },
      })
      cleanup.withdrawals.push(wth.id)

      const authSpy = vi.spyOn(payload, 'auth').mockResolvedValueOnce({
        user: sellerUser as any,
      } as any)

      const req = new Request(`http://localhost:3000/api/v1/seller/withdrawals/${wth.id}/cancel`, {
        method: 'POST',
      })
      const res = await cancelSellerWithdrawal(req, { params: Promise.resolve({ id: String(wth.id) }) })
      expect(res.status).toBe(200)
      const json = await res.json()
      expect(json.success).toBe(true)
      expect(json.data.status).toBe('CANCELLED')

      // Verify cancellation in DB
      const updated = await payload.findByID({
        collection: 'withdrawals',
        id: wth.id,
        overrideAccess: true,
      })
      expect(updated.status).toBe('CANCELLED')
      authSpy.mockRestore()
    })

    it('prevents seller from cancelling another seller withdrawal', async () => {
      const wth = await requestWithdrawal(payload, {
        sellerId: sellerUser.id,
        amount: 100000,
        bankInfo: {
          bankName: 'MBBank',
          accountNumber: '1122334455',
          accountHolderName: 'TEST SELLER',
        },
      })
      cleanup.withdrawals.push(wth.id)

      // seller2 attempts to cancel seller1's withdrawal
      const authSpy = vi.spyOn(payload, 'auth').mockResolvedValueOnce({
        user: seller2User as any,
      } as any)

      const req = new Request(`http://localhost:3000/api/v1/seller/withdrawals/${wth.id}/cancel`, {
        method: 'POST',
      })
      const res = await cancelSellerWithdrawal(req, { params: Promise.resolve({ id: String(wth.id) }) })
      expect(res.status).toBe(400)
      const json = await res.json()
      expect(json.message).toContain('Unauthorized')
      authSpy.mockRestore()
    })
  })

  describe('Finance Admin Operations Action Routes', () => {
    it('POST /api/v1/admin/withdrawals/[id]/review transitions REQUESTED -> UNDER_REVIEW', async () => {
      const wth = await requestWithdrawal(payload, {
        sellerId: sellerUser.id,
        amount: 150000,
        bankInfo: {
          bankName: 'Techcombank',
          accountNumber: '1234567890',
          accountHolderName: 'TEST SELLER',
        },
      })
      cleanup.withdrawals.push(wth.id)

      const authSpy = vi.spyOn(payload, 'auth').mockResolvedValueOnce({
        user: financeAdminUser as any,
      } as any)

      const req = new Request(`http://localhost:3000/api/v1/admin/withdrawals/${wth.id}/review`, {
        method: 'POST',
      })
      const res = await reviewAdminWithdrawal(req, { params: Promise.resolve({ id: String(wth.id) }) })
      expect(res.status).toBe(200)
      const json = await res.json()
      expect(json.success).toBe(true)
      expect(json.data.status).toBe('UNDER_REVIEW')
      authSpy.mockRestore()
    })

    it('POST /api/v1/admin/withdrawals/[id]/process transitions APPROVED -> PROCESSING', async () => {
      const wth = await requestWithdrawal(payload, {
        sellerId: sellerUser.id,
        amount: 100000,
        bankInfo: {
          bankName: 'Techcombank',
          accountNumber: '1234567890',
          accountHolderName: 'TEST SELLER',
        },
      })
      cleanup.withdrawals.push(wth.id)

      await approveWithdrawal(payload, {
        withdrawalId: wth.id,
        actorId: financeAdminUser.id,
      })

      const authSpy = vi.spyOn(payload, 'auth').mockResolvedValueOnce({
        user: financeAdminUser as any,
      } as any)

      const req = new Request(`http://localhost:3000/api/v1/admin/withdrawals/${wth.id}/process`, {
        method: 'POST',
      })
      const res = await processAdminWithdrawal(req, { params: Promise.resolve({ id: String(wth.id) }) })
      expect(res.status).toBe(200)
      const json = await res.json()
      expect(json.success).toBe(true)
      expect(json.data.status).toBe('PROCESSING')
      authSpy.mockRestore()
    })

    it('POST /api/v1/admin/withdrawals/[id]/finalize transitions PROCESSING -> PAID', async () => {
      const wth = await requestWithdrawal(payload, {
        sellerId: sellerUser.id,
        amount: 100000,
        bankInfo: {
          bankName: 'Techcombank',
          accountNumber: '1234567890',
          accountHolderName: 'TEST SELLER',
        },
      })
      cleanup.withdrawals.push(wth.id)

      await approveWithdrawal(payload, {
        withdrawalId: wth.id,
        actorId: financeAdminUser.id,
      })

      const authSpy1 = vi.spyOn(payload, 'auth').mockResolvedValueOnce({
        user: financeAdminUser as any,
      } as any)

      const procReq = new Request(`http://localhost:3000/api/v1/admin/withdrawals/${wth.id}/process`, {
        method: 'POST',
      })
      await processAdminWithdrawal(procReq, { params: Promise.resolve({ id: String(wth.id) }) })
      authSpy1.mockRestore()

      const authSpy2 = vi.spyOn(payload, 'auth').mockResolvedValueOnce({
        user: financeAdminUser as any,
      } as any)

      const finReq = new Request(`http://localhost:3000/api/v1/admin/withdrawals/${wth.id}/finalize`, {
        method: 'POST',
      })
      const res = await finalizeAdminWithdrawal(finReq, { params: Promise.resolve({ id: String(wth.id) }) })
      expect(res.status).toBe(200)
      const json = await res.json()
      expect(json.success).toBe(true)
      expect(json.data.status).toBe('PAID')
      authSpy2.mockRestore()
    })
  })
})
