import type { CollectionBeforeChangeHook } from 'payload'
import { checkRole } from '@/access/utilities'

export const enforceModerationState: CollectionBeforeChangeHook = async ({
  data,
  req,
  originalDoc,
  operation,
}) => {
  const user = req.user

  // If operation is performed internally by system/seed without authenticated user context,
  // or if user is admin or moderator, allow programmatic management.
  const isStaff = user ? checkRole(['admin', 'moderator'], user) : true

  // Auto-assign owning seller on creation if authenticated
  if (operation === 'create' && user?.id && !data.seller) {
    data.seller = user.id
  }

  // Non-staff rules (Seller restrictions - BR-08 & FR-28)
  if (user && !isStaff) {
    // Invariant FR-28: Sellers cannot mark moderationStatus as 'approved'
    if (data.moderationStatus === 'approved' && originalDoc?.moderationStatus !== 'approved') {
      throw new Error('Chỉ Moderator hoặc Admin mới có quyền phê duyệt sản phẩm (FR-28).')
    }

    // Invariant BR-08: If product is under moderation or draft, seller cannot publish directly
    const currentStatus = data.moderationStatus || originalDoc?.moderationStatus
    if (
      ['submitted', 'in_review', 'changes_requested', 'rejected'].includes(currentStatus) &&
      data._status === 'published'
    ) {
      throw new Error('Không có quyền tự ý xuất bản sản phẩm khi chưa được phê duyệt (BR-08).')
    }

    // When seller submits for review
    if (data.moderationStatus === 'submitted') {
      if (!data.copyrightDeclared && !originalDoc?.copyrightDeclared) {
        throw new Error('Vui lòng xác nhận cam kết bản quyền trước khi gửi kiểm duyệt.')
      }
      data._status = 'draft'
    }

    // Default moderationStatus
    if (!data.moderationStatus) {
      data.moderationStatus = data._status === 'published' ? 'approved' : 'draft'
    }
  } else if (user && isStaff) {
    // Staff rules: record history when transitioning between review states
    const validHistoryActions = ['submitted', 'in_review', 'changes_requested', 'approved', 'rejected']
    if (
      operation === 'update' &&
      originalDoc &&
      data.moderationStatus &&
      data.moderationStatus !== originalDoc.moderationStatus &&
      validHistoryActions.includes(data.moderationStatus)
    ) {
      const historyEntry = {
        reviewer: user.id,
        action: data.moderationStatus,
        note: data.moderationNotes || '',
        timestamp: new Date().toISOString(),
      }
      data.moderationHistory = [...(originalDoc.moderationHistory || []), historyEntry]

      if (data.moderationStatus === 'approved') {
        if (data._status === undefined || data._status === 'draft') {
          data._status = 'published'
        }
      } else if (data.moderationStatus === 'changes_requested' || data.moderationStatus === 'rejected') {
        data._status = 'draft'
      }
    }
  }

  return data
}
