/**
 * web/tests/helpers/probe-phase13-ledger-removal.mts
 *
 * Proves the phase-13 migration's two promises that `payload migrate` cannot: that `up()` and `down()`
 * are idempotent (the runner records what it ran, so it can only ever run each direction once), and
 * that the data guard actually refuses to discard rows.
 *
 * It drives `up()`/`down()` through the same surface Payload's runner hands to a migration —
 * `payload.db.drizzle` is what `MigrateUpArgs.db` is — so the SQL under test is the SQL that ships.
 *
 * Run it against a scratch database that has the migration applied (a schema clone of a database at
 * phase 12 works too, as long as the plugin's tables are still present for the first `down()`):
 *
 *   docker exec kientaohub-postgres psql -U payload -d postgres -c "CREATE DATABASE p13_scratch TEMPLATE kientaohub"
 *   DATABASE_URL=postgres://payload:payload@127.0.0.1:5433/p13_scratch \
 *     NODE_OPTIONS="--no-deprecation --import tsx/esm" node tests/helpers/probe-phase13-ledger-removal.mts
 *
 * Exit code 0 means every check passed. The probe leaves the database in the migrated state.
 */
import 'dotenv/config'

import { sql } from '@payloadcms/db-postgres'
import { getPayload } from 'payload'

import config from '../../src/payload.config'
import {
  down,
  up,
} from '../../src/migrations/20260920_160000_phase13_drop_unused_ecommerce_transactions'

const payload = await getPayload({ config })
const db = (payload.db as unknown as { drizzle: any }).drizzle
const args = { db } as any

type State = {
  tx_table: number
  items_table: number
  enums: number
  rels_col: number
  rels_fk: number
  rels_idx: number
  tx_indexes: number
  tx_fks: number
  public_tables: number
}

const readState = async (): Promise<State> => {
  const result = await db.execute(sql`
    SELECT
      (SELECT count(*) FROM pg_tables WHERE schemaname = 'public' AND tablename = 'transactions')::int AS tx_table,
      (SELECT count(*) FROM pg_tables WHERE schemaname = 'public' AND tablename = 'transactions_items')::int AS items_table,
      (SELECT count(*) FROM pg_type WHERE typname LIKE 'enum_transactions%')::int AS enums,
      (SELECT count(*) FROM information_schema.columns WHERE table_name = 'payload_locked_documents_rels' AND column_name = 'transactions_id')::int AS rels_col,
      (SELECT count(*) FROM pg_constraint WHERE conname = 'payload_locked_documents_rels_transactions_fk')::int AS rels_fk,
      (SELECT count(*) FROM pg_indexes WHERE indexname = 'payload_locked_documents_rels_transactions_id_idx')::int AS rels_idx,
      (SELECT count(*) FROM pg_indexes WHERE indexname IN (
        'transactions_customer_idx', 'transactions_order_idx', 'transactions_updated_at_idx',
        'transactions_created_at_idx', 'transactions_items_order_idx',
        'transactions_items_parent_id_idx', 'transactions_items_product_idx'))::int AS tx_indexes,
      (SELECT count(*) FROM pg_constraint WHERE contype = 'f' AND conname IN (
        'transactions_items_parent_id_fk', 'transactions_items_product_id_products_id_fk',
        'transactions_customer_id_users_id_fk', 'transactions_order_id_orders_id_fk'))::int AS tx_fks,
      (SELECT count(*) FROM pg_tables WHERE schemaname = 'public')::int AS public_tables
  `)
  return result.rows[0] as State
}

const DROPPED = {
  tx_table: 0,
  items_table: 0,
  enums: 0,
  rels_col: 0,
  rels_fk: 0,
  rels_idx: 0,
  tx_indexes: 0,
  tx_fks: 0,
  public_tables: 102,
}
const RESTORED = {
  tx_table: 1,
  items_table: 1,
  enums: 3,
  rels_col: 1,
  rels_fk: 1,
  rels_idx: 1,
  tx_indexes: 7,
  tx_fks: 4,
  public_tables: 104,
}

let failures = 0
const check = (label: string, actual: unknown, expected: unknown) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  if (!ok) failures += 1
  console.log(
    `${ok ? 'PASS' : 'FAIL'} ${label} → ${JSON.stringify(actual)} (expected ${JSON.stringify(expected)})`,
  )
}
const checkDiff = (label: string, before: State, after: State, expected: State) => {
  const diff: Record<string, [number, number]> = {}
  for (const key of Object.keys(expected) as (keyof State)[]) {
    if (after[key] !== expected[key]) diff[key] = [before[key], after[key]]
  }
  check(label, diff, {})
}

console.log('--- 1. state left by the migration ---')
const migrated = await readState()
checkDiff('start state: dropped shape', migrated, migrated, DROPPED)

console.log('--- 2. up() again on an already-migrated database (idempotency) ---')
await up(args)
checkDiff('second up(): no change, no error', migrated, await readState(), DROPPED)

console.log('--- 3. down() restores the phase-12 shape ---')
const dropped = await readState()
await down(args)
checkDiff('down(): exact restore', dropped, await readState(), RESTORED)

console.log('--- 4. down() again (idempotency) ---')
const restored = await readState()
await down(args)
checkDiff('second down(): no change, no error', restored, await readState(), RESTORED)

console.log('--- 5. the guard refuses to discard rows ---')
await db.execute(sql`INSERT INTO "transactions" ("status", "amount") VALUES ('pending', 1)`)
const seeded = await db.execute(sql`SELECT count(*)::int AS n FROM "transactions"`)
check('fixture row inserted', seeded.rows[0].n, 1)
let guardMessage = '(up() did not throw)'
try {
  await up(args)
} catch (error) {
  // drizzle wraps driver errors, so the PostgreSQL message sits in the cause chain.
  const chain: string[] = []
  let current: unknown = error
  while (current instanceof Error) {
    chain.push(current.message)
    current = (current as { cause?: unknown }).cause
  }
  guardMessage = chain.join(' | ')
}
check('up() threw on a non-empty table', guardMessage.includes('holds 1 row(s)'), true)
checkDiff('up() refused before changing anything', restored, await readState(), RESTORED)

console.log('--- 6. empty again, up() completes and leaves the migrated shape ---')
await db.execute(sql`DELETE FROM "transactions"`)
await up(args)
checkDiff('up() after clearing the row', restored, await readState(), DROPPED)

console.log(`--- ${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`} ---`)
await payload.destroy()
process.exit(failures === 0 ? 0 : 1)
