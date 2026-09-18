import { cleanupCatalogFixtures, getTestPayload } from './seedCatalog'

/**
 * Suite-level fixture teardown - the second half of the shared e2e fixture lifecycle.
 *
 * Playwright runs `globalTeardown` once, after the last worker has exited, so deleting the shared
 * fixtures here can no longer hit another spec file mid-run (that was the R1 flake). The cleanup is
 * identity-based, so it also removes fixtures seeded by a different worker process or left behind
 * by an earlier run. Residue is not tolerated silently: if any fixture row survives, the run fails.
 */
export default async function globalTeardown(): Promise<void> {
  try {
    const { deleted, remaining } = await cleanupCatalogFixtures()

    console.log(
      `[e2e] catalog fixtures torn down: removed ${deleted.users} users, ${deleted.categories} categories, ${deleted.products} products`,
    )

    if (remaining.users || remaining.categories || remaining.products) {
      throw new Error(
        `[e2e] fixture teardown left rows behind: ${remaining.users} users, ${remaining.categories} categories, ${remaining.products} products still match the fixture identities`,
      )
    }
  } finally {
    // Close the Postgres pool this process opened, so the runner does not linger after the run.
    await (await getTestPayload()).destroy()
  }
}
