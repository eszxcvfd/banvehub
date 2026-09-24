import { getPayload, type Payload } from 'payload'
import config from '@/payload.config'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import type { User, Wallet } from '@/payload-types'
import { creditWallet, getOrCreateWallet } from '@/services/wallet'
import { releaseMaturedEarnings } from '@/services/earnings'
import { POST as postAdminRefund } from '@/app/api/v1/admin/refunds/route'

// Interface contracts per PROJECT.md § Refund Service, extended by decision 0012:
// the fault basis is REQUIRED (no default), and an out-of-window refund needs the
// operator's explicit, recorded override.
export interface RefundParams {
  orderId: number
  reason: string
  actorId: number
  faultBasis: 'SELLER' | 'PLATFORM'
  overrideWindow?: boolean
  revokeEntitlement?: boolean
}

export interface RefundResult {
  refundId: number
  orderId: number
  buyerId: number
  amountRefunded: number
  sellerAmountRefunded: number
  platformFeeRefunded: number
  faultBasis: 'SELLER' | 'PLATFORM'
  outOfWindow: boolean
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

    // Finance Admin executes refund (seller fault: the delivered drawing is not as described)
    const refundResult = await processRefundFn(payload, {
      orderId: Number(purchase.orderId),
      reason: 'Bản vẽ CAD lỗi font chữ và thiếu mặt cắt trục 3-4',
      actorId: financeAdminUser.id,
      faultBasis: 'SELLER',
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
      reason: 'File CAD không đúng định dạng đã mô tả',
      actorId: financeAdminUser.id,
      faultBasis: 'SELLER',
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
      reason: 'File bị lỗi so với mô tả, giữ quyền tải cho người mua như bồi thường thiện chí',
      actorId: financeAdminUser.id,
      faultBasis: 'SELLER',
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
        faultBasis: 'SELLER',
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
        faultBasis: 'SELLER',
      })
    ).rejects.toThrow(/not found|eligible/i)

    // Missing reason must throw validation error
    await expect(
      processRefundFn(payload, {
        orderId: Number(cleanup.orders[0]),
        reason: '',
        actorId: financeAdminUser.id,
        faultBasis: 'SELLER',
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

  /**
   * Decision 0012: the fault basis is a REQUIRED input that decides who bears the refund
   * (seller fault reverses the seller's earning, platform fault refunds the buyer only), and the
   * 5-day window runs from `orders.paidAt` with an explicit, recorded operator override.
   */
  describe('Decision 0012: fault basis and the 5-day refund window', () => {
    const createCommercialProduct = async (price: number) => {
      const product = await payload.create({
        collection: 'products',
        data: {
          title: `Decision 0012 Blueprint ${getSeq()}`,
          slug: `d0012-${Date.now()}-${getSeq()}`,
          price,
          isFree: false,
          seller: sellerUser.id,
          originalFiles: [uploadedFile.fileDoc.id],
          copyrightDeclared: true,
          moderationStatus: 'approved',
          _status: 'published',
        },
        overrideAccess: true,
      })
      cleanup.products.push(product.id)
      return product
    }

    const buyProduct = async (buyerId: number, productId: number, price: number) => {
      await creditWallet(payload, {
        userId: buyerId,
        amount: price,
        type: 'topup',
        referenceType: 'payment_intent',
        referenceId: `TOPUP_D0012_${Date.now()}_${getSeq()}`,
        description: 'Topup for decision 0012 refund tests',
      })

      const purchase = await purchaseProductFn!(payload, { buyerId, productId })
      cleanup.orders.push(purchase.orderId)
      cleanup.entitlements.push(purchase.entitlementId)
      return purchase
    }

    const earningOfOrder = async (orderId: string) => {
      const found = await payload.find({
        collection: 'seller_earnings' as any,
        where: { order: { equals: orderId } },
        overrideAccess: true,
      })
      expect(found.totalDocs).toBe(1)
      return found.docs[0] as any
    }

    const refundLedgerRowsOf = async (orderCode: string) => {
      const found = await payload.find({
        collection: 'wallet_ledger',
        where: {
          and: [{ referenceId: { equals: orderCode } }, { type: { equals: 'refund' } }],
        },
        overrideAccess: true,
      })
      return found.totalDocs
    }

    const refundsOfOrder = async (orderId: number) => {
      const found = await payload.find({
        collection: 'refunds',
        where: { order: { equals: orderId } },
        overrideAccess: true,
      })
      return found.totalDocs
    }

    it('refuses a refund that states no fault basis, then records the seller share on a seller-fault refund', async () => {
      if (!processRefundFn || !purchaseProductFn) {
        throw new Error('M4 pending: services not yet implemented')
      }

      const product = await createCommercialProduct(150000)
      const purchase = await buyProduct(buyerUser.id, product.id, 150000)
      const orderId = Number(purchase.orderId)

      const earning = await earningOfOrder(purchase.orderId)
      const sellerShare = Number(earning.sellerAmount)
      const platformFee = Number(earning.platformFee)
      expect(sellerShare).toBeGreaterThan(0)

      // No fault basis: the money path refuses, and it refuses before moving anything at all.
      await expect(
        processRefundFn(payload, {
          orderId,
          reason: 'Yêu cầu hoàn tiền không nêu cơ sở lỗi',
          actorId: financeAdminUser.id,
        } as any),
      ).rejects.toThrow(/fault basis/i)

      expect(await refundLedgerRowsOf(purchase.orderCode)).toBe(0)
      expect(await refundsOfOrder(orderId)).toBe(0)
      expect(
        (await payload.findByID({ collection: 'orders', id: orderId, overrideAccess: true })).status,
      ).toBe('COMPLETED')

      // The same order refunds normally once the basis is stated: seller fault.
      const refund = await processRefundFn(payload, {
        orderId,
        reason: 'File bàn giao thiếu mặt cắt so với mô tả',
        actorId: financeAdminUser.id,
        faultBasis: 'SELLER',
      })
      cleanup.refunds.push(refund.refundId)

      expect(refund.faultBasis).toBe('SELLER')
      expect(refund.sellerAmountRefunded).toBe(sellerShare)
      expect(refund.platformFeeRefunded).toBe(platformFee)
      expect(refund.outOfWindow).toBe(false)

      const earningAfter = (await payload.findByID({
        collection: 'seller_earnings' as any,
        id: earning.id,
        overrideAccess: true,
      })) as any
      expect(earningAfter.status).toBe('REVERSED')
      expect(earningAfter.reversedAt).toBeDefined()
      expect(Number(earningAfter.sellerAmount)).toBe(sellerShare)

      expect(
        (await payload.findByID({ collection: 'orders', id: orderId, overrideAccess: true })).status,
      ).toBe('REFUNDED')
    })

    it('platform fault: buyer refunded, seller earning untouched (still PENDING) and matures on schedule with sellerAmountRefunded = 0', async () => {
      if (!processRefundFn || !purchaseProductFn) {
        throw new Error('M4 pending: services not yet implemented')
      }

      const product = await createCommercialProduct(200000)
      const purchase = await buyProduct(buyerUser.id, product.id, 200000)
      const orderId = Number(purchase.orderId)

      const earning = await earningOfOrder(purchase.orderId)
      const sellerShare = Number(earning.sellerAmount)
      const platformFee = Number(earning.platformFee)
      const holdUntil = earning.holdUntil as string
      expect(sellerShare).toBeGreaterThan(0)
      expect(platformFee).toBeGreaterThan(0)

      const walletBefore = await getOrCreateWallet(payload, { userId: buyerUser.id })

      const refund = await processRefundFn(payload, {
        orderId,
        reason: 'Lỗi hệ thống: không thể tải file dù đơn hàng đã thanh toán',
        actorId: financeAdminUser.id,
        faultBasis: 'PLATFORM',
      })
      cleanup.refunds.push(refund.refundId)

      expect(refund.faultBasis).toBe('PLATFORM')
      expect(refund.sellerAmountRefunded).toBe(0)
      expect(refund.platformFeeRefunded).toBe(platformFee)

      // The buyer is refunded through the one money write path, with its paired ledger row.
      const walletAfter = await getOrCreateWallet(payload, { userId: buyerUser.id })
      expect(Number(walletAfter.balance)).toBe(Number(walletBefore.balance) + 200000)

      const refundDoc = (await payload.findByID({
        collection: 'refunds',
        id: refund.refundId,
        overrideAccess: true,
      })) as any
      expect(refundDoc.faultBasis).toBe('PLATFORM')
      expect(Number(refundDoc.sellerAmountRefunded)).toBe(0)
      expect(refundDoc.outOfWindow).toBe(false)

      // The refund points at the compensating ledger row it produced (a fresh row, never an edit).
      expect(refund.reversalLedgerEntryId).toBeDefined()
      const refundDocLedgerId =
        typeof refundDoc.ledgerTransaction === 'object' && refundDoc.ledgerTransaction !== null
          ? refundDoc.ledgerTransaction.id
          : refundDoc.ledgerTransaction
      expect(Number(refundDocLedgerId)).toBe(Number(refund.reversalLedgerEntryId))

      const pairedLedger = await payload.findByID({
        collection: 'wallet_ledger',
        id: Number(refund.reversalLedgerEntryId),
        overrideAccess: true,
      })
      expect(pairedLedger.type).toBe('refund')
      expect(pairedLedger.direction).toBe('credit')
      expect(Number(pairedLedger.amount)).toBe(200000)
      expect(String(pairedLedger.referenceId)).toBe(purchase.orderCode)

      // The seller's earning is untouched: same status, same hold instant, nothing recovered.
      const earningAfter = (await payload.findByID({
        collection: 'seller_earnings' as any,
        id: earning.id,
        overrideAccess: true,
      })) as any
      expect(earningAfter.status).toBe('PENDING')
      expect(earningAfter.holdUntil).toBe(holdUntil)
      expect(Number(earningAfter.sellerAmount)).toBe(sellerShare)
      expect(earningAfter.reversedAt ?? null).toBeNull()

      // It does not mature early...
      await releaseMaturedEarnings(payload, { sellerId: sellerUser.id, asOf: new Date() })
      expect(
        (
          (await payload.findByID({
            collection: 'seller_earnings' as any,
            id: earning.id,
            overrideAccess: true,
          })) as any
        ).status,
      ).toBe('PENDING')

      // ...and it matures on schedule, paying the seller their share in full.
      await releaseMaturedEarnings(payload, {
        sellerId: sellerUser.id,
        asOf: new Date(new Date(holdUntil).getTime() + 1000),
      })
      const matured = (await payload.findByID({
        collection: 'seller_earnings' as any,
        id: earning.id,
        overrideAccess: true,
      })) as any
      expect(matured.status).toBe('AVAILABLE')
      expect(Number(matured.sellerAmount)).toBe(sellerShare)

      expect(
        (await payload.findByID({ collection: 'orders', id: orderId, overrideAccess: true })).status,
      ).toBe('REFUNDED')
    })

    it('measures the 5-day window from orders.paidAt: day 4 is in policy, day 6 is refused without the operator override', async () => {
      if (!processRefundFn || !purchaseProductFn) {
        throw new Error('M4 pending: services not yet implemented')
      }

      const day = 24 * 60 * 60 * 1000

      // Inside the window: no override needed, and the record says it was in policy.
      const inWindowProduct = await createCommercialProduct(100000)
      const inWindowPurchase = await buyProduct(buyerUser.id, inWindowProduct.id, 100000)
      const inWindowOrderId = Number(inWindowPurchase.orderId)
      await payload.update({
        collection: 'orders',
        id: inWindowOrderId,
        data: { paidAt: new Date(Date.now() - 4 * day).toISOString() },
        overrideAccess: true,
      })

      const inWindowRefund = await processRefundFn(payload, {
        orderId: inWindowOrderId,
        reason: 'File lỗi phát hiện trong cửa sổ 5 ngày',
        actorId: financeAdminUser.id,
        faultBasis: 'SELLER',
      })
      cleanup.refunds.push(inWindowRefund.refundId)
      expect(inWindowRefund.outOfWindow).toBe(false)

      // Outside the window: the anchor is orders.paidAt, not the first download.
      const outOfWindowProduct = await createCommercialProduct(100000)
      const outOfWindowPurchase = await buyProduct(buyerUser.id, outOfWindowProduct.id, 100000)
      const outOfWindowOrderId = Number(outOfWindowPurchase.orderId)
      await payload.update({
        collection: 'orders',
        id: outOfWindowOrderId,
        data: { paidAt: new Date(Date.now() - 6 * day).toISOString() },
        overrideAccess: true,
      })

      await expect(
        processRefundFn(payload, {
          orderId: outOfWindowOrderId,
          reason: 'Yêu cầu hoàn tiền sau 5 ngày',
          actorId: financeAdminUser.id,
          faultBasis: 'SELLER',
        }),
      ).rejects.toThrow(/window/i)

      expect(await refundLedgerRowsOf(outOfWindowPurchase.orderCode)).toBe(0)
      expect(await refundsOfOrder(outOfWindowOrderId)).toBe(0)
      expect(
        (
          await payload.findByID({
            collection: 'orders',
            id: outOfWindowOrderId,
            overrideAccess: true,
          })
        ).status,
      ).toBe('COMPLETED')

      // The operator may still act, but only by overriding, and the override is recorded.
      const overrideRefund = await processRefundFn(payload, {
        orderId: outOfWindowOrderId,
        reason: 'Lỗi người bán chỉ phát hiện sau 5 ngày, người vận hành ghi đè ngoài chính sách',
        actorId: financeAdminUser.id,
        faultBasis: 'SELLER',
        overrideWindow: true,
      })
      cleanup.refunds.push(overrideRefund.refundId)

      expect(overrideRefund.outOfWindow).toBe(true)
      const overrideDoc = (await payload.findByID({
        collection: 'refunds',
        id: overrideRefund.refundId,
        overrideAccess: true,
      })) as any
      expect(overrideDoc.outOfWindow).toBe(true)
      expect(overrideDoc.faultBasis).toBe('SELLER')
    })

    it('refuses an anchorless order (no paidAt) without the override and records the override when given', async () => {
      if (!processRefundFn || !purchaseProductFn) {
        throw new Error('M4 pending: services not yet implemented')
      }

      const product = await createCommercialProduct(100000)
      const purchase = await buyProduct(buyerUser.id, product.id, 100000)
      const orderId = Number(purchase.orderId)

      // No anchor: absent paidAt is never treated as "inside the window".
      await payload.update({
        collection: 'orders',
        id: orderId,
        data: { paidAt: null },
        overrideAccess: true,
      })

      await expect(
        processRefundFn(payload, {
          orderId,
          reason: 'Đơn hàng không có paidAt',
          actorId: financeAdminUser.id,
          faultBasis: 'PLATFORM',
        }),
      ).rejects.toThrow(/paidAt|window/i)

      expect(await refundsOfOrder(orderId)).toBe(0)

      const refund = await processRefundFn(payload, {
        orderId,
        reason: 'Người vận hành ghi đè cho đơn không xác định được mốc cửa sổ',
        actorId: financeAdminUser.id,
        faultBasis: 'PLATFORM',
        overrideWindow: true,
      })
      cleanup.refunds.push(refund.refundId)
      expect(refund.outOfWindow).toBe(true)
    })

    it('POST /api/v1/admin/refunds: keeps the financeAdmin/admin authorization and rejects a missing, unknown or ill-typed fault basis', async () => {
      if (!processRefundFn || !purchaseProductFn) {
        throw new Error('M4 pending: services not yet implemented')
      }

      const product = await createCommercialProduct(120000)
      const purchase = await buyProduct(buyerUser2.id, product.id, 120000)
      const orderId = Number(purchase.orderId)
      await payload.update({
        collection: 'orders',
        id: orderId,
        data: { paidAt: new Date(Date.now() - 6 * 24 * 60 * 60 * 1000).toISOString() },
        overrideAccess: true,
      })

      const refundRequest = (body: Record<string, unknown>) =>
        new Request('http://localhost:3000/api/v1/admin/refunds', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })

      const asUser = (user: unknown) =>
        vi.spyOn(payload, 'auth').mockResolvedValueOnce({ user } as any)

      // Authorization is unchanged: unauthenticated 401, non-finance role 403.
      const anon = asUser(null)
      expect(
        (await postAdminRefund(refundRequest({ orderId, reason: 'x', faultBasis: 'SELLER' })))
          .status,
      ).toBe(401)
      anon.mockRestore()

      const asBuyer = asUser(buyerUser2)
      expect(
        (await postAdminRefund(refundRequest({ orderId, reason: 'x', faultBasis: 'SELLER' })))
          .status,
      ).toBe(403)
      asBuyer.mockRestore()

      // The fault basis is required and restricted to the two policy values.
      const missingBasis = asUser(financeAdminUser)
      const missingRes = await postAdminRefund(
        refundRequest({ orderId, reason: 'Thiếu cơ sở lỗi' }),
      )
      expect(missingRes.status).toBe(400)
      expect((await missingRes.json()).message).toMatch(/faultBasis/)
      missingBasis.mockRestore()

      const unknownBasis = asUser(financeAdminUser)
      expect(
        (
          await postAdminRefund(
            refundRequest({ orderId, reason: 'Cơ sở lỗi không hợp lệ', faultBasis: 'CHANGE_OF_MIND' }),
          )
        ).status,
      ).toBe(400)
      unknownBasis.mockRestore()

      // A stringly-typed override must not be coerced into authorising an out-of-window refund.
      const illTypedOverride = asUser(financeAdminUser)
      expect(
        (
          await postAdminRefund(
            refundRequest({
              orderId,
              reason: 'Cờ ghi đè không phải boolean',
              faultBasis: 'SELLER',
              overrideWindow: 'true',
            }),
          )
        ).status,
      ).toBe(400)
      illTypedOverride.mockRestore()

      // Out of window without the override: refused, and nothing moved.
      const noOverride = asUser(financeAdminUser)
      const noOverrideRes = await postAdminRefund(
        refundRequest({ orderId, reason: 'Ngoài cửa sổ 5 ngày', faultBasis: 'SELLER' }),
      )
      expect(noOverrideRes.status).toBe(400)
      expect((await noOverrideRes.json()).message).toMatch(/window/i)
      noOverride.mockRestore()
      expect(await refundLedgerRowsOf(purchase.orderCode)).toBe(0)

      // With the explicit override the same request executes and stamps the record.
      const withOverride = asUser(financeAdminUser)
      const okRes = await postAdminRefund(
        refundRequest({
          orderId,
          reason: 'Lỗi hệ thống phát hiện sau cửa sổ, người vận hành ghi đè',
          faultBasis: 'PLATFORM',
          overrideWindow: true,
        }),
      )
      expect(okRes.status).toBe(200)
      const okBody = await okRes.json()
      expect(okBody.data.faultBasis).toBe('PLATFORM')
      expect(okBody.data.outOfWindow).toBe(true)
      cleanup.refunds.push(okBody.data.refundId)
      withOverride.mockRestore()

      const refundDoc = (await payload.findByID({
        collection: 'refunds',
        id: okBody.data.refundId,
        overrideAccess: true,
      })) as any
      expect(refundDoc.faultBasis).toBe('PLATFORM')
      expect(refundDoc.outOfWindow).toBe(true)
      expect(
        (await payload.findByID({ collection: 'orders', id: orderId, overrideAccess: true })).status,
      ).toBe('REFUNDED')
    })
  })
})
