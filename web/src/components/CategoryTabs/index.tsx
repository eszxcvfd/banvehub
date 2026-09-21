'use client'

import React from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { Tabs } from 'antd'

export interface ArchitecturalCategory {
  slug: string
  title: string
  srTitle?: string
  count: string
  srCount?: string
  icon: React.ReactNode
}

/**
 * Clean SVG Icons designed 1:1 matching media_1789901340207.jpg
 */
export const CategoryIcons = {
  KienTruc: (
    <svg aria-hidden="true" className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="M3 9h18" />
      <path d="M9 21V9" />
      <path d="M15 9v12" />
      <path d="M9 15h6" />
    </svg>
  ),
  KetCau: (
    <svg aria-hidden="true" className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="5" r="2" />
      <path d="m10.5 7-5.5 13" />
      <path d="m13.5 7 5.5 13" />
      <path d="M7.5 15h9" />
      <circle cx="12" cy="15" r="1" />
    </svg>
  ),
  CoDienMEP: (
    <svg aria-hidden="true" className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
    </svg>
  ),
  BimRevit: (
    <svg aria-hidden="true" className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 22V6l6-3v19" />
      <path d="M10 22V10l10-4v16" />
      <path d="M4 22h16" />
      <path d="M7 10h.01M7 14h.01M7 18h.01M14 10h.01M14 14h.01M14 18h.01M17 10h.01M17 14h.01M17 18h.01" />
    </svg>
  ),
  NoiThat: (
    <svg aria-hidden="true" className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M19 9V6a2 2 0 0 0-2-2H7a2 2 0 0 0-2 2v3" />
      <path d="M3 11v5a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2z" />
      <path d="M6 18v2M18 18v2" />
    </svg>
  ),
  ThietKe3D: (
    <svg aria-hidden="true" className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="m21 16-9 5-9-5V8l9-5 9 5v8z" />
      <path d="M3.27 6.96 12 12.01l8.73-5.05" />
      <path d="M12 22.08V12" />
    </svg>
  ),
  QuyHoach: (
    <svg aria-hidden="true" className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="4" />
      <path d="M12 3v3" />
      <path d="M12 18v3" />
      <path d="M3 12h3" />
      <path d="M18 12h3" />
      <path d="m15 9-6 6" />
    </svg>
  ),
  Khac: (
    <svg aria-hidden="true" className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
    </svg>
  ),
}

export const ARCHITECTURAL_CATEGORIES: ArchitecturalCategory[] = [
  {
    slug: 'ban-ve-kien-truc',
    title: 'Bản vẽ kiến trúc',
    srTitle: 'Bản vẽ Kiến trúc',
    count: '2.500+',
    srCount: '850+ hồ sơ',
    icon: CategoryIcons.KienTruc,
  },
  {
    slug: 'ban-ve-ket-cau',
    title: 'Bản vẽ kết cấu',
    srTitle: 'Bản vẽ Kết cấu',
    count: '1.800+',
    icon: CategoryIcons.KetCau,
  },
  {
    slug: 'ban-ve-co-dien-mep',
    title: 'Cơ điện MEP',
    srTitle: 'Cơ điện (MEP)',
    count: '1.200+',
    srCount: '340+ hồ sơ',
    icon: CategoryIcons.CoDienMEP,
  },
  {
    slug: 'mo-hinh-bim-revit',
    title: 'Mô hình BIM Revit',
    srTitle: 'Mô hình BIM Revit',
    count: '2.600+',
    icon: CategoryIcons.BimRevit,
  },
  {
    slug: 'thiet-ke-noi-that',
    title: 'Nội thất',
    srTitle: 'Thiết kế Nội thất',
    count: '1.400+',
    icon: CategoryIcons.NoiThat,
  },
  {
    slug: 'thu-vien-sketchup-3dsmax',
    title: 'Thiết kế 3D',
    srTitle: 'Thư viện 3ds Max / SketchUp',
    count: '900+',
    icon: CategoryIcons.ThietKe3D,
  },
  {
    slug: 'ho-so-quy-hoach-ha-tang',
    title: 'Hồ sơ quy hoạch',
    srTitle: 'Hồ sơ Quy hoạch',
    count: '600+',
    icon: CategoryIcons.QuyHoach,
  },
  {
    slug: 'all',
    title: 'Khác',
    srTitle: 'Tất cả danh mục',
    count: '300+',
    icon: CategoryIcons.Khac,
  },
]

export function CategoryTabs() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const activeCategory = searchParams.get('category') || 'all'

  const handleTabChange = (key: string) => {
    if (key === 'all' || key === 'khac') {
      router.push('/shop')
    } else {
      router.push(`/shop?category=${key}`)
    }
  }

  const items = ARCHITECTURAL_CATEGORIES.map((cat) => ({
    key: cat.slug,
    label: (
      <span className="flex items-center gap-2 py-1">
        {cat.icon}
        <span className="font-medium">
          <span>{cat.title}</span>
          {cat.srTitle && cat.srTitle !== cat.title && (
            <span className="sr-only">{cat.srTitle}</span>
          )}
        </span>
      </span>
    ),
  }))

  return (
    <div className="w-full my-6">
      <Tabs
        activeKey={activeCategory}
        centered
        className="custom-category-tabs"
        items={items}
        onChange={handleTabChange}
        size="large"
      />
    </div>
  )
}

export type CategoryTileRecord = { slug: string; title: string; count: number }

export function CategoryCards({ categories }: { categories?: CategoryTileRecord[] } = {}) {
  // With records, the tiles are the real categories with their real published counts (the server counts
  // them); the curated array is only the fallback for a database that holds none, which is what it is
  // for. Its hand-written "2.500+ hồ sơ" figures used to stand in for 17-18 real products each.
  const tiles =
    categories && categories.length > 0
      ? categories.map((category, index) => ({
          slug: category.slug,
          title: category.title,
          count: String(category.count),
          srTitle: undefined as string | undefined,
          srCount: undefined as string | undefined,
          icon: ARCHITECTURAL_CATEGORIES[index % ARCHITECTURAL_CATEGORIES.length]?.icon ?? null,
        }))
      : ARCHITECTURAL_CATEGORIES

  return (
    <div className="w-full my-3">
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
        {tiles.map((cat) => {
          const href = cat.slug === 'all' || cat.slug === 'khac' ? '/shop' : `/shop?category=${cat.slug}`
          return (
            <Link
              key={cat.slug}
              href={href}
              className="group flex flex-col items-center justify-center p-3 sm:py-4 sm:px-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#141414] text-center hover:border-blue-300 hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 cursor-pointer no-underline block"
            >
              <div className="w-12 h-12 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-700 dark:text-slate-200 mx-auto group-hover:scale-105 group-hover:bg-blue-50 group-hover:text-blue-600 dark:group-hover:bg-blue-950/40 dark:group-hover:text-blue-400 transition-all duration-200">
                {cat.icon}
              </div>
              <div className="font-semibold text-sm text-slate-800 dark:text-slate-100 mt-2.5 line-clamp-1 group-hover:text-blue-600 transition-colors">
                <span>{cat.title}</span>
                {cat.srTitle && cat.srTitle !== cat.title && (
                  <span className="sr-only"> {cat.srTitle}</span>
                )}
              </div>
              <div className="text-xs text-slate-400 dark:text-slate-500 mt-1">
                <span>{cat.count} hồ sơ</span>
                {cat.srCount && cat.srCount !== cat.count && (
                  <span className="sr-only"> {cat.srCount}</span>
                )}
              </div>
            </Link>
          )
        })}
      </div>
    </div>
  )
}
