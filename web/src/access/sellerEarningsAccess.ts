import type { Access, Where } from 'payload'
import { checkRole } from '@/access/utilities'

/**
 * Read access for seller earnings:
 * - Admin and FinanceAdmin can view all earnings across the platform (PLAN.md §5.5, §22).
 * - Authenticated sellers can only view their own earnings.
 * - Buyers and unauthenticated guests are denied.
 */
export const sellerEarningsReadAccess: Access = ({ req: { user } }) => {
  if (!user) return false

  if (checkRole(['admin', 'financeAdmin'], user)) {
    return true
  }

  const query: Where = {
    seller: {
      equals: user.id,
    },
  }

  return query
}
