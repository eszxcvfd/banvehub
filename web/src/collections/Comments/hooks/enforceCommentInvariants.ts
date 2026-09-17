import type { CollectionBeforeValidateHook } from 'payload'
import { checkRole } from '@/access/utilities'

/**
 * Enforce Comments subsystem invariants (FR-21):
 * - Content validation: trimmed string with at least 3 characters and max 5000 characters.
 * - Anti-spoofing: non-privileged users cannot forge the author ID.
 * - Role badges detection: automatically set isSellerReply / isAdminReply based on product seller and user role.
 * - 1-level thread hierarchy: parent comment must exist, must belong to the same product, and must not itself be a reply.
 * - Moderation & updates: author can edit text or soft-delete (status = 'hidden'); immutable fields preserved.
 */
export const enforceCommentInvariants: CollectionBeforeValidateHook = async ({
  data,
  req,
  operation,
  originalDoc,
}) => {
  if (!data) return data

  const isPrivileged =
    !req.user ||
    Boolean(req?.context?.cascadeOperation) ||
    Boolean(req?.context?.internalOperation) ||
    checkRole(['admin', 'moderator'], req.user)

  // 1. Sanitize content
  if (typeof data.content === 'string') {
    data.content = data.content.trim()
  }

  // 2. Validate content length
  if (data.content !== undefined) {
    if (typeof data.content !== 'string' || data.content.length < 3) {
      throw new Error('Comment content must be at least 3 characters long.')
    }
    if (data.content.length > 5000) {
      throw new Error('Comment content must not exceed 5000 characters.')
    }
  } else if (operation === 'create') {
    throw new Error('Comment content is required.')
  }

  // 3. Enforce caller identity on create (Anti-Spoofing)
  if (!isPrivileged && req.user) {
    data.user = req.user.id
  } else if (!data.user && req.user) {
    data.user = req.user.id
  }

  const userId =
    typeof data.user === 'object' && data.user !== null ? (data.user as any).id : data.user
  const productId =
    typeof data.product === 'object' && data.product !== null
      ? (data.product as any).id
      : data.product

  if (userId) data.user = userId
  if (productId) data.product = productId

  // 4. Creation Invariants
  if (operation === 'create') {
    if (!data.status) {
      data.status = 'published'
    }

    if (!productId) {
      throw new Error('Product is required.')
    }

    if (!userId) {
      throw new Error('User is required.')
    }

    // Fetch product to determine seller context
    const productDoc = await req.payload.findByID({
      collection: 'products',
      id: productId,
      depth: 0,
      overrideAccess: true,
      req,
    })

    if (!productDoc) {
      throw new Error(`Product ${productId} not found.`)
    }

    const productSellerId =
      typeof productDoc.seller === 'object' && productDoc.seller !== null
        ? productDoc.seller.id
        : productDoc.seller

    // Role detection: Seller Reply / Admin Reply
    const isSeller = Boolean(userId && String(userId) === String(productSellerId))
    const isAdmin = req.user ? checkRole(['admin'], req.user) : false

    // Anti-spoofing: Non-privileged callers cannot forge seller/admin badges
    if (!isPrivileged) {
      data.isSellerReply = isSeller
      data.isAdminReply = isAdmin
    } else {
      data.isSellerReply = isSeller || Boolean(data.isSellerReply)
      data.isAdminReply = isAdmin || Boolean(data.isAdminReply)
    }

    // Threading / Parent Comment Validation (1-level reply threads)
    if (data.parent) {
      const parentId =
        typeof data.parent === 'object' && data.parent !== null
          ? (data.parent as any).id
          : data.parent

      data.parent = parentId

      const parentDoc = await req.payload.findByID({
        collection: 'comments',
        id: parentId,
        depth: 0,
        overrideAccess: true,
        req,
      })

      if (!parentDoc) {
        throw new Error(`Parent comment ${parentId} not found.`)
      }

      if (parentDoc.status !== 'published') {
        throw new Error('Cannot reply to a hidden or unapproved comment.')
      }

      const parentProductId =
        typeof parentDoc.product === 'object' && parentDoc.product !== null
          ? parentDoc.product.id
          : parentDoc.product

      if (String(parentProductId) !== String(productId)) {
        throw new Error('Parent comment does not belong to the same product.')
      }

      if (parentDoc.parent) {
        throw new Error('Cannot reply to a reply. Comments only support 1-level thread hierarchy.')
      }
    }
  }

  // 5. Update Invariants: Role separation & non-transferability
  if (operation === 'update' && originalDoc) {
    // Comment product relationship is immutable: a comment thread cannot be transferred to a different product
    data.product =
      typeof originalDoc.product === 'object' && originalDoc.product !== null
        ? originalDoc.product.id
        : originalDoc.product

    if (!isPrivileged) {
      // Preserve immutable relationships
      data.user =
        typeof originalDoc.user === 'object' && originalDoc.user !== null
          ? originalDoc.user.id
          : originalDoc.user

      data.parent =
        typeof originalDoc.parent === 'object' && originalDoc.parent !== null
          ? originalDoc.parent.id
          : originalDoc.parent

      data.isSellerReply = originalDoc.isSellerReply
      data.isAdminReply = originalDoc.isAdminReply

      const authorId =
        typeof originalDoc.user === 'object' && originalDoc.user !== null
          ? originalDoc.user.id
          : originalDoc.user
      const isAuthor = req.user && String(req.user.id) === String(authorId)

      if (!isAuthor) {
        throw new Error('Unauthorized: You do not have permission to update this comment.')
      }

      // Author can soft-delete by setting status to 'hidden', but cannot re-publish or set pending
      if (data.status !== undefined && data.status !== originalDoc.status) {
        if (data.status !== 'hidden') {
          data.status = originalDoc.status
        }
      } else {
        data.status = originalDoc.status
      }
    } else if (data.parent !== undefined && data.parent !== originalDoc.parent) {
      if (data.parent) {
        const parentId =
          typeof data.parent === 'object' && data.parent !== null
            ? (data.parent as any).id
            : data.parent
        data.parent = parentId

        if (String(parentId) === String(originalDoc.id)) {
          throw new Error('A comment cannot be its own parent.')
        }

        const parentDoc = await req.payload.findByID({
          collection: 'comments',
          id: parentId,
          depth: 0,
          overrideAccess: true,
          req,
        })
        if (!parentDoc) {
          throw new Error(`Parent comment ${parentId} not found.`)
        }
        if (parentDoc.status !== 'published') {
          throw new Error('Cannot link to a hidden or unapproved parent comment.')
        }
        const parentProductId =
          typeof parentDoc.product === 'object' && parentDoc.product !== null
            ? parentDoc.product.id
            : parentDoc.product
        if (String(parentProductId) !== String(data.product)) {
          throw new Error('Parent comment does not belong to the same product.')
        }
        if (parentDoc.parent) {
          throw new Error('Cannot reply to a reply. Comments only support 1-level thread hierarchy.')
        }
      }
    }
  }

  return data
}
