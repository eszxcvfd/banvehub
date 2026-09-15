import React from 'react'
import { getPayload, type Payload } from 'payload'
import config from '@/payload.config'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import type { Category, Media, Product, ProductPreview, SoftwareType, Tag } from '@/payload-types'
import { render } from '@testing-library/react'

// Mock next/headers for Next.js 15+ Server Component execution in vitest
vi.mock('next/headers', () => ({
  draftMode: () => Promise.resolve({ isEnabled: false }),
}))

// Mock components that import .scss from @payloadcms/ui in vitest
vi.mock('@/components/RichText', () => ({
  RichText: () => null,
}))
vi.mock('@/blocks/RenderBlocks', () => ({
  RenderBlocks: () => null,
}))

// Mock next/image & next/link using React.createElement for pure .ts compliance
vi.mock('next/image', () => ({
  default: ({ src, alt, className, ...props }: any) =>
    React.createElement('img', {
      src: typeof src === 'object' ? src?.src || src?.url : src,
      alt: alt || '',
      className,
      ...props,
    }),
}))
vi.mock('next/link', () => ({
  default: ({ href, children, className, ...props }: any) =>
    React.createElement('a', { href, className, ...props }, children),
}))
vi.mock('embla-carousel-react', () => ({
  default: () => [
    () => {},
    {
      scrollTo: vi.fn(),
      scrollPrev: vi.fn(),
      scrollNext: vi.fn(),
      canScrollPrev: vi.fn(() => false),
      canScrollNext: vi.fn(() => false),
      on: vi.fn(),
      off: vi.fn(),
    },
  ],
}))

import ProductPage, { generateMetadata } from '@/app/(app)/products/[slug]/page'

/**
 * Empirical Challenger Verification Suite for Milestone 3 (Product Detail Experience & Integration)
 *
 * Requirements verified:
 * 1. Technical specifications (fileFormat, softwareVersion, fileSize, unit) data resolution and integrity.
 * 2. Preview Gallery integration with watermarked previews (product_previews) and media gallery.
 * 3. Author attribution and digital pricing (VND / Free) data integrity.
 * 4. ProductPage Server Component direct execution and JSON-LD schema generation.
 * 5. generateMetadata SEO OpenGraph and crawlability configuration.
 * 6. Public guest security: Draft products and non-existent products trigger notFound() without data leakage.
 */

describe('Challenger M3: Product Detail Server Component & Data Integrity Suite', () => {
  let payload: Payload

  let catDetail: Category
  let swDetail: SoftwareType
  let tagDetail: Tag
  let testMedia: Media
  let previewDoc: ProductPreview

  let freeDetailProduct: Product
  let paidDetailProduct: Product
  let draftDetailProduct: Product

  const cleanup = {
    products: [] as (number | string)[],
    productPreviews: [] as (number | string)[],
    media: [] as (number | string)[],
    softwareTypes: [] as (number | string)[],
    categories: [] as (number | string)[],
    tags: [] as (number | string)[],
  }

  beforeAll(async () => {
    payload = await getPayload({ config: await config })
    const ts = Date.now()

    // 1. Create Media with 1x1 PNG for Preview
    const pngBuffer = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
      'base64',
    )
    testMedia = await payload.create({
      collection: 'media',
      data: {
        alt: `Challenger Preview Media ${ts}`,
      },
      file: {
        data: pngBuffer,
        mimetype: 'image/png',
        name: `test-preview-${ts}.png`,
        size: pngBuffer.length,
      },
      overrideAccess: true,
    })
    cleanup.media.push(testMedia.id)

    // 2. Create Category
    catDetail = await payload.create({
      collection: 'categories',
      data: {
        title: `Kiến Trúc Dân Dụng Detail ${ts}`,
        slug: `kien-truc-detail-${ts}`,
        description: 'Bản vẽ chi tiết kiến trúc',
      },
      overrideAccess: true,
    })
    cleanup.categories.push(catDetail.id)

    // 3. Create Software Type
    swDetail = await payload.create({
      collection: 'software_types',
      data: {
        title: `AutoCAD Architecture ${ts}`,
        slug: `autocad-arch-${ts}`,
        fileExtensions: ['.dwg', '.dxf'],
      },
      overrideAccess: true,
    })
    cleanup.softwareTypes.push(swDetail.id)

    // 4. Create Tag
    tagDetail = await payload.create({
      collection: 'tags',
      data: {
        title: `Biệt Thự 3 Tầng ${ts}`,
        slug: `biet-thu-3-tang-${ts}`,
      },
      overrideAccess: true,
    })
    cleanup.tags.push(tagDetail.id)

    // 5. Create Product Preview with Watermarking
    previewDoc = await payload.create({
      collection: 'product_previews',
      data: {
        title: `Watermarked Blueprint Sheet ${ts}`,
        previewImage: testMedia.id,
        previewType: 'image',
        isWatermarked: true,
        caption: 'Bản vẽ mặt bằng có đóng dấu bản quyền',
      },
      overrideAccess: true,
    })
    cleanup.productPreviews.push(previewDoc.id)

    // 6. Create Free Digital Product
    freeDetailProduct = await payload.create({
      collection: 'products',
      data: {
        title: `Bản vẽ thiết kế biệt thự vườn miễn phí ${ts}`,
        slug: `ban-ve-biet-thu-free-detail-${ts}`,
        price: 0,
        isFree: true,
        _status: 'published',
        categories: [catDetail.id],
        software_types: [swDetail.id],
        tags: [tagDetail.id],
        previewGallery: [previewDoc.id],
        technicalSpecs: {
          fileFormat: '.dwg',
          softwareVersion: 'AutoCAD 2024',
          fileSize: '42.5 MB',
          unit: 'metric',
        },
      },
      overrideAccess: true,
    })
    cleanup.products.push(freeDetailProduct.id)

    // 7. Create Paid Digital Product
    paidDetailProduct = await payload.create({
      collection: 'products',
      data: {
        title: `Hồ sơ bản vẽ kiến trúc thương mại cao cấp ${ts}`,
        slug: `ho-so-kien-truc-paid-detail-${ts}`,
        price: 750000,
        isFree: false,
        _status: 'published',
        categories: [catDetail.id],
        software_types: [swDetail.id],
        previewGallery: [previewDoc.id],
        technicalSpecs: {
          fileFormat: '.rvt',
          softwareVersion: 'Revit 2025',
          fileSize: '156.8 MB',
          unit: 'metric',
        },
      },
      overrideAccess: true,
    })
    cleanup.products.push(paidDetailProduct.id)

    // 8. Create Draft Product
    draftDetailProduct = await payload.create({
      collection: 'products',
      draft: true,
      data: {
        title: `Hồ sơ bản vẽ nội bộ chưa công bố ${ts}`,
        slug: `ho-so-noi-bo-draft-${ts}`,
        price: 990000,
        isFree: false,
        _status: 'draft',
      },
      overrideAccess: true,
    })
    cleanup.products.push(draftDetailProduct.id)
  })

  afterAll(async () => {
    for (const id of cleanup.products) {
      try {
        await payload.delete({ collection: 'products', id, overrideAccess: true })
      } catch {}
    }
    for (const id of cleanup.productPreviews) {
      try {
        await payload.delete({ collection: 'product_previews', id, overrideAccess: true })
      } catch {}
    }
    for (const id of cleanup.media) {
      try {
        await payload.delete({ collection: 'media', id, overrideAccess: true })
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

  describe('1. Technical Specifications Data Contract', () => {
    it('retrieves accurate technical specifications fields from Payload', async () => {
      const product = await payload.findByID({
        collection: 'products',
        id: freeDetailProduct.id,
        depth: 2,
        overrideAccess: false,
      })

      expect(product.technicalSpecs).toBeDefined()
      expect(product.technicalSpecs?.fileFormat).toBe('.dwg')
      expect(product.technicalSpecs?.softwareVersion).toBe('AutoCAD 2024')
      expect(product.technicalSpecs?.fileSize).toBe('42.5 MB')
      expect(product.technicalSpecs?.unit).toBe('metric')
    })

    it('populates taxonomy relationships with slug for filtered catalog links', async () => {
      const product = await payload.findByID({
        collection: 'products',
        id: freeDetailProduct.id,
        depth: 2,
        overrideAccess: false,
      })

      const categories = product.categories as Category[]
      expect(categories.length).toBeGreaterThan(0)
      expect(categories[0]?.slug).toBe(catDetail.slug)

      const softwareTypes = product.software_types as SoftwareType[]
      expect(softwareTypes.length).toBeGreaterThan(0)
      expect(softwareTypes[0]?.slug).toBe(swDetail.slug)
    })
  })

  describe('2. Preview Gallery & Watermarking Contract', () => {
    it('populates previewGallery with watermarked product_previews entity', async () => {
      const product = await payload.findByID({
        collection: 'products',
        id: freeDetailProduct.id,
        depth: 2,
        overrideAccess: false,
      })

      expect(product.previewGallery).toBeDefined()
      const previews = product.previewGallery as ProductPreview[]
      expect(previews.length).toBeGreaterThan(0)
      expect(previews[0]?.id).toBe(previewDoc.id)
      expect(previews[0]?.isWatermarked).toBe(true)
      expect(previews[0]?.previewType).toBe('image')
    })
  })

  describe('3. Digital Pricing & Currency Formatting Contract', () => {
    it('accurately distinguishes free asset state (price: 0, isFree: true)', async () => {
      const product = await payload.findByID({
        collection: 'products',
        id: freeDetailProduct.id,
        overrideAccess: false,
      })

      expect(product.isFree).toBe(true)
      expect(product.price).toBe(0)
    })

    it('accurately stores commercial VND integer price (price: 750000, isFree: false)', async () => {
      const product = await payload.findByID({
        collection: 'products',
        id: paidDetailProduct.id,
        overrideAccess: false,
      })

      expect(product.isFree).toBe(false)
      expect(product.price).toBe(750000)
    })
  })

  describe('4. Direct Execution of ProductPage Server Component', () => {
    it('renders published free product detail page with JSON-LD schema', async () => {
      const pageJsx = await ProductPage({
        params: Promise.resolve({ slug: freeDetailProduct.slug }),
      })

      expect(pageJsx).toBeDefined()
      const { container } = render(pageJsx)
      expect(container.innerHTML).toContain('https://schema.org/InStock')
      expect(container.innerHTML).toContain('VND')
      expect(container.innerHTML).toContain(freeDetailProduct.title)
      expect(container.innerHTML).toContain('.dwg')
      expect(container.innerHTML).toContain('AutoCAD 2024')
      expect(container.innerHTML).toContain('Miễn phí')
    })

    it('renders published paid product detail page with VND price in JSON-LD', async () => {
      const pageJsx = await ProductPage({
        params: Promise.resolve({ slug: paidDetailProduct.slug }),
      })

      expect(pageJsx).toBeDefined()
      const { container } = render(pageJsx)
      expect(container.innerHTML).toContain('750000')
      expect(container.innerHTML).toContain('VND')
      expect(container.innerHTML).toContain(paidDetailProduct.title)
      expect(container.innerHTML).toContain('.rvt')
      expect(container.innerHTML).toContain('Revit 2025')
      expect(container.innerHTML).toContain('750.000')
    })

    it('triggers notFound() when querying a non-existent product slug', async () => {
      await expect(
        ProductPage({
          params: Promise.resolve({ slug: 'non-existent-product-slug-xyz' }),
        }),
      ).rejects.toThrow()
    })

    it('triggers notFound() when a guest attempts to view a draft product', async () => {
      await expect(
        ProductPage({
          params: Promise.resolve({ slug: draftDetailProduct.slug }),
        }),
      ).rejects.toThrow()
    })
  })

  describe('5. generateMetadata Execution & SEO OpenGraph Integrity', () => {
    it('generates dynamic metadata for published product with indexable robots', async () => {
      const meta = await generateMetadata({
        params: Promise.resolve({ slug: freeDetailProduct.slug }),
      })

      expect(meta).toBeDefined()
      expect(meta.title).toBe(freeDetailProduct.title)
      expect(meta.robots).toBeDefined()
      expect((meta.robots as any)?.index).toBe(true)
      expect((meta.robots as any)?.follow).toBe(true)
    })

    it('triggers notFound() when generating metadata for draft product as guest', async () => {
      await expect(
        generateMetadata({
          params: Promise.resolve({ slug: draftDetailProduct.slug }),
        }),
      ).rejects.toThrow()
    })
  })
})
