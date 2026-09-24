'use client'

import React, { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import {
  Drawer,
  Button,
  Input,
  Menu,
  Avatar,
  Tag,
} from 'antd'
import type { MenuProps } from 'antd'
import {
  MenuOutlined,
  UserOutlined,
  ShoppingOutlined,
  SettingOutlined,
  LogoutOutlined,
  LoginOutlined,
  UserAddOutlined,
  WalletOutlined,
  ShopOutlined,
  CustomerServiceOutlined,
  AppstoreOutlined,
  HomeOutlined,
  BuildOutlined,
  ThunderboltOutlined,
  BlockOutlined,
  CompassOutlined,
  FileDoneOutlined,
} from '@ant-design/icons'

import type { Header } from '@/payload-types'
import { useAuth } from '@/providers/Auth'
import { GeometricKLogo } from './GeometricKLogo'
import { createUrl } from '@/utilities/createUrl'

interface Props {
  menu?: Header['navItems']
}

type MenuItem = Required<MenuProps>['items'][number]

function getHref(link: NonNullable<Header['navItems']>[number]['link']): string {
  if (link.type === 'reference' && typeof link.reference?.value === 'object' && link.reference.value?.slug) {
    const relation = link.reference.relationTo !== 'pages' ? `/${link.reference.relationTo}` : ''
    return `${relation}/${link.reference.value.slug}`
  }
  return link.url || '/'
}

export function MobileMenu({ menu }: Props) {
  const { user, logout } = useAuth()
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [isOpen, setIsOpen] = useState(false)

  // Track search query
  const currentQuery = searchParams?.get('q') || ''

  // Automatically close Drawer on route or query string change after initial mount
  const isMounted = useRef(false)
  useEffect(() => {
    if (!isMounted.current) {
      isMounted.current = true
      return
    }
    setIsOpen(false)
  }, [pathname, searchParams])

  const closeMobileMenu = () => setIsOpen(false)

  // Auto close Drawer if window expands to desktop breakpoint (>= 768px)
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth >= 768) {
        setIsOpen(false)
      }
    }
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  const handleSearch = (value: string) => {
    const trimmed = value.trim()
    const newParams = new URLSearchParams()
    if (trimmed) {
      newParams.set('q', trimmed)
    }
    router.push(createUrl('/shop', newParams))
    closeMobileMenu()
  }

  const handleLogout = async () => {
    try {
      await logout()
    } catch {
      // Ignore logout cleanup error
    }
    closeMobileMenu()
    router.push('/logout')
  }

  // Active key in inline menu
  const selectedKeys = useMemo(() => {
    const fullPath = searchParams?.toString() ? `${pathname}?${searchParams.toString()}` : pathname
    return [fullPath, pathname]
  }, [pathname, searchParams])

  // Build inline Menu structure
  const menuItems = useMemo<MenuItem[]>(() => {
    const items: MenuItem[] = [
      {
        key: '/',
        icon: <HomeOutlined />,
        label: (
          <Link href="/" onClick={closeMobileMenu}>
            Trang chủ
          </Link>
        ),
      },
      {
        key: '/shop',
        icon: <AppstoreOutlined />,
        label: (
          <Link href="/shop" onClick={closeMobileMenu}>
            Tất cả bản vẽ & Shop
          </Link>
        ),
      },
      {
        key: 'categories-group',
        icon: <BuildOutlined />,
        label: 'Danh mục bản vẽ',
        children: [
          {
            key: '/shop?category=ban-ve-kien-truc',
            icon: <BuildOutlined />,
            label: (
              <Link href="/shop?category=ban-ve-kien-truc" onClick={closeMobileMenu}>
                Bản vẽ Kiến trúc
              </Link>
            ),
          },
          {
            key: '/shop?category=ban-ve-ket-cau',
            icon: <BlockOutlined />,
            label: (
              <Link href="/shop?category=ban-ve-ket-cau" onClick={closeMobileMenu}>
                Bản vẽ Kết cấu
              </Link>
            ),
          },
          {
            key: '/shop?category=ban-ve-co-dien-mep',
            icon: <ThunderboltOutlined />,
            label: (
              <Link href="/shop?category=ban-ve-co-dien-mep" onClick={closeMobileMenu}>
                Bản vẽ Cơ điện (MEP)
              </Link>
            ),
          },
          {
            key: '/shop?category=mo-hinh-bim-revit',
            icon: <CompassOutlined />,
            label: (
              <Link href="/shop?category=mo-hinh-bim-revit" onClick={closeMobileMenu}>
                Mô hình BIM Revit
              </Link>
            ),
          },
          {
            key: '/shop?category=thu-vien-sketchup-3dsmax',
            icon: <AppstoreOutlined />,
            label: (
              <Link href="/shop?category=thu-vien-sketchup-3dsmax" onClick={closeMobileMenu}>
                Thư viện 3D & Render
              </Link>
            ),
          },
          {
            key: '/shop?category=ho-so-quy-hoach-ha-tang',
            icon: <FileDoneOutlined />,
            label: (
              <Link href="/shop?category=ho-so-quy-hoach-ha-tang" onClick={closeMobileMenu}>
                Hồ sơ Quy hoạch & Hạ tầng
              </Link>
            ),
          },
          {
            key: '/shop?category=thiet-ke-noi-that',
            icon: <BuildOutlined />,
            label: (
              <Link href="/shop?category=thiet-ke-noi-that" onClick={closeMobileMenu}>
                Thiết kế Nội thất
              </Link>
            ),
          },
          {
            key: '/shop?category=ban-ve-canh-quan-san-vuon',
            icon: <CompassOutlined />,
            label: (
              <Link href="/shop?category=ban-ve-canh-quan-san-vuon" onClick={closeMobileMenu}>
                Bản vẽ Cảnh quan & Sân vườn
              </Link>
            ),
          },
        ],
      },
    ]

    // CMS links if any
    if (menu && menu.length > 0) {
      items.push({
        key: 'cms-nav-group',
        type: 'group',
        label: 'Khám phá thêm',
        children: menu.map((item, idx) => {
          const href = getHref(item.link)
          return {
            key: `cms-item-${idx}-${href}`,
            label: (
              <Link href={href} onClick={closeMobileMenu}>
                {item.link.label}
              </Link>
            ),
          }
        }),
      })
    }

    // Utility links
    items.push({
      key: 'utilities-group',
      type: 'group',
      label: 'Dịch vụ & Tiện ích',
      children: [
        {
          key: '/wallet',
          icon: <WalletOutlined style={{ color: '#52c41a' }} />,
          label: (
            <Link href="/wallet" onClick={closeMobileMenu}>
              Ví điện tử
            </Link>
          ),
        },
        {
          key: '/seller',
          icon: <ShopOutlined style={{ color: '#1677ff' }} />,
          label: (
            <Link href="/seller" onClick={closeMobileMenu}>
              Trở thành người bán
            </Link>
          ),
        },
        {
          key: 'support-link',
          icon: <CustomerServiceOutlined style={{ color: '#fa8c16' }} />,
          label: (
            <a href="tel:19006868" onClick={closeMobileMenu}>
              Hỗ trợ: 1900 6868
            </a>
          ),
        },
      ],
    })

    return items
  }, [menu])

  return (
    <>
      <Button
        type="default"
        icon={<MenuOutlined style={{ fontSize: 18 }} />}
        onClick={() => setIsOpen(true)}
        aria-label="Menu điều hướng"
        className="flex items-center justify-center h-10 w-10 border-neutral-300 dark:border-neutral-700 hover:border-[#1677ff] dark:hover:border-[#1677ff]"
      />

      <Drawer
        title={
          <div className="flex items-center gap-2.5 py-1">
            <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-slate-900 text-white dark:bg-white dark:text-slate-900">
              <GeometricKLogo className="w-5 h-5 fill-current" />
            </div>
            <div className="flex flex-col">
              <span className="font-bold text-base text-neutral-900 dark:text-neutral-100 leading-none">
                Kiến Tạo Hub
              </span>
              <span className="text-[11px] text-neutral-500 font-normal mt-0.5">
                Sàn giao dịch CAD/BIM
              </span>
            </div>
          </div>
        }
        placement="left"
        size={320}
        open={isOpen}
        onClose={closeMobileMenu}
        styles={{
          body: {
            padding: 0,
            display: 'flex',
            flexDirection: 'column',
            overflowY: 'auto',
          },
          footer: {
            padding: 0,
          },
        }}
        footer={
          user ? (
            <div className="p-4 border-t border-neutral-200 dark:border-neutral-800 bg-neutral-50/70 dark:bg-neutral-900/60">
              <div className="flex items-center gap-3 mb-3">
                <Avatar
                  size={40}
                  icon={<UserOutlined />}
                  className="bg-[#1677ff] text-white flex-shrink-0"
                >
                  {user.name ? user.name.charAt(0).toUpperCase() : user.email?.charAt(0).toUpperCase()}
                </Avatar>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-sm truncate text-neutral-900 dark:text-neutral-100">
                    {user.name || 'Thành viên Kiến Tạo'}
                  </div>
                  <div className="text-xs text-neutral-500 truncate">{user.email}</div>
                  <div className="mt-1">
                    {user.roles?.includes('seller') ? (
                      <Tag color="green" className="text-[10px] leading-tight px-1.5 py-0">
                        Người bán
                      </Tag>
                    ) : (
                      <Tag color="blue" className="text-[10px] leading-tight px-1.5 py-0">
                        Khách hàng
                      </Tag>
                    )}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 mb-2.5">
                <Button
                  size="small"
                  icon={<ShoppingOutlined />}
                  onClick={() => {
                    router.push('/orders')
                    closeMobileMenu()
                  }}
                  className="text-xs flex items-center justify-center"
                >
                  Đơn hàng
                </Button>
                <Button
                  size="small"
                  icon={<SettingOutlined />}
                  onClick={() => {
                    router.push('/account')
                    closeMobileMenu()
                  }}
                  className="text-xs flex items-center justify-center"
                >
                  Tài khoản
                </Button>
              </div>

              <Button
                danger
                block
                size="middle"
                icon={<LogoutOutlined />}
                onClick={handleLogout}
                className="flex items-center justify-center text-xs"
              >
                Đăng xuất
              </Button>
            </div>
          ) : (
            <div className="p-4 border-t border-neutral-200 dark:border-neutral-800 bg-neutral-50/70 dark:bg-neutral-900/60">
              <div className="text-center mb-3">
                <div className="font-medium text-sm text-neutral-900 dark:text-neutral-100">
                  Tài khoản Kiến Tạo Hub
                </div>
                <div className="text-xs text-neutral-500 mt-0.5">
                  Đăng nhập để xem bản vẽ & tải tài nguyên
                </div>
              </div>
              <div className="flex flex-col gap-2">
                <Button
                  type="primary"
                  block
                  icon={<LoginOutlined />}
                  onClick={() => {
                    router.push('/login')
                    closeMobileMenu()
                  }}
                >
                  Đăng nhập
                </Button>
                <Button
                  block
                  icon={<UserAddOutlined />}
                  onClick={() => {
                    router.push('/create-account')
                    closeMobileMenu()
                  }}
                >
                  Đăng ký tài khoản
                </Button>
              </div>
            </div>
          )
        }
      >
        {/* Search Section */}
        <div className="p-3 border-b border-neutral-100 dark:border-neutral-800 bg-neutral-50/50 dark:bg-neutral-900/30">
          <Input.Search
            placeholder="Tìm kiếm bản vẽ, CAD, BIM..."
            allowClear
            enterButton="Tìm"
            size="middle"
            key={currentQuery}
            defaultValue={currentQuery}
            onSearch={handleSearch}
          />
        </div>

        {/* Inline Navigation Menu */}
        <nav aria-label="Mobile Navigation" className="flex-1 py-1">
          <Menu
            mode="inline"
            selectedKeys={selectedKeys}
            defaultOpenKeys={['categories-group']}
            className="border-none"
            items={menuItems}
          />
        </nav>
      </Drawer>
    </>
  )
}
