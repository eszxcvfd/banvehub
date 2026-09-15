import type { Access, Where } from 'payload'
import { checkRole } from '@/access/utilities'

/**
 * Access rule for reading entitlements (PLAN.md §22, FR-16, Decision 0006):
 * - Admin and FinanceAdmin can view all entitlements.
 * - Authenticated users can view only their own active entitlements.
 * - Unauthenticated users (guests) are denied.
 */
export const entitlementReadAccess: Access = ({ req: { user } }) => {
  if (!user) return false

  if (checkRole(['admin', 'financeAdmin'], user)) {
    return true
  }

  const query: Where = {
    and: [
      {
        user: {
          equals: user.id,
        },
      },
      {
        status: {
          equals: 'active',
        },
      },
    ],
  }

  return query
}

/**
 * Access rule for updating entitlements:
 * - Admin only (for revocation, setting expiresAt, or adding administrative reasons).
 * - All other users are denied direct updates.
 */
export const entitlementUpdateAccess: Access = ({ req: { user } }) => {
  if (!user) return false
  return checkRole(['admin'], user)
}

/**
 * Direct create and delete operations via REST API are strictly denied.
 * Entitlements are created exclusively via transactional checkout or free-download services
 * on the server using `overrideAccess: true`.
 * Hard deletion is forbidden to preserve the ownership ledger.
 */
export const entitlementNoDirectWrite: Access = () => false
