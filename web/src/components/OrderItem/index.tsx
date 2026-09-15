import React from 'react'
import { OrderStatus } from '@/components/OrderStatus'
import { Price } from '@/components/Price'
import { Button } from '@/components/ui/button'
import type { Order } from '@/payload-types'
import { formatDateTime } from '@/utilities/formatDateTime'
import Link from 'next/link'

type Props = {
  order: Order
}

export const OrderItem: React.FC<Props> = ({ order }) => {
  const orderIdentifier = order.code || `#${order.id}`

  return (
    <div className="bg-card border rounded-lg px-4 py-2 md:px-6 md:py-4 flex flex-col sm:flex-row gap-12 sm:items-center sm:justify-between">
      <div className="flex flex-col gap-4">
        <h3 className="text-sm uppercase font-mono tracking-widest text-primary/70 truncate max-w-48 sm:max-w-none">
          {orderIdentifier}
        </h3>

        <div className="flex flex-col-reverse sm:flex-row sm:items-center gap-6">
          <p className="text-xl font-medium">
            <time dateTime={order.createdAt}>
              {formatDateTime({ date: order.createdAt, format: 'MMMM dd, yyyy' })}
            </time>
          </p>

          {order.status && <OrderStatus status={order.status} />}
        </div>

        <p className="flex gap-2 text-sm text-muted-foreground font-mono">
          <span>Tổng tiền:</span>
          {order.totalAmount !== undefined && (
            <Price as="span" amount={order.totalAmount} currencyCode={order.currency ?? 'VND'} />
          )}
        </p>
      </div>

      <Button variant="outline" asChild className="self-start sm:self-auto">
        <Link href={`/orders/${order.id}`}>Chi tiết đơn hàng</Link>
      </Button>
    </div>
  )
}
