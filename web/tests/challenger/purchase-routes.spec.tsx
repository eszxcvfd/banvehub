import { describe, it, expect, vi, beforeEach } from 'vitest'
import { GET as getEntitlements } from '@/app/api/v1/me/entitlements/route'
import { POST as postDownloadToken } from '@/app/api/v1/downloads/token/route'
import { POST as postPurchase } from '@/app/api/v1/orders/purchase/route'
import {
  ProductNotAvailableError,
  ProductNotFoundError,
  SelfPurchaseForbiddenError,
  AlreadyOwnedError,
} from '@/services/purchase'
import { InsufficientFundsError } from '@/services/wallet'

// Mock payload
const mockAuth = vi.fn()
const mockFind = vi.fn()
const mockFindByID = vi.fn()

vi.mock('payload', () => ({
  getPayload: vi.fn(async () => ({
    auth: mockAuth,
    find: mockFind,
    findByID: mockFindByID,
  })),
}))

vi.mock('@payload-config', () => ({
  default: {},
}))

vi.mock('next/headers', () => ({
  headers: vi.fn(async () => new Headers()),
}))

const mockCreateDownloadToken = vi.fn()
vi.mock('@/services/download', () => ({
  createDownloadToken: (...args: any[]) => mockCreateDownloadToken(...args),
  EntitlementRequiredError: class EntitlementRequiredError extends Error {
    readonly statusCode = 403
    constructor(message = 'Active entitlement required') {
      super(message)
      this.name = 'EntitlementRequiredError'
    }
  },
  UnauthorizedError: class UnauthorizedError extends Error {
    readonly statusCode = 401
    constructor(message = 'Unauthorized') {
      super(message)
      this.name = 'UnauthorizedError'
    }
  },
  ForbiddenError: class ForbiddenError extends Error {
    readonly statusCode = 403
    constructor(message = 'Forbidden') {
      super(message)
      this.name = 'ForbiddenError'
    }
  },
  InvalidTokenError: class InvalidTokenError extends Error {
    readonly statusCode = 400
    constructor(message = 'Invalid token') {
      super(message)
      this.name = 'InvalidTokenError'
    }
  },
}))

const mockPurchaseProduct = vi.fn()
vi.mock('@/services/purchase', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/services/purchase')>()
  return {
    ...actual,
    purchaseProduct: (...args: any[]) => mockPurchaseProduct(...args),
  }
})

describe('Purchase & Download Token Route Handlers Edge Cases', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('GET /api/v1/me/entitlements', () => {
    it('returns unauthenticated state gracefully for guests', async () => {
      mockAuth.mockResolvedValueOnce({ user: null })

      const req = new Request('http://localhost:3000/api/v1/me/entitlements')
      const res = await getEntitlements(req)
      const data = await res.json()

      expect(res.status).toBe(200)
      expect(data.isAuthenticated).toBe(false)
      expect(data.hasEntitlement).toBe(false)
      expect(data.docs).toEqual([])
    })

    it('returns 400 INVALID_REQUEST when productId is invalid string', async () => {
      mockAuth.mockResolvedValueOnce({ user: { id: 1 } })

      const req = new Request('http://localhost:3000/api/v1/me/entitlements?productId=abc')
      const res = await getEntitlements(req)
      const data = await res.json()

      expect(res.status).toBe(400)
      expect(data.error).toBe('INVALID_REQUEST')
    })

    it('returns 400 INVALID_REQUEST when productId is <= 0', async () => {
      mockAuth.mockResolvedValueOnce({ user: { id: 1 } })

      const req = new Request('http://localhost:3000/api/v1/me/entitlements?productId=-5')
      const res = await getEntitlements(req)
      const data = await res.json()

      expect(res.status).toBe(400)
      expect(data.error).toBe('INVALID_REQUEST')
    })

    it('returns 400 INVALID_REQUEST when productId contains partial alphabetic text', async () => {
      mockAuth.mockResolvedValueOnce({ user: { id: 1 } })

      const req = new Request('http://localhost:3000/api/v1/me/entitlements?productId=10abc')
      const res = await getEntitlements(req)
      const data = await res.json()

      expect(res.status).toBe(400)
      expect(data.error).toBe('INVALID_REQUEST')
    })

    it('returns 400 INVALID_REQUEST when productId is float', async () => {
      mockAuth.mockResolvedValueOnce({ user: { id: 1 } })

      const req = new Request('http://localhost:3000/api/v1/me/entitlements?productId=10.5')
      const res = await getEntitlements(req)
      const data = await res.json()

      expect(res.status).toBe(400)
      expect(data.error).toBe('INVALID_REQUEST')
    })

    it('filters strictly by productId when valid', async () => {
      mockAuth.mockResolvedValueOnce({ user: { id: 1 } })
      mockFind.mockResolvedValueOnce({
        totalDocs: 1,
        docs: [
          {
            id: 101,
            product: { id: 42 },
            status: 'active',
            grantedAt: '2026-01-01',
            downloadCount: 3,
          },
        ],
      })

      const req = new Request('http://localhost:3000/api/v1/me/entitlements?productId=42')
      const res = await getEntitlements(req)
      const data = await res.json()

      expect(res.status).toBe(200)
      expect(data.hasEntitlement).toBe(true)
      expect(data.docs.length).toBe(1)
      expect(data.docs[0].productId).toBe(42)

      // Verify query condition had product: { equals: 42 }
      expect(mockFind).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            and: expect.arrayContaining([
              { product: { equals: 42 } },
            ]),
          },
        })
      )
    })
  })

  describe('POST /api/v1/downloads/token', () => {
    it('returns 401 when user is not authenticated', async () => {
      mockAuth.mockResolvedValueOnce({ user: null })

      const req = new Request('http://localhost:3000/api/v1/downloads/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productId: 10 }),
      })

      const res = await postDownloadToken(req)
      const data = await res.json()

      expect(res.status).toBe(401)
      expect(data.error).toBe('UNAUTHORIZED')
    })

    it('returns 400 when productId is missing', async () => {
      mockAuth.mockResolvedValueOnce({ user: { id: 1 } })

      const req = new Request('http://localhost:3000/api/v1/downloads/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })

      const res = await postDownloadToken(req)
      const data = await res.json()

      expect(res.status).toBe(400)
      expect(data.error).toBe('INVALID_REQUEST')
    })

    it('returns 404 when product does not exist in DB', async () => {
      mockAuth.mockResolvedValueOnce({ user: { id: 1 } })
      const { EntitlementRequiredError } = await import('@/services/download')
      mockCreateDownloadToken.mockRejectedValueOnce(new EntitlementRequiredError())
      mockFindByID.mockResolvedValueOnce(null) // Product not found

      const req = new Request('http://localhost:3000/api/v1/downloads/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productId: 99999 }),
      })

      const res = await postDownloadToken(req)
      const data = await res.json()

      expect(res.status).toBe(404)
      expect(data.error).toBe('PRODUCT_NOT_FOUND')
    })

    it('returns 400 PRODUCT_NOT_AVAILABLE when free product is unapproved', async () => {
      mockAuth.mockResolvedValueOnce({ user: { id: 1 } })
      const { EntitlementRequiredError } = await import('@/services/download')
      mockCreateDownloadToken.mockRejectedValueOnce(new EntitlementRequiredError())
      mockFindByID.mockResolvedValueOnce({
        id: 10,
        isFree: true,
        price: 0,
        _status: 'draft',
        moderationStatus: 'pending',
      })
      mockPurchaseProduct.mockRejectedValueOnce(
        new ProductNotAvailableError(10, 'draft', 'pending')
      )

      const req = new Request('http://localhost:3000/api/v1/downloads/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productId: 10 }),
      })

      const res = await postDownloadToken(req)
      const data = await res.json()

      expect(res.status).toBe(400)
      expect(data.error).toBe('PRODUCT_NOT_AVAILABLE')
    })

    it('returns 400 SELF_PURCHASE_FORBIDDEN when seller tries to auto-enroll free product', async () => {
      mockAuth.mockResolvedValueOnce({ user: { id: 42 } })
      const { EntitlementRequiredError } = await import('@/services/download')
      mockCreateDownloadToken.mockRejectedValueOnce(new EntitlementRequiredError())
      mockFindByID.mockResolvedValueOnce({
        id: 10,
        isFree: true,
        price: 0,
        seller: 42,
      })
      mockPurchaseProduct.mockRejectedValueOnce(
        new SelfPurchaseForbiddenError(42, 42)
      )

      const req = new Request('http://localhost:3000/api/v1/downloads/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productId: 10 }),
      })

      const res = await postDownloadToken(req)
      const data = await res.json()

      expect(res.status).toBe(400)
      expect(data.error).toBe('SELF_PURCHASE_FORBIDDEN')
    })

    it('returns 400 INVALID_REQUEST when productId is a boolean or float', async () => {
      mockAuth.mockResolvedValueOnce({ user: { id: 1 } })

      const reqBool = new Request('http://localhost:3000/api/v1/downloads/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productId: true }),
      })
      const resBool = await postDownloadToken(reqBool)
      const dataBool = await resBool.json()

      expect(resBool.status).toBe(400)
      expect(dataBool.error).toBe('INVALID_REQUEST')

      mockAuth.mockResolvedValueOnce({ user: { id: 1 } })
      const reqFloat = new Request('http://localhost:3000/api/v1/downloads/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productId: 1.5 }),
      })
      const resFloat = await postDownloadToken(reqFloat)
      const dataFloat = await resFloat.json()

      expect(resFloat.status).toBe(400)
      expect(dataFloat.error).toBe('INVALID_REQUEST')
    })

    it('coerces string user.id to integer and generates token successfully', async () => {
      mockAuth.mockResolvedValueOnce({ user: { id: '42' } })
      mockCreateDownloadToken.mockResolvedValueOnce({
        token: 'token-xyz',
        downloadUrl: '/api/v1/downloads/token-xyz',
      })

      const req = new Request('http://localhost:3000/api/v1/downloads/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productId: 10 }),
      })

      const res = await postDownloadToken(req)
      const data = await res.json()

      expect(res.status).toBe(200)
      expect(data.success).toBe(true)
      expect(mockCreateDownloadToken).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ userId: 42, productId: 10 })
      )
    })
  })

  describe('POST /api/v1/orders/purchase', () => {
    it('returns 401 UNAUTHORIZED when user is not logged in', async () => {
      mockAuth.mockResolvedValueOnce({ user: null })

      const req = new Request('http://localhost:3000/api/v1/orders/purchase', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productId: 10 }),
      })

      const res = await postPurchase(req)
      const data = await res.json()

      expect(res.status).toBe(401)
      expect(data.error).toBe('UNAUTHORIZED')
    })

    it('returns 400 INVALID_REQUEST when productId is missing', async () => {
      mockAuth.mockResolvedValueOnce({ user: { id: 1 } })

      const req = new Request('http://localhost:3000/api/v1/orders/purchase', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })

      const res = await postPurchase(req)
      const data = await res.json()

      expect(res.status).toBe(400)
      expect(data.error).toBe('INVALID_REQUEST')
    })

    it('returns 400 INVALID_REQUEST when productId is a float or boolean or malformed string', async () => {
      mockAuth.mockResolvedValueOnce({ user: { id: 1 } })

      const reqFloat = new Request('http://localhost:3000/api/v1/orders/purchase', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productId: 10.5 }),
      })
      const resFloat = await postPurchase(reqFloat)
      const dataFloat = await resFloat.json()

      expect(resFloat.status).toBe(400)
      expect(dataFloat.error).toBe('INVALID_REQUEST')

      mockAuth.mockResolvedValueOnce({ user: { id: 1 } })
      const reqMalformed = new Request('http://localhost:3000/api/v1/orders/purchase', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productId: '10abc' }),
      })
      const resMalformed = await postPurchase(reqMalformed)
      const dataMalformed = await resMalformed.json()

      expect(resMalformed.status).toBe(400)
      expect(dataMalformed.error).toBe('INVALID_REQUEST')

      mockAuth.mockResolvedValueOnce({ user: { id: 1 } })
      const reqBool = new Request('http://localhost:3000/api/v1/orders/purchase', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productId: true }),
      })
      const resBool = await postPurchase(reqBool)
      const dataBool = await resBool.json()

      expect(resBool.status).toBe(400)
      expect(dataBool.error).toBe('INVALID_REQUEST')
    })

    it('returns 400 INSUFFICIENT_FUNDS with balance and required shortfall details', async () => {
      mockAuth.mockResolvedValueOnce({ user: { id: 1 } })
      mockPurchaseProduct.mockRejectedValueOnce(new InsufficientFundsError(20000, 100000))

      const req = new Request('http://localhost:3000/api/v1/orders/purchase', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productId: 10 }),
      })

      const res = await postPurchase(req)
      const data = await res.json()

      expect(res.status).toBe(400)
      expect(data.error).toBe('INSUFFICIENT_FUNDS')
      expect(data.required).toBe(100000)
      expect(data.balance).toBe(20000)
    })

    it('returns 409 ALREADY_OWNED when buyer already owns entitlement', async () => {
      mockAuth.mockResolvedValueOnce({ user: { id: 1 } })
      mockPurchaseProduct.mockRejectedValueOnce(new AlreadyOwnedError(1, 10, 555))

      const req = new Request('http://localhost:3000/api/v1/orders/purchase', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productId: 10 }),
      })

      const res = await postPurchase(req)
      const data = await res.json()

      expect(res.status).toBe(409)
      expect(data.error).toBe('ALREADY_OWNED')
      expect(data.entitlementId).toBe(555)
    })

    it('returns 400 SELF_PURCHASE_FORBIDDEN when author attempts self-purchase', async () => {
      mockAuth.mockResolvedValueOnce({ user: { id: 42 } })
      mockPurchaseProduct.mockRejectedValueOnce(new SelfPurchaseForbiddenError(42, 10))

      const req = new Request('http://localhost:3000/api/v1/orders/purchase', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productId: 10 }),
      })

      const res = await postPurchase(req)
      const data = await res.json()

      expect(res.status).toBe(400)
      expect(data.error).toBe('SELF_PURCHASE_FORBIDDEN')
    })

    it('normalizes string user.id to integer and processes purchase successfully', async () => {
      mockAuth.mockResolvedValueOnce({ user: { id: '99' } })
      mockPurchaseProduct.mockResolvedValueOnce({
        success: true,
        orderId: 'ORD-99',
        orderCode: 'ORD-2026-99',
        entitlementId: 777,
        productTitle: 'Revit Villa',
        pricePaid: 250000,
      })

      const req = new Request('http://localhost:3000/api/v1/orders/purchase', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productId: 10 }),
      })

      const res = await postPurchase(req)
      const data = await res.json()

      expect(res.status).toBe(200)
      expect(data.success).toBe(true)
      expect(mockPurchaseProduct).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ buyerId: 99, productId: 10 })
      )
    })
  })
})
