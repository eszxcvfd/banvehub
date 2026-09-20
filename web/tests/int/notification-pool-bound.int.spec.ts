/**
 * F2 (review round 1, confirmed open in round 2): the notification emit must never leave a
 * business transaction waiting on the connection pool without bound.
 *
 * The shape: `createNotification` does not join the caller's transaction (decision 0011,
 * decision 4), but it also does not own a pool — it draws a second connection from the SAME
 * shared pool while the caller's operation may still hold one. The one emit site that runs
 * inside an open operation is the products verdict `afterChange` hook
 * (`collections/Products/hooks/announceModerationVerdict.ts`). With N >= `pool.max` such emits,
 * every connection is held by a transaction that is itself waiting for a connection, and with an
 * unbounded acquisition wait the pool never recovers — the failure this repository already
 * recorded for ticket replies (`collections/Tickets/hooks/enforceTicketInvariants.ts:52-59`).
 *
 * These probes MEASURE the behaviour instead of reasoning from the configuration: they take
 * connections until the pool refuses to hand one over, drive a real verdict update (and a real
 * service call), and assert that each is answered inside the configured bound with nothing
 * half-written.
 *
 * The connection-timeout behaviour they rely on is `pg-pool`'s: when the pool is full, `connect()`
 * queues the waiter and, only when `connectionTimeoutMillis` is set, arms a timer that removes it
 * with `Error('timeout exceeded when trying to connect')` (`pg-pool/index.js` — the branch that
 * pushes to `_pendingQueue` sits next to the `connectionTimeoutMillis` check). With no value
 * configured the wait is unbounded, which is exactly the state F2 describes: in that state this
 * spec's own afterAll could not get a connection and vitest killed the hook at its 10 s limit
 * ("Hook timed out in 10000ms").
 */

import {
  commitTransaction,
  getPayload,
  initTransaction,
  killTransaction,
  type Payload,
} from 'payload'
import * as payloadConfigModule from '@/payload.config'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { sql } from '@payloadcms/db-postgres'
import type { User } from '@/payload-types'
import { createNotification } from '@/services/notifications'

const config = payloadConfigModule.default
/** The bound the configuration is expected to declare (undefined before the repair lands). */
const DOCUMENTED_BOUND_MS = (payloadConfigModule as { POOL_ACQUISITION_TIMEOUT_MS?: number })
  .POOL_ACQUISITION_TIMEOUT_MS

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

type Held = { release: () => void }

describe('F2 — the notification emit cannot hold the pool open without bound', () => {
  let payload: Payload

  const runId = `notif-pool-${Date.now()}`
  const userIds: (number | string)[] = []
  const productIds: (number | string)[] = []
  let seq = 0
  const getSeq = () => ++seq

  let sentinel: User
  let seller: User
  let moderator: User
  let productId: number | string

  /** Connections this spec has taken out of the pool; released in each test's finally + afterAll. */
  const heldClients: Held[] = []
  /** Work that may still be in flight when a probe's guard fires; drained before cleanup. */
  const pendingWork: Promise<unknown>[] = []

  const pool = (): any => (payload.db as any)?.pool

  const poolMax = (): number => Number(pool()?.options?.max ?? 10)
  const configuredBoundMs = (): number => Number(pool()?.options?.connectionTimeoutMillis ?? 0)

  const releaseAll = (clients: Held[]) => {
    for (const client of clients) {
      try {
        client.release()
      } catch {
        // Already released (or the pool was closed); nothing to hand back.
      }
    }
  }

  /**
   * Take connections until the pool REFUSES to hand one over inside `probeMs`: an empirical
   * saturation proof rather than an arithmetic one. Counting is unreliable here — the Payload
   * adapter pins clients of its own at startup (`db-postgres/dist/connect.js` acquires and keeps
   * them), Payload frees transient connections mid-operation, and an abandoned probe acquisition
   * can still resolve late.
   *
   * Each attempt is one `pool.connect()` raced against a short timer: `acquired` means the pool
   * still had something to give, `queued`/`timeout` means it did not, which is the state the
   * measurement needs. An abandoned attempt that resolves late is tracked in `heldClients` and
   * released with the rest.
   */
  const saturatePool = async (probeMs = 400): Promise<Held[]> => {
    const mine: Held[] = []
    const max = poolMax()

    for (;;) {
      const attempt = pool()
        .connect()
        .then((client: Held) => {
          heldClients.push(client)
          return { kind: 'acquired' as const, client }
        })
        .catch(() => ({ kind: 'timeout' as const }))

      const raced = await Promise.race([
        attempt,
        sleep(probeMs).then(() => ({ kind: 'queued' as const })),
      ])

      if (raced.kind !== 'acquired') break
      mine.push(raced.client)
      if (mine.length > max + 4) break // safety valve; should never be reached
    }

    return mine
  }

  /**
   * Let work that resumed once connections were handed back finish, so the assertions (and the
   * cleanup) run against a quiet pool. Bounded on purpose: the drain must never become the hang
   * it exists to prevent.
   */
  const drainPendingWork = async (budgetMs = 5_000): Promise<void> => {
    let guard = 0
    while (pendingWork.length && guard < 4) {
      guard += 1
      const batch = pendingWork.splice(0, pendingWork.length)
      await Promise.race([Promise.allSettled(batch), sleep(budgetMs)])
    }
  }

  const rawSql = async <T = any,>(statement: any): Promise<T[]> => {
    const res: any = await (payload.db as any).drizzle.execute(statement)
    return ((res as any)?.rows ?? res) as T[]
  }

  const notificationCount = async (where: string): Promise<number> =>
    (await rawSql<{ n: number }>(`SELECT count(*)::int AS n FROM notifications WHERE ${where};`))[0]
      ?.n ?? -1

  /** A hang must fail the test, never stall the suite: every wait is raced against a guard. */
  const guardMs = (): number => {
    const bound = configuredBoundMs()
    return bound > 0 ? bound + 10_000 : 15_000
  }

  const createUser = async (label: string, roles: User['roles']): Promise<User> => {
    const user = (await payload.create({
      collection: 'users',
      data: {
        email: `${label}-${runId}-${getSeq()}@kientaohub.local`,
        password: 'test-password-notifications-123',
        name: label,
        roles,
      },
      overrideAccess: true,
    })) as User
    userIds.push(user.id)
    return user
  }

  beforeAll(async () => {
    payload = await getPayload({ config })

    // `ensureFirstUserIsAdmin` promotes the first user created while the table is empty; absorb it
    // with a throwaway sentinel, then assert the roles this probe depends on.
    sentinel = await createUser('sentinel-notif-pool', ['buyer'])
    seller = await createUser('seller-notif-pool', ['seller'])
    moderator = await createUser('mod-notif-pool', ['moderator'])
    expect(sentinel.roles).toEqual(['buyer'])
    expect(seller.roles).toEqual(['seller'])
    expect(moderator.roles).toEqual(['moderator'])

    const product = (await payload.create({
      collection: 'products',
      data: {
        title: `Sản phẩm notif-pool ${runId}`,
        slug: `notif-pool-${runId}`,
        price: 150000,
        isFree: false,
        seller: seller.id,
        copyrightDeclared: true,
        moderationStatus: 'draft',
        _status: 'draft',
      },
      overrideAccess: true,
    })) as { id: number | string }
    productId = product.id
    productIds.push(product.id)
  })

  // Explicit timeout: a pool left saturated by a failing probe must not turn cleanup into the hang
  // it is cleaning up after (vitest's 10 s hook limit did exactly that before the repair).
  afterAll(async () => {
    releaseAll(heldClients)
    await drainPendingWork()

    if (!payload) return

    const userFilter = userIds.length ? userIds.map((id) => Number(id)).join(',') : '0'
    const productFilter = productIds.map((id) => Number(id)).join(',') || '0'
    const keyFilters = productIds.length
      ? productIds.map((id) => `'product:${Number(id)}:%'`).join(',')
      : `'product:-1:%'`

    const sweeps = [
      `DELETE FROM notifications WHERE recipient_id IN (${userFilter});`,
      `DELETE FROM notifications WHERE dedupe_key LIKE ANY (ARRAY[${keyFilters}]);`,
      `DELETE FROM products WHERE id IN (${productFilter});`,
    ]
    for (const sweep of sweeps) {
      try {
        await rawSql(sweep)
      } catch {
        // Best-effort: the fixtures are identity-scoped, and nothing else depends on them.
      }
    }

    for (const id of userIds) {
      try {
        await rawSql(`DELETE FROM users WHERE id = ${Number(id)};`)
      } catch {
        // Blocked by a wallet/ledger row (BR-03) — expected for money fixtures, none here.
      }
    }
  }, 60_000)

  it('a verdict update inside a caller transaction, with every other connection held, settles in bounded time', async () => {
    const max = poolMax()
    const bound = configuredBoundMs()
    expect(
      max,
      'the probe needs at least two pool connections to leave a spare one',
    ).toBeGreaterThan(1)

    // The F2 position, reproduced deterministically: the business transaction already holds one
    // connection (here the caller owns it, exactly as the products `afterChange` hook runs inside
    // an open operation), and every other connection is taken. The update cannot sneak a second
    // connection — it runs on the caller's — so the ONLY thing that has to wait for the pool is
    // the notification emit.
    const txReq: any = { payload }
    let held: Held[] = []
    const started = Date.now()
    let outcome = 'unset'
    let elapsedMs = -1

    try {
      expect(await initTransaction(txReq)).toBe(true)
      held = await saturatePool()

      const work = payload
        .update({
          collection: 'products',
          id: productId,
          data: { moderationStatus: 'approved', moderationNotes: 'F2 probe' },
          overrideAccess: true,
          req: txReq,
          user: moderator,
        })
        .then((doc) => ({ kind: 'settled' as const, doc }))
        .catch((error) => ({ kind: 'error' as const, error }))
      pendingWork.push(work)

      const raced = await Promise.race([
        work,
        sleep(guardMs()).then(() => ({ kind: 'guard' as const })),
      ])

      elapsedMs = Date.now() - started
      outcome =
        raced.kind === 'settled'
          ? String((raced as { doc?: { moderationStatus?: string } }).doc?.moderationStatus)
          : raced.kind

      console.log(
        `[F2 probe A] pool.max=${max} saturated=${held.length} configuredBoundMs=${bound} guardMs=${guardMs()} outcome=${outcome} elapsedMs=${elapsedMs}`,
      )

      // Commit only a settled update: in the unbounded (red) state the operation is still parked,
      // and tearing its transaction down underneath it would corrupt the measurement.
      if (raced.kind === 'settled') await commitTransaction(txReq)
    } finally {
      releaseAll(held)
      await killTransaction(txReq)
      await drainPendingWork()
    }

    // 1. The business write is not left hanging — it completes inside the bound.
    expect(outcome, 'the verdict update must settle while the pool is saturated').toBe('approved')
    expect(elapsedMs).toBeLessThan(bound + 5_000)
    // The wait really happened (the emit had to queue) — otherwise this probe proves nothing.
    expect(elapsedMs).toBeGreaterThanOrEqual(Math.max(0, bound - 1_500))
    // 2. Nothing was half-written: the emit that could not get a connection wrote no notification…
    expect(await notificationCount(`dedupe_key = 'product:${Number(productId)}:approved'`)).toBe(0)
    // …and the verdict itself did land.
    const rows = await rawSql<{ moderation_status: string }>(
      sql`SELECT moderation_status FROM products WHERE id = ${Number(productId)};`,
    )
    expect(rows[0]?.moderation_status).toBe('approved')
    // 3. The bound is explicit configuration with the documented value, not an environment accident.
    expect(bound).toBeGreaterThan(0)
    expect(bound).toBe(DOCUMENTED_BOUND_MS)
  }, 60_000)

  it('createNotification reports "failed" inside the bound when every connection is taken', async () => {
    const max = poolMax()
    const bound = configuredBoundMs()
    // The service reports a saturated pool at `warn`; a regression that mislabels it as an
    // unexpected error would land on `error`, so both levels are watched.
    const warnSpy = vi.spyOn(payload.logger as any, 'warn')
    const errorSpy = vi.spyOn(payload.logger as any, 'error')

    const held: Held[] = []
    const started = Date.now()
    let result = 'unset'
    let elapsedMs = -1

    const work = createNotification(payload, {
      recipient: Number(seller.id),
      type: 'PRODUCT_APPROVED',
      title: 'F2 probe',
      body: 'F2 probe',
      dedupeKey: `product:${productId}:f2-probe`,
    }).then((outcome) => ({ kind: 'settled' as const, outcome }))
    pendingWork.push(work)

    try {
      // Every connection taken (empirically: the pool refused to hand one over): the notification
      // path cannot acquire one at all.
      held.push(...(await saturatePool()))

      const raced = await Promise.race([
        work,
        sleep(guardMs()).then(() => ({ kind: 'guard' as const })),
      ])

      elapsedMs = Date.now() - started
      result = raced.kind === 'settled' ? (raced as { outcome: string }).outcome : raced.kind

      console.log(
        `[F2 probe B] pool.max=${max} saturated=${held.length} configuredBoundMs=${bound} guardMs=${guardMs()} result=${result} elapsedMs=${elapsedMs}`,
      )
    } finally {
      releaseAll(held)
      await drainPendingWork()
    }

    const logged = [...warnSpy.mock.calls, ...errorSpy.mock.calls].map((call: any[]) => {
      const first = call?.[0]
      return typeof first === 'string' ? first : String(first?.msg ?? '')
    })
    warnSpy.mockRestore()
    errorSpy.mockRestore()

    // The service reports the outcome instead of throwing or hanging, and names the reason.
    expect(result, 'a saturated pool must be reported as a failed/skipped notification').toBe(
      'failed',
    )
    expect(elapsedMs).toBeLessThan(bound + 5_000)
    expect(
      logged.some((message) => /pool/i.test(message)),
      `expected a pool-related failure to be logged, got: ${JSON.stringify(logged)}`,
    ).toBe(true)
    // Nothing was written by the attempt that never acquired a connection.
    expect(await notificationCount(`dedupe_key = 'product:${Number(productId)}:f2-probe'`)).toBe(0)
  }, 60_000)

  it('a verdict update with every connection held is answered inside the bound instead of hanging', async () => {
    const max = poolMax()
    const bound = configuredBoundMs()

    const held: Held[] = []
    const started = Date.now()
    let raceKind = 'unset'
    let elapsedMs = -1

    const work = payload
      .update({
        collection: 'products',
        id: productId,
        data: { moderationStatus: 'rejected', moderationNotes: 'F2 probe C' },
        overrideAccess: true,
        user: moderator,
      })
      .then(() => ({ kind: 'resolved' as const }))
      .catch(() => ({ kind: 'rejected' as const }))
    pendingWork.push(work)

    try {
      held.push(...(await saturatePool()))

      const raced = await Promise.race([
        work,
        sleep(guardMs()).then(() => ({ kind: 'guard' as const })),
      ])

      elapsedMs = Date.now() - started
      raceKind = raced.kind

      console.log(
        `[F2 probe C] pool.max=${max} saturated=${held.length} configuredBoundMs=${bound} guardMs=${guardMs()} outcome=${raced.kind} elapsedMs=${elapsedMs}`,
      )
    } finally {
      releaseAll(held)
      await drainPendingWork()
    }

    // Bounded: the request is ANSWERED — with the write, or with a rejection when no connection
    // came free inside the bound. Which of the two happened is not the claim under test; an
    // unbounded wait would leave it unanswered entirely.
    expect(raceKind, 'the update must not be left waiting without bound').not.toBe('guard')
    expect(['rejected', 'resolved']).toContain(raceKind)
    expect(elapsedMs).toBeLessThan(bound + 5_000)
  }, 60_000)
})
