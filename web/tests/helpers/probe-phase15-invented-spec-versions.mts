/**
 * web/tests/helpers/probe-phase15-invented-spec-versions.mts
 *
 * Instrument for decision 0020 / phase 15 — the seed's invented `'<Software> 2022+'` versions are
 * purged from the development database, and the purge is reversible from a committed snapshot.
 *
 * It answers the two questions the migration alone cannot: **is the committed snapshot the real
 * pre-purge data** (not a retyped shape), and **does the restore statement reproduce it**. It reads
 * two databases with plain SQL over `pg` (resolved through `@payloadcms/db-postgres`, which is where
 * `drizzle` keeps it — no Payload boot, so it is fast and has no side effects):
 *
 *   - the **development database** (`DATABASE_URL`, default `kientaohub`): the published post-state.
 *   - the **scratch clone** of the pre-purge database (`PHASE15_SCRATCH_DATABASE_URL`, default
 *     `kientaohub_phase15_scratch`, built from the development database before the migration ran): the
 *     only place the 161 values still exist, and therefore the only place the snapshot can be checked
 *     against reality.
 *
 * Checks (every one prints the values it compared; a false claim exits non-zero, it does not warn):
 *   0. negative control — the set comparator must report a knowingly wrong pair as different;
 *   1. the snapshot has exactly 161 data rows, 161 distinct ids, no malformed line, and equals
 *      `PURGED_VALUES` (the migration's own mirror of the file);
 *   2. development database: 0 products match the invented pattern, and every snapshot id still
 *      exists there with a NULL version;
 *   3. scratch clone: its 161 pre-purge `(id, value)` pairs equal the snapshot **as sets in both
 *      directions** and as ordered arrays — the check that makes the snapshot evidence rather than a
 *      retyped list;
 *   4. the restore statement (`restoreStatement()` from the migration, the same SQL the header
 *      carries) brings all 161 values back on the clone, byte-for-byte equal to the snapshot;
 *   5. re-running the migration's own WHERE clause returns the clone to 0 — the purge and the restore
 *      are inverses;
 *   6. the probe restores the clone again and re-reads it, so it is left exactly as it was found and a
 *      second run measures the same thing.
 *
 * Usage (no dev server needed):
 *
 *   cd web && NODE_OPTIONS="--no-deprecation --import=tsx/esm" node tests/helpers/probe-phase15-invented-spec-versions.mts
 *
 * Exit code 0 means every check passed.
 */
import 'dotenv/config'

import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  INVENTED_VERSION_PATTERN,
  PURGED_VALUES,
  restoreStatement,
} from '../../src/migrations/20260922_000000_phase15_null_invented_spec_versions'

type PgClient = {
  query: (text: string, values?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>
  end: () => Promise<void>
}

const WEB_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const SNAPSHOT_PATH = path.join(WEB_ROOT, 'src/migrations/data/phase15-invented-spec-versions.tsv')

const DEV_URL =
  process.env.DATABASE_URL ?? 'postgres://payload:payload@127.0.0.1:5433/kientaohub'
const CLONE_URL =
  process.env.PHASE15_SCRATCH_DATABASE_URL ??
  DEV_URL.replace(/\/[^/?]+(\?.*)?$/, '/kientaohub_phase15_scratch$1')

/** decision 0020: the count this record documents for the development database. */
const DOCUMENTED_AFFECTED_COUNT = 161

// `pg` is a transitive dependency (`drizzle-orm/node-postgres` → `@payloadcms/db-postgres`), so it is
// resolved through the adapter that owns it rather than assumed to be a direct dependency.
const requireFrom = createRequire(import.meta.url)
const pgEntry = createRequire(requireFrom.resolve('@payloadcms/db-postgres')).resolve('pg')
const { Client } = requireFrom(pgEntry) as { Client: new (config: { connectionString: string }) => PgClient }

let failures = 0
const check = (label: string, actual: unknown, expected: unknown) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  if (!ok) failures += 1
  console.log(
    `${ok ? 'PASS' : 'FAIL'} ${label}\n     actual   ${JSON.stringify(actual)}\n     expected ${JSON.stringify(expected)}`,
  )
}
const checkTrue = (label: string, condition: boolean, detail: string) => {
  if (!condition) failures += 1
  console.log(`${condition ? 'PASS' : 'FAIL'} ${label} — ${detail}`)
}
/**
 * Compares two `(id, value)` lists and prints what it compared: the counts, the first and last pair,
 * and every pair that differs (the whole point of the check is the difference, not the dump).
 */
const checkPairs = (
  label: string,
  actual: ReadonlyArray<readonly [number, string]>,
  expected: ReadonlyArray<readonly [number, string]>,
) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  if (!ok) failures += 1
  const differences: string[] = []
  for (let i = 0; i < Math.max(actual.length, expected.length) && differences.length < 8; i += 1) {
    const got = actual[i]
    const want = expected[i]
    if (!got || !want || got[0] !== want[0] || got[1] !== want[1]) {
      differences.push(
        `#${i}: got ${got ? `${got[0]}='${got[1]}'` : '(missing)'} want ${want ? `${want[0]}='${want[1]}'` : '(missing)'}`,
      )
    }
  }
  console.log(
    `${ok ? 'PASS' : 'FAIL'} ${label} — ${actual.length} actual / ${expected.length} expected pairs; first ${JSON.stringify(actual[0] ?? null)}, last ${JSON.stringify(actual[actual.length - 1] ?? null)}${differences.length > 0 ? `\n     differences: ${differences.join(' | ')}` : ''}`,
  )
}

/** Sorted `id:value` keys — the comparand for every set comparison in this probe. */
const asKeys = (pairs: ReadonlyArray<readonly [number, string]>) =>
  pairs.map(([id, value]) => `${id}:${value}`).sort()
const setsEqual = (a: ReadonlyArray<readonly [number, string]>, b: ReadonlyArray<readonly [number, string]>) =>
  JSON.stringify(asKeys(a)) === JSON.stringify(asKeys(b))

console.log(`--- phase-15 invented spec versions ---`)
console.log(`    development database: ${DEV_URL.replace(/:[^:@/]*@/, ':***@')}`)
console.log(`    scratch clone:        ${CLONE_URL.replace(/:[^:@/]*@/, ':***@')}`)

console.log('--- 0. negative control: the comparator must be able to fail ---')
check(
  'a knowingly wrong pair is reported as different',
  setsEqual(
    [[1, 'AutoCAD 2022+']],
    [[2, 'AutoCAD 2022+']],
  ),
  false,
)

console.log('--- 1. the committed snapshot file ---')
const snapshotLines = readFileSync(SNAPSHOT_PATH, 'utf8').split('\n')
const dataLines = snapshotLines.filter((line) => line.trim() !== '' && !line.startsWith('#'))
const malformed = dataLines.filter((line) => line.split('\t').length !== 2)
const snapshotPairs: Array<readonly [number, string]> = dataLines.map((line) => {
  const [id, value] = line.split('\t')
  return [Number(id), value] as const
})
check('data rows in the TSV', dataLines.length, DOCUMENTED_AFFECTED_COUNT)
check('distinct ids in the TSV', new Set(snapshotPairs.map(([id]) => id)).size, DOCUMENTED_AFFECTED_COUNT)
check('malformed rows (not `id<TAB>value`)', malformed, [])
checkPairs(
  'the TSV equals PURGED_VALUES, the migration module\u2019s mirror of it',
  snapshotPairs,
  PURGED_VALUES,
)
check('ids are strictly increasing in the file', snapshotPairs.every(([id], i) => i === 0 || id > snapshotPairs[i - 1][0]), true)

console.log('--- 1b. the header\u2019s restore statement is the code\u2019s restore statement ---')
const MIGRATION_PATH = path.join(
  WEB_ROOT,
  'src/migrations/20260922_000000_phase15_null_invented_spec_versions.ts',
)
const migrationSource = readFileSync(MIGRATION_PATH, 'utf8')

/**
 * Extracts the SQL block the header prints for a human to paste, one comment line at a time: from the
 * `UPDATE` line that follows the `EXACT RESTORE STATEMENT` marker to the next blank comment line.
 * Indentation is normalised away because the comment carries a ` * ` prefix the SQL does not, but
 * order, ids, values and punctuation are compared exactly — a trailing comma is a difference.
 */
const extractHeaderStatement = (source: string): string[] => {
  const markerAt = source.indexOf('EXACT RESTORE STATEMENT')
  if (markerAt === -1) return []
  const block: string[] = []
  let collecting = false
  for (const rawLine of source.slice(markerAt).split('\n')) {
    const content = rawLine.replace(/^\s*\*\s?/, '').trim()
    if (!collecting && content.startsWith('UPDATE ')) collecting = true
    if (!collecting) continue
    if (content === '' || !rawLine.trimStart().startsWith('*')) break
    block.push(content)
  }
  return block
}

const headerStatement = extractHeaderStatement(migrationSource)
const generatedStatement = restoreStatement()
  .split('\n')
  .map((line) => line.trim())
const statementsMatch = (a: string[], b: string[]) => JSON.stringify(a) === JSON.stringify(b)

checkTrue(
  'the header block was found and is the whole statement',
  headerStatement.length === generatedStatement.length && headerStatement.length > 3,
  `${headerStatement.length} header line(s), ${generatedStatement.length} generated line(s); first ${JSON.stringify(headerStatement[0] ?? null)}`,
)
console.log(
  `     header lines (first/last): ${JSON.stringify(headerStatement[0] ?? null)} … ${JSON.stringify(headerStatement[headerStatement.length - 1] ?? null)}`,
)
check(
  'the header\u2019s statement equals restoreStatement(), line for line',
  statementsMatch(headerStatement, generatedStatement),
  true,
)
check(
  'negative control: one extra character in the header is reported as different',
  statementsMatch(
    headerStatement.map((line, index) =>
      index === headerStatement.length - 2 ? `${line},` : line,
    ),
    generatedStatement,
  ),
  false,
)

const dev = new Client({ connectionString: DEV_URL })
const clone = new Client({ connectionString: CLONE_URL })

try {
  await dev.connect()
  await clone.connect()

  console.log('--- 2. the development database, after the migration ---')
  const devStats = await dev.query(
    `SELECT count(*)::int AS products,
            count(*) FILTER (WHERE technical_specs_software_version ~ $1)::int AS matching,
            count(*) FILTER (WHERE technical_specs_software_version IS NULL)::int AS null_versions,
            count(*) FILTER (WHERE technical_specs_file_format IS NOT NULL)::int AS fmt_not_null,
            count(*) FILTER (WHERE technical_specs_file_size IS NOT NULL)::int AS size_not_null
     FROM products`,
    [INVENTED_VERSION_PATTERN],
  )
  console.log(`     row: ${JSON.stringify(devStats.rows[0])}`)
  check('dev: products matching the invented pattern', devStats.rows[0].matching, 0)
  check(
    'dev: products whose version is NULL (the 4 that already were + the purged 161)',
    devStats.rows[0].null_versions,
    devStats.rows[0].products,
  )
  check('dev: technical_specs_file_format non-null (clause 3, unchanged)', devStats.rows[0].fmt_not_null, 161)
  check('dev: technical_specs_file_size non-null (clause 3, unchanged)', devStats.rows[0].size_not_null, 161)

  const devSnapshotRows = await dev.query(
    `SELECT count(*)::int AS existing,
            count(*) FILTER (WHERE technical_specs_software_version IS NULL)::int AS nulled
     FROM products WHERE id = ANY($1::int[])`,
    [snapshotPairs.map(([id]) => id)],
  )
  console.log(`     snapshot ids in dev: ${JSON.stringify(devSnapshotRows.rows[0])}`)
  check('dev: every snapshot id still exists in products', devSnapshotRows.rows[0].existing, DOCUMENTED_AFFECTED_COUNT)
  check(
    'dev: every one of those rows now has a NULL version',
    devSnapshotRows.rows[0].nulled,
    DOCUMENTED_AFFECTED_COUNT,
  )

  console.log('--- 3. the scratch clone, pre-purge: the snapshot against reality ---')
  const clonePairsQuery = `SELECT id, technical_specs_software_version AS value
     FROM products
     WHERE technical_specs_software_version ~ $1
     ORDER BY id`
  const clonePre = (await clone.query(clonePairsQuery, [INVENTED_VERSION_PATTERN])).rows.map(
    (row) => [Number(row.id), String(row.value)] as const,
  )
  check('clone: rows matching the invented pattern (pre-purge)', clonePre.length, DOCUMENTED_AFFECTED_COUNT)
  checkPairs('clone pairs equal the snapshot, as ordered arrays', clonePre, snapshotPairs)
  check('clone pairs equal the snapshot, as sets', setsEqual(clonePre, snapshotPairs), true)
  const cloneOnly = asKeys(clonePre).filter((key) => !asKeys(snapshotPairs).includes(key))
  const snapshotOnly = asKeys(snapshotPairs).filter((key) => !asKeys(clonePre).includes(key))
  check('in the clone but not in the snapshot', cloneOnly, [])
  check('in the snapshot but not in the clone', snapshotOnly, [])

  console.log('--- 4. the restore statement reproduces all 161 ---')
  const purgeSql = `UPDATE products SET technical_specs_software_version = NULL
     WHERE technical_specs_software_version ~ $1`
  await clone.query(purgeSql, [INVENTED_VERSION_PATTERN])
  const cloneNulled = await clone.query(
    `SELECT count(*)::int AS matching FROM products WHERE technical_specs_software_version ~ $1`,
    [INVENTED_VERSION_PATTERN],
  )
  check('clone after re-nulling: matching rows (the purge is effective)', cloneNulled.rows[0].matching, 0)

  await clone.query(restoreStatement())
  const cloneRestored = (await clone.query(clonePairsQuery, [INVENTED_VERSION_PATTERN])).rows.map(
    (row) => [Number(row.id), String(row.value)] as const,
  )
  check('clone after the restore statement: matching rows', cloneRestored.length, DOCUMENTED_AFFECTED_COUNT)
  checkPairs('restored pairs equal the snapshot exactly', cloneRestored, snapshotPairs)

  console.log('--- 5. purge and restore are inverses; the clone is left as found ---')
  await clone.query(purgeSql, [INVENTED_VERSION_PATTERN])
  const reNulled = await clone.query(
    `SELECT count(*)::int AS matching FROM products WHERE technical_specs_software_version ~ $1`,
    [INVENTED_VERSION_PATTERN],
  )
  check('re-nulling returns the clone to 0 matching rows', reNulled.rows[0].matching, 0)

  await clone.query(restoreStatement())
  const leftAsFound = (await clone.query(clonePairsQuery, [INVENTED_VERSION_PATTERN])).rows.map(
    (row) => [Number(row.id), String(row.value)] as const,
  )
  check('clone re-restored and left as found', leftAsFound.length, DOCUMENTED_AFFECTED_COUNT)
  check('clone left as found equals the snapshot', setsEqual(leftAsFound, snapshotPairs), true)
} finally {
  await dev.end().catch(() => {})
  await clone.end().catch(() => {})
}

console.log(`--- ${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`} ---`)
process.exit(failures === 0 ? 0 : 1)
