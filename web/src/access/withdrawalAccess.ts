import type { Access, Where } from 'payload'
import { checkRole } from '@/access/utilities'
import { canEditMoney } from '@/access/canEditMoney'

/**
 * Access control for Withdrawals & Withdrawal Events
 *
 * Rules:
 * - Direct writes (create, update, delete) via REST/GraphQL are denied for ALL principals (Decision 0002).
 *   Withdrawals and audit events must be created/modified exclusively through dedicated backend
 *   services using `overrideAccess: true`.
 * - Super Admin and FinanceAdmin can read all withdrawals and events (PLAN.md §22).
 * - Sellers can read only their own withdrawals and associated audit events.
 * - Buyers and unauthenticated users are denied.
 */

// Direct collection write denial via REST/GraphQL
export const withdrawalCreateAccess: Access = canEditMoney
export const withdrawalUpdateAccess: Access = canEditMoney
export const withdrawalDeleteAccess: Access = canEditMoney

export const withdrawalEventCreateAccess: Access = canEditMoney
export const withdrawalEventUpdateAccess: Access = canEditMoney
export const withdrawalEventDeleteAccess: Access = canEditMoney

/**
 * Read access for withdrawals:
 * - Super Admin & FinanceAdmin: full read
 * - Seller: read own withdrawals (where seller === req.user.id)
 * - Others: denied
 */
export const withdrawalReadAccess: Access = ({ req: { user } }) => {
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

/**
 * Read access for withdrawal events:
 * - Super Admin & FinanceAdmin: full read
 * - Seller: read events corresponding to own withdrawals
 * - Others: denied
 */
export const withdrawalEventReadAccess: Access = ({ req: { user } }) => {
  if (!user) return false

  if (checkRole(['admin', 'financeAdmin'], user)) {
    return true
  }

  const query: Where = {
    'withdrawal.seller': {
      equals: user.id,
    },
  }

  return query
}
