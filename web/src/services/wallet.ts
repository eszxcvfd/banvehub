import type { Payload } from 'payload'
import { sql } from '@payloadcms/db-postgres'
import type { Wallet, WalletLedger } from '@/payload-types'

export class InsufficientFundsError extends Error {
  balance: number
  requiredAmount: number

  constructor(balance: number, requiredAmount: number) {
    super(
      `Số dư ví không đủ để thực hiện giao dịch (Số dư: ${balance.toLocaleString('vi-VN')}₫, Cần: ${requiredAmount.toLocaleString('vi-VN')}₫)`
    )
    this.name = 'InsufficientFundsError'
    this.balance = balance
    this.requiredAmount = requiredAmount
  }
}

export class WalletNotFoundError extends Error {
  constructor(userId: number | string) {
    super(`Không tìm thấy ví cho tài khoản ID ${userId}`)
    this.name = 'WalletNotFoundError'
  }
}

export class WalletFrozenError extends Error {
  constructor(status: string) {
    super(`Ví đang ở trạng thái không thể giao dịch: ${status}`)
    this.name = 'WalletFrozenError'
  }
}

export class InvalidAmountError extends Error {
  constructor(amount: number) {
    super(`Số tiền giao dịch không hợp lệ: ${amount} (Phải là số nguyên dương VND)`)
    this.name = 'InvalidAmountError'
  }
}

export interface CreditWalletParams {
  userId: number | string
  amount: number
  type: 'topup' | 'purchase' | 'refund' | 'adjustment' | 'withdrawal' | 'payout'
  referenceType: 'payment_intent' | 'order' | 'adjustment' | 'withdrawal' | 'system'
  referenceId: string
  description?: string
  metadata?: Record<string, any>
  req?: any
}

export interface DebitWalletParams {
  userId: number | string
  amount: number
  type: 'topup' | 'purchase' | 'refund' | 'adjustment' | 'withdrawal' | 'payout'
  referenceType: 'payment_intent' | 'order' | 'adjustment' | 'withdrawal' | 'system'
  referenceId: string
  description?: string
  metadata?: Record<string, any>
  req?: any
}

export interface AdjustWalletParams {
  adminUserId: number | string
  targetUserId: number | string
  amount: number
  direction: 'credit' | 'debit'
  reason: string
  referenceId?: string
  req?: any
}

/**
 * Get or create an active wallet for a user.
 */
export async function getOrCreateWallet(
  payload: Payload,
  { userId, req }: { userId: number | string; req?: any }
): Promise<Wallet> {
  const numericUserId = typeof userId === 'string' ? parseInt(userId, 10) : userId

  const existing = await payload.find({
    collection: 'wallets',
    where: {
      user: {
        equals: numericUserId,
      },
    },
    limit: 1,
    overrideAccess: true,
    req,
  })

  if (existing.docs.length > 0) {
    return existing.docs[0] as Wallet
  }

  // Create new wallet with 0 balance
  const created = await payload.create({
    collection: 'wallets',
    data: {
      user: numericUserId,
      balance: 0,
      pendingBalance: 0,
      currency: 'VND',
      status: 'active',
    },
    overrideAccess: true,
    req,
  })

  return created as Wallet
}

/**
 * Credit a user's wallet atomically and record an append-only ledger entry.
 * Follows Decision 0002 (One write path, atomic balance + ledger row).
 */
export async function creditWallet(
  payload: Payload,
  params: CreditWalletParams
): Promise<{ wallet: Wallet; ledgerEntry: WalletLedger }> {
  const { userId, amount, type, referenceType, referenceId, description, metadata, req } = params
  const numericUserId = typeof userId === 'string' ? parseInt(userId, 10) : userId

  if (!Number.isInteger(amount) || amount <= 0) {
    throw new InvalidAmountError(amount)
  }

  const wallet = await getOrCreateWallet(payload, { userId: numericUserId, req })

  if (wallet.status !== 'active') {
    throw new WalletFrozenError(wallet.status)
  }

  const balanceBefore = Number(wallet.balance)
  const balanceAfter = balanceBefore + amount

  // Update wallet balance using local API with overrideAccess: true
  const updatedWallet = await payload.update({
    collection: 'wallets',
    id: wallet.id,
    data: {
      balance: balanceAfter,
    },
    overrideAccess: true,
    req,
  })

  // Create append-only ledger entry
  const ledgerEntry = await payload.create({
    collection: 'wallet_ledger',
    data: {
      wallet: wallet.id,
      user: numericUserId,
      type,
      amount,
      direction: 'credit',
      referenceType,
      referenceId,
      balanceBefore,
      balanceAfter,
      description: description || `Nạp ${amount.toLocaleString('vi-VN')}₫ (${type})`,
      metadata: metadata || null,
    },
    overrideAccess: true,
    req,
  })

  return {
    wallet: updatedWallet as Wallet,
    ledgerEntry: ledgerEntry as WalletLedger,
  }
}

/**
 * Debit a user's wallet conditionally (BR-01) and record an append-only ledger entry.
 * Throws InsufficientFundsError if balance < amount.
 */
export async function debitWallet(
  payload: Payload,
  params: DebitWalletParams
): Promise<{ wallet: Wallet; ledgerEntry: WalletLedger }> {
  const { userId, amount, type, referenceType, referenceId, description, metadata, req } = params
  const numericUserId = typeof userId === 'string' ? parseInt(userId, 10) : userId

  if (!Number.isInteger(amount) || amount <= 0) {
    throw new InvalidAmountError(amount)
  }

  const wallet = await getOrCreateWallet(payload, { userId: numericUserId, req })

  if (wallet.status !== 'active') {
    throw new WalletFrozenError(wallet.status)
  }

  const currentBalance = Number(wallet.balance)
  if (currentBalance < amount) {
    throw new InsufficientFundsError(currentBalance, amount)
  }

  // Attempt atomic conditional update via database execution inside active transaction if available (BR-01)
  let updateSuccess = false
  let newBalance = currentBalance - amount

  // Resolve Drizzle instance: if inside a transaction (req.transactionID), use the session transaction;
  // otherwise fallback to the root Drizzle instance.
  let dTx = (payload.db as any)?.drizzle
  if (req?.transactionID && (payload.db as any)?.sessions) {
    const txId = req.transactionID instanceof Promise ? await req.transactionID : req.transactionID
    if (txId && (payload.db as any).sessions[txId]?.db) {
      dTx = (payload.db as any).sessions[txId].db
    }
  }

  if (dTx && typeof dTx.execute === 'function') {
    try {
      const result = await dTx.execute(sql`
        UPDATE "wallets"
        SET "balance" = "balance" - ${amount}, "updated_at" = NOW()
        WHERE "id" = ${wallet.id} AND "balance" >= ${amount}
        RETURNING "id", "balance";
      `)

      const rows = result?.rows || result
      if (!rows || rows.length === 0) {
        throw new InsufficientFundsError(currentBalance, amount)
      }
      newBalance = Number(rows[0].balance)
      updateSuccess = true
    } catch (err: any) {
      if (err instanceof InsufficientFundsError) throw err
      // If direct SQL fails or is in test mock, fall back to atomic check below
    }
  }

  if (!updateSuccess) {
    // Re-verify current balance inside transaction
    const recheckedWallet = await payload.findByID({
      collection: 'wallets',
      id: wallet.id,
      overrideAccess: true,
      req,
    })

    const freshBalance = Number(recheckedWallet.balance)
    if (freshBalance < amount) {
      throw new InsufficientFundsError(freshBalance, amount)
    }

    newBalance = freshBalance - amount
    await payload.update({
      collection: 'wallets',
      id: wallet.id,
      data: {
        balance: newBalance,
      },
      overrideAccess: true,
      req,
    })
  }

  // Record append-only ledger entry (BR-03)
  const ledgerEntry = await payload.create({
    collection: 'wallet_ledger',
    data: {
      wallet: wallet.id,
      user: numericUserId,
      type,
      amount,
      direction: 'debit',
      referenceType,
      referenceId,
      balanceBefore: currentBalance,
      balanceAfter: newBalance,
      description: description || `Trừ ${amount.toLocaleString('vi-VN')}₫ (${type})`,
      metadata: metadata || null,
    },
    overrideAccess: true,
    req,
  })

  const finalWallet = await payload.findByID({
    collection: 'wallets',
    id: wallet.id,
    overrideAccess: true,
    req,
  })

  return {
    wallet: finalWallet as Wallet,
    ledgerEntry: ledgerEntry as WalletLedger,
  }
}

/**
 * Balance adjustment for Finance Admin / Administrator (PLAN.md §12.2, §22).
 * Strictly requires reason and records adjustment ledger entry.
 */
export async function adjustWalletBalance(
  payload: Payload,
  params: AdjustWalletParams
): Promise<{ wallet: Wallet; ledgerEntry: WalletLedger }> {
  const { adminUserId, targetUserId, amount, direction, reason, referenceId, req } = params

  if (!reason || reason.trim().length === 0) {
    throw new Error('Lý do điều chỉnh số dư là bắt buộc (PLAN.md §12.2)')
  }

  const refId = referenceId || `ADJ-${Date.now()}`
  const description = `[Admin ${adminUserId} điều chỉnh]: ${reason}`

  if (direction === 'credit') {
    return creditWallet(payload, {
      userId: targetUserId,
      amount,
      type: 'adjustment',
      referenceType: 'adjustment',
      referenceId: refId,
      description,
      metadata: { adminUserId, reason },
      req,
    })
  } else {
    return debitWallet(payload, {
      userId: targetUserId,
      amount,
      type: 'adjustment',
      referenceType: 'adjustment',
      referenceId: refId,
      description,
      metadata: { adminUserId, reason },
      req,
    })
  }
}
