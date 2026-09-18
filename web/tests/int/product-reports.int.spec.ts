import { getPayload, type Payload } from 'payload'
import config from '@/payload.config'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import React from 'react'
import { cleanup as rtlCleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { Product, User } from '@/payload-types'
import { POST } from '@/app/api/v1/products/[id]/reports/route'
import {
  MODERATION_CASE_REASON_OPTIONS,
  MODERATION_CASE_REASONS,
} from '@/collections/ModerationCases/reasons'
import { storefrontProductWhere } from '@/utilities/storefrontVisibility'

// ---------------------------------------------------------------------------
// The storefront entry point (FR-22) is a client component: mock its collaborators so
// it can be rendered in jsdom next to the API/DB assertions below. JSX is avoided in
// this file on purpose — it must stay a `.ts` spec to match the `test:int` include glob.
// ---------------------------------------------------------------------------
const { mockToast, mockUseAuth } = vi.hoisted(() => ({
  mockToast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
  mockUseAuth: vi.fn(),
}))

vi.mock('sonner', () => ({ toast: mockToast }))
vi.mock('@/providers/Auth', () => ({ useAuth: () => mockUseAuth() }))
vi.mock('next/navigation', () => ({
  usePathname: () => '/products/fr22-report-main',
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}))

import { ProductReportDialog } from '@/components/product/ProductReportDialog'

const originalFetch = global.fetch

const renderReportDialog = (productId: number, productTitle: string) =>
  render(React.createElement(ProductReportDialog, { productId, productTitle }))

/**
 * FR-22 integration proof: `POST /api/v1/products/[id]/reports` → exactly one
 * `moderation_cases` row, no product state change, 409 on a duplicate open report, and
 * the DB-level partial unique index behind that 409.
 *
 * Every row this spec creates is tracked and removed in `afterAll` (identity-based,
 * plus a raw-SQL sweep that also covers the rows inserted by hand in the DB-level tests).
 */
describe('Product reports → moderation cases (FR-22)', () => {
  let payload: Payload

  // Fixture identities — also the cleanup keys.
  const userIds: (number | string)[] = []
  const productIds: (number | string)[] = []
  const caseIds: (number | string)[] = []

  let bootstrapUser: User
  let reporter1: User
  let reporter2: User
  let moderatorUser: User
  let adminUser: User
  let sellerUser: User

  let mainProduct: Product
  let rbacProduct: Product
  let sqlProduct: Product

  // Raw catalog state captured before any report exists (criterion 4).
  let mainProductStateBefore: { moderation_status: string; _status: string; updated_at: string }
  let storefrontVisibleBefore = 0
  let moneyPathCountsBefore: Record<string, number> = {}

  let seq = 0
  const getSeq = () => ++seq

  // Auth harness: the route reads the acting user from `payload.auth`, so one persistent
  // mock implementation selects the user for each request.
  let currentUser: User | null = null
  let authSpy: ReturnType<typeof vi.spyOn> | null = null
  const actAs = (user: User | null) => {
    currentUser = user
  }

  const rawSql = async <T = any,>(query: string): Promise<T[]> => {
    const res: any = await payload.db.drizzle.execute(query)
    return ((res as any).rows || res) as T[]
  }

  const countCases = async (where: string): Promise<number> => {
    const rows = await rawSql<{ n: number }>(
      `SELECT count(*)::int AS n FROM moderation_cases WHERE ${where};`,
    )
    return rows[0]?.n ?? -1
  }

  const errorText = (error: any): string =>
    [
      error?.message,
      error?.cause?.message,
      error?.cause?.detail,
      error?.cause?.cause?.message,
      error?.detail,
    ]
      .filter(Boolean)
      .join(' | ')

  const MONEY_PATH_TABLES = [
    'wallet_ledger',
    'orders',
    'order_items',
    'entitlements',
    'refunds',
    'seller_earnings',
    'withdrawals',
  ]

  const moneyPathCounts = async (): Promise<Record<string, number>> => {
    const counts: Record<string, number> = {}
    for (const table of MONEY_PATH_TABLES) {
      const rows = await rawSql<{ n: number }>(`SELECT count(*)::int AS n FROM "${table}";`)
      counts[table] = rows[0]?.n ?? -1
    }
    return counts
  }

  const makeContext = (id: string | number) => ({
    params: Promise.resolve({ id: String(id) }),
  })

  const reportRequest = (productId: string | number, body: any, raw = false) =>
    new Request(`http://localhost:3000/api/v1/products/${productId}/reports`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: raw ? body : JSON.stringify(body),
    })

  const createUser = async (email: string, roles: User['roles']): Promise<User> => {
    const user = (await payload.create({
      collection: 'users',
      data: {
        email,
        password: 'test-password-fr22-123',
        name: email.split('@')[0],
        roles,
      },
      overrideAccess: true,
    })) as User
    userIds.push(user.id)
    return user
  }

  const createProduct = async (slug: string, title: string): Promise<Product> => {
    const product = (await payload.create({
      collection: 'products',
      data: {
        title,
        slug,
        price: 150000,
        seller: sellerUser.id,
        copyrightDeclared: true,
        moderationStatus: 'approved',
        _status: 'published',
      },
      overrideAccess: true,
    })) as Product
    productIds.push(product.id)
    return product
  }

  /** Raw DB state of a product row — the authority for "a report changed nothing". */
  const productRowState = async (id: number | string) => {
    const rows = await rawSql<{ moderation_status: string; _status: string; updated_at: string }>(
      `SELECT moderation_status, _status, updated_at FROM products WHERE id = ${id};`,
    )
    const row = rows[0]
    return {
      moderation_status: row.moderation_status,
      _status: row._status,
      updated_at: new Date(row.updated_at as any).toISOString(),
    }
  }

  /** Exactly the storefront product-detail query (`draft = false`). */
  /**
   * The storefront product-detail query, built from the SAME visibility module the page
   * and the report route use (`@/utilities/storefrontVisibility`) so this spec never
   * carries a private copy of the rule.
   */
  const storefrontQuery = async (slug: string) => {
    const res = await payload.find({
      collection: 'products',
      depth: 0,
      draft: false,
      limit: 1,
      overrideAccess: false,
      pagination: false,
      where: storefrontProductWhere({ slug }),
    })
    return res.totalDocs
  }

  beforeAll(async () => {
    payload = await getPayload({ config })

    authSpy = vi.spyOn(payload, 'auth').mockImplementation(
      async () => ({ user: currentUser }) as any,
    )

    const timestamp = Date.now()

    // `ensureFirstUserIsAdmin` appends 'admin' to the FIRST user created while the users
    // table is empty (the CI state: only migrations ran and every spec cleans up after
    // itself). Absorb that promotion with a throwaway fixture so the role assertions
    // below describe real roles instead of the bootstrap side effect.
    bootstrapUser = await createUser(
      `bootstrap-fr22-${timestamp}-${getSeq()}@kientaohub.local`,
      ['buyer'],
    )

    sellerUser = await createUser(`seller-fr22-${timestamp}-${getSeq()}@kientaohub.local`, ['seller'])
    reporter1 = await createUser(`buyer1-fr22-${timestamp}-${getSeq()}@kientaohub.local`, ['buyer'])
    reporter2 = await createUser(`buyer2-fr22-${timestamp}-${getSeq()}@kientaohub.local`, ['buyer'])
    moderatorUser = await createUser(`mod-fr22-${timestamp}-${getSeq()}@kientaohub.local`, [
      'moderator',
    ])
    adminUser = await createUser(`admin-fr22-${timestamp}-${getSeq()}@kientaohub.local`, ['admin'])

    expect(bootstrapUser.roles).toEqual(['buyer'])
    expect(sellerUser.roles).toEqual(['seller'])
    expect(reporter1.roles).toEqual(['buyer'])
    expect(reporter2.roles).toEqual(['buyer'])
    expect(moderatorUser.roles).toEqual(['moderator'])
    expect(adminUser.roles).toEqual(['admin'])

    mainProduct = await createProduct(`fr22-report-main-${timestamp}`, 'FR-22 Report Main Product')
    rbacProduct = await createProduct(`fr22-report-rbac-${timestamp}`, 'FR-22 Report RBAC Product')
    sqlProduct = await createProduct(`fr22-report-sql-${timestamp}`, 'FR-22 Report SQL Product')

    mainProductStateBefore = await productRowState(mainProduct.id)
    storefrontVisibleBefore = await storefrontQuery(mainProduct.slug as string)
    moneyPathCountsBefore = await moneyPathCounts()
  })

  afterEach(() => {
    rtlCleanup()
    global.fetch = originalFetch
  })

  afterAll(async () => {
    try {
      if (payload) {
        // Cases first (they reference the products/users below), then the catalog. The
        // reporter/product sweep also removes rows inserted by raw SQL in the DB-level
        // tests, so nothing this spec wrote can survive the run.
        try {
          const reporterFilter = userIds.length ? `reporter_id IN (${userIds.join(',')})` : 'false'
          const productFilter = productIds.length ? `product_id IN (${productIds.join(',')})` : 'false'
          await rawSql(`DELETE FROM moderation_cases WHERE ${reporterFilter} OR ${productFilter};`)
        } catch {}

        for (const id of caseIds) {
          try {
            await payload.delete({ collection: 'moderation_cases', id, overrideAccess: true })
          } catch {}
        }
        for (const id of productIds) {
          try {
            await payload.delete({ collection: 'products', id, overrideAccess: true })
          } catch {}
        }
        for (const id of userIds) {
          try {
            await payload.delete({ collection: 'users', id, overrideAccess: true })
          } catch {}
        }
      }
    } finally {
      authSpy?.mockRestore?.()
      actAs(null)
    }
  })

  // -------------------------------------------------------------------------
  // Criterion 1 — a valid report creates exactly one moderation case
  // -------------------------------------------------------------------------
  describe('Criterion 1: POST /api/v1/products/[idOrSlug]/reports creates exactly one case', () => {
    it('creates one moderation_cases row with product, reporter, reason, description, status=OPEN', async () => {
      expect(await countCases(`reporter_id = ${reporter1.id} AND product_id = ${mainProduct.id}`)).toBe(0)

      actAs(reporter1)
      const res = await POST(
        reportRequest(mainProduct.id, {
          reason: 'SPAM',
          description: 'Bản vẽ bị spam quảng cáo trùng lặp',
        }),
        makeContext(mainProduct.id),
      )

      expect(res.status).toBe(201)
      const body = await res.json()
      expect(body.success).toBe(true)
      expect(body.case.productId).toBe(mainProduct.id)
      expect(body.case.reporterId).toBe(reporter1.id)
      expect(body.case.reason).toBe('SPAM')
      expect(body.case.description).toBe('Bản vẽ bị spam quảng cáo trùng lặp')
      expect(body.case.status).toBe('OPEN')
      expect(body.case.id).toBeDefined()
      caseIds.push(body.case.id)

      // Exactly ONE row, and its persisted values match the contract.
      expect(await countCases(`reporter_id = ${reporter1.id} AND product_id = ${mainProduct.id}`)).toBe(1)
      const rows = await rawSql<any>(
        `SELECT product_id, reporter_id, reason, description, status, resolution_notes
         FROM moderation_cases WHERE id = ${body.case.id};`,
      )
      expect(rows).toHaveLength(1)
      expect(rows[0].product_id).toBe(mainProduct.id)
      expect(rows[0].reporter_id).toBe(reporter1.id)
      expect(rows[0].reason).toBe('SPAM')
      expect(rows[0].description).toBe('Bản vẽ bị spam quảng cáo trùng lặp')
      expect(rows[0].status).toBe('OPEN')
      expect(rows[0].resolution_notes).toBeNull()

      // The response carries the caller's own case only: ids and scalars, no user
      // objects, no other reporter, no credential material.
      const serialized = JSON.stringify(body)
      expect(serialized).not.toContain(reporter2.email)
      expect(serialized).not.toContain(moderatorUser.email)
      expect(serialized).not.toContain('password')
      expect(Object.keys(body.case).sort()).toEqual(
        [
          'createdAt',
          'description',
          'id',
          'productId',
          'reason',
          'reporterId',
          'resolutionNotes',
          'resolvedAt',
          'status',
          'updatedAt',
        ].sort(),
      )
    })

    it('resolves the product by slug as well as by numeric id', async () => {
      const slugReporter = await createUser(
        `slugreporter-fr22-${Date.now()}-${getSeq()}@kientaohub.local`,
        ['buyer'],
      )
      actAs(slugReporter)

      const res = await POST(
        reportRequest(mainProduct.slug as string, { reason: 'OTHER' }),
        makeContext(mainProduct.slug as string),
      )

      expect(res.status).toBe(201)
      const body = await res.json()
      expect(body.case.productId).toBe(mainProduct.id)
      expect(body.case.reporterId).toBe(slugReporter.id)
      expect(body.case.description).toBeNull()
      caseIds.push(body.case.id)

      expect(
        await countCases(`reporter_id = ${slugReporter.id} AND product_id = ${mainProduct.id}`),
      ).toBe(1)
    })

    it('ignores forged attribution in the body: reporter/product/status come from session + URL', async () => {
      const forger = await createUser(
        `forger-fr22-${Date.now()}-${getSeq()}@kientaohub.local`,
        ['buyer'],
      )
      actAs(forger)

      const res = await POST(
        reportRequest(mainProduct.id, {
          reason: 'SPAM',
          reporter: reporter2.id,
          reporterId: reporter2.id,
          product: rbacProduct.id,
          productId: rbacProduct.id,
          status: 'RESOLVED',
        }),
        makeContext(mainProduct.id),
      )

      expect(res.status).toBe(201)
      const body = await res.json()
      expect(body.case.reporterId).toBe(forger.id)
      expect(body.case.productId).toBe(mainProduct.id)
      expect(body.case.status).toBe('OPEN')
      caseIds.push(body.case.id)

      // Nothing landed on the forged targets.
      expect(await countCases(`reporter_id = ${reporter2.id}`)).toBe(0)
      expect(await countCases(`product_id = ${rbacProduct.id}`)).toBe(0)
    })
  })

  // -------------------------------------------------------------------------
  // Criterion 2 — error envelope {error, message} in Vietnamese
  // -------------------------------------------------------------------------
  describe('Criterion 2: error branches return the {error, message} envelope', () => {
    it('401 for an unauthenticated caller, and no case is created', async () => {
      actAs(null)
      const before = await countCases(`product_id = ${mainProduct.id}`)

      const res = await POST(
        reportRequest(mainProduct.id, { reason: 'SPAM', description: 'ẩn danh' }),
        makeContext(mainProduct.id),
      )

      expect(res.status).toBe(401)
      const body = await res.json()
      expect(body.error).toBe('UNAUTHORIZED')
      expect(typeof body.message).toBe('string')
      expect(body.message).toMatch(/đăng nhập/i)
      expect(await countCases(`product_id = ${mainProduct.id}`)).toBe(before)
    })

    it('404 for an unknown product id and for an unknown slug', async () => {
      actAs(reporter1)

      const bySlug = await POST(
        reportRequest('fr22-khong-ton-tai-xyz', { reason: 'SPAM' }),
        makeContext('fr22-khong-ton-tai-xyz'),
      )
      expect(bySlug.status).toBe(404)
      expect(await bySlug.json()).toMatchObject({
        error: 'PRODUCT_NOT_FOUND',
        message: 'Không tìm thấy sản phẩm.',
      })

      const byId = await POST(reportRequest(987654321, { reason: 'SPAM' }), makeContext(987654321))
      expect(byId.status).toBe(404)
      expect((await byId.json()).error).toBe('PRODUCT_NOT_FOUND')
    })

    it('400 when reason is missing, unknown, or not a string', async () => {
      const noReasonReporter = await createUser(
        `noreason-fr22-${Date.now()}-${getSeq()}@kientaohub.local`,
        ['buyer'],
      )
      actAs(noReasonReporter)

      const missing = await POST(reportRequest(mainProduct.id, {}), makeContext(mainProduct.id))
      expect(missing.status).toBe(400)
      const missingBody = await missing.json()
      expect(missingBody.error).toBe('INVALID_REASON')
      expect(missingBody.message).toMatch(/lý do báo cáo/i)

      const unknownReason = await POST(
        reportRequest(mainProduct.id, { reason: 'NOT_A_REAL_REASON' }),
        makeContext(mainProduct.id),
      )
      expect(unknownReason.status).toBe(400)
      const unknownBody = await unknownReason.json()
      expect(unknownBody.error).toBe('INVALID_REASON')
      // The message teaches the accepted vocabulary.
      expect(unknownBody.message).toContain('SPAM')
      expect(unknownBody.message).toContain('MISLEADING_PREVIEW')

      const nonString = await POST(
        reportRequest(mainProduct.id, { reason: 42 }),
        makeContext(mainProduct.id),
      )
      expect(nonString.status).toBe(400)
      expect((await nonString.json()).error).toBe('INVALID_REASON')

      expect(await countCases(`reporter_id = ${noReasonReporter.id}`)).toBe(0)
    })

    it('400 for a malformed JSON body and for an oversized description', async () => {
      const malformedReporter = await createUser(
        `malformed-fr22-${Date.now()}-${getSeq()}@kientaohub.local`,
        ['buyer'],
      )
      actAs(malformedReporter)

      const malformed = await POST(
        reportRequest(mainProduct.id, '{not json', true),
        makeContext(mainProduct.id),
      )
      expect(malformed.status).toBe(400)
      expect((await malformed.json()).error).toBe('INVALID_REQUEST')

      const tooLong = await POST(
        reportRequest(mainProduct.id, { reason: 'SPAM', description: 'x'.repeat(2001) }),
        makeContext(mainProduct.id),
      )
      expect(tooLong.status).toBe(400)
      const tooLongBody = await tooLong.json()
      expect(tooLongBody.error).toBe('INVALID_DESCRIPTION')
      expect(tooLongBody.message).toMatch(/2000/)

      expect(await countCases(`reporter_id = ${malformedReporter.id}`)).toBe(0)
    })

    it('409 for a second still-open report of the same (reporter, product) — and still one row', async () => {
      // reporter1 already owns an OPEN case for mainProduct from criterion 1.
      actAs(reporter1)
      expect(await countCases(`reporter_id = ${reporter1.id} AND product_id = ${mainProduct.id}`)).toBe(1)

      const res = await POST(
        reportRequest(mainProduct.id, { reason: 'COPYRIGHT_VIOLATION' }),
        makeContext(mainProduct.id),
      )

      expect(res.status).toBe(409)
      const body = await res.json()
      expect(body.error).toBe('DUPLICATE_REPORT')
      expect(typeof body.message).toBe('string')
      expect(body.message).toMatch(/đang chờ xử lý|đã có/i)
      expect(await countCases(`reporter_id = ${reporter1.id} AND product_id = ${mainProduct.id}`)).toBe(1)
    })

    it('a DIFFERENT user may report the same product (dedupe is per reporter, not per product)', async () => {
      actAs(reporter2)
      const res = await POST(
        reportRequest(mainProduct.id, { reason: 'CONTENT_MISMATCH', description: 'Thiếu file DWG' }),
        makeContext(mainProduct.id),
      )
      expect(res.status).toBe(201)
      const body = await res.json()
      caseIds.push(body.case.id)
      expect(body.case.reporterId).toBe(reporter2.id)

      expect(await countCases(`reporter_id = ${reporter2.id} AND product_id = ${mainProduct.id}`)).toBe(1)
      expect(await countCases(`reporter_id = ${reporter1.id} AND product_id = ${mainProduct.id}`)).toBe(1)
    })

    it('a second report is accepted again once the first case is resolved', async () => {
      // Resolve reporter1's case the way a moderator would (Payload admin / collection API).
      const openCase = await payload.find({
        collection: 'moderation_cases',
        where: {
          and: [
            { reporter: { equals: reporter1.id } },
            { product: { equals: mainProduct.id } },
            { status: { in: ['OPEN', 'IN_REVIEW'] } },
          ],
        },
        limit: 1,
        depth: 0,
        overrideAccess: true,
      })
      const caseId = openCase.docs[0].id
      await payload.update({
        collection: 'moderation_cases',
        id: caseId,
        data: {
          status: 'RESOLVED',
          resolutionNotes: 'Đã xử lý bởi moderator',
          resolvedBy: moderatorUser.id,
          resolvedAt: new Date().toISOString(),
        },
        user: moderatorUser,
        overrideAccess: true,
      })

      actAs(reporter1)
      const res = await POST(
        reportRequest(mainProduct.id, {
          reason: 'OTHER',
          description: 'Vấn đề vẫn còn sau khi xử lý',
        }),
        makeContext(mainProduct.id),
      )
      expect(res.status).toBe(201)
      const body = await res.json()
      caseIds.push(body.case.id)
      expect(body.case.status).toBe('OPEN')

      // Two rows for the pair now: one resolved, one open — the partial index only
      // guards the open one.
      expect(await countCases(`reporter_id = ${reporter1.id} AND product_id = ${mainProduct.id}`)).toBe(2)
    })
  })

  // -------------------------------------------------------------------------
  // Criterion 3 — exactly the seven FR-22 reasons
  // -------------------------------------------------------------------------
  describe('Criterion 3: exactly the seven FR-22 reasons are accepted', () => {
    const EXPECTED = [
      'FILE_CORRUPTED',
      'CONTENT_MISMATCH',
      'COPYRIGHT_VIOLATION',
      'SPAM',
      'PROHIBITED_CONTENT',
      'MISLEADING_PREVIEW',
      'OTHER',
    ]

    it('the vocabulary is exactly the seven PLAN.md FR-22 values', () => {
      expect(MODERATION_CASE_REASONS.slice().sort()).toEqual(EXPECTED.slice().sort())
      expect(MODERATION_CASE_REASON_OPTIONS).toHaveLength(7)
      for (const option of MODERATION_CASE_REASON_OPTIONS) {
        expect(option.label.length).toBeGreaterThan(0)
      }
    })

    it('the database enum carries exactly the seven values', async () => {
      const rows = await rawSql<{ enumlabel: string }>(
        `SELECT e.enumlabel FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
         WHERE t.typname = 'enum_moderation_cases_reason' ORDER BY e.enumsortorder;`,
      )
      expect(rows.map((r) => r.enumlabel)).toEqual(EXPECTED)
    })

    it('each of the seven reasons is accepted by the route and persisted', async () => {
      for (const reason of EXPECTED) {
        const reporter = await createUser(
          `reason-${reason.toLowerCase()}-${Date.now()}-${getSeq()}@kientaohub.local`,
          ['buyer'],
        )
        actAs(reporter)

        const res = await POST(
          reportRequest(mainProduct.id, { reason, description: `Báo cáo lý do ${reason}` }),
          makeContext(mainProduct.id),
        )
        expect(res.status, `reason ${reason} should be accepted`).toBe(201)
        const body = await res.json()
        caseIds.push(body.case.id)
        expect(body.case.reason).toBe(reason)

        const rows = await rawSql<{ reason: string }>(
          `SELECT reason FROM moderation_cases WHERE id = ${body.case.id};`,
        )
        expect(rows[0].reason).toBe(reason)
      }

      expect(await countCases(`product_id = ${mainProduct.id}`)).toBeGreaterThanOrEqual(
        EXPECTED.length,
      )
    })

    it('an eighth, unknown value is refused', async () => {
      const reporter = await createUser(`eighth-${Date.now()}-${getSeq()}@kientaohub.local`, ['buyer'])
      actAs(reporter)

      for (const bogus of ['', 'spam', 'HATE_SPEECH', 'NOT_LISTED', 'OTHER_REASON']) {
        const res = await POST(
          reportRequest(mainProduct.id, { reason: bogus }),
          makeContext(mainProduct.id),
        )
        expect(res.status, `reason "${bogus}" must be refused`).toBe(400)
      }

      expect(await countCases(`reporter_id = ${reporter.id}`)).toBe(0)
    })
  })

  // -------------------------------------------------------------------------
  // Criterion 4 — reporting never changes the product
  // -------------------------------------------------------------------------
  describe('Criterion 4: reporting does not change the product row or storefront visibility', () => {
    it('products.moderation_status, _status and updated_at are identical right after a report', async () => {
      const reporter = await createUser(`state-${Date.now()}-${getSeq()}@kientaohub.local`, ['buyer'])
      actAs(reporter)

      const before = await productRowState(mainProduct.id)
      const res = await POST(
        reportRequest(mainProduct.id, { reason: 'PROHIBITED_CONTENT' }),
        makeContext(mainProduct.id),
      )
      expect(res.status).toBe(201)
      caseIds.push((await res.json()).case.id)
      const after = await productRowState(mainProduct.id)

      expect(after.moderation_status).toBe(before.moderation_status)
      expect(after._status).toBe(before._status)
      // updated_at is the write detector: the product row was not touched at all.
      expect(after.updated_at).toBe(before.updated_at)
    })

    it('the product is still returned by the storefront detail query', async () => {
      expect(storefrontVisibleBefore).toBe(1)
      expect(await storefrontQuery(mainProduct.slug as string)).toBe(1)
      expect(await storefrontQuery(rbacProduct.slug as string)).toBe(1)
    })
  })

  // -------------------------------------------------------------------------
  // Criterion 5 — collection registration, admin surface and access rules
  // -------------------------------------------------------------------------
  describe('Criterion 5: moderation_cases is registered with moderation-only access', () => {
    it('is registered in the Payload config and exposed to the admin surface', () => {
      const collectionConfig = payload.config.collections.find((c) => c.slug === 'moderation_cases')
      expect(collectionConfig).toBeDefined()
      expect(collectionConfig?.admin?.group).toBe('Moderation')
      expect(collectionConfig?.admin?.defaultColumns).toEqual([
        'id',
        'product',
        'reason',
        'status',
        'createdAt',
      ])
      expect(collectionConfig?.fields.map((f: any) => f.name)).toEqual([
        'product',
        'reporter',
        'reason',
        'description',
        'status',
        'resolutionNotes',
        'resolvedBy',
        'resolvedAt',
        'updatedAt',
        'createdAt',
      ])
      // Registered at runtime too, i.e. the local API can address it.
      expect(payload.collections.moderation_cases?.config?.slug).toBe('moderation_cases')
    })

    it('moderator and admin can read cases; the reporter cannot read even their own', async () => {
      const asModerator = await payload.find({
        collection: 'moderation_cases',
        where: { product: { equals: mainProduct.id } },
        overrideAccess: false,
        user: moderatorUser,
        limit: 100,
      })
      expect(asModerator.totalDocs).toBeGreaterThan(0)

      const asAdmin = await payload.find({
        collection: 'moderation_cases',
        where: { product: { equals: mainProduct.id } },
        overrideAccess: false,
        user: adminUser,
        limit: 100,
      })
      expect(asAdmin.totalDocs).toBeGreaterThan(0)

      // The reporter is denied: a report is visible to the moderation team only.
      await expect(
        payload.find({
          collection: 'moderation_cases',
          overrideAccess: false,
          user: reporter1,
          limit: 100,
        }),
      ).rejects.toThrow()

      // …unauthenticated callers too.
      await expect(
        payload.find({
          collection: 'moderation_cases',
          overrideAccess: false,
          user: null as any,
          limit: 100,
        }),
      ).rejects.toThrow()
    })

    it('a buyer cannot create a case through the collection API (reporter is server-set)', async () => {
      await expect(
        payload.create({
          collection: 'moderation_cases',
          data: {
            product: rbacProduct.id,
            reporter: reporter1.id,
            reason: 'SPAM',
            status: 'RESOLVED',
            resolutionNotes: 'tự xử lý',
          },
          overrideAccess: false,
          user: reporter1,
        }),
      ).rejects.toThrow()

      expect(await countCases(`product_id = ${rbacProduct.id}`)).toBe(0)
    })

    it('only admin/moderator may update; only admin may delete', async () => {
      // Fixture case opened through the route for this RBAC block.
      const reporter = await createUser(`rbac-${Date.now()}-${getSeq()}@kientaohub.local`, ['buyer'])
      actAs(reporter)
      const created = await POST(
        reportRequest(rbacProduct.id, { reason: 'SPAM' }),
        makeContext(rbacProduct.id),
      )
      expect(created.status).toBe(201)
      const caseId = (await created.json()).case.id
      caseIds.push(caseId)

      // The reporter cannot update or delete their own case.
      await expect(
        payload.update({
          collection: 'moderation_cases',
          id: caseId,
          data: { status: 'DISMISSED' },
          overrideAccess: false,
          user: reporter,
        }),
      ).rejects.toThrow()

      await expect(
        payload.delete({
          collection: 'moderation_cases',
          id: caseId,
          overrideAccess: false,
          user: reporter,
        }),
      ).rejects.toThrow()

      // A moderator can move it to IN_REVIEW but cannot delete it.
      const asModerator = await payload.update({
        collection: 'moderation_cases',
        id: caseId,
        data: { status: 'IN_REVIEW' },
        overrideAccess: false,
        user: moderatorUser,
      })
      expect(asModerator.status).toBe('IN_REVIEW')

      await expect(
        payload.delete({
          collection: 'moderation_cases',
          id: caseId,
          overrideAccess: false,
          user: moderatorUser,
        }),
      ).rejects.toThrow()

      // The row survived every refused write.
      expect(await countCases(`id = ${caseId}`)).toBe(1)

      // An admin delete goes through (and proves the rule is not simply "nobody").
      await payload.delete({
        collection: 'moderation_cases',
        id: caseId,
        overrideAccess: false,
        user: adminUser,
      })
      expect(await countCases(`id = ${caseId}`)).toBe(0)
    })
  })

  // -------------------------------------------------------------------------
  // Criterion 6 — migration + DB-level duplicate guard
  // -------------------------------------------------------------------------
  describe('Criterion 6: the migration created the schema and the partial unique index', () => {
    it('created the moderation_cases table, its enum, its foreign keys and its migration row', async () => {
      const columns = await rawSql<{ column_name: string }>(
        `SELECT column_name FROM information_schema.columns WHERE table_name = 'moderation_cases';`,
      )
      expect(columns.map((c) => c.column_name).sort()).toEqual(
        [
          'created_at',
          'description',
          'id',
          'product_id',
          'reason',
          'reporter_id',
          'resolution_notes',
          'resolved_at',
          'resolved_by_id',
          'status',
          'updated_at',
        ].sort(),
      )

      const statusEnum = await rawSql<{ enumlabel: string }>(
        `SELECT e.enumlabel FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
         WHERE t.typname = 'enum_moderation_cases_status' ORDER BY e.enumsortorder;`,
      )
      expect(statusEnum.map((r) => r.enumlabel)).toEqual([
        'OPEN',
        'IN_REVIEW',
        'RESOLVED',
        'DISMISSED',
      ])

      const fks = await rawSql<{ conname: string }>(
        `SELECT conname FROM pg_constraint WHERE conrelid = 'moderation_cases'::regclass AND contype = 'f'
         ORDER BY conname;`,
      )
      expect(fks.map((f) => f.conname)).toEqual([
        'moderation_cases_product_id_products_id_fk',
        'moderation_cases_reporter_id_users_id_fk',
        'moderation_cases_resolved_by_id_users_id_fk',
      ])

      const migrationRow = await rawSql<{ name: string }>(
        `SELECT name FROM payload_migrations WHERE name = '20260918_000000_phase10_moderation_cases';`,
      )
      expect(migrationRow).toHaveLength(1)
    })

    it('the partial unique index exists on (reporter_id, product_id) for open cases only', async () => {
      const rows = await rawSql<{ indexdef: string }>(
        `SELECT indexdef FROM pg_indexes
         WHERE tablename = 'moderation_cases'
           AND indexname = 'moderation_cases_open_reporter_product_idx';`,
      )
      expect(rows).toHaveLength(1)
      expect(rows[0].indexdef).toMatch(/UNIQUE/)
      expect(rows[0].indexdef).toMatch(/reporter_id, product_id/)
      expect(rows[0].indexdef).toMatch(/WHERE/)
      expect(rows[0].indexdef).toMatch(/OPEN/)
      expect(rows[0].indexdef).toMatch(/IN_REVIEW/)
      expect(rows[0].indexdef).not.toMatch(/RESOLVED/)
    })

    it('PostgreSQL itself refuses a second OPEN case for the same (reporter, product)', async () => {
      const first = await rawSql<any>(
        `INSERT INTO moderation_cases (product_id, reporter_id, reason, status)
         VALUES (${sqlProduct.id}, ${reporter2.id}, 'SPAM', 'OPEN') RETURNING id;`,
      )
      caseIds.push(first[0].id)

      let duplicateError: any = null
      try {
        await rawSql(
          `INSERT INTO moderation_cases (product_id, reporter_id, reason, status)
           VALUES (${sqlProduct.id}, ${reporter2.id}, 'OTHER', 'OPEN');`,
        )
      } catch (error: any) {
        duplicateError = error
      }

      expect(duplicateError).toBeDefined()
      expect(errorText(duplicateError)).toMatch(
        /duplicate key value|23505|moderation_cases_open_reporter_product_idx/i,
      )
      expect(await countCases(`product_id = ${sqlProduct.id}`)).toBe(1)
    })

    it('IN_REVIEW also blocks a duplicate, while RESOLVED/DISMISSED release the pair', async () => {
      const inReview = await rawSql<any>(
        `INSERT INTO moderation_cases (product_id, reporter_id, reason, status)
         VALUES (${sqlProduct.id}, ${moderatorUser.id}, 'SPAM', 'IN_REVIEW') RETURNING id;`,
      )
      const inReviewId = inReview[0].id
      caseIds.push(inReviewId)

      let blocked: any = null
      try {
        await rawSql(
          `INSERT INTO moderation_cases (product_id, reporter_id, reason, status)
           VALUES (${sqlProduct.id}, ${moderatorUser.id}, 'OTHER', 'OPEN');`,
        )
      } catch (error: any) {
        blocked = error
      }

      // A valid reason + a valid status, refused by the partial index alone.
      expect(blocked).toBeDefined()
      expect(errorText(blocked)).toMatch(
        /duplicate key value|23505|moderation_cases_open_reporter_product_idx/i,
      )
      expect(await countCases(`reporter_id = ${moderatorUser.id} AND product_id = ${sqlProduct.id}`)).toBe(1)

      // A resolved case falls out of the predicate, so the pair is free again.
      await rawSql(`UPDATE moderation_cases SET status = 'RESOLVED' WHERE id = ${inReviewId};`)
      const reopened = await rawSql<any>(
        `INSERT INTO moderation_cases (product_id, reporter_id, reason, status)
         VALUES (${sqlProduct.id}, ${moderatorUser.id}, 'OTHER', 'OPEN') RETURNING id;`,
      )
      caseIds.push(reopened[0].id)
      expect(await countCases(`reporter_id = ${moderatorUser.id} AND product_id = ${sqlProduct.id}`)).toBe(2)

      // …and a DISMISSED case is outside the predicate as well.
      await rawSql(`UPDATE moderation_cases SET status = 'DISMISSED' WHERE id = ${reopened[0].id};`)
      const afterDismiss = await rawSql<any>(
        `INSERT INTO moderation_cases (product_id, reporter_id, reason, status)
         VALUES (${sqlProduct.id}, ${moderatorUser.id}, 'SPAM', 'OPEN') RETURNING id;`,
      )
      caseIds.push(afterDismiss[0].id)
      expect(await countCases(`reporter_id = ${moderatorUser.id} AND product_id = ${sqlProduct.id}`)).toBe(3)
    })

    it('the route maps the DB race to 409 instead of a 500', async () => {
      // Simulate the race: the pre-check reports "no existing case" while a competing row
      // is already in the table, so the route's INSERT hits the partial unique index.
      const raceReporter = await createUser(
        `race-${Date.now()}-${getSeq()}@kientaohub.local`,
        ['buyer'],
      )
      const raceProduct = await createProduct(
        `fr22-report-race-${Date.now()}-${getSeq()}`,
        'FR-22 Report Race Product',
      )
      actAs(raceReporter)

      const originalFind = payload.find.bind(payload)
      // Only the route's PRE-check is blinded (it must see "no existing case"); every
      // later lookup — including the route's post-failure re-check — hits the real DB.
      let caseLookups = 0
      const findSpy = vi.spyOn(payload, 'find').mockImplementation(async (args: any) => {
        if (args?.collection === 'moderation_cases') {
          caseLookups += 1
          if (caseLookups === 1) {
            return { docs: [], totalDocs: 0, limit: 1, page: 1, totalPages: 0 } as any
          }
        }
        return (await originalFind(args)) as any
      })

      const seeded = await rawSql<any>(
        `INSERT INTO moderation_cases (product_id, reporter_id, reason, status)
         VALUES (${raceProduct.id}, ${raceReporter.id}, 'SPAM', 'OPEN') RETURNING id;`,
      )
      caseIds.push(seeded[0].id)

      const res = await POST(
        reportRequest(raceProduct.id, { reason: 'SPAM' }),
        makeContext(raceProduct.id),
      )
      findSpy.mockRestore()

      expect(caseLookups).toBeGreaterThanOrEqual(2)
      expect(res.status).toBe(409)
      expect((await res.json()).error).toBe('DUPLICATE_REPORT')
      expect(await countCases(`product_id = ${raceProduct.id}`)).toBe(1)
    })
  })

  // -------------------------------------------------------------------------
  // Criterion 7 — storefront entry point
  // -------------------------------------------------------------------------
  describe('Criterion 7: the storefront product detail exposes the report entry point', () => {
    it('the product detail page imports and renders ProductReportDialog', async () => {
      const fs = await import('node:fs/promises')
      const path = await import('node:path')
      const pageSource = await fs.readFile(
        path.resolve(process.cwd(), 'src/app/(app)/products/[slug]/page.tsx'),
        'utf8',
      )
      expect(pageSource).toContain(
        "import { ProductReportDialog } from '@/components/product/ProductReportDialog'",
      )
      expect(pageSource).toContain(
        '<ProductReportDialog productId={product.id} productTitle={product.title} />',
      )
    })

    it('an anonymous visitor cannot submit and is invited to sign in', () => {
      mockUseAuth.mockReturnValue({ user: null })
      renderReportDialog(mainProduct.id, 'FR-22 Report Main Product')

      expect(screen.getByText(/Báo cáo sản phẩm/)).toBeDefined()
      expect(screen.queryByRole('button', { name: /Báo cáo sản phẩm/ })).toBeNull()
      expect(
        screen.getByText(/Chỉ người dùng đã đăng nhập mới có thể báo cáo sản phẩm/),
      ).toBeDefined()

      const loginLink = screen.getByRole('link', { name: 'Đăng nhập' })
      expect(loginLink.getAttribute('href')).toBe(
        `/login?redirect=${encodeURIComponent('/products/fr22-report-main')}`,
      )
    })

    it('a signed-in user sees the seven reasons and POSTs the chosen one to the endpoint', async () => {
      mockUseAuth.mockReturnValue({ user: reporter1 })
      const fetchSpy = vi.fn().mockResolvedValue({
        ok: true,
        status: 201,
        json: async () => ({ success: true, case: { id: 4242, status: 'OPEN', reason: 'SPAM' } }),
      })
      global.fetch = fetchSpy as any

      renderReportDialog(mainProduct.id, 'FR-22 Report Main Product')

      fireEvent.click(screen.getByRole('button', { name: /Báo cáo sản phẩm/ }))

      const select = (await screen.findByLabelText(/Lý do báo cáo/)) as HTMLSelectElement
      expect(Array.from(select.options).map((option) => option.value)).toEqual([
        'FILE_CORRUPTED',
        'CONTENT_MISMATCH',
        'COPYRIGHT_VIOLATION',
        'SPAM',
        'PROHIBITED_CONTENT',
        'MISLEADING_PREVIEW',
        'OTHER',
      ])

      fireEvent.change(select, { target: { value: 'SPAM' } })
      fireEvent.change(screen.getByLabelText(/Ghi chú thêm/), {
        target: { value: 'Spam quảng cáo lặp lại' },
      })
      fireEvent.click(screen.getByRole('button', { name: 'Gửi báo cáo' }))

      await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(1))
      const [url, init] = fetchSpy.mock.calls[0] as any
      expect(url).toBe(`/api/v1/products/${mainProduct.id}/reports`)
      expect(init.method).toBe('POST')
      expect(JSON.parse(init.body)).toEqual({
        reason: 'SPAM',
        description: 'Spam quảng cáo lặp lại',
      })

      await waitFor(() => expect(screen.getByText(/Đã gửi báo cáo thành công/)).toBeDefined())
      expect(mockToast.success).toHaveBeenCalled()
    })

    it('surfaces the 409 refusal message from the API to the reporter', async () => {
      mockUseAuth.mockReturnValue({ user: reporter1 })
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 409,
        json: async () => ({
          error: 'DUPLICATE_REPORT',
          message: 'Bạn đã có một báo cáo đang chờ xử lý cho sản phẩm này.',
        }),
      }) as any

      renderReportDialog(mainProduct.id, 'FR-22 Report Main Product')
      fireEvent.click(screen.getByRole('button', { name: /Báo cáo sản phẩm/ }))
      fireEvent.click(await screen.findByRole('button', { name: 'Gửi báo cáo' }))

      await waitFor(() =>
        expect(
          screen.getByText('Bạn đã có một báo cáo đang chờ xử lý cho sản phẩm này.'),
        ).toBeDefined(),
      )
      expect(screen.queryByText(/Đã gửi báo cáo thành công/)).toBeNull()
    })
  })

  // -------------------------------------------------------------------------
  // Repair (t4 / finding F1) — the two branches that run AFTER payload.create fails
  // -------------------------------------------------------------------------
  describe('Repair F1: the post-create-failure branches (500 vs 409)', () => {
    // Mutation check (repair t4/F1c) — these two tests are behaviour tests on the branch
    // under test, not tautologies. Measured on transient scratch copies of
    // `src/app/api/v1/products/[id]/reports/route.ts` (deleted after the run), driving
    // the real route and one mutant with identical fixtures/state:
    //  - mutant A "post-failure re-check removed (rethrow only)": real route 409,
    //    mutant A 500 → the F1b assertion `expect(res.status).toBe(409)` fails;
    //  - mutant B "every create failure mapped to 409": real route 500, mutant B 409 for
    //    a (reporter, product) that owns no case at all → the F1a assertion
    //    `expect(res.status).toBe(500)` fails.
    // Recipe: copy the route next to this spec, apply one mutation, point a scratch spec
    // at it and run `npx vitest run --config ./vitest.config.mts <scratch spec>`.
    it('F1a: a create failure that is NOT a duplicate surfaces as 500 and writes no case', async () => {
      const reporter = await createUser(
        `f1a-${Date.now()}-${getSeq()}@kientaohub.local`,
        ['buyer'],
      )
      const product = await createProduct(
        `fr22-repair-f1a-${Date.now()}-${getSeq()}`,
        'FR-22 Repair F1a Product',
      )
      actAs(reporter)

      // The pre-check ran on the real DB (no open case), then the INSERT itself fails for
      // an infrastructure reason — nothing about an existing case.
      const originalCreate = payload.create.bind(payload)
      let createAttempts = 0
      const createSpy = vi.spyOn(payload, 'create').mockImplementation(async (args: any) => {
        if (args?.collection === 'moderation_cases') {
          createAttempts += 1
          throw new Error('FR22_TEST_INJECTED_CREATE_FAILURE: connection terminated')
        }
        return (await originalCreate(args)) as any
      })

      let res: Response
      try {
        res = await POST(reportRequest(product.id, { reason: 'SPAM' }), makeContext(product.id))
      } finally {
        createSpy.mockRestore()
      }

      expect(createAttempts).toBe(1)
      expect(res.status).toBe(500)
      expect(res.status).not.toBe(201)
      expect(res.status).not.toBe(409)

      const body = await res.json()
      expect(body.error).toBe('INTERNAL_ERROR')
      expect(typeof body.message).toBe('string')
      expect(body.message.length).toBeGreaterThan(0)
      expect(body.success).toBeUndefined()

      // The failure did not leave a partial write behind.
      expect(
        await countCases(`reporter_id = ${reporter.id} AND product_id = ${product.id}`),
      ).toBe(0)
    })

    it('F1b: a create failure while a racing open case exists surfaces as 409 DUPLICATE_REPORT', async () => {
      const reporter = await createUser(
        `f1b-${Date.now()}-${getSeq()}@kientaohub.local`,
        ['buyer'],
      )
      const product = await createProduct(
        `fr22-repair-f1b-${Date.now()}-${getSeq()}`,
        'FR-22 Repair F1b Product',
      )
      actAs(reporter)

      // The winner of the race lands an OPEN case for the same (reporter, product) between
      // the route's pre-check and its INSERT.
      const seeded = await rawSql<any>(
        `INSERT INTO moderation_cases (product_id, reporter_id, reason, status)
         VALUES (${product.id}, ${reporter.id}, 'SPAM', 'OPEN') RETURNING id;`,
      )
      caseIds.push(seeded[0].id)

      // The pre-check is blinded (it must miss the racing row), while the post-failure
      // re-check reads the real table — the exact production ordering.
      const originalFind = payload.find.bind(payload)
      let caseLookups = 0
      const findSpy = vi.spyOn(payload, 'find').mockImplementation(async (args: any) => {
        if (args?.collection === 'moderation_cases') {
          caseLookups += 1
          if (caseLookups === 1) {
            return { docs: [], totalDocs: 0, limit: 1, page: 1, totalPages: 0 } as any
          }
        }
        return (await originalFind(args)) as any
      })

      // The INSERT loses the race: PostgreSQL refuses it through the partial unique index
      // in production; here the same failure is injected deterministically.
      const originalCreate = payload.create.bind(payload)
      let createAttempts = 0
      const createSpy = vi.spyOn(payload, 'create').mockImplementation(async (args: any) => {
        if (args?.collection === 'moderation_cases') {
          createAttempts += 1
          throw new Error(
            'FR22_TEST_INJECTED_UNIQUE_VIOLATION: duplicate key value violates unique constraint "moderation_cases_open_reporter_product_idx"',
          )
        }
        return (await originalCreate(args)) as any
      })

      let res: Response
      try {
        res = await POST(reportRequest(product.id, { reason: 'SPAM' }), makeContext(product.id))
      } finally {
        createSpy.mockRestore()
        findSpy.mockRestore()
      }

      expect(createAttempts).toBe(1)
      expect(caseLookups).toBeGreaterThanOrEqual(2)
      expect(res.status).toBe(409)
      const body = await res.json()
      expect(body.error).toBe('DUPLICATE_REPORT')
      expect(body.message).toMatch(/đang chờ xử lý|đã có/i)
      expect(body.success).toBeUndefined()

      // The winner's row is the only one — the loser wrote nothing extra.
      expect(
        await countCases(`reporter_id = ${reporter.id} AND product_id = ${product.id}`),
      ).toBe(1)
    })
  })

  // -------------------------------------------------------------------------
  // Repair (t4 / finding F3) — unpublished products are indistinguishable from unknown
  // -------------------------------------------------------------------------
  describe('Repair F3: unpublished products resolve like unknown products (anti-enumeration)', () => {
    // Mutation check (repair t4/F3, rule now owned by `@/utilities/storefrontVisibility`):
    // on a transient scratch copy of the route with the visibility clause dropped from
    // both lookups (the pre-repair behaviour), the same unpublished fixture answered `201`
    // with a real created case (`{"success":true,"case":{"id":…,"status":"OPEN"}}`) while
    // the real route answers `404 {"error":"PRODUCT_NOT_FOUND",…}` — so the F3a assertion
    // `expect(byId.status).toBe(404)` fails against the unfiltered route, and the
    // enumeration channel the finding described did exist. The drift-sensitivity of the
    // shared rule itself is proven in tests/int/product-report-agreement.int.spec.ts.
    let draftProduct: Product
    const UNPUBLISHED_STATES = ['draft', 'submitted', 'in_review', 'changes_requested', 'rejected']

    beforeAll(async () => {
      draftProduct = await createProduct(
        `fr22-repair-draft-${Date.now()}-${getSeq()}`,
        'FR-22 Repair Unpublished Product',
      )
      // Park the fixture in an unpublished state (the route only reads `_status`; the
      // moderation_status variants below are set with raw SQL to cover every non-approved
      // state without re-implementing the moderation transition hooks here).
      await rawSql(
        `UPDATE products SET _status = 'draft', moderation_status = 'draft' WHERE id = ${draftProduct.id};`,
      )
      const row = await productRowState(draftProduct.id)
      expect(row._status).toBe('draft')
    })

    it('F3a: every unpublished moderation state returns 404 for both the numeric id and the slug', async () => {
      actAs(reporter1)

      for (const state of UNPUBLISHED_STATES) {
        await rawSql(
          `UPDATE products SET _status = 'draft', moderation_status = '${state}' WHERE id = ${draftProduct.id};`,
        )
        const row = await productRowState(draftProduct.id)
        expect(row.moderation_status, `state ${state} stored`).toBe(state)
        expect(row._status, `state ${state} is unpublished`).toBe('draft')

        const byId = await POST(
          reportRequest(draftProduct.id, { reason: 'SPAM' }),
          makeContext(draftProduct.id),
        )
        expect(byId.status, `unpublished (${state}) must 404 by id`).toBe(404)
        expect((await byId.json()).error).toBe('PRODUCT_NOT_FOUND')

        const bySlug = await POST(
          reportRequest(draftProduct.slug as string, { reason: 'SPAM' }),
          makeContext(draftProduct.slug as string),
        )
        expect(bySlug.status, `unpublished (${state}) must 404 by slug`).toBe(404)
        expect((await bySlug.json()).error).toBe('PRODUCT_NOT_FOUND')
      }

      // No case was ever opened against the unpublished product.
      expect(await countCases(`product_id = ${draftProduct.id}`)).toBe(0)
    })

    it('F3b: the unpublished-product 404 is byte-identical to the unknown-product 404', async () => {
      await rawSql(
        `UPDATE products SET _status = 'draft', moderation_status = 'submitted' WHERE id = ${draftProduct.id};`,
      )
      actAs(reporter1)

      // Unknown slug/id — the reference response an attacker can trigger at will.
      const unknownSlug = 'fr22-repair-khong-ton-tai'
      const unknownBySlug = await POST(
        reportRequest(unknownSlug, { reason: 'SPAM' }),
        makeContext(unknownSlug),
      )
      const unknownBySlugBody = await unknownBySlug.text()
      const unknownById = await POST(
        reportRequest(987654321, { reason: 'SPAM' }),
        makeContext(987654321),
      )
      const unknownByIdBody = await unknownById.text()

      const draftBySlug = await POST(
        reportRequest(draftProduct.slug as string, { reason: 'SPAM' }),
        makeContext(draftProduct.slug as string),
      )
      const draftBySlugBody = await draftBySlug.text()
      const draftById = await POST(
        reportRequest(draftProduct.id, { reason: 'SPAM' }),
        makeContext(draftProduct.id),
      )
      const draftByIdBody = await draftById.text()

      // Same status AND same body bytes: nothing distinguishes "exists but unpublished"
      // from "does not exist".
      expect(draftBySlug.status).toBe(unknownBySlug.status)
      expect(draftBySlugBody).toBe(unknownBySlugBody)
      expect(draftById.status).toBe(unknownById.status)
      expect(draftByIdBody).toBe(unknownByIdBody)

      // …and the shared body is the documented envelope, not an accidental empty 404.
      expect(unknownBySlugBody).toBe(
        JSON.stringify({ error: 'PRODUCT_NOT_FOUND', message: 'Không tìm thấy sản phẩm.' }),
      )
      expect(draftByIdBody).toBe(unknownBySlugBody)
    })

    it('F3c: the storefront query and the route agree on the same fixtures, and published products still report (201 then 409)', async () => {
      // Behavioural agreement on the same fixtures: the route hides exactly what the
      // storefront query hides, and serves what it serves. (The page⇄route agreement is
      // proven at render level in tests/int/product-report-agreement.int.spec.ts.)
      await rawSql(
        `UPDATE products SET _status = 'draft', moderation_status = 'rejected' WHERE id = ${draftProduct.id};`,
      )
      expect(await storefrontQuery(draftProduct.slug as string)).toBe(0)
      expect(await storefrontQuery(mainProduct.slug as string)).toBe(1)

      // A published product is reportable normally: 201 first, 409 on the open duplicate.
      const reporter = await createUser(
        `f3c-${Date.now()}-${getSeq()}@kientaohub.local`,
        ['buyer'],
      )
      actAs(reporter)

      const first = await POST(
        reportRequest(mainProduct.id, { reason: 'MISLEADING_PREVIEW' }),
        makeContext(mainProduct.id),
      )
      expect(first.status).toBe(201)
      const firstBody = await first.json()
      caseIds.push(firstBody.case.id)
      expect(firstBody.case.status).toBe('OPEN')

      const second = await POST(
        reportRequest(mainProduct.id, { reason: 'SPAM' }),
        makeContext(mainProduct.id),
      )
      expect(second.status).toBe(409)
      expect((await second.json()).error).toBe('DUPLICATE_REPORT')
    })
  })

  // -------------------------------------------------------------------------
  // Closing invariants — measured after every reporting flow above has run
  // -------------------------------------------------------------------------
  describe('Criterion 4/9 (closing): the catalog and the money path are untouched', () => {
    it('the product row is identical to its pre-reporting snapshot', async () => {
      expect(await productRowState(mainProduct.id)).toEqual(mainProductStateBefore)
      // Sanity: reports really exist for that product, so the snapshot means something.
      expect(await countCases(`product_id = ${mainProduct.id}`)).toBeGreaterThan(0)
    })

    it('no money-path table gained or lost a row (BR-03)', async () => {
      expect(await moneyPathCounts()).toEqual(moneyPathCountsBefore)
    })
  })
})
