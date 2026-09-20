import type { CollectionBeforeChangeHook } from 'payload'
import { checkRole } from '@/access/utilities'
import { createNotification } from '@/services/notifications'

/**
 * §13 in-app channel (added): the two moderation verdicts that are announced to the seller.
 *
 * Only the *verdict* is announced, and only when the acting principal is allowed to issue it
 * (see the `isStaff` gate at the call site), so a seller cannot talk the channel into
 * notifying themselves through the collection API.
 */
const ANNOUNCED_VERDICTS: Record<
  string,
  { title: string; body: (productTitle: string, note: string) => string }
> = {
  approved: {
    title: 'Sản phẩm đã được duyệt',
    body: (productTitle, note) =>
      `Tài nguyên "${productTitle}" đã được kiểm duyệt và phát hành.${note ? ` Ghi chú: ${note}` : ''}`,
  },
  rejected: {
    title: 'Sản phẩm bị từ chối',
    body: (productTitle, note) =>
      `Tài nguyên "${productTitle}" chưa được duyệt.${note ? ` Lý do: ${note}` : ' Vui lòng xem lại nội dung và gửi duyệt lại.'}`,
  },
}

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

  // §13 in-app channel (added).
  //
  // Emitted at the very END of the hook — after every rejection above — so a refused
  // transition announces nothing. Only the two seller-facing verdicts, only for a real status
  // change, and only when the acting principal is entitled to issue a verdict (`isStaff` is
  // `true` for staff and for internal/system context, and `false` for a seller), so a seller
  // cannot push the channel into notifying themselves.
  //
  // Fire-and-forget: `createNotification` writes on its own pooled connection and swallows
  // every failure, so it can never change whether this product write succeeds. The dedupeKey is
  // `(product, verdict)`, so re-approving or re-rejecting the same product announces the
  // verdict exactly once.
  //
  // Ordering note, stated deliberately: this is a `beforeChange` hook, so the announcement is
  // produced just before the row is written. A database-level failure *after* this point would
  // leave a verdict notification for a write that did not land. Adding an `afterChange` hook
  // would close that window but requires touching `collections/Products/index.ts`, which is
  // outside this increment's scope — see the t2 report.
  const previousStatus = originalDoc?.moderationStatus
  const nextStatus = data.moderationStatus
  const verdict = nextStatus ? ANNOUNCED_VERDICTS[nextStatus] : undefined

  if (operation === 'update' && verdict && nextStatus !== previousStatus && isStaff) {
    const productSeller = data.seller ?? originalDoc?.seller
    const sellerId =
      typeof productSeller === 'object' && productSeller !== null
        ? (productSeller as { id?: number | string }).id
        : productSeller

    if (sellerId !== undefined && sellerId !== null && originalDoc?.id) {
      await createNotification(req.payload, {
        recipient: Number(sellerId),
        type: nextStatus === 'approved' ? 'PRODUCT_APPROVED' : 'PRODUCT_REJECTED',
        title: verdict.title,
        body: verdict.body(
          String(data.title ?? originalDoc?.title ?? ''),
          String(data.moderationNotes ?? originalDoc?.moderationNotes ?? ''),
        ),
        link: '/seller',
        dedupeKey: `product:${originalDoc.id}:${nextStatus}`,
        req,
      })
    }
  }

  return data
}
