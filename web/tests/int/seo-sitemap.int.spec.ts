import React from 'react'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { getPayload, type Payload } from 'payload'
import config from '@/payload.config'
import type { Category, Product, SoftwareType } from '@/payload-types'
import { getServerSideURL } from '@/utilities/getURL'
import robots from '@/app/(app)/robots'
import sitemap from '@/app/(app)/sitemap'
import { generateMetadata } from '@/app/(app)/products/[slug]/page'

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
 * Milestone 4 Integration Test Suite: SEO, Robots.txt, Dynamic Sitemap & Metadata Verification
 *
 * Verifies:
 * 1. robots.txt crawl directives, userAgent, allow/disallow paths, and sitemap reference.
 * 2. Dynamic sitemap generation with core routes, published products, categories, software types.
 * 3. Strict draft product exclusion from dynamic sitemap entries.
 * 4. Product detail metadata generation: dynamic title, description, OpenGraph, canonical tags.
 * 5. Guest access protection: Draft product metadata access throws notFound (HTTP 404).
 * 6. Cross-cutting architectural invariants between robots.txt and sitemap.xml.
 */
describe('Milestone 4: SEO, Robots.txt & Dynamic Sitemap Integration Suite', () => {
  let payload: Payload

  let testCategory: Category
  let testSoftwareType: SoftwareType
  let testPublishedProduct: Product
  let testDraftProduct: Product

  const cleanup = {
    products: [] as (number | string)[],
    categories: [] as (number | string)[],
    softwareTypes: [] as (number | string)[],
  }

  beforeAll(async () => {
    payload = await getPayload({ config: await config })
    const ts = Date.now()

    // 1. Create active Category fixture
    testCategory = await payload.create({
      collection: 'categories',
      data: {
        title: `M4 Kiến Trúc Quy Hoạch ${ts}`,
        slug: `m4-kien-truc-quy-hoach-${ts}`,
        status: 'active',
        description: 'Chuyên mục bản vẽ thiết kế kiến trúc và quy hoạch đô thị.',
      },
      overrideAccess: true,
    })
    cleanup.categories.push(testCategory.id)

    // 2. Create SoftwareType fixture
    testSoftwareType = await payload.create({
      collection: 'software_types',
      data: {
        title: `AutoCAD M4 ${ts}`,
        slug: `autocad-m4-${ts}`,
        fileExtensions: ['.dwg', '.dxf'],
        description: 'Phần mềm thiết kế đồ họa kỹ thuật AutoCAD 2D/3D.',
      },
      overrideAccess: true,
    })
    cleanup.softwareTypes.push(testSoftwareType.id)

    // 3. Create Published Product fixture
    testPublishedProduct = await payload.create({
      collection: 'products',
      data: {
        title: `Hồ sơ thiết kế nhà phố M4 Published ${ts}`,
        slug: `ho-so-thiet-ke-nha-pho-m4-pub-${ts}`,
        price: 350000,
        isFree: false,
        _status: 'published',
        categories: [testCategory.id],
        software_types: [testSoftwareType.id],
        technicalSpecs: {
          fileFormat: '.dwg',
          softwareVersion: 'AutoCAD 2024',
          fileSize: '48.2 MB',
          unit: 'metric',
        },
        meta: {
          title: `Hồ sơ nhà phố M4 Published SEO Title ${ts}`,
          description: 'Bản vẽ chi tiết thiết kế kiến trúc và kết cấu nhà phố hiện đại.',
        },
      },
      overrideAccess: true,
    })
    cleanup.products.push(testPublishedProduct.id)

    // 4. Create Draft Product fixture
    testDraftProduct = await payload.create({
      collection: 'products',
      draft: true,
      data: {
        title: `Bản vẽ nháp nội bộ M4 Draft ${ts}`,
        slug: `ban-ve-nhap-noi-bo-m4-draft-${ts}`,
        price: 0,
        isFree: true,
        _status: 'draft',
        categories: [testCategory.id],
        software_types: [testSoftwareType.id],
        meta: {
          title: `Bản vẽ nháp nội bộ Draft Title ${ts}`,
          description: 'Hồ sơ nháp đang trong quá trình hiệu chỉnh chưa công bố.',
        },
      },
      overrideAccess: true,
    })
    cleanup.products.push(testDraftProduct.id)
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
  })

  describe('1. robots.ts Crawl Directives & Contract Verification', () => {
    it('returns valid MetadataRoute.Robots with userAgent *', () => {
      const robotsData = robots()
      expect(robotsData).toBeDefined()
      expect(robotsData.rules).toBeDefined()

      const rule = Array.isArray(robotsData.rules) ? robotsData.rules[0] : robotsData.rules
      expect(rule?.userAgent).toBe('*')
    })

    it('permits public catalog and static asset paths in allow directives', () => {
      const robotsData = robots()
      const rule = Array.isArray(robotsData.rules) ? robotsData.rules[0] : robotsData.rules
      const allow = Array.isArray(rule?.allow) ? rule?.allow : [rule?.allow]

      expect(allow).toContain('/')
      expect(allow).toContain('/shop')
      expect(allow).toContain('/products/')
      expect(allow).toContain('/_next/static/')
    })

    it('blocks private, administrative, checkout, and API routes in disallow directives', () => {
      const robotsData = robots()
      const rule = Array.isArray(robotsData.rules) ? robotsData.rules[0] : robotsData.rules
      const disallow = Array.isArray(rule?.disallow) ? rule?.disallow : [rule?.disallow]

      expect(disallow).toContain('/admin/')
      expect(disallow).toContain('/account/')
      expect(disallow).toContain('/api/')
      expect(disallow).toContain('/checkout/')
      expect(disallow).toContain('/orders/')
      expect(disallow).toContain('/find-order')
      expect(disallow).toContain('/next/')
    })

    it('points sitemap and host to canonical base URL', () => {
      const robotsData = robots()
      const baseUrl = getServerSideURL()

      expect(robotsData.sitemap).toBe(`${baseUrl}/sitemap.xml`)
      expect(robotsData.host).toBe(baseUrl)
    })
  })

  describe('2. Dynamic Sitemap (sitemap.ts) Contract & Generation Verification', () => {
    it('generates an array conforming to MetadataRoute.Sitemap', async () => {
      const sitemapEntries = await sitemap()
      expect(Array.isArray(sitemapEntries)).toBe(true)
      expect(sitemapEntries.length).toBeGreaterThanOrEqual(2)
    })

    it('includes core landing routes (/ and /shop) with correct priority and changeFrequency', async () => {
      const baseUrl = getServerSideURL()
      const sitemapEntries = await sitemap()

      const homeEntry = sitemapEntries.find(
        (entry) => entry.url === `${baseUrl}/` || entry.url === baseUrl,
      )
      expect(homeEntry).toBeDefined()
      expect(homeEntry?.priority).toBe(1.0)
      expect(homeEntry?.changeFrequency).toBe('daily')

      const shopEntry = sitemapEntries.find((entry) => entry.url === `${baseUrl}/shop`)
      expect(shopEntry).toBeDefined()
      expect(shopEntry?.priority).toBe(0.9)
      expect(shopEntry?.changeFrequency).toBe('daily')
    })

    it('includes published products with correct URL, priority 0.8, and changeFrequency weekly', async () => {
      const baseUrl = getServerSideURL()
      const sitemapEntries = await sitemap()

      const productEntry = sitemapEntries.find(
        (entry) => entry.url === `${baseUrl}/products/${testPublishedProduct.slug}`,
      )
      expect(productEntry).toBeDefined()
      expect(productEntry?.priority).toBe(0.8)
      expect(productEntry?.changeFrequency).toBe('weekly')
      expect(productEntry?.lastModified).toBeDefined()

      const lastModDate = new Date(productEntry!.lastModified!)
      expect(isNaN(lastModDate.getTime())).toBe(false)
    })

    it('includes published categories with correct query URL, priority 0.7, and changeFrequency weekly', async () => {
      const baseUrl = getServerSideURL()
      const sitemapEntries = await sitemap()

      const categoryEntry = sitemapEntries.find(
        (entry) => entry.url === `${baseUrl}/shop?category=${testCategory.slug}`,
      )
      expect(categoryEntry).toBeDefined()
      expect(categoryEntry?.priority).toBe(0.7)
      expect(categoryEntry?.changeFrequency).toBe('weekly')
      expect(categoryEntry?.lastModified).toBeDefined()
    })

    it('includes published software types with correct query URL and priority 0.7', async () => {
      const baseUrl = getServerSideURL()
      const sitemapEntries = await sitemap()

      const swEntry = sitemapEntries.find(
        (entry) => entry.url === `${baseUrl}/shop?softwareType=${testSoftwareType.slug}`,
      )
      expect(swEntry).toBeDefined()
      expect(swEntry?.priority).toBe(0.7)
    })

    it('strictly excludes draft products from sitemap entries', async () => {
      const baseUrl = getServerSideURL()
      const sitemapEntries = await sitemap()

      const draftEntry = sitemapEntries.find(
        (entry) =>
          entry.url.includes(testDraftProduct.slug) ||
          entry.url === `${baseUrl}/products/${testDraftProduct.slug}`,
      )
      expect(draftEntry).toBeUndefined()
    })
  })

  describe('3. Dynamic Metadata, OpenGraph & Canonical Tag Verification', () => {
    it('generates dynamic title, description, and indexable robots for published products', async () => {
      const meta = await generateMetadata({
        params: Promise.resolve({ slug: testPublishedProduct.slug }),
      })

      expect(meta).toBeDefined()
      expect(meta.title).toBeDefined()
      expect(String(meta.title)).toContain(testPublishedProduct.meta?.title || testPublishedProduct.title)
      expect(meta.description).toBe(testPublishedProduct.meta?.description)

      expect(meta.robots).toBeDefined()
      const robotsRule =
        typeof meta.robots === 'object' && meta.robots !== null
          ? (meta.robots as { follow?: boolean; index?: boolean })
          : null
      expect(robotsRule?.index).toBe(true)
      expect(robotsRule?.follow).toBe(true)
    })

    it('generates canonical tag pointing to the canonical product path', async () => {
      const meta = await generateMetadata({
        params: Promise.resolve({ slug: testPublishedProduct.slug }),
      })

      expect(meta.alternates).toBeDefined()
      expect(meta.alternates?.canonical).toBeDefined()
      expect(String(meta.alternates?.canonical)).toContain(
        `/products/${testPublishedProduct.slug}`,
      )
    })

    it('generates OpenGraph metadata with images or title for published products', async () => {
      const meta = await generateMetadata({
        params: Promise.resolve({ slug: testPublishedProduct.slug }),
      })

      expect(meta.openGraph).toBeDefined()
    })

    it('strictly blocks draft products and returns 404 (throws notFound) for public unauthenticated visitors', async () => {
      await expect(
        generateMetadata({
          params: Promise.resolve({ slug: testDraftProduct.slug }),
        }),
      ).rejects.toThrow()
    })

    it('returns 404 (throws notFound) for non-existent product slug', async () => {
      await expect(
        generateMetadata({
          params: Promise.resolve({ slug: `non-existent-slug-${Date.now()}` }),
        }),
      ).rejects.toThrow()
    })
  })

  describe('4. Cross-Cutting SEO Invariants & Security Boundaries', () => {
    it('ensures all URLs in sitemap use the canonical base URL host', async () => {
      const robotsData = robots()
      const sitemapEntries = await sitemap()
      const host = robotsData.host

      expect(host).toBeDefined()
      for (const entry of sitemapEntries) {
        expect(entry.url.startsWith(host!)).toBe(true)
      }
    })

    it('ensures no disallowed paths from robots.ts appear in dynamic sitemap.ts', async () => {
      const robotsData = robots()
      const rule = Array.isArray(robotsData.rules) ? robotsData.rules[0] : robotsData.rules
      const disallowedList = (
        Array.isArray(rule?.disallow) ? rule?.disallow : [rule?.disallow]
      ).filter(Boolean) as string[]

      const sitemapEntries = await sitemap()
      for (const entry of sitemapEntries) {
        for (const disallowedPath of disallowedList) {
          expect(entry.url).not.toContain(disallowedPath)
        }
      }
    })
  })
})
