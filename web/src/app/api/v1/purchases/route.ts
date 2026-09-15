import { POST as handlePurchase } from '../orders/purchase/route'

/**
 * RESTful resource endpoint for purchases.
 * Delegates 100% of execution to handlePurchase to guarantee complete feature and response parity.
 */
export const POST = handlePurchase
