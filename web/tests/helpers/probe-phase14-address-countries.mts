/**
 * web/tests/helpers/probe-phase14-address-countries.mts
 *
 * Instrument for decision 0015 / phase 14 — "VN in the address country list, one shared list, and a
 * VN default". It answers the one question the code alone cannot: are the Postgres enum, the shared
 * TypeScript list and the three surfaces that consume it still the same list?
 *
 * Part A (read-only, runs on any database — the default `.env` target is the dev `kientaohub`):
 *   1. `SUPPORTED_COUNTRIES` order: the eight additions first (`VN, TH, LA, KH, MM, PH, ID, CN`),
 *      then the 40 values `@payloadcms/plugin-ecommerce` shipped, read out of the plugin's own
 *      `defaultCountries.js` rather than trusted from a copy in this file.
 *   2. Set comparison, not eyeballing: the values in the file against `pg_enum` labels for
 *      `enum_addresses_country` (sorted arrays must be identical — set AND count).
 *   3. The migration file: present at `20260921_*_phase14_*.ts`, registered in
 *      `src/migrations/index.ts` after phase 13, header naming the measured facts, SQL that creates
 *      a replacement type and swaps the column with `USING …::text::…`, no `ALTER TYPE … ADD VALUE`,
 *      and a guard in both directions.
 *   4. The label sets written into the migration's own SQL equal the file's values (so an un-applied
 *      drift is caught before the database is touched).
 *   5. One-owner plumbing: `src/plugins/index.ts` passes `addresses.supportedCountries`,
 *      `grep -rn "defaultCountries" src` is empty, and both address forms import the shared list and
 *      default to its first entry.
 *
 * Part B (destructive; automatically skipped on `kientaohub` and run on any other database):
 *   drives the migration's `up()`/`down()` directly through the same drizzle surface Payload's
 *   runner passes to a migration, and checks what `payload migrate` cannot: re-running `up()` is a
 *   no-op, `down()` refuses — loudly — while a stored row names a country phase 13 cannot represent,
 *   an `up()` that hits its own guard rolls back without residue (inside an explicit transaction and
 *   outside one), and both directions leave the canonical type name `enum_addresses_country` in
 *   place. The VN row it inserts is deleted before the probe ends, and the database is left migrated
 *   (48 labels).
 *
 * Usage:
 *
 *   # Part A + Part B on a scratch clone of a database at phase 13 (recommended):
 *   docker exec kientaohub-postgres psql -U payload -d postgres -c "DROP DATABASE IF EXISTS kientaohub_phase14;"
 *   docker exec kientaohub-postgres psql -U payload -d postgres -c "CREATE DATABASE kientaohub_phase14;"
 *   docker exec -i kientaohub-postgres pg_dump -U payload -d kientaohub --schema-only --no-owner \
 *     | docker exec -i kientaohub-postgres psql -q -U payload -d kientaohub_phase14
 *   docker exec -i kientaohub-postgres pg_dump -U payload -d kientaohub --data-only --no-owner \
 *     --table=payload_migrations | docker exec -i kientaohub-postgres psql -q -U payload -d kientaohub_phase14
 *   DATABASE_URL=postgres://payload:payload@127.0.0.1:5433/kientaohub_phase14 \
 *     node_modules/.bin/tsx tests/helpers/probe-phase14-address-countries.mts
 *
 *   # Part A only, against the dev database the running app uses:
 *   node_modules/.bin/tsx tests/helpers/probe-phase14-address-countries.mts
 *
 * Exit code 0 means every part that ran passed. A negative control (a comparison that must report a
 * mismatch) proves the comparator can fail; the `down()` guard test is the second such control.
 */
import 'dotenv/config'

import { readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { sql } from '@payloadcms/db-postgres'
import { getPayload } from 'payload'

import config from '../../src/payload.config'
import { SUPPORTED_COUNTRIES } from '../../src/constants/countries'
import { down, up } from '../../src/migrations/20260921_000000_phase14_address_countries'

const WEB_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const DB_NAME = (() => {
  const url = process.env.DATABASE_URL ?? ''
  try {
    return new URL(url).pathname.replace(/^\//, '')
  } catch {
    return url.match(/\/([^/?]+)(\?.*)?$/)?.[1] ?? ''
  }
})()
const IS_DEV_DATABASE = DB_NAME === 'kientaohub'
/**
 * Part B rewrites the enum, so it needs a database nobody else is using. Obviously scratch-looking
 * names run it automatically; any other non-dev database needs `PROBE_PHASE14_DESTRUCTIVE=1`.
 */
const RUN_PART_B =
  DB_NAME !== '' &&
  !IS_DEV_DATABASE &&
  (/scratch|phase14|probe|clone|verify|test/i.test(DB_NAME) ||
    process.env.PROBE_PHASE14_DESTRUCTIVE === '1')

/** The eight values phase 14 adds, in the contract's order. */
const ADDED = ['VN', 'TH', 'LA', 'KH', 'MM', 'PH', 'ID', 'CN']
/** The 40 labels `20260915_020514_initial` created, in the order it created them. */
const SHIPPED_40 = [
  'US', 'GB', 'CA', 'AU', 'AT', 'BE', 'BR', 'BG', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE', 'GR',
  'HK', 'HU', 'IN', 'IE', 'IT', 'JP', 'LV', 'LT', 'LU', 'MY', 'MT', 'MX', 'NL', 'NZ', 'NO', 'PL',
  'PT', 'RO', 'SG', 'SK', 'SI', 'ES', 'SE', 'CH',
]

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

const sortedValues = (codes: readonly string[]) => [...new Set(codes)].sort()
const setsEqual = (a: readonly string[], b: readonly string[]) =>
  JSON.stringify(sortedValues(a)) === JSON.stringify(sortedValues(b))

const fileValues = SUPPORTED_COUNTRIES.map((country) => country.value)

console.log(`--- phase-14 address countries: database="${DB_NAME || '(unset)'}" ---`)

console.log('--- 0. negative control: the comparator must be able to fail ---')
check(
  'a knowingly wrong set is reported as different',
  setsEqual(fileValues, [...SHIPPED_40]),
  false,
)

console.log('--- 1. the shared list: order and contents ---')
check('first eight values', fileValues.slice(0, 8), ADDED)
check('total values', fileValues.length, 48)
check('values are unique', new Set(fileValues).size, fileValues.length)
check('labels are non-empty', SUPPORTED_COUNTRIES.every((c) => c.label.length > 0), true)

const pluginCountriesSource = readFileSync(
  path.join(
    WEB_ROOT,
    'node_modules/@payloadcms/plugin-ecommerce/dist/collections/addresses/defaultCountries.js',
  ),
  'utf8',
)
const pluginShipped = [...pluginCountriesSource.matchAll(/value:\s*'([A-Z]{2})'/g)].map((m) => m[1])
check('plugin defaultCountries still ships 40 values', pluginShipped.length, 40)
check('the trailing 40 values are the plugin list, in the plugin order', fileValues.slice(8), pluginShipped)
check('the plugin list is exactly the phase-13 label set', setsEqual(pluginShipped, SHIPPED_40), true)

console.log('--- 2. the migration file on disk ---')
const migrationFiles = readdirSync(path.join(WEB_ROOT, 'src/migrations')).filter((name) =>
  /^20260921_.*_phase14_.*\.ts$/.test(name),
)
check('exactly one phase-14 migration file', migrationFiles.length, 1)
const migrationName = migrationFiles[0] ?? ''
const migrationSource = migrationName
  ? readFileSync(path.join(WEB_ROOT, 'src/migrations', migrationName), 'utf8')
  : ''

const indexSource = readFileSync(path.join(WEB_ROOT, 'src/migrations/index.ts'), 'utf8')
const phase13At = indexSource.indexOf('phase13_drop_unused_ecommerce_transactions')
const phase14At = indexSource.indexOf(migrationName.replace(/\.ts$/, ''))
checkTrue(
  'registered in src/migrations/index.ts after phase 13',
  phase14At > phase13At && phase14At !== -1,
  `indexOf(phase14)=${phase14At} > indexOf(phase13)=${phase13At}`,
)
checkTrue(
  'import + { up, down, name } entry for the phase-14 module',
  indexSource.includes(`import * as migration_${migrationName.replace(/\.ts$/, '')} from './${migrationName.replace(/\.ts$/, '')}'`) &&
    indexSource.includes(`name: '${migrationName.replace(/\.ts$/, '')}'`),
  'both the import and the migrations[] entry name the same module',
)

const header = migrationSource.split('export async function')[0] ?? ''
checkTrue(
  'header names the measured facts (40 labels, no VN, 0 rows)',
  /\b40\b/.test(header) && /no `?VN`?/i.test(header) && /\b0 rows\b/.test(header),
  'header mentions the 40 labels, the missing VN and the 0 address rows',
)

const sqlBodies = [...migrationSource.matchAll(/db\.execute\(sql`([\s\S]*?)`\)/g)].map((m) => m[1])
check('two SQL bodies (up + down)', sqlBodies.length, 2)
const stripComments = (body: string) =>
  body
    .split('\n')
    .map((line) => line.replace(/--.*$/, ''))
    .join('\n')
const upSql = stripComments(sqlBodies[0] ?? '')
const downSql = stripComments(sqlBodies[1] ?? '')
const addValue = /\bALTER\s+TYPE\b[\s\S]*?\bADD\s+VALUE\b/i
check('up SQL contains no ALTER TYPE ... ADD VALUE', addValue.test(upSql), false)
check('down SQL contains no ALTER TYPE ... ADD VALUE', addValue.test(downSql), false)

const upLabels = [...(upSql.match(/CREATE TYPE[\s\S]*?AS ENUM\(([\s\S]*?)\);/)?.[1] ?? '').matchAll(/'([A-Z]{2})'/g)].map((m) => m[1])
const downLabels = [...(downSql.match(/CREATE TYPE[\s\S]*?AS ENUM\(([\s\S]*?)\);/)?.[1] ?? '').matchAll(/'([A-Z]{2})'/g)].map((m) => m[1])
check('up builds a 48-value replacement type', upLabels.length, 48)
check('up union = the shared list, as a set', setsEqual(upLabels, fileValues), true)
check('down builds the 40-value phase-13 type', downLabels.length, 40)
check('down type = the phase-13 labels, as a set', setsEqual(downLabels, SHIPPED_40), true)

checkTrue(
  'up swaps addresses.country with USING country::text::new',
  /ALTER\s+TABLE\s+"addresses"[\s\S]*?ALTER\s+COLUMN\s+"country"\s+TYPE[\s\S]*?USING\s+"country"::text::/i.test(upSql),
  'ALTER TABLE addresses → ALTER COLUMN country TYPE → USING "country"::text::*',
)
checkTrue(
  'down swaps back with USING country::text::old',
  /ALTER\s+TABLE\s+"addresses"[\s\S]*?ALTER\s+COLUMN\s+"country"\s+TYPE[\s\S]*?USING\s+"country"::text::/i.test(downSql),
  'same mechanism in the reverse direction',
)
checkTrue(
  'both directions carry a loud guard before the swap',
  /RAISE\s+EXCEPTION/i.test(upSql) && /RAISE\s+EXCEPTION/i.test(downSql),
  'up and down each RAISE EXCEPTION when a stored row would not survive',
)

console.log('--- 3. one owner: plugin config and both forms ---')
const pluginConfigSource = readFileSync(path.join(WEB_ROOT, 'src/plugins/index.ts'), 'utf8')
checkTrue(
  'src/plugins/index.ts passes addresses: { supportedCountries: SUPPORTED_COUNTRIES }',
  /addresses:\s*\{\s*supportedCountries:\s*SUPPORTED_COUNTRIES,?\s*\}/.test(pluginConfigSource) &&
    pluginConfigSource.includes("from '@/constants/countries'"),
  'ecommercePlugin receives the shared list',
)

const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((entry) => {
    const full = path.join(dir, entry)
    return statSync(full).isDirectory() ? walk(full) : [full]
  })
const defaultCountriesHits = walk(path.join(WEB_ROOT, 'src'))
  .filter((file) => /\.(ts|tsx)$/.test(file))
  .filter((file) => readFileSync(file, 'utf8').includes('defaultCountries'))
check('grep -rn "defaultCountries" src → 0 matches', defaultCountriesHits, [])

for (const relative of [
  'src/components/forms/AddressForm/index.tsx',
  'src/components/addresses/AddressFormModal.tsx',
]) {
  const source = readFileSync(path.join(WEB_ROOT, relative), 'utf8')
  checkTrue(
    `${relative} defaults to the first entry of the shared list`,
    source.includes("from '@/constants/countries'") &&
      /const defaultCountry = SUPPORTED_COUNTRIES\[0\]\.value/.test(source) &&
      !source.includes('defaultCountries'),
    'imports SUPPORTED_COUNTRIES from the shared list and pins the default to entry 0 (VN)',
  )
}

console.log('--- 4. the live database ---')
const payload = await getPayload({ config })
const db = (payload.db as unknown as { drizzle: any }).drizzle
const args = { db } as any

const readLabels = async (): Promise<string[]> => {
  const result = await db.execute(sql`
    SELECT e.enumlabel AS label
    FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'enum_addresses_country'
    ORDER BY e.enumlabel
  `)
  return (result.rows as { label: string }[]).map((row) => row.label)
}
const readColumnState = async () => {
  const result = await db.execute(sql`
    SELECT
      (SELECT count(*) FROM information_schema.columns
        WHERE table_name = 'addresses' AND column_name = 'country' AND udt_name = 'enum_addresses_country')::int AS column_count,
      (SELECT is_nullable FROM information_schema.columns
        WHERE table_name = 'addresses' AND column_name = 'country') AS is_nullable,
      (SELECT count(*) FROM pg_type WHERE typname LIKE 'enum_addresses_country_%')::int AS stray_types
  `)
  return result.rows[0] as { column_count: number; is_nullable: string; stray_types: number }
}

const migratedLabels = await readLabels()
check('enum label count', migratedLabels.length, 48)
check('enum label set = SUPPORTED_COUNTRIES values (set comparison)', setsEqual(migratedLabels, fileValues), true)
check('enum labels sorted = file values sorted (no duplicates on either side)', migratedLabels, sortedValues(fileValues))
const columnState = await readColumnState()
check('addresses.country is the only column on the canonical type name', columnState.column_count, 1)
check('addresses.country stayed NOT NULL', columnState.is_nullable, 'NO')
check('no scratch enum type is left behind', columnState.stray_types, 0)

if (!RUN_PART_B) {
  console.log(
    `--- 5. Part B SKIPPED: database "${DB_NAME}" is the dev database or not obviously scratch; point DATABASE_URL at a scratch clone (or set PROBE_PHASE14_DESTRUCTIVE=1) to exercise up()/down() and the guard. ---`,
  )
} else {
  console.log(`--- 5. Part B: up()/down() and the guard on "${DB_NAME}" ---`)

  /** The canonical enum name and a residue-free schema, or null. Returns the live label count. */
  const canonicalLabelCount = async (): Promise<number | null> => {
    const state = await readColumnState()
    if (state.column_count !== 1 || state.stray_types !== 0) return null
    return (await readLabels()).length
  }

  await up(args)
  check('second up(): no error, canonical name, still 48', await canonicalLabelCount(), 48)

  await db.execute(sql`INSERT INTO "addresses" ("country") VALUES ('VN')`)
  const inserted = await db.execute(sql`SELECT count(*)::int AS n FROM "addresses" WHERE "country" = 'VN'`)
  check('fixture row: one address naming VN', (inserted.rows[0] as { n: number }).n, 1)

  let guardMessage = '(down() did not throw)'
  let guardCause = '(no cause chain)'
  try {
    await down(args)
  } catch (error) {
    // drizzle wraps driver errors, so the PostgreSQL message sits in the cause chain; the deepest
    // cause is the RAISE EXCEPTION text this check is about.
    const chain: string[] = []
    let current: unknown = error
    while (current instanceof Error) {
      chain.push(current.message)
      current = (current as { cause?: unknown }).cause
    }
    guardMessage = chain.join(' | ')
    guardCause = chain[chain.length - 1] ?? guardMessage
  }
  checkTrue(
    'down() refuses while a row names a country phase 13 cannot represent',
    guardMessage.includes('holds 1 row(s)') && guardMessage.includes('phase14 down'),
    guardCause.slice(0, 240),
  )
  check('down() refused before changing anything', await canonicalLabelCount(), 48)
  check(`labels still 48 after the refused down()`, (await readLabels()).length, 48)

  await db.execute(sql`DELETE FROM "addresses" WHERE "country" = 'VN'`)
  await down(args)
  check('down(): canonical name, no residue, 40 labels', await canonicalLabelCount(), 40)
  check('down() restored exactly the phase-13 label set', setsEqual(await readLabels(), SHIPPED_40), true)

  await up(args)
  check('up() again: 48 labels back', (await readLabels()).length, 48)
  check('up() left the enum equal to the shared list', setsEqual(await readLabels(), fileValues), true)
  check('probe left the scratch database migrated (48)', (await readLabels()).length, 48)

  console.log('--- 6. the up() guard, on a column holding a value the new list cannot represent ---')
  // While the column carries the phase-13 enum, every stored value is a subset of the 48 by
  // construction — so the state the up() guard exists for is built explicitly here: the column is
  // widened to varchar (what a partially applied migration, or a manual widening, leaves behind) and
  // a value outside the new list is stored in it.
  await db.execute(sql`ALTER TABLE "addresses" ALTER COLUMN "country" TYPE varchar(10) USING "country"::text`)
  await db.execute(sql`INSERT INTO "addresses" ("country") VALUES ('ZZ')`)

  // Payload runs each migration inside a transaction, so the failing run is repeated that way first:
  // the guard's exception must roll back everything the migration had already done, including the
  // replacement type it created.
  let transactionalThrew = false
  try {
    await db.transaction(async (tx: any) => {
      await up({ db: tx } as any)
    })
  } catch {
    transactionalThrew = true
  }
  check('up() inside a transaction fails on the guard', transactionalThrew, true)
  check('the rolled-back run left no scratch type behind', (await readColumnState()).stray_types, 0)
  checkTrue(
    'the rolled-back run left the widened column exactly as it was',
    (await readColumnState()).column_count === 0,
    'column is still varchar — the transaction undid the whole migration',
  )

  let upGuardMessage = '(up() did not throw)'
  let upGuardCause = '(no cause chain)'
  try {
    await up(args)
  } catch (error) {
    const chain: string[] = []
    let current: unknown = error
    while (current instanceof Error) {
      chain.push(current.message)
      current = (current as { cause?: unknown }).cause
    }
    upGuardMessage = chain.join(' | ')
    upGuardCause = chain[chain.length - 1] ?? upGuardMessage
  }
  checkTrue(
    'up() refuses while a row names a country the 48-value list cannot represent',
    upGuardMessage.includes('holds 1 row(s)') && upGuardMessage.includes('phase14:'),
    upGuardCause.slice(0, 240),
  )
  check(
    'the refused run leaves no scratch type behind even without an explicit transaction',
    (await readColumnState()).stray_types,
    0,
  )
  checkTrue(
    'and it did not touch the column: the whole body is one statement string, so PostgreSQL ran it atomically',
    (await readColumnState()).column_count === 0,
    'column is still varchar after both refused runs',
  )

  // Undo the constructed state: row first, then the scratch type the refused up() created, then the
  // canonical type (the refused up() never reached its ALTER).
  await db.execute(sql`DELETE FROM "addresses" WHERE "country" = 'ZZ'`)
  await db.execute(sql`DROP TYPE IF EXISTS "public"."enum_addresses_country_phase14"`)
  await db.execute(sql`
    ALTER TABLE "addresses" ALTER COLUMN "country" TYPE "public"."enum_addresses_country"
    USING "country"::text::"public"."enum_addresses_country"
  `)
  check('restored after the guard test: canonical name, 48 labels, no residue', await canonicalLabelCount(), 48)

  const leftoverRows = await db.execute(sql`SELECT count(*)::int AS n FROM "addresses"`)
  check('probe left no fixture row behind', (leftoverRows.rows[0] as { n: number }).n, 0)
}

console.log(`--- ${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`} ---`)
await payload.destroy()
process.exit(failures === 0 ? 0 : 1)
