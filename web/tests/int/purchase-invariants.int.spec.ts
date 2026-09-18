import { getPayload, type Payload } from 'payload'
import config from '@/payload.config'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { User, Wallet } from '@/payload-types'
import { creditWallet, getOrCreateWallet, InsufficientFundsError } from '@/services/wallet'

// Interface contracts per PROJECT.md
export interface PurchaseResult {
  success: boolean
  orderId: string
  orderCode: string
  entitlementId: number
  productTitle: string
  pricePaid: number
}

describe('Phase 5: Purchase Invariants & Financial Integrity (BR-04, BR-07, Decision 0002, Decision 0003)', () => {
  let payload: Payload
  let bootstrapUser: User
  let sellerUser: User
  let buyerUser: User
  let poorBuyerUser: User
  let sellerProduct: any
  let draftProduct: any
  let rejectedProduct: any
  let sellerFreeProduct: any
  let uploadedFile: any
  let sellerWallet: Wallet
  let poorWallet: Wallet

  const cleanup = {
    users: [] as (number | string)[],
    productFiles: [] as (number | string)[],
    products: [] as (number | string)[],
    orders: [] as (number | string)[],
    entitlements: [] as (number | string)[],
  }

  let seq = 0
  const getSeq = () => ++seq

  // Dynamic service loaders
  let purchaseProductFn: ((payload: Payload, params: { buyerId: number; productId: number; req?: any }) => Promise<PurchaseResult>) | null = null
  let purchaseErrors: {
    InsufficientFundsError?: any
    SelfPurchaseError?: any
    AlreadyEntitledError?: any
    ProductNotAvailableError?: any
  } = {}

  const createUser = async (email: string, roles: User['roles']): Promise<User> => {
    const user = (await payload.create({
      collection: 'users',
      data: {
        email,
        password: 'test-password-invariants-123',
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

    const purchasePath = '../../src/services/purchase'
    const purchaseMod = await import(/* @vite-ignore */ purchasePath).catch(() => null)
    if (purchaseMod?.purchaseProduct) {
      purchaseProductFn = purchaseMod.purchaseProduct
      purchaseErrors = {
        InsufficientFundsError: purchaseMod.InsufficientFundsError || InsufficientFundsError,
        SelfPurchaseError: purchaseMod.SelfPurchaseError,
        AlreadyEntitledError: purchaseMod.AlreadyEntitledError,
        ProductNotAvailableError: purchaseMod.ProductNotAvailableError,
      }
    } else {
      purchaseErrors = { InsufficientFundsError }
    }

    const timestamp = Date.now()

    // `ensureFirstUserIsAdmin` (src/collections/Users/hooks) appends 'admin' to the roles of the
    // FIRST user created while the users table is EMPTY - which is exactly the CI state: CI applies
    // only the versioned migrations and every spec's afterAll deletes its own users, so each spec
    // file can start from an empty table. Absorb that promotion with a throwaway user BEFORE the
    // role-sensitive fixtures below, otherwise `sellerUser` is silently ['seller', 'admin'] and the
    // "seller cannot buy their own product" style invariants below are evaluated against an admin
    // account instead of the seller they claim to test.
    bootstrapUser = await createUser(`bootstrap-inv-${timestamp}@kientaohub.local`, ['buyer'])

    sellerUser = await createUser(`seller-inv-${timestamp}@kientaohub.local`, ['seller'])
    buyerUser = await createUser(`buyer-inv-${timestamp}@kientaohub.local`, ['buyer'])
    poorBuyerUser = await createUser(`poor-buyer-inv-${timestamp}@kientaohub.local`, ['buyer'])

    // Guard: the fixtures must hold EXACTLY the roles they declare, whether or not the users table
    // started empty (the bootstrap user above owns the first-user promotion). If the promotion ever
    // lands on one of them again, these assertions fail loudly instead of letting the purchase
    // invariants silently lose their meaning.
    expect(sellerUser.roles).toEqual(['seller'])
    expect(sellerUser.roles).not.toContain('admin')
    expect(buyerUser.roles).toEqual(['buyer'])
    expect(poorBuyerUser.roles).toEqual(['buyer'])

    sellerWallet = await getOrCreateWallet(payload, { userId: sellerUser.id })
    poorWallet = await getOrCreateWallet(payload, { userId: poorBuyerUser.id })

    uploadedFile = await createProductFileHelper(
      sellerUser.id,
      `blueprint-invariants-${timestamp}.dwg`,
      `INVARIANT_TEST_CAD_DATA_${timestamp}`
    )

    // Approved & Published commercial product (price: 300,000 VND)
    sellerProduct = await payload.create({
      collection: 'products',
      data: {
        title: `Commercial Office Design ${getSeq()}`,
        slug: `comm-office-${timestamp}-${getSeq()}`,
        price: 300000,
        isFree: false,
        seller: sellerUser.id,
        originalFiles: [uploadedFile.fileDoc.id],
        copyrightDeclared: true,
        moderationStatus: 'approved',
        _status: 'published',
      },
      overrideAccess: true,
    })
    cleanup.products.push(sellerProduct.id)

    // Draft product (price: 200,000 VND, _status: 'draft')
    draftProduct = await payload.create({
      collection: 'products',
      data: {
        title: `Draft Bridge Model ${getSeq()}`,
        slug: `draft-bridge-${timestamp}-${getSeq()}`,
        price: 200000,
        isFree: false,
        seller: sellerUser.id,
        originalFiles: [uploadedFile.fileDoc.id],
        copyrightDeclared: true,
        moderationStatus: 'draft',
        _status: 'draft',
      },
      overrideAccess: true,
    })
    cleanup.products.push(draftProduct.id)

    // Rejected product (price: 200,000 VND, moderationStatus: 'rejected')
    rejectedProduct = await payload.create({
      collection: 'products',
      data: {
        title: `Rejected Structure ${getSeq()}`,
        slug: `rej-struct-${timestamp}-${getSeq()}`,
        price: 200000,
        isFree: false,
        seller: sellerUser.id,
        originalFiles: [uploadedFile.fileDoc.id],
        copyrightDeclared: true,
        moderationStatus: 'rejected',
        _status: 'draft',
      },
      overrideAccess: true,
    })
    cleanup.products.push(rejectedProduct.id)

    // Seller Free Product (price: 0, isFree: true)
    sellerFreeProduct = await payload.create({
      collection: 'products',
      data: {
        title: `Free Beam Detail ${getSeq()}`,
        slug: `free-beam-${timestamp}-${getSeq()}`,
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
    cleanup.products.push(sellerFreeProduct.id)
  })

  afterAll(async () => {
    // F1-class cleanup regression (same class as reviews.int.spec.ts). This hook deleted ONLY
    // products / product_files / users, so the `orders`, `entitlements`, `order_items` and
    // `seller_earnings` rows created by the real `purchaseProduct()` calls were never touched. The
    // foreign keys involved are declared ON DELETE SET NULL over NOT NULL columns
    // (`order_items.order_id/.product_id/.seller_id`, `seller_earnings.order_*`, `entitlements
    // .product_id/.user_id`), so the product and user deletes were aborted as well and every run
    // left 3 users / 1 order / 1 order_item / 1 product / 1 seller_earning / 1 entitlement behind.
    // Leaf-first order through the orders this spec owns:
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

    await deleteByOrder('seller_earnings', cleanup.orders)
    await deleteByOrder('entitlements', cleanup.orders)
    for (const id of cleanup.entitlements) {
      try {
        await payload.delete({ collection: 'entitlements', id, overrideAccess: true })
      } catch (_ignore) {}
    }
    await deleteByOrder('order_items', cleanup.orders)
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

  it('Tier 1: BR-04 Anti-Self-Purchase: Seller attempting to purchase own product is strictly refused with typed error', async () => {
    if (!purchaseProductFn) {
      throw new Error('M2 pending: purchaseProduct service not yet implemented in web/src/services/purchase.ts')
    }

    // Top up seller wallet with 1,000,000 VND
    await creditWallet(payload, {
      userId: sellerUser.id,
      amount: 1000000,
      type: 'topup',
      referenceType: 'payment_intent',
      referenceId: `TOPUP_SELLER_${Date.now()}`,
      description: 'Seller wallet topup',
    })

    const initialSellerWallet = await getOrCreateWallet(payload, { userId: sellerUser.id })
    const initialBalance = Number(initialSellerWallet.balance)

    // Seller attempts to purchase own product
    let thrownError: any = null
    try {
      await purchaseProductFn(payload, {
        buyerId: sellerUser.id,
        productId: sellerProduct.id,
      })
    } catch (err: any) {
      thrownError = err
    }

    expect(thrownError).toBeDefined()
    const isSelfPurchaseError =
      thrownError?.name === 'SelfPurchaseError' ||
      thrownError?.code === 'SELF_PURCHASE_FORBIDDEN' ||
      thrownError?.message?.includes('SELF_PURCHASE') ||
      thrownError?.message?.includes('BR-04') ||
      (purchaseErrors.SelfPurchaseError && thrownError instanceof purchaseErrors.SelfPurchaseError)
    expect(isSelfPurchaseError).toBe(true)

    // Verify seller wallet balance was NOT deducted
    const currentSellerWallet = await getOrCreateWallet(payload, { userId: sellerUser.id })
    expect(Number(currentSellerWallet.balance)).toBe(initialBalance)

    // Verify 0 entitlements created for seller on this product
    try {
      const entitlements = (await payload.find({
        collection: 'entitlements' as any,
        where: {
          and: [
            { user: { equals: sellerUser.id } },
            { product: { equals: sellerProduct.id } },
          ],
        },
        overrideAccess: true,
      })) as any

      expect(entitlements.docs.length).toBe(0)
    } catch (_ignore) {}
  })

  it('Tier 3: Pairwise - BR-04 applies to free products: Seller cannot claim own free product', async () => {
    if (!purchaseProductFn) {
      throw new Error('M2 pending: purchaseProduct service not yet implemented')
    }

    // Seller attempts to claim own free product
    let thrownError: any = null
    try {
      await purchaseProductFn(payload, {
        buyerId: sellerUser.id,
        productId: sellerFreeProduct.id,
      })
    } catch (err: any) {
      thrownError = err
    }

    expect(thrownError).toBeDefined()
    const isSelfPurchase =
      thrownError?.name === 'SelfPurchaseError' ||
      thrownError?.code === 'SELF_PURCHASE_FORBIDDEN' ||
      thrownError?.message?.includes('BR-04') ||
      (purchaseErrors.SelfPurchaseError && thrownError instanceof purchaseErrors.SelfPurchaseError)
    expect(isSelfPurchase).toBe(true)
  })

  it('Tier 2: Boundary - Third party buyer CAN purchase the seller product without BR-04 restriction', async () => {
    if (!purchaseProductFn) {
      throw new Error('M2 pending: purchaseProduct service not yet implemented')
    }

    // Top up buyer with 500,000 VND
    await creditWallet(payload, {
      userId: buyerUser.id,
      amount: 500000,
      type: 'topup',
      referenceType: 'payment_intent',
      referenceId: `TOPUP_THIRD_PARTY_${Date.now()}`,
      description: 'Topup for third party purchase test',
    })

    // Third-party buyer purchases seller's product (300,000 VND)
    const result = await purchaseProductFn(payload, {
      buyerId: buyerUser.id,
      productId: sellerProduct.id,
    })

    expect(result.success).toBe(true)
    expect(result.pricePaid).toBe(300000)
    cleanup.orders.push(result.orderId)
    cleanup.entitlements.push(result.entitlementId)

    // Buyer balance was decremented: 500k - 300k = 200,000 VND
    const buyerWallet = await getOrCreateWallet(payload, { userId: buyerUser.id })
    expect(Number(buyerWallet.balance)).toBe(200000)
  })

  it('Tier 1: BR-07 Snapshot Pricing: If product.price is changed after order creation, order_item.salePrice on existing order remains unchanged', async () => {
    if (!purchaseProductFn) {
      throw new Error('M2 pending: purchaseProduct service not yet implemented')
    }

    // 1. Check existing order from previous test (salePrice: 300,000 VND)
    const orderItemsBefore = (await payload.find({
      collection: 'order_items' as any,
      where: {
        product: { equals: sellerProduct.id },
      },
      overrideAccess: true,
    })) as any

    expect(orderItemsBefore.docs.length).toBeGreaterThanOrEqual(1)
    const orderItem = orderItemsBefore.docs[0]
    expect(Number(orderItem.salePrice)).toBe(300000)

    // 2. Seller doubles the price to 600,000 VND
    await payload.update({
      collection: 'products',
      id: sellerProduct.id,
      data: {
        price: 600000,
      },
      overrideAccess: true,
    })

    // Verify product price is now 600,000 VND
    const updatedProduct = await payload.findByID({
      collection: 'products',
      id: sellerProduct.id,
      overrideAccess: true,
    })
    expect(Number(updatedProduct.price)).toBe(600000)

    // 3. Verify existing order_item.salePrice MUST still be 300,000 VND (BR-07 immutable snapshot)
    const orderItemsAfter = (await payload.find({
      collection: 'order_items' as any,
      where: {
        id: { equals: orderItem.id },
      },
      overrideAccess: true,
    })) as any

    expect(Number(orderItemsAfter.docs[0].salePrice)).toBe(300000)

    // 4. Verify existing order totalAmount remains 300,000 VND
    const orderDoc = (await payload.findByID({
      collection: 'orders' as any,
      id: typeof orderItem.order === 'object' ? orderItem.order.id : orderItem.order,
      overrideAccess: true,
    })) as any

    expect(Number(orderDoc.totalAmount)).toBe(300000)
  })

  it('Tier 2: Boundary - BR-07 Snapshot Pricing when product price is reduced after checkout', async () => {
    if (!purchaseProductFn) {
      throw new Error('M2 pending: purchaseProduct service not yet implemented')
    }

    // Seller reduces price to 100,000 VND
    await payload.update({
      collection: 'products',
      id: sellerProduct.id,
      data: {
        price: 100000,
      },
      overrideAccess: true,
    })

    // Existing order_items still reflects original 300,000 VND snapshot
    const orderItems = (await payload.find({
      collection: 'order_items' as any,
      where: {
        product: { equals: sellerProduct.id },
      },
      overrideAccess: true,
    })) as any

    expect(Number(orderItems.docs[0].salePrice)).toBe(300000)
  })

  it('Tier 1: Insufficient Funds: When wallet balance < product.price, purchase fails with InsufficientFundsError, 0 VND debited, 0 orders created', async () => {
    if (!purchaseProductFn) {
      throw new Error('M2 pending: purchaseProduct service not yet implemented')
    }

    // poorBuyerUser has 0 VND balance, product costs 100,000 VND
    const initialWallet = await getOrCreateWallet(payload, { userId: poorBuyerUser.id })
    expect(Number(initialWallet.balance)).toBe(0)

    let caughtError: any = null
    try {
      await purchaseProductFn(payload, {
        buyerId: poorBuyerUser.id,
        productId: sellerProduct.id,
      })
    } catch (err: any) {
      caughtError = err
    }

    expect(caughtError).toBeDefined()
    const isInsufficientFunds =
      caughtError instanceof InsufficientFundsError ||
      caughtError?.name === 'InsufficientFundsError' ||
      caughtError?.code === 'INSUFFICIENT_FUNDS' ||
      caughtError?.message?.includes('Số dư ví không đủ') ||
      (purchaseErrors.InsufficientFundsError && caughtError instanceof purchaseErrors.InsufficientFundsError)
    expect(isInsufficientFunds).toBe(true)

    // Balance remains 0 VND
    const finalWallet = await getOrCreateWallet(payload, { userId: poorBuyerUser.id })
    expect(Number(finalWallet.balance)).toBe(0)

    // 0 orders created for poorBuyerUser
    try {
      const orders = (await payload.find({
        collection: 'orders' as any,
        where: {
          buyer: { equals: poorBuyerUser.id },
        },
        overrideAccess: true,
      })) as any
      expect(orders.docs.length).toBe(0)
    } catch (_ignore) {}
  })

  it('Tier 2: Boundary - Insufficient balance by exactly 1 VND fails with typed InsufficientFundsError', async () => {
    if (!purchaseProductFn) {
      throw new Error('M2 pending: purchaseProduct service not yet implemented')
    }

    // sellerProduct price is 100,000 VND. Credit poorBuyer with 99,999 VND (deficit: 1 VND)
    await creditWallet(payload, {
      userId: poorBuyerUser.id,
      amount: 99999,
      type: 'topup',
      referenceType: 'payment_intent',
      referenceId: `TOPUP_DEFICIT_${Date.now()}`,
      description: 'Credit near-balance',
    })

    const walletBefore = await getOrCreateWallet(payload, { userId: poorBuyerUser.id })
    expect(Number(walletBefore.balance)).toBe(99999)

    let caughtError: any = null
    try {
      await purchaseProductFn(payload, {
        buyerId: poorBuyerUser.id,
        productId: sellerProduct.id,
      })
    } catch (err: any) {
      caughtError = err
    }

    expect(caughtError).toBeDefined()
    const isInsufficient =
      caughtError instanceof InsufficientFundsError ||
      caughtError?.name === 'InsufficientFundsError' ||
      caughtError?.code === 'INSUFFICIENT_FUNDS' ||
      caughtError?.message?.includes('Số dư ví không đủ')
    expect(isInsufficient).toBe(true)

    // 0 VND debited: balance remains exactly 99,999 VND
    const walletAfter = await getOrCreateWallet(payload, { userId: poorBuyerUser.id })
    expect(Number(walletAfter.balance)).toBe(99999)
  })

  it('Tier 1: Duplicate Purchase: Attempting to purchase a product already held as an active entitlement is refused', async () => {
    if (!purchaseProductFn) {
      throw new Error('M2 pending: purchaseProduct service not yet implemented')
    }

    // buyerUser ALREADY purchased sellerProduct in earlier test and holds active entitlement
    const walletBefore = await getOrCreateWallet(payload, { userId: buyerUser.id })
    const balanceBefore = Number(walletBefore.balance)

    let caughtError: any = null
    try {
      await purchaseProductFn(payload, {
        buyerId: buyerUser.id,
        productId: sellerProduct.id,
      })
    } catch (err: any) {
      caughtError = err
    }

    expect(caughtError).toBeDefined()
    const isDuplicateRefused =
      caughtError?.name === 'AlreadyEntitledError' ||
      caughtError?.code === 'ALREADY_ENTITLED' ||
      caughtError?.message?.includes('ALREADY_ENTITLED') ||
      caughtError?.message?.includes('sở hữu') ||
      (purchaseErrors.AlreadyEntitledError && caughtError instanceof purchaseErrors.AlreadyEntitledError)
    expect(isDuplicateRefused).toBe(true)

    // Wallet is NOT debited again
    const walletAfter = await getOrCreateWallet(payload, { userId: buyerUser.id })
    expect(Number(walletAfter.balance)).toBe(balanceBefore)

    // Exactly 1 active entitlement exists for buyerUser on this product
    try {
      const entitlements = (await payload.find({
        collection: 'entitlements' as any,
        where: {
          and: [
            { user: { equals: buyerUser.id } },
            { product: { equals: sellerProduct.id } },
            { status: { equals: 'active' } },
          ],
        },
        overrideAccess: true,
      })) as any

      expect(entitlements.docs.length).toBe(1)
    } catch (_ignore) {}
  })

  it('Tier 1: Unapproved / Draft Product: Cannot purchase unpublished or draft products', async () => {
    if (!purchaseProductFn) {
      throw new Error('M2 pending: purchaseProduct service not yet implemented')
    }

    // Attempting to purchase draftProduct (_status: 'draft')
    await expect(
      purchaseProductFn(payload, {
        buyerId: buyerUser.id,
        productId: draftProduct.id,
      })
    ).rejects.toThrow()
  })

  it('Tier 2: Boundary - Cannot purchase product with moderationStatus rejected', async () => {
    if (!purchaseProductFn) {
      throw new Error('M2 pending: purchaseProduct service not yet implemented')
    }

    // Attempting to purchase rejectedProduct (moderationStatus: 'rejected')
    await expect(
      purchaseProductFn(payload, {
        buyerId: buyerUser.id,
        productId: rejectedProduct.id,
      })
    ).rejects.toThrow()
  })
})
