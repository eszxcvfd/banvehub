import type { Access, Where } from 'payload'
import { checkRole } from '@/access/utilities'

/**
 * Access control for reading tickets (R1, FR-23):
 * - Admin, Moderator, FinanceAdmin can view all tickets.
 * - Authenticated ticket authors can view their own tickets.
 * - Authenticated sellers can view tickets associated with their products.
 * - Unauthenticated users are denied.
 */
export const ticketReadAccess: Access = ({ req: { user } }) => {
  if (!user) return false

  if (checkRole(['admin', 'moderator', 'financeAdmin'], user)) {
    return true
  }

  const query: Where = {
    or: [
      {
        user: {
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

/**
 * Access control for creating tickets (R1, FR-23):
 * - Authenticated users can create tickets.
 */
export const ticketCreateAccess: Access = ({ req: { user } }) => {
  return Boolean(user)
}

/**
 * Access control for updating tickets (R1, FR-23):
 * - Admin, Moderator, and FinanceAdmin can update any ticket.
 * - Ticket author or seller can update (e.g. reply / status update).
 */
export const ticketUpdateAccess: Access = ({ req: { user } }) => {
  if (!user) return false

  if (checkRole(['admin', 'moderator', 'financeAdmin'], user)) {
    return true
  }

  const query: Where = {
    or: [
      {
        user: {
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

/**
 * Access control for deleting tickets:
 * - Admin only.
 */
export const ticketDeleteAccess: Access = ({ req: { user } }) => {
  if (!user) return false
  return checkRole(['admin'], user)
}
