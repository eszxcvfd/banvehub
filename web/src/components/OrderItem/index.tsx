'use client'

import React from 'react'
import { Card, Space, Button, Typography } from 'antd'
import { EyeOutlined } from '@ant-design/icons'
import { OrderStatus } from '@/components/OrderStatus'
import { Price } from '@/components/Price'
import type { Order } from '@/payload-types'
import { formatDateTime } from '@/utilities/formatDateTime'
import { OrderDisputeModal } from '@/components/dispute/OrderDisputeModal'

type Props = {
  order: Order
}

export const OrderItem: React.FC<Props> = ({ order }) => {
  const orderIdentifier = order.code || `#${order.id}`

  const seenProductIds = new Set<number>()
  const disputeProducts = (order.items?.docs || []).flatMap((item) => {
    if (typeof item !== 'object' || item === null) return []
    const product = item.product
    if (typeof product !== 'object' || product === null) return []
    if (seenProductIds.has(product.id)) return []
    seenProductIds.add(product.id)
    return [{ id: product.id, title: product.title }]
  })

  return (
    <Card
      className="shadow-sm hover:shadow transition-shadow"
      style={{ borderRadius: 12 }}
      styles={{
        body: { padding: '16px 20px' },
      }}
    >
      <div className="flex flex-col sm:flex-row gap-4 sm:items-center sm:justify-between">
        <div className="space-y-2">
          <div className="flex items-center gap-3 flex-wrap">
            <Typography.Text copyable code className="font-bold text-sm">
              {orderIdentifier}
            </Typography.Text>
            {order.status && <OrderStatus status={order.status} />}
          </div>

          <div className="flex items-center gap-4 text-xs text-neutral-500">
            <time dateTime={order.createdAt}>
              {formatDateTime({ date: order.createdAt, format: 'dd/MM/yyyy HH:mm' })}
            </time>
            <span>•</span>
            <span className="font-semibold text-neutral-900 dark:text-neutral-100">
              Tổng tiền:{' '}
              {order.totalAmount !== undefined && (
                <Price as="span" amount={order.totalAmount} currencyCode={order.currency ?? 'VND'} />
              )}
            </span>
          </div>
        </div>

        <Space wrap size="small">
          <OrderDisputeModal
            orderId={order.id}
            orderCode={order.code || undefined}
            products={disputeProducts}
            buttonVariant="outline"
            buttonSize="sm"
            buttonText="Báo lỗi / Khiếu nại"
          />

          <Button type="primary" ghost size="small" icon={<EyeOutlined />} href={`/orders/${order.id}`}>
            Chi tiết đơn hàng
          </Button>
        </Space>
      </div>
    </Card>
  )
}
