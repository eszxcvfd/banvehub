import type { FieldHook } from 'payload'
import crypto from 'crypto'

/**
 * Generates unique code in format WTH-YYYYMMDD-XXXXXXXX
 * e.g. WTH-20260915-A1B2C3D4
 *
 * The suffix is 8 hex chars (32 bits), deliberately wider than the 6-char
 * suffix used by `ORD-` and `REF-`: a withdrawal identifier gates money out
 * of the platform, so it carries the highest cost of collision. 5 hex chars
 * (the previous width) gave ~38% collision probability at 1,000 codes/day.
 */
export const generateWithdrawalCode: FieldHook = ({ value, operation }) => {
  if (operation === 'create' && !value) {
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '')
    const randomSuffix = crypto.randomBytes(4).toString('hex').toUpperCase()
    return `WTH-${dateStr}-${randomSuffix}`
  }
  return value
}
