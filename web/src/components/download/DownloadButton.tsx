'use client'

import React, { useState } from 'react'
import { Button, App } from 'antd'
import { DownloadOutlined, LoadingOutlined } from '@ant-design/icons'

export type DownloadButtonProps = {
  productId: number | string
  productTitle?: string
  buttonText?: string
  variant?: 'default' | 'outline' | 'secondary' | 'ghost' | 'link'
  type?: 'primary' | 'default' | 'dashed' | 'link' | 'text'
  size?: 'small' | 'middle' | 'large' | 'default' | 'sm' | 'lg' | 'icon'
  className?: string
}

export function DownloadButton({
  productId,
  productTitle,
  buttonText = 'Tải tệp ngay',
  variant,
  type = 'primary',
  size = 'middle',
  className = '',
}: DownloadButtonProps) {
  const { message } = App.useApp()
  const [loading, setLoading] = useState(false)

  // Map legacy size props if passed
  const antdSize =
    size === 'sm' || size === 'small'
      ? 'small'
      : size === 'lg' || size === 'large'
      ? 'large'
      : 'middle'

  // Map legacy variant props to antd button type
  const antdType =
    variant === 'outline'
      ? 'default'
      : variant === 'ghost'
      ? 'dashed'
      : variant === 'link'
      ? 'link'
      : type

  const handleDownload = async () => {
    try {
      setLoading(true)

      const res = await fetch('/api/v1/downloads/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          productId: Number(productId),
        }),
      })

      const data = await res.json()

      if (!res.ok || !data.success) {
        throw new Error(data.message || 'Không thể tạo link tải tệp.')
      }

      const downloadUrl = data.data?.downloadUrl
      if (downloadUrl) {
        message.success(`Đang bắt đầu tải xuống: ${productTitle || 'tài nguyên'}`)
        window.location.href = downloadUrl
      } else {
        throw new Error('Link tải không tồn tại.')
      }
    } catch (err: any) {
      const errorMsg = err.message || 'Lỗi khi tải file.'
      message.error(errorMsg)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Button
      type={antdType}
      size={antdSize}
      icon={loading ? <LoadingOutlined /> : <DownloadOutlined />}
      loading={loading}
      onClick={handleDownload}
      className={className}
    >
      <span>{loading ? 'Đang tạo link tải...' : buttonText}</span>
    </Button>
  )
}
