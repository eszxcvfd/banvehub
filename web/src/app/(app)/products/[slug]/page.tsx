import type { Media, Product, ProductPreview } from '@/payload-types'

import { RenderBlocks } from '@/blocks/RenderBlocks'
import { GridTileImage } from '@/components/Grid/tile'
import { Gallery } from '@/components/product/Gallery'
import { ProductDescription } from '@/components/product/ProductDescription'
import { ProductDetailTabs } from '@/components/product/ProductDetailTabs'
import { ProductReviewsSection } from '@/components/product/ProductReviewsSection'
import { ProductCommentsSection } from '@/components/product/ProductCommentsSection'
import { ProductReportDialog } from '@/components/product/ProductReportDialog'
import { ProductStickyBar } from '@/components/product/ProductStickyBar'
import { storefrontProductWhere } from '@/utilities/storefrontVisibility'
import configPromise from '@payload-config'
import { getPayload } from 'payload'
import { draftMode } from 'next/headers'
import Link from 'next/link'
import Image from 'next/image'
import { notFound } from 'next/navigation'
import React, { Suspense } from 'react'
import { Metadata } from 'next'
import { ChevronRight, ArrowRight, Star, ShoppingCart } from 'lucide-react'
import type { Category } from '@/payload-types'

type Args = {
  params: Promise<{
    slug: string
  }>
}

export async function generateMetadata({ params }: Args): Promise<Metadata> {
  const { slug } = await params
  const { isEnabled: isDraftPreview } = await draftMode()
  const product = await queryProductBySlug({ slug, isDraftPreview })

  if (!product) return notFound()

  // 1. Image resolution cascade:
  // Tier 1: SEO meta image
  // Tier 2: First watermarked/public preview image in previewGallery
  // Tier 3: First direct gallery image
  const metaImage =
    typeof product.meta?.image === 'object' && product.meta?.image !== null
      ? (product.meta.image as Media)
      : undefined

  let previewImage: Media | undefined
  if (Array.isArray(product.previewGallery)) {
    for (const item of product.previewGallery) {
      if (typeof item === 'object' && item !== null) {
        const previewDoc = item as ProductPreview
        if (typeof previewDoc.previewImage === 'object' && previewDoc.previewImage !== null) {
          previewImage = previewDoc.previewImage as Media
          break
        }
      }
    }
  }

  let galleryImage: Media | undefined
  if (Array.isArray(product.gallery)) {
    for (const item of product.gallery) {
      if (typeof item?.image === 'object' && item.image !== null) {
        galleryImage = item.image as Media
        break
      }
    }
  }

  const seoImage = metaImage || previewImage || galleryImage
  const canIndex = product._status === 'published'

  const title = product.meta?.title || product.title
  const description =
    product.meta?.description ||
    `Tải bản vẽ & mô hình 3D ${product.title} định dạng kỹ thuật số chất lượng cao tại KienTaoHub.`

  const ogImages = seoImage?.url
    ? [
        {
          alt: seoImage.alt || title,
          height: seoImage.height ?? 630,
          url: seoImage.url,
          width: seoImage.width ?? 1200,
        },
      ]
    : undefined

  return {
    title,
    description,
    alternates: {
      canonical: `/products/${slug}`,
    },
    openGraph: {
      type: 'article',
      title: `${title} | KienTaoHub`,
      description,
      url: `/products/${slug}`,
      siteName: 'KienTaoHub',
      locale: 'vi_VN',
      publishedTime: product.createdAt,
      modifiedTime: product.updatedAt,
      images: ogImages,
    },
    twitter: {
      card: 'summary_large_image',
      title: `${title} | KienTaoHub`,
      description,
      images: ogImages ? ogImages.map((img) => img.url) : undefined,
    },
    robots: {
      follow: canIndex,
      index: canIndex,
      googleBot: {
        follow: canIndex,
        index: canIndex,
      },
    },
  }
}

export default async function ProductPage({ params }: Args) {
  const { slug } = await params
  // Draft-preview mode is decided on the SERVER and drives both the catalog query and
  // whether the report entry point is rendered at all (see the report section below).
  const { isEnabled: isDraftPreview } = await draftMode()
  const product = await queryProductBySlug({ slug, isDraftPreview })

  if (!product) return notFound()

  // What this product's page may state about it: real review rows, real download events, real comments
  // and the seller's own profile. Anything absent is omitted by the components rather than invented.
  const pagePayload = await getPayload({ config: configPromise })
  const [reviewRows, downloadRows, commentRows] = await Promise.all([
    pagePayload.find({
      collection: 'reviews',
      where: { and: [{ product: { equals: product.id } }, { status: { equals: 'published' } }] },
      limit: 1000,
      pagination: false,
      depth: 0,
      overrideAccess: true,
    }),
    pagePayload.find({
      collection: 'download_events',
      where: { and: [{ product: { equals: product.id } }, { status: { equals: 'SUCCESS' } }] },
      limit: 1000,
      pagination: false,
      depth: 0,
      overrideAccess: true,
    }),
    pagePayload.find({
      collection: 'comments',
      where: { product: { equals: product.id } },
      limit: 1000,
      pagination: false,
      depth: 0,
      overrideAccess: true,
    }),
  ])

  const downloadCount = downloadRows.totalDocs
  const commentCount = commentRows.totalDocs
  const reviewSummary =
    reviewRows.totalDocs > 0
      ? {
          totalCount: reviewRows.totalDocs,
          averageRating:
            reviewRows.docs.reduce(
              (sum: number, row) => sum + Number((row as { rating?: number }).rating ?? 0),
              0,
            ) /
            reviewRows.totalDocs,
        }
      : null

  const sellerUserId =
    typeof product.seller === 'object' && product.seller !== null
      ? Number(product.seller.id)
      : Number(product.seller ?? 0)
  const sellerProfileRow = Number.isInteger(sellerUserId) && sellerUserId > 0
    ? (
        await pagePayload.find({
          collection: 'seller_profiles',
          where: { user: { equals: sellerUserId } },
          limit: 1,
          depth: 0,
          overrideAccess: true,
        })
      ).docs[0]
    : undefined
  const sellerProfile = sellerProfileRow
    ? {
        displayName: (sellerProfileRow as { displayName?: string }).displayName ?? null,
        bio: (sellerProfileRow as { bio?: string }).bio ?? null,
      }
    : null

  const metaImage = typeof product.meta?.image === 'object' ? (product.meta?.image as Media) : undefined
  const price = product.price ?? 0

  const productJsonLd = {
    name: product.title,
    '@context': 'https://schema.org',
    '@type': 'Product',
    description: product.meta?.description || product.title,
    image: metaImage?.url,
    offers: {
      '@type': 'Offer',
      availability: 'https://schema.org/InStock',
      price: price,
      priceCurrency: 'VND',
    },
  }

  const primaryCategory = (product.categories || []).find(
    (c): c is Category => typeof c === 'object' && c !== null,
  )

  const relatedProducts =
    product.relatedProducts?.filter((relatedProduct) => typeof relatedProduct === 'object') ?? []

  return (
    <React.Fragment>
      <script
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(productJsonLd).replace(/</g, '\\u003c'),
        }}
        type="application/ld+json"
      />
      <div className="container pt-6 pb-12">
        {/* Breadcrumb Navigation matching Mockup */}
        <nav aria-label="Breadcrumb" className="mb-6 flex items-center gap-2 text-xs sm:text-sm text-slate-500 dark:text-slate-400 flex-wrap">
          <Link href="/" className="hover:text-[#1677ff] transition-colors">
            Trang chủ
          </Link>
          <ChevronRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />
          {primaryCategory ? (
            <>
              <Link href={`/shop?category=${primaryCategory.slug}`} className="hover:text-[#1677ff] transition-colors">
                {primaryCategory.title}
              </Link>
              <ChevronRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            </>
          ) : (
            <>
              <Link href="/shop" className="hover:text-[#1677ff] transition-colors">
                Bản vẽ kiến trúc
              </Link>
              <ChevronRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            </>
          )}
          <span className="text-slate-800 dark:text-slate-200 font-medium truncate max-w-sm sm:max-w-md">
            {product.title}
          </span>
          <span className="sr-only">
            <Link href="/shop">All products</Link>
          </span>
        </nav>

        {/* Hero Section: Gallery (Left) + Product Summary & CTA (Right) */}
        <div className="flex flex-col gap-8 rounded-2xl border border-slate-200/90 dark:border-slate-800 p-6 sm:p-8 lg:flex-row lg:gap-10 bg-white dark:bg-slate-900 shadow-xs mb-10">
          <div className="w-full basis-full lg:basis-1/2">
            <Suspense
              fallback={
                <div className="relative aspect-[4/3] w-full overflow-hidden rounded-2xl bg-muted/40 animate-pulse" />
              }
            >
              <Gallery
                previewGallery={product.previewGallery}
                gallery={product.gallery}
                fallbackImage={metaImage}
                curatedFallback={true}
              />
            </Suspense>
          </div>

          <div className="basis-full lg:basis-1/2">
            <ProductDescription
              product={product}
              reviewSummary={reviewSummary}
              downloadCount={downloadCount}
              sellerProfile={sellerProfile}
            />
          </div>
        </div>

        {/* Technical Specs & Resource Content Tabs */}
        <div className="mb-10">
          <ProductDetailTabs
            product={product}
            reviewCount={reviewSummary?.totalCount ?? 0}
            commentCount={commentCount}
          />
        </div>

        {/* Customer Reviews and Ratings Section (R3, FR-20, BR-05) */}
        <div className="mb-10">
          <ProductReviewsSection productId={product.id} productTitle={product.title} />
        </div>

        {/* Product Q&A and Comments Section (FR-21) */}
        <div className="mb-10">
          <ProductCommentsSection
            productId={product.id}
            productTitle={product.title}
            sellerId={typeof product.seller === 'object' && product.seller !== null ? product.seller.id : product.seller}
          />
        </div>

        {/* Product report entry point (FR-22) — MUST be preserved with isDraftPreview server gate */}
        {isDraftPreview ? null : (
          <div className="mb-10">
            <ProductReportDialog productId={product.id} productTitle={product.title} />
          </div>
        )}
      </div>

      {product.layout?.length ? <RenderBlocks blocks={product.layout} /> : <></>}

      {/* Related Products Section ("Có thể bạn cũng thích") */}
      <div className="container pb-14">
        <RelatedProducts products={relatedProducts as Product[]} />
      </div>

      <ProductStickyBar
        productTitle={product.title}
        price={price}
        isFree={product.isFree}
        fileFormat={product.technicalSpecs?.fileFormat}
      />
    </React.Fragment>
  )
}

function RelatedProducts({ products }: { products: Product[] }) {
  // Only the records this product really relates to: padding the list with curated cards would link to
  // slugs that do not exist and print their invented prices under them.
  const itemsToShow = products.slice(0, 5)

  if (itemsToShow.length === 0) return null

  return (
    <div className="pt-8 border-t border-slate-200 dark:border-slate-800">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
          Có thể bạn cũng thích
        </h2>
        <Link
          href="/shop"
          className="text-xs sm:text-sm font-semibold text-[#1677ff] hover:text-[#4096ff] inline-flex items-center gap-1 transition-colors"
        >
          <span>Xem tất cả</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </Link>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4 sm:gap-5">
        {itemsToShow.map((item, index) => {
          const slug = item.slug
          const title = item.title
          const price = item.price ?? 0
          const badge = item.technicalSpecs?.fileFormat
            ? String(item.technicalSpecs.fileFormat).split(/[,/]/)[0].trim()
            : 'Tài nguyên'
          const badgeColor = 'bg-blue-50 text-[#1677ff] border-blue-200'

          let imageSrc: string | null = null
          const media = item.meta?.image
          if (typeof media === 'object' && media !== null && media.url) {
            imageSrc = media.url
          }
          const galleryImage = item.gallery?.[0]?.image
          if (!imageSrc && typeof galleryImage === 'object' && galleryImage !== null && galleryImage.url) {
            imageSrc = galleryImage.url
          }

          return (
            <div
              key={item.id || index}
              className="group flex flex-col justify-between rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3 shadow-xs hover:shadow-md transition-all"
            >
              <div>
                {/* Thumbnail container */}
                <div className="relative aspect-[4/3] w-full rounded-lg overflow-hidden bg-slate-100 dark:bg-slate-800 mb-2.5">
                  {/* Badge */}
                  <div className="absolute top-2 left-2 z-10">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold border shadow-xs ${badgeColor}`}>
                      {badge}
                    </span>
                  </div>

                  <Link href={`/products/${slug}`} className="block w-full h-full">
                    <Image
                      src={imageSrc || '/media/curated/bestseller-1-villa.jpg'}
                      alt={title}
                      fill
                      className="object-cover group-hover:scale-105 transition-transform duration-300"
                      sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 20vw"
                    />
                  </Link>
                </div>

                {/* Title */}
                <Link href={`/products/${slug}`} className="block">
                  <h3 className="font-semibold text-xs sm:text-sm text-slate-900 dark:text-white line-clamp-1 group-hover:text-[#1677ff] transition-colors">
                    {title}
                  </h3>
                </Link>

                {/* Rating */}
                <div className="flex items-center gap-1 text-xs text-slate-500 mt-1.5">
                  <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                  {/* no rating element: this schema stores no product rating */}
                  <span className="text-slate-400 text-[11px]">{badge}</span>
                </div>
              </div>

              {/* Price & Action */}
              <div className="mt-3 pt-2.5 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2">
                <span className="font-bold text-xs sm:text-sm text-slate-900 dark:text-white">
                  {price.toLocaleString('vi-VN')}đ
                </span>
                <Link href={`/products/${slug}`}>
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-semibold bg-slate-900 hover:bg-slate-800 text-white dark:bg-[#1677ff] dark:hover:bg-[#4096ff] transition-colors"
                  >
                    <ShoppingCart className="w-3 h-3" />
                    <span>Tải về</span>
                  </button>
                </Link>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

/**
 * Load a product for the storefront detail page (and its metadata).
 *
 * The visibility clause comes from `@/utilities/storefrontVisibility`, the single owner
 * of the rule the report route also uses; here it is applied with the page's own
 * draft-preview flag, so staff previews keep showing unpublished products while ordinary
 * visitors (and the report route) do not.
 */
const queryProductBySlug = async ({
  slug,
  isDraftPreview = false,
}: {
  slug: string
  isDraftPreview?: boolean
}) => {
  const payload = await getPayload({ config: configPromise })

  const result = await payload.find({
    collection: 'products',
    depth: 3,
    draft: isDraftPreview,
    limit: 1,
    overrideAccess: isDraftPreview,
    pagination: false,
    where: storefrontProductWhere({ slug }, { draftMode: isDraftPreview }),
  })

  return result.docs?.[0] || null
}
