import {
  FIXTURE_CATEGORY_SLUGS,
  FIXTURE_PRODUCT_SLUGS,
  FIXTURE_USER_EMAILS,
  cleanupCatalogFixtures,
  countCatalogFixtures,
  seedCatalogData,
} from './seedCatalog'

/**
 * Suite-level fixture seed - the first half of the shared e2e fixture lifecycle.
 *
 * Playwright runs `globalSetup` once, in the runner process, before any worker starts: this is the
 * only place the suite seeds, so the fixtures exist for every spec file and the find-or-create race
 * between parallel workers is unreachable in a normal run. The matching
 * `tests/helpers/global-teardown.ts` removes them once, after the last worker has exited.
 */
export default async function globalSetup(): Promise<void> {
  // A previous run that crashed, or a run of an older revision, can leave fixtures behind. Clearing
  // them first makes the seed below the single source of the rows this run sees and keeps the dev
  // database from accumulating fixtures across aborted runs. Identity-only, same as the teardown.
  const stale = await cleanupCatalogFixtures()
  if (stale.deleted.users || stale.deleted.categories || stale.deleted.products) {
    console.log(
      `[e2e] removed stale catalog fixtures before seeding: ${stale.deleted.users} users, ${stale.deleted.categories} categories, ${stale.deleted.products} products`,
    )
  }

  await seedCatalogData()

  const expected = {
    users: FIXTURE_USER_EMAILS.length,
    categories: FIXTURE_CATEGORY_SLUGS.length,
    products: FIXTURE_PRODUCT_SLUGS.length,
  }
  const found = await countCatalogFixtures()
  if (
    found.users !== expected.users ||
    found.categories !== expected.categories ||
    found.products !== expected.products
  ) {
    throw new Error(
      `[e2e] global setup did not produce the full fixture set: expected ${expected.users} users / ${expected.categories} categories / ${expected.products} products, found ${found.users} / ${found.categories} / ${found.products}`,
    )
  }

  console.log(
    `[e2e] catalog fixtures seeded once for the whole suite: ${found.users} users, ${found.categories} categories, ${found.products} products`,
  )
}
