'use client'

import type { Category, Product, SoftwareType } from '@/payload-types'
import { RichText } from '@/components/RichText'
import { DigitalProductCTA } from '@/components/product/DigitalProductCTA'
import { SellerAttribution } from '@/components/product/SellerAttribution'
import React from 'react'
import Link from 'next/link'
import {
  StarFilled,
  DownloadOutlined,
  HddOutlined,
  FileTextOutlined,
  DesktopOutlined,
  SafetyCertificateFilled,
} from '@ant-design/icons'

export function ProductDescription({
  product,
  reviewSummary,
  downloadCount,
  sellerProfile,
}: {
  product: Product
  /** Real review aggregate (reviews with status 'published'); absent/empty renders no rating. */
  reviewSummary?: { averageRating?: number | null; totalCount?: number | null } | null
  /** Real count of `download_events` rows with status SUCCESS for this product. */
  downloadCount?: number | null
  /** The seller's own record (`seller_profiles`), so the page shows their real name and bio. */
  sellerProfile?: { displayName?: string | null; bio?: string | null } | null
}) {
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
    <div className="flex flex-col gap-5">
      {/* Top Badges Row */}
      <div className="flex items-center gap-2 flex-wrap">
        {primarySoftware ? (
          <Link
            href={`/shop?softwareType=${primarySoftware.slug}`}
            aria-label={primarySoftware.title}
            className="inline-flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-semibold bg-blue-50 text-[#1677ff] border border-blue-200 dark:bg-blue-950/40 dark:border-blue-800 hover:opacity-80 transition-opacity"
          >
            <DesktopOutlined className="text-[11px]" aria-hidden="true" />
            <span>{primarySoftware.title}</span>
          </Link>
        ) : (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-semibold bg-blue-50 text-[#1677ff] border border-blue-200 dark:bg-blue-950/40 dark:border-blue-800">
            <DesktopOutlined className="text-[11px]" aria-hidden="true" />
            <span>Revit</span>
          </span>
        )}

        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-semibold bg-emerald-50 text-emerald-600 border border-emerald-200 dark:bg-emerald-950/40 dark:border-emerald-800">
          <SafetyCertificateFilled className="text-[11px] text-emerald-500" aria-hidden="true" />
          <span>Bản quyền</span>
        </span>

        {primaryCategory && (
          <Link
            href={`/shop?category=${primaryCategory.slug}`}
            aria-label={primaryCategory.title}
            className="inline-flex items-center px-3 py-1 rounded-md text-xs font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 transition-colors"
          >
            {primaryCategory.title}
          </Link>
        )}
      </div>

      {/* Title H1 */}
      <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-white leading-snug">
        {product.title}
      </h1>

      {/* Summary Description: the record's own meta.description, or nothing */}
      {product.meta?.description && (
        <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed -mt-1">
          {product.meta.description}
        </p>
      )}

      {/* Technical Specs & Stats Row: every figure is the record's own, or absent */}
      <div className="flex items-center gap-3 sm:gap-4 flex-wrap text-xs text-slate-600 dark:text-slate-400 py-2 border-y border-slate-100 dark:border-slate-800/80 -mt-1">
        {Number(reviewSummary?.totalCount || 0) > 0 && (
          <>
            <a
              href="#reviews-section"
              className="inline-flex items-center gap-1 hover:text-[#1677ff] transition-colors"
            >
              <StarFilled className="text-amber-400 text-sm" />
              <span className="font-bold text-slate-900 dark:text-white">
                {Number(reviewSummary?.averageRating || 0).toFixed(1)}
              </span>
              <span className="text-slate-500">({reviewSummary?.totalCount} đánh giá)</span>
            </a>

            <span className="text-slate-300 dark:text-slate-700">|</span>
          </>
        )}

        {Number(downloadCount || 0) > 0 && (
          <>
            <div className="inline-flex items-center gap-1">
              <DownloadOutlined className="text-slate-400 text-xs" />
              <span>{downloadCount} lượt tải</span>
            </div>

            <span className="text-slate-300 dark:text-slate-700">|</span>
          </>
        )}

        {product.technicalSpecs?.fileSize && (
          <>
            <div className="inline-flex items-center gap-1 font-mono">
              <HddOutlined className="text-slate-400 text-xs" />
              <span>{product.technicalSpecs.fileSize}</span>
            </div>

            <span className="text-slate-300 dark:text-slate-700">|</span>
          </>
        )}

        {product.technicalSpecs?.softwareVersion && (
          <div className="inline-flex items-center gap-1">
            <FileTextOutlined className="text-slate-400 text-xs" />
            <span>{product.technicalSpecs.softwareVersion}</span>
          </div>
        )}

        <a
          href="#comments-section"
          className="inline-flex items-center gap-1 text-[#1677ff] hover:underline ml-auto"
        >
          <span>Hỏi đáp & Bình luận</span>
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

      {/* Seller Attribution Block: the seller's own record, and no block when there is none */}
      {(sellerProfile?.displayName || sellerObj?.name) && (
        <SellerAttribution
          sellerName={String(sellerProfile?.displayName || sellerObj?.name || '')}
          sellerBio={sellerProfile?.bio ? String(sellerProfile.bio) : null}
        />
      )}

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
