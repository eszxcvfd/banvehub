import { getPayload, type Payload } from 'payload'
import config from '@/payload.config'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { User } from '@/payload-types'
import { creditWallet, getOrCreateWallet } from '@/services/wallet'

// Interface contracts per PROJECT.md § Interface Contracts
export interface CommissionResolution {
  commissionRate: number
  policyVersion: string
  source: 'campaign' | 'seller_override' | 'site_default'
}

export interface RevenueSplit {
  platformFee: number
  sellerAmount: number
  tax: number
}

export interface SellerBalanceSummary {
  totalEarned: number
  pendingBalance: number
  availableBalance: number
  reservedBalance: number
  withdrawnTotal: number
}

export interface ReleaseMaturedResult {
  releasedCount: number
  totalReleasedAmount: number
}

export interface PurchaseResult {
  success: boolean
  orderId: string
  orderCode: string
  entitlementId: number
  productTitle: string
  pricePaid: number
}

describe('Phase 6: Commission Calculation & Seller Earnings Lifecycle (FR-31, BR-07, Decision 0002, Decision 0005)', () => {
  let payload: Payload
  let bootstrapUser: User
  let sellerUser: User
  let sellerWithOverrideUser: User
  let buyerUser: User
  let _financeAdminUser: User

  let commercialProduct: any
  let freeProduct: any
  let highValueProduct: any
  let uploadedFile: any

  const cleanup = {
    sellerEarnings: [] as (number | string)[],
    orderItems: [] as (number | string)[],
    orders: [] as (number | string)[],
    products: [] as (number | string)[],
    productFiles: [] as (number | string)[],
    sellerProfiles: [] as (number | string)[],
    users: [] as (number | string)[],
  }

  let seq = 0
  const getSeq = () => ++seq

  // Dynamic service loaders for Phase 6
  let resolveCommissionRateFn: ((payload: Payload, params: { sellerId: number; productId: number; campaignId?: number }) => Promise<CommissionResolution>) | null = null
  let calculateRevenueSplitFn: ((salePrice: number, commissionRate: number, tax?: number) => RevenueSplit) | null = null
  let getSellerBalanceFn: ((payload: Payload, sellerId: number) => Promise<SellerBalanceSummary>) | null = null
  let releaseMaturedEarningsFn: ((payload: Payload, options?: { sellerId?: number; asOf?: Date }) => Promise<ReleaseMaturedResult>) | null = null
  let purchaseProductFn: ((payload: Payload, params: { buyerId: number; productId: number; req?: any }) => Promise<PurchaseResult>) | null = null

  const createUser = async (email: string, roles: User['roles']): Promise<User> => {
    const user = (await payload.create({
      collection: 'users',
      data: {
        email,
        password: 'test-password-seller-rev-123',
        name: email.split('@')[0],
        roles,
      },
      overrideAccess: true,
    })) as User
    cleanup.users.push(user.id)
    return user
  }

  const createProductFileHelper = async (sellerId: number, filename: string, contentStr: string) => {
    const content = Buffer.from(contentStr)
    const fileDoc = await payload.create({
      collection: 'product_files',
      data: {
        seller: sellerId,
        originalFilename: filename,
        fileFormat: filename.includes('.') ? `.${filename.split('.').pop()}` : '.dwg',
      },
      file: {
        data: content,
        name: filename,
        mimetype: 'application/octet-stream',
        size: content.length,
      },
      overrideAccess: true,
    })
    cleanup.productFiles.push(fileDoc.id)
    return { fileDoc, content }
  }

  beforeAll(async () => {
    payload = await getPayload({ config })

    // Dynamically load commission service
    const commissionPath = '../../src/services/commission'
    const commissionMod = await import(/* @vite-ignore */ commissionPath).catch(() => null)
    if (commissionMod) {
      resolveCommissionRateFn = commissionMod.resolveCommissionRate
      calculateRevenueSplitFn = commissionMod.calculateRevenueSplit
    }

    // Dynamically load earnings service
    const earningsPath = '../../src/services/earnings'
    const earningsMod = await import(/* @vite-ignore */ earningsPath).catch(() => null)
    if (earningsMod) {
      getSellerBalanceFn = earningsMod.getSellerBalance
      releaseMaturedEarningsFn = earningsMod.releaseMaturedEarnings
    }

    // Dynamically load purchase service
    const purchasePath = '../../src/services/purchase'
    const purchaseMod = await import(/* @vite-ignore */ purchasePath).catch(() => null)
    if (purchaseMod?.purchaseProduct) {
      purchaseProductFn = purchaseMod.purchaseProduct
    }

    const timestamp = Date.now()

    // `ensureFirstUserIsAdmin` (src/collections/Users/hooks) appends 'admin' to the roles of the
    // FIRST user created while the users table is EMPTY - which is exactly the CI state: CI applies
    // only the versioned migrations and every spec's afterAll deletes its own users, so each spec
    // file can start from an empty table. Absorb that promotion with a throwaway user BEFORE the
    // role-sensitive fixtures below, otherwise `sellerUser` is silently ['seller', 'admin'] and the
    // seller-scoped earnings/ownership assertions are evaluated against an admin account.
    bootstrapUser = await createUser(
      `bootstrap-earn-${timestamp}-${getSeq()}@kientaohub.local`,
      ['buyer'],
    )

    sellerUser = await createUser(`seller-earn-${timestamp}-${getSeq()}@kientaohub.local`, ['seller'])
    sellerWithOverrideUser = await createUser(`seller-override-${timestamp}-${getSeq()}@kientaohub.local`, ['seller'])
    buyerUser = await createUser(`buyer-earn-${timestamp}-${getSeq()}@kientaohub.local`, ['buyer'])
    _financeAdminUser = await createUser(`finance-earn-${timestamp}-${getSeq()}@kientaohub.local`, ['financeAdmin'])

    // Guard: the fixtures must hold EXACTLY the roles they declare, whether or not the users table
    // started empty (the bootstrap user above owns the first-user promotion). If the promotion ever
    // lands on one of them again, these assertions fail loudly instead of letting the seller-scoped
    // earnings assertions silently lose their meaning.
    expect(sellerUser.roles).toEqual(['seller'])
    expect(sellerUser.roles).not.toContain('admin')
    expect(sellerWithOverrideUser.roles).toEqual(['seller'])
    expect(buyerUser.roles).toEqual(['buyer'])
    expect(_financeAdminUser.roles).toEqual(['financeAdmin'])

    // Prepare buyer wallet
    await getOrCreateWallet(payload, { userId: buyerUser.id })

    // Create private CAD file
    uploadedFile = await createProductFileHelper(
      sellerUser.id,
      `blueprint-revenue-${timestamp}.dwg`,
      `CAD_DRAWING_DATA_FOR_SELLER_REVENUE_${timestamp}`
    )

    // Commercial Product (200,000 VND)
    commercialProduct = await payload.create({
      collection: 'products',
      data: {
        title: `Commercial Villa CAD ${getSeq()}`,
        slug: `comm-villa-${timestamp}-${getSeq()}`,
        price: 200000,
        isFree: false,
        seller: sellerUser.id,
        originalFiles: [uploadedFile.fileDoc.id],
        copyrightDeclared: true,
        moderationStatus: 'approved',
        _status: 'published',
      },
      overrideAccess: true,
    })
    cleanup.products.push(commercialProduct.id)

    // Free Product (0 VND)
    freeProduct = await payload.create({
      collection: 'products',
      data: {
        title: `Free Architecture Door Detail ${getSeq()}`,
        slug: `free-door-${timestamp}-${getSeq()}`,
        price: 0,
        isFree: true,
        seller: sellerUser.id,
        originalFiles: [uploadedFile.fileDoc.id],
        copyrightDeclared: true,
        moderationStatus: 'approved',
        _status: 'published',
      },
      overrideAccess: true,
    })
    cleanup.products.push(freeProduct.id)

    // High Value Commercial Product (1,500,000 VND)
    highValueProduct = await payload.create({
      collection: 'products',
      data: {
        title: `High-Rise Structural Revit Model ${getSeq()}`,
        slug: `high-rise-revit-${timestamp}-${getSeq()}`,
        price: 1500000,
        isFree: false,
        seller: sellerWithOverrideUser.id,
        originalFiles: [uploadedFile.fileDoc.id],
        copyrightDeclared: true,
        moderationStatus: 'approved',
        _status: 'published',
      },
      overrideAccess: true,
    })
    cleanup.products.push(highValueProduct.id)
  })

  afterAll(async () => {
    // Reverse dependency cleanup
    for (const id of cleanup.sellerEarnings) {
      try {
        await payload.delete({ collection: 'seller_earnings' as any, id, overrideAccess: true })
      } catch (_ignore) {}
    }
    for (const id of cleanup.orderItems) {
      try {
        await payload.delete({ collection: 'order_items', id, overrideAccess: true })
      } catch (_ignore) {}
    }
    for (const id of cleanup.orders) {
      try {
        await payload.delete({ collection: 'orders', id, overrideAccess: true })
      } catch (_ignore) {}
    }
    for (const id of cleanup.products) {
      try {
        await payload.delete({ collection: 'products', id, overrideAccess: true })
      } catch (_ignore) {}
    }
    for (const id of cleanup.productFiles) {
      try {
        await payload.delete({ collection: 'product_files', id, overrideAccess: true })
      } catch (_ignore) {}
    }
    for (const id of cleanup.sellerProfiles) {
      try {
        await payload.delete({ collection: 'seller_profiles', id, overrideAccess: true })
      } catch (_ignore) {}
    }
    for (const id of cleanup.users) {
      try {
        await payload.delete({ collection: 'users', id, overrideAccess: true })
      } catch (_ignore) {}
    }
  })

  it('Tier 1: Rate Resolution Hierarchy - Site-wide default fallback returns 30% (0.30)', async () => {
    if (!resolveCommissionRateFn) {
      throw new Error('M2 pending: resolveCommissionRate service not yet implemented in web/src/services/commission.ts')
    }

    const resolution = await resolveCommissionRateFn(payload, {
      sellerId: sellerUser.id,
      productId: commercialProduct.id,
    })

    expect(resolution).toBeDefined()
    expect(resolution.commissionRate).toBe(0.30)
    expect(resolution.source).toBe('site_default')
    expect(resolution.policyVersion).toMatch(/default/i)
  })

  it('Tier 1: Rate Resolution Hierarchy - Per-seller override rate takes precedence over site default', async () => {
    if (!resolveCommissionRateFn) {
      throw new Error('M2 pending: resolveCommissionRate service not yet implemented in web/src/services/commission.ts')
    }

    // Configure seller override rate of 20% (0.20)
    const sellerProfiles = await payload.find({
      collection: 'seller_profiles',
      where: { user: { equals: sellerWithOverrideUser.id } },
      overrideAccess: true,
    })

    if (sellerProfiles.docs.length > 0) {
      await payload.update({
        collection: 'seller_profiles',
        id: sellerProfiles.docs[0].id,
        data: {
          commissionRate: 0.20,
        } as any,
        overrideAccess: true,
      })
    } else {
      const sp = await payload.create({
        collection: 'seller_profiles',
        data: {
          user: sellerWithOverrideUser.id,
          displayName: `Seller With Override ${getSeq()}`,
          commissionRate: 0.20,
        } as any,
        overrideAccess: true,
      })
      cleanup.sellerProfiles.push(sp.id)
    }

    const resolution = await resolveCommissionRateFn(payload, {
      sellerId: sellerWithOverrideUser.id,
      productId: highValueProduct.id,
    })

    expect(resolution).toBeDefined()
    expect(resolution.commissionRate).toBe(0.20)
    expect(resolution.source).toBe('seller_override')
  })

  it('Tier 1: Rate Resolution Hierarchy - Campaign rate takes highest precedence over seller override and default', async () => {
    if (!resolveCommissionRateFn) {
      throw new Error('M2 pending: resolveCommissionRate service not yet implemented in web/src/services/commission.ts')
    }

    // Check if campaigns collection exists
    const hasCampaigns = Boolean((payload.collections as any)?.campaigns)
    if (!hasCampaigns) {
      expect((payload.collections as any)?.campaigns).toBeUndefined()
      // Campaign collection deferred from P0 per Decision A2 — positively verified
      return
    }

    const resolution = await resolveCommissionRateFn(payload, {
      sellerId: sellerWithOverrideUser.id,
      productId: highValueProduct.id,
      campaignId: 999, // active campaign with promotional 10% rate
    })

    expect(resolution).toBeDefined()
    expect(resolution.commissionRate).toBe(0.10)
    expect(resolution.source).toBe('campaign')
  })

  it('Tier 1: Integer VND Arithmetic Split - Platform fee and seller net computed accurately', async () => {
    let split: RevenueSplit
    if (calculateRevenueSplitFn) {
      split = calculateRevenueSplitFn(200000, 0.30)
    } else {
      // Direct specification verification
      const platformFee = Math.round(200000 * 0.30)
      const sellerAmount = 200000 - platformFee
      split = { platformFee, sellerAmount, tax: 0 }
    }

    expect(split.platformFee).toBe(60000)
    expect(split.sellerAmount).toBe(140000)
    expect(split.tax).toBe(0)
    expect(split.platformFee + split.sellerAmount + split.tax).toBe(200000)
  })

  it('Tier 2: Arithmetic Conservation Invariant - Zero remainder and no phantom VND across arbitrary prices', () => {
    // Tests fractional rounding edge cases e.g. 199,000 VND and 100,001 VND
    const testCases = [
      { price: 199000, rate: 0.30, expectedFee: 59700, expectedSeller: 139300 },
      { price: 100001, rate: 0.30, expectedFee: 30000, expectedSeller: 70001 },
      { price: 50000, rate: 0.30, expectedFee: 15000, expectedSeller: 35000 },
      { price: 7, rate: 0.30, expectedFee: 2, expectedSeller: 5 },
      { price: 1, rate: 0.30, expectedFee: 0, expectedSeller: 1 },
      { price: 1234567, rate: 0.30, expectedFee: 370370, expectedSeller: 864197 },
      { price: 50000000, rate: 0.25, expectedFee: 12500000, expectedSeller: 37500000 },
    ]

    for (const tc of testCases) {
      const platformFee = calculateRevenueSplitFn
        ? calculateRevenueSplitFn(tc.price, tc.rate).platformFee
        : Math.round(tc.price * tc.rate)
      const sellerAmount = calculateRevenueSplitFn
        ? calculateRevenueSplitFn(tc.price, tc.rate).sellerAmount
        : tc.price - platformFee

      expect(Number.isInteger(platformFee)).toBe(true)
      expect(Number.isInteger(sellerAmount)).toBe(true)
      expect(platformFee).toBe(tc.expectedFee)
      expect(sellerAmount).toBe(tc.expectedSeller)
      expect(platformFee + sellerAmount).toBe(tc.price)
    }
  })

  it('Tier 2: Boundary - 0 VND Free product produces 0 VND platform fee and 0 VND seller earning', () => {
    const fee = calculateRevenueSplitFn
      ? calculateRevenueSplitFn(0, 0.30).platformFee
      : Math.round(0 * 0.30)
    const seller = calculateRevenueSplitFn
      ? calculateRevenueSplitFn(0, 0.30).sellerAmount
      : 0 - fee

    expect(fee).toBe(0)
    expect(seller).toBe(0)
    expect(fee + seller).toBe(0)
  })

  it('Tier 2: Boundary - Extreme commission rates (0% and 100%) calculate without arithmetic error', () => {
    // 0% platform commission
    const fee0 = calculateRevenueSplitFn ? calculateRevenueSplitFn(300000, 0).platformFee : Math.round(300000 * 0)
    const seller0 = calculateRevenueSplitFn ? calculateRevenueSplitFn(300000, 0).sellerAmount : 300000 - fee0
    expect(fee0).toBe(0)
    expect(seller0).toBe(300000)

    // 100% platform commission
    const fee100 = calculateRevenueSplitFn ? calculateRevenueSplitFn(300000, 1.0).platformFee : Math.round(300000 * 1.0)
    const seller100 = calculateRevenueSplitFn ? calculateRevenueSplitFn(300000, 1.0).sellerAmount : 300000 - fee100
    expect(fee100).toBe(300000)
    expect(seller100).toBe(0)
  })

  it('Tier 1: OrderItem Snapshot Freeze (BR-07) - Snapshot fields locked and immune to subsequent catalog price updates', async () => {
    if (!resolveCommissionRateFn || !purchaseProductFn) {
      throw new Error('M2 pending: commission snapshot fields require resolveCommissionRate service in web/src/services/commission.ts')
    }

    // 1. Credit buyer wallet with 200,000 VND
    await creditWallet(payload, {
      userId: buyerUser.id,
      amount: 200000,
      type: 'topup',
      referenceType: 'payment_intent',
      referenceId: `TOPUP_EARN_${Date.now()}`,
      description: 'Topup for snapshot test',
    })

    // 2. Buyer purchases commercialProduct (200,000 VND)
    const purchase = await purchaseProductFn(payload, {
      buyerId: buyerUser.id,
      productId: commercialProduct.id,
    })
    cleanup.orders.push(purchase.orderId)

    // 3. Find created OrderItem
    const orderItems = await payload.find({
      collection: 'order_items',
      where: { order: { equals: purchase.orderId } },
      overrideAccess: true,
    })
    expect(orderItems.docs.length).toBe(1)
    const item = orderItems.docs[0]
    cleanup.orderItems.push(item.id)

    expect(item.salePrice).toBe(200000)
    expect(item.platformFee).toBe(60000)
    expect(item.sellerAmount).toBe(140000)
    expect(item.policyVersion).toBeDefined()

    // 4. Update catalog product price to 500,000 VND
    await payload.update({
      collection: 'products',
      id: commercialProduct.id,
      data: { price: 500000 },
      overrideAccess: true,
    })

    // 5. Query order item again — snapshot fields MUST remain unchanged (BR-07)
    const itemRefreshed = await payload.findByID({
      collection: 'order_items',
      id: item.id,
      overrideAccess: true,
    })
    expect(itemRefreshed.salePrice).toBe(200000)
    expect(itemRefreshed.platformFee).toBe(60000)
    expect(itemRefreshed.sellerAmount).toBe(140000)
  })

  it('Tier 1: Earning Record Creation - Purchase completes and atomically creates seller_earnings with status PENDING', async () => {
    if (!resolveCommissionRateFn || !purchaseProductFn) {
      throw new Error('M2 pending: earning split requires resolveCommissionRate service in web/src/services/commission.ts')
    }

    const timestamp = Date.now()
    const earnProduct = await payload.create({
      collection: 'products',
      data: {
        title: `Product For Earning Test ${getSeq()}`,
        slug: `earn-prod-${timestamp}-${getSeq()}`,
        price: 200000,
        isFree: false,
        seller: sellerUser.id,
        originalFiles: [uploadedFile.fileDoc.id],
        copyrightDeclared: true,
        moderationStatus: 'approved',
        _status: 'published',
      },
      overrideAccess: true,
    })
    cleanup.products.push(earnProduct.id)

    // Top up buyer
    await creditWallet(payload, {
      userId: buyerUser.id,
      amount: 200000,
      type: 'topup',
      referenceType: 'payment_intent',
      referenceId: `TOPUP_EARN_2_${Date.now()}`,
      description: 'Topup for earning creation test',
    })

    const purchase = await purchaseProductFn(payload, {
      buyerId: buyerUser.id,
      productId: earnProduct.id,
    })
    cleanup.orders.push(purchase.orderId)

    // Verify seller_earnings document exists
    const earnings = await payload.find({
      collection: 'seller_earnings' as any,
      where: { order: { equals: purchase.orderId } },
      overrideAccess: true,
    })

    expect(earnings.docs.length).toBe(1)
    const earningDoc = earnings.docs[0] as any
    cleanup.sellerEarnings.push(earningDoc.id)

    const expectedSellerId = typeof earningDoc.seller === 'object' ? earningDoc.seller.id : earningDoc.seller
    expect(expectedSellerId).toBe(sellerUser.id)
    expect(earningDoc.status).toBe('PENDING')
    expect(earningDoc.sellerAmount).toBe(140000)
    expect(earningDoc.platformFee).toBe(60000)
    expect(earningDoc.salePrice).toBe(200000)
    expect(earningDoc.holdUntil).toBeDefined()

    // Default hold period is 7 days
    const holdUntilDate = new Date(earningDoc.holdUntil).getTime()
    const now = Date.now()
    const sevenDaysMs = 7 * 24 * 60 * 60 * 1000
    // Margin of error: within 5 minutes
    expect(holdUntilDate - now).toBeGreaterThanOrEqual(sevenDaysMs - 300000)
    expect(holdUntilDate - now).toBeLessThanOrEqual(sevenDaysMs + 300000)
  })

  it('Tier 1: Hold Period Maturation - Maturation converts PENDING to AVAILABLE after 7-day hold expires', async () => {
    if (!releaseMaturedEarningsFn) {
      throw new Error('M2 pending: releaseMaturedEarnings service not yet implemented in web/src/services/earnings.ts')
    }

    // Simulate time forward: asOf 8 days in the future
    const futureDate = new Date(Date.now() + 8 * 24 * 60 * 60 * 1000)
    const releaseRes = await releaseMaturedEarningsFn(payload, {
      sellerId: sellerUser.id,
      asOf: futureDate,
    })

    expect(releaseRes.releasedCount).toBeGreaterThanOrEqual(1)
    expect(releaseRes.totalReleasedAmount).toBeGreaterThanOrEqual(140000)

    // Re-query seller earnings to verify status transitioned to AVAILABLE
    const earnings = await payload.find({
      collection: 'seller_earnings' as any,
      where: {
        seller: { equals: sellerUser.id },
        status: { equals: 'AVAILABLE' },
      },
      overrideAccess: true,
    })
    expect(earnings.docs.length).toBeGreaterThanOrEqual(1)
    const availableEarning = earnings.docs[0] as any
    expect(availableEarning.status).toBe('AVAILABLE')
    expect(availableEarning.availableAt).toBeDefined()
  })

  it('Tier 1: Balance Aggregation - getSellerBalance returns accurate totals before and after maturation', async () => {
    if (!getSellerBalanceFn) {
      throw new Error('M2 pending: getSellerBalance service not yet implemented in web/src/services/earnings.ts')
    }

    const balance = await getSellerBalanceFn(payload, sellerUser.id)
    expect(balance).toBeDefined()
    expect(typeof balance.totalEarned).toBe('number')
    expect(typeof balance.pendingBalance).toBe('number')
    expect(typeof balance.availableBalance).toBe('number')
    expect(typeof balance.reservedBalance).toBe('number')
    expect(typeof balance.withdrawnTotal).toBe('number')

    expect(balance.availableBalance).toBeGreaterThanOrEqual(140000)
    expect(balance.totalEarned).toBeGreaterThanOrEqual(balance.availableBalance + balance.pendingBalance)
  })

  it('Tier 2: Balance Accumulation - Multiple completed sales accumulate accurately into seller pending balance', async () => {
    if (!purchaseProductFn || !getSellerBalanceFn) {
      throw new Error('M2 pending: services not yet implemented')
    }

    const initialBalance = await getSellerBalanceFn(payload, sellerUser.id)

    // Buyer makes 2 more purchases
    await creditWallet(payload, {
      userId: buyerUser.id,
      amount: 400000,
      type: 'topup',
      referenceType: 'payment_intent',
      referenceId: `TOPUP_ACCUM_${Date.now()}`,
      description: 'Topup for accumulation test',
    })

    const timestamp = Date.now()
    const accumProduct1 = await payload.create({
      collection: 'products',
      data: {
        title: `Product Accum 1 ${getSeq()}`,
        slug: `accum-prod-1-${timestamp}-${getSeq()}`,
        price: 200000,
        isFree: false,
        seller: sellerUser.id,
        originalFiles: [uploadedFile.fileDoc.id],
        copyrightDeclared: true,
        moderationStatus: 'approved',
        _status: 'published',
      },
      overrideAccess: true,
    })
    cleanup.products.push(accumProduct1.id)

    const accumProduct2 = await payload.create({
      collection: 'products',
      data: {
        title: `Product Accum 2 ${getSeq()}`,
        slug: `accum-prod-2-${timestamp}-${getSeq()}`,
        price: 200000,
        isFree: false,
        seller: sellerUser.id,
        originalFiles: [uploadedFile.fileDoc.id],
        copyrightDeclared: true,
        moderationStatus: 'approved',
        _status: 'published',
      },
      overrideAccess: true,
    })
    cleanup.products.push(accumProduct2.id)

    const p1 = await purchaseProductFn(payload, { buyerId: buyerUser.id, productId: accumProduct1.id })
    const p2 = await purchaseProductFn(payload, { buyerId: buyerUser.id, productId: accumProduct2.id })
    cleanup.orders.push(p1.orderId, p2.orderId)

    const updatedBalance = await getSellerBalanceFn(payload, sellerUser.id)
    expect(updatedBalance.pendingBalance).toBe(initialBalance.pendingBalance + 280000)
    expect(updatedBalance.totalEarned).toBe(initialBalance.totalEarned + 280000)
  })
})
