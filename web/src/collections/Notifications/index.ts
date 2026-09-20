import type { CollectionConfig } from 'payload'
import {
  notificationCreateAccess,
  notificationDeleteAccess,
  notificationImmutableFieldAccess,
  notificationReadAccess,
  notificationReadStateFieldAccess,
  notificationUpdateAccess,
} from './access'
import { NOTIFICATION_TYPE_OPTIONS } from './types'

/**
 * In-app notifications (`PLAN.md` §13 P0 channel, §17:2291, screen §25 #21).
 *
 * Design contract (locked for this increment):
 *
 * - **One-way record.** A notification *describes* a business event; nothing in the money
 *   path (wallet balance, `wallet_ledger`, `orders`, `entitlements`, `refunds`,
 *   `seller_earnings`, `withdrawals`) or in moderation ever reads it back. Emitting one is
 *   side-effect free (ADR 0010 precedent: a notification must not change business state).
 * - **At most once per business event.** `dedupeKey` is required and the database carries
 *   `UNIQUE (recipient_id, type, dedupe_key)` (see
 *   `src/migrations/20260919_000000_phase11_notifications.ts`). A replayed event — the
 *   BR-02 SePay webhook replay is the load-bearing case — collides instead of creating a
 *   second row, and `createNotification` turns that collision into a no-op.
 * - **Write path.** `src/services/notifications.ts#createNotification` is the only writer
 *   (`create` is denied to the collection API); it uses the local API with
 *   `overrideAccess: true`, never throws, and never breaks its caller.
 * - **Read path.** Own rows only, for every principal (see `./access.ts`). `readAt` null
 *   means unread; the recipient may set it and nothing else.
 *
 * `dedupeKey` is intentionally `required: true`: in Postgres a NULL never collides with
 * another NULL, so an optional dedupe key would silently disable the uniqueness guarantee
 * and allow the same business event to be announced twice.
 */
export const Notifications: CollectionConfig = {
  slug: 'notifications',
  access: {
    create: notificationCreateAccess,
    delete: notificationDeleteAccess,
    read: notificationReadAccess,
    update: notificationUpdateAccess,
  },
  admin: {
    defaultColumns: ['id', 'recipient', 'type', 'title', 'readAt', 'createdAt'],
    group: 'Notifications',
    useAsTitle: 'title',
    description:
      'Thông báo in-app (§13, màn hình §25 #21). Bản ghi một chiều: phát thông báo không đổi trạng thái nghiệp vụ, và mỗi sự kiện nghiệp vụ chỉ phát tối đa một lần (dedupeKey).',
  },
  fields: [
    {
      name: 'recipient',
      type: 'relationship',
      relationTo: 'users',
      required: true,
      index: true,
      access: {
        // Re-addressing a delivered notification would leak it to another inbox.
        create: notificationImmutableFieldAccess,
        update: notificationImmutableFieldAccess,
      },
      admin: {
        description: 'Người nhận thông báo',
      },
    },
    {
      name: 'type',
      type: 'select',
      required: true,
      options: [...NOTIFICATION_TYPE_OPTIONS],
      access: {
        create: notificationImmutableFieldAccess,
        update: notificationImmutableFieldAccess,
      },
      admin: {
        description: 'Loại sự kiện nghiệp vụ (§13)',
      },
    },
    {
      name: 'title',
      type: 'text',
      required: true,
      access: {
        create: notificationImmutableFieldAccess,
        update: notificationImmutableFieldAccess,
      },
      admin: {
        description: 'Tiêu đề ngắn hiển thị trong danh sách thông báo',
      },
    },
    {
      name: 'body',
      type: 'textarea',
      required: true,
      access: {
        create: notificationImmutableFieldAccess,
        update: notificationImmutableFieldAccess,
      },
      admin: {
        description: 'Nội dung thông báo',
      },
    },
    {
      name: 'link',
      type: 'text',
      required: false,
      access: {
        create: notificationImmutableFieldAccess,
        update: notificationImmutableFieldAccess,
      },
      admin: {
        description: 'Đường dẫn mở từ thông báo (tuỳ chọn)',
      },
    },
    {
      name: 'readAt',
      type: 'date',
      required: false,
      access: {
        // The ONLY field the recipient may write: "update chỉ đủ để đánh dấu đã đọc".
        create: notificationImmutableFieldAccess,
        update: notificationReadStateFieldAccess,
      },
      admin: {
        position: 'sidebar',
        description: 'Thời điểm đọc; null = chưa đọc',
      },
    },
    {
      name: 'dedupeKey',
      type: 'text',
      required: true,
      access: {
        create: notificationImmutableFieldAccess,
        update: notificationImmutableFieldAccess,
      },
      admin: {
        readOnly: true,
        description:
          'Khoá chống trùng theo sự kiện nghiệp vụ. UNIQUE (recipient, type, dedupeKey) ở tầng DB.',
      },
    },
  ],
  timestamps: true,
}
