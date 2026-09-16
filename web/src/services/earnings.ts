/**
 * web/src/services/earnings.ts
 *
 * Seller Earnings Maturation & Balance Service
 * References: PLAN.md FR-31, FR-32, BR-03, Decision 0005
 */

import type { Payload } from 'payload'

export interface SellerBalanceSummary {
  totalEarned: number
  pendingBalance: number
  availableBalance: number
  reservedBalance: number
  withdrawnTotal: number
}

export interface ReleaseMaturedOptions {
  sellerId?: number
  asOf?: Date
}

export interface ReleaseMaturedResult {
  releasedCount: number
  totalReleasedAmount: number
}

/**
 * Releases seller earnings whose hold period has matured (PENDING -> AVAILABLE).
 * Default hold period is 7 days from creation.
 */
export async function releaseMaturedEarnings(
  payload: Payload,
  options?: ReleaseMaturedOptions,
): Promise<ReleaseMaturedResult> {
  const asOf = options?.asOf || new Date()
  const asOfIso = asOf.toISOString()

  const andConditions: any[] = [
    { status: { equals: 'PENDING' } },
    { holdUntil: { less_than_equal: asOfIso } },
  ]

  if (options?.sellerId !== undefined && options?.sellerId !== null) {
    andConditions.push({ seller: { equals: options.sellerId } })
  }

  const maturedEarnings = await payload.find({
    collection: 'seller_earnings',
    where: { and: andConditions },
    limit: 1000,
    overrideAccess: true,
  })

  let releasedCount = 0
  let totalReleasedAmount = 0
  const nowIso = new Date().toISOString()

  for (const doc of maturedEarnings.docs) {
    await payload.update({
      collection: 'seller_earnings',
      id: doc.id,
      data: {
        status: 'AVAILABLE',
        availableAt: nowIso,
      },
      overrideAccess: true,
    })

    releasedCount++
    totalReleasedAmount += Number(doc.sellerAmount || 0)
  }

  return {
    releasedCount,
    totalReleasedAmount,
  }
}

/**
 * Aggregates a seller's complete earnings and balances:
 * - pendingBalance: sum of PENDING seller_earnings
 * - availableBalance: net withdrawable balance (gross AVAILABLE minus reservedBalance minus withdrawnTotal, minimum 0)
 * - withdrawnTotal: sum of PAID withdrawals
 * - reservedBalance: sum of in-flight withdrawals (REQUESTED, UNDER_REVIEW, APPROVED, PROCESSING)
 * - totalEarned: grossAvailable + pendingBalance
 */
export async function getSellerBalance(
  payload: Payload,
  sellerId: number,
): Promise<SellerBalanceSummary> {
  const numericSellerId = Number(sellerId)

  // 1. Fetch all seller earnings
  // TODO: Handle cursor-based pagination if seller earnings exceed 5000 records
  const earningsResult = await payload.find({
    collection: 'seller_earnings',
    where: { seller: { equals: numericSellerId } },
    limit: 5000,
    overrideAccess: true,
  })

  let pendingBalance = 0
  let availableBalance = 0

  for (const earning of earningsResult.docs) {
    const amount = Number(earning.sellerAmount || 0)
    if (earning.status === 'PENDING') {
      pendingBalance += amount
    } else if (earning.status === 'AVAILABLE') {
      availableBalance += amount
    }
  }

  // 2. Fetch in-flight withdrawals
  const inFlightStatuses = ['REQUESTED', 'UNDER_REVIEW', 'APPROVED', 'PROCESSING']
  const withdrawalsResult = await payload.find({
    collection: 'withdrawals',
    where: {
      and: [
        { seller: { equals: numericSellerId } },
        { status: { in: inFlightStatuses } },
      ],
    },
    limit: 1000,
    overrideAccess: true,
  })

  let reservedBalance = 0
  for (const withdrawal of withdrawalsResult.docs) {
    reservedBalance += Number(withdrawal.amount || 0)
  }

  // 3. Fetch finalized paid withdrawals
  const paidWithdrawalsResult = await payload.find({
    collection: 'withdrawals',
    where: {
      and: [
        { seller: { equals: numericSellerId } },
        { status: { equals: 'PAID' } },
      ],
    },
    limit: 1000,
    overrideAccess: true,
  })

  let withdrawnTotal = 0
  for (const w of paidWithdrawalsResult.docs) {
    withdrawnTotal += Number(w.amount || 0)
  }

  const grossAvailable = availableBalance
  const netAvailable = Math.max(0, grossAvailable - reservedBalance - withdrawnTotal)
  const totalEarned = grossAvailable + pendingBalance

  return {
    totalEarned,
    pendingBalance,
    availableBalance: netAvailable,
    reservedBalance,
    withdrawnTotal,
  }
}
