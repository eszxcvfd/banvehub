'use client'

import React, { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { useAuth } from '@/providers/Auth'
import { CheckCircle2, Flag, Loader2, Lock } from 'lucide-react'
import { toast } from 'sonner'
import { MODERATION_CASE_REASON_OPTIONS } from '@/collections/ModerationCases/reasons'

export type ProductReportDialogProps = {
  productId: number
  productTitle?: string
  className?: string
}

type ReportCase = {
  id: number | string
  status: string
  reason: string
}

/**
 * Storefront report entry point (FR-22, PLAN.md:797-810).
 *
 * Signed-in users pick one of the seven FR-22 reasons plus an optional note and POST
 * to `/api/v1/products/{id}/reports`, which creates the `moderation_cases` row. Guests
 * get a sign-in invitation instead of the form — reports are authenticated-only (owner
 * decision 2026-09-18), and the API answers `401` for them anyway.
 */
export function ProductReportDialog({
  productId,
  productTitle,
  className = '',
}: ProductReportDialogProps) {
  const { user } = useAuth()
  const pathname = usePathname()
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState<string>(MODERATION_CASE_REASON_OPTIONS[0].value)
  const [description, setDescription] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [createdCase, setCreatedCase] = useState<ReportCase | null>(null)

  const handleOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen)
    if (!nextOpen && createdCase) {
      // Reset only after a successful submission so an abandoned form is not lost.
      setCreatedCase(null)
      setDescription('')
      setErrorMsg(null)
    }
  }

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    setErrorMsg(null)
    setIsSubmitting(true)

    try {
      const res = await fetch(`/api/v1/products/${productId}/reports`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          reason,
          description: description.trim() || undefined,
        }),
      })

      const data = await res.json().catch(() => null)

      if (!res.ok || !data?.success) {
        throw new Error(data?.message || 'Không thể gửi báo cáo. Vui lòng thử lại.')
      }

      setCreatedCase(data.case)
      toast.success('Đã gửi báo cáo sản phẩm', {
        description: 'Ban kiểm duyệt sẽ xem xét báo cáo của bạn.',
      })
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Đã có lỗi xảy ra khi gửi báo cáo.'
      setErrorMsg(msg)
      toast.error('Lỗi khi gửi báo cáo', { description: msg })
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <section
      id="report-section"
      className={`w-full bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/90 dark:border-slate-800 text-slate-900 dark:text-slate-100 p-6 sm:p-7 shadow-xs ${className}`}
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-xl bg-amber-50 dark:bg-amber-950/50 border border-amber-200/60 dark:border-amber-900/40 flex items-center justify-center text-amber-600 dark:text-amber-400 shrink-0">
            <Flag className="w-5 h-5" />
          </div>
          <div className="space-y-1">
            <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              Báo cáo sản phẩm
            </h2>
            <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">
              Phát hiện file lỗi, nội dung không đúng hoặc vi phạm bản quyền? Gửi báo cáo để ban kiểm
              duyệt xem xét.
            </p>
          </div>
        </div>

        {user ? (
          <Dialog open={open} onOpenChange={handleOpenChange}>
            <DialogTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="shrink-0 h-10 px-4 rounded-xl border-slate-200 dark:border-slate-700 font-medium text-slate-700 dark:text-slate-200 hover:border-amber-500 hover:text-amber-600 dark:hover:border-amber-500 dark:hover:text-amber-400 transition-colors shadow-xs"
              >
                <Flag className="w-4 h-4 mr-1.5 text-amber-500" />
                Báo cáo sản phẩm
              </Button>
            </DialogTrigger>

            <DialogContent className="sm:max-w-lg bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-xl">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2.5 text-base sm:text-lg font-bold text-slate-900 dark:text-slate-100">
                  <div className="w-8 h-8 rounded-lg bg-amber-50 dark:bg-amber-950/50 border border-amber-200/60 dark:border-amber-900/40 flex items-center justify-center text-amber-600 dark:text-amber-400">
                    <Flag className="w-4 h-4" />
                  </div>
                  Báo cáo sản phẩm
                </DialogTitle>
                <DialogDescription className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">
                  {productTitle ? `Tài nguyên: ${productTitle}. ` : ''}
                  Báo cáo của bạn sẽ được chuyển tới ban kiểm duyệt. Việc báo cáo không tự động ẩn
                  hay thay đổi trạng thái sản phẩm.
                </DialogDescription>
              </DialogHeader>

              {createdCase ? (
                <div className="py-6 flex flex-col items-center text-center space-y-4">
                  <div className="w-14 h-14 rounded-full bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200/80 dark:border-emerald-900/50 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
                    <CheckCircle2 className="w-8 h-8" />
                  </div>
                  <div className="space-y-1">
                    <h3 className="font-bold text-base sm:text-lg text-slate-900 dark:text-slate-100">
                      Đã gửi báo cáo thành công!
                    </h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400 font-mono">
                      Mã hồ sơ:{' '}
                      <span className="font-bold text-slate-900 dark:text-slate-100">
                        #{createdCase.id}
                      </span>
                    </p>
                  </div>
                  <p className="text-sm text-slate-500 dark:text-slate-400 max-w-sm">
                    Ban kiểm duyệt sẽ xem xét và xử lý hồ sơ này. Bạn không cần gửi lại báo cáo cho
                    cùng sản phẩm.
                  </p>
                  <DialogFooter className="w-full sm:justify-center pt-2">
                    <Button
                      onClick={() => setOpen(false)}
                      className="!bg-[#1677ff] hover:!bg-[#4096ff] text-white font-medium px-6 h-10 rounded-xl shadow-xs transition-colors"
                    >
                      Đóng cửa sổ
                    </Button>
                  </DialogFooter>
                </div>
              ) : (
                <form onSubmit={handleSubmit} noValidate className="space-y-4 pt-2">
                  {errorMsg && (
                    <div
                      role="alert"
                      className="p-3 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/50 text-red-600 dark:text-red-400 text-sm rounded-xl font-medium"
                    >
                      {errorMsg}
                    </div>
                  )}

                  <div className="space-y-1.5">
                    <label
                      htmlFor="report-reason"
                      className="text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400"
                    >
                      Lý do báo cáo <span className="text-red-500">*</span>
                    </label>
                    <select
                      id="report-reason"
                      className="w-full h-10 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm outline-none focus:border-[#1677ff] focus:ring-1 focus:ring-[#1677ff] transition-all"
                      value={reason}
                      onChange={(event) => setReason(event.target.value)}
                    >
                      {MODERATION_CASE_REASON_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <label
                      htmlFor="report-description"
                      className="text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400"
                    >
                      Ghi chú thêm (tuỳ chọn)
                    </label>
                    <Textarea
                      id="report-description"
                      rows={4}
                      maxLength={2000}
                      placeholder="Mô tả cụ thể vấn đề bạn gặp phải để ban kiểm duyệt xử lý nhanh hơn..."
                      value={description}
                      onChange={(event) => setDescription(event.target.value)}
                      className="rounded-xl border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 focus-visible:border-[#1677ff] focus-visible:ring-1 focus-visible:ring-[#1677ff] text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400"
                    />
                  </div>

                  <DialogFooter className="pt-3 gap-2">
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => setOpen(false)}
                      disabled={isSubmitting}
                      className="h-10 px-4 rounded-xl text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100"
                    >
                      Hủy
                    </Button>
                    <Button
                      type="submit"
                      disabled={isSubmitting}
                      className="min-w-28 h-10 rounded-xl !bg-[#1677ff] hover:!bg-[#4096ff] text-white font-medium shadow-xs transition-colors"
                    >
                      {isSubmitting ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin mr-1.5" />
                          Đang gửi...
                        </>
                      ) : (
                        'Gửi báo cáo'
                      )}
                    </Button>
                  </DialogFooter>
                </form>
              )}
            </DialogContent>
          </Dialog>
        ) : (
          <div className="flex items-center gap-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/80 p-3 sm:p-3.5 text-xs sm:text-sm text-slate-600 dark:text-slate-300 sm:max-w-md">
            <Lock className="w-4 h-4 shrink-0 text-slate-400 dark:text-slate-500" />
            <span>
              Chỉ người dùng đã đăng nhập mới có thể báo cáo sản phẩm.{' '}
              <Link
                href={`/login?redirect=${encodeURIComponent(pathname || '/shop')}`}
                className="font-semibold text-[#1677ff] hover:text-[#4096ff] hover:underline"
              >
                Đăng nhập
              </Link>{' '}
              để gửi báo cáo.
            </span>
          </div>
        )}
      </div>
    </section>
  )
}
