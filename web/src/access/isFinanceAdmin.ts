import type { Access } from 'payload'

import { checkRole } from '@/access/utilities'

/**
 * PLAN.md §5.5 Finance Admin: views and reconciles payments, approves
 * withdrawals, refunds per policy, and reads the ledger.
 */
export const isFinanceAdmin: Access = ({ req: { user } }) => {
  if (user) return checkRole(['financeAdmin'], user)

  return false
}
