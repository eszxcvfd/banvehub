import type { Access } from 'payload'
import { checkRole } from '@/access/utilities'

/**
 * Access rule for private original files (BR-06 & Decision 0006):
 * - Admin and Moderator have full read access for inspection and auditing.
 * - Authenticated Seller can only read their own uploaded files.
 * - Public guests and regular buyers are STRICTLY DENIED direct access.
 *   (Purchased downloads are gated by short-lived signed tokens in Phase 5).
 */
export const productFileReadAccess: Access = ({ req: { user } }) => {
  if (!user) return false

  if (checkRole(['admin', 'moderator'], user)) {
    return true
  }

  if (checkRole(['seller'], user)) {
    return {
      seller: {
        equals: user.id,
      },
    }
  }

  return false
}

/**
 * Update access: Admin, Moderator, or the seller who owns the file.
 */
export const productFileUpdateAccess: Access = ({ req: { user } }) => {
  if (!user) return false

  if (checkRole(['admin', 'moderator'], user)) {
    return true
  }

  if (checkRole(['seller'], user)) {
    return {
      seller: {
        equals: user.id,
      },
    }
  }

  return false
}

/**
 * Delete access: Admin, Moderator, or the seller who owns the file.
 */
export const productFileDeleteAccess: Access = ({ req: { user } }) => {
  if (!user) return false

  if (checkRole(['admin'], user)) {
    return true
  }

  if (checkRole(['seller'], user)) {
    return {
      seller: {
        equals: user.id,
      },
    }
  }

  return false
}
