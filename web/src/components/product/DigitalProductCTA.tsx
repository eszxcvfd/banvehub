'use client'

import React from 'react'
import { Button } from '@/components/ui/button'
import { DownloadCloud, FileCheck, ShieldCheck, ShoppingBag, Zap } from 'lucide-react'

export type DigitalProductCTAProps = {
  isFree?: boolean | null
  price?: number
  fileFormat?: string | null
  fileSize?: string | null
  productTitle?: string
  className?: string
}

export function DigitalProductCTA({
  isFree,
  price = 0,
  fileFormat,
  fileSize,
  productTitle,
  className = '',
}: DigitalProductCTAProps) {
  const free = Boolean(isFree) || price === 0

  const handleAction = () => {
    if (free) {
      // Trigger digital asset direct download or registration modal
      alert(`Đang chuẩn bị tệp tải xuống: ${productTitle || 'Tài nguyên số'}`)
    } else {
      // Trigger digital checkout / payment flow
      alert(`Khởi tạo thanh toán số cho: ${productTitle || 'Tài nguyên số'} (${price.toLocaleString('vi-VN')} ₫)`)
    }
  }

  return (
    <div className={`rounded-xl border bg-card p-6 shadow-sm flex flex-col gap-5 ${className}`}>
      {/* Price Header */}
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Đơn giá giấy phép số
        </span>
        {free ? (
          <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-bold bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30">
            Miễn phí
          </span>
        ) : (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded text-xs font-medium bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">
            Bản quyền thương mại
          </span>
        )}
      </div>

      <div className="flex items-baseline gap-2">
        {free ? (
          <div className="flex items-baseline gap-2">
            <span className="text-3xl sm:text-4xl font-extrabold text-emerald-600 dark:text-emerald-400 tracking-tight font-mono">
              Miễn phí
            </span>
            <span className="text-sm text-muted-foreground line-through">
              0 ₫
            </span>
          </div>
        ) : (
          <div className="flex items-baseline gap-1.5 font-mono">
            <span className="text-3xl sm:text-4xl font-extrabold text-foreground tracking-tight">
              {price.toLocaleString('vi-VN')}
            </span>
            <span className="text-xl font-bold text-muted-foreground">₫</span>
          </div>
        )}
      </div>

      {/* Main Call To Action Button */}
      {free ? (
        <Button
          onClick={handleAction}
          className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-semibold py-6 text-base shadow-sm transition-all flex items-center justify-center gap-2 cursor-pointer"
          size="lg"
        >
          <DownloadCloud className="w-5 h-5" />
          Tải xuống ngay (Miễn phí)
        </Button>
      ) : (
        <Button
          onClick={handleAction}
          className="w-full bg-primary hover:bg-primary/90 text-primary-foreground font-semibold py-6 text-base shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer"
          size="lg"
        >
          <ShoppingBag className="w-5 h-5" />
          Mua ngay — {price.toLocaleString('vi-VN')} ₫
        </Button>
      )}

      {/* Engineering Trust Indicators */}
      <div className="flex flex-col gap-2.5 pt-4 border-t text-xs text-muted-foreground">
        <div className="flex items-center gap-2">
          <Zap className="w-4 h-4 text-amber-500 shrink-0" />
          <span>Tải xuống tức thì — Truy cập không giới hạn thời gian</span>
        </div>
        <div className="flex items-center gap-2">
          <FileCheck className="w-4 h-4 text-blue-500 shrink-0" />
          <span>
            Bao gồm file gốc {fileFormat ? `(${fileFormat})` : ''} {fileSize ? `• ${fileSize}` : ''}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-emerald-500 shrink-0" />
          <span>Bảo mật tuyệt đối, hoàn tiền 100% nếu file lỗi kỹ thuật</span>
        </div>
      </div>
    </div>
  )
}
