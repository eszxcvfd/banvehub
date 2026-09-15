import type { Access } from 'payload'

import { checkRole } from '@/access/utilities'

/**
 * PLAN.md §22 grants product moderation to Moderator and Admin only.
 */
export const adminOrModerator: Access = ({ req: { user } }) => {
  if (user) return checkRole(['admin', 'moderator'], user)

  return false
}
