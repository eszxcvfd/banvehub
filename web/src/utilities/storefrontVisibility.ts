import type { Where } from 'payload'

/**
 * The SINGLE OWNER of the storefront catalog visibility rule (FR-22 repair R1/t7).
 *
 * Two surfaces must agree on which products the storefront shows:
 *
 * 1. `src/app/(app)/products/[slug]/page.tsx` — `queryProductBySlug` serves a product
 *    page only when it is `_status === 'published'`, except in draft-preview mode
 *    (`draftMode().isEnabled`), where staff preview unpublished content.
 * 2. `src/app/api/v1/products/[id]/reports/route.ts` — the report route has no
 *    draft-preview mode, so it must refuse to open a moderation case for anything the
 *    storefront hides, and answer `404 PRODUCT_NOT_FOUND` exactly like an unknown
 *    product (never leaking that a draft/rejected product exists).
 *
 * Both call sites build their `payload.find({ collection: 'products' })` where-clause
 * through this module instead of copying the clause, so a change of policy cannot drift
 * between the two surfaces. `tests/int/product-report-agreement.int.spec.ts` proves the
 * agreement behaviourally (page render ⇔ report status) and is drift-sensitive: mutating
 * the rule here turns it red.
 *
 * Not to be confused with `src/utilities/home-static.ts`, which is seed data for a
 * `pages` document and not a visibility rule.
 */
export type StorefrontProductSelector = {
  id?: number
  slug?: string
}

export type StorefrontVisibilityOptions = {
  /** Draft-preview mode of the product page: unpublished products are visible. */
  draftMode?: boolean
}

/**
 * The visibility clause alone. In draft-preview mode nothing is restricted; otherwise
 * only published products are visible.
 *
 * A fresh object is returned per call because the clause is handed to Payload's query
 * builder, which may annotate it.
 */
export const storefrontVisibilityWhere = ({
  draftMode = false,
}: StorefrontVisibilityOptions = {}): Where =>
  draftMode ? {} : { _status: { equals: 'published' } }

/**
 * Selector + visibility combined into the `and` clause used by
 * `payload.find({ collection: 'products' })`: look a product up by id and/or slug and
 * apply the storefront visibility rule in one place.
 */
export const storefrontProductWhere = (
  selector: StorefrontProductSelector,
  options: StorefrontVisibilityOptions = {},
): Where => {
  const filters: Where[] = []

  if (selector.id !== undefined) {
    filters.push({ id: { equals: selector.id } })
  }

  if (selector.slug !== undefined) {
    filters.push({ slug: { equals: selector.slug } })
  }

  const visibility = storefrontVisibilityWhere(options)
  if (Object.keys(visibility).length > 0) {
    filters.push(visibility)
  }

  return filters.length > 0 ? { and: filters } : {}
}
