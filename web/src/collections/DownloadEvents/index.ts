import type { CollectionConfig } from 'payload'
import {
  downloadEventNoDirectWrite,
  downloadEventReadAccess,
} from '@/access/downloadEventAccess'

export const DownloadEvents: CollectionConfig = {
  slug: 'download_events',
  access: {
    create: downloadEventNoDirectWrite,
    delete: downloadEventNoDirectWrite,
    read: downloadEventReadAccess,
    update: downloadEventNoDirectWrite,
  },
  admin: {
    defaultColumns: ['id', 'product', 'user', 'status', 'downloadedAt', 'ipAddress'],
    group: 'Commerce',
    useAsTitle: 'id',
    description:
      'Nhật ký kiểm toán lượt tải tệp riêng tư (Append-Only Audit Log - PLAN.md FR-17, Decision 0006)',
  },
  fields: [
    {
      name: 'user',
      type: 'relationship',
      relationTo: 'users',
      required: false,
      index: true,
      admin: {
        position: 'sidebar',
        readOnly: true,
        description:
          'Người dùng thực hiện yêu cầu tải (để trống nếu là khách hoặc unauthenticated)',
      },
    },
    {
      name: 'product',
      type: 'relationship',
      relationTo: 'products',
      required: true,
      index: true,
      admin: {
        position: 'sidebar',
        readOnly: true,
        description: 'Sản phẩm được yêu cầu tải',
      },
    },
    {
      name: 'entitlement',
      type: 'relationship',
      relationTo: 'entitlements',
      required: false,
      index: true,
      admin: {
        position: 'sidebar',
        readOnly: true,
        description:
          'Quyền sở hữu liên kết (để trống nếu bị từ chối trước khi xác thực quyền)',
      },
    },
    {
      name: 'ipAddress',
      type: 'text',
      required: false,
      admin: {
        readOnly: true,
        description: 'Địa chỉ IP của client',
      },
    },
    {
      name: 'userAgent',
      type: 'text',
      required: false,
      admin: {
        readOnly: true,
        description: 'User-Agent header của client',
      },
    },
    {
      name: 'downloadedAt',
      type: 'date',
      required: true,
      defaultValue: () => new Date().toISOString(),
      index: true,
      admin: {
        position: 'sidebar',
        readOnly: true,
        description: 'Thời điểm ghi nhận lượt tải',
      },
    },
    {
      name: 'status',
      type: 'select',
      required: true,
      index: true,
      options: [
        { label: 'Thành công (SUCCESS)', value: 'SUCCESS' },
        { label: 'Từ chối (DENIED)', value: 'DENIED' },
        { label: 'Hết hạn (EXPIRED)', value: 'EXPIRED' },
        { label: 'Lỗi kỹ thuật (FAILED)', value: 'FAILED' },
      ],
      admin: {
        position: 'sidebar',
        readOnly: true,
        description: 'Kết quả của yêu cầu tải',
      },
    },
    {
      name: 'downloadTokenHash',
      type: 'text',
      required: false,
      index: true,
      admin: {
        readOnly: true,
        description:
          'Mã băm SHA-256 của token một lần (phục vụ đối soát và chống replay)',
      },
    },
    {
      name: 'errorReason',
      type: 'text',
      required: false,
      admin: {
        readOnly: true,
        description: 'Nguyên nhân từ chối hoặc chi tiết lỗi kỹ thuật',
      },
    },
  ],
}
