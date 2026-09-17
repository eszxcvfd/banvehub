import type { CollectionBeforeValidateHook } from 'payload'
import { checkRole } from '@/access/utilities'

/**
 * Enforce Review invariants:
 * - BR-05: Review must be linked to an active entitlement for (user, product).
 * - Anti-abuse / Uniqueness: Exactly one review per (user, product) pair.
 * - Rating bounds: Integer between 1 and 5.
 * - Content bounds: Trimmed string with at least 5 characters.
 * - Seller reply timestamp population.
 */
export const enforceReviewInvariants: CollectionBeforeValidateHook = async ({
  data,
  req,
  operation,
  originalDoc,
}) => {
  if (!data) return data

  const isPrivileged = req.user
    ? checkRole(['admin', 'moderator'], req.user)
    : Boolean((req as any)?.overrideAccess)

  // 1. Sanitize content and title strings
  if (typeof data.content === 'string') {
    data.content = data.content.trim()
  }

  if (typeof data.title === 'string') {
    data.title = data.title.trim()
  }

  // 2. Rating bounds validation
  if (data.rating !== undefined) {
    const numRating = Number(data.rating)
    if (
      typeof data.rating === 'boolean' ||
      data.rating === null ||
      !Number.isInteger(numRating) ||
      numRating < 1 ||
      numRating > 5
    ) {
      throw new Error('Rating must be an integer between 1 and 5.')
    }
    data.rating = numRating
  } else if (operation === 'create') {
    throw new Error('Rating is required.')
  }

  // 3. Content length validation
  if (data.content !== undefined) {
    if (typeof data.content !== 'string' || data.content.length < 5) {
      throw new Error('Review content must be at least 5 characters long.')
    }
    if (data.content.length > 5000) {
      throw new Error('Review content must not exceed 5000 characters.')
    }
  } else if (operation === 'create') {
    throw new Error('Review content is required.')
  }

  // Title length validation
  if (data.title && typeof data.title === 'string' && data.title.length > 200) {
    throw new Error('Review title must not exceed 200 characters.')
  }

  // Enforce caller identity on create (Anti-Spoofing): non-privileged users cannot spoof another user
  if (!isPrivileged && req.user) {
    data.user = req.user.id
  } else if (!data.user && req.user) {
    data.user = req.user.id
  }

  // 4. Creation Invariants (BR-05, Uniqueness & Anti-Spoofing)
  if (operation === 'create') {
    if (!data.status) {
      data.status = 'published'
    }
    if (!isPrivileged) {
      delete (data as any).sellerReply
    }

    const userId =
      typeof data.user === 'object' && data.user !== null ? (data.user as any).id : data.user
    const productId =
      typeof data.product === 'object' && data.product !== null
        ? (data.product as any).id
        : data.product

    if (userId) data.user = userId
    if (productId) data.product = productId

    if (userId && productId) {
      // 4.1 Duplicate check: single review per buyer-product pair
      const existingReviews = await req.payload.find({
        collection: 'reviews',
        where: {
          and: [
            { user: { equals: userId } },
            { product: { equals: productId } },
          ],
        },
        limit: 1,
        overrideAccess: true,
        req,
      })

      if (existingReviews.totalDocs > 0) {
        throw new Error(
          `Duplicate review: User ${userId} has already reviewed product ${productId}.`,
        )
      }

      // 4.2 BR-05 Verified purchase check: user must hold an active entitlement
      const activeEntitlements = await req.payload.find({
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
        req,
      })

      if (activeEntitlements.totalDocs === 0) {
        throw new Error(
          `Verified purchase required (BR-05): User ${userId} does not hold an active entitlement for product ${productId}.`,
        )
      }

      // 4.3 Link entitlement if not explicitly provided
      if (!data.entitlement) {
        data.entitlement = activeEntitlements.docs[0].id
      } else {
        const entId =
          typeof data.entitlement === 'object' && data.entitlement !== null
            ? (data.entitlement as any).id
            : data.entitlement
        const matchesActive = activeEntitlements.docs.some(
          (doc: any) => String(doc.id) === String(entId),
        )
        if (!matchesActive) {
          throw new Error(
            `Invalid entitlement: Entitlement ${entId} is not an active verified purchase for product ${productId}.`,
          )
        }
        data.entitlement = entId
      }
    }
  }

  // 5. Update Invariants: Role separation & non-transferability
  if (operation === 'update' && originalDoc) {
    if (!isPrivileged) {
      // Preserve immutable relationships and moderation status
      data.user =
        typeof originalDoc.user === 'object' && originalDoc.user !== null
          ? originalDoc.user.id
          : originalDoc.user

      data.product =
        typeof originalDoc.product === 'object' && originalDoc.product !== null
          ? originalDoc.product.id
          : originalDoc.product

      data.entitlement =
        typeof originalDoc.entitlement === 'object' && originalDoc.entitlement !== null
          ? originalDoc.entitlement.id
          : originalDoc.entitlement

      data.status = originalDoc.status

      const authorId =
        typeof originalDoc.user === 'object' && originalDoc.user !== null
          ? originalDoc.user.id
          : originalDoc.user
      const isAuthor = req.user && String(req.user.id) === String(authorId)

      if (isAuthor) {
        // Buyer author CANNOT tamper with or forge seller reply
        data.sellerReply = originalDoc.sellerReply
      } else {
        // Non-author must be the product's seller
        const productDoc =
          typeof originalDoc.product === 'object' && originalDoc.product !== null
            ? originalDoc.product
            : await req.payload.findByID({
                collection: 'products',
                id: originalDoc.product,
                depth: 0,
                overrideAccess: true,
                req,
              })
        const productSellerId =
          typeof productDoc?.seller === 'object' && productDoc.seller !== null
            ? productDoc.seller.id
            : productDoc?.seller

        if (!req.user || String(req.user.id) !== String(productSellerId)) {
          throw new Error('Unauthorized: You do not have permission to update this review.')
        }

        // Product seller CANNOT tamper with buyer rating, title, or content
        data.rating = originalDoc.rating
        data.title = originalDoc.title
        data.content = originalDoc.content
      }
    }
  }

  // 6. Seller reply sanitization, validation & timestamp auto-population
  if (data.sellerReply !== undefined) {
    if (data.sellerReply === null) {
      data.sellerReply = { comment: null, repliedAt: null }
    } else if (typeof data.sellerReply !== 'object' || Array.isArray(data.sellerReply)) {
      throw new Error('Seller reply must be an object.')
    } else {
      if (data.sellerReply.comment !== undefined && data.sellerReply.comment !== null) {
        if (typeof data.sellerReply.comment !== 'string') {
          throw new Error('Seller reply comment must be a string.')
        }
        data.sellerReply.comment = data.sellerReply.comment.trim()
        if (data.sellerReply.comment.length > 5000) {
          throw new Error('Seller reply must not exceed 5000 characters.')
        }
        if (data.sellerReply.comment.length === 0) {
          data.sellerReply.comment = null
          data.sellerReply.repliedAt = null
        }
      }
      if (data.sellerReply.comment && !data.sellerReply.repliedAt) {
        data.sellerReply.repliedAt = new Date().toISOString()
      }
    }
  }

  return data
}
