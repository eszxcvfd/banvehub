'use client'

import React, { useState } from 'react'
import type { Category, Product, SoftwareType } from '@/payload-types'
import { Tabs, Button, Typography, Modal } from 'antd'
import type { TabsProps } from 'antd'
import {
  FileTextOutlined,
  DesktopOutlined,
  FolderOpenOutlined,
  HddOutlined,
  SettingOutlined,
  CalendarOutlined,
  WindowsOutlined,
  CheckOutlined,
  UnorderedListOutlined,
  StarFilled,
  MessageOutlined,
  ProfileOutlined,
} from '@ant-design/icons'
import { ProductReviewsSection } from '@/components/product/ProductReviewsSection'
import { ProductCommentsSection } from '@/components/product/ProductCommentsSection'

const { Title, Text } = Typography

export type ProductDetailTabsProps = {
  product: Product
  className?: string
  /** Real published-review count for this product (0 when the collection has none). */
  reviewCount?: number
  /** Real comment count for this product (0 when the collection has none). */
  commentCount?: number
}

export function ProductDetailTabs({
  product,
  className = '',
  reviewCount = 0,
  commentCount = 0,
}: ProductDetailTabsProps) {
  const [activeTab, setActiveTab] = useState<string>('specs')
  const [isFileListModalOpen, setIsFileListModalOpen] = useState(false)

  const specs = product.technicalSpecs || {}
  const primaryCategory = (product.categories || []).find(
    (c): c is Category => typeof c === 'object' && c !== null,
  )
  const primarySoftware = (product.software_types || []).find(
    (s): s is SoftwareType => typeof s === 'object' && s !== null,
  )

  const updatedDate = product.updatedAt
    ? new Date(product.updatedAt).toLocaleDateString('vi-VN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      })
    : null

  const productInfoItems = [
    {
      icon: <FolderOpenOutlined className="text-slate-400" />,
      label: 'Loại tài nguyên',
      value: primaryCategory?.title || null,
    },
    {
      icon: <DesktopOutlined className="text-slate-400" />,
      label: 'Phần mềm',
      value: primarySoftware?.title || null,
    },
    {
      icon: <FileTextOutlined className="text-slate-400" />,
      label: 'Định dạng file',
      value: specs.fileFormat || null,
    },
    {
      icon: <HddOutlined className="text-slate-400" />,
      label: 'Dung lượng',
      value: specs.fileSize || null,
    },
    {
      icon: <SettingOutlined className="text-slate-400" />,
      label: 'Phiên bản',
      value: specs.softwareVersion || null,
    },
    {
      icon: <CalendarOutlined className="text-slate-400" />,
      label: 'Ngày cập nhật',
      value: updatedDate,
    },
  ].filter((item) => Boolean(item.value))

  const tabItems: TabsProps['items'] = [
    {
      key: 'specs',
      label: (
        <span className="font-semibold text-sm sm:text-base px-1">
          Thông tin chi tiết
        </span>
      ),
      children: (
        <div className="pt-2">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
            {/* Left Column: Thông tin sản phẩm */}
            <div className="lg:col-span-7">
              <h3 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white mb-4">
                Thông tin sản phẩm
              </h3>
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {productInfoItems.map((item, index) => (
                  <div
                    key={index}
                    className="py-3 flex items-center justify-between text-sm"
                  >
                    <div className="flex items-center gap-3 text-slate-600 dark:text-slate-400">
                      <span className="text-base flex items-center">{item.icon}</span>
                      <span>{item.label}</span>
                    </div>
                    <span className="font-medium text-slate-900 dark:text-slate-100 text-right">
                      {item.value}
                    </span>
                  </div>
                ))}
              </div>
            </div>

          </div>
        </div>
      ),
    },
    {
      key: 'reviews',
      label: (
        <span className="font-semibold text-sm sm:text-base px-1 flex items-center gap-1.5">
          <span>Đánh giá</span>
          <span className="text-xs px-1.5 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
            {reviewCount ?? 0}
          </span>
        </span>
      ),
      children: (
        <div className="pt-2">
          <ProductReviewsSection productId={product.id} productTitle={product.title} />
        </div>
      ),
    },
    {
      key: 'comments',
      label: (
        <span className="font-semibold text-sm sm:text-base px-1 flex items-center gap-1.5">
          <span>Hỏi đáp</span>
          <span className="text-xs px-1.5 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
            {commentCount ?? 0}
          </span>
        </span>
      ),
      children: (
        <div className="pt-2">
          <ProductCommentsSection
            productId={product.id}
            productTitle={product.title}
            sellerId={
              typeof product.seller === 'object' && product.seller !== null
                ? product.seller.id
                : product.seller
            }
          />
        </div>
      ),
    },
  ]

  return (
    <div id="specs-section" className={`w-full bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/90 dark:border-slate-800 p-6 sm:p-8 shadow-xs ${className}`}>
      <Tabs
        activeKey={activeTab}
        onChange={setActiveTab}
        items={tabItems}
        size="large"
        className="product-detail-tabs"
      />

      {/* Modal: Danh sách chi tiết tệp tin */}
      <Modal
        title={
          <div className="flex items-center gap-2 text-base font-bold">
            <UnorderedListOutlined className="text-[#1677ff]" />
            <span>Danh mục bản vẽ & Tệp đính kèm</span>
          </div>
        }
        open={isFileListModalOpen}
        onCancel={() => setIsFileListModalOpen(false)}
        footer={[
          <Button key="close" type="primary" onClick={() => setIsFileListModalOpen(false)}>
            Đóng
          </Button>,
        ]}
        width={680}
      >
        <div className="space-y-4 py-3 text-sm">
          <p className="text-slate-600 dark:text-slate-400">
            Gói tài nguyên <strong className="text-slate-900 dark:text-white">{product.title}</strong> bao gồm đầy đủ các hạng mục:
          </p>
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden divide-y divide-slate-100 dark:divide-slate-800">
            <div className="p-3 bg-slate-50 dark:bg-slate-800/50 font-semibold text-xs text-slate-500 uppercase tracking-wider flex justify-between">
              <span>Hạng mục bản vẽ / Tệp tin</span>
              <span>Định dạng</span>
            </div>
            <div className="p-3 flex justify-between items-center text-xs sm:text-sm">
              <span>01. Bản vẽ mặt bằng tổng thể & bố trí công năng</span>
              <span className="font-mono text-xs px-2 py-0.5 rounded bg-blue-50 text-[#1677ff]">.rvt / .dwg</span>
            </div>
            <div className="p-3 flex justify-between items-center text-xs sm:text-sm">
              <span>02. Bản vẽ mặt đứng công trình & mặt cắt kỹ thuật</span>
              <span className="font-mono text-xs px-2 py-0.5 rounded bg-blue-50 text-[#1677ff]">.rvt / .pdf</span>
            </div>
            <div className="p-3 flex justify-between items-center text-xs sm:text-sm">
              <span>03. Thuyết minh thiết kế & tiêu chuẩn áp dụng</span>
              <span className="font-mono text-xs px-2 py-0.5 rounded bg-amber-50 text-amber-600">.docx / .pdf</span>
            </div>
            <div className="p-3 flex justify-between items-center text-xs sm:text-sm">
              <span>04. Bảng thống kê diện tích, phòng ban & vật liệu</span>
              <span className="font-mono text-xs px-2 py-0.5 rounded bg-emerald-50 text-emerald-600">.xlsx</span>
            </div>
            <div className="p-3 flex justify-between items-center text-xs sm:text-sm">
              <span>05. Thư viện Revit Family độc quyền đi kèm</span>
              <span className="font-mono text-xs px-2 py-0.5 rounded bg-purple-50 text-purple-600">.rfa</span>
            </div>
          </div>
        </div>
      </Modal>
    </div>
  )
}
