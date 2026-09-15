import { GET as handleListOrders } from '../me/orders/route'

/**
 * Route alias for GET /api/v1/orders per PLAN.md §27 Buyer API Specification.
 * Lists orders for the authenticated buyer.
 */
export const GET = handleListOrders
