'use client'

import React, { useState, useMemo } from 'react'
import Link from 'next/link'
import {
  Table,
  Button,
  Empty,
  Space,
  Typography,
  Tag,
  Segmented,
  Input,
  Tooltip,
} from 'antd'
import type { ColumnsType } from 'antd/es/table'
import {
  EyeOutlined,
  ShoppingOutlined,
  SearchOutlined,
  FileDoneOutlined,
  CheckCircleOutlined,
  WalletOutlined,
} from '@ant-design/icons'
import { OrderStatus } from '@/components/OrderStatus'
import { formatDateTime } from '@/utilities/formatDateTime'
import { OrderDisputeModal, type DisputeProductItem } from '@/components/dispute/OrderDisputeModal'

export interface OrderTableRow {
  id: number
  code: string
  createdAt: string
  totalAmount: number
  currency: string
  status: 'PENDING' | 'COMPLETED' | 'CANCELLED' | 'REFUNDED'
  itemsCount: number
  productTitles: string[]
  disputeProducts: DisputeProductItem[]
}

interface OrdersTableClientProps {
  initialOrders: OrderTableRow[]
}

export function OrdersTableClient({ initialOrders }: OrdersTableClientProps) {
  const [filterStatus, setFilterStatus] = useState<string>('ALL')
  const [searchKeyword, setSearchKeyword] = useState<string>('')

  const filteredOrders = useMemo(() => {
    return initialOrders.filter((order) => {
      const matchesStatus =
        filterStatus === 'ALL' || order.status === filterStatus
      const matchesSearch =
        !searchKeyword.trim() ||
        order.code.toLowerCase().includes(searchKeyword.toLowerCase()) ||
        order.productTitles.some((title) =>
          title.toLowerCase().includes(searchKeyword.toLowerCase()),
        )
      return matchesStatus && matchesSearch
    })
  }, [initialOrders, filterStatus, searchKeyword])

  const columns: ColumnsType<OrderTableRow> = [
    {
      title: (
        <span className="whitespace-nowrap font-semibold text-xs sm:text-sm text-neutral-700 dark:text-neutral-200">
          Mã đơn hàng
        </span>
      ),
      dataIndex: 'code',
      key: 'code',
      width: 160,
      render: (code: string, record) => (
        <Space orientation="vertical" size={2}>
          <Link
            href={`/orders/${record.id}`}
            className="font-mono text-sm font-semibold text-[#1677ff] hover:underline"
          >
            {code}
          </Link>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            ID: #{record.id}
          </Typography.Text>
        </Space>
      ),
    },
    {
      title: (
        <span className="whitespace-nowrap font-semibold text-xs sm:text-sm text-neutral-700 dark:text-neutral-200">
          Ngày đặt
        </span>
      ),
      dataIndex: 'createdAt',
      key: 'createdAt',
      width: 170,
      sorter: (a, b) =>
        new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
      defaultSortOrder: 'descend',
      render: (dateStr: string) => (
        <span className="text-xs text-neutral-500 whitespace-nowrap">
          {formatDateTime({ date: dateStr, format: 'dd/MM/yyyy HH:mm' })}
        </span>
      ),
    },
    {
      title: (
        <span className="whitespace-nowrap font-semibold text-xs sm:text-sm text-neutral-700 dark:text-neutral-200">
          Sản phẩm
        </span>
      ),
      key: 'items',
      width: 280,
      render: (_, record) => (
        <Space orientation="vertical" style={{ width: '100%' }}>
          <Space size={6} wrap>
            <Tag color="blue" icon={<FileDoneOutlined />} className="m-0 text-xs">
              {record.itemsCount} tài nguyên
            </Tag>
          </Space>
          {record.productTitles.length > 0 && (
            <div className="text-xs text-neutral-800 dark:text-neutral-200 line-clamp-1 max-w-[240px]">
              <Tooltip title={record.productTitles.join(', ')}>
                <span>
                  {record.productTitles[0]}
                  {record.productTitles.length > 1 &&
                    ` và ${record.productTitles.length - 1} bản vẽ khác`}
                </span>
              </Tooltip>
            </div>
          )}
        </Space>
      ),
    },
    {
      title: (
        <span className="whitespace-nowrap font-semibold text-xs sm:text-sm text-neutral-700 dark:text-neutral-200">
          Tổng tiền
        </span>
      ),
      dataIndex: 'totalAmount',
      key: 'totalAmount',
      width: 150,
      align: 'right',
      sorter: (a, b) => a.totalAmount - b.totalAmount,
      render: (amount: number) => (
        <span className="font-mono text-sm font-bold text-[#1677ff] whitespace-nowrap">
          {amount.toLocaleString('vi-VN')} ₫
        </span>
      ),
    },
    {
      title: (
        <span className="whitespace-nowrap font-semibold text-xs sm:text-sm text-neutral-700 dark:text-neutral-200">
          Trạng thái
        </span>
      ),
      dataIndex: 'status',
      key: 'status',
      width: 150,
      align: 'center',
      render: (status: OrderTableRow['status']) => (
        <OrderStatus status={status} />
      ),
    },
    {
      title: (
        <span className="whitespace-nowrap font-semibold text-xs sm:text-sm text-neutral-700 dark:text-neutral-200">
          Thao tác
        </span>
      ),
      key: 'actions',
      width: 200,
      align: 'center',
      render: (_, record) => (
        <Space size="small" wrap>
          <Button
            type="primary"
            ghost
            size="small"
            icon={<EyeOutlined />}
            href={`/orders/${record.id}`}
            className="rounded-md text-xs font-medium"
          >
            Chi tiết
          </Button>

          <OrderDisputeModal
            orderId={record.id}
            orderCode={record.code}
            products={record.disputeProducts}
            buttonVariant="outline"
            buttonSize="sm"
            buttonText="Khiếu nại"
          />
        </Space>
      ),
    },
  ]

  // 4 Financial & Activity metrics
  const totalOrdersCount = initialOrders.length
  const completedOrdersCount = initialOrders.filter((o) => o.status === 'COMPLETED').length
  const totalSpent = initialOrders
    .filter((o) => o.status === 'COMPLETED')
    .reduce((sum, o) => sum + o.totalAmount, 0)
  const totalResources = initialOrders
    .filter((o) => o.status === 'COMPLETED')
    .reduce((sum, o) => sum + o.itemsCount, 0)

  return (
    <div className="space-y-6">
      {/* Scoped CSS to enforce uniform 1-line header & remove jarring dark grey sorter */}
      <style>{`
        .orders-table .ant-table-thead > tr > th {
          white-space: nowrap !important;
          font-size: 13px !important;
          font-weight: 600 !important;
          color: #475569 !important;
          background: #f8fafc !important;
          border-bottom: 1px solid #e2e8f0 !important;
          padding: 14px 16px !important;
          line-height: 1.4 !important;
          vertical-align: middle !important;
        }
        .dark .orders-table .ant-table-thead > tr > th {
          color: #cbd5e1 !important;
          background: #1e293b !important;
          border-bottom-color: #334155 !important;
        }
        .orders-table .ant-table-thead th.ant-table-column-sort {
          background: #f1f5f9 !important;
        }
        .dark .orders-table .ant-table-thead th.ant-table-column-sort {
          background: #0f172a !important;
        }
        .orders-table .ant-table-thead th.ant-table-column-has-sorters:hover {
          background: #edf2f7 !important;
        }
        .dark .orders-table .ant-table-thead th.ant-table-column-has-sorters:hover {
          background: #1e293b !important;
        }
        .orders-table .ant-table-column-sorters {
          display: inline-flex !important;
          align-items: center !important;
          justify-content: flex-start !important;
          vertical-align: middle !important;
        }
        .orders-table .ant-table-tbody > tr > td {
          padding: 14px 16px !important;
          vertical-align: middle !important;
        }
      `}</style>

      {/* 4 Financial & Activity KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <div className="bg-slate-50/70 border border-slate-200/80 rounded-2xl p-4 flex flex-col justify-between shadow-2xs">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Tổng đơn hàng</span>
            <div className="w-7 h-7 rounded-lg bg-blue-100/60 text-[#1677ff] flex items-center justify-center text-sm">
              <ShoppingOutlined />
            </div>
          </div>
          <div className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
            {totalOrdersCount}
          </div>
        </div>

        <div className="bg-slate-50/70 border border-slate-200/80 rounded-2xl p-4 flex flex-col justify-between shadow-2xs">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Đã thanh toán</span>
            <div className="w-7 h-7 rounded-lg bg-emerald-100/60 text-emerald-600 flex items-center justify-center text-sm">
              <CheckCircleOutlined />
            </div>
          </div>
          <div className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
            {completedOrdersCount}
          </div>
        </div>

        <div className="bg-slate-50/70 border border-slate-200/80 rounded-2xl p-4 flex flex-col justify-between shadow-2xs">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Tổng chi tiêu</span>
            <div className="w-7 h-7 rounded-lg bg-indigo-100/60 text-indigo-600 flex items-center justify-center text-sm">
              <WalletOutlined />
            </div>
          </div>
          <div className="text-xl sm:text-2xl font-bold text-[#1677ff] tracking-tight">
            {totalSpent.toLocaleString('vi-VN')} đ
          </div>
        </div>

        <div className="bg-slate-50/70 border border-slate-200/80 rounded-2xl p-4 flex flex-col justify-between shadow-2xs">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Tài nguyên sở hữu</span>
            <div className="w-7 h-7 rounded-lg bg-amber-100/60 text-amber-600 flex items-center justify-center text-sm">
              <FileDoneOutlined />
            </div>
          </div>
          <div className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
            {totalResources}
          </div>
        </div>
      </div>

      {/* Search & Filter Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50/80 p-3 rounded-2xl border border-slate-200/80">
        <Segmented
          options={[
            { label: 'Tất cả', value: 'ALL' },
            { label: 'Đã thanh toán', value: 'COMPLETED' },
            { label: 'Chờ thanh toán', value: 'PENDING' },
            { label: 'Đã hủy', value: 'CANCELLED' },
          ]}
          value={filterStatus}
          onChange={(val) => setFilterStatus(String(val))}
          className="w-fit p-1 bg-white rounded-xl shadow-2xs"
        />

        <div className="w-full sm:w-72">
          <Input
            placeholder="Tìm theo mã hoặc tên bản vẽ..."
            prefix={<SearchOutlined className="text-slate-400 text-xs" />}
            value={searchKeyword}
            onChange={(e) => setSearchKeyword(e.target.value)}
            allowClear
            size="middle"
            className="rounded-xl text-xs"
          />
        </div>
      </div>

      {/* Orders Table */}
      <Table<OrderTableRow>
        dataSource={filteredOrders}
        columns={columns}
        rowKey="id"
        scroll={{ x: 1110 }}
        className="orders-table border border-slate-200/80 rounded-2xl overflow-hidden shadow-2xs"
        pagination={{
          pageSize: 10,
          showSizeChanger: true,
          pageSizeOptions: ['5', '10', '20', '50'],
          showTotal: (total) => `Tổng số ${total} đơn hàng`,
          locale: { items_per_page: '/ trang' },
        }}
        locale={{
          emptyText: (
            <div className="py-12 flex flex-col items-center justify-center text-center">
              <div className="w-16 h-16 rounded-full bg-blue-50 border border-blue-100 flex items-center justify-center mb-3">
                <svg
                  width="36"
                  height="36"
                  viewBox="0 0 48 48"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                  className="text-[#1677ff]"
                >
                  <path
                    d="M16 16V12C16 7.58172 19.5817 4 24 4C28.4183 4 32 7.58172 32 12V16"
                    stroke="#2563eb"
                    strokeWidth="2.4"
                    strokeLinecap="round"
                  />
                  <rect
                    x="9"
                    y="14"
                    width="30"
                    height="28"
                    rx="6"
                    stroke="#2563eb"
                    strokeWidth="2.4"
                    fill="white"
                  />
                  <circle cx="18" cy="20" r="1.8" fill="#93c5fd" />
                  <circle cx="30" cy="20" r="1.8" fill="#93c5fd" />
                  <path
                    d="M20 27C20 27 21.5 29 24 29C26.5 29 28 27 28 27"
                    stroke="#2563eb"
                    strokeWidth="2"
                    strokeLinecap="round"
                  />
                </svg>
              </div>
              <h3 className="text-sm font-bold text-slate-800 !mb-1">Bạn chưa có đơn hàng nào.</h3>
              <p className="text-xs text-slate-400 max-w-sm !mb-4">
                Khám phá kho bản vẽ kiến trúc, kết cấu và MEP chất lượng cao trên KienTaoHub.
              </p>
              <Button
                type="primary"
                icon={<ShoppingOutlined />}
                href="/shop"
                className="!bg-[#1677ff] hover:!bg-blue-600 rounded-lg text-xs font-semibold h-9 px-5 shadow-xs"
              >
                Khám phá bản vẽ ngay
              </Button>
            </div>
          ),
        }}
      />
    </div>
  )
}
