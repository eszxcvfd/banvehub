/**
 * web/tests/helpers/probe-draft-fixture-seller.mts
 *
 * Proves the repair for T3-F2: a fixture product whose `seller` went missing must be repaired on the
 * MAIN row, not only in its draft version.
 *
 * `ensureFixtureProductSeller` used to repair through `payload.update({ draft })`, and Payload's
 * `draft: true` writes the version rows only — so for the draft fixture the main row kept
 * `seller = null`, which is exactly the row `OrderItems.validateAntiSelfPurchase` reads ("Product X
 * has no assigned seller"). The main row is what makes an e2e run flap, so the probe reads the main
 * row (`draft: false`) rather than trusting the repair's return value.
 *
 * Run against the test database:
 *
 *   DATABASE_URL=postgres://payload:payload@127.0.0.1:5433/kientaohub_test \
 *     NODE_OPTIONS="--no-deprecation --import tsx/esm" node tests/helpers/probe-draft-fixture-seller.mts
 *
 * It cleans up the catalog fixtures before exiting and exits non-zero if any check failed.
 */
import 'dotenv/config'

import { sql } from '@payloadcms/db-postgres'
import type { Product } from '../../src/payload-types'
import { cleanupCatalogFixtures, getTestPayload, seedCatalogData } from './seedCatalog'

const DRAFT_SLUG = 'ban-ve-nha-van-hoa-draft'

let failures = 0
const check = (label: string, actual: unknown, expected: unknown) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  if (!ok) failures += 1
  console.log(
    `${ok ? 'PASS' : 'FAIL'} ${label} → ${JSON.stringify(actual)} (expected ${JSON.stringify(expected)})`,
  )
}

const payload = await getTestPayload()

const readDoc = async (draft: boolean): Promise<Product | undefined> => {
  const result = await payload.find({
    collection: 'products',
    where: { slug: { equals: DRAFT_SLUG } },
    draft,
    limit: 1,
    overrideAccess: true,
  })
  return result.docs[0]
}

const sellerOf = (doc: Product | undefined) => {
  const seller = doc?.seller
  return typeof seller === 'object' && seller !== null ? seller.id : (seller ?? null)
}

console.log('--- 1. the seed creates the draft fixture with a seller on the main row ---')
await seedCatalogData()
const created = await readDoc(false)
check('main row carries the seller', sellerOf(created) !== null, true)
check('main row is still a draft', created?._status, 'draft')

console.log('--- 2. reproduce the defect: clear the seller on the main row only ---')
await payload.db.drizzle.execute(sql`
  UPDATE "products" SET "seller_id" = NULL WHERE "slug" = ${DRAFT_SLUG}
`)
const broken = await readDoc(false)
check('main row is seller-less again', sellerOf(broken), null)

console.log('--- 3. the seed adopts and repairs the row ---')
await seedCatalogData()
const repairedMain = await readDoc(false)
const repairedDraft = await readDoc(true)
check('repaired MAIN row carries the seller', sellerOf(repairedMain) !== null, true)
check('repaired main row is still a draft', repairedMain?._status, 'draft')
check('the draft version agrees with the main row', sellerOf(repairedDraft) !== null, true)

console.log('--- cleanup ---')
const report = await cleanupCatalogFixtures()
console.log(`cleanup removed products=${report.products ?? 0} users=${report.users ?? 0}`)

console.log(`--- ${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`} ---`)
await payload.destroy()
process.exit(failures === 0 ? 0 : 1)
