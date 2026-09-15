import type { Access } from 'payload'

import { checkRole } from '@/access/utilities'

/**
 * PLAN.md §5.3 Seller: an activated account that creates products and is paid
 * for sales.
 */
export const isSeller: Access = ({ req: { user } }) => {
  if (user) return checkRole(['seller'], user)

  return false
}
