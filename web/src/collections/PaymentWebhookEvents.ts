import type { CollectionConfig } from 'payload'
import { canEditMoney } from '@/access/canEditMoney'
import { webhookEventReadAccess } from '@/access/financialAccess'

/**
 * Payment Webhook Events Collection (PLAN.md §11.1, §11.3)
 *
 * Audit logging of incoming payment provider webhooks.
 * Stores masked raw payloads, validation results, and processing outcomes.
 */
export const PaymentWebhookEvents: CollectionConfig = {
  labels: {
    singular: 'Payment webhook event',
    plural: 'Payment webhook events',
  },
  slug: 'payment_webhook_events',
  access: {
    create: canEditMoney,
    delete: canEditMoney,
    read: webhookEventReadAccess,
    update: canEditMoney,
  },
  admin: {
    defaultColumns: ['provider', 'eventId', 'signatureValid', 'status', 'processedAt', 'createdAt'],
    group: 'Finance',
    useAsTitle: 'eventId',
    description: 'Nhật ký sự kiện Webhook từ cổng thanh toán (Đã che giấu dữ liệu nhạy cảm)',
  },
  fields: [
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
      name: 'eventId',
      type: 'text',
      index: true,
      label: 'Mã định danh sự kiện',
      admin: {
        readOnly: true,
      },
    },
    {
      name: 'payload',
      type: 'json',
      required: true,
      label: 'Nội dung Webhook (Masked Payload)',
      admin: {
        readOnly: true,
      },
    },
    {
      name: 'headers',
      type: 'json',
      label: 'HTTP Headers',
      admin: {
        readOnly: true,
      },
    },
    {
      name: 'signatureValid',
      type: 'checkbox',
      required: true,
      label: 'Xác thực chữ ký / Secret hợp lệ',
      admin: {
        readOnly: true,
      },
    },
    {
      name: 'status',
      type: 'select',
      required: true,
      options: [
        { label: 'Đã xử lý (processed)', value: 'processed' },
        { label: 'Bỏ qua do trùng lặp (duplicate_ignored)', value: 'duplicate_ignored' },
        { label: 'Lệch số tiền (amount_mismatch)', value: 'amount_mismatch' },
        { label: 'Sai chữ ký (invalid_signature)', value: 'invalid_signature' },
        { label: 'Thất bại kỹ thuật (failed)', value: 'failed' },
      ],
      admin: {
        readOnly: true,
      },
    },
    {
      name: 'processedAt',
      type: 'date',
      required: true,
      admin: {
        readOnly: true,
      },
    },
    {
      name: 'errorDetails',
      type: 'textarea',
      label: 'Chi tiết lỗi / cảnh báo',
      admin: {
        readOnly: true,
      },
    },
  ],
}
