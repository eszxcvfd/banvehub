import type { FieldAccess } from 'payload'

import { checkRole } from '@/access/utilities'

/**
 * Restricts a field to buying accounts. PLAN.md §5.2 Buyer.
 *
 * The ecommerce plugin consumes this through its `customerOnlyFieldAccess`
 * configuration key, which is the plugin's own name for the buyer concept.
 */
export const buyerOnlyFieldAccess: FieldAccess = ({ req: { user } }) => {
  if (user) return checkRole(['buyer'], user)

  return false
}
