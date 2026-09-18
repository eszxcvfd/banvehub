'use client'

import React, { useState } from 'react'
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
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { AlertTriangle, CheckCircle2, Loader2 } from 'lucide-react'
import { toast } from 'sonner'

export type DisputeProductItem = {
  id: number
  title: string
}

export type OrderDisputeModalProps = {
  orderId: number
  orderCode?: string
  products?: DisputeProductItem[]
  preselectedProductId?: number
  buttonVariant?: 'outline' | 'default' | 'destructive' | 'secondary' | 'ghost'
  buttonSize?: 'default' | 'sm' | 'lg'
  buttonText?: string
  className?: string
  onSuccess?: (ticket: any) => void
}

const REASONS = [
  { value: 'FILE_CORRUPTED', label: 'File hỏng không mở được' },
  { value: 'MISLEADING_CONTENT', label: 'Nội dung không đúng mô tả' },
  { value: 'DOWNLOAD_ERROR', label: 'Lỗi khi tải file' },
  { value: 'BILLING_DISPUTE', label: 'Vấn đề thanh toán' },
  { value: 'OTHER', label: 'Khác' },
]

export function OrderDisputeModal({
  orderId,
  orderCode,
  products = [],
  preselectedProductId,
  buttonVariant = 'outline',
  buttonSize = 'sm',
  buttonText = 'Báo lỗi / Khiếu nại',
  className = '',
  onSuccess,
}: OrderDisputeModalProps) {
  const [open, setOpen] = useState(false)
  // An order can hold several rows of the same product: only distinct products count
  // as "multiple products" (the API applies the same rule).
  const distinctProducts = React.useMemo(() => {
    const seen = new Set<number>()
    return products.filter((product) => {
      if (seen.has(product.id)) return false
      seen.add(product.id)
      return true
    })
  }, [products])
  // The order's products may only become available after mount (async data), so the
  // effective selection is derived on every render instead of being synced in an
  // effect: an explicit user choice wins, then the preselected prop, then the only
  // distinct product. A multi-product order deliberately stays empty so the user must
  // pick one (the API refuses to guess).
  const [selectedProductId, setSelectedProductId] = useState<number | undefined>(undefined)
  const effectiveProductId =
    selectedProductId ??
    preselectedProductId ??
    (distinctProducts.length === 1 ? distinctProducts[0].id : undefined)
  const [reason, setReason] = useState('FILE_CORRUPTED')
  const [subject, setSubject] = useState('')
  const [description, setDescription] = useState('')
  const [priority, setPriority] = useState('NORMAL')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [createdTicket, setCreatedTicket] = useState<any | null>(null)

  const handleOpenChange = (newOpen: boolean) => {
    setOpen(newOpen)
    if (!newOpen) {
      // Reset form if closed after success
      if (createdTicket) {
        setCreatedTicket(null)
        setSubject('')
        setDescription('')
        setErrorMsg(null)
      }
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setErrorMsg(null)

    if (!subject.trim()) {
      setErrorMsg('Vui lòng nhập tiêu đề khiếu nại.')
      return
    }

    if (!description.trim()) {
      setErrorMsg('Vui lòng nhập mô tả chi tiết sự cố.')
      return
    }

    // Never let the client pick a product on the user's behalf when the order holds
    // several distinct products: the dispute must be attributed to the right seller.
    if (distinctProducts.length > 0 && !effectiveProductId) {
      setErrorMsg('Vui lòng chọn sản phẩm gặp sự cố trước khi gửi khiếu nại.')
      return
    }

    setIsSubmitting(true)

    try {
      const res = await fetch('/api/v1/tickets', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          orderId,
          productId: effectiveProductId,
          reason,
          subject: subject.trim(),
          description: description.trim(),
          priority,
        }),
      })

      const data = await res.json()

      if (!res.ok || !data.success) {
        throw new Error(data.message || 'Không thể gửi khiếu nại. Vui lòng thử lại.')
      }

      setCreatedTicket(data.ticket)
      toast.success('Gửi khiếu nại thành công!', {
        description: `Mã phiếu: ${data.ticket.code}`,
      })

      if (onSuccess) {
        onSuccess(data.ticket)
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Đã có lỗi xảy ra khi tạo khiếu nại.')
      toast.error('Lỗi khi gửi khiếu nại', {
        description: err.message,
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button
          variant={buttonVariant}
          size={buttonSize}
          className={`flex items-center gap-1.5 ${className}`}
        >
          <AlertTriangle className="w-4 h-4 text-amber-500" />
          <span>{buttonText}</span>
        </Button>
      </DialogTrigger>

      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base font-semibold">
            <AlertTriangle className="w-5 h-5 text-amber-500" />
            Báo lỗi / Khiếu nại đơn hàng
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            Đơn hàng #{orderCode || orderId}. Chúng tôi sẽ kết nối bạn với người bán và ban quản trị để giải quyết sự cố.
          </DialogDescription>
        </DialogHeader>

        {createdTicket ? (
          <div className="py-6 flex flex-col items-center text-center space-y-4">
            <div className="w-12 h-12 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center text-emerald-600">
              <CheckCircle2 className="w-7 h-7" />
            </div>
            <div className="space-y-1">
              <h3 className="font-semibold text-base">Đã tạo khiếu nại thành công!</h3>
              <p className="text-xs text-muted-foreground font-mono">
                Mã định danh: <span className="font-bold text-foreground">{createdTicket.code}</span>
              </p>
            </div>
            <p className="text-sm text-muted-foreground max-w-sm">
              Yêu cầu của bạn đã được chuyển tới người bán và bộ phận hỗ trợ kỹ thuật. Bạn có thể theo dõi phản hồi trong lịch sử khiếu nại của đơn hàng.
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

            {/* Product selection if multiple distinct products exist */}
            {distinctProducts.length > 1 && (
              <div className="space-y-1.5">
                <label htmlFor="ticket-product" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Sản phẩm gặp sự cố <span className="text-destructive">*</span>
                </label>
                <select
                  id="ticket-product"
                  className="w-full h-9 px-3 rounded-md border border-input bg-background text-sm outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  value={effectiveProductId ?? ''}
                  onChange={(e) =>
                    setSelectedProductId(e.target.value ? Number(e.target.value) : undefined)
                  }
                >
                  <option value="">— Chọn sản phẩm cần khiếu nại —</option>
                  {distinctProducts.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.title}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-muted-foreground">
                  Đơn hàng có nhiều sản phẩm của nhiều người bán khác nhau. Vui lòng chọn đúng sản
                  phẩm gặp sự cố để khiếu nại được gửi tới người bán phù hợp.
                </p>
              </div>
            )}

            {/* If a single distinct product, show info */}
            {distinctProducts.length === 1 && (
              <div className="text-xs text-muted-foreground bg-muted/50 p-2.5 rounded-md">
                <span className="font-medium text-foreground">Sản phẩm:</span>{' '}
                {distinctProducts[0].title}
              </div>
            )}

            {/* No product list available: deep-link to the order detail page, where the
                user can pick the exact product (and therefore the right seller). */}
            {distinctProducts.length === 0 && (
              <div className="text-xs text-muted-foreground bg-muted/50 p-2.5 rounded-md space-y-1">
                <p>
                  Nếu đơn hàng gồm nhiều sản phẩm, vui lòng chọn đúng sản phẩm gặp sự cố trước khi
                  gửi khiếu nại.
                </p>
                <a
                  href={`/orders/${orderId}`}
                  className="inline-flex items-center gap-1 font-medium text-primary underline underline-offset-2"
                >
                  Mở chi tiết đơn hàng để chọn sản phẩm
                </a>
              </div>
            )}

            {/* Reason selector */}
            <div className="space-y-1.5">
              <label htmlFor="ticket-reason" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Lý do khiếu nại <span className="text-destructive">*</span>
              </label>
              <select
                id="ticket-reason"
                className="w-full h-9 px-3 rounded-md border border-input bg-background text-sm outline-none focus-visible:ring-2 focus-visible:ring-primary"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              >
                {REASONS.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Subject */}
            <div className="space-y-1.5">
              <label htmlFor="ticket-subject" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Tiêu đề sự cố <span className="text-destructive">*</span>
              </label>
              <Input
                id="ticket-subject"
                placeholder="VD: Không giải nén được file RAR, báo lỗi hỏng dữ liệu..."
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                maxLength={200}
                required
              />
            </div>

            {/* Description */}
            <div className="space-y-1.5">
              <label htmlFor="ticket-description" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Mô tả chi tiết <span className="text-destructive">*</span>
              </label>
              <Textarea
                id="ticket-description"
                rows={4}
                placeholder="Mô tả cụ thể lỗi gặp phải, phần mềm và phiên bản đã sử dụng để mở file (VD: AutoCAD 2024, WinRAR 7.0), ảnh chụp màn hình lỗi nếu có..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                required
              />
            </div>

            {/* Priority */}
            <div className="space-y-1.5">
              <label htmlFor="ticket-priority" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Mức độ khẩn cấp
              </label>
              <select
                id="ticket-priority"
                className="w-full h-9 px-3 rounded-md border border-input bg-background text-sm outline-none focus-visible:ring-2 focus-visible:ring-primary"
                value={priority}
                onChange={(e) => setPriority(e.target.value)}
              >
                <option value="LOW">Thấp (LOW)</option>
                <option value="NORMAL">Bình thường (NORMAL)</option>
                <option value="HIGH">Cao (HIGH)</option>
                <option value="URGENT">Khẩn cấp (URGENT)</option>
              </select>
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
                  'Gửi khiếu nại'
                )}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}
