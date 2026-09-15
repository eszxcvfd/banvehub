import type { Access } from 'payload'

import { checkRole } from '@/access/utilities'

/**
 * PLAN.md §22 grants product creation to Seller and Admin only.
 */
export const adminOrSeller: Access = ({ req: { user } }) => {
  if (user) return checkRole(['admin', 'seller'], user)

  return false
}
