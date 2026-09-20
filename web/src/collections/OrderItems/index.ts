import type { CollectionConfig } from 'payload'
import {
  orderItemCreateAccess,
  orderItemDeleteAccess,
  orderItemReadAccess,
  orderItemUpdateAccess,
} from '@/access/orderAccess'
import { validateAntiSelfPurchase } from './hooks/validateAntiSelfPurchase'
import { preventOrderItemMutation } from './hooks/preventOrderItemMutation'

export const OrderItems: CollectionConfig = {
  labels: {
    singular: 'Order item',
    plural: 'Order items',
  },
  slug: 'order_items',
  access: {
    create: orderItemCreateAccess,
    delete: orderItemDeleteAccess,
    read: orderItemReadAccess,
    update: orderItemUpdateAccess,
  },
  admin: {
    defaultColumns: [
      'order',
      'product',
      'seller',
      'salePrice',
      'platformFee',
      'sellerAmount',
      'tax',
      'createdAt',
    ],
    group: 'Commerce',
    useAsTitle: 'id',
    description: 'Chi tiết sản phẩm đơn hàng snapshot bất biến (BR-07)',
  },
  hooks: {
    beforeValidate: [validateAntiSelfPurchase],
    beforeChange: [preventOrderItemMutation],
  },
  fields: [
    {
      name: 'order',
      type: 'relationship',
      relationTo: 'orders',
      required: true,
      index: true,
      label: 'Đơn hàng',
      admin: {
        readOnly: true,
      },
    },
    {
      name: 'product',
      type: 'relationship',
      relationTo: 'products',
      required: true,
      index: true,
      label: 'Sản phẩm',
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
      label: 'Người bán',
      admin: {
        readOnly: true,
      },
    },
    {
      name: 'salePrice',
      type: 'number',
      required: true,
      min: 0,
      label: 'Giá bán snapshot (VND)',
      admin: {
        readOnly: true,
        step: 1,
        description: 'Giá bán snapshot tại thời điểm đặt hàng (BR-07)',
      },
    },
    {
      name: 'platformFee',
      type: 'number',
      required: true,
      min: 0,
      defaultValue: 0,
      label: 'Phí sàn (VND)',
      admin: {
        readOnly: true,
        step: 1,
        description: 'Phí hoa hồng sàn thu',
      },
    },
    {
      name: 'sellerAmount',
      type: 'number',
      required: true,
      min: 0,
      label: 'Doanh thu người bán (VND)',
      admin: {
        readOnly: true,
        step: 1,
        description: 'Số tiền thực nhận của người bán (salePrice - platformFee - tax)',
      },
    },
    {
      name: 'tax',
      type: 'number',
      required: true,
      min: 0,
      defaultValue: 0,
      label: 'Thuế (VND)',
      admin: {
        readOnly: true,
        step: 1,
        description: 'Thuế áp dụng',
      },
    },
    {
      name: 'policyVersion',
      type: 'text',
      required: true,
      defaultValue: 'v1',
      label: 'Phiên bản chính sách phí',
      admin: {
        readOnly: true,
        description:
          'Phiên bản chính sách phân chia doanh thu áp dụng tại thời điểm giao dịch',
      },
    },
  ],
}
