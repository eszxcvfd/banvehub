import type { CollectionConfig } from 'payload'
import { canEditMoney } from '@/access/canEditMoney'
import { sellerEarningsReadAccess } from '@/access/sellerEarningsAccess'
import { calculateHoldUntil } from './hooks/calculateHoldUntil'
import { preventEarningMutation } from './hooks/preventEarningMutation'
import { validateEarningMath } from './hooks/validateEarningMath'

export const SellerEarnings: CollectionConfig = {
  labels: {
    singular: 'Seller earning',
    plural: 'Seller earnings',
  },
  slug: 'seller_earnings',
  access: {
    create: canEditMoney,
    delete: canEditMoney,
    read: sellerEarningsReadAccess,
    update: canEditMoney,
  },
  admin: {
    defaultColumns: [
      'id',
      'seller',
      'order',
      'product',
      'salePrice',
      'platformFee',
      'sellerAmount',
      'tax',
      'status',
      'holdUntil',
      'createdAt',
    ],
    group: 'Finance',
    useAsTitle: 'id',
    description:
      'Sổ cái doanh thu người bán và chính sách giữ tiền (Seller Earnings - PLAN.md FR-31, BR-03)',
  },
  hooks: {
    beforeValidate: [calculateHoldUntil, validateEarningMath],
    beforeChange: [preventEarningMutation],
  },
  fields: [
    {
      name: 'seller',
      type: 'relationship',
      relationTo: 'users',
      required: true,
      index: true,
      label: 'Người bán',
      admin: {
        readOnly: true,
        position: 'sidebar',
      },
    },
    {
      name: 'order',
      type: 'relationship',
      relationTo: 'orders',
      required: true,
      index: true,
      label: 'Đơn hàng',
      admin: {
        readOnly: true,
        position: 'sidebar',
      },
    },
    {
      name: 'orderItem',
      type: 'relationship',
      relationTo: 'order_items',
      required: true,
      unique: true,
      index: true,
      label: 'Chi tiết mục đơn hàng (1-1)',
      admin: {
        readOnly: true,
        position: 'sidebar',
        description: 'Mục đơn hàng tương ứng (đảm bảo tính duy nhất 1-1, tránh trùng lặp doanh thu)',
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
        position: 'sidebar',
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
        description: 'Giá bán của sản phẩm tại thời điểm giao dịch (snapshot)',
      },
    },
    {
      name: 'platformFee',
      type: 'number',
      required: true,
      min: 0,
      label: 'Phí sàn thu (VND)',
      admin: {
        readOnly: true,
        step: 1,
        description: 'Phí hoa hồng nền tảng (salePrice * commissionRate)',
      },
    },
    {
      name: 'sellerAmount',
      type: 'number',
      required: true,
      min: 0,
      label: 'Thu nhập người bán thực nhận (VND)',
      admin: {
        readOnly: true,
        step: 1,
        description: 'Doanh thu chuyển cho người bán (salePrice - platformFee - tax)',
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
        description: 'Thuế snapshot tại thời điểm giao dịch (không tính trong P0, mặc định 0)',
      },
    },
    {
      name: 'commissionRate',
      type: 'number',
      required: true,
      min: 0,
      max: 1,
      label: 'Tỷ lệ hoa hồng áp dụng',
      admin: {
        readOnly: true,
        step: 0.0001,
        description: 'Tỷ lệ chiết khấu snapshot tại thời điểm giao dịch (BR-07)',
      },
    },
    {
      name: 'currency',
      type: 'select',
      required: true,
      defaultValue: 'VND',
      label: 'Loại tiền tệ',
      options: [{ label: 'VND (Việt Nam Đồng)', value: 'VND' }],
      admin: {
        readOnly: true,
        position: 'sidebar',
      },
    },
    {
      name: 'status',
      type: 'select',
      required: true,
      defaultValue: 'PENDING',
      index: true,
      label: 'Trạng thái thu nhập',
      options: [
        { label: 'Chờ đối soát (PENDING)', value: 'PENDING' },
        { label: 'Khả dụng (AVAILABLE)', value: 'AVAILABLE' },
        { label: 'Đã hoàn tiền / Đảo ngược (REVERSED)', value: 'REVERSED' },
        { label: 'Đã thanh toán (PAID)', value: 'PAID' },
      ],
      admin: {
        position: 'sidebar',
        description: 'Vòng đời: PENDING -> AVAILABLE -> PAID (hoặc REVERSED nếu hoàn tiền)',
      },
    },
    {
      name: 'holdPeriodDays',
      type: 'number',
      required: true,
      defaultValue: 7,
      min: 0,
      label: 'Thời gian giữ tiền (ngày)',
      admin: {
        readOnly: true,
        position: 'sidebar',
        step: 1,
        description: 'Số ngày giữ tiền tạm thời trước khi chuyển thành khả dụng (mặc định 7 ngày)',
      },
    },
    {
      name: 'holdUntil',
      type: 'date',
      required: true,
      index: true,
      label: 'Thời điểm hết hạn giữ tiền',
      admin: {
        readOnly: true,
        position: 'sidebar',
        description: 'Thời điểm thu nhập tự động chuyển sang AVAILABLE (createdAt + holdPeriodDays)',
      },
    },
    {
      name: 'availableAt',
      type: 'date',
      label: 'Thời điểm chuyển khả dụng',
      admin: {
        readOnly: true,
        position: 'sidebar',
        description: 'Thời điểm thu nhập thực tế chuyển sang trạng thái AVAILABLE',
      },
    },
    {
      name: 'paidAt',
      type: 'date',
      label: 'Thời điểm thanh toán',
      admin: {
        readOnly: true,
        position: 'sidebar',
        description: 'Thời điểm hoàn tất chi trả tiền cho người bán qua yêu cầu rút tiền',
      },
    },
    {
      name: 'reversedAt',
      type: 'date',
      label: 'Thời điểm đảo ngược',
      admin: {
        readOnly: true,
        position: 'sidebar',
        description: 'Thời điểm đơn hàng bị hoàn trả và thu nhập bị đảo ngược',
      },
    },
    {
      name: 'policyVersion',
      type: 'text',
      required: true,
      defaultValue: 'v1',
      label: 'Phiên bản chính sách',
      admin: {
        readOnly: true,
        position: 'sidebar',
        description: 'Phiên bản chính sách chiết khấu hoa hồng snapshot',
      },
    },
    {
      name: 'notes',
      type: 'textarea',
      label: 'Ghi chú / Diễn giải',
      admin: {
        description: 'Ghi chú nội bộ, lý do hoàn trả hoặc mã đối soát',
      },
    },
  ],
}
