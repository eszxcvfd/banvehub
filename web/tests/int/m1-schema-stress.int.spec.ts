import { getPayload, type Payload } from 'payload'
import config from '@/payload.config'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Category, Media, Product, ProductPreview, SoftwareType, Tag, User } from '@/payload-types'

describe('M1 Digital Catalog Empirical Stress & Schema Verification', () => {
  let payload: Payload
  let adminUser: User
  let sellerUser: User

  // Track created IDs for cleanup
  const cleanup = {
    products: [] as (number | string)[],
    productPreviews: [] as (number | string)[],
    tags: [] as (number | string)[],
    softwareTypes: [] as (number | string)[],
    categories: [] as (number | string)[],
    media: [] as (number | string)[],
    users: [] as (number | string)[],
  }

  let testMedia: Media
  let testSoftwareTypeAutoCAD: SoftwareType
  let testSoftwareTypeRevit: SoftwareType
  let testTagArch: Tag
  let testTagBIM: Tag
  let parentCategory: Category
  let childCategory: Category
  let testPreview: ProductPreview

  beforeAll(async () => {
    payload = await getPayload({ config: await config })

    // Create admin user for setup
    adminUser = await payload.create({
      collection: 'users',
      data: {
        email: `m1-stress-admin-${Date.now()}@example.test`,
        password: 'test-password-123',
        name: 'Stress Admin',
        roles: ['admin'],
      },
      overrideAccess: true,
    })
    cleanup.users.push(adminUser.id)

    // Create seller user
    sellerUser = await payload.create({
      collection: 'users',
      data: {
        email: `m1-stress-seller-${Date.now()}@example.test`,
        password: 'test-password-123',
        name: 'Stress Seller',
        roles: ['seller'],
      },
      overrideAccess: true,
    })
    cleanup.users.push(sellerUser.id)

    // Create a 1x1 transparent PNG for test media
    const pngBuffer = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
      'base64',
    )
    testMedia = await payload.create({
      collection: 'media',
      data: {
        alt: 'Test 1x1 PNG',
      },
      file: {
        data: pngBuffer,
        mimetype: 'image/png',
        name: `test-m1-${Date.now()}.png`,
        size: pngBuffer.length,
      },
      overrideAccess: true,
    })
    cleanup.media.push(testMedia.id)

    // Create taxonomy: SoftwareTypes
    testSoftwareTypeAutoCAD = await payload.create({
      collection: 'software_types',
      data: {
        title: `AutoCAD ${Date.now()}`,
        slug: `autocad-${Date.now()}`,
        description: 'AutoCAD CAD software for 2D and 3D design',
        fileExtensions: ['.dwg', '.dxf'],
        icon: testMedia.id,
        sortOrder: 1,
      },
      overrideAccess: true,
    })
    cleanup.softwareTypes.push(testSoftwareTypeAutoCAD.id)

    testSoftwareTypeRevit = await payload.create({
      collection: 'software_types',
      data: {
        title: `Revit ${Date.now()}`,
        slug: `revit-${Date.now()}`,
        description: 'BIM software for architecture and engineering',
        fileExtensions: ['.rvt', '.rfa'],
        sortOrder: 2,
      },
      overrideAccess: true,
    })
    cleanup.softwareTypes.push(testSoftwareTypeRevit.id)

    // Create taxonomy: Tags
    testTagArch = await payload.create({
      collection: 'tags',
      data: {
        title: `Architecture ${Date.now()}`,
        slug: `architecture-${Date.now()}`,
        description: 'Architectural models and drawings',
      },
      overrideAccess: true,
    })
    cleanup.tags.push(testTagArch.id)

    testTagBIM = await payload.create({
      collection: 'tags',
      data: {
        title: `BIM ${Date.now()}`,
        slug: `bim-${Date.now()}`,
        description: 'Building Information Modeling assets',
      },
      overrideAccess: true,
    })
    cleanup.tags.push(testTagBIM.id)

    // Create taxonomy: Hierarchical Categories
    parentCategory = await payload.create({
      collection: 'categories',
      data: {
        title: `CAD Drawings ${Date.now()}`,
        slug: `cad-drawings-${Date.now()}`,
        description: 'Root category for CAD files',
        status: 'active',
        sortOrder: 10,
      },
      overrideAccess: true,
    })
    cleanup.categories.push(parentCategory.id)

    childCategory = await payload.create({
      collection: 'categories',
      data: {
        title: `Architectural Plans ${Date.now()}`,
        slug: `arch-plans-${Date.now()}`,
        description: 'Subcategory under CAD Drawings',
        parent: parentCategory.id,
        status: 'active',
        sortOrder: 1,
      },
      overrideAccess: true,
    })
    cleanup.categories.push(childCategory.id)

    // Create Product Previews
    testPreview = await payload.create({
      collection: 'product_previews',
      data: {
        title: `Floor Plan Preview ${Date.now()}`,
        previewImage: testMedia.id,
        previewType: 'image',
        isWatermarked: true,
        caption: 'Public watermarked preview sheet',
      },
      overrideAccess: true,
    })
    cleanup.productPreviews.push(testPreview.id)
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

  describe('1. Database Tables & Schema Direct SQL Verification', () => {
    it('confirms all physical goods tables are absent from PostgreSQL', async () => {
      const result = await payload.db.drizzle.execute(
        `SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename IN ('variants', 'variants_rels', '_variants_v', '_variants_v_rels', 'variant_types', 'variant_options', 'carts', 'carts_items');`,
      )
      const rows = ((result as unknown as { rows: { tablename: string }[] }).rows || result) as { tablename: string }[]
      expect(rows).toHaveLength(0)
    })

    it('confirms new digital goods tables exist in PostgreSQL', async () => {
      const result = await payload.db.drizzle.execute(
        `SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename IN ('software_types', 'software_types_texts', 'tags', 'product_previews');`,
      )
      const rows = ((result as unknown as { rows: { tablename: string }[] }).rows || result) as { tablename: string }[]
      const foundNames = rows.map((r) => r.tablename)
      expect(foundNames).toContain('software_types')
      expect(foundNames).toContain('software_types_texts')
      expect(foundNames).toContain('tags')
      expect(foundNames).toContain('product_previews')
    })

    it('confirms physical merchandise columns dropped and digital columns added on products', async () => {
      const checkDropped = await payload.db.drizzle.execute(
        `SELECT column_name FROM information_schema.columns WHERE table_name = 'products' AND column_name IN ('inventory', 'enable_variants', 'price_in_u_s_d_enabled', 'price_in_u_s_d', 'deleted_at');`,
      )
      const droppedRows = ((checkDropped as unknown as { rows: unknown[] }).rows || checkDropped) as unknown[]
      expect(droppedRows).toHaveLength(0)

      const checkAdded = await payload.db.drizzle.execute(
        `SELECT column_name FROM information_schema.columns WHERE table_name = 'products' AND column_name IN ('price', 'is_free', 'technical_specs_file_format', 'technical_specs_software_version', 'technical_specs_file_size', 'technical_specs_unit');`,
      )
      const addedRows = ((checkAdded as unknown as { rows: { column_name: string }[] }).rows || checkAdded) as {
        column_name: string
      }[]
      const foundCols = addedRows.map((r) => r.column_name)
      const expectedAdded = [
        'price',
        'is_free',
        'technical_specs_file_format',
        'technical_specs_software_version',
        'technical_specs_file_size',
        'technical_specs_unit',
      ]
      for (const col of expectedAdded) {
        expect(foundCols).toContain(col)
      }
    })

    it('confirms enriched columns added on categories', async () => {
      const checkCategories = await payload.db.drizzle.execute(
        `SELECT column_name FROM information_schema.columns WHERE table_name = 'categories' AND column_name IN ('description', 'parent_id', 'icon_id', 'image_id', 'sort_order', 'status', 'meta_title', 'meta_description', 'meta_image_id');`,
      )
      const rows = ((checkCategories as unknown as { rows: { column_name: string }[] }).rows || checkCategories) as {
        column_name: string
      }[]
      const foundCols = rows.map((r) => r.column_name)
      const expectedEnriched = [
        'description',
        'parent_id',
        'icon_id',
        'image_id',
        'sort_order',
        'status',
        'meta_title',
        'meta_description',
        'meta_image_id',
      ]
      for (const col of expectedEnriched) {
        expect(foundCols).toContain(col)
      }
    })

    it('confirms products_rels links to digital entities and not variant_types', async () => {
      const relCols = await payload.db.drizzle.execute(
        `SELECT column_name FROM information_schema.columns WHERE table_name = 'products_rels';`,
      )
      const rows = ((relCols as unknown as { rows: { column_name: string }[] }).rows || relCols) as {
        column_name: string
      }[]
      const colNames = rows.map((r) => r.column_name)
      expect(colNames).toContain('software_types_id')
      expect(colNames).toContain('tags_id')
      expect(colNames).toContain('product_previews_id')
      expect(colNames).toContain('categories_id')
      expect(colNames).not.toContain('variant_types_id')
    })
  })

  describe('2. Pricing & Free Flag Edge Cases', () => {
    it('creates a free digital product with price = 0 and isFree = true', async () => {
      const p = await payload.create({
        collection: 'products',
        data: {
          title: `Free Architecture Model ${Date.now()}`,
          price: 0,
          isFree: true,
          _status: 'published',
        } as any,
        overrideAccess: true,
      })
      cleanup.products.push(p.id)

      expect(p.price).toBe(0)
      expect(p.isFree).toBe(true)
      expect(p._status).toBe('published')
    })

    it('creates a paid digital product with VND price > 0 and isFree = false', async () => {
      const p = await payload.create({
        collection: 'products',
        data: {
          title: `Premium BIM Villa Model ${Date.now()}`,
          price: 750000,
          isFree: false,
          _status: 'published',
        } as any,
        overrideAccess: true,
      })
      cleanup.products.push(p.id)

      expect(p.price).toBe(750000)
      expect(p.isFree).toBe(false)
    })

    it('defaults price to 0 when omitted', async () => {
      const p = await payload.create({
        collection: 'products',
        data: {
          title: `Default Price Product ${Date.now()}`,
          _status: 'published',
        } as any,
        overrideAccess: true,
      })
      cleanup.products.push(p.id)

      expect(p.price).toBe(0)
      expect(p.isFree).toBe(false)
    })

    it('rejects negative price (< 0) via validation rules', async () => {
      await expect(
        payload.create({
          collection: 'products',
          data: {
            title: `Negative Price Attempt ${Date.now()}`,
            price: -50000,
            _status: 'published',
          } as any,
          overrideAccess: true,
        }),
      ).rejects.toThrow()
    })
  })

  describe('3. Technical Specifications & Metadata', () => {
    it('persists and retrieves full technicalSpecs group with metric unit', async () => {
      const p = await payload.create({
        collection: 'products',
        data: {
          title: `Modern Highrise DWG ${Date.now()}`,
          price: 250000,
          technicalSpecs: {
            fileFormat: '.dwg, .dxf',
            softwareVersion: 'AutoCAD 2024+',
            fileSize: '48.5 MB',
            unit: 'metric',
          },
          _status: 'published',
        } as any,
        overrideAccess: true,
      })
      cleanup.products.push(p.id)

      expect(p.technicalSpecs?.fileFormat).toBe('.dwg, .dxf')
      expect(p.technicalSpecs?.softwareVersion).toBe('AutoCAD 2024+')
      expect(p.technicalSpecs?.fileSize).toBe('48.5 MB')
      expect(p.technicalSpecs?.unit).toBe('metric')
    })

    it('persists imperial and other unit options', async () => {
      const p = await payload.create({
        collection: 'products',
        data: {
          title: `Imperial Bridge Model ${Date.now()}`,
          price: 150000,
          technicalSpecs: {
            fileFormat: '.rvt',
            unit: 'imperial',
          },
          _status: 'published',
        } as any,
        overrideAccess: true,
      })
      cleanup.products.push(p.id)
      expect(p.technicalSpecs?.unit).toBe('imperial')
    })
  })

  describe('4. Digital Taxonomy Relations & Deep Population', () => {
    let complexProduct: Product

    beforeAll(async () => {
      complexProduct = await payload.create({
        collection: 'products',
        data: {
          title: `Complete Residential Villa Project ${Date.now()}`,
          price: 1200000,
          isFree: false,
          categories: [parentCategory.id, childCategory.id],
          software_types: [testSoftwareTypeAutoCAD.id, testSoftwareTypeRevit.id],
          tags: [testTagArch.id, testTagBIM.id],
          previewGallery: [testPreview.id],
          gallery: [
            {
              image: testMedia.id,
              caption: 'Front elevation render',
            },
          ],
          technicalSpecs: {
            fileFormat: '.rvt, .dwg',
            softwareVersion: 'Revit 2024, AutoCAD 2024',
            fileSize: '124 MB',
            unit: 'metric',
          },
          _status: 'published',
        } as any,
        overrideAccess: true,
      })
      cleanup.products.push(complexProduct.id)
    })

    it('populates relationships deeply at depth: 2', async () => {
      const retrieved = await payload.findByID({
        collection: 'products',
        id: complexProduct.id,
        depth: 2,
        overrideAccess: true,
      })

      expect(retrieved).toBeDefined()
      // Verify software_types populated
      const softwareTypes = retrieved.software_types as SoftwareType[]
      expect(softwareTypes).toHaveLength(2)
      const stTitles = softwareTypes.map((st) => st.title)
      expect(stTitles).toContain(testSoftwareTypeAutoCAD.title)
      expect(stTitles).toContain(testSoftwareTypeRevit.title)

      // Verify categories populated
      const categories = retrieved.categories as Category[]
      expect(categories).toHaveLength(2)
      const catTitles = categories.map((c) => c.title)
      expect(catTitles).toContain(parentCategory.title)
      expect(catTitles).toContain(childCategory.title)

      // Verify tags populated
      const tags = retrieved.tags as Tag[]
      expect(tags).toHaveLength(2)
      const tagTitles = tags.map((t) => t.title)
      expect(tagTitles).toContain(testTagArch.title)
      expect(tagTitles).toContain(testTagBIM.title)

      // Verify previewGallery populated
      const previews = retrieved.previewGallery as ProductPreview[]
      expect(previews).toHaveLength(1)
      expect(previews[0].title).toBe(testPreview.title)
      expect(previews[0].isWatermarked).toBe(true)

      // Verify direct gallery populated
      expect(retrieved.gallery).toHaveLength(1)
      expect((retrieved.gallery?.[0].image as Media).id).toBe(testMedia.id)
    })

    it('filters products by software_types relationship', async () => {
      const results = await payload.find({
        collection: 'products',
        where: {
          software_types: {
            contains: testSoftwareTypeAutoCAD.id,
          },
        },
        overrideAccess: true,
      })

      const ids = results.docs.map((d) => d.id)
      expect(ids).toContain(complexProduct.id)
    })

    it('filters products by categories relationship', async () => {
      const results = await payload.find({
        collection: 'products',
        where: {
          categories: {
            contains: childCategory.id,
          },
        },
        overrideAccess: true,
      })

      const ids = results.docs.map((d) => d.id)
      expect(ids).toContain(complexProduct.id)
    })

    it('filters products by tags relationship', async () => {
      const results = await payload.find({
        collection: 'products',
        where: {
          tags: {
            contains: testTagBIM.id,
          },
        },
        overrideAccess: true,
      })

      const ids = results.docs.map((d) => d.id)
      expect(ids).toContain(complexProduct.id)
    })

    it('filters products by price range and free status', async () => {
      const paidResults = await payload.find({
        collection: 'products',
        where: {
          and: [
            { isFree: { equals: false } },
            { price: { greater_than: 500000 } },
          ],
        },
        overrideAccess: true,
      })
      const ids = paidResults.docs.map((d) => d.id)
      expect(ids).toContain(complexProduct.id)
    })
  })

  describe('5. Drafts, Publishing & Public Isolation Lifecycle', () => {
    let draftProduct: Product

    it('allows a seller to create a draft product with partial data', async () => {
      draftProduct = await payload.create({
        collection: 'products',
        draft: true,
        data: {
          title: `Unpublished Draft Project ${Date.now()}`,
        },
        overrideAccess: false,
        user: sellerUser,
      })
      cleanup.products.push(draftProduct.id)

      expect(draftProduct.id).toBeDefined()
      expect(draftProduct._status).toBe('draft')
    })

    it('hides draft products from anonymous guests (public access)', async () => {
      const guestFind = await payload.find({
        collection: 'products',
        where: {
          id: { equals: draftProduct.id },
        },
        overrideAccess: false,
        user: undefined, // Guest
      })

      expect(guestFind.docs).toHaveLength(0)
    })

    it('allows admin to see the draft product', async () => {
      const adminFind = await payload.find({
        collection: 'products',
        where: {
          id: { equals: draftProduct.id },
        },
        overrideAccess: false,
        user: adminUser,
      })

      expect(adminFind.docs).toHaveLength(1)
      expect(adminFind.docs[0].id).toBe(draftProduct.id)
    })

    it('publishes the draft product and makes it immediately visible to guests', async () => {
      const published = await payload.update({
        collection: 'products',
        id: draftProduct.id,
        data: {
          price: 100000,
          _status: 'published',
        },
        overrideAccess: false,
        user: adminUser,
      })

      expect(published._status).toBe('published')

      // Now query as guest
      const guestFind = await payload.find({
        collection: 'products',
        where: {
          id: { equals: draftProduct.id },
        },
        overrideAccess: false,
        user: undefined, // Guest
      })

      expect(guestFind.docs).toHaveLength(1)
      expect(guestFind.docs[0].id).toBe(draftProduct.id)
    })
  })

  describe('6. Self-referential Category Hierarchy', () => {
    it('retrieves child category with parent category populated', async () => {
      const cat = await payload.findByID({
        collection: 'categories',
        id: childCategory.id,
        depth: 1,
        overrideAccess: true,
      })

      expect(cat).toBeDefined()
      expect(cat.parent).toBeDefined()
      expect((cat.parent as Category).id).toBe(parentCategory.id)
      expect((cat.parent as Category).title).toBe(parentCategory.title)
    })
  })

  describe('7. Slug Generation & Uniqueness Enforcement', () => {
    it('enforces slug uniqueness and rejects duplicate slugs', async () => {
      const identicalTitle = `Duplicate Title Asset ${Date.now()}`
      const p1 = await payload.create({
        collection: 'products',
        data: {
          title: identicalTitle,
          price: 50000,
          _status: 'published',
        } as any,
        overrideAccess: true,
      })
      cleanup.products.push(p1.id)
      expect(p1.slug).toBeDefined()

      // Attempting to create product with identical auto-generated slug should reject due to unique index
      await expect(
        payload.create({
          collection: 'products',
          data: {
            title: identicalTitle,
            price: 50000,
            _status: 'published',
          } as any,
          overrideAccess: true,
        }),
      ).rejects.toThrow()

      // Providing an explicit unique slug succeeds
      const p2 = await payload.create({
        collection: 'products',
        data: {
          title: identicalTitle,
          slug: `${p1.slug}-custom-variant`,
          price: 50000,
          _status: 'published',
        } as any,
        overrideAccess: true,
      })
      cleanup.products.push(p2.id)
      expect(p2.slug).not.toEqual(p1.slug)
    })
  })
})
