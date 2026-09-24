'use client'

import React, { useEffect, useState } from 'react'
import { Affix, Button, Tag, Typography } from 'antd'
import { DownloadOutlined, ShoppingOutlined } from '@ant-design/icons'

const { Text } = Typography

export type ProductStickyBarProps = {
  productTitle: string
  price?: number
  isFree?: boolean | null
  fileFormat?: string | null
  isOwned?: boolean
  isSeller?: boolean
  loading?: boolean
  onAction?: () => void
}

export function ProductStickyBar({
  productTitle,
  price = 0,
  isFree,
  fileFormat,
  isOwned,
  isSeller,
  loading = false,
  onAction,
}: ProductStickyBarProps) {
  const [visible, setVisible] = useState(false)
  const free = Boolean(isFree) || price === 0

  useEffect(() => {
    const handleScroll = () => {
      // Appear when user scrolls past 400px (hero threshold)
      if (window.scrollY > 400) {
        setVisible(true)
      } else {
        setVisible(false)
      }
    }
    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  if (!visible) return null

  return (
    <Affix offsetBottom={0} className="fixed bottom-0 inset-x-0 z-50">
      <div className="bg-white/95 dark:bg-neutral-900/95 backdrop-blur-md border-t border-neutral-200 dark:border-neutral-800 py-3 px-4 shadow-lg">
        <div className="container mx-auto max-w-7xl flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            {fileFormat && (
              <Tag color="processing" className="font-mono text-xs hidden sm:inline-flex m-0">
                {fileFormat}
              </Tag>
            )}
            <Text strong ellipsis className="text-sm max-w-[200px] sm:max-w-[400px]">
              {productTitle}
            </Text>
          </div>

          <div className="flex items-center gap-4 shrink-0">
            <div className="text-right hidden sm:block">
              {free ? (
                <span className="text-emerald-600 dark:text-emerald-400 font-bold text-base">Miễn phí</span>
              ) : (
                <span className="text-[#1677ff] font-bold text-base">
                  {price.toLocaleString('vi-VN')} ₫
                </span>
              )}
            </div>

            {isSeller ? (
              <Button disabled size="middle">
                Sản phẩm của bạn
              </Button>
            ) : free || isOwned ? (
              <Button
                type="primary"
                size="middle"
                loading={loading}
                onClick={onAction || (() => window.scrollTo({ top: 200, behavior: 'smooth' }))}
                icon={<DownloadOutlined />}
                style={{ backgroundColor: '#10b981', borderColor: '#10b981' }}
              >
                {free ? 'Tải xuống ngay (Miễn phí)' : 'Tải xuống ngay'}
              </Button>
            ) : (
              <Button
                type="primary"
                size="middle"
                loading={loading}
                onClick={onAction || (() => window.scrollTo({ top: 200, behavior: 'smooth' }))}
                icon={<ShoppingOutlined />}
                className="!bg-[#1677ff]"
              >
                Mua ngay — {price.toLocaleString('vi-VN')} ₫
              </Button>
            )}
          </div>
        </div>
      </div>
    </Affix>
  )
}
