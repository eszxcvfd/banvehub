import { getPayload, type Payload } from 'payload'
import config from '@/payload.config'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import React from 'react'
import { renderToString } from 'react-dom/server'
import type { Product, User } from '@/payload-types'
import { POST as reportProduct } from '@/app/api/v1/products/[id]/reports/route'
import ProductPage from '@/app/(app)/products/[slug]/page'

// ---------------------------------------------------------------------------
// FR-22 repair R1/R2 — the storefront product page and the report route must agree
// about which products are visible, and the report entry point must disappear in
// draft-preview mode. This spec renders the REAL page component (server-side render with
// `draftMode()` mocked per case) and drives the REAL report route against the same
// fixtures, so the assertions are behavioural — not source-string comparisons.
//
// Only presentational children of the page are replaced (they pull in embla/SCSS and are
// irrelevant here); `ProductReportDialog` is rendered for real because `#report-section`
// is the thing under test.
//
// Drift sensitivity (repair R1c) — measured, not argued. Each mutation was applied to a
// transient scratch copy of this spec / the page / the route (deleted after the run) and
// re-run with `npx vitest run --config ./vitest.config.mts <scratch spec>`:
//  - M1 "shared rule changed to draft-visible" (`vi.mock` of
//    `@/utilities/storefrontVisibility`): RED —
//    `page for published: expected 'notFound' to be 'rendered'` (3/4 tests fail);
//  - M3 "route stops applying the rule" (route copy without the shared clause): RED —
//    `report status for draft: expected 201 to be 404`;
//  - M2b "page stops applying the rule and loses the access-control backstop"
//    (`overrideAccess: true` in the page copy): RED —
//    `page for draft: expected 'rendered' to be 'notFound'`;
//  - M4 "page drops the server-side draft-preview gate on the report entry point": RED —
//    `expected '…' not to contain 'id="report-section"'`.
//  - M2 "page stops applying the rule with access control intact": GREEN, and that is
//    correct — with `overrideAccess: false` the collection read rule
//    (`adminSellerModeratorOrPublished`) already hides non-published products from
//    non-staff readers, so the page's decision does not change. The explicit shared
//    clause is what keeps the page's decision identical to the route's independently of
//    that access rule (M2b shows the consequence when both are gone).
//  - N3 "page's non-preview branch tightened with `moderationStatus = 'approved'`"
//    (page copy whose non-preview clause adds that extra condition): the four
//    `_status`-only rows stay GREEN — which is why this drift class escaped round 3 — and
//    the R3-1 row below is RED (`expected 'notFound' to be 'rendered'`), because its
//    fixture is `_status = 'published'` with `moderation_status = 'submitted'`. That row
//    exists to pin the second column.
// ---------------------------------------------------------------------------
const { draftState, mockUseAuth, mockToast } = vi.hoisted(() => ({
  draftState: { isEnabled: false },
  mockUseAuth: vi.fn(),
  mockToast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}))

vi.mock('next/headers', () => ({
  draftMode: async () => ({
    isEnabled: draftState.isEnabled,
    enable: () => {},
    disable: () => {},
  }),
  headers: async () => new Headers(),
  cookies: async () => ({ get: () => undefined, getAll: () => [], has: () => false }),
}))

vi.mock('next/navigation', () => ({
  notFound: () => {
    const error: any = new Error('NEXT_NOT_FOUND')
    error.digest = 'NEXT_NOT_FOUND'
    throw error
  },
  usePathname: () => '/products/fr22-agreement',
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}))

vi.mock('next/link', () => ({
  default: (props: any) =>
    React.createElement(
      'a',
      { href: typeof props.href === 'string' ? props.href : '#' },
      props.children,
    ),
}))

vi.mock('@/providers/Auth', () => ({ useAuth: () => mockUseAuth() }))
vi.mock('sonner', () => ({ toast: mockToast }))
vi.mock('@/blocks/RenderBlocks', () => ({ RenderBlocks: () => null }))
vi.mock('@/components/Grid/tile', () => ({ GridTileImage: () => null }))
vi.mock('@/components/product/Gallery', () => ({ Gallery: () => null }))
vi.mock('@/components/product/ProductDescription', () => ({ ProductDescription: () => null }))
vi.mock('@/components/product/TechnicalSpecsTable', () => ({ TechnicalSpecsTable: () => null }))
vi.mock('@/components/product/ProductReviewsSection', () => ({ ProductReviewsSection: () => null }))
vi.mock('@/components/product/ProductCommentsSection', () => ({ ProductCommentsSection: () => null }))

describe('FR-22 storefront page ⇔ report route agreement (repair R1/R2)', () => {
  let payload: Payload

  const userIds: (number | string)[] = []
  const productIds: (number | string)[] = []
  const caseIds: (number | string)[] = []

  let sellerUser: User
  let bootstrapUser: User
  let publishedProduct: Product
  let unpublishedProduct: Product
  /** R3-1 matrix row: `_status = 'published'` with a non-approved moderation verdict. */
  let publishedUnapprovedProduct: Product

  let seq = 0
  const getSeq = () => ++seq

  let currentUser: User | null = null
  let authSpy: ReturnType<typeof vi.spyOn> | null = null
  const actAs = (user: User | null) => {
    currentUser = user
  }

  /**
   * Every moderation state that is not the published/approved one. The storefront hides
   * all of them, so the page must answer `notFound()` and the route must answer 404.
   */
  const STATES = ['published', 'draft', 'submitted', 'in_review', 'changes_requested', 'rejected']

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

  /**
   * Raw visibility state of a product row. Both surfaces currently key on `_status`, so a
   * matrix row must be able to prove which `(_status, moderation_status)` pair it pinned.
   */
  const productRowState = async (id: number | string) => {
    const rows = await rawSql<{ _status: string; moderation_status: string }>(
      `SELECT _status, moderation_status FROM products WHERE id = ${id};`,
    )
    return rows[0]
  }

  const makeContext = (id: string | number) => ({
    params: Promise.resolve({ id: String(id) }),
  })

  const reportRequest = (productId: string | number, body: any) =>
    new Request(`http://localhost:3000/api/v1/products/${productId}/reports`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })

  const createUser = async (email: string, roles: User['roles']): Promise<User> => {
    const user = (await payload.create({
      collection: 'users',
      data: {
        email,
        password: 'test-password-fr22-agreement',
        name: email.split('@')[0],
        roles,
      },
      overrideAccess: true,
    })) as User
    userIds.push(user.id)
    return user
  }

  /** Put a fixture into one of the visibility states (main table = current state). */
  const setState = async (state: string) => {
    if (state === 'published') {
      await rawSql(
        `UPDATE products SET _status = 'published', moderation_status = 'approved' WHERE id = ${unpublishedProduct.id};`,
      )
    } else {
      await rawSql(
        `UPDATE products SET _status = 'draft', moderation_status = '${state}' WHERE id = ${unpublishedProduct.id};`,
      )
    }
  }

  /**
   * Server-side render of the real product page. `draftState.isEnabled` drives the page's
   * `draftMode()` branch exactly as the preview cookie would.
   */
  const renderPage = async (slug: string, draftPreview: boolean) => {
    draftState.isEnabled = draftPreview
    try {
      const element = await ProductPage({ params: Promise.resolve({ slug }) })
      return { outcome: 'rendered' as const, html: renderToString(element as any) }
    } catch (error: any) {
      if (error?.digest === 'NEXT_NOT_FOUND') {
        return { outcome: 'notFound' as const, html: '' }
      }
      throw error
    } finally {
      draftState.isEnabled = false
    }
  }

  beforeAll(async () => {
    payload = await getPayload({ config })
    authSpy = vi.spyOn(payload, 'auth').mockImplementation(
      async () => ({ user: currentUser }) as any,
    )
    mockUseAuth.mockReturnValue({ user: null })

    const timestamp = Date.now()

    // Absorb the first-user admin promotion so the fixtures keep their declared roles.
    bootstrapUser = await createUser(
      `bootstrap-fr22-agreement-${timestamp}-${getSeq()}@kientaohub.local`,
      ['buyer'],
    )
    sellerUser = await createUser(
      `seller-fr22-agreement-${timestamp}-${getSeq()}@kientaohub.local`,
      ['seller'],
    )
    expect(bootstrapUser.roles).toEqual(['buyer'])
    expect(sellerUser.roles).toEqual(['seller'])

    const mkProduct = async (
      slug: string,
      status: 'draft' | 'published',
      moderationStatus?: Product['moderationStatus'],
    ) => {
      const product = (await payload.create({
        collection: 'products',
        data: {
          title: `FR-22 Agreement ${slug}`,
          slug,
          price: 120000,
          seller: sellerUser.id,
          copyrightDeclared: true,
          moderationStatus: moderationStatus ?? (status === 'published' ? 'approved' : 'draft'),
          _status: status,
        },
        overrideAccess: true,
      })) as Product
      productIds.push(product.id)
      return product
    }

    publishedProduct = await mkProduct(`fr22-agreement-published-${timestamp}`, 'published')
    unpublishedProduct = await mkProduct(`fr22-agreement-unpublished-${timestamp}`, 'draft')
    // R3-1 matrix row: PUBLISHED (what both surfaces currently key on) but the moderation
    // verdict is a different column and is NOT `approved`. A surface that tightened its
    // non-preview rule to `moderationStatus === 'approved'` must fail on this fixture.
    publishedUnapprovedProduct = await mkProduct(
      `fr22-agreement-published-unapproved-${timestamp}`,
      'published',
      'submitted',
    )
  })

  afterAll(async () => {
    try {
      if (payload) {
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

  it('R1b: the page renders exactly the products the report route accepts, for every state', async () => {
    const observed: string[] = []

    for (const state of STATES) {
      await setState(state)
      const reporter = await createUser(
        `agree-${state}-${Date.now()}-${getSeq()}@kientaohub.local`,
        ['buyer'],
      )
      actAs(reporter)

      const page = await renderPage(unpublishedProduct.slug as string, false)
      const res = await reportProduct(
        reportRequest(unpublishedProduct.id, { reason: 'SPAM' }),
        makeContext(unpublishedProduct.id),
      )
      if (res.status === 201) {
        caseIds.push((await res.json()).case.id)
      }

      const isVisible = state === 'published'
      observed.push(`${state}: page=${page.outcome} route=${res.status}`)

      // The committed contract: published ⇒ shown AND reportable; anything else ⇒ hidden
      // AND not reportable.
      expect(page.outcome, `page for ${state}`).toBe(isVisible ? 'rendered' : 'notFound')
      expect(res.status, `report status for ${state}`).toBe(isVisible ? 201 : 404)

      // …and the two surfaces agree with each other, whatever the policy is.
      expect(page.outcome === 'rendered', `page/route agreement for ${state}`).toBe(
        res.status === 201,
      )
    }

    // One printed line that makes the agreement visible in the raw log.
    console.log(`[agreement] ${observed.join(' | ')}`)

    // Of the six states only the published one may have produced a case: every hidden
    // state wrote nothing, so the fixture owns exactly one case.
    expect(await countCases(`product_id = ${unpublishedProduct.id}`)).toBe(1)
  })

  it('R3-1: a published product that is not moderation-approved is still shown and still reportable', async () => {
    // The other rows only ever pin `_status` (the column both surfaces key on): every
    // unpublished case is paired with `_status = 'draft'`. This row additionally pins a
    // *different* column — `moderation_status = 'submitted'` — so a surface that silently
    // tightened its non-preview rule to `moderationStatus === 'approved'` (the round-3
    // drift) diverges here instead of escaping the matrix.
    const row = await productRowState(publishedUnapprovedProduct.id)
    expect(row._status).toBe('published')
    expect(row.moderation_status).toBe('submitted')
    expect(row.moderation_status).not.toBe('approved')

    // Surface 1 — the real storefront page, non-preview.
    const page = await renderPage(publishedUnapprovedProduct.slug as string, false)
    expect(page.outcome).toBe('rendered')
    expect(page.html).toContain('id="report-section"')

    // Surface 2 — the real report route, same fixture.
    const reporter = await createUser(
      `r3-1-${Date.now()}-${getSeq()}@kientaohub.local`,
      ['buyer'],
    )
    actAs(reporter)

    const first = await reportProduct(
      reportRequest(publishedUnapprovedProduct.id, { reason: 'MISLEADING_PREVIEW' }),
      makeContext(publishedUnapprovedProduct.id),
    )
    expect(first.status).toBe(201)
    const firstBody = await first.json()
    caseIds.push(firstBody.case.id)
    expect(firstBody.case.status).toBe('OPEN')

    const second = await reportProduct(
      reportRequest(publishedUnapprovedProduct.id, { reason: 'SPAM' }),
      makeContext(publishedUnapprovedProduct.id),
    )
    expect(second.status).toBe(409)
    expect((await second.json()).error).toBe('DUPLICATE_REPORT')

    // The row's agreement invariant, in the same style as the matrix above.
    expect(page.outcome === 'rendered').toBe(first.status === 201)
  })

  it('R1b: a product the storefront shows is reportable — 201 first, then 409 for the same user', async () => {
    const reporter = await createUser(
      `agree-dup-${Date.now()}-${getSeq()}@kientaohub.local`,
      ['buyer'],
    )
    actAs(reporter)

    expect((await renderPage(publishedProduct.slug as string, false)).outcome).toBe('rendered')

    const first = await reportProduct(
      reportRequest(publishedProduct.id, { reason: 'SPAM' }),
      makeContext(publishedProduct.id),
    )
    expect(first.status).toBe(201)
    caseIds.push((await first.json()).case.id)

    const second = await reportProduct(
      reportRequest(publishedProduct.id, { reason: 'OTHER' }),
      makeContext(publishedProduct.id),
    )
    expect(second.status).toBe(409)
    expect((await second.json()).error).toBe('DUPLICATE_REPORT')
  })

  it('R2a/R2b: draft preview shows the unpublished product but never the report entry point', async () => {
    await setState('submitted')

    // Preview mode: staff see the unpublished product…
    const preview = await renderPage(unpublishedProduct.slug as string, true)
    expect(preview.outcome).toBe('rendered')
    // …but the report entry point is absent, decided on the server before any client
    // component exists (no CSS/JS hiding involved).
    expect(preview.html).not.toContain('id="report-section"')
    expect(preview.html).not.toContain('Báo cáo sản phẩm')

    // Ordinary visitors do not see the product at all.
    const normal = await renderPage(unpublishedProduct.slug as string, false)
    expect(normal.outcome).toBe('notFound')
    expect(normal.html).not.toContain('id="report-section"')

    // A published product rendered normally DOES carry the entry point.
    const published = await renderPage(publishedProduct.slug as string, false)
    expect(published.outcome).toBe('rendered')
    expect(published.html).toContain('id="report-section"')
    expect(published.html).toContain('Báo cáo sản phẩm')

    // The preview render is server-side only: the route itself still refuses the
    // unpublished product (no staff bypass leaked into the report contract).
    const reporter = await createUser(
      `agree-preview-${Date.now()}-${getSeq()}@kientaohub.local`,
      ['buyer'],
    )
    actAs(reporter)
    const res = await reportProduct(
      reportRequest(unpublishedProduct.id, { reason: 'SPAM' }),
      makeContext(unpublishedProduct.id),
    )
    expect(res.status).toBe(404)
    expect((await res.json()).error).toBe('PRODUCT_NOT_FOUND')
  })

  it('R2a: the entry point decision comes from the server page, not from the client component', async () => {
    // The dialog itself still renders for a guest when it IS mounted — i.e. the absence
    // in preview comes from the page's server-side gate, not from the component refusing
    // to render. This is the control that keeps the R2 assertion meaningful.
    await setState('rejected')
    const preview = await renderPage(unpublishedProduct.slug as string, true)
    expect(preview.outcome).toBe('rendered')
    expect(preview.html).not.toContain('id="report-section"')

    const { ProductReportDialog } = await import('@/components/product/ProductReportDialog')
    const mounted = renderToString(
      React.createElement(ProductReportDialog, {
        productId: unpublishedProduct.id,
        productTitle: 'FR-22 Agreement control',
      }),
    )
    expect(mounted).toContain('id="report-section"')
  })
})
