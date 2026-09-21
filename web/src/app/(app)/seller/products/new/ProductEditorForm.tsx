'use client'

import React, { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'

interface Option {
  id: string | number
  title: string
}

interface Props {
  categories: Option[]
  softwareTypes: Option[]
  tags: Option[]
}

export function ProductEditorForm({ categories, softwareTypes, tags }: Props) {
  const router = useRouter()

  // Product fields
  const [title, setTitle] = useState('')
  const [price, setPrice] = useState('200000')
  const [isFree, setIsFree] = useState(false)
  // Empty until the seller types a value or the upload measures one: a form default becomes catalog
  // data, so the examples live in the inputs' placeholders (decision 0018 clause 1).
  const [fileFormat, setFileFormat] = useState('')
  const [softwareVersion, setSoftwareVersion] = useState('')
  const [fileSize, setFileSize] = useState('')
  const [unit, setUnit] = useState('metric') // the schema's own default
  const [selectedCategory, setSelectedCategory] = useState<string>(categories[0]?.id ? String(categories[0].id) : '')
  const [selectedSoftware, setSelectedSoftware] = useState<string>(softwareTypes[0]?.id ? String(softwareTypes[0].id) : '')
  const [copyrightDeclared, setCopyrightDeclared] = useState(false)

  // File uploads
  const [previewId, setPreviewId] = useState<string | number | null>(null)
  const [previewThumbnail, setPreviewThumbnail] = useState<string | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)

  const [originalFileId, setOriginalFileId] = useState<string | number | null>(null)
  const [originalFileName, setOriginalFileName] = useState<string | null>(null)
  const [originalChecksum, setOriginalChecksum] = useState<string | null>(null)
  const [originalLoading, setOriginalLoading] = useState(false)

  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  // Handle preview image upload
  const handlePreviewUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setPreviewLoading(true)
    setError(null)

    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('title', `Preview for ${title || 'CAD Blueprint'}`)

      const res = await fetch('/api/seller/upload-preview', {
        method: 'POST',
        body: formData,
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Lỗi tải lên ảnh xem trước.')

      setPreviewId(data.preview.id)
      setPreviewThumbnail(data.preview.url)
    } catch (err: any) {
      setError(err.message || 'Không thể tải lên ảnh xem trước.')
    } finally {
      setPreviewLoading(false)
    }
  }

  // Handle original file upload (private storage)
  const handleOriginalUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setOriginalLoading(true)
    setError(null)

    try {
      const formData = new FormData()
      formData.append('file', file)

      const res = await fetch('/api/seller/upload-file', {
        method: 'POST',
        body: formData,
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Lỗi tải lên tệp gốc.')

      setOriginalFileId(data.file.id)
      setOriginalFileName(data.file.filename)
      setOriginalChecksum(data.file.checksum)
      setFileSize(`${(data.file.fileSize / (1024 * 1024)).toFixed(1)} MB`)
      if (data.file.filename.includes('.')) {
        setFileFormat(`.${data.file.filename.split('.').pop().toLowerCase()}`)
      }
    } catch (err: any) {
      setError(err.message || 'Không thể tải lên tệp gốc.')
    } finally {
      setOriginalLoading(false)
    }
  }

  const handleSubmit = async (submitForReview: boolean) => {
    setError(null)

    if (!title.trim()) {
      setError('Vui lòng nhập tiêu đề bản vẽ / tài nguyên.')
      return
    }

    if (submitForReview && !copyrightDeclared) {
      setError('Bạn phải xác nhận cam kết bản quyền trước khi gửi kiểm duyệt.')
      return
    }

    setSubmitting(true)

    try {
      const res = await fetch('/api/seller/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          price: isFree ? 0 : Number(price),
          isFree,
          fileFormat,
          softwareVersion,
          fileSize,
          unit,
          categories: selectedCategory ? [Number(selectedCategory)] : [],
          software_types: selectedSoftware ? [Number(selectedSoftware)] : [],
          previewGallery: previewId ? [previewId] : [],
          originalFiles: originalFileId ? [originalFileId] : [],
          copyrightDeclared,
          submitForReview,
        }),
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Lỗi tạo sản phẩm.')

      router.push('/seller')
      router.refresh()
    } catch (err: any) {
      setError(err.message || 'Có lỗi xảy ra khi lưu sản phẩm.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-8">
      {error && (
        <div className="p-4 rounded-md bg-destructive/15 text-destructive text-sm font-medium border border-destructive/20">
          {error}
        </div>
      )}

      {/* 1. Basic Information */}
      <div className="space-y-4">
        <h3 className="text-lg font-bold text-foreground border-b pb-2">1. Thông tin chung</h3>
        <div className="space-y-2">
          <Label htmlFor="title" className="font-semibold">
            Tiêu đề bản vẽ / tài nguyên <span className="text-destructive">*</span>
          </Label>
          <Input
            id="title"
            placeholder="Ví dụ: Bản vẽ biệt thự 3 tầng hiện đại full kiến trúc kết cấu AutoCAD"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="category" className="font-semibold">Danh mục</Label>
            <select
              id="category"
              className="w-full flex h-10 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
            >
              {categories.map((cat) => (
                <option key={cat.id} value={cat.id}>
                  {cat.title}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="software" className="font-semibold">Phần mềm thiết kế</Label>
            <select
              id="software"
              className="w-full flex h-10 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              value={selectedSoftware}
              onChange={(e) => setSelectedSoftware(e.target.value)}
            >
              {softwareTypes.map((sw) => (
                <option key={sw.id} value={sw.id}>
                  {sw.title}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* 2. Technical Specifications */}
      <div className="space-y-4">
        <h3 className="text-lg font-bold text-foreground border-b pb-2">2. Thông số kỹ thuật (CAD / BIM Specs)</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="space-y-2">
            <Label htmlFor="fileFormat">Định dạng file</Label>
            <Input
              id="fileFormat"
              placeholder=".dwg, .rvt, .skp"
              value={fileFormat}
              onChange={(e) => setFileFormat(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="softwareVersion">Phiên bản tương thích</Label>
            <Input
              id="softwareVersion"
              placeholder="AutoCAD 2020+, Revit 2023"
              value={softwareVersion}
              onChange={(e) => setSoftwareVersion(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="fileSize">Dung lượng file</Label>
            <Input
              id="fileSize"
              placeholder="45.5 MB"
              value={fileSize}
              onChange={(e) => setFileSize(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="unit">Hệ đơn vị</Label>
            <select
              id="unit"
              className="w-full flex h-10 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background"
              value={unit}
              onChange={(e) => setUnit(e.target.value)}
            >
              <option value="metric">Hệ Mét (mm / m)</option>
              <option value="imperial">Hệ Inch / Feet</option>
              <option value="other">Khác</option>
            </select>
          </div>
        </div>
      </div>

      {/* 3. Pricing */}
      <div className="space-y-4">
        <h3 className="text-lg font-bold text-foreground border-b pb-2">3. Thiết lập giá bán</h3>
        <div className="flex items-center space-x-2 py-2">
          <Checkbox
            id="isFree"
            checked={isFree}
            onCheckedChange={(checked) => setIsFree(checked === true)}
          />
          <Label htmlFor="isFree" className="font-medium cursor-pointer">
            Chia sẻ miễn phí cho cộng đồng (Tải miễn phí - 0 ₫)
          </Label>
        </div>

        {!isFree && (
          <div className="space-y-2 max-w-xs">
            <Label htmlFor="price" className="font-semibold">Đơn giá bán (VND)</Label>
            <div className="relative">
              <Input
                id="price"
                type="number"
                step="10000"
                min="10000"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                className="pr-10 font-medium"
              />
              <span className="absolute right-3 top-2.5 text-sm text-muted-foreground font-semibold">₫</span>
            </div>
            <p className="text-xs text-muted-foreground">
              Mức giá đề xuất: 100.000 ₫ – 500.000 ₫ tùy quy mô bản vẽ.
            </p>
          </div>
        )}
      </div>

      {/* 4. Files & Previews */}
      <div className="space-y-4">
        <h3 className="text-lg font-bold text-foreground border-b pb-2">4. Tệp tin & Ảnh xem trước</h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Preview Image */}
          <div className="p-4 border rounded-lg bg-card space-y-3">
            <Label className="font-semibold block">Ảnh xem trước công khai (Watermarked Preview)</Label>
            <p className="text-xs text-muted-foreground">
              Ảnh phối cảnh 3D hoặc bản vẽ mặt bằng xuất JPG/PNG để khách hàng xem trước.
            </p>
            <Input
              type="file"
              accept="image/*"
              disabled={previewLoading}
              onChange={handlePreviewUpload}
            />
            {previewLoading && <p className="text-xs text-primary animate-pulse">Đang tải và đóng watermark...</p>}
            {previewThumbnail && (
              <div className="relative aspect-video rounded border overflow-hidden bg-muted">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={previewThumbnail} alt="Preview" className="w-full h-full object-cover" />
                <span className="absolute top-2 right-2 px-2 py-0.5 rounded text-[10px] font-bold bg-primary text-primary-foreground shadow">
                  WATERMARKED
                </span>
              </div>
            )}
          </div>

          {/* Private Original File */}
          <div className="p-4 border rounded-lg bg-card space-y-3">
            <Label className="font-semibold block">Tệp bản vẽ gốc (Private Original - BR-06)</Label>
            <p className="text-xs text-muted-foreground">
              Tệp CAD, Revit hoặc nén ZIP chứa file thiết kế gốc. Được mã hóa lưu trữ riêng tư, chỉ người mua mới được cấp quyền tải.
            </p>
            <Input
              type="file"
              disabled={originalLoading}
              onChange={handleOriginalUpload}
            />
            {originalLoading && <p className="text-xs text-primary animate-pulse">Đang tải lên và tính mã băm SHA-256...</p>}
            {originalFileName && (
              <div className="p-3 rounded bg-muted/40 border text-xs space-y-1 font-mono">
                <div className="text-foreground font-semibold">Tệp: {originalFileName}</div>
                <div className="text-muted-foreground truncate" title={originalChecksum || ''}>
                  SHA-256: {originalChecksum}
                </div>
                <div className="text-emerald-600 font-semibold">✓ Đã sẵn sàng (Clean)</div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 5. Copyright Declaration */}
      <div className="border-t pt-6 space-y-4">
        <div className="flex items-start space-x-3 p-4 rounded-lg bg-muted/30 border">
          <Checkbox
            id="copyright"
            checked={copyrightDeclared}
            onCheckedChange={(checked) => setCopyrightDeclared(checked === true)}
          />
          <Label htmlFor="copyright" className="text-sm text-foreground leading-snug cursor-pointer font-medium">
            Tôi xác nhận tôi là tác giả hoặc có đầy đủ quyền sở hữu trí tuệ hợp pháp đối với các tệp thiết kế này. KienTaoHub có quyền gỡ bỏ và xử lý vi phạm nếu phát hiện hành vi xâm phạm bản quyền (FLOW-U11 & BR-08).
          </Label>
        </div>
      </div>

      {/* Actions */}
      <div className="flex flex-col sm:flex-row items-center justify-end gap-3 border-t pt-6">
        <Button
          type="button"
          variant="outline"
          disabled={submitting}
          onClick={() => handleSubmit(false)}
          className="w-full sm:w-auto"
        >
          Lưu bản nháp (Save Draft)
        </Button>
        <Button
          type="button"
          disabled={submitting}
          onClick={() => handleSubmit(true)}
          className="w-full sm:w-auto font-semibold px-6"
        >
          {submitting ? 'Đang xử lý...' : 'Gửi kiểm duyệt (Submit for Review)'}
        </Button>
      </div>
    </div>
  )
}
