'use client'

import React, { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  Star,
  CheckCircle2,
  MessageSquare,
  ShieldCheck,
  Pencil,
  Loader2,
  Lock,
  ChevronLeft,
  ChevronRight,
  MessageCircle,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { useAuth } from '@/providers/Auth'
import { toast } from 'sonner'

export type ReviewItem = {
  id: number
  rating: number
  title?: string | null
  content: string
  status: string
  createdAt: string
  updatedAt?: string
  verifiedPurchase: boolean
  user: {
    id: number
    name: string
    initials: string
  }
  sellerReply?: {
    comment: string
    repliedAt?: string | null
  } | null
}

export type ReviewSummary = {
  averageRating: number
  totalCount: number
  distribution: {
    1: number
    2: number
    3: number
    4: number
    5: number
  }
}

export type ProductReviewsSectionProps = {
  productId: number
  productTitle: string
  className?: string
}

const STAR_LABELS: Record<number, string> = {
  1: '1 sao — Rất không hài lòng',
  2: '2 sao — Chưa hài lòng',
  3: '3 sao — Bình thường',
  4: '4 sao — Hài lòng',
  5: '5 sao — Rất tuyệt vời',
}

export function ProductReviewsSection({
  productId,
  productTitle,
  className = '',
}: ProductReviewsSectionProps) {
  const { user } = useAuth()
  const pathname = usePathname()

  const [loading, setLoading] = useState<boolean>(true)
  const [reviews, setReviews] = useState<ReviewItem[]>([])
  const [summary, setSummary] = useState<ReviewSummary>({
    averageRating: 0,
    totalCount: 0,
    distribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
  })
  const [currentPage, setCurrentPage] = useState<number>(1)
  const [totalPages, setTotalPages] = useState<number>(1)
  const [userReview, setUserReview] = useState<ReviewItem | null>(null)
  const [canReview, setCanReview] = useState<boolean>(false)

  // Review Form Dialog State
  const [isDialogOpen, setIsDialogOpen] = useState<boolean>(false)
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false)
  const [rating, setRating] = useState<number>(5)
  const [hoverRating, setHoverRating] = useState<number>(0)
  const [title, setTitle] = useState<string>('')
  const [content, setContent] = useState<string>('')
  const [formError, setFormError] = useState<string | null>(null)
  const [isEditing, setIsEditing] = useState<boolean>(false)

  useEffect(() => {
    if (!productId) return

    let mounted = true
    const controller = new AbortController()

    fetch(`/api/v1/products/${productId}/reviews?page=${currentPage}&limit=6`, {
      credentials: 'include',
      signal: controller.signal,
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!mounted) return
        if (data?.success) {
          setReviews(data.reviews || [])
          if (data.summary) {
            setSummary(data.summary)
          }
          if (data.pagination) {
            setTotalPages(data.pagination.totalPages || 1)
          }
          setUserReview(data.userReview || null)
          setCanReview(Boolean(data.canReview))
        }
        setLoading(false)
      })
      .catch((err) => {
        if (err?.name === 'AbortError') return
        if (mounted) setLoading(false)
      })

    return () => {
      mounted = false
      controller.abort()
    }
  }, [productId, currentPage, user?.id])

  const refreshReviews = async () => {
    if (!productId) return
    try {
      const res = await fetch(
        `/api/v1/products/${productId}/reviews?page=${currentPage}&limit=6`,
        { credentials: 'include' },
      )
      if (!res.ok) return
      const data = await res.json().catch(() => null)
      if (data?.success) {
        setReviews(data.reviews || [])
        if (data.summary) setSummary(data.summary)
        if (data.pagination) setTotalPages(data.pagination.totalPages || 1)
        setUserReview(data.userReview || null)
        setCanReview(Boolean(data.canReview))
      }
    } catch {
      // Silently tolerate
    }
  }

  const openCreateDialog = () => {
    setIsEditing(false)
    setRating(5)
    setHoverRating(0)
    setTitle('')
    setContent('')
    setFormError(null)
    setIsDialogOpen(true)
  }

  const openEditDialog = () => {
    if (!userReview) return
    setIsEditing(true)
    setRating(userReview.rating || 5)
    setHoverRating(0)
    setTitle(userReview.title || '')
    setContent(userReview.content || '')
    setFormError(null)
    setIsDialogOpen(true)
  }

  const handleSubmitReview = async (e: React.FormEvent) => {
    e.preventDefault()
    setFormError(null)

    if (!rating || rating < 1 || rating > 5) {
      setFormError('Vui lòng chọn số sao từ 1 đến 5.')
      return
    }

    const trimmedContent = content.trim()
    if (trimmedContent.length < 5) {
      setFormError('Nội dung đánh giá phải có ít nhất 5 ký tự.')
      return
    }

    setIsSubmitting(true)
    try {
      const method = isEditing ? 'PUT' : 'POST'
      const res = await fetch(`/api/v1/products/${productId}/reviews`, {
        method,
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          rating,
          title: title.trim() ? title.trim() : isEditing ? null : undefined,
          content: trimmedContent,
        }),
      })

      let data: any = null
      try {
        data = await res.json()
      } catch {
        data = null
      }

      if (!res.ok || !data?.success) {
        if (res.status === 401) {
          throw new Error('Vui lòng đăng nhập để gửi đánh giá.')
        }
        if (res.status === 403) {
          throw new Error(
            data?.message || 'Chỉ khách hàng đã mua sản phẩm mới có thể gửi đánh giá (BR-05).',
          )
        }
        if (res.status === 409) {
          throw new Error(data?.message || 'Bạn đã gửi đánh giá cho sản phẩm này rồi.')
        }
        throw new Error(data?.message || 'Gửi đánh giá không thành công.')
      }

      toast.success(
        isEditing ? 'Cập nhật đánh giá thành công!' : 'Đánh giá đã được gửi thành công!',
      )
      setIsDialogOpen(false)
      if (!isEditing) {
        setCurrentPage(1)
      }
      await refreshReviews()
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : 'Có lỗi xảy ra. Vui lòng thử lại sau.'
      setFormError(message)
      toast.error(message)
    } finally {
      setIsSubmitting(false)
    }
  }

  const formatDate = (dateString: string) => {
    try {
      const date = new Date(dateString)
      return new Intl.DateTimeFormat('vi-VN', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      }).format(date)
    } catch {
      return dateString
    }
  }

  return (
    <section
      id="reviews-section"
      className={`rounded-2xl border bg-card text-card-foreground p-6 sm:p-8 shadow-xs ${className}`}
    >
      <div className="flex flex-col gap-8">
        {/* Section Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b pb-6">
          <div>
            <h2 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2.5">
              <MessageSquare className="w-6 h-6 text-primary" />
              Đánh giá & Nhận xét
            </h2>
            <p className="text-sm text-muted-foreground mt-1">
              Phản hồi từ những kỹ sư, kiến trúc sư đã mua và sử dụng tài nguyên này.
            </p>
          </div>

          {/* Action Trigger Button */}
          {user ? (
            canReview ? (
              <Button
                onClick={openCreateDialog}
                className="bg-primary hover:bg-primary/90 text-primary-foreground font-semibold flex items-center gap-2 self-start sm:self-auto cursor-pointer"
              >
                <Star className="w-4 h-4 fill-current" />
                Viết đánh giá
              </Button>
            ) : userReview ? (
              <Button
                variant="outline"
                onClick={openEditDialog}
                className="flex items-center gap-2 self-start sm:self-auto cursor-pointer"
              >
                <Pencil className="w-4 h-4" />
                Chỉnh sửa đánh giá của bạn
              </Button>
            ) : null
          ) : (
            <Button asChild variant="outline" className="self-start sm:self-auto">
              <Link href={`/login?redirect=${encodeURIComponent(pathname || '/shop')}`}>
                Đăng nhập để đánh giá
              </Link>
            </Button>
          )}
        </div>

        {/* Rating Summary Breakdown Card */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-center rounded-xl bg-muted/40 p-6 border">
          {/* Left: Overall Score */}
          <div className="md:col-span-4 flex flex-col items-center justify-center text-center border-b md:border-b-0 md:border-r border-border/80 pb-6 md:pb-0 md:pr-6">
            <div className="text-5xl font-extrabold tracking-tight text-foreground font-mono">
              {(Number(summary?.totalCount) || 0) > 0 ? Number(summary?.averageRating || 0).toFixed(1) : '0.0'}
            </div>
            <div className="flex items-center gap-1 my-2">
              {[1, 2, 3, 4, 5].map((s) => {
                const filled = s <= Math.round(Number(summary?.averageRating || 0))
                return (
                  <Star
                    key={s}
                    className={`w-5 h-5 ${
                      filled
                        ? 'text-amber-500 fill-amber-500'
                        : 'text-muted-foreground/30'
                    }`}
                  />
                )
              })}
            </div>
            <p className="text-sm text-muted-foreground">
              {(Number(summary?.totalCount) || 0) > 0
                ? `Dựa trên ${summary.totalCount} lượt đánh giá`
                : 'Chưa có lượt đánh giá nào'}
            </p>
            <div className="mt-2.5 inline-flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400 font-medium">
              <ShieldCheck className="w-3.5 h-3.5" />
              100% người mua đã xác thực
            </div>
          </div>

          {/* Right: 5-bar Distribution */}
          <div className="md:col-span-8 flex flex-col gap-2.5">
            {[5, 4, 3, 2, 1].map((starVal) => {
              const count = summary?.distribution?.[starVal as keyof typeof summary.distribution] || 0
              const total = Number(summary?.totalCount || 0)
              const percentage =
                total > 0 ? Math.round((count / total) * 100) : 0

              return (
                <div key={starVal} className="flex items-center gap-3 text-xs sm:text-sm">
                  <div className="flex items-center gap-1 w-12 font-medium shrink-0">
                    <span>{starVal}</span>
                    <Star className="w-3.5 h-3.5 text-amber-500 fill-amber-500" />
                  </div>
                  <div className="flex-1 h-2.5 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full bg-amber-500 rounded-full transition-all duration-500"
                      style={{ width: `${percentage}%` }}
                    />
                  </div>
                  <div className="w-16 text-right text-muted-foreground font-mono shrink-0">
                    {count} ({percentage}%)
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* User Status Notice (When authenticated but not entitled, or unauthenticated) */}
        {!user ? (
          <div className="flex items-center gap-3 p-4 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-700 dark:text-blue-300 text-sm">
            <Lock className="w-4 h-4 shrink-0" />
            <div>
              <span>Chỉ khách hàng đã mua sản phẩm mới có thể gửi đánh giá. </span>
              <Link
                href={`/login?redirect=${encodeURIComponent(pathname || '/shop')}`}
                className="font-semibold underline underline-offset-2 hover:text-blue-900 dark:hover:text-blue-100"
              >
                Đăng nhập
              </Link>{' '}
              để kiểm tra quyền đánh giá của bạn.
            </div>
          </div>
        ) : !canReview && !userReview ? (
          <div className="flex items-center gap-3 p-4 rounded-xl bg-muted/60 border text-muted-foreground text-sm">
            <ShieldCheck className="w-4 h-4 text-emerald-500 shrink-0" />
            <span>
              Chỉ khách hàng đã sở hữu tài nguyên số này mới có thể gửi đánh giá theo chính sách bảo vệ chất lượng (BR-05).
            </span>
          </div>
        ) : null}

        {/* Your Submitted Review Highlight */}
        {userReview && (
          <div className="p-5 rounded-xl border border-primary/30 bg-primary/5 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-primary/20 text-primary">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  Đánh giá của bạn
                </span>
                {userReview.status === 'pending' && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                    Chờ kiểm duyệt
                  </span>
                )}
                {userReview.status === 'rejected' && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-destructive/10 text-destructive border border-destructive/20">
                    Bị từ chối
                  </span>
                )}
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={openEditDialog}
                className="text-xs h-8 text-primary hover:text-primary/80 flex items-center gap-1"
              >
                <Pencil className="w-3.5 h-3.5" />
                Sửa
              </Button>
            </div>
            <div className="flex items-center gap-1">
              {[1, 2, 3, 4, 5].map((s) => (
                <Star
                  key={s}
                  className={`w-4 h-4 ${
                    s <= userReview.rating
                      ? 'text-amber-500 fill-amber-500'
                      : 'text-muted-foreground/30'
                  }`}
                />
              ))}
              <span className="text-xs text-muted-foreground ml-2">
                {formatDate(userReview.createdAt)}
              </span>
            </div>
            {userReview.title && (
              <h4 className="font-semibold text-foreground text-sm">{userReview.title}</h4>
            )}
            <p className="text-sm text-foreground/90 whitespace-pre-wrap leading-relaxed">
              {userReview.content}
            </p>
            {userReview.sellerReply?.comment && (
              <div className="mt-3 p-3.5 rounded-lg bg-background/80 border border-primary/20 space-y-1 text-xs text-muted-foreground">
                <div className="flex items-center justify-between font-semibold text-foreground">
                  <span className="flex items-center gap-1.5 text-primary">
                    <MessageSquare className="w-3.5 h-3.5" />
                    Phản hồi từ người bán
                  </span>
                  {userReview.sellerReply.repliedAt && (
                    <span className="text-muted-foreground font-normal">
                      {formatDate(userReview.sellerReply.repliedAt)}
                    </span>
                  )}
                </div>
                <p className="leading-relaxed whitespace-pre-wrap">
                  {userReview.sellerReply.comment}
                </p>
              </div>
            )}
          </div>
        )}

        {/* Reviews List */}
        <div className="space-y-4">
          <h3 className="text-base font-semibold text-foreground flex items-center gap-2">
            Danh sách nhận xét ({summary.totalCount})
          </h3>

          {loading ? (
            <div className="py-12 flex flex-col items-center justify-center gap-2 text-muted-foreground">
              <Loader2 className="w-6 h-6 animate-spin text-primary" />
              <span className="text-sm">Đang tải đánh giá...</span>
            </div>
          ) : reviews.length === 0 ? (
            <div className="py-12 flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed p-8 text-center text-muted-foreground bg-muted/20">
              <MessageCircle className="w-8 h-8 opacity-40 mb-1" />
              <p className="font-medium text-foreground text-sm">Chưa có đánh giá nào</p>
              <p className="text-xs max-w-md">
                Tài nguyên này chưa nhận được đánh giá từ khách hàng. Sau khi mua và tải file, bạn có thể là người đầu tiên chia sẻ cảm nhận!
              </p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {reviews.map((rev) => (
                <div key={rev.id} className="py-6 flex flex-col gap-3">
                  {/* Author Header */}
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-primary/10 text-primary font-bold text-sm flex items-center justify-center border border-primary/20 shrink-0">
                        {rev.user.initials || 'KH'}
                      </div>
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-sm text-foreground">
                            {rev.user.name}
                          </span>
                          {rev.verifiedPurchase && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                              <CheckCircle2 className="w-3 h-3" />
                              Đã mua hàng
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 mt-0.5">
                          <div className="flex items-center gap-0.5">
                            {[1, 2, 3, 4, 5].map((s) => (
                              <Star
                                key={s}
                                className={`w-3.5 h-3.5 ${
                                  s <= rev.rating
                                    ? 'text-amber-500 fill-amber-500'
                                    : 'text-muted-foreground/30'
                                }`}
                              />
                            ))}
                          </div>
                          <span className="text-xs text-muted-foreground">
                            • {formatDate(rev.createdAt)}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Review Content */}
                  {rev.title && (
                    <h4 className="font-semibold text-foreground text-sm mt-1">
                      {rev.title}
                    </h4>
                  )}
                  <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap">
                    {rev.content}
                  </p>

                  {/* Seller Reply */}
                  {rev.sellerReply?.comment && (
                    <div className="mt-2 p-4 rounded-lg bg-muted/60 border-l-2 border-primary space-y-1.5 text-xs text-muted-foreground">
                      <div className="flex items-center justify-between font-semibold text-foreground">
                        <span className="flex items-center gap-1.5 text-primary">
                          <MessageSquare className="w-3.5 h-3.5" />
                          Phản hồi từ người bán
                        </span>
                        {rev.sellerReply.repliedAt && (
                          <span className="text-muted-foreground font-normal">
                            {formatDate(rev.sellerReply.repliedAt)}
                          </span>
                        )}
                      </div>
                      <p className="leading-relaxed whitespace-pre-wrap">
                        {rev.sellerReply.comment}
                      </p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Pagination Controls */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between pt-6 border-t">
              <Button
                variant="outline"
                size="sm"
                disabled={currentPage <= 1 || loading}
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                className="flex items-center gap-1 cursor-pointer"
              >
                <ChevronLeft className="w-4 h-4" />
                Trang trước
              </Button>
              <span className="text-xs text-muted-foreground">
                Trang {currentPage} / {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={currentPage >= totalPages || loading}
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                className="flex items-center gap-1 cursor-pointer"
              >
                Trang sau
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Review Dialog Form (Create or Edit) */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-lg">
              <Star className="w-5 h-5 text-amber-500 fill-amber-500" />
              {isEditing ? 'Chỉnh sửa đánh giá của bạn' : 'Viết đánh giá sản phẩm'}
            </DialogTitle>
            <DialogDescription>
              Chia sẻ trải nghiệm sử dụng &quot;{productTitle}&quot; với cộng đồng KienTaoHub.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmitReview} className="space-y-4 py-2">
            {formError && (
              <div className="p-3 rounded-md bg-destructive/10 border border-destructive/20 text-destructive text-xs">
                {formError}
              </div>
            )}

            {/* Interactive 1-5 Star Rating Picker */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">Mức độ hài lòng *</Label>
              <div className="flex items-center gap-2">
                {[1, 2, 3, 4, 5].map((starVal) => {
                  const active = hoverRating ? starVal <= hoverRating : starVal <= rating
                  return (
                    <button
                      type="button"
                      key={starVal}
                      onClick={() => setRating(starVal)}
                      onMouseEnter={() => setHoverRating(starVal)}
                      onMouseLeave={() => setHoverRating(0)}
                      className="p-1 rounded-md transition-transform hover:scale-110 focus:outline-hidden cursor-pointer"
                      title={STAR_LABELS[starVal]}
                      aria-label={STAR_LABELS[starVal]}
                    >
                      <Star
                        className={`w-7 h-7 transition-colors ${
                          active
                            ? 'text-amber-500 fill-amber-500'
                            : 'text-muted-foreground/30'
                        }`}
                      />
                    </button>
                  )
                })}
              </div>
              <p className="text-xs text-muted-foreground font-medium">
                {STAR_LABELS[hoverRating || rating]}
              </p>
            </div>

            {/* Title (Optional) */}
            <div className="space-y-1.5">
              <Label htmlFor="review-title" className="text-sm font-medium">
                Tiêu đề nhận xét (tùy chọn)
              </Label>
              <Input
                id="review-title"
                placeholder="Tóm tắt ngắn gọn cảm nhận của bạn (vd: Bản vẽ rất chuẩn và chi tiết)"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={120}
              />
            </div>

            {/* Content (Required, min 5 chars) */}
            <div className="space-y-1.5">
              <Label htmlFor="review-content" className="text-sm font-medium">
                Nội dung chi tiết *
              </Label>
              <Textarea
                id="review-content"
                placeholder="Chất lượng file thế nào? Độ tương thích phần mềm? Có đầy đủ chi tiết kỹ thuật không? (tối thiểu 5 ký tự)"
                value={content}
                onChange={(e) => setContent(e.target.value)}
                rows={4}
                maxLength={5000}
                required
              />
              <p className="text-[11px] text-muted-foreground">
                Tối thiểu 5 ký tự. Đánh giá của bạn sẽ được hiển thị công khai kèm huy hiệu &quot;Đã mua hàng&quot;.
              </p>
            </div>

            <DialogFooter className="flex flex-col sm:flex-row gap-2 sm:justify-end pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsDialogOpen(false)}
                disabled={isSubmitting}
              >
                Hủy bỏ
              </Button>
              <Button
                type="submit"
                disabled={isSubmitting}
                className="bg-primary hover:bg-primary/90 text-primary-foreground font-semibold flex items-center gap-2 cursor-pointer"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Đang gửi...
                  </>
                ) : isEditing ? (
                  'Lưu cập nhật'
                ) : (
                  'Gửi đánh giá'
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </section>
  )
}
