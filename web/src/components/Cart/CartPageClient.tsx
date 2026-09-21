'use client'

import React from 'react'
import Link from 'next/link'
import {
  Row,
  Col,
  Card,
  Table,
  Button,
  Popconfirm,
  Empty,
  Typography,
  Breadcrumb,
  Tag,
  Statistic,
} from 'antd'
import {
  ShoppingCartOutlined,
  DeleteOutlined,
  ClearOutlined,
  ArrowLeftOutlined,
  ArrowRightOutlined,
  SafetyCertificateFilled,
  ThunderboltFilled,
} from '@ant-design/icons'
import { useCart } from '@/providers/Cart'
import { Media } from '@/components/Media'
import type { Product, Media as MediaType } from '@/payload-types'

const { Title, Text } = Typography

export function CartPageClient() {
  const { cart, isLoading, removeItem, incrementItem, decrementItem, clearCart } = useCart()

  const items = cart?.items || []
  const totalItems = items.reduce(
    (acc: number, item: { quantity?: number | null }) => acc + (item?.quantity || 1),
    0,
  )

  const subtotal =
    cart?.subtotal ||
    items.reduce((acc: number, item: any) => {
      const price = typeof item.product === 'object' ? item.product?.price || 0 : 0
      return acc + price * (item.quantity || 1)
    }, 0)

  // No voucher: no coupon/voucher/discount/promo table exists, and `POST /api/v1/orders/purchase`
  // charges each item's own price (decision 0002), so the cart may only show that same sum.
  const finalTotal = subtotal

  const columns = [
    {
      title: 'Bản vẽ / Tài nguyên',
      key: 'product',
      render: (_: any, record: any) => {
        const product = (typeof record.product === 'object' ? record.product : null) as Product | null
        if (!product) return <span>Sản phẩm</span>
        const image = (product.gallery?.[0]?.image || product.meta?.image) as MediaType | undefined
        const fileFormat = product.technicalSpecs?.fileFormat

        return (
          <div className="flex items-center gap-3">
            <div className="w-16 h-16 rounded-md overflow-hidden bg-neutral-100 dark:bg-neutral-800 shrink-0 border border-neutral-200 dark:border-neutral-700 relative">
              {image && typeof image !== 'string' && (
                <Media fill imgClassName="object-cover" resource={image} />
              )}
            </div>
            <div>
              <Link
                href={`/products/${product.slug}`}
                className="font-medium text-neutral-900 dark:text-neutral-100 hover:text-[#1677ff] line-clamp-2"
              >
                {product.title}
              </Link>
              {fileFormat && (
                <Tag color="blue" className="mt-1 font-mono text-xs">
                  {fileFormat}
                </Tag>
              )}
            </div>
          </div>
        )
      },
    },
    {
      title: 'Đơn giá',
      dataIndex: ['product', 'price'],
      key: 'price',
      width: 140,
      render: (price: number) => (
        <span className="font-mono text-sm">{(price || 0).toLocaleString('vi-VN')} ₫</span>
      ),
    },
    {
      title: 'Số lượng',
      key: 'quantity',
      width: 130,
      render: (_: any, record: any) => (
        <div className="flex items-center gap-1">
          <Button
            size="small"
            disabled={isLoading || (record.quantity || 1) <= 1}
            onClick={() => record.id && decrementItem(record.id)}
          >
            -
          </Button>
          <span className="font-mono px-2 text-sm">{record.quantity || 1}</span>
          <Button
            size="small"
            disabled={isLoading}
            onClick={() => record.id && incrementItem(record.id)}
          >
            +
          </Button>
        </div>
      ),
    },
    {
      title: 'Tạm tính',
      key: 'total',
      width: 160,
      render: (_: any, record: any) => {
        const unitPrice =
          typeof record.product === 'object' ? record.product?.price || 0 : 0
        const total = unitPrice * (record.quantity || 1)
        return (
          <span className="font-mono font-semibold text-[#1677ff] text-sm">
            {total.toLocaleString('vi-VN')} ₫
          </span>
        )
      },
    },
    {
      title: 'Thao tác',
      key: 'action',
      width: 90,
      render: (_: any, record: any) => (
        <Popconfirm
          title="Xóa bản vẽ này khỏi giỏ hàng?"
          okText="Xóa"
          cancelText="Hủy"
          okButtonProps={{ danger: true }}
          onConfirm={() => record.id && removeItem(record.id)}
        >
          <Button
            type="text"
            danger
            icon={<DeleteOutlined />}
            aria-label="Xóa"
            disabled={isLoading}
          />
        </Popconfirm>
      ),
    },
  ]

  if (items.length === 0) {
    return (
      <div>
        <Breadcrumb
          items={[
            { title: <Link href="/">Trang chủ</Link> },
            { title: 'Giỏ hàng' },
          ]}
          className="mb-6"
        />
        <Card className="py-16 text-center shadow-sm">
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description="Giỏ hàng của bạn đang trống. Chưa có bản vẽ kiến trúc hoặc kết cấu nào."
          >
            <Button
              type="primary"
              size="large"
              href="/shop"
              icon={<ShoppingCartOutlined />}
              className="mt-4 !bg-[#1677ff]"
            >
              Khám phá kho bản vẽ ngay
            </Button>
          </Empty>
        </Card>
      </div>
    )
  }

  return (
    <div>
      <Breadcrumb
        items={[
          { title: <Link href="/">Trang chủ</Link> },
          { title: 'Giỏ hàng' },
        ]}
        className="mb-6"
      />

      <div className="flex items-center justify-between mb-6">
        <Title level={2} className="!mb-0">
          Giỏ hàng của bạn
        </Title>
        <Tag color="blue" className="text-sm px-3 py-1">
          {totalItems} bản vẽ
        </Tag>
      </div>

      <Row gutter={[24, 24]}>
        {/* Cart items table */}
        <Col xs={24} lg={16}>
          <Card className="shadow-sm" styles={{ body: { padding: 0 } }}>
            <Table
              dataSource={items}
              columns={columns}
              rowKey="id"
              pagination={false}
              className="cart-table"
            />
            <div className="p-4 flex justify-between items-center border-t border-neutral-100 dark:border-neutral-800">
              <Button href="/shop" icon={<ArrowLeftOutlined />}>
                Tiếp tục chọn bản vẽ
              </Button>
              <Popconfirm
                title="Bạn có chắc chắn muốn làm trống toàn bộ giỏ hàng?"
                okText="Xóa tất cả"
                cancelText="Hủy"
                okButtonProps={{ danger: true }}
                onConfirm={() => clearCart()}
              >
                <Button danger icon={<ClearOutlined />} disabled={isLoading}>
                  Làm trống giỏ hàng
                </Button>
              </Popconfirm>
            </div>
          </Card>
        </Col>

        {/* Cart summary */}
        <Col xs={24} lg={8}>
          <Card title="Tóm tắt đơn hàng" className="shadow-sm sticky top-20">
            <div className="space-y-3 mb-4">
              <div className="flex justify-between text-sm">
                <Text type="secondary">Tạm tính ({totalItems} sản phẩm):</Text>
                <Text strong className="font-mono">
                  {subtotal.toLocaleString('vi-VN')} ₫
                </Text>
              </div>

              <div className="flex justify-between text-sm">
                <Text type="secondary">Phí nền tảng:</Text>
                <Tag color="green" className="m-0">
                  Miễn phí
                </Tag>
              </div>

            </div>

            <div className="pt-4 border-t border-neutral-200 dark:border-neutral-800 mb-6">
              <Statistic
                title={<span className="text-sm font-medium">Tổng thanh toán:</span>}
                value={finalTotal}
                precision={0}
                suffix="₫"
                styles={{ content: { color: '#1677ff', fontWeight: 700, fontSize: '28px', fontFamily: 'monospace' } }}
              />
              <Text type="secondary" className="text-xs block mt-1">
                Đã bao gồm VAT và cấp quyền sở hữu tài nguyên số.
              </Text>
            </div>

            <Button
              type="primary"
              size="large"
              block
              href="/checkout"
              icon={<ArrowRightOutlined />}
              className="!bg-[#1677ff] mb-4"
            >
              Tiến hành thanh toán
            </Button>

            {/* Guarantees */}
            <div className="p-3 bg-neutral-50 dark:bg-neutral-900 rounded border border-neutral-200 dark:border-neutral-800 text-xs space-y-2 text-neutral-600 dark:text-neutral-400">
              <div className="flex items-center gap-2">
                <SafetyCertificateFilled className="text-emerald-500" />
                <span>Hồ sơ CAD/BIM kiểm duyệt chất lượng kỹ thuật</span>
              </div>
              <div className="flex items-center gap-2">
                <ThunderboltFilled className="text-amber-500" />
                <span>Nhận tệp gốc và cấp quyền sử dụng ngay</span>
              </div>
            </div>
          </Card>
        </Col>
      </Row>
    </div>
  )
}
