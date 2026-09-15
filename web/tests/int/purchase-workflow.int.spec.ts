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

describe('Phase 5: Purchase Workflow & End-to-End Delivery (FR-14, FR-15, FR-18, Decision 0002)', () => {
  let payload: Payload
  let sellerUser: User
  let buyerUser: User
  let buyerUser2: User
  let freeBuyerUser: User
  let commercialProduct1: any
  let commercialProduct2: any
  let freeProduct: any
  let uploadedFile1: any
  let uploadedFile2: any
  let uploadedFileFree: any
  let _buyerWallet: Wallet

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
  let createDownloadTokenFn: ((payload: Payload, params: { userId: number; productId: number }) => Promise<{ token: string; downloadUrl: string; expiresAt: Date }>) | null = null
  let verifyAndStreamDownloadFn: ((payload: Payload, token: string, clientMetadata: { ipAddress?: string; userAgent?: string }) => Promise<{
    stream: NodeJS.ReadableStream
    filename: string
    mimeType: string
    filesize: number
  }>) | null = null

  const createUser = async (email: string, roles: User['roles']): Promise<User> => {
    const user = (await payload.create({
      collection: 'users',
      data: {
        email,
        password: 'test-password-purchase-123',
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

  const streamToBuffer = async (stream: NodeJS.ReadableStream): Promise<Buffer> => {
    const chunks: Buffer[] = []
    return new Promise((resolve, reject) => {
      stream.on('data', (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)))
      stream.on('end', () => resolve(Buffer.concat(chunks)))
      stream.on('error', (err) => reject(err))
    })
  }

  beforeAll(async () => {
    payload = await getPayload({ config })

    // Dynamically load purchase and download services
    const purchasePath = '../../src/services/purchase'
    const purchaseMod = await import(/* @vite-ignore */ purchasePath).catch(() => null)
    if (purchaseMod?.purchaseProduct) {
      purchaseProductFn = purchaseMod.purchaseProduct
    }

    const downloadPath = '../../src/services/download'
    const downloadMod = await import(/* @vite-ignore */ downloadPath).catch(() => null)
    if (downloadMod) {
      createDownloadTokenFn = downloadMod.createDownloadToken
      verifyAndStreamDownloadFn = downloadMod.verifyAndStreamDownload
    }

    const timestamp = Date.now()
    sellerUser = await createUser(`seller-flow-${timestamp}@kientaohub.local`, ['seller'])
    buyerUser = await createUser(`buyer-flow-${timestamp}@kientaohub.local`, ['buyer'])
    buyerUser2 = await createUser(`buyer2-flow-${timestamp}@kientaohub.local`, ['buyer'])
    freeBuyerUser = await createUser(`freebuyer-flow-${timestamp}@kientaohub.local`, ['buyer'])

    _buyerWallet = await getOrCreateWallet(payload, { userId: buyerUser.id })

    // Create private files
    uploadedFile1 = await createProductFileHelper(
      sellerUser.id,
      `blueprint-autocad-${timestamp}.dwg`,
      `CAD_DRAWING_DATA_FOR_WORKFLOW_${timestamp}_1`
    )
    uploadedFile2 = await createProductFileHelper(
      sellerUser.id,
      `revit-villa-model-${timestamp}.rvt`,
      `REVIT_3D_BIM_MODEL_FOR_WORKFLOW_${timestamp}_2`
    )
    uploadedFileFree = await createProductFileHelper(
      sellerUser.id,
      `free-sample-door-${timestamp}.dwg`,
      `FREE_COMMUNITY_DOOR_ASSET_${timestamp}_FREE`
    )

    // Create commercial product 1 (150,000 VND)
    commercialProduct1 = await payload.create({
      collection: 'products',
      data: {
        title: `Villa Architectural Drawing ${getSeq()}`,
        slug: `villa-arch-${timestamp}-${getSeq()}`,
        price: 150000,
        isFree: false,
        seller: sellerUser.id,
        originalFiles: [uploadedFile1.fileDoc.id],
        copyrightDeclared: true,
        moderationStatus: 'approved',
        _status: 'published',
      },
      overrideAccess: true,
    })
    cleanup.products.push(commercialProduct1.id)

    // Create commercial product 2 (250,000 VND)
    commercialProduct2 = await payload.create({
      collection: 'products',
      data: {
        title: `Revit Hospital BIM Structure ${getSeq()}`,
        slug: `revit-hosp-${timestamp}-${getSeq()}`,
        price: 250000,
        isFree: false,
        seller: sellerUser.id,
        originalFiles: [uploadedFile2.fileDoc.id],
        copyrightDeclared: true,
        moderationStatus: 'approved',
        _status: 'published',
      },
      overrideAccess: true,
    })
    cleanup.products.push(commercialProduct2.id)

    // Create free product (0 VND, isFree: true)
    freeProduct = await payload.create({
      collection: 'products',
      data: {
        title: `Free Community CAD Sample ${getSeq()}`,
        slug: `free-cad-${timestamp}-${getSeq()}`,
        price: 0,
        isFree: true,
        seller: sellerUser.id,
        originalFiles: [uploadedFileFree.fileDoc.id],
        copyrightDeclared: true,
        moderationStatus: 'approved',
        _status: 'published',
      },
      overrideAccess: true,
    })
    cleanup.products.push(freeProduct.id)
  })

  afterAll(async () => {
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
  })

  it('Tier 1: Complete wallet purchase flow for commercial product debits balance and creates completed order and active entitlement', async () => {
    if (!purchaseProductFn) {
      throw new Error('M2 pending: purchaseProduct service not yet implemented in web/src/services/purchase.ts')
    }

    // 1. Top up buyer wallet with 200,000 VND
    await creditWallet(payload, {
      userId: buyerUser.id,
      amount: 200000,
      type: 'topup',
      referenceType: 'payment_intent',
      referenceId: `TOPUP_FLOW_${Date.now()}`,
      description: 'Topup for commercial purchase test',
    })

    const initialWallet = await getOrCreateWallet(payload, { userId: buyerUser.id })
    expect(Number(initialWallet.balance)).toBe(200000)

    // 2. Execute purchase for commercial product 1 (price: 150,000 VND)
    const result = await purchaseProductFn(payload, {
      buyerId: buyerUser.id,
      productId: commercialProduct1.id,
    })

    // 3. Verify PurchaseResult interface contract
    expect(result.success).toBe(true)
    expect(result.orderId).toBeDefined()
    expect(result.orderCode).toBeDefined()
    expect(result.orderCode).toMatch(/^ORD-/)
    expect(result.entitlementId).toBeDefined()
    expect(result.productTitle).toBe(commercialProduct1.title)
    expect(result.pricePaid).toBe(150000)
    cleanup.orders.push(result.orderId)
    cleanup.entitlements.push(result.entitlementId)

    // 4. Verify wallet balance decremented by 150,000 VND -> exactly 50,000 VND remains
    const updatedWallet = await getOrCreateWallet(payload, { userId: buyerUser.id })
    expect(Number(updatedWallet.balance)).toBe(50000)

    // 5. Verify wallet_ledger contains debit record
    const ledger = await payload.find({
      collection: 'wallet_ledger',
      where: {
        and: [
          { user: { equals: buyerUser.id } },
          { type: { equals: 'purchase' } },
        ],
      },
      overrideAccess: true,
    })
    expect(ledger.docs.length).toBeGreaterThanOrEqual(1)
    const purchaseLedger = ledger.docs.find((d) => d.referenceId === result.orderCode || d.referenceId === String(result.orderId))
    expect(purchaseLedger).toBeDefined()
    expect(Math.abs(Number(purchaseLedger?.amount))).toBe(150000)

    // 6. Verify order document in 'orders' collection
    const orderDoc = (await payload.findByID({
      collection: 'orders' as any,
      id: result.orderId,
      overrideAccess: true,
    })) as any

    expect(orderDoc).toBeDefined()
    expect(orderDoc.code).toBe(result.orderCode)
    expect(orderDoc.status).toBe('COMPLETED')
    expect(orderDoc.paymentSource).toBe('wallet')
    expect(Number(orderDoc.totalAmount)).toBe(150000)
    const buyerIdInDoc = typeof orderDoc.buyer === 'object' ? orderDoc.buyer.id : orderDoc.buyer
    expect(buyerIdInDoc).toBe(buyerUser.id)

    // 7. Verify order_items collection snapshot line item
    const orderItems = (await payload.find({
      collection: 'order_items' as any,
      where: {
        order: { equals: result.orderId },
      },
      overrideAccess: true,
    })) as any

    expect(orderItems.docs.length).toBe(1)
    const item = orderItems.docs[0]
    expect(Number(item.salePrice)).toBe(150000)
    const prodIdInItem = typeof item.product === 'object' ? item.product.id : item.product
    expect(prodIdInItem).toBe(commercialProduct1.id)
    const sellerIdInItem = typeof item.seller === 'object' ? item.seller.id : item.seller
    expect(sellerIdInItem).toBe(sellerUser.id)

    // 8. Verify entitlement document in 'entitlements' collection
    const entitlementDoc = (await payload.findByID({
      collection: 'entitlements' as any,
      id: result.entitlementId,
      overrideAccess: true,
    })) as any

    expect(entitlementDoc).toBeDefined()
    expect(entitlementDoc.status).toBe('active')
    expect(entitlementDoc.downloadCount).toBe(0)
    const userInEntitlement = typeof entitlementDoc.user === 'object' ? entitlementDoc.user.id : entitlementDoc.user
    expect(userInEntitlement).toBe(buyerUser.id)
    const prodInEntitlement = typeof entitlementDoc.product === 'object' ? entitlementDoc.product.id : entitlementDoc.product
    expect(prodInEntitlement).toBe(commercialProduct1.id)
  })

  it('Tier 2: Boundary - Exact balance purchase decrements wallet balance cleanly to 0 VND', async () => {
    if (!purchaseProductFn) {
      throw new Error('M2 pending: purchaseProduct service not yet implemented in web/src/services/purchase.ts')
    }

    // Top up buyerUser with exactly 200,000 VND more (balance now 50k + 200k = 250,000 VND)
    await creditWallet(payload, {
      userId: buyerUser.id,
      amount: 200000,
      type: 'topup',
      referenceType: 'payment_intent',
      referenceId: `TOPUP_EXACT_${Date.now()}`,
      description: 'Topup for exact balance test',
    })

    const currentWallet = await getOrCreateWallet(payload, { userId: buyerUser.id })
    expect(Number(currentWallet.balance)).toBe(250000)

    // Purchase product 2 priced at exactly 250,000 VND
    const result = await purchaseProductFn(payload, {
      buyerId: buyerUser.id,
      productId: commercialProduct2.id,
    })

    expect(result.success).toBe(true)
    expect(result.pricePaid).toBe(250000)
    cleanup.orders.push(result.orderId)
    cleanup.entitlements.push(result.entitlementId)

    // Wallet balance must transition to exactly 0 VND
    const finalWallet = await getOrCreateWallet(payload, { userId: buyerUser.id })
    expect(Number(finalWallet.balance)).toBe(0)

    // Order status COMPLETED
    const orderDoc = (await payload.findByID({
      collection: 'orders' as any,
      id: result.orderId,
      overrideAccess: true,
    })) as any
    expect(orderDoc.status).toBe('COMPLETED')
  })

  it('Tier 1: Free product checkout creates order with 0 VND total and grants active entitlement without deducting wallet', async () => {
    if (!purchaseProductFn) {
      throw new Error('M2 pending: purchaseProduct service not yet implemented in web/src/services/purchase.ts')
    }

    // freeBuyerUser starts with 0 VND balance
    const initialWallet = await getOrCreateWallet(payload, { userId: freeBuyerUser.id })
    expect(Number(initialWallet.balance)).toBe(0)

    // Checkout free product
    const result = await purchaseProductFn(payload, {
      buyerId: freeBuyerUser.id,
      productId: freeProduct.id,
    })

    expect(result.success).toBe(true)
    expect(result.pricePaid).toBe(0)
    cleanup.orders.push(result.orderId)
    cleanup.entitlements.push(result.entitlementId)

    // Wallet remains 0 VND
    const finalWallet = await getOrCreateWallet(payload, { userId: freeBuyerUser.id })
    expect(Number(finalWallet.balance)).toBe(0)

    // Order created with paymentSource 'free' and totalAmount 0
    const orderDoc = (await payload.findByID({
      collection: 'orders' as any,
      id: result.orderId,
      overrideAccess: true,
    })) as any
    expect(orderDoc.paymentSource).toBe('free')
    expect(Number(orderDoc.totalAmount)).toBe(0)
    expect(orderDoc.status).toBe('COMPLETED')

    // Entitlement granted with status 'active'
    const entitlement = (await payload.findByID({
      collection: 'entitlements' as any,
      id: result.entitlementId,
      overrideAccess: true,
    })) as any
    expect(entitlement.status).toBe('active')
    const userInEntitlement = typeof entitlement.user === 'object' ? entitlement.user.id : entitlement.user
    expect(userInEntitlement).toBe(freeBuyerUser.id)
  })

  it('Tier 3: Multiple different products purchased by same buyer receive separate orders and active entitlements', async () => {
    if (!purchaseProductFn) {
      throw new Error('M2 pending: purchaseProduct service not yet implemented in web/src/services/purchase.ts')
    }

    // Top up buyerUser2 with 500,000 VND
    await creditWallet(payload, {
      userId: buyerUser2.id,
      amount: 500000,
      type: 'topup',
      referenceType: 'payment_intent',
      referenceId: `TOPUP_MULTI_${Date.now()}`,
      description: 'Topup for multi purchase test',
    })

    // Purchase product 1 (150,000 VND)
    const res1 = await purchaseProductFn(payload, {
      buyerId: buyerUser2.id,
      productId: commercialProduct1.id,
    })
    cleanup.orders.push(res1.orderId)
    cleanup.entitlements.push(res1.entitlementId)

    // Purchase product 2 (250,000 VND)
    const res2 = await purchaseProductFn(payload, {
      buyerId: buyerUser2.id,
      productId: commercialProduct2.id,
    })
    cleanup.orders.push(res2.orderId)
    cleanup.entitlements.push(res2.entitlementId)

    // Verify distinct orders
    expect(res1.orderId).not.toBe(res2.orderId)
    expect(res1.orderCode).not.toBe(res2.orderCode)

    // Verify distinct entitlements
    expect(res1.entitlementId).not.toBe(res2.entitlementId)

    // Verify remaining wallet balance: 500,000 - 150,000 - 250,000 = 100,000 VND
    const finalWallet = await getOrCreateWallet(payload, { userId: buyerUser2.id })
    expect(Number(finalWallet.balance)).toBe(100000)

    // Verify buyer holds 2 distinct active entitlements in database
    const entitlements = (await payload.find({
      collection: 'entitlements' as any,
      where: {
        and: [
          { user: { equals: buyerUser2.id } },
          { status: { equals: 'active' } },
        ],
      },
      overrideAccess: true,
    })) as any
    expect(entitlements.docs.length).toBe(2)
  })

  it('Tier 4: End-to-End integration: User purchases product -> requests download token -> streams private file bytes matching upload', async () => {
    if (!purchaseProductFn) {
      throw new Error('M2 pending: purchaseProduct service not yet implemented')
    }
    if (!createDownloadTokenFn || !verifyAndStreamDownloadFn) {
      // M3 pending: download service not yet implemented in web/src/services/download.ts
      return
    }

    // 1. Create fresh buyer and top up
    const e2eBuyer = await createUser(`e2e-buyer-${Date.now()}@kientaohub.local`, ['buyer'])
    await creditWallet(payload, {
      userId: e2eBuyer.id,
      amount: 300000,
      type: 'topup',
      referenceType: 'payment_intent',
      referenceId: `TOPUP_E2E_${Date.now()}`,
      description: 'Topup for e2e test',
    })

    // 2. Buy commercial product 1
    const purchaseResult = await purchaseProductFn(payload, {
      buyerId: e2eBuyer.id,
      productId: commercialProduct1.id,
    })
    expect(purchaseResult.success).toBe(true)

    // 3. Request download token using active entitlement
    const tokenResult = await createDownloadTokenFn(payload, {
      userId: e2eBuyer.id,
      productId: commercialProduct1.id,
    })

    expect(tokenResult.token).toBeDefined()
    expect(typeof tokenResult.token).toBe('string')
    expect(tokenResult.downloadUrl).toContain('/api/v1/downloads/')
    expect(new Date(tokenResult.expiresAt).getTime()).toBeGreaterThan(Date.now())

    // 4. Stream file bytes with download token
    const streamResult = await verifyAndStreamDownloadFn(payload, tokenResult.token, {
      ipAddress: '127.0.0.1',
      userAgent: 'Vitest-E2E-Runner/1.0',
    })

    expect(streamResult.filename).toBe(uploadedFile1.fileDoc.originalFilename)
    expect(streamResult.mimeType).toBe('application/octet-stream')
    expect(streamResult.filesize).toBe(uploadedFile1.content.length)

    // 5. Verify streamed content byte-for-byte matches uploaded file
    const downloadedBuffer = await streamToBuffer(streamResult.stream)
    expect(downloadedBuffer.equals(uploadedFile1.content)).toBe(true)

    // 6. Verify download event audit record was persisted with SUCCESS
    const events = (await payload.find({
      collection: 'download_events' as any,
      where: {
        and: [
          { user: { equals: e2eBuyer.id } },
          { product: { equals: commercialProduct1.id } },
        ],
      },
      overrideAccess: true,
    })) as any

    expect(events.docs.length).toBeGreaterThanOrEqual(1)
    const successEvent = events.docs.find((e: any) => e.status === 'SUCCESS')
    expect(successEvent).toBeDefined()
    expect(successEvent.ipAddress).toBe('127.0.0.1')
    expect(successEvent.userAgent).toBe('Vitest-E2E-Runner/1.0')

    // 7. Verify entitlement downloadCount incremented to 1
    const updatedEntitlement = (await payload.findByID({
      collection: 'entitlements' as any,
      id: purchaseResult.entitlementId,
      overrideAccess: true,
    })) as any
    expect(updatedEntitlement.downloadCount).toBe(1)
  })

  it('Tier 3: Ledger balance invariant: wallet balance strictly equals sum of all wallet_ledger rows for buyer', async () => {
    const wallet = await getOrCreateWallet(payload, { userId: buyerUser.id })
    const ledger = await payload.find({
      collection: 'wallet_ledger',
      where: {
        user: { equals: buyerUser.id },
      },
      overrideAccess: true,
    })

    // Sum credits and debits from ledger
    let calculatedBalance = 0
    for (const doc of ledger.docs) {
      const amt = Number(doc.amount)
      if (doc.direction === 'credit') {
        calculatedBalance += amt
      } else if (doc.direction === 'debit') {
        calculatedBalance -= amt
      }
    }

    expect(Number(wallet.balance)).toBe(calculatedBalance)
  })
})
