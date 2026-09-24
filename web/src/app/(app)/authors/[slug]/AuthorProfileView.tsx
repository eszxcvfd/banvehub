'use client'

import React from 'react'
import Link from 'next/link'
import Image from 'next/image'
import {
  ChevronRight,
  ArrowLeft,
  User,
  Star,
  Download,
  FileText,
  Calendar,
} from 'lucide-react'
import type { Product } from '@/payload-types'
import { ProductGridItem } from '@/components/ProductGridItem'
import type { ProductStats } from '@/components/product/productStats'

export type AuthorProfileViewProps = {
  author: {
    userId: number
    displayName: string
    bio: string | null
    avatarUrl: string | null
    createdAt: string
  }
  products: Product[]
  statsMap: Record<string, ProductStats>
}

export function AuthorProfileView({ author, products, statsMap }: AuthorProfileViewProps) {
  // Aggregate author totals from real records
  let totalDownloads = 0
  let totalReviews = 0
  let weightedRatingSum = 0

  for (const p of products) {
    const s = statsMap[String(p.id)]
    if (s) {
      totalDownloads += s.downloads || 0
      if (s.reviewCount > 0 && s.ratingAverage !== null) {
        totalReviews += s.reviewCount
        weightedRatingSum += s.ratingAverage * s.reviewCount
      }
    }
  }

  const averageRating = totalReviews > 0 ? (weightedRatingSum / totalReviews).toFixed(1) : null

  // Initials for avatar
  const initials = author.displayName
    ? author.displayName
        .split(' ')
        .filter(Boolean)
        .slice(-2)
        .map((w: string) => w[0]?.toUpperCase())
        .join('')
    : 'KT'

  const joinedYear = author.createdAt
    ? new Date(author.createdAt).toLocaleDateString('vi-VN', {
        month: '2-digit',
        year: 'numeric',
      })
    : null

  return (
    <div className="min-h-screen bg-slate-50/50 dark:bg-slate-950/50 py-8">
      <div className="container max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Breadcrumb Navigation */}
        <nav
          aria-label="Breadcrumb"
          className="mb-6 flex items-center gap-2 text-xs sm:text-sm text-slate-500 dark:text-slate-400 flex-wrap"
        >
          <Link href="/" className="hover:text-[#1677ff] transition-colors">
            Trang chủ
          </Link>
          <ChevronRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />
          <Link href="/shop" className="hover:text-[#1677ff] transition-colors">
            Cửa hàng
          </Link>
          <ChevronRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />
          <span className="text-slate-800 dark:text-slate-200 font-medium truncate max-w-sm sm:max-w-md">
            {author.displayName}
          </span>
        </nav>

        {/* Back Link */}
        <div className="mb-6">
          <Link
            href="/shop"
            className="inline-flex items-center gap-1.5 text-xs sm:text-sm text-slate-600 dark:text-slate-400 hover:text-[#1677ff] transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Quay lại danh mục sản phẩm</span>
          </Link>
        </div>

        {/* Author Profile Header Card */}
        <div className="relative overflow-hidden rounded-2xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm p-6 sm:p-8 mb-10">
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-6">
            {/* Avatar */}
            <div className="relative w-20 h-20 sm:w-24 sm:h-24 rounded-full overflow-hidden bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 flex items-center justify-center font-bold text-2xl sm:text-3xl shrink-0 shadow-md ring-4 ring-slate-100 dark:ring-slate-800">
              {author.avatarUrl ? (
                <Image
                  src={author.avatarUrl}
                  alt={author.displayName}
                  fill
                  className="object-cover"
                />
              ) : (
                <span>{initials || 'KT'}</span>
              )}
            </div>

            {/* Author Main Info */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2.5 flex-wrap">
                <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
                  {author.displayName}
                </h1>
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-50 text-[#1677ff] border border-blue-200 dark:bg-blue-950/40 dark:border-blue-800">
                  <User className="w-3 h-3" />
                  <span>Tác giả / Nhà sáng tạo</span>
                </span>
              </div>

              {author.bio && (
                <p className="mt-2 text-sm text-slate-600 dark:text-slate-300 leading-relaxed max-w-3xl">
                  {author.bio}
                </p>
              )}

              {/* Stats badges */}
              <div className="mt-4 flex items-center gap-3 sm:gap-4 flex-wrap text-xs text-slate-600 dark:text-slate-400">
                <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-50 dark:bg-slate-800/80 border border-slate-200/60 dark:border-slate-700/60">
                  <FileText className="w-3.5 h-3.5 text-[#1677ff]" />
                  <span className="font-semibold text-slate-900 dark:text-white">
                    {products.length}
                  </span>
                  <span>tài nguyên đã đăng</span>
                </div>

                {totalDownloads > 0 && (
                  <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-50 dark:bg-slate-800/80 border border-slate-200/60 dark:border-slate-700/60">
                    <Download className="w-3.5 h-3.5 text-emerald-500" />
                    <span className="font-semibold text-slate-900 dark:text-white">
                      {totalDownloads}
                    </span>
                    <span>lượt tải</span>
                  </div>
                )}

                {averageRating && (
                  <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-50 dark:bg-slate-800/80 border border-slate-200/60 dark:border-slate-700/60">
                    <Star className="w-3.5 h-3.5 text-amber-400 fill-amber-400" />
                    <span className="font-semibold text-slate-900 dark:text-white">
                      {averageRating}
                    </span>
                    <span>({totalReviews} đánh giá)</span>
                  </div>
                )}

                {joinedYear && (
                  <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-50 dark:bg-slate-800/80 border border-slate-200/60 dark:border-slate-700/60">
                    <Calendar className="w-3.5 h-3.5 text-slate-400" />
                    <span>Tham gia: {joinedYear}</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Author Products Section */}
        <div>
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
                Tài nguyên của tác giả
              </h2>
              <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1">
                Các bản vẽ kỹ thuật, mô hình BIM và tài liệu số được phát hành bởi {author.displayName}
              </p>
            </div>
            <span className="text-xs sm:text-sm font-semibold text-slate-500 dark:text-slate-400">
              {products.length} sản phẩm
            </span>
          </div>

          {products.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {products.map((product) => (
                <ProductGridItem
                  key={product.id}
                  product={product}
                  stats={statsMap[String(product.id)]}
                  sellerName={author.displayName}
                />
              ))}
            </div>
          ) : (
            <div className="text-center py-16 px-4 rounded-2xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
              <FileText className="w-12 h-12 text-slate-300 dark:text-slate-600 mb-3 mx-auto" />
              <h3 className="text-base font-semibold text-slate-800 dark:text-slate-200">
                Chưa có tài nguyên công khai
              </h3>
              <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1 max-w-md mx-auto">
                Tác giả hiện chưa xuất bản tài nguyên nào trên hệ thống KienTaoHub.
              </p>
              <Link
                href="/shop"
                className="mt-5 inline-flex items-center px-4 py-2 rounded-lg text-xs sm:text-sm font-semibold text-white bg-[#1677ff] hover:bg-[#4096ff] transition-colors"
              >
                Khám phá thư viện bản vẽ
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
