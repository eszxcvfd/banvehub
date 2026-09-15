import type { Access } from 'payload'
import { checkRole } from '@/access/utilities'

/**
 * Access rule for reading download audit events (PLAN.md §22, Decision 0006):
 * - Admin and FinanceAdmin can inspect download audit logs.
 * - Regular buyers, sellers, and unauthenticated guests are denied.
 */
export const downloadEventReadAccess: Access = ({ req: { user } }) => {
  if (!user) return false
  return checkRole(['admin', 'financeAdmin'], user)
}

/**
 * Download events are append-only server-side audit logs.
 * Direct creation, update, or deletion via public REST is strictly denied for all principals.
 * Writes occur exclusively via the download streaming handler with `overrideAccess: true`.
 */
export const downloadEventNoDirectWrite: Access = () => false
