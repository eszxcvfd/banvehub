import type { CollectionAfterChangeHook } from 'payload'
import { checkRole } from '@/access/utilities'
import { createNotification } from '@/services/notifications'

/**
 * §13 in-app channel: announce a product moderation verdict to the seller — but only once the
 * verdict was actually written (decision 0011, decision 6: "announce only after the business
 * write; never from `beforeChange`").
 *
 * Why this hook exists separately from `enforceModerationState`: that hook is a `beforeChange`
 * hook, i.e. it runs *before* the product row is written. Announcing from there meant a product
 * update the database then rejected still committed `PRODUCT_APPROVED` for a row that stayed
 * `draft` (review finding F1, reproduced with a real `BEFORE UPDATE` trigger: notification id
 * 923 committed while `moderation_status` stayed `draft`), and the false row then consumed
 * `product:<id>:approved`, so the later genuine verdict was swallowed as an existing key and the
 * seller never received the true notification. `afterChange` runs after the write, so a write
 * the database rejects announces nothing and leaves the dedupe key free for the real verdict.
 *
 * Conditions are the ones the previous emit used, unchanged:
 * - `operation === 'update'` — a verdict is a state transition, not a creation;
 * - a REAL moderation-status change (`doc` vs `previousDoc`);
 * - `approved` / `rejected` only — the two verdicts the seller is told about;
 * - a real seller recipient;
 * - `isStaff` (admin/moderator, or internal/system context), so a seller cannot push the
 *   channel into notifying themselves through the collection API.
 *
 * The values are read from the WRITTEN document (`doc`) and its pre-write snapshot
 * (`previousDoc`), never from the incoming `data`, so a message can never describe a value that
 * was not persisted.
 *
 * FIRE-AND-FORGET: `createNotification` writes on its own pooled connection and swallows every
 * failure, so the verdict update's result can never depend on the notification succeeding. The
 * dedupeKey is `product:<id>:<verdict>`, so a re-approval or re-rejection of the same product is
 * a no-op instead of a second announcement (verified: the key is not consumed by a rejected
 * write any more).
 *
 * Two residuals, stated rather than hidden:
 *
 * 1. **Commit window.** Payload runs a collection `afterChange` hook inside the document
 *    operation, after the database write but before the operation commits
 *    (`payload/dist/collections/operations/utilities/update.js:330` inside `updateDocument`,
 *    whose caller commits at `collections/operations/updateByID.js:166`; likewise
 *    `create.js:306` before `:324`). No collection hook runs after commit, so a *commit* failure
 *    — as opposed to a rejected statement, which is what F1 reproduced — can still leave a
 *    notification for a write that rolled back. `afterOperation` does not help: it also runs
 *    before commit (decision 0011, alternative 5); closing this properly needs the transactional
 *    outbox that decision 0011 defers as alternative 4.
 *
 * 2. **Pool liveness (review finding F2), now bounded.** The hook runs while the document
 *    operation still holds its transaction connection, and `createNotification` deliberately
 *    draws a *second* connection from the same shared pool (decision 0011, decision 4), so a
 *    saturated pool cannot hand one over. That acquisition is bounded by
 *    `connectionTimeoutMillis` = `POOL_ACQUISITION_TIMEOUT_MS` (5000 ms,
 *    `src/payload.config.ts`), so the emit fails inside the bound, is swallowed, and this verdict
 *    update finishes — instead of parking a connection on a waiter until the pool can no longer
 *    recover. Same precedent as the ticket reply path, which bounds its `SELECT ... FOR UPDATE`
 *    wait at the same 5000 ms (`collections/Tickets/hooks/enforceTicketInvariants.ts`,
 *    `TICKET_LOCK_WAIT_TIMEOUT`). Measured by `tests/int/notification-pool-bound.int.spec.ts`,
 *    which holds connections out of the pool and asserts both the bounded completion and the
 *    skipped notification.
 *
 *    What the bound does NOT buy: with a saturated pool a verdict update can still be delayed by
 *    up to that bound before it proceeds, and the unbounded wait returns if the bound is ever
 *    removed from the pool configuration. If verdict updates become a hot path, give the
 *    notification path its own pool or emit without awaiting (at the cost of the deterministic
 *    assertions these tests rely on) — do not silently drop the bound.
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

/** Relationship fields arrive as an id or a populated document; normalise to the numeric id. */
const toUserId = (value: unknown): number | null => {
  const raw = typeof value === 'object' && value !== null ? (value as { id?: unknown }).id : value
  if (raw === null || raw === undefined || raw === '') return null
  const parsed = Number(raw)
  return Number.isFinite(parsed) ? parsed : null
}

export const announceModerationVerdict: CollectionAfterChangeHook = async ({
  doc,
  operation,
  previousDoc,
  req,
}) => {
  // Same gate as the moderation rules themselves: staff (admin/moderator) or an internal/system
  // write with no authenticated principal.
  const user = req?.user
  const isStaff = user ? checkRole(['admin', 'moderator'], user) : true

  const nextStatus = (doc as { moderationStatus?: string | null } | undefined)?.moderationStatus
  const previousStatus = (previousDoc as { moderationStatus?: string | null } | undefined)
    ?.moderationStatus
  const verdict = nextStatus ? ANNOUNCED_VERDICTS[nextStatus] : undefined

  if (
    operation !== 'update' ||
    !verdict ||
    !isStaff ||
    nextStatus === previousStatus ||
    !doc?.id
  ) {
    return
  }

  const sellerId = toUserId((doc as { seller?: unknown }).seller)
  if (sellerId === null) return

  await createNotification(req.payload, {
    recipient: sellerId,
    type: nextStatus === 'approved' ? 'PRODUCT_APPROVED' : 'PRODUCT_REJECTED',
    title: verdict.title,
    body: verdict.body(
      String((doc as { title?: string | null }).title ?? ''),
      String((doc as { moderationNotes?: string | null }).moderationNotes ?? ''),
    ),
    link: '/seller',
    dedupeKey: `product:${doc.id}:${nextStatus}`,
  })
}
