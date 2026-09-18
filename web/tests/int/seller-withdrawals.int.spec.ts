import { getPayload, type Payload } from 'payload'
import config from '@/payload.config'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { User } from '@/payload-types'

// Interface contracts per PROJECT.md § Interface Contracts
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
  bankInfo?: any
  requestedAt?: string
  updatedAt?: string
}

export interface SellerBalanceSummary {
  totalEarned: number
  pendingBalance: number
  availableBalance: number
  reservedBalance: number
  withdrawnTotal: number
}

describe('Phase 6: Seller Withdrawal Workflow, Balance Reservation & Anti-Race (FR-32, Threat T7, Decision 0005)', () => {
  let payload: Payload
  let bootstrapUser: User
  let sellerUser: User
  let sellerZeroBalanceUser: User
  let financeAdminUser: User
  let _adminUser: User
  let _buyerUser: User

  const cleanup = {
    withdrawalEvents: [] as (number | string)[],
    withdrawals: [] as (number | string)[],
    sellerEarnings: [] as (number | string)[],
    orderItems: [] as (number | string)[],
    orders: [] as (number | string)[],
    products: [] as (number | string)[],
    users: [] as (number | string)[],
  }

  let seq = 0
  const getSeq = () => ++seq

  // Dynamic service loaders for Phase 6
  let requestWithdrawalFn: ((payload: Payload, params: WithdrawalRequestParams) => Promise<WithdrawalResult>) | null = null
  let reviewWithdrawalFn: ((payload: Payload, params: { withdrawalId: number; actorId: number }) => Promise<WithdrawalResult>) | null = null
  let approveWithdrawalFn: ((payload: Payload, params: { withdrawalId: number; actorId: number; notes?: string }) => Promise<WithdrawalResult>) | null = null
  let processWithdrawalFn: ((payload: Payload, params: { withdrawalId: number; actorId: number }) => Promise<WithdrawalResult>) | null = null
  let finalizeWithdrawalPaidFn: ((payload: Payload, params: { withdrawalId: number; actorId: number }) => Promise<WithdrawalResult>) | null = null
  let rejectWithdrawalFn: ((payload: Payload, params: { withdrawalId: number; actorId: number; reason: string }) => Promise<WithdrawalResult>) | null = null
  let cancelWithdrawalFn: ((payload: Payload, params: { withdrawalId: number; sellerId: number }) => Promise<WithdrawalResult>) | null = null
  let getSellerBalanceFn: ((payload: Payload, sellerId: number) => Promise<SellerBalanceSummary>) | null = null

  const createUser = async (email: string, roles: User['roles']): Promise<User> => {
    const user = (await payload.create({
      collection: 'users',
      data: {
        email,
        password: 'test-password-withdrawal-123',
        name: email.split('@')[0],
        roles,
      },
      overrideAccess: true,
    })) as User
    cleanup.users.push(user.id)
    return user
  }

  // Helper to seed mature earnings directly for test setup
  const seedAvailableEarning = async (sellerId: number, amount: number) => {
    try {
      const seqNum = getSeq()
      const timestamp = Date.now()
      const salePrice = Math.round(amount / 0.7)
      const platformFee = salePrice - amount
      const commissionRate = 0.3

      const product = await payload.create({
        collection: 'products',
        data: {
          title: `Seed Product ${seqNum}`,
          slug: `seed-prod-${timestamp}-${seqNum}`,
          price: salePrice,
          isFree: false,
          seller: sellerId,
          copyrightDeclared: true,
          moderationStatus: 'approved',
          _status: 'published',
        },
        overrideAccess: true,
      })

      const order = await payload.create({
        collection: 'orders' as any,
        data: {
          buyer: _buyerUser.id,
          totalAmount: salePrice,
          currency: 'VND',
          status: 'COMPLETED',
          paymentSource: 'wallet',
        },
        overrideAccess: true,
      })

      const orderItem = await payload.create({
        collection: 'order_items' as any,
        data: {
          order: order.id,
          product: product.id,
          seller: sellerId,
          salePrice,
          platformFee,
          sellerAmount: amount,
          tax: 0,
          policyVersion: 'v1-test',
        },
        overrideAccess: true,
      })

      const earningDoc = await payload.create({
        collection: 'seller_earnings' as any,
        data: {
          seller: sellerId,
          order: order.id,
          orderItem: orderItem.id,
          product: product.id,
          commissionRate,
          salePrice,
          platformFee,
          sellerAmount: amount,
          status: 'AVAILABLE',
          holdUntil: new Date(Date.now() - 86400000).toISOString(),
          availableAt: new Date().toISOString(),
          policyVersion: 'v1-test',
        },
        overrideAccess: true,
      })
      cleanup.products.push(product.id)
      cleanup.orders.push(order.id)
      cleanup.orderItems.push(orderItem.id)
      cleanup.sellerEarnings.push(earningDoc.id)
      return earningDoc
    } catch (_ignore) {
      return null
    }
  }

  beforeAll(async () => {
    payload = await getPayload({ config })

    // Dynamically load withdrawal service
    const withdrawalPath = '../../src/services/withdrawal'
    const withdrawalMod = await import(/* @vite-ignore */ withdrawalPath).catch(() => null)
    if (withdrawalMod) {
      requestWithdrawalFn = withdrawalMod.requestWithdrawal
      reviewWithdrawalFn = withdrawalMod.reviewWithdrawal
      approveWithdrawalFn = withdrawalMod.approveWithdrawal
      processWithdrawalFn = withdrawalMod.processWithdrawal
      finalizeWithdrawalPaidFn = withdrawalMod.finalizeWithdrawalPaid
      rejectWithdrawalFn = withdrawalMod.rejectWithdrawal
      cancelWithdrawalFn = withdrawalMod.cancelWithdrawal
    }

    // Dynamically load earnings service
    const earningsPath = '../../src/services/earnings'
    const earningsMod = await import(/* @vite-ignore */ earningsPath).catch(() => null)
    if (earningsMod) {
      getSellerBalanceFn = earningsMod.getSellerBalance
    }

    const timestamp = Date.now()

    // `ensureFirstUserIsAdmin` (src/collections/Users/hooks) appends 'admin' to the roles of the
    // FIRST user created while the users table is EMPTY - which is exactly the CI state: CI applies
    // only the versioned migrations and every spec's afterAll deletes its own users, so each spec
    // file can start from an empty table. Absorb that promotion with a throwaway user BEFORE the
    // role-sensitive fixtures below, otherwise `sellerUser` is silently ['seller', 'admin'] and the
    // "seller cannot act on another seller's withdrawal" style assertions are evaluated against an
    // admin account.
    bootstrapUser = await createUser(
      `bootstrap-wth-${timestamp}-${getSeq()}@kientaohub.local`,
      ['buyer'],
    )

    sellerUser = await createUser(`seller-wth-${timestamp}-${getSeq()}@kientaohub.local`, ['seller'])
    sellerZeroBalanceUser = await createUser(`seller-zero-${timestamp}-${getSeq()}@kientaohub.local`, ['seller'])
    financeAdminUser = await createUser(`finance-wth-${timestamp}-${getSeq()}@kientaohub.local`, ['financeAdmin'])
    _adminUser = await createUser(`admin-wth-${timestamp}-${getSeq()}@kientaohub.local`, ['admin'])
    _buyerUser = await createUser(`buyer-wth-${timestamp}-${getSeq()}@kientaohub.local`, ['buyer'])

    // Guard: the fixtures must hold EXACTLY the roles they declare, whether or not the users table
    // started empty (the bootstrap user above owns the first-user promotion). If the promotion ever
    // lands on one of them again, these assertions fail loudly instead of letting the withdrawal
    // authorization matrix silently lose its meaning.
    expect(sellerUser.roles).toEqual(['seller'])
    expect(sellerUser.roles).not.toContain('admin')
    expect(sellerZeroBalanceUser.roles).toEqual(['seller'])
    expect(financeAdminUser.roles).toEqual(['financeAdmin'])
    expect(_buyerUser.roles).toEqual(['buyer'])

    // Seed 2,000,000 VND available earnings for sellerUser
    await seedAvailableEarning(sellerUser.id, 2000000)
  })

  afterAll(async () => {
    // Reverse dependency cleanup
    for (const id of cleanup.withdrawalEvents) {
      try {
        await payload.delete({ collection: 'withdrawal_events' as any, id, overrideAccess: true })
      } catch (_ignore) {}
    }
    for (const id of cleanup.withdrawals) {
      try {
        await payload.delete({ collection: 'withdrawals' as any, id, overrideAccess: true })
      } catch (_ignore) {}
    }
    for (const id of cleanup.sellerEarnings) {
      try {
        await payload.delete({ collection: 'seller_earnings' as any, id, overrideAccess: true })
      } catch (_ignore) {}
    }
    for (const id of cleanup.orderItems) {
      try {
        await payload.delete({ collection: 'order_items' as any, id, overrideAccess: true })
      } catch (_ignore) {}
    }
    for (const id of cleanup.orders) {
      try {
        await payload.delete({ collection: 'orders' as any, id, overrideAccess: true })
      } catch (_ignore) {}
    }
    for (const id of cleanup.products) {
      try {
        await payload.delete({ collection: 'products', id, overrideAccess: true })
      } catch (_ignore) {}
    }
    for (const id of cleanup.users) {
      try {
        await payload.delete({ collection: 'users', id, overrideAccess: true })
      } catch (_ignore) {}
    }
  })

  it('Tier 1: Withdrawal Request & Atomic Balance Reservation - Reserves balance and sets status to REQUESTED', async () => {
    if (!requestWithdrawalFn) {
      throw new Error('M3 pending: requestWithdrawal service not yet implemented in web/src/services/withdrawal.ts')
    }

    const initialBalance = getSellerBalanceFn ? await getSellerBalanceFn(payload, sellerUser.id) : null

    const result = await requestWithdrawalFn(payload, {
      sellerId: sellerUser.id,
      amount: 500000,
      bankInfo: {
        bankName: 'Vietcombank',
        accountNumber: '0123456789',
        accountHolderName: 'NGUYEN VAN A',
      },
    })

    expect(result).toBeDefined()
    expect(result.id).toBeDefined()
    expect(result.code).toMatch(/^WTH-/)
    expect(result.amount).toBe(500000)
    expect(result.status).toBe('REQUESTED')
    cleanup.withdrawals.push(result.id)

    if (getSellerBalanceFn && initialBalance) {
      const updatedBalance = await getSellerBalanceFn(payload, sellerUser.id)
      expect(updatedBalance.availableBalance).toBe(initialBalance.availableBalance - 500000)
      expect(updatedBalance.reservedBalance).toBe(initialBalance.reservedBalance + 500000)
    }
  })

  it('Tier 1: Bank Details Validation - Rejects request missing required bank fields without balance reservation', async () => {
    if (!requestWithdrawalFn) {
      throw new Error('M3 pending: requestWithdrawal service not yet implemented in web/src/services/withdrawal.ts')
    }

    // Missing bankName
    await expect(
      requestWithdrawalFn(payload, {
        sellerId: sellerUser.id,
        amount: 100000,
        bankInfo: {
          bankName: '',
          accountNumber: '0123456789',
          accountHolderName: 'NGUYEN VAN A',
        },
      })
    ).rejects.toThrow()

    // Missing accountNumber
    await expect(
      requestWithdrawalFn(payload, {
        sellerId: sellerUser.id,
        amount: 100000,
        bankInfo: {
          bankName: 'Vietcombank',
          accountNumber: '',
          accountHolderName: 'NGUYEN VAN A',
        },
      })
    ).rejects.toThrow()

    // Missing accountHolderName
    await expect(
      requestWithdrawalFn(payload, {
        sellerId: sellerUser.id,
        amount: 100000,
        bankInfo: {
          bankName: 'Vietcombank',
          accountNumber: '0123456789',
          accountHolderName: '',
        },
      })
    ).rejects.toThrow()
  })

  it('Tier 1: Full 8-State Success Lifecycle - REQUESTED -> UNDER_REVIEW -> APPROVED -> PROCESSING -> PAID', async () => {
    if (
      !requestWithdrawalFn ||
      !reviewWithdrawalFn ||
      !approveWithdrawalFn ||
      !processWithdrawalFn ||
      !finalizeWithdrawalPaidFn
    ) {
      throw new Error('M3 pending: withdrawal state machine services not yet implemented in web/src/services/withdrawal.ts')
    }

    // 1. Submit Request (REQUESTED)
    const withdrawal = await requestWithdrawalFn(payload, {
      sellerId: sellerUser.id,
      amount: 200000,
      bankInfo: {
        bankName: 'MBBank',
        accountNumber: '9876543210',
        accountHolderName: 'TRAN THI B',
      },
    })
    cleanup.withdrawals.push(withdrawal.id)
    expect(withdrawal.status).toBe('REQUESTED')

    // 2. Review (UNDER_REVIEW)
    const reviewed = await reviewWithdrawalFn(payload, {
      withdrawalId: withdrawal.id,
      actorId: financeAdminUser.id,
    })
    expect(reviewed.status).toBe('UNDER_REVIEW')

    // 3. Approve (APPROVED)
    const approved = await approveWithdrawalFn(payload, {
      withdrawalId: withdrawal.id,
      actorId: financeAdminUser.id,
      notes: 'Đầy đủ hồ sơ hợp lệ',
    })
    expect(approved.status).toBe('APPROVED')

    // 4. Process (PROCESSING)
    const processing = await processWithdrawalFn(payload, {
      withdrawalId: withdrawal.id,
      actorId: financeAdminUser.id,
    })
    expect(processing.status).toBe('PROCESSING')

    // 5. Finalize Paid (PAID)
    const paid = await finalizeWithdrawalPaidFn(payload, {
      withdrawalId: withdrawal.id,
      actorId: financeAdminUser.id,
    })
    expect(paid.status).toBe('PAID')

    if (getSellerBalanceFn) {
      const finalBalance = await getSellerBalanceFn(payload, sellerUser.id)
      expect(finalBalance.withdrawnTotal).toBeGreaterThanOrEqual(200000)
    }
  })

  it('Tier 1: Seller Cancellation - Cancelling withdrawal in REQUESTED status restores reserved balance to available', async () => {
    if (!requestWithdrawalFn || !cancelWithdrawalFn) {
      throw new Error('M3 pending: cancellation service not yet implemented in web/src/services/withdrawal.ts')
    }

    const beforeBalance = getSellerBalanceFn ? await getSellerBalanceFn(payload, sellerUser.id) : null

    // Seller creates request
    const withdrawal = await requestWithdrawalFn(payload, {
      sellerId: sellerUser.id,
      amount: 150000,
      bankInfo: {
        bankName: 'Techcombank',
        accountNumber: '1903123456',
        accountHolderName: 'LE VAN C',
      },
    })
    cleanup.withdrawals.push(withdrawal.id)

    // Seller cancels own withdrawal
    const cancelled = await cancelWithdrawalFn(payload, {
      withdrawalId: withdrawal.id,
      sellerId: sellerUser.id,
    })
    expect(cancelled.status).toBe('CANCELLED')

    if (getSellerBalanceFn && beforeBalance) {
      const afterBalance = await getSellerBalanceFn(payload, sellerUser.id)
      // Balance restored
      expect(afterBalance.availableBalance).toBe(beforeBalance.availableBalance)
      expect(afterBalance.reservedBalance).toBe(beforeBalance.reservedBalance)
    }
  })

  it('Tier 1: Finance Admin Rejection - Rejecting withdrawal with reason restores reserved balance to available', async () => {
    if (!requestWithdrawalFn || !rejectWithdrawalFn) {
      throw new Error('M3 pending: rejection service not yet implemented in web/src/services/withdrawal.ts')
    }

    const beforeBalance = getSellerBalanceFn ? await getSellerBalanceFn(payload, sellerUser.id) : null

    const withdrawal = await requestWithdrawalFn(payload, {
      sellerId: sellerUser.id,
      amount: 120000,
      bankInfo: {
        bankName: 'ACB',
        accountNumber: '246813579',
        accountHolderName: 'PHAM VAN D',
      },
    })
    cleanup.withdrawals.push(withdrawal.id)

    // Finance admin rejects with reason
    const rejected = await rejectWithdrawalFn(payload, {
      withdrawalId: withdrawal.id,
      actorId: financeAdminUser.id,
      reason: 'Số tài khoản ngân hàng không tồn tại theo tra cứu Napas',
    })
    expect(rejected.status).toBe('REJECTED')

    if (getSellerBalanceFn && beforeBalance) {
      const afterBalance = await getSellerBalanceFn(payload, sellerUser.id)
      expect(afterBalance.availableBalance).toBe(beforeBalance.availableBalance)
      expect(afterBalance.reservedBalance).toBe(beforeBalance.reservedBalance)
    }
  })

  it('Tier 1: Audit Trail (withdrawal_events) - Every state transition records an immutable audit entry', async () => {
    if (!requestWithdrawalFn || !rejectWithdrawalFn) {
      throw new Error('M3 pending: services not yet implemented')
    }

    const withdrawal = await requestWithdrawalFn(payload, {
      sellerId: sellerUser.id,
      amount: 100000,
      bankInfo: {
        bankName: 'VietinBank',
        accountNumber: '1100223344',
        accountHolderName: 'HOANG VAN E',
      },
    })
    cleanup.withdrawals.push(withdrawal.id)

    await rejectWithdrawalFn(payload, {
      withdrawalId: withdrawal.id,
      actorId: financeAdminUser.id,
      reason: 'Tên chủ tài khoản không trùng khớp',
    })

    // Verify audit logs in withdrawal_events collection
    const events = await payload.find({
      collection: 'withdrawal_events' as any,
      where: { withdrawal: { equals: withdrawal.id } },
      sort: 'createdAt',
      overrideAccess: true,
    })

    expect(events.docs.length).toBeGreaterThanOrEqual(2)
    const reqEvent = events.docs.find((e: any) => e.toStatus === 'REQUESTED')
    const rejEvent = events.docs.find((e: any) => e.toStatus === 'REJECTED')

    expect(reqEvent).toBeDefined()
    expect(rejEvent).toBeDefined()
    expect((rejEvent as any).reason).toContain('Tên chủ tài khoản không trùng khớp')
  })

  it('Tier 2: Boundary - Min withdrawal limit (50,000 VND) enforced with typed error / 400', async () => {
    if (!requestWithdrawalFn) {
      throw new Error('M3 pending: requestWithdrawal service not yet implemented in web/src/services/withdrawal.ts')
    }

    // 49,999 VND (< 50,000)
    await expect(
      requestWithdrawalFn(payload, {
        sellerId: sellerUser.id,
        amount: 49999,
        bankInfo: {
          bankName: 'Vietcombank',
          accountNumber: '0123456789',
          accountHolderName: 'NGUYEN VAN A',
        },
      })
    ).rejects.toThrow(/min|50,?000/i)

    // 20,000 VND (< 50,000)
    await expect(
      requestWithdrawalFn(payload, {
        sellerId: sellerUser.id,
        amount: 20000,
        bankInfo: {
          bankName: 'Vietcombank',
          accountNumber: '0123456789',
          accountHolderName: 'NGUYEN VAN A',
        },
      })
    ).rejects.toThrow(/min|50,?000/i)

    // Exactly 50,000 VND must succeed
    const validMin = await requestWithdrawalFn(payload, {
      sellerId: sellerUser.id,
      amount: 50000,
      bankInfo: {
        bankName: 'Vietcombank',
        accountNumber: '0123456789',
        accountHolderName: 'NGUYEN VAN A',
      },
    })
    expect(validMin.status).toBe('REQUESTED')
    cleanup.withdrawals.push(validMin.id)
  })

  it('Tier 2: Boundary - Max withdrawal limit (50,000,000 VND) enforced with typed error / 400', async () => {
    if (!requestWithdrawalFn) {
      throw new Error('M3 pending: requestWithdrawal service not yet implemented in web/src/services/withdrawal.ts')
    }

    // 50,000,001 VND (> 50,000,000)
    await expect(
      requestWithdrawalFn(payload, {
        sellerId: sellerUser.id,
        amount: 50000001,
        bankInfo: {
          bankName: 'Vietcombank',
          accountNumber: '0123456789',
          accountHolderName: 'NGUYEN VAN A',
        },
      })
    ).rejects.toThrow(/max|50,?000,?000/i)
  })

  it('Tier 2: Boundary - Overdraft prevention: Requesting amount exceeding available balance is strictly rejected', async () => {
    if (!requestWithdrawalFn || !getSellerBalanceFn) {
      throw new Error('M3 pending: services not yet implemented')
    }

    const currentBalance = await getSellerBalanceFn(payload, sellerUser.id)
    const overAmount = currentBalance.availableBalance + 100000

    await expect(
      requestWithdrawalFn(payload, {
        sellerId: sellerUser.id,
        amount: overAmount,
        bankInfo: {
          bankName: 'Vietcombank',
          accountNumber: '0123456789',
          accountHolderName: 'NGUYEN VAN A',
        },
      })
    ).rejects.toThrow(/insufficient|balance/i)
  })

  it('Tier 2: Boundary - Zero balance seller attempting withdrawal is rejected', async () => {
    if (!requestWithdrawalFn) {
      throw new Error('M3 pending: requestWithdrawal service not yet implemented in web/src/services/withdrawal.ts')
    }

    await expect(
      requestWithdrawalFn(payload, {
        sellerId: sellerZeroBalanceUser.id,
        amount: 50000,
        bankInfo: {
          bankName: 'Vietcombank',
          accountNumber: '0123456789',
          accountHolderName: 'SELLER ZERO',
        },
      })
    ).rejects.toThrow(/insufficient|balance/i)
  })

  it('Tier 2: Boundary - Exact balance withdrawal: Withdrawing exactly available balance succeeds and leaves 0 available', async () => {
    if (!requestWithdrawalFn || !getSellerBalanceFn) {
      throw new Error('M3 pending: services not yet implemented')
    }

    // Create a dedicated seller with exactly 100,000 VND
    const timestamp = Date.now()
    const exactSeller = await createUser(`seller-exact-${timestamp}@kientaohub.local`, ['seller'])
    await seedAvailableEarning(exactSeller.id, 100000)

    const result = await requestWithdrawalFn(payload, {
      sellerId: exactSeller.id,
      amount: 100000,
      bankInfo: {
        bankName: 'Vietcombank',
        accountNumber: '0123456789',
        accountHolderName: 'EXACT SELLER',
      },
    })
    cleanup.withdrawals.push(result.id)

    const balanceAfter = await getSellerBalanceFn(payload, exactSeller.id)
    expect(balanceAfter.availableBalance).toBe(0)
    expect(balanceAfter.reservedBalance).toBe(100000)
  })

  it('Tier 2: Boundary - Negative or zero withdrawal amount injection is rejected', async () => {
    if (!requestWithdrawalFn) {
      throw new Error('M3 pending: requestWithdrawal service not yet implemented in web/src/services/withdrawal.ts')
    }

    await expect(
      requestWithdrawalFn(payload, {
        sellerId: sellerUser.id,
        amount: -50000,
        bankInfo: {
          bankName: 'Vietcombank',
          accountNumber: '0123456789',
          accountHolderName: 'NEGATIVE TEST',
        },
      })
    ).rejects.toThrow()

    await expect(
      requestWithdrawalFn(payload, {
        sellerId: sellerUser.id,
        amount: 0,
        bankInfo: {
          bankName: 'Vietcombank',
          accountNumber: '0123456789',
          accountHolderName: 'ZERO TEST',
        },
      })
    ).rejects.toThrow()
  })

  it('Tier 2: Terminal State Immutability - Cannot transition or cancel from terminal states (PAID, REJECTED, CANCELLED)', async () => {
    if (!requestWithdrawalFn || !rejectWithdrawalFn || !approveWithdrawalFn || !cancelWithdrawalFn) {
      throw new Error('M3 pending: services not yet implemented')
    }

    // Create and reject
    const wth = await requestWithdrawalFn(payload, {
      sellerId: sellerUser.id,
      amount: 60000,
      bankInfo: {
        bankName: 'Vietcombank',
        accountNumber: '0123456789',
        accountHolderName: 'TERMINAL TEST',
      },
    })
    cleanup.withdrawals.push(wth.id)

    await rejectWithdrawalFn(payload, {
      withdrawalId: wth.id,
      actorId: financeAdminUser.id,
      reason: 'Rejected test',
    })

    // Cannot approve a REJECTED withdrawal
    await expect(
      approveWithdrawalFn(payload, {
        withdrawalId: wth.id,
        actorId: financeAdminUser.id,
      })
    ).rejects.toThrow(/invalid|status/i)

    // Cannot cancel an already REJECTED withdrawal
    await expect(
      cancelWithdrawalFn(payload, {
        withdrawalId: wth.id,
        sellerId: sellerUser.id,
      })
    ).rejects.toThrow(/invalid|status/i)
  })

  it('Tier 3: Concurrency & Race Condition Test (Threat T7) - Two concurrent 400k requests against 500k balance: exactly 1 succeeds, 1 rejected, balance never negative', async () => {
    if (!requestWithdrawalFn || !getSellerBalanceFn) {
      throw new Error('M3 pending: services not yet implemented')
    }

    // Create fresh seller with exactly 500,000 VND
    const timestamp = Date.now()
    const raceSeller = await createUser(`seller-race-${timestamp}@kientaohub.local`, ['seller'])
    await seedAvailableEarning(raceSeller.id, 500000)

    const requestParams = {
      sellerId: raceSeller.id,
      amount: 400000,
      bankInfo: {
        bankName: 'Vietcombank',
        accountNumber: '0123456789',
        accountHolderName: 'RACE CONDITION TEST',
      },
    }

    // Fire 2 simultaneous requests in parallel
    const [res1, res2] = await Promise.allSettled([
      requestWithdrawalFn(payload, requestParams),
      requestWithdrawalFn(payload, requestParams),
    ])

    const fulfilled = [res1, res2].filter((r) => r.status === 'fulfilled') as PromiseFulfilledResult<WithdrawalResult>[]
    const rejected = [res1, res2].filter((r) => r.status === 'rejected') as PromiseRejectedResult[]

    // Exactly 1 must succeed and 1 must fail
    expect(fulfilled.length).toBe(1)
    expect(rejected.length).toBe(1)

    cleanup.withdrawals.push(fulfilled[0].value.id)

    // Verify error message on the rejected request indicates insufficient balance
    expect(rejected[0].reason?.message || String(rejected[0].reason)).toMatch(/insufficient|balance/i)

    // Verify balance is never negative
    const finalBalance = await getSellerBalanceFn(payload, raceSeller.id)
    expect(finalBalance.availableBalance).toBe(100000)
    expect(finalBalance.reservedBalance).toBe(400000)
    expect(finalBalance.availableBalance).toBeGreaterThanOrEqual(0)
  })
})
