import type { Access } from 'payload'

/**
 * Denies every direct write to a money document.
 *
 * PLAN.md §22 restricts balance adjustment to Finance and Admin, and decision
 * 0002 goes further: exactly one server-side write path may change a balance,
 * no collection create, update, or delete operation may do it, and an
 * administrator adjusts a balance through the dedicated adjustment form that
 * records amount, direction, reason, and reference (PLAN.md §12.2).
 *
 * This always denies, for every principal including administrators. Money
 * collections use it for create, update, and delete, and keep read separate.
 */
export const canEditMoney: Access = () => false

/**
 * Field-level counterpart of {@link canEditMoney}, for balance-like fields that
 * must never be edited through a document form.
 */
export const canEditMoneyField = (): boolean => false
