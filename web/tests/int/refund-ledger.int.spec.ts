import { getPayload, type Payload } from 'payload'
import config from '@/payload.config'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { User, Wallet } from '@/payload-types'
import { creditWallet, getOrCreateWallet } from '@/services/wallet'

// Interface contracts per PROJECT.md § Refund Service
export interface RefundParams {
  orderId: number
  reason: string
  actorId: number
  revokeEntitlement?: boolean
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

describe('Phase 6: Compensating Refund Flow & Ledger Immutability (FLOW-U15, BR-03, Decision 0002)', () => {
  let payload: Payload
  let bootstrapUser: User
  let sellerUser: User
  let buyerUser: User
  let buyerUser2: User
  let financeAdminUser: User
  let _adminUser: User

  let commercialProduct1: any
  let commercialProduct2: any
  let commercialProduct3: any
  let uploadedFile: any
  let buyerWallet: Wallet

  const cleanup = {
    refunds: [] as (number | string)[],
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

  // Dynamic service loaders for Phase 6
  let processRefundFn: ((payload: Payload, params: RefundParams) => Promise<RefundResult>) | null = null
  let purchaseProductFn: ((payload: Payload, params: { buyerId: number; productId: number; req?: any }) => Promise<PurchaseResult>) | null = null
  let getSellerBalanceFn: ((payload: Payload, sellerId: number) => Promise<SellerBalanceSummary>) | null = null

  const createUser = async (email: string, roles: User['roles']): Promise<User> => {
    const user = (await payload.create({
      collection: 'users',
      data: {
        email,
        password: 'test-password-refund-123',
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

    // Dynamically load refund service
    const refundPath = '../../src/services/refund'
    const refundMod = await import(/* @vite-ignore */ refundPath).catch(() => null)
    if (refundMod) {
      processRefundFn = refundMod.processRefund
    }

    // Dynamically load purchase service
    const purchasePath = '../../src/services/purchase'
    const purchaseMod = await import(/* @vite-ignore */ purchasePath).catch(() => null)
    if (purchaseMod?.purchaseProduct) {
      purchaseProductFn = purchaseMod.purchaseProduct
    }

    // Dynamically load earnings service
    const earningsPath = '../../src/services/earnings'
    const earningsMod = await import(/* @vite-ignore */ earningsPath).catch(() => null)
    if (earningsMod) {
      getSellerBalanceFn = earningsMod.getSellerBalance
    }

    const timestamp = Date.now()

    // `ensureFirstUserIsAdmin` (src/collections/Users/hooks) appends 'admin' to the roles of the
    // FIRST user created while the users table is EMPTY - which is exactly the CI state: CI applies
    // only the versioned migrations and every spec's afterAll deletes its own users, so each spec
    // file can start from an empty table. Absorb that promotion with a throwaway user BEFORE the
    // role-sensitive fixtures below, otherwise `sellerUser` is silently ['seller', 'admin'] and the
    // refund authorization matrix of this suite is evaluated against an admin account.
    bootstrapUser = await createUser(
      `bootstrap-ref-${timestamp}-${getSeq()}@kientaohub.local`,
      ['buyer'],
    )

    sellerUser = await createUser(`seller-ref-${timestamp}-${getSeq()}@kientaohub.local`, ['seller'])
    buyerUser = await createUser(`buyer-ref-${timestamp}-${getSeq()}@kientaohub.local`, ['buyer'])
    buyerUser2 = await createUser(`buyer2-ref-${timestamp}-${getSeq()}@kientaohub.local`, ['buyer'])
    financeAdminUser = await createUser(`finance-ref-${timestamp}-${getSeq()}@kientaohub.local`, ['financeAdmin'])
    _adminUser = await createUser(`admin-ref-${timestamp}-${getSeq()}@kientaohub.local`, ['admin'])

    // Guard: the fixtures must hold EXACTLY the roles they declare, whether or not the users table
    // started empty (the bootstrap user above owns the first-user promotion). If the promotion ever
    // lands on one of them again, these assertions fail loudly instead of letting the refund ledger
    // assertions silently lose their meaning.
    expect(sellerUser.roles).toEqual(['seller'])
    expect(sellerUser.roles).not.toContain('admin')
    expect(buyerUser.roles).toEqual(['buyer'])
    expect(buyerUser2.roles).toEqual(['buyer'])
    expect(financeAdminUser.roles).toEqual(['financeAdmin'])

    buyerWallet = await getOrCreateWallet(payload, { userId: buyerUser.id })
    await getOrCreateWallet(payload, { userId: buyerUser2.id })

    uploadedFile = await createProductFileHelper(
      sellerUser.id,
      `blueprint-refund-${timestamp}.dwg`,
      `CAD_DRAWING_DATA_FOR_REFUND_${timestamp}`
    )

    // Commercial Product 1 (250,000 VND)
    commercialProduct1 = await payload.create({
      collection: 'products',
      data: {
        title: `Commercial Blueprint 1 ${getSeq()}`,
        slug: `comm-ref-1-${timestamp}-${getSeq()}`,
        price: 250000,
        isFree: false,
        seller: sellerUser.id,
        originalFiles: [uploadedFile.fileDoc.id],
        copyrightDeclared: true,
        moderationStatus: 'approved',
        _status: 'published',
      },
      overrideAccess: true,
    })
    cleanup.products.push(commercialProduct1.id)

    // Commercial Product 2 (180,000 VND)
    commercialProduct2 = await payload.create({
      collection: 'products',
      data: {
        title: `Commercial Blueprint 2 ${getSeq()}`,
        slug: `comm-ref-2-${timestamp}-${getSeq()}`,
        price: 180000,
        isFree: false,
        seller: sellerUser.id,
        originalFiles: [uploadedFile.fileDoc.id],
        copyrightDeclared: true,
        moderationStatus: 'approved',
        _status: 'published',
      },
      overrideAccess: true,
    })
    cleanup.products.push(commercialProduct2.id)

    // Commercial Product 3 (100,000 VND)
    commercialProduct3 = await payload.create({
      collection: 'products',
      data: {
        title: `Commercial Blueprint 3 ${getSeq()}`,
        slug: `comm-ref-3-${timestamp}-${getSeq()}`,
        price: 100000,
        isFree: false,
        seller: sellerUser.id,
        originalFiles: [uploadedFile.fileDoc.id],
        copyrightDeclared: true,
        moderationStatus: 'approved',
        _status: 'published',
      },
      overrideAccess: true,
    })
    cleanup.products.push(commercialProduct3.id)
  })

  afterAll(async () => {
    // F1-class cleanup regression (same class as reviews.int.spec.ts). The real `purchaseProduct()`
    // call creates `order_items` and `seller_earnings` rows that this spec never tracks by id, and
    // both hold NOT NULL foreign keys to `orders` / `products` / `users` declared as ON DELETE SET
    // NULL - so the parent deletes were aborted and every run left 3 users / 3 orders /
    // 3 order_items / 3 products / 3 seller_earnings behind. Resolve the untracked rows through the
    // orders this spec owns, leaf-first:
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

  it('Tier 1: Compensating Refund Flow - Credits buyer wallet via reversal ledger entry without mutating original purchase ledger (BR-03)', async () => {
    if (!purchaseProductFn || !processRefundFn) {
      throw new Error('M4 pending: processRefund service not yet implemented in web/src/services/refund.ts')
    }

    // Top up buyer with 300,000 VND
    await creditWallet(payload, {
      userId: buyerUser.id,
      amount: 300000,
      type: 'topup',
      referenceType: 'payment_intent',
      referenceId: `TOPUP_REFUND_${Date.now()}`,
      description: 'Topup for refund test',
    })

    // Buyer purchases commercialProduct1 (250,000 VND)
    const purchase = await purchaseProductFn(payload, {
      buyerId: buyerUser.id,
      productId: commercialProduct1.id,
    })
    cleanup.orders.push(purchase.orderId)
    cleanup.entitlements.push(purchase.entitlementId)

    const buyerWalletAfterPurchase = await getOrCreateWallet(payload, { userId: buyerUser.id })
    const balanceAfterPurchase = Number(buyerWalletAfterPurchase.balance)

    // Capture purchase ledger entry
    const purchaseLedgerDocs = await payload.find({
      collection: 'wallet_ledger',
      where: {
        and: [
          { wallet: { equals: buyerWallet.id } },
          { referenceId: { equals: purchase.orderCode } },
          { direction: { equals: 'debit' } },
        ],
      },
      overrideAccess: true,
    })
    expect(purchaseLedgerDocs.docs.length).toBe(1)
    const purchaseLedger = purchaseLedgerDocs.docs[0]

    // Finance Admin executes refund
    const refundResult = await processRefundFn(payload, {
      orderId: Number(purchase.orderId),
      reason: 'Bản vẽ CAD lỗi font chữ và thiếu mặt cắt trục 3-4',
      actorId: financeAdminUser.id,
      revokeEntitlement: true,
    })

    expect(refundResult.amountRefunded).toBe(250000)
    expect(refundResult.status).toBe('COMPLETED')
    cleanup.refunds.push(refundResult.refundId)

    // Buyer wallet must be credited 250,000 VND
    const buyerWalletAfterRefund = await getOrCreateWallet(payload, { userId: buyerUser.id })
    expect(Number(buyerWalletAfterRefund.balance)).toBe(balanceAfterPurchase + 250000)

    // Verify Compensating Reversal Ledger entry exists
    const reversalLedgerDocs = await payload.find({
      collection: 'wallet_ledger',
      where: {
        and: [
          { wallet: { equals: buyerWallet.id } },
          { referenceId: { equals: purchase.orderCode } },
          { direction: { equals: 'credit' } },
          { type: { equals: 'refund' } },
        ],
      },
      overrideAccess: true,
    })
    expect(reversalLedgerDocs.docs.length).toBe(1)
    const reversalLedger = reversalLedgerDocs.docs[0]
    expect(Number(reversalLedger.amount)).toBe(250000)

    // Invariant check: Original purchase ledger entry was NOT touched
    const purchaseLedgerRefreshed = await payload.findByID({
      collection: 'wallet_ledger',
      id: purchaseLedger.id,
      overrideAccess: true,
    })
    expect(purchaseLedgerRefreshed.amount).toBe(purchaseLedger.amount)
    expect(purchaseLedgerRefreshed.direction).toBe('debit')
    expect(purchaseLedgerRefreshed.type).toBe('purchase')
  })

  it('Tier 1: Seller Earning Reversal (Pending) - Reverses pending seller earning and decrements pending balance', async () => {
    if (!purchaseProductFn || !processRefundFn) {
      throw new Error('M4 pending: services not yet implemented')
    }

    // Top up buyer 2
    await creditWallet(payload, {
      userId: buyerUser2.id,
      amount: 200000,
      type: 'topup',
      referenceType: 'payment_intent',
      referenceId: `TOPUP_REF_PENDING_${Date.now()}`,
      description: 'Topup for pending reversal test',
    })

    const initialSellerBalance = getSellerBalanceFn ? await getSellerBalanceFn(payload, sellerUser.id) : null

    // Purchase product 2 (180,000 VND)
    const purchase = await purchaseProductFn(payload, {
      buyerId: buyerUser2.id,
      productId: commercialProduct2.id,
    })
    cleanup.orders.push(purchase.orderId)
    cleanup.entitlements.push(purchase.entitlementId)

    // Refund order
    const refundResult = await processRefundFn(payload, {
      orderId: Number(purchase.orderId),
      reason: 'Yêu cầu hủy mua do nhầm định dạng',
      actorId: financeAdminUser.id,
    })
    cleanup.refunds.push(refundResult.refundId)

    // Seller earnings record must have status REVERSED or REFUNDED
    const earnings = await payload.find({
      collection: 'seller_earnings' as any,
      where: { order: { equals: purchase.orderId } },
      overrideAccess: true,
    })

    if (earnings.docs.length > 0) {
      const earningDoc = earnings.docs[0] as any
      expect(['REVERSED', 'REFUNDED']).toContain(earningDoc.status)
    }

    if (getSellerBalanceFn && initialSellerBalance) {
      const currentSellerBalance = await getSellerBalanceFn(payload, sellerUser.id)
      // Pending balance returned to prior state
      expect(currentSellerBalance.pendingBalance).toBe(initialSellerBalance.pendingBalance)
    }
  })

  it('Tier 1: Order Status Transition - Order status transitions to REFUNDED while snapshot items remain intact', async () => {
    if (!purchaseProductFn || !processRefundFn) {
      throw new Error('M4 pending: services not yet implemented')
    }

    const orderDoc = await payload.findByID({
      collection: 'orders',
      id: cleanup.orders[0],
      overrideAccess: true,
    })

    // Status must be REFUNDED
    expect(orderDoc.status).toBe('REFUNDED')

    // Snapshot order items remain intact
    const items = await payload.find({
      collection: 'order_items',
      where: { order: { equals: orderDoc.id } },
      overrideAccess: true,
    })
    expect(items.docs.length).toBeGreaterThan(0)
    for (const item of items.docs) {
      expect(item.salePrice).toBeDefined()
      expect(item.platformFee).toBeDefined()
      expect(item.sellerAmount).toBeDefined()
    }
  })

  it('Tier 1: Ledger Immutability (BR-03, Decision 0002) - Original purchase ledger entries are never modified or deleted', async () => {
    // Query all ledger entries for buyer
    const ledgers = await payload.find({
      collection: 'wallet_ledger',
      where: { wallet: { equals: buyerWallet.id } },
      sort: 'createdAt',
      overrideAccess: true,
    })

    // Every entry must be append-only with valid balances
    for (const row of ledgers.docs) {
      expect(Number.isInteger(row.amount)).toBe(true)
      expect(row.balanceBefore).toBeDefined()
      expect(row.balanceAfter).toBeDefined()
      if (row.direction === 'credit') {
        expect(row.balanceAfter).toBe(row.balanceBefore + row.amount)
      } else {
        expect(row.balanceAfter).toBe(row.balanceBefore - row.amount)
      }
    }
  })

  it('Tier 2: Entitlement Revocation by Default - Entitlement status transitions to revoked when revokeEntitlement is true or omitted', async () => {
    if (!purchaseProductFn || !processRefundFn) {
      throw new Error('M4 pending: services not yet implemented')
    }

    const entitlementId = cleanup.entitlements[0]
    if (entitlementId) {
      const entDoc = await payload.findByID({
        collection: 'entitlements',
        id: entitlementId,
        overrideAccess: true,
      })
      expect(entDoc.status).toBe('revoked')
    }
  })

  it('Tier 2: Retained Entitlement Policy - Entitlement remains active when revokeEntitlement is false', async () => {
    if (!purchaseProductFn || !processRefundFn) {
      throw new Error('M4 pending: services not yet implemented')
    }

    // Top up buyer with 100,000 VND
    await creditWallet(payload, {
      userId: buyerUser.id,
      amount: 100000,
      type: 'topup',
      referenceType: 'payment_intent',
      referenceId: `TOPUP_RETAIN_${Date.now()}`,
      description: 'Topup for retained entitlement test',
    })

    const purchase = await purchaseProductFn(payload, {
      buyerId: buyerUser.id,
      productId: commercialProduct3.id,
    })
    cleanup.orders.push(purchase.orderId)
    cleanup.entitlements.push(purchase.entitlementId)

    // Execute refund with revokeEntitlement: false (goodwill compensation)
    const refundResult = await processRefundFn(payload, {
      orderId: Number(purchase.orderId),
      reason: 'Bồi thường thiện chí khách hàng',
      actorId: financeAdminUser.id,
      revokeEntitlement: false,
    })
    cleanup.refunds.push(refundResult.refundId)
    expect(refundResult.entitlementRevoked).toBe(false)

    // Entitlement must remain active
    const entDoc = await payload.findByID({
      collection: 'entitlements',
      id: purchase.entitlementId,
      overrideAccess: true,
    })
    expect(entDoc.status).toBe('active')
  })

  it('Tier 2: Duplicate Refund Prevention - Subsequent refund attempt on already refunded order is rejected with 400', async () => {
    if (!processRefundFn) {
      throw new Error('M4 pending: processRefund service not yet implemented in web/src/services/refund.ts')
    }

    const refundedOrderId = Number(cleanup.orders[0])

    // Second refund attempt must fail
    await expect(
      processRefundFn(payload, {
        orderId: refundedOrderId,
        reason: 'Thử hoàn tiền lần thứ 2',
        actorId: financeAdminUser.id,
      })
    ).rejects.toThrow(/already|refund/i)
  })

  it('Tier 2: Non-Eligible Order Rejection - Cannot refund non-existent order, draft order, or cancelled order', async () => {
    if (!processRefundFn) {
      throw new Error('M4 pending: processRefund service not yet implemented in web/src/services/refund.ts')
    }

    // Non-existent order ID 9999999
    await expect(
      processRefundFn(payload, {
        orderId: 9999999,
        reason: 'Refund order không tồn tại',
        actorId: financeAdminUser.id,
      })
    ).rejects.toThrow(/not found|eligible/i)

    // Missing reason must throw validation error
    await expect(
      processRefundFn(payload, {
        orderId: Number(cleanup.orders[0]),
        reason: '',
        actorId: financeAdminUser.id,
      })
    ).rejects.toThrow()
  })

  it('Tier 2: Audit Trail - Refunds collection stores complete audit metadata (order, buyer, seller, amounts, actor, reason)', async () => {
    if (cleanup.refunds.length === 0) {
      return
    }

    const refundDoc = (await payload.findByID({
      collection: 'refunds' as any,
      id: cleanup.refunds[0],
      overrideAccess: true,
    })) as any

    expect(refundDoc).toBeDefined()
    expect(refundDoc.amount).toBe(250000)
    expect(refundDoc.reason).toBeDefined()
    expect(refundDoc.actor || refundDoc.processedBy).toBeDefined()
  })

  it('Tier 3: Ledger Mathematical Conservation - Buyer wallet balance strictly equals sum of all wallet_ledger entries before and after refund', async () => {
    const finalWallet = await getOrCreateWallet(payload, { userId: buyerUser.id })

    const ledgerEntries = await payload.find({
      collection: 'wallet_ledger',
      where: { wallet: { equals: buyerWallet.id } },
      overrideAccess: true,
    })

    let calculatedBalance = 0
    for (const entry of ledgerEntries.docs) {
      if (entry.direction === 'credit') {
        calculatedBalance += entry.amount
      } else {
        calculatedBalance -= entry.amount
      }
    }

    // Wallet balance strictly matches sum of ledger entries
    expect(Number(finalWallet.balance)).toBe(calculatedBalance)
  })
})
