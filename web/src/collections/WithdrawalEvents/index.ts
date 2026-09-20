import type { CollectionConfig } from 'payload'
import {
  withdrawalEventCreateAccess,
  withdrawalEventDeleteAccess,
  withdrawalEventReadAccess,
  withdrawalEventUpdateAccess,
} from '@/access/withdrawalAccess'
import {
  preventWithdrawalEventDeletion,
  preventWithdrawalEventMutation,
} from './hooks/preventWithdrawalEventMutation'

export const WithdrawalEvents: CollectionConfig = {
  labels: {
    singular: 'Withdrawal event',
    plural: 'Withdrawal events',
  },
  slug: 'withdrawal_events',
  access: {
    create: withdrawalEventCreateAccess,
    delete: withdrawalEventDeleteAccess,
    read: withdrawalEventReadAccess,
    update: withdrawalEventUpdateAccess,
  },
  admin: {
    defaultColumns: ['id', 'withdrawal', 'fromStatus', 'toStatus', 'actor', 'actorRole', 'timestamp'],
    group: 'Finance',
    useAsTitle: 'id',
    description: 'Nhật ký kiểm toán sự kiện rút tiền (Append-Only Audit Trail - PLAN.md §11.1)',
  },
  hooks: {
    beforeChange: [preventWithdrawalEventMutation],
    beforeDelete: [preventWithdrawalEventDeletion],
  },
  fields: [
    {
      name: 'withdrawal',
      type: 'relationship',
      relationTo: 'withdrawals',
      required: true,
      index: true,
      label: 'Yêu cầu rút tiền liên kết',
      admin: {
        readOnly: true,
        position: 'sidebar',
      },
    },
    {
      name: 'fromStatus',
      type: 'text',
      required: false,
      label: 'Trạng thái trước',
      admin: {
        readOnly: true,
      },
    },
    {
      name: 'toStatus',
      type: 'text',
      required: true,
      label: 'Trạng thái sau',
      admin: {
        readOnly: true,
      },
    },
    {
      name: 'actor',
      type: 'relationship',
      relationTo: 'users',
      required: false,
      index: true,
      label: 'Người thực hiện thao tác',
      admin: {
        readOnly: true,
        position: 'sidebar',
      },
    },
    {
      name: 'actorRole',
      type: 'text',
      required: false,
      label: 'Vai trò người thực hiện (admin / financeAdmin / seller / system)',
      admin: {
        readOnly: true,
        position: 'sidebar',
      },
    },
    {
      name: 'reason',
      type: 'text',
      required: false,
      label: 'Lý do / Diễn giải',
      admin: {
        readOnly: true,
      },
    },
    {
      name: 'notes',
      type: 'textarea',
      required: false,
      label: 'Ghi chú bổ sung',
      admin: {
        readOnly: true,
      },
    },
    {
      name: 'timestamp',
      type: 'date',
      required: true,
      defaultValue: () => new Date().toISOString(),
      index: true,
      label: 'Thời điểm ghi nhận sự kiện',
      admin: {
        readOnly: true,
        position: 'sidebar',
      },
    },
    {
      name: 'metadata',
      type: 'json',
      required: false,
      label: 'Dữ liệu kỹ thuật đi kèm',
      admin: {
        readOnly: true,
      },
    },
  ],
}
