import type { CollectionConfig } from 'payload'
import crypto from 'crypto'
import { canEditMoney } from '@/access/canEditMoney'
import { refundReadAccess } from '@/access/refundAccess'

export const Refunds: CollectionConfig = {
  slug: 'refunds',
  access: {
    create: canEditMoney,
    delete: canEditMoney,
    read: refundReadAccess,
    update: canEditMoney,
  },
  admin: {
    defaultColumns: [
      'code',
      'order',
      'orderItem',
      'buyer',
      'seller',
      'amount',
      'status',
      'processedBy',
      'createdAt',
    ],
    group: 'Finance',
    useAsTitle: 'code',
    description: 'Lịch sử hoàn tiền và bút toán bù trừ (Refunds & Compensating Ledger - BR-03)',
  },
  fields: [
    {
      name: 'code',
      type: 'text',
      required: true,
      unique: true,
      index: true,
      label: 'Mã hoàn tiền',
      admin: {
        readOnly: true,
        description: 'Mã định danh duy nhất của giao dịch hoàn tiền (VD: REF-YYYYMMDD-XXXXX)',
      },
      hooks: {
        beforeValidate: [
          ({ value, operation }) => {
            if (operation === 'create' && !value) {
              const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '')
              const randomSuffix = crypto.randomBytes(3).toString('hex').toUpperCase()
              return `REF-${dateStr}-${randomSuffix}`
            }
            return value
          },
        ],
      },
    },
    {
      name: 'order',
      type: 'relationship',
      relationTo: 'orders',
      required: true,
      index: true,
      label: 'Đơn hàng gốc',
      admin: {
        readOnly: true,
      },
    },
    {
      name: 'orderItem',
      type: 'relationship',
      relationTo: 'order_items',
      required: true,
      index: true,
      label: 'Chi tiết sản phẩm được hoàn tiền',
      admin: {
        readOnly: true,
      },
    },
    {
      name: 'buyer',
      type: 'relationship',
      relationTo: 'users',
      required: true,
      index: true,
      label: 'Người mua nhận hoàn tiền',
      admin: {
        readOnly: true,
      },
    },
    {
      name: 'seller',
      type: 'relationship',
      relationTo: 'users',
      required: true,
      index: true,
      label: 'Người bán bị đảo ngược doanh thu',
      admin: {
        readOnly: true,
      },
    },
    {
      name: 'amount',
      type: 'number',
      required: true,
      min: 0,
      label: 'Số tiền hoàn cho người mua (VND)',
      admin: {
        readOnly: true,
        step: 1,
      },
    },
    {
      name: 'platformFeeRefunded',
      type: 'number',
      required: true,
      min: 0,
      defaultValue: 0,
      label: 'Phí sàn được hoàn lại (VND)',
      admin: {
        readOnly: true,
        step: 1,
      },
    },
    {
      name: 'sellerAmountRefunded',
      type: 'number',
      required: true,
      min: 0,
      defaultValue: 0,
      label: 'Doanh thu người bán bị đảo ngược (VND)',
      admin: {
        readOnly: true,
        step: 1,
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
      name: 'reason',
      type: 'textarea',
      required: true,
      label: 'Lý do hoàn tiền',
      admin: {
        readOnly: true,
      },
    },
    {
      name: 'status',
      type: 'select',
      required: true,
      defaultValue: 'COMPLETED',
      index: true,
      label: 'Trạng thái hoàn tiền',
      options: [
        { label: 'Hoàn thành (COMPLETED)', value: 'COMPLETED' },
        { label: 'Thất bại (FAILED)', value: 'FAILED' },
      ],
      admin: {
        readOnly: true,
      },
    },
    {
      name: 'processedBy',
      type: 'relationship',
      relationTo: 'users',
      required: true,
      index: true,
      label: 'Người xử lý hoàn tiền (Finance/Super Admin)',
      admin: {
        readOnly: true,
      },
    },
    {
      name: 'ledgerTransaction',
      type: 'relationship',
      relationTo: 'wallet_ledger',
      index: true,
      label: 'Bút toán sổ cái bồi hoàn (Wallet Ledger Entry)',
      admin: {
        readOnly: true,
      },
    },
    {
      name: 'entitlementRevoked',
      type: 'checkbox',
      defaultValue: false,
      label: 'Quyền tải về đã bị thu hồi (Revoke Entitlement)',
      admin: {
        readOnly: true,
      },
    },
  ],
}
