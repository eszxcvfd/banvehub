import type { CollectionBeforeChangeHook, CollectionBeforeDeleteHook } from 'payload'

/**
 * Enforces BR-03: Audit events are append-only and strictly immutable.
 */
export const preventWithdrawalEventMutation: CollectionBeforeChangeHook = async ({
  data,
  operation,
  req,
}) => {
  if (operation === 'update') {
    throw new Error(
      'Withdrawal audit events are immutable. Updates to existing audit logs are strictly prohibited.',
    )
  }

  // Ensure timestamp is present
  if (!data.timestamp) {
    data.timestamp = new Date().toISOString()
  }

  // Populate actor and actorRole from session if not explicitly provided
  if (req.user) {
    if (!data.actor) {
      data.actor = req.user.id
    }
    if (!data.actorRole) {
      data.actorRole = req.user.roles?.[0] || 'user'
    }
  }

  return data
}

export const preventWithdrawalEventDeletion: CollectionBeforeDeleteHook = async () => {
  throw new Error(
    'Withdrawal audit events are immutable records and cannot be deleted.',
  )
}
