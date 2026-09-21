'use client'

import React from 'react'
import Link from 'next/link'
import type { Category, Product, SoftwareType, Tag as TagType } from '@/payload-types'
import { Card, Descriptions, Tag, Typography, Space } from 'antd'
import type { DescriptionsProps } from 'antd'
import {
  FileTextOutlined,
  AppstoreOutlined,
  HddOutlined,
  ColumnWidthOutlined,
  DesktopOutlined,
  FolderOpenOutlined,
  TagsOutlined,
  CalendarOutlined,
} from '@ant-design/icons'

const { Text, Title } = Typography

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

export type TechnicalSpecsProps = {
  product: Product
  className?: string
}

const unitMap: Record<string, string> = {
  metric: 'Hệ Mét (mm / m)',
  imperial: 'Hệ Inch / Feet (Imperial)',
  other: 'Hệ đơn vị khác',
}

export function TechnicalSpecsTable({ product, className = '' }: TechnicalSpecsProps) {
  const specs = product.technicalSpecs || {}
  const categories = (product.categories || []).filter(
    (c): c is Category => typeof c === 'object' && c !== null,
  )
  const softwareTypes = (product.software_types || []).filter(
    (s): s is SoftwareType => typeof s === 'object' && s !== null,
  )
  const tags = (product.tags || []).filter(
    (t): t is TagType => typeof t === 'object' && t !== null,
  )

  const updatedDate = product.updatedAt
    ? new Date(product.updatedAt).toLocaleDateString('vi-VN', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      })
    : null

  const items: DescriptionsProps['items'] = [
    // Every row below is present only when the product's own technicalSpecs carries the value:
    // an absent value omits the row instead of standing in a plausible default (decision 0018 clause 2).
    ...(specs.fileFormat
      ? [
          {
            key: 'format',
            label: (
              <Space size={6}>
                <FileTextOutlined className="text-[#1677ff]" />
                <span>Định dạng tệp tin (Format)</span>
              </Space>
            ),
            children: (
              <Tag color="processing" className="font-mono font-semibold px-2.5 py-0.5 text-xs">
                {specs.fileFormat}
              </Tag>
            ),
          },
        ]
      : []),
    ...(specs.softwareVersion
      ? [
          {
            key: 'version',
            label: (
              <Space size={6}>
                <AppstoreOutlined className="text-[#1677ff]" />
                <span>Phiên bản phần mềm (Software Version)</span>
              </Space>
            ),
            children: <Text strong>{specs.softwareVersion}</Text>,
          },
        ]
      : []),
    ...(specs.fileSize
      ? [
          {
            key: 'size',
            label: (
              <Space size={6}>
                <HddOutlined className="text-[#1677ff]" />
                <span>Dung lượng tệp (File Size)</span>
              </Space>
            ),
            children: <Text className="font-mono">{specs.fileSize}</Text>,
          },
        ]
      : []),
    ...(specs.unit
      ? [
          {
            key: 'unit',
            label: (
              <Space size={6}>
                <ColumnWidthOutlined className="text-[#1677ff]" />
                <span>Hệ đơn vị thiết kế (Unit)</span>
              </Space>
            ),
            children: <Text>{unitMap[specs.unit] || specs.unit}</Text>,
          },
        ]
      : []),
    ...(softwareTypes.length > 0
      ? [
          {
            key: 'softwareTypes',
            label: (
              <Space size={6}>
                <DesktopOutlined className="text-[#1677ff]" />
                <span>Phần mềm ứng dụng (Software Types)</span>
              </Space>
            ),
            children: (
              <Space wrap size={4}>
                {softwareTypes.map((st) => (
                  <Link key={st.id} href={`/shop?softwareType=${st.slug}`}>
                    <Tag color="geekblue" className="cursor-pointer hover:opacity-80">
                      {st.title}
                    </Tag>
                  </Link>
                ))}
              </Space>
            ),
          },
        ]
      : []),
    ...(categories.length > 0
      ? [
          {
            key: 'categories',
            label: (
              <Space size={6}>
                <FolderOpenOutlined className="text-[#1677ff]" />
                <span>Chuyên ngành / Danh mục (Categories)</span>
              </Space>
            ),
            children: (
              <Space wrap size={4}>
                {categories.map((cat) => (
                  <Link key={cat.id} href={`/shop?category=${cat.slug}`}>
                    <Tag color="blue" className="cursor-pointer hover:opacity-80">
                      {cat.title}
                    </Tag>
                  </Link>
                ))}
              </Space>
            ),
          },
        ]
      : []),
    ...(tags.length > 0
      ? [
          {
            key: 'tags',
            label: (
              <Space size={6}>
                <TagsOutlined className="text-[#1677ff]" />
                <span>Từ khóa phân loại (Tags)</span>
              </Space>
            ),
            children: (
              <Space wrap size={4}>
                {tags.map((tag) => (
                  <Tag key={tag.id} className="text-xs">
                    #{tag.title}
                  </Tag>
                ))}
              </Space>
            ),
          },
        ]
      : []),
    ...(updatedDate
      ? [
          {
            key: 'updatedAt',
            label: (
              <Space size={6}>
                <CalendarOutlined className="text-[#1677ff]" />
                <span>Ngày cập nhật hồ sơ (Last Updated)</span>
              </Space>
            ),
            children: <Text>{updatedDate}</Text>,
          },
        ]
      : []),
  ]

  return (
    <Card
      id="specs-section"
      className={`shadow-xs overflow-hidden rounded-xl border border-border ${className}`}
      styles={{
        header: { backgroundColor: 'var(--muted, #fafafa)', borderBottom: '1px solid var(--border, #f0f0f0)' },
        body: { padding: 0 },
      }}
      title={
        <Title level={5} className="!mb-0 flex items-center gap-2">
          <FileTextOutlined className="text-[#1677ff]" />
          <span>Thông số kỹ thuật tài nguyên (Technical Specifications)</span>
        </Title>
      }
    >
      {items.length > 0 ? (
        <Descriptions
          bordered
          column={{ xs: 1, sm: 1, md: 2 }}
          size="middle"
          items={items}
        />
      ) : (
        <div className="p-6">
          <Text type="secondary">
            Người bán chưa khai báo thông số kỹ thuật cho tài nguyên này.
          </Text>
        </div>
      )}
    </Card>
  )
}
