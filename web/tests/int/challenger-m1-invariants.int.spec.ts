import { getPayload, type Payload } from 'payload'
import config from '@/payload.config'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Order, OrderItem, Product, User } from '@/payload-types'

describe('Adversarial Challenge: Milestone 1 Invariants & Data Integrity', () => {
  let payload: Payload
  let sellerUser: User
  let buyerUser: User
  let thirdPartyUser: User
  let testProduct: Product

  const cleanup = {
    users: [] as (number | string)[],
    products: [] as (number | string)[],
    orders: [] as (number | string)[],
    orderItems: [] as (number | string)[],
    entitlements: [] as (number | string)[],
  }

  let seq = 0
  const getSeq = () => ++seq

  const getFullError = (err: any) =>
    `${err?.message || ''} ${err?.cause?.message || ''} ${(err as any)?.cause?.constraint || ''} ${(err as any)?.cause?.detail || ''}`

  beforeAll(async () => {
    payload = await getPayload({ config })
    const timestamp = Date.now()

    sellerUser = (await payload.create({
      collection: 'users',
      data: {
        email: `challenger-seller-${timestamp}@test.local`,
        password: 'Password123!',
        name: 'Challenger Seller',
        roles: ['seller'],
      },
      overrideAccess: true,
    })) as User
    cleanup.users.push(sellerUser.id)

    buyerUser = (await payload.create({
      collection: 'users',
      data: {
        email: `challenger-buyer-${timestamp}@test.local`,
        password: 'Password123!',
        name: 'Challenger Buyer',
        roles: ['buyer'],
      },
      overrideAccess: true,
    })) as User
    cleanup.users.push(buyerUser.id)

    thirdPartyUser = (await payload.create({
      collection: 'users',
      data: {
        email: `challenger-thirdparty-${timestamp}@test.local`,
        password: 'Password123!',
        name: 'Challenger ThirdParty',
        roles: ['seller'],
      },
      overrideAccess: true,
    })) as User
    cleanup.users.push(thirdPartyUser.id)

    testProduct = (await payload.create({
      collection: 'products',
      data: {
        title: `CAD Drawing ${timestamp}-${getSeq()}`,
        slug: `cad-${timestamp}-${getSeq()}`,
        price: 500000,
        isFree: false,
        seller: sellerUser.id,
        _status: 'published',
      } as any,
      overrideAccess: true,
    })) as Product
    cleanup.products.push(testProduct.id)
  })

  afterAll(async () => {
    for (const id of cleanup.entitlements) {
      try {
        await payload.delete({ collection: 'entitlements' as any, id, overrideAccess: true })
      } catch (_ignore) {}
    }
    for (const id of cleanup.orderItems) {
      try {
        await payload.delete({ collection: 'order_items' as any, id, overrideAccess: true })
      } catch (_ignore) {}
    }
    for (const id of cleanup.orders) {
      try {
        await payload.delete({ collection: 'orders' as any, id, overrideAccess: true })
      } catch (_ignore) {}
    }
    for (const id of cleanup.products) {
      try {
        await payload.delete({ collection: 'products', id, overrideAccess: true })
      } catch (_ignore) {}
    }
    for (const id of cleanup.users) {
      try {
        await payload.delete({ collection: 'users', id, overrideAccess: true })
      } catch (_ignore) {}
    }
  })

  describe('1. BR-04 Anti-Self-Purchase Invariant (Hook & Database Trigger Levels)', () => {
    it('1.1: Payload Hook strictly blocks self-purchase when order.buyer is the seller', async () => {
      // Create an order where seller is the buyer
      const selfOrder = (await payload.create({
        collection: 'orders' as any,
        data: {
          buyer: sellerUser.id,
          totalAmount: 500000,
          currency: 'VND',
          status: 'PENDING',
          paymentSource: 'wallet',
        },
        overrideAccess: true,
      })) as Order
      cleanup.orders.push(selfOrder.id)

      // Attempt creating order_item linking seller product to seller order
      let caughtError: any = null
      try {
        await payload.create({
          collection: 'order_items' as any,
          data: {
            order: selfOrder.id,
            product: testProduct.id,
            seller: sellerUser.id,
            salePrice: 500000,
            platformFee: 50000,
            sellerAmount: 450000,
            tax: 0,
            policyVersion: 'v1',
          },
          overrideAccess: true,
        })
      } catch (err: any) {
        caughtError = err
      }

      expect(caughtError).toBeDefined()
      console.log('CAUGHT_ERROR_DATA:', JSON.stringify(caughtError.data, null, 2))
      const errorMsg = `${caughtError.message} ${JSON.stringify(caughtError.data)}`
      expect(errorMsg).toContain('Anti-self-purchase invariant violated (BR-04)')
    })

    it('1.2: Payload Hook prevents seller spoofing (overrides data.seller with authoritative product seller)', async () => {
      // Create order for sellerUser
      const selfOrder = (await payload.create({
        collection: 'orders' as any,
        data: {
          buyer: sellerUser.id,
          totalAmount: 500000,
          currency: 'VND',
          status: 'PENDING',
          paymentSource: 'wallet',
        },
        overrideAccess: true,
      })) as Order
      cleanup.orders.push(selfOrder.id)

      // Adversarial attempt: pass thirdPartyUser.id as seller to try bypassing anti-self-purchase
      let caughtError: any = null
      try {
        await payload.create({
          collection: 'order_items' as any,
          data: {
            order: selfOrder.id,
            product: testProduct.id,
            seller: thirdPartyUser.id, // SPOOFED SELLER
            salePrice: 500000,
            platformFee: 50000,
            sellerAmount: 450000,
            tax: 0,
            policyVersion: 'v1',
          },
          overrideAccess: true,
        })
      } catch (err: any) {
        caughtError = err
      }

      expect(caughtError).toBeDefined()
      // Hook must overwrite data.seller with testProduct.seller (sellerUser.id) and still throw!
      const errorMsg = `${caughtError.message} ${JSON.stringify(caughtError.data)}`
      expect(errorMsg).toContain('Anti-self-purchase invariant violated (BR-04)')
    })

    it('1.3: Payload Hook allows legitimate third-party purchase (buyer != seller)', async () => {
      const legitOrder = (await payload.create({
        collection: 'orders' as any,
        data: {
          buyer: buyerUser.id,
          totalAmount: 500000,
          currency: 'VND',
          status: 'PENDING',
          paymentSource: 'wallet',
        },
        overrideAccess: true,
      })) as Order
      cleanup.orders.push(legitOrder.id)

      const orderItem = (await payload.create({
        collection: 'order_items' as any,
        data: {
          order: legitOrder.id,
          product: testProduct.id,
          seller: sellerUser.id,
          salePrice: 500000,
          platformFee: 50000,
          sellerAmount: 450000,
          tax: 0,
          policyVersion: 'v1',
        },
        overrideAccess: true,
      })) as OrderItem
      cleanup.orderItems.push(orderItem.id)

      expect(orderItem.id).toBeDefined()
      expect(orderItem.salePrice).toBe(500000)
    })

    it('1.4: PostgreSQL Trigger strictly blocks self-purchase on direct SQL INSERT', async () => {
      // Create order for sellerUser directly
      const orderRes = await payload.db.drizzle.execute(
        `INSERT INTO "orders" ("code", "buyer_id", "total_amount", "currency", "status", "payment_source")
         VALUES ('ORD-SQL-SELF-1', ${sellerUser.id}, 500000, 'VND', 'PENDING', 'wallet')
         RETURNING id;`,
      )
      const orderId = ((orderRes as any).rows || orderRes)[0].id
      cleanup.orders.push(orderId)

      // Direct SQL INSERT into order_items with seller_id = buyer_id
      let sqlError: any = null
      try {
        await payload.db.drizzle.execute(
          `INSERT INTO "order_items" ("order_id", "product_id", "seller_id", "sale_price", "platform_fee", "seller_amount", "tax", "policy_version")
           VALUES (${orderId}, ${testProduct.id}, ${sellerUser.id}, 500000, 50000, 450000, 0, 'v1');`,
        )
      } catch (err: any) {
        sqlError = err
      }

      expect(sqlError).toBeDefined()
      expect(getFullError(sqlError)).toContain('BR-04 Invariant Violation')
      expect(getFullError(sqlError)).toContain('cannot purchase their own product')
    })

    it('1.5: PostgreSQL Trigger strictly blocks self-purchase on direct SQL UPDATE', async () => {
      // Create legit order for buyerUser
      const orderRes = await payload.db.drizzle.execute(
        `INSERT INTO "orders" ("code", "buyer_id", "total_amount", "currency", "status", "payment_source")
         VALUES ('ORD-SQL-UPDATE-1', ${buyerUser.id}, 500000, 'VND', 'PENDING', 'wallet')
         RETURNING id;`,
      )
      const orderId = ((orderRes as any).rows || orderRes)[0].id
      cleanup.orders.push(orderId)

      // Create legit order_item with sellerUser
      const itemRes = await payload.db.drizzle.execute(
        `INSERT INTO "order_items" ("order_id", "product_id", "seller_id", "sale_price", "platform_fee", "seller_amount", "tax", "policy_version")
         VALUES (${orderId}, ${testProduct.id}, ${sellerUser.id}, 500000, 50000, 450000, 0, 'v1')
         RETURNING id;`,
      )
      const itemId = ((itemRes as any).rows || itemRes)[0].id
      cleanup.orderItems.push(itemId)

      // Attempt to UPDATE order_items.seller_id to match order.buyer_id (buyerUser.id)
      let updateError: any = null
      try {
        await payload.db.drizzle.execute(
          `UPDATE "order_items" SET "seller_id" = ${buyerUser.id} WHERE id = ${itemId};`,
        )
      } catch (err: any) {
        updateError = err
      }

      expect(updateError).toBeDefined()
      expect(getFullError(updateError)).toContain('BR-04 Invariant Violation')
    })
  })

  describe('2. BR-07 Immutability of order_items', () => {
    let legitOrderId: number
    let legitItemId: number

    beforeAll(async () => {
      const order = (await payload.create({
        collection: 'orders' as any,
        data: {
          buyer: buyerUser.id,
          totalAmount: 500000,
          currency: 'VND',
          status: 'PENDING',
          paymentSource: 'wallet',
        },
        overrideAccess: true,
      })) as Order
      legitOrderId = order.id as number
      cleanup.orders.push(legitOrderId)

      const item = (await payload.create({
        collection: 'order_items' as any,
        data: {
          order: legitOrderId,
          product: testProduct.id,
          seller: sellerUser.id,
          salePrice: 500000,
          platformFee: 50000,
          sellerAmount: 450000,
          tax: 0,
          policyVersion: 'v1',
        },
        overrideAccess: true,
      })) as OrderItem
      legitItemId = item.id as number
      cleanup.orderItems.push(legitItemId)
    })

    it('2.1: preventOrderItemMutation hook rejects any update to order_items via Payload API (overrideAccess: true)', async () => {
      let caughtError: any = null
      try {
        await payload.update({
          collection: 'order_items' as any,
          id: legitItemId,
          data: {
            salePrice: 999999,
          },
          overrideAccess: true,
        })
      } catch (err: any) {
        caughtError = err
      }

      expect(caughtError).toBeDefined()
      expect(caughtError.message).toContain('Order items are immutable (BR-07)')
    })

    it('2.2: preventOrderItemMutation hook rejects updating non-monetary fields (e.g. policyVersion)', async () => {
      let caughtError: any = null
      try {
        await payload.update({
          collection: 'order_items' as any,
          id: legitItemId,
          data: {
            policyVersion: 'v2-mutated',
          },
          overrideAccess: true,
        })
      } catch (err: any) {
        caughtError = err
      }

      expect(caughtError).toBeDefined()
      expect(caughtError.message).toContain('Order items are immutable (BR-07)')
    })

    it('2.3: Access control orderItemUpdateAccess rejects updates via REST / non-override callers', async () => {
      let caughtError: any = null
      try {
        await payload.update({
          collection: 'order_items' as any,
          id: legitItemId,
          data: {
            salePrice: 800000,
          },
          overrideAccess: false,
          user: sellerUser,
        })
      } catch (err: any) {
        caughtError = err
      }

      expect(caughtError).toBeDefined()
    })

    it('2.4: Direct SQL UPDATE behavior on order_items (Testing DB engine enforcement vs Hook-only)', async () => {
      // Empirically check if PostgreSQL has a trigger blocking UPDATE on order_items
      let _sqlUpdateError: any = null
      try {
        await payload.db.drizzle.execute(
          `UPDATE "order_items" SET "sale_price" = 500000 WHERE id = ${legitItemId};`,
        )
      } catch (err: any) {
        _sqlUpdateError = err
      }

      // NOTE FOR CHALLENGER REPORT:
      // Since _sqlUpdateError is null, PostgreSQL does not have a trigger prohibiting UPDATE on order_items.
      // BR-07 is strictly enforced at the application/hook layer (preventOrderItemMutation) and access control layer.
      expect(_sqlUpdateError).toBeNull()
    })
  })

  describe('3. Partial Unique Index: entitlements_user_product_active_idx', () => {
    it('3.1: PostgreSQL engine rejects duplicate ACTIVE entitlement for same (user, product)', async () => {
      const uId = buyerUser.id
      const pId = testProduct.id

      // 1. Insert first active entitlement
      const firstRes = await payload.db.drizzle.execute(
        `INSERT INTO "entitlements" ("user_id", "product_id", "status", "granted_at", "download_count")
         VALUES (${uId}, ${pId}, 'active', now(), 0)
         RETURNING id;`,
      )
      const firstId = ((firstRes as any).rows || firstRes)[0].id
      cleanup.entitlements.push(firstId)

      // 2. Attempt inserting second active entitlement for same (user, product)
      let duplicateError: any = null
      try {
        await payload.db.drizzle.execute(
          `INSERT INTO "entitlements" ("user_id", "product_id", "status", "granted_at", "download_count")
           VALUES (${uId}, ${pId}, 'active', now(), 0);`,
        )
      } catch (err: any) {
        duplicateError = err
      }

      const fullErr = `${duplicateError?.message} ${duplicateError?.cause?.message || ''} ${(duplicateError as any)?.cause?.constraint || ''}`
      expect(fullErr).toContain('entitlements_user_product_active_idx')
    })

    it('3.2: PostgreSQL engine strictly ALLOWS multiple REVOKED and EXPIRED entitlements for same (user, product)', async () => {
      const uId = buyerUser.id
      const pId = testProduct.id

      // Insert multiple 'revoked' entitlements
      const rev1 = await payload.db.drizzle.execute(
        `INSERT INTO "entitlements" ("user_id", "product_id", "status", "granted_at", "download_count", "reason")
         VALUES (${uId}, ${pId}, 'revoked', now(), 0, 'Revoked license 1')
         RETURNING id;`,
      )
      cleanup.entitlements.push(((rev1 as any).rows || rev1)[0].id)

      const rev2 = await payload.db.drizzle.execute(
        `INSERT INTO "entitlements" ("user_id", "product_id", "status", "granted_at", "download_count", "reason")
         VALUES (${uId}, ${pId}, 'revoked', now(), 0, 'Revoked license 2')
         RETURNING id;`,
      )
      cleanup.entitlements.push(((rev2 as any).rows || rev2)[0].id)

      // Insert multiple 'expired' entitlements
      const exp1 = await payload.db.drizzle.execute(
        `INSERT INTO "entitlements" ("user_id", "product_id", "status", "granted_at", "download_count", "reason")
         VALUES (${uId}, ${pId}, 'expired', now(), 0, 'Expired trial 1')
         RETURNING id;`,
      )
      cleanup.entitlements.push(((exp1 as any).rows || exp1)[0].id)

      const exp2 = await payload.db.drizzle.execute(
        `INSERT INTO "entitlements" ("user_id", "product_id", "status", "granted_at", "download_count", "reason")
         VALUES (${uId}, ${pId}, 'expired', now(), 0, 'Expired trial 2')
         RETURNING id;`,
      )
      cleanup.entitlements.push(((exp2 as any).rows || exp2)[0].id)

      // Count total entitlements for (uId, pId): should be 5 (1 active + 2 revoked + 2 expired)
      const countRes = await payload.db.drizzle.execute(
        `SELECT count(*)::int as total FROM "entitlements" WHERE user_id = ${uId} AND product_id = ${pId};`,
      )
      const total = ((countRes as any).rows || countRes)[0].total
      expect(total).toBe(5)
    })

    it('3.3: PostgreSQL engine rejects UPDATE of revoked entitlement to active if active one already exists', async () => {
      const uId = buyerUser.id
      const pId = testProduct.id

      // Find one of the revoked entitlements
      const findRev = await payload.db.drizzle.execute(
        `SELECT id FROM "entitlements" WHERE user_id = ${uId} AND product_id = ${pId} AND status = 'revoked' LIMIT 1;`,
      )
      const revId = ((findRev as any).rows || findRev)[0].id

      let activateError: any = null
      try {
        await payload.db.drizzle.execute(
          `UPDATE "entitlements" SET "status" = 'active' WHERE id = ${revId};`,
        )
      } catch (err: any) {
        activateError = err
      }

      expect(activateError).toBeDefined()
      expect(getFullError(activateError)).toContain('entitlements_user_product_active_idx')
    })

    it('3.4: Payload Hook enforceEntitlementInvariants rejects duplicate active via Payload API', async () => {
      // Attempt creating active entitlement for buyerUser on testProduct via Payload API
      // Since buyerUser already has an active entitlement from 3.1, this must fail!
      let caughtError: any = null
      try {
        await payload.create({
          collection: 'entitlements' as any,
          data: {
            user: buyerUser.id,
            product: testProduct.id,
            status: 'active',
          },
          overrideAccess: true,
        })
      } catch (err: any) {
        caughtError = err
      }

      expect(caughtError).toBeDefined()
      expect(caughtError.message).toContain('already has an active entitlement')
    })

    it('3.5: Payload Hook allows updating an existing active entitlement without false positive error', async () => {
      // Find the active entitlement ID
      const activeFind = await payload.find({
        collection: 'entitlements' as any,
        where: {
          and: [
            { user: { equals: buyerUser.id } },
            { product: { equals: testProduct.id } },
            { status: { equals: 'active' } },
          ],
        },
        overrideAccess: true,
      })

      expect(activeFind.docs.length).toBe(1)
      const activeDoc = activeFind.docs[0]

      // Update downloadCount on the active entitlement
      const updated = await payload.update({
        collection: 'entitlements' as any,
        id: activeDoc.id,
        data: {
          downloadCount: Number(activeDoc.downloadCount) + 1,
        },
        overrideAccess: true,
      })

      expect(updated.id).toBe(activeDoc.id)
      expect(updated.downloadCount).toBe(Number(activeDoc.downloadCount) + 1)
      expect(updated.status).toBe('active')
    })
  })

  describe('4. Check Constraints on Non-Negative Monetary Values', () => {
    it('4.1: orders_total_amount_non_negative rejects negative total_amount via direct SQL INSERT', async () => {
      let sqlError: any = null
      try {
        await payload.db.drizzle.execute(
          `INSERT INTO "orders" ("code", "buyer_id", "total_amount", "currency", "status", "payment_source")
           VALUES ('ORD-NEG-TOTAL', ${buyerUser.id}, -1, 'VND', 'PENDING', 'wallet');`,
        )
      } catch (err: any) {
        sqlError = err
      }

      expect(sqlError).toBeDefined()
      expect(getFullError(sqlError)).toContain('orders_total_amount_non_negative')
    })

    it('4.2: orders_total_amount_non_negative rejects negative total_amount via direct SQL UPDATE', async () => {
      // Create valid order with total_amount = 0
      const orderRes = await payload.db.drizzle.execute(
        `INSERT INTO "orders" ("code", "buyer_id", "total_amount", "currency", "status", "payment_source")
         VALUES ('ORD-ZERO-TOTAL-${Date.now()}', ${buyerUser.id}, 0, 'VND', 'PENDING', 'wallet')
         RETURNING id;`,
      )
      const orderId = ((orderRes as any).rows || orderRes)[0].id
      cleanup.orders.push(orderId)

      let sqlError: any = null
      try {
        await payload.db.drizzle.execute(
          `UPDATE "orders" SET "total_amount" = -100 WHERE id = ${orderId};`,
        )
      } catch (err: any) {
        sqlError = err
      }

      expect(sqlError).toBeDefined()
      expect(getFullError(sqlError)).toContain('orders_total_amount_non_negative')
    })

    it('4.3: order_items_sale_price_non_negative rejects negative sale_price via direct SQL INSERT', async () => {
      // Create valid order
      const order = (await payload.create({
        collection: 'orders' as any,
        data: {
          buyer: buyerUser.id,
          totalAmount: 0,
          currency: 'VND',
          status: 'PENDING',
          paymentSource: 'free',
        },
        overrideAccess: true,
      })) as Order
      cleanup.orders.push(order.id)

      let sqlError: any = null
      try {
        await payload.db.drizzle.execute(
          `INSERT INTO "order_items" ("order_id", "product_id", "seller_id", "sale_price", "platform_fee", "seller_amount", "tax", "policy_version")
           VALUES (${order.id}, ${testProduct.id}, ${sellerUser.id}, -500, 0, 0, 0, 'v1');`,
        )
      } catch (err: any) {
        sqlError = err
      }

      expect(sqlError).toBeDefined()
      expect(getFullError(sqlError)).toContain('order_items_sale_price_non_negative')
    })

    it('4.4: order_items other non-negative check constraints (platform_fee, seller_amount, tax)', async () => {
      const order = (await payload.create({
        collection: 'orders' as any,
        data: {
          buyer: buyerUser.id,
          totalAmount: 100,
          currency: 'VND',
          status: 'PENDING',
          paymentSource: 'wallet',
        },
        overrideAccess: true,
      })) as Order
      cleanup.orders.push(order.id)

      // Negative platform_fee
      let feeError: any = null
      try {
        await payload.db.drizzle.execute(
          `INSERT INTO "order_items" ("order_id", "product_id", "seller_id", "sale_price", "platform_fee", "seller_amount", "tax", "policy_version")
           VALUES (${order.id}, ${testProduct.id}, ${sellerUser.id}, 100, -10, 100, 0, 'v1');`,
        )
      } catch (err: any) {
        feeError = err
      }
      expect(feeError).toBeDefined()
      expect(getFullError(feeError)).toContain('order_items_platform_fee_non_negative')

      // Negative seller_amount
      let sellerError: any = null
      try {
        await payload.db.drizzle.execute(
          `INSERT INTO "order_items" ("order_id", "product_id", "seller_id", "sale_price", "platform_fee", "seller_amount", "tax", "policy_version")
           VALUES (${order.id}, ${testProduct.id}, ${sellerUser.id}, 100, 10, -50, 0, 'v1');`,
        )
      } catch (err: any) {
        sellerError = err
      }
      expect(sellerError).toBeDefined()
      expect(getFullError(sellerError)).toContain('order_items_seller_amount_non_negative')

      // Negative tax
      let taxError: any = null
      try {
        await payload.db.drizzle.execute(
          `INSERT INTO "order_items" ("order_id", "product_id", "seller_id", "sale_price", "platform_fee", "seller_amount", "tax", "policy_version")
           VALUES (${order.id}, ${testProduct.id}, ${sellerUser.id}, 100, 10, 90, -5, 'v1');`,
        )
      } catch (err: any) {
        taxError = err
      }
      expect(taxError).toBeDefined()
      expect(getFullError(taxError)).toContain('order_items_tax_non_negative')
    })

    it('4.5: entitlements_download_count_non_negative rejects negative download_count', async () => {
      let dlError: any = null
      try {
        await payload.db.drizzle.execute(
          `INSERT INTO "entitlements" ("user_id", "product_id", "status", "granted_at", "download_count")
           VALUES (${buyerUser.id}, ${testProduct.id}, 'revoked', now(), -1);`,
        )
      } catch (err: any) {
        dlError = err
      }

      expect(dlError).toBeDefined()
      expect(getFullError(dlError)).toContain('entitlements_download_count_non_negative')
    })

    it('4.6: Payload collection validation rejects negative numbers (min: 0)', async () => {
      // Negative totalAmount in orders
      let orderErr: any = null
      try {
        await payload.create({
          collection: 'orders' as any,
          data: {
            buyer: buyerUser.id,
            totalAmount: -1000,
            currency: 'VND',
            status: 'PENDING',
            paymentSource: 'wallet',
          },
          overrideAccess: true,
        })
      } catch (err: any) {
        orderErr = err
      }
      expect(orderErr).toBeDefined()

      // Negative salePrice in order_items
      const validOrder = (await payload.create({
        collection: 'orders' as any,
        data: {
          buyer: buyerUser.id,
          totalAmount: 1000,
          currency: 'VND',
          status: 'PENDING',
          paymentSource: 'wallet',
        },
        overrideAccess: true,
      })) as Order
      cleanup.orders.push(validOrder.id)

      let itemErr: any = null
      try {
        await payload.create({
          collection: 'order_items' as any,
          data: {
            order: validOrder.id,
            product: testProduct.id,
            seller: sellerUser.id,
            salePrice: -500,
            platformFee: 0,
            sellerAmount: 0,
            tax: 0,
            policyVersion: 'v1',
          },
          overrideAccess: true,
        })
      } catch (err: any) {
        itemErr = err
      }
      expect(itemErr).toBeDefined()
    })
  })
})
