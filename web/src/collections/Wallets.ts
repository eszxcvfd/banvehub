import type { CollectionConfig } from 'payload'
import { canEditMoney, canEditMoneyField } from '@/access/canEditMoney'
import { walletReadAccess } from '@/access/financialAccess'

/**
 * Wallets Collection (PLAN.md §11, §22, Decision 0002)
 *
 * Stores current balance and pending balance for each user.
 * INVARIANT: Direct writes (create, update, delete) are denied for EVERY principal
 * including administrators. All mutations must go through the Money Write Layer
 * and pair with an append-only ledger row in the same transaction.
 */
export const Wallets: CollectionConfig = {
  labels: {
    singular: 'Wallet',
    plural: 'Wallets',
  },
  slug: 'wallets',
  access: {
    create: canEditMoney,
    delete: canEditMoney,
    read: walletReadAccess,
    update: canEditMoney,
  },
  admin: {
    defaultColumns: ['user', 'balance', 'pendingBalance', 'currency', 'status', 'updatedAt'],
    group: 'Finance',
    useAsTitle: 'id',
    description: 'Số dư ví người dùng (Chỉ đọc - Mọi biến động phải qua Money Write Path và Ledger)',
  },
  fields: [
    {
      name: 'user',
      type: 'relationship',
      relationTo: 'users',
      required: true,
      unique: true,
      index: true,
      admin: {
        position: 'sidebar',
        readOnly: true,
      },
      access: {
        update: canEditMoneyField,
      },
    },
    {
      name: 'balance',
      type: 'number',
      required: true,
      defaultValue: 0,
      min: 0,
      label: 'Số dư khả dụng (VND)',
      admin: {
        readOnly: true,
      },
      access: {
        update: canEditMoneyField,
      },
    },
    {
      name: 'pendingBalance',
      type: 'number',
      required: true,
      defaultValue: 0,
      min: 0,
      label: 'Số dư tạm giữ / Đang xử lý (VND)',
      admin: {
        readOnly: true,
      },
      access: {
        update: canEditMoneyField,
      },
    },
    {
      name: 'currency',
      type: 'select',
      required: true,
      defaultValue: 'VND',
      options: [
        { label: 'VND', value: 'VND' },
      ],
      admin: {
        position: 'sidebar',
        readOnly: true,
      },
    },
    {
      name: 'status',
      type: 'select',
      required: true,
      defaultValue: 'active',
      options: [
        { label: 'Hoạt động', value: 'active' },
        { label: 'Tạm khóa', value: 'frozen' },
        { label: 'Đã đóng', value: 'closed' },
      ],
      admin: {
        position: 'sidebar',
      },
    },
  ],
}
