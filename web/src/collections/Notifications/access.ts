import type { Access, FieldAccess } from 'payload'
import { checkRole } from '@/access/utilities'

/**
 * Access control for the in-app notification channel (`PLAN.md` §13, §17:2291, §25 #21).
 *
 * A notification is a *personal, one-way* record: it belongs to exactly one recipient and
 * it never carries authority over business state (no balance, ledger, order status,
 * entitlement or moderation state is derived from it — ADR 0010 precedent). Two rules
 * follow from that and are locked here:
 *
 * 1. **Read is own-rows-only, for every principal including admin.** Notifications are
 *    private messages; there is no moderation or finance workflow that legitimately needs
 *    to read somebody else's inbox, so granting Admin a `true` here would be a pure leak.
 *    The consequence (an Admin cannot browse/delete another user's rows from the admin
 *    panel) is accepted deliberately: `delete` stays Admin-only for exceptional cleanup
 *    performed through the local API with `overrideAccess: true`.
 * 2. **Create is denied to the collection API.** The only writer is
 *    `src/services/notifications.ts#createNotification`, which goes through the local API
 *    with `overrideAccess: true`. Nothing else — not even an Admin session, not GraphQL,
 *    not the REST collection route — may forge a notification.
 */

/** Read: an authenticated user sees only rows addressed to them. Anonymous is denied. */
export const notificationReadAccess: Access = ({ req: { user } }) => {
  if (!user) return false

  return {
    recipient: {
      equals: user.id,
    },
  }
}

/** Create: denied everywhere. `createNotification` writes with `overrideAccess: true`. */
export const notificationCreateAccess: Access = () => false

/**
 * Update: own rows only, and only far enough to flip `readAt` (see
 * `notificationReadStateFieldAccess` below, which strips every other field). An
 * authenticated user therefore cannot rewrite the title/body/link/type/dedupeKey of a
 * notification already delivered to them — that would rewrite history for a message they
 * were already shown.
 */
export const notificationUpdateAccess: Access = ({ req: { user } }) => {
  if (!user) return false

  return {
    recipient: {
      equals: user.id,
    },
  }
}

/**
 * Delete: Admin only (BR-08 precedent — history stays, deletes are exceptional). Regular
 * recipients cannot destroy their own notifications through the collection API.
 */
export const notificationDeleteAccess: Access = ({ req: { user } }) => {
  if (!user) return false
  return checkRole(['admin'], user)
}

/**
 * Field access for every field except `readAt`: never writable through the collection
 * API, in either direction. `overrideAccess: true` (the service and the migration-time
 * tooling) bypasses this, which is exactly the intended asymmetry.
 */
export const notificationImmutableFieldAccess: FieldAccess = () => false

/**
 * Field access for `readAt`: the recipient may mark their own notification read/unread,
 * and that is the *only* update the collection API accepts. Combined with
 * `notificationUpdateAccess` (own rows) the pair implements "update chỉ đủ để đánh dấu
 * đã đọc".
 */
export const notificationReadStateFieldAccess: FieldAccess = ({ req: { user } }) =>
  Boolean(user)
