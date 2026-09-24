'use client'

import React, { useCallback } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { Select, Radio, Typography, Tag, Space } from 'antd'
import { AppstoreOutlined, BarsOutlined } from '@ant-design/icons'
import type { RadioChangeEvent } from 'antd'

interface ShopToolbarProps {
  totalDocs: number
  currentSort?: string
  currentView?: 'grid' | 'list'
  searchQuery?: string
}

const SORT_OPTIONS = [
  { value: '-createdAt', label: 'Mới nhất' },
  { value: 'price', label: 'Giá: Thấp đến Cao' },
  { value: '-price', label: 'Giá: Cao đến Thấp' },
  { value: 'title', label: 'Tên: A → Z' },
  { value: '-title', label: 'Tên: Z → A' },
]

export const ShopToolbar: React.FC<ShopToolbarProps> = ({
  totalDocs,
  currentSort = '-createdAt',
  currentView = 'grid',
  searchQuery,
}) => {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const handleSortChange = useCallback(
    (newSort: string) => {
      const params = new URLSearchParams(searchParams.toString())
      params.delete('page')
      params.set('sort', newSort)
      router.push(`${pathname}?${params.toString()}`)
    },
    [pathname, router, searchParams],
  )

  const handleViewChange = useCallback(
    (e: RadioChangeEvent) => {
      const newView = e.target.value
      const params = new URLSearchParams(searchParams.toString())
      if (newView === 'grid') {
        params.delete('view')
      } else {
        params.set('view', newView)
      }
      router.push(`${pathname}?${params.toString()}`)
    },
    [pathname, router, searchParams],
  )

  return (
    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-4 mb-6 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-xl shadow-xs">
      <div className="flex items-center gap-2">
        <Typography.Text className="text-sm font-medium">
          {searchQuery ? (
            <>
              Kết quả cho: <span className="font-semibold text-[#1677ff]">&quot;{searchQuery}&quot;</span>
            </>
          ) : (
            'Danh sách tài nguyên bản vẽ'
          )}
        </Typography.Text>
        <Tag color="blue" className="font-mono font-medium">
          {totalDocs} bản vẽ
        </Tag>
      </div>

      <div className="flex items-center gap-3 w-full sm:w-auto justify-between sm:justify-end">
        <Space align="center" size="small">
          <Typography.Text type="secondary" className="text-xs hidden md:inline">
            Sắp xếp:
          </Typography.Text>
          <Select
            value={currentSort}
            onChange={handleSortChange}
            options={SORT_OPTIONS}
            className="w-44"
            aria-label="Sắp xếp sản phẩm"
          />
        </Space>

        <Radio.Group
          value={currentView}
          onChange={handleViewChange}
          optionType="button"
          buttonStyle="solid"
        >
          <Radio.Button value="grid" aria-label="Chế độ xem lưới">
            <AppstoreOutlined />
          </Radio.Button>
          <Radio.Button value="list" aria-label="Chế độ xem danh sách">
            <BarsOutlined />
          </Radio.Button>
        </Radio.Group>
      </div>
    </div>
  )
}
