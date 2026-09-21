'use client'

import React from 'react'
import Link from 'next/link'
import {
  Button,
  Descriptions,
  Table,
  Tag,
  Typography,
  Card,
  Space,
  Badge,
} from 'antd'
import type { ColumnsType } from 'antd/es/table'
import {
  ArrowLeftOutlined,
  CheckCircleOutlined,
  FileTextOutlined,
} from '@ant-design/icons'
import { OrderStatus, type StatusOptions } from '@/components/OrderStatus'
import { DownloadButton } from '@/components/download/DownloadButton'
import { OrderDisputeModal } from '@/components/dispute/OrderDisputeModal'
import { OrderTicketsSection } from '@/components/dispute/OrderTicketsSection'
import { formatDateTime } from '@/utilities/formatDateTime'

// Vitest jsdom safety polyfills for antd components
if (typeof window !== 'undefined') {
  if (!window.matchMedia) {
    window.matchMedia = (query) =>
      ({
        matches: false,
        media: query,
        onchange: null,
        addListener: () => {},
        removeListener: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => false,
      } as any)
  }
  if (!window.ResizeObserver) {
    window.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    } as any
  }
}

export interface OrderDetailItem {
  key: string | number
  id: string | number
  productId: number
  productTitle: string
  productSlug: string | number
  /** The product's own format; absent when the record carries none (decision 0018 clause 2). */
  format?: string
  /** The product's own version; absent when the record carries none (decision 0018 clause 2). */
  softwareVersion?: string
  salePrice: number
}

export interface OrderDetailClientProps {
  order: {
    id: number
    code?: string
    createdAt: string
    status: StatusOptions
    totalAmount?: number
    currency?: string
  }
  user: {
    id: number | string
    email?: string
    name?: string | null
  }
  orderItems: OrderDetailItem[]
  productsList: Array<{ id: number; title: string }>
  tickets: any[]
}

/**
 * The format tag, keyed on the tokens the record actually holds.
 *
 * `products.technical_specs_file_format` is **seller-written free text**, so the mapping keys on exact
 * tokens instead of loose substrings ("Models" must not read as LUMION because it contains "LS"), and
 * anything it does not recognise gets the same honest absence an empty record gets — never a guess
 * (decision 0018 clause 2).
 *
 * Ordered mapping, first match wins:
 *   1. empty record ......................... 'Chưa khai báo'
 *   2. .rvt / .rfa / REVIT / BIM ............ BIM / REVIT
 *   3. .skp / SKETCHUP ...................... SKETCHUP
 *   4. .max / 3DS / 3DSMAX .................. 3DS MAX
 *   5. .ls / LUMION ......................... LUMION
 *   6. .pdf / DOC / DOCX .................... TÀI LIỆU
 *   7. MEP .................................. MEP
 *   8. .dwg / DWG / CAD / DXF ............... CAD / DWG
 *   9. anything else (unrecognised) ......... 'Chưa khai báo'
 * The stored domain is .dwg 74, .rvt 40, .skp 27, .max 17, .pdf 2, .ls 1, null 4 (165 rows).
 */
function getFormatTag(formatOrCategory?: string) {
  const normalized = (formatOrCategory || '').trim().toUpperCase()

  // 1. No format on the record (also the only branch for a value nobody recognises)
  if (!normalized) {
    return <span className="text-xs text-slate-400">Chưa khai báo</span>
  }
  // 2.
  if (
    normalized === '.RVT' ||
    normalized === '.RFA' ||
    normalized === 'RVT' ||
    normalized === 'RFA' ||
    normalized.includes('REVIT') ||
    normalized.includes('BIM')
  ) {
    return <Tag color="cyan">BIM / REVIT</Tag>
  }
  // 3.
  if (normalized === '.SKP' || normalized === 'SKP' || normalized.includes('SKETCHUP')) {
    return <Tag color="geekblue">SKETCHUP</Tag>
  }
  // 4.
  if (
    normalized === '.MAX' ||
    normalized === 'MAX' ||
    normalized.includes('3DS') ||
    normalized.includes('3DSMAX')
  ) {
    return <Tag color="volcano">3DS MAX</Tag>
  }
  // 5. exact tokens only: a bare 'LS' substring would capture "Models", "Tools", "CAD Models"
  if (normalized === '.LS' || normalized === 'LS' || normalized.includes('LUMION')) {
    return <Tag color="green">LUMION</Tag>
  }
  // 6.
  if (normalized.includes('PDF') || normalized === '.DOC' || normalized === '.DOCX') {
    return <Tag color="purple">TÀI LIỆU</Tag>
  }
  // 7.
  if (normalized.includes('MEP')) {
    return <Tag color="orange">MEP</Tag>
  }
  // 8. the CAD family only
  if (
    normalized === '.DWG' ||
    normalized === 'DWG' ||
    normalized === '.DXF' ||
    normalized === 'DXF' ||
    normalized.includes('AUTOCAD') ||
    normalized === 'CAD' ||
    // label-shaped values some order fixtures/records carry ('CAD / DWG') name the CAD family; the
    // loose `includes('CAD')` is deliberately NOT used - 'CAD Models' is not a format claim
    normalized === 'CAD / DWG'
  ) {
    return <Tag color="blue">CAD / DWG</Tag>
  }
  // 9. unrecognised non-empty value: the same honest absence as an empty record, never a guess
  return <span className="text-xs text-slate-400">Chưa khai báo</span>
}

export function OrderDetailClient({
  order,
  user,
  orderItems,
  productsList,
  tickets,
}: OrderDetailClientProps) {
  const orderIdentifier = order.code || `#${order.id}`

  const columns: ColumnsType<OrderDetailItem> = [
    {
      title: 'Tên bản vẽ / Tài liệu',
      key: 'productTitle',
      render: (_, record) => (
        <div className="max-w-sm">
          <Link
            href={`/products/${record.productSlug}`}
            className="font-semibold text-foreground hover:text-primary transition-colors line-clamp-2"
          >
            {record.productTitle}
          </Link>
          <span className="text-xs text-muted-foreground font-mono">
            Mã SP: #{record.productId}
          </span>
        </div>
      ),
    },
    {
      title: 'Định dạng',
      dataIndex: 'format',
      key: 'format',
      width: 140,
      render: (format?: string) => getFormatTag(format),
    },
    {
      title: 'Phiên bản phần mềm',
      dataIndex: 'softwareVersion',
      key: 'softwareVersion',
      width: 170,
      render: (version?: string) =>
        version ? <Tag>{version}</Tag> : <span className="text-xs text-slate-400">Chưa khai báo</span>,
    },
    {
      title: 'Đơn giá',
      dataIndex: 'salePrice',
      key: 'salePrice',
      width: 140,
      align: 'right',
      render: (price: number) => (
        <span className="font-mono font-semibold">
          {price.toLocaleString('vi-VN')} ₫
        </span>
      ),
    },
    {
      title: 'Quyền sở hữu',
      key: 'ownership',
      width: 170,
      align: 'center',
      render: () => (
        <Tag color="success" icon={<CheckCircleOutlined />}>
          Quyền tải vĩnh viễn
        </Tag>
      ),
    },
    {
      title: 'Thao tác',
      key: 'actions',
      width: 220,
      align: 'center',
      render: (_, record) => (
        <Space size="small">
          <DownloadButton
            productId={record.productId}
            productTitle={record.productTitle}
            buttonText="Tải xuống"
            type="primary"
            size="small"
          />
          <OrderDisputeModal
            orderId={order.id}
            orderCode={order.code}
            products={productsList}
            preselectedProductId={record.productId}
            buttonVariant="ghost"
            buttonSize="sm"
            buttonText="Báo lỗi"
          />
        </Space>
      ),
    },
  ]

  return (
    <div className="space-y-6">
      {/* Top Breadcrumb */}
      <div className="flex items-center gap-1.5 text-xs text-slate-400">
        <Link href="/" className="hover:text-slate-600 transition-colors">
          Trang chủ
        </Link>
        <span>&gt;</span>
        <Link href="/account" className="text-slate-600 font-medium hover:text-slate-900 transition-colors">
          Tài khoản
        </Link>
        <span>&gt;</span>
        <Link href="/orders" className="text-slate-600 font-medium hover:text-slate-900 transition-colors">
          Lịch sử đơn hàng
        </Link>
        <span>&gt;</span>
        <span className="text-slate-900 font-semibold">{orderIdentifier}</span>
      </div>

      {/* Navigation & Header */}
      <div className="bg-white border border-slate-200/80 rounded-2xl shadow-sm p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <Link href="/orders">
          <Button icon={<ArrowLeftOutlined />} className="rounded-xl text-xs font-medium border-slate-200 hover:border-slate-400">
            Tất cả đơn hàng
          </Button>
        </Link>

        <Space size="middle" wrap>
          <OrderDisputeModal
            orderId={order.id}
            orderCode={order.code}
            products={productsList}
            buttonVariant="outline"
            buttonSize="sm"
            buttonText="Báo lỗi / Khiếu nại"
          />
          <h1 className="text-xs sm:text-sm font-mono px-3.5 py-1.5 bg-blue-50 border border-blue-200/60 rounded-full tracking-wider font-bold text-[#1677ff] inline-block m-0">
            {orderIdentifier}
          </h1>
        </Space>
      </div>

      {/* Order Metadata Descriptions */}
      <Card
        className="shadow-sm border-slate-200/80 rounded-2xl bg-white overflow-hidden"
        styles={{ body: { padding: '24px 28px' } }}
      >
        <Descriptions
          title={
            <div className="flex items-center gap-2.5 text-base font-bold text-slate-900 mb-2">
              <div className="w-8 h-8 rounded-lg bg-blue-50 text-[#1677ff] flex items-center justify-center text-sm border border-blue-100/60">
                <FileTextOutlined />
              </div>
              <span>Thông tin đơn hàng</span>
            </div>
          }
          bordered
          size="middle"
          column={{ xs: 1, sm: 2, md: 3 }}
        >
          <Descriptions.Item label="Mã đơn hàng">
            <Typography.Text copyable code className="font-bold">
              {orderIdentifier}
            </Typography.Text>
          </Descriptions.Item>

          <Descriptions.Item label="Thời gian đặt">
            {formatDateTime({ date: order.createdAt, format: 'dd/MM/yyyy HH:mm:ss' })}
          </Descriptions.Item>

          <Descriptions.Item label="Trạng thái đơn hàng">
            <OrderStatus status={order.status} />
          </Descriptions.Item>

          <Descriptions.Item label="Khách hàng">
            <Typography.Text>{user.email || user.name || 'Khách hàng'}</Typography.Text>
          </Descriptions.Item>

          <Descriptions.Item label="Hình thức giao nhận">
            <Badge status="success" text="Tài nguyên số (Cấp quyền tải tức thì)" />
          </Descriptions.Item>

          <Descriptions.Item label="Tổng tiền thanh toán">
            <Typography.Text strong style={{ color: '#1677ff', fontSize: 18 }}>
              {order.totalAmount !== undefined
                ? `${order.totalAmount.toLocaleString('vi-VN')} ₫`
                : '0 ₫'}
            </Typography.Text>
          </Descriptions.Item>
        </Descriptions>
      </Card>

      {/* Digital Download Rights Table */}
      <Card
        title={
          <div className="flex items-center gap-2.5 text-base font-bold text-slate-900 py-1">
            <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center text-sm border border-emerald-100/60">
              <CheckCircleOutlined />
            </div>
            <span>Danh sách tài nguyên bản vẽ & Quyền tải xuống ({orderItems.length})</span>
          </div>
        }
        className="shadow-sm border-slate-200/80 rounded-2xl bg-white overflow-hidden"
        styles={{ body: { padding: '20px 24px' } }}
      >
        <Table<OrderDetailItem>
          dataSource={orderItems}
          columns={columns}
          rowKey="id"
          pagination={false}
          scroll={{ x: 800 }}
          className="border border-slate-100 rounded-xl overflow-hidden"
        />
      </Card>

      {/* Support & Dispute Tickets Section */}
      <OrderTicketsSection orderId={order.id} initialTickets={tickets} />
    </div>
  )
}
