import type { CollectionConfig } from 'payload'
import {
  entitlementNoDirectWrite,
  entitlementReadAccess,
  entitlementUpdateAccess,
} from '@/access/entitlementAccess'
import { enforceEntitlementInvariants } from './hooks/enforceEntitlementInvariants'

export const Entitlements: CollectionConfig = {
  labels: {
    singular: 'Entitlement',
    plural: 'Entitlements',
  },
  slug: 'entitlements',
  access: {
    create: entitlementNoDirectWrite,
    delete: entitlementNoDirectWrite,
    read: entitlementReadAccess,
    update: entitlementUpdateAccess,
  },
  admin: {
    defaultColumns: ['id', 'user', 'product', 'status', 'downloadCount', 'grantedAt'],
    group: 'Commerce',
    useAsTitle: 'id',
    description:
      'Sổ cái quyền sở hữu và tải tài nguyên số (Entitlements Ledger - PLAN.md FR-16, Decision 0006)',
  },
  fields: [
    {
      name: 'user',
      type: 'relationship',
      relationTo: 'users',
      required: true,
      index: true,
      admin: {
        position: 'sidebar',
        readOnly: true,
        description: 'Người dùng sở hữu quyền tải',
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
        description: 'Sản phẩm được cấp quyền',
      },
    },
    {
      name: 'order',
      type: 'relationship',
      relationTo: 'orders',
      required: false,
      index: true,
      admin: {
        position: 'sidebar',
        readOnly: true,
        description: 'Đơn hàng mua sản phẩm (để trống nếu là tải miễn phí)',
      },
    },
    {
      name: 'orderItem',
      type: 'relationship',
      relationTo: 'order_items',
      required: false,
      index: true,
      admin: {
        position: 'sidebar',
        readOnly: true,
        description: 'Mục đơn hàng liên kết (để trống nếu là tải miễn phí)',
      },
    },
    {
      name: 'status',
      type: 'select',
      required: true,
      defaultValue: 'active',
      index: true,
      options: [
        { label: 'Có hiệu lực (active)', value: 'active' },
        { label: 'Bị thu hồi (revoked)', value: 'revoked' },
        { label: 'Hết hạn (expired)', value: 'expired' },
      ],
      admin: {
        position: 'sidebar',
        description: 'Trạng thái quyền tải',
      },
    },
    {
      name: 'grantedAt',
      type: 'date',
      required: true,
      defaultValue: () => new Date().toISOString(),
      admin: {
        position: 'sidebar',
        readOnly: true,
        description: 'Thời điểm cấp quyền',
      },
    },
    {
      name: 'downloadCount',
      type: 'number',
      required: true,
      defaultValue: 0,
      min: 0,
      admin: {
        position: 'sidebar',
        readOnly: true,
        description: 'Số lần đã tải file thành công',
      },
    },
    {
      name: 'maxDownloads',
      type: 'number',
      required: false,
      min: 1,
      admin: {
        description: 'Giới hạn số lần tải tối đa (để trống nếu không giới hạn)',
      },
    },
    {
      name: 'expiresAt',
      type: 'date',
      required: false,
      admin: {
        description: 'Thời điểm hết hạn tải (để trống nếu vĩnh viễn)',
      },
    },
    {
      name: 'revokedAt',
      type: 'date',
      required: false,
      admin: {
        description: 'Thời điểm thu hồi quyền',
      },
    },
    {
      name: 'reason',
      type: 'text',
      required: false,
      admin: {
        description: 'Lý do thu hồi hoặc ghi chú cấp quyền',
      },
    },
  ],
  hooks: {
    beforeChange: [enforceEntitlementInvariants],
  },
}
