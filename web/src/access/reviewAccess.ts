import type { Access, Where } from 'payload'
import { checkRole } from '@/access/utilities'

/**
 * Read access for reviews:
 * - Admin and Moderator can view all reviews (published, pending, rejected).
 * - Authenticated users can view published reviews OR their own reviews.
 * - Unauthenticated users can view published reviews.
 */
export const reviewReadAccess: Access = ({ req: { user } }) => {
  if (user && checkRole(['admin', 'moderator'], user)) {
    return true
  }

  if (user) {
    const query: Where = {
      or: [
        {
          status: {
            equals: 'published',
          },
        },
        {
          user: {
            equals: user.id,
          },
        },
      ],
    }
    return query
  }

  return {
    status: {
      equals: 'published',
    },
  }
}

/**
 * Create access for reviews:
 * - Only authenticated users can initiate review creation.
 * - Active entitlement verification is enforced in the beforeValidate hook (BR-05).
 */
export const reviewCreateAccess: Access = ({ req: { user } }) => {
  return Boolean(user)
}

/**
 * Update access for reviews:
 * - Admin and Moderator can update any review.
 * - Review owner can edit their own review content / rating.
 * - Product seller can reply (update sellerReply).
 */
export const reviewUpdateAccess: Access = ({ req: { user } }) => {
  if (!user) return false

  if (checkRole(['admin', 'moderator'], user)) {
    return true
  }

  const query: Where = {
    or: [
      {
        user: {
          equals: user.id,
        },
      },
      {
        'product.seller': {
          equals: user.id,
        },
      },
    ],
  }

  return query
}

/**
 * Delete access for reviews:
 * - Only Admin can delete review records.
 */
export const reviewDeleteAccess: Access = ({ req: { user } }) => {
  if (!user) return false
  return checkRole(['admin'], user)
}
