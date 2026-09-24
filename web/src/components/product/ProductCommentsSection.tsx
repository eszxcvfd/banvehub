'use client'

import React, { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  MessageSquareText,
  MessageCircle,
  CornerDownRight,
  ShieldCheck,
  BadgeCheck,
  Loader2,
  Lock,
  ChevronLeft,
  ChevronRight,
  Send,
  EyeOff,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
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

export type CommentItem = {
  id: number
  productId: number
  content: string
  status: string
  parentId?: number | null
  isSellerReply: boolean
  isAdminReply: boolean
  roleBadge?: string | null
  createdAt: string
  updatedAt?: string
  user: {
    id: number
    name: string
    initials: string
    avatar?: string | null
  }
  replies: CommentItem[]
}

export type ProductCommentsSectionProps = {
  productId: number
  productTitle: string
  sellerId?: number | string | null
  className?: string
}

function formatTimeAgo(dateString: string): string {
  try {
    const d = new Date(dateString)
    const now = new Date()
    const diffSec = Math.floor((now.getTime() - d.getTime()) / 1000)
    if (diffSec < 60) return 'vừa xong'
    const diffMin = Math.floor(diffSec / 60)
    if (diffMin < 60) return `${diffMin} phút trước`
    const diffHour = Math.floor(diffMin / 60)
    if (diffHour < 24) return `${diffHour} giờ trước`
    const diffDays = Math.floor(diffHour / 24)
    if (diffDays < 30) return `${diffDays} ngày trước`
    return d.toLocaleDateString('vi-VN', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    })
  } catch {
    return dateString
  }
}

export function ProductCommentsSection({
  productId,
  productTitle,
  sellerId,
  className = '',
}: ProductCommentsSectionProps) {
  const { user } = useAuth()
  const pathname = usePathname()

  const [loading, setLoading] = useState<boolean>(true)
  const [comments, setComments] = useState<CommentItem[]>([])
  const [totalComments, setTotalComments] = useState<number>(0)
  const [currentPage, setCurrentPage] = useState<number>(1)
  const [totalPages, setTotalPages] = useState<number>(1)

  // Question submission form
  const [questionContent, setQuestionContent] = useState<string>('')
  const [isSubmittingQuestion, setIsSubmittingQuestion] = useState<boolean>(false)

  // Inline reply form state
  const [replyingToId, setReplyingToId] = useState<number | null>(null)
  const [replyContent, setReplyContent] = useState<string>('')
  const [isSubmittingReply, setIsSubmittingReply] = useState<boolean>(false)

  // Refresh trigger
  const [refreshKey, setRefreshKey] = useState<number>(0)
  const [hidingCommentId, setHidingCommentId] = useState<number | null>(null)

  useEffect(() => {
    if (!productId) return

    let mounted = true
    const controller = new AbortController()

    fetch(`/api/v1/products/${productId}/comments?page=${currentPage}&limit=10`, {
      credentials: 'include',
      signal: controller.signal,
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!mounted) return
        if (data?.success) {
          setComments(data.comments || [])
          setTotalComments(data.totalComments || 0)
          setTotalPages(data.pagination?.totalPages || 1)
          setCurrentPage(data.pagination?.page || 1)
        }
        setLoading(false)
      })
      .catch((err: unknown) => {
        if ((err as { name?: string })?.name === 'AbortError') return
        if (mounted) setLoading(false)
      })

    return () => {
      mounted = false
      controller.abort()
    }
  }, [productId, currentPage, refreshKey])

  // Submit new top-level question
  const handleSubmitQuestion = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!user) {
      toast.error('Vui lòng đăng nhập để đặt câu hỏi.')
      return
    }

    const trimmed = questionContent.trim()
    if (trimmed.length < 3) {
      toast.error('Nội dung câu hỏi phải có ít nhất 3 ký tự.')
      return
    }

    setIsSubmittingQuestion(true)
    try {
      const res = await fetch(`/api/v1/products/${productId}/comments`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({ content: trimmed }),
      })

      const data = await res.json()
      if (res.ok && data.success) {
        toast.success('Đã gửi câu hỏi thành công!')
        setQuestionContent('')
        setCurrentPage(1)
        setRefreshKey((k) => k + 1)
      } else {
        toast.error(data.message || 'Không thể gửi câu hỏi. Vui lòng thử lại.')
      }
    } catch {
      toast.error('Đã xảy ra lỗi mạng. Vui lòng thử lại.')
    } finally {
      setIsSubmittingQuestion(false)
    }
  }

  // Submit reply to an existing comment
  const handleSubmitReply = async (parentId: number) => {
    if (!user) {
      toast.error('Vui lòng đăng nhập để trả lời.')
      return
    }

    const trimmed = replyContent.trim()
    if (trimmed.length < 3) {
      toast.error('Nội dung phản hồi phải có ít nhất 3 ký tự.')
      return
    }

    setIsSubmittingReply(true)
    try {
      const res = await fetch(`/api/v1/products/${productId}/comments`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          parentId,
          content: trimmed,
        }),
      })

      const data = await res.json()
      if (res.ok && data.success) {
        toast.success('Đã gửi câu trả lời thành công!')
        setReplyContent('')
        setReplyingToId(null)
        setRefreshKey((k) => k + 1)
      } else {
        toast.error(data.message || 'Không thể gửi câu trả lời. Vui lòng thử lại.')
      }
    } catch {
      toast.error('Đã xảy ra lỗi mạng. Vui lòng thử lại.')
    } finally {
      setIsSubmittingReply(false)
    }
  }

  // Soft-delete / hide comment
  const handleHideComment = async (commentId: number) => {
    if (hidingCommentId !== null) return
    setHidingCommentId(commentId)
    try {
      const res = await fetch(`/api/v1/products/${productId}/comments/${commentId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({ status: 'hidden' }),
      })

      const data = await res.json()
      if (res.ok && data.success) {
        toast.success('Đã ẩn bình luận.')
        setRefreshKey((k) => k + 1)
      } else {
        toast.error(data.message || 'Không thể ẩn bình luận.')
      }
    } catch {
      toast.error('Đã xảy ra lỗi khi ẩn bình luận.')
    } finally {
      setHidingCommentId(null)
    }
  }

  const isAdmin = Boolean(user?.roles?.includes('admin'))
  const isModerator = Boolean(user?.roles?.includes('moderator'))
  const isPrivileged = isAdmin || isModerator
  const isSeller = Boolean(user && sellerId && String(user.id) === String(sellerId))

  return (
    <section
      id="comments-section"
      aria-label="Hỏi đáp và bình luận sản phẩm"
      className={`w-full bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/90 dark:border-slate-800 text-slate-900 dark:text-slate-100 p-6 sm:p-8 shadow-xs ${className}`}
    >
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-6 border-b border-slate-100 dark:border-slate-800 gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <MessageSquareText className="w-5 h-5 text-[#1677ff]" />
            <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
              Hỏi đáp & Bình luận
            </h2>
            <span className="inline-flex items-center rounded-full bg-blue-50 dark:bg-blue-950/60 border border-blue-100 dark:border-blue-900/40 px-2.5 py-0.5 text-xs font-semibold text-[#1677ff] dark:text-blue-400">
              {totalComments}
            </span>
          </div>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Trao đổi trực tiếp với tác giả hoặc cộng đồng về &quot;{productTitle}&quot;.
          </p>
        </div>
      </div>

      {/* Main interactive comment form */}
      <div className="pt-6">
        {user ? (
          <form onSubmit={handleSubmitQuestion} className="space-y-3">
            <Textarea
              id="qa-comment-input"
              value={questionContent}
              onChange={(e) => setQuestionContent(e.target.value)}
              onKeyDown={(e) => {
                if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                  e.preventDefault()
                  if (!isSubmittingQuestion && questionContent.trim().length >= 3) {
                    handleSubmitQuestion(e as unknown as React.FormEvent)
                  }
                }
              }}
              placeholder="Đặt câu hỏi về tài nguyên này..."
              rows={3}
              maxLength={5000}
              className="resize-y rounded-xl border border-slate-200 dark:border-slate-700 focus:border-[#1677ff] focus:ring-1 focus:ring-[#1677ff] bg-slate-50/50 dark:bg-slate-800/40 text-slate-900 dark:text-slate-100 placeholder:text-slate-400"
              aria-label="Đặt câu hỏi về tài nguyên này"
            />
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <span className="text-xs text-slate-500 dark:text-slate-400">
                Tối thiểu 3 ký tự. Câu hỏi sẽ hiển thị công khai để người bán và cộng đồng hỗ trợ.
              </span>
              <Button
                type="submit"
                disabled={isSubmittingQuestion || questionContent.trim().length < 3}
                className="self-end sm:self-auto cursor-pointer !bg-[#1677ff] hover:!bg-[#4096ff] text-white font-medium shadow-sm rounded-lg px-5 py-2 text-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed border-0"
              >
                {isSubmittingQuestion ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Đang gửi...
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4 mr-2" />
                    Gửi câu hỏi
                  </>
                )}
              </Button>
            </div>
          </form>
        ) : (
          <div className="rounded-xl border border-blue-100 dark:border-blue-900/40 p-5 bg-blue-50/50 dark:bg-blue-950/30 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-900/50 text-[#1677ff] flex items-center justify-center shrink-0">
                <Lock className="w-5 h-5" />
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  Bạn có thắc mắc về tài nguyên này?
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Đăng nhập để đặt câu hỏi hoặc trao đổi trực tiếp với người bán.
                </p>
              </div>
            </div>
            <Button asChild size="sm" className="cursor-pointer !bg-[#1677ff] hover:!bg-[#4096ff] text-white font-medium shadow-sm border-0 rounded-lg px-4 py-2 text-sm">
              <Link href={`/login?redirect=${encodeURIComponent(pathname || '/')}`}>
                Đăng nhập ngay
              </Link>
            </Button>
          </div>
        )}
      </div>

      {/* Comments List */}
      <div className="mt-8 space-y-6">
        {loading && comments.length === 0 ? (
          <div className="py-12 flex flex-col items-center justify-center text-center space-y-3">
            <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Đang tải danh sách câu hỏi...</p>
          </div>
        ) : comments.length === 0 ? (
          <div className="py-12 text-center rounded-xl border border-dashed border-slate-200 dark:border-slate-800 bg-slate-50/40 dark:bg-slate-900/40 space-y-3">
            <div className="w-12 h-12 rounded-full bg-blue-50 dark:bg-blue-950/60 text-[#1677ff] flex items-center justify-center mx-auto">
              <MessageCircle className="w-6 h-6" />
            </div>
            <p className="text-base font-semibold text-slate-900 dark:text-slate-100">Chưa có câu hỏi nào</p>
            <p className="text-sm text-slate-500 dark:text-slate-400 max-w-sm mx-auto">
              Hãy là người đầu tiên đặt câu hỏi cho người bán về tài nguyên này!
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            {comments.map((comment) => {
              const isAuthor = Boolean(user && String(user.id) === String(comment.user.id))
              const canHide = isAuthor || isPrivileged

              return (
                <div
                  key={comment.id}
                  className="rounded-xl border border-slate-200/90 dark:border-slate-800 p-4 sm:p-5 bg-white dark:bg-slate-900/80 shadow-xs transition-colors hover:border-slate-300 dark:hover:border-slate-700"
                >
                  {/* Top-level comment author header */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full bg-blue-50 dark:bg-blue-950/80 text-[#1677ff] font-bold flex items-center justify-center text-xs border border-blue-200 dark:border-blue-900/60">
                        {comment.user.initials}
                      </div>
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-sm text-slate-900 dark:text-slate-100">
                            {comment.user.name}
                          </span>
                          {comment.isAdminReply && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-purple-100 dark:bg-purple-950/80 px-2 py-0.5 text-[11px] font-semibold text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800">
                              <ShieldCheck className="w-3 h-3" />
                              Quản trị viên
                            </span>
                          )}
                          {comment.isSellerReply && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 dark:bg-blue-950/80 px-2 py-0.5 text-[11px] font-semibold text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
                              <BadgeCheck className="w-3 h-3" />
                              Tác giả / Người bán
                            </span>
                          )}
                        </div>
                        <span className="text-xs text-slate-500 dark:text-slate-400">
                          {formatTimeAgo(comment.createdAt)}
                        </span>
                      </div>
                    </div>

                    {canHide && (
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={hidingCommentId === comment.id}
                        onClick={() => handleHideComment(comment.id)}
                        className="h-8 px-2.5 text-xs text-slate-500 hover:text-rose-600 dark:hover:text-rose-400 cursor-pointer min-h-[36px] sm:min-h-0 touch-manipulation"
                        title="Ẩn bình luận"
                        aria-label="Ẩn bình luận"
                      >
                        <EyeOff className="w-3.5 h-3.5 mr-1" />
                        Ẩn
                      </Button>
                    )}
                  </div>

                  {/* Comment content */}
                  <div className="mt-3 text-sm text-slate-800 dark:text-slate-200 whitespace-pre-wrap leading-relaxed">
                    {comment.content}
                  </div>

                  {/* Reply trigger button */}
                  <div className="mt-3 pt-2 flex items-center gap-3">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        if (replyingToId === comment.id) {
                          setReplyingToId(null)
                          setReplyContent('')
                        } else {
                          setReplyingToId(comment.id)
                          setReplyContent('')
                        }
                      }}
                      className="h-8 px-2.5 text-xs font-medium text-[#1677ff] hover:text-[#4096ff] hover:bg-blue-50 dark:hover:bg-blue-950/40 rounded-lg cursor-pointer min-h-[36px] sm:min-h-0 touch-manipulation"
                    >
                      <CornerDownRight className="w-3.5 h-3.5 mr-1" />
                      Trả lời
                    </Button>
                  </div>

                  {/* Inline reply form */}
                  {replyingToId === comment.id && (
                    <div className="mt-3 p-3.5 rounded-xl border border-blue-100 dark:border-blue-900/40 bg-blue-50/30 dark:bg-blue-950/20 space-y-3">
                      {user ? (
                        <div className="space-y-2">
                          {(isSeller || isAdmin) && (
                            <div className="flex items-center gap-1.5 text-xs font-semibold">
                              {isSeller && (
                                <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 dark:bg-blue-950/80 px-2 py-0.5 text-[11px] font-semibold text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
                                  <BadgeCheck className="w-3 h-3" />
                                  Phản hồi với tư cách Người bán
                                </span>
                              )}
                              {isAdmin && (
                                <span className="inline-flex items-center gap-1 rounded-full bg-purple-100 dark:bg-purple-950/80 px-2 py-0.5 text-[11px] font-semibold text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800">
                                  <ShieldCheck className="w-3 h-3" />
                                  Phản hồi với tư cách Quản trị viên
                                </span>
                              )}
                            </div>
                          )}
                          <Textarea
                            value={replyContent}
                            onChange={(e) => setReplyContent(e.target.value)}
                            onKeyDown={(e) => {
                              if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                                e.preventDefault()
                                if (!isSubmittingReply && replyContent.trim().length >= 3) {
                                  handleSubmitReply(comment.id)
                                }
                              }
                            }}
                            placeholder="Viết câu trả lời..."
                            rows={2}
                            maxLength={5000}
                            className="text-sm rounded-lg border border-slate-200 dark:border-slate-700 focus:border-[#1677ff] focus:ring-1 focus:ring-[#1677ff] bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 placeholder:text-slate-400"
                            aria-label="Viết câu trả lời"
                          />
                          <div className="flex items-center justify-end gap-2">
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              disabled={isSubmittingReply}
                              onClick={() => {
                                setReplyingToId(null)
                                setReplyContent('')
                              }}
                              className="border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 text-xs px-3 py-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"
                            >
                              Hủy
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              disabled={isSubmittingReply || replyContent.trim().length < 3}
                              onClick={() => handleSubmitReply(comment.id)}
                              className="!bg-[#1677ff] hover:!bg-[#4096ff] text-white font-medium text-xs px-3.5 py-1.5 rounded-lg border-0 shadow-sm cursor-pointer disabled:opacity-50"
                            >
                              {isSubmittingReply ? (
                                <>
                                  <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                                  Đang gửi...
                                </>
                              ) : (
                                'Gửi phản hồi'
                              )}
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                          <span>Vui lòng đăng nhập để gửi câu trả lời.</span>
                          <Button asChild size="sm" className="h-7 text-xs !bg-[#1677ff] hover:!bg-[#4096ff] text-white border-0 rounded-lg">
                            <Link href={`/login?redirect=${encodeURIComponent(pathname || '/')}`}>
                              Đăng nhập
                            </Link>
                          </Button>
                        </div>
                      )}
                    </div>
                  )}

                  {/* 1-Level Nested Replies */}
                  {comment.replies && comment.replies.length > 0 && (
                    <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 space-y-3 pl-4 sm:pl-6 border-l-2 border-[#1677ff]/30 ml-2">
                      {comment.replies.map((reply) => {
                        const isReplyAuthor = Boolean(user && String(user.id) === String(reply.user.id))
                        const canHideReply = isReplyAuthor || isPrivileged

                        return (
                          <div key={reply.id} className="space-y-1.5">
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex items-center gap-2 flex-wrap">
                                <div className="w-6 h-6 rounded-full bg-blue-100 dark:bg-blue-950 text-[#1677ff] flex items-center justify-center text-[10px] font-bold">
                                  {reply.user.initials}
                                </div>
                                <span className="font-semibold text-xs text-slate-900 dark:text-slate-100">
                                  {reply.user.name}
                                </span>
                                {reply.isAdminReply && (
                                  <span className="inline-flex items-center gap-1 rounded-full bg-purple-100 dark:bg-purple-950/80 px-1.5 py-0.5 text-[10px] font-semibold text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800">
                                    <ShieldCheck className="w-2.5 h-2.5" />
                                    Quản trị viên
                                  </span>
                                )}
                                {reply.isSellerReply && (
                                  <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 dark:bg-blue-950/80 px-1.5 py-0.5 text-[10px] font-semibold text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
                                    <BadgeCheck className="w-2.5 h-2.5" />
                                    Tác giả / Người bán
                                  </span>
                                )}
                                <span className="text-[11px] text-slate-400 dark:text-slate-500">
                                  • {formatTimeAgo(reply.createdAt)}
                                </span>
                              </div>

                              {canHideReply && (
                                <button
                                  type="button"
                                  disabled={hidingCommentId === reply.id}
                                  onClick={() => handleHideComment(reply.id)}
                                  className="text-[11px] text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 cursor-pointer p-1.5 -m-1 touch-manipulation min-h-[32px] sm:min-h-0 inline-flex items-center disabled:opacity-50"
                                  title="Ẩn câu trả lời"
                                  aria-label="Ẩn câu trả lời"
                                >
                                  Ẩn
                                </button>
                              )}
                            </div>
                            <p className="text-xs text-slate-800 dark:text-slate-200 whitespace-pre-wrap leading-relaxed pl-8">
                              {reply.content}
                            </p>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}

        {/* Pagination Controls */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between pt-6 border-t border-slate-100 dark:border-slate-800">
            <Button
              variant="outline"
              size="sm"
              disabled={currentPage <= 1 || loading}
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              className="flex items-center gap-1 cursor-pointer border-slate-200 dark:border-slate-700 hover:border-[#1677ff] hover:text-[#1677ff]"
            >
              <ChevronLeft className="w-4 h-4" />
              Trang trước
            </Button>
            <span className="text-xs text-slate-500 dark:text-slate-400">
              Trang {currentPage} / {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={currentPage >= totalPages || loading}
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              className="flex items-center gap-1 cursor-pointer border-slate-200 dark:border-slate-700 hover:border-[#1677ff] hover:text-[#1677ff]"
            >
              Trang sau
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        )}
      </div>
    </section>
  )
}
