'use client'

import React, { useState } from 'react'
import { Button } from '@/components/ui/button'
import { DownloadCloud, Loader2 } from 'lucide-react'

export type DownloadButtonProps = {
  productId: number | string
  productTitle?: string
  buttonText?: string
  variant?: 'default' | 'outline' | 'secondary' | 'ghost' | 'link'
  size?: 'default' | 'sm' | 'lg' | 'icon'
  className?: string
}

export function DownloadButton({
  productId,
  productTitle,
  buttonText = 'Tải tệp ngay',
  variant = 'default',
  size = 'default',
  className = '',
}: DownloadButtonProps) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleDownload = async () => {
    try {
      setLoading(true)
      setError(null)

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
        // Trigger browser file download
        window.location.href = downloadUrl
      } else {
        throw new Error('Link tải không tồn tại.')
      }
    } catch (err: any) {
      setError(err.message || 'Lỗi khi tải file.')
      alert(err.message || 'Lỗi khi tải file.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="inline-flex flex-col items-start gap-1">
      <Button
        onClick={handleDownload}
        disabled={loading}
        variant={variant}
        size={size}
        className={`flex items-center gap-2 cursor-pointer ${className}`}
      >
        {loading ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <DownloadCloud className="w-4 h-4" />
        )}
        <span>{loading ? 'Đang tạo link tải...' : buttonText}</span>
      </Button>
      {error && <span className="text-xs text-destructive">{error}</span>}
    </div>
  )
}
