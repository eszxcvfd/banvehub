import { getPayload, type Payload } from 'payload'
import config from '@/payload.config'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { User, Wallet } from '@/payload-types'
import {
  creditWallet,
  debitWallet,
  adjustWalletBalance,
  getOrCreateWallet,
  InsufficientFundsError,
} from '@/services/wallet'

describe('Phase 4: Wallet & Ledger Invariants (BR-01, BR-03, Decision 0002)', () => {
  let payload: Payload
  let buyerUser: User
  let adminUser: User
  let wallet: Wallet

  const cleanup = {
    users: [] as (number | string)[],
  }

  beforeAll(async () => {
    payload = await getPayload({ config })

    const timestamp = Date.now()
    buyerUser = (await payload.create({
      collection: 'users',
      data: {
        email: `buyer-invariant-${timestamp}@kientaohub.local`,
        password: 'test-password-payment-123',
        name: 'Buyer Invariant Tester',
        roles: ['buyer'],
      },
      overrideAccess: true,
    })) as User
    cleanup.users.push(buyerUser.id)

    adminUser = (await payload.create({
      collection: 'users',
      data: {
        email: `admin-invariant-${timestamp}@kientaohub.local`,
        password: 'test-password-payment-123',
        name: 'Admin Invariant Tester',
        roles: ['admin'],
      },
      overrideAccess: true,
    })) as User
    cleanup.users.push(adminUser.id)

    wallet = await getOrCreateWallet(payload, { userId: buyerUser.id })
  })

  afterAll(async () => {
    for (const id of cleanup.users) {
      try {
        await payload.delete({ collection: 'users', id, overrideAccess: true })
      } catch (_ignore) {}
    }
  })

  it('Decision 0002: Direct writes are denied for all principals including administrator', async () => {
    // 1. Normal user cannot create a wallet directly
    await expect(
      payload.create({
        collection: 'wallets',
        data: {
          user: buyerUser.id,
          balance: 1000000,
          pendingBalance: 0,
          currency: 'VND',
          status: 'active',
        },
        user: buyerUser,
        overrideAccess: false,
      })
    ).rejects.toThrow()

    // 2. Administrator CANNOT update wallet balance directly through collection API
    await expect(
      payload.update({
        collection: 'wallets',
        id: wallet.id,
        data: {
          balance: 9999999,
        },
        user: adminUser,
        overrideAccess: false,
      })
    ).rejects.toThrow()

    // 3. Administrator CANNOT insert ledger rows directly through collection API
    await expect(
      payload.create({
        collection: 'wallet_ledger',
        data: {
          wallet: wallet.id,
          user: buyerUser.id,
          type: 'adjustment',
          amount: 500000,
          direction: 'credit',
          referenceType: 'adjustment',
          referenceId: 'HACK_123',
          balanceBefore: 0,
          balanceAfter: 500000,
        },
        user: adminUser,
        overrideAccess: false,
      })
    ).rejects.toThrow()

    // 4. Administrator CANNOT delete a wallet or ledger row
    await expect(
      payload.delete({
        collection: 'wallets',
        id: wallet.id,
        user: adminUser,
        overrideAccess: false,
      })
    ).rejects.toThrow()
  })

  it('BR-01: Debit fails explicitly when funds are insufficient (no negative balance)', async () => {
    // Current balance is 0
    const freshWallet = await getOrCreateWallet(payload, { userId: buyerUser.id })
    expect(Number(freshWallet.balance)).toBe(0)

    // Attempting to debit 50,000 VND must throw InsufficientFundsError
    await expect(
      debitWallet(payload, {
        userId: buyerUser.id,
        amount: 50000,
        type: 'purchase',
        referenceType: 'order',
        referenceId: 'ORD_TEST_FAIL',
      })
    ).rejects.toThrow(InsufficientFundsError)

    // Check balance remains 0
    const checkWallet = await getOrCreateWallet(payload, { userId: buyerUser.id })
    expect(Number(checkWallet.balance)).toBe(0)
  })

  it('Database Check Constraint: Prevents negative balance at PostgreSQL level', async () => {
    const pool = (payload.db as any).pool
    expect(pool).toBeDefined()
    // Direct raw SQL attempt to set balance to -10,000 must be rejected by check constraint
    await expect(
      pool.query('UPDATE "wallets" SET "balance" = -10000 WHERE "id" = $1', [wallet.id])
    ).rejects.toThrow(/wallets_balance_non_negative/i)
  })

  it('BR-03 & Decision 0002: PostgreSQL Triggers refuse UPDATE and DELETE on wallet_ledger', async () => {
    // First, credit 200,000 VND to create a legitimate ledger row
    const { ledgerEntry } = await creditWallet(payload, {
      userId: buyerUser.id,
      amount: 200000,
      type: 'topup',
      referenceType: 'system',
      referenceId: 'TOPUP_INIT_200K',
    })

    const pool = (payload.db as any).pool
    expect(pool).toBeDefined()

    // 1. Trigger forbids UPDATE on wallet_ledger
    await expect(
      pool.query('UPDATE "wallet_ledger" SET "amount" = 999999 WHERE "id" = $1', [ledgerEntry.id])
    ).rejects.toThrow(/forbid_financial_mutation|Decision 0002/i)

    // 2. Trigger forbids DELETE on wallet_ledger
    await expect(
      pool.query('DELETE FROM "wallet_ledger" WHERE "id" = $1', [ledgerEntry.id])
    ).rejects.toThrow(/forbid_financial_mutation|Decision 0002/i)

    // 3. Trigger forbids DELETE on wallets
    await expect(
      pool.query('DELETE FROM "wallets" WHERE "id" = $1', [wallet.id])
    ).rejects.toThrow(/forbid_financial_mutation|Decision 0002/i)
  })

  it('Balance Derivation: Sum of ledger credits minus debits equals wallet.balance', async () => {
    // Starting with 200,000 from previous test
    // 1. Debit 70,000 for purchase
    await debitWallet(payload, {
      userId: buyerUser.id,
      amount: 70000,
      type: 'purchase',
      referenceType: 'order',
      referenceId: 'ORD_PURCHASE_1',
    })

    // 2. Debit 50,000 for another purchase
    await debitWallet(payload, {
      userId: buyerUser.id,
      amount: 50000,
      type: 'purchase',
      referenceType: 'order',
      referenceId: 'ORD_PURCHASE_2',
    })

    // 3. Credit 100,000 topup
    await creditWallet(payload, {
      userId: buyerUser.id,
      amount: 100000,
      type: 'topup',
      referenceType: 'payment_intent',
      referenceId: 'TOPUP_2',
    })

    // 4. Admin adjustment of +20,000
    await adjustWalletBalance(payload, {
      adminUserId: adminUser.id,
      targetUserId: buyerUser.id,
      amount: 20000,
      direction: 'credit',
      reason: 'Bù tiền khuyến mãi theo chính sách chăm sóc khách hàng',
    })

    // Query all ledger rows for buyerUser
    const ledgers = await payload.find({
      collection: 'wallet_ledger',
      where: {
        user: { equals: buyerUser.id },
      },
      limit: 100,
      overrideAccess: true,
    })

    let calculatedBalance = 0
    for (const doc of ledgers.docs) {
      const amt = Number(doc.amount)
      if (doc.direction === 'credit') {
        calculatedBalance += amt
      } else if (doc.direction === 'debit') {
        calculatedBalance -= amt
      }
    }

    // 200,000 - 70,000 - 50,000 + 100,000 + 20,000 = 200,000
    expect(calculatedBalance).toBe(200000)

    const finalWallet = await getOrCreateWallet(payload, { userId: buyerUser.id })
    expect(Number(finalWallet.balance)).toBe(calculatedBalance)
  })
})
