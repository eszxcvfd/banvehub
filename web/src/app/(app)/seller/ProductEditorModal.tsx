'use client'

import React, { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  Modal,
  Form,
  Input,
  InputNumber,
  Select,
  Checkbox,
  Button,
  Alert,
  App,
  Row,
  Col,
  Upload,
  Radio,
  Tooltip,
} from 'antd'
import {
  FileAddOutlined,
  UploadOutlined,
  CheckCircleFilled,
  FileZipOutlined,
  PictureOutlined,
  LoadingOutlined,
  SafetyCertificateFilled,
  DeleteOutlined,
  SwapOutlined,
  LockOutlined,
  CloudUploadOutlined,
  SendOutlined,
  SaveOutlined,
  InfoCircleOutlined,
} from '@ant-design/icons'

interface TaxonomyOption {
  id: string | number
  title: string
}

interface ProductEditorModalProps {
  open: boolean
  onClose: () => void
  categories: TaxonomyOption[]
  softwareTypes: TaxonomyOption[]
  tags?: TaxonomyOption[]
}

export function ProductEditorModal({
  open,
  onClose,
  categories,
  softwareTypes,
}: ProductEditorModalProps) {
  const { message } = App.useApp()
  const router = useRouter()
  const [form] = Form.useForm()

  // Form states
  const [pricingMode, setPricingMode] = useState<'paid' | 'free'>('paid')
  const [copyrightDeclared, setCopyrightDeclared] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Upload preview image states
  const [previewId, setPreviewId] = useState<string | number | null>(null)
  const [previewThumbnail, setPreviewThumbnail] = useState<string | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)

  // Upload original file states
  const [originalFileId, setOriginalFileId] = useState<string | number | null>(null)
  const [originalFileName, setOriginalFileName] = useState<string | null>(null)
  const [originalChecksum, setOriginalChecksum] = useState<string | null>(null)
  const [originalLoading, setOriginalLoading] = useState(false)
  // Filled from the real uploaded file (see the upload handler); an example belongs in the input's
  // placeholder, never in state that can be written to the catalog (decision 0018 clause 1).
  const [detectedFileSize, setDetectedFileSize] = useState<string>('')
  const [detectedFormat, setDetectedFormat] = useState<string>('')

  // Handle preview image upload
  const handlePreviewUpload = async (file: File) => {
    setPreviewLoading(true)
    setError(null)

    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('title', `Preview for ${form.getFieldValue('title') || 'CAD Blueprint'}`)

      const res = await fetch('/api/seller/upload-preview', {
        method: 'POST',
        body: formData,
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Lỗi tải lên ảnh xem trước.')

      setPreviewId(data.preview.id)
      setPreviewThumbnail(data.preview.url)
      message.success('Tải lên ảnh xem trước thành công!')
    } catch (err: any) {
      setError(err.message || 'Không thể tải lên ảnh xem trước.')
    } finally {
      setPreviewLoading(false)
    }
  }

  // Handle original file upload (private storage)
  const handleOriginalUpload = async (file: File) => {
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
      const sizeStr = `${(data.file.fileSize / (1024 * 1024)).toFixed(1)} MB`
      setDetectedFileSize(sizeStr)
      form.setFieldValue('fileSize', sizeStr)

      if (data.file.filename.includes('.')) {
        const ext = `.${data.file.filename.split('.').pop().toLowerCase()}`
        setDetectedFormat(ext)
        form.setFieldValue('fileFormat', ext)
      }
      message.success('Tệp bản vẽ gốc đã được tải lên và mã hóa an toàn!')
    } catch (err: any) {
      setError(err.message || 'Không thể tải lên tệp gốc.')
    } finally {
      setOriginalLoading(false)
    }
  }

  const handleReset = () => {
    form.resetFields()
    setPricingMode('paid')
    setCopyrightDeclared(false)
    setPreviewId(null)
    setPreviewThumbnail(null)
    setOriginalFileId(null)
    setOriginalFileName(null)
    setOriginalChecksum(null)
    setError(null)
  }

  const handleClose = () => {
    if (submitting) return
    handleReset()
    onClose()
  }

  const handleQuickPrice = (val: number) => {
    form.setFieldValue('price', val)
  }

  const handleSubmit = async (submitForReview: boolean) => {
    setError(null)

    try {
      const values = await form.validateFields()

      if (submitForReview && !copyrightDeclared) {
        setError('Bạn phải tích xác nhận cam kết bản quyền hợp pháp trước khi gửi duyệt.')
        return
      }

      setSubmitting(true)

      const isFree = pricingMode === 'free'

      const res = await fetch('/api/seller/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: values.title?.trim(),
          price: isFree ? 0 : Number(values.price || 0),
          isFree,
          fileFormat: values.fileFormat || detectedFormat,
          softwareVersion: values.softwareVersion || '',
          fileSize: values.fileSize || detectedFileSize,
          unit: values.unit || 'metric', // the schema's own default (Products.technicalSpecs.unit)
          categories: values.category ? [Number(values.category)] : [],
          software_types: values.software ? [Number(values.software)] : [],
          previewGallery: previewId ? [previewId] : [],
          originalFiles: originalFileId ? [originalFileId] : [],
          copyrightDeclared,
          submitForReview,
        }),
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Lỗi tạo sản phẩm.')

      message.success(
        submitForReview
          ? 'Đã gửi bản vẽ tới ban kiểm duyệt thành công!'
          : 'Đã lưu bản nháp thành công!',
      )

      handleClose()
      router.refresh()
    } catch (err: any) {
      if (err?.errorFields) {
        return
      }
      setError(err.message || 'Có lỗi xảy ra khi lưu sản phẩm.')
    } finally {
      setSubmitting(false)
    }
  }

  const isFree = pricingMode === 'free'

  return (
    <Modal
      open={open}
      onCancel={handleClose}
      footer={null}
      destroyOnHidden
      centered
      width={980}
      title={
        <div className="flex items-center justify-between pb-3 border-b border-slate-100 pr-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-50 text-[#1677ff] flex items-center justify-center text-xl flex-shrink-0 shadow-sm border border-blue-100/60">
              <FileAddOutlined />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-slate-900 tracking-tight leading-none">
                  Đăng tải tài nguyên & Bản vẽ mới
                </h2>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-blue-50 text-[#1677ff] border border-blue-200">
                  Seller Studio
                </span>
              </div>
              <p className="text-xs text-slate-400 font-normal mt-1">
                Điền thông số kỹ thuật, tải ảnh xem trước và tệp thiết kế gốc để ban kiểm duyệt thẩm định.
              </p>
            </div>
          </div>
        </div>
      }
      className="modern-seller-studio-modal"
    >
      <div className="pt-2">
        {error && (
          <Alert title={error} type="error" showIcon className="mb-4 rounded-xl text-xs" />
        )}

        <Form
          form={form}
          layout="vertical"
          initialValues={{
            price: 200000,
            unit: 'metric', // the schema's own default; fileFormat/fileSize/softwareVersion are written
            // only when the seller typed them or the upload measured them (decision 0018 clause 1)
            category: categories[0]?.id ? String(categories[0].id) : undefined,
            software: softwareTypes[0]?.id ? String(softwareTypes[0].id) : undefined,
          }}
        >
          <Row gutter={[24, 20]}>
            {/* LEFT COLUMN: Metadata, Specs, Pricing */}
            <Col xs={24} md={13}>
              <div className="space-y-4">
                {/* 1. THÔNG TIN BẢN VẼ */}
                <div className="p-4 rounded-xl border border-slate-100 bg-white shadow-xs space-y-3">
                  <div className="flex items-center gap-2">
                    <span className="w-5 h-5 rounded-full bg-blue-50 text-[#1677ff] text-[11px] font-bold flex items-center justify-center border border-blue-100">
                      1
                    </span>
                    <span className="text-xs font-bold text-slate-800 tracking-wide uppercase">
                      Thông tin bản vẽ
                    </span>
                  </div>

                  <Form.Item
                    name="title"
                    label={<span className="text-xs font-semibold text-slate-700">Tiêu đề bản vẽ / tài nguyên</span>}
                    rules={[{ required: true, message: 'Vui lòng nhập tiêu đề bản vẽ' }]}
                    className="!mb-2.5"
                  >
                    <Input
                      placeholder="Ví dụ: Bản vẽ biệt thự 3 tầng hiện đại full kiến trúc kết cấu AutoCAD"
                      size="middle"
                      className="rounded-lg text-xs"
                      allowClear
                    />
                  </Form.Item>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    <Form.Item
                      name="category"
                      label={<span className="text-xs font-semibold text-slate-700">Danh mục</span>}
                      rules={[{ required: true, message: 'Vui lòng chọn danh mục' }]}
                      className="!mb-0"
                    >
                      <Select
                        size="middle"
                        className="rounded-lg text-xs"
                        options={categories.map((c) => ({ label: c.title, value: String(c.id) }))}
                        placeholder="Chọn danh mục"
                      />
                    </Form.Item>

                    <Form.Item
                      name="software"
                      label={<span className="text-xs font-semibold text-slate-700">Phần mềm thiết kế</span>}
                      rules={[{ required: true, message: 'Vui lòng chọn phần mềm' }]}
                      className="!mb-0"
                    >
                      <Select
                        size="middle"
                        className="rounded-lg text-xs"
                        options={softwareTypes.map((s) => ({ label: s.title, value: String(s.id) }))}
                        placeholder="Chọn phần mềm"
                      />
                    </Form.Item>
                  </div>
                </div>

                {/* 2. THÔNG SỐ KỸ THUẬT (CAD/BIM SPECS) */}
                <div className="p-4 rounded-xl border border-slate-100 bg-white shadow-xs space-y-3">
                  <div className="flex items-center gap-2">
                    <span className="w-5 h-5 rounded-full bg-blue-50 text-[#1677ff] text-[11px] font-bold flex items-center justify-center border border-blue-100">
                      2
                    </span>
                    <span className="text-xs font-bold text-slate-800 tracking-wide uppercase">
                      Thông số kỹ thuật (CAD / BIM)
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2.5">
                    <Form.Item
                      name="fileFormat"
                      label={<span className="text-xs font-semibold text-slate-700">Định dạng file</span>}
                      className="!mb-0"
                    >
                      <Input placeholder=".dwg, .rvt, .skp" className="rounded-lg text-xs font-mono" />
                    </Form.Item>

                    <Form.Item
                      name="softwareVersion"
                      label={<span className="text-xs font-semibold text-slate-700">Phiên bản hỗ trợ</span>}
                      className="!mb-0"
                    >
                      <Input placeholder="AutoCAD 2022+" className="rounded-lg text-xs" />
                    </Form.Item>

                    <Form.Item
                      name="fileSize"
                      label={<span className="text-xs font-semibold text-slate-700">Dung lượng</span>}
                      className="!mb-0"
                    >
                      <Input placeholder="25 MB" className="rounded-lg text-xs font-mono" />
                    </Form.Item>

                    <Form.Item
                      name="unit"
                      label={<span className="text-xs font-semibold text-slate-700">Hệ đơn vị</span>}
                      className="!mb-0"
                    >
                      <Select
                        className="rounded-lg text-xs"
                        options={[
                          { label: 'Hệ Mét (mm / m)', value: 'metric' },
                          { label: 'Hệ Inch / Feet', value: 'imperial' },
                          { label: 'Khác', value: 'other' },
                        ]}
                      />
                    </Form.Item>
                  </div>
                </div>

                {/* 3. THIẾT LẬP GIÁ BÁN */}
                <div className="p-4 rounded-xl border border-slate-100 bg-white shadow-xs space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="w-5 h-5 rounded-full bg-blue-50 text-[#1677ff] text-[11px] font-bold flex items-center justify-center border border-blue-100">
                        3
                      </span>
                      <span className="text-xs font-bold text-slate-800 tracking-wide uppercase">
                        Giá bán & Doanh thu
                      </span>
                    </div>

                    <Radio.Group
                      size="small"
                      value={pricingMode}
                      onChange={(e) => setPricingMode(e.target.value)}
                      optionType="button"
                      buttonStyle="solid"
                    >
                      <Radio.Button value="paid" className="text-xs">
                        Có phí
                      </Radio.Button>
                      <Radio.Button value="free" className="text-xs">
                        Miễn phí
                      </Radio.Button>
                    </Radio.Group>
                  </div>

                  {pricingMode === 'paid' ? (
                    <div className="space-y-2 pt-1">
                      <Form.Item
                        name="price"
                        rules={[{ required: !isFree, message: 'Vui lòng nhập giá bán' }]}
                        className="!mb-1.5"
                      >
                        <InputNumber<number>
                          style={{ width: '100%' }}
                          size="large"
                          min={10000}
                          step={10000}
                          formatter={(val) => `${val}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
                          parser={(val) => Number(val ? val.replace(/\$\s?|(,*)/g, '') : 0)}
                          suffix={<span className="text-xs font-bold text-slate-500 pr-1">đ</span>}
                          className="rounded-xl text-sm font-semibold"
                        />
                      </Form.Item>

                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-[11px] text-slate-400">Chọn nhanh:</span>
                        {[50000, 100000, 200000, 500000].map((val) => (
                          <button
                            key={val}
                            type="button"
                            onClick={() => handleQuickPrice(val)}
                            className="px-2 py-0.5 text-[11px] rounded-md bg-slate-100 hover:bg-blue-50 hover:text-[#1677ff] text-slate-600 border border-slate-200 transition-colors cursor-pointer"
                          >
                            {val.toLocaleString('vi-VN')} đ
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="p-2.5 rounded-lg bg-emerald-50/60 border border-emerald-100 text-xs text-emerald-700 flex items-center gap-2">
                      <CheckCircleFilled className="text-emerald-500" />
                      <span>Bản vẽ sẽ được chia sẻ miễn phí (0 đ) để tiếp cận nhiều lượt tải nhất.</span>
                    </div>
                  )}
                </div>
              </div>
            </Col>

            {/* RIGHT COLUMN: Media & File Studio, Copyright Shield */}
            <Col xs={24} md={11}>
              <div className="space-y-4">
                {/* ẢNH XEM TRƯỚC (WATERMARKED PREVIEW) */}
                <div className="p-4 rounded-xl border border-slate-100 bg-white shadow-xs space-y-2.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <PictureOutlined className="text-[#1677ff] text-sm" />
                      <span className="text-xs font-bold text-slate-800 uppercase tracking-wide">
                        Ảnh xem trước công khai
                      </span>
                    </div>
                    <Tooltip title="Hệ thống tự động áp watermark để bảo vệ bản quyền ảnh">
                      <span className="text-[10px] px-2 py-0.5 rounded font-semibold bg-blue-50 text-[#1677ff] border border-blue-200 cursor-help">
                        Auto-Watermark
                      </span>
                    </Tooltip>
                  </div>

                  {previewThumbnail ? (
                    <div className="space-y-2">
                      <div className="relative aspect-video rounded-xl border border-slate-200 overflow-hidden bg-slate-900 group">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={previewThumbnail}
                          alt="Preview"
                          className="w-full h-full object-cover"
                        />
                        <span className="absolute top-2 right-2 px-2 py-0.5 rounded text-[10px] font-bold bg-[#1677ff] text-white shadow-sm">
                          WATERMARKED
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] text-emerald-600 font-medium flex items-center gap-1">
                          <CheckCircleFilled /> Ảnh xem trước sẵn sàng
                        </span>
                        <div className="flex items-center gap-1.5">
                          <Upload
                            accept="image/*"
                            showUploadList={false}
                            beforeUpload={(file) => {
                              handlePreviewUpload(file)
                              return false
                            }}
                          >
                            <Button size="small" icon={<SwapOutlined />} className="text-xs rounded-md">
                              Đổi
                            </Button>
                          </Upload>
                          <Button
                            size="small"
                            danger
                            icon={<DeleteOutlined />}
                            onClick={() => {
                              setPreviewId(null)
                              setPreviewThumbnail(null)
                            }}
                            className="text-xs rounded-md"
                          >
                            Xóa
                          </Button>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <Upload.Dragger
                      accept="image/*"
                      showUploadList={false}
                      disabled={previewLoading}
                      beforeUpload={(file) => {
                        handlePreviewUpload(file)
                        return false
                      }}
                      className="!bg-slate-50/70 hover:!bg-blue-50/40 !border-slate-200 hover:!border-[#1677ff] !rounded-xl transition-all !py-4"
                    >
                      <div className="py-2 flex flex-col items-center justify-center text-center">
                        {previewLoading ? (
                          <div className="space-y-2">
                            <LoadingOutlined className="text-2xl text-[#1677ff]" />
                            <p className="text-xs text-[#1677ff] font-medium">Đang áp watermark bảo vệ...</p>
                          </div>
                        ) : (
                          <>
                            <div className="w-10 h-10 rounded-full bg-blue-50 text-[#1677ff] flex items-center justify-center text-lg mb-2">
                              <CloudUploadOutlined />
                            </div>
                            <p className="text-xs font-semibold text-slate-700">
                              Kéo thả hoặc <span className="text-[#1677ff] underline">chọn ảnh</span>
                            </p>
                            <p className="text-[11px] text-slate-400 mt-0.5">
                              JPG, PNG, WEBP • Xuất phối cảnh 3D / mặt bằng
                            </p>
                          </>
                        )}
                      </div>
                    </Upload.Dragger>
                  )}
                </div>

                {/* TỆP BẢN VẼ GỐC (PRIVATE STORAGE) */}
                <div className="p-4 rounded-xl border border-slate-100 bg-white shadow-xs space-y-2.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <FileZipOutlined className="text-[#1677ff] text-sm" />
                      <span className="text-xs font-bold text-slate-800 uppercase tracking-wide">
                        Tệp bản vẽ gốc (Private Storage)
                      </span>
                    </div>
                    <span className="text-[10px] px-2 py-0.5 rounded font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center gap-1">
                      <LockOutlined className="text-[9px]" /> Mã hóa an toàn
                    </span>
                  </div>

                  {originalFileName ? (
                    <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <div className="w-8 h-8 rounded-lg bg-blue-100 text-[#1677ff] flex items-center justify-center text-base flex-shrink-0 font-bold">
                            CAD
                          </div>
                          <div className="min-w-0">
                            <div className="text-xs font-bold text-slate-800 truncate" title={originalFileName}>
                              {originalFileName}
                            </div>
                            <div className="text-[10px] text-slate-400 font-mono mt-0.5 truncate" title={originalChecksum || ''}>
                              SHA-256: {originalChecksum?.slice(0, 16)}...
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-1 flex-shrink-0">
                          <Upload
                            showUploadList={false}
                            beforeUpload={(file) => {
                              handleOriginalUpload(file)
                              return false
                            }}
                          >
                            <Button size="small" icon={<SwapOutlined />} className="text-xs rounded-md">
                              Đổi
                            </Button>
                          </Upload>
                          <Button
                            size="small"
                            danger
                            icon={<DeleteOutlined />}
                            onClick={() => {
                              setOriginalFileId(null)
                              setOriginalFileName(null)
                              setOriginalChecksum(null)
                            }}
                            className="text-xs rounded-md"
                          >
                            Xóa
                          </Button>
                        </div>
                      </div>
                      <div className="text-[11px] text-emerald-600 font-medium flex items-center gap-1 border-t border-slate-200/60 pt-1.5">
                        <CheckCircleFilled className="text-emerald-500 text-xs" />
                        <span>Tệp đã sẵn sàng lưu kho bảo mật. Chỉ người mua mới có quyền tải.</span>
                      </div>
                    </div>
                  ) : (
                    <Upload.Dragger
                      showUploadList={false}
                      disabled={originalLoading}
                      beforeUpload={(file) => {
                        handleOriginalUpload(file)
                        return false
                      }}
                      className="!bg-slate-50/70 hover:!bg-blue-50/40 !border-slate-200 hover:!border-[#1677ff] !rounded-xl transition-all !py-4"
                    >
                      <div className="py-2 flex flex-col items-center justify-center text-center">
                        {originalLoading ? (
                          <div className="space-y-2">
                            <LoadingOutlined className="text-2xl text-[#1677ff]" />
                            <p className="text-xs text-[#1677ff] font-medium">Đang tải & tạo mã băm SHA-256...</p>
                          </div>
                        ) : (
                          <>
                            <div className="w-10 h-10 rounded-full bg-blue-50 text-[#1677ff] flex items-center justify-center text-lg mb-2">
                              <FileZipOutlined />
                            </div>
                            <p className="text-xs font-semibold text-slate-700">
                              Kéo thả hoặc <span className="text-[#1677ff] underline">chọn file gốc</span>
                            </p>
                            <p className="text-[11px] text-slate-400 mt-0.5">
                              AutoCAD (.dwg), Revit (.rvt), SketchUp (.skp), ZIP
                            </p>
                          </>
                        )}
                      </div>
                    </Upload.Dragger>
                  )}
                </div>

                {/* CAM KẾT BẢN QUYỀN */}
                <div className="p-3.5 rounded-xl bg-blue-50/40 border border-blue-100/90 space-y-1">
                  <div className="flex items-start gap-2.5">
                    <SafetyCertificateFilled className="text-[#1677ff] text-base mt-0.5 flex-shrink-0" />
                    <div>
                      <Checkbox
                        id="modalCopyright"
                        checked={copyrightDeclared}
                        onChange={(e) => setCopyrightDeclared(e.target.checked)}
                      >
                        <span className="text-xs font-semibold text-slate-800">
                          Cam kết bản quyền tác giả hợp pháp
                        </span>
                      </Checkbox>
                      <p className="text-[11px] text-slate-500 leading-relaxed mt-1 pl-6">
                        Tôi xác nhận tôi là tác giả hoặc có đầy đủ quyền sở hữu trí tuệ đối với các tệp này. KienTaoHub sẽ gỡ bỏ và xử lý nếu có tranh chấp (FLOW-U11 & BR-08).
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </Col>
          </Row>
        </Form>
      </div>

      {/* FOOTER ACTIONS */}
      <div className="flex items-center justify-between pt-3.5 border-t border-slate-100 mt-5">
        <Button onClick={handleClose} disabled={submitting} className="rounded-lg text-xs h-9 px-4">
          Đóng
        </Button>

        <div className="flex items-center gap-2.5">
          <Button
            disabled={submitting}
            icon={<SaveOutlined />}
            onClick={() => handleSubmit(false)}
            className="rounded-lg text-xs h-9 px-4 font-medium"
          >
            Lưu bản nháp
          </Button>

          <Button
            type="primary"
            icon={<SendOutlined />}
            loading={submitting}
            onClick={() => handleSubmit(true)}
            className="bg-[#1677ff] hover:bg-blue-600 rounded-lg text-xs h-9 px-5 font-semibold shadow-sm"
          >
            Gửi kiểm duyệt ngay
          </Button>
        </div>
      </div>
    </Modal>
  )
}
