'use client'

import React, { Suspense } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Avatar, Button, Dropdown, Space, type MenuProps } from 'antd'
import {
  DownOutlined,
  LogoutOutlined,
  SettingOutlined,
  ShopOutlined,
  ShoppingOutlined,
  UserOutlined,
  WalletOutlined,
} from '@ant-design/icons'
import type { Header } from '@/payload-types'
import { GeometricKLogo } from './GeometricKLogo'
import { OpenCartButton } from '@/components/Cart/OpenCart'
import { Search } from '@/components/Search'
import { useAuth } from '@/providers/Auth'
import { CategoryMenu } from './CategoryMenu'
import { MobileMenu } from './MobileMenu'
import { ThemeNavSetting } from './ThemeNavSetting'

type Props = {
  header: Header
}

export function HeaderClient({ header }: Props) {
  const { user, logout } = useAuth()
  const router = useRouter()

  const cmsNavItems = header?.navItems || []

  // Resolve user display credentials
  const displayName = user?.name || (user?.email ? user.email.split('@')[0] : 'Thành viên')
  const userInitial = displayName.charAt(0).toUpperCase()

  const handleLogout = async () => {
    try {
      await logout()
      router.push('/')
    } catch {
      // Ignore logout cleanup error
    }
  }

  // User dropdown menu items (F6)
  const userMenuItems: MenuProps['items'] = [
    {
      key: 'user-summary',
      label: (
        <div className="py-1 px-1">
          <div className="font-semibold text-sm text-foreground">{displayName}</div>
          <div className="text-xs text-muted-foreground">{user?.email}</div>
          {user?.roles?.length ? (
            <div className="mt-1 flex gap-1 flex-wrap">
              {user.roles.map((role) => (
                <span
                  key={role}
                  className="text-[10px] px-1.5 py-0.5 rounded bg-blue-50 dark:bg-blue-950/50 text-[#1677ff] font-medium"
                >
                  {role === 'admin'
                    ? 'Quản trị viên'
                    : role === 'seller'
                      ? 'Người bán'
                      : role === 'buyer'
                        ? 'Khách hàng'
                        : role}
                </span>
              ))}
            </div>
          ) : null}
        </div>
      ),
      disabled: true,
    },
    { type: 'divider' },
    {
      key: 'wallet',
      icon: <WalletOutlined />,
      label: <Link href="/wallet">Ví tiền & Nạp số dư</Link>,
    },
    {
      key: 'orders',
      icon: <ShoppingOutlined />,
      label: <Link href="/orders">Đơn hàng của tôi</Link>,
    },
    {
      key: 'account',
      icon: <SettingOutlined />,
      label: <Link href="/account">Cài đặt tài khoản</Link>,
    },
    ...(user?.roles?.includes('seller') || user?.roles?.includes('admin')
      ? [
          {
            key: 'seller',
            icon: <ShopOutlined />,
            label: <Link href="/seller">Kênh người bán</Link>,
          },
        ]
      : []),
    { type: 'divider' },
    {
      key: 'logout',
      danger: true,
      icon: <LogoutOutlined />,
      label: 'Đăng xuất',
      onClick: handleLogout,
    },
  ]

  return (
    <header
      role="banner"
      className="sticky top-0 z-50 w-full bg-white/95 dark:bg-[#141414]/95 backdrop-blur border-b border-slate-200/80 dark:border-neutral-800 transition-colors shadow-xs"
    >
      {/* Primary Bar (Tier 1): Logo, Search, Quick Links, Cart & Auth */}
      <div className="container mx-auto px-4 lg:px-8 py-3 flex items-center justify-between gap-4">
        {/* Left: Mobile trigger & Geometric K Logo */}
        <div className="flex items-center gap-3">
          <div className="block md:hidden">
            <Suspense fallback={null}>
              <MobileMenu menu={cmsNavItems} />
            </Suspense>
          </div>

          <Link href="/" className="flex items-center gap-3 group text-inherit no-underline">
            <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-slate-900 text-white dark:bg-white dark:text-slate-900 group-hover:scale-105 transition-transform shadow-xs">
              <GeometricKLogo className="w-5 h-5 fill-current" />
            </div>
            <div className="flex flex-col">
              <span className="font-bold text-lg leading-tight tracking-tight text-slate-900 dark:text-slate-100 group-hover:text-[#1677ff] transition-colors">
                Kiến Tạo Hub
              </span>
              <span className="text-[11px] text-[#64748b] dark:text-slate-400 font-normal leading-tight hidden sm:inline">
                Bản vẽ & Tài nguyên BIM
              </span>
            </div>
          </Link>
        </div>

        {/* Center: Search Bar (Desktop) */}
        <div className="hidden md:flex flex-col flex-1 max-w-2xl mx-6 lg:mx-10 justify-center">
          <Suspense fallback={null}>
            <Search
              className="w-full"
              size="middle"
              variant="pill"
              placeholder="Tìm kiếm bản vẽ, Revit, CAD, BIM, ..."
            />
          </Suspense>
          <div className="flex items-center gap-2 mt-1 px-3 text-[11px] text-slate-400 dark:text-slate-500 overflow-hidden whitespace-nowrap">
            <span className="font-medium text-slate-500 dark:text-slate-400">Gợi ý tìm kiếm:</span>
            <Link href="/shop?q=Bi%E1%BB%87t+th%E1%BB%B1" className="hover:text-[#1677ff] hover:underline transition-colors">Biệt thự</Link>
            <span className="text-slate-300 dark:text-slate-600">•</span>
            <Link href="/shop?q=Revit" className="hover:text-[#1677ff] hover:underline transition-colors">Revit</Link>
            <span className="text-slate-300 dark:text-slate-600">•</span>
            <Link href="/shop?q=K%E1%BA%BFt+c%E1%BA%A5u+th%C3%A9p" className="hover:text-[#1677ff] hover:underline transition-colors">Kết cấu thép</Link>
            <span className="text-slate-300 dark:text-slate-600">•</span>
            <Link href="/shop?q=H%E1%BB%87+th%E1%BB%91ng+MEP" className="hover:text-[#1677ff] hover:underline transition-colors">Hệ thống MEP</Link>
            <span className="text-slate-300 dark:text-slate-600">•</span>
            <Link href="/shop?q=Nh%C3%A0+ph%E1%BB%91" className="hover:text-[#1677ff] hover:underline transition-colors">Nhà phố</Link>
          </div>
        </div>

        {/* Right: Quick actions, Cart & User profile */}
        <div className="flex items-center gap-2 sm:gap-4 lg:gap-5">
          {/* Quick link: Đăng bán */}
          <Link
            href="/seller"
            className="hidden sm:inline-flex items-center text-sm font-medium !text-slate-700 dark:!text-slate-200 hover:!text-[#1677ff] dark:hover:!text-[#1677ff] px-2.5 py-1.5 rounded-md hover:bg-slate-100 dark:hover:bg-neutral-800 transition-colors no-underline"
          >
            Đăng bán
          </Link>

          {/* Quick link: Đã mua */}
          <Link
            href="/orders"
            className="hidden sm:inline-flex items-center text-sm font-medium !text-slate-700 dark:!text-slate-200 hover:!text-[#1677ff] dark:hover:!text-[#1677ff] px-2.5 py-1.5 rounded-md hover:bg-slate-100 dark:hover:bg-neutral-800 transition-colors no-underline"
          >
            Đã mua
          </Link>

          {/* Cart Indicator (Badge + ShoppingCartOutlined) */}
          <OpenCartButton />

          {/* Theme Display Setting */}
          <ThemeNavSetting />

          {/* User profile area (F6) */}
          {user ? (
            <Dropdown menu={{ items: userMenuItems }} trigger={['click', 'hover']} placement="bottomRight">
              <button
                type="button"
                className="flex items-center gap-2 p-1 pl-2 pr-2.5 rounded-full hover:bg-slate-100 dark:hover:bg-neutral-800 transition-colors focus:outline-none cursor-pointer border border-slate-200 dark:border-neutral-700"
                aria-label="Tài khoản người dùng"
              >
                <Avatar
                  style={{ backgroundColor: '#0f172a' }}
                  className="bg-slate-900 text-white font-semibold text-xs"
                  icon={!userInitial ? <UserOutlined /> : undefined}
                  size={32}
                >
                  {userInitial || undefined}
                </Avatar>
                <span className="hidden md:inline text-xs font-semibold text-slate-800 dark:text-slate-200 max-w-[120px] truncate">
                  {displayName}
                </span>
                <DownOutlined className="text-[10px] text-slate-400" />
              </button>
            </Dropdown>
          ) : (
            <Space size="small">
              <Button
                href="/login"
                onClick={(e) => {
                  e.preventDefault()
                  router.push('/login')
                }}
                size="middle"
                className="font-medium text-slate-700 dark:text-slate-200 hover:text-[#1677ff]"
              >
                Đăng nhập
              </Button>
              <Button
                type="primary"
                href="/create-account"
                onClick={(e) => {
                  e.preventDefault()
                  router.push('/create-account')
                }}
                size="middle"
                className="!hidden sm:!inline-flex font-medium bg-[#1677ff]"
              >
                Đăng ký
              </Button>
            </Space>
          )}
        </div>
      </div>

      {/* Mobile Search Bar (screens < md) */}
      <div className="block md:hidden px-4 pb-2.5">
        <Suspense fallback={null}>
          <Search
            size="middle"
            variant="pill"
            placeholder="Tìm kiếm bản vẽ CAD, Revit, BIM..."
          />
        </Suspense>
      </div>

      {/* Secondary Mega-Menu Navigation (Desktop >= md) */}
      <div
        role="navigation"
        aria-label="Danh mục bản vẽ kỹ thuật"
        className="hidden md:block border-t border-slate-100 dark:border-neutral-800/80 bg-white dark:bg-[#141414]"
      >
        <Suspense fallback={null}>
          <CategoryMenu cmsNavItems={cmsNavItems} />
        </Suspense>
      </div>
    </header>
  )
}
