'use client'

import React from 'react'
import { Card, Statistic, Tag, Typography, List, Divider } from 'antd'
import {
  SafetyCertificateFilled,
  ThunderboltFilled,
  CustomerServiceFilled,
} from '@ant-design/icons'
import { Media } from '@/components/Media'
import type { Product, Media as MediaType } from '@/payload-types'

const { Text } = Typography

export type OrderSummaryCardProps = {
  items: any[]
  subtotal: number
  platformFee?: number
  walletDeduction?: number
  isSticky?: boolean
  className?: string
}

export function OrderSummaryCard({
  items = [],
  subtotal = 0,
  platformFee = 0,
  walletDeduction = 0,
  isSticky = true,
  className = '',
}: OrderSummaryCardProps) {
  // No reduction term: no coupon/voucher table exists and POST /api/v1/orders/purchase charges each
  // item own price (decision 0002), so this card may only subtract what the money path subtracts. The
  // future voucher programme brings its own decision under 0002 before any slot returns here.
  const finalAmount = Math.max(0, subtotal + platformFee - walletDeduction)
  const totalItems = items.reduce((acc, item) => acc + (item?.quantity || 1), 0)

  return (
    <Card
      title={
        <div className="flex items-center justify-between">
          <span className="font-semibold text-base">Tóm tắt đơn hàng</span>
          <Tag color="blue">{totalItems} bản vẽ</Tag>
        </div>
      }
      className={`shadow-sm ${isSticky ? 'sticky top-20' : ''} ${className}`}
    >
      {/* Ordered items list preview */}
      <List
        dataSource={items}
        renderItem={(item: any) => {
          const product = (typeof item.product === 'object' ? item.product : null) as Product | null
          if (!product) return null
          const image = (product.gallery?.[0]?.image || product.meta?.image) as MediaType | undefined
          const price = product.price || 0
          const quantity = item.quantity || 1
          const itemTotal = price * quantity

          return (
            <div key={item.id || item.product?.id} className="flex items-center gap-3 py-2 border-b border-neutral-100 dark:border-neutral-800 last:border-none">
              <div className="w-11 h-11 rounded bg-neutral-100 dark:bg-neutral-800 shrink-0 border border-neutral-200 dark:border-neutral-700 relative overflow-hidden">
                {image && typeof image !== 'string' && (
                  <Media fill imgClassName="object-cover" resource={image} />
                )}
              </div>
              <div className="grow min-w-0">
                <Text ellipsis strong className="text-xs block text-neutral-800 dark:text-neutral-200">
                  {product.title}
                </Text>
                <div className="flex justify-between items-center text-xs text-neutral-500 mt-0.5">
                  <span>x{quantity}</span>
                  <span className="font-mono text-[#1677ff] font-medium">
                    {itemTotal.toLocaleString('vi-VN')} ₫
                  </span>
                </div>
              </div>
            </div>
          )
        }}
      />

      <Divider className="my-4" />

      {/* Financial breakdown */}
      <div className="space-y-2.5 text-sm mb-4">
        <div className="flex justify-between">
          <Text type="secondary">Tạm tính:</Text>
          <Text strong className="font-mono">
            {subtotal.toLocaleString('vi-VN')} ₫
          </Text>
        </div>

        <div className="flex justify-between">
          <Text type="secondary">Phí nền tảng:</Text>
          <Tag color="green" className="m-0 text-xs">
            {platformFee === 0 ? 'Miễn phí' : `${platformFee.toLocaleString('vi-VN')} ₫`}
          </Tag>
        </div>

        {walletDeduction > 0 && (
          <div className="flex justify-between text-blue-600">
            <span>Khấu trừ số dư ví:</span>
            <span className="font-mono font-medium">
              -{walletDeduction.toLocaleString('vi-VN')} ₫
            </span>
          </div>
        )}
      </div>

      <Divider className="my-3" />

      {/* Final Total Statistic */}
      <div className="mb-4">
        <Statistic
          title={<span className="text-sm font-medium text-neutral-600 dark:text-neutral-300">Tổng thanh toán:</span>}
          value={finalAmount}
          precision={0}
          suffix="₫"
          styles={{ content: { color: '#1677ff', fontWeight: 700, fontSize: '26px', fontFamily: 'monospace' } }}
        />
        <Text type="secondary" className="text-xs block mt-1">
          Đã bao gồm thuế GTGT và cấp quyền khai thác tệp số theo tiêu chuẩn KienTaoHub.
        </Text>
      </div>

      {/* Guarantees */}
      <div className="pt-3 border-t border-neutral-100 dark:border-neutral-800 space-y-2 text-xs text-neutral-500">
        <div className="flex items-center gap-2">
          <SafetyCertificateFilled className="text-emerald-500" />
          <span>Bản vẽ kỹ thuật đạt chuẩn thẩm định</span>
        </div>
        <div className="flex items-center gap-2">
          <ThunderboltFilled className="text-amber-500" />
          <span>Tự động kích hoạt quyền tải xuống</span>
        </div>
        <div className="flex items-center gap-2">
          <CustomerServiceFilled className="text-blue-500" />
          <span>Hỗ trợ kỹ thuật bản vẽ 24/7</span>
        </div>
      </div>
    </Card>
  )
}
