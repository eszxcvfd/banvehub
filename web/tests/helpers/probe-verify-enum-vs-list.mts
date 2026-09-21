/**
 * Verifier instrument for task `t24` — the address-country enum vs the shared list, compared as SETS.
 *
 * Two independent sources, read by this file and nothing else:
 *   1. the Postgres type: `select enumlabel from pg_enum e join pg_type t on t.oid = e.enumtypid
 *      where t.typname = 'enum_addresses_country'` over the connection string in `web/.env`
 *      (`DATABASE_URL`), read with the `pg` client — not through Payload and not through the app;
 *   2. the values in `web/src/constants/countries.ts`, imported as a module and read off whatever the
 *      module exports (an array of `{ value, label }`, of strings, or nested arrays), with a regex
 *      fallback over the file text if the module exports nothing usable.
 *
 * It prints both sets, their sizes and the symmetric difference, and exits 0 only when that difference
 * is empty. `--selftest` runs the comparator against a deliberately mutated list and requires it to
 * report a non-empty difference — the negative control for this instrument.
 *
 * Usage (from `web/`):
 *   NODE_OPTIONS="--no-deprecation --import=tsx/esm" node tests/helpers/probe-verify-enum-vs-list.mts
 *   NODE_OPTIONS="--no-deprecation --import=tsx/esm" node tests/helpers/probe-verify-enum-vs-list.mts --selftest
 */
import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const WEB = resolve(HERE, '../..')
const LIST_PATH = resolve(WEB, 'src/constants/countries.ts')
const SELFTEST = process.argv.includes('--selftest')

type CountriesModule = Record<string, unknown>

const readEnv = (): Record<string, string> => {
  const path = resolve(WEB, '.env')
  if (!existsSync(path)) return {}
  return Object.fromEntries(
    readFileSync(path, 'utf8')
      .split('\n')
      .filter((line) => line.includes('=') && !line.trim().startsWith('#'))
      .map((line) => {
        const index = line.indexOf('=')
        return [line.slice(0, index).trim(), line.slice(index + 1).trim().replace(/^["']|["']$/g, '')]
      }),
  )
}

/** The enum's labels, straight from the catalog. */
const enumLabels = async (): Promise<string[]> => {
  const env = readEnv()
  const pg = (await import(resolve(WEB, 'node_modules/.pnpm/pg@8.20.0/node_modules/pg/lib/index.js'))) as any
  const Client = pg.default?.Client ?? pg.Client
  const client = new Client({ connectionString: env.DATABASE_URL })
  await client.connect()
  try {
    const result = await client.query(
      `select enumlabel from pg_enum e join pg_type t on t.oid = e.enumtypid where t.typname = 'enum_addresses_country' order by enumsortorder`,
    )
    return result.rows.map((row: { enumlabel: string }) => row.enumlabel)
  } finally {
    await client.end()
  }
}

/** Every `value` a country constant exposes, whatever shape the module returns it in. */
const collectValues = (input: unknown, out: Set<string> = new Set(), depth = 0): Set<string> => {
  if (depth > 4 || input === null || input === undefined) return out
  if (typeof input === 'string') {
    if (/^[A-Za-z]{2}$/.test(input)) out.add(input.toUpperCase())
    return out
  }
  if (Array.isArray(input)) {
    for (const entry of input) collectValues(entry, out, depth + 1)
    return out
  }
  if (typeof input === 'object') {
    const record = input as Record<string, unknown>
    if (typeof record.value === 'string' && /^[A-Za-z]{2}$/.test(record.value)) out.add(record.value.toUpperCase())
    for (const [key, value] of Object.entries(record)) {
      if (['label', 'name', 'title'].includes(key)) continue
      collectValues(value, out, depth + 1)
    }
  }
  return out
}

/** Read the shared list: import the module, and fall back to the literal `value: 'XX'` occurrences. */
const listValues = async (): Promise<{ values: Set<string>; how: string }> => {
  if (!existsSync(LIST_PATH)) {
    throw new Error(`the shared list ${LIST_PATH.replace(WEB + '/', '')} does not exist on this revision`)
  }
  const text = readFileSync(LIST_PATH, 'utf8')
  let imported: Set<string> = new Set()
  let how = 'module import'
  try {
    const mod = (await import(`${LIST_PATH}?t=${Date.now()}`)) as CountriesModule
    for (const [key, value] of Object.entries(mod)) {
      if (key === 'default') continue
      collectValues(value, imported)
    }
  } catch (error) {
    how = `module import failed (${(error as Error).message.slice(0, 80)}); regex fallback`
  }
  if (imported.size === 0) {
    imported = new Set(
      Array.from(text.matchAll(/value:\s*'([A-Za-z]{2})'/g)).map((match) => match[1].toUpperCase()),
    )
    how = how.includes('failed') ? how : 'regex fallback over the file text'
  }
  return { values: imported, how }
}

const sorted = (values: Iterable<string>): string[] => Array.from(values).sort()

const main = async () => {
  const labels = await enumLabels()
  const database = new Set(labels)
  const { values: listed, how } = await listValues()

  const onlyInDatabase = sorted(Array.from(database).filter((label) => !listed.has(label)))
  const onlyInList = sorted(Array.from(listed).filter((label) => !database.has(label)))
  const symmetricDifference = [...onlyInDatabase, ...onlyInList]

  const print = (source: string, set: Set<string>) => {
    console.log(`${source} — ${set.size} value(s):`)
    console.log(`  ${sorted(set).join(', ')}`)
  }

  console.log(`instrument: enum-vs-list (${SELFTEST ? 'SELFTEST' : 'live'})`)
  console.log(`enum source: pg_enum/pg_type enum_addresses_country`)
  print('ENUM', database)
  console.log(`list source: web/src/constants/countries.ts (read by ${how})`)
  print('LIST', listed)
  console.log('')
  console.log(`only in the enum: ${onlyInDatabase.length ? onlyInDatabase.join(', ') : '(none)'}`)
  console.log(`only in the list: ${onlyInList.length ? onlyInList.join(', ') : '(none)'}`)
  console.log(`symmetric difference: ${symmetricDifference.length ? symmetricDifference.join(', ') : 'EMPTY'}`)

  if (SELFTEST) {
    // Negative control: the comparator must report a difference for a list that is deliberately wrong.
    const mutated = new Set(listed)
    mutated.add('ZZ')
    const removed = mutated.delete(sorted(mutated)[0])
    const controlDiff = sorted(Array.from(database).filter((label) => !mutated.has(label))).concat(
      sorted(Array.from(mutated).filter((label) => !database.has(label))),
    )
    console.log('')
    console.log(`SELFTEST: mutated list (added ZZ, removed one real value, removed=${removed})`)
    console.log(`SELFTEST: symmetric difference of the mutated list = ${controlDiff.join(', ') || 'EMPTY'}`)
    const controlFired = controlDiff.length > 0
    console.log(controlFired ? 'SELFTEST: PASS — the comparator reports a non-empty difference' : 'SELFTEST: FAIL — the comparator did not fire')
    process.exit(controlFired ? 0 : 1)
  }

  const ok = symmetricDifference.length === 0
  console.log('')
  console.log(ok ? 'ENUM-VS-LIST: PASS (the two sets are equal)' : 'ENUM-VS-LIST: FAIL (the sets differ)')
  process.exit(ok ? 0 : 1)
}

main().catch((error) => {
  console.error(`ENUM-VS-LIST: FAIL — ${(error as Error).message}`)
  process.exit(2)
})
