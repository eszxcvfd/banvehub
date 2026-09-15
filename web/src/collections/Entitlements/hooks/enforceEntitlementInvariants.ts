import type { CollectionBeforeChangeHook } from 'payload'

/**
 * Hook to enforce Entitlement lifecycle defaults and unique active entitlement invariant (R2, FR-16).
 */
export const enforceEntitlementInvariants: CollectionBeforeChangeHook = async ({
  data,
  req,
  operation,
  originalDoc,
}) => {
  // 1. Ensure grantedAt is populated upon creation
  if (operation === 'create' && !data.grantedAt) {
    data.grantedAt = new Date().toISOString()
  }

  // 2. Default downloadCount to 0 if undefined
  if (operation === 'create' && (data.downloadCount === undefined || data.downloadCount === null)) {
    data.downloadCount = 0
  }

  // 3. Auto-populate revokedAt when status transitions to 'revoked'
  if (data.status === 'revoked' && !data.revokedAt) {
    data.revokedAt = new Date().toISOString()
  }

  // 4. Invariant check: Only one active entitlement per (user, product)
  if (data.status === 'active') {
    const userId = typeof data.user === 'object' && data.user !== null ? data.user.id : data.user
    const productId =
      typeof data.product === 'object' && data.product !== null ? data.product.id : data.product

    if (userId && productId) {
      const existing = await req.payload.find({
        collection: 'entitlements',
        where: {
          and: [
            { user: { equals: userId } },
            { product: { equals: productId } },
            { status: { equals: 'active' } },
          ],
        },
        limit: 1,
        overrideAccess: true,
        req, // participate in active transaction if applicable
      })

      if (existing.totalDocs > 0) {
        const existingDoc = existing.docs[0]
        const currentDocId = operation === 'update' ? (originalDoc?.id ?? data.id) : null
        if (currentDocId !== existingDoc.id) {
          throw new Error(
            `Invariant Violation: User ${userId} already has an active entitlement for product ${productId}. Duplicate active entitlements are prohibited.`,
          )
        }
      }
    }
  }

  return data
}
