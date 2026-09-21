'use client'

import React from 'react'
import Link from 'next/link'
import { Empty, Button } from 'antd'
import type { Product } from '@/payload-types'
import { ProductGridItem } from '@/components/ProductGridItem'
import type { ProductStats } from '@/components/product/productStats'

export type Props = {
  posts?: Product[]
  /** Real aggregates per product id, computed on the server by `components/product/productStats.ts`. */
  statsByProductId?: Record<string, ProductStats>
  /** The seller's real display name per product id; products without one are absent. */
  sellerNameByProductId?: Record<string, string>
}

export const CollectionArchive: React.FC<Props> = ({
  posts,
  statsByProductId,
  sellerNameByProductId,
}) => {
  if (!posts || posts.length === 0) {
    return (
      <div className="my-12 py-12 flex justify-center w-full">
        <Empty description="Chưa có bản vẽ nào trong danh mục này">
          <Link href="/shop">
            <Button type="primary">Khám phá toàn bộ danh mục</Button>
          </Link>
        </Empty>
      </div>
    )
  }

  return (
    <div className="w-full">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 w-full">
        {posts.map((product, index) => {
          if (typeof product === 'object' && product !== null) {
            return (
              <ProductGridItem
                key={product.id || index}
                product={product}
                stats={statsByProductId?.[String(product.id)]}
                sellerName={sellerNameByProductId?.[String(product.id)] ?? null}
              />
            )
          }
          return null
        })}
      </div>
    </div>
  )
}
