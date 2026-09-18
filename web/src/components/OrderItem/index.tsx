import React from 'react'
import { OrderStatus } from '@/components/OrderStatus'
import { Price } from '@/components/Price'
import { Button } from '@/components/ui/button'
import type { Order } from '@/payload-types'
import { formatDateTime } from '@/utilities/formatDateTime'
import Link from 'next/link'
import { OrderDisputeModal } from '@/components/dispute/OrderDisputeModal'

type Props = {
  order: Order
}

export const OrderItem: React.FC<Props> = ({ order }) => {
  const orderIdentifier = order.code || `#${order.id}`

  // The order-list query does not always populate the `items` join, so pass whatever
  // products are available: the dispute dialog then lets the user pick the exact
  // product (and therefore the right seller) instead of guessing. When the list is not
  // populated the dialog deep-links to the order detail page.
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

      <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">
        <OrderDisputeModal
          orderId={order.id}
          orderCode={order.code || undefined}
          products={disputeProducts}
          buttonVariant="outline"
          buttonSize="default"
          buttonText="Báo lỗi / Khiếu nại"
        />
        <Button variant="outline" asChild>
          <Link href={`/orders/${order.id}`}>Chi tiết đơn hàng</Link>
        </Button>
      </div>
    </div>
  )
}
