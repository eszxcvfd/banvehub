import type { CollectionConfig } from 'payload'
import { canEditMoney } from '@/access/canEditMoney'
import { paymentIntentReadAccess } from '@/access/financialAccess'

/**
 * Payment Intents Collection (PLAN.md §11.1, §11.2, Decision 0005)
 *
 * Represents one top-up or payment attempt.
 * Strictly implements the 7 states of PLAN.md §11.2:
 * CREATED, PENDING, PAID, EXPIRED, FAILED, CANCELLED, REFUNDED.
 */
export const PaymentIntents: CollectionConfig = {
  labels: {
    singular: 'Payment intent',
    plural: 'Payment intents',
  },
  slug: 'payment_intents',
  access: {
    create: ({ req: { user } }) => Boolean(user),
    delete: canEditMoney,
    read: paymentIntentReadAccess,
    update: canEditMoney,
  },
  admin: {
    defaultColumns: ['code', 'user', 'provider', 'amount', 'status', 'reconciliationFlag', 'expiresAt', 'createdAt'],
    group: 'Finance',
    useAsTitle: 'code',
    description: 'Ý định thanh toán / Nạp tiền người dùng (Payment Intents State Machine)',
  },
  fields: [
    {
      name: 'code',
      type: 'text',
      required: true,
      unique: true,
      index: true,
      label: 'Mã giao dịch nạp tiền (Transfer Syntax Code)',
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
        position: 'sidebar',
        readOnly: true,
      },
    },
    {
      name: 'provider',
      type: 'select',
      required: true,
      defaultValue: 'sepay',
      options: [
        { label: 'SePay VietQR', value: 'sepay' },
        { label: 'VNPay', value: 'vnpay' },
        { label: 'MoMo', value: 'momo' },
      ],
      admin: {
        position: 'sidebar',
      },
    },
    {
      name: 'amount',
      type: 'number',
      required: true,
      min: 10000,
      label: 'Số tiền thanh toán (VND nguyên dương)',
      admin: {
        readOnly: true,
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
      defaultValue: 'CREATED',
      options: [
        { label: 'CREATED (Đã tạo)', value: 'CREATED' },
        { label: 'PENDING (Chờ thanh toán)', value: 'PENDING' },
        { label: 'PAID (Đã thanh toán)', value: 'PAID' },
        { label: 'EXPIRED (Đã hết hạn)', value: 'EXPIRED' },
        { label: 'FAILED (Thất bại)', value: 'FAILED' },
        { label: 'CANCELLED (Đã hủy)', value: 'CANCELLED' },
        { label: 'REFUNDED (Đã hoàn tiền)', value: 'REFUNDED' },
      ],
      admin: {
        position: 'sidebar',
      },
    },
    {
      name: 'reconciliationFlag',
      type: 'checkbox',
      defaultValue: false,
      label: 'Cần đối soát thủ công (Reconciliation Required)',
      admin: {
        position: 'sidebar',
      },
    },
    {
      name: 'reconciliationNote',
      type: 'textarea',
      label: 'Ghi chú đối soát (Lệch số tiền hoặc sự cố)',
    },
    {
      name: 'expiresAt',
      type: 'date',
      required: true,
      label: 'Thời hạn hiệu lực thanh toán',
      admin: {
        position: 'sidebar',
      },
    },
    {
      name: 'checkoutUrl',
      type: 'text',
      label: 'Đường dẫn thanh toán / VietQR link',
    },
  ],
}
