import type { CollectionBeforeChangeHook } from 'payload'

export const preventEarningMutation: CollectionBeforeChangeHook = ({
  data,
  originalDoc,
  operation,
}) => {
  if (operation === 'update' && originalDoc) {
    // 1. Immutable snapshot fields (BR-07)
    const immutableFields = [
      'seller',
      'order',
      'orderItem',
      'product',
      'salePrice',
      'platformFee',
      'sellerAmount',
      'tax',
      'commissionRate',
      'currency',
      'holdPeriodDays',
      'policyVersion',
    ]

    for (const field of immutableFields) {
      const origVal =
        typeof originalDoc[field] === 'object' && originalDoc[field] !== null
          ? (originalDoc[field] as any).id
          : originalDoc[field]
      const newVal =
        typeof data[field] === 'object' && data[field] !== null
          ? (data[field] as any).id
          : data[field]

      if (newVal !== undefined && String(origVal) !== String(newVal)) {
        throw new Error(
          `Snapshot field "${field}" is immutable and cannot be altered after creation (BR-07).`,
        )
      }
    }

    // 2. State machine transitions
    const prevStatus = originalDoc.status
    const nextStatus = data.status

    if (nextStatus && nextStatus !== prevStatus) {
      const allowedTransitions: Record<string, string[]> = {
        PENDING: ['AVAILABLE', 'REVERSED'],
        AVAILABLE: ['PAID', 'REVERSED'],
        REVERSED: [], // terminal
        PAID: ['REVERSED'], // reversal under refund policy
      }

      const validNext = allowedTransitions[prevStatus] || []
      if (!validNext.includes(nextStatus)) {
        throw new Error(
          `Invalid seller earning state transition from ${prevStatus} to ${nextStatus}.`,
        )
      }

      // 3. Automated timestamp stamping
      const nowIso = new Date().toISOString()
      if (nextStatus === 'AVAILABLE' && !data.availableAt) {
        data.availableAt = nowIso
      } else if (nextStatus === 'PAID' && !data.paidAt) {
        data.paidAt = nowIso
      } else if (nextStatus === 'REVERSED' && !data.reversedAt) {
        data.reversedAt = nowIso
      }
    }
  }

  return data
}
