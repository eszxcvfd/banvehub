import type { CollectionBeforeValidateHook } from 'payload'

export const validateEarningMath: CollectionBeforeValidateHook = ({ data, operation }) => {
  if (!data) return data

  if (operation === 'create') {
    const salePrice = Number(data.salePrice ?? 0)
    const platformFee = Number(data.platformFee ?? 0)
    const sellerAmount = Number(data.sellerAmount ?? 0)
    const tax = Number(data.tax ?? 0)
    const rate = Number(data.commissionRate ?? 0)

    if (salePrice < 0 || platformFee < 0 || sellerAmount < 0 || tax < 0) {
      throw new Error('Financial amounts in seller earnings must be non-negative integers.')
    }

    if (rate < 0 || rate > 1) {
      throw new Error(`Commission rate must be between 0 and 1. Received: ${rate}`)
    }

    // Arithmetic conservation: platformFee + sellerAmount + tax === salePrice
    if (platformFee + sellerAmount + tax !== salePrice) {
      throw new Error(
        `Financial invariant violation: platformFee (${platformFee}) + sellerAmount (${sellerAmount}) + tax (${tax}) does not equal salePrice (${salePrice}).`,
      )
    }
  }

  return data
}
