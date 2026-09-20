import type { CollectionConfig } from 'payload'
import { canEditMoney } from '@/access/canEditMoney'
import { paymentTransactionReadAccess } from '@/access/financialAccess'

/**
 * Payment Transactions Collection (PLAN.md §11.1, BR-02, Decision 0004, 0005)
 *
 * Records provider payment confirmation attempts.
 * INVARIANT (BR-02): Unique constraint on (provider, provider_transaction_id).
 * Webhook replay cannot record duplicate success transactions or double-credit money.
 */
export const PaymentTransactions: CollectionConfig = {
  labels: {
    singular: 'Payment transaction',
    plural: 'Payment transactions',
  },
  slug: 'payment_transactions',
  access: {
    create: canEditMoney,
    delete: canEditMoney,
    read: paymentTransactionReadAccess,
    update: canEditMoney,
  },
  admin: {
    defaultColumns: ['provider', 'providerTransactionId', 'amount', 'status', 'paidAt', 'createdAt'],
    group: 'Finance',
    useAsTitle: 'providerTransactionId',
    description: 'Lịch sử giao dịch từ nhà cung cấp thanh toán (SePay) - Ràng buộc duy nhất BR-02',
  },
  fields: [
    {
      name: 'paymentIntent',
      type: 'relationship',
      relationTo: 'payment_intents',
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
      name: 'provider',
      type: 'text',
      required: true,
      defaultValue: 'sepay',
      index: true,
      admin: {
        readOnly: true,
      },
    },
    {
      name: 'providerTransactionId',
      type: 'text',
      required: true,
      index: true,
      label: 'Mã giao dịch từ Provider (SePay ID)',
      admin: {
        readOnly: true,
      },
    },
    {
      name: 'amount',
      type: 'number',
      required: true,
      label: 'Số tiền thực nhận (VND)',
      admin: {
        readOnly: true,
      },
    },
    {
      name: 'rawReference',
      type: 'json',
      label: 'Dữ liệu giao dịch gốc từ Provider',
      admin: {
        readOnly: true,
      },
    },
    {
      name: 'status',
      type: 'select',
      required: true,
      defaultValue: 'SUCCESS',
      options: [
        { label: 'Thành công (SUCCESS)', value: 'SUCCESS' },
        { label: 'Thất bại (FAILED)', value: 'FAILED' },
        { label: 'Đang xử lý (PENDING)', value: 'PENDING' },
      ],
      admin: {
        readOnly: true,
      },
    },
    {
      name: 'paidAt',
      type: 'date',
      required: true,
      label: 'Thời điểm chuyển tiền thành công',
      admin: {
        readOnly: true,
      },
    },
  ],
}
