import type { Access, Where } from 'payload'
import { checkRole } from '@/access/utilities'

/**
 * Access control for reading wallets:
 * - Admin and FinanceAdmin can view all wallets (PLAN.md §22)
 * - Authenticated users can only view their own wallet
 * - Unauthenticated users are denied
 */
export const walletReadAccess: Access = ({ req: { user } }) => {
  if (!user) return false

  if (checkRole(['admin', 'financeAdmin'], user)) {
    return true
  }

  const query: Where = {
    user: {
      equals: user.id,
    },
  }

  return query
}

/**
 * Access control for reading financial ledger entries:
 * - Admin and FinanceAdmin can view all ledger entries
 * - Authenticated users can only view their own ledger entries
 * - Unauthenticated users are denied
 */
export const walletLedgerReadAccess: Access = ({ req: { user } }) => {
  if (!user) return false

  if (checkRole(['admin', 'financeAdmin'], user)) {
    return true
  }

  const query: Where = {
    user: {
      equals: user.id,
    },
  }

  return query
}

/**
 * Access control for reading payment intents:
 * - Admin and FinanceAdmin can view all intents
 * - Authenticated users can view their own intents
 * - Unauthenticated users are denied
 */
export const paymentIntentReadAccess: Access = ({ req: { user } }) => {
  if (!user) return false

  if (checkRole(['admin', 'financeAdmin'], user)) {
    return true
  }

  const query: Where = {
    user: {
      equals: user.id,
    },
  }

  return query
}

/**
 * Access control for reading payment transactions:
 * - Admin and FinanceAdmin can view all transactions
 * - Authenticated users can view transactions belonging to them
 * - Unauthenticated users are denied
 */
export const paymentTransactionReadAccess: Access = ({ req: { user } }) => {
  if (!user) return false

  if (checkRole(['admin', 'financeAdmin'], user)) {
    return true
  }

  const query: Where = {
    user: {
      equals: user.id,
    },
  }

  return query
}

/**
 * Access control for webhook events:
 * - Only Admin and FinanceAdmin can inspect logged webhook payloads
 */
export const webhookEventReadAccess: Access = ({ req: { user } }) => {
  if (!user) return false
  return checkRole(['admin', 'financeAdmin'], user)
}
