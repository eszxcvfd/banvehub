/**
 * In-app notification channel — data layer (`PLAN.md` §13 P0, §17:2291, §25 #21).
 *
 * Slice 1 proof: the `notifications` table/enum/indexes, the access rules, and
 * `createNotification` as the single write path (at-most-once per business event, never
 * breaking its caller, safe inside an open transaction).
 *
 * Every row this spec creates is tracked and removed in `afterAll` under `try/finally`
 * (identity based, plus a raw-SQL sweep of the `dedupe_key` prefix so rows inserted by
 * hand at the DB level cannot survive the run).
 */

import { commitTransaction, getPayload, initTransaction, killTransaction, type Payload } from 'payload'
import { sql } from '@payloadcms/db-postgres'
import config from '@/payload.config'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import type { Notification, User } from '@/payload-types'
import {
  createNotification,
  isDuplicateNotificationError,
} from '@/services/notifications'
import { NOTIFICATION_TYPES } from '@/collections/Notifications/types'

const DEDUPE_INDEX = 'notifications_recipient_type_dedupe_key_unique_idx'

/** Money path + moderation state that emitting a notification must never touch. */
const SIDE_EFFECT_FREE_TABLES = [
  'wallet_ledger',
  'wallets',
  'orders',
  'order_items',
  'entitlements',
  'download_events',
  'refunds',
  'seller_earnings',
  'withdrawals',
  'withdrawal_events',
  'moderation_cases',
]

describe('Notifications — in-app channel data layer (§13 / §17:2291)', () => {
  let payload: Payload

  const runId = `notif-${Date.now()}`
  const userIds: (number | string)[] = []
  const notificationIds: (number | string)[] = []

  let seq = 0
  const getSeq = () => ++seq
  const dedupeKey = (label: string) => `${runId}:${label}:${getSeq()}`

  let userA: User
  let userB: User
  let adminUser: User

  const rawSql = async <T = any,>(statement: any): Promise<T[]> => {
    const res: any = await (payload.db as any).drizzle.execute(statement)
    return ((res as any)?.rows ?? res) as T[]
  }

  const countAll = async (): Promise<Record<string, number>> => {
    const counts: Record<string, number> = {}
    for (const table of SIDE_EFFECT_FREE_TABLES) {
      const rows = await rawSql<{ n: number }>(sql.raw(`SELECT count(*)::int AS n FROM "${table}";`))
      counts[table] = rows[0]?.n ?? -1
    }
    return counts
  }

  const rowCountFor = async (key: string): Promise<number> => {
    const rows = await rawSql<{ n: number }>(
      sql`SELECT count(*)::int AS n FROM notifications WHERE dedupe_key = ${key};`,
    )
    return rows[0]?.n ?? -1
  }

  const idOf = (value: number | User | null | undefined): number | string | null => {
    if (value === null || value === undefined) return null
    return typeof value === 'object' ? value.id : value
  }

  const trackNotification = (doc: Notification): Notification => {
    notificationIds.push(doc.id)
    return doc
  }

  /**
   * Access denials surface as Payload `APIError`s, whose message is the translated
   * "You are not allowed to perform this action" — assert the HTTP status instead:
   * `403` when a Where policy hides the document from update/delete,
   * `404` (NotFound) when findByID does.
   */
  const expectAccessDenied = async (
    operation: Promise<unknown>,
    status: 403 | 404 = 403,
  ): Promise<void> => {
    let error: any = null
    try {
      await operation
    } catch (thrown) {
      error = thrown
    }

    expect(error, 'operation should have been rejected by access control').toBeTruthy()
    expect(error?.status).toBe(status)
  }

  const createUser = async (email: string, roles: User['roles']): Promise<User> => {
    const user = (await payload.create({
      collection: 'users',
      data: {
        email,
        password: 'test-password-notifications-123',
        name: email.split('@')[0],
        roles,
      },
      overrideAccess: true,
    })) as User
    userIds.push(user.id)
    return user
  }

  beforeAll(async () => {
    payload = await getPayload({ config })

    // `ensureFirstUserIsAdmin` appends 'admin' to whichever user is created first while the
    // users table is empty (a freshly migrated database). Create an explicit throwaway
    // sentinel first so the promotion lands on a row nothing asserts about, then assert the
    // roles this spec actually relies on (product-reports.int.spec.ts precedent).
    await createUser(`sentinel-notif-${runId}-${getSeq()}@kientaohub.local`, ['buyer'])

    userA = await createUser(`buyerA-${runId}-${getSeq()}@kientaohub.local`, ['buyer'])
    userB = await createUser(`buyerB-${runId}-${getSeq()}@kientaohub.local`, ['buyer'])
    adminUser = await createUser(`admin-${runId}-${getSeq()}@kientaohub.local`, ['admin'])

    expect(userA.roles).toEqual(['buyer'])
    expect(userB.roles).toEqual(['buyer'])
    expect(adminUser.roles).toEqual(['admin'])
  })

  afterAll(async () => {
    if (!payload) return

    try {
      // Notifications first (they reference the users below), including anything inserted
      // by raw SQL during the DB-level assertions.
      await rawSql(sql`DELETE FROM notifications WHERE dedupe_key LIKE ${`${runId}%`};`)
      if (notificationIds.length) {
        await rawSql(
          sql.raw(
            `DELETE FROM notifications WHERE id IN (${notificationIds
              .map((id) => Number(id))
              .join(',')});`,
          ),
        )
      }
    } catch {}

    try {
      if (userIds.length) {
        await rawSql(
          sql.raw(
            `DELETE FROM users WHERE id IN (${userIds.map((id) => Number(id)).join(',')});`,
          ),
        )
      }
    } catch {}
  })

  // ---------------------------------------------------------------------------
  // Schema: table, enum, indexes, foreign key (raw DB evidence)
  // ---------------------------------------------------------------------------
  describe('schema', () => {
    it('is registered in the Payload config under the §17 slug with the §13 field shape', async () => {
      const collection: any = (payload.collections as any).notifications
      expect(collection).toBeTruthy()
      expect(collection.config.slug).toBe('notifications')
      expect(collection.config.timestamps).toBe(true)

      const fields: any[] = collection.config.fields
      // Payload appends the system fields; the declared shape is what §13/§17 specifies.
      const declaredNames = fields
        .map((field) => field.name)
        .filter((name) => !['id', 'createdAt', 'updatedAt'].includes(name))
      expect(declaredNames).toEqual([
        'recipient',
        'type',
        'title',
        'body',
        'link',
        'readAt',
        'dedupeKey',
      ])

      const recipient = fields.find((field) => field.name === 'recipient')
      expect(recipient.type).toBe('relationship')
      expect(recipient.relationTo).toBe('users')
      expect(recipient.required).toBe(true)
      expect(recipient.index).toBe(true)

      const type = fields.find((field) => field.name === 'type')
      expect(type.type).toBe('select')
      expect(type.required).toBe(true)
      expect(type.options.map((option: any) => option.value)).toEqual([...NOTIFICATION_TYPES])

      const readAt = fields.find((field) => field.name === 'readAt')
      expect(readAt.type).toBe('date')
      expect(readAt.required ?? false).toBe(false)

      expect(fields.find((field) => field.name === 'dedupeKey').required).toBe(true)
      expect(fields.find((field) => field.name === 'link').required ?? false).toBe(false)
    })

    it('creates the notifications table with the §17 columns', async () => {
      const rows = await rawSql<{ column_name: string; is_nullable: string; data_type: string }>(
        sql`SELECT column_name, is_nullable, data_type
            FROM information_schema.columns
            WHERE table_schema = 'public' AND table_name = 'notifications'
            ORDER BY ordinal_position;`,
      )

      const columns = rows.map((row) => row.column_name)
      expect(columns).toEqual([
        'id',
        'recipient_id',
        'type',
        'title',
        'body',
        'link',
        'read_at',
        'dedupe_key',
        'updated_at',
        'created_at',
      ])

      const byName = Object.fromEntries(rows.map((row) => [row.column_name, row]))
      expect(byName.recipient_id.is_nullable).toBe('NO')
      expect(byName.type.is_nullable).toBe('NO')
      expect(byName.dedupe_key.is_nullable).toBe('NO')
      // `read_at` NULL is the "unread" state.
      expect(byName.read_at.is_nullable).toBe('YES')
      expect(byName.link.is_nullable).toBe('YES')
    })

    it('exposes exactly the 10 §13 in-app event types as the Postgres enum', async () => {
      const rows = await rawSql<{ enumlabel: string }>(
        sql`SELECT e.enumlabel
            FROM pg_type t
            JOIN pg_enum e ON e.enumtypid = t.oid
            WHERE t.typname = 'enum_notifications_type'
            ORDER BY e.enumsortorder;`,
      )

      expect(rows.map((row) => row.enumlabel)).toEqual([...NOTIFICATION_TYPES])
      expect(rows).toHaveLength(10)
    })

    it('enforces UNIQUE (recipient_id, type, dedupe_key) with an index on exactly those columns', async () => {
      const rows = await rawSql<{ indexdef: string }>(
        sql`SELECT indexdef FROM pg_indexes
            WHERE schemaname = 'public' AND tablename = 'notifications'
              AND indexname = ${DEDUPE_INDEX};`,
      )

      expect(rows).toHaveLength(1)
      const definition = rows[0].indexdef
      expect(definition).toMatch(/CREATE UNIQUE INDEX/i)
      expect(definition).toContain('recipient_id')
      expect(definition).toContain('type')
      expect(definition).toContain('dedupe_key')

      const singleColumnIndexes = await rawSql<{ indexdef: string }>(
        sql`SELECT indexdef FROM pg_indexes
            WHERE schemaname = 'public' AND tablename = 'notifications'
              AND indexdef LIKE '%recipient_id%'
              AND indexdef NOT LIKE '%dedupe_key%';`,
      )
      expect(singleColumnIndexes.length).toBeGreaterThanOrEqual(1)
    })

    it('links recipient to users with an ON DELETE CASCADE foreign key', async () => {
      const rows = await rawSql<{ conname: string; confdeltype: string; ref_table: string }>(
        sql`SELECT c.conname, c.confdeltype, cl.relname AS ref_table
            FROM pg_constraint c
            JOIN pg_class cl ON cl.oid = c.confrelid
            WHERE c.conrelid = 'public.notifications'::regclass AND c.contype = 'f';`,
      )

      const fk = rows.find((row) => row.conname === 'notifications_recipient_id_users_id_fk')
      expect(fk).toBeTruthy()
      expect(fk?.ref_table).toBe('users')
      // 'c' is pg_constraint's ON DELETE CASCADE.
      expect(fk?.confdeltype).toBe('c')
    })
  })

  // ---------------------------------------------------------------------------
  // Service: the single write path
  // ---------------------------------------------------------------------------
  describe('createNotification', () => {
    it('(a) writes exactly one row with the given payload and readAt = null', async () => {
      const key = dedupeKey('single')

      const result = await createNotification(payload, {
        recipient: userA.id,
        type: 'PAYMENT_SUCCESS',
        title: 'Nạp tiền thành công',
        body: 'Ví của bạn đã được cộng 100.000đ.',
        link: '/dashboard/wallet',
        dedupeKey: key,
      })

      expect(result).toBe('created')
      expect(await rowCountFor(key)).toBe(1)

      const found = await payload.find({
        collection: 'notifications',
        depth: 0,
        where: { dedupeKey: { equals: key } },
        overrideAccess: true,
      })

      expect(found.totalDocs).toBe(1)
      const doc = trackNotification(found.docs[0] as Notification)
      expect(idOf(doc.recipient)).toBe(userA.id)
      expect(doc.type).toBe('PAYMENT_SUCCESS')
      expect(doc.title).toBe('Nạp tiền thành công')
      expect(doc.body).toBe('Ví của bạn đã được cộng 100.000đ.')
      expect(doc.link).toBe('/dashboard/wallet')
      expect(doc.readAt ?? null).toBeNull()
    })

    it('(b) is a no-op on the second emit of the same business event (returns "existing", still one row)', async () => {
      const key = dedupeKey('replay')

      const first = await createNotification(payload, {
        recipient: userA.id,
        type: 'ORDER_SUCCESS',
        title: 'Đơn hàng hoàn tất',
        body: 'Bạn đã mua sản phẩm X.',
        dedupeKey: key,
      })
      expect(first).toBe('created')

      const second = await createNotification(payload, {
        recipient: userA.id,
        type: 'ORDER_SUCCESS',
        title: 'Đơn hàng hoàn tất',
        body: 'Bạn đã mua sản phẩm X.',
        dedupeKey: key,
      })
      expect(second).toBe('existing')

      const third = await createNotification(payload, {
        recipient: userA.id,
        type: 'ORDER_SUCCESS',
        title: 'Đơn hàng hoàn tất (lần 3)',
        body: 'Bạn đã mua sản phẩm X.',
        dedupeKey: key,
      })
      expect(third).toBe('existing')
      expect(await rowCountFor(key)).toBe(1)

      const found = await payload.find({
        collection: 'notifications',
        depth: 0,
        where: { dedupeKey: { equals: key } },
        overrideAccess: true,
      })
      trackNotification(found.docs[0] as Notification)
      // The first write wins: the replay never rewrites the delivered message.
      expect((found.docs[0] as Notification).title).toBe('Đơn hàng hoàn tất')
    })

    it('dedupes on the whole (recipient, type, dedupeKey) triple, not on the key alone', async () => {
      const sharedKey = dedupeKey('triple')

      expect(
        await createNotification(payload, {
          recipient: userA.id,
          type: 'PAYMENT_SUCCESS',
          title: 'A',
          body: 'A',
          dedupeKey: sharedKey,
        }),
      ).toBe('created')
      // Same key, different event kind → a different business event → its own row.
      expect(
        await createNotification(payload, {
          recipient: userA.id,
          type: 'PAYMENT_FAILED',
          title: 'B',
          body: 'B',
          dedupeKey: sharedKey,
        }),
      ).toBe('created')
      // Same key + same type, different recipient → also its own row.
      expect(
        await createNotification(payload, {
          recipient: userB.id,
          type: 'PAYMENT_SUCCESS',
          title: 'C',
          body: 'C',
          dedupeKey: sharedKey,
        }),
      ).toBe('created')

      expect(await rowCountFor(sharedKey)).toBe(3)
    })

    it('(c) leaves a raw duplicate INSERT to be rejected by the UNIQUE index at the DB layer', async () => {
      const key = dedupeKey('db-unique')

      expect(
        await createNotification(payload, {
          recipient: userA.id,
          type: 'REFUND',
          title: 'Hoàn tiền',
          body: 'Yêu cầu hoàn tiền đã được xử lý.',
          dedupeKey: key,
        }),
      ).toBe('created')

      let insertError: unknown = null
      try {
        await rawSql(
          sql`INSERT INTO notifications (recipient_id, type, title, body, dedupe_key)
              VALUES (${userA.id}, 'REFUND', 'dup', 'dup', ${key});`,
        )
      } catch (error) {
        insertError = error
      }

      expect(insertError).toBeTruthy()
      expect(isDuplicateNotificationError(insertError)).toBe(true)
      expect(await rowCountFor(key)).toBe(1)
    })

    it('never throws and never writes for invalid input', async () => {
      const unknownTypeKey = dedupeKey('invalid-type')
      const unknownType = await createNotification(payload, {
        recipient: userA.id,
        // Deliberately outside the §13 vocabulary.
        type: 'NOT_A_REAL_TYPE' as any,
        title: 'x',
        body: 'x',
        dedupeKey: unknownTypeKey,
      })
      expect(unknownType).toBe('failed')
      expect(await rowCountFor(unknownTypeKey)).toBe(0)

      const missingKeyResult = await createNotification(payload, {
        recipient: userA.id,
        type: 'PAYMENT_SUCCESS',
        title: 'x',
        body: 'x',
        dedupeKey: '   ',
      })
      expect(missingKeyResult).toBe('failed')

      const missingRecipient = await createNotification(payload, {
        recipient: '' as any,
        type: 'PAYMENT_SUCCESS',
        title: 'x',
        body: 'x',
        dedupeKey: dedupeKey('invalid-recipient'),
      })
      expect(missingRecipient).toBe('failed')

      const missingTitle = await createNotification(payload, {
        recipient: userA.id,
        type: 'PAYMENT_SUCCESS',
        title: '',
        body: 'x',
        dedupeKey: dedupeKey('invalid-title'),
      })
      expect(missingTitle).toBe('failed')

      // Unknown recipient id → FK violation → swallowed, no throw, nothing written.
      const ghostRecipientKey = dedupeKey('ghost-recipient')
      const ghost = await createNotification(payload, {
        recipient: 2_147_483_600,
        type: 'PAYMENT_SUCCESS',
        title: 'x',
        body: 'x',
        dedupeKey: ghostRecipientKey,
      })
      expect(ghost).toBe('failed')
      expect(await rowCountFor(ghostRecipientKey)).toBe(0)
    })

    it('emitting notifications leaves every money-path and moderation table untouched', async () => {
      const before = await countAll()

      const key = dedupeKey('side-effect-free')
      expect(
        await createNotification(payload, {
          recipient: userA.id,
          type: 'EARNINGS_AVAILABLE',
          title: 'Doanh thu khả dụng',
          body: 'Bạn có thể rút 500.000đ.',
          dedupeKey: key,
        }),
      ).toBe('created')
      expect(
        await createNotification(payload, {
          recipient: userA.id,
          type: 'EARNINGS_AVAILABLE',
          title: 'Doanh thu khả dụng',
          body: 'Bạn có thể rút 500.000đ.',
          dedupeKey: key,
        }),
      ).toBe('existing')

      expect(await countAll()).toEqual(before)
    })
  })

  // ---------------------------------------------------------------------------
  // Access rules — one test per rule
  // ---------------------------------------------------------------------------
  describe('access rules', () => {
    let rowForA: Notification
    let rowForB: Notification

    beforeAll(async () => {
      const keyA = dedupeKey('access-a')
      const keyB = dedupeKey('access-b')

      await createNotification(payload, {
        recipient: userA.id,
        type: 'PRODUCT_APPROVED',
        title: `A-only ${runId}`,
        body: 'row for A',
        dedupeKey: keyA,
      })
      await createNotification(payload, {
        recipient: userB.id,
        type: 'PRODUCT_REJECTED',
        title: `B-only ${runId}`,
        body: 'row for B',
        dedupeKey: keyB,
      })

      const a = await payload.find({
        collection: 'notifications',
        depth: 0,
        where: { dedupeKey: { equals: keyA } },
        overrideAccess: true,
      })
      const b = await payload.find({
        collection: 'notifications',
        depth: 0,
        where: { dedupeKey: { equals: keyB } },
        overrideAccess: true,
      })
      rowForA = trackNotification(a.docs[0] as Notification)
      rowForB = trackNotification(b.docs[0] as Notification)
    })

    it('(d) user A only reads their own rows through the collection API', async () => {
      const asA = await payload.find({
        collection: 'notifications',
        depth: 0,
        limit: 100,
        overrideAccess: false,
        user: userA as any,
        where: { dedupeKey: { in: [rowForA.dedupeKey, rowForB.dedupeKey] } },
      })

      const returnedIds = asA.docs.map((doc) => (doc as Notification).id)
      expect(returnedIds).toContain(rowForA.id)
      expect(returnedIds).not.toContain(rowForB.id)
      expect(asA.docs.every((doc) => idOf((doc as Notification).recipient) === userA.id)).toBe(true)

      const asB = await payload.find({
        collection: 'notifications',
        depth: 0,
        limit: 100,
        overrideAccess: false,
        user: userB as any,
        where: { dedupeKey: { in: [rowForA.dedupeKey, rowForB.dedupeKey] } },
      })
      const bIds = asB.docs.map((doc) => (doc as Notification).id)
      expect(bIds).toContain(rowForB.id)
      expect(bIds).not.toContain(rowForA.id)

      // The rows really exist; only the access layer hides them.
      const asSystem = await payload.find({
        collection: 'notifications',
        depth: 0,
        limit: 100,
        overrideAccess: true,
        where: { dedupeKey: { in: [rowForA.dedupeKey, rowForB.dedupeKey] } },
      })
      expect(asSystem.docs).toHaveLength(2)

      // Deliberate choice, pinned here: the inbox is own-rows-only for EVERY principal,
      // admin included. No moderation or finance workflow needs to read somebody else's
      // notifications, so Admin gets no read-all exception (see access.ts). Delete stays
      // Admin-only, which is why the admin panel can still clean up by id.
      const asAdmin = await payload.find({
        collection: 'notifications',
        depth: 0,
        limit: 100,
        overrideAccess: false,
        user: adminUser as any,
        where: { dedupeKey: { in: [rowForA.dedupeKey, rowForB.dedupeKey] } },
      })
      expect(asAdmin.docs).toHaveLength(0)

      // findByID obeys the same Where policy: B's row is invisible (NotFound) to A.
      await expectAccessDenied(
        payload.findByID({
          collection: 'notifications',
          id: rowForB.id,
          overrideAccess: false,
          user: userA as any,
        }),
        404,
      )
    })

    it('denies anonymous reads', async () => {
      await expectAccessDenied(
        payload.find({
          collection: 'notifications',
          overrideAccess: false,
        }),
      )

      await expectAccessDenied(
        payload.find({
          collection: 'notifications',
          overrideAccess: false,
          user: null as any,
        }),
      )
    })

    it('denies create through the collection API, even for an admin', async () => {
      const data = {
        recipient: userA.id,
        type: 'PAYMENT_SUCCESS' as const,
        title: 'forged',
        body: 'forged',
        dedupeKey: dedupeKey('forged'),
      }

      await expectAccessDenied(
        payload.create({ collection: 'notifications', data, overrideAccess: false }),
      )

      await expectAccessDenied(
        payload.create({
          collection: 'notifications',
          data,
          overrideAccess: false,
          user: userA as any,
        }),
      )

      await expectAccessDenied(
        payload.create({
          collection: 'notifications',
          data,
          overrideAccess: false,
          user: adminUser as any,
        }),
      )

      expect(await rowCountFor(data.dedupeKey)).toBe(0)
    })

    it('lets the recipient update readAt and nothing else', async () => {
      const readAt = new Date().toISOString()

      const updated = (await payload.update({
        collection: 'notifications',
        id: rowForA.id,
        data: {
          readAt,
          // Every one of these must be stripped by field access.
          title: 'rewritten title',
          body: 'rewritten body',
          link: '/rewritten',
          type: 'REFUND',
          dedupeKey: 'rewritten-key',
          recipient: userB.id,
        } as any,
        overrideAccess: false,
        user: userA as any,
      })) as Notification

      expect(new Date(updated.readAt as string).toISOString()).toBe(readAt)
      expect(updated.title).toBe(rowForA.title)
      expect(updated.body).toBe(rowForA.body)
      expect(updated.link ?? null).toBe(rowForA.link ?? null)
      expect(updated.type).toBe(rowForA.type)
      expect(updated.dedupeKey).toBe(rowForA.dedupeKey)
      expect(idOf(updated.recipient)).toBe(userA.id)

      // The stripped values are not in the table either.
      const raw = await rawSql<{ title: string; type: string; dedupe_key: string }>(
        sql`SELECT title, type, dedupe_key FROM notifications WHERE id = ${rowForA.id};`,
      )
      expect(raw[0].title).toBe(rowForA.title)
      expect(raw[0].type).toBe(rowForA.type)
      expect(raw[0].dedupe_key).toBe(rowForA.dedupeKey)
    })

    it('denies updating somebody else’s notification', async () => {
      await expectAccessDenied(
        payload.update({
          collection: 'notifications',
          id: rowForB.id,
          data: { readAt: new Date().toISOString() } as any,
          overrideAccess: false,
          user: userA as any,
        }),
      )

      const raw = await rawSql<{ read_at: string | null }>(
        sql`SELECT read_at FROM notifications WHERE id = ${rowForB.id};`,
      )
      expect(raw[0].read_at).toBeNull()
    })

    it('denies delete for the recipient and allows it for an admin', async () => {
      await expectAccessDenied(
        payload.delete({
          collection: 'notifications',
          id: rowForA.id,
          overrideAccess: false,
          user: userA as any,
        }),
      )

      expect(await rowCountFor(rowForA.dedupeKey)).toBe(1)

      // Admin cleanup: delete an admin-addressed throwaway row.
      const adminKey = dedupeKey('admin-delete')
      await createNotification(payload, {
        recipient: adminUser.id,
        type: 'TICKET_REPLY',
        title: 'admin row',
        body: 'admin row',
        dedupeKey: adminKey,
      })
      const found = await payload.find({
        collection: 'notifications',
        depth: 0,
        where: { dedupeKey: { equals: adminKey } },
        overrideAccess: true,
      })
      const adminRow = trackNotification(found.docs[0] as Notification)

      await payload.delete({
        collection: 'notifications',
        id: adminRow.id,
        overrideAccess: false,
        user: adminUser as any,
      })
      expect(await rowCountFor(adminKey)).toBe(0)
    })
  })

  // ---------------------------------------------------------------------------
  // Transaction safety
  // ---------------------------------------------------------------------------
  describe('inside a caller transaction', () => {
    const createUserInTransaction = async (req: any, label: string): Promise<User> => {
      const user = (await payload.create({
        collection: 'users',
        data: {
          email: `${label}-${runId}-${getSeq()}@kientaohub.local`,
          password: 'test-password-notifications-123',
          name: label,
          roles: ['buyer'],
        },
        overrideAccess: true,
        req,
      })) as User
      userIds.push(user.id)
      return user
    }

    const userRowExists = async (id: number | string): Promise<boolean> => {
      const rows = await rawSql<{ n: number }>(
        sql`SELECT count(*)::int AS n FROM users WHERE id = ${id};`,
      )
      return (rows[0]?.n ?? 0) > 0
    }

    it('leaves an open caller transaction alive and writable while deduping in-flight', async () => {
      const key = dedupeKey('tx-commit')
      const txReq: any = { payload }
      expect(await initTransaction(txReq)).toBe(true)
      const transactionIdBefore = txReq.transactionID
      expect(transactionIdBefore).toBeTruthy()

      let beforeMarker: User | null = null
      let afterMarker: User | null = null

      try {
        // Caller write BEFORE the notification must survive: a notification that joins and
        // then kills the transaction would take this row down with it.
        beforeMarker = await createUserInTransaction(txReq, 'tx-before')

        expect(
          await createNotification(payload, {
            recipient: userA.id,
            type: 'SELLER_SALE',
            title: 'Bạn có đơn mới',
            body: 'Sản phẩm Y vừa được bán.',
            dedupeKey: key,
            req: txReq,
          }),
        ).toBe('created')

        // Second emit of the same business event, still inside the open transaction.
        expect(
          await createNotification(payload, {
            recipient: userA.id,
            type: 'SELLER_SALE',
            title: 'Bạn có đơn mới',
            body: 'Sản phẩm Y vừa được bán.',
            dedupeKey: key,
            req: txReq,
          }),
        ).toBe('existing')

        // The caller still owns the very same transaction: `payload.create` never reached
        // `killTransaction` for it (that is exactly what passing `req` would have risked).
        expect(txReq.transactionID).toBe(transactionIdBefore)

        afterMarker = await createUserInTransaction(txReq, 'tx-after')
        await commitTransaction(txReq)
      } finally {
        await killTransaction(txReq)
      }

      expect(await rowCountFor(key)).toBe(1)

      // Both caller writes committed → the transaction was neither killed nor rolled back.
      for (const marker of [beforeMarker!, afterMarker!]) {
        expect(await userRowExists(marker.id)).toBe(true)
      }
    })

    it('absorbs a concurrent UNIQUE collision without poisoning the caller transaction', async () => {
      const key = dedupeKey('tx-race')

      // Seed the row outside the transaction, so the emit below cannot be served by the
      // service's pre-check once the pre-check is forced to miss.
      expect(
        await createNotification(payload, {
          recipient: userA.id,
          type: 'TICKET_REPLY',
          title: 'Phản hồi',
          body: 'Nhân viên đã trả lời.',
          dedupeKey: key,
        }),
      ).toBe('created')

      const txReq: any = { payload }
      expect(await initTransaction(txReq)).toBe(true)
      const transactionIdBefore = txReq.transactionID

      // Hide the existing row from the service's pre-check so the INSERT really hits the
      // UNIQUE index — the concurrent-emitter race BR-02 has to survive.
      const originalFind = payload.find.bind(payload)
      const findSpy = vi.spyOn(payload, 'find').mockImplementation((async (options: any) => {
        if (options?.collection === 'notifications') {
          return { docs: [], hasNextPage: false, totalDocs: 0 } as any
        }
        return originalFind(options)
      }) as any)

      let result = 'unset'
      let beforeMarker: User | null = null
      let afterMarker: User | null = null
      try {
        beforeMarker = await createUserInTransaction(txReq, 'tx-race-before')

        result = await createNotification(payload, {
          recipient: userA.id,
          type: 'TICKET_REPLY',
          title: 'Phản hồi',
          body: 'Nhân viên đã trả lời.',
          dedupeKey: key,
          req: txReq,
        })

        // Payload's createOperation calls `killTransaction(req)` on ANY error; that would
        // have rejected this transaction and wiped the caller's writes.
        expect(txReq.transactionID).toBe(transactionIdBefore)

        afterMarker = await createUserInTransaction(txReq, 'tx-race-after')
        await commitTransaction(txReq)
      } finally {
        findSpy.mockRestore()
        await killTransaction(txReq)
      }

      expect(result).toBe('existing')
      expect(await rowCountFor(key)).toBe(1)

      for (const marker of [beforeMarker!, afterMarker!]) {
        expect(await userRowExists(marker.id)).toBe(true)
      }
    })

    it('is not transactional with the caller: the notification outlives a rolled-back business transaction', async () => {
      const key = dedupeKey('tx-rollback')
      const txReq: any = { payload }
      expect(await initTransaction(txReq)).toBe(true)

      let marker: User | null = null
      try {
        expect(
          await createNotification(payload, {
            recipient: userA.id,
            type: 'WITHDRAWAL_STATUS',
            title: 'Yêu cầu rút tiền',
            body: 'Đang chờ duyệt.',
            dedupeKey: key,
            req: txReq,
          }),
        ).toBe('created')

        marker = await createUserInTransaction(txReq, 'tx-rollback-marker')
      } finally {
        await killTransaction(txReq)
      }

      // Documented trade-off (see the service header): the caller's write is gone, the
      // one-way notification record is not. At-most-once still holds.
      expect(await userRowExists(marker!.id)).toBe(false)
      expect(await rowCountFor(key)).toBe(1)
    })

    it('still works when the caller passes no request at all', async () => {
      const key = dedupeKey('no-req')
      expect(
        await createNotification(payload, {
          recipient: userA.id,
          type: 'PAYMENT_FAILED',
          title: 'Thanh toán thất bại',
          body: 'Giao dịch không thành công.',
          dedupeKey: key,
        }),
      ).toBe('created')
      expect(
        await createNotification(payload, {
          recipient: userA.id,
          type: 'PAYMENT_FAILED',
          title: 'Thanh toán thất bại',
          body: 'Giao dịch không thành công.',
          dedupeKey: key,
        }),
      ).toBe('existing')
      expect(await rowCountFor(key)).toBe(1)
    })
  })
})
