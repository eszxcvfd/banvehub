'use client'

import type { Category, Product, SoftwareType } from '@/payload-types'
import { RichText } from '@/components/RichText'
import { DigitalProductCTA } from '@/components/product/DigitalProductCTA'
import { SellerAttribution } from '@/components/product/SellerAttribution'
import React from 'react'
import Link from 'next/link'
import { Star } from 'lucide-react'

export function ProductDescription({ product }: { product: Product }) {
  const isFree = Boolean(product.isFree)
  const price = product.price ?? 0

  const primaryCategory = (product.categories || []).find(
    (c): c is Category => typeof c === 'object' && c !== null,
  )
  const primarySoftware = (product.software_types || []).find(
    (s): s is SoftwareType => typeof s === 'object' && s !== null,
  )

  const sellerObj =
    typeof product.seller === 'object' && product.seller !== null
      ? product.seller
      : null

  const sellerId: number | string | null =
    sellerObj && sellerObj.id != null
      ? sellerObj.id
      : typeof product.seller === 'number' || typeof product.seller === 'string'
      ? product.seller
      : null

  return (
    <div className="flex flex-col gap-6">
      {/* Taxonomy Pills */}
      {(primaryCategory || primarySoftware) && (
        <div className="flex items-center gap-2 flex-wrap -mb-2">
          {primaryCategory && (
            <Link
              href={`/shop?category=${primaryCategory.slug}`}
              className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-semibold bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
            >
              {primaryCategory.title}
            </Link>
          )}
          {primarySoftware && (
            <Link
              href={`/shop?softwareType=${primarySoftware.slug}`}
              className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-semibold bg-secondary text-secondary-foreground hover:bg-secondary/80 transition-colors"
            >
              {primarySoftware.title}
            </Link>
          )}
        </div>
      )}

      {/* Title & Reviews Link */}
      <div className="space-y-2">
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
          {product.title}
        </h1>
        <a
          href="#reviews-section"
          className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary transition-colors cursor-pointer"
        >
          <div className="flex items-center gap-0.5 text-amber-500">
            <Star className="w-3.5 h-3.5 fill-amber-500" />
            <span className="font-semibold text-foreground text-xs ml-0.5">Đánh giá</span>
          </div>
          <span>• Xem nhận xét từ khách hàng</span>
        </a>
      </div>

      {/* Digital CTA Card */}
      <DigitalProductCTA
        productId={product.id}
        sellerId={sellerId}
        isFree={isFree}
        price={price}
        fileFormat={product.technicalSpecs?.fileFormat}
        fileSize={product.technicalSpecs?.fileSize}
        productTitle={product.title}
      />

      {/* Seller Attribution Block */}
      <SellerAttribution
        sellerName={sellerObj?.name || undefined}
      />

      {/* Asset Description */}
      {product.description ? (
        <div className="space-y-2 pt-2">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Mô tả chi tiết tài nguyên
          </h3>
          <RichText className="prose dark:prose-invert max-w-none text-sm leading-relaxed" data={product.description} enableGutter={false} />
        </div>
      ) : null}
    </div>
  )
}
