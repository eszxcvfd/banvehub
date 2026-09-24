'use client'

import React from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { Card, Tag, Rate, Typography, Button } from 'antd'
import { FileProtectOutlined, UserOutlined, DownloadOutlined } from '@ant-design/icons'
import type { Product, Category, SoftwareType, Media } from '@/payload-types'
import { Price } from '@/components/Price'

type Props = {
  product: Partial<Product>
}

export const ProductListItem: React.FC<Props> = ({ product }) => {
  const { gallery, previewGallery, price, isFree, title, slug, software_types, categories, seller, technicalSpecs, meta } = product
  const isFreeProduct = Boolean(isFree) || price === 0

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

  const imageUrl = imageResource?.url || null

  const primarySoftware = Array.isArray(software_types)
    ? (software_types.find((s) => typeof s === 'object' && s !== null) as SoftwareType | undefined)
    : undefined

  const primaryCategory = Array.isArray(categories)
    ? (categories.find((c) => typeof c === 'object' && c !== null) as Category | undefined)
    : undefined

  const sellerName = typeof seller === 'object' && seller !== null ? seller.name : undefined

  return (
    <Link href={`/products/${slug}`} className="block mb-4 group">
      <Card
        hoverable
        className="overflow-hidden border-neutral-200 dark:border-neutral-800 transition-all duration-300 group-hover:border-[#1677ff]"
        styles={{ body: { padding: '16px' } }}
      >
        <div className="flex flex-col sm:flex-row items-center gap-6">
          <div className="relative w-full sm:w-48 h-36 bg-neutral-100 dark:bg-neutral-900 rounded-lg overflow-hidden shrink-0">
            {imageUrl ? (
              <Image
                alt={title || 'Bản vẽ'}
                className="object-cover transition-transform duration-500 group-hover:scale-105"
                fill
                sizes="(max-width: 640px) 100vw, 192px"
                src={imageUrl}
              />
            ) : (
              <div className="w-full h-full flex flex-col items-center justify-center text-neutral-400">
                <FileProtectOutlined style={{ fontSize: 32 }} />
              </div>
            )}
            {isFreeProduct && (
              <div className="absolute top-2 right-2">
                <Tag color="success" className="m-0 font-semibold text-xs shadow-sm">
                  Miễn phí
                </Tag>
              </div>
            )}
          </div>

          <div className="flex-grow flex flex-col justify-between self-stretch">
            <div>
              <div className="flex flex-wrap items-center gap-2 mb-2">
                {primarySoftware && <Tag color="#1677ff">{primarySoftware.title}</Tag>}
                {primaryCategory && <Tag color="cyan">{primaryCategory.title}</Tag>}
                {technicalSpecs?.fileFormat && <Tag>{technicalSpecs.fileFormat}</Tag>}
              </div>

              <Typography.Title
                level={4}
                className="!mb-2 group-hover:!text-[#1677ff] transition-colors text-base sm:text-lg"
              >
                {title}
              </Typography.Title>

              <div className="flex flex-wrap items-center gap-4 text-xs text-slate-500 dark:text-slate-400 mb-2">
                <div className="flex items-center gap-1">
                  <Rate disabled allowHalf defaultValue={4.8} style={{ fontSize: 13, color: '#faad14' }} />
                  <span className="font-semibold text-amber-600">4.8</span>
                </div>
                {sellerName && (
                  <span className="flex items-center gap-1">
                    <UserOutlined /> {sellerName}
                  </span>
                )}
                {technicalSpecs?.fileSize && (
                  <span>Dung lượng: {technicalSpecs.fileSize}</span>
                )}
              </div>
            </div>

            <div className="flex items-center justify-between pt-3 border-t border-neutral-100 dark:border-neutral-800">
              <div>
                {isFreeProduct ? (
                  <span className="font-semibold text-emerald-600 dark:text-emerald-400 text-lg">
                    0 ₫ (Miễn phí)
                  </span>
                ) : typeof price === 'number' && price > 0 ? (
                  <div className="font-bold text-[#1677ff] text-xl">
                    <Price amount={price} />
                  </div>
                ) : (
                  <span className="text-sm text-slate-400">Liên hệ</span>
                )}
              </div>
              <Button type="primary" icon={<DownloadOutlined />} className="!bg-[#1677ff] hover:!bg-[#4096ff]">
                {isFreeProduct ? 'Tải ngay' : 'Xem chi tiết'}
              </Button>
            </div>
          </div>
        </div>
      </Card>
    </Link>
  )
}
