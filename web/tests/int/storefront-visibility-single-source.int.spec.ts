import { readFileSync, readdirSync } from 'node:fs'
import { join, relative, resolve, sep } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Structural guard for decision 0010's single-owner rule.
 *
 * Authority: `docs/decisions/0010-product-report-policy.md` records that the storefront
 * visibility rule has exactly one owner; its Follow-Up deferred a structural check until
 * authority was accepted, and the owner accepted it on 2026-09-19. The rule it enforces:
 * *a query against the `products` collection must not inline the published-visibility
 * literal — it must use the owner module*, because a second copy can drift from the owner
 * without changing behaviour, which is exactly what no behavioural test can catch.
 *
 * Scope, deliberately narrow:
 * - Files that query `collection: 'products'` and also contain the literal must import
 *   `@/utilities/storefrontVisibility`.
 * - The owner module itself is the one legitimate holder.
 * - A file that contains the literal without a products query is not a violation: the CMS
 *   `pages` query in `src/app/(app)/[slug]/page.tsx` uses the same shape for a different
 *   collection and a different rule.
 * - A product query that reaches the rule through the owner import inside a helper is
 *   covered, because the check is per file and the import is visible in that file.
 *
 * Enforcement: this spec runs in `pnpm --prefix web test:int`, which CI invokes on every
 * pull request and on pushes to main (`.github/workflows/ci.yml`). No git hook is
 * installed and branch protection is not verifiable from this repository.
 */

// vitest runs with `web/` as the working directory (same resolution the sibling specs use).
const SRC_ROOT = resolve(process.cwd(), 'src')

const OWNER_MODULE = ['utilities', 'storefrontVisibility.ts'].join('/')

const PUBLISHED_LITERAL = /_status:\s*\{\s*equals:\s*['"]published['"]\s*\}/
const PRODUCTS_QUERY = /collection:\s*['"]products['"]/
const OWNER_IMPORT = /from\s+['"][^'"]*utilities\/storefrontVisibility['"]/

function walk(dir: string, found: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      walk(full, found)
    } else if (/\.tsx?$/.test(entry.name)) {
      found.push(full)
    }
  }
  return found
}

describe('storefront visibility has a single owner (decision 0010)', () => {
  it('no products query inlines the published-visibility literal outside the owner module', () => {
    const offenders: string[] = []
    let ownerHoldsTheLiteral = 0

    for (const file of walk(SRC_ROOT)) {
      const relativePath = relative(SRC_ROOT, file).split(sep).join('/')
      const source = readFileSync(file, 'utf8')

      if (!PUBLISHED_LITERAL.test(source)) continue

      if (relativePath === OWNER_MODULE) {
        ownerHoldsTheLiteral += 1
        continue
      }

      if (PRODUCTS_QUERY.test(source) && !OWNER_IMPORT.test(source)) {
        offenders.push(relativePath)
      }
    }

    // Without this the check could pass vacuously after the owner module was deleted or
    // renamed, which would silently remove the protection it exists to provide.
    expect(
      ownerHoldsTheLiteral,
      `the owner module ${OWNER_MODULE} no longer contains the published-visibility literal; either it moved (update this guard) or the rule was lost`,
    ).toBeGreaterThan(0)

    expect(
      offenders,
      offenders.length === 0
        ? ''
        : [
            'Decision 0010 requires the storefront visibility rule to have one owner.',
            `These files query the products collection and inline \`_status: { equals: 'published' }\` instead of importing it:`,
            ...offenders.map((file) => `  - src/${file}`),
            `Fix: import { storefrontVisibilityWhere } from '@/utilities/storefrontVisibility' (or storefrontProductWhere) and use it in the where clause.`,
          ].join('\n'),
    ).toEqual([])
  })
})
