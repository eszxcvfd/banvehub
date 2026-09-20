/**
 * Vocabulary of the in-app notification channel (`PLAN.md` §13).
 *
 * §13 lists 12 business events. Two of them are email-shaped by nature and were pushed
 * out of the launch scope by ADR 0003 (`verify account`, `password/security event`), so
 * the in-app channel carries the remaining 10. The list below is the single source of
 * truth for both the `notifications.type` select field and `createNotification`, so a
 * typo cannot silently create an 11th, unreadable event kind.
 *
 * Order matters: the select options in the collection and the Postgres enum values in
 * `20260919_000000_phase11_notifications.ts` must stay aligned with this tuple.
 */
export const NOTIFICATION_TYPES = [
  'PAYMENT_SUCCESS',
  'PAYMENT_FAILED',
  'ORDER_SUCCESS',
  'SELLER_SALE',
  'EARNINGS_AVAILABLE',
  'WITHDRAWAL_STATUS',
  'REFUND',
  'PRODUCT_APPROVED',
  'PRODUCT_REJECTED',
  'TICKET_REPLY',
] as const

export type NotificationType = (typeof NOTIFICATION_TYPES)[number]

export const NOTIFICATION_TYPE_OPTIONS: ReadonlyArray<{
  label: string
  value: NotificationType
}> = [
  { label: 'Nạp tiền / thanh toán thành công (PAYMENT_SUCCESS)', value: 'PAYMENT_SUCCESS' },
  { label: 'Thanh toán thất bại (PAYMENT_FAILED)', value: 'PAYMENT_FAILED' },
  { label: 'Đơn hàng hoàn tất (ORDER_SUCCESS)', value: 'ORDER_SUCCESS' },
  { label: 'Người bán có đơn mới (SELLER_SALE)', value: 'SELLER_SALE' },
  { label: 'Doanh thu khả dụng (EARNINGS_AVAILABLE)', value: 'EARNINGS_AVAILABLE' },
  { label: 'Trạng thái yêu cầu rút tiền (WITHDRAWAL_STATUS)', value: 'WITHDRAWAL_STATUS' },
  { label: 'Hoàn tiền (REFUND)', value: 'REFUND' },
  { label: 'Sản phẩm được duyệt (PRODUCT_APPROVED)', value: 'PRODUCT_APPROVED' },
  { label: 'Sản phẩm bị từ chối (PRODUCT_REJECTED)', value: 'PRODUCT_REJECTED' },
  { label: 'Phản hồi yêu cầu hỗ trợ (TICKET_REPLY)', value: 'TICKET_REPLY' },
]

/** Runtime guard used by `createNotification` before it touches the database. */
export const isNotificationType = (value: unknown): value is NotificationType =>
  typeof value === 'string' && (NOTIFICATION_TYPES as readonly string[]).includes(value)
