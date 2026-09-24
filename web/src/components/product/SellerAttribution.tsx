import React from 'react'
import Link from 'next/link'
import { ArrowRightOutlined } from '@ant-design/icons'

export type SellerAttributionProps = {
  sellerName?: string | null
  sellerTitle?: string | null
  sellerBio?: string | null
  isVerified?: boolean
  className?: string
  sellerSlug?: string | null
  authorHref?: string | null
}

export function SellerAttribution({
  sellerName,
  sellerTitle,
  sellerBio,
  // No default: `seller_profiles` has no verification field, so the badge renders only when a caller
  // can point at a record that verifies the seller. Nothing does yet, so the badge is absent.
  isVerified = false,
  className = '',
  sellerSlug,
  authorHref,
}: SellerAttributionProps) {
  // Nothing to attribute without a record: the block renders nothing rather than a fabricated creator.
  if (!sellerName) return null

  // Generate 2 initials for the avatar from the last 2 words
  const initials = sellerName
    ? sellerName
        .split(' ')
        .filter(Boolean)
        .slice(-2)
        .map((w) => w[0]?.toUpperCase())
        .join('')
    : 'KT'

  const authorLink = authorHref || (sellerSlug ? `/authors/${encodeURIComponent(sellerSlug)}` : '/shop')
  const hasAuthorLink = authorLink !== '/shop'

  return (
    <div className={`rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 shadow-xs ${className}`}>
      <div className="flex items-start gap-3.5">
        {/* Avatar */}
        {hasAuthorLink ? (
          <Link href={authorLink} className="shrink-0 group block" aria-label={`Ảnh đại diện tác giả ${sellerName}`}>
            <div className="w-11 h-11 rounded-full bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 flex items-center justify-center font-bold text-base shadow-xs group-hover:ring-2 ring-[#1677ff] transition-all">
              {initials || 'KT'}
            </div>
          </Link>
        ) : (
          <div className="w-11 h-11 rounded-full bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 flex items-center justify-center font-bold text-base shrink-0 shadow-xs">
            {initials || 'KT'}
          </div>
        )}

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            {hasAuthorLink ? (
              <Link href={authorLink} className="hover:text-[#1677ff] transition-colors">
                <span className="font-bold text-sm text-slate-900 dark:text-white leading-none">
                  {sellerName}
                </span>
              </Link>
            ) : (
              <span className="font-bold text-sm text-slate-900 dark:text-white leading-none">
                {sellerName}
              </span>
            )}
            {isVerified && (
              <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-blue-50 dark:bg-blue-950/60 text-[#1677ff] border border-blue-200 dark:border-blue-900">
                Chuyên gia
                <span className="sr-only">Đã xác minh</span>
              </span>
            )}
          </div>
          {sellerTitle && (
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-tight">
              {sellerTitle}
            </p>
          )}

          {sellerBio && (
            <p className="text-xs text-slate-600 dark:text-slate-300 mt-2.5 leading-relaxed">
              {sellerBio}
            </p>
          )}

          <div className="mt-2.5 flex items-center justify-between text-xs">
            <Link
              href={authorLink}
              className="font-semibold text-[#1677ff] hover:text-[#4096ff] inline-flex items-center gap-1 transition-colors"
            >
              <span>Xem thông tin tác giả</span>
              <span className="sr-only">Tất cả tài nguyên</span>
              <ArrowRightOutlined className="text-[10px]" />
            </Link>
            <span className="text-slate-400 text-xs">
              Hỗ trợ kỹ thuật 1:1
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}
