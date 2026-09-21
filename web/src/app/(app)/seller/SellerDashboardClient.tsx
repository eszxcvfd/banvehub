'use client'

import React, { useState, useEffect, useMemo } from 'react'
import Link from 'next/link'
import { Dropdown, Button, Table, Tag, Input, type MenuProps } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import {
  WalletOutlined,
  CalendarOutlined,
  DownloadOutlined,
  FileTextOutlined,
  RiseOutlined,
  EditOutlined,
  DownOutlined,
  PlusOutlined,
  ClockCircleOutlined,
  CheckCircleOutlined,
  ExclamationCircleOutlined,
  UnorderedListOutlined,
  SearchOutlined,
  EyeOutlined,
} from '@ant-design/icons'
import { WithdrawalModal } from './WithdrawalModal'
import { WithdrawalHistoryTable, type WithdrawalItem } from './WithdrawalHistoryTable'
import { ProductEditorModal } from './ProductEditorModal'

export interface ProductEarningStat {
  productId: string | number
  productTitle: string
  salesCount: number
  grossRevenue: number
  platformFee: number
  netEarnings: number
}

export interface SellerProductItem {
  id: number | string
  title: string
  slug?: string | null
  price?: number | null
  isFree?: boolean | null
  moderationStatus?: string | null
  moderationNotes?: string | null
  _status?: string | null
  technicalSpecs?: {
    fileFormat?: string | null
    softwareVersion?: string | null
  } | null
  createdAt?: string
}

interface TaxonomyOption {
  id: string | number
  title: string
}

interface SellerDashboardClientProps {
  user: {
    id: number | string
    name?: string | null
    email?: string | null
  }
  profile?: {
    displayName?: string | null
    bio?: string | null
    status?: string | null
  } | null
  balance: {
    availableBalance: number
    pendingBalance: number
    reservedBalance: number
    withdrawnTotal: number
    totalEarned: number
  }
  withdrawals: WithdrawalItem[]
  productEarningsList: ProductEarningStat[]
  products: SellerProductItem[]
  categories?: TaxonomyOption[]
  softwareTypes?: TaxonomyOption[]
  tags?: TaxonomyOption[]
}

// 1. Vector Illustration: Document + Magnifying Glass for Section 3 Empty State
function DocSearchEmptyState() {
  return (
    <div className="py-12 flex flex-col items-center justify-center text-center">
      <div className="w-16 h-16 rounded-full bg-blue-50/80 border border-blue-100 flex items-center justify-center mb-3">
        <svg
          width="36"
          height="36"
          viewBox="0 0 48 48"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="text-[#1677ff]"
        >
          <path
            d="M12 9C12 7.89543 12.8954 7 14 7H28L36 15V37C36 38.1046 35.1046 39 34 39H14C12.8954 39 12 38.1046 12 37V9Z"
            stroke="#93c5fd"
            strokeWidth="2.2"
            fill="white"
          />
          <line x1="17" y1="18" x2="25" y2="18" stroke="#93c5fd" strokeWidth="2.2" strokeLinecap="round" />
          <line x1="17" y1="24" x2="27" y2="24" stroke="#93c5fd" strokeWidth="2.2" strokeLinecap="round" />
          <line x1="17" y1="30" x2="23" y2="30" stroke="#93c5fd" strokeWidth="2.2" strokeLinecap="round" />
          <circle cx="28" cy="27" r="6.5" stroke="#2563eb" strokeWidth="2.4" fill="white" />
          <line x1="33" y1="32" x2="38" y2="37" stroke="#2563eb" strokeWidth="2.6" strokeLinecap="round" />
        </svg>
      </div>
      <p className="text-sm font-semibold text-slate-700">Chưa có dữ liệu</p>
      <p className="text-xs text-slate-400 mt-1">
        Khi có giao dịch, thông tin doanh thu sẽ được hiển thị tại đây.
      </p>
    </div>
  )
}

// 2. Vector Illustration: Open Folder with Doc for Section 4 Empty State
function FolderEmptyState({ onOpenModal }: { onOpenModal: () => void }) {
  return (
    <div className="py-14 flex flex-col items-center justify-center text-center">
      <div className="w-18 h-18 rounded-full bg-blue-50/80 border border-blue-100 flex items-center justify-center mb-3.5 p-3">
        <svg
          width="40"
          height="40"
          viewBox="0 0 48 48"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d="M17 11C17 10.4477 17.4477 10 18 10H30C30.5523 10 31 10.4477 31 11V22H17V11Z"
            stroke="#93c5fd"
            strokeWidth="2"
            fill="white"
          />
          <line x1="20" y1="14" x2="28" y2="14" stroke="#93c5fd" strokeWidth="2" strokeLinecap="round" />
          <line x1="20" y1="18" x2="25" y2="18" stroke="#93c5fd" strokeWidth="2" strokeLinecap="round" />
          <path
            d="M6 16C6 14.8954 6.89543 14 8 14H18L21 17H40C41.1046 17 42 17.8954 42 19V36C42 37.1046 41.1046 38 40 38H8C6.89543 38 6 37.1046 6 36V16Z"
            fill="#eff6ff"
          />
          <path
            d="M6 22H42V36C42 37.1046 41.1046 38 40 38H8C6.89543 38 6 37.1046 6 36V22Z"
            stroke="#2563eb"
            strokeWidth="2.4"
            fill="white"
          />
          <path
            d="M16 22L19 25H29L32 22"
            stroke="#2563eb"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>
      <h3 className="text-sm font-bold text-slate-800">Chưa có bản vẽ nào</h3>
      <p className="text-xs text-slate-400 mt-1 max-w-sm">
        Bắt đầu đăng bán các tài nguyên của bạn ngay để tiếp cận khách hàng trên KienTaoHub.
      </p>
      <Button
        type="primary"
        icon={<PlusOutlined />}
        onClick={onOpenModal}
        className="bg-[#1677ff] hover:bg-blue-600 font-medium rounded-lg h-9 px-4 text-xs mt-4"
      >
        Đăng bản vẽ ngay
      </Button>
    </div>
  )
}

export function SellerDashboardClient({
  user,
  profile,
  balance,
  withdrawals,
  productEarningsList,
  products,
  categories = [],
  softwareTypes = [],
  tags = [],
}: SellerDashboardClientProps) {
  const [withdrawalModalOpen, setWithdrawalModalOpen] = useState(false)
  const [createProductModalOpen, setCreateProductModalOpen] = useState(false)
  const [productTab, setProductTab] = useState<'all' | 'published' | 'pending' | 'paused' | 'hidden'>('all')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [searchKeyword, setSearchKeyword] = useState<string>('')

  // Check URL query parameters on mount to auto-open modal if requested (e.g. redirected from /seller/products/new)
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search)
      if (
        params.get('modal') === 'new-product' ||
        params.get('new') === '1' ||
        params.get('create') === 'true'
      ) {
        // Defer the state update out of the effect body (the pattern used at CheckoutPage.tsx:84):
        // calling setState synchronously in an effect is the lint error this file was carrying.
        queueMicrotask(() => setCreateProductModalOpen(true))
      }
    }
  }, [])

  const handleCloseCreateModal = () => {
    setCreateProductModalOpen(false)
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href)
      if (
        url.searchParams.has('modal') ||
        url.searchParams.has('new') ||
        url.searchParams.has('create')
      ) {
        url.searchParams.delete('modal')
        url.searchParams.delete('new')
        url.searchParams.delete('create')
        window.history.replaceState(null, '', url.pathname + (url.search ? url.search : ''))
      }
    }
  }

  // KPI calculations for products
  const totalCount = products.length
  const pendingCount = products.filter(
    (p) => p.moderationStatus === 'submitted' || p.moderationStatus === 'in_review',
  ).length
  const approvedCount = products.filter(
    (p) => p.moderationStatus === 'approved' || p._status === 'published',
  ).length
  const changesCount = products.filter((p) => p.moderationStatus === 'changes_requested').length
  const hiddenCount = products.filter(
    (p) => p._status === 'draft' || p.moderationStatus === 'rejected',
  ).length

  // Total sales across all products
  const totalSalesCount = useMemo(() => {
    return productEarningsList.reduce((acc, curr) => acc + curr.salesCount, 0)
  }, [productEarningsList])

  // Filter products by tab and status filter and keyword
  const filteredProducts = useMemo(() => {
    return products.filter((p) => {
      // Tab filter
      if (productTab === 'published' && !(p.moderationStatus === 'approved' || p._status === 'published')) {
        return false
      }
      if (
        productTab === 'pending' &&
        !(p.moderationStatus === 'submitted' || p.moderationStatus === 'in_review')
      ) {
        return false
      }
      if (productTab === 'paused' && p.moderationStatus !== 'changes_requested') {
        return false
      }
      if (
        productTab === 'hidden' &&
        !(p._status === 'draft' || p.moderationStatus === 'rejected')
      ) {
        return false
      }

      // Dropdown status filter
      if (statusFilter !== 'all') {
        if (statusFilter === 'published' && !(p.moderationStatus === 'approved' || p._status === 'published')) {
          return false
        }
        if (statusFilter === 'pending' && !(p.moderationStatus === 'submitted' || p.moderationStatus === 'in_review')) {
          return false
        }
        if (statusFilter === 'changes_requested' && p.moderationStatus !== 'changes_requested') {
          return false
        }
        if (statusFilter === 'rejected' && p.moderationStatus !== 'rejected') {
          return false
        }
        if (statusFilter === 'draft' && p._status !== 'draft') {
          return false
        }
      }

      // Search keyword
      if (searchKeyword.trim()) {
        const q = searchKeyword.toLowerCase()
        const matchTitle = p.title?.toLowerCase().includes(q)
        const matchSlug = p.slug?.toLowerCase().includes(q)
        const matchFormat = p.technicalSpecs?.fileFormat?.toLowerCase().includes(q)
        if (!matchTitle && !matchSlug && !matchFormat) return false
      }

      return true
    })
  }, [products, productTab, statusFilter, searchKeyword])

  // Status badge helper
  const getProductStatusBadge = (status?: string | null, pubStatus?: string | null) => {
    if (pubStatus === 'published' || status === 'approved') {
      return <Tag color="success">Đang bán</Tag>
    }
    switch (status) {
      case 'submitted':
        return <Tag color="warning">Chờ duyệt</Tag>
      case 'in_review':
        return <Tag color="processing">Đang thẩm định</Tag>
      case 'changes_requested':
        return <Tag color="orange">Cần chỉnh sửa</Tag>
      case 'rejected':
        return <Tag color="error">Từ chối</Tag>
      default:
        return <Tag color="default">Bản nháp</Tag>
    }
  }

  // Product table columns
  const productColumns: ColumnsType<SellerProductItem> = [
    {
      title: 'Tên tài nguyên / Sản phẩm',
      key: 'title',
      render: (_: any, record: SellerProductItem) => (
        <div>
          <div className="font-semibold text-slate-800 text-sm">{record.title}</div>
          <div className="text-[11px] text-slate-400 font-mono mt-0.5">
            ID: #{record.id} {record.slug ? `• Slug: ${record.slug}` : ''}
          </div>
        </div>
      ),
    },
    {
      title: 'Định dạng file',
      key: 'format',
      width: 140,
      render: (_: any, record: SellerProductItem) => {
        const specs = record.technicalSpecs
        return (
          <div>
            {specs?.fileFormat ? (
              <span className="font-mono text-xs px-2 py-0.5 rounded bg-slate-100 border border-slate-200 text-slate-700">
                {specs.fileFormat}
              </span>
            ) : (
              <span className="text-slate-400 text-xs">—</span>
            )}
            {specs?.softwareVersion && (
              <span className="text-[11px] block text-slate-400 mt-0.5">
                {specs.softwareVersion}
              </span>
            )}
          </div>
        )
      },
    },
    {
      title: 'Đơn giá (VND)',
      key: 'price',
      width: 140,
      render: (_: any, record: SellerProductItem) => {
        if (record.isFree || record.price === 0) {
          return <span className="text-emerald-600 font-semibold text-xs">Miễn phí</span>
        }
        return (
          <span className="font-semibold text-slate-800 text-sm">
            {Number(record.price || 0).toLocaleString('vi-VN')} đ
          </span>
        )
      },
    },
    {
      title: 'Trạng thái kiểm duyệt',
      key: 'status',
      width: 150,
      render: (_: any, record: SellerProductItem) =>
        getProductStatusBadge(record.moderationStatus, record._status),
    },
    {
      title: 'Ghi chú ban kiểm duyệt',
      key: 'notes',
      width: 220,
      render: (_: any, record: SellerProductItem) => {
        if (!record.moderationNotes) {
          return <span className="text-xs text-slate-400 italic">Không có</span>
        }
        return (
          <div className="text-xs text-amber-700 bg-amber-50 p-1.5 rounded border border-amber-200/80 font-normal leading-tight">
            {record.moderationNotes}
          </div>
        )
      },
    },
    {
      title: 'Thao tác',
      key: 'actions',
      width: 130,
      align: 'right',
      render: (_: any, record: SellerProductItem) => (
        <div className="flex items-center justify-end gap-1.5">
          {record._status === 'published' && record.slug ? (
            <Link href={`/products/${record.slug}`} target="_blank">
              <Button size="small" icon={<EyeOutlined />} className="text-xs rounded-md">
                Xem
              </Button>
            </Link>
          ) : (
            <span className="text-xs text-slate-400">—</span>
          )}
        </div>
      ),
    },
  ]

  // Product Earnings columns
  const earningsColumns: ColumnsType<ProductEarningStat> = [
    {
      title: 'Tên tài nguyên',
      key: 'productTitle',
      render: (_: any, record: ProductEarningStat) => (
        <div>
          <div className="font-semibold text-slate-800 text-xs">{record.productTitle}</div>
          <div className="text-[11px] text-slate-400 font-mono">ID: #{record.productId}</div>
        </div>
      ),
    },
    {
      title: 'Lượt bán',
      dataIndex: 'salesCount',
      key: 'salesCount',
      align: 'center',
      width: 110,
      render: (count: number) => (
        <span className="font-semibold text-slate-800 text-xs">{count.toLocaleString('vi-VN')}</span>
      ),
    },
    {
      title: 'Doanh số',
      dataIndex: 'grossRevenue',
      key: 'grossRevenue',
      align: 'right',
      width: 140,
      render: (val: number) => (
        <span className="font-medium text-slate-800 text-xs">{val.toLocaleString('vi-VN')} đ</span>
      ),
    },
    {
      title: 'Phí nền tảng',
      dataIndex: 'platformFee',
      key: 'platformFee',
      align: 'right',
      width: 140,
      render: (val: number) => (
        <span className="text-xs text-slate-400">-{val.toLocaleString('vi-VN')} đ</span>
      ),
    },
    {
      title: 'Thực nhận',
      dataIndex: 'netEarnings',
      key: 'netEarnings',
      align: 'right',
      width: 150,
      render: (val: number) => (
        <span className="font-bold text-emerald-600 text-xs">{val.toLocaleString('vi-VN')} đ</span>
      ),
    },
  ]

  // Dropdown menu items for Status Filter
  const statusMenuItems: MenuProps['items'] = [
    {
      key: 'all',
      label: 'Tất cả trạng thái',
      onClick: () => setStatusFilter('all'),
    },
    {
      key: 'published',
      label: 'Đang bán (Công khai)',
      onClick: () => setStatusFilter('published'),
    },
    {
      key: 'pending',
      label: 'Chờ duyệt / Thẩm định',
      onClick: () => setStatusFilter('pending'),
    },
    {
      key: 'changes_requested',
      label: 'Cần chỉnh sửa',
      onClick: () => setStatusFilter('changes_requested'),
    },
    {
      key: 'rejected',
      label: 'Từ chối',
      onClick: () => setStatusFilter('rejected'),
    },
    {
      key: 'draft',
      label: 'Bản nháp',
      onClick: () => setStatusFilter('draft'),
    },
  ]

  // Display name & avatar initial
  const displayName = profile?.displayName || user.name || user.email?.split('@')[0] || 'admin'
  const userInitial = displayName.charAt(0).toUpperCase()

  return (
    <div className="w-full bg-[#f8fafc] min-h-screen pb-16">
      <div className="max-w-[1240px] mx-auto px-4 sm:px-6 pt-5 space-y-6">
        {/* Top Breadcrumb */}
        <div className="flex items-center gap-1.5 text-xs text-slate-400">
          <Link href="/" className="hover:text-slate-600 transition-colors">
            Trang chủ
          </Link>
          <span>&gt;</span>
          <span className="text-slate-600 font-medium">Tài khoản</span>
        </div>

        {/* Profile Banner */}
        <div className="relative overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm">
          {/* Architectural facade graphic overlay on the right */}
          <div
            className="absolute inset-y-0 right-0 w-1/2 pointer-events-none opacity-20 bg-right bg-no-repeat bg-cover hidden md:block"
            style={{
              backgroundImage: `url('/media/curated/bestseller-6-highrise.jpg')`,
              maskImage: 'linear-gradient(to left, rgba(0,0,0,0.9) 0%, rgba(0,0,0,0.3) 60%, transparent 100%)',
              WebkitMaskImage: 'linear-gradient(to left, rgba(0,0,0,0.9) 0%, rgba(0,0,0,0.3) 60%, transparent 100%)',
            }}
          />

          <div className="relative z-10 p-6 md:p-8 flex flex-col md:flex-row md:items-center justify-between gap-6">
            {/* Left Avatar & Name */}
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 rounded-full bg-[#0f172a] text-white flex items-center justify-center font-bold text-2xl shadow-sm flex-shrink-0">
                {userInitial}
              </div>
              <div className="space-y-1">
                <div className="flex items-center gap-2.5">
                  <h1 className="text-xl font-bold text-slate-900 tracking-tight">{displayName}</h1>
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-600 border border-slate-200">
                    Nhà bán hàng
                  </span>
                </div>
                <p className="text-xs text-slate-500">
                  {profile?.bio || 'Quản lý tài chính, doanh thu, số dư và dữ liệu bán hàng của bạn tại đây.'}
                </p>
              </div>
            </div>

            {/* Right Action Buttons */}
            <div className="flex items-center gap-3 self-start md:self-center">
              <Link href="/account">
                <Button
                  icon={<EditOutlined />}
                  className="rounded-lg h-9 text-xs font-medium text-slate-700 border-slate-200 hover:border-slate-300 hover:text-slate-900 shadow-sm"
                >
                  Chỉnh sửa thông tin
                </Button>
              </Link>

              <Dropdown
                menu={{
                  items: [
                    {
                      key: 'withdraw-request',
                      icon: <PlusOutlined />,
                      label: 'Yêu cầu rút tiền mới',
                      onClick: () => setWithdrawalModalOpen(true),
                    },
                    {
                      key: 'withdraw-policy',
                      icon: <CalendarOutlined />,
                      label: 'Quy định rút tiền (chu kỳ 7 ngày)',
                    },
                  ],
                }}
                placement="bottomRight"
              >
                <Button
                  type="primary"
                  icon={<WalletOutlined />}
                  onClick={() => setWithdrawalModalOpen(true)}
                  className="bg-[#1677ff] hover:bg-blue-600 font-medium rounded-lg h-9 text-xs shadow-sm flex items-center gap-1"
                >
                  Rút tiền
                  <DownOutlined className="text-[10px] ml-0.5" />
                </Button>
              </Dropdown>
            </div>
          </div>
        </div>

        {/* Section 1: Tổng quan tài chính & Doanh thu */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-slate-900">Tổng quan tài chính & Doanh thu</h2>
            <span className="text-xs text-slate-400">Cập nhật theo thời gian thực (VND)</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3.5">
            {/* 1. Số dư khả dụng */}
            <div className="bg-white border border-slate-200/80 rounded-xl p-4 shadow-sm flex flex-col justify-between">
              <div>
                <div className="w-8 h-8 rounded-lg bg-blue-50 text-[#1677ff] flex items-center justify-center text-base mb-3">
                  <WalletOutlined />
                </div>
                <div className="text-xs font-medium text-slate-500">Số dư khả dụng</div>
                <div className="text-2xl font-bold text-slate-900 tracking-tight mt-1">
                  {balance.availableBalance.toLocaleString('vi-VN')} đ
                </div>
              </div>
              <div className="pt-3">
                <WithdrawalModal
                  availableBalance={balance.availableBalance}
                  open={withdrawalModalOpen}
                  onOpenChange={setWithdrawalModalOpen}
                  variant="green-pill"
                />
              </div>
            </div>

            {/* 2. Tạm giữ 7 ngày */}
            <div className="bg-white border border-slate-200/80 rounded-xl p-4 shadow-sm flex flex-col justify-between">
              <div>
                <div className="w-8 h-8 rounded-lg bg-blue-50 text-[#1677ff] flex items-center justify-center text-base mb-3">
                  <CalendarOutlined />
                </div>
                <div className="text-xs font-medium text-slate-500">Tạm giữ 7 ngày</div>
                <div className="text-2xl font-bold text-slate-900 tracking-tight mt-1">
                  {balance.pendingBalance.toLocaleString('vi-VN')} đ
                </div>
              </div>
              <p className="text-[11px] text-slate-400 mt-3">Tự động mở khóa sau chu kỳ giữ tiền</p>
            </div>

            {/* 3. Đang xử lý rút */}
            <div className="bg-white border border-slate-200/80 rounded-xl p-4 shadow-sm flex flex-col justify-between">
              <div>
                <div className="w-8 h-8 rounded-lg bg-blue-50 text-[#1677ff] flex items-center justify-center text-base mb-3">
                  <DownloadOutlined />
                </div>
                <div className="text-xs font-medium text-slate-500">Đang xử lý rút</div>
                <div className="text-2xl font-bold text-slate-900 tracking-tight mt-1">
                  {balance.reservedBalance.toLocaleString('vi-VN')} đ
                </div>
              </div>
              <p className="text-[11px] text-slate-400 mt-3">Liên hệ để biết trạng thái</p>
            </div>

            {/* 4. Tổng tiền đã rút */}
            <div className="bg-white border border-slate-200/80 rounded-xl p-4 shadow-sm flex flex-col justify-between">
              <div>
                <div className="w-8 h-8 rounded-lg bg-blue-50 text-[#1677ff] flex items-center justify-center text-base mb-3">
                  <FileTextOutlined />
                </div>
                <div className="text-xs font-medium text-slate-500">Tổng tiền đã rút</div>
                <div className="text-2xl font-bold text-slate-900 tracking-tight mt-1">
                  {balance.withdrawnTotal.toLocaleString('vi-VN')} đ
                </div>
              </div>
              <p className="text-[11px] text-slate-400 mt-3">Đã chuyển thành công về ngân hàng</p>
            </div>

            {/* 5. Tổng thu nhập tích lũy */}
            <div className="bg-white border border-slate-200/80 rounded-xl p-4 shadow-sm flex flex-col justify-between">
              <div>
                <div className="w-8 h-8 rounded-lg bg-blue-50 text-[#1677ff] flex items-center justify-center text-base mb-3">
                  <RiseOutlined />
                </div>
                <div className="text-xs font-medium text-slate-500">Tổng thu nhập tích lũy</div>
                <div className="text-2xl font-bold text-slate-900 tracking-tight mt-1">
                  {balance.totalEarned.toLocaleString('vi-VN')} đ
                </div>
              </div>
              <p className="text-[11px] text-slate-400 mt-3">
                Tổng doanh thu bán bản vẽ từ trước tới nay
              </p>
            </div>
          </div>
        </div>

        {/* Section 2: Lịch sử rút tiền & Chi trả (Payouts) */}
        <div className="bg-white border border-slate-200/80 rounded-xl p-5 shadow-sm space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div>
              <h2 className="text-base font-bold text-slate-900">
                Lịch sử rút tiền & Chi trả (Payouts)
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Theo dõi trạng thái xử lý các lệnh rút tiền và tỉ lệ thu nhập thanh toán hàng.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setWithdrawalModalOpen(true)}
              className="text-xs font-medium text-[#1677ff] hover:underline flex items-center gap-1 cursor-pointer"
            >
              Xem tất cả &rarr;
            </button>
          </div>

          <WithdrawalHistoryTable initialWithdrawals={withdrawals} />
        </div>

        {/* Section 3: Doanh thu chi tiết theo từng sản phẩm */}
        <div className="bg-white border border-slate-200/80 rounded-xl p-5 shadow-sm space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div>
              <h2 className="text-base font-bold text-slate-900">
                Doanh thu chi tiết theo từng sản phẩm
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Báo cáo số lượt bán, doanh số snapshot, phí nền tảng và thực nhận của người bán.
              </p>
            </div>
            <span className="text-xs text-slate-400">
              {productEarningsList.length} sản phẩm {totalSalesCount} lượt bán
            </span>
          </div>

          {productEarningsList.length === 0 ? (
            <DocSearchEmptyState />
          ) : (
            <Table
              columns={earningsColumns}
              dataSource={productEarningsList.map((item) => ({ ...item, key: item.productId }))}
              pagination={{ pageSize: 5, size: 'small', showSizeChanger: false }}
              size="middle"
            />
          )}
        </div>

        {/* 4 Product Metric KPI Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
          {/* 1. TỔNG BẢN VẼ */}
          <div className="bg-white border border-slate-200/80 rounded-xl p-4 shadow-sm flex items-center gap-3.5">
            <div className="w-10 h-10 rounded-lg bg-blue-50 text-[#1677ff] flex items-center justify-center text-lg flex-shrink-0">
              <FileTextOutlined />
            </div>
            <div>
              <div className="text-[11px] font-bold tracking-wider text-[#1677ff] uppercase">
                Tổng bản vẽ
              </div>
              <div className="text-2xl font-bold text-slate-900 mt-0.5">{totalCount}</div>
            </div>
          </div>

          {/* 2. CHỜ KIỂM DUYỆT */}
          <div className="bg-white border border-slate-200/80 rounded-xl p-4 shadow-sm flex items-center gap-3.5">
            <div className="w-10 h-10 rounded-lg bg-amber-50 text-[#f59e0b] flex items-center justify-center text-lg flex-shrink-0">
              <ClockCircleOutlined />
            </div>
            <div>
              <div className="text-[11px] font-bold tracking-wider text-[#f59e0b] uppercase">
                Chờ kiểm duyệt
              </div>
              <div className="text-2xl font-bold text-slate-900 mt-0.5">{pendingCount}</div>
            </div>
          </div>

          {/* 3. ĐÃ PHÁT HÀNH */}
          <div className="bg-white border border-slate-200/80 rounded-xl p-4 shadow-sm flex items-center gap-3.5">
            <div className="w-10 h-10 rounded-lg bg-emerald-50 text-[#10b981] flex items-center justify-center text-lg flex-shrink-0">
              <CheckCircleOutlined />
            </div>
            <div>
              <div className="text-[11px] font-bold tracking-wider text-[#10b981] uppercase">
                Đã phát hành
              </div>
              <div className="text-2xl font-bold text-slate-900 mt-0.5">{approvedCount}</div>
            </div>
          </div>

          {/* 4. CẦN CHỈNH SỬA */}
          <div className="bg-white border border-slate-200/80 rounded-xl p-4 shadow-sm flex items-center gap-3.5">
            <div className="w-10 h-10 rounded-lg bg-rose-50 text-[#ef4444] flex items-center justify-center text-lg flex-shrink-0">
              <ExclamationCircleOutlined />
            </div>
            <div>
              <div className="text-[11px] font-bold tracking-wider text-[#ef4444] uppercase">
                Cần chỉnh sửa
              </div>
              <div className="text-2xl font-bold text-slate-900 mt-0.5">{changesCount}</div>
            </div>
          </div>
        </div>

        {/* Section 4: Danh sách bản vẽ & tài nguyên số */}
        <div className="bg-white border border-slate-200/80 rounded-xl p-5 shadow-sm space-y-4">
          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
            <div>
              <h2 className="text-base font-bold text-slate-900">Danh sách bản vẽ & tài nguyên số</h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Toàn bộ sản phẩm bạn đã đăng bán và đang quản lý.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <Button
                type="primary"
                icon={<PlusOutlined />}
                onClick={() => setCreateProductModalOpen(true)}
                className="bg-[#1677ff] hover:bg-blue-600 font-medium rounded-lg h-8 text-xs flex items-center gap-1 shadow-sm"
              >
                Đăng bản vẽ mới
              </Button>

              <Dropdown menu={{ items: statusMenuItems }} placement="bottomRight">
                <Button
                  icon={<UnorderedListOutlined />}
                  className="rounded-lg h-8 text-xs text-slate-600 flex items-center gap-1"
                >
                  {statusFilter === 'all'
                    ? 'Tất cả trạng thái'
                    : statusFilter === 'published'
                    ? 'Đang bán'
                    : statusFilter === 'pending'
                    ? 'Chờ duyệt'
                    : statusFilter === 'changes_requested'
                    ? 'Cần chỉnh sửa'
                    : statusFilter === 'rejected'
                    ? 'Từ chối'
                    : 'Bản nháp'}
                  <DownOutlined className="text-[10px] ml-1" />
                </Button>
              </Dropdown>
            </div>
          </div>

          {/* Filter Tabs matching mockup */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100">
            <div className="flex items-center gap-6 text-xs font-medium">
              <button
                type="button"
                onClick={() => setProductTab('all')}
                className={`py-2.5 transition-colors relative ${
                  productTab === 'all'
                    ? 'text-[#1677ff] font-semibold'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                Tất cả ({totalCount})
                {productTab === 'all' && (
                  <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#1677ff] rounded-full" />
                )}
              </button>

              <button
                type="button"
                onClick={() => setProductTab('published')}
                className={`py-2.5 transition-colors relative ${
                  productTab === 'published'
                    ? 'text-[#1677ff] font-semibold'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                Đang bán ({approvedCount})
                {productTab === 'published' && (
                  <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#1677ff] rounded-full" />
                )}
              </button>

              <button
                type="button"
                onClick={() => setProductTab('pending')}
                className={`py-2.5 transition-colors relative ${
                  productTab === 'pending'
                    ? 'text-[#1677ff] font-semibold'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                Chờ duyệt ({pendingCount})
                {productTab === 'pending' && (
                  <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#1677ff] rounded-full" />
                )}
              </button>

              <button
                type="button"
                onClick={() => setProductTab('paused')}
                className={`py-2.5 transition-colors relative ${
                  productTab === 'paused'
                    ? 'text-[#1677ff] font-semibold'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                Tạm dừng ({changesCount})
                {productTab === 'paused' && (
                  <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#1677ff] rounded-full" />
                )}
              </button>

              <button
                type="button"
                onClick={() => setProductTab('hidden')}
                className={`py-2.5 transition-colors relative ${
                  productTab === 'hidden'
                    ? 'text-[#1677ff] font-semibold'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                Đã ẩn ({hiddenCount})
                {productTab === 'hidden' && (
                  <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#1677ff] rounded-full" />
                )}
              </button>
            </div>

            {/* Quick search inside tab list */}
            {products.length > 0 && (
              <div className="pb-2 sm:pb-0">
                <Input
                  placeholder="Tìm kiếm bản vẽ..."
                  prefix={<SearchOutlined className="text-slate-400 text-xs" />}
                  value={searchKeyword}
                  onChange={(e) => setSearchKeyword(e.target.value)}
                  allowClear
                  size="small"
                  className="rounded-lg text-xs w-48"
                />
              </div>
            )}
          </div>

          {/* Products List Body */}
          {filteredProducts.length === 0 ? (
            <FolderEmptyState onOpenModal={() => setCreateProductModalOpen(true)} />
          ) : (
            <Table
              columns={productColumns}
              dataSource={filteredProducts.map((p) => ({ ...p, key: p.id }))}
              pagination={{ pageSize: 10, size: 'small', showSizeChanger: false }}
              size="middle"
            />
          )}
        </div>
      </div>

      {/* Product Editor Modal Popup Window */}
      <ProductEditorModal
        open={createProductModalOpen}
        onClose={handleCloseCreateModal}
        categories={categories}
        softwareTypes={softwareTypes}
        tags={tags}
      />
    </div>
  )
}
