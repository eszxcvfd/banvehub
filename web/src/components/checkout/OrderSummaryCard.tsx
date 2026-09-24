'use client'

import React from 'react'
import { Card, Tag, Typography, Divider } from 'antd'
import {
  SafetyCertificateFilled,
  ThunderboltFilled,
  CustomerServiceFilled,
  FileTextOutlined,
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
        <div className="flex items-center justify-between py-0.5">
          <span className="font-bold text-base text-slate-900 dark:text-neutral-100">
            Tóm tắt đơn hàng
          </span>
          <Tag color="blue" className="rounded-full px-2.5 py-0.5 m-0 text-xs font-medium">
            {totalItems} bản vẽ
          </Tag>
        </div>
      }
      styles={{ body: { padding: '20px 22px' } }}
      className={`rounded-2xl border border-slate-200/80 dark:border-neutral-800 shadow-sm bg-white dark:bg-neutral-900 ${
        isSticky ? 'sticky top-24' : ''
      } ${className}`}
    >
      {/* Ordered items list preview */}
      <div className="divide-y divide-slate-100 dark:divide-neutral-800">
        {items.map((item: any, idx: number) => {
          const product = (typeof item.product === 'object' ? item.product : null) as Product | null
          if (!product) return null
          const image = (product.gallery?.[0]?.image || product.meta?.image) as MediaType | undefined
          const price = product.price || 0
          const quantity = item.quantity || 1
          const itemTotal = price * quantity
          const fileFormat = (product as any)?.technicalSpecs?.fileFormat

          return (
            <div
              key={item.id || item.product?.id || idx}
              className="flex items-start gap-3 py-3 border-b border-slate-100 dark:border-neutral-800 last:border-none"
            >
              <div className="w-12 h-12 rounded-xl bg-slate-100 dark:bg-neutral-800 shrink-0 border border-slate-200/70 dark:border-neutral-700 relative overflow-hidden flex items-center justify-center">
                {image && typeof image !== 'string' ? (
                  <Media fill imgClassName="object-cover" resource={image} />
                ) : (
                  <FileTextOutlined className="text-slate-400 text-xl" />
                )}
              </div>
              <div className="grow min-w-0">
                <div className="flex items-start justify-between gap-2">
                  <Text
                    ellipsis={{ tooltip: product.title }}
                    strong
                    className="text-xs block text-slate-900 dark:text-neutral-100 font-semibold leading-snug"
                  >
                    {product.title}
                  </Text>
                </div>
                <div className="flex items-center gap-2 mt-1">
                  {fileFormat && (
                    <Tag className="!text-[10px] !px-1.5 !py-0 !m-0 !rounded text-slate-500 dark:text-neutral-400 bg-slate-100 dark:bg-neutral-800 border-none">
                      {fileFormat}
                    </Tag>
                  )}
                  <span className="text-slate-400 dark:text-neutral-500 text-[11px]">x{quantity}</span>
                  <span className="font-mono text-[#1677ff] font-bold text-xs ml-auto">
                    {itemTotal.toLocaleString('vi-VN')} ₫
                  </span>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      <Divider className="my-3.5 border-slate-100 dark:border-neutral-800" />

      {/* Financial breakdown */}
      <div className="space-y-2.5 text-xs mb-4">
        <div className="flex justify-between items-center">
          <Text type="secondary" className="text-slate-500 dark:text-neutral-400">
            Tạm tính:
          </Text>
          <Text strong className="font-mono text-slate-900 dark:text-neutral-100">
            {subtotal.toLocaleString('vi-VN')} ₫
          </Text>
        </div>

        <div className="flex justify-between items-center">
          <Text type="secondary" className="text-slate-500 dark:text-neutral-400">
            Phí nền tảng:
          </Text>
          <Tag color="green" className="m-0 text-[11px] font-medium rounded-full px-2 py-0">
            {platformFee === 0 ? 'Miễn phí' : `${platformFee.toLocaleString('vi-VN')} ₫`}
          </Tag>
        </div>

        {walletDeduction > 0 && (
          <div className="flex justify-between items-center text-blue-600 dark:text-blue-400">
            <span>Khấu trừ số dư ví:</span>
            <span className="font-mono font-semibold">
              -{walletDeduction.toLocaleString('vi-VN')} ₫
            </span>
          </div>
        )}
      </div>

      {/* Final Total Box */}
      <div className="bg-blue-50/60 dark:bg-blue-950/30 rounded-xl p-3.5 border border-blue-100 dark:border-blue-900/40 mb-4">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-xs font-semibold text-slate-800 dark:text-neutral-200">
            Tổng thanh toán:
          </span>
          <span className="text-2xl font-bold font-mono text-[#1677ff] tracking-tight">
            {finalAmount.toLocaleString('vi-VN')} ₫
          </span>
        </div>
        <Text type="secondary" className="text-[11px] block mt-1.5 leading-relaxed text-slate-500 dark:text-neutral-400">
          Đã bao gồm thuế GTGT và cấp quyền khai thác tệp số theo tiêu chuẩn KienTaoHub.
        </Text>
      </div>

      {/* Trust Guarantees */}
      <div className="pt-3 border-t border-slate-100 dark:border-neutral-800 space-y-2 text-xs text-slate-600 dark:text-neutral-400">
        <div className="flex items-center gap-2">
          <SafetyCertificateFilled className="text-emerald-500 text-sm shrink-0" />
          <span>Bản vẽ kỹ thuật đạt chuẩn thẩm định</span>
        </div>
        <div className="flex items-center gap-2">
          <ThunderboltFilled className="text-amber-500 text-sm shrink-0" />
          <span>Tự động kích hoạt quyền tải xuống</span>
        </div>
        <div className="flex items-center gap-2">
          <CustomerServiceFilled className="text-[#1677ff] text-sm shrink-0" />
          <span>Hỗ trợ kỹ thuật bản vẽ 24/7</span>
        </div>
      </div>
    </Card>
  )
}
