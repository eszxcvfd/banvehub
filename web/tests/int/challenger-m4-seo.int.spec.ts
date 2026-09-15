import React from 'react'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { getPayload, type Payload } from 'payload'
import config from '@/payload.config'
import type { Category, Media, Product, ProductPreview, SoftwareType } from '@/payload-types'
import { generateMetadata as generateProductMetadata } from '@/app/(app)/products/[slug]/page'
import { generateMetadata as generateShopMetadata } from '@/app/(app)/shop/page'

// Mock next/headers for Server Component execution in vitest
vi.mock('next/headers', () => ({
  draftMode: () => Promise.resolve({ isEnabled: false }),
}))

// Mock UI components that may import .scss or client-only features
vi.mock('@/components/RichText', () => ({
  RichText: () => null,
}))
vi.mock('@/blocks/RenderBlocks', () => ({
  RenderBlocks: () => null,
}))
vi.mock('next/image', () => ({
  default: ({
    src,
    alt,
    className,
    ...props
  }: {
    alt?: string
    className?: string
    src: string | { src?: string; url?: string }
    [key: string]: unknown
  }) =>
    React.createElement('img', {
      src: typeof src === 'object' ? src?.src || src?.url : src,
      alt: alt || '',
      className,
      ...props,
    }),
}))
vi.mock('next/link', () => ({
  default: ({
    href,
    children,
    className,
    ...props
  }: {
    children?: React.ReactNode
    className?: string
    href: string
    [key: string]: unknown
  }) => React.createElement('a', { href, className, ...props }, children),
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

/**
 * Empirical Challenger Verification Suite for Milestone 4 (SEO, OpenGraph & Metadata Stress Testing)
 *
 * Requirements Challenged:
 * 1. 3-tier image cascade in generateMetadata for products:
 *    - Tier 1: meta.image takes absolute precedence over previewGallery and gallery
 *    - Tier 2: previewGallery[0].previewImage takes precedence over gallery when meta.image is absent
 *    - Tier 3: gallery[0].image is used when meta.image and previewGallery are absent
 *    - Tier 4: Graceful undefined og:images when no images exist across all 3 tiers
 * 2. Product Detail Metadata & OpenGraph article contract:
 *    - Canonical URL: /products/[slug]
 *    - OpenGraph type: 'article'
 *    - Locale: 'vi_VN', siteName: 'KienTaoHub'
 *    - Published & modified time alignment with doc createdAt / updatedAt
 *    - robots: index: true, follow: true for published products
 * 3. Strict 404 boundary (notFound() throw) for unauthenticated / public access:
 *    - Draft product throws notFound()
 *    - Non-existent product slug throws notFound()
 *    - Path traversal and SQL-injection-like slugs throw notFound() without crashing
 * 4. Dynamic Storefront Metadata on /shop:
 *    - Default catalog metadata when no query params present
 *    - Category facet (?category=<slug> and ?category=<id>) dynamic title and description
 *    - Software facet (?software=<slug> and ?softwareType=<slug>) dynamic title
 *    - Category + Software combination title
 *    - Free vs. Paid facets (?isFree=true, ?isFree=false, ?priceType=free, ?priceType=paid)
 *    - Search facet (?q=<keyword>)
 *    - Multi-facet complex combination (?category=&software=&isFree=true&q=)
 *    - Non-existent facet slug graceful fallback (no crash)
 *    - Special character search facet encoding in canonical URL
 */
describe('Challenger M4: SEO, OpenGraph & Metadata Stress Suite', () => {
  let payload: Payload

  let mediaTier1: Media
  let mediaTier2: Media
  let mediaTier3: Media
  let previewDoc: ProductPreview

  let testCategory: Category
  let testSoftwareType: SoftwareType

  let prodAllTiers: Product
  let prodTier2And3: Product
  let prodTier3Only: Product
  let prodNoImages: Product
  let prodDraft: Product

  const cleanup = {
    products: [] as (number | string)[],
    productPreviews: [] as (number | string)[],
    media: [] as (number | string)[],
    softwareTypes: [] as (number | string)[],
    categories: [] as (number | string)[],
  }

  beforeAll(async () => {
    payload = await getPayload({ config: await config })
    const ts = Date.now()

    // 1. Create Media fixtures for 3-tier cascade testing
    const pngBuffer = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
      'base64',
    )

    mediaTier1 = await payload.create({
      collection: 'media',
      data: { alt: `Challenger M4 Tier 1 Meta Media ${ts}` },
      file: {
        data: pngBuffer,
        mimetype: 'image/png',
        name: `chal-tier1-${ts}.png`,
        size: pngBuffer.length,
      },
      overrideAccess: true,
    })
    cleanup.media.push(mediaTier1.id)

    mediaTier2 = await payload.create({
      collection: 'media',
      data: { alt: `Challenger M4 Tier 2 Preview Media ${ts}` },
      file: {
        data: pngBuffer,
        mimetype: 'image/png',
        name: `chal-tier2-${ts}.png`,
        size: pngBuffer.length,
      },
      overrideAccess: true,
    })
    cleanup.media.push(mediaTier2.id)

    mediaTier3 = await payload.create({
      collection: 'media',
      data: { alt: `Challenger M4 Tier 3 Gallery Media ${ts}` },
      file: {
        data: pngBuffer,
        mimetype: 'image/png',
        name: `chal-tier3-${ts}.png`,
        size: pngBuffer.length,
      },
      overrideAccess: true,
    })
    cleanup.media.push(mediaTier3.id)

    // 2. Create Product Preview with Tier 2 media
    previewDoc = await payload.create({
      collection: 'product_previews',
      data: {
        title: `Challenger Preview Doc ${ts}`,
        previewImage: mediaTier2.id,
        previewType: 'image',
        isWatermarked: true,
      },
      overrideAccess: true,
    })
    cleanup.productPreviews.push(previewDoc.id)

    // 3. Create Category fixture
    testCategory = await payload.create({
      collection: 'categories',
      data: {
        title: `Challenger M4 Kết Cấu Công Trình ${ts}`,
        slug: `chal-m4-ket-cau-${ts}`,
        status: 'active',
        description: 'Tập hợp các tài liệu và mô hình tính toán kết cấu bê tông thép.',
      },
      overrideAccess: true,
    })
    cleanup.categories.push(testCategory.id)

    // 4. Create SoftwareType fixture
    testSoftwareType = await payload.create({
      collection: 'software_types',
      data: {
        title: `Revit Structure M4 ${ts}`,
        slug: `revit-structure-m4-${ts}`,
        fileExtensions: ['.rvt', '.rfa'],
        description: 'Phần mềm BIM thiết kế kết cấu Autodesk Revit.',
      },
      overrideAccess: true,
    })
    cleanup.softwareTypes.push(testSoftwareType.id)

    // 5. Create Product with ALL 3 Tiers present (Tier 1 should win)
    prodAllTiers = await payload.create({
      collection: 'products',
      data: {
        title: `Challenger Product All Tiers ${ts}`,
        slug: `chal-prod-all-tiers-${ts}`,
        price: 250000,
        isFree: false,
        _status: 'published',
        categories: [testCategory.id],
        software_types: [testSoftwareType.id],
        previewGallery: [previewDoc.id],
        gallery: [
          {
            image: mediaTier3.id,
            caption: 'Tier 3 Gallery image',
          },
        ],
        meta: {
          title: `Custom SEO Meta Title All Tiers ${ts}`,
          description: 'Custom SEO Meta Description All Tiers.',
          image: mediaTier1.id,
        },
      },
      overrideAccess: true,
    })
    cleanup.products.push(prodAllTiers.id)

    // 6. Create Product with Tier 2 & Tier 3 (Tier 1 absent -> Tier 2 should win)
    prodTier2And3 = await payload.create({
      collection: 'products',
      data: {
        title: `Challenger Product Tier 2 and 3 ${ts}`,
        slug: `chal-prod-tier2-3-${ts}`,
        price: 180000,
        isFree: false,
        _status: 'published',
        categories: [testCategory.id],
        software_types: [testSoftwareType.id],
        previewGallery: [previewDoc.id],
        gallery: [
          {
            image: mediaTier3.id,
            caption: 'Tier 3 Gallery image',
          },
        ],
        meta: {
          title: `Custom SEO Title Tier 2 and 3 ${ts}`,
          description: 'No meta image provided here.',
        },
      },
      overrideAccess: true,
    })
    cleanup.products.push(prodTier2And3.id)

    // 7. Create Product with Tier 3 ONLY (Tier 1 & Tier 2 absent -> Tier 3 should win)
    prodTier3Only = await payload.create({
      collection: 'products',
      data: {
        title: `Challenger Product Tier 3 Only ${ts}`,
        slug: `chal-prod-tier3-only-${ts}`,
        price: 0,
        isFree: true,
        _status: 'published',
        categories: [testCategory.id],
        software_types: [testSoftwareType.id],
        previewGallery: [],
        gallery: [
          {
            image: mediaTier3.id,
            caption: 'Tier 3 Gallery image only',
          },
        ],
      },
      overrideAccess: true,
    })
    cleanup.products.push(prodTier3Only.id)

    // 8. Create Product with NO IMAGES AT ALL (All tiers empty)
    prodNoImages = await payload.create({
      collection: 'products',
      data: {
        title: `Challenger Product No Images ${ts}`,
        slug: `chal-prod-no-images-${ts}`,
        price: 90000,
        isFree: false,
        _status: 'published',
        categories: [testCategory.id],
        software_types: [testSoftwareType.id],
        previewGallery: [],
        gallery: [],
      },
      overrideAccess: true,
    })
    cleanup.products.push(prodNoImages.id)

    // 9. Create Draft Product (must trigger 404 for unauthenticated visitors)
    prodDraft = await payload.create({
      collection: 'products',
      draft: true,
      data: {
        title: `Challenger Unpublished Draft ${ts}`,
        slug: `chal-unpub-draft-${ts}`,
        price: 0,
        isFree: true,
        _status: 'draft',
        categories: [testCategory.id],
        software_types: [testSoftwareType.id],
        meta: {
          title: `Draft Secret Title ${ts}`,
          description: 'Confidential draft metadata.',
        },
      },
      overrideAccess: true,
    })
    cleanup.products.push(prodDraft.id)
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
  })

  describe('1. 3-Tier Image Cascade Stress Tests (Product Detail generateMetadata)', () => {
    it('Tier 1: selects meta.image when all 3 image tiers are configured', async () => {
      const meta = await generateProductMetadata({
        params: Promise.resolve({ slug: prodAllTiers.slug }),
      })

      expect(meta.openGraph?.images).toBeDefined()
      const ogImages = meta.openGraph?.images as Array<{ url: string; width?: number; height?: number; alt?: string }>
      expect(Array.isArray(ogImages)).toBe(true)
      expect(ogImages.length).toBeGreaterThanOrEqual(1)

      // Must point to mediaTier1
      expect(ogImages[0].url).toBe(mediaTier1.url)
      expect(ogImages[0].url).not.toBe(mediaTier2.url)
      expect(ogImages[0].url).not.toBe(mediaTier3.url)
    })

    it('Tier 2: falls back to previewGallery watermarked image when meta.image is absent', async () => {
      const meta = await generateProductMetadata({
        params: Promise.resolve({ slug: prodTier2And3.slug }),
      })

      expect(meta.openGraph?.images).toBeDefined()
      const ogImages = meta.openGraph?.images as Array<{ url: string; width?: number; height?: number; alt?: string }>
      expect(Array.isArray(ogImages)).toBe(true)
      expect(ogImages.length).toBeGreaterThanOrEqual(1)

      // Must point to mediaTier2 (from previewGallery)
      expect(ogImages[0].url).toBe(mediaTier2.url)
      expect(ogImages[0].url).not.toBe(mediaTier3.url)
    })

    it('Tier 3: falls back to direct gallery image when meta.image and previewGallery are absent', async () => {
      const meta = await generateProductMetadata({
        params: Promise.resolve({ slug: prodTier3Only.slug }),
      })

      expect(meta.openGraph?.images).toBeDefined()
      const ogImages = meta.openGraph?.images as Array<{ url: string; width?: number; height?: number; alt?: string }>
      expect(Array.isArray(ogImages)).toBe(true)
      expect(ogImages.length).toBeGreaterThanOrEqual(1)

      // Must point to mediaTier3 (from gallery)
      expect(ogImages[0].url).toBe(mediaTier3.url)
    })

    it('Tier 4: returns undefined openGraph.images gracefully when product has no images', async () => {
      const meta = await generateProductMetadata({
        params: Promise.resolve({ slug: prodNoImages.slug }),
      })

      expect(meta.openGraph?.images).toBeUndefined()
      expect(meta.twitter?.images).toBeUndefined()
    })
  })

  describe('2. OpenGraph Article & Canonical Metadata Integrity', () => {
    it('sets openGraph type to article, vi_VN locale, siteName, and publication timestamps', async () => {
      const meta = await generateProductMetadata({
        params: Promise.resolve({ slug: prodAllTiers.slug }),
      })

      const og = meta.openGraph as Record<string, unknown>
      expect(og).toBeDefined()
      expect(og.type).toBe('article')
      expect(og.locale).toBe('vi_VN')
      expect(og.siteName).toBe('KienTaoHub')
      expect(og.url).toBe(`/products/${prodAllTiers.slug}`)
      expect(og.publishedTime).toBe(prodAllTiers.createdAt)
      expect(og.modifiedTime).toBe(prodAllTiers.updatedAt)
    })

    it('sets canonical link strictly matching /products/[slug]', async () => {
      const meta = await generateProductMetadata({
        params: Promise.resolve({ slug: prodTier3Only.slug }),
      })

      expect(meta.alternates?.canonical).toBe(`/products/${prodTier3Only.slug}`)
    })

    it('uses fallback title and description when meta object is omitted', async () => {
      const meta = await generateProductMetadata({
        params: Promise.resolve({ slug: prodTier3Only.slug }),
      })

      expect(meta.title).toBe(prodTier3Only.title)
      expect(String(meta.description)).toContain(prodTier3Only.title)
      expect(String(meta.description)).toContain('KienTaoHub')
    })
  })

  describe('3. Draft Isolation & Adversarial Slug 404 Boundaries', () => {
    it('throws notFound() when unauthenticated public visitor requests draft product metadata', async () => {
      await expect(
        generateProductMetadata({
          params: Promise.resolve({ slug: prodDraft.slug }),
        }),
      ).rejects.toThrow()
    })

    it('throws notFound() for non-existent product slug', async () => {
      await expect(
        generateProductMetadata({
          params: Promise.resolve({ slug: `completely-unknown-slug-${Date.now()}` }),
        }),
      ).rejects.toThrow()
    })

    it('throws notFound() for path traversal and SQL injection attempts without crashing', async () => {
      const adversarialSlugs = [
        '../../etc/passwd',
        '\' OR \'1\'=\'1',
        '<script>alert("xss")</script>',
        'product/slug/nested',
      ]

      for (const badSlug of adversarialSlugs) {
        await expect(
          generateProductMetadata({
            params: Promise.resolve({ slug: badSlug }),
          }),
        ).rejects.toThrow()
      }
    })
  })

  describe('4. Dynamic /shop Storefront Metadata Facet Tests', () => {
    it('generates default title and description when no query facets are provided', async () => {
      const meta = await generateShopMetadata({
        searchParams: Promise.resolve({}),
      })

      expect(meta.title).toBe('Thư viện tài nguyên kỹ thuật & bản vẽ')
      expect(String(meta.description)).toContain('KienTaoHub')
      expect(meta.alternates?.canonical).toBe('/shop')
    })

    it('dynamically incorporates category facet (?category=slug)', async () => {
      const meta = await generateShopMetadata({
        searchParams: Promise.resolve({ category: testCategory.slug }),
      })

      expect(String(meta.title)).toBe(`Tài nguyên ${testCategory.title}`)
      expect(String(meta.description)).toBe(testCategory.description)
      expect(meta.alternates?.canonical).toBe(`/shop?category=${encodeURIComponent(testCategory.slug)}`)
    })

    it('dynamically resolves category facet using numeric ID (?category=id)', async () => {
      const meta = await generateShopMetadata({
        searchParams: Promise.resolve({ category: String(testCategory.id) }),
      })

      expect(String(meta.title)).toBe(`Tài nguyên ${testCategory.title}`)
    })

    it('dynamically incorporates software facet (?software=slug and ?softwareType=slug)', async () => {
      // Test ?software=
      const meta1 = await generateShopMetadata({
        searchParams: Promise.resolve({ software: testSoftwareType.slug }),
      })
      expect(String(meta1.title)).toBe(`Tài nguyên ${testSoftwareType.title}`)
      expect(meta1.alternates?.canonical).toBe(`/shop?softwareType=${encodeURIComponent(testSoftwareType.slug)}`)

      // Test ?softwareType=
      const meta2 = await generateShopMetadata({
        searchParams: Promise.resolve({ softwareType: testSoftwareType.slug }),
      })
      expect(String(meta2.title)).toBe(`Tài nguyên ${testSoftwareType.title}`)
      expect(meta2.alternates?.canonical).toBe(`/shop?softwareType=${encodeURIComponent(testSoftwareType.slug)}`)
    })

    it('dynamically combines category AND software facets (?category=&software=)', async () => {
      const meta = await generateShopMetadata({
        searchParams: Promise.resolve({
          category: testCategory.slug,
          software: testSoftwareType.slug,
        }),
      })

      expect(String(meta.title)).toBe(`${testCategory.title} cho ${testSoftwareType.title}`)
      expect(String(meta.description)).toContain(testCategory.title)
      expect(String(meta.description)).toContain(testSoftwareType.title)
    })

    it('appends (Miễn phí) when isFree=true or priceType=free', async () => {
      const metaFree1 = await generateShopMetadata({
        searchParams: Promise.resolve({ isFree: 'true' }),
      })
      expect(String(metaFree1.title)).toContain('(Miễn phí)')

      const metaFree2 = await generateShopMetadata({
        searchParams: Promise.resolve({ priceType: 'free' }),
      })
      expect(String(metaFree2.title)).toContain('(Miễn phí)')
    })

    it('appends (Có phí) when isFree=false or priceType=paid', async () => {
      const metaPaid1 = await generateShopMetadata({
        searchParams: Promise.resolve({ isFree: 'false' }),
      })
      expect(String(metaPaid1.title)).toContain('(Có phí)')

      const metaPaid2 = await generateShopMetadata({
        searchParams: Promise.resolve({ priceType: 'paid' }),
      })
      expect(String(metaPaid2.title)).toContain('(Có phí)')
    })

    it('dynamically reflects search keyword query (?q=)', async () => {
      const query = 'Mặt bằng móng băng'
      const meta = await generateShopMetadata({
        searchParams: Promise.resolve({ q: query }),
      })

      expect(String(meta.title)).toBe(`Tìm kiếm: "${query}"`)
      expect(String(meta.description)).toContain(query)
      expect(meta.alternates?.canonical).toBe(`/shop?q=${encodeURIComponent(query)}`)
    })

    it('synthesizes multi-facet query with Category, Software, isFree, and search query', async () => {
      const query = 'Bản vẽ dầm'
      const meta = await generateShopMetadata({
        searchParams: Promise.resolve({
          category: testCategory.slug,
          software: testSoftwareType.slug,
          isFree: 'true',
          q: query,
        }),
      })

      expect(String(meta.title)).toBe(
        `Tìm kiếm "${query}" - ${testCategory.title} (${testSoftwareType.title}) (Miễn phí)`,
      )
      expect(String(meta.description)).toContain(query)
      const canonical = meta.alternates?.canonical as string
      expect(canonical).toContain(`category=${encodeURIComponent(testCategory.slug)}`)
      expect(canonical).toContain(`softwareType=${encodeURIComponent(testSoftwareType.slug)}`)
      expect(canonical).toContain('isFree=true')
      expect(canonical).toContain(`q=${encodeURIComponent(query)}`)
    })

    it('gracefully degrades to default metadata when category or software slug is non-existent', async () => {
      const meta = await generateShopMetadata({
        searchParams: Promise.resolve({
          category: 'non-existent-category-slug-404',
          software: 'non-existent-software-slug-404',
        }),
      })

      // Should not crash or throw unhandled error, returns default title
      expect(meta.title).toBe('Thư viện tài nguyên kỹ thuật & bản vẽ')
    })
  })
})
