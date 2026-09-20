/**
 * web/src/services/notifications.ts
 *
 * In-app notification write layer (`PLAN.md` §13 P0 channel, §17:2291, §25 #21).
 *
 * `createNotification` is the ONE and ONLY writer of the `notifications` collection
 * (`create` is denied to the collection API — see
 * `src/collections/Notifications/access.ts`). It is built so a business flow can call it
 * and forget about it:
 *
 * 1. **At most once per business event.** The service pre-checks
 *    `(recipient, type, dedupeKey)` and returns `'existing'` when the row is already
 *    there; the database's UNIQUE index
 *    (`notifications_recipient_type_dedupe_key_unique_idx`) is the backstop for the
 *    concurrent case, and a collision is reported as `'existing'` too. Neither path
 *    throws — that is what keeps a replayed SePay webhook a no-op `200` (BR-02).
 * 2. **Never breaks the caller.** Every failure — validation, connection, permissions, an
 *    unexpected constraint — is logged and swallowed. A notification is a one-way record,
 *    so losing one must never roll back a payment, a purchase, an order, an entitlement,
 *    a refund, a withdrawal or a moderation verdict (ADR 0010 precedent: emitting a
 *    notification does not change business state).
 * 3. **Safe inside an open caller transaction — structurally, not by try/catch.** The
 *    service deliberately does NOT forward the caller's `req`/`transactionID` to the
 *    local API, so the notification write runs in its own transaction on a different
 *    connection drawn from the shared pool (point 4 — that is not a pool of its own).
 *
 *    This is not a stylistic choice. Reading the Payload source: every local-API write
 *    operation wraps itself in `try { ... } catch (error) { await killTransaction(req);
 *    throw error }` (`payload/dist/collections/operations/create.js`), and
 *    `killTransaction` calls the adapter's `rollbackTransaction`, which **rejects and
 *    deletes the caller's whole DB transaction** — not just the failed statement. A
 *    SAVEPOINT cannot save it either: the rollback happens above the driver, after the
 *    statement has already been rolled back. So if the notification INSERT joined the
 *    caller's transaction and lost a race against a concurrent emitter, a replayed
 *    webhook would take the payment transaction down with it. Writing through a separate
 *    transaction makes "never breaks the caller" a structural property instead of a
 *    promise.
 *
 *    Accepted trade-off, stated explicitly: a notification is therefore NOT
 *    transactional with the business flow — if the caller's transaction rolls back, an
 *    already-committed notification survives. For a one-way informational record that is
 *    the correct side to err on, and "at most once per business event" still holds.
 * 4. **It does NOT own a pool, and its wait for a connection is bounded.** This service
 *    takes its connection from the application's SHARED `pg` pool (`src/payload.config.ts`)
 *    — the same pool the caller's transaction came from. So an emit performed while the
 *    caller still holds a connection needs a second one from that same pool. The
 *    acquisition wait is bounded by `POOL_ACQUISITION_TIMEOUT_MS` (5000 ms, configured as
 *    `connectionTimeoutMillis` in `src/payload.config.ts`); when the pool is saturated the
 *    local API fails with `timeout exceeded when trying to connect` after that bound, this
 *    service logs it as a skipped notification and returns `'failed'`, and the caller's
 *    write proceeds. Nothing is half-written: the failure happens before any statement runs.
 *
 *    That bound is the repository's own precedent for this failure class: the ticket reply
 *    path bounds its `SELECT ... FOR UPDATE` wait at 5000 ms
 *    (`src/collections/Tickets/hooks/enforceTicketInvariants.ts`, `TICKET_LOCK_WAIT_TIMEOUT`)
 *    after recording that an unbounded wait with N >= pool.max concurrent replies "ended up
 *    with every connection held by a transaction that was itself waiting, and the pool never
 *    recovered" (review finding F2). Do not remove the bound without replacing it: "never
 *    breaks the caller" must not be bought with an unbounded wait.
 */

import type { Payload, PayloadRequest } from 'payload'
import { isNotificationType, type NotificationType } from '@/collections/Notifications/types'

/**
 * The acquisition bound that is actually in effect, read off the live pool instead of being
 * restated here: `POOL_ACQUISITION_TIMEOUT_MS` in `src/payload.config.ts` configures it as
 * `connectionTimeoutMillis`. Importing that module from here would create a cycle (config →
 * Products → hooks → this service), and a copied literal could silently drift from the
 * configuration the failure came from — so the log reports the pool's own value, including
 * `unset` when the bound is missing.
 */
const configuredPoolBoundMs = (payload: Payload): number | 'unset' => {
  try {
    const value = (payload as any)?.db?.pool?.options?.connectionTimeoutMillis
    const parsed = Number(value)
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 'unset'
  } catch {
    return 'unset'
  }
}

/**
 * Shape of `req` a caller may pass. Accepted for call-site symmetry with the other
 * services (`payment.ts`, `purchase.ts`, …) that already thread a `req` around; it is
 * intentionally *not* forwarded to the local API — see point 3 in the module header.
 */
export type NotificationRequest = Partial<PayloadRequest> & { transactionID?: unknown }

export interface CreateNotificationParams {
  /** Recipient (user id, or a user-like object with an `id`). */
  recipient: number | string | { id: number | string }
  /** Business event kind (`PLAN.md` §13). */
  type: NotificationType
  /** Short, already-localised title shown in the inbox list. */
  title: string
  /** Notification body. */
  body: string
  /** Optional deep link the inbox row opens. */
  link?: null | string
  /**
   * Key identifying the *business event* (not the notification), e.g.
   * `payment-intent:123`. The same `(recipient, type, dedupeKey)` never yields two rows.
   */
  dedupeKey: string
  /** Caller's request. Accepted and deliberately ignored for the write itself. */
  req?: NotificationRequest | null
}

/**
 * `'created'`   → a new row was written.
 * `'existing'`  → this business event was already announced; nothing was written.
 * `'failed'`    → the notification could not be written and was logged; the caller's
 *                 business operation is unaffected and must proceed.
 */
export type CreateNotificationResult = 'created' | 'existing' | 'failed'

const COLLECTION = 'notifications'
const UNIQUE_INDEX_NAME = 'notifications_recipient_type_dedupe_key_unique_idx'

const log = (payload: Payload, level: 'error' | 'warn', msg: string, err?: unknown) => {
  try {
    const logger: any = (payload as any)?.logger
    if (!logger) return
    const fn = typeof logger[level] === 'function' ? logger[level] : logger.info
    fn.call(logger, err === undefined ? { msg } : { err, msg })
  } catch {
    // Logging must never be the reason a business flow fails.
  }
}

/**
 * `notifications.recipient` points at `users`, whose id is a serial (`number`). Accept the
 * shapes callers realistically hold — a number, a numeric string, or a user-like object —
 * and resolve them to the numeric id the collection expects.
 */
const normalizeUserId = (value: unknown): number | null => {
  if (value === null || value === undefined) return null

  if (typeof value === 'object') {
    return normalizeUserId((value as { id?: unknown }).id)
  }

  if (typeof value === 'number') {
    return Number.isSafeInteger(value) && value > 0 ? value : null
  }

  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (!/^\d+$/.test(trimmed)) return null
    const parsed = Number(trimmed)
    return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null
  }

  return null
}

/** Flatten the `error.cause` chain so a wrapped driver error is still recognisable. */
const errorChain = (error: unknown): any[] => {
  const chain: any[] = []
  let current: any = error

  for (let depth = 0; depth < 5 && current; depth += 1) {
    chain.push(current)
    current = current.cause
  }

  return chain
}

/**
 * Payload's Postgres adapter catches the driver's `23505` and re-shapes it into a
 * `ValidationError` whose `data.errors[].path` is the composite key
 * (`"recipient_id, type, dedupe_key"`), so the SQLSTATE is no longer visible on the outer
 * object. Recognise that shape before falling back to the driver-level checks.
 */
const isDuplicateValidationError = (node: any): boolean => {
  const errors = node?.data?.errors ?? node?.errors
  if (!Array.isArray(errors)) return false

  return errors.some(
    (entry: any) =>
      entry &&
      typeof entry === 'object' &&
      /unique/i.test(String(entry.message ?? '')) &&
      /dedupe_key/.test(String(entry.path ?? '')),
  )
}

/**
 * True only for the `notifications` dedupe collision. Matched on SQLSTATE `23505` first
 * (driver-independent), then on the index/constraint name, the Postgres message and the
 * Payload `ValidationError` shape. Every other error stays an error.
 */
export const isDuplicateNotificationError = (error: unknown): boolean =>
  errorChain(error).some((node) => {
    if (!node) return false

    const message = typeof node.message === 'string' ? node.message : ''
    const detail = typeof node.detail === 'string' ? node.detail : ''
    const constraint = typeof node.constraint === 'string' ? node.constraint : ''

    if (node.code === '23505') return true
    if (constraint === UNIQUE_INDEX_NAME) return true
    if (message.includes(UNIQUE_INDEX_NAME)) return true
    if (isDuplicateValidationError(node)) return true
    if (
      /duplicate key value violates unique constraint/i.test(message) &&
      /dedupe_key/i.test(`${detail} ${message}`)
    ) {
      return true
    }

    return false
  })

/**
 * True when the shared pool could not hand over a connection inside the configured bound
 * (`connectionTimeoutMillis`, `POOL_ACQUISITION_TIMEOUT_MS` in `src/payload.config.ts`).
 *
 * `pg-pool` raises `timeout exceeded when trying to connect` for a waiter that never got a
 * connection, and `pg` raises `Connection terminated due to connection timeout` when
 * establishing a new client times out, so both spellings are matched. This is the saturation
 * case: the caller's operation (or its peers) hold every connection, so the emit is skipped
 * rather than parked — the failure happens before any statement runs, hence nothing is
 * half-written.
 */
export const isPoolAcquisitionTimeoutError = (error: unknown): boolean =>
  errorChain(error).some((node) => {
    const message = typeof node?.message === 'string' ? node.message : ''
    return (
      message.includes('timeout exceeded when trying to connect') ||
      message.includes('Connection terminated due to connection timeout')
    )
  })

/**
 * Write the in-app notification for one business event.
 *
 * Never throws: the resolved value is the signal, and `'failed'` is safe to ignore.
 */
export async function createNotification(
  payload: Payload,
  params: CreateNotificationParams,
): Promise<CreateNotificationResult> {
  try {
    const { recipient, type, title, body, link, dedupeKey } = params ?? ({} as any)

    const recipientId = normalizeUserId(recipient)
    if (recipientId === null) {
      log(payload, 'error', 'createNotification: missing/invalid recipient — notification skipped')
      return 'failed'
    }

    if (!isNotificationType(type)) {
      log(
        payload,
        'error',
        `createNotification: unknown notification type "${String(type)}" — notification skipped`,
      )
      return 'failed'
    }

    const normalizedDedupeKey = typeof dedupeKey === 'string' ? dedupeKey.trim() : ''
    if (normalizedDedupeKey === '') {
      log(
        payload,
        'error',
        'createNotification: dedupeKey is required (it is what makes "at most one notification per business event" enforceable) — notification skipped',
      )
      return 'failed'
    }

    if (typeof title !== 'string' || title.trim() === '' || typeof body !== 'string' || body.trim() === '') {
      log(payload, 'error', 'createNotification: title/body missing — notification skipped')
      return 'failed'
    }

    // 1. Fast path — this exact business event was already announced by an earlier (or
    // concurrent) emit. This read is outside the caller's transaction as well: a read inside it
    // would see the same rows for every replay we care about, and every local-API call is a
    // `killTransaction` landmine (see the module header). It is not free of the shared pool — the
    // read draws a connection from it, bounded by `POOL_ACQUISITION_TIMEOUT_MS`.
    const existing = await payload.find({
      collection: COLLECTION,
      depth: 0,
      limit: 1,
      overrideAccess: true,
      where: {
        and: [
          { recipient: { equals: recipientId } },
          { type: { equals: type } },
          { dedupeKey: { equals: normalizedDedupeKey } },
        ],
      },
    })

    if (existing?.docs?.length) {
      return 'existing'
    }

    // 2. Insert without forwarding `req`: this write does not join the caller's transaction, and
    // it does not own a pool either — it draws a connection from the SHARED pool, waiting at most
    // `POOL_ACQUISITION_TIMEOUT_MS` before it is reported as skipped.
    try {
      await payload.create({
        collection: COLLECTION,
        data: {
          recipient: recipientId,
          type,
          title: title.trim(),
          body,
          link: link ?? null,
          readAt: null,
          dedupeKey: normalizedDedupeKey,
        },
        overrideAccess: true,
      })

      return 'created'
    } catch (error) {
      if (isDuplicateNotificationError(error)) {
        // A concurrent emitter won the race; the business event is still announced once.
        return 'existing'
      }

      if (isPoolAcquisitionTimeoutError(error)) {
        // Saturated shared pool: the write never started, so there is nothing half-written to
        // clean up, and the caller's business write must not wait any longer than the bound.
        log(
          payload,
          'warn',
          `createNotification: no connection from the shared pool within the configured bound (${configuredPoolBoundMs(payload)} ms) — notification skipped, caller unaffected`,
          error,
        )
        return 'failed'
      }

      log(payload, 'error', 'createNotification: insert failed — notification swallowed', error)
      return 'failed'
    }
  } catch (error) {
    // Belt and braces: nothing below may ever propagate into the calling business flow.
    if (isPoolAcquisitionTimeoutError(error)) {
      log(
        payload,
        'warn',
        `createNotification: no connection from the shared pool within the configured bound (${configuredPoolBoundMs(payload)} ms) — notification skipped, caller unaffected`,
        error,
      )
      return 'failed'
    }

    log(payload, 'error', 'createNotification: unexpected failure — notification swallowed', error)
    return 'failed'
  }
}
