import type { MetadataRoute } from 'next'
import configPromise from '@payload-config'
import { getPayload } from 'payload'
import type { Category, Page, Product, SoftwareType } from '@/payload-types'
import { getServerSideURL } from '@/utilities/getURL'

/**
 * Revalidate sitemap at most once per hour (ISR).
 * In development, Next.js dynamically evaluates on every request.
 */
export const revalidate = 3600

/**
 * Dynamic Sitemap generator for KienTaoHub digital engineering file marketplace.
 *
 * Implements Phase 2 (Catalog) Milestone 4 SEO & Indexability contract:
 * - Static/core pages:
 *     - `/` (priority: 1.0, changeFrequency: 'daily')
 *     - `/shop` (priority: 0.9, changeFrequency: 'daily')
 * - All published products:
 *     - `/products/[slug]` (priority: 0.8, changeFrequency: 'weekly', lastModified: product.updatedAt)
 * - All published/active categories:
 *     - `/shop?category=[slug]` (priority: 0.7, changeFrequency: 'weekly', lastModified: category.updatedAt)
 * - All published software types:
 *     - `/shop?softwareType=[slug]` (priority: 0.7, changeFrequency: 'weekly', lastModified: softwareType.updatedAt)
 * - Published informational CMS pages:
 *     - `/[slug]` (priority: 0.6, changeFrequency: 'monthly', excluding 'home')
 *
 * Draft Isolation Guarantee:
 * - Products: draft: false, overrideAccess: false, _status: 'published' filter, plus in-memory check.
 * - Categories: filters out archived status.
 * - Local API error resilience: returns core static entries if Payload/DB query encounters an error.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = (process.env.NEXT_PUBLIC_SERVER_URL || getServerSideURL()).replace(/\/+$/, '')
  const now = new Date()

  // 1. Core static routes contract
  const coreEntries: MetadataRoute.Sitemap = [
    {
      url: `${baseUrl}/`,
      lastModified: now,
      changeFrequency: 'daily',
      priority: 1.0,
    },
    {
      url: `${baseUrl}/shop`,
      lastModified: now,
      changeFrequency: 'daily',
      priority: 0.9,
    },
  ]

  try {
    const payload = await getPayload({ config: configPromise })

    // 2. Published Products (strict draft isolation)
    const productsResult = await payload.find({
      collection: 'products',
      draft: false,
      overrideAccess: false,
      limit: 1000,
      pagination: false,
      where: {
        _status: {
          equals: 'published',
        },
      },
      select: {
        slug: true,
        updatedAt: true,
        _status: true,
      },
    })

    const productEntries: MetadataRoute.Sitemap = ((productsResult.docs || []) as Product[])
      .filter((product: Product) => Boolean(product.slug) && product._status === 'published')
      .map((product: Product) => ({
        url: `${baseUrl}/products/${encodeURIComponent(product.slug)}`,
        lastModified: product.updatedAt ? new Date(product.updatedAt) : now,
        changeFrequency: 'weekly',
        priority: 0.8,
      }))

    // 3. Published Categories (active only, exclude archived)
    const categoriesResult = await payload.find({
      collection: 'categories',
      limit: 1000,
      pagination: false,
      where: {
        or: [
          { status: { equals: 'active' } },
          { status: { exists: false } },
        ],
      },
      select: {
        slug: true,
        updatedAt: true,
        status: true,
      },
    })

    const categoryEntries: MetadataRoute.Sitemap = ((categoriesResult.docs || []) as Category[])
      .filter((cat: Category) => Boolean(cat.slug) && cat.status !== 'archived')
      .map((category: Category) => ({
        url: `${baseUrl}/shop?category=${encodeURIComponent(category.slug)}`,
        lastModified: category.updatedAt ? new Date(category.updatedAt) : now,
        changeFrequency: 'weekly',
        priority: 0.7,
      }))

    // 4. Published Software Types (CAD/BIM software taxonomy)
    const softwareTypesResult = await payload.find({
      collection: 'software_types',
      limit: 1000,
      pagination: false,
      select: {
        slug: true,
        updatedAt: true,
      },
    })

    const softwareTypeEntries: MetadataRoute.Sitemap = ((softwareTypesResult.docs || []) as SoftwareType[])
      .filter((sw: SoftwareType) => Boolean(sw.slug))
      .map((softwareType: SoftwareType) => ({
        url: `${baseUrl}/shop?softwareType=${encodeURIComponent(softwareType.slug)}`,
        lastModified: softwareType.updatedAt ? new Date(softwareType.updatedAt) : now,
        changeFrequency: 'weekly',
        priority: 0.7,
      }))

    // 5. Published informational CMS pages (excluding 'home' which is mounted at root '/')
    let cmsPageEntries: MetadataRoute.Sitemap = []
    try {
      const pagesResult = await payload.find({
        collection: 'pages',
        draft: false,
        overrideAccess: false,
        limit: 1000,
        pagination: false,
        where: {
          and: [
            {
              slug: {
                not_equals: 'home',
              },
            },
            {
              _status: {
                equals: 'published',
              },
            },
          ],
        },
        select: {
          slug: true,
          updatedAt: true,
          _status: true,
        },
      })

      cmsPageEntries = ((pagesResult.docs || []) as Page[])
        .filter((page: Page) => Boolean(page.slug) && page.slug !== 'home' && page._status === 'published')
        .map((page: Page) => ({
          url: `${baseUrl}/${encodeURIComponent(page.slug)}`,
          lastModified: page.updatedAt ? new Date(page.updatedAt) : now,
          changeFrequency: 'monthly',
          priority: 0.6,
        }))
    } catch (pageError) {
      // Pages collection query failure should not degrade catalog sitemap
      console.warn('Sitemap: unable to query CMS pages collection:', pageError)
    }

    return [
      ...coreEntries,
      ...productEntries,
      ...categoryEntries,
      ...softwareTypeEntries,
      ...cmsPageEntries,
    ]
  } catch (error) {
    // Graceful degradation: return core routes if database/Payload initialization fails
    console.error('Error generating dynamic sitemap:', error)
    return coreEntries
  }
}
