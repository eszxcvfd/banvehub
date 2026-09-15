'use client'

import { Button } from '@/components/ui/button'
import type { Product } from '@/payload-types'
import React from 'react'

type Props = {
  product: Product
}

export function AddToCart({ product }: Props) {
  const isFree = Boolean(product.isFree)
  const amount = product.price ?? 0

  return (
    <Button className="w-full" type="button">
      {isFree ? 'Tải ngay (Miễn phí)' : `Mua ngay — ${amount.toLocaleString('vi-VN')}₫`}
    </Button>
  )
}
