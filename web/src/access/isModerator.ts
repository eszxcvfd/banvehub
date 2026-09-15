import type { Access } from 'payload'

import { checkRole } from '@/access/utilities'

/**
 * PLAN.md §5.4 Moderator: approves, rejects, hides, and reviews products and
 * reports. A moderator may not adjust a balance or approve a withdrawal, which
 * PLAN.md §22 expresses by denying those actions to this role.
 */
export const isModerator: Access = ({ req: { user } }) => {
  if (user) return checkRole(['moderator'], user)

  return false
}
