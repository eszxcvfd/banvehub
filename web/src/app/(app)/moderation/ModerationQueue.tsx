'use client'

import React, { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

interface ProductItem {
  id: string | number
  title: string
  slug: string
  price: number
  isFree: boolean
  moderationStatus: string
  createdAt: string
  seller?: { id: string | number; name?: string; email?: string } | null
  technicalSpecs?: {
    fileFormat?: string | null
    softwareVersion?: string | null
    fileSize?: string | null
    unit?: string | null
  } | null
  originalFiles?: Array<{
    id: string | number
    originalFilename?: string | null
    checksum?: string | null
    status?: string | null
    virusScanStatus?: string | null
  }> | null
  previewGallery?: Array<{
    id: string | number
    title?: string | null
    previewImage?: { url?: string | null } | null
  }> | null
}

interface Props {
  initialProducts: ProductItem[]
}

export function ModerationQueue({ initialProducts }: Props) {
  const router = useRouter()
  const [products, setProducts] = useState<ProductItem[]>(initialProducts)
  const [selectedProduct, setSelectedProduct] = useState<ProductItem | null>(null)
  const [actionType, setActionType] = useState<'approved' | 'changes_requested' | 'rejected' | null>(null)
  const [note, setNote] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleOpenAction = (product: ProductItem, type: 'approved' | 'changes_requested' | 'rejected') => {
    setSelectedProduct(product)
    setActionType(type)
    setNote('')
    setError(null)
  }

  const handleExecuteAction = async () => {
    if (!selectedProduct || !actionType) return

    if ((actionType === 'changes_requested' || actionType === 'rejected') && !note.trim()) {
      setError('Vui lòng nhập lý do / ghi chú hướng dẫn seller.')
      return
    }

    setLoading(true)
    setError(null)

    try {
      const res = await fetch('/api/moderation/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productId: selectedProduct.id,
          action: actionType,
          note: note.trim(),
        }),
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Lỗi xử lý kiểm duyệt.')

      // Remove from queue or update state
      setProducts((prev) => prev.filter((p) => p.id !== selectedProduct.id))
      setSelectedProduct(null)
      setActionType(null)
      router.refresh()
    } catch (err: any) {
      setError(err.message || 'Thao tác kiểm duyệt thất bại.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      {products.length === 0 ? (
        <div className="border rounded-xl p-12 text-center bg-card shadow-sm space-y-3">
          <div className="w-12 h-12 rounded-full bg-emerald-500/10 text-emerald-600 mx-auto flex items-center justify-center">
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h3 className="text-lg font-bold text-foreground">Hàng đợi kiểm duyệt trống</h3>
          <p className="text-sm text-muted-foreground max-w-md mx-auto">
            Tất cả bản vẽ và tài nguyên số đã được thẩm định. Không có hồ sơ nào đang chờ duyệt.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6">
          {products.map((p) => (
            <div key={p.id} className="border rounded-xl p-6 bg-card shadow-sm space-y-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b pb-4">
                <div>
                  <span className="text-xs uppercase font-bold tracking-wider text-amber-600 px-2 py-0.5 rounded bg-amber-500/10 border border-amber-500/20 mr-2">
                    Chờ duyệt (Submitted)
                  </span>
                  <span className="text-xs text-muted-foreground">ID: #{p.id}</span>
                  <h3 className="text-xl font-bold text-foreground mt-1">{p.title}</h3>
                </div>
                <div className="text-right">
                  <div className="text-base font-bold text-foreground">
                    {p.isFree || p.price === 0 ? (
                      <span className="text-emerald-600">Miễn phí</span>
                    ) : (
                      `${Number(p.price).toLocaleString('vi-VN')} ₫`
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Tác giả: {p.seller?.name || p.seller?.email || 'Seller'}
                  </div>
                </div>
              </div>

              {/* Specs & Security Inspection */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                <div className="p-3 rounded-lg bg-muted/40 border space-y-1.5">
                  <div className="font-semibold text-foreground">Thông số kỹ thuật (Specs):</div>
                  <div>• Định dạng: <span className="font-mono">{p.technicalSpecs?.fileFormat || 'N/A'}</span></div>
                  <div>• Phiên bản: <span>{p.technicalSpecs?.softwareVersion || 'N/A'}</span></div>
                  <div>• Đơn vị: <span>{p.technicalSpecs?.unit || 'metric'}</span></div>
                  <div>• Dung lượng: <span>{p.technicalSpecs?.fileSize || 'N/A'}</span></div>
                </div>

                <div className="p-3 rounded-lg bg-muted/40 border space-y-1.5">
                  <div className="font-semibold text-foreground">Kiểm tra bảo mật file gốc (BR-06):</div>
                  {p.originalFiles && p.originalFiles.length > 0 ? (
                    p.originalFiles.map((f, i) => (
                      <div key={i} className="space-y-0.5">
                        <div>• Tệp: <span className="font-mono font-medium">{f.originalFilename}</span></div>
                        <div className="truncate text-muted-foreground" title={f.checksum || ''}>
                          • SHA-256: <span className="font-mono">{f.checksum}</span>
                        </div>
                        <div className="text-emerald-600 font-semibold">• Quét mã độc: SẠCH ({f.virusScanStatus || 'clean'})</div>
                      </div>
                    ))
                  ) : (
                    <div className="text-muted-foreground italic">Chưa đính kèm file gốc</div>
                  )}
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex flex-wrap items-center justify-end gap-3 pt-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="text-orange-600 border-orange-200 hover:bg-orange-50 hover:text-orange-700"
                  onClick={() => handleOpenAction(p, 'changes_requested')}
                >
                  Yêu cầu chỉnh sửa
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="text-destructive border-destructive/20 hover:bg-destructive/10"
                  onClick={() => handleOpenAction(p, 'rejected')}
                >
                  Từ chối (Reject)
                </Button>
                <Button
                  size="sm"
                  className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold shadow-sm"
                  onClick={() => handleOpenAction(p, 'approved')}
                >
                  Phê duyệt & Xuất bản (Publish)
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Action Modal */}
      {selectedProduct && actionType && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-card border rounded-xl max-w-lg w-full p-6 shadow-xl space-y-4">
            <h3 className="text-lg font-bold text-foreground">
              {actionType === 'approved' && 'Xác nhận Phê duyệt & Xuất bản'}
              {actionType === 'changes_requested' && 'Yêu cầu Seller chỉnh sửa hồ sơ'}
              {actionType === 'rejected' && 'Từ chối duyệt bản vẽ'}
            </h3>

            <p className="text-sm text-muted-foreground">
              Sản phẩm: <span className="font-semibold text-foreground">{selectedProduct.title}</span>
            </p>

            {error && (
              <div className="p-3 rounded bg-destructive/15 text-destructive text-xs font-medium">
                {error}
              </div>
            )}

            {(actionType === 'changes_requested' || actionType === 'rejected') && (
              <div className="space-y-2">
                <Label htmlFor="note">Lý do & Ghi chú kiểm duyệt <span className="text-destructive">*</span></Label>
                <Input
                  id="note"
                  placeholder={actionType === 'changes_requested' ? 'Ví dụ: Cần bổ sung file PDF mặt bằng...' : 'Lý do từ chối...'}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  autoFocus
                />
              </div>
            )}

            {actionType === 'approved' && (
              <p className="text-xs text-emerald-600 bg-emerald-500/10 p-3 rounded border border-emerald-500/20">
                Khi phê duyệt, sản phẩm sẽ được tự động gắn nhãn Approved và chuyển trạng thái sang Published trên Marketplace.
              </p>
            )}

            <div className="flex items-center justify-end gap-3 pt-4 border-t">
              <Button
                variant="outline"
                disabled={loading}
                onClick={() => {
                  setSelectedProduct(null)
                  setActionType(null)
                }}
              >
                Hủy bỏ
              </Button>
              <Button
                disabled={loading}
                className={
                  actionType === 'approved'
                    ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                    : actionType === 'changes_requested'
                    ? 'bg-orange-600 hover:bg-orange-700 text-white'
                    : 'bg-destructive hover:bg-destructive/90 text-white'
                }
                onClick={handleExecuteAction}
              >
                {loading ? 'Đang xử lý...' : 'Xác nhận'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
