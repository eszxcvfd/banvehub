'use client'

import React from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { Card } from 'antd'
import { FileTextOutlined } from '@ant-design/icons'
import type { Product } from '@/payload-types'
import { Price } from '@/components/Price'

interface RecentResourceItem {
  id: string | number
  title: string
  slug: string
  format: string
  size: string
  price: number
  /** A product carries no rating in this schema, so a product-backed card has none. */
  rating: string | null
  reviews: number | null
  image: string
}

const CURATED_RECENT_ITEMS: RecentResourceItem[] = [
  {
    id: 'recent-1',
    title: 'Biệt thự 1 tầng mái Thái – Full hồ sơ',
    slug: 'san-pham-1-ho-so-thiet-ke-ban-ve-thi-cong-biet-thu-vuon-2-tang-hien-dai-12x15m',
    format: 'Revit',
    size: '2.1 MB',
    price: 950000,
    rating: '4.8',
    reviews: 45,
    image: '/media/curated/recent-1-thaivilla.jpg',
  },
  {
    id: 'recent-2',
    title: 'Bộ model nội thất phòng khách',
    slug: 'san-pham-3-ho-so-kien-truc-biet-thu-pho-3-tang-tan-co-dien-phap-tai-vinhomes-riverside',
    format: '3D',
    size: '1.3 GB',
    price: 600000,
    rating: '4.7',
    reviews: 32,
    image: '/media/curated/recent-2-interior.jpg',
  },
  {
    id: 'recent-3',
    title: 'Kết cấu nhà xưởng thép tiền chế',
    slug: 'ban-ve-ket-cau-nha-xuong-thep-tien-che',
    format: 'Revit',
    size: '4.7 MB',
    price: 1300000,
    rating: '4.8',
    reviews: 28,
    image: '/media/curated/recent-3-warehouse.jpg',
  },
  {
    id: 'recent-4',
    title: 'Bản vẽ cấp thoát nước (Full)',
    slug: 'san-pham-2-ban-ve-thiet-ke-kien-truc-nha-pho-4-tang-1-tum-mat-tien-5m-phong-cach-toi-gian',
    format: 'AutoCAD',
    size: '3.2 MB',
    price: 750000,
    rating: '4.6',
    reviews: 21,
    image: '/media/curated/recent-4-waterplan.jpg',
  },
  {
    id: 'recent-5',
    title: 'Mô hình BIM khách sạn 5 sao',
    slug: 'mo-hinh-bim-revit-benh-vien-da-khoa',
    format: 'Revit',
    size: '7.5 MB',
    price: 2500000,
    rating: '4.9',
    reviews: 58,
    image: '/media/curated/recent-5-hotel.jpg',
  },
]

interface RecentResourcesProps {
  products?: Product[]
}

/** The product's own public image, when it was populated with enough depth to carry a URL. */
const productImageURL = (product: Product): string | null => {
  const galleryImage = product.gallery?.[0]?.image
  const resource = (galleryImage || product.meta?.image) as
    | { url?: string | null }
    | number
    | null
    | undefined
  return resource && typeof resource === 'object' && resource.url ? String(resource.url) : null
}

export const RecentResources: React.FC<RecentResourcesProps> = ({ products }) => {
  // Product-first, the pattern of `components/Hero/EditorialHero.tsx:96-119`: a card that links to a
  // real product carries that product's own title, price, free state, format, size and image, and the
  // curated list is only the fallback for the positions the product list does not fill (empty or short
  // list). Before this, every displayed value except `id` and `slug` came from the curated item, so
  // each card linked to one product under another product's title and price.
  const items: RecentResourceItem[] = CURATED_RECENT_ITEMS.map((curated, idx) => {
    const product = products?.[idx]
    if (!product) return curated

    return {
      id: product.id || curated.id,
      title: product.title || curated.title,
      slug: product.slug || curated.slug,
      format: product.technicalSpecs?.fileFormat
        ? String(product.technicalSpecs.fileFormat).split(/[,/]/)[0].trim()
        : curated.format,
      size: product.technicalSpecs?.fileSize
        ? String(product.technicalSpecs.fileSize)
        : curated.size,
      price: typeof product.price === 'number' ? product.price : curated.price,
      // This schema stores no rating or review count on a product, so a product-backed card shows
      // none instead of the curated mockup's numbers under a real product's name. The curated values
      // stay on the curated fallback items, which is where they belong.
      rating: null,
      reviews: null,
      image: productImageURL(product) || curated.image,
    }
  })

  return (
    <div className="w-full">
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
        {items.map((item) => (
          <Link
            key={item.id}
            href={`/products/${item.slug}`}
            className="block no-underline text-inherit group h-full"
            data-slot="recent-resource-card"
          >
            <Card
              className="h-full flex flex-col justify-between overflow-hidden !rounded-xl transition-all duration-300 hover:shadow-md hover:-translate-y-0.5 !border-slate-200/80 dark:!border-slate-800 group-hover:!border-[#1677ff] bg-white dark:bg-[#141414]"
              cover={
                <div className="relative aspect-[16/10] w-full overflow-hidden bg-slate-100 dark:bg-slate-900">
                  <Image
                    src={item.image}
                    alt={item.title}
                    fill
                    className="object-cover object-bottom transition-transform duration-500 group-hover:scale-105"
                    sizes="(max-width: 640px) 100vw, (max-width: 1024px) 33vw, 20vw"
                  />
                  {/* Glassmorphic Format Badge */}
                  <div className="absolute top-2 left-2 z-10">
                    <span className="bg-white/90 dark:bg-slate-900/90 text-slate-800 dark:text-slate-100 text-[10px] font-semibold px-2 py-0.5 rounded shadow-sm backdrop-blur-xs">
                      {item.format}
                    </span>
                  </div>
                </div>
              }
              hoverable
              styles={{
                body: {
                  padding: '12px',
                  display: 'flex',
                  flexDirection: 'column',
                  flexGrow: 1,
                  justifyContent: 'space-between',
                },
              }}
            >
              <div>
                <div className="font-bold text-xs md:text-sm text-slate-900 dark:text-slate-100 line-clamp-2 min-h-[36px] group-hover:text-[#1677ff] transition-colors mb-1 leading-snug">
                  {item.title}
                </div>
                <div className="flex items-center gap-1 text-[11px] text-slate-400 mb-2.5">
                  <FileTextOutlined className="text-[10px]" />
                  <span>{item.format} · {item.size}</span>
                </div>
              </div>

              <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
                <div className="text-slate-900 dark:text-white font-bold text-xs md:text-sm tracking-tight">
                  <Price amount={item.price} />
                </div>
                {item.rating !== null && (
                  <div className="flex items-center gap-0.5 text-xs text-amber-500 font-medium">
                    <span>★</span>
                    <span className="text-slate-700 dark:text-slate-300 font-semibold">{item.rating}</span>
                    <span className="text-slate-400 text-[10px]">({item.reviews})</span>
                  </div>
                )}
              </div>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  )
}
