import { Grid } from '@/components/Grid'
import { ProductGridItem } from '@/components/ProductGridItem'
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
    const sw = await getSoftwareTypeData(payload, softwareParam)
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

  const payload = await getPayload({ config: configPromise })

  // Resolve category if specified
  let categoryId: number | null | undefined = undefined
  if (categoryParam) {
    const cat = await getCategoryData(payload, categoryParam)
    categoryId = cat ? cat.id : null
  }

  // Resolve software type if specified
  let softwareTypeId: number | null | undefined = undefined
  if (softwareParam) {
    const sw = await getSoftwareTypeData(payload, softwareParam)
    softwareTypeId = sw ? sw.id : null
  }

  // If a non-existent category or software was requested, safely render empty state
  if (categoryId === null || softwareTypeId === null) {
    return (
      <div>
        {rawSearch ? (
          <p className="mb-4">
            There are no products that match <span className="font-bold">&quot;{rawSearch}&quot;</span>
          </p>
        ) : (
          <p className="mb-4">No products found. Please try different filters.</p>
        )}
      </div>
    )
  }

  // Build compound WHERE clauses
  const andConditions: Where[] = [
    {
      _status: {
        equals: 'published',
      },
    },
  ]

  // Category filter
  if (typeof categoryId === 'number') {
    andConditions.push({
      categories: {
        contains: categoryId,
      },
    })
  }

  // Software type filter
  if (typeof softwareTypeId === 'number') {
    andConditions.push({
      software_types: {
        contains: softwareTypeId,
      },
    })
  }

  // Free vs Paid filter
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

  // Keyword search condition
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

  // Safe sort
  const sort = (rawSort && ALLOWED_SORTS[rawSort]) || 'title'

  const products = await payload.find({
    collection: 'products',
    draft: false,
    overrideAccess: false,
    select: {
      title: true,
      slug: true,
      gallery: true,
      previewGallery: true,
      categories: true,
      software_types: true,
      price: true,
      isFree: true,
    },
    sort,
    where: {
      and: andConditions,
    },
  })

  const resultsText = products.docs.length > 1 ? 'results' : 'result'

  return (
    <div>
      {rawSearch ? (
        <p className="mb-4">
          {products.docs?.length === 0
            ? 'There are no products that match '
            : `Showing ${products.docs.length} ${resultsText} for `}
          <span className="font-bold">&quot;{rawSearch}&quot;</span>
        </p>
      ) : null}

      {!rawSearch && products.docs?.length === 0 && (
        <p className="mb-4">No products found. Please try different filters.</p>
      )}

      {products?.docs.length > 0 ? (
        <Grid className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {products.docs.map((product) => {
            return <ProductGridItem key={product.id} product={product} />
          })}
        </Grid>
      ) : null}
    </div>
  )
}
