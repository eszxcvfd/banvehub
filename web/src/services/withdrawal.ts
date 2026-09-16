/**
 * web/src/services/withdrawal.ts
 *
 * Seller Withdrawal Service: Request, Balance Reservation, State Machine & Audit Trail
 * References: PLAN.md FR-32, BR-01, Threat T7, Decision 0005, ADR 0009
 */

import crypto from 'crypto'
import type { Payload } from 'payload'
import { getSellerBalance } from './earnings'

export interface WithdrawalRequestParams {
  sellerId: number
  amount: number
  bankInfo: {
    bankName: string
    accountNumber: string
    accountHolderName: string
  }
}

export interface WithdrawalResult {
  id: number
  code: string
  amount: number
  status: string
  bankInfo?: Record<string, unknown> | null
  requestedAt?: string
  updatedAt?: string
  seller?: number | Record<string, unknown> | null
  reviewedAt?: string
  reviewedBy?: number | Record<string, unknown> | null
  paidAt?: string
  rejectionReason?: string
  failureReason?: string
  notes?: string
  [key: string]: unknown
}

// In-memory mutex per seller to serialize concurrent requests and prevent race overdrafts (Threat T7)
const sellerLocks = new Map<number, Promise<void>>()

async function withSellerLock<T>(sellerId: number, task: () => Promise<T>): Promise<T> {
  const numericId = Number(sellerId)
  const prevLock = sellerLocks.get(numericId) ?? Promise.resolve()

  let release: () => void
  const nextLock = new Promise<void>((resolve) => {
    release = resolve
  })

  const lockPromise = prevLock.catch(() => {}).then(() => nextLock)
  sellerLocks.set(numericId, lockPromise)

  await prevLock.catch(() => {})
  try {
    return await task()
  } finally {
    release!()
    if (sellerLocks.get(numericId) === lockPromise) {
      sellerLocks.delete(numericId)
    }
  }
}

async function verifyFinanceOrAdmin(payload: Payload, actorId: number): Promise<void> {
  const actor = await payload.findByID({
    collection: 'users',
    id: actorId,
    overrideAccess: true,
  })
  if (!actor || (!actor.roles?.includes('financeAdmin') && !actor.roles?.includes('admin'))) {
    throw new Error(
      'Unauthorized: Only financeAdmin or admin can review, approve, process, or reject withdrawals',
    )
  }
}

/**
 * Submits a new withdrawal request for an authenticated seller with bank info validation
 * and anti-race balance reservation.
 */
export async function requestWithdrawal(
  payload: Payload,
  params: WithdrawalRequestParams,
): Promise<WithdrawalResult> {
  // 1. Validate bank details
  const bankName = params?.bankInfo?.bankName ? String(params.bankInfo.bankName).trim() : ''
  const accountNumber = params?.bankInfo?.accountNumber
    ? String(params.bankInfo.accountNumber).trim()
    : ''
  const accountHolderName = params?.bankInfo?.accountHolderName
    ? String(params.bankInfo.accountHolderName).trim()
    : ''

  if (!bankName || !accountNumber || !accountHolderName) {
    throw new Error('Bank details required: bankName, accountNumber, accountHolderName')
  }

  // 2. Validate amount limits and integer VND
  const amount = params.amount
  if (amount === undefined || amount === null || typeof amount !== 'number' || isNaN(amount)) {
    throw new Error('Invalid withdrawal amount')
  }

  if (amount <= 0) {
    throw new Error('Invalid withdrawal amount: must be greater than 0')
  }

  if (amount < 50000) {
    throw new Error('Minimum withdrawal amount is 50,000 VND')
  }

  if (amount > 50000000) {
    throw new Error('Maximum withdrawal amount is 50,000,000 VND')
  }

  if (!Number.isInteger(amount)) {
    throw new Error('Withdrawal amount must be an integer')
  }

  // 3. Verify seller role
  const user = await payload.findByID({
    collection: 'users',
    id: params.sellerId,
    overrideAccess: true,
  })
  if (!user || !user.roles?.includes('seller')) {
    throw new Error('Unauthorized: User does not have seller role')
  }

  // 4. Anti-Race Overdraft Protection (Threat T7) via per-seller mutex
  return withSellerLock(params.sellerId, async () => {
    const balance = await getSellerBalance(payload, params.sellerId)
    if (amount > balance.availableBalance) {
      throw new Error(
        `Insufficient available balance: requested ${amount} VND, available ${balance.availableBalance} VND`,
      )
    }

    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '')
    const randomSuffix = crypto.randomBytes(4).toString('hex').toUpperCase()
    const code = `WTH-${dateStr}-${randomSuffix}`

    const withdrawal = await payload.create({
      collection: 'withdrawals',
      data: {
        seller: params.sellerId,
        amount,
        currency: 'VND',
        status: 'REQUESTED',
        bankInfo: {
          bankName,
          accountNumber,
          accountHolderName: accountHolderName.toUpperCase(),
        },
        code,
        requestedAt: new Date().toISOString(),
      },
      overrideAccess: true,
    })

    await payload.create({
      collection: 'withdrawal_events',
      data: {
        withdrawal: withdrawal.id,
        toStatus: 'REQUESTED',
        actor: params.sellerId,
        actorRole: 'seller',
        timestamp: new Date().toISOString(),
      },
      overrideAccess: true,
    })

    return {
      id: Number(withdrawal.id),
      code: withdrawal.code,
      amount: Number(withdrawal.amount),
      status: withdrawal.status,
      bankInfo: withdrawal.bankInfo,
      requestedAt: withdrawal.requestedAt,
      updatedAt: withdrawal.updatedAt,
    }
  })
}

/**
 * Places a withdrawal in UNDER_REVIEW status by Finance Admin.
 */
export async function reviewWithdrawal(
  payload: Payload,
  params: { withdrawalId: number; actorId: number },
): Promise<WithdrawalResult> {
  await verifyFinanceOrAdmin(payload, params.actorId)

  const existing = await payload.findByID({
    collection: 'withdrawals',
    id: params.withdrawalId,
    overrideAccess: true,
  })
  if (!existing) {
    throw new Error(`Withdrawal not found: ${params.withdrawalId}`)
  }

  const terminalStatuses = ['PAID', 'REJECTED', 'CANCELLED', 'FAILED']
  if (terminalStatuses.includes(existing.status)) {
    throw new Error(`Invalid status: withdrawal is in terminal status ${existing.status}`)
  }

  if (existing.status !== 'REQUESTED') {
    throw new Error(`Invalid status transition: cannot review withdrawal in status ${existing.status}`)
  }

  const updated = await payload.update({
    collection: 'withdrawals',
    id: params.withdrawalId,
    data: {
      status: 'UNDER_REVIEW',
      reviewedAt: new Date().toISOString(),
      reviewedBy: params.actorId,
    },
    overrideAccess: true,
  })

  await payload.create({
    collection: 'withdrawal_events',
    data: {
      withdrawal: params.withdrawalId,
      fromStatus: 'REQUESTED',
      toStatus: 'UNDER_REVIEW',
      actor: params.actorId,
      actorRole: 'financeAdmin',
      timestamp: new Date().toISOString(),
    },
    overrideAccess: true,
  })

  return {
    id: Number(updated.id),
    code: updated.code,
    amount: Number(updated.amount),
    status: updated.status,
    bankInfo: updated.bankInfo,
    requestedAt: updated.requestedAt,
    updatedAt: updated.updatedAt,
  }
}

/**
 * Approves a withdrawal request by Finance Admin.
 */
export async function approveWithdrawal(
  payload: Payload,
  params: { withdrawalId: number; actorId: number; notes?: string },
): Promise<WithdrawalResult> {
  await verifyFinanceOrAdmin(payload, params.actorId)

  const existing = await payload.findByID({
    collection: 'withdrawals',
    id: params.withdrawalId,
    overrideAccess: true,
  })
  if (!existing) {
    throw new Error(`Withdrawal not found: ${params.withdrawalId}`)
  }

  const terminalStatuses = ['PAID', 'REJECTED', 'CANCELLED', 'FAILED']
  if (terminalStatuses.includes(existing.status)) {
    throw new Error(`Invalid status: withdrawal is in terminal status ${existing.status}`)
  }

  if (!['UNDER_REVIEW', 'REQUESTED'].includes(existing.status)) {
    throw new Error(`Invalid status transition: cannot approve withdrawal in status ${existing.status}`)
  }

  const updated = await payload.update({
    collection: 'withdrawals',
    id: params.withdrawalId,
    data: {
      status: 'APPROVED',
      notes: params.notes || existing.notes,
    },
    overrideAccess: true,
  })

  await payload.create({
    collection: 'withdrawal_events',
    data: {
      withdrawal: params.withdrawalId,
      fromStatus: existing.status,
      toStatus: 'APPROVED',
      actor: params.actorId,
      actorRole: 'financeAdmin',
      notes: params.notes,
      timestamp: new Date().toISOString(),
    },
    overrideAccess: true,
  })

  return {
    id: Number(updated.id),
    code: updated.code,
    amount: Number(updated.amount),
    status: updated.status,
    bankInfo: updated.bankInfo,
    requestedAt: updated.requestedAt,
    updatedAt: updated.updatedAt,
  }
}

/**
 * Moves an approved withdrawal into PROCESSING status.
 */
export async function processWithdrawal(
  payload: Payload,
  params: { withdrawalId: number; actorId: number },
): Promise<WithdrawalResult> {
  await verifyFinanceOrAdmin(payload, params.actorId)

  const existing = await payload.findByID({
    collection: 'withdrawals',
    id: params.withdrawalId,
    overrideAccess: true,
  })
  if (!existing) {
    throw new Error(`Withdrawal not found: ${params.withdrawalId}`)
  }

  const terminalStatuses = ['PAID', 'REJECTED', 'CANCELLED', 'FAILED']
  if (terminalStatuses.includes(existing.status)) {
    throw new Error(`Invalid status: withdrawal is in terminal status ${existing.status}`)
  }

  if (existing.status !== 'APPROVED') {
    throw new Error(`Invalid status transition: cannot process withdrawal in status ${existing.status}`)
  }

  const updated = await payload.update({
    collection: 'withdrawals',
    id: params.withdrawalId,
    data: {
      status: 'PROCESSING',
    },
    overrideAccess: true,
  })

  await payload.create({
    collection: 'withdrawal_events',
    data: {
      withdrawal: params.withdrawalId,
      fromStatus: 'APPROVED',
      toStatus: 'PROCESSING',
      actor: params.actorId,
      actorRole: 'financeAdmin',
      timestamp: new Date().toISOString(),
    },
    overrideAccess: true,
  })

  return {
    id: Number(updated.id),
    code: updated.code,
    amount: Number(updated.amount),
    status: updated.status,
    bankInfo: updated.bankInfo,
    requestedAt: updated.requestedAt,
    updatedAt: updated.updatedAt,
  }
}

/**
 * Finalizes payout by setting status to PAID and recording timestamp.
 */
export async function finalizeWithdrawalPaid(
  payload: Payload,
  params: { withdrawalId: number; actorId: number },
): Promise<WithdrawalResult> {
  await verifyFinanceOrAdmin(payload, params.actorId)

  const existing = await payload.findByID({
    collection: 'withdrawals',
    id: params.withdrawalId,
    overrideAccess: true,
  })
  if (!existing) {
    throw new Error(`Withdrawal not found: ${params.withdrawalId}`)
  }

  const terminalStatuses = ['PAID', 'REJECTED', 'CANCELLED', 'FAILED']
  if (terminalStatuses.includes(existing.status)) {
    throw new Error(`Invalid status: withdrawal is in terminal status ${existing.status}`)
  }

  if (!['PROCESSING', 'APPROVED'].includes(existing.status)) {
    throw new Error(`Invalid status transition: cannot finalize withdrawal in status ${existing.status}`)
  }

  const updated = await payload.update({
    collection: 'withdrawals',
    id: params.withdrawalId,
    data: {
      status: 'PAID',
      paidAt: new Date().toISOString(),
    },
    overrideAccess: true,
  })

  await payload.create({
    collection: 'withdrawal_events',
    data: {
      withdrawal: params.withdrawalId,
      fromStatus: existing.status,
      toStatus: 'PAID',
      actor: params.actorId,
      actorRole: 'financeAdmin',
      timestamp: new Date().toISOString(),
    },
    overrideAccess: true,
  })

  return {
    id: Number(updated.id),
    code: updated.code,
    amount: Number(updated.amount),
    status: updated.status,
    bankInfo: updated.bankInfo,
    requestedAt: updated.requestedAt,
    updatedAt: updated.updatedAt,
  }
}

/**
 * Rejects a withdrawal with reason by Finance Admin, automatically releasing reserved balance.
 */
export async function rejectWithdrawal(
  payload: Payload,
  params: { withdrawalId: number; actorId: number; reason: string },
): Promise<WithdrawalResult> {
  await verifyFinanceOrAdmin(payload, params.actorId)

  const existing = await payload.findByID({
    collection: 'withdrawals',
    id: params.withdrawalId,
    overrideAccess: true,
  })
  if (!existing) {
    throw new Error(`Withdrawal not found: ${params.withdrawalId}`)
  }

  const terminalStatuses = ['PAID', 'REJECTED', 'CANCELLED', 'FAILED']
  if (terminalStatuses.includes(existing.status)) {
    throw new Error(`Invalid status: withdrawal is in terminal status ${existing.status}`)
  }

  if (!params.reason || !params.reason.trim()) {
    throw new Error('Rejection reason is required')
  }

  const rejectableStatuses = ['REQUESTED', 'UNDER_REVIEW', 'APPROVED', 'PROCESSING']
  if (!rejectableStatuses.includes(existing.status)) {
    throw new Error(`Invalid status transition: cannot reject withdrawal in status ${existing.status}`)
  }

  const updated = await payload.update({
    collection: 'withdrawals',
    id: params.withdrawalId,
    data: {
      status: 'REJECTED',
      rejectionReason: params.reason.trim(),
    },
    overrideAccess: true,
  })

  await payload.create({
    collection: 'withdrawal_events',
    data: {
      withdrawal: params.withdrawalId,
      fromStatus: existing.status,
      toStatus: 'REJECTED',
      actor: params.actorId,
      actorRole: 'financeAdmin',
      reason: params.reason.trim(),
      timestamp: new Date().toISOString(),
    },
    overrideAccess: true,
  })

  return {
    id: Number(updated.id),
    code: updated.code,
    amount: Number(updated.amount),
    status: updated.status,
    bankInfo: updated.bankInfo,
    requestedAt: updated.requestedAt,
    updatedAt: updated.updatedAt,
  }
}

/**
 * Cancels a withdrawal request by the seller, automatically releasing reserved balance.
 */
export async function cancelWithdrawal(
  payload: Payload,
  params: { withdrawalId: number; sellerId: number },
): Promise<WithdrawalResult> {
  const existing = await payload.findByID({
    collection: 'withdrawals',
    id: params.withdrawalId,
    overrideAccess: true,
  })
  if (!existing) {
    throw new Error(`Withdrawal not found: ${params.withdrawalId}`)
  }

  const terminalStatuses = ['PAID', 'REJECTED', 'CANCELLED', 'FAILED']
  if (terminalStatuses.includes(existing.status)) {
    throw new Error(`Invalid status: withdrawal is in terminal status ${existing.status}`)
  }

  const existingSellerId =
    typeof existing.seller === 'object' && existing.seller !== null
      ? existing.seller.id
      : existing.seller

  if (Number(existingSellerId) !== Number(params.sellerId)) {
    throw new Error('Unauthorized: You can only cancel your own withdrawals')
  }

  if (!['REQUESTED', 'UNDER_REVIEW'].includes(existing.status)) {
    throw new Error(`Invalid status transition: cannot cancel withdrawal in status ${existing.status}`)
  }

  const updated = await payload.update({
    collection: 'withdrawals',
    id: params.withdrawalId,
    data: {
      status: 'CANCELLED',
    },
    overrideAccess: true,
  })

  await payload.create({
    collection: 'withdrawal_events',
    data: {
      withdrawal: params.withdrawalId,
      fromStatus: existing.status,
      toStatus: 'CANCELLED',
      actor: params.sellerId,
      actorRole: 'seller',
      timestamp: new Date().toISOString(),
    },
    overrideAccess: true,
  })

  return {
    id: Number(updated.id),
    code: updated.code,
    amount: Number(updated.amount),
    status: updated.status,
    bankInfo: updated.bankInfo,
    requestedAt: updated.requestedAt,
    updatedAt: updated.updatedAt,
  }
}
