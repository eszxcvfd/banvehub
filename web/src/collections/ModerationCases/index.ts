import type { CollectionConfig, FieldAccess } from 'payload'
import {
  moderationCaseCreateAccess,
  moderationCaseDeleteAccess,
  moderationCaseReadAccess,
  moderationCaseUpdateAccess,
} from '@/access/moderationCaseAccess'
import { checkRole } from '@/access/utilities'
import { MODERATION_CASE_REASON_OPTIONS } from './reasons'

/**
 * Server-owned fields (FR-22 / `PLAN.md` §17:2293).
 *
 * A moderation case is the record that decides *why* a product was reported and *who*
 * reported it. `reporter` and `product` are resolved by the report route
 * (`src/app/api/v1/products/[id]/reports/route.ts`) from the authenticated session and
 * the URL, never from client-supplied attribution; `status`/`resolutionNotes`/
 * `resolvedBy`/`resolvedAt` belong to the moderation verdict.
 *
 * Those fields are field-access restricted so the collection API cannot be used to
 * forge attribution or to pre-resolve a case: a request without `overrideAccess` gets
 * the value stripped (and the required `reporter` then fails validation), while the
 * report route and the moderation team write through `overrideAccess: true`.
 */
const elevatedRoleFieldAccess: FieldAccess = ({ req: { user } }) =>
  checkRole(['admin', 'moderator'], user as any)

const adminOnlyFieldAccess: FieldAccess = ({ req: { user } }) =>
  checkRole(['admin'], user as any)

export const ModerationCases: CollectionConfig = {
  slug: 'moderation_cases',
  access: {
    create: moderationCaseCreateAccess,
    delete: moderationCaseDeleteAccess,
    read: moderationCaseReadAccess,
    update: moderationCaseUpdateAccess,
  },
  admin: {
    defaultColumns: ['id', 'product', 'reason', 'status', 'createdAt'],
    group: 'Moderation',
    useAsTitle: 'id',
    description:
      'Hồ sơ kiểm duyệt do người dùng báo cáo sản phẩm (FR-22). Moderator/Admin xem và xử lý tại đây; báo cáo không tự đổi trạng thái sản phẩm.',
  },
  fields: [
    {
      name: 'product',
      type: 'relationship',
      relationTo: 'products',
      required: true,
      index: true,
      access: {
        // Re-pointing a case at another product would rewrite the moderation history.
        update: elevatedRoleFieldAccess,
      },
      admin: {
        description: 'Sản phẩm bị báo cáo',
      },
    },
    {
      name: 'reporter',
      type: 'relationship',
      relationTo: 'users',
      required: true,
      index: true,
      access: {
        // Server-set from `req.user`; only an admin may re-attribute a case.
        create: elevatedRoleFieldAccess,
        update: adminOnlyFieldAccess,
      },
      admin: {
        description: 'Người dùng đã gửi báo cáo',
      },
    },
    {
      name: 'reason',
      type: 'select',
      required: true,
      options: MODERATION_CASE_REASON_OPTIONS,
      admin: {
        description: 'Lý do báo cáo theo FR-22',
      },
    },
    {
      name: 'description',
      type: 'textarea',
      required: false,
      maxLength: 2000,
      admin: {
        description: 'Mô tả chi tiết (tuỳ chọn, tối đa 2000 ký tự)',
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
        { label: 'Đang xem xét (IN_REVIEW)', value: 'IN_REVIEW' },
        { label: 'Đã xử lý (RESOLVED)', value: 'RESOLVED' },
        { label: 'Bỏ qua (DISMISSED)', value: 'DISMISSED' },
      ],
      access: {
        // A reporter may not self-resolve; the report route keeps the default OPEN.
        create: elevatedRoleFieldAccess,
        update: elevatedRoleFieldAccess,
      },
      admin: {
        position: 'sidebar',
        description: 'Trạng thái xử lý hồ sơ kiểm duyệt',
      },
    },
    {
      name: 'resolutionNotes',
      type: 'textarea',
      required: false,
      maxLength: 2000,
      access: {
        create: elevatedRoleFieldAccess,
        update: elevatedRoleFieldAccess,
      },
      admin: {
        position: 'sidebar',
        description: 'Kết luận / ghi chú xử lý của ban kiểm duyệt',
      },
    },
    {
      name: 'resolvedBy',
      type: 'relationship',
      relationTo: 'users',
      required: false,
      index: true,
      access: {
        create: elevatedRoleFieldAccess,
        update: elevatedRoleFieldAccess,
      },
      admin: {
        position: 'sidebar',
        description: 'Moderator/Admin đã xử lý hồ sơ',
      },
    },
    {
      name: 'resolvedAt',
      type: 'date',
      required: false,
      access: {
        create: elevatedRoleFieldAccess,
        update: elevatedRoleFieldAccess,
      },
      admin: {
        position: 'sidebar',
        description: 'Thời điểm xử lý',
      },
    },
  ],
  timestamps: true,
}
