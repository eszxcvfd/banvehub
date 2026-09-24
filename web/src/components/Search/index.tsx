'use client'

import React, { useCallback, useRef } from 'react'
import { Input } from 'antd'
import type { SearchProps } from 'antd/es/input'
import { SearchOutlined } from '@ant-design/icons'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'

import '@/components/Header/index.css'

type Props = {
  className?: string
  placeholder?: string
  size?: 'large' | 'middle' | 'small'
  variant?: 'pill' | 'default'
  onSearchSubmit?: () => void
}

export const Search: React.FC<Props> = ({
  className,
  placeholder = 'Tìm kiếm bản vẽ CAD, Revit, BIM...',
  size = 'middle',
  variant = 'pill',
  onSearchSubmit,
}) => {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const currentQuery = searchParams?.get('q') || ''
  const searchInputRef = useRef<string>(currentQuery)

  const handleSearch: SearchProps['onSearch'] = useCallback(
    (value: string) => {
      const trimmed = value.trim()
      if (pathname === '/shop') {
        const newParams = new URLSearchParams(searchParams?.toString() || '')
        if (trimmed) {
          newParams.set('q', trimmed)
        } else {
          newParams.delete('q')
        }
        newParams.delete('page')
        const qs = newParams.toString()
        router.push(qs ? `/shop?${qs}` : '/shop')
      } else {
        router.push(trimmed ? `/shop?q=${encodeURIComponent(trimmed)}` : '/shop')
      }
      onSearchSubmit?.()
    },
    [pathname, router, searchParams, onSearchSubmit],
  )

  return (
    <div
      className={`header-search-wrapper ${
        variant === 'pill'
          ? 'header-search-pill-wrapper w-full rounded-full bg-white dark:bg-slate-900 shadow-[0_4px_18px_-2px_rgba(0,0,0,0.08),0_2px_6px_-1px_rgba(0,0,0,0.04)] hover:shadow-[0_8px_25px_-3px_rgba(22,119,255,0.16)] transition-all'
          : ''
      } ${className || ''}`}
    >
      <Input.Search
        name="q"
        placeholder={placeholder}
        allowClear
        enterButton={
          <span className="search-btn-inner inline-flex items-center justify-center gap-1.5 font-semibold text-white">
            <span className="search-btn-text hidden sm:inline">Tìm kiếm</span>
            <SearchOutlined className="search-btn-icon sm:hidden text-white text-sm" />
          </span>
        }
        size={size}
        key={currentQuery}
        defaultValue={currentQuery}
        onChange={(e) => {
          searchInputRef.current = e.target.value
        }}
        onSearch={handleSearch}
        prefix={
          <SearchOutlined
            className="text-[#1677ff] mr-2 text-base cursor-pointer hover:scale-110 transition-transform"
            onClick={() => handleSearch(searchInputRef.current)}
          />
        }
        className={variant === 'pill' ? 'header-search-pill' : undefined}
      />
    </div>
  )
}
