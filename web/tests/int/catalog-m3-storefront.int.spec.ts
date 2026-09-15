import { getPayload, type Payload } from 'payload'
import config from '@/payload.config'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Category, Product, SoftwareType, Tag } from '@/payload-types'

describe('Milestone 3: Storefront Browsing, Faceted Filters & Digital Detail Integration Tests', () => {
  let payload: Payload

  let catKienTruc: Category
  let catKetCau: Category
  let swAutoCAD: SoftwareType
  let swRevit: SoftwareType
  let tagBietThu: Tag
  let freeProduct: Product
  let paidProduct: Product
  let draftProduct: Product

  const cleanup = {
    products: [] as (number | string)[],
    softwareTypes: [] as (number | string)[],
    categories: [] as (number | string)[],
    tags: [] as (number | string)[],
  }

  beforeAll(async () => {
    const payloadConfig = await config
    payload = await getPayload({ config: payloadConfig })

    const timestamp = Date.now()

    // 1. Create categories
    catKienTruc = await payload.create({
      collection: 'categories',
      data: {
        title: `M3 Kiến Trúc ${timestamp}`,
        slug: `m3-kien-truc-${timestamp}`,
      },
      overrideAccess: true,
    })
    cleanup.categories.push(catKienTruc.id)

    catKetCau = await payload.create({
      collection: 'categories',
      data: {
        title: `M3 Kết Cấu ${timestamp}`,
        slug: `m3-ket-cau-${timestamp}`,
      },
      overrideAccess: true,
    })
    cleanup.categories.push(catKetCau.id)

    // 2. Create software types
    swAutoCAD = await payload.create({
      collection: 'software_types',
      data: {
        title: `AutoCAD M3 ${timestamp}`,
        slug: `autocad-m3-${timestamp}`,
        fileExtensions: ['.dwg', '.dxf'],
      },
      overrideAccess: true,
    })
    cleanup.softwareTypes.push(swAutoCAD.id)

    swRevit = await payload.create({
      collection: 'software_types',
      data: {
        title: `Revit BIM M3 ${timestamp}`,
        slug: `revit-bim-m3-${timestamp}`,
        fileExtensions: ['.rvt', '.rfa'],
      },
      overrideAccess: true,
    })
    cleanup.softwareTypes.push(swRevit.id)

    // 3. Create tag
    tagBietThu = await payload.create({
      collection: 'tags',
      data: {
        title: `Biệt Thự Vườn M3 ${timestamp}`,
        slug: `biet-thu-vuon-m3-${timestamp}`,
      },
      overrideAccess: true,
    })
    cleanup.tags.push(tagBietThu.id)

    // 4. Create Free Published Product
    freeProduct = await payload.create({
      collection: 'products',
      data: {
        title: `Bản vẽ thiết kế biệt thự miễn phí ${timestamp}`,
        slug: `ban-ve-biet-thu-free-${timestamp}`,
        price: 0,
        isFree: true,
        _status: 'published',
        categories: [catKienTruc.id],
        software_types: [swAutoCAD.id],
        tags: [tagBietThu.id],
        technicalSpecs: {
          fileFormat: '.dwg',
          softwareVersion: 'AutoCAD 2022+',
          fileSize: '35.4 MB',
          unit: 'metric',
        },
      },
      overrideAccess: true,
    })
    cleanup.products.push(freeProduct.id)

    // 5. Create Paid Published Product
    paidProduct = await payload.create({
      collection: 'products',
      data: {
        title: `Hồ sơ mô hình BIM thương mại ${timestamp}`,
        slug: `ho-so-bim-paid-${timestamp}`,
        price: 350000,
        isFree: false,
        _status: 'published',
        categories: [catKetCau.id],
        software_types: [swRevit.id],
        technicalSpecs: {
          fileFormat: '.rvt',
          softwareVersion: 'Revit 2024',
          fileSize: '128.5 MB',
          unit: 'metric',
        },
      },
      overrideAccess: true,
    })
    cleanup.products.push(paidProduct.id)

    // 6. Create Draft Product
    draftProduct = await payload.create({
      collection: 'products',
      draft: true,
      data: {
        title: `Hồ sơ bản vẽ draft chưa duyệt ${timestamp}`,
        slug: `ho-so-draft-private-${timestamp}`,
        price: 150000,
        isFree: false,
        _status: 'draft',
      },
      overrideAccess: true,
    })
    cleanup.products.push(draftProduct.id)
  })

  afterAll(async () => {
    for (const id of cleanup.products) {
      try {
        await payload.delete({ collection: 'products', id, overrideAccess: true })
      } catch {}
    }
    for (const id of cleanup.softwareTypes) {
      try {
        await payload.delete({ collection: 'software_types', id, overrideAccess: true })
      } catch {}
    }
    for (const id of cleanup.categories) {
      try {
        await payload.delete({ collection: 'categories', id, overrideAccess: true })
      } catch {}
    }
    for (const id of cleanup.tags) {
      try {
        await payload.delete({ collection: 'tags', id, overrideAccess: true })
      } catch {}
    }
  })

  describe('Faceted Filtering & Query Assembly', () => {
    it('filters products by category relationship', async () => {
      const res = await payload.find({
        collection: 'products',
        where: {
          and: [
            { _status: { equals: 'published' } },
            { categories: { contains: catKienTruc.id } },
          ],
        },
        overrideAccess: false,
      })

      const ids = res.docs.map((d) => d.id)
      expect(ids).toContain(freeProduct.id)
      expect(ids).not.toContain(paidProduct.id)
    })

    it('filters products by software_types relationship', async () => {
      const res = await payload.find({
        collection: 'products',
        where: {
          and: [
            { _status: { equals: 'published' } },
            { software_types: { contains: swRevit.id } },
          ],
        },
        overrideAccess: false,
      })

      const ids = res.docs.map((d) => d.id)
      expect(ids).toContain(paidProduct.id)
      expect(ids).not.toContain(freeProduct.id)
    })

    it('filters products by free vs paid asset state', async () => {
      const freeRes = await payload.find({
        collection: 'products',
        where: {
          and: [
            { _status: { equals: 'published' } },
            { or: [{ isFree: { equals: true } }, { price: { equals: 0 } }] },
          ],
        },
        overrideAccess: false,
      })
      const freeIds = freeRes.docs.map((d) => d.id)
      expect(freeIds).toContain(freeProduct.id)
      expect(freeIds).not.toContain(paidProduct.id)

      const paidRes = await payload.find({
        collection: 'products',
        where: {
          and: [
            { _status: { equals: 'published' } },
            { and: [{ isFree: { equals: false } }, { price: { greater_than: 0 } }] },
          ],
        },
        overrideAccess: false,
      })
      const paidIds = paidRes.docs.map((d) => d.id)
      expect(paidIds).toContain(paidProduct.id)
      expect(paidIds).not.toContain(freeProduct.id)
    })

    it('sorts products by price ascending and descending', async () => {
      const asc = await payload.find({
        collection: 'products',
        where: {
          id: { in: [freeProduct.id, paidProduct.id] },
        },
        sort: 'price',
        overrideAccess: false,
      })
      expect(asc.docs[0]?.id).toBe(freeProduct.id)
      expect(asc.docs[1]?.id).toBe(paidProduct.id)

      const desc = await payload.find({
        collection: 'products',
        where: {
          id: { in: [freeProduct.id, paidProduct.id] },
        },
        sort: '-price',
        overrideAccess: false,
      })
      expect(desc.docs[0]?.id).toBe(paidProduct.id)
      expect(desc.docs[1]?.id).toBe(freeProduct.id)
    })
  })

  describe('PostgreSQL Keyword Search per Decision 0007', () => {
    it('matches product by title keyword', async () => {
      const res = await payload.find({
        collection: 'products',
        where: {
          and: [
            { _status: { equals: 'published' } },
            { title: { like: 'biệt thự' } },
          ],
        },
        overrideAccess: false,
      })
      const ids = res.docs.map((d) => d.id)
      expect(ids).toContain(freeProduct.id)
      expect(ids).not.toContain(paidProduct.id)
    })

    it('matches product by taxonomy tags relation', async () => {
      const res = await payload.find({
        collection: 'products',
        where: {
          and: [
            { _status: { equals: 'published' } },
            { tags: { contains: tagBietThu.id } },
          ],
        },
        overrideAccess: false,
      })
      const ids = res.docs.map((d) => d.id)
      expect(ids).toContain(freeProduct.id)
    })

    it('combines keyword search and category facet with logical AND', async () => {
      const res = await payload.find({
        collection: 'products',
        where: {
          and: [
            { _status: { equals: 'published' } },
            { title: { like: 'biệt thự' } },
            { categories: { contains: catKienTruc.id } },
          ],
        },
        overrideAccess: false,
      })
      expect(res.docs.map((d) => d.id)).toContain(freeProduct.id)

      // Mutually exclusive combination returns 0 docs
      const exclusiveRes = await payload.find({
        collection: 'products',
        where: {
          and: [
            { _status: { equals: 'published' } },
            { title: { like: 'biệt thự' } },
            { categories: { contains: catKetCau.id } },
          ],
        },
        overrideAccess: false,
      })
      expect(exclusiveRes.docs.length).toBe(0)
    })
  })

  describe('Public Read & Draft Isolation', () => {
    it('does not leak draft products to unauthenticated queries', async () => {
      const res = await payload.find({
        collection: 'products',
        where: {
          id: { equals: draftProduct.id },
        },
        overrideAccess: false,
      })
      expect(res.docs.length).toBe(0)
    })
  })

  describe('Product Detail Technical Specifications Contract', () => {
    it('fetches full technical specifications table fields', async () => {
      const product = await payload.findByID({
        collection: 'products',
        id: freeProduct.id,
        depth: 2,
        overrideAccess: false,
      })

      expect(product.technicalSpecs).toBeDefined()
      expect(product.technicalSpecs?.fileFormat).toBe('.dwg')
      expect(product.technicalSpecs?.softwareVersion).toBe('AutoCAD 2022+')
      expect(product.technicalSpecs?.fileSize).toBe('35.4 MB')
      expect(product.technicalSpecs?.unit).toBe('metric')
      expect(product.isFree).toBe(true)
      expect(product.price).toBe(0)

      // Verify populated relationships
      const categoryObj = (product.categories as Category[])?.[0]
      expect(typeof categoryObj).toBe('object')
      expect(categoryObj?.id).toBe(catKienTruc.id)

      const softwareObj = (product.software_types as SoftwareType[])?.[0]
      expect(typeof softwareObj).toBe('object')
      expect(softwareObj?.id).toBe(swAutoCAD.id)
    })
  })
})
