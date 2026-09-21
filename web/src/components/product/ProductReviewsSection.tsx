'use client'

import React, { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  Card,
  Rate,
  Progress,
  Avatar,
  Tag,
  Button,
  Modal,
  Pagination,
  Empty,
  Spin,
  Alert,
  Typography,
  Space,
} from 'antd'
import {
  StarFilled,
  MessageOutlined,
  SafetyCertificateFilled,
  EditOutlined,
  CheckCircleFilled,
  LockOutlined,
} from '@ant-design/icons'
import { useAuth } from '@/providers/Auth'
import { toast } from 'sonner'

if (typeof window !== 'undefined') {
  if (!window.matchMedia) {
    window.matchMedia = ((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    })) as unknown as typeof window.matchMedia
  }
  if (!window.ResizeObserver) {
    window.ResizeObserver = class ResizeObserver {
      observe() {}
      unobserve() {}
      disconnect() {}
    } as unknown as typeof window.ResizeObserver
  }
}

const { Title, Text, Paragraph } = Typography

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
    1?: number
    2?: number
    3?: number
    4?: number
    5?: number
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
  const [userReview, setUserReview] = useState<ReviewItem | null>(null)
  const [canReview, setCanReview] = useState<boolean>(false)

  // Review Form Dialog State
  const [isDialogOpen, setIsDialogOpen] = useState<boolean>(false)
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false)
  const [rating, setRating] = useState<number>(5)
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
        setUserReview(data.userReview || null)
        setCanReview(Boolean(data.canReview))
      }
    } catch {}
  }

  const openCreateDialog = () => {
    setIsEditing(false)
    setRating(5)
    setTitle('')
    setContent('')
    setFormError(null)
    setIsDialogOpen(true)
  }

  const openEditDialog = () => {
    if (!userReview) return
    setIsEditing(true)
    setRating(userReview.rating || 5)
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
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          rating,
          title: title.trim() ? title.trim() : isEditing ? null : undefined,
          content: trimmedContent,
        }),
      })

      let data: { success?: boolean; message?: string; error?: string } | null = null
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
    <Card id="reviews-section" className={`rounded-2xl border border-border shadow-xs ${className}`}>
      <div className="flex flex-col gap-8">
        {/* Section Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border pb-6">
          <div>
            <Title level={3} className="!mb-1 flex items-center gap-2.5 text-xl sm:text-2xl font-bold">
              <MessageOutlined className="text-[#1677ff]" />
              <span>Đánh giá & Nhận xét</span>
            </Title>
            <Text type="secondary" className="text-sm">
              Phản hồi từ những kỹ sư, kiến trúc sư đã mua và sử dụng tài nguyên này.
            </Text>
          </div>

          {/* Action Trigger Button */}
          {user ? (
            canReview ? (
              <Button
                type="primary"
                onClick={openCreateDialog}
                icon={<StarFilled />}
                className="font-semibold self-start sm:self-auto !bg-[#1677ff]"
              >
                Viết đánh giá
              </Button>
            ) : userReview ? (
              <Button
                onClick={openEditDialog}
                icon={<EditOutlined />}
                className="self-start sm:self-auto"
              >
                Chỉnh sửa đánh giá của bạn
              </Button>
            ) : null
          ) : (
            <Link href={`/login?redirect=${encodeURIComponent(pathname || '/shop')}`}>
              <Button className="self-start sm:self-auto">
                Đăng nhập để đánh giá
              </Button>
            </Link>
          )}
        </div>

        {/* Rating Summary Breakdown Card: only what the reviews collection actually holds */}
        {Number(summary?.totalCount || 0) > 0 && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-center rounded-2xl bg-white dark:bg-slate-900 p-6 sm:p-7 border border-slate-200/90 dark:border-slate-800 shadow-xs">
            {/* Block 1 (Left): Overall Score */}
            <div className="lg:col-span-3 flex flex-col items-center justify-center text-center border-b lg:border-b-0 lg:border-r border-slate-100 dark:border-slate-800 pb-5 lg:pb-0 lg:pr-6">
              <div className="flex items-baseline gap-1">
                <span className="text-4xl sm:text-5xl font-black tracking-tight font-mono text-slate-900 dark:text-white">
                  {Number(summary?.averageRating || 0).toFixed(1)}
                </span>
                <span className="text-base text-slate-400 font-semibold">/ 5</span>
              </div>
              <div className="my-2">
                <Rate
                  disabled
                  allowHalf
                  value={Number(summary?.averageRating || 0)}
                  style={{ color: '#faad14', fontSize: 16 }}
                />
              </div>
              <Text type="secondary" className="text-xs">
                {`Dựa trên ${Number(summary?.totalCount || 0)} lượt đánh giá`}
              </Text>
            </div>

            {/* Block 2 (Center): 5-bar Distribution */}
            <div className="lg:col-span-5 flex flex-col gap-2">
              {[5, 4, 3, 2, 1].map((starVal) => {
                const count = summary?.distribution?.[starVal as keyof typeof summary.distribution] || 0
                const total = Number(summary?.totalCount || 0)
                const percentage = total > 0 ? Math.round((count / total) * 100) : 0

                return (
                  <div key={starVal} className="flex items-center gap-2.5 text-xs">
                    <div className="flex items-center gap-1 w-11 font-medium shrink-0 text-slate-600 dark:text-slate-400">
                      <span>{starVal} sao</span>
                    </div>
                    <div className="flex-1">
                      <Progress
                        percent={percentage}
                        strokeColor="#1677ff"
                        railColor="rgba(0,0,0,0.06)"
                        showInfo={false}
                        size="small"
                      />
                    </div>
                    <div className="w-16 text-right text-slate-500 font-mono text-xs shrink-0">
                      {`${count} (${percentage}%)`}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* User Status Notice */}
        {!user ? (
          <Alert
            type="info"
            showIcon
            icon={<LockOutlined />}
            title={
              <span>
                Chỉ khách hàng đã mua sản phẩm mới có thể gửi đánh giá.{' '}
                <Link
                  href={`/login?redirect=${encodeURIComponent(pathname || '/shop')}`}
                  className="font-semibold underline hover:text-[#1677ff]"
                >
                  Đăng nhập
                </Link>{' '}
                để kiểm tra quyền đánh giá của bạn.
              </span>
            }
          />
        ) : !canReview && !userReview ? (
          <Alert
            type="info"
            showIcon
            icon={<SafetyCertificateFilled />}
            title="Chỉ khách hàng đã sở hữu tài nguyên số này mới có thể gửi đánh giá theo chính sách bảo vệ chất lượng (BR-05)."
          />
        ) : null}

        {/* Your Submitted Review Highlight */}
        {userReview && (
          <Card
            size="small"
            className="rounded-xl border border-[#1677ff]/30 bg-[#1677ff]/5"
            styles={{ body: { padding: '16px' } }}
          >
            <div className="flex items-center justify-between mb-2">
              <Space>
                <Tag color="processing" icon={<CheckCircleFilled />}>
                  Đánh giá của bạn
                </Tag>
                {userReview.status === 'pending' && <Tag color="warning">Chờ kiểm duyệt</Tag>}
                {userReview.status === 'rejected' && <Tag color="error">Bị từ chối</Tag>}
              </Space>
              <Button
                type="link"
                size="small"
                onClick={openEditDialog}
                icon={<EditOutlined />}
              >
                Sửa
              </Button>
            </div>
            <div className="flex items-center gap-2 mb-2">
              <Rate disabled value={userReview.rating} style={{ color: '#faad14', fontSize: 14 }} />
              <Text type="secondary" className="text-xs">
                {formatDate(userReview.createdAt)}
              </Text>
            </div>
            {userReview.title && <Title level={5} className="!mb-1 text-sm">{userReview.title}</Title>}
            <Paragraph className="!mb-0 text-sm whitespace-pre-wrap">{userReview.content}</Paragraph>

            {userReview.sellerReply?.comment && (
              <div className="mt-3 p-3 rounded-lg bg-background/80 border border-[#1677ff]/20 text-xs">
                <div className="flex items-center justify-between font-semibold mb-1 text-[#1677ff]">
                  <Space>
                    <MessageOutlined />
                    <span>Phản hồi từ người bán</span>
                  </Space>
                  {userReview.sellerReply.repliedAt && (
                    <Text type="secondary" className="text-xs font-normal">
                      {formatDate(userReview.sellerReply.repliedAt)}
                    </Text>
                  )}
                </div>
                <Paragraph className="!mb-0 whitespace-pre-wrap">{userReview.sellerReply.comment}</Paragraph>
              </div>
            )}
          </Card>
        )}

        {/* Reviews List */}
        <div className="space-y-4">
          <Title level={5} className="!mb-0">
            Danh sách nhận xét ({summary.totalCount})
          </Title>

          {loading ? (
            <div className="py-12 flex justify-center">
              <Spin />
            </div>
          ) : reviews.length === 0 ? (
            <Empty
              image={<MessageOutlined style={{ fontSize: 40, color: '#bfbfbf' }} />}
              description={
                <div className="space-y-1">
                  <p className="font-medium text-foreground text-sm">Chưa có đánh giá nào</p>
                  <p className="text-xs text-muted-foreground max-w-md">
                    Tài nguyên này chưa nhận được đánh giá từ khách hàng. Sau khi mua và tải file, bạn có thể là người đầu tiên chia sẻ cảm nhận!
                  </p>
                </div>
              }
              className="py-8"
            />
          ) : (
            <div className="divide-y divide-border">
              {reviews.map((rev) => (
                <div key={rev.id} className="py-5 flex flex-col gap-3">
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <Avatar
                        style={{ backgroundColor: '#1677ff', verticalAlign: 'middle' }}
                        size={40}
                      >
                        {rev.user.initials || 'KH'}
                      </Avatar>
                      <div>
                        <Space size={6} wrap>
                          <Text strong className="text-sm">{rev.user.name}</Text>
                          {rev.verifiedPurchase && (
                            <Tag color="success" icon={<CheckCircleFilled />} className="text-[11px] px-1.5 py-0">
                              Đã mua hàng
                            </Tag>
                          )}
                        </Space>
                        <div className="flex items-center gap-2 mt-0.5">
                          <Rate disabled value={rev.rating} style={{ color: '#faad14', fontSize: 13 }} />
                          <Text type="secondary" className="text-xs">
                            • {formatDate(rev.createdAt)}
                          </Text>
                        </div>
                      </div>
                    </div>
                  </div>

                  {rev.title && <Title level={5} className="!mb-0 text-sm font-semibold">{rev.title}</Title>}
                  <Paragraph className="!mb-0 text-sm text-foreground/90 whitespace-pre-wrap leading-relaxed">
                    {rev.content}
                  </Paragraph>

                  {rev.sellerReply?.comment && (
                    <div className="mt-2 p-3.5 rounded-lg bg-muted/40 border-l-2 border-[#1677ff] text-xs">
                      <div className="flex items-center justify-between font-semibold mb-1 text-[#1677ff]">
                        <Space>
                          <MessageOutlined />
                          <span>Phản hồi từ người bán</span>
                        </Space>
                        {rev.sellerReply.repliedAt && (
                          <Text type="secondary" className="text-xs font-normal">
                            {formatDate(rev.sellerReply.repliedAt)}
                          </Text>
                        )}
                      </div>
                      <Paragraph className="!mb-0 whitespace-pre-wrap">{rev.sellerReply.comment}</Paragraph>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Pagination */}
          {summary.totalCount > 6 && (
            <div className="flex justify-center pt-6 border-t border-border">
              <Pagination
                current={currentPage}
                total={summary.totalCount}
                pageSize={6}
                onChange={(page) => setCurrentPage(page)}
                showSizeChanger={false}
              />
            </div>
          )}
        </div>
      </div>

      {/* Review Dialog Form (Ant Design Modal) */}
      {isDialogOpen && (
        <Modal
          open={true}
          getContainer={false}
          onCancel={() => setIsDialogOpen(false)}
          title={
            <Space>
              <StarFilled style={{ color: '#faad14' }} />
              <span>{isEditing ? 'Chỉnh sửa đánh giá của bạn' : 'Viết đánh giá sản phẩm'}</span>
            </Space>
          }
          footer={null}
        >
          <p className="text-xs text-muted-foreground mb-4">
            Chia sẻ trải nghiệm sử dụng &quot;{productTitle}&quot; với cộng đồng KienTaoHub.
          </p>

          {formError && (
            <Alert type="error" title={formError} showIcon className="mb-4 text-xs" />
          )}

          <form onSubmit={handleSubmitReview} className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1.5">Mức độ hài lòng *</label>
              <div className="flex items-center gap-2">
                {[1, 2, 3, 4, 5].map((starVal) => (
                  <button
                    key={starVal}
                    type="button"
                    onClick={() => setRating(starVal)}
                    aria-label={STAR_LABELS[starVal]}
                    className="p-1 cursor-pointer transition-colors focus:outline-none rounded hover:scale-110"
                  >
                    <StarFilled
                      style={{
                        fontSize: 26,
                        color: starVal <= rating ? '#faad14' : '#d9d9d9',
                      }}
                    />
                  </button>
                ))}
              </div>
              <p className="text-xs text-muted-foreground mt-1">{STAR_LABELS[rating]}</p>
            </div>

            <div>
              <label htmlFor="review-title" className="block text-sm font-medium mb-1.5">
                Tiêu đề nhận xét (tùy chọn)
              </label>
              <input
                id="review-title"
                className="w-full px-3 py-1.5 rounded-md border border-neutral-300 dark:border-neutral-700 bg-transparent text-sm focus:outline-none focus:border-[#1677ff] focus:ring-1 focus:ring-[#1677ff]"
                placeholder="Tóm tắt ngắn gọn cảm nhận của bạn (vd: Bản vẽ rất chuẩn và chi tiết)"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={120}
              />
            </div>

            <div>
              <label htmlFor="review-content" className="block text-sm font-medium mb-1.5">
                Nội dung chi tiết *
              </label>
              <textarea
                id="review-content"
                className="w-full p-3 rounded-md border border-neutral-300 dark:border-neutral-700 bg-transparent text-sm focus:outline-none focus:border-[#1677ff] focus:ring-1 focus:ring-[#1677ff]"
                placeholder="Chất lượng file thế nào? Độ tương thích phần mềm? Có đầy đủ chi tiết kỹ thuật không? (tối thiểu 5 ký tự)"
                value={content}
                onChange={(e) => setContent(e.target.value)}
                rows={4}
                maxLength={5000}
                required
              />
              <p className="text-[11px] text-muted-foreground mt-1">
                Tối thiểu 5 ký tự. Đánh giá của bạn sẽ được hiển thị công khai kèm huy hiệu &quot;Đã mua hàng&quot;.
              </p>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-border">
              <Button onClick={() => setIsDialogOpen(false)} disabled={isSubmitting}>
                Hủy bỏ
              </Button>
              <Button type="primary" htmlType="submit" loading={isSubmitting} className="!bg-[#1677ff]">
                {isEditing ? 'Lưu cập nhật' : 'Gửi đánh giá'}
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </Card>
  )
}
