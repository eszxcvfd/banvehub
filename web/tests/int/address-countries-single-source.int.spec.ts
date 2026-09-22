import { sql } from '@payloadcms/db-postgres'
import { getPayload, type Payload } from 'payload'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import config from '@/payload.config'
import { SUPPORTED_COUNTRIES } from '@/constants/countries'
import { beforeAll, describe, expect, it } from 'vitest'

/**
 * Phase 14 / decision 0015 — the address country list, pinned by an automated gate.
 *
 * `tests/helpers/probe-phase14-address-countries.mts` compares the same three things, but it is a
 * manual instrument: review round 1 (F5) recorded that nothing in the suites fails if a later commit
 * drops `addresses.supportedCountries` from `src/plugins/index.ts`. That drop is not cosmetic —
 * `@payloadcms/plugin-ecommerce` builds the `country` select from `addresses.supportedCountries ??
 * <its own 40-country list>`, so the API and the admin would silently go back to 40 countries while
 * both client forms keep rendering the shared 48, which is precisely the pre-0015 bug (a `VN` submit
 * answering `400 invalid selection`).
 *
 * So this spec pins the pair from both ends and in the middle:
 *   1. the shared list leads with `VN` and the eight values decision 0015 decided, with no duplicate;
 *   2. decision 0021 clause 5: its labels are the reviewed Vietnamese names, pinned as literals in
 *      their contracted order — so an emptied label, a label left equal to its own code, and a label
 *      translated back to English all fail, with `VN` first and the eight regional entries reading as
 *      decided, because a label that drifts or empties is a display defect no value comparison sees;
 *   3. the live `enum_addresses_country` equals the list as a set **and in order** — read from
 *      `pg_enum` rather than through Payload, because a `select` field validates against its config,
 *      not against the type behind the column, and those two are exactly what may drift apart;
 *   4. the sanitized `addresses` collection — the one the REST API and the admin actually use —
 *      carries the same 48 options in the same order, and `src/plugins/index.ts` still hands the list
 *      over (the source half catches a refactor that keeps an equivalent list under another name).
 *
 * Like every other schema assertion in this suite, it runs against the test database
 * (`kientaohub_test`, forced by `vitest.setup.ts`) and requires `payload migrate` to have been run
 * there: an unmigrated database is a real failure of this gate, not a reason to skip the check.
 */
const WEB_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')

/** The eight values phase 14 added, in decision 0015's order: Vietnam first, then its neighbours. */
const ADDED_LEADING_VALUES = ['VN', 'TH', 'LA', 'KH', 'MM', 'PH', 'ID', 'CN']

/**
 * Decision 0021 — the reviewed Vietnamese labels, in the contracted order. This is an expectation
 * table inside a guard test, not a second source of truth: nothing under `src/` reads it, and the
 * list it checks stays the only one the admin, both forms and the collection render. It is written
 * out in full — as `tests/helpers/probe-phase14-address-countries.mts` writes out the phase-13
 * `SHIPPED_40` — because decision 0021 made the wording a reviewed choice: a label that is emptied,
 * left equal to its own code, or translated back to English has to fail here, and only a full
 * literal pin catches a revert anywhere in the 48, not just in the eight regional entries.
 */
const REVIEWED_LABELS = [
  'Việt Nam',
  'Thái Lan',
  'Lào',
  'Campuchia',
  'Myanmar',
  'Philippines',
  'Indonesia',
  'Trung Quốc',
  'Hoa Kỳ',
  'Vương quốc Anh',
  'Canada',
  'Úc',
  'Áo',
  'Bỉ',
  'Brazil',
  'Bulgaria',
  'Síp',
  'Séc',
  'Đan Mạch',
  'Estonia',
  'Phần Lan',
  'Pháp',
  'Đức',
  'Hy Lạp',
  'Hồng Kông',
  'Hungary',
  'Ấn Độ',
  'Ireland',
  'Ý',
  'Nhật Bản',
  'Latvia',
  'Litva',
  'Luxembourg',
  'Malaysia',
  'Malta',
  'Mexico',
  'Hà Lan',
  'New Zealand',
  'Na Uy',
  'Ba Lan',
  'Bồ Đào Nha',
  'Romania',
  'Singapore',
  'Slovakia',
  'Slovenia',
  'Tây Ban Nha',
  'Thụy Điển',
  'Thụy Sĩ',
]

/** The eight regional entries decision 0021 names — the head of the reviewed list, `VN` first. */
const ADDED_LEADING_LABELS = REVIEWED_LABELS.slice(0, ADDED_LEADING_VALUES.length)

const listValues = SUPPORTED_COUNTRIES.map((country) => country.value)

describe('Address countries — one shared list, VN first, wired to the addresses collection', () => {
  let payload: Payload

  beforeAll(async () => {
    payload = await getPayload({ config })
  })

  it('leads with VN and the eight decided values, with no duplicate and no empty label', () => {
    expect(listValues.slice(0, ADDED_LEADING_VALUES.length)).toEqual(ADDED_LEADING_VALUES)
    expect(SUPPORTED_COUNTRIES[0].value).toBe('VN')
    expect(new Set(listValues).size).toBe(listValues.length)
    expect(SUPPORTED_COUNTRIES.every((country) => country.label.length > 0)).toBe(true)
  })

  it('labels the 48 entries in Vietnamese: non-empty, never the code, unique, VN first', () => {
    const labels = SUPPORTED_COUNTRIES.map((country) => country.label)

    // The three shape clauses of decision 0021 clause 5 come first, so each one can fail on its own
    // evidence instead of only inside the whole-list comparison below.
    expect(labels.every((label) => label.trim().length > 0)).toBe(true)
    expect(SUPPORTED_COUNTRIES.every((country) => country.label !== country.value)).toBe(true)
    expect(new Set(labels).size).toBe(labels.length)

    // The eight regional entries decision 0021 names, with `VN` leading them.
    expect(labels.slice(0, ADDED_LEADING_LABELS.length)).toEqual(ADDED_LEADING_LABELS)
    expect(SUPPORTED_COUNTRIES[0].value).toBe('VN')
    expect(SUPPORTED_COUNTRIES[0].label).toBe(ADDED_LEADING_LABELS[0])

    // And the reviewed wording of all 48, in the contracted order — the exhaustive half.
    expect(labels).toEqual(REVIEWED_LABELS)
  })

  it('keeps enum_addresses_country equal to the list, as a set and in enum order', async () => {
    const result = await payload.db.drizzle.execute(sql`
      SELECT e.enumlabel AS label
      FROM pg_enum e
      JOIN pg_type t ON t.oid = e.enumtypid
      WHERE t.typname = 'enum_addresses_country'
      ORDER BY e.enumsortorder
    `)
    const labels = result.rows.map((row) => String((row as { label?: unknown }).label))

    expect(labels).toEqual(listValues)
    expect(new Set(labels).size).toBe(listValues.length)
  })

  it('serves those 48 options on the addresses collection the API validates against', () => {
    const collection = payload.config.collections.find((candidate) => candidate.slug === 'addresses')
    expect(collection).toBeDefined()

    const country = (collection?.fields ?? []).find(
      (field) => 'name' in field && field.name === 'country',
    ) as
      | { type?: string; required?: boolean; options?: Array<string | { value?: unknown }> }
      | undefined

    expect(country?.type).toBe('select')
    expect(country?.required).toBe(true)

    const optionValues = (country?.options ?? []).map((option) =>
      typeof option === 'string' ? option : String(option?.value),
    )
    expect(optionValues).toEqual(listValues)
  })

  it('still hands the shared list to the plugin configuration', () => {
    const source = readFileSync(path.join(WEB_ROOT, 'src/plugins/index.ts'), 'utf8')

    expect(source).toContain("import { SUPPORTED_COUNTRIES } from '@/constants/countries'")
    expect(source).toMatch(/addresses:\s*\{\s*supportedCountries:\s*SUPPORTED_COUNTRIES,?\s*\}/)
  })
})
