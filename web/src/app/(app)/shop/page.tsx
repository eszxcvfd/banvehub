import { ProductGridItem } from '@/components/ProductGridItem'
import {
  getProductStats,
  getSellerNames,
  sellerIdOf,
  sellerNamesByProduct,
} from '@/components/product/productStats'
import { ProductListItem } from '@/components/layout/search/ProductListItem'
import { ShopToolbar } from '@/components/layout/search/ShopToolbar'
import { ShopPagination } from '@/components/layout/search/ShopPagination'
import { mergeOpenGraph } from '@/utilities/mergeOpenGraph'
import configPromise from '@payload-config'
import type { Metadata } from 'next'
import { getPayload, type Payload, type Where } from 'payload'
import React from 'react'

type SearchParams = { [key: string]: string | string[] | undefined }

type Props = {
  searchParams: Promise<SearchParams>
}

const ALLOWED_SORTS: Record<string, string> = {
  price: 'price',
  '-price': '-price',
  createdAt: 'createdAt',
  '-createdAt': '-createdAt',
  title: 'title',
  '-title': '-title',
  // Backward compatibility aliases
  priceInUSD: 'price',
  '-priceInUSD': '-price',
}

async function getCategoryData(
  payload: Payload,
  param: string,
): Promise<{ id: number; title: string; slug: string; description?: string | null } | null> {
  const trimmed = param.trim()
  const isNumeric = /^\d+$/.test(trimmed) && Number(trimmed) <= 2147483647
  const result = await payload.find({
    collection: 'categories',
    where: isNumeric
      ? { or: [{ id: { equals: Number(trimmed) } }, { slug: { equals: trimmed } }] }
      : { slug: { equals: trimmed } },
    limit: 1,
    overrideAccess: true,
    select: { title: true, slug: true, description: true },
  })
  const doc = result.docs[0]
  if (!doc) return null
  return {
    id: doc.id,
    title: doc.title,
    slug: doc.slug,
    description: doc.description,
  }
}

async function getSoftwareTypeData(
  payload: Payload,
  param: string,
): Promise<{ id: number; title: string; slug: string } | null> {
  const trimmed = param.trim()
  const isNumeric = /^\d+$/.test(trimmed) && Number(trimmed) <= 2147483647
  const result = await payload.find({
    collection: 'software_types',
    where: isNumeric
      ? { or: [{ id: { equals: Number(trimmed) } }, { slug: { equals: trimmed } }] }
      : { slug: { equals: trimmed } },
    limit: 1,
    overrideAccess: true,
    select: { title: true, slug: true },
  })
  const doc = result.docs[0]
  if (!doc) return null
  return {
    id: doc.id,
    title: doc.title,
    slug: doc.slug,
  }
}

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const params = await searchParams
  const rawSearch = typeof params.q === 'string' ? params.q.trim() : ''
  const categoryParam = typeof params.category === 'string' ? params.category.trim() : ''
  const softwareParam =
    typeof params.softwareType === 'string'
      ? params.softwareType.trim()
      : typeof params.software === 'string'
        ? params.software.trim()
        : ''
  const isFreeParam = typeof params.isFree === 'string' ? params.isFree.trim().toLowerCase() : ''
  const priceTypeParam =
    typeof params.priceType === 'string' ? params.priceType.trim().toLowerCase() : ''

  const isFreeRequested = isFreeParam === 'true' || isFreeParam === '1' || priceTypeParam === 'free'
  const isPaidRequested = isFreeParam === 'false' || isFreeParam === '0' || priceTypeParam === 'paid'

  const payload = await getPayload({ config: configPromise })

  let categoryTitle: string | undefined
  let categoryDesc: string | undefined
  if (categoryParam) {
    const cat = await getCategoryData(payload, categoryParam)
    if (cat) {
      categoryTitle = cat.title
      categoryDesc = cat.description || undefined
    }
  }

  let softwareTitle: string | undefined
  if (softwareParam) {
    const sw = await getSoftwareTypeData(payload, softwareParam.split(',')[0])
    if (sw) {
      softwareTitle = sw.title
    }
  }

  let title = 'Thư viện tài nguyên kỹ thuật & bản vẽ'
  let description =
    'Khám phá kho bản vẽ CAD, mô hình 3D kiến trúc, BIM, kết cấu và MEP chất lượng cao trên KienTaoHub.'

  if (rawSearch) {
    if (categoryTitle && softwareTitle) {
      title = `Tìm kiếm "${rawSearch}" - ${categoryTitle} (${softwareTitle})`
    } else if (categoryTitle) {
      title = `Tìm kiếm "${rawSearch}" trong ${categoryTitle}`
    } else if (softwareTitle) {
      title = `Tìm kiếm "${rawSearch}" cho ${softwareTitle}`
    } else {
      title = `Tìm kiếm: "${rawSearch}"`
    }
    description = `Kết quả tìm kiếm cho từ khóa "${rawSearch}" trong danh mục tài nguyên thiết kế KienTaoHub.`
  } else if (categoryTitle && softwareTitle) {
    title = `${categoryTitle} cho ${softwareTitle}`
    description = `Bộ sưu tập tài nguyên ${categoryTitle} tối ưu cho ${softwareTitle}. ${categoryDesc || ''}`.trim()
  } else if (categoryTitle) {
    title = `Tài nguyên ${categoryTitle}`
    description = categoryDesc || `Tổng hợp các bản vẽ, hồ sơ thiết kế và mô hình thuộc chuyên mục ${categoryTitle}.`
  } else if (softwareTitle) {
    title = `Tài nguyên ${softwareTitle}`
    description = `Danh mục các file bản vẽ, thư viện model và tài liệu kỹ thuật định dạng ${softwareTitle}.`
  }

  if (isFreeRequested) {
    title += ' (Miễn phí)'
  } else if (isPaidRequested) {
    title += ' (Có phí)'
  }

  const queryParts: string[] = []
  if (categoryParam) queryParts.push(`category=${encodeURIComponent(categoryParam)}`)
  if (softwareParam) queryParts.push(`softwareType=${encodeURIComponent(softwareParam)}`)
  if (isFreeParam) queryParts.push(`isFree=${encodeURIComponent(isFreeParam)}`)
  if (priceTypeParam && !isFreeParam) queryParts.push(`priceType=${encodeURIComponent(priceTypeParam)}`)
  if (rawSearch) queryParts.push(`q=${encodeURIComponent(rawSearch)}`)

  const canonicalUrl = queryParts.length > 0 ? `/shop?${queryParts.join('&')}` : '/shop'

  return {
    title,
    description,
    alternates: {
      canonical: canonicalUrl,
    },
    openGraph: mergeOpenGraph({
      title: `${title} | KienTaoHub`,
      description,
      url: canonicalUrl,
      siteName: 'KienTaoHub',
      locale: 'vi_VN',
      type: 'website',
    }),
    twitter: {
      card: 'summary_large_image',
      title: `${title} | KienTaoHub`,
      description,
    },
    robots: {
      index: true,
      follow: true,
    },
  }
}

export default async function ShopPage({ searchParams }: Props) {
  const params = await searchParams
  const rawSearch = typeof params.q === 'string' ? params.q.trim() : ''
  const rawSort = typeof params.sort === 'string' ? params.sort.trim() : ''
  const categoryParam = typeof params.category === 'string' ? params.category.trim() : ''
  const softwareParam =
    typeof params.softwareType === 'string'
      ? params.softwareType.trim()
      : typeof params.software === 'string'
        ? params.software.trim()
        : ''
  const isFreeParam = typeof params.isFree === 'string' ? params.isFree.trim().toLowerCase() : ''
  const priceTypeParam =
    typeof params.priceType === 'string' ? params.priceType.trim().toLowerCase() : ''
  const minPriceParam = typeof params.minPrice === 'string' ? parseInt(params.minPrice, 10) : undefined
  const maxPriceParam = typeof params.maxPrice === 'string' ? parseInt(params.maxPrice, 10) : undefined
  const page = typeof params.page === 'string' ? Math.max(1, parseInt(params.page, 10) || 1) : 1
  const limit = typeof params.limit === 'string' ? Math.max(1, parseInt(params.limit, 10) || 12) : 12
  const view = typeof params.view === 'string' && params.view === 'list' ? 'list' : 'grid'

  const payload = await getPayload({ config: configPromise })

  // 1. Category Resolution
  let categoryId: number | null | undefined = undefined
  if (categoryParam) {
    const cat = await getCategoryData(payload, categoryParam)
    categoryId = cat ? cat.id : null
  }

  // 2. Software Types Resolution (Supports comma-separated slugs)
  const softwareSlugs = softwareParam
    ? softwareParam.split(',').map((s) => s.trim()).filter(Boolean)
    : []
  const resolvedSoftwareIds: number[] = []
  let invalidSoftwareRequested = false

  if (softwareSlugs.length > 0) {
    for (const slug of softwareSlugs) {
      const sw = await getSoftwareTypeData(payload, slug)
      if (sw) {
        resolvedSoftwareIds.push(sw.id)
      } else if (softwareSlugs.length === 1) {
        invalidSoftwareRequested = true
      }
    }
  }

  // Safe Empty Guard
  if (categoryId === null || invalidSoftwareRequested) {
    return (
      <div>
        <ShopToolbar
          totalDocs={0}
          currentSort={rawSort || '-createdAt'}
          currentView={view}
          searchQuery={rawSearch}
        />
        <div className="py-12 text-center">
          {rawSearch ? (
            <p className="mb-4 text-base">
              There are no products that match <span className="font-bold">&quot;{rawSearch}&quot;</span>
            </p>
          ) : (
            <p className="mb-4 text-base">No products found. Please try different filters.</p>
          )}
        </div>
      </div>
    )
  }

  // 3. Build compound WHERE clauses
  const andConditions: Where[] = [
    {
      _status: {
        equals: 'published',
      },
    },
  ]

  if (typeof categoryId === 'number') {
    andConditions.push({
      categories: {
        contains: categoryId,
      },
    })
  }

  if (resolvedSoftwareIds.length > 0) {
    if (resolvedSoftwareIds.length === 1) {
      andConditions.push({
        software_types: {
          contains: resolvedSoftwareIds[0],
        },
      })
    } else {
      andConditions.push({
        or: resolvedSoftwareIds.map((id) => ({
          software_types: {
            contains: id,
          },
        })),
      })
    }
  }

  const isFreeRequested = isFreeParam === 'true' || isFreeParam === '1' || priceTypeParam === 'free'
  const isPaidRequested = isFreeParam === 'false' || isFreeParam === '0' || priceTypeParam === 'paid'

  if (isFreeRequested) {
    andConditions.push({
      or: [{ isFree: { equals: true } }, { price: { equals: 0 } }],
    })
  } else if (isPaidRequested) {
    andConditions.push({
      and: [{ isFree: { equals: false } }, { price: { greater_than: 0 } }],
    })
  }

  if (typeof minPriceParam === 'number' && !isNaN(minPriceParam) && minPriceParam > 0) {
    andConditions.push({
      price: {
        greater_than_equal: minPriceParam,
      },
    })
  }

  if (typeof maxPriceParam === 'number' && !isNaN(maxPriceParam) && maxPriceParam < 2000000) {
    andConditions.push({
      price: {
        less_than_equal: maxPriceParam,
      },
    })
  }

  // 4. Keyword Search
  if (rawSearch) {
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

    andConditions.push({
      or: searchOr,
    })
  }

  // 5. Sorting
  const sort = (rawSort && ALLOWED_SORTS[rawSort]) || '-createdAt'

  // 6. Query Products with Pagination
  const products = await payload.find({
    collection: 'products',
    draft: false,
    overrideAccess: false,
    page,
    limit,
    select: {
      title: true,
      slug: true,
      gallery: true,
      previewGallery: true,
      categories: true,
      software_types: true,
      tags: true,
      price: true,
      isFree: true,
      seller: true,
      technicalSpecs: true,
      createdAt: true,
    },
    sort,
    where: {
      and: andConditions,
    },
  })

  // Real aggregates per card (downloads from `download_events`, ratings from `reviews`) and the
  // seller's own display name — the shop page must show each product's record, not a shared constant.
  const gridStats = await getProductStats(products.docs.map((product) => product.id))
  const gridSellerNames = sellerNamesByProduct(
    products.docs,
    await getSellerNames(products.docs.map((product) => sellerIdOf(product.seller))),
  )

  const resultsText = products.docs.length > 1 ? 'results' : 'result'

  return (
    <div>
      {/* Top Toolbar */}
      <ShopToolbar
        totalDocs={products.totalDocs}
        currentSort={rawSort || '-createdAt'}
        currentView={view}
        searchQuery={rawSearch}
      />

      {/* Search Header Text if rawSearch is active */}
      {rawSearch ? (
        <p className="mb-4 text-sm text-slate-600 dark:text-slate-400">
          {products.docs.length === 0
            ? 'There are no products that match '
            : `Showing ${products.docs.length} ${resultsText} for `}
          <span className="font-bold text-slate-900 dark:text-white">&quot;{rawSearch}&quot;</span>
        </p>
      ) : null}

      {/* Empty States */}
      {products.docs.length === 0 ? (
        <div className="py-12 text-center">
          {rawSearch ? (
            <p className="mb-4 text-base">
              There are no products that match <span className="font-bold">&quot;{rawSearch}&quot;</span>
            </p>
          ) : (
            <p className="mb-4 text-base">No products found. Please try different filters.</p>
          )}
        </div>
      ) : null}

      {/* Product Grid or List Presentation */}
      {products.docs.length > 0 && view === 'grid' ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-6">
          {products.docs.map((product) => (
            <ProductGridItem
              key={product.id}
              product={product}
              stats={gridStats[String(product.id)]}
              sellerName={gridSellerNames[String(product.id)] ?? null}
            />
          ))}
        </div>
      ) : null}

      {products.docs.length > 0 && view === 'list' ? (
        <div className="flex flex-col gap-4">
          {products.docs.map((product) => (
            <ProductListItem key={product.id} product={product} />
          ))}
        </div>
      ) : null}

      {/* Pagination */}
      <ShopPagination
        currentPage={products.page || page}
        pageSize={products.limit || limit}
        totalDocs={products.totalDocs}
      />
    </div>
  )
}
