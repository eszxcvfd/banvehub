import { getPayload, type Payload } from 'payload'
import config from '@/payload.config'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Category, Media, Product, ProductPreview, SoftwareType, Tag, User } from '@/payload-types'

describe('Adversarial Stress Testing: Privilege Escalation Vectors', () => {
  let payload: Payload

  type TestUser = User

  // let adminUser: TestUser
  let buyerUser: TestUser
  let sellerUser: TestUser
  let moderatorUser: TestUser
  let testMedia: Media

  const cleanup = {
    products: [] as (number | string)[],
    productPreviews: [] as (number | string)[],
    tags: [] as (number | string)[],
    softwareTypes: [] as (number | string)[],
    categories: [] as (number | string)[],
    media: [] as (number | string)[],
    users: [] as (number | string)[],
  }

  let seq = 0
  const getSeq = () => ++seq

  const createUser = async (email: string, roles: User['roles']): Promise<TestUser> => {
    const user = await payload.create({
      collection: 'users',
      data: {
        email,
        password: 'stress-test-password-123',
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

    const timestamp = Date.now()
    await createUser(`stress-admin-${timestamp}@example.test`, ['admin'])
    buyerUser = await createUser(`stress-buyer-${timestamp}@example.test`, ['buyer'])
    sellerUser = await createUser(`stress-seller-${timestamp}@example.test`, ['seller'])
    moderatorUser = await createUser(`stress-mod-${timestamp}@example.test`, ['moderator'])

    const pngBuffer = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
      'base64',
    )
    testMedia = await payload.create({
      collection: 'media',
      data: { alt: 'Stress Test Media' },
      file: {
        data: pngBuffer,
        mimetype: 'image/png',
        name: `stress-media-${timestamp}.png`,
        size: pngBuffer.length,
      },
      overrideAccess: true,
    })
    cleanup.media.push(testMedia.id)
  })

  afterAll(async () => {
    for (const id of cleanup.products) {
      await payload.delete({ collection: 'products', id, overrideAccess: true }).catch(() => undefined)
    }
    for (const id of cleanup.productPreviews) {
      await payload.delete({ collection: 'product_previews', id, overrideAccess: true }).catch(() => undefined)
    }
    for (const id of cleanup.tags) {
      await payload.delete({ collection: 'tags', id, overrideAccess: true }).catch(() => undefined)
    }
    for (const id of cleanup.softwareTypes) {
      await payload.delete({ collection: 'software_types', id, overrideAccess: true }).catch(() => undefined)
    }
    for (const id of cleanup.categories) {
      await payload.delete({ collection: 'categories', id, overrideAccess: true }).catch(() => undefined)
    }
    for (const id of cleanup.media) {
      await payload.delete({ collection: 'media', id, overrideAccess: true }).catch(() => undefined)
    }
    for (const id of cleanup.users) {
      await payload.delete({ collection: 'users', id, overrideAccess: true }).catch(() => undefined)
    }
  })

  // =========================================================================
  // Vector 1: Role Spoofing & Self-Elevation
  // =========================================================================
  describe('Vector 1: Role Spoofing & Self-Elevation', () => {
    it('prevents anonymous registration from self-assigning admin, seller, or moderator roles', async () => {
      const email = `spoof-reg-${Date.now()}@example.test`
      // Unauthenticated caller attempts to create user with admin role
      const newUser = await payload.create({
        collection: 'users',
        data: {
          email,
          password: 'hacker-password-123',
          roles: ['admin', 'moderator', 'seller'],
        },
        overrideAccess: false,
        user: null,
      })
      cleanup.users.push(newUser.id)

      // 1. In the response returned to the unauthenticated caller, `roles` must be undefined
      // because read access on `roles` is adminOnlyFieldAccess.
      expect(newUser.roles).toBeUndefined()

      // 2. In the database (inspected via admin override), the roles must NOT contain admin/moderator/seller,
      // but must default to ['buyer']!
      const dbUser = await payload.findByID({
        collection: 'users',
        id: newUser.id,
        overrideAccess: true,
      })
      expect(dbUser.roles).toEqual(['buyer'])
      expect(dbUser.roles).not.toContain('admin')
      expect(dbUser.roles).not.toContain('moderator')
      expect(dbUser.roles).not.toContain('seller')
    })

    it('prevents a buyer from escalating to admin or seller via user update', async () => {
      // Buyer attempts to update own document to include 'admin'
      const updated = await payload.update({
        collection: 'users',
        id: buyerUser.id,
        data: {
          roles: ['admin', 'seller'],
        },
        overrideAccess: false,
        user: buyerUser,
      })

      // Returned response has roles stripped
      expect(updated.roles).toBeUndefined()

      // Direct inspection from DB to confirm roles were NOT modified
      const freshUser = await payload.findByID({
        collection: 'users',
        id: buyerUser.id,
        overrideAccess: true,
      })
      expect(freshUser.roles).toEqual(['buyer'])
      expect(freshUser.roles).not.toContain('admin')
      expect(freshUser.roles).not.toContain('seller')
    })

    it('prevents a seller from escalating to moderator or admin', async () => {
      const updated = await payload.update({
        collection: 'users',
        id: sellerUser.id,
        data: {
          roles: ['seller', 'moderator', 'admin'],
        },
        overrideAccess: false,
        user: sellerUser,
      })

      // Returned response has roles stripped
      expect(updated.roles).toBeUndefined()

      // Direct inspection from DB
      const freshUser = await payload.findByID({
        collection: 'users',
        id: sellerUser.id,
        overrideAccess: true,
      })
      expect(freshUser.roles).toEqual(['seller'])
      expect(freshUser.roles).not.toContain('admin')
      expect(freshUser.roles).not.toContain('moderator')
    })

    it('denies buyer from modifying another user account', async () => {
      await expect(
        payload.update({
          collection: 'users',
          id: sellerUser.id,
          data: {
            name: 'Pawned by Buyer',
          },
          overrideAccess: false,
          user: buyerUser,
        }),
      ).rejects.toThrow()
    })
  })

  // =========================================================================
  // Vector 2: Filter Bypasses on Draft Isolation
  // =========================================================================
  describe('Vector 2: Filter Bypasses on Draft Isolation', () => {
    let secretDraft: Product
    let publicProd: Product

    beforeAll(async () => {
      secretDraft = await payload.create({
        collection: 'products',
        draft: true,
        data: {
          title: `Classified CAD Blueprint ${Date.now()}`,
          price: 999999,
        },
        overrideAccess: true,
      })
      cleanup.products.push(secretDraft.id)

      publicProd = await payload.create({
        collection: 'products',
        data: {
          title: `Public Drawing ${Date.now()}`,
          slug: `pub-stress-${Date.now()}-${getSeq()}`,
          price: 50000,
          _status: 'published',
        },
        overrideAccess: true,
      })
      cleanup.products.push(publicProd.id)
    })

    it('blocks filter bypass attempt using explicit where: { _status: { equals: "draft" } }', async () => {
      const result = await payload.find({
        collection: 'products',
        where: { _status: { equals: 'draft' } },
        overrideAccess: false,
        user: null,
      })
      expect(result.docs).toHaveLength(0)
    })

    it('blocks filter bypass attempt using where: { _status: { in: ["draft", "published"] } }', async () => {
      const result = await payload.find({
        collection: 'products',
        where: { _status: { in: ['draft', 'published'] } },
        overrideAccess: false,
        user: null,
      })
      // Only published docs should be returned
      expect(result.docs.length).toBeGreaterThan(0)
      for (const doc of result.docs) {
        expect(doc._status).toBe('published')
        expect(doc.id).not.toBe(secretDraft.id)
      }
    })

    it('blocks filter bypass attempt using nested OR condition to leak draft', async () => {
      const result = await payload.find({
        collection: 'products',
        where: {
          or: [
            { id: { equals: secretDraft.id } },
            { id: { equals: publicProd.id } },
          ],
        },
        overrideAccess: false,
        user: null,
      })
      // Even with OR condition containing the draft ID, access control must enforce _status = 'published'
      expect(result.docs).toHaveLength(1)
      expect(result.docs[0].id).toBe(publicProd.id)
      expect(result.docs.some((d) => d.id === secretDraft.id)).toBe(false)
    })

    it('blocks filter bypass attempt using { _status: { not_equals: "published" } }', async () => {
      const result = await payload.find({
        collection: 'products',
        where: { _status: { not_equals: 'published' } },
        overrideAccess: false,
        user: null,
      })
      expect(result.docs).toHaveLength(0)
    })

    it('blocks buyer from accessing draft product via findByID', async () => {
      await expect(
        payload.findByID({
          collection: 'products',
          id: secretDraft.id,
          overrideAccess: false,
          user: buyerUser,
        }),
      ).rejects.toThrow()
    })

    it('blocks buyer from accessing draft product via where filter', async () => {
      const result = await payload.find({
        collection: 'products',
        where: { id: { equals: secretDraft.id } },
        overrideAccess: false,
        user: buyerUser,
      })
      expect(result.docs).toHaveLength(0)
    })
  })

  // =========================================================================
  // Vector 3: Unauthorized Mutations on Categories & Software Types
  // =========================================================================
  describe('Vector 3: Unauthorized Mutations on Categories & Software Types', () => {
    let testCategory: Category
    let testSoftwareType: SoftwareType

    beforeAll(async () => {
      testCategory = await payload.create({
        collection: 'categories',
        data: {
          title: `Baseline Category ${Date.now()}`,
          slug: `base-cat-${Date.now()}-${getSeq()}`,
          status: 'active',
        },
        overrideAccess: true,
      })
      cleanup.categories.push(testCategory.id)

      testSoftwareType = await payload.create({
        collection: 'software_types',
        data: {
          title: `Baseline SW ${Date.now()}`,
          slug: `base-sw-${Date.now()}-${getSeq()}`,
          fileExtensions: ['.dwg'],
        },
        overrideAccess: true,
      })
      cleanup.softwareTypes.push(testSoftwareType.id)
    })

    // Categories: create
    it('denies guest, buyer, seller, and moderator from creating categories', async () => {
      const catData = { title: 'Attacker Category', slug: `atk-cat-${Date.now()}` }

      await expect(payload.create({ collection: 'categories', data: catData, overrideAccess: false, user: null })).rejects.toThrow()
      await expect(payload.create({ collection: 'categories', data: catData, overrideAccess: false, user: buyerUser })).rejects.toThrow()
      await expect(payload.create({ collection: 'categories', data: catData, overrideAccess: false, user: sellerUser })).rejects.toThrow()
      await expect(payload.create({ collection: 'categories', data: catData, overrideAccess: false, user: moderatorUser })).rejects.toThrow()
    })

    // Categories: update
    it('denies guest, buyer, seller, and moderator from updating categories', async () => {
      const updateData = { title: 'Hacked Category Title' }

      await expect(payload.update({ collection: 'categories', id: testCategory.id, data: updateData, overrideAccess: false, user: null })).rejects.toThrow()
      await expect(payload.update({ collection: 'categories', id: testCategory.id, data: updateData, overrideAccess: false, user: buyerUser })).rejects.toThrow()
      await expect(payload.update({ collection: 'categories', id: testCategory.id, data: updateData, overrideAccess: false, user: sellerUser })).rejects.toThrow()
      await expect(payload.update({ collection: 'categories', id: testCategory.id, data: updateData, overrideAccess: false, user: moderatorUser })).rejects.toThrow()
    })

    // Categories: delete
    it('denies guest, buyer, seller, and moderator from deleting categories', async () => {
      await expect(payload.delete({ collection: 'categories', id: testCategory.id, overrideAccess: false, user: null })).rejects.toThrow()
      await expect(payload.delete({ collection: 'categories', id: testCategory.id, overrideAccess: false, user: buyerUser })).rejects.toThrow()
      await expect(payload.delete({ collection: 'categories', id: testCategory.id, overrideAccess: false, user: sellerUser })).rejects.toThrow()
      await expect(payload.delete({ collection: 'categories', id: testCategory.id, overrideAccess: false, user: moderatorUser })).rejects.toThrow()
    })

    // Software Types: create
    it('denies guest, buyer, seller, and moderator from creating software_types', async () => {
      const swData = { title: 'Attacker SW', slug: `atk-sw-${Date.now()}`, fileExtensions: ['.exe'] }

      await expect(payload.create({ collection: 'software_types', data: swData, overrideAccess: false, user: null })).rejects.toThrow()
      await expect(payload.create({ collection: 'software_types', data: swData, overrideAccess: false, user: buyerUser })).rejects.toThrow()
      await expect(payload.create({ collection: 'software_types', data: swData, overrideAccess: false, user: sellerUser })).rejects.toThrow()
      await expect(payload.create({ collection: 'software_types', data: swData, overrideAccess: false, user: moderatorUser })).rejects.toThrow()
    })

    // Software Types: update
    it('denies guest, buyer, seller, and moderator from updating software_types', async () => {
      const updateData = { title: 'Hacked SW Title' }

      await expect(payload.update({ collection: 'software_types', id: testSoftwareType.id, data: updateData, overrideAccess: false, user: null })).rejects.toThrow()
      await expect(payload.update({ collection: 'software_types', id: testSoftwareType.id, data: updateData, overrideAccess: false, user: buyerUser })).rejects.toThrow()
      await expect(payload.update({ collection: 'software_types', id: testSoftwareType.id, data: updateData, overrideAccess: false, user: sellerUser })).rejects.toThrow()
      await expect(payload.update({ collection: 'software_types', id: testSoftwareType.id, data: updateData, overrideAccess: false, user: moderatorUser })).rejects.toThrow()
    })

    // Software Types: delete
    it('denies guest, buyer, seller, and moderator from deleting software_types', async () => {
      await expect(payload.delete({ collection: 'software_types', id: testSoftwareType.id, overrideAccess: false, user: null })).rejects.toThrow()
      await expect(payload.delete({ collection: 'software_types', id: testSoftwareType.id, overrideAccess: false, user: buyerUser })).rejects.toThrow()
      await expect(payload.delete({ collection: 'software_types', id: testSoftwareType.id, overrideAccess: false, user: sellerUser })).rejects.toThrow()
      await expect(payload.delete({ collection: 'software_types', id: testSoftwareType.id, overrideAccess: false, user: moderatorUser })).rejects.toThrow()
    })
  })

  // =========================================================================
  // Vector 4: Unauthorized Mutations on Tags & ProductPreviews
  // =========================================================================
  describe('Vector 4: Unauthorized Mutations on Tags & ProductPreviews', () => {
    let testTag: Tag
    let testPreview: ProductPreview

    beforeAll(async () => {
      testTag = await payload.create({
        collection: 'tags',
        data: {
          title: `Tag Vector4 ${Date.now()}`,
          slug: `tag-v4-${Date.now()}-${getSeq()}`,
        },
        overrideAccess: true,
      })
      cleanup.tags.push(testTag.id)

      testPreview = await payload.create({
        collection: 'product_previews',
        data: {
          title: `Preview Vector4 ${Date.now()}`,
          previewImage: testMedia.id,
          previewType: 'image',
        },
        overrideAccess: true,
      })
      cleanup.productPreviews.push(testPreview.id)
    })

    it('allows seller to create tags, but denies buyer and moderator', async () => {
      // Seller allowed
      const sellerTag = await payload.create({
        collection: 'tags',
        data: { title: `Seller Made Tag ${getSeq()}`, slug: `seller-tag-${Date.now()}-${getSeq()}` },
        overrideAccess: false,
        user: sellerUser,
      })
      cleanup.tags.push(sellerTag.id)
      expect(sellerTag.id).toBeDefined()

      // Buyer denied
      await expect(
        payload.create({
          collection: 'tags',
          data: { title: 'Buyer Tag', slug: `buyer-tag-${Date.now()}-${getSeq()}` },
          overrideAccess: false,
          user: buyerUser,
        }),
      ).rejects.toThrow()

      // Pure Moderator denied
      await expect(
        payload.create({
          collection: 'tags',
          data: { title: 'Mod Tag', slug: `mod-tag-${Date.now()}-${getSeq()}` },
          overrideAccess: false,
          user: moderatorUser,
        }),
      ).rejects.toThrow()
    })

    it('denies seller from updating or deleting existing tags (adminOnly)', async () => {
      // Update denied for seller
      await expect(
        payload.update({
          collection: 'tags',
          id: testTag.id,
          data: { title: 'Seller Tampered Tag' },
          overrideAccess: false,
          user: sellerUser,
        }),
      ).rejects.toThrow()

      // Delete denied for seller
      await expect(
        payload.delete({
          collection: 'tags',
          id: testTag.id,
          overrideAccess: false,
          user: sellerUser,
        }),
      ).rejects.toThrow()
    })

    it('denies seller from updating or deleting product_previews (adminOrModerator)', async () => {
      // Update denied for seller
      await expect(
        payload.update({
          collection: 'product_previews',
          id: testPreview.id,
          data: { title: 'Seller Tampered Preview' },
          overrideAccess: false,
          user: sellerUser,
        }),
      ).rejects.toThrow()

      // Delete denied for seller
      await expect(
        payload.delete({
          collection: 'product_previews',
          id: testPreview.id,
          overrideAccess: false,
          user: sellerUser,
        }),
      ).rejects.toThrow()
    })

    it('allows moderator to update and delete product_previews', async () => {
      const updated = await payload.update({
        collection: 'product_previews',
        id: testPreview.id,
        data: { title: 'Moderator Approved Preview' },
        overrideAccess: false,
        user: moderatorUser,
      })
      expect(updated.title).toBe('Moderator Approved Preview')

      const deleted = await payload.delete({
        collection: 'product_previews',
        id: testPreview.id,
        overrideAccess: false,
        user: moderatorUser,
      })
      expect(deleted.id).toBe(testPreview.id)
      cleanup.productPreviews = cleanup.productPreviews.filter((id) => id !== testPreview.id)
    })
  })

  // =========================================================================
  // Vector 5: Product Mutation & Deletion Restrictions
  // =========================================================================
  describe('Vector 5: Product Mutation & Deletion Restrictions', () => {
    let publishedProduct: Product

    beforeAll(async () => {
      publishedProduct = await payload.create({
        collection: 'products',
        data: {
          title: `Vector5 Baseline Product ${Date.now()}`,
          slug: `v5-prod-${Date.now()}-${getSeq()}`,
          price: 300000,
          isFree: false,
          _status: 'published',
        },
        overrideAccess: true,
      })
      cleanup.products.push(publishedProduct.id)
    })

    it('denies seller from updating price, title, or status of a published product', async () => {
      await expect(
        payload.update({
          collection: 'products',
          id: publishedProduct.id,
          data: {
            price: 0,
            isFree: true,
          },
          overrideAccess: false,
          user: sellerUser,
        }),
      ).rejects.toThrow()

      await expect(
        payload.update({
          collection: 'products',
          id: publishedProduct.id,
          data: {
            _status: 'draft',
          },
          overrideAccess: false,
          user: sellerUser,
        }),
      ).rejects.toThrow()
    })

    it('denies seller and moderator from deleting products (adminOnly)', async () => {
      // Seller cannot delete
      await expect(
        payload.delete({
          collection: 'products',
          id: publishedProduct.id,
          overrideAccess: false,
          user: sellerUser,
        }),
      ).rejects.toThrow()

      // Moderator cannot delete
      await expect(
        payload.delete({
          collection: 'products',
          id: publishedProduct.id,
          overrideAccess: false,
          user: moderatorUser,
        }),
      ).rejects.toThrow()

      // Verify product is intact
      const check = await payload.findByID({
        collection: 'products',
        id: publishedProduct.id,
        overrideAccess: true,
      })
      expect(check.id).toBe(publishedProduct.id)
    })
  })

  // =========================================================================
  // Vector 6: Search & Count Information Leakage
  // =========================================================================
  describe('Vector 6: Search & Count Information Leakage', () => {
    let secretDraftKeyword: Product
    let publicKeywordProduct: Product

    beforeAll(async () => {
      const uniqueKeyword = `ConfidentialFighterJet${Date.now()}`
      secretDraftKeyword = await payload.create({
        collection: 'products',
        draft: true,
        data: {
          title: `Secret CAD ${uniqueKeyword}`,
          price: 5000000,
        },
        overrideAccess: true,
      })
      cleanup.products.push(secretDraftKeyword.id)

      publicKeywordProduct = await payload.create({
        collection: 'products',
        data: {
          title: `Public Civ Jet ${uniqueKeyword}`,
          slug: `pub-jet-${Date.now()}-${getSeq()}`,
          price: 100000,
          _status: 'published',
        },
        overrideAccess: true,
      })
      cleanup.products.push(publicKeywordProduct.id)
    })

    it('prevents keyword search from revealing draft products to guests', async () => {
      const keyword = secretDraftKeyword.title.split(' ')[2]
      const searchResult = await payload.find({
        collection: 'products',
        where: {
          title: {
            contains: keyword,
          },
        },
        overrideAccess: false,
        user: null,
      })

      // Must find exactly the published product, never the draft
      expect(searchResult.docs).toHaveLength(1)
      expect(searchResult.docs[0].id).toBe(publicKeywordProduct.id)
      expect(searchResult.totalDocs).toBe(1)
    })

    it('totalDocs count in guest queries strictly excludes draft products', async () => {
      const countResult = await payload.find({
        collection: 'products',
        where: {
          id: {
            in: [secretDraftKeyword.id, publicKeywordProduct.id],
          },
        },
        overrideAccess: false,
        user: null,
      })

      expect(countResult.totalDocs).toBe(1)
      expect(countResult.docs[0].id).toBe(publicKeywordProduct.id)
    })
  })

  // =========================================================================
  // Vector 7: Relational Population Leakage
  // =========================================================================
  describe('Vector 7: Relational Population Leakage', () => {
    let parentPublished: Product
    let childDraft: Product

    beforeAll(async () => {
      childDraft = await payload.create({
        collection: 'products',
        draft: true,
        data: {
          title: `Nested Unreleased Blueprint ${Date.now()}`,
          price: 888888,
        },
        overrideAccess: true,
      })
      cleanup.products.push(childDraft.id)

      parentPublished = await payload.create({
        collection: 'products',
        data: {
          title: `Master Assembly Model ${Date.now()}`,
          slug: `master-asm-${Date.now()}-${getSeq()}`,
          price: 250000,
          _status: 'published',
          relatedProducts: [childDraft.id as number],
        },
        overrideAccess: true,
      })
      cleanup.products.push(parentPublished.id)
    })

    it('sanitizes or denies populated draft products when a guest fetches published parent', async () => {
      const result = await payload.findByID({
        collection: 'products',
        id: parentPublished.id,
        depth: 1,
        overrideAccess: false,
        user: null,
      })

      expect(result.id).toBe(parentPublished.id)
      // When depth=1 resolves relatedProducts, the draft child should either be omitted
      // or unpopulated (null / ID only) because guest does not have read access to draft products
      if (result.relatedProducts && result.relatedProducts.length > 0) {
        const related = result.relatedProducts[0]
        if (typeof related === 'object' && related !== null) {
          // If returned as object, it should not leak draft title/content or must be null/empty
          expect(related._status).not.toBe('draft')
        }
      }
    })
  })

  // =========================================================================
  // Vector 8: Versions & Draft History Access Boundaries
  // =========================================================================
  describe('Vector 8: Versions & Draft History Access Boundaries', () => {
    let versionedProduct: Product

    beforeAll(async () => {
      versionedProduct = await payload.create({
        collection: 'products',
        draft: true,
        data: {
          title: `Versioned Secret Asset ${Date.now()}`,
          price: 450000,
        },
        overrideAccess: true,
      })
      cleanup.products.push(versionedProduct.id)
    })

    it('denies guest from querying product versions', async () => {
      await expect(
        payload.findVersions({
          collection: 'products',
          where: {
            parent: { equals: versionedProduct.id },
          },
          overrideAccess: false,
          user: null,
        }),
      ).rejects.toThrow()
    })

    it('denies authenticated buyer from querying product versions (readVersions restricted to adminOrModerator)', async () => {
      // With Products.access.readVersions set to adminOrModerator,
      // authenticated buyers are denied from querying draft revision history.
      await expect(
        payload.findVersions({
          collection: 'products',
          where: {
            parent: { equals: versionedProduct.id },
          },
          overrideAccess: false,
          user: buyerUser,
        }),
      ).rejects.toThrow()
    })

    it('allows moderator to inspect product versions', async () => {
      const modVersions = await payload.findVersions({
        collection: 'products',
        where: {
          parent: { equals: versionedProduct.id },
        },
        overrideAccess: false,
        user: moderatorUser,
      })
      expect(modVersions).toBeDefined()
      expect(modVersions.docs.length).toBeGreaterThan(0)
    })
  })

})
