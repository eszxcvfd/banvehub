/**
 * web/tests/helpers/probe-stale-fixture.mts
 *
 * Scripted probe for the fixture defect that makes e2e runs flap: a fixture product with no seller.
 *
 * `enforceModerationState` only auto-assigns `products.seller` when the write carries an
 * authenticated user, and this suite seeds through the Local API without one — so every fixture
 * product was born with `seller = null`. `OrderItems.validateAntiSelfPurchase` then refuses ANY order
 * item for such a product ("Product X has no assigned seller"), which is a failure of the fixture,
 * not of whatever the spec under test was checking. `products.seller` is also ON DELETE SET NULL, so
 * a seller-less product is exactly what a deleted owner leaves behind as well; both routes into that
 * state are covered here.
 *
 * The probe drives the suite's own code paths (`seedCatalogData`, `cleanupCatalogFixtures`) instead
 * of re-implementing them:
 *
 *   Phase A — reproduce: seed, clear the product's seller (the state the old create path produced and
 *             the state a deleted owner leaves), then create an order item for it. The refusal is
 *             printed with its message and attributed to the fixture.
 *   Phase B — repair: re-run the suite's seed path and require that the adopted product now carries
 *             the fixture seller (repair instead of adoption) and that the same order item is
 *             accepted.
 *
 * Usage (always a scratch database — the guard below refuses `kientaohub` itself):
 *
 *   docker exec kientaohub-postgres psql -U payload -d postgres -c "CREATE DATABASE kientaohub_probe;"
 *   DATABASE_URL=postgres://payload:payload@127.0.0.1:5433/kientaohub_probe \
 *   NODE_OPTIONS="--no-deprecation --import=tsx/esm" node tests/helpers/probe-stale-fixture.mts
 *
 * A scratch clone of the test database needs the migrations applied first:
 *   DATABASE_URL=<clone> pnpm payload migrate
 *
 * Exit code 0 means: the mechanism was reproduced AND the seed repaired it.
 */
import 'dotenv/config'
import { cleanupCatalogFixtures, getTestPayload, seedCatalogData, TEST_USERS } from './seedCatalog'

const FIXTURE_PRODUCT_SLUG = 'biet-thu-hien-dai-3-tang'

const fail = (message: string): never => {
  console.error(`\n✗ PROBE FAILED: ${message}`)
  process.exit(1)
}

const idOf = (value: unknown): string | number | null => {
  if (value === null || value === undefined || value === '') return null
  if (typeof value === 'object') {
    const id = (value as { id?: unknown }).id
    return id === null || id === undefined || id === '' ? null : (id as string | number)
  }
  return value as string | number
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
    fail(
      `refusing to probe the development database "${dbName}" (set PROBE_ALLOW_DB=yes only if you really mean it)`,
    )
  }
  console.log(`✓ Probe target database: ${dbName}`)
}

const main = async (): Promise<void> => {
  guardTarget()
  const payload = await getTestPayload()

  // 0. Start from the suite's own notion of a clean slate.
  await cleanupCatalogFixtures()
  await seedCatalogData()
  console.log('✓ Fixtures seeded through the suite seed path')

  const productOf = async () => {
    const found = await payload.find({
      collection: 'products',
      where: { slug: { equals: FIXTURE_PRODUCT_SLUG } },
      limit: 1,
      depth: 0,
      draft: true,
      overrideAccess: true,
    })
    return found.docs[0] as unknown as Record<string, unknown> | undefined
  }

  const seededProduct = await productOf()
  if (!seededProduct) fail('the fixture product was not seeded')
  const seededSeller = idOf(seededProduct!.seller)
  if (seededSeller === null) {
    fail('the seeded fixture product has no seller — the create path still produces unusable fixtures')
  }
  console.log(`✓ Seeded fixture product carries seller ${String(seededSeller)}`)

  const buyer = await payload.find({
    collection: 'users',
    where: { email: { equals: TEST_USERS.buyer.email } },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  })
  if (buyer.docs.length === 0) fail('the fixture buyer account is missing')
  const buyerId = Number(buyer.docs[0].id)

  const order = await payload.create({
    collection: 'orders',
    data: {
      code: `ORD-PROBE-${Date.now()}`,
      buyer: buyerId,
      totalAmount: Number(seededProduct!.price ?? 0) || 250000,
      currency: 'VND',
      status: 'COMPLETED',
      paymentSource: 'wallet',
      paidAt: new Date().toISOString(),
      notes: 'probe-stale-fixture',
    },
    overrideAccess: true,
  })
  const orderId = Number(order.id)

  const createOrderItem = async () =>
    payload.create({
      collection: 'order_items',
      data: {
        order: orderId,
        product: Number(seededProduct!.id),
        seller: Number(seededSeller),
        salePrice: 250000,
        platformFee: 75000,
        sellerAmount: 175000,
        tax: 0,
        policyVersion: 'v1',
      },
      overrideAccess: true,
    })

  // ---------------------------------------------------------------- Phase A
  console.log('\n[Phase A] Reproduce: a fixture product whose owner is gone (seller = null)')
  await payload.update({
    collection: 'products',
    id: Number(seededProduct!.id),
    data: { seller: null },
    draft: false,
    overrideAccess: true,
  })
  const ownerless = await productOf()
  if (idOf(ownerless?.seller) !== null) {
    fail('could not clear the product seller, so Phase A cannot reproduce the defect')
  }
  console.log('✓ Fixture product now has seller = null (what a deleted owner leaves behind)')

  let refused = false
  try {
    await createOrderItem()
  } catch (error) {
    refused = true
    const message = error instanceof Error ? error.message : String(error)
    console.log(`✓ Order item refused as expected: ${message.split('\n')[0]}`)
    if (!/has no assigned seller|seller/i.test(message)) {
      fail(`the refusal was not the fixture's anti-self-purchase rule: ${message}`)
    }
  }
  if (!refused) {
    fail('an order item for a seller-less fixture product was accepted — the defect did not reproduce')
  }
  console.log('  → the failure belongs to the fixture (no owner), not to the product under test')

  // ---------------------------------------------------------------- Phase B
  console.log('\n[Phase B] Repair: the suite seed path must fix the adopted product')
  const productId = Number(seededProduct!.id)
  await seedCatalogData()
  const repaired = await productOf()
  if (Number(repaired?.id) !== productId) {
    fail(
      `the seed created a new product (${String(repaired?.id)}) instead of adopting ${productId}; the adoption path is what must repair`,
    )
  }
  console.log(`✓ Seed adopted the existing product row (id ${productId}) rather than recreating it`)
  const repairedSeller = idOf(repaired?.seller)
  if (repairedSeller === null) {
    fail(
      'the seed adopted the seller-less fixture product instead of repairing it (expected the fixture seller to be assigned)',
    )
  }
  if (String(repairedSeller) !== String(seededSeller)) {
    fail(
      `the seed assigned seller ${String(repairedSeller)} instead of the fixture seller ${String(seededSeller)}`,
    )
  }
  console.log(`✓ Seed repaired the adopted product (seller ${String(repairedSeller)})`)

  const item = await createOrderItem()
  console.log(`✓ Order item for the repaired fixture product accepted (id ${String(item.id)})`)

  // ---------------------------------------------------------------- Cleanup
  await payload.delete({ collection: 'order_items', id: Number(item.id), overrideAccess: true })
  await payload.delete({ collection: 'orders', id: orderId, overrideAccess: true })
  const cleaned = await cleanupCatalogFixtures()
  const residue =
    cleaned.remaining.users + cleaned.remaining.categories + cleaned.remaining.products
  if (residue > 0) {
    fail(`fixture teardown left ${residue} rows behind: ${JSON.stringify(cleaned.remaining)}`)
  }
  console.log('✓ Probe cleanup removed every fixture row it created')

  console.log('\n✓ PROBE PASSED: the stale-fixture mechanism reproduces and the seed repairs it.')
  process.exit(0)
}

main().catch((error) => {
  console.error(error)
  fail(error instanceof Error ? error.message : String(error))
})
