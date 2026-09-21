import configPromise from '@payload-config'
import { getPayload } from 'payload'

/**
 * Real aggregates for the storefront's product cards and detail page.
 *
 * Every number a card shows must be derivable from the record it describes, so this module answers the
 * only two aggregates the UI uses from the collections that actually hold them:
 *   - downloads: `download_events` rows with `status = 'SUCCESS'` for that product
 *   - rating/count: `reviews` rows with `status = 'published'` for that product
 *
 * A product with no rows gets `0` downloads and `reviewCount: 0` / `ratingAverage: null`, and the
 * components omit the element instead of showing an invented number.
 *
 * Server-only (imports Payload); call it from server components and pass the result down.
 */

export type ProductStats = {
  downloads: number
  reviewCount: number
  ratingAverage: number | null
}

const EMPTY: ProductStats = { downloads: 0, reviewCount: 0, ratingAverage: null }

const numericIds = (ids: Array<number | string | null | undefined>): number[] =>
  Array.from(
    new Set(
      ids
        .map((id) => Number(id))
        .filter((id) => Number.isInteger(id) && id > 0),
    ),
  )

export async function getProductStats(
  productIds: Array<number | string | null | undefined>,
): Promise<Record<string, ProductStats>> {
  const ids = numericIds(productIds)
  const stats: Record<string, ProductStats> = {}
  for (const id of ids) stats[String(id)] = { ...EMPTY }

  if (ids.length === 0) return stats

  const payload = await getPayload({ config: configPromise })

  const [downloads, reviews] = await Promise.all([
    payload.find({
      collection: 'download_events',
      where: { and: [{ product: { in: ids } }, { status: { equals: 'SUCCESS' } }] },
      limit: 2000,
      pagination: false,
      depth: 0,
      overrideAccess: true,
    }),
    payload.find({
      collection: 'reviews',
      where: { and: [{ product: { in: ids } }, { status: { equals: 'published' } }] },
      limit: 2000,
      pagination: false,
      depth: 0,
      overrideAccess: true,
    }),
  ])

  for (const row of downloads.docs) {
    const entry = stats[String(Number((row as { product?: number }).product))]
    if (entry) entry.downloads += 1
  }

  for (const row of reviews.docs) {
    const entry = stats[String(Number((row as { product?: number }).product))]
    if (!entry) continue
    const rating = Number((row as { rating?: number }).rating ?? 0)
    entry.ratingAverage =
      entry.ratingAverage === null
        ? rating
        : (entry.ratingAverage * entry.reviewCount + rating) / (entry.reviewCount + 1)
    entry.reviewCount += 1
  }

  return stats
}

/**
 * The seller's real display name per seller (user) id: `seller_profiles.display_name` when the seller
 * has a profile, the account's own `name` otherwise. An id with neither is absent from the map, and the
 * card omits the attribution row rather than inventing a name.
 */
export async function getSellerNames(
  sellerIds: Array<number | string | null | undefined>,
): Promise<Record<string, string>> {
  const ids = numericIds(sellerIds)
  const names: Record<string, string> = {}
  if (ids.length === 0) return names

  const payload = await getPayload({ config: configPromise })

  const [profiles, users] = await Promise.all([
    payload.find({
      collection: 'seller_profiles',
      where: { user: { in: ids } },
      limit: 1000,
      pagination: false,
      depth: 0,
      overrideAccess: true,
    }),
    payload.find({ collection: 'users', where: { id: { in: ids } }, limit: 1000, pagination: false, depth: 0, overrideAccess: true }),
  ])

  for (const user of users.docs) {
    const name = String((user as { name?: string }).name ?? '').trim()
    if (name) names[String(Number((user as { id: number }).id))] = name
  }

  for (const profile of profiles.docs) {
    const displayName = String((profile as { displayName?: string }).displayName ?? '').trim()
    const userId = String(Number((profile as { user?: number }).user))
    if (displayName) names[userId] = displayName
  }

  return names
}

/** The seller (user) id of a product whose `seller` may be an id or a populated object. */
export const sellerIdOf = (seller: unknown): number | null => {
  if (seller === null || seller === undefined) return null
  const id = typeof seller === 'object' ? (seller as { id?: number | string }).id : seller
  const numeric = Number(id)
  return Number.isInteger(numeric) && numeric > 0 ? numeric : null
}

/**
 * `{ [productId]: sellerDisplayName }` for a page's product list: the shape both grids pass down, so a
 * card never has to guess a seller and never shows one product's seller under another's name.
 */
export const sellerNamesByProduct = (
  products: Array<{ id?: number | string | null; seller?: unknown }>,
  sellerNames: Record<string, string>,
): Record<string, string> => {
  const byProduct: Record<string, string> = {}
  for (const product of products) {
    const sellerId = sellerIdOf(product.seller)
    const name = sellerId === null ? '' : (sellerNames[String(sellerId)] ?? '')
    if (product.id !== null && product.id !== undefined && name) byProduct[String(product.id)] = name
  }
  return byProduct
}
