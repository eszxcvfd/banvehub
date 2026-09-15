import { getPayload, type Payload } from 'payload'
import config from '@/payload.config'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Category, Media, Product, ProductPreview, SoftwareType, Tag, User } from '@/payload-types'

/**
 * Catalog Role-Based Access Control (RBAC) Integration Test Suite
 *
 * References:
 * - PLAN.md §5, §22 (Role definitions and authorization matrix)
 * - Decision 0008 (Access Control Boundaries & Principle of Least Privilege)
 * - ORIGINAL_REQUEST.md R2 (Catalog Access Control requirements)
 *
 * Test Matrix & Access Boundaries:
 * 1. Public (guest / user: null / undefined) can read published products, categories, software types, and tags.
 * 2. Public cannot read draft products (query isolation & findByID rejection).
 * 3. Buyer (`roles: ['buyer']`) cannot create or update products.
 * 4. Seller (`roles: ['seller']`) can create products (both draft and published), can create tags, cannot update published products.
 * 5. Moderator (`roles: ['moderator']`) can update product status and details, cannot create products unless having seller role.
 * 6. Admin (`roles: ['admin']`) can perform all CRUD operations on all catalog entities.
 */

describe('Catalog RBAC Integration Tests (PLAN.md §22, Decision 0008)', () => {
  let payload: Payload

  type TestUser = User

  let adminUser: TestUser
  let buyerUser: TestUser
  let sellerUser: TestUser
  let moderatorUser: TestUser
  let moderatorSellerUser: TestUser
  let testMedia: Media

  // Cleanup registry in reverse dependency order
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
        password: 'test-catalog-rbac-password-123',
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
    adminUser = await createUser(`catalog-rbac-admin-${timestamp}@example.test`, ['admin'])
    buyerUser = await createUser(`catalog-rbac-buyer-${timestamp}@example.test`, ['buyer'])
    sellerUser = await createUser(`catalog-rbac-seller-${timestamp}@example.test`, ['seller'])
    moderatorUser = await createUser(`catalog-rbac-mod-${timestamp}@example.test`, ['moderator'])
    moderatorSellerUser = await createUser(`catalog-rbac-mod-seller-${timestamp}@example.test`, [
      'moderator',
      'seller',
    ])

    // Create 1x1 PNG media for upload relations (e.g. product_previews)
    const pngBuffer = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
      'base64',
    )
    testMedia = await payload.create({
      collection: 'media',
      data: { alt: 'Catalog RBAC Test Media' },
      file: {
        data: pngBuffer,
        mimetype: 'image/png',
        name: `catalog-rbac-media-${timestamp}.png`,
        size: pngBuffer.length,
      },
      overrideAccess: true,
    })
    cleanup.media.push(testMedia.id)
  })

  afterAll(async () => {
    // Teardown in reverse dependency order
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
  // Requirement 1: Public (guest / user: null) can read published entities
  // =========================================================================
  describe('1. Public (guest / user: null) read access for published catalog entities', () => {
    let publishedProduct: Product
    let activeCategory: Category
    let sampleSoftwareType: SoftwareType
    let sampleTag: Tag
    let samplePreview: ProductPreview

    beforeAll(async () => {
      // Create seed catalog items for public read assertions
      publishedProduct = await payload.create({
        collection: 'products',
        data: {
          title: `Public Published Product ${getSeq()}`,
          slug: `pub-prod-${Date.now()}-${getSeq()}`,
          price: 150000,
          isFree: false,
          _status: 'published',
        },
        overrideAccess: true,
      })
      cleanup.products.push(publishedProduct.id)

      activeCategory = await payload.create({
        collection: 'categories',
        data: {
          title: `Public Category ${getSeq()}`,
          slug: `pub-category-${Date.now()}-${getSeq()}`,
          description: 'Visible to public guests',
          status: 'active',
        },
        overrideAccess: true,
      })
      cleanup.categories.push(activeCategory.id)

      sampleSoftwareType = await payload.create({
        collection: 'software_types',
        data: {
          title: `Public SoftwareType ${getSeq()}`,
          slug: `pub-sw-${Date.now()}-${getSeq()}`,
          fileExtensions: ['.dwg', '.dxf'],
        },
        overrideAccess: true,
      })
      cleanup.softwareTypes.push(sampleSoftwareType.id)

      sampleTag = await payload.create({
        collection: 'tags',
        data: {
          title: `Public Tag ${getSeq()}`,
          slug: `pub-tag-${Date.now()}-${getSeq()}`,
        },
        overrideAccess: true,
      })
      cleanup.tags.push(sampleTag.id)

      samplePreview = await payload.create({
        collection: 'product_previews',
        data: {
          title: `Public Preview ${getSeq()}`,
          previewImage: testMedia.id,
          previewType: 'image',
          isWatermarked: true,
        },
        overrideAccess: true,
      })
      cleanup.productPreviews.push(samplePreview.id)
    })

    it('allows an unauthenticated guest (user: null) to find published products', async () => {
      const result = await payload.find({
        collection: 'products',
        where: { id: { equals: publishedProduct.id } },
        overrideAccess: false,
        user: null,
      })
      expect(result.docs).toHaveLength(1)
      expect(result.docs[0].id).toBe(publishedProduct.id)
      expect(result.docs[0]._status).toBe('published')
    })

    it('allows an unauthenticated guest (user: null) to read a published product by ID', async () => {
      const doc = await payload.findByID({
        collection: 'products',
        id: publishedProduct.id,
        overrideAccess: false,
        user: null,
      })
      expect(doc.id).toBe(publishedProduct.id)
      expect(doc._status).toBe('published')
    })

    it('allows an unauthenticated guest to find and read categories', async () => {
      const result = await payload.find({
        collection: 'categories',
        where: { id: { equals: activeCategory.id } },
        overrideAccess: false,
        user: null,
      })
      expect(result.docs).toHaveLength(1)
      expect(result.docs[0].id).toBe(activeCategory.id)

      const doc = await payload.findByID({
        collection: 'categories',
        id: activeCategory.id,
        overrideAccess: false,
        user: null,
      })
      expect(doc.id).toBe(activeCategory.id)
    })

    it('allows an unauthenticated guest to find and read software types', async () => {
      const result = await payload.find({
        collection: 'software_types',
        where: { id: { equals: sampleSoftwareType.id } },
        overrideAccess: false,
        user: null,
      })
      expect(result.docs).toHaveLength(1)
      expect(result.docs[0].id).toBe(sampleSoftwareType.id)

      const doc = await payload.findByID({
        collection: 'software_types',
        id: sampleSoftwareType.id,
        overrideAccess: false,
        user: null,
      })
      expect(doc.id).toBe(sampleSoftwareType.id)
    })

    it('allows an unauthenticated guest to find and read tags', async () => {
      const result = await payload.find({
        collection: 'tags',
        where: { id: { equals: sampleTag.id } },
        overrideAccess: false,
        user: null,
      })
      expect(result.docs).toHaveLength(1)
      expect(result.docs[0].id).toBe(sampleTag.id)

      const doc = await payload.findByID({
        collection: 'tags',
        id: sampleTag.id,
        overrideAccess: false,
        user: null,
      })
      expect(doc.id).toBe(sampleTag.id)
    })

    it('allows an unauthenticated guest to find and read product previews', async () => {
      const result = await payload.find({
        collection: 'product_previews',
        where: { id: { equals: samplePreview.id } },
        overrideAccess: false,
        user: null,
      })
      expect(result.docs).toHaveLength(1)
      expect(result.docs[0].id).toBe(samplePreview.id)
    })
  })

  // =========================================================================
  // Requirement 2: Public cannot read draft products
  // =========================================================================
  describe('2. Public cannot read draft products (draft isolation)', () => {
    let draftProduct: Product

    beforeAll(async () => {
      draftProduct = await payload.create({
        collection: 'products',
        draft: true,
        data: {
          title: `Secret Unpublished Draft ${getSeq()}`,
          price: 500000,
        },
        overrideAccess: true,
      })
      cleanup.products.push(draftProduct.id)
    })

    it('hides draft products from guest find queries', async () => {
      const findResult = await payload.find({
        collection: 'products',
        where: { id: { equals: draftProduct.id } },
        overrideAccess: false,
        user: null,
      })
      expect(findResult.docs).toHaveLength(0)
      expect(findResult.totalDocs).toBe(0)
    })

    it('denies guest retrieval of draft products by ID', async () => {
      await expect(
        payload.findByID({
          collection: 'products',
          id: draftProduct.id,
          overrideAccess: false,
          user: null,
        }),
      ).rejects.toThrow()
    })

    it('ensures broad guest product queries return zero draft items', async () => {
      const broadFind = await payload.find({
        collection: 'products',
        overrideAccess: false,
        user: null,
      })
      expect(broadFind.docs.length).toBeGreaterThan(0)
      for (const item of broadFind.docs) {
        expect(item._status).toBe('published')
        expect(item.id).not.toBe(draftProduct.id)
      }
    })

    it('denies anonymous guest product creation', async () => {
      await expect(
        payload.create({
          collection: 'products',
          draft: true,
          data: { title: `Anonymous Create Attempt ${getSeq()}` },
          overrideAccess: false,
          user: null,
        }),
      ).rejects.toThrow()
    })

    it('denies anonymous guest product modification', async () => {
      await expect(
        payload.update({
          collection: 'products',
          id: draftProduct.id,
          data: { title: 'Hijacked by Guest' },
          overrideAccess: false,
          user: null,
        }),
      ).rejects.toThrow()
    })
  })

  // =========================================================================
  // Requirement 3: Buyer cannot create or update products
  // =========================================================================
  describe('3. Buyer (roles: ["buyer"]) cannot create or update products', () => {
    let existingProduct: Product

    beforeAll(async () => {
      existingProduct = await payload.create({
        collection: 'products',
        data: {
          title: `Buyer Target Product ${getSeq()}`,
          slug: `buyer-target-${Date.now()}-${getSeq()}`,
          price: 200000,
          _status: 'published',
        },
        overrideAccess: true,
      })
      cleanup.products.push(existingProduct.id)
    })

    it('denies buyer creating a draft product', async () => {
      await expect(
        payload.create({
          collection: 'products',
          draft: true,
          data: { title: `Buyer Draft Creation ${getSeq()}` },
          overrideAccess: false,
          user: buyerUser,
        }),
      ).rejects.toThrow()
    })

    it('denies buyer creating a published product', async () => {
      await expect(
        payload.create({
          collection: 'products',
          data: {
            title: `Buyer Published Creation ${getSeq()}`,
            slug: `buyer-pub-${Date.now()}-${getSeq()}`,
            price: 100000,
            _status: 'published',
          },
          overrideAccess: false,
          user: buyerUser,
        }),
      ).rejects.toThrow()
    })

    it('denies buyer updating existing product details', async () => {
      await expect(
        payload.update({
          collection: 'products',
          id: existingProduct.id,
          data: { title: 'Modified by Buyer' },
          overrideAccess: false,
          user: buyerUser,
        }),
      ).rejects.toThrow()
    })

    it('denies buyer modifying product status', async () => {
      await expect(
        payload.update({
          collection: 'products',
          id: existingProduct.id,
          data: { _status: 'draft' },
          overrideAccess: false,
          user: buyerUser,
        }),
      ).rejects.toThrow()
    })

    it('denies buyer deleting products', async () => {
      await expect(
        payload.delete({
          collection: 'products',
          id: existingProduct.id,
          overrideAccess: false,
          user: buyerUser,
        }),
      ).rejects.toThrow()
    })

    it('denies buyer creating taxonomy entities (categories, software types, tags)', async () => {
      await expect(
        payload.create({
          collection: 'categories',
          data: { title: `Buyer Cat ${getSeq()}`, slug: `buyer-cat-${getSeq()}` },
          overrideAccess: false,
          user: buyerUser,
        }),
      ).rejects.toThrow()

      await expect(
        payload.create({
          collection: 'software_types',
          data: { title: `Buyer SW ${getSeq()}`, slug: `buyer-sw-${getSeq()}` },
          overrideAccess: false,
          user: buyerUser,
        }),
      ).rejects.toThrow()

      await expect(
        payload.create({
          collection: 'tags',
          data: { title: `Buyer Tag ${getSeq()}`, slug: `buyer-tag-${getSeq()}` },
          overrideAccess: false,
          user: buyerUser,
        }),
      ).rejects.toThrow()
    })

    it('permits buyer to read published products as normal consumer', async () => {
      const findResult = await payload.find({
        collection: 'products',
        where: { id: { equals: existingProduct.id } },
        overrideAccess: false,
        user: buyerUser,
      })
      expect(findResult.docs).toHaveLength(1)
      expect(findResult.docs[0].id).toBe(existingProduct.id)
    })
  })

  // =========================================================================
  // Requirement 4: Seller can create products & tags, cannot update published
  // =========================================================================
  describe('4. Seller (roles: ["seller"]) create permissions & published update restriction', () => {
    let publishedProductToTest: Product

    beforeAll(async () => {
      publishedProductToTest = await payload.create({
        collection: 'products',
        data: {
          title: `Published Baseline ${getSeq()}`,
          slug: `pub-base-${Date.now()}-${getSeq()}`,
          price: 250000,
          _status: 'published',
        },
        overrideAccess: true,
      })
      cleanup.products.push(publishedProductToTest.id)
    })

    it('allows a seller to create a draft product', async () => {
      const product = await payload.create({
        collection: 'products',
        draft: true,
        data: {
          title: `Seller Draft Engineering File ${getSeq()}`,
          price: 200000,
        },
        overrideAccess: false,
        user: sellerUser,
      })
      cleanup.products.push(product.id)

      expect(product.id).toBeDefined()
      expect(product._status).toBe('draft')
      expect(product.title).toContain('Seller Draft')
    })

    it('allows a seller to create a published product', async () => {
      const product = await payload.create({
        collection: 'products',
        data: {
          title: `Seller Published CAD Model ${getSeq()}`,
          slug: `seller-pub-${Date.now()}-${getSeq()}`,
          price: 350000,
          isFree: false,
          _status: 'published',
        },
        overrideAccess: false,
        user: sellerUser,
      })
      cleanup.products.push(product.id)

      expect(product.id).toBeDefined()
      expect(product._status).toBe('published')
      expect(product.price).toBe(350000)
    })

    it('allows a seller to create tags', async () => {
      const tag = await payload.create({
        collection: 'tags',
        data: {
          title: `Seller Tag ${getSeq()}`,
          slug: `seller-tag-${Date.now()}-${getSeq()}`,
          description: 'Tag created by seller',
        },
        overrideAccess: false,
        user: sellerUser,
      })
      cleanup.tags.push(tag.id)

      expect(tag.id).toBeDefined()
      expect(tag.title).toContain('Seller Tag')
    })

    it('denies a seller updating a published product', async () => {
      await expect(
        payload.update({
          collection: 'products',
          id: publishedProductToTest.id,
          data: {
            title: 'Seller Tampered Title',
            price: 1000,
          },
          overrideAccess: false,
          user: sellerUser,
        }),
      ).rejects.toThrow()
    })

    it('denies a seller deleting products', async () => {
      await expect(
        payload.delete({
          collection: 'products',
          id: publishedProductToTest.id,
          overrideAccess: false,
          user: sellerUser,
        }),
      ).rejects.toThrow()
    })

    it('denies a seller creating categories or software types (restricted to admin)', async () => {
      await expect(
        payload.create({
          collection: 'categories',
          data: { title: `Seller Cat ${getSeq()}`, slug: `seller-cat-${getSeq()}` },
          overrideAccess: false,
          user: sellerUser,
        }),
      ).rejects.toThrow()

      await expect(
        payload.create({
          collection: 'software_types',
          data: { title: `Seller SW ${getSeq()}`, slug: `seller-sw-${getSeq()}` },
          overrideAccess: false,
          user: sellerUser,
        }),
      ).rejects.toThrow()
    })
  })

  // =========================================================================
  // Requirement 5: Moderator can update products, cannot create unless seller
  // =========================================================================
  describe('5. Moderator (roles: ["moderator"]) update permissions & create restriction', () => {
    let modTargetProduct: Product

    beforeAll(async () => {
      modTargetProduct = await payload.create({
        collection: 'products',
        data: {
          title: `Moderation Target Product ${getSeq()}`,
          slug: `mod-target-${Date.now()}-${getSeq()}`,
          price: 180000,
          _status: 'published',
        },
        overrideAccess: true,
      })
      cleanup.products.push(modTargetProduct.id)
    })

    it('allows a moderator to update product details (title and price)', async () => {
      const updated = await payload.update({
        collection: 'products',
        id: modTargetProduct.id,
        data: {
          title: `Moderator Approved Title ${getSeq()}`,
          price: 220000,
        },
        overrideAccess: false,
        user: moderatorUser,
      })

      expect(updated.title).toContain('Moderator Approved Title')
      expect(updated.price).toBe(220000)
    })

    it('allows a moderator to unpublish a product (change status to draft)', async () => {
      const unpublished = await payload.update({
        collection: 'products',
        id: modTargetProduct.id,
        data: {
          _status: 'draft',
        },
        overrideAccess: false,
        user: moderatorUser,
      })

      expect(unpublished._status).toBe('draft')
    })

    it('allows a moderator to re-publish a product (change status to published)', async () => {
      const republished = await payload.update({
        collection: 'products',
        id: modTargetProduct.id,
        data: {
          _status: 'published',
        },
        overrideAccess: false,
        user: moderatorUser,
      })

      expect(republished._status).toBe('published')
    })

    it('denies a pure moderator creating a draft product', async () => {
      await expect(
        payload.create({
          collection: 'products',
          draft: true,
          data: { title: `Moderator Draft Attempt ${getSeq()}` },
          overrideAccess: false,
          user: moderatorUser,
        }),
      ).rejects.toThrow()
    })

    it('denies a pure moderator creating a published product', async () => {
      await expect(
        payload.create({
          collection: 'products',
          data: {
            title: `Moderator Published Attempt ${getSeq()}`,
            slug: `mod-pub-${Date.now()}-${getSeq()}`,
            price: 300000,
            _status: 'published',
          },
          overrideAccess: false,
          user: moderatorUser,
        }),
      ).rejects.toThrow()
    })

    it('allows a moderator who ALSO has the seller role to create products', async () => {
      const dualProduct = await payload.create({
        collection: 'products',
        draft: true,
        data: {
          title: `Dual Moderator-Seller Asset ${getSeq()}`,
          price: 400000,
        },
        overrideAccess: false,
        user: moderatorSellerUser,
      })
      cleanup.products.push(dualProduct.id)

      expect(dualProduct.id).toBeDefined()
      expect(dualProduct._status).toBe('draft')

      // Dual-role user can also update the product
      const dualUpdated = await payload.update({
        collection: 'products',
        id: dualProduct.id,
        data: {
          title: `Dual Mod-Seller Updated ${getSeq()}`,
          _status: 'published',
        },
        overrideAccess: false,
        user: moderatorSellerUser,
      })
      expect(dualUpdated._status).toBe('published')
      expect(dualUpdated.title).toContain('Dual Mod-Seller Updated')
    })

    it('denies a moderator deleting products (restricted to admin)', async () => {
      await expect(
        payload.delete({
          collection: 'products',
          id: modTargetProduct.id,
          overrideAccess: false,
          user: moderatorUser,
        }),
      ).rejects.toThrow()
    })
  })

  // =========================================================================
  // Requirement 6: Admin can perform all CRUD on all catalog entities
  // =========================================================================
  describe('6. Admin (roles: ["admin"]) full CRUD operations across all catalog entities', () => {
    it('executes full CRUD on products as admin', async () => {
      // 1. Create
      const created = await payload.create({
        collection: 'products',
        data: {
          title: `Admin Full CRUD Product ${getSeq()}`,
          slug: `admin-crud-prod-${Date.now()}-${getSeq()}`,
          price: 600000,
          _status: 'published',
        },
        overrideAccess: false,
        user: adminUser,
      })
      expect(created.id).toBeDefined()

      // 2. Read by ID
      const readDoc = await payload.findByID({
        collection: 'products',
        id: created.id,
        overrideAccess: false,
        user: adminUser,
      })
      expect(readDoc.id).toBe(created.id)

      // 3. Update
      const updated = await payload.update({
        collection: 'products',
        id: created.id,
        data: {
          title: `Admin Updated Product Title ${getSeq()}`,
          price: 750000,
        },
        overrideAccess: false,
        user: adminUser,
      })
      expect(updated.title).toContain('Admin Updated Product Title')
      expect(updated.price).toBe(750000)

      // 4. Delete
      const deleted = await payload.delete({
        collection: 'products',
        id: created.id,
        overrideAccess: false,
        user: adminUser,
      })
      expect(deleted.id).toBe(created.id)

      // Confirm deletion
      await expect(
        payload.findByID({
          collection: 'products',
          id: created.id,
          overrideAccess: false,
          user: adminUser,
        }),
      ).rejects.toThrow()
    })

    it('executes full CRUD on categories as admin', async () => {
      // 1. Create
      const created = await payload.create({
        collection: 'categories',
        data: {
          title: `Admin Full CRUD Category ${getSeq()}`,
          slug: `admin-cat-${Date.now()}-${getSeq()}`,
          description: 'Category created by admin',
          status: 'active',
        },
        overrideAccess: false,
        user: adminUser,
      })
      expect(created.id).toBeDefined()

      // 2. Read by ID
      const readDoc = await payload.findByID({
        collection: 'categories',
        id: created.id,
        overrideAccess: false,
        user: adminUser,
      })
      expect(readDoc.id).toBe(created.id)

      // 3. Update
      const updated = await payload.update({
        collection: 'categories',
        id: created.id,
        data: {
          description: 'Updated category description by admin',
        },
        overrideAccess: false,
        user: adminUser,
      })
      expect(updated.description).toBe('Updated category description by admin')

      // 4. Delete
      const deleted = await payload.delete({
        collection: 'categories',
        id: created.id,
        overrideAccess: false,
        user: adminUser,
      })
      expect(deleted.id).toBe(created.id)
    })

    it('executes full CRUD on software_types as admin', async () => {
      // 1. Create
      const created = await payload.create({
        collection: 'software_types',
        data: {
          title: `Admin Full CRUD SoftwareType ${getSeq()}`,
          slug: `admin-sw-${Date.now()}-${getSeq()}`,
          fileExtensions: ['.rvt', '.rfa'],
          sortOrder: 5,
        },
        overrideAccess: false,
        user: adminUser,
      })
      expect(created.id).toBeDefined()

      // 2. Read by ID
      const readDoc = await payload.findByID({
        collection: 'software_types',
        id: created.id,
        overrideAccess: false,
        user: adminUser,
      })
      expect(readDoc.id).toBe(created.id)

      // 3. Update
      const updated = await payload.update({
        collection: 'software_types',
        id: created.id,
        data: {
          sortOrder: 10,
        },
        overrideAccess: false,
        user: adminUser,
      })
      expect(updated.sortOrder).toBe(10)

      // 4. Delete
      const deleted = await payload.delete({
        collection: 'software_types',
        id: created.id,
        overrideAccess: false,
        user: adminUser,
      })
      expect(deleted.id).toBe(created.id)
    })

    it('executes full CRUD on tags as admin', async () => {
      // 1. Create
      const created = await payload.create({
        collection: 'tags',
        data: {
          title: `Admin Full CRUD Tag ${getSeq()}`,
          slug: `admin-tag-${Date.now()}-${getSeq()}`,
          description: 'Tag created by admin',
        },
        overrideAccess: false,
        user: adminUser,
      })
      expect(created.id).toBeDefined()

      // 2. Read by ID
      const readDoc = await payload.findByID({
        collection: 'tags',
        id: created.id,
        overrideAccess: false,
        user: adminUser,
      })
      expect(readDoc.id).toBe(created.id)

      // 3. Update
      const updated = await payload.update({
        collection: 'tags',
        id: created.id,
        data: {
          description: 'Updated tag description by admin',
        },
        overrideAccess: false,
        user: adminUser,
      })
      expect(updated.description).toBe('Updated tag description by admin')

      // 4. Delete
      const deleted = await payload.delete({
        collection: 'tags',
        id: created.id,
        overrideAccess: false,
        user: adminUser,
      })
      expect(deleted.id).toBe(created.id)
    })

    it('executes full CRUD on product_previews as admin', async () => {
      // 1. Create
      const created = await payload.create({
        collection: 'product_previews',
        data: {
          title: `Admin Full CRUD Preview ${getSeq()}`,
          previewImage: testMedia.id,
          previewType: 'image',
          isWatermarked: true,
        },
        overrideAccess: false,
        user: adminUser,
      })
      expect(created.id).toBeDefined()

      // 2. Read by ID
      const readDoc = await payload.findByID({
        collection: 'product_previews',
        id: created.id,
        overrideAccess: false,
        user: adminUser,
      })
      expect(readDoc.id).toBe(created.id)

      // 3. Update
      const updated = await payload.update({
        collection: 'product_previews',
        id: created.id,
        data: {
          caption: 'Updated preview caption by admin',
        },
        overrideAccess: false,
        user: adminUser,
      })
      expect(updated.caption).toBe('Updated preview caption by admin')

      // 4. Delete
      const deleted = await payload.delete({
        collection: 'product_previews',
        id: created.id,
        overrideAccess: false,
        user: adminUser,
      })
      expect(deleted.id).toBe(created.id)
    })
  })
})
