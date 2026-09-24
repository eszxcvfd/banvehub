'use client'

import React, { useMemo } from 'react'
import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import { Menu, Popover, type MenuProps } from 'antd'
import {
  ApartmentOutlined,
  AppstoreOutlined,
  BankOutlined,
  BuildOutlined,
  DownOutlined,
  FormatPainterOutlined,
  MenuOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons'
import type { Header } from '@/payload-types'
import { CMSLink } from '@/components/Link'
import { MegaMenuContent } from './MegaMenuContent'

interface CategoryMenuProps {
  cmsNavItems?: Header['navItems']
}

export function CategoryMenu({ cmsNavItems }: CategoryMenuProps) {
  const pathname = usePathname()
  const searchParams = useSearchParams()

  // Active mega-menu key detection based on URL
  const activeCategoryKey = useMemo(() => {
    if (pathname !== '/shop') return ''
    const category = searchParams?.get('category')
    const q = searchParams?.get('q')?.toLowerCase() || ''
    if (category === 'ban-ve-kien-truc') {
      if (q.includes('biệt thự')) return 'villa'
      return 'civil-architecture'
    }
    if (category === 'ban-ve-ket-cau') return 'steel-structure'
    if (category === 'ban-ve-co-dien-mep') return 'mep'
    if (category === 'mo-hinh-bim-revit') return 'bim-revit'
    if (category === 'thiet-ke-noi-that') return 'interior-3d'
    if (!category && !q) return 'all-drawings'
    return ''
  }, [pathname, searchParams])

  const categoryMenuItems: MenuProps['items'] = [
    {
      key: 'all-drawings',
      label: (
        <Popover
          content={<MegaMenuContent />}
          placement="bottomLeft"
          trigger={['hover', 'click']}
          arrow={false}
          rootClassName="megamenu-popover"
          classNames={{ root: 'megamenu-popover', container: 'megamenu-popover-container' }}
          styles={{
            container: {
              padding: 0,
              background: 'transparent',
              boxShadow: 'none',
            },
          }}
        >
          <Link
            href="/shop"
            className="inline-flex items-center gap-1.5 font-bold text-slate-900 dark:text-slate-100 hover:text-[#1677ff] transition-colors"
          >
            <MenuOutlined className="text-base mr-1.5" />
            <span className="sr-only">Tất cả bản vẽ</span>
            <span>Tất cả danh mục</span>
            <DownOutlined className="text-[10px] text-slate-400 ml-0.5" />
          </Link>
        </Popover>
      ),
    },
    {
      key: 'civil-architecture',
      label: (
        <Link href="/shop?category=ban-ve-kien-truc">
          <span className="sr-only">Kiến trúc dân dụng</span>
          <span>Kiến trúc</span>
        </Link>
      ),
      children: [
        {
          key: 'kien-truc-all',
          label: <Link href="/shop?category=ban-ve-kien-truc">Tất cả bản vẽ kiến trúc</Link>,
        },
        {
          key: 'kien-truc-nha-pho',
          label: <Link href="/shop?category=ban-ve-kien-truc&q=nhà+phố">Nhà phố & Nhà ống</Link>,
        },
        {
          key: 'kien-truc-chung-cu',
          label: <Link href="/shop?category=ban-ve-kien-truc&q=chung+cư">Chung cư mini & Căn hộ</Link>,
        },
        {
          key: 'kien-truc-khach-san',
          label: <Link href="/shop?category=ban-ve-kien-truc&q=khách+sạn">Khách sạn & Văn phòng</Link>,
        },
        {
          key: 'kien-truc-quy-hoach',
          label: <Link href="/shop?category=ho-so-quy-hoach-ha-tang">Quy hoạch & Hạ tầng</Link>,
        },
      ],
    },
    {
      key: 'steel-structure',
      label: (
        <Link href="/shop?category=ban-ve-ket-cau">
          <span className="sr-only">Kết cấu thép</span>
          <span>Kết cấu</span>
        </Link>
      ),
      children: [
        {
          key: 'structure-all',
          label: <Link href="/shop?category=ban-ve-ket-cau">Tất cả bản vẽ kết cấu</Link>,
        },
        {
          key: 'structure-factory',
          label: <Link href="/shop?category=ban-ve-ket-cau&q=nhà+xưởng">Nhà xưởng & Công nghiệp</Link>,
        },
        {
          key: 'structure-steel',
          label: <Link href="/shop?category=ban-ve-ket-cau&q=thép+tiền+chế">Khung thép tiền chế</Link>,
        },
        {
          key: 'structure-concrete',
          label: <Link href="/shop?category=ban-ve-ket-cau&q=bê+tông">Bê tông cốt thép</Link>,
        },
        {
          key: 'structure-foundation',
          label: <Link href="/shop?category=ban-ve-ket-cau&q=móng">Nền móng & Thuyết minh</Link>,
        },
      ],
    },
    {
      key: 'mep',
      label: (
        <Link href="/shop?category=ban-ve-co-dien-mep">
          <span className="sr-only">Điện nước MEP</span>
          <span>Cơ điện MEP</span>
        </Link>
      ),
      children: [
        {
          key: 'mep-all',
          label: <Link href="/shop?category=ban-ve-co-dien-mep">Tất cả hồ sơ MEP</Link>,
        },
        {
          key: 'mep-water',
          label: <Link href="/shop?category=ban-ve-co-dien-mep&q=cấp+thoát+nước">Cấp thoát nước công trình</Link>,
        },
        {
          key: 'mep-electrical',
          label: <Link href="/shop?category=ban-ve-co-dien-mep&q=chiếu+sáng">Điện chiếu sáng & Động lực</Link>,
        },
        {
          key: 'mep-hvac',
          label: <Link href="/shop?category=ban-ve-co-dien-mep&q=HVAC">HVAC & Thông gió</Link>,
        },
        {
          key: 'mep-fire',
          label: <Link href="/shop?category=ban-ve-co-dien-mep&q=PCCC">PCCC thẩm duyệt</Link>,
        },
      ],
    },
    {
      key: 'bim-revit',
      label: (
        <Link href="/shop?category=mo-hinh-bim-revit">
          <span>BIM Revit</span>
        </Link>
      ),
      children: [
        {
          key: 'bim-all',
          label: <Link href="/shop?category=mo-hinh-bim-revit">Tất cả mô hình BIM</Link>,
        },
        {
          key: 'bim-arch',
          label: <Link href="/shop?category=mo-hinh-bim-revit&softwareType=revit">Revit Architecture</Link>,
        },
        {
          key: 'bim-struct',
          label: <Link href="/shop?category=mo-hinh-bim-revit&q=structure">Revit Structure</Link>,
        },
        {
          key: 'bim-mep',
          label: <Link href="/shop?category=mo-hinh-bim-revit&q=mep">Revit MEP</Link>,
        },
        {
          key: 'bim-family',
          label: <Link href="/shop?category=mo-hinh-bim-revit&q=family">Thư viện Family Revit</Link>,
        },
      ],
    },
    {
      key: 'interior-3d',
      label: (
        <Link href="/shop?category=thiet-ke-noi-that">
          <span className="sr-only">3D Nội thất</span>
          <span>Nội thất</span>
        </Link>
      ),
      children: [
        {
          key: 'interior-all',
          label: <Link href="/shop?category=thiet-ke-noi-that">Tất cả thiết kế nội thất</Link>,
        },
        {
          key: 'interior-living',
          label: <Link href="/shop?category=thiet-ke-noi-that&q=phòng+khách">Nội thất phòng khách & Bếp</Link>,
        },
        {
          key: 'interior-bedroom',
          label: <Link href="/shop?category=thiet-ke-noi-that&q=phòng+ngủ">Nội thất phòng ngủ & Tắm</Link>,
        },
        {
          key: 'interior-commercial',
          label: <Link href="/shop?category=thiet-ke-noi-that&q=showroom">Showroom & Văn phòng</Link>,
        },
        {
          key: 'interior-3dsmax',
          label: <Link href="/shop?category=thu-vien-sketchup-3dsmax">Thư viện SketchUp & 3ds Max</Link>,
        },
      ],
    },
    {
      key: 'villa',
      label: (
        <Link href="/shop?category=thu-vien-sketchup-3dsmax">
          <span className="sr-only">Phối cảnh 3D</span>
          <span>3D & Phối cảnh</span>
        </Link>
      ),
      children: [
        {
          key: 'villa-all',
          label: <Link href="/shop?category=thu-vien-sketchup-3dsmax">Tất cả mẫu 3D & Phối cảnh</Link>,
        },
        {
          key: 'villa-3d-render',
          label: <Link href="/shop?category=thu-vien-sketchup-3dsmax">Phối cảnh 3D ngoại thất</Link>,
        },
        {
          key: 'villa-modern',
          label: <Link href="/shop?category=ban-ve-kien-truc&q=hiện+đại">Biệt thự hiện đại</Link>,
        },
        {
          key: 'villa-classic',
          label: <Link href="/shop?category=ban-ve-kien-truc&q=tân+cổ+điển">Biệt thự tân cổ điển</Link>,
        },
        {
          key: 'villa-garden',
          label: <Link href="/shop?category=ban-ve-kien-truc&q=vườn">Biệt thự vườn / Nghỉ dưỡng</Link>,
        },
        {
          key: 'villa-landscape',
          label: <Link href="/shop?category=ban-ve-canh-quan-san-vuon">Cảnh quan & Sân vườn</Link>,
        },
      ],
    },
  ]

  return (
    <div className="container mx-auto px-4 lg:px-8 flex items-center justify-between">
      <Menu
        mode="horizontal"
        selectedKeys={activeCategoryKey ? [activeCategoryKey] : []}
        items={categoryMenuItems}
        className="border-b-0 bg-transparent flex-1 text-sm font-medium category-nav-menu"
        style={{ borderBottom: 'none', background: 'transparent' }}
      />
      <Link
        href="/shop?category=ban-ve-kien-truc&q=biệt+thự"
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
      >
        Biệt thự
      </Link>
      {cmsNavItems && cmsNavItems.length > 0 && (
        <div className="sr-only">
          {cmsNavItems.map((item) => (
            <CMSLink
              key={item.id}
              {...item.link}
              appearance="link"
              className="text-slate-500 hover:text-[#1677ff] dark:text-slate-400 dark:hover:text-[#1677ff] text-xs font-medium transition-colors"
            />
          ))}
        </div>
      )}
    </div>
  )
}
