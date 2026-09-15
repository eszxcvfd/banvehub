import React from 'react'
import Link from 'next/link'
import type { Category, Product, SoftwareType, Tag } from '@/payload-types'
import {
  Calendar,
  Cpu,
  FileCode2,
  FolderTree,
  HardDrive,
  Hash,
  Layers,
  Ruler,
  ShieldCheck,
} from 'lucide-react'

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
    (t): t is Tag => typeof t === 'object' && t !== null,
  )

  const updatedDate = product.updatedAt
    ? new Date(product.updatedAt).toLocaleDateString('vi-VN', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      })
    : null

  const specRows: {
    icon: React.ComponentType<{ className?: string }>
    label: string
    value: React.ReactNode
    show: boolean
  }[] = [
    {
      icon: FileCode2,
      label: 'Định dạng tệp tin (Format)',
      value: (
        <span className="font-mono font-semibold text-primary bg-primary/10 px-2.5 py-0.5 rounded text-sm">
          {specs.fileFormat || 'Tệp kỹ thuật chuẩn'}
        </span>
      ),
      show: true,
    },
    {
      icon: Layers,
      label: 'Phiên bản phần mềm (Software Version)',
      value: (
        <span className="font-medium text-foreground">
          {specs.softwareVersion || 'Tương thích mọi phiên bản'}
        </span>
      ),
      show: true,
    },
    {
      icon: HardDrive,
      label: 'Dung lượng tệp (File Size)',
      value: (
        <span className="font-mono text-foreground">
          {specs.fileSize || 'Đang cập nhật'}
        </span>
      ),
      show: true,
    },
    {
      icon: Ruler,
      label: 'Hệ đơn vị thiết kế (Unit)',
      value: (
        <span className="text-foreground">
          {specs.unit ? unitMap[specs.unit] || specs.unit : unitMap.metric}
        </span>
      ),
      show: true,
    },
    {
      icon: Cpu,
      label: 'Phần mềm ứng dụng (Software Types)',
      value: softwareTypes.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {softwareTypes.map((st) => (
            <Link
              key={st.id}
              href={`/shop?softwareType=${st.slug}`}
              className="inline-flex items-center text-xs font-medium px-2 py-0.5 rounded-full bg-secondary text-secondary-foreground hover:bg-secondary/80 transition-colors"
            >
              {st.title}
            </Link>
          ))}
        </div>
      ) : (
        <span className="text-muted-foreground text-sm">Đa nền tảng CAD/BIM</span>
      ),
      show: true,
    },
    {
      icon: FolderTree,
      label: 'Chuyên ngành / Danh mục (Categories)',
      value: categories.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {categories.map((cat) => (
            <Link
              key={cat.id}
              href={`/shop?category=${cat.slug}`}
              className="inline-flex items-center text-xs font-medium px-2 py-0.5 rounded-full bg-muted text-muted-foreground hover:text-foreground transition-colors"
            >
              {cat.title}
            </Link>
          ))}
        </div>
      ) : (
        <span className="text-muted-foreground text-sm">Hồ sơ kỹ thuật tổng hợp</span>
      ),
      show: true,
    },
    {
      icon: Hash,
      label: 'Từ khóa phân loại (Tags)',
      value: tags.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {tags.map((tag) => (
            <span
              key={tag.id}
              className="text-xs text-muted-foreground bg-background border px-2 py-0.5 rounded"
            >
              #{tag.title}
            </span>
          ))}
        </div>
      ) : (
        <span className="text-muted-foreground text-sm">—</span>
      ),
      show: tags.length > 0,
    },
    {
      icon: Calendar,
      label: 'Ngày cập nhật hồ sơ (Last Updated)',
      value: <span className="text-sm text-foreground">{updatedDate || 'Mới cập nhật'}</span>,
      show: Boolean(updatedDate),
    },
    {
      icon: ShieldCheck,
      label: 'Tiêu chuẩn kiểm duyệt kỹ thuật',
      value: (
        <div className="flex items-center gap-1.5 text-xs font-medium text-emerald-600 dark:text-emerald-400">
          <span>Đã kiểm duyệt cấu trúc layer, xref và kích thước chuẩn</span>
        </div>
      ),
      show: true,
    },
  ]

  return (
    <div className={`rounded-xl border bg-card text-card-foreground shadow-sm overflow-hidden ${className}`}>
      <div className="px-6 py-4 border-b bg-muted/40">
        <h3 className="font-semibold text-base flex items-center gap-2">
          <FileCode2 className="w-5 h-5 text-primary" />
          Thông số kỹ thuật tài nguyên (Technical Specifications)
        </h3>
      </div>
      <div className="p-0">
        <table className="w-full text-sm">
          <tbody className="divide-y divide-border">
            {specRows
              .filter((row) => row.show)
              .map((row, index) => {
                const IconComponent = row.icon
                return (
                  <tr
                    key={index}
                    className="hover:bg-muted/30 transition-colors flex flex-col sm:table-row"
                  >
                    <td className="px-6 py-3.5 font-medium text-muted-foreground w-full sm:w-2/5 flex items-center gap-2 sm:table-cell">
                      <div className="flex items-center gap-2">
                        <IconComponent className="w-4 h-4 text-muted-foreground/70 shrink-0" />
                        <span>{row.label}</span>
                      </div>
                    </td>
                    <td className="px-6 pb-3.5 sm:py-3.5 sm:table-cell w-full sm:w-3/5">
                      {row.value}
                    </td>
                  </tr>
                )
              })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
