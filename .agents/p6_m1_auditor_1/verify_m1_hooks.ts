import assert from 'assert'
import { calculateHoldUntil } from '../../web/src/collections/SellerEarnings/hooks/calculateHoldUntil'
import { validateEarningMath } from '../../web/src/collections/SellerEarnings/hooks/validateEarningMath'
import { preventEarningMutation } from '../../web/src/collections/SellerEarnings/hooks/preventEarningMutation'
import { generateWithdrawalCode } from '../../web/src/collections/Withdrawals/hooks/generateWithdrawalCode'
import {
  validateWithdrawalBeforeValidate,
  validateWithdrawalInvariants,
} from '../../web/src/collections/Withdrawals/hooks/validateWithdrawalInvariants'
import {
  preventWithdrawalEventMutation,
  preventWithdrawalEventDeletion,
} from '../../web/src/collections/WithdrawalEvents/hooks/preventWithdrawalEventMutation'

async function runAudit() {
  console.log('--- AUDITING MILESTONE 1 HOOKS EMPIRICALLY ---')

  // 1. validateEarningMath
  console.log('\n[Check 1] validateEarningMath:')
  {
    // Valid math
    const valid = validateEarningMath({
      data: { salePrice: 100000, platformFee: 30000, sellerAmount: 70000, commissionRate: 0.3 },
      operation: 'create',
    } as any)
    assert.strictEqual(valid.salePrice, 100000)
    console.log('  ✓ Valid math accepted')

    // Invariant mismatch
    assert.throws(
      () => {
        validateEarningMath({
          data: { salePrice: 100000, platformFee: 30000, sellerAmount: 60000, commissionRate: 0.3 },
          operation: 'create',
        } as any)
      },
      /Financial invariant violation/,
      'Should throw invariant violation'
    )
    console.log('  ✓ Invariant mismatch rejected')

    // Negative amounts
    assert.throws(
      () => {
        validateEarningMath({
          data: { salePrice: -10, platformFee: 0, sellerAmount: -10, commissionRate: 0.3 },
          operation: 'create',
        } as any)
      },
      /non-negative integers/,
      'Should throw non-negative integers'
    )
    console.log('  ✓ Negative amounts rejected')

    // Invalid rate
    assert.throws(
      () => {
        validateEarningMath({
          data: { salePrice: 100, platformFee: 30, sellerAmount: 70, commissionRate: 1.5 },
          operation: 'create',
        } as any)
      },
      /Commission rate must be between 0 and 1/,
      'Should throw commission rate out of range'
    )
    console.log('  ✓ Invalid rate (>1) rejected')
  }

  // 2. calculateHoldUntil
  console.log('\n[Check 2] calculateHoldUntil:')
  {
    const before = Date.now()
    const res7 = calculateHoldUntil({
      data: { holdPeriodDays: 7 },
      operation: 'create',
    } as any)
    assert(res7.holdUntil, 'holdUntil must be populated')
    const holdTime = new Date(res7.holdUntil).getTime()
    assert(holdTime >= before + 7 * 24 * 3600 * 1000 - 1000, 'Hold time should be ~7 days in future')
    console.log('  ✓ 7-day hold calculated correctly:', res7.holdUntil)

    const res0 = calculateHoldUntil({
      data: { holdPeriodDays: 0 },
      operation: 'create',
    } as any)
    assert.strictEqual(res0.status, 'AVAILABLE')
    assert(res0.availableAt, 'availableAt should be set for 0-day hold')
    console.log('  ✓ 0-day hold immediately sets status=AVAILABLE')
  }

  // 3. preventEarningMutation
  console.log('\n[Check 3] preventEarningMutation:')
  {
    const originalDoc = {
      id: 1,
      seller: 10,
      order: 20,
      orderItem: 30,
      product: 40,
      salePrice: 100000,
      platformFee: 30000,
      sellerAmount: 70000,
      commissionRate: 0.3,
      currency: 'VND',
      holdPeriodDays: 7,
      policyVersion: 'v1',
      status: 'PENDING',
    }

    // Try modifying salePrice
    assert.throws(
      () => {
        preventEarningMutation({
          data: { salePrice: 200000 },
          originalDoc,
          operation: 'update',
        } as any)
      },
      /Snapshot field "salePrice" is immutable/,
      'Should block mutating salePrice'
    )
    console.log('  ✓ Mutation of salePrice blocked')

    // Try modifying seller
    assert.throws(
      () => {
        preventEarningMutation({
          data: { seller: 99 },
          originalDoc,
          operation: 'update',
        } as any)
      },
      /Snapshot field "seller" is immutable/,
      'Should block mutating seller'
    )
    console.log('  ✓ Mutation of seller blocked')

    // Invalid transition PENDING -> PAID directly
    assert.throws(
      () => {
        preventEarningMutation({
          data: { status: 'PAID' },
          originalDoc,
          operation: 'update',
        } as any)
      },
      /Invalid seller earning state transition from PENDING to PAID/,
      'Should block illegal transition'
    )
    console.log('  ✓ Illegal transition PENDING -> PAID blocked')

    // Valid transition PENDING -> AVAILABLE
    const validTransition = preventEarningMutation({
      data: { status: 'AVAILABLE' },
      originalDoc,
      operation: 'update',
    } as any)
    assert.strictEqual(validTransition.status, 'AVAILABLE')
    assert(validTransition.availableAt, 'availableAt must be stamped')
    console.log('  ✓ Valid transition PENDING -> AVAILABLE stamped availableAt')
  }

  // 4. generateWithdrawalCode
  console.log('\n[Check 4] generateWithdrawalCode:')
  {
    const code = generateWithdrawalCode({
      value: undefined,
      operation: 'create',
    } as any)
    assert(typeof code === 'string')
    assert(/^WTH-\d{8}-[A-F0-9]{8}$/.test(code), `Code ${code} must match WTH-YYYYMMDD-XXXXXXXX`)
    console.log('  ✓ Generated valid code:', code)
  }

  // 5. validateWithdrawalBeforeValidate & validateWithdrawalInvariants
  console.log('\n[Check 5] validateWithdrawal invariants:')
  {
    // Amount limits
    assert.throws(
      () => {
        validateWithdrawalBeforeValidate({
          data: { amount: 49999 },
          operation: 'create',
        } as any)
      },
      /Withdrawal amount must be an integer between 50,000 and 50,000,000 VND/,
      'Should reject amount < 50000'
    )
    console.log('  ✓ Amount < 50,000 rejected')

    assert.throws(
      () => {
        validateWithdrawalBeforeValidate({
          data: { amount: 50000001 },
          operation: 'create',
        } as any)
      },
      /Withdrawal amount must be an integer between 50,000 and 50,000,000 VND/,
      'Should reject amount > 50,000,000'
    )
    console.log('  ✓ Amount > 50,000,000 rejected')

    assert.throws(
      () => {
        validateWithdrawalBeforeValidate({
          data: { amount: 100000.5 },
          operation: 'create',
        } as any)
      },
      /Withdrawal amount must be an integer between 50,000 and 50,000,000 VND/,
      'Should reject non-integer amount'
    )
    console.log('  ✓ Non-integer amount rejected')

    // Bank info normalization
    const normalized = validateWithdrawalBeforeValidate({
      data: {
        bankInfo: {
          bankName: ' Vietcombank ',
          accountNumber: ' 0123 456 789 ',
          accountHolderName: ' nguyen van a ',
        },
      },
      operation: 'create',
    } as any)
    assert.strictEqual(normalized.bankInfo.bankName, 'Vietcombank')
    assert.strictEqual(normalized.bankInfo.accountNumber, '0123456789')
    assert.strictEqual(normalized.bankInfo.accountHolderName, 'NGUYEN VAN A')
    console.log('  ✓ Bank info normalized cleanly')

    // Invariants on update
    const origWithdrawal = {
      id: 1,
      code: 'WTH-20260915-ABCDE',
      seller: 5,
      amount: 1000000,
      currency: 'VND',
      status: 'REQUESTED',
    }

    // Try changing amount
    await assert.rejects(
      async () => {
        await validateWithdrawalInvariants({
          data: { amount: 2000000 },
          originalDoc: origWithdrawal,
          operation: 'update',
          req: {} as any,
        } as any)
      },
      /Cannot change amount on an existing withdrawal record/,
      'Should block changing amount'
    )
    console.log('  ✓ Changing withdrawal amount blocked')

    // Invalid transition REQUESTED -> PAID
    await assert.rejects(
      async () => {
        await validateWithdrawalInvariants({
          data: { status: 'PAID' },
          originalDoc: origWithdrawal,
          operation: 'update',
          req: {} as any,
        } as any)
      },
      /Invalid withdrawal state transition from REQUESTED to PAID/,
      'Should block invalid transition'
    )
    console.log('  ✓ Invalid transition REQUESTED -> PAID blocked')

    // Rejecting without reason
    await assert.rejects(
      async () => {
        await validateWithdrawalInvariants({
          data: { status: 'REJECTED' },
          originalDoc: origWithdrawal,
          operation: 'update',
          req: {} as any,
        } as any)
      },
      /Rejection reason is required when rejecting a withdrawal/,
      'Should require rejection reason'
    )
    console.log('  ✓ Rejection without reason blocked')

    // Valid rejection with reason
    const validReject = await validateWithdrawalInvariants({
      data: { status: 'REJECTED', rejectionReason: 'Bank account invalid' },
      originalDoc: origWithdrawal,
      operation: 'update',
      req: { user: { id: 999 } } as any,
    } as any)
    assert.strictEqual(validReject.status, 'REJECTED')
    assert(validReject.reviewedAt)
    assert.strictEqual(validReject.reviewedBy, 999)
    console.log('  ✓ Valid rejection stamped review metadata')
  }

  // 6. preventWithdrawalEventMutation
  console.log('\n[Check 6] preventWithdrawalEventMutation:')
  {
    await assert.rejects(
      async () => {
        await preventWithdrawalEventMutation({
          data: {},
          operation: 'update',
          req: {} as any,
        } as any)
      },
      /Withdrawal audit events are immutable/,
      'Should block update of audit events'
    )
    console.log('  ✓ Updating withdrawal event blocked')

    await assert.rejects(
      async () => {
        await preventWithdrawalEventDeletion()
      },
      /Withdrawal audit events are immutable records and cannot be deleted/,
      'Should block deletion of audit events'
    )
    console.log('  ✓ Deleting withdrawal event blocked')
  }

  console.log('\n>>> ALL EMPIRICAL INTEGRITY CHECKS PASSED WITH ZERO VIOLATIONS <<<')
}

runAudit().catch((err) => {
  console.error('AUDIT FAILED:', err)
  process.exit(1)
})
