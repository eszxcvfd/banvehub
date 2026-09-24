'use client'

import React from 'react'
import Link from 'next/link'
import {
  ApartmentOutlined,
  AppstoreOutlined,
  BankOutlined,
  RightOutlined,
  SafetyCertificateOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons'

interface SubItem {
  label: string
  href: string
  badge?: string
  badgeColor?: string
}

interface Section {
  title: string
  subtitle: string
  icon: React.ReactNode
  iconBg: string
  href: string
  items: SubItem[]
}

export function MegaMenuContent({ onClose }: { onClose?: () => void }) {
  const sections: Section[] = [
    {
      title: 'Bản vẽ Kiến trúc',
      subtitle: '2.500+ hồ sơ',
      icon: <BankOutlined className="text-base" />,
      iconBg: 'bg-blue-50 text-[#1677ff] dark:bg-blue-950/60 dark:text-blue-400',
      href: '/shop?category=ban-ve-kien-truc',
      items: [
        { label: 'Tất cả bản vẽ kiến trúc', href: '/shop?category=ban-ve-kien-truc' },
        {
          label: 'Nhà phố & Nhà ống',
          href: '/shop?category=ban-ve-kien-truc&q=nhà+phố',
          badge: 'Hot',
          badgeColor: 'bg-rose-50 text-rose-600 dark:bg-rose-950/50 dark:text-rose-400 border border-rose-200/60 dark:border-rose-900/50',
        },
        {
          label: 'Biệt thự hiện đại & Tân cổ điển',
          href: '/shop?category=ban-ve-kien-truc&q=biệt+thự',
          badge: 'VIP',
          badgeColor: 'bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300 border border-amber-200/60 dark:border-amber-900/50',
        },
        { label: 'Chung cư mini & Căn hộ', href: '/shop?category=ban-ve-kien-truc&q=chung+cư' },
        { label: 'Khách sạn & Văn phòng', href: '/shop?category=ban-ve-kien-truc&q=khách+sạn' },
        { label: 'Hồ sơ Quy hoạch & Hạ tầng', href: '/shop?category=ho-so-quy-hoach-ha-tang' },
      ],
    },
    {
      title: 'Bản vẽ Kết cấu',
      subtitle: '1.800+ hồ sơ',
      icon: <ApartmentOutlined className="text-base" />,
      iconBg: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-400',
      href: '/shop?category=ban-ve-ket-cau',
      items: [
        { label: 'Tất cả bản vẽ kết cấu', href: '/shop?category=ban-ve-ket-cau' },
        {
          label: 'Khung thép tiền chế & Nhà xưởng',
          href: '/shop?category=ban-ve-ket-cau&q=nhà+xưởng',
          badge: 'Hot',
          badgeColor: 'bg-rose-50 text-rose-600 dark:bg-rose-950/50 dark:text-rose-400 border border-rose-200/60 dark:border-rose-900/50',
        },
        { label: 'Kết cấu bê tông cốt thép', href: '/shop?category=ban-ve-ket-cau&q=bê+tông' },
        { label: 'Nền móng & Thuyết minh tính toán', href: '/shop?category=ban-ve-ket-cau&q=móng' },
        { label: 'Hồ sơ kết cấu công nghiệp', href: '/shop?category=ban-ve-ket-cau&q=thép+tiền+chế' },
      ],
    },
    {
      title: 'Cơ điện (MEP)',
      subtitle: '1.200+ hồ sơ',
      icon: <ThunderboltOutlined className="text-base" />,
      iconBg: 'bg-amber-50 text-amber-600 dark:bg-amber-950/60 dark:text-amber-400',
      href: '/shop?category=ban-ve-co-dien-mep',
      items: [
        { label: 'Tất cả hồ sơ MEP', href: '/shop?category=ban-ve-co-dien-mep' },
        { label: 'Cấp thoát nước công trình', href: '/shop?category=ban-ve-co-dien-mep&q=cấp+thoát+nước' },
        { label: 'Điện chiếu sáng & Động lực', href: '/shop?category=ban-ve-co-dien-mep&q=chiếu+sáng' },
        { label: 'Hệ thống thông gió & HVAC', href: '/shop?category=ban-ve-co-dien-mep&q=HVAC' },
        {
          label: 'PCCC thẩm duyệt công an',
          href: '/shop?category=ban-ve-co-dien-mep&q=PCCC',
          badge: 'Chuẩn',
          badgeColor: 'bg-blue-50 text-blue-600 dark:bg-blue-950/50 dark:text-blue-400 border border-blue-200/60 dark:border-blue-900/50',
        },
      ],
    },
    {
      title: 'BIM Revit & 3D',
      subtitle: '2.600+ model',
      icon: <AppstoreOutlined className="text-base" />,
      iconBg: 'bg-purple-50 text-purple-600 dark:bg-purple-950/60 dark:text-purple-400',
      href: '/shop?category=mo-hinh-bim-revit',
      items: [
        { label: 'Tất cả mô hình BIM Revit', href: '/shop?category=mo-hinh-bim-revit' },
        {
          label: 'Revit Architecture & Structure',
          href: '/shop?category=mo-hinh-bim-revit&softwareType=revit',
          badge: 'LOD 350',
          badgeColor: 'bg-purple-50 text-purple-600 dark:bg-purple-950/50 dark:text-purple-400 border border-purple-200/60 dark:border-purple-900/50',
        },
        { label: 'Thư viện Family Revit', href: '/shop?category=mo-hinh-bim-revit&q=family' },
        { label: 'Thiết kế & Phối cảnh nội thất', href: '/shop?category=thiet-ke-noi-that' },
        { label: 'Thư viện SketchUp & 3ds Max', href: '/shop?category=thu-vien-sketchup-3dsmax' },
        { label: 'Cảnh quan & Sân vườn', href: '/shop?category=ban-ve-canh-quan-san-vuon' },
      ],
    },
  ]

  return (
    <div className="w-[1080px] max-w-[96vw] bg-white dark:bg-[#18181b] rounded-2xl shadow-[0_20px_50px_-12px_rgba(0,0,0,0.18),0_0_1px_1px_rgba(0,0,0,0.06)] border border-slate-200/90 dark:border-neutral-800 overflow-hidden text-left">
      {/* 4 Taxonomy Columns */}
      <div className="p-6 pb-5 grid grid-cols-[1fr_1fr_1fr_1.15fr] gap-4 lg:gap-5">
        {sections.map((sec) => (
          <div key={sec.title} className="flex flex-col">
            <Link
              href={sec.href}
              onClick={onClose}
              className="flex items-center gap-2.5 pb-2.5 mb-2.5 border-b border-slate-100 dark:border-neutral-800 group text-inherit no-underline"
            >
              <div
                className={`w-9 h-9 rounded-xl ${sec.iconBg} flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform shadow-xs`}
              >
                {sec.icon}
              </div>
              <div className="flex flex-col min-w-0">
                <span className="font-bold text-sm text-slate-900 dark:text-slate-100 group-hover:text-[#1677ff] transition-colors truncate">
                  {sec.title}
                </span>
                <span className="text-[11px] text-slate-400 dark:text-slate-500 font-normal">
                  {sec.subtitle}
                </span>
              </div>
            </Link>

            <ul className="flex flex-col gap-1 list-none p-0 m-0">
              {sec.items.map((item) => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={onClose}
                    className="group/item flex items-center justify-between px-2 py-1.5 rounded-lg text-xs font-medium !text-slate-600 dark:!text-slate-300 hover:!text-[#1677ff] dark:hover:!text-blue-400 hover:bg-slate-50 dark:hover:bg-neutral-800/60 transition-all no-underline"
                  >
                    <span className="group-hover/item:translate-x-0.5 transition-transform truncate pr-1">
                      {item.label}
                    </span>
                    {item.badge && (
                      <span
                        className={`shrink-0 text-[9px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded ${item.badgeColor}`}
                      >
                        {item.badge}
                      </span>
                    )}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      {/* Editorial Trust Footer */}
      <div className="bg-slate-50/90 dark:bg-neutral-800/60 px-6 py-3.5 border-t border-slate-100 dark:border-neutral-800 flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-3 text-slate-500 dark:text-slate-400">
          <span className="flex items-center gap-1.5 font-semibold text-slate-700 dark:text-slate-200">
            <SafetyCertificateOutlined className="text-emerald-500 text-sm" />
            Kiểm duyệt kỹ thuật 100%
          </span>
          <span className="text-slate-300 dark:text-slate-600 hidden sm:inline">•</span>
          <span className="hidden sm:inline text-slate-500 dark:text-slate-400">
            Hơn 10.000+ bản vẽ kỹ thuật & hồ sơ BIM đã được kiểm duyệt chất lượng.
          </span>
        </div>
        <Link
          href="/shop"
          onClick={onClose}
          className="font-semibold !text-[#1677ff] hover:!text-blue-700 transition-colors flex items-center gap-1.5 group no-underline"
        >
          <span>Xem tất cả bản vẽ & tài nguyên</span>
          <RightOutlined className="text-[10px] group-hover:translate-x-1 transition-transform" />
        </Link>
      </div>
    </div>
  )
}
