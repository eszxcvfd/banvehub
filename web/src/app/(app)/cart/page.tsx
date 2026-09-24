import type { Metadata } from 'next'
import { mergeOpenGraph } from '@/utilities/mergeOpenGraph'
import React from 'react'
import { CartPageClient } from '@/components/Cart/CartPageClient'

export default function CartPage() {
  return (
    <div className="min-h-[85vh] py-8 bg-neutral-50 dark:bg-neutral-950">
      <div className="container mx-auto px-4 max-w-7xl">
        <CartPageClient />
      </div>
    </div>
  )
}

export const metadata: Metadata = {
  title: 'Giỏ hàng | KienTaoHub',
  description: 'Xem và quản lý các bản vẽ kiến trúc, kết cấu, MEP trong giỏ hàng của bạn.',
  openGraph: mergeOpenGraph({
    title: 'Giỏ hàng | KienTaoHub',
    url: '/cart',
  }),
}
