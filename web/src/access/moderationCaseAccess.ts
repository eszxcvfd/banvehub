import type { Access } from 'payload'
import { checkRole } from '@/access/utilities'

/**
 * Access control for moderation cases (FR-22, `PLAN.md` §17:2293, §22 matrix).
 *
 * A report is a private complaint about a product: it is written on behalf of the
 * reporter and resolved by the moderation team. Only Admin/Moderator may read or
 * update cases — not the reporter, not the product's seller — so no surface can leak
 * one user's report to another. The storefront report route writes through
 * `overrideAccess: true` after validating the request (see
 * `src/app/api/v1/products/[id]/reports/route.ts`).
 */

/**
 * Read: Admin and Moderator only (ADR 0008 role model; PLAN.md §22 "Moderate product").
 * The reporter is deliberately NOT granted read access to their own case.
 */
export const moderationCaseReadAccess: Access = ({ req: { user } }) => {
  if (!user) return false
  return checkRole(['admin', 'moderator'], user)
}

/**
 * Create: any authenticated user, matching the FR-21/FR-23 precedent. The custom
 * report route is the intended writer; a direct collection-API create cannot forge
 * `reporter`/`status` because those fields are field-access restricted (see
 * `src/collections/ModerationCases/index.ts`).
 */
export const moderationCaseCreateAccess: Access = ({ req: { user } }) => {
  return Boolean(user)
}

/** Update: Admin and Moderator only — reporters cannot edit or dismiss their own case. */
export const moderationCaseUpdateAccess: Access = ({ req: { user } }) => {
  if (!user) return false
  return checkRole(['admin', 'moderator'], user)
}

/** Delete: Admin only (BR-08 keeps moderation history; deletes stay exceptional). */
export const moderationCaseDeleteAccess: Access = ({ req: { user } }) => {
  if (!user) return false
  return checkRole(['admin'], user)
}
