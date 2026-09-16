import type { CollectionBeforeChangeHook, CollectionBeforeValidateHook } from 'payload'

const VALID_TRANSITIONS: Record<string, string[]> = {
  REQUESTED: ['UNDER_REVIEW', 'APPROVED', 'REJECTED', 'CANCELLED'],
  UNDER_REVIEW: ['APPROVED', 'REJECTED', 'CANCELLED'],
  APPROVED: ['PROCESSING', 'PAID', 'REJECTED'],
  PROCESSING: ['PAID', 'FAILED', 'REJECTED'],
  FAILED: ['PROCESSING', 'REJECTED', 'CANCELLED'],
  PAID: [], // Terminal state
  REJECTED: [], // Terminal state
  CANCELLED: [], // Terminal state
}

/**
 * Validates bank info and amount before validation
 */
export const validateWithdrawalBeforeValidate: CollectionBeforeValidateHook = ({
  data,
  operation,
}) => {
  if (!data) return data

  // Normalize bank info
  if (data.bankInfo) {
    if (data.bankInfo.bankName) {
      data.bankInfo.bankName = String(data.bankInfo.bankName).trim()
    }
    if (data.bankInfo.accountNumber) {
      data.bankInfo.accountNumber = String(data.bankInfo.accountNumber).trim().replace(/\s+/g, '')
    }
    if (data.bankInfo.accountHolderName) {
      data.bankInfo.accountHolderName = String(data.bankInfo.accountHolderName).trim().toUpperCase()
    }
  }

  // Validate amount integer
  if (data.amount !== undefined && data.amount !== null) {
    if (!Number.isInteger(data.amount) || data.amount < 50000 || data.amount > 50000000) {
      throw new Error('Withdrawal amount must be an integer between 50,000 and 50,000,000 VND.')
    }
  }

  return data
}

/**
 * Enforces immutability of financial fields and valid state transitions
 */
export const validateWithdrawalInvariants: CollectionBeforeChangeHook = async ({
  data,
  originalDoc,
  operation,
  req,
}) => {
  if (operation === 'update' && originalDoc) {
    // 1. Prevent modification of immutable fields
    if (data.seller !== undefined && data.seller !== originalDoc.seller) {
      const originalSellerId =
        typeof originalDoc.seller === 'object' ? originalDoc.seller?.id : originalDoc.seller
      const newSellerId = typeof data.seller === 'object' ? data.seller?.id : data.seller
      if (originalSellerId !== newSellerId) {
        throw new Error('Cannot change seller on an existing withdrawal record.')
      }
    }

    if (data.amount !== undefined && data.amount !== originalDoc.amount) {
      throw new Error('Cannot change amount on an existing withdrawal record.')
    }

    if (data.currency !== undefined && data.currency !== originalDoc.currency) {
      throw new Error('Cannot change currency on an existing withdrawal record.')
    }

    if (data.code !== undefined && data.code !== originalDoc.code) {
      throw new Error('Cannot change code on an existing withdrawal record.')
    }

    // 2. Validate state machine transition
    const currentStatus = originalDoc.status
    const targetStatus = data.status

    if (targetStatus && targetStatus !== currentStatus) {
      const allowedNextStates = VALID_TRANSITIONS[currentStatus] || []
      if (!allowedNextStates.includes(targetStatus)) {
        throw new Error(
          `Invalid withdrawal state transition from ${currentStatus} to ${targetStatus}.`,
        )
      }

      const nowIso = new Date().toISOString()

      // Set review metadata
      if (['UNDER_REVIEW', 'APPROVED', 'REJECTED'].includes(targetStatus)) {
        if (!data.reviewedAt) data.reviewedAt = nowIso
        if (req.user?.id && !data.reviewedBy) data.reviewedBy = req.user.id
      }

      // Set paid metadata
      if (targetStatus === 'PAID') {
        if (!data.paidAt) data.paidAt = nowIso
      }

      // Ensure reasons are provided on failure/rejection
      if (targetStatus === 'REJECTED' && !data.rejectionReason && !originalDoc.rejectionReason) {
        throw new Error('Rejection reason is required when rejecting a withdrawal.')
      }

      if (targetStatus === 'FAILED' && !data.failureReason && !originalDoc.failureReason) {
        throw new Error('Failure reason is required when marking a withdrawal as failed.')
      }
    }
  }

  return data
}
