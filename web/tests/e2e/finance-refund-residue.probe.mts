/**
 * web/tests/e2e/finance-refund-residue.probe.mts
 *
 * Scripted proof that the finance refund spec heals its own residue.
 *
 * The spec calls `sweepFinanceRefundResidue()` first in `beforeAll` and again in `afterAll`. A run
 * killed mid-flight (Chromium OOM-killed under machine contention) skips `afterAll`, which is how
 * five `ORD-E2E-REF-*` orders survived in the development database and had to be removed by hand.
 * This probe plants that exact residue shape on a SCRATCH database and lets the same function the
 * spec's `beforeAll` calls remove it, asserting the order count returns to its pre-planted value.
 *
 * It also plants one order WITH dependents (refund + order item + seller earning) to prove the
 * dependency order, and one wallet-bound buyer to prove the sweep deliberately leaves it alone
 * (BR-03's `forbid_wallet_delete` makes that account undeletable).
 *
 * Usage (never the development database — the guard below refuses `kientaohub`):
 *
 *   docker exec kientaohub-postgres psql -U payload -d postgres -c "CREATE DATABASE kientaohub_probe_t8;"
 *   DATABASE_URL=postgres://payload:payload@127.0.0.1:5433/kientaohub_probe_t8 pnpm payload migrate
 *   DATABASE_URL=postgres://payload:payload@127.0.0.1:5433/kientaohub_probe_t8 \
 *   NODE_OPTIONS="--no-deprecation --import=tsx/esm" node tests/e2e/finance-refund-residue.probe.mts
 *
 * Exit code 0 means: the residue was planted, the spec's sweep removed it, the count came back, and
 * the wallet-bound buyer survived.
 */
import 'dotenv/config'
import {
  REFUND_CONSOLE_ORDER_CODE_PREFIX,
  REFUND_CONSOLE_PRODUCT_SLUG_PREFIX,
  sweepFinanceRefundResidue,
} from './financeRefundResidue'
import { getTestPayload } from '../helpers/seedCatalog'
import { getOrCreateWallet } from '@/services/wallet'

const BUYER_EMAIL = 'refund-console-buyer@kientaohub-refund.test'
const SELLER_EMAIL = 'refund-console-seller@kientaohub-refund.test'
const STALE_ORDER_COUNT = 5

const fail = (message: string): never => {
  console.error(`\n✗ PROBE FAILED: ${message}`)
  process.exit(1)
}

const guardTarget = (): void => {
  const url = process.env.DATABASE_URL ?? ''
  const dbName = (() => {
    try {
      return new URL(url).pathname.replace(/^\//, '')
    } catch {
      return url.match(/\/([^/?]+)(\?.*)?$/)?.[1] ?? ''
    }
  })()
  if (!dbName) fail('DATABASE_URL is not set; this probe must run against a scratch database.')
  if (dbName === 'kientaohub' && process.env.PROBE_ALLOW_DB !== 'yes') {
    fail(`refusing to plant residue in the development database "${dbName}"`)
  }
  console.log(`✓ Probe target database: ${dbName}`)
}

const countOrders = async (payload: Awaited<ReturnType<typeof getTestPayload>>): Promise<number> => {
  const all = await payload.find({
    collection: 'orders',
    limit: 0,
    pagination: false,
    depth: 0,
    overrideAccess: true,
  })
  return all.totalDocs
}

const main = async (): Promise<void> => {
  guardTarget()
  const payload = await getTestPayload()

  // Start from a swept state so the probe is repeatable.
  const preSweep = await sweepFinanceRefundResidue(payload)
  console.log(
    `✓ Pre-sweep removed ${preSweep.orders} order(s), ${preSweep.products} product(s) from an earlier probe`,
  )

  const baseOrders = await countOrders(payload)
  console.log(`✓ Baseline: ${baseOrders} order(s) in the scratch database`)

  // ---------------------------------------------------------------- plant
  const stamp = Date.now()
  for (let index = 0; index < STALE_ORDER_COUNT; index++) {
    await payload.create({
      collection: 'orders',
      data: {
        code: `${REFUND_CONSOLE_ORDER_CODE_PREFIX}${stamp}-stale-${index}`,
        buyer: await ensureBuyer(payload),
        totalAmount: 150000,
        currency: 'VND',
        status: 'COMPLETED',
        paymentSource: 'wallet',
        paidAt: new Date().toISOString(),
        notes: 'planted by finance-refund-residue.probe',
      },
      overrideAccess: true,
    })
    await payload.create({
      collection: 'products',
      data: {
        title: `Planted residue product ${stamp}-${index}`,
        slug: `${REFUND_CONSOLE_PRODUCT_SLUG_PREFIX}probe-${stamp}-${index}`,
        price: 150000,
        isFree: false,
        copyrightDeclared: true,
        moderationStatus: 'approved',
        _status: 'published',
      },
      overrideAccess: true,
    })
  }
  console.log(
    `✓ Planted ${STALE_ORDER_COUNT} stale ${REFUND_CONSOLE_ORDER_CODE_PREFIX}* orders + ${STALE_ORDER_COUNT} stale ${REFUND_CONSOLE_PRODUCT_SLUG_PREFIX}* products (the shape the hand-sweep removed)`,
  )

  // One planted order WITH dependents, to prove the dependency order as well. Its item/earning need
  // a seller distinct from the buyer: BR-04 (and the database trigger behind it) refuses a seller
  // buying their own product, which is exactly the rule the fixture defect used to trip over.
  const buyerId = await ensureBuyer(payload)
  const sellerId = await ensureSeller(payload)
  const withDependents = await payload.create({
    collection: 'orders',
    data: {
      code: `${REFUND_CONSOLE_ORDER_CODE_PREFIX}${stamp}-stale-with-dependents`,
      buyer: buyerId,
      totalAmount: 200000,
      currency: 'VND',
      status: 'COMPLETED',
      paymentSource: 'wallet',
      paidAt: new Date().toISOString(),
      notes: 'planted with dependents',
    },
    overrideAccess: true,
  })
  const product = await payload.create({
    collection: 'products',
    data: {
      title: `Planted dependents product ${stamp}`,
      slug: `${REFUND_CONSOLE_PRODUCT_SLUG_PREFIX}probe-deps-${stamp}`,
      price: 200000,
      isFree: false,
      seller: sellerId,
      copyrightDeclared: true,
      moderationStatus: 'approved',
      _status: 'published',
    },
    overrideAccess: true,
  })
  const item = await payload.create({
    collection: 'order_items',
    data: {
      order: Number(withDependents.id),
      product: Number(product.id),
      seller: sellerId,
      salePrice: 200000,
      platformFee: 60000,
      sellerAmount: 140000,
      tax: 0,
      policyVersion: 'v1',
    },
    overrideAccess: true,
  })
  await payload.create({
    collection: 'seller_earnings',
    data: {
      seller: sellerId,
      order: Number(withDependents.id),
      orderItem: Number(item.id),
      product: Number(product.id),
      salePrice: 200000,
      platformFee: 60000,
      sellerAmount: 140000,
      tax: 0,
      commissionRate: 0.3,
      currency: 'VND',
      status: 'PENDING',
      holdPeriodDays: 7,
      holdUntil: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      policyVersion: 'v1',
    },
    overrideAccess: true,
  })
  await payload.create({
    collection: 'refunds',
    data: {
      code: `REF-PROBE-${stamp}`,
      order: Number(withDependents.id),
      orderItem: Number(item.id),
      buyer: buyerId,
      seller: sellerId,
      amount: 200000,
      platformFeeRefunded: 60000,
      sellerAmountRefunded: 140000,
      faultBasis: 'SELLER',
      outOfWindow: false,
      currency: 'VND',
      reason: 'planted by probe',
      status: 'COMPLETED',
      processedBy: buyerId,
    },
    overrideAccess: true,
  })
  console.log('✓ Planted one stale order with dependents (refund, order item, seller earning)')

  // The sweep discovers dependents with this exact query shape; assert it can see what we planted,
  // so a zero count later cannot be mistaken for "nothing to remove".
  for (const collection of ['refunds', 'order_items', 'seller_earnings'] as const) {
    const seen = await payload.find({
      collection,
      where: { order: { equals: Number(withDependents.id) } },
      limit: 0,
      pagination: false,
      depth: 0,
      overrideAccess: true,
    })
    console.log(`  · sweep query sees ${seen.docs.length} ${collection} row(s) for the planted order`)
    if (seen.docs.length !== 1) {
      fail(`expected exactly one ${collection} row for the planted order, saw ${seen.docs.length}`)
    }
  }

  const plantedOrders = await countOrders(payload)
  if (plantedOrders !== baseOrders + STALE_ORDER_COUNT + 1) {
    fail(
      `expected ${baseOrders + STALE_ORDER_COUNT + 1} orders after planting, found ${plantedOrders}`,
    )
  }

  const walletBefore = await payload.find({
    collection: 'wallets',
    where: { user: { equals: buyerId } },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  })
  if (walletBefore.docs.length === 0) fail('the wallet-bound buyer has no wallet before the sweep')

  // ---------------------------------------------------------------- heal
  console.log('\n[Heal] calling the same sweep the spec runs first in beforeAll')
  const removed = await sweepFinanceRefundResidue(payload)
  console.log(
    `✓ Sweep removed ${removed.orders} order(s), ${removed.refunds} refund(s), ${removed.orderItems} order item(s), ${removed.sellerEarnings} earning(s), ${removed.products} product(s)`,
  )

  const afterOrders = await countOrders(payload)
  if (afterOrders !== baseOrders) {
    fail(`order count did not return to the pre-planted value: ${afterOrders} !== ${baseOrders}`)
  }
  console.log(`✓ Order count returned to the pre-planted value (${baseOrders})`)

  if (removed.orders !== STALE_ORDER_COUNT + 1) {
    fail(`expected ${STALE_ORDER_COUNT + 1} planted orders removed, sweep reported ${removed.orders}`)
  }
  if (removed.orderItems !== 1) {
    fail(
      `expected the planted order item to be removed by the sweep, it reported ${removed.orderItems} (dependency order regression)`,
    )
  }
  if (removed.refunds !== 1 || removed.sellerEarnings !== 1) {
    fail(
      `expected the planted refund and earning to be removed, sweep reported ${removed.refunds} refund(s) / ${removed.sellerEarnings} earning(s)`,
    )
  }
  if (removed.products !== STALE_ORDER_COUNT + 1) {
    fail(
      `expected ${STALE_ORDER_COUNT + 1} planted products removed, sweep reported ${removed.products}`,
    )
  }

  const leftovers = await payload.find({
    collection: 'orders',
    where: { code: { like: `${REFUND_CONSOLE_ORDER_CODE_PREFIX}%` } },
    limit: 0,
    pagination: false,
    depth: 0,
    overrideAccess: true,
  })
  if (leftovers.totalDocs !== 0) fail(`${leftovers.totalDocs} prefixed order(s) survived the sweep`)

  const walletAfter = await payload.find({
    collection: 'wallets',
    where: { user: { equals: buyerId } },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  })
  if (walletAfter.docs.length === 0) {
    fail('the sweep removed the wallet-bound buyer — it must be left in place (BR-03)')
  }
  const buyerAfter = await payload.find({
    collection: 'users',
    where: { email: { equals: BUYER_EMAIL } },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  })
  if (buyerAfter.docs.length === 0) fail('the sweep removed the wallet-bound buyer account')
  console.log('✓ The wallet-bound buyer and its wallet are still in place (BR-03, as designed)')

  console.log('\n✓ PROBE PASSED: the spec heals its own residue and leaves the wallet-bound buyer.')
  process.exit(0)
}

/** The spec's own seller account (kept distinct from the buyer for BR-04). */
const ensureSeller = async (
  payload: Awaited<ReturnType<typeof getTestPayload>>,
): Promise<number> => {
  const existing = await payload.find({
    collection: 'users',
    where: { email: { equals: SELLER_EMAIL } },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  })
  if (existing.docs.length > 0) return Number(existing.docs[0].id)

  const created = await payload.create({
    collection: 'users',
    data: {
      email: SELLER_EMAIL,
      password: 'kientaohub-test-password-2026',
      name: 'E2E Refund Seller',
      roles: ['seller'],
    },
    overrideAccess: true,
  })
  return Number(created.id)
}

/** The spec's own buyer account, created here so the probe is self-contained on a clean clone. */
const ensureBuyer = async (
  payload: Awaited<ReturnType<typeof getTestPayload>>,
): Promise<number> => {
  const existing = await payload.find({
    collection: 'users',
    where: { email: { equals: BUYER_EMAIL } },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  })
  if (existing.docs.length > 0) return Number(existing.docs[0].id)

  const created = await payload.create({
    collection: 'users',
    data: {
      email: BUYER_EMAIL,
      password: 'kientaohub-test-password-2026',
      name: 'E2E Refund Buyer',
      roles: ['buyer'],
    },
    overrideAccess: true,
  })
  await getOrCreateWallet(payload, { userId: Number(created.id) })
  return Number(created.id)
}

main().catch((error) => {
  console.error(error)
  fail(error instanceof Error ? error.message : String(error))
})
