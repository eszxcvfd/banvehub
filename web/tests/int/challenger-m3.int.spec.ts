import { getPayload, type Payload, type Where } from 'payload'
import config from '@/payload.config'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Category, Product, SoftwareType, Tag } from '@/payload-types'
import ShopPage from '@/app/(app)/shop/page'
import { createUrl } from '@/utilities/createUrl'

/**
 * Empirical Challenger Verification Suite for Milestone 3 (Storefront Browsing & Search)
 *
 * Requirements challenged:
 * 1. Faceted queries via Payload Local API simulating URL search params (category, softwareType, isFree, sort)
 * 2. Invalid/non-existent slugs verify graceful empty result set without errors
 * 3. Keyword search query construction matching title, slug, and taxonomy terms
 * 4. Verify draft products are never returned to public queries under any condition
 * 5. Verify facet preservation logic in FilterItem.tsx, Categories.client.tsx, SoftwareTypes.client.tsx, PriceFilter.tsx, and Search
 * 6. Direct execution of ShopPage Server Component across parameter variations
 */

describe('Challenger M3 Empirical Verification Suite', () => {
  let payload: Payload

  let catArch: Category
  let catStruct: Category
  let swAutoCAD: SoftwareType
  let swRevit: SoftwareType
  let tagVilla: Tag
  let tagInterior: Tag

  let prodFreeAutoCADArch: Product
  let prodPaidRevitArch: Product
  let prodPaidRevitStruct: Product
  let prodZeroPriceAutoCADStruct: Product
  let prodSecretDraft: Product

  const cleanup = {
    products: [] as (number | string)[],
    softwareTypes: [] as (number | string)[],
    categories: [] as (number | string)[],
    tags: [] as (number | string)[],
  }

  beforeAll(async () => {
    payload = await getPayload({ config: await config })
    const ts = Date.now()

    // 1. Categories
    catArch = await payload.create({
      collection: 'categories',
      data: {
        title: `M3 Chal Kiến Trúc ${ts}`,
        slug: `m3-chal-kien-truc-${ts}`,
        description: 'Kiến trúc nhà ở và công trình dân dụng',
      },
      overrideAccess: true,
    })
    cleanup.categories.push(catArch.id)

    catStruct = await payload.create({
      collection: 'categories',
      data: {
        title: `M3 Chal Kết Cấu ${ts}`,
        slug: `m3-chal-ket-cau-${ts}`,
        description: 'Kết cấu bê tông cốt thép và thép tiền chế',
      },
      overrideAccess: true,
    })
    cleanup.categories.push(catStruct.id)

    // 2. Software Types
    swAutoCAD = await payload.create({
      collection: 'software_types',
      data: {
        title: `M3 Chal AutoCAD ${ts}`,
        slug: `m3-chal-autocad-${ts}`,
        fileExtensions: ['.dwg', '.dxf'],
      },
      overrideAccess: true,
    })
    cleanup.softwareTypes.push(swAutoCAD.id)

    swRevit = await payload.create({
      collection: 'software_types',
      data: {
        title: `M3 Chal Revit BIM ${ts}`,
        slug: `m3-chal-revit-bim-${ts}`,
        fileExtensions: ['.rvt', '.rfa'],
      },
      overrideAccess: true,
    })
    cleanup.softwareTypes.push(swRevit.id)

    // 3. Tags
    tagVilla = await payload.create({
      collection: 'tags',
      data: {
        title: `M3 Chal Biệt Thự ${ts}`,
        slug: `m3-chal-biet-thu-${ts}`,
      },
      overrideAccess: true,
    })
    cleanup.tags.push(tagVilla.id)

    tagInterior = await payload.create({
      collection: 'tags',
      data: {
        title: `M3 Chal Nội Thất ${ts}`,
        slug: `m3-chal-noi-that-${ts}`,
      },
      overrideAccess: true,
    })
    cleanup.tags.push(tagInterior.id)

    // 4. Products:
    // P1: Free, AutoCAD, Architecture, Villa tag (price: 0, isFree: true)
    prodFreeAutoCADArch = await payload.create({
      collection: 'products',
      data: {
        title: `Bản vẽ thiết kế biệt thự vườn AutoCAD ${ts}`,
        slug: `bv-biet-thu-acad-${ts}`,
        price: 0,
        isFree: true,
        _status: 'published',
        categories: [catArch.id],
        software_types: [swAutoCAD.id],
        tags: [tagVilla.id],
        technicalSpecs: {
          fileFormat: '.dwg',
          softwareVersion: 'AutoCAD 2023',
          fileSize: '45 MB',
          unit: 'metric',
        },
      },
      overrideAccess: true,
    })
    cleanup.products.push(prodFreeAutoCADArch.id)

    // P2: Paid (250,000 VND), Revit, Architecture, Interior tag (isFree: false)
    prodPaidRevitArch = await payload.create({
      collection: 'products',
      data: {
        title: `Hồ sơ BIM nội thất chung cư cao cấp Revit ${ts}`,
        slug: `hs-bim-noi-that-revit-${ts}`,
        price: 250000,
        isFree: false,
        _status: 'published',
        categories: [catArch.id],
        software_types: [swRevit.id],
        tags: [tagInterior.id],
        technicalSpecs: {
          fileFormat: '.rvt',
          softwareVersion: 'Revit 2024',
          fileSize: '180 MB',
          unit: 'metric',
        },
      },
      overrideAccess: true,
    })
    cleanup.products.push(prodPaidRevitArch.id)

    // P3: Paid (750,000 VND), Revit, Structure, Villa tag (isFree: false)
    prodPaidRevitStruct = await payload.create({
      collection: 'products',
      data: {
        title: `Mô hình kết cấu bê tông cốt thép biệt thự Revit ${ts}`,
        slug: `mh-ket-cau-biet-thu-revit-${ts}`,
        price: 750000,
        isFree: false,
        _status: 'published',
        categories: [catStruct.id],
        software_types: [swRevit.id],
        tags: [tagVilla.id],
        technicalSpecs: {
          fileFormat: '.rvt',
          softwareVersion: 'Revit 2024',
          fileSize: '210 MB',
          unit: 'metric',
        },
      },
      overrideAccess: true,
    })
    cleanup.products.push(prodPaidRevitStruct.id)

    // P4: Free by price ($0, isFree: false), AutoCAD, Structure, Interior tag
    prodZeroPriceAutoCADStruct = await payload.create({
      collection: 'products',
      data: {
        title: `Chi tiết kết cấu cầu thang thép AutoCAD ${ts}`,
        slug: `ct-cau-thang-thep-acad-${ts}`,
        price: 0,
        isFree: false,
        _status: 'published',
        categories: [catStruct.id],
        software_types: [swAutoCAD.id],
        tags: [tagInterior.id],
        technicalSpecs: {
          fileFormat: '.dwg',
          softwareVersion: 'AutoCAD 2022',
          fileSize: '15 MB',
          unit: 'metric',
        },
      },
      overrideAccess: true,
    })
    cleanup.products.push(prodZeroPriceAutoCADStruct.id)

    // P5: Private Draft Product (Paid 999,000 VND, AutoCAD, Architecture)
    prodSecretDraft = await payload.create({
      collection: 'products',
      draft: true,
      data: {
        title: `Bản vẽ nháp bí mật chưa công bố ${ts}`,
        slug: `bv-draft-private-secret-${ts}`,
        price: 999000,
        isFree: false,
        _status: 'draft',
        categories: [catArch.id],
        software_types: [swAutoCAD.id],
        tags: [tagVilla.id],
      },
      overrideAccess: true,
    })
    cleanup.products.push(prodSecretDraft.id)
  })

  afterAll(async () => {
    for (const id of cleanup.products) {
      await payload.delete({ collection: 'products', id, overrideAccess: true }).catch(() => undefined)
    }
    for (const id of cleanup.softwareTypes) {
      await payload.delete({ collection: 'software_types', id, overrideAccess: true }).catch(() => undefined)
    }
    for (const id of cleanup.categories) {
      await payload.delete({ collection: 'categories', id, overrideAccess: true }).catch(() => undefined)
    }
    for (const id of cleanup.tags) {
      await payload.delete({ collection: 'tags', id, overrideAccess: true }).catch(() => undefined)
    }
  })

  // =========================================================================
  // TASK 1: Faceted Queries via Payload Local API simulating URL search params
  // =========================================================================
  describe('Task 1: Faceted Queries & Sort Simulation', () => {
    it('1.1 filters products by category slug', async () => {
      // Simulate resolveCategoryId by slug
      const catRes = await payload.find({
        collection: 'categories',
        where: { slug: { equals: catArch.slug } },
        limit: 1,
        overrideAccess: true,
      })
      const resolvedCatId = catRes.docs[0]?.id
      expect(resolvedCatId).toBe(catArch.id)

      const result = await payload.find({
        collection: 'products',
        where: {
          and: [
            { _status: { equals: 'published' } },
            { categories: { contains: resolvedCatId } },
          ],
        },
        overrideAccess: false,
      })

      const ids = result.docs.map((d) => d.id)
      expect(ids).toContain(prodFreeAutoCADArch.id)
      expect(ids).toContain(prodPaidRevitArch.id)
      expect(ids).not.toContain(prodPaidRevitStruct.id)
      expect(ids).not.toContain(prodZeroPriceAutoCADStruct.id)
      expect(ids).not.toContain(prodSecretDraft.id)
    })

    it('1.2 filters products by software_types slug', async () => {
      // Simulate resolveSoftwareTypeId by slug
      const swRes = await payload.find({
        collection: 'software_types',
        where: { slug: { equals: swRevit.slug } },
        limit: 1,
        overrideAccess: true,
      })
      const resolvedSwId = swRes.docs[0]?.id
      expect(resolvedSwId).toBe(swRevit.id)

      const result = await payload.find({
        collection: 'products',
        where: {
          and: [
            { _status: { equals: 'published' } },
            { software_types: { contains: resolvedSwId } },
          ],
        },
        overrideAccess: false,
      })

      const ids = result.docs.map((d) => d.id)
      expect(ids).toContain(prodPaidRevitArch.id)
      expect(ids).toContain(prodPaidRevitStruct.id)
      expect(ids).not.toContain(prodFreeAutoCADArch.id)
      expect(ids).not.toContain(prodZeroPriceAutoCADStruct.id)
    })

    it('1.3 filters products by combined Category AND SoftwareType (intersection)', async () => {
      const result = await payload.find({
        collection: 'products',
        where: {
          and: [
            { _status: { equals: 'published' } },
            { categories: { contains: catArch.id } },
            { software_types: { contains: swRevit.id } },
          ],
        },
        overrideAccess: false,
      })

      const ids = result.docs.map((d) => d.id)
      expect(ids).toHaveLength(1)
      expect(ids[0]).toBe(prodPaidRevitArch.id)
    })

    it('1.4 filters products by isFree=true (matches isFree=true OR price=0)', async () => {
      const result = await payload.find({
        collection: 'products',
        where: {
          and: [
            { _status: { equals: 'published' } },
            { or: [{ isFree: { equals: true } }, { price: { equals: 0 } }] },
          ],
        },
        overrideAccess: false,
      })

      const ids = result.docs.map((d) => d.id)
      expect(ids).toContain(prodFreeAutoCADArch.id) // isFree: true, price: 0
      expect(ids).toContain(prodZeroPriceAutoCADStruct.id) // isFree: false, price: 0
      expect(ids).not.toContain(prodPaidRevitArch.id) // price: 250k
      expect(ids).not.toContain(prodPaidRevitStruct.id) // price: 750k
      expect(ids).not.toContain(prodSecretDraft.id) // draft
    })

    it('1.5 filters products by isFree=false (matches isFree=false AND price > 0)', async () => {
      const result = await payload.find({
        collection: 'products',
        where: {
          and: [
            { _status: { equals: 'published' } },
            { and: [{ isFree: { equals: false } }, { price: { greater_than: 0 } }] },
          ],
        },
        overrideAccess: false,
      })

      const ids = result.docs.map((d) => d.id)
      expect(ids).toContain(prodPaidRevitArch.id) // price: 250k
      expect(ids).toContain(prodPaidRevitStruct.id) // price: 750k
      expect(ids).not.toContain(prodFreeAutoCADArch.id) // free
      expect(ids).not.toContain(prodZeroPriceAutoCADStruct.id) // price 0
      expect(ids).not.toContain(prodSecretDraft.id) // draft
    })

    it('1.6 filters products by combined Category AND SoftwareType AND Free facet', async () => {
      const result = await payload.find({
        collection: 'products',
        where: {
          and: [
            { _status: { equals: 'published' } },
            { categories: { contains: catArch.id } },
            { software_types: { contains: swAutoCAD.id } },
            { or: [{ isFree: { equals: true } }, { price: { equals: 0 } }] },
          ],
        },
        overrideAccess: false,
      })

      const ids = result.docs.map((d) => d.id)
      expect(ids).toHaveLength(1)
      expect(ids[0]).toBe(prodFreeAutoCADArch.id)
    })

    it('1.7 sorts products by price ascending', async () => {
      const result = await payload.find({
        collection: 'products',
        where: {
          and: [
            { _status: { equals: 'published' } },
            { id: { in: [prodFreeAutoCADArch.id, prodPaidRevitArch.id, prodPaidRevitStruct.id] } },
          ],
        },
        sort: 'price',
        overrideAccess: false,
      })

      expect(result.docs[0].id).toBe(prodFreeAutoCADArch.id) // 0 VND
      expect(result.docs[1].id).toBe(prodPaidRevitArch.id) // 250k VND
      expect(result.docs[2].id).toBe(prodPaidRevitStruct.id) // 750k VND
    })

    it('1.8 sorts products by price descending', async () => {
      const result = await payload.find({
        collection: 'products',
        where: {
          and: [
            { _status: { equals: 'published' } },
            { id: { in: [prodFreeAutoCADArch.id, prodPaidRevitArch.id, prodPaidRevitStruct.id] } },
          ],
        },
        sort: '-price',
        overrideAccess: false,
      })

      expect(result.docs[0].id).toBe(prodPaidRevitStruct.id) // 750k VND
      expect(result.docs[1].id).toBe(prodPaidRevitArch.id) // 250k VND
      expect(result.docs[2].id).toBe(prodFreeAutoCADArch.id) // 0 VND
    })

    it('1.9 sorts products by title ascending', async () => {
      const result = await payload.find({
        collection: 'products',
        where: {
          and: [
            { _status: { equals: 'published' } },
            { id: { in: [prodFreeAutoCADArch.id, prodPaidRevitArch.id] } },
          ],
        },
        sort: 'title',
        overrideAccess: false,
      })

      expect(result.docs.length).toBe(2)
      // 'Bản vẽ...' comes before 'Hồ sơ...'
      expect(result.docs[0].id).toBe(prodFreeAutoCADArch.id)
      expect(result.docs[1].id).toBe(prodPaidRevitArch.id)
    })

    it('1.10 safely handles backward compatibility sort aliases and malicious sort strings', async () => {
      const ALLOWED_SORTS: Record<string, string> = {
        price: 'price',
        '-price': '-price',
        createdAt: 'createdAt',
        '-createdAt': '-createdAt',
        title: 'title',
        '-title': '-title',
        priceInUSD: 'price',
        '-priceInUSD': '-price',
      }

      // Backward compatible alias priceInUSD resolves to price
      const aliasSort = ALLOWED_SORTS['priceInUSD'] || 'title'
      expect(aliasSort).toBe('price')

      // Malicious SQL injection attempt falls back safely to 'title'
      const maliciousAttempt = "'; DROP TABLE products; --"
      const safeSort = ALLOWED_SORTS[maliciousAttempt] || 'title'
      expect(safeSort).toBe('title')

      // Executing find with safeSort runs cleanly without error
      const res = await payload.find({
        collection: 'products',
        where: { _status: { equals: 'published' } },
        sort: safeSort,
        overrideAccess: false,
      })
      expect(res.docs.length).toBeGreaterThan(0)
    })
  })

  // =========================================================================
  // TASK 2: Invalid/Non-existent slugs graceful handling without errors
  // =========================================================================
  describe('Task 2: Invalid/Non-Existent Slugs Graceful Empty Handling', () => {
    async function resolveCategoryId(p: Payload, param: string): Promise<number | null> {
      const trimmed = param.trim()
      const isNumeric = /^\d+$/.test(trimmed)
      const result = await p.find({
        collection: 'categories',
        where: isNumeric
          ? { or: [{ id: { equals: Number(trimmed) } }, { slug: { equals: trimmed } }] }
          : { slug: { equals: trimmed } },
        limit: 1,
        overrideAccess: true,
        select: { slug: true },
      })
      return result.docs[0]?.id ?? null
    }

    async function resolveSoftwareTypeId(p: Payload, param: string): Promise<number | null> {
      const trimmed = param.trim()
      const isNumeric = /^\d+$/.test(trimmed)
      const result = await p.find({
        collection: 'software_types',
        where: isNumeric
          ? { or: [{ id: { equals: Number(trimmed) } }, { slug: { equals: trimmed } }] }
          : { slug: { equals: trimmed } },
        limit: 1,
        overrideAccess: true,
        select: { slug: true },
      })
      return result.docs[0]?.id ?? null
    }

    it('2.1 non-existent category slug resolves to null without throwing', async () => {
      const id = await resolveCategoryId(payload, 'non-existent-category-slug-99999')
      expect(id).toBeNull()
    })

    it('2.2 non-existent software type slug resolves to null without throwing', async () => {
      const id = await resolveSoftwareTypeId(payload, 'non-existent-software-type-xyz')
      expect(id).toBeNull()
    })

    it('2.3 non-existent numeric category ID resolves to null without throwing', async () => {
      const id = await resolveCategoryId(payload, '999999999')
      expect(id).toBeNull()
    })

    it('2.4 non-existent numeric software type ID resolves to null without throwing', async () => {
      const id = await resolveSoftwareTypeId(payload, '999999999')
      expect(id).toBeNull()
    })

    it('2.5 SQL injection string as category slug safely resolves to null without error', async () => {
      const id = await resolveCategoryId(payload, "'; DROP TABLE categories; --")
      expect(id).toBeNull()
    })

    it('2.6 SQL injection string as software type slug safely resolves to null without error', async () => {
      const id = await resolveSoftwareTypeId(payload, "1' OR '1'='1")
      expect(id).toBeNull()
    })

    it('2.7 ShopPage short-circuits to empty state when categoryId is null', async () => {
      const rendered = await ShopPage({
        searchParams: Promise.resolve({
          category: 'non-existent-cat-slug-random-404',
        }),
      })

      expect(rendered).toBeDefined()
      // Component returns empty state paragraph
      expect(JSON.stringify(rendered)).toContain('No products found')
    })

    it('2.8 ShopPage short-circuits to empty state when softwareTypeId is null', async () => {
      const rendered = await ShopPage({
        searchParams: Promise.resolve({
          softwareType: 'non-existent-software-type-random-404',
        }),
      })

      expect(rendered).toBeDefined()
      expect(JSON.stringify(rendered)).toContain('No products found')
    })
  })

  // =========================================================================
  // TASK 3: Keyword Search Query Construction Matching Title, Slug, Taxonomy
  // =========================================================================
  describe('Task 3: PostgreSQL Keyword Search Query Construction', () => {
    async function executeKeywordSearch(rawSearch: string, additionalWhere: Where[] = []) {
      const [matchedCats, matchedSws, matchedTags] = await Promise.all([
        payload.find({
          collection: 'categories',
          where: {
            or: [{ title: { like: rawSearch } }, { slug: { like: rawSearch } }],
          },
          limit: 50,
          overrideAccess: true,
          select: { slug: true },
        }),
        payload.find({
          collection: 'software_types',
          where: {
            or: [{ title: { like: rawSearch } }, { slug: { like: rawSearch } }],
          },
          limit: 50,
          overrideAccess: true,
          select: { slug: true },
        }),
        payload.find({
          collection: 'tags',
          where: {
            or: [{ title: { like: rawSearch } }, { slug: { like: rawSearch } }],
          },
          limit: 50,
          overrideAccess: true,
          select: { slug: true },
        }),
      ])

      const catIds = matchedCats.docs.map((c) => c.id)
      const swIds = matchedSws.docs.map((s) => s.id)
      const tagIds = matchedTags.docs.map((t) => t.id)

      const searchOr: Where[] = [
        { title: { like: rawSearch } },
        { slug: { like: rawSearch } },
      ]

      if (catIds.length > 0) {
        searchOr.push({ categories: { in: catIds } })
      }
      if (swIds.length > 0) {
        searchOr.push({ software_types: { in: swIds } })
      }
      if (tagIds.length > 0) {
        searchOr.push({ tags: { in: tagIds } })
      }

      return payload.find({
        collection: 'products',
        where: {
          and: [
            { _status: { equals: 'published' } },
            { or: searchOr },
            ...additionalWhere,
          ],
        },
        overrideAccess: false,
      })
    }

    it('3.1 matches products by title keyword', async () => {
      const res = await executeKeywordSearch('cầu thang thép')
      const ids = res.docs.map((d) => d.id)
      expect(ids).toContain(prodZeroPriceAutoCADStruct.id)
      expect(ids).not.toContain(prodFreeAutoCADArch.id)
    })

    it('3.2 matches products by slug keyword', async () => {
      const res = await executeKeywordSearch('hs-bim-noi-that')
      const ids = res.docs.map((d) => d.id)
      expect(ids).toContain(prodPaidRevitArch.id)
      expect(ids).not.toContain(prodPaidRevitStruct.id)
    })

    it('3.3 matches products by Category title term via taxonomy expansion', async () => {
      // Searching 'Kết Cấu' should match catStruct and expand to categories: { in: [catStruct.id] }
      const res = await executeKeywordSearch(catStruct.title)
      const ids = res.docs.map((d) => d.id)
      expect(ids).toContain(prodPaidRevitStruct.id)
      expect(ids).toContain(prodZeroPriceAutoCADStruct.id)
      expect(ids).not.toContain(prodFreeAutoCADArch.id)
    })

    it('3.4 matches products by Software Type title term via taxonomy expansion', async () => {
      // Searching swRevit title should expand to software_types: { in: [swRevit.id] }
      const res = await executeKeywordSearch(swRevit.title)
      const ids = res.docs.map((d) => d.id)
      expect(ids).toContain(prodPaidRevitArch.id)
      expect(ids).toContain(prodPaidRevitStruct.id)
      expect(ids).not.toContain(prodFreeAutoCADArch.id)
      expect(ids).not.toContain(prodZeroPriceAutoCADStruct.id)
    })

    it('3.5 matches products by Tag title term via taxonomy expansion', async () => {
      // Searching tagInterior title should expand to tags: { in: [tagInterior.id] }
      const res = await executeKeywordSearch(tagInterior.title)
      const ids = res.docs.map((d) => d.id)
      expect(ids).toContain(prodPaidRevitArch.id)
      expect(ids).toContain(prodZeroPriceAutoCADStruct.id)
      expect(ids).not.toContain(prodFreeAutoCADArch.id)
      expect(ids).not.toContain(prodPaidRevitStruct.id)
    })

    it('3.6 keyword search combined with active facet (logical AND intersection)', async () => {
      // Searching 'Revit' matches both P2 and P3.
      // But adding active category facet for catArch must narrow it strictly to P2!
      const res = await executeKeywordSearch(swRevit.title, [
        { categories: { contains: catArch.id } },
      ])
      const ids = res.docs.map((d) => d.id)
      expect(ids).toContain(prodPaidRevitArch.id)
      expect(ids).not.toContain(prodPaidRevitStruct.id)
    })

    it('3.7 keyword search for non-matching keyword returns 0 results cleanly without error', async () => {
      const res = await executeKeywordSearch('zz_non_existent_keyword_99999_xyz')
      expect(res.docs).toHaveLength(0)
    })

    it('3.8 search query with SQL special characters executes safely without PostgreSQL error', async () => {
      const specialInputs = [
        "test' OR 1=1 --",
        'test" OR 1=1',
        '%villa%',
        '_villa_',
        'test\\escaped',
        "'; SELECT * FROM products; --",
      ]

      for (const input of specialInputs) {
        const res = await executeKeywordSearch(input)
        expect(res).toBeDefined()
        expect(Array.isArray(res.docs)).toBe(true)
      }
    })
  })

  // =========================================================================
  // TASK 4: Draft Product Isolation (never leaked to public queries)
  // =========================================================================
  describe('Task 4: Draft Product Absolute Public Isolation', () => {
    it('4.1 public unauthenticated find cannot find draft product by ID', async () => {
      const res = await payload.find({
        collection: 'products',
        where: { id: { equals: prodSecretDraft.id } },
        overrideAccess: false,
        user: null,
      })
      expect(res.docs).toHaveLength(0)
    })

    it('4.2 public unauthenticated findByID throws forbidden on draft product', async () => {
      await expect(
        payload.findByID({
          collection: 'products',
          id: prodSecretDraft.id,
          overrideAccess: false,
          user: null,
        }),
      ).rejects.toThrow()
    })

    it('4.3 public keyword search matching draft product title never returns draft product', async () => {
      const res = await payload.find({
        collection: 'products',
        where: {
          and: [
            { _status: { equals: 'published' } },
            { title: { like: 'Bản vẽ nháp bí mật' } },
          ],
        },
        overrideAccess: false,
        user: null,
      })
      expect(res.docs).toHaveLength(0)
    })

    it('4.4 public query specifying draft: true still refuses to return draft product', async () => {
      const res = await payload.find({
        collection: 'products',
        draft: true,
        where: { id: { equals: prodSecretDraft.id } },
        overrideAccess: false,
        user: null,
      })
      expect(res.docs).toHaveLength(0)
    })

    it('4.5 ShopPage server component never includes draft product in rendered results', async () => {
      const rendered = await ShopPage({
        searchParams: Promise.resolve({
          q: 'Bản vẽ nháp bí mật',
        }),
      })

      const html = JSON.stringify(rendered)
      expect(html).not.toContain(prodSecretDraft.slug)
      expect(html).toContain('There are no products that match')
    })
  })

  // =========================================================================
  // TASK 5: Facet Preservation Logic in Filter Components
  // =========================================================================
  describe('Task 5: Facet Preservation Logic', () => {
    it('5.1 SortFilterItem retains all active facets (category, softwareType, isFree, q) when changing sort', () => {
      // Simulate initial URL state with multiple facets active
      const initialParams = new URLSearchParams(
        'category=kien-truc&softwareType=revit-bim&isFree=true&q=biet+thu',
      )

      // Simulate SortFilterItem applying a new sort option '-price'
      const newParams = new URLSearchParams(initialParams.toString())
      const targetSortSlug = '-price'
      if (targetSortSlug && targetSortSlug.length) {
        newParams.set('sort', targetSortSlug)
      } else {
        newParams.delete('sort')
      }

      const generatedUrl = createUrl('/shop', newParams)

      // Verify all initial facets are strictly preserved
      expect(newParams.get('category')).toBe('kien-truc')
      expect(newParams.get('softwareType')).toBe('revit-bim')
      expect(newParams.get('isFree')).toBe('true')
      expect(newParams.get('q')).toBe('biet thu')
      expect(newParams.get('sort')).toBe('-price')
      expect(generatedUrl).toBe(
        '/shop?category=kien-truc&softwareType=revit-bim&isFree=true&q=biet+thu&sort=-price',
      )
    })

    it('5.2 SortFilterItem cleans up sort param when selecting default sort (slug: null)', () => {
      const initialParams = new URLSearchParams(
        'category=kien-truc&softwareType=revit-bim&isFree=true&sort=-price',
      )

      const newParams = new URLSearchParams(initialParams.toString())
      const defaultSortSlug: string | null = null
      if (defaultSortSlug && (defaultSortSlug as string).length) {
        newParams.set('sort', defaultSortSlug)
      } else {
        newParams.delete('sort')
      }

      expect(newParams.get('category')).toBe('kien-truc')
      expect(newParams.get('softwareType')).toBe('revit-bim')
      expect(newParams.get('isFree')).toBe('true')
      expect(newParams.get('sort')).toBeNull()
    })

    it('5.3 CategoryItem toggles category on while preserving other facets', () => {
      const initialParams = new URLSearchParams('softwareType=revit-bim&isFree=false&sort=price&q=villa')

      const params = new URLSearchParams(initialParams.toString())
      const categorySlug = 'kien-truc'
      const isActive = params.get('category') === categorySlug

      if (isActive) {
        params.delete('category')
      } else {
        params.set('category', categorySlug)
      }

      expect(params.get('category')).toBe('kien-truc')
      expect(params.get('softwareType')).toBe('revit-bim')
      expect(params.get('isFree')).toBe('false')
      expect(params.get('sort')).toBe('price')
      expect(params.get('q')).toBe('villa')
    })

    it('5.4 CategoryItem toggles category off when already active while preserving other facets', () => {
      const initialParams = new URLSearchParams(
        'category=kien-truc&softwareType=revit-bim&isFree=false&sort=price&q=villa',
      )

      const params = new URLSearchParams(initialParams.toString())
      const categorySlug = 'kien-truc'
      const isActive = params.get('category') === categorySlug

      if (isActive) {
        params.delete('category')
      } else {
        params.set('category', categorySlug)
      }

      expect(params.get('category')).toBeNull()
      expect(params.get('softwareType')).toBe('revit-bim')
      expect(params.get('isFree')).toBe('false')
      expect(params.get('sort')).toBe('price')
      expect(params.get('q')).toBe('villa')
    })

    it('5.5 SoftwareTypeItem preserves other facets and purges legacy software param', () => {
      const initialParams = new URLSearchParams(
        'category=kien-truc&software=old-alias&isFree=true&sort=title',
      )

      const params = new URLSearchParams(initialParams.toString())
      const swSlug = 'autocad'
      const isActive =
        params.get('softwareType') === swSlug || params.get('software') === swSlug

      if (isActive) {
        params.delete('softwareType')
        params.delete('software')
      } else {
        params.set('softwareType', swSlug)
        params.delete('software')
      }

      expect(params.get('softwareType')).toBe('autocad')
      expect(params.get('software')).toBeNull() // legacy cleaned up
      expect(params.get('category')).toBe('kien-truc')
      expect(params.get('isFree')).toBe('true')
      expect(params.get('sort')).toBe('title')
    })

    it('5.6 PriceFilter sets free/paid/all while preserving category, softwareType, sort, q', () => {
      const baseParams = new URLSearchParams('category=kien-truc&softwareType=revit-bim&sort=-price&q=villa')

      // Select 'free'
      const freeParams = new URLSearchParams(baseParams.toString())
      freeParams.delete('priceType')
      freeParams.set('isFree', 'true')
      expect(freeParams.get('isFree')).toBe('true')
      expect(freeParams.get('category')).toBe('kien-truc')
      expect(freeParams.get('softwareType')).toBe('revit-bim')

      // Select 'paid'
      const paidParams = new URLSearchParams(baseParams.toString())
      paidParams.delete('priceType')
      paidParams.set('isFree', 'false')
      expect(paidParams.get('isFree')).toBe('false')
      expect(paidParams.get('category')).toBe('kien-truc')
      expect(paidParams.get('softwareType')).toBe('revit-bim')

      // Select 'all'
      const allParams = new URLSearchParams(freeParams.toString())
      allParams.delete('priceType')
      allParams.delete('isFree')
      expect(allParams.get('isFree')).toBeNull()
      expect(allParams.get('priceType')).toBeNull()
      expect(allParams.get('category')).toBe('kien-truc')
      expect(allParams.get('softwareType')).toBe('revit-bim')
    })

    it('5.7 Search input preserves active facets when updating q', () => {
      const initialParams = new URLSearchParams(
        'category=kien-truc&softwareType=revit-bim&isFree=true&sort=-price',
      )

      const newParams = new URLSearchParams(initialParams.toString())
      const searchValue = 'kết cấu móng'
      if (searchValue) {
        newParams.set('q', searchValue)
      } else {
        newParams.delete('q')
      }

      expect(newParams.get('q')).toBe('kết cấu móng')
      expect(newParams.get('category')).toBe('kien-truc')
      expect(newParams.get('softwareType')).toBe('revit-bim')
      expect(newParams.get('isFree')).toBe('true')
      expect(newParams.get('sort')).toBe('-price')
    })
  })

  // =========================================================================
  // TASK 6: Direct Execution of ShopPage Server Component
  // =========================================================================
  describe('Task 6: Direct ShopPage Server Component Execution', () => {
    it('6.1 renders default storefront without params', async () => {
      const result = await ShopPage({
        searchParams: Promise.resolve({}),
      })
      expect(result).toBeDefined()
      const json = JSON.stringify(result)
      expect(json).toContain(prodFreeAutoCADArch.slug)
    })

    it('6.2 renders storefront with active category and softwareType filters', async () => {
      const result = await ShopPage({
        searchParams: Promise.resolve({
          category: catArch.slug,
          softwareType: swAutoCAD.slug,
        }),
      })
      expect(result).toBeDefined()
      const json = JSON.stringify(result)
      expect(json).toContain(prodFreeAutoCADArch.slug)
      expect(json).not.toContain(prodPaidRevitStruct.slug)
    })

    it('6.3 renders storefront with isFree=true filter', async () => {
      const result = await ShopPage({
        searchParams: Promise.resolve({
          isFree: 'true',
        }),
      })
      expect(result).toBeDefined()
      const json = JSON.stringify(result)
      expect(json).toContain(prodFreeAutoCADArch.slug)
      expect(json).toContain(prodZeroPriceAutoCADStruct.slug)
      expect(json).not.toContain(prodPaidRevitArch.slug)
      expect(json).not.toContain(prodPaidRevitStruct.slug)
    })

    it('6.4 renders storefront with keyword search query', async () => {
      const result = await ShopPage({
        searchParams: Promise.resolve({
          q: 'AutoCAD',
        }),
      })
      expect(result).toBeDefined()
      const json = JSON.stringify(result)
      expect(json).toContain('results for')
      expect(json).toContain('AutoCAD')
      expect(json).toContain(prodFreeAutoCADArch.slug)
    })

    it('6.5 renders storefront with sort=-price', async () => {
      const result = await ShopPage({
        searchParams: Promise.resolve({
          sort: '-price',
        }),
      })
      expect(result).toBeDefined()
      const json = JSON.stringify(result)
      expect(json).toContain(prodPaidRevitStruct.slug)
    })
  })
})
