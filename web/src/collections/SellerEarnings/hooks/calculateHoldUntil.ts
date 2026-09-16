import type { CollectionBeforeValidateHook } from 'payload'

export const calculateHoldUntil: CollectionBeforeValidateHook = ({ data, operation }) => {
  if (!data) return data

  if (operation === 'create') {
    const holdDays = typeof data.holdPeriodDays === 'number' ? data.holdPeriodDays : 7

    if (!data.holdUntil) {
      const now = Date.now()
      const holdMs = holdDays * 24 * 60 * 60 * 1000
      data.holdUntil = new Date(now + holdMs).toISOString()
    }

    if (holdDays === 0) {
      data.status = 'AVAILABLE'
      data.availableAt = new Date().toISOString()
    }
  }

  return data
}
