import type { CollectionConfig } from 'payload'
import { canEditMoney } from '@/access/canEditMoney'
import { walletLedgerReadAccess } from '@/access/financialAccess'

/**
 * Wallet Ledger Collection (PLAN.md §11.1, BR-03, Decision 0002)
 *
 * Immutable financial ledger recording every debit, credit, adjustment, and payout.
 * INVARIANT: Never updated or deleted. Direct writes denied for all principals.
 * Corrections use reversal or adjustment entries instead.
 */
export const WalletLedger: CollectionConfig = {
  slug: 'wallet_ledger',
  access: {
    create: canEditMoney,
    delete: canEditMoney,
    read: walletLedgerReadAccess,
    update: canEditMoney,
  },
  admin: {
    defaultColumns: ['createdAt', 'user', 'type', 'direction', 'amount', 'balanceBefore', 'balanceAfter', 'referenceType'],
    group: 'Finance',
    useAsTitle: 'id',
    description: 'Sổ cái tài chính bất biến (Append-Only Ledger - Không thể sửa hoặc xóa)',
  },
  fields: [
    {
      name: 'wallet',
      type: 'relationship',
      relationTo: 'wallets',
      required: true,
      index: true,
      admin: {
        readOnly: true,
      },
    },
    {
      name: 'user',
      type: 'relationship',
      relationTo: 'users',
      required: true,
      index: true,
      admin: {
        readOnly: true,
      },
    },
    {
      name: 'type',
      type: 'select',
      required: true,
      options: [
        { label: 'Nạp tiền (Topup)', value: 'topup' },
        { label: 'Mua tài nguyên (Purchase)', value: 'purchase' },
        { label: 'Hoàn tiền (Refund)', value: 'refund' },
        { label: 'Điều chỉnh số dư (Adjustment)', value: 'adjustment' },
        { label: 'Rút tiền (Withdrawal)', value: 'withdrawal' },
        { label: 'Thanh toán doanh thu (Payout)', value: 'payout' },
      ],
      admin: {
        readOnly: true,
      },
    },
    {
      name: 'amount',
      type: 'number',
      required: true,
      min: 1,
      label: 'Số tiền biến động (VND)',
      admin: {
        readOnly: true,
      },
    },
    {
      name: 'direction',
      type: 'select',
      required: true,
      options: [
        { label: 'Cộng tiền (+)', value: 'credit' },
        { label: 'Trừ tiền (-)', value: 'debit' },
      ],
      admin: {
        readOnly: true,
      },
    },
    {
      name: 'referenceType',
      type: 'select',
      required: true,
      options: [
        { label: 'Payment Intent', value: 'payment_intent' },
        { label: 'Order', value: 'order' },
        { label: 'Adjustment', value: 'adjustment' },
        { label: 'Withdrawal', value: 'withdrawal' },
        { label: 'System', value: 'system' },
      ],
      admin: {
        readOnly: true,
      },
    },
    {
      name: 'referenceId',
      type: 'text',
      required: true,
      index: true,
      label: 'Mã tham chiếu',
      admin: {
        readOnly: true,
      },
    },
    {
      name: 'balanceBefore',
      type: 'number',
      required: true,
      label: 'Số dư trước biến động (VND)',
      admin: {
        readOnly: true,
      },
    },
    {
      name: 'balanceAfter',
      type: 'number',
      required: true,
      label: 'Số dư sau biến động (VND)',
      admin: {
        readOnly: true,
      },
    },
    {
      name: 'description',
      type: 'textarea',
      label: 'Lý do / Diễn giải',
      admin: {
        readOnly: true,
      },
    },
    {
      name: 'metadata',
      type: 'json',
      label: 'Dữ liệu kỹ thuật đi kèm',
      admin: {
        readOnly: true,
      },
    },
  ],
}
