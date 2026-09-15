'use client'

import type { Media as MediaType, Product, ProductPreview } from '@/payload-types'
import { Media } from '@/components/Media'
import React, { useMemo, useState } from 'react'
import { Box, FileText, ShieldAlert } from 'lucide-react'
import { Carousel, CarouselContent, CarouselItem } from '@/components/ui/carousel'
import clsx from 'clsx'

export type UnifiedPreviewItem = {
  id: string
  media: MediaType
  title?: string
  previewType: 'image' | 'pdf' | 'model_viewer'
  isWatermarked: boolean
  caption?: string | null
}

type Props = {
  previewGallery?: Product['previewGallery']
  gallery?: Product['gallery']
  fallbackImage?: MediaType | null
  className?: string
}

export const Gallery: React.FC<Props> = ({
  previewGallery,
  gallery,
  fallbackImage,
  className = '',
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

    // 3. Fallback to SEO meta image if no previews exist
    if (list.length === 0 && fallbackImage) {
      list.push({
        id: 'fallback-0',
        media: fallbackImage,
        previewType: 'image',
        isWatermarked: false,
      })
    }

    return list
  }, [previewGallery, gallery, fallbackImage])

  if (items.length === 0) {
    return (
      <div className="relative aspect-[4/3] w-full overflow-hidden rounded-xl border border-dashed border-muted flex flex-col items-center justify-center p-6 text-center text-muted-foreground bg-muted/20">
        <FileText className="w-12 h-12 mb-2 opacity-40" />
        <p className="text-sm font-medium">Bản xem trước đang được cập nhật</p>
        <p className="text-xs opacity-70">Tài liệu kỹ thuật sẵn sàng tải xuống sau khi phát hành</p>
      </div>
    )
  }

  const activeItem = items[current] || items[0]

  return (
    <div className={`flex flex-col gap-4 ${className}`}>
      {/* Main Preview Viewport */}
      <div className="relative w-full aspect-[4/3] sm:aspect-[16/10] overflow-hidden rounded-xl border bg-background/50 shadow-sm flex items-center justify-center">
        {/* Watermarked Badge */}
        {activeItem.isWatermarked && (
          <div className="absolute top-3 left-3 z-20">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-semibold bg-background/90 text-amber-600 dark:text-amber-400 backdrop-blur-md border border-amber-500/30 shadow-sm">
              <ShieldAlert className="w-3.5 h-3.5" />
              Bản xem trước có Watermark
            </span>
          </div>
        )}

        {/* Preview Type Badge */}
        {activeItem.previewType === 'pdf' && (
          <div className="absolute top-3 right-3 z-20">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold bg-rose-500/15 text-rose-600 dark:text-rose-400 backdrop-blur-md border border-rose-500/20 shadow-sm">
              <FileText className="w-3.5 h-3.5" />
              Trang PDF mẫu
            </span>
          </div>
        )}
        {activeItem.previewType === 'model_viewer' && (
          <div className="absolute top-3 right-3 z-20">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold bg-sky-500/15 text-sky-600 dark:text-sky-400 backdrop-blur-md border border-sky-500/20 shadow-sm">
              <Box className="w-3.5 h-3.5" />
              Mô hình 3D
            </span>
          </div>
        )}

        {/* Visual Watermark Overlay Pattern */}
        {activeItem.isWatermarked && (
          <div className="absolute inset-0 pointer-events-none select-none z-10 flex items-center justify-center overflow-hidden">
            <div className="rotate-[-22deg] text-foreground/15 dark:text-foreground/10 text-xl sm:text-2xl md:text-3xl font-black uppercase tracking-widest border-2 border-dashed border-foreground/15 dark:border-foreground/10 px-8 py-3 rounded-2xl">
              KienTaoHub Preview • Bản quyền số
            </div>
          </div>
        )}

        {/* Media rendering */}
        <Media
          resource={activeItem.media}
          className="relative w-full h-full flex items-center justify-center"
          imgClassName="w-full h-full object-contain"
        />

        {/* Caption bar */}
        {activeItem.caption && (
          <div className="absolute bottom-0 inset-x-0 bg-background/80 backdrop-blur-md p-2.5 text-xs text-muted-foreground border-t z-20 text-center">
            {activeItem.caption}
          </div>
        )}
      </div>

      {/* Thumbnails Strip */}
      {items.length > 1 && (
        <Carousel className="w-full" opts={{ align: 'start', loop: false }}>
          <CarouselContent className="-ml-2">
            {items.map((item, i) => (
              <CarouselItem
                className="pl-2 basis-1/4 sm:basis-1/5"
                key={item.id}
                onClick={() => setCurrent(i)}
              >
                <button
                  type="button"
                  aria-label={`Xem ảnh ${i + 1}`}
                  className={clsx(
                    'relative aspect-square w-full rounded-lg overflow-hidden border transition-all cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-primary',
                    i === current
                      ? 'border-primary ring-2 ring-primary/40 shadow-sm'
                      : 'border-border hover:border-foreground/40 opacity-70 hover:opacity-100',
                  )}
                >
                  <Media
                    resource={item.media}
                    className="w-full h-full object-cover"
                    imgClassName="w-full h-full object-cover"
                  />
                  {item.isWatermarked && (
                    <div className="absolute bottom-1 right-1 bg-background/80 rounded p-0.5 shadow-xs">
                      <ShieldAlert className="w-2.5 h-2.5 text-amber-500" />
                    </div>
                  )}
                  {item.previewType === 'pdf' && (
                    <div className="absolute bottom-1 left-1 bg-rose-500/80 text-white rounded px-1 py-0.5 text-[9px] font-bold">
                      PDF
                    </div>
                  )}
                </button>
              </CarouselItem>
            ))}
          </CarouselContent>
        </Carousel>
      )}
    </div>
  )
}
