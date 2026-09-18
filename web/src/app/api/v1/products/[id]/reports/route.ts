import { NextResponse } from 'next/server'
import { getPayload } from 'payload'
import configPromise from '@payload-config'
import { headers as getHeaders } from 'next/headers'
import {
  MODERATION_CASE_REASONS,
  isModerationCaseReason,
} from '@/collections/ModerationCases/reasons'

type RouteContext = {
  params: Promise<{
    id: string
  }>
}

/** Statuses that still count as an open case for the duplicate-report guard. */
const OPEN_CASE_STATUSES = ['OPEN', 'IN_REVIEW']

const MAX_DESCRIPTION_LENGTH = 2000

/**
 * Resolve the product from a route param that may be either the numeric id or the slug.
 * Same contract as the FR-21 comments route.
 */
async function resolveProductId(payload: any, paramId: string): Promise<number | null> {
  const trimmed = paramId?.trim()
  if (!trimmed) return null

  if (/^\d+$/.test(trimmed)) {
    const id = parseInt(trimmed, 10)
    if (id > 0) {
      const prodRes = await payload.find({
        collection: 'products',
        where: {
          id: {
            equals: id,
          },
        },
        limit: 1,
        depth: 0,
        overrideAccess: true,
      })
      if (prodRes.totalDocs > 0) {
        return prodRes.docs[0].id
      }
    }
  }

  const prods = await payload.find({
    collection: 'products',
    where: {
      slug: {
        equals: trimmed,
      },
    },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  })

  if (prods.totalDocs > 0) {
    return prods.docs[0].id
  }

  return null
}

/**
 * The still-open case of `(reporter, product)`, if any — the duplicate guard shared by
 * the pre-check and the post-failure re-check below. Returns `null` when the lookup
 * itself fails so a broken read can never be mistaken for a duplicate.
 */
async function findOpenCase(payload: any, reporterId: number | string, productId: number) {
  try {
    const existing = await payload.find({
      collection: 'moderation_cases',
      where: {
        and: [
          { reporter: { equals: reporterId } },
          { product: { equals: productId } },
          { status: { in: OPEN_CASE_STATUSES } },
        ],
      },
      limit: 1,
      depth: 0,
      overrideAccess: true,
    })

    return existing.totalDocs > 0 ? existing.docs[0] : null
  } catch {
    return null
  }
}

/** Only the caller's own case is ever serialized — never another user's attribution. */
function formatCase(doc: any, reporterId: number | string) {
  const productId =
    typeof doc.product === 'object' && doc.product !== null ? doc.product.id : doc.product

  return {
    id: doc.id,
    productId,
    reporterId: typeof doc.reporter === 'object' && doc.reporter !== null ? doc.reporter.id : reporterId,
    reason: doc.reason,
    description: doc.description ?? null,
    status: doc.status,
    resolutionNotes: doc.resolutionNotes ?? null,
    resolvedAt: doc.resolvedAt ?? null,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  }
}

/**
 * POST /api/v1/products/[id]/reports — report a product (FR-22, PLAN.md:797-810).
 *
 * Contract (owner decision 2026-09-18, following the FR-21/FR-23 precedent):
 * - `401 UNAUTHORIZED` — only signed-in users may report; guests are invited to log in.
 * - `404 PRODUCT_NOT_FOUND` — the id/slug does not resolve to a product.
 * - `400 INVALID_REQUEST | INVALID_REASON | INVALID_DESCRIPTION` — malformed body, a
 *   reason outside the seven FR-22 values, or an oversized description.
 * - `409 DUPLICATE_REPORT` — this user already has an OPEN/IN_REVIEW case for this
 *   product. Enforced here *and* by the partial unique index on
 *   `(reporter_id, product_id)` created in
 *   `src/migrations/20260918_000000_phase10_moderation_cases.ts`.
 * - `201 { success: true, case }` — exactly one `moderation_cases` row.
 *
 * Reporting is deliberately side-effect free on the catalog: nothing in this handler
 * touches `products.moderationStatus`, `products._status` or storefront availability.
 * The case waits for a Moderator/Admin decision in the Payload admin (ADR 0001).
 */
export async function POST(req: Request, context: RouteContext) {
  try {
    const { id: paramId } = await context.params

    let headers: Headers
    try {
      headers = await getHeaders()
    } catch {
      headers = req.headers
    }

    const payload = await getPayload({ config: configPromise })
    const { user } = await payload.auth({ headers })

    if (!user) {
      return NextResponse.json(
        {
          error: 'UNAUTHORIZED',
          message: 'Yêu cầu đăng nhập để báo cáo sản phẩm.',
        },
        { status: 401 },
      )
    }

    const productId = await resolveProductId(payload, paramId)
    if (!productId) {
      return NextResponse.json(
        {
          error: 'PRODUCT_NOT_FOUND',
          message: 'Không tìm thấy sản phẩm.',
        },
        { status: 404 },
      )
    }

    let body: any
    try {
      body = await req.json()
    } catch {
      return NextResponse.json(
        {
          error: 'INVALID_REQUEST',
          message: 'Dữ liệu yêu cầu không hợp lệ (yêu cầu định dạng JSON).',
        },
        { status: 400 },
      )
    }

    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return NextResponse.json(
        {
          error: 'INVALID_REQUEST',
          message: 'Dữ liệu yêu cầu không hợp lệ.',
        },
        { status: 400 },
      )
    }

    // Exactly the seven FR-22 reasons, nothing else.
    const rawReason = typeof body.reason === 'string' ? body.reason.trim() : body.reason
    if (!isModerationCaseReason(rawReason)) {
      return NextResponse.json(
        {
          error: 'INVALID_REASON',
          message: `Lý do báo cáo (reason) không hợp lệ. Phải là một trong: ${MODERATION_CASE_REASONS.join(', ')}.`,
        },
        { status: 400 },
      )
    }

    // Description is optional; blank input is treated as "not provided".
    let description: string | undefined
    const rawDescription = body.description
    if (rawDescription !== undefined && rawDescription !== null) {
      if (typeof rawDescription !== 'string') {
        return NextResponse.json(
          {
            error: 'INVALID_DESCRIPTION',
            message: 'Mô tả báo cáo (description) phải là chuỗi ký tự.',
          },
          { status: 400 },
        )
      }

      const trimmedDescription = rawDescription.trim()
      if (trimmedDescription.length > MAX_DESCRIPTION_LENGTH) {
        return NextResponse.json(
          {
            error: 'INVALID_DESCRIPTION',
            message: `Mô tả báo cáo không được vượt quá ${MAX_DESCRIPTION_LENGTH} ký tự.`,
          },
          { status: 400 },
        )
      }

      if (trimmedDescription.length > 0) {
        description = trimmedDescription
      }
    }

    // Duplicate guard: one still-open case per (reporter, product).
    if (await findOpenCase(payload, user.id, productId)) {
      return NextResponse.json(
        {
          error: 'DUPLICATE_REPORT',
          message: 'Bạn đã có một báo cáo đang chờ xử lý cho sản phẩm này.',
        },
        { status: 409 },
      )
    }

    let createdCase: any
    try {
      createdCase = await payload.create({
        collection: 'moderation_cases',
        data: {
          product: productId,
          reporter: user.id,
          reason: rawReason,
          description,
          status: 'OPEN',
        },
        user,
        depth: 0,
        overrideAccess: true,
      })
    } catch (createError: any) {
      // A concurrent report for the same (reporter, product) can win between the
      // pre-check and this INSERT; PostgreSQL then refuses the row through
      // `moderation_cases_open_reporter_product_idx` and the adapter rewraps the driver
      // error as a generic validation failure. Re-read the pair instead of pattern
      // matching driver internals: an open case that exists *now* is the duplicate;
      // anything else is a genuine failure and surfaces as 500.
      if (await findOpenCase(payload, user.id, productId)) {
        return NextResponse.json(
          {
            error: 'DUPLICATE_REPORT',
            message: 'Bạn đã có một báo cáo đang chờ xử lý cho sản phẩm này.',
          },
          { status: 409 },
        )
      }
      throw createError
    }

    return NextResponse.json(
      {
        success: true,
        case: formatCase(createdCase, user.id),
      },
      { status: 201 },
    )
  } catch (error: any) {
    console.error('Error creating moderation case:', error)
    return NextResponse.json(
      {
        error: 'INTERNAL_ERROR',
        message: 'Đã xảy ra lỗi khi gửi báo cáo sản phẩm.',
      },
      { status: 500 },
    )
  }
}
