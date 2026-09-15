import type { Access, Where } from 'payload'
import { checkRole } from '@/access/utilities'

/**
 * Read access for orders:
 * - Admin and FinanceAdmin can view all orders.
 * - Authenticated users can only view orders where they are the buyer.
 * - Unauthenticated users are denied.
 */
export const orderReadAccess: Access = ({ req: { user } }) => {
  if (!user) return false

  if (checkRole(['admin', 'financeAdmin'], user)) {
    return true
  }

  const query: Where = {
    buyer: {
      equals: user.id,
    },
  }

  return query
}

/**
 * Direct create, update, delete on orders are denied for all principals via REST/GraphQL.
 * All state transitions and creation must go through the dedicated purchase/order service.
 */
export const orderCreateAccess: Access = () => false
export const orderUpdateAccess: Access = () => false
export const orderDeleteAccess: Access = () => false

/**
 * Read access for order items:
 * - Admin and FinanceAdmin can view all order items.
 * - Sellers can view order items for their products.
 * - Buyers can view order items for their orders.
 * - Unauthenticated users are denied.
 */
export const orderItemReadAccess: Access = ({ req: { user } }) => {
  if (!user) return false

  if (checkRole(['admin', 'financeAdmin'], user)) {
    return true
  }

  const query: Where = {
    or: [
      {
        seller: {
          equals: user.id,
        },
      },
      {
        'order.buyer': {
          equals: user.id,
        },
      },
    ],
  }

  return query
}

export const orderItemCreateAccess: Access = () => false
export const orderItemUpdateAccess: Access = () => false
export const orderItemDeleteAccess: Access = () => false
