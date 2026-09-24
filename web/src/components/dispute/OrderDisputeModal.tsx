'use client'

import React, { useState } from 'react'
import { Modal, Button, Result } from 'antd'
import { WarningOutlined, ExclamationCircleOutlined } from '@ant-design/icons'
import Link from 'next/link'
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

  const distinctProducts = React.useMemo(() => {
    const seen = new Set<number>()
    return products.filter((product) => {
      if (seen.has(product.id)) return false
      seen.add(product.id)
      return true
    })
  }, [products])

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

  const handleClose = () => {
    setOpen(false)
    if (createdTicket) {
      setCreatedTicket(null)
      setSubject('')
      setDescription('')
      setErrorMsg(null)
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
      const msg = err.message || 'Đã có lỗi xảy ra khi tạo khiếu nại.'
      setErrorMsg(msg)
      toast.error('Lỗi khi gửi khiếu nại', {
        description: msg,
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  // Antd button type mapping
  const antdType =
    buttonVariant === 'destructive' ? 'primary' : buttonVariant === 'ghost' ? 'dashed' : 'default'
  const antdDanger = buttonVariant === 'destructive'
  const antdSize = buttonSize === 'sm' ? 'small' : buttonSize === 'lg' ? 'large' : 'middle'

  return (
    <>
      <Button
        type={antdType}
        danger={antdDanger}
        size={antdSize}
        icon={<ExclamationCircleOutlined style={{ color: '#faad14' }} />}
        onClick={() => setOpen(true)}
        className={className}
      >
        <span>{buttonText}</span>
      </Button>

      <Modal
        open={open}
        onCancel={handleClose}
        footer={null}
        title={
          <div className="flex items-center gap-2 text-base font-semibold text-neutral-900 dark:text-neutral-100">
            <WarningOutlined style={{ color: '#faad14' }} />
            <span>Báo lỗi / Khiếu nại đơn hàng</span>
          </div>
        }
        destroyOnHidden
        width={560}
      >
        <p className="text-xs text-neutral-500 mb-4">
          Đơn hàng #{orderCode || orderId}. Chúng tôi sẽ kết nối bạn với người bán và ban quản trị để giải quyết sự cố.
        </p>

        {createdTicket ? (
          <Result
            status="success"
            title="Đã tạo khiếu nại thành công!"
            subTitle={
              <div>
                <span>Mã định danh: </span>
                <strong className="font-mono text-neutral-900 dark:text-neutral-100">{createdTicket.code}</strong>
                <p className="text-xs text-neutral-500 mt-2">
                  Yêu cầu của bạn đã được chuyển tới người bán và bộ phận hỗ trợ kỹ thuật.
                </p>
              </div>
            }
            extra={[
              <Button type="primary" key="close" onClick={handleClose} className="!bg-[#1677ff]">
                Đóng cửa sổ
              </Button>,
            ]}
          />
        ) : (
          <form onSubmit={handleSubmit} noValidate className="space-y-4">
            {errorMsg && (
              <div
                role="alert"
                className="p-3 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/40 text-red-600 dark:text-red-400 text-sm rounded-md mb-3"
              >
                {errorMsg}
              </div>
            )}

            {/* Product selection if multiple distinct products exist */}
            {distinctProducts.length > 1 && (
              <div className="space-y-1.5">
                <label
                  htmlFor="ticket-product"
                  className="block text-xs font-semibold uppercase tracking-wider text-neutral-500"
                >
                  Sản phẩm gặp sự cố <span className="text-red-500">*</span>
                </label>
                <select
                  id="ticket-product"
                  className="w-full h-9 px-3 rounded-md border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-sm outline-none focus:ring-2 focus:ring-[#1677ff]"
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
                <p className="text-xs text-neutral-500">
                  Đơn hàng có nhiều sản phẩm của nhiều người bán khác nhau. Vui lòng chọn đúng sản phẩm gặp sự cố để khiếu nại được gửi tới người bán phù hợp.
                </p>
              </div>
            )}

            {/* Single product indicator */}
            {distinctProducts.length === 1 && (
              <div className="text-xs text-neutral-500 bg-neutral-100 dark:bg-neutral-800 p-2.5 rounded-md">
                <span className="font-medium text-neutral-900 dark:text-neutral-100">Sản phẩm: </span>
                <span>{distinctProducts[0].title}</span>
              </div>
            )}

            {/* Unknown products deep-link helper */}
            {distinctProducts.length === 0 && (
              <div className="text-xs text-neutral-500 bg-neutral-100 dark:bg-neutral-800 p-2.5 rounded-md space-y-1">
                <p>
                  Nếu đơn hàng gồm nhiều sản phẩm, vui lòng chọn đúng sản phẩm gặp sự cố trước khi gửi khiếu nại.
                </p>
                <a
                  href={`/orders/${orderId}`}
                  className="inline-flex items-center gap-1 font-medium text-[#1677ff] underline underline-offset-2"
                >
                  Mở chi tiết đơn hàng để chọn sản phẩm
                </a>
              </div>
            )}

            {/* Dispute Reason */}
            <div className="space-y-1.5">
              <label
                htmlFor="ticket-reason"
                className="block text-xs font-semibold uppercase tracking-wider text-neutral-500"
              >
                Lý do khiếu nại <span className="text-red-500">*</span>
              </label>
              <select
                id="ticket-reason"
                className="w-full h-9 px-3 rounded-md border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-sm outline-none focus:ring-2 focus:ring-[#1677ff]"
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

            {/* Dispute Subject */}
            <div className="space-y-1.5">
              <label
                htmlFor="ticket-subject"
                className="block text-xs font-semibold uppercase tracking-wider text-neutral-500"
              >
                Tiêu đề sự cố <span className="text-red-500">*</span>
              </label>
              <input
                id="ticket-subject"
                type="text"
                placeholder="Ví dụ: File Revit 2022 báo lỗi corrup khi mở"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                maxLength={200}
                className="w-full h-9 px-3 rounded-md border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-sm outline-none focus:ring-2 focus:ring-[#1677ff]"
              />
            </div>

            {/* Dispute Description */}
            <div className="space-y-1.5">
              <label
                htmlFor="ticket-description"
                className="block text-xs font-semibold uppercase tracking-wider text-neutral-500"
              >
                Mô tả chi tiết <span className="text-red-500">*</span>
              </label>
              <textarea
                id="ticket-description"
                rows={4}
                placeholder="Mô tả cụ thể sự cố bạn gặp phải, phiên bản phần mềm bạn dùng để mở file..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full p-3 rounded-md border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-sm outline-none focus:ring-2 focus:ring-[#1677ff] resize-none"
              />
            </div>

            {/* Priority */}
            <div className="space-y-1.5">
              <label htmlFor="ticket-priority" className="block text-xs font-semibold uppercase tracking-wider text-neutral-500">
                Mức độ khẩn cấp
              </label>
              <select
                id="ticket-priority"
                className="w-full h-9 px-3 rounded-md border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-sm outline-none focus:ring-2 focus:ring-[#1677ff]"
                value={priority}
                onChange={(e) => setPriority(e.target.value)}
              >
                <option value="LOW">Thấp (LOW)</option>
                <option value="NORMAL">Bình thường (NORMAL)</option>
                <option value="HIGH">Cao (HIGH)</option>
                <option value="URGENT">Khẩn cấp (URGENT)</option>
              </select>
            </div>

            <div className="flex justify-end gap-3 pt-3 border-t border-neutral-100 dark:border-neutral-800">
              <Button onClick={handleClose} disabled={isSubmitting}>
                Hủy bỏ
              </Button>
              <Button
                type="primary"
                htmlType="submit"
                loading={isSubmitting}
                danger
              >
                Gửi khiếu nại
              </Button>
            </div>
          </form>
        )}
      </Modal>
    </>
  )
}
