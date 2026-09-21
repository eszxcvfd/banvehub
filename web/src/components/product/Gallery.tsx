'use client'

import type { Media as MediaType, Product, ProductPreview } from '@/payload-types'
import { Media } from '@/components/Media'
import React, { useMemo, useState } from 'react'
import Image from 'next/image'
import { Tag, Empty, Button } from 'antd'
import {
  SafetyCertificateOutlined,
  FilePdfOutlined,
  BlockOutlined,
  FileTextOutlined,
  LeftOutlined,
  RightOutlined,
} from '@ant-design/icons'
import clsx from 'clsx'

export type UnifiedPreviewItem = {
  id: string
  media?: MediaType | null
  src?: string
  title?: string
  previewType: 'image' | 'pdf' | 'model_viewer'
  isWatermarked: boolean
  caption?: string | null
}

export type Props = {
  previewGallery?: Product['previewGallery']
  gallery?: Product['gallery']
  fallbackImage?: MediaType | null
  className?: string
  formatBadge?: string
  curatedFallback?: boolean
}

// Curated architectural blueprint & 3D render slides for rich preview
export const Gallery: React.FC<Props> = ({
  previewGallery,
  gallery,
  fallbackImage,
  className = '',
  formatBadge = 'Revit',
  curatedFallback = false,
}) => {
  const [current, setCurrent] = useState(0)

  // Normalize all visual preview sources into a unified list
  const items: UnifiedPreviewItem[] = useMemo(() => {
    const list: UnifiedPreviewItem[] = []

    // 1. Process public watermarked previews from product_previews collection
    if (Array.isArray(previewGallery)) {
      previewGallery.forEach((item, index) => {
        if (typeof item === 'object' && item !== null) {
          const previewDoc = item as ProductPreview
          const mediaObj =
            typeof previewDoc.previewImage === 'object' && previewDoc.previewImage !== null
              ? (previewDoc.previewImage as MediaType)
              : null

          if (mediaObj) {
            list.push({
              id: `preview-${previewDoc.id || index}`,
              media: mediaObj,
              title: previewDoc.title,
              previewType: previewDoc.previewType || 'image',
              isWatermarked: previewDoc.isWatermarked ?? true,
              caption: previewDoc.caption,
            })
          }
        }
      })
    }

    // 2. Process direct gallery media images
    if (Array.isArray(gallery)) {
      gallery.forEach((item, index) => {
        if (typeof item === 'object' && item !== null && typeof item.image === 'object' && item.image !== null) {
          list.push({
            id: `gallery-${item.id || index}`,
            media: item.image as MediaType,
            title: item.caption || undefined,
            previewType: 'image',
            isWatermarked: false,
            caption: item.caption,
          })
        }
      })
    }

    // 3. Fallback to SEO meta image if available
    if (list.length === 0 && fallbackImage) {
      list.push({
        id: 'fallback-meta',
        media: fallbackImage,
        previewType: 'image',
        isWatermarked: false,
      })
    }

    // The carousel shows this record's own media and nothing else: no curated padding.

    return list
  }, [previewGallery, gallery, fallbackImage, curatedFallback])

  if (items.length === 0) {
    return (
      <div className="relative aspect-[4/3] w-full overflow-hidden rounded-2xl border border-dashed border-slate-200 dark:border-slate-800 flex flex-col items-center justify-center p-6 text-center bg-slate-50 dark:bg-slate-900/50">
        <Empty
          image={<FileTextOutlined style={{ fontSize: 48, color: '#bfbfbf' }} />}
          description={
            <div className="space-y-1">
              <p className="text-sm font-medium text-slate-800 dark:text-slate-200">Bản xem trước đang được cập nhật</p>
              <p className="text-xs text-slate-500">Tài liệu kỹ thuật sẵn sàng tải xuống sau khi phát hành</p>
            </div>
          }
        />
      </div>
    )
  }

  const activeItem = items[current] || items[0]
  const totalCount = items.length

  const handlePrev = () => {
    setCurrent((prev) => (prev > 0 ? prev - 1 : totalCount - 1))
  }

  const handleNext = () => {
    setCurrent((prev) => (prev < totalCount - 1 ? prev + 1 : 0))
  }

  // First 4 thumbnails + 5th with +overflow overlay if totalCount > 5
  const visibleThumbnails = items.slice(0, 5)
  const remainingCount = totalCount > 5 ? totalCount - 4 : 0

  return (
    <div className={`flex flex-col gap-4 w-full ${className}`}>
      {/* Main Preview Viewport */}
      <div className="relative w-full aspect-[4/3] sm:aspect-[16/11] overflow-hidden rounded-2xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-[#141414] shadow-xs flex items-center justify-center group">
        {/* Format Badge (Top-Left) */}
        <div className="absolute top-4 left-4 z-20">
          <span className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-bold bg-white/95 dark:bg-slate-900/90 text-[#1677ff] border border-blue-200 dark:border-blue-900 shadow-xs backdrop-blur-md">
            {formatBadge}
          </span>
        </div>

        {/* Watermarked Badge */}
        {activeItem.isWatermarked && (
          <div className="absolute top-4 right-4 z-20">
            <Tag
              color="warning"
              icon={<SafetyCertificateOutlined />}
              className="!px-2.5 !py-1 !font-semibold !text-xs !rounded-md !shadow-xs !backdrop-blur-md !m-0"
            >
              Bản xem trước có Watermark
            </Tag>
          </div>
        )}

        {/* Preview Type Badges */}
        {activeItem.previewType === 'pdf' && (
          <div className="absolute top-4 right-4 z-20">
            <Tag
              color="error"
              icon={<FilePdfOutlined />}
              className="!px-2.5 !py-1 !font-semibold !text-xs !rounded-md !shadow-xs !backdrop-blur-md !m-0"
            >
              Trang PDF mẫu
            </Tag>
          </div>
        )}
        {activeItem.previewType === 'model_viewer' && (
          <div className="absolute top-4 right-4 z-20">
            <Tag
              color="processing"
              icon={<BlockOutlined />}
              className="!px-2.5 !py-1 !font-semibold !text-xs !rounded-md !shadow-xs !backdrop-blur-md !m-0"
            >
              Mô hình 3D
            </Tag>
          </div>
        )}

        {/* Navigation Chevrons (< and >) */}
        {totalCount > 1 && (
          <>
            <button
              type="button"
              aria-label="Ảnh trước"
              onClick={handlePrev}
              className="absolute left-3 top-1/2 -translate-y-1/2 z-20 w-9 h-9 rounded-full bg-white/90 dark:bg-slate-900/90 text-slate-700 dark:text-slate-200 flex items-center justify-center shadow-md hover:bg-white hover:scale-105 transition-all cursor-pointer border border-slate-200/80 dark:border-slate-700"
            >
              <LeftOutlined className="text-xs font-bold" />
            </button>
            <button
              type="button"
              aria-label="Ảnh tiếp theo"
              onClick={handleNext}
              className="absolute right-3 top-1/2 -translate-y-1/2 z-20 w-9 h-9 rounded-full bg-white/90 dark:bg-slate-900/90 text-slate-700 dark:text-slate-200 flex items-center justify-center shadow-md hover:bg-white hover:scale-105 transition-all cursor-pointer border border-slate-200/80 dark:border-slate-700"
            >
              <RightOutlined className="text-xs font-bold" />
            </button>
          </>
        )}

        {/* Counter Pill Badge (Bottom-Right) */}
        <div className="absolute bottom-3 right-3 z-20">
          <div className="px-2.5 py-1 rounded-md text-[11px] font-bold bg-slate-900/80 text-white backdrop-blur-md shadow-xs tracking-wider">
            {current + 1} / {totalCount}
          </div>
        </div>

        {/* Visual Watermark Overlay Pattern */}
        {activeItem.isWatermarked && (
          <div className="absolute inset-0 pointer-events-none select-none z-10 flex items-center justify-center overflow-hidden">
            <div className="rotate-[-22deg] text-slate-900/10 dark:text-white/10 text-xl sm:text-2xl font-black uppercase tracking-widest border-2 border-dashed border-slate-900/15 dark:border-white/15 px-8 py-3 rounded-2xl">
              KienTaoHub Preview • Bản quyền số
            </div>
          </div>
        )}

        {/* Main Media Rendering */}
        <div className="relative w-full h-full p-4 flex items-center justify-center">
          {activeItem.media ? (
            <Media
              resource={activeItem.media}
              className="relative w-full h-full flex items-center justify-center"
              imgClassName="w-full h-full object-contain"
            />
          ) : activeItem.src ? (
            <div className="relative w-full h-full">
              <Image
                src={activeItem.src}
                alt={activeItem.title || 'Bản vẽ chi tiết'}
                fill
                className="object-contain"
                sizes="(max-width: 1024px) 100vw, 50vw"
                priority
              />
            </div>
          ) : (
            <div className="flex items-center justify-center text-slate-400">
              <FileTextOutlined className="text-5xl" />
            </div>
          )}
        </div>

        {/* Caption bar */}
        {(activeItem.caption || activeItem.title) && (
          <div className="absolute bottom-0 inset-x-0 bg-slate-900/80 backdrop-blur-md p-2.5 text-xs text-white border-t border-slate-800 z-20 text-center">
            {activeItem.title && <span className="font-semibold mr-2">{activeItem.title}</span>}
            {activeItem.caption && activeItem.caption !== activeItem.title && <span>{activeItem.caption}</span>}
          </div>
        )}
      </div>

      {/* Thumbnails Strip */}
      {totalCount > 1 && (
        <div className="grid grid-cols-5 gap-2.5 w-full">
          {visibleThumbnails.map((item, idx) => {
            const isLastOfFive = idx === 4 && remainingCount > 0
            const isActive = current === idx || (idx === 4 && current >= 4)

            return (
              <button
                type="button"
                key={item.id}
                aria-label={`Xem ảnh ${idx + 1}`}
                onClick={() => setCurrent(idx)}
                className={clsx(
                  'relative aspect-[4/3] w-full rounded-xl overflow-hidden border transition-all cursor-pointer bg-slate-100 dark:bg-slate-900 group/thumb',
                  isActive
                    ? 'border-2 border-[#1677ff] shadow-sm'
                    : 'border-slate-200 dark:border-slate-800 hover:border-slate-400 opacity-80 hover:opacity-100',
                )}
              >
                {item.media ? (
                  <Media
                    resource={item.media}
                    className="w-full h-full object-cover"
                    imgClassName="w-full h-full object-cover"
                  />
                ) : item.src ? (
                  <Image
                    src={item.src}
                    alt={item.title || `Thumbnail ${idx + 1}`}
                    fill
                    className="object-cover"
                    sizes="120px"
                  />
                ) : null}

                {item.previewType === 'pdf' && (
                  <div className="absolute bottom-1 left-1 bg-rose-500/90 text-white rounded px-1 py-0.5 text-[9px] font-bold z-10">
                    PDF
                  </div>
                )}

                {/* Overflow overlay on 5th thumbnail (+5) */}
                {isLastOfFive && (
                  <div className="absolute inset-0 bg-slate-900/75 flex items-center justify-center text-white font-bold text-sm backdrop-blur-xs transition-opacity group-hover/thumb:bg-slate-900/60">
                    +{remainingCount}
                  </div>
                )}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
