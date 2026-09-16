import type { CollectionConfig } from 'payload'
import {
  withdrawalCreateAccess,
  withdrawalDeleteAccess,
  withdrawalReadAccess,
  withdrawalUpdateAccess,
} from '@/access/withdrawalAccess'
import { generateWithdrawalCode } from './hooks/generateWithdrawalCode'
import {
  validateWithdrawalBeforeValidate,
  validateWithdrawalInvariants,
} from './hooks/validateWithdrawalInvariants'

export const Withdrawals: CollectionConfig = {
  slug: 'withdrawals',
  access: {
    create: withdrawalCreateAccess,
    delete: withdrawalDeleteAccess,
    read: withdrawalReadAccess,
    update: withdrawalUpdateAccess,
  },
  admin: {
    defaultColumns: [
      'code',
      'seller',
      'amount',
      'currency',
      'status',
      'requestedAt',
      'reviewedAt',
      'paidAt',
    ],
    group: 'Finance',
    useAsTitle: 'code',
    description: 'Yêu cầu rút tiền của Người bán (Seller Withdrawals - FR-32, FLOW-U13)',
  },
  hooks: {
    beforeValidate: [validateWithdrawalBeforeValidate],
    beforeChange: [validateWithdrawalInvariants],
  },
  fields: [
    {
      name: 'code',
      type: 'text',
      required: true,
      unique: true,
      index: true,
      label: 'Mã yêu cầu rút tiền',
      admin: {
        readOnly: true,
        description: 'Mã định danh duy nhất (VD: WTH-20260915-A1B2C3D4)',
      },
      hooks: {
        beforeValidate: [generateWithdrawalCode],
      },
    },
    {
      name: 'seller',
      type: 'relationship',
      relationTo: 'users',
      required: true,
      index: true,
      label: 'Người bán (Seller)',
      admin: {
        readOnly: true,
        position: 'sidebar',
      },
    },
    {
      name: 'amount',
      type: 'number',
      required: true,
      min: 50000,
      max: 50000000,
      label: 'Số tiền rút (VND)',
      admin: {
        readOnly: true,
        step: 1,
        description: 'Số tiền rút (50.000 VND - 50.000.000 VND)',
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
      defaultValue: 'REQUESTED',
      index: true,
      label: 'Trạng thái xử lý',
      options: [
        { label: 'Yêu cầu mới (REQUESTED)', value: 'REQUESTED' },
        { label: 'Đang xem xét (UNDER_REVIEW)', value: 'UNDER_REVIEW' },
        { label: 'Đã duyệt (APPROVED)', value: 'APPROVED' },
        { label: 'Đang giải ngân (PROCESSING)', value: 'PROCESSING' },
        { label: 'Đã chi trả (PAID)', value: 'PAID' },
        { label: 'Từ chối (REJECTED)', value: 'REJECTED' },
        { label: 'Đã hủy (CANCELLED)', value: 'CANCELLED' },
        { label: 'Thất bại (FAILED)', value: 'FAILED' },
      ],
      admin: {
        position: 'sidebar',
      },
    },
    {
      name: 'bankInfo',
      type: 'group',
      label: 'Thông tin tài khoản nhận tiền',
      fields: [
        {
          name: 'bankName',
          type: 'text',
          required: true,
          label: 'Tên ngân hàng (ví dụ: Vietcombank, MBBank, Techcombank)',
        },
        {
          name: 'accountNumber',
          type: 'text',
          required: true,
          label: 'Số tài khoản ngân hàng',
        },
        {
          name: 'accountHolderName',
          type: 'text',
          required: true,
          label: 'Tên chủ tài khoản (viết hoa không dấu)',
        },
      ],
    },
    {
      name: 'requestedAt',
      type: 'date',
      required: true,
      defaultValue: () => new Date().toISOString(),
      index: true,
      label: 'Thời điểm yêu cầu',
      admin: {
        readOnly: true,
        position: 'sidebar',
      },
    },
    {
      name: 'reviewedAt',
      type: 'date',
      label: 'Thời điểm xét duyệt',
      admin: {
        readOnly: true,
        position: 'sidebar',
      },
    },
    {
      name: 'reviewedBy',
      type: 'relationship',
      relationTo: 'users',
      label: 'Người xét duyệt (Finance/Admin)',
      admin: {
        readOnly: true,
        position: 'sidebar',
      },
    },
    {
      name: 'paidAt',
      type: 'date',
      label: 'Thời điểm giải ngân thành công',
      admin: {
        readOnly: true,
        position: 'sidebar',
      },
    },
    {
      name: 'rejectionReason',
      type: 'text',
      label: 'Lý do từ chối',
      admin: {
        position: 'sidebar',
      },
    },
    {
      name: 'failureReason',
      type: 'text',
      label: 'Lý do giải ngân thất bại',
      admin: {
        position: 'sidebar',
      },
    },
    {
      name: 'notes',
      type: 'textarea',
      label: 'Ghi chú xử lý nội bộ',
    },
    {
      name: 'events',
      type: 'join',
      collection: 'withdrawal_events',
      on: 'withdrawal',
      label: 'Nhật ký sự kiện (Audit Log)',
      admin: {
        allowCreate: false,
        defaultColumns: ['fromStatus', 'toStatus', 'actor', 'actorRole', 'timestamp', 'reason'],
      },
    },
  ],
}
