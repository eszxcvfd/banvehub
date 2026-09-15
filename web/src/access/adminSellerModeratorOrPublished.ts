import type { Access } from 'payload'

import { checkRole } from '@/access/utilities'

/**
 * Access control rule for catalog entities with draft/published lifecycle:
 * - Public / guests, buyers, and finance admins can only read published items.
 * - Admin, seller, and moderator roles can read all items (both draft and published).
 *
 * Adheres to PLAN.md §5, §22, and Decision 0008.
 */
export const adminSellerModeratorOrPublished: Access = ({ req: { user } }) => {
  if (user && checkRole(['admin', 'seller', 'moderator'], user)) {
    return true
  }

  return {
    _status: {
      equals: 'published',
    },
  }
}
