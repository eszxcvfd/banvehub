import type { CollectionBeforeChangeHook } from 'payload'

/**
 * Enforces BR-07: Snapshot price and order items are strictly immutable once created.
 */
export const preventOrderItemMutation: CollectionBeforeChangeHook = ({ operation }) => {
  if (operation === 'update') {
    throw new Error(
      'Order items are immutable (BR-07). Modifying an existing order item is strictly prohibited.',
    )
  }
}
