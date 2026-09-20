import { sql } from '@payloadcms/db-postgres'
import { getPayload, type Payload } from 'payload'
import config from '@/payload.config'
import { beforeAll, describe, expect, it } from 'vitest'

/**
 * Phase 13: the template's commerce ledger is gone from the config *and* from the schema.
 *
 * `@payloadcms/plugin-ecommerce` still supplies `addresses` and the `users` customer fields, which
 * the account area reads through the plugin's `useAddresses`, so "the dead money surface is gone" and
 * "the plugin pieces the storefront uses still work" have to hold at the same time. This spec pins
 * both, plus the endpoint half: the Stripe adapter was the only payment method, so omitting the
 * `payments` block must leave no `/api/payments/*` route that could write a payment record.
 *
 * The table check goes through SQL rather than through Payload on purpose — Payload answers happily
 * for a collection whose table exists, and the defect this increment removed was precisely a table
 * that nothing wrote to and nothing read.
 */
describe('Phase 13: the unused ecommerce ledger is absent from config and schema', () => {
  let payload: Payload

  beforeAll(async () => {
    payload = await getPayload({ config })
  })

  it('serves no `transactions` collection and keeps the plugin pieces the storefront uses', () => {
    const slugs = payload.config.collections.map((collection) => collection.slug)

    expect(slugs).not.toContain('transactions')
    expect(slugs).toContain('addresses')
    expect(slugs).toContain('users')
  })

  it('registers no payment endpoint, so no request can create a payment record', () => {
    const paths = (payload.config.endpoints ?? []).map((endpoint) => endpoint.path)

    expect(paths.filter((path) => path.includes('/payments/'))).toEqual([])
  })

  it('leaves no table behind for the removed collection', async () => {
    const result = await payload.db.drizzle.execute(sql`
      SELECT tablename FROM pg_tables
      WHERE schemaname = 'public' AND tablename IN ('transactions', 'transactions_items')
      ORDER BY tablename
    `)

    expect(result.rows.map((row) => String((row as { tablename?: unknown }).tablename))).toEqual([])
  })

  it('leaves no locked-documents relationship column for the removed collection', async () => {
    const result = await payload.db.drizzle.execute(sql`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'payload_locked_documents_rels' AND column_name = 'transactions_id'
    `)

    expect(result.rows).toEqual([])
  })
})
