import type { Media, Product, ProductPreview } from '@/payload-types'

import { RenderBlocks } from '@/blocks/RenderBlocks'
import { GridTileImage } from '@/components/Grid/tile'
import { Gallery } from '@/components/product/Gallery'
import { ProductDescription } from '@/components/product/ProductDescription'
import { TechnicalSpecsTable } from '@/components/product/TechnicalSpecsTable'
import { ProductReviewsSection } from '@/components/product/ProductReviewsSection'
import { ProductCommentsSection } from '@/components/product/ProductCommentsSection'
import { ProductReportDialog } from '@/components/product/ProductReportDialog'
import { storefrontProductWhere } from '@/utilities/storefrontVisibility'
import configPromise from '@payload-config'
import { getPayload } from 'payload'
import { draftMode } from 'next/headers'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import React, { Suspense } from 'react'
import { Button } from '@/components/ui/button'
import { ChevronLeftIcon } from 'lucide-react'
import { Metadata } from 'next'

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
      <div className="container pt-8 pb-12">
        {/* Navigation back link */}
        <Button asChild variant="ghost" className="mb-6 hover:bg-muted">
          <Link href="/shop" className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground">
            <ChevronLeftIcon className="w-4 h-4" />
            All products
          </Link>
        </Button>

        {/* Hero Section: Gallery + Product Summary */}
        <div className="flex flex-col gap-10 rounded-2xl border p-6 sm:p-8 md:py-10 lg:flex-row lg:gap-10 bg-card text-card-foreground shadow-xs">
          <div className="h-full w-full basis-full lg:basis-1/2">
            <Suspense
              fallback={
                <div className="relative aspect-square h-full max-h-[550px] w-full overflow-hidden rounded-xl bg-muted/40 animate-pulse" />
              }
            >
              <Gallery
                previewGallery={product.previewGallery}
                gallery={product.gallery}
                fallbackImage={metaImage}
              />
            </Suspense>
          </div>

          <div className="basis-full lg:basis-1/2">
            <ProductDescription product={product} />
          </div>
        </div>

        {/* Detailed Technical Specifications Table */}
        <div className="mt-10">
          <TechnicalSpecsTable product={product} />
        </div>

        {/* Customer Reviews and Ratings Section (R3, FR-20, BR-05) */}
        <div className="mt-12">
          <ProductReviewsSection productId={product.id} productTitle={product.title} />
        </div>

        {/* Product Q&A and Comments Section (FR-21) */}
        <div className="mt-12">
          <ProductCommentsSection
            productId={product.id}
            productTitle={product.title}
            sellerId={typeof product.seller === 'object' && product.seller !== null ? product.seller.id : product.seller}
          />
        </div>

        {/* Product report entry point (FR-22) — creates a moderation case for the
            moderation team; it never changes the product's own state.
            Hidden in draft-preview mode: the report route only accepts products the
            storefront shows, so the control would lead to a guaranteed 404. The decision
            is made on the server from `draftMode().isEnabled` — never by hiding it in
            the client component. */}
        {isDraftPreview ? null : (
          <div className="mt-12">
            <ProductReportDialog productId={product.id} productTitle={product.title} />
          </div>
        )}
      </div>

      {product.layout?.length ? <RenderBlocks blocks={product.layout} /> : <></>}

      {relatedProducts.length ? (
        <div className="container pb-12">
          <RelatedProducts products={relatedProducts as Product[]} />
        </div>
      ) : (
        <></>
      )}
    </React.Fragment>
  )
}

function RelatedProducts({ products }: { products: Product[] }) {
  if (!products.length) return null

  return (
    <div className="py-8 border-t">
      <h2 className="mb-6 text-2xl font-bold tracking-tight">Tài nguyên kỹ thuật liên quan</h2>
      <ul className="flex w-full gap-4 overflow-x-auto pt-1 pb-2">
        {products.map((product) => (
          <li
            className="aspect-square w-full flex-none min-[475px]:w-1/2 sm:w-1/3 md:w-1/4 lg:w-1/5"
            key={product.id}
          >
            <Link className="relative h-full w-full block group" href={`/products/${product.slug}`}>
              <GridTileImage
                label={{
                  amount: product.price ?? 0,
                  title: product.title,
                }}
                media={product.meta?.image as Media}
              />
            </Link>
          </li>
        ))}
      </ul>
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
