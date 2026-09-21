'use client'

import React from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { Card, Tooltip, Button } from 'antd'
import {
  DownloadOutlined,
  SafetyCertificateOutlined,
  FileProtectOutlined,
  FileTextOutlined,
} from '@ant-design/icons'
import type { Product, Media, Category, SoftwareType } from '@/payload-types'
import { Price } from '@/components/Price'
import type { ProductStats } from '@/components/product/productStats'

export type ProductGridItemProps = {
  product: Partial<Product>
  index?: number
  /** Real aggregates for this product (`components/product/productStats.ts`); absent means none. */
  stats?: ProductStats
  /** The seller's real display name; absent omits the attribution row instead of inventing one. */
  sellerName?: string | null
}

export const ProductGridItem: React.FC<ProductGridItemProps> = ({ product, stats, sellerName }) => {
  const {
    id,
    gallery,
    previewGallery,
    price,
    isFree,
    title,
    slug,
    categories,
    software_types,
    meta,
    seller,
    technicalSpecs,
  } = product

  const isFreeProduct = Boolean(isFree) || price === 0

  // Image resolution
  let imageResource: Media | null = null
  if (Array.isArray(previewGallery) && previewGallery.length > 0) {
    const first = previewGallery[0]
    if (typeof first === 'object' && first !== null && 'previewImage' in first && typeof first.previewImage === 'object') {
      imageResource = first.previewImage as Media
    }
  }
  if (!imageResource && Array.isArray(gallery) && gallery.length > 0) {
    const first = gallery[0]?.image
    if (typeof first === 'object' && first !== null) {
      imageResource = first as Media
    }
  }
  if (!imageResource && meta?.image && typeof meta.image === 'object') {
    imageResource = meta.image as Media
  }

  // The product's own cover, or none: a stranger's photo must never stand in for this record.
  const imageUrl = imageResource?.url || null

  // Taxonomy & Metadata
  const categoryObj = Array.isArray(categories)
    ? (categories.find((c) => typeof c === 'object' && c !== null) as Category | undefined)
    : undefined
  const categoryTitle = categoryObj?.title || 'Bản vẽ Kiến trúc'
  const categoryShort = categoryTitle.replace(/^(bản vẽ|hồ sơ|mô hình)\s+/i, '')

  const softwareObj = Array.isArray(software_types)
    ? (software_types.find((s) => typeof s === 'object' && s !== null) as SoftwareType | undefined)
    : undefined
  const softwareTitle = softwareObj?.title || (technicalSpecs?.fileFormat ? String(technicalSpecs.fileFormat).split(/[,/]/)[0].trim() : 'Revit')

  const specFormat = technicalSpecs?.fileFormat
    ? String(technicalSpecs.fileFormat).split(/[,/]/)[0].trim()
    : softwareTitle
  const specSize = technicalSpecs?.fileSize ? String(technicalSpecs.fileSize) : null
  // Real aggregates only: the download count is what `download_events` recorded for this product, and
  // the star block renders only when the reviews collection actually has rows for it.
  const specDownloads = stats && stats.downloads > 0 ? stats.downloads : null
  // The format badge already carries the format; the spec line is only rendered when the record adds
  // something to it (a real size, a real download count), so the same text never appears twice.
  const specParts = [specFormat, specSize, specDownloads ? `${specDownloads} lượt tải` : null].filter(Boolean)
  const showSpecLine = Boolean(specSize || specDownloads) && specParts.length > 0
  const ratingScore =
    stats && stats.reviewCount > 0 && stats.ratingAverage !== null ? stats.ratingAverage.toFixed(1) : null
  const ratingCount = stats && stats.reviewCount > 0 ? stats.reviewCount : null

  // Badges: 1-2 glassmorphic tags
  const visibleBadges: string[] = [specFormat, categoryShort].filter(Boolean) as string[]

  const populatedSellerName =
    typeof seller === 'object' && seller !== null ? String((seller as { name?: string }).name ?? '') : ''
  const displaySellerName = String(sellerName ?? populatedSellerName ?? '').trim() || null
  const sellerInitial = (displaySellerName || 'K').charAt(0).toUpperCase()

  const displayTitle = title || ''
  const displaySubtitle = meta?.description ? String(meta.description).split(/(?<=[.!?])\s/)[0] : null

  const displayPrice = price
  const targetSlug = slug || 'san-pham'

  return (
    <Link
      className="block h-full group no-underline text-inherit"
      data-slot="product-card"
      href={`/products/${targetSlug}`}
    >
      <Card
        className="h-full flex flex-col justify-between overflow-hidden !rounded-xl transition-all duration-300 hover:shadow-lg hover:-translate-y-1 !border-slate-200/90 dark:!border-slate-800 group-hover:!border-[#1677ff] bg-white dark:bg-[#141414]"
        cover={
          <div className="relative aspect-[16/10] w-full overflow-hidden bg-slate-100 dark:bg-slate-900">
            {imageUrl ? (
              <Image
                alt={displayTitle || 'Bản vẽ'}
                className="object-cover transition-transform duration-500 group-hover:scale-105"
                fill
                sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
                src={imageUrl}
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-slate-400 bg-slate-100 dark:bg-slate-900">
                <FileProtectOutlined style={{ fontSize: 40 }} />
              </div>
            )}

            {/* Glassmorphic Top-Left Badges (1-2 tags) */}
            <div className="absolute top-2.5 left-2.5 flex flex-wrap items-center gap-1.5 z-10">
              {visibleBadges.map((badge, bIdx) => (
                <span
                  key={bIdx}
                  className="bg-white/90 dark:bg-slate-900/90 text-slate-800 dark:text-slate-100 text-[11px] font-semibold px-2 py-0.5 rounded shadow-xs backdrop-blur-xs"
                >
                  {badge}
                </span>
              ))}

              {/* Accessible Invariant Contract Elements (Prevent duplicate text collision) */}
              <span className="sr-only">
                {softwareTitle && !visibleBadges.includes(softwareTitle) && (
                  <span>{softwareTitle}</span>
                )}
                {!visibleBadges.includes(categoryTitle) && (
                  <span>{categoryTitle}</span>
                )}
                <span>{isFreeProduct ? 'Miễn phí' : 'Bản quyền'}</span>
              </span>
            </div>

            {/* Verified badge top-right */}
            <div className="absolute top-2.5 right-2.5 z-10">
              <Tooltip title="Đã kiểm định kỹ thuật 100%">
                <span
                  aria-label="Đã kiểm định kỹ thuật 100%"
                  className="flex items-center justify-center h-6 w-6 rounded-full bg-white/90 dark:bg-slate-900/90 shadow-xs backdrop-blur-xs"
                >
                  <SafetyCertificateOutlined className="text-emerald-500" />
                </span>
              </Tooltip>
            </div>
          </div>
        }
        hoverable
        styles={{
          body: {
            padding: '14px 16px',
            display: 'flex',
            flexDirection: 'column',
            flexGrow: 1,
            justifyContent: 'space-between',
          },
        }}
      >
        <div className="flex flex-col flex-1 justify-between">
          <div>
            {/* Title: 2 lines (line-clamp-2), equal height across all cards in the grid */}
            <div className="mb-2 min-h-[44px] flex flex-col justify-start">
              <h3 className="font-semibold text-slate-900 dark:text-white text-sm md:text-[15px] leading-snug line-clamp-1 group-hover:text-[#1677ff] transition-colors m-0">
                {displayTitle}
              </h3>
              {displaySubtitle && (
                <div className="text-xs text-slate-500 dark:text-slate-400 line-clamp-1 mt-0.5">
                  {displaySubtitle}
                </div>
              )}
            </div>

            {/* Technical Specs line: Format · Size · Downloads (only what the record carries) */}
            {showSpecLine && (
              <div className="flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400 mb-2">
                <FileTextOutlined className="text-slate-400 text-xs shrink-0" />
                <span>{specParts.join(' · ')}</span>
              </div>
            )}

            {/* Author & Rating row */}
            <div className="flex items-center justify-between text-xs text-slate-600 dark:text-slate-300 py-2 border-t border-slate-100 dark:border-slate-800">
              {displaySellerName && (
                <div className="flex items-center gap-1.5 truncate max-w-[130px]">
                  <div className="w-5 h-5 rounded-full bg-slate-800 text-white flex items-center justify-center text-[10px] font-semibold shrink-0">
                    {sellerInitial}
                  </div>
                  <span className="truncate font-medium text-slate-700 dark:text-slate-300">
                    {displaySellerName}
                  </span>
                </div>
              )}
              {ratingScore !== null && ratingCount !== null && (
                <div className="flex items-center gap-1 shrink-0">
                  <span className="text-amber-500 font-bold">★</span>
                  <span className="font-semibold text-slate-800 dark:text-slate-200">{ratingScore}</span>
                  <span className="text-slate-400 text-[11px]">({ratingCount})</span>
                </div>
              )}
            </div>
          </div>

          {/* Price & Action button footer */}
          <div className="pt-2.5 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between mt-auto">
            <div>
              {isFreeProduct ? (
                <span className="text-emerald-600 dark:text-emerald-400 font-bold text-base md:text-lg">
                  0 ₫ (Miễn phí)
                </span>
              ) : typeof displayPrice === 'number' && displayPrice > 0 ? (
                <div className="text-slate-900 dark:text-white font-bold text-lg md:text-[19px] tracking-tight">
                  <Price amount={displayPrice} as="span" />
                </div>
              ) : (
                <span className="text-xs text-slate-400">Liên hệ</span>
              )}
            </div>

            {/* Black / dark slate CTA button aligned evenly at card footer */}
            <Button
              aria-label="Tải về"
              className="!rounded-lg !bg-[#0f172a] hover:!bg-slate-800 !text-white !border-none !font-medium !text-xs !h-8 !px-3.5 shadow-sm inline-flex items-center gap-1.5"
              data-slot="product-download-btn"
              icon={<DownloadOutlined className="text-xs" />}
              size="small"
              type="primary"
            >
              Tải về
            </Button>
          </div>
        </div>
      </Card>
    </Link>
  )
}
