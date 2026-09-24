'use client'

import React, { useCallback } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { Pagination } from 'antd'

interface ShopPaginationProps {
  currentPage: number
  pageSize: number
  totalDocs: number
}

export const ShopPagination: React.FC<ShopPaginationProps> = ({
  currentPage,
  pageSize,
  totalDocs,
}) => {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const handlePageChange = useCallback(
    (page: number) => {
      const params = new URLSearchParams(searchParams.toString())
      if (page > 1) {
        params.set('page', String(page))
      } else {
        params.delete('page')
      }

      const qs = params.toString()
      router.push(qs ? `${pathname}?${qs}` : pathname)

      if (typeof window !== 'undefined') {
        window.scrollTo({ top: 0, behavior: 'smooth' })
      }
    },
    [pathname, router, searchParams],
  )

  if (totalDocs <= pageSize) return null

  return (
    <div className="flex justify-center items-center mt-10 mb-6">
      <Pagination
        current={currentPage}
        pageSize={pageSize}
        total={totalDocs}
        showSizeChanger={false}
        showTotal={(total, range) => `${range[0]}-${range[1]} của ${total} sản phẩm`}
        onChange={handlePageChange}
      />
    </div>
  )
}
