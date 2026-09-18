import { getPayload, type Payload } from 'payload'
import config from '@/payload.config'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { User, Wallet } from '@/payload-types'
import { creditWallet, getOrCreateWallet } from '@/services/wallet'

// Interface contracts per PROJECT.md
export interface PurchaseResult {
  success: boolean
  orderId: string
  orderCode: string
  entitlementId: number
  productTitle: string
  pricePaid: number
}

export interface SellerBalanceSummary {
  totalEarned: number
  pendingBalance: number
  availableBalance: number
  reservedBalance: number
  withdrawnTotal: number
}

export interface WithdrawalResult {
  id: number
  code: string
  amount: number
  status: string
}

export interface RefundResult {
  refundId: number
  orderId: number
  buyerId: number
  amountRefunded: number
  reversalLedgerEntryId?: number
  entitlementRevoked: boolean
  status: string
}

describe('Phase 6: Multi-Actor Revenue Lifecycle & RBAC Matrix (FLOW-U12, FLOW-U13, FLOW-U15, §5.5, §22)', () => {
  let payload: Payload

  // Principals
  let bootstrapUser: User
  let buyer1: User
  let seller1: User
  let seller2: User
  let moderator1: User
  let financeAdmin1: User
  let _admin1: User

  let product1: any
  let product2: any
  let uploadedFile: any
  let _buyer1Wallet: Wallet

  const cleanup = {
    refunds: [] as (number | string)[],
    withdrawalEvents: [] as (number | string)[],
    withdrawals: [] as (number | string)[],
    sellerEarnings: [] as (number | string)[],
    entitlements: [] as (number | string)[],
    orderItems: [] as (number | string)[],
    orders: [] as (number | string)[],
    products: [] as (number | string)[],
    productFiles: [] as (number | string)[],
    users: [] as (number | string)[],
  }

  let seq = 0
  const getSeq = () => ++seq

  // Dynamic service loaders
  let purchaseProductFn: ((payload: Payload, params: { buyerId: number; productId: number; req?: any }) => Promise<PurchaseResult>) | null = null
  let getSellerBalanceFn: ((payload: Payload, sellerId: number) => Promise<SellerBalanceSummary>) | null = null
  let releaseMaturedEarningsFn: ((payload: Payload, options?: { sellerId?: number; asOf?: Date }) => Promise<{ releasedCount: number; totalReleasedAmount: number }>) | null = null
  let requestWithdrawalFn: ((payload: Payload, params: any) => Promise<WithdrawalResult>) | null = null
  let reviewWithdrawalFn: ((payload: Payload, params: any) => Promise<WithdrawalResult>) | null = null
  let approveWithdrawalFn: ((payload: Payload, params: any) => Promise<WithdrawalResult>) | null = null
  let processWithdrawalFn: ((payload: Payload, params: any) => Promise<WithdrawalResult>) | null = null
  let finalizeWithdrawalPaidFn: ((payload: Payload, params: any) => Promise<WithdrawalResult>) | null = null
  let rejectWithdrawalFn: ((payload: Payload, params: any) => Promise<WithdrawalResult>) | null = null
  let processRefundFn: ((payload: Payload, params: any) => Promise<RefundResult>) | null = null

  // Dynamic route loaders
  let sellerEarningsRoute: any = null
  let sellerWithdrawalsRoute: any = null
  let adminWithdrawalsRoute: any = null
  let adminApproveRoute: any = null
  let adminRejectRoute: any = null
  let adminRefundRoute: any = null

  const createUser = async (email: string, roles: User['roles']): Promise<User> => {
    const user = (await payload.create({
      collection: 'users',
      data: {
        email,
        password: 'test-password-e2e-123',
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

    // Dynamically load services via path variables
    const purchasePath = '../../src/services/purchase'
    const purchaseMod = await import(/* @vite-ignore */ purchasePath).catch(() => null)
    if (purchaseMod?.purchaseProduct) purchaseProductFn = purchaseMod.purchaseProduct

    const earningsPath = '../../src/services/earnings'
    const earningsMod = await import(/* @vite-ignore */ earningsPath).catch(() => null)
    if (earningsMod) {
      getSellerBalanceFn = earningsMod.getSellerBalance
      releaseMaturedEarningsFn = earningsMod.releaseMaturedEarnings
    }

    const withdrawalPath = '../../src/services/withdrawal'
    const withdrawalMod = await import(/* @vite-ignore */ withdrawalPath).catch(() => null)
    if (withdrawalMod) {
      requestWithdrawalFn = withdrawalMod.requestWithdrawal
      reviewWithdrawalFn = withdrawalMod.reviewWithdrawal
      approveWithdrawalFn = withdrawalMod.approveWithdrawal
      processWithdrawalFn = withdrawalMod.processWithdrawal
      finalizeWithdrawalPaidFn = withdrawalMod.finalizeWithdrawalPaid
      rejectWithdrawalFn = withdrawalMod.rejectWithdrawal
    }

    const refundPath = '../../src/services/refund'
    const refundMod = await import(/* @vite-ignore */ refundPath).catch(() => null)
    if (refundMod) processRefundFn = refundMod.processRefund

    // Dynamically load route handlers via path variables
    const sellerEarningsRoutePath = '../../src/app/api/v1/seller/earnings/route'
    sellerEarningsRoute = await import(/* @vite-ignore */ sellerEarningsRoutePath).catch(() => null)

    const sellerWithdrawalsRoutePath = '../../src/app/api/v1/seller/withdrawals/route'
    sellerWithdrawalsRoute = await import(/* @vite-ignore */ sellerWithdrawalsRoutePath).catch(() => null)

    const adminWithdrawalsRoutePath = '../../src/app/api/v1/admin/withdrawals/route'
    adminWithdrawalsRoute = await import(/* @vite-ignore */ adminWithdrawalsRoutePath).catch(() => null)

    const adminApproveRoutePath = '../../src/app/api/v1/admin/withdrawals/[id]/approve/route'
    adminApproveRoute = await import(/* @vite-ignore */ adminApproveRoutePath).catch(() => null)

    const adminRejectRoutePath = '../../src/app/api/v1/admin/withdrawals/[id]/reject/route'
    adminRejectRoute = await import(/* @vite-ignore */ adminRejectRoutePath).catch(() => null)

    const adminRefundRoutePath = '../../src/app/api/v1/admin/refunds/route'
    adminRefundRoute = await import(/* @vite-ignore */ adminRefundRoutePath).catch(() => null)

    const timestamp = Date.now()

    // `ensureFirstUserIsAdmin` (src/collections/Users/hooks) appends 'admin' to the roles of the
    // FIRST user created while the users table is EMPTY - which is exactly the CI state: CI applies
    // only the versioned migrations and every spec's afterAll deletes its own users, so each spec
    // file can start from an empty table. Absorb that promotion with a throwaway user BEFORE the
    // role-sensitive fixtures below. Without it `buyer1` is silently ['buyer', 'admin'] and the
    // "Buyer cannot approve withdrawal" / "Buyer cannot initiate refund" RBAC assertions below
    // never reach the authorization branch they claim to test (the role gate lets the buyer
    // through and the assertion only sees a downstream "Not Found").
    bootstrapUser = await createUser(
      `bootstrap-e2e-${timestamp}-${getSeq()}@kientaohub.local`,
      ['buyer'],
    )

    buyer1 = await createUser(`buyer1-e2e-${timestamp}-${getSeq()}@kientaohub.local`, ['buyer'])
    seller1 = await createUser(`seller1-e2e-${timestamp}-${getSeq()}@kientaohub.local`, ['seller'])
    seller2 = await createUser(`seller2-e2e-${timestamp}-${getSeq()}@kientaohub.local`, ['seller'])
    moderator1 = await createUser(`mod1-e2e-${timestamp}-${getSeq()}@kientaohub.local`, ['moderator'])
    financeAdmin1 = await createUser(`fin1-e2e-${timestamp}-${getSeq()}@kientaohub.local`, ['financeAdmin'])
    _admin1 = await createUser(`admin1-e2e-${timestamp}-${getSeq()}@kientaohub.local`, ['admin'])

    // Guard: the RBAC principals must hold EXACTLY the roles they declare, whether or not the users
    // table started empty (the bootstrap user above owns the first-user promotion). If the
    // promotion ever lands on one of them again, these assertions fail loudly instead of letting
    // the RBAC matrix silently lose its meaning.
    expect(buyer1.roles).toEqual(['buyer'])
    expect(buyer1.roles).not.toContain('admin')
    expect(seller1.roles).toEqual(['seller'])
    expect(seller1.roles).not.toContain('admin')
    expect(seller2.roles).toEqual(['seller'])
    expect(moderator1.roles).toEqual(['moderator'])
    expect(financeAdmin1.roles).toEqual(['financeAdmin'])
    expect(_admin1.roles).toEqual(['admin'])

    _buyer1Wallet = await getOrCreateWallet(payload, { userId: buyer1.id })

    uploadedFile = await createProductFileHelper(
      seller1.id,
      `blueprint-e2e-${timestamp}.dwg`,
      `CAD_DRAWING_DATA_FOR_E2E_${timestamp}`
    )

    // Product 1 (200,000 VND)
    product1 = await payload.create({
      collection: 'products',
      data: {
        title: `Villa Master Plan CAD ${getSeq()}`,
        slug: `villa-master-${timestamp}-${getSeq()}`,
        price: 200000,
        isFree: false,
        seller: seller1.id,
        originalFiles: [uploadedFile.fileDoc.id],
        copyrightDeclared: true,
        moderationStatus: 'approved',
        _status: 'published',
      },
      overrideAccess: true,
    })
    cleanup.products.push(product1.id)

    // Product 2 (100,000 VND)
    product2 = await payload.create({
      collection: 'products',
      data: {
        title: `Interior CAD Detail ${getSeq()}`,
        slug: `interior-detail-${timestamp}-${getSeq()}`,
        price: 100000,
        isFree: false,
        seller: seller1.id,
        originalFiles: [uploadedFile.fileDoc.id],
        copyrightDeclared: true,
        moderationStatus: 'approved',
        _status: 'published',
      },
      overrideAccess: true,
    })
    cleanup.products.push(product2.id)
  })

  afterAll(async () => {
    // F1-class cleanup regression (same class as reviews.int.spec.ts). The real `purchaseProduct()`
    // call creates `order_items` and `seller_earnings` rows that this spec never tracks by id, and
    // both tables hold NOT NULL foreign keys to `orders` / `products` / `users` declared as ON
    // DELETE SET NULL - so the parent deletes were aborted and every run left 2 users / 2 orders /
    // 2 order_items / 2 seller_earnings / 2 products behind on the shared test database. Resolve the
    // untracked rows through the orders this spec owns, leaf-first:
    // seller_earnings -> entitlements -> order_items -> orders -> products -> product_files -> users.
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

    // Reverse dependency cleanup
    for (const id of cleanup.refunds) {
      try {
        await payload.delete({ collection: 'refunds' as any, id, overrideAccess: true })
      } catch (_ignore) {}
    }
    for (const id of cleanup.withdrawalEvents) {
      try {
        await payload.delete({ collection: 'withdrawal_events' as any, id, overrideAccess: true })
      } catch (_ignore) {}
    }
    for (const id of cleanup.withdrawals) {
      try {
        await payload.delete({ collection: 'withdrawals' as any, id, overrideAccess: true })
      } catch (_ignore) {}
    }
    // seller_earnings.order_id / .order_item_id / .product_id are NOT NULL -> must go first.
    await deleteByOrder('seller_earnings', cleanup.orders)
    for (const id of cleanup.sellerEarnings) {
      try {
        await payload.delete({ collection: 'seller_earnings' as any, id, overrideAccess: true })
      } catch (_ignore) {}
    }
    await deleteByOrder('entitlements', cleanup.orders)
    for (const id of cleanup.entitlements) {
      try {
        await payload.delete({ collection: 'entitlements', id, overrideAccess: true })
      } catch (_ignore) {}
    }
    // order_items.order_id / .product_id / .seller_id are NOT NULL -> before orders and products.
    await deleteByOrder('order_items', cleanup.orders)
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
    for (const id of cleanup.users) {
      try {
        await payload.delete({ collection: 'users', id, overrideAccess: true })
      } catch (_ignore) {}
    }

    // R5 hardening: assert by CONTENT table, not only by user. A user-centric check alone exempts
    // the wallet-bound buyer (whose user row is legitimately undeletable), so a leak living inside
    // that buyer's own rows would slip through. These are the spec's OWN rows.
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

    expect(await countOwned('orders', { id: { in: cleanup.orders } })).toBe(0)
    expect(await countOwned('order_items', { order: { in: cleanup.orders } })).toBe(0)
    expect(await countOwned('seller_earnings', { order: { in: cleanup.orders } })).toBe(0)
    expect(await countOwned('entitlements', { user: { in: cleanup.users } })).toBe(0)
    expect(await countOwned('products', { id: { in: cleanup.products } })).toBe(0)
    expect(await countOwned('refunds', { buyer: { in: cleanup.users } })).toBe(0)

    // Any remaining fixture user must own a `wallets` row: `wallets.user_id` is NOT NULL and the DB
    // triggers forbid_wallet_delete / forbid_ledger_mutation (Decision 0002 / BR-03) make wallet
    // rows undeletable, so their owners can never be removed. BR-03 is NEVER bypassed; any other
    // survivor is a real cleanup regression and fails loudly here.
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

  it('Tier 1 & 4: Full Multi-Actor E2E Lifecycle (Buyer top-up -> Purchase -> Hold Maturation -> Withdrawal Request -> Finance Review & Approval -> Payout)', async () => {
    if (
      !purchaseProductFn ||
      !getSellerBalanceFn ||
      !releaseMaturedEarningsFn ||
      !requestWithdrawalFn ||
      !reviewWithdrawalFn ||
      !approveWithdrawalFn ||
      !processWithdrawalFn ||
      !finalizeWithdrawalPaidFn
    ) {
      throw new Error('M2/M3 pending: services not yet implemented for full lifecycle')
    }

    // Step 1: Buyer tops up 500,000 VND
    await creditWallet(payload, {
      userId: buyer1.id,
      amount: 500000,
      type: 'topup',
      referenceType: 'payment_intent',
      referenceId: `TOPUP_E2E_1_${Date.now()}`,
      description: 'Buyer topup for full lifecycle test',
    })

    // Step 2: Buyer purchases Product 1 (200,000 VND)
    const purchase = await purchaseProductFn(payload, {
      buyerId: buyer1.id,
      productId: product1.id,
    })
    cleanup.orders.push(purchase.orderId)
    cleanup.entitlements.push(purchase.entitlementId)

    // Step 3: Check seller balance: pending = 140,000 VND, available = 0 VND
    const balancePending = await getSellerBalanceFn(payload, seller1.id)
    expect(balancePending.pendingBalance).toBe(140000)
    expect(balancePending.availableBalance).toBe(0)

    // Step 4: Fast-forward time to mature the 7-day hold period
    const futureDate = new Date(Date.now() + 8 * 24 * 60 * 60 * 1000)
    await releaseMaturedEarningsFn(payload, { sellerId: seller1.id, asOf: futureDate })

    // Step 5: Check seller balance: pending = 0 VND, available = 140,000 VND
    const balanceAvailable = await getSellerBalanceFn(payload, seller1.id)
    expect(balanceAvailable.availableBalance).toBe(140000)
    expect(balanceAvailable.pendingBalance).toBe(0)

    // Step 6: Seller requests withdrawal for 100,000 VND
    const withdrawal = await requestWithdrawalFn(payload, {
      sellerId: seller1.id,
      amount: 100000,
      bankInfo: {
        bankName: 'Vietcombank',
        accountNumber: '0123456789',
        accountHolderName: 'SELLER ONE',
      },
    })
    cleanup.withdrawals.push(withdrawal.id)
    expect(withdrawal.status).toBe('REQUESTED')

    // Balance reserved
    const balanceReserved = await getSellerBalanceFn(payload, seller1.id)
    expect(balanceReserved.availableBalance).toBe(40000)
    expect(balanceReserved.reservedBalance).toBe(100000)

    // Step 7: Finance Admin reviews withdrawal
    const reviewed = await reviewWithdrawalFn(payload, {
      withdrawalId: withdrawal.id,
      actorId: financeAdmin1.id,
    })
    expect(reviewed.status).toBe('UNDER_REVIEW')

    // Step 8: Finance Admin approves withdrawal
    const approved = await approveWithdrawalFn(payload, {
      withdrawalId: withdrawal.id,
      actorId: financeAdmin1.id,
      notes: 'Hồ sơ đã được phê duyệt qua cổng thanh toán',
    })
    expect(approved.status).toBe('APPROVED')

    // Step 9: Processing
    const processing = await processWithdrawalFn(payload, {
      withdrawalId: withdrawal.id,
      actorId: financeAdmin1.id,
    })
    expect(processing.status).toBe('PROCESSING')

    // Step 10: Final payout confirmed
    const paid = await finalizeWithdrawalPaidFn(payload, {
      withdrawalId: withdrawal.id,
      actorId: financeAdmin1.id,
    })
    expect(paid.status).toBe('PAID')

    // Step 11: Final balance check
    const balanceFinal = await getSellerBalanceFn(payload, seller1.id)
    expect(balanceFinal.availableBalance).toBe(40000)
    expect(balanceFinal.reservedBalance).toBe(0)
    expect(balanceFinal.withdrawnTotal).toBe(100000)
  })

  it('Tier 1 & 4: Full Multi-Actor E2E Lifecycle with Refund (Purchase -> Seller Pending -> Finance Admin Refund -> Buyer Credited & Seller Reversed)', async () => {
    if (!purchaseProductFn || !processRefundFn || !getSellerBalanceFn) {
      throw new Error('M4 pending: services not yet implemented')
    }

    const sellerBalanceBefore = await getSellerBalanceFn(payload, seller1.id)

    // Buyer purchases Product 2 (100,000 VND)
    const purchase = await purchaseProductFn(payload, {
      buyerId: buyer1.id,
      productId: product2.id,
    })
    cleanup.orders.push(purchase.orderId)
    cleanup.entitlements.push(purchase.entitlementId)

    // Seller pending balance increased by 70,000 VND (30% fee)
    const sellerBalanceAfterPurchase = await getSellerBalanceFn(payload, seller1.id)
    expect(sellerBalanceAfterPurchase.pendingBalance).toBe(sellerBalanceBefore.pendingBalance + 70000)

    // Finance Admin executes refund
    const refundRes = await processRefundFn(payload, {
      orderId: Number(purchase.orderId),
      reason: 'Khách hàng yêu cầu hoàn tiền do file cad không đúng phiên bản',
      actorId: financeAdmin1.id,
      revokeEntitlement: true,
    })
    cleanup.refunds.push(refundRes.refundId)
    expect(refundRes.status).toBe('COMPLETED')

    // Seller pending balance reversed back to original
    const sellerBalanceAfterRefund = await getSellerBalanceFn(payload, seller1.id)
    expect(sellerBalanceAfterRefund.pendingBalance).toBe(sellerBalanceBefore.pendingBalance)

    // Entitlement revoked
    const entDoc = await payload.findByID({
      collection: 'entitlements',
      id: purchase.entitlementId,
      overrideAccess: true,
    })
    expect(entDoc.status).toBe('revoked')
  })

  it('Tier 1: RBAC Matrix - Withdrawal Creation (FR-32)', async () => {
    if (!requestWithdrawalFn) {
      throw new Error('M3 pending: services not yet implemented')
    }

    // Buyer cannot request withdrawal
    await expect(
      requestWithdrawalFn(payload, {
        sellerId: buyer1.id,
        amount: 100000,
        bankInfo: {
          bankName: 'Vietcombank',
          accountNumber: '0123456789',
          accountHolderName: 'BUYER ONE',
        },
      })
    ).rejects.toThrow(/unauthorized|forbidden|role|seller/i)

    // Moderator cannot request withdrawal
    await expect(
      requestWithdrawalFn(payload, {
        sellerId: moderator1.id,
        amount: 100000,
        bankInfo: {
          bankName: 'Vietcombank',
          accountNumber: '0123456789',
          accountHolderName: 'MODERATOR ONE',
        },
      })
    ).rejects.toThrow(/unauthorized|forbidden|role|seller/i)
  })

  it('Tier 1: RBAC Matrix - Withdrawal Approvals & Rejections (§22)', async () => {
    if (!approveWithdrawalFn || !rejectWithdrawalFn) {
      throw new Error('M3 pending: services not yet implemented')
    }

    // Seller cannot approve withdrawal
    await expect(
      approveWithdrawalFn(payload, {
        withdrawalId: 999,
        actorId: seller1.id,
      })
    ).rejects.toThrow(/unauthorized|forbidden|finance|admin/i)

    // Buyer cannot approve withdrawal
    await expect(
      approveWithdrawalFn(payload, {
        withdrawalId: 999,
        actorId: buyer1.id,
      })
    ).rejects.toThrow(/unauthorized|forbidden|finance|admin/i)

    // Moderator cannot approve withdrawal
    await expect(
      approveWithdrawalFn(payload, {
        withdrawalId: 999,
        actorId: moderator1.id,
      })
    ).rejects.toThrow(/unauthorized|forbidden|finance|admin/i)

    // Seller cannot reject withdrawal
    await expect(
      rejectWithdrawalFn(payload, {
        withdrawalId: 999,
        actorId: seller1.id,
        reason: 'Illegal rejection',
      })
    ).rejects.toThrow(/unauthorized|forbidden|finance|admin/i)
  })

  it('Tier 1: RBAC Matrix - Refund Initiation (§5.5, §22)', async () => {
    if (!processRefundFn) {
      throw new Error('M4 pending: services not yet implemented')
    }

    // Buyer cannot initiate refund
    await expect(
      processRefundFn(payload, {
        orderId: 999,
        reason: 'Self refund attempt',
        actorId: buyer1.id,
      })
    ).rejects.toThrow(/unauthorized|forbidden|finance|admin/i)

    // Seller cannot initiate refund
    await expect(
      processRefundFn(payload, {
        orderId: 999,
        reason: 'Seller refund attempt',
        actorId: seller1.id,
      })
    ).rejects.toThrow(/unauthorized|forbidden|finance|admin/i)

    // Moderator cannot initiate refund
    await expect(
      processRefundFn(payload, {
        orderId: 999,
        reason: 'Moderator refund attempt',
        actorId: moderator1.id,
      })
    ).rejects.toThrow(/unauthorized|forbidden|finance|admin/i)
  })

  it('Tier 1: Data Isolation - Seller cannot access another seller earnings or withdrawals', async () => {
    const sellerIdOf = (doc: any) =>
      typeof doc.seller === 'object' && doc.seller !== null ? doc.seller.id : doc.seller

    // This test seeds its OWN earning chain instead of relying on a shared one.
    // A shared chain in `beforeAll` leaked a second PENDING 140,000 row into the
    // full-lifecycle test, whose `pendingBalance` assertion is collection-wide
    // for seller1 (see getSellerBalance) and therefore observed 280,000.
    // Seeding here keeps the precondition self-evident and the blast radius zero.
    const seeded: {
      earning?: number
      orderItem?: number
      order?: number
      product?: number
      productFile?: number
    } = {}

    try {
      const stamp = `${Date.now()}-${getSeq()}`
      const seededFile = await createProductFileHelper(
        seller1.id,
        `isolation-fixture-${stamp}.dwg`,
        `ISOLATION_FIXTURE_${stamp}`
      )
      seeded.productFile = seededFile.fileDoc.id

      const seededProduct = await payload.create({
        collection: 'products',
        data: {
          title: `Isolation Fixture CAD ${getSeq()}`,
          slug: `isolation-fixture-${stamp}`,
          price: 200000,
          isFree: false,
          seller: seller1.id,
          originalFiles: [seededFile.fileDoc.id],
          copyrightDeclared: true,
          moderationStatus: 'approved',
          _status: 'published',
        },
        overrideAccess: true,
      })
      seeded.product = seededProduct.id

      const seededOrder = await payload.create({
        collection: 'orders' as any,
        data: {
          buyer: buyer1.id,
          totalAmount: 200000,
          currency: 'VND',
          status: 'COMPLETED',
          paymentSource: 'wallet',
        },
        overrideAccess: true,
      })
      seeded.order = seededOrder.id

      const seededOrderItem = await payload.create({
        collection: 'order_items' as any,
        data: {
          order: seededOrder.id,
          product: seededProduct.id,
          seller: seller1.id,
          salePrice: 200000,
          platformFee: 60000,
          sellerAmount: 140000,
          tax: 0,
          policyVersion: 'site-default-v1-0.30',
        },
        overrideAccess: true,
      })
      seeded.orderItem = seededOrderItem.id

      const seededEarning = await payload.create({
        collection: 'seller_earnings',
        data: {
          seller: seller1.id,
          order: seededOrder.id,
          orderItem: seededOrderItem.id,
          product: seededProduct.id,
          salePrice: 200000,
          platformFee: 60000,
          sellerAmount: 140000,
          tax: 0,
          commissionRate: 0.3,
          currency: 'VND',
          status: 'PENDING',
          holdPeriodDays: 7,
          holdUntil: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
          policyVersion: 'site-default-v1-0.30',
        },
        overrideAccess: true,
      })
      seeded.earning = seededEarning.id

      // PRECONDITION: seller1 must actually own an earning row. Without this
      // assertion the "seller2 sees nothing" check below iterates a zero-length
      // array, never evaluates a single expectation, and reports PASS vacuously.
      const seller1Earnings = await payload.find({
        collection: 'seller_earnings' as any,
        user: seller1 as any,
        overrideAccess: false,
      })
      expect(seller1Earnings.docs.length).toBeGreaterThan(0)
      expect(seller1Earnings.docs.map(sellerIdOf)).toContain(seller1.id)

      // THE ISOLATION CHECK: seller2 must see zero of seller1's earnings.
      const seller2Earnings = await payload.find({
        collection: 'seller_earnings' as any,
        user: seller2 as any,
        overrideAccess: false,
      })
      expect(seller2Earnings.docs).toHaveLength(0)

      // And a finance admin must still see seller1's row, i.e. the access rule
      // filters rather than the row being absent altogether.
      const allEarnings = await payload.find({
        collection: 'seller_earnings' as any,
        user: financeAdmin1 as any,
        overrideAccess: false,
      })
      expect(allEarnings.docs.map(sellerIdOf)).toContain(seller1.id)
    } finally {
      // Reverse dependency teardown; never leave orphans even if an assertion
      // above failed, otherwise later assertions in this file become order-dependent.
      const teardown: Array<{ collection: string; id: number | undefined }> = [
        { collection: 'seller_earnings', id: seeded.earning },
        { collection: 'order_items', id: seeded.orderItem },
        { collection: 'orders', id: seeded.order },
        { collection: 'products', id: seeded.product },
        { collection: 'product_files', id: seeded.productFile },
      ]
      for (const { collection, id } of teardown) {
        if (id === undefined) continue
        try {
          await payload.delete({ collection: collection as any, id, overrideAccess: true })
        } catch (_ignore) {}
      }
    }
  })

  it('Tier 1: REST API Route Handler Integration - GET /api/v1/seller/earnings', async () => {
    if (!sellerEarningsRoute?.GET) {
      throw new Error('M5 pending: GET /api/v1/seller/earnings route handler not yet implemented')
    }

    // Unauthenticated request -> 401
    const unauthReq = new Request('http://localhost:3000/api/v1/seller/earnings', {
      method: 'GET',
    })
    const unauthRes = await sellerEarningsRoute.GET(unauthReq)
    expect(unauthRes.status).toBe(401)
  })

  it('Tier 1: REST API Route Handler Integration - POST /api/v1/seller/withdrawals', async () => {
    if (!sellerWithdrawalsRoute?.POST) {
      throw new Error('M5 pending: POST /api/v1/seller/withdrawals route handler not yet implemented')
    }

    // Unauthenticated request -> 401
    const unauthReq = new Request('http://localhost:3000/api/v1/seller/withdrawals', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ amount: 100000 }),
    })
    const unauthRes = await sellerWithdrawalsRoute.POST(unauthReq)
    expect(unauthRes.status).toBe(401)
  })

  it('Tier 1: REST API Route Handler Integration - GET /api/v1/admin/withdrawals', async () => {
    if (!adminWithdrawalsRoute?.GET) {
      throw new Error('M5 pending: GET /api/v1/admin/withdrawals route handler not yet implemented')
    }

    const unauthReq = new Request('http://localhost:3000/api/v1/admin/withdrawals', {
      method: 'GET',
    })
    const unauthRes = await adminWithdrawalsRoute.GET(unauthReq)
    expect(unauthRes.status).toBe(401)
  })

  it('Tier 1: REST API Route Handler Integration - POST /api/v1/admin/withdrawals/{id}/approve & reject', async () => {
    if (!adminApproveRoute?.POST || !adminRejectRoute?.POST) {
      throw new Error('M5 pending: Admin withdrawal action routes not yet implemented')
    }

    const unauthReq = new Request('http://localhost:3000/api/v1/admin/withdrawals/1/approve', {
      method: 'POST',
    })
    const unauthRes = await adminApproveRoute.POST(unauthReq, { params: Promise.resolve({ id: '1' }) })
    expect(unauthRes.status).toBe(401)
  })

  it('Tier 1: REST API Route Handler Integration - POST /api/v1/admin/refunds', async () => {
    if (!adminRefundRoute?.POST) {
      throw new Error('M5 pending: POST /api/v1/admin/refunds route handler not yet implemented')
    }

    const unauthReq = new Request('http://localhost:3000/api/v1/admin/refunds', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ orderId: 1, reason: 'Test' }),
    })
    const unauthRes = await adminRefundRoute.POST(unauthReq)
    expect(unauthRes.status).toBe(401)
  })
})
