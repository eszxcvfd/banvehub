'use client'

import React, { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  Layout,
  Menu,
  Card,
  Avatar,
  Tag,
  Typography,
  Button,
  Drawer,
  type MenuProps,
} from 'antd'
import {
  UserOutlined,
  EnvironmentOutlined,
  ShoppingOutlined,
  WalletOutlined,
  CloudDownloadOutlined,
  BellOutlined,
  LogoutOutlined,
  MenuOutlined,
} from '@ant-design/icons'
import { useAuth } from '@/providers/Auth'
import type { User } from '@/payload-types'

interface AccountDashboardLayoutProps {
  initialUser?: User | null
  children: React.ReactNode
}

export const AccountDashboardLayout: React.FC<AccountDashboardLayoutProps> = ({
  initialUser,
  children,
}) => {
  const { user: authUser } = useAuth()
  const user = authUser || initialUser
  const pathname = usePathname()
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false)

  // Resolve display name & initials
  const displayName = user?.name || (user?.email ? user.email.split('@')[0] : 'Thành viên')
  const userInitial = displayName.charAt(0).toUpperCase()

  // Resolve primary role badge
  const roleInfo = React.useMemo(() => {
    const roles = user?.roles || []
    if (roles.includes('admin')) return { text: 'Quản trị viên', color: 'red' }
    if (roles.includes('seller')) return { text: 'Người bán uy tín', color: 'purple' }
    if (roles.includes('financeAdmin')) return { text: 'Kế toán', color: 'orange' }
    if (roles.includes('moderator')) return { text: 'Kiểm duyệt viên', color: 'green' }
    return { text: 'Khách hàng thành viên', color: 'blue' }
  }, [user?.roles])

  // Determine active menu key from pathname
  const activeKey = React.useMemo(() => {
    if (pathname === '/account') return 'profile'
    if (pathname.startsWith('/account/addresses')) return 'addresses'
    if (pathname.startsWith('/orders')) return 'orders'
    if (pathname.startsWith('/wallet')) return 'wallet'
    if (pathname.startsWith('/notifications')) return 'notifications'
    return 'profile'
  }, [pathname])

  // Section title for mobile top bar
  const sectionTitle = React.useMemo(() => {
    switch (activeKey) {
      case 'profile':
        return 'Hồ sơ tài khoản'
      case 'addresses':
        return 'Sổ địa chỉ'
      case 'orders':
        return 'Lịch sử đơn hàng'
      case 'wallet':
        return 'Ví kỹ thuật số'
      case 'notifications':
        return 'Thông báo'
      default:
        return 'Trung tâm tài khoản'
    }
  }, [activeKey])

  const menuItems: MenuProps['items'] = [
    {
      key: 'profile',
      icon: <UserOutlined className="text-base" />,
      label: <Link href="/account">Hồ sơ tài khoản</Link>,
    },
    {
      key: 'addresses',
      icon: <EnvironmentOutlined className="text-base" />,
      label: <Link href="/account/addresses">Sổ địa chỉ</Link>,
    },
    {
      key: 'orders',
      icon: <ShoppingOutlined className="text-base" />,
      label: <Link href="/orders">Lịch sử đơn hàng</Link>,
    },
    {
      key: 'wallet',
      icon: <WalletOutlined className="text-base" />,
      label: <Link href="/wallet">Ví kỹ thuật số</Link>,
    },
    {
      key: 'downloads',
      icon: <CloudDownloadOutlined className="text-base" />,
      label: <Link href="/orders">Tải xuống bản quyền</Link>,
    },
    {
      key: 'notifications',
      icon: <BellOutlined className="text-base" />,
      label: (
        <Link href="/notifications" data-testid="nav-notifications">
          Thông báo
        </Link>
      ),
    },
    {
      type: 'divider',
    },
    {
      key: 'logout',
      danger: true,
      icon: <LogoutOutlined className="text-base" />,
      label: <Link href="/logout">Đăng xuất</Link>,
    },
  ]

  return (
    <div className="w-full">
      {/* Mobile Top Bar & Drawer (< 768px) */}
      <div className="block md:hidden mb-6">
        <Card
          className="shadow-sm border-slate-200/80 rounded-2xl"
          styles={{ body: { padding: '12px 16px' } }}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Avatar size={42} style={{ backgroundColor: '#0f172a' }} className="font-bold shadow-sm">
                {userInitial}
              </Avatar>
              <div>
                <div className="font-bold text-sm leading-tight text-slate-900">
                  {displayName}
                </div>
                <div className="text-xs text-slate-400">
                  {sectionTitle}
                </div>
              </div>
            </div>
            <Button
              icon={<MenuOutlined />}
              onClick={() => setMobileDrawerOpen(true)}
              aria-label="Mở menu tài khoản"
              className="rounded-lg text-xs"
            >
              Menu
            </Button>
          </div>
        </Card>

        <Drawer
          title="Menu tài khoản"
          placement="left"
          onClose={() => setMobileDrawerOpen(false)}
          open={mobileDrawerOpen}
          size={300}
        >
          <div className="text-center py-4 border-b border-slate-100 mb-4">
            <Avatar size={64} style={{ backgroundColor: '#0f172a' }} className="mb-2.5 font-bold text-xl shadow-sm">
              {userInitial}
            </Avatar>
            <div className="font-bold text-base text-slate-900">
              {displayName}
            </div>
            <div className="text-xs text-slate-400">{user?.email}</div>
            <Tag color={roleInfo.color} className="mt-2 text-xs px-2.5 py-0.5 rounded-full font-medium">
              {roleInfo.text}
            </Tag>
          </div>

          <Menu
            mode="inline"
            selectedKeys={[activeKey]}
            items={menuItems}
            onClick={() => setMobileDrawerOpen(false)}
            className="border-r-0"
          />
        </Drawer>
      </div>

      {/* Desktop Sider + Content (>= 768px) */}
      <Layout className="!bg-transparent flex flex-col md:flex-row gap-6 lg:gap-8">
        <Layout.Sider
          width={280}
          breakpoint="md"
          collapsedWidth={0}
          trigger={null}
          className="hidden md:block !bg-transparent shrink-0"
          style={{ background: 'transparent' }}
        >
          <div className="sticky top-24 flex flex-col gap-4">
            {/* User Header Card */}
            <Card
              className="shadow-sm border-slate-200/80 rounded-2xl text-center bg-white overflow-hidden relative"
              styles={{ body: { padding: '24px 16px' } }}
            >
              <div className="w-18 h-18 mx-auto mb-3">
                <Avatar
                  size={72}
                  style={{ backgroundColor: '#0f172a' }}
                  className="shadow-sm font-bold text-2xl text-white ring-4 ring-slate-100"
                >
                  {userInitial}
                </Avatar>
              </div>
              <Typography.Title level={5} className="!mb-0 !text-slate-900 font-bold tracking-tight">
                {displayName}
              </Typography.Title>
              <Typography.Text type="secondary" className="text-xs truncate block max-w-[220px] mx-auto mt-1 text-slate-400">
                {user?.email}
              </Typography.Text>
              <div className="mt-2.5">
                <Tag color={roleInfo.color} className="text-xs px-3 py-0.5 rounded-full font-semibold border-0">
                  {roleInfo.text}
                </Tag>
              </div>
            </Card>

            {/* Navigation Menu Card */}
            <Card
              className="shadow-sm border-slate-200/80 rounded-2xl overflow-hidden bg-white"
              styles={{ body: { padding: '8px' } }}
            >
              <Menu
                mode="inline"
                selectedKeys={[activeKey]}
                items={menuItems}
                className="border-r-0 !bg-transparent text-xs font-medium custom-account-menu"
              />
            </Card>
          </div>
        </Layout.Sider>

        {/* Content Area */}
        <Layout.Content className="!bg-transparent flex-1 min-w-0">
          {children}
        </Layout.Content>
      </Layout>
    </div>
  )
}
