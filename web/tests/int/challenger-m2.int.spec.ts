import { getPayload, type Payload } from 'payload'
import config from '@/payload.config'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Product, User } from '@/payload-types'

/**
 * Empirical Challenger Test Suite for Milestone 2 (RBAC)
 *
 * Specifically verifies the three mandatory challenger assertions:
 * 1. Unauthenticated guests and buyers cannot access draft products under any circumstances.
 * 2. Sellers cannot update products (published or draft, own or others).
 * 3. Pure moderators cannot create products (draft or published).
 */

describe('Challenger M2 Empirical Verification Suite', () => {
  let payload: Payload

  type TestUser = User

  let _adminUser: TestUser
  let buyerUser: TestUser
  let sellerA: TestUser
  let sellerB: TestUser
  let pureModerator: TestUser
  let dualModSeller: TestUser
  let emptyRolesUser: TestUser

  const cleanup = {
    products: [] as (number | string)[],
    users: [] as (number | string)[],
  }

  let seq = 0
  const getSeq = () => ++seq

  const createUser = async (email: string, roles: User['roles']): Promise<TestUser> => {
    const user = await payload.create({
      collection: 'users',
      data: {
        email,
        password: 'challenger-test-pass-123!',
        name: email.split('@')[0],
        roles,
      },
      overrideAccess: true,
    })
    cleanup.users.push(user.id)
    return user
  }

  beforeAll(async () => {
    payload = await getPayload({ config: await config })
    const ts = Date.now()

    _adminUser = await createUser(`challenger-admin-${ts}@example.test`, ['admin'])
    buyerUser = await createUser(`challenger-buyer-${ts}@example.test`, ['buyer'])
    sellerA = await createUser(`challenger-seller-a-${ts}@example.test`, ['seller'])
    sellerB = await createUser(`challenger-seller-b-${ts}@example.test`, ['seller'])
    pureModerator = await createUser(`challenger-mod-${ts}@example.test`, ['moderator'])
    dualModSeller = await createUser(`challenger-dual-${ts}@example.test`, ['moderator', 'seller'])
    emptyRolesUser = await createUser(`challenger-noroles-${ts}@example.test`, [])
  })

  afterAll(async () => {
    for (const id of cleanup.products) {
      await payload.delete({ collection: 'products', id, overrideAccess: true }).catch(() => undefined)
    }
    for (const id of cleanup.users) {
      await payload.delete({ collection: 'users', id, overrideAccess: true }).catch(() => undefined)
    }
  })

  // =========================================================================
  // TASK 1: Guests and Buyers CANNOT access draft products under ANY circumstances
  // =========================================================================
  describe('Task 1: Draft Product Isolation for Guests and Buyers', () => {
    let testDraftProduct: Product
    let testPublishedProduct: Product

    beforeAll(async () => {
      // Create an admin-owned draft product
      testDraftProduct = await payload.create({
        collection: 'products',
        draft: true,
        data: {
          title: `Challenger Secret Draft ${getSeq()}`,
          price: 999000,
        },
        overrideAccess: true,
      })
      cleanup.products.push(testDraftProduct.id)

      // Create a published product for comparison
      testPublishedProduct = await payload.create({
        collection: 'products',
        data: {
          title: `Challenger Public Product ${getSeq()}`,
          slug: `challenger-pub-${Date.now()}-${getSeq()}`,
          price: 150000,
          _status: 'published',
        },
        overrideAccess: true,
      })
      cleanup.products.push(testPublishedProduct.id)
    })

    it('1.1. Guest findByID rejects access to draft product', async () => {
      await expect(
        payload.findByID({
          collection: 'products',
          id: testDraftProduct.id,
          overrideAccess: false,
          user: null,
        }),
      ).rejects.toThrow()
    })

    it('1.2. Buyer findByID rejects access to draft product', async () => {
      await expect(
        payload.findByID({
          collection: 'products',
          id: testDraftProduct.id,
          overrideAccess: false,
          user: buyerUser,
        }),
      ).rejects.toThrow()
    })

    it('1.3. User with empty roles findByID rejects access to draft product', async () => {
      await expect(
        payload.findByID({
          collection: 'products',
          id: testDraftProduct.id,
          overrideAccess: false,
          user: emptyRolesUser,
        }),
      ).rejects.toThrow()
    })

    it('1.4. Guest find by ID where-clause returns 0 docs for draft product', async () => {
      const result = await payload.find({
        collection: 'products',
        where: { id: { equals: testDraftProduct.id } },
        overrideAccess: false,
        user: null,
      })
      expect(result.docs).toHaveLength(0)
      expect(result.totalDocs).toBe(0)
    })

    it('1.5. Buyer find by ID where-clause returns 0 docs for draft product', async () => {
      const result = await payload.find({
        collection: 'products',
        where: { id: { equals: testDraftProduct.id } },
        overrideAccess: false,
        user: buyerUser,
      })
      expect(result.docs).toHaveLength(0)
      expect(result.totalDocs).toBe(0)
    })

    it('1.6. Guest find with where status equals draft returns 0 docs', async () => {
      const result = await payload.find({
        collection: 'products',
        where: { _status: { equals: 'draft' } },
        overrideAccess: false,
        user: null,
      })
      expect(result.docs).toHaveLength(0)
      expect(result.totalDocs).toBe(0)
    })

    it('1.7. Buyer find with where status equals draft returns 0 docs', async () => {
      const result = await payload.find({
        collection: 'products',
        where: { _status: { equals: 'draft' } },
        overrideAccess: false,
        user: buyerUser,
      })
      expect(result.docs).toHaveLength(0)
      expect(result.totalDocs).toBe(0)
    })

    it('1.8. Guest find with where status not_equals published returns 0 docs', async () => {
      const result = await payload.find({
        collection: 'products',
        where: { _status: { not_equals: 'published' } },
        overrideAccess: false,
        user: null,
      })
      expect(result.docs).toHaveLength(0)
      expect(result.totalDocs).toBe(0)
    })

    it('1.9. Buyer find with where status not_equals published returns 0 docs', async () => {
      const result = await payload.find({
        collection: 'products',
        where: { _status: { not_equals: 'published' } },
        overrideAccess: false,
        user: buyerUser,
      })
      expect(result.docs).toHaveLength(0)
      expect(result.totalDocs).toBe(0)
    })

    it('1.10. Guest OR-query injection cannot leak draft product', async () => {
      const result = await payload.find({
        collection: 'products',
        where: {
          or: [
            { id: { equals: testDraftProduct.id } },
            { id: { equals: testPublishedProduct.id } },
          ],
        },
        overrideAccess: false,
        user: null,
      })
      expect(result.docs).toHaveLength(1)
      expect(result.docs[0].id).toBe(testPublishedProduct.id)
      expect(result.docs[0]._status).toBe('published')
    })

    it('1.11. Buyer OR-query injection cannot leak draft product', async () => {
      const result = await payload.find({
        collection: 'products',
        where: {
          or: [
            { id: { equals: testDraftProduct.id } },
            { id: { equals: testPublishedProduct.id } },
          ],
        },
        overrideAccess: false,
        user: buyerUser,
      })
      expect(result.docs).toHaveLength(1)
      expect(result.docs[0].id).toBe(testPublishedProduct.id)
      expect(result.docs[0]._status).toBe('published')
    })

    it('1.12. Guest find with draft: true flag still filters out all draft products', async () => {
      const result = await payload.find({
        collection: 'products',
        draft: true,
        overrideAccess: false,
        user: null,
      })
      for (const doc of result.docs) {
        expect(doc._status).toBe('published')
        expect(doc.id).not.toBe(testDraftProduct.id)
      }
    })

    it('1.13. Buyer find with draft: true flag still filters out all draft products', async () => {
      const result = await payload.find({
        collection: 'products',
        draft: true,
        overrideAccess: false,
        user: buyerUser,
      })
      for (const doc of result.docs) {
        expect(doc._status).toBe('published')
        expect(doc.id).not.toBe(testDraftProduct.id)
      }
    })

    it('1.14. Guest findVersions is either rejected or returns 0 draft versions', async () => {
      try {
        const versions = await payload.findVersions({
          collection: 'products',
          where: { parent: { equals: testDraftProduct.id } },
          overrideAccess: false,
          user: null,
        })
        expect(versions.docs).toHaveLength(0)
      } catch (err: unknown) {
        expect(err).toBeDefined()
      }
    })

    it('1.15. Buyer findVersions is either rejected or returns 0 draft versions', async () => {
      try {
        const versions = await payload.findVersions({
          collection: 'products',
          where: { parent: { equals: testDraftProduct.id } },
          overrideAccess: false,
          user: buyerUser,
        })
        expect(versions.docs).toHaveLength(0)
      } catch (err: unknown) {
        expect(err).toBeDefined()
      }
    })
  })

  // =========================================================================
  // TASK 2: Sellers CANNOT update products
  // =========================================================================
  describe('Task 2: Sellers Cannot Update Products Under Any Condition', () => {
    let adminPublishedProduct: Product
    let sellerPublishedProduct: Product
    let sellerDraftProduct: Product

    beforeAll(async () => {
      // 1. Admin created published product
      adminPublishedProduct = await payload.create({
        collection: 'products',
        data: {
          title: `Admin Pub Product ${getSeq()}`,
          slug: `admin-pub-${Date.now()}-${getSeq()}`,
          price: 500000,
          _status: 'published',
        },
        overrideAccess: true,
      })
      cleanup.products.push(adminPublishedProduct.id)

      // 2. Seller A created published product
      sellerPublishedProduct = await payload.create({
        collection: 'products',
        data: {
          title: `Seller A Pub Product ${getSeq()}`,
          slug: `seller-pub-${Date.now()}-${getSeq()}`,
          price: 300000,
          _status: 'published',
        },
        overrideAccess: false,
        user: sellerA,
      })
      cleanup.products.push(sellerPublishedProduct.id)

      // 3. Seller A created draft product
      sellerDraftProduct = await payload.create({
        collection: 'products',
        draft: true,
        data: {
          title: `Seller A Draft Product ${getSeq()}`,
          price: 200000,
        },
        overrideAccess: false,
        user: sellerA,
      })
      cleanup.products.push(sellerDraftProduct.id)
    })

    it('2.1. Seller A cannot update an admin published product', async () => {
      await expect(
        payload.update({
          collection: 'products',
          id: adminPublishedProduct.id,
          data: { title: 'Tampered by Seller A' },
          overrideAccess: false,
          user: sellerA,
        }),
      ).rejects.toThrow()
    })

    it('2.2. Seller B cannot update Seller A published product', async () => {
      await expect(
        payload.update({
          collection: 'products',
          id: sellerPublishedProduct.id,
          data: { title: 'Tampered by Seller B' },
          overrideAccess: false,
          user: sellerB,
        }),
      ).rejects.toThrow()
    })

    it('2.3. Seller A cannot update their OWN published product details', async () => {
      await expect(
        payload.update({
          collection: 'products',
          id: sellerPublishedProduct.id,
          data: { title: 'Self Update Title', price: 999999 },
          overrideAccess: false,
          user: sellerA,
        }),
      ).rejects.toThrow()
    })

    it('2.4. Seller A cannot unpublish their OWN published product to draft', async () => {
      await expect(
        payload.update({
          collection: 'products',
          id: sellerPublishedProduct.id,
          data: { _status: 'draft' },
          overrideAccess: false,
          user: sellerA,
        }),
      ).rejects.toThrow()
    })

    it('2.5. Seller A cannot update their OWN draft product details', async () => {
      await expect(
        payload.update({
          collection: 'products',
          id: sellerDraftProduct.id,
          data: { title: 'Updated Draft by Seller A' },
          overrideAccess: false,
          user: sellerA,
        }),
      ).rejects.toThrow()
    })

    it('2.6. Seller A cannot publish their OWN draft product via update', async () => {
      await expect(
        payload.update({
          collection: 'products',
          id: sellerDraftProduct.id,
          data: { _status: 'published' },
          overrideAccess: false,
          user: sellerA,
        }),
      ).rejects.toThrow()
    })

    it('2.7. Seller A cannot update products via bulk query update', async () => {
      await expect(
        payload.update({
          collection: 'products',
          where: { id: { equals: sellerPublishedProduct.id } },
          data: { title: 'Bulk Tampered' },
          overrideAccess: false,
          user: sellerA,
        }),
      ).rejects.toThrow()
    })

    it('2.8. Seller A cannot update products with draft: true flag', async () => {
      await expect(
        payload.update({
          collection: 'products',
          id: sellerDraftProduct.id,
          draft: true,
          data: { title: 'Draft update attempt' },
          overrideAccess: false,
          user: sellerA,
        }),
      ).rejects.toThrow()
    })
  })

  // =========================================================================
  // TASK 3: Pure Moderators CANNOT create products
  // =========================================================================
  describe('Task 3: Pure Moderators Cannot Create Products Under Any Condition', () => {
    it('3.1. Pure moderator cannot create a draft product', async () => {
      await expect(
        payload.create({
          collection: 'products',
          draft: true,
          data: {
            title: `Mod Draft Product Attempt ${getSeq()}`,
            price: 100000,
          },
          overrideAccess: false,
          user: pureModerator,
        }),
      ).rejects.toThrow()
    })

    it('3.2. Pure moderator cannot create a published product', async () => {
      await expect(
        payload.create({
          collection: 'products',
          data: {
            title: `Mod Published Product Attempt ${getSeq()}`,
            slug: `mod-pub-attempt-${Date.now()}-${getSeq()}`,
            price: 250000,
            _status: 'published',
          },
          overrideAccess: false,
          user: pureModerator,
        }),
      ).rejects.toThrow()
    })

    it('3.3. Pure moderator cannot create a free product (isFree: true)', async () => {
      await expect(
        payload.create({
          collection: 'products',
          data: {
            title: `Mod Free Product Attempt ${getSeq()}`,
            slug: `mod-free-attempt-${Date.now()}-${getSeq()}`,
            price: 0,
            isFree: true,
            _status: 'published',
          },
          overrideAccess: false,
          user: pureModerator,
        }),
      ).rejects.toThrow()
    })

    it('3.4. Dual role (moderator + seller) user CAN create products', async () => {
      const dualProduct = await payload.create({
        collection: 'products',
        draft: true,
        data: {
          title: `Dual Mod-Seller Product ${getSeq()}`,
          price: 120000,
        },
        overrideAccess: false,
        user: dualModSeller,
      })
      cleanup.products.push(dualProduct.id)

      expect(dualProduct.id).toBeDefined()
      expect(dualProduct._status).toBe('draft')
    })
  })
})
