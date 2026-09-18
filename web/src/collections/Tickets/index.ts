import type { CollectionConfig, FieldAccess } from 'payload'
import {
  ticketCreateAccess,
  ticketDeleteAccess,
  ticketReadAccess,
  ticketUpdateAccess,
} from '@/access/ticketAccess'
import { checkRole } from '@/access/utilities'
import {
  beforeChangeTicket,
  beforeValidateTicket,
} from './hooks/enforceTicketInvariants'

const ELEVATED_ROLES = ['admin', 'moderator', 'financeAdmin']

/**
 * Server-owned fields (FR-23 / FLOW-U09).
 *
 * `user`, `seller`, `product` and `order` decide *who* may read and write a ticket —
 * `src/access/ticketAccess.ts` grants access from `user` and `seller`. They are resolved
 * by the server (see `hooks/enforceTicketInvariants.ts`) and must not be edited from a
 * client request: collection-API updates that try to change them are refused, while the
 * custom routes write them through `overrideAccess: true` only after the attribution
 * invariants passed. `messages` is append-only and only admins may touch it through the
 * collection API; the reply route appends through `overrideAccess: true` under a row
 * lock. An admin re-attribution (transfer) remains possible.
 */
const adminOnlyFieldAccess: FieldAccess = ({ req: { user } }) =>
  checkRole(ELEVATED_ROLES as any, user as any)

export const Tickets: CollectionConfig = {
  slug: 'tickets',
  access: {
    create: ticketCreateAccess,
    delete: ticketDeleteAccess,
    read: ticketReadAccess,
    update: ticketUpdateAccess,
  },
  admin: {
    defaultColumns: ['code', 'subject', 'reason', 'status', 'priority', 'user', 'createdAt'],
    group: 'Support',
    useAsTitle: 'code',
    description: 'Hệ thống yêu cầu hỗ trợ và khiếu nại tài nguyên kỹ thuật số (FLOW-U09 & FR-23)',
  },
  hooks: {
    beforeValidate: [beforeValidateTicket],
    beforeChange: [beforeChangeTicket],
  },
  fields: [
    {
      name: 'code',
      type: 'text',
      required: true,
      unique: true,
      index: true,
      admin: {
        readOnly: true,
        description: 'Mã định danh khiếu nại duy nhất (VD: TCK-YYYYMMDD-XXXXXX)',
      },
    },
    {
      name: 'user',
      type: 'relationship',
      relationTo: 'users',
      required: true,
      index: true,
      access: {
        // The author is set by the server on create (`req.user`, or by an admin on
        // behalf of somebody else) and can only be re-attributed by an admin.
        update: adminOnlyFieldAccess,
      },
      admin: {
        description: 'Người dùng gửi yêu cầu hỗ trợ / khiếu nại',
      },
    },
    {
      name: 'seller',
      type: 'relationship',
      relationTo: 'users',
      required: false,
      index: true,
      access: {
        // Server-derived from the disputed product (see resolveTicketAttribution);
        // only an admin may re-assign the seller explicitly.
        update: adminOnlyFieldAccess,
      },
      admin: {
        description: 'Người bán liên quan đến sản phẩm được khiếu nại',
      },
    },
    {
      name: 'order',
      type: 'relationship',
      relationTo: 'orders',
      required: false,
      index: true,
      access: {
        update: adminOnlyFieldAccess,
      },
      admin: {
        description: 'Đơn hàng liên quan (nếu có)',
      },
    },
    {
      name: 'product',
      type: 'relationship',
      relationTo: 'products',
      required: false,
      index: true,
      access: {
        update: adminOnlyFieldAccess,
      },
      admin: {
        description: 'Sản phẩm liên quan đến sự cố',
      },
    },
    {
      name: 'reason',
      type: 'select',
      required: true,
      options: [
        { label: 'File hỏng không mở được', value: 'FILE_CORRUPTED' },
        { label: 'Nội dung không đúng mô tả', value: 'MISLEADING_CONTENT' },
        { label: 'Lỗi khi tải file', value: 'DOWNLOAD_ERROR' },
        { label: 'Vấn đề thanh toán', value: 'BILLING_DISPUTE' },
        { label: 'Khác', value: 'OTHER' },
      ],
      admin: {
        description: 'Phân loại lý do khiếu nại',
      },
    },
    {
      name: 'subject',
      type: 'text',
      required: true,
      admin: {
        description: 'Tiêu đề ngắn gọn tóm tắt sự cố',
      },
    },
    {
      name: 'description',
      type: 'textarea',
      required: true,
      admin: {
        description: 'Mô tả chi tiết sự cố gặp phải',
      },
    },
    {
      name: 'status',
      type: 'select',
      required: true,
      defaultValue: 'OPEN',
      index: true,
      options: [
        { label: 'Mới mở (OPEN)', value: 'OPEN' },
        { label: 'Đang xử lý (IN_PROGRESS)', value: 'IN_PROGRESS' },
        { label: 'Chờ phản hồi (WAITING_USER)', value: 'WAITING_USER' },
        { label: 'Đã giải quyết (RESOLVED)', value: 'RESOLVED' },
        { label: 'Đã đóng (CLOSED)', value: 'CLOSED' },
      ],
      admin: {
        position: 'sidebar',
        description: 'Trạng thái vòng đời hỗ trợ',
      },
    },
    {
      name: 'priority',
      type: 'select',
      required: true,
      defaultValue: 'NORMAL',
      options: [
        { label: 'Thấp (LOW)', value: 'LOW' },
        { label: 'Bình thường (NORMAL)', value: 'NORMAL' },
        { label: 'Cao (HIGH)', value: 'HIGH' },
        { label: 'Khẩn cấp (URGENT)', value: 'URGENT' },
      ],
      admin: {
        position: 'sidebar',
        description: 'Mức độ ưu tiên xử lý',
      },
    },
    {
      name: 'resolution',
      type: 'select',
      required: false,
      options: [
        { label: 'Đã giải thích', value: 'EXPLAINED' },
        { label: 'Đã cung cấp file sửa lỗi', value: 'FIX_PROVIDED' },
        { label: 'Đã hoàn tiền', value: 'REFUNDED' },
        { label: 'Từ chối giải quyết', value: 'REJECTED' },
      ],
      admin: {
        position: 'sidebar',
        description: 'Kết quả xử lý khiếu nại',
      },
    },
    {
      name: 'messages',
      type: 'array',
      label: 'Hội thoại trao đổi',
      access: {
        // Append-only thread: only admins may touch it through the collection API.
        // POST /api/v1/tickets/[id]/messages appends through `overrideAccess: true`
        // under a row lock, and the beforeChange hook merges any write back into the
        // committed thread so a stale snapshot can never drop a reply.
        create: adminOnlyFieldAccess,
        update: adminOnlyFieldAccess,
      },
      admin: {
        description: 'Chuỗi tin nhắn trao đổi giữa các bên (chỉ ghi thêm, không sửa/xoá)',
      },
      fields: [
        {
          name: 'sender',
          type: 'relationship',
          relationTo: 'users',
          required: true,
        },
        {
          name: 'senderRole',
          type: 'select',
          required: true,
          options: [
            { label: 'Người mua', value: 'buyer' },
            { label: 'Người bán', value: 'seller' },
            { label: 'Quản trị viên', value: 'admin' },
          ],
        },
        {
          name: 'message',
          type: 'textarea',
          required: true,
        },
        {
          name: 'createdAt',
          type: 'date',
          admin: {
            readOnly: true,
          },
          defaultValue: () => new Date().toISOString(),
        },
      ],
    },
  ],
}
