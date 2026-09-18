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
    } catch (error: any) {
      setErrorMsg(error?.message || 'Đã có lỗi xảy ra khi gửi báo cáo.')
      toast.error('Lỗi khi gửi báo cáo', { description: error?.message })
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <section id="report-section" className={`rounded-xl border bg-card p-4 sm:p-5 ${className}`}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            <Flag className="w-4 h-4 text-amber-500" />
            Báo cáo sản phẩm
          </h2>
          <p className="text-xs text-muted-foreground">
            Phát hiện file lỗi, nội dung không đúng hoặc vi phạm bản quyền? Gửi báo cáo để ban kiểm
            duyệt xem xét.
          </p>
        </div>

        {user ? (
          <Dialog open={open} onOpenChange={handleOpenChange}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm" className="shrink-0">
                <Flag className="w-4 h-4 text-amber-500" />
                Báo cáo sản phẩm
              </Button>
            </DialogTrigger>

            <DialogContent className="sm:max-w-lg">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2 text-base font-semibold">
                  <Flag className="w-5 h-5 text-amber-500" />
                  Báo cáo sản phẩm
                </DialogTitle>
                <DialogDescription className="text-xs text-muted-foreground">
                  {productTitle
                    ? `Tài nguyên: ${productTitle}. `
                    : ''}
                  Báo cáo của bạn sẽ được chuyển tới ban kiểm duyệt. Việc báo cáo không tự động ẩn
                  hay thay đổi trạng thái sản phẩm.
                </DialogDescription>
              </DialogHeader>

              {createdCase ? (
                <div className="py-6 flex flex-col items-center text-center space-y-4">
                  <div className="w-12 h-12 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center text-emerald-600">
                    <CheckCircle2 className="w-7 h-7" />
                  </div>
                  <div className="space-y-1">
                    <h3 className="font-semibold text-base">Đã gửi báo cáo thành công!</h3>
                    <p className="text-xs text-muted-foreground font-mono">
                      Mã hồ sơ: <span className="font-bold text-foreground">#{createdCase.id}</span>
                    </p>
                  </div>
                  <p className="text-sm text-muted-foreground max-w-sm">
                    Ban kiểm duyệt sẽ xem xét và xử lý hồ sơ này. Bạn không cần gửi lại báo cáo cho
                    cùng sản phẩm.
                  </p>
                  <DialogFooter className="w-full sm:justify-center pt-2">
                    <Button onClick={() => setOpen(false)}>Đóng cửa sổ</Button>
                  </DialogFooter>
                </div>
              ) : (
                <form onSubmit={handleSubmit} noValidate className="space-y-4 pt-2">
                  {errorMsg && (
                    <div
                      role="alert"
                      className="p-3 bg-destructive/10 border border-destructive/20 text-destructive text-sm rounded-md"
                    >
                      {errorMsg}
                    </div>
                  )}

                  <div className="space-y-1.5">
                    <label
                      htmlFor="report-reason"
                      className="text-xs font-semibold uppercase tracking-wider text-muted-foreground"
                    >
                      Lý do báo cáo <span className="text-destructive">*</span>
                    </label>
                    <select
                      id="report-reason"
                      className="w-full h-9 px-3 rounded-md border border-input bg-background text-sm outline-none focus-visible:ring-2 focus-visible:ring-primary"
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
                      className="text-xs font-semibold uppercase tracking-wider text-muted-foreground"
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
                    />
                  </div>

                  <DialogFooter className="pt-2">
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => setOpen(false)}
                      disabled={isSubmitting}
                    >
                      Hủy
                    </Button>
                    <Button type="submit" disabled={isSubmitting} className="min-w-28">
                      {isSubmitting ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin mr-1" />
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
          <div className="flex items-center gap-3 rounded-lg bg-muted/60 border p-3 text-xs text-muted-foreground sm:max-w-md">
            <Lock className="w-4 h-4 shrink-0" />
            <span>
              Chỉ người dùng đã đăng nhập mới có thể báo cáo sản phẩm.{' '}
              <Link
                href={`/login?redirect=${encodeURIComponent(pathname || '/shop')}`}
                className="font-semibold underline underline-offset-2 hover:text-foreground"
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
