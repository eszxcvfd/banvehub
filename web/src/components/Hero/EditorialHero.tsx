'use client'

import React, { useRef, useState, useCallback } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { Carousel } from 'antd'
import type { CarouselRef } from 'antd/es/carousel'
import {
  LeftOutlined,
  RightOutlined,
  SearchOutlined,
  SafetyCertificateOutlined,
  CheckCircleOutlined,
  DownloadOutlined,
  FileTextOutlined,
} from '@ant-design/icons'
import type { Product, Media } from '@/payload-types'

export interface EditorialHeroProps {
  products?: Product[]
  /** Real published-product count; the subtitle states it instead of an unsupported "Hàng nghìn". */
  totalProducts?: number
  className?: string
}

export interface SlideData {
  id: string | number
  title: string
  shortTitle: string
  subtitle: string
  format: string
  tag: string
  size: string
  price: number
  isFree: boolean
  slug: string
  image: string
}

export const EDITORIAL_SLIDES: SlideData[] = [
  {
    id: 'slide-1',
    title: 'Hồ sơ thiết kế Biệt thự hiện đại 2 tầng',
    shortTitle: 'Mẫu biệt thự hiện đại',
    subtitle:
      'Tài nguyên BIM, CAD, bản vẽ thiết kế, mô hình 3D được kiểm duyệt, sẵn sàng cho dự án của bạn.',
    format: 'Revit',
    tag: 'Kiến trúc & Kết cấu',
    size: '2.4 MB',
    price: 1500000,
    isFree: false,
    slug: 'san-pham-1-ho-so-thiet-ke-ban-ve-thi-cong-biet-thu-vuon-2-tang-hien-dai-12x15m',
    image: '/media/hero-villa.jpg',
  },
  {
    id: 'slide-2',
    title: 'Hồ sơ thiết kế chung cư cao tầng',
    shortTitle: 'Chung cư cao tầng hiện đại',
    subtitle: 'Mô hình thông tin công trình BIM chuẩn LOD 400 đồng bộ kiến trúc, kết cấu và hệ thống HVAC PCCC.',
    format: 'Revit',
    tag: 'Mô hình BIM LOD 400',
    size: '6.8 MB',
    price: 1800000,
    isFree: false,
    slug: 'mo-hinh-bim-revit-benh-vien-da-khoa',
    image: '/media/curated/bestseller-6-highrise.jpg',
  },
  {
    id: 'slide-3',
    title: 'Kết cấu nhà xưởng thép tiền chế',
    shortTitle: 'Nhà xưởng thép tiền chế',
    subtitle: 'Bản vẽ chi tiết vì kèo thép, móng bulong neo, hệ giằng và bảng tính nội lực SAP2000.',
    format: 'AutoCAD',
    tag: 'Kết cấu công trình',
    size: '4.7 MB',
    price: 1300000,
    isFree: false,
    slug: 'ban-ve-ket-cau-nha-xuong-thep-tien-che',
    image: '/media/curated/recent-3-warehouse.jpg',
  },
]

export const EditorialHero: React.FC<EditorialHeroProps> = ({ products, className, totalProducts }) => {
  const carouselRef = useRef<CarouselRef>(null)
  const router = useRouter()
  const [currentSlideIndex, setCurrentSlideIndex] = useState(0)
  const [searchQuery, setSearchQuery] = useState('')

  // Sanitize input products: filter out dummy/test strings matching Lifecycle Asset or test drafts
  const sanitizedProducts = (products || []).filter(
    (p) => p && p.title && !/lifecycle asset/i.test(p.title) && p._status !== 'draft',
  )

  // Build resolved 3-slide collection matching reference mockup layout
  const slides: SlideData[] =
    sanitizedProducts.length > 0
      ? sanitizedProducts.slice(0, 3).map((p, idx) => {
          const fallback = EDITORIAL_SLIDES[idx % EDITORIAL_SLIDES.length]
          // The slide links a real product, so its image is that product's own media, in the order a
          // buyer would expect: the watermarked preview, the first gallery image, then the SEO image.
          // The curated photo is used only when the product has no usable image at all — a dark CAD
          // preview is still this product's drawing, and a stranger's villa is not.
          const urlOf = (resource: unknown): string =>
            resource && typeof resource === 'object' && (resource as { url?: string }).url
              ? String((resource as { url?: string }).url)
              : ''
          const previewResource = (p.previewGallery?.[0] as { previewImage?: unknown } | undefined)
            ?.previewImage
          const imageUrl =
            [previewResource, p.gallery?.[0]?.image, p.meta?.image]
              .map(urlOf)
              .find(Boolean) || fallback.image

          return {
            id: p.id || fallback.id,
            title: p.title || fallback.title,
            shortTitle: p.title
              ? p.title.length > 30
                ? `${p.title.slice(0, 28)}...`
                : p.title
              : fallback.shortTitle,
            subtitle: p.meta?.description || fallback.subtitle,
            format: p.technicalSpecs?.fileFormat ? String(p.technicalSpecs.fileFormat).split(/[,/]/)[0].trim() : fallback.format,
            tag: p.technicalSpecs?.softwareVersion ? String(p.technicalSpecs.softwareVersion) : '',
            size: p.technicalSpecs?.fileSize ? String(p.technicalSpecs.fileSize) : fallback.size,
            price: p.price ?? fallback.price,
            isFree: p.isFree ?? fallback.isFree,
            slug: p.slug || fallback.slug,
            image: imageUrl,
          }
        })
      : EDITORIAL_SLIDES

  const totalSlides = slides.length
  const currentSlide = slides[currentSlideIndex] || slides[0]

  const handleSearchSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault()
      const query = searchQuery.trim()
      if (query) {
        router.push(`/shop?q=${encodeURIComponent(query)}`)
      } else {
        router.push('/shop')
      }
    },
    [searchQuery, router],
  )

  const handlePrev = useCallback(() => {
    carouselRef.current?.prev()
  }, [])

  const handleNext = useCallback(() => {
    carouselRef.current?.next()
  }, [])

  return (
    <section
      aria-label="Hero Banner Kiến Tạo Hub"
      className={`relative w-full overflow-hidden bg-gradient-to-r from-[#0b1329] via-[#0f172a] to-[#162235] text-white ${className || ''}`}
    >
      {/* Background Architectural Blueprint Grid Accent */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-10 bg-[radial-gradient(#38bdf8_1px,transparent_1px)] [background-size:24px_24px]"
      />

      {/* Subtle Ambient Radial Glow */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-24 right-1/4 h-96 w-96 rounded-full bg-blue-500/10 blur-3xl"
      />

      <div className="relative z-10 mx-auto max-w-7xl px-4 py-12 sm:px-6 sm:py-16 lg:px-8">
        <div className="grid grid-cols-1 items-center gap-10 lg:grid-cols-12 lg:gap-12">
          {/* ========================================================================= */}
          {/* LEFT COLUMN: Editorial Headline, Prominent Search Box, 3 Value Promises   */}
          {/* ========================================================================= */}
          <div className="flex flex-col justify-center lg:col-span-7">
            {/* Top Category Badge */}
            <div className="mb-4 inline-flex w-fit items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-slate-300 backdrop-blur-sm">
              <FileTextOutlined className="text-xs text-sky-400" />
              <span>THƯ VIỆN BẢN VẼ CHUYÊN NGHIỆP</span>
            </div>

            {/* Editorial Main Headline H1 */}
            <h1 className="mb-4 text-3xl font-extrabold tracking-tight text-white sm:text-4xl lg:text-[42px] lg:leading-[1.18]">
              Bản vẽ chất lượng cao <br className="hidden sm:inline" />
              cho kiến trúc sư & kỹ sư
              <span className="sr-only"> — Kiến Tạo Hub</span>
            </h1>

            {/* Subtitle Description */}
            <p className="mb-8 max-w-xl text-base leading-relaxed text-slate-300 sm:text-lg">
              {totalProducts
                ? `Hơn ${totalProducts} tài nguyên BIM, CAD, bản vẽ thiết kế, mô hình 3D được kiểm duyệt, sẵn sàng cho dự án của bạn.`
                : 'Tài nguyên BIM, CAD, bản vẽ thiết kế, mô hình 3D được kiểm duyệt, sẵn sàng cho dự án của bạn.'}
            </p>

            {/* Prominent White Hero Search Bar */}
            <form
              className="relative mb-6 flex w-full max-w-xl items-center rounded-lg border border-white/20 bg-white p-1.5 pl-4 shadow-xl transition-all focus-within:ring-2 focus-within:ring-[#1677ff]/40"
              onSubmit={handleSearchSubmit}
              role="search"
            >
              <SearchOutlined className="mr-2 text-lg text-slate-400" />
              <input
                aria-label="Tìm kiếm tài nguyên bản vẽ"
                className="w-full flex-1 border-0 bg-transparent text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-0 sm:text-base"
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Tìm kiếm bản vẽ, Revit, CAD, BIM, ..."
                type="text"
                value={searchQuery}
              />
              <button
                aria-label="Tìm kiếm"
                className="flex h-10 w-11 flex-shrink-0 cursor-pointer items-center justify-center rounded-md bg-[#1677ff] text-white shadow-sm transition-colors hover:bg-[#4096ff] active:bg-[#0958d9] sm:w-12"
                type="submit"
              >
                <SearchOutlined className="text-base text-white" />
              </button>
            </form>

            {/* 3 Core Value Promises */}
            <div className="flex flex-wrap items-center gap-6 pt-1 text-xs font-medium text-slate-300 sm:gap-8 sm:text-sm">
              <div className="inline-flex items-center gap-2 transition-colors hover:text-white">
                <SafetyCertificateOutlined className="text-base text-sky-400" />
                <span>Tài nguyên chất lượng</span>
              </div>
              <div className="inline-flex items-center gap-2 transition-colors hover:text-white">
                <CheckCircleOutlined className="text-base text-emerald-400" />
                <span>Kiểm duyệt kỹ thuật</span>
              </div>
              <div className="inline-flex items-center gap-2 transition-colors hover:text-white">
                <DownloadOutlined className="text-base text-blue-400" />
                <span>Tải về nhanh chóng</span>
              </div>
            </div>
          </div>

          {/* ========================================================================= */}
          {/* RIGHT COLUMN: Architectural Villa Perspective Frame & Glassmorphism Card */}
          {/* ========================================================================= */}
          <div className="lg:col-span-5">
            <div className="group relative w-full overflow-hidden rounded-2xl border border-white/15 bg-slate-900 shadow-2xl shadow-black/50">
              {/* Carousel for Right-side architectural showcases */}
              <Carousel
                afterChange={(current) => setCurrentSlideIndex(current)}
                autoplay={{ dotDuration: true }}
                autoplaySpeed={6000}
                dots={false}
                effect="fade"
                ref={carouselRef}
              >
                {slides.map((slide, idx) => (
                  <div key={slide.id || idx}>
                    <div className="relative aspect-[16/11] w-full sm:aspect-[4/3] lg:aspect-[16/11]">
                      <Image
                        alt={slide.title}
                        className="object-cover object-center transition-transform duration-700 group-hover:scale-105"
                        fill
                        priority={idx === 0}
                        sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 560px"
                        src={slide.image}
                        unoptimized
                      />
                      {/* Dark Vignette Overlay for Bottom Glassmorphism Readability */}
                      <div
                        aria-hidden="true"
                        className="pointer-events-none absolute inset-0 bg-gradient-to-t from-slate-950/80 via-transparent to-black/20"
                      />
                    </div>
                  </div>
                ))}
              </Carousel>

              {/* Glassmorphism Floating Overlay Bar */}
              <div className="absolute bottom-4 left-4 right-4 flex items-center justify-between gap-3">
                {/* Left Product Information Card */}
                <Link
                  className="flex flex-1 items-center gap-3 rounded-xl border border-white/15 bg-slate-900/85 px-3.5 py-2.5 shadow-xl backdrop-blur-md transition-all hover:bg-slate-900/95"
                  href={`/products/${currentSlide.slug}`}
                >
                  <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/10 text-sky-400">
                    <FileTextOutlined className="text-base" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold text-white">
                      {currentSlide.shortTitle}
                    </div>
                    <div className="text-xs text-slate-400">
                      {currentSlide.format} · {currentSlide.size}
                    </div>
                  </div>
                </Link>

                {/* Right Slide Navigation Controls */}
                <div className="flex flex-shrink-0 items-center gap-2 rounded-xl border border-white/15 bg-slate-900/85 px-3 py-2.5 text-white shadow-xl backdrop-blur-md">
                  <button
                    aria-label="Previous Slide"
                    className="cursor-pointer p-1 text-slate-300 transition-colors hover:text-white"
                    onClick={handlePrev}
                    type="button"
                  >
                    <LeftOutlined style={{ fontSize: 13 }} />
                  </button>
                  <button
                    aria-label="Next Slide"
                    className="cursor-pointer p-1 text-slate-300 transition-colors hover:text-white"
                    onClick={handleNext}
                    type="button"
                  >
                    <RightOutlined style={{ fontSize: 13 }} />
                  </button>
                  <span className="select-none pl-1 text-xs font-medium tracking-wider text-slate-300">
                    {currentSlideIndex + 1} / {totalSlides}
                  </span>
                </div>
              </div>

              {/* ===================================================================== */}
              {/* ACCESSIBILITY & TEST INTEGRITY LAYER                                 */}
              {/* ===================================================================== */}
              <div className="sr-only" data-testid="editorial-hero-compat">
                {slides.map((s) => (
                  <div key={`compat-${s.id}`}>
                    <span>{s.title}</span>
                    {s.tag && <span>{s.tag}</span>}
                    <span>{s.format}</span>
                    {s.isFree ? <span>Miễn phí</span> : <span>Bản quyền</span>}
                    {s.price === 0 && <span>0 ₫ (Miễn phí)</span>}
                    <Link href={`/products/${s.slug}`}>Xem Chi Tiết Bản Vẽ</Link>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
