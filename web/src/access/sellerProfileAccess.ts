import type { Access, FieldAccess, Where } from 'payload'
import { checkRole } from '@/access/utilities'

/**
 * Read access for seller profiles:
 * - Admin and Moderator can read any profile.
 * - Authenticated user can read their own profile (even if pending or suspended).
 * - Public guests can read active profiles (for store attribution and public seller pages).
 */
export const sellerProfileReadAccess: Access = ({ req: { user } }) => {
  if (user && checkRole(['admin', 'moderator'], user)) {
    return true
  }

  if (user?.id) {
    const where: Where = {
      or: [
        {
          status: {
            equals: 'active',
          },
        },
        {
          user: {
            equals: user.id,
          },
        },
      ],
    }
    return where
  }

  const publicWhere: Where = {
    status: {
      equals: 'active',
    },
  }
  return publicWhere
}

/**
 * Update access for seller profiles:
 * - Admin and Moderator can update any profile.
 * - Authenticated user can update their own profile.
 */
export const sellerProfileUpdateAccess: Access = ({ req: { user } }) => {
  if (!user) return false

  if (checkRole(['admin', 'moderator'], user)) {
    return true
  }

  const where: Where = {
    user: {
      equals: user.id,
    },
  }
  return where
}

/**
 * Field-level access for administrative fields like status, totalSales, rating:
 * Only Admin and Moderator can update these fields.
 */
export const adminOrModeratorFieldAccess: FieldAccess = ({ req: { user } }) => {
  if (user) {
    return checkRole(['admin', 'moderator'], user)
  }
  return false
}

/**
 * Field-level access for financial administrative fields (e.g. commissionRate):
 * Only Admin and FinanceAdmin can update this field.
 */
export const adminOrFinanceAdminFieldAccess: FieldAccess = ({ req: { user } }) => {
  if (user) {
    return checkRole(['admin', 'financeAdmin'], user)
  }
  return false
}

/**
 * Field-level read access for commissionRate:
 * Admin, FinanceAdmin, and the profile owner (seller) can read.
 * Public visitors cannot view internal commission rates.
 */
export const commissionRateReadAccess: FieldAccess = ({ req: { user }, doc }) => {
  if (!user) return false
  if (checkRole(['admin', 'financeAdmin'], user)) return true
  const profileUserId = typeof doc?.user === 'object' ? doc?.user?.id : doc?.user
  return user.id === profileUserId
}

