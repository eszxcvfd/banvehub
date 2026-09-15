import type { Access } from 'payload'

import { checkRole } from '@/access/utilities'

/**
 * PLAN.md §5.2 Buyer: a signed-in account that can purchase, download what it
 * owns, review, favourite, and open support tickets.
 */
export const isBuyer: Access = ({ req: { user } }) => {
  if (user) return checkRole(['buyer'], user)

  return false
}
