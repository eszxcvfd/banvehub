/**
 * web/src/services/commission.ts
 *
 * Commission Rate Resolution & Revenue Split Service
 * References: PLAN.md §6.2, §6.3, BR-07, Decision 0005, ADR 0009
 */

import type { Payload } from 'payload'

export interface CommissionResolution {
  commissionRate: number
  policyVersion: string
  source: 'campaign' | 'seller_override' | 'site_default'
}

export interface RevenueSplit {
  platformFee: number
  sellerAmount: number
  tax: number
}

export interface ResolveCommissionParams {
  sellerId: number
  productId: number
  campaignId?: number
  req?: any
}

export class CommissionConfigurationError extends Error {
  readonly code = 'COMMISSION_CONFIGURATION_ERROR'
  constructor(message: string) {
    super(message)
    this.name = 'CommissionConfigurationError'
  }
}

/**
 * 3-Tier Commission Rate Resolution:
 * 1. Campaign: Promotional campaign rate takes highest precedence if provided and campaign exists.
 *    (Governing Decision A2: Campaigns collection deferred from P0).
 * 2. Seller override: Custom commission rate configured on the seller's profile.
 * 3. Site default: Global commission rate from Payload CommissionSettings global.
 *    Per ADR 0009 item 3 & Decision A1, commission rate is configuration/data, NOT code.
 *    Missing or invalid settings throw CommissionConfigurationError (no hard-coded fallback).
 */
export async function resolveCommissionRate(
  payload: Payload,
  params: ResolveCommissionParams,
): Promise<CommissionResolution> {
  const { sellerId, campaignId, req } = params

  // Tier 1: Campaign Promotional Rate (Deferred from P0 per Decision A2)
  if (campaignId !== undefined && campaignId !== null) {
    if ((payload.collections as any)?.campaigns) {
      try {
        const campaign = await payload.findByID({
          collection: 'campaigns' as any,
          id: campaignId,
          overrideAccess: true,
          req,
        })
        if (
          campaign &&
          typeof (campaign as any).commissionRate === 'number' &&
          !isNaN((campaign as any).commissionRate)
        ) {
          const rate = (campaign as any).commissionRate
          if (rate < 0 || rate > 1) {
            throw new CommissionConfigurationError(
              `Campaign commission rate must be between 0 and 1, got ${rate}`,
            )
          }
          return {
            commissionRate: rate,
            policyVersion: `campaign-${campaignId}-${rate}`,
            source: 'campaign',
          }
        }
      } catch (err: any) {
        if (err instanceof CommissionConfigurationError) throw err
        // If query fails, fall through to next tier
      }
    }
  }

  // Tier 2: Seller Override Rate
  if (sellerId !== undefined && sellerId !== null) {
    try {
      const sellerProfiles = await payload.find({
        collection: 'seller_profiles',
        where: { user: { equals: sellerId } },
        limit: 1,
        overrideAccess: true,
        req,
      })

      if (sellerProfiles.docs.length > 0) {
        const profile = sellerProfiles.docs[0]
        if (
          typeof profile.commissionRate === 'number' &&
          !isNaN(profile.commissionRate) &&
          profile.commissionRate !== null
        ) {
          if (profile.commissionRate < 0 || profile.commissionRate > 1) {
            throw new CommissionConfigurationError(
              `Seller commission rate override must be between 0 and 1, got ${profile.commissionRate}`,
            )
          }
          return {
            commissionRate: profile.commissionRate,
            policyVersion: `seller-override-${sellerId}-${profile.commissionRate}`,
            source: 'seller_override',
          }
        }
      }
    } catch (err: any) {
      if (err instanceof CommissionConfigurationError) throw err
      // If query fails, fall through to site default
    }
  }

  // Tier 3: Site Default Rate
  let settings: any = null
  try {
    settings = await payload.findGlobal({
      slug: 'commission_settings',
      overrideAccess: true,
      req,
    })
  } catch (err: any) {
    throw new CommissionConfigurationError(
      `Failed to load global commission_settings: ${err?.message || String(err)}`,
    )
  }

  if (
    !settings ||
    typeof settings.defaultRate !== 'number' ||
    isNaN(settings.defaultRate) ||
    settings.defaultRate === null
  ) {
    throw new CommissionConfigurationError(
      'Site default commission rate is missing or invalid in commission_settings global',
    )
  }

  const rate = settings.defaultRate
  if (rate < 0 || rate > 1) {
    throw new CommissionConfigurationError(
      `Site default commission rate must be between 0 and 1, got ${rate}`,
    )
  }

  return {
    commissionRate: rate,
    policyVersion: `site-default-v1-${Number(rate).toFixed(2)}`,
    source: 'site_default',
  }
}

/**
 * Calculates platform fee, seller earnings amount, and tax with round-half-safe integer-VND math.
 * Invariant: platformFee + sellerAmount + tax === amountVnd exactly.
 */
export function calculateRevenueSplit(
  amountVnd: number,
  rate: number,
  tax = 0,
): RevenueSplit {
  const roundedTax = Math.round(tax || 0)
  const platformFee = Math.round(amountVnd * rate)
  const sellerAmount = amountVnd - platformFee - roundedTax

  return {
    platformFee,
    sellerAmount,
    tax: roundedTax,
  }
}
