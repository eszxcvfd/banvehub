import type { Access, Where } from 'payload'
import { checkRole } from '@/access/utilities'

/**
 * Access control for reading refunds (PLAN.md §5.5, §22):
 * - Admin and FinanceAdmin can view all refund records.
 * - Authenticated buyers can view refunds for their purchases.
 * - Authenticated sellers can view refunds for their sold products.
 * - Unauthenticated users and unrelated roles are denied.
 */
export const refundReadAccess: Access = ({ req: { user } }) => {
  if (!user) return false

  if (checkRole(['admin', 'financeAdmin'], user)) {
    return true
  }

  const query: Where = {
    or: [
      {
        buyer: {
          equals: user.id,
        },
      },
      {
        seller: {
          equals: user.id,
        },
      },
    ],
  }

  return query
}
