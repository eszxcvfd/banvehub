import type { CollectionConfig } from 'payload'
import crypto from 'crypto'
import {
  orderCreateAccess,
  orderDeleteAccess,
  orderReadAccess,
  orderUpdateAccess,
} from '@/access/orderAccess'

export const Orders: CollectionConfig = {
  slug: 'orders',
  access: {
    create: orderCreateAccess,
    delete: orderDeleteAccess,
    read: orderReadAccess,
    update: orderUpdateAccess,
  },
  admin: {
    defaultColumns: [
      'code',
      'buyer',
      'totalAmount',
      'currency',
      'status',
      'paymentSource',
      'paidAt',
      'createdAt',
    ],
    group: 'Commerce',
    useAsTitle: 'code',
    description: 'Đơn hàng kỹ thuật số (Digital Orders - Immutable Snapshot Price)',
  },
  fields: [
    {
      name: 'code',
      type: 'text',
      required: true,
      unique: true,
      index: true,
      label: 'Mã đơn hàng',
      admin: {
        readOnly: true,
        description: 'Mã định danh duy nhất của đơn hàng (VD: ORD-20260915-XXXXX)',
      },
      hooks: {
        beforeValidate: [
          ({ value, operation }) => {
            if (operation === 'create' && !value) {
              const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '')
              const randomSuffix = crypto.randomBytes(3).toString('hex').toUpperCase()
              return `ORD-${dateStr}-${randomSuffix}`
            }
            return value
          },
        ],
      },
    },
    {
      name: 'buyer',
      type: 'relationship',
      relationTo: 'users',
      required: true,
      index: true,
      label: 'Người mua',
      admin: {
        readOnly: true,
      },
    },
    {
      name: 'totalAmount',
      type: 'number',
      required: true,
      min: 0,
      label: 'Tổng tiền (VND)',
      admin: {
        readOnly: true,
        step: 1,
        description: 'Tổng giá trị đơn hàng tính theo VND',
      },
    },
    {
      name: 'currency',
      type: 'select',
      required: true,
      defaultValue: 'VND',
      options: [{ label: 'VND (Việt Nam Đồng)', value: 'VND' }],
      admin: {
        readOnly: true,
      },
    },
    {
      name: 'status',
      type: 'select',
      required: true,
      defaultValue: 'PENDING',
      index: true,
      label: 'Trạng thái đơn hàng',
      options: [
        { label: 'Chờ xử lý (PENDING)', value: 'PENDING' },
        { label: 'Hoàn thành (COMPLETED)', value: 'COMPLETED' },
        { label: 'Đã hủy (CANCELLED)', value: 'CANCELLED' },
      ],
      admin: {
        readOnly: true,
      },
    },
    {
      name: 'paymentSource',
      type: 'select',
      required: true,
      defaultValue: 'wallet',
      label: 'Nguồn thanh toán',
      options: [
        { label: 'Ví nội bộ (Internal Wallet)', value: 'wallet' },
        { label: 'Tải miễn phí (Free Asset)', value: 'free' },
      ],
      admin: {
        readOnly: true,
      },
    },
    {
      name: 'paidAt',
      type: 'date',
      label: 'Thời điểm thanh toán',
      admin: {
        readOnly: true,
        description: 'Thời điểm hoàn tất thanh toán và cấp quyền sở hữu',
      },
    },
    {
      name: 'notes',
      type: 'textarea',
      label: 'Ghi chú',
      admin: {
        description: 'Ghi chú nội bộ hoặc thông tin bổ sung về đơn hàng',
      },
    },
    {
      name: 'items',
      type: 'join',
      collection: 'order_items',
      on: 'order',
      label: 'Các mục trong đơn hàng',
      admin: {
        allowCreate: false,
        defaultColumns: ['product', 'seller', 'salePrice', 'platformFee', 'sellerAmount'],
      },
    },
  ],
}
