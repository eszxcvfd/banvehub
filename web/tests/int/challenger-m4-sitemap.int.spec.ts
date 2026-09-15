import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { getPayload, type Payload } from 'payload'
import config from '@/payload.config'
import type { Category, Product, SoftwareType } from '@/payload-types'
import { getServerSideURL } from '@/utilities/getURL'
import robots from '@/app/(app)/robots'
import sitemap from '@/app/(app)/sitemap'

// Mock next/headers for Server Component execution in vitest
vi.mock('next/headers', () => ({
  draftMode: () => Promise.resolve({ isEnabled: false }),
}))

/**
 * Challenger M4 Sitemap & Robots.txt Empirical Verification Suite (Gen 2)
 *
 * Empirical Challenges:
 * 1. Default export contract: sitemap.ts exports async function returning MetadataRoute.Sitemap.
 * 2. URL formatting invariants: no double-slash duplications, proper encoding, valid priority & changeFrequency.
 * 3. Draft Isolation: published products included, draft products strictly excluded under any circumstances,
 *    and lifecycle transition (published -> draft unpublishing) instantly reflects in sitemap.
 * 4. Taxonomy Invariants: active categories & software types included, archived categories strictly excluded,
 *    and category archiving lifecycle instantly reflects in sitemap.
 * 5. Robots.txt Directives & Invariants: allows public catalog, disallows private/admin endpoints,
 *    and zero sitemap URLs match disallowed prefixes.
 */
describe('Challenger M4: Sitemap & Robots.txt Empirical Verification Suite', () => {
  let payload: Payload

  let activeCategory: Category
  let archivedCategory: Category
  let testSoftwareType: SoftwareType
  let publishedProduct: Product
  let draftProduct: Product
  let lifecycleProduct: Product

  const cleanup = {
    products: [] as (number | string)[],
    categories: [] as (number | string)[],
    softwareTypes: [] as (number | string)[],
  }

  beforeAll(async () => {
    payload = await getPayload({ config: await config })
    const ts = Date.now()

    // 1. Create Active Category
    activeCategory = await payload.create({
      collection: 'categories',
      data: {
        title: `Challenger Active Category ${ts}`,
        slug: `chal-active-cat-${ts}`,
        status: 'active',
        description: 'Active category for sitemap empirical testing.',
      },
      overrideAccess: true,
    })
    cleanup.categories.push(activeCategory.id)

    // 2. Create Archived Category
    archivedCategory = await payload.create({
      collection: 'categories',
      data: {
        title: `Challenger Archived Category ${ts}`,
        slug: `chal-archived-cat-${ts}`,
        status: 'archived',
        description: 'Archived category that must be strictly excluded from sitemap.',
      },
      overrideAccess: true,
    })
    cleanup.categories.push(archivedCategory.id)

    // 3. Create SoftwareType
    testSoftwareType = await payload.create({
      collection: 'software_types',
      data: {
        title: `Challenger Software ${ts}`,
        slug: `chal-software-${ts}`,
        fileExtensions: ['.dwg', '.rvt'],
        description: 'CAD/BIM software type for sitemap testing.',
      },
      overrideAccess: true,
    })
    cleanup.softwareTypes.push(testSoftwareType.id)

    // 4. Create Published Product
    publishedProduct = await payload.create({
      collection: 'products',
      data: {
        title: `Challenger Published Product ${ts}`,
        slug: `chal-pub-prod-${ts}`,
        price: 250000,
        isFree: false,
        _status: 'published',
        categories: [activeCategory.id],
        software_types: [testSoftwareType.id],
        technicalSpecs: {
          fileFormat: '.dwg',
          softwareVersion: '2024',
          unit: 'metric',
        },
      },
      overrideAccess: true,
    })
    cleanup.products.push(publishedProduct.id)

    // 5. Create Draft Product
    draftProduct = await payload.create({
      collection: 'products',
      draft: true,
      data: {
        title: `Challenger Draft Product ${ts}`,
        slug: `chal-draft-prod-${ts}`,
        price: 0,
        isFree: true,
        _status: 'draft',
        categories: [activeCategory.id],
        software_types: [testSoftwareType.id],
      },
      overrideAccess: true,
    })
    cleanup.products.push(draftProduct.id)

    // 6. Create Lifecycle Product (will transition between published and draft)
    lifecycleProduct = await payload.create({
      collection: 'products',
      data: {
        title: `Challenger Lifecycle Product ${ts}`,
        slug: `chal-lifecycle-prod-${ts}`,
        price: 150000,
        isFree: false,
        _status: 'published',
        categories: [activeCategory.id],
        software_types: [testSoftwareType.id],
      },
      overrideAccess: true,
    })
    cleanup.products.push(lifecycleProduct.id)
  })

  afterAll(async () => {
    for (const id of cleanup.products) {
      try {
        await payload.delete({ collection: 'products', id, overrideAccess: true })
      } catch {}
    }
    for (const id of cleanup.categories) {
      try {
        await payload.delete({ collection: 'categories', id, overrideAccess: true })
      } catch {}
    }
    for (const id of cleanup.softwareTypes) {
      try {
        await payload.delete({ collection: 'software_types', id, overrideAccess: true })
      } catch {}
    }
  })

  describe('1. sitemap.ts Contract & Export Validation', () => {
    it('exports default async function returning MetadataRoute.Sitemap', async () => {
      expect(typeof sitemap).toBe('function')
      const resultPromise = sitemap()
      expect(resultPromise).toBeInstanceOf(Promise)

      const entries = await resultPromise
      expect(Array.isArray(entries)).toBe(true)
      expect(entries.length).toBeGreaterThanOrEqual(2)
    })

    it('each sitemap entry adheres to Next.js MetadataRoute.Sitemap item schema', async () => {
      const entries = await sitemap()
      const validFrequencies = ['always', 'hourly', 'daily', 'weekly', 'monthly', 'yearly', 'never']

      for (const entry of entries) {
        expect(entry.url).toBeDefined()
        expect(typeof entry.url).toBe('string')
        expect(entry.url.startsWith('http://') || entry.url.startsWith('https://')).toBe(true)

        if (entry.lastModified) {
          const modDate = new Date(entry.lastModified)
          expect(isNaN(modDate.getTime())).toBe(false)
        }

        if (entry.changeFrequency) {
          expect(validFrequencies).toContain(entry.changeFrequency)
        }

        if (entry.priority !== undefined) {
          expect(entry.priority).toBeGreaterThanOrEqual(0.0)
          expect(entry.priority).toBeLessThanOrEqual(1.0)
        }
      }
    })
  })

  describe('2. URL Formatting & Trailing Slash Duplication Verification', () => {
    it('ensures NO sitemap entry contains duplicate slashes (except the protocol //)', async () => {
      const entries = await sitemap()
      for (const entry of entries) {
        const withoutProtocol = entry.url.replace(/^https?:\/\//, '')
        expect(withoutProtocol).not.toMatch(/\/{2,}/)
      }
    })

    it('verifies exact URL pattern for core, product, category, and softwareType routes', async () => {
      const baseUrl = getServerSideURL().replace(/\/+$/, '')
      const entries = await sitemap()

      const home = entries.find((e) => e.url === `${baseUrl}/` || e.url === baseUrl)
      expect(home).toBeDefined()

      const shop = entries.find((e) => e.url === `${baseUrl}/shop`)
      expect(shop).toBeDefined()

      const product = entries.find((e) => e.url === `${baseUrl}/products/${publishedProduct.slug}`)
      expect(product).toBeDefined()

      const category = entries.find((e) => e.url === `${baseUrl}/shop?category=${activeCategory.slug}`)
      expect(category).toBeDefined()

      const software = entries.find((e) => e.url === `${baseUrl}/shop?softwareType=${testSoftwareType.slug}`)
      expect(software).toBeDefined()
    })
  })

  describe('3. Draft Isolation & Dynamic Product Lifecycle', () => {
    it('includes published product in sitemap', async () => {
      const entries = await sitemap()
      const found = entries.some((e) => e.url.includes(publishedProduct.slug))
      expect(found).toBe(true)
    })

    it('strictly excludes draft product under any circumstances', async () => {
      const entries = await sitemap()
      const found = entries.some((e) => e.url.includes(draftProduct.slug))
      expect(found).toBe(false)
    })

    it('immediately purges product from sitemap when unpublished (status: published -> draft)', async () => {
      // 1. Verify initially present
      let entries = await sitemap()
      expect(entries.some((e) => e.url.includes(lifecycleProduct.slug))).toBe(true)

      // 2. Unpublish
      await payload.update({
        collection: 'products',
        id: lifecycleProduct.id,
        data: { _status: 'draft' },
        overrideAccess: true,
      })

      // 3. Verify immediately absent
      entries = await sitemap()
      expect(entries.some((e) => e.url.includes(lifecycleProduct.slug))).toBe(false)

      // 4. Re-publish
      await payload.update({
        collection: 'products',
        id: lifecycleProduct.id,
        data: { _status: 'published' },
        overrideAccess: true,
      })

      // 5. Verify restored
      entries = await sitemap()
      expect(entries.some((e) => e.url.includes(lifecycleProduct.slug))).toBe(true)
    })
  })

  describe('4. Taxonomy Invariants: Active vs Archived Categories & Software Types', () => {
    it('includes active category in sitemap with priority 0.7', async () => {
      const entries = await sitemap()
      const catEntry = entries.find((e) => e.url.includes(`category=${activeCategory.slug}`))
      expect(catEntry).toBeDefined()
      expect(catEntry?.priority).toBe(0.7)
    })

    it('strictly excludes archived category from sitemap', async () => {
      const entries = await sitemap()
      const archivedEntry = entries.find((e) => e.url.includes(`category=${archivedCategory.slug}`))
      expect(archivedEntry).toBeUndefined()
    })

    it('immediately removes category when archived (status: active -> archived)', async () => {
      // Archive active category
      await payload.update({
        collection: 'categories',
        id: activeCategory.id,
        data: { status: 'archived' },
        overrideAccess: true,
      })

      // Verify now excluded
      let entries = await sitemap()
      expect(entries.some((e) => e.url.includes(`category=${activeCategory.slug}`))).toBe(false)

      // Restore to active
      await payload.update({
        collection: 'categories',
        id: activeCategory.id,
        data: { status: 'active' },
        overrideAccess: true,
      })

      // Verify restored
      entries = await sitemap()
      expect(entries.some((e) => e.url.includes(`category=${activeCategory.slug}`))).toBe(true)
    })

    it('includes software types in sitemap with priority 0.7', async () => {
      const entries = await sitemap()
      const swEntry = entries.find((e) => e.url.includes(`softwareType=${testSoftwareType.slug}`))
      expect(swEntry).toBeDefined()
      expect(swEntry?.priority).toBe(0.7)
    })
  })

  describe('5. robots.ts Directives & Cross-Cutting Sitemap Alignment', () => {
    it('exports default function returning MetadataRoute.Robots with userAgent *', () => {
      expect(typeof robots).toBe('function')
      const robotsData = robots()
      expect(robotsData).toBeDefined()

      const rule = Array.isArray(robotsData.rules) ? robotsData.rules[0] : robotsData.rules
      expect(rule?.userAgent).toBe('*')
    })

    it('correctly allows public catalog routes and disallows private/admin endpoints', () => {
      const robotsData = robots()
      const rule = Array.isArray(robotsData.rules) ? robotsData.rules[0] : robotsData.rules

      const allowList = Array.isArray(rule?.allow) ? rule?.allow : [rule?.allow]
      expect(allowList).toContain('/')
      expect(allowList).toContain('/shop')
      expect(allowList).toContain('/products/')
      expect(allowList).toContain('/_next/static/')

      const disallowList = Array.isArray(rule?.disallow) ? rule?.disallow : [rule?.disallow]
      expect(disallowList).toContain('/admin/')
      expect(disallowList).toContain('/account/')
      expect(disallowList).toContain('/api/')
      expect(disallowList).toContain('/checkout/')
      expect(disallowList).toContain('/orders/')
      expect(disallowList).toContain('/find-order')
      expect(disallowList).toContain('/next/')
    })

    it('references the dynamic sitemap XML URL and host', () => {
      const baseUrl = getServerSideURL()
      const robotsData = robots()

      expect(robotsData.sitemap).toBe(`${baseUrl}/sitemap.xml`)
      expect(robotsData.host).toBe(baseUrl)
    })

    it('guarantees zero disallowed paths from robots.ts exist in sitemap.ts entries', async () => {
      const robotsData = robots()
      const rule = Array.isArray(robotsData.rules) ? robotsData.rules[0] : robotsData.rules
      const disallows = ((Array.isArray(rule?.disallow) ? rule?.disallow : [rule?.disallow]) as string[]).filter(Boolean)

      const sitemapEntries = await sitemap()
      for (const entry of sitemapEntries) {
        const urlPath = new URL(entry.url).pathname
        for (const disallowed of disallows) {
          expect(urlPath.startsWith(disallowed)).toBe(false)
        }
      }
    })
  })
})
