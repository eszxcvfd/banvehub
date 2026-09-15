import React from 'react'
import Link from 'next/link'
import { CheckCircle2, MessageSquare, ShieldCheck, UserCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'

export type SellerAttributionProps = {
  sellerName?: string | null
  sellerTitle?: string | null
  sellerBio?: string | null
  isVerified?: boolean
  className?: string
}

export function SellerAttribution({
  sellerName = 'KienTaoHub Studio & Creators',
  sellerTitle = 'Chuyên gia thiết kế CAD/BIM',
  sellerBio = 'Chuyên cung cấp hồ sơ bản vẽ thi công, thư viện mô hình 3D chuẩn quy chuẩn kỹ thuật xây dựng Việt Nam.',
  isVerified = true,
  className = '',
}: SellerAttributionProps) {
  // Generate 2 initials for the avatar
  const initials = sellerName
    ? sellerName
        .split(' ')
        .filter(Boolean)
        .slice(-2)
        .map((w) => w[0]?.toUpperCase())
        .join('')
    : 'KT'

  return (
    <div className={`rounded-xl border bg-card p-5 text-card-foreground shadow-xs ${className}`}>
      <div className="flex items-start justify-between gap-4 mb-3">
        <div className="flex items-center gap-3">
          <div className="relative flex h-12 w-12 shrink-0 select-none items-center justify-center rounded-full bg-primary/10 text-primary font-bold text-base border border-primary/20">
            {initials}
            {isVerified && (
              <div className="absolute -bottom-0.5 -right-0.5 rounded-full bg-background p-0.5 shadow-xs">
                <CheckCircle2 className="h-4 w-4 text-emerald-500 fill-emerald-500/20" />
              </div>
            )}
          </div>
          <div>
            <div className="flex items-center gap-1.5 flex-wrap">
              <h4 className="font-semibold text-sm sm:text-base leading-tight text-foreground">
                {sellerName}
              </h4>
              {isVerified && (
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-medium bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                  <ShieldCheck className="w-3 h-3" />
                  Đã xác minh
                </span>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">{sellerTitle}</p>
          </div>
        </div>
      </div>

      <p className="text-xs text-muted-foreground leading-relaxed mb-4">
        {sellerBio}
      </p>

      <div className="flex items-center justify-between pt-3 border-t text-xs text-muted-foreground">
        <div className="flex items-center gap-1.5">
          <UserCheck className="w-3.5 h-3.5 text-primary" />
          <span>Hỗ trợ kỹ thuật 1:1</span>
        </div>
        <Button asChild variant="ghost" size="sm" className="h-7 text-xs text-primary font-medium hover:text-primary">
          <Link href="/shop">
            <MessageSquare className="w-3 h-3 mr-1" />
            Tất cả tài nguyên
          </Link>
        </Button>
      </div>
    </div>
  )
}
