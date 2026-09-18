import { getPayload, type Payload } from 'payload'
import config from '@/payload.config'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import type { User, Product } from '@/payload-types'
import { GET, POST, PUT } from '@/app/api/v1/products/[id]/reviews/route'
import { purchaseProduct } from '@/services/purchase'
import { creditWallet } from '@/services/wallet'

describe('Reviews & Ratings System (FR-20, BR-05, FLOW-U08)', () => {
  let payload: Payload
  let bootstrapUser: User
  let sellerUser: User
  let entitledBuyer1: User
  let entitledBuyer2: User
  let entitledBuyer3: User
  let unentitledUser: User
  let adminUser: User
  let testProduct: Product
  let emptyProduct: Product
  let concurrencyProduct: Product
  let e2ePurchaseProduct: Product

  const cleanup = {
    reviews: [] as (number | string)[],
    entitlements: [] as (number | string)[],
    products: [] as (number | string)[],
    users: [] as (number | string)[],
    orders: [] as (number | string)[],
  }

  let seq = 0
  const getSeq = () => ++seq

  const createUser = async (email: string, roles: User['roles']): Promise<User> => {
    const user = (await payload.create({
      collection: 'users',
      data: {
        email,
        password: 'test-password-reviews-123',
        name: email.split('@')[0],
        roles,
      },
      overrideAccess: true,
    })) as User
    cleanup.users.push(user.id)
    return user
  }

  beforeAll(async () => {
    payload = await getPayload({ config })
    const timestamp = Date.now()

    // `ensureFirstUserIsAdmin` (src/collections/Users/hooks) appends 'admin' to the roles of
    // the FIRST user created while the users table is EMPTY - which is exactly the CI state:
    // .github/workflows/ci.yml applies only the versioned migrations (no seed) and every
    // spec's afterAll deletes its users, so each spec file starts from an empty table.
    // Absorb that promotion with a throwaway user BEFORE the role-sensitive fixtures below.
    // Without it `sellerUser` is silently ['seller','admin'], and the "a seller must not be
    // able to tamper with a buyer's review" assertions would pass for the wrong reason
    // (they would be testing an admin) - a false green.
    bootstrapUser = await createUser(
      `bootstrap-rev-${timestamp}-${getSeq()}@kientaohub.local`,
      ['buyer'],
    )

    sellerUser = await createUser(`seller-rev-${timestamp}-${getSeq()}@kientaohub.local`, ['seller'])
    entitledBuyer1 = await createUser(`buyer1-rev-${timestamp}-${getSeq()}@kientaohub.local`, ['buyer'])
    entitledBuyer2 = await createUser(`buyer2-rev-${timestamp}-${getSeq()}@kientaohub.local`, ['buyer'])
    entitledBuyer3 = await createUser(`buyer3-rev-${timestamp}-${getSeq()}@kientaohub.local`, ['buyer'])
    unentitledUser = await createUser(`unentitled-rev-${timestamp}-${getSeq()}@kientaohub.local`, ['buyer'])
    adminUser = await createUser(`admin-rev-${timestamp}-${getSeq()}@kientaohub.local`, ['admin'])

    // Guard: the fixtures must hold EXACTLY the roles they declare, whether or not the users
    // table started empty. If the first-user promotion ever lands on one of them again, these
    // assertions fail loudly instead of letting the authorization tests silently lose meaning.
    expect(sellerUser.roles).toEqual(['seller'])
    expect(sellerUser.roles).not.toContain('admin')
    expect(sellerUser.roles).not.toContain('moderator')
    expect(sellerUser.roles).not.toContain('financeAdmin')
    expect(entitledBuyer1.roles).toEqual(['buyer'])
    expect(entitledBuyer2.roles).toEqual(['buyer'])
    expect(entitledBuyer3.roles).toEqual(['buyer'])
    expect(unentitledUser.roles).toEqual(['buyer'])
    expect(adminUser.roles).toEqual(['admin'])

    // Create primary test product
    const prodDoc = await payload.create({
      collection: 'products',
      data: {
        title: `CAD Model Review Test ${getSeq()}`,
        slug: `cad-model-review-test-${timestamp}`,
        price: 150000,
        isFree: false,
        seller: sellerUser.id,
        copyrightDeclared: true,
        moderationStatus: 'approved',
        _status: 'published',
      },
      overrideAccess: true,
    })
    testProduct = prodDoc as Product
    cleanup.products.push(testProduct.id)

    // Create empty test product (no reviews)
    const emptyProdDoc = await payload.create({
      collection: 'products',
      data: {
        title: `Empty CAD Model Test ${getSeq()}`,
        slug: `empty-cad-model-test-${timestamp}`,
        price: 80000,
        isFree: false,
        seller: sellerUser.id,
        copyrightDeclared: true,
        moderationStatus: 'approved',
        _status: 'published',
      },
      overrideAccess: true,
    })
    emptyProduct = emptyProdDoc as Product
    cleanup.products.push(emptyProduct.id)

    // Create dedicated product for concurrent submission testing
    const concProdDoc = await payload.create({
      collection: 'products',
      data: {
        title: `Concurrency CAD Model Test ${getSeq()}`,
        slug: `concurrency-cad-model-test-${timestamp}`,
        price: 90000,
        isFree: false,
        seller: sellerUser.id,
        copyrightDeclared: true,
        moderationStatus: 'approved',
        _status: 'published',
      },
      overrideAccess: true,
    })
    concurrencyProduct = concProdDoc as Product
    cleanup.products.push(concurrencyProduct.id)

    // Create dedicated product for end-to-end purchase testing
    const e2eProdDoc = await payload.create({
      collection: 'products',
      data: {
        title: `E2E Purchase CAD Model Test ${getSeq()}`,
        slug: `e2e-purchase-cad-model-test-${timestamp}`,
        price: 95000,
        isFree: false,
        seller: sellerUser.id,
        copyrightDeclared: true,
        moderationStatus: 'approved',
        _status: 'published',
      },
      overrideAccess: true,
    })
    e2ePurchaseProduct = e2eProdDoc as Product
    cleanup.products.push(e2ePurchaseProduct.id)

    // Grant active entitlements
    const ent1 = await payload.create({
      collection: 'entitlements',
      data: {
        user: entitledBuyer1.id,
        product: testProduct.id,
        status: 'active',
        grantedAt: new Date().toISOString(),
        downloadCount: 1,
      },
      overrideAccess: true,
    })
    cleanup.entitlements.push(ent1.id)

    const ent2 = await payload.create({
      collection: 'entitlements',
      data: {
        user: entitledBuyer2.id,
        product: testProduct.id,
        status: 'active',
        grantedAt: new Date().toISOString(),
        downloadCount: 0,
      },
      overrideAccess: true,
    })
    cleanup.entitlements.push(ent2.id)

    const ent3 = await payload.create({
      collection: 'entitlements',
      data: {
        user: entitledBuyer3.id,
        product: concurrencyProduct.id,
        status: 'active',
        grantedAt: new Date().toISOString(),
        downloadCount: 0,
      },
      overrideAccess: true,
    })
    cleanup.entitlements.push(ent3.id)
  })

  afterAll(async () => {
    for (const id of cleanup.reviews) {
      try {
        await payload.delete({ collection: 'reviews', id, overrideAccess: true })
      } catch {}
    }
    for (const id of cleanup.entitlements) {
      try {
        await payload.delete({ collection: 'entitlements', id, overrideAccess: true })
      } catch {}
    }
    for (const id of cleanup.products) {
      try {
        await payload.delete({ collection: 'products', id, overrideAccess: true })
      } catch {}
    }
    for (const id of cleanup.orders) {
      try {
        await payload.delete({ collection: 'orders', id, overrideAccess: true })
      } catch {}
    }
    for (const id of cleanup.users) {
      try {
        await payload.delete({ collection: 'users', id, overrideAccess: true })
      } catch {}
    }
  })

  // Helper context generator
  const makeContext = (id: string | number) => ({
    params: Promise.resolve({ id: String(id) }),
  })

  describe('R2: POST /api/v1/products/[id]/reviews & BR-05 Enforcement', () => {
    it('returns 401 Unauthorized when unauthenticated', async () => {
      vi.spyOn(payload, 'auth').mockResolvedValueOnce({ user: null } as any)

      const req = new Request(`http://localhost:3000/api/v1/products/${testProduct.id}/reviews`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rating: 5, content: 'File rất chất lượng, chuẩn kỹ thuật!' }),
      })

      const res = await POST(req, makeContext(testProduct.id))
      expect(res.status).toBe(401)
      const data = await res.json()
      expect(data.error).toBe('UNAUTHORIZED')
    })

    it('returns 403 Forbidden when user has NO active entitlement (BR-05 compliance)', async () => {
      vi.spyOn(payload, 'auth').mockResolvedValueOnce({ user: unentitledUser as any } as any)

      const req = new Request(`http://localhost:3000/api/v1/products/${testProduct.id}/reviews`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rating: 5, content: 'Cố tình đánh giá khi chưa mua tài nguyên' }),
      })

      const res = await POST(req, makeContext(testProduct.id))
      expect(res.status).toBe(403)
      const data = await res.json()
      expect(data.error).toBe('VERIFIED_PURCHASE_REQUIRED')
      expect(data.message).toContain('BR-05')
    })

    it('returns 404 Not Found for non-existent product ID', async () => {
      vi.spyOn(payload, 'auth').mockResolvedValueOnce({ user: entitledBuyer1 as any } as any)

      const req = new Request('http://localhost:3000/api/v1/products/9999999/reviews', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rating: 5, content: 'Bản vẽ rất tốt và hoàn chỉnh!' }),
      })

      const res = await POST(req, makeContext(9999999))
      expect(res.status).toBe(404)
      const data = await res.json()
      expect(data.error).toBe('PRODUCT_NOT_FOUND')
    })

    it('returns 400 Bad Request for invalid rating bounds (< 1, > 5, non-integer, missing)', async () => {
      vi.spyOn(payload, 'auth').mockResolvedValue({ user: entitledBuyer1 as any } as any)

      // 1. Missing rating
      let req = new Request(`http://localhost:3000/api/v1/products/${testProduct.id}/reviews`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: 'Nội dung đánh giá hợp lệ' }),
      })
      let res = await POST(req, makeContext(testProduct.id))
      expect(res.status).toBe(400)
      const data = await res.json()
      expect(data.error).toBe('INVALID_REQUEST')

      // 2. Rating < 1
      req = new Request(`http://localhost:3000/api/v1/products/${testProduct.id}/reviews`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rating: 0, content: 'Nội dung đánh giá hợp lệ' }),
      })
      res = await POST(req, makeContext(testProduct.id))
      expect(res.status).toBe(400)

      // 3. Rating > 5
      req = new Request(`http://localhost:3000/api/v1/products/${testProduct.id}/reviews`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rating: 6, content: 'Nội dung đánh giá hợp lệ' }),
      })
      res = await POST(req, makeContext(testProduct.id))
      expect(res.status).toBe(400)

      // 4. Non-integer rating
      req = new Request(`http://localhost:3000/api/v1/products/${testProduct.id}/reviews`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rating: 4.5, content: 'Nội dung đánh giá hợp lệ' }),
      })
      res = await POST(req, makeContext(testProduct.id))
      expect(res.status).toBe(400)

      // 5. Boolean rating
      req = new Request(`http://localhost:3000/api/v1/products/${testProduct.id}/reviews`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rating: true, content: 'Nội dung đánh giá hợp lệ' }),
      })
      res = await POST(req, makeContext(testProduct.id))
      expect(res.status).toBe(400)
    })

    it('returns 400 Bad Request for blank or short content (< 5 characters)', async () => {
      vi.spyOn(payload, 'auth').mockResolvedValue({ user: entitledBuyer1 as any } as any)

      // 1. Empty content
      let req = new Request(`http://localhost:3000/api/v1/products/${testProduct.id}/reviews`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rating: 5, content: '' }),
      })
      let res = await POST(req, makeContext(testProduct.id))
      expect(res.status).toBe(400)

      // 2. Whitespace only
      req = new Request(`http://localhost:3000/api/v1/products/${testProduct.id}/reviews`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rating: 5, content: '    ' }),
      })
      res = await POST(req, makeContext(testProduct.id))
      expect(res.status).toBe(400)

      // 3. Short content (< 5 chars)
      req = new Request(`http://localhost:3000/api/v1/products/${testProduct.id}/reviews`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rating: 5, content: 'ok!' }),
      })
      res = await POST(req, makeContext(testProduct.id))
      expect(res.status).toBe(400)
    })

    it('returns 201 Created when entitled buyer submits a valid review', async () => {
      vi.spyOn(payload, 'auth').mockResolvedValueOnce({ user: entitledBuyer1 as any } as any)

      const req = new Request(`http://localhost:3000/api/v1/products/${testProduct.id}/reviews`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rating: 5,
          title: 'Bản vẽ rất hoàn hảo',
          content: 'File CAD rất chi tiết, layer gọn gàng, mở nhanh trong AutoCAD.',
        }),
      })

      const res = await POST(req, makeContext(testProduct.id))
      expect(res.status).toBe(201)
      const data = await res.json()
      expect(data.success).toBe(true)
      expect(data.review.rating).toBe(5)
      expect(data.review.title).toBe('Bản vẽ rất hoàn hảo')
      expect(data.review.content).toBe(
        'File CAD rất chi tiết, layer gọn gàng, mở nhanh trong AutoCAD.',
      )
      expect(data.review.status).toBe('published')
      cleanup.reviews.push(data.review.id)
    })

    it('returns 409 Conflict when user attempts to submit a duplicate review', async () => {
      vi.spyOn(payload, 'auth').mockResolvedValueOnce({ user: entitledBuyer1 as any } as any)

      const req = new Request(`http://localhost:3000/api/v1/products/${testProduct.id}/reviews`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rating: 4,
          content: 'Cố tình gửi đánh giá lần 2 cho cùng sản phẩm',
        }),
      })

      const res = await POST(req, makeContext(testProduct.id))
      expect(res.status).toBe(409)
      const data = await res.json()
      expect(data.error).toBe('ALREADY_REVIEWED')
    })

    it('allows a second entitled buyer to submit a review (4 stars)', async () => {
      vi.spyOn(payload, 'auth').mockResolvedValueOnce({ user: entitledBuyer2 as any } as any)

      const req = new Request(`http://localhost:3000/api/v1/products/${testProduct.id}/reviews`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rating: 4,
          title: 'Khá hài lòng',
          content: 'Tài nguyên dùng tốt cho dự án thực tế, hướng dẫn đầy đủ.',
        }),
      })

      const res = await POST(req, makeContext(testProduct.id))
      expect(res.status).toBe(201)
      const data = await res.json()
      expect(data.success).toBe(true)
      expect(data.review.rating).toBe(4)
      cleanup.reviews.push(data.review.id)
    })

    it('returns 400 Bad Request when content exceeds 5000 characters or title exceeds 200 characters', async () => {
      vi.spyOn(payload, 'auth').mockResolvedValue({ user: entitledBuyer3 as any } as any)

      // Content exceeds 5000 characters
      const longContent = 'A'.repeat(5001)
      let req = new Request(`http://localhost:3000/api/v1/products/${concurrencyProduct.id}/reviews`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rating: 5, content: longContent }),
      })
      let res = await POST(req, makeContext(concurrencyProduct.id))
      expect(res.status).toBe(400)
      let data = await res.json()
      expect(data.error).toBe('INVALID_REQUEST')
      expect(data.message).toContain('5000')

      // Title exceeds 200 characters
      const longTitle = 'T'.repeat(201)
      req = new Request(`http://localhost:3000/api/v1/products/${concurrencyProduct.id}/reviews`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rating: 5, title: longTitle, content: 'Bản vẽ rất chi tiết và chuẩn chỉ.' }),
      })
      res = await POST(req, makeContext(concurrencyProduct.id))
      expect(res.status).toBe(400)
      data = await res.json()
      expect(data.error).toBe('INVALID_REQUEST')
      expect(data.message).toContain('200')
    })

    it('handles rapid concurrent duplicate review POST submissions atomically without 500 error', async () => {
      vi.spyOn(payload, 'auth').mockResolvedValue({ user: entitledBuyer3 as any } as any)

      const reqA = new Request(`http://localhost:3000/api/v1/products/${concurrencyProduct.id}/reviews`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rating: 5,
          title: 'Đánh giá đồng thời A',
          content: 'Nội dung đánh giá kiểm thử chạy đồng thời.',
        }),
      })

      const reqB = new Request(`http://localhost:3000/api/v1/products/${concurrencyProduct.id}/reviews`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rating: 5,
          title: 'Đánh giá đồng thời B',
          content: 'Nội dung đánh giá kiểm thử chạy đồng thời.',
        }),
      })

      const [resA, resB] = await Promise.all([
        POST(reqA, makeContext(concurrencyProduct.id)),
        POST(reqB, makeContext(concurrencyProduct.id)),
      ])

      const statuses = [resA.status, resB.status].sort()
      // One request MUST succeed with 201 Created, and the concurrent duplicate MUST receive 409 Conflict (never 500)
      expect(statuses).toEqual([201, 409])

      const successfulRes = resA.status === 201 ? resA : resB
      const conflictedRes = resA.status === 409 ? resA : resB

      const successData = await successfulRes.json()
      expect(successData.success).toBe(true)
      cleanup.reviews.push(successData.review.id)

      const conflictData = await conflictedRes.json()
      expect(conflictData.error).toBe('ALREADY_REVIEWED')
    })

    it('returns 400 Bad Request when request body is null or not an object', async () => {
      vi.spyOn(payload, 'auth').mockResolvedValueOnce({ user: entitledBuyer1 as any } as any)

      // null body
      let req = new Request(`http://localhost:3000/api/v1/products/${testProduct.id}/reviews`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: 'null',
      })
      let res = await POST(req, makeContext(testProduct.id))
      expect(res.status).toBe(400)
      const data = await res.json()
      expect(data.error).toBe('INVALID_REQUEST')

      // array body
      vi.spyOn(payload, 'auth').mockResolvedValueOnce({ user: entitledBuyer1 as any } as any)
      req = new Request(`http://localhost:3000/api/v1/products/${testProduct.id}/reviews`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '[]',
      })
      res = await POST(req, makeContext(testProduct.id))
      expect(res.status).toBe(400)
    })

    it('returns 403 Forbidden when user entitlement status is revoked (BR-05 compliance)', async () => {
      const revokedBuyer = await createUser(`revoked-${Date.now()}-${getSeq()}@kientaohub.local`, ['buyer'])

      // Grant revoked entitlement (e.g. following refund)
      const entRevoked = await payload.create({
        collection: 'entitlements',
        data: {
          user: revokedBuyer.id,
          product: emptyProduct.id,
          status: 'revoked',
          grantedAt: new Date().toISOString(),
          downloadCount: 0,
        },
        overrideAccess: true,
      })
      cleanup.entitlements.push(entRevoked.id)

      vi.spyOn(payload, 'auth').mockResolvedValueOnce({ user: revokedBuyer as any } as any)

      const req = new Request(`http://localhost:3000/api/v1/products/${emptyProduct.id}/reviews`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rating: 5, content: 'Đã bị hoàn tiền và thu hồi quyền' }),
      })

      const res = await POST(req, makeContext(emptyProduct.id))
      expect(res.status).toBe(403)
      const data = await res.json()
      expect(data.error).toBe('VERIFIED_PURCHASE_REQUIRED')
    })

    it('allows review submission following a real wallet purchase end-to-end (purchase -> active entitlement -> 201 Created)', async () => {
      const freshBuyer = await createUser(`fresh-buyer-${Date.now()}-${getSeq()}@kientaohub.local`, ['buyer'])

      // Top up wallet
      await creditWallet(payload, {
        userId: freshBuyer.id,
        amount: 300000,
        type: 'topup',
        referenceType: 'payment_intent',
        referenceId: `TOPUP_REV_E2E_${Date.now()}`,
        description: 'Topup for reviews e2e test',
      })

      // Purchase product
      const purchaseResult = await purchaseProduct(payload, {
        buyerId: freshBuyer.id,
        productId: e2ePurchaseProduct.id,
      })
      expect(purchaseResult.success).toBe(true)
      cleanup.orders.push(purchaseResult.orderId)
      cleanup.entitlements.push(purchaseResult.entitlementId)

      // Authenticate and submit review
      vi.spyOn(payload, 'auth').mockResolvedValueOnce({ user: freshBuyer as any } as any)

      const req = new Request(`http://localhost:3000/api/v1/products/${e2ePurchaseProduct.id}/reviews`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rating: 5,
          title: 'Mua bằng ví thành công',
          content: 'Vừa mua xong và gửi đánh giá ngay lập tức, rất tiện lợi.',
        }),
      })

      const res = await POST(req, makeContext(e2ePurchaseProduct.id))
      expect(res.status).toBe(201)
      const data = await res.json()
      expect(data.success).toBe(true)
      expect(data.review.rating).toBe(5)
      cleanup.reviews.push(data.review.id)
    })
  })

  describe('R2: GET /api/v1/products/[id]/reviews & Summary Statistics', () => {
    it('returns aggregated summary statistics and review list', async () => {
      // Ensure reviews exist if this test is executed in isolation
      const countCheck = await payload.count({
        collection: 'reviews',
        where: {
          and: [
            { product: { equals: testProduct.id } },
            { status: { equals: 'published' } },
          ],
        },
        overrideAccess: true,
      })
      if (countCheck.totalDocs < 2) {
        const ent1 = await payload.find({
          collection: 'entitlements',
          where: { and: [{ user: { equals: entitledBuyer1.id } }, { product: { equals: testProduct.id } }] },
          overrideAccess: true,
        })
        const r1 = await payload.create({
          collection: 'reviews',
          data: {
            product: testProduct.id,
            user: entitledBuyer1.id,
            entitlement: ent1.docs[0].id,
            rating: 5,
            title: 'Bản vẽ rất hoàn hảo',
            content: 'File CAD rất chi tiết, layer gọn gàng, mở nhanh trong AutoCAD.',
            status: 'published',
          },
          overrideAccess: true,
        })
        cleanup.reviews.push(r1.id)

        const ent2 = await payload.find({
          collection: 'entitlements',
          where: { and: [{ user: { equals: entitledBuyer2.id } }, { product: { equals: testProduct.id } }] },
          overrideAccess: true,
        })
        const r2 = await payload.create({
          collection: 'reviews',
          data: {
            product: testProduct.id,
            user: entitledBuyer2.id,
            entitlement: ent2.docs[0].id,
            rating: 4,
            title: 'Khá hài lòng',
            content: 'Tài nguyên dùng tốt cho dự án thực tế, hướng dẫn đầy đủ.',
            status: 'published',
          },
          overrideAccess: true,
        })
        cleanup.reviews.push(r2.id)
      }

      const req = new Request(`http://localhost:3000/api/v1/products/${testProduct.id}/reviews`, {
        method: 'GET',
      })

      const res = await GET(req, makeContext(testProduct.id))
      expect(res.status).toBe(200)
      const data = await res.json()

      expect(data.success).toBe(true)
      // Total count should be 2 (buyer1 gave 5, buyer2 gave 4)
      expect(data.summary.totalCount).toBe(2)
      // Average: (5 + 4) / 2 = 4.5
      expect(data.summary.averageRating).toBe(4.5)
      // Distribution breakdown
      expect(data.summary.distribution[5]).toBe(1)
      expect(data.summary.distribution[4]).toBe(1)
      expect(data.summary.distribution[3]).toBe(0)
      expect(data.summary.distribution[2]).toBe(0)
      expect(data.summary.distribution[1]).toBe(0)

      // Check reviews list
      expect(data.reviews.length).toBe(2)
      for (const rev of data.reviews) {
        expect(rev.verifiedPurchase).toBe(true)
        expect(rev.user).toBeDefined()
        expect(rev.user.name).toBeDefined()
        expect(rev.rating).toBeGreaterThanOrEqual(1)
      }
    })

    it('handles empty reviews scenario gracefully', async () => {
      const req = new Request(`http://localhost:3000/api/v1/products/${emptyProduct.id}/reviews`, {
        method: 'GET',
      })

      const res = await GET(req, makeContext(emptyProduct.id))
      expect(res.status).toBe(200)
      const data = await res.json()

      expect(data.success).toBe(true)
      expect(data.summary.totalCount).toBe(0)
      expect(data.summary.averageRating).toBe(0)
      expect(data.summary.distribution).toEqual({ 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 })
      expect(data.reviews).toEqual([])
    })

    it('returns 404 for non-existent product', async () => {
      const req = new Request('http://localhost:3000/api/v1/products/8888888/reviews', {
        method: 'GET',
      })
      const res = await GET(req, makeContext(8888888))
      expect(res.status).toBe(404)
    })
  })

  describe('R2: PUT /api/v1/products/[id]/reviews (Review Editing)', () => {
    it('returns 401 when unauthenticated', async () => {
      vi.spyOn(payload, 'auth').mockResolvedValueOnce({ user: null } as any)

      const req = new Request(`http://localhost:3000/api/v1/products/${testProduct.id}/reviews`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rating: 4, content: 'Chỉnh sửa đánh giá mà chưa đăng nhập' }),
      })

      const res = await PUT(req, makeContext(testProduct.id))
      expect(res.status).toBe(401)
    })

    it('allows author to update their existing review', async () => {
      vi.spyOn(payload, 'auth').mockResolvedValueOnce({ user: entitledBuyer1 as any } as any)

      const req = new Request(`http://localhost:3000/api/v1/products/${testProduct.id}/reviews`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rating: 4,
          title: 'Đã cập nhật sau 1 tuần dùng',
          content: 'Vẫn rất tốt, bổ sung thêm chi tiết tuyệt vời.',
        }),
      })

      const res = await PUT(req, makeContext(testProduct.id))
      expect(res.status).toBe(200)
      const data = await res.json()
      expect(data.success).toBe(true)
      expect(data.review.rating).toBe(4)
      expect(data.review.title).toBe('Đã cập nhật sau 1 tuần dùng')
      expect(data.review.content).toBe('Vẫn rất tốt, bổ sung thêm chi tiết tuyệt vời.')
    })

    it('allows author to clear optional title by submitting null', async () => {
      vi.spyOn(payload, 'auth').mockResolvedValueOnce({ user: entitledBuyer1 as any } as any)

      const req = new Request(`http://localhost:3000/api/v1/products/${testProduct.id}/reviews`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: null,
          content: 'Cập nhật nội dung và xóa tiêu đề trước đó.',
        }),
      })

      const res = await PUT(req, makeContext(testProduct.id))
      expect(res.status).toBe(200)
      const data = await res.json()
      expect(data.success).toBe(true)
      expect(data.review.title).toBeNull()
      expect(data.review.content).toBe('Cập nhật nội dung và xóa tiêu đề trước đó.')
    })

    it('returns 400 Bad Request when PUT body is null, array, or lacks updatable fields', async () => {
      vi.spyOn(payload, 'auth').mockResolvedValue({ user: entitledBuyer1 as any } as any)

      // null body
      let req = new Request(`http://localhost:3000/api/v1/products/${testProduct.id}/reviews`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: 'null',
      })
      let res = await PUT(req, makeContext(testProduct.id))
      expect(res.status).toBe(400)
      let data = await res.json()
      expect(data.error).toBe('INVALID_REQUEST')

      // empty object (no fields)
      req = new Request(`http://localhost:3000/api/v1/products/${testProduct.id}/reviews`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      })
      res = await PUT(req, makeContext(testProduct.id))
      expect(res.status).toBe(400)
      data = await res.json()
      expect(data.error).toBe('INVALID_REQUEST')
    })
  })

  describe('R1: Payload Collection Hooks & Anti-Abuse Invariants', () => {
    it('Payload hook strictly blocks review creation for users without active entitlement (BR-05)', async () => {
      await expect(
        payload.create({
          collection: 'reviews',
          data: {
            user: unentitledUser.id,
            product: testProduct.id,
            rating: 5,
            content: 'Đánh giá lậu qua payload direct create',
          } as any,
          user: unentitledUser,
          overrideAccess: false,
        }),
      ).rejects.toThrow(/Verified purchase required|BR-05/i)
    })

    it('Payload hook strictly blocks duplicate reviews for the same user and product', async () => {
      await expect(
        payload.create({
          collection: 'reviews',
          data: {
            user: entitledBuyer1.id,
            product: testProduct.id,
            rating: 5,
            content: 'Đánh giá trùng lặp qua direct create',
          } as any,
          user: entitledBuyer1,
          overrideAccess: false,
        }),
      ).rejects.toThrow(/Duplicate review/i)
    })

    it('Payload hook enforces content trimming and minimum length (>= 5 chars)', async () => {
      await expect(
        payload.create({
          collection: 'reviews',
          data: {
            user: entitledBuyer1.id,
            product: emptyProduct.id,
            rating: 5,
            content: '   hi   ', // trims to 'hi' (2 chars)
          } as any,
          user: entitledBuyer1,
          overrideAccess: false,
        }),
      ).rejects.toThrow(/content must be at least 5 characters/i)
    })

    it('allows seller to add sellerReply and auto-populates repliedAt timestamp', async () => {
      const reviewDoc = await payload.find({
        collection: 'reviews',
        where: {
          and: [
            { user: { equals: entitledBuyer1.id } },
            { product: { equals: testProduct.id } },
          ],
        },
        limit: 1,
        overrideAccess: true,
      })
      const reviewId = reviewDoc.docs[0].id

      const updated = await payload.update({
        collection: 'reviews',
        id: reviewId,
        data: {
          sellerReply: {
            comment: 'Cảm ơn bạn đã mua và đánh giá tài nguyên của shop!',
          },
        },
        user: sellerUser,
        overrideAccess: false,
      })

      expect(updated.sellerReply?.comment).toBe(
        'Cảm ơn bạn đã mua và đánh giá tài nguyên của shop!',
      )
      expect(updated.sellerReply?.repliedAt).toBeDefined()
      expect(new Date(updated.sellerReply!.repliedAt!).getTime()).toBeGreaterThan(0)
    })

    it('strictly prevents seller from altering buyer rating, title, or content on review update', async () => {
      const reviewDoc = await payload.find({
        collection: 'reviews',
        where: {
          and: [
            { user: { equals: entitledBuyer1.id } },
            { product: { equals: testProduct.id } },
          ],
        },
        limit: 1,
        overrideAccess: true,
      })
      const review = reviewDoc.docs[0] as any
      const originalRating = review.rating
      const originalContent = review.content

      // Seller attempts to tamper with rating to 1 and change content
      // The tampering attempt must be judged as a SELLER: this assertion makes the test
      // self-guarding, so a re-appearance of the first-user promotion fails here instead of
      // silently turning this test into an admin-vs-review test (false green).
      expect(sellerUser.roles ?? []).not.toContain('admin')
      expect(sellerUser.roles ?? []).not.toContain('moderator')
      expect(sellerUser.roles ?? []).not.toContain('financeAdmin')

      const tampered = await payload.update({
        collection: 'reviews',
        id: review.id,
        data: {
          rating: 1,
          content: 'Người bán cố ý phá hoại đánh giá của người mua',
          sellerReply: {
            comment: 'Phản hồi mới cập nhật',
          },
        } as any,
        user: sellerUser,
        overrideAccess: false,
      })

      // Invariant enforces buyer content/rating preservation
      expect(tampered.rating).toBe(originalRating)
      expect(tampered.content).toBe(originalContent)
      expect(tampered.sellerReply?.comment).toBe('Phản hồi mới cập nhật')
    })

    it('strictly prevents buyer from forging sellerReply on review update', async () => {
      const reviewDoc = await payload.find({
        collection: 'reviews',
        where: {
          and: [
            { user: { equals: entitledBuyer1.id } },
            { product: { equals: testProduct.id } },
          ],
        },
        limit: 1,
        overrideAccess: true,
      })
      const review = reviewDoc.docs[0] as any
      const originalReply = review.sellerReply?.comment

      // Buyer attempts to forge sellerReply
      const updated = await payload.update({
        collection: 'reviews',
        id: review.id,
        data: {
          content: 'Người mua cập nhật lại nhận xét',
          sellerReply: {
            comment: 'GIẢ MẠO: Shop hoàn tiền 100% cho đơn hàng này!',
          },
        } as any,
        user: entitledBuyer1,
        overrideAccess: false,
      })

      // Invariant preserves the genuine seller reply
      expect(updated.sellerReply?.comment).toBe(originalReply)
      expect(updated.content).toBe('Người mua cập nhật lại nhận xét')
    })

    it('strictly prevents non-privileged user from altering moderation status on review update', async () => {
      // First, admin sets status to 'rejected'
      const reviewDoc = await payload.find({
        collection: 'reviews',
        where: {
          and: [
            { user: { equals: entitledBuyer2.id } },
            { product: { equals: testProduct.id } },
          ],
        },
        limit: 1,
        overrideAccess: true,
      })
      const review = reviewDoc.docs[0] as any

      await payload.update({
        collection: 'reviews',
        id: review.id,
        data: { status: 'rejected' },
        user: adminUser,
        overrideAccess: false,
      })

      // Buyer attempts to change status back to 'published'
      const unprivilegedUpdate = await payload.update({
        collection: 'reviews',
        id: review.id,
        data: {
          content: 'Nội dung sửa đổi nhằm bypass kiểm duyệt',
          status: 'published',
        } as any,
        user: entitledBuyer2,
        overrideAccess: false,
      })

      // Invariant preserves status as 'rejected'
      expect(unprivilegedUpdate.status).toBe('rejected')

      // Admin restores to 'published' for test suite cleanliness
      await payload.update({
        collection: 'reviews',
        id: review.id,
        data: { status: 'published' },
        user: adminUser,
        overrideAccess: false,
      })
    })

    it('Payload hook strictly enforces caller identity on create, preventing user impersonation', async () => {
      // unentitledUser attempts to create a review claiming to be entitledBuyer1
      await expect(
        payload.create({
          collection: 'reviews',
          data: {
            user: entitledBuyer1.id, // Attacker specifies victim's user ID
            product: testProduct.id,
            rating: 5,
            content: 'Nội dung cố ý mạo danh người mua khác',
          } as any,
          user: unentitledUser,
          overrideAccess: false,
        }),
      ).rejects.toThrow(/Verified purchase required|BR-05/i)
    })

    it('strictly enforces seller reply length limit (<= 5000 chars)', async () => {
      const reviewDoc = await payload.find({
        collection: 'reviews',
        where: {
          and: [
            { user: { equals: entitledBuyer1.id } },
            { product: { equals: testProduct.id } },
          ],
        },
        limit: 1,
        overrideAccess: true,
      })
      const reviewId = reviewDoc.docs[0].id

      await expect(
        payload.update({
          collection: 'reviews',
          id: reviewId,
          data: {
            sellerReply: {
              comment: 'S'.repeat(5001),
            },
          },
          user: sellerUser,
          overrideAccess: false,
        }),
      ).rejects.toThrow(/Seller reply must not exceed 5000 characters/i)
    })

    it('strictly rejects null rating on review update', async () => {
      const reviewDoc = await payload.find({
        collection: 'reviews',
        where: {
          and: [
            { user: { equals: entitledBuyer1.id } },
            { product: { equals: testProduct.id } },
          ],
        },
        limit: 1,
        overrideAccess: true,
      })
      const reviewId = reviewDoc.docs[0].id

      await expect(
        payload.update({
          collection: 'reviews',
          id: reviewId,
          data: {
            rating: null as any,
          },
          user: entitledBuyer1,
          overrideAccess: false,
        }),
      ).rejects.toThrow(/Rating must be an integer between 1 and 5/i)
    })

    it('strictly prevents unauthorized third-party user from updating a review', async () => {
      const reviewDoc = await payload.find({
        collection: 'reviews',
        where: {
          and: [
            { user: { equals: entitledBuyer1.id } },
            { product: { equals: testProduct.id } },
          ],
        },
        limit: 1,
        overrideAccess: true,
      })
      const reviewId = reviewDoc.docs[0].id

      await expect(
        payload.update({
          collection: 'reviews',
          id: reviewId,
          data: {
            content: 'Người lạ cố tình sửa đánh giá của người khác',
          },
          user: unentitledUser,
          overrideAccess: false,
        }),
      ).rejects.toThrow(/not allowed|forbidden|not found/i)
    })

    it('strictly prevents a rogue seller (not the product seller) from updating review', async () => {
      const rogueSeller = await createUser(`rogue-seller-${Date.now()}-${getSeq()}@kientaohub.local`, ['seller'])

      const reviewDoc = await payload.find({
        collection: 'reviews',
        where: {
          and: [
            { user: { equals: entitledBuyer1.id } },
            { product: { equals: testProduct.id } },
          ],
        },
        limit: 1,
        overrideAccess: true,
      })
      const reviewId = reviewDoc.docs[0].id

      await expect(
        payload.update({
          collection: 'reviews',
          id: reviewId,
          data: {
            sellerReply: {
              comment: 'Người bán mạo danh cố tình gửi phản hồi',
            },
          },
          user: rogueSeller,
          overrideAccess: false,
        }),
      ).rejects.toThrow(/not allowed|forbidden|not found|Unauthorized/i)
    })

    it('clears sellerReply comment and repliedAt timestamp when comment is updated to empty string or null', async () => {
      const reviewDoc = await payload.find({
        collection: 'reviews',
        where: {
          and: [
            { user: { equals: entitledBuyer1.id } },
            { product: { equals: testProduct.id } },
          ],
        },
        limit: 1,
        overrideAccess: true,
      })
      const reviewId = reviewDoc.docs[0].id

      const cleared = await payload.update({
        collection: 'reviews',
        id: reviewId,
        data: {
          sellerReply: {
            comment: '',
          },
        },
        user: sellerUser,
        overrideAccess: false,
      })

      expect(cleared.sellerReply?.comment).toBeNull()
      expect(cleared.sellerReply?.repliedAt).toBeNull()
    })

    it('strictly rejects non-string seller reply comment', async () => {
      const reviewDoc = await payload.find({
        collection: 'reviews',
        where: {
          and: [
            { user: { equals: entitledBuyer1.id } },
            { product: { equals: testProduct.id } },
          ],
        },
        limit: 1,
        overrideAccess: true,
      })
      const reviewId = reviewDoc.docs[0].id

      // Non-string comment
      await expect(
        payload.update({
          collection: 'reviews',
          id: reviewId,
          data: {
            sellerReply: {
              comment: 12345 as any,
            },
          },
          user: sellerUser,
          overrideAccess: false,
        }),
      ).rejects.toThrow(/Seller reply comment must be a string/i)
    })

    it('strictly prevents non-admin users from deleting reviews, while allowing admin deletion', async () => {
      const deleteBuyer = await createUser(`delete-buyer-${Date.now()}-${getSeq()}@kientaohub.local`, ['buyer'])

      const deleteEnt = await payload.create({
        collection: 'entitlements',
        data: {
          user: deleteBuyer.id,
          product: concurrencyProduct.id,
          status: 'active',
          grantedAt: new Date().toISOString(),
          downloadCount: 0,
        },
        overrideAccess: true,
      })
      cleanup.entitlements.push(deleteEnt.id)

      // Create a test review to test deletion
      const testRevDoc = await payload.create({
        collection: 'reviews',
        data: {
          user: deleteBuyer.id,
          product: concurrencyProduct.id,
          entitlement: deleteEnt.id,
          rating: 4,
          content: 'Đánh giá để kiểm tra quyền xóa của admin và buyer.',
          status: 'published',
        },
        overrideAccess: true,
      })

      // 1. Entitled buyer attempts to delete their own review -> blocked by access control
      await expect(
        payload.delete({
          collection: 'reviews',
          id: testRevDoc.id,
          user: deleteBuyer,
          overrideAccess: false,
        }),
      ).rejects.toThrow(/not allowed|forbidden/i)

      // 2. Admin deletes the review -> succeeds
      const adminDeleteResult = await payload.delete({
        collection: 'reviews',
        id: testRevDoc.id,
        user: adminUser,
        overrideAccess: false,
      })
      expect(adminDeleteResult.id).toBe(testRevDoc.id)

      // Verify document no longer exists
      const checkDoc = await payload.find({
        collection: 'reviews',
        where: { id: { equals: testRevDoc.id } },
        overrideAccess: true,
      })
      expect(checkDoc.totalDocs).toBe(0)
    })
  })

  describe('R1: Collection Access Control Boundaries', () => {
    it('Unauthenticated user cannot read pending or rejected reviews', async () => {
      // Create entitlement for buyer2 on emptyProduct first
      const entPending = await payload.create({
        collection: 'entitlements',
        data: {
          user: entitledBuyer2.id,
          product: emptyProduct.id,
          status: 'active',
          grantedAt: new Date().toISOString(),
          downloadCount: 0,
        },
        overrideAccess: true,
      })
      cleanup.entitlements.push(entPending.id)

      // Create a pending review
      const pendingReview = await payload.create({
        collection: 'reviews',
        data: {
          user: entitledBuyer2.id,
          product: emptyProduct.id,
          entitlement: entPending.id,
          rating: 3,
          content: 'Nội dung đang chờ kiểm duyệt',
          status: 'pending',
        },
        overrideAccess: true,
      })
      cleanup.reviews.push(pendingReview.id)

      // Query without overrideAccess and without user
      const guestFind = await payload.find({
        collection: 'reviews',
        where: {
          id: {
            equals: pendingReview.id,
          },
        },
        overrideAccess: false,
      })

      expect(guestFind.totalDocs).toBe(0)

      // Admin can see the pending review
      const adminFind = await payload.find({
        collection: 'reviews',
        where: {
          id: {
            equals: pendingReview.id,
          },
        },
        user: adminUser,
        overrideAccess: false,
      })

      expect(adminFind.totalDocs).toBe(1)
    })
  })
})
