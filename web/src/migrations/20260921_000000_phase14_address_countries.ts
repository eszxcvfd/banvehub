import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * Phase 14 — Vietnam, and its regional neighbours, in the address country list.
 *
 * Measured on 2026-09-21, before this migration (decision 0015):
 *
 *   - `enum_addresses_country`, created by `20260915_020514_initial` (line 35), held exactly **40**
 *     labels and no `VN`: `US, GB, CA, AU, AT, BE, BR, BG, CY, CZ, DK, EE, FI, FR, DE, GR, HK, HU,
 *     IN, IE, IT, JP, LV, LT, LU, MY, MT, MX, NL, NZ, NO, PL, PT, RO, SG, SK, SI, ES, SE, CH`.
 *   - `addresses.country` is the **only** column in the database carrying that type
 *     (`select table_name||'.'||column_name from information_schema.columns where
 *     udt_name='enum_addresses_country'` → one row), so the type swap below is the whole schema
 *     change — no view, rule, index or default references it.
 *   - `addresses` held **0 rows** in the development database, so no data migration is needed; the
 *     guard is there for any other database that is not empty.
 *
 * The type is replaced (CREATE TYPE new → ALTER TABLE … USING country::text::new → DROP old →
 * RENAME) rather than grown with `ALTER TYPE … ADD VALUE` on purpose: Payload runs each migration
 * inside a transaction, and a label added inside a transaction cannot be used before that
 * transaction commits — so `ADD VALUE` would need a second migration to become usable. Rebuilding
 * the type in one transaction keeps the whole change atomic.
 *
 * The 48 labels below are the union of the phase-13 40 and `VN, TH, LA, KH, MM, PH, ID, CN`, in the
 * order of `web/src/constants/countries.ts`; `tests/helpers/probe-phase14-address-countries.mts`
 * compares that file's values against `pg_enum` as sets and fails if the two ever drift. The list
 * decides which countries an address may name — it is not a payout claim (decision 0015 clause 6).
 *
 * Both directions are idempotent and both refuse to run when a stored row would not survive the
 * swap, because the guard runs before the column is altered and the whole migration is one
 * transaction.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    -- 0. The replacement type. The body below is a single statement string, so PostgreSQL runs it
    --    in one implicit transaction and an exception anywhere rolls the whole thing back; the
    --    DROP is here for the case where someone executes these statements one by one, or repairs a
    --    half-applied state by hand.
    DROP TYPE IF EXISTS "public"."enum_addresses_country_phase14";

    CREATE TYPE "public"."enum_addresses_country_phase14" AS ENUM(
      'VN', 'TH', 'LA', 'KH', 'MM', 'PH', 'ID', 'CN',
      'US', 'GB', 'CA', 'AU', 'AT', 'BE', 'BR', 'BG', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE',
      'GR', 'HK', 'HU', 'IN', 'IE', 'IT', 'JP', 'LV', 'LT', 'LU', 'MY', 'MT', 'MX', 'NL', 'NZ',
      'NO', 'PL', 'PT', 'RO', 'SG', 'SK', 'SI', 'ES', 'SE', 'CH'
    );

    -- 1. Guard: every value already stored must exist in the replacement type. Emptiness is a
    --    checked precondition, not an assumption — a row the new type cannot represent would make
    --    the ALTER below fail anyway, but with a cast error instead of a message that says why.
    DO $$
    DECLARE stranded bigint;
    BEGIN
      IF to_regclass('public.addresses') IS NOT NULL THEN
        EXECUTE $q$
          SELECT count(*) FROM public.addresses a
          WHERE a.country IS NOT NULL
            AND a.country::text NOT IN (
              SELECT e.enumlabel
              FROM pg_enum e
              JOIN pg_type t ON t.oid = e.enumtypid
              WHERE t.typname = 'enum_addresses_country_phase14'
            )
        $q$ INTO stranded;

        IF stranded > 0 THEN
          RAISE EXCEPTION 'phase14: public.addresses holds % row(s) whose country is not in the new 48-value list; refusing to swap enum_addresses_country and lose them', stranded;
        END IF;
      END IF;
    END $$;

    -- 2. Swap the column onto the replacement type. The cast goes through text because the two enum
    --    types are unrelated as far as PostgreSQL is concerned.
    ALTER TABLE "addresses"
      ALTER COLUMN "country" TYPE "public"."enum_addresses_country_phase14"
      USING "country"::text::"public"."enum_addresses_country_phase14";

    -- 3. Nothing references the old type any more (step 2 moved the only column), so it goes, and
    --    the replacement takes its name — the config, the generated types and every query keep
    --    using enum_addresses_country.
    DROP TYPE "public"."enum_addresses_country";
    ALTER TYPE "public"."enum_addresses_country_phase14" RENAME TO "enum_addresses_country";
  `)
}

/**
 * Restores the phase-13 type exactly: the same 40 labels, in the same order as
 * `20260915_020514_initial`. It refuses to run while any address names one of the eight values this
 * phase added, because that row has no representation in the phase-13 type and silently dropping
 * the country would be worse than refusing.
 */
export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    -- 0. The phase-13 label set, rebuilt under a scratch name.
    DROP TYPE IF EXISTS "public"."enum_addresses_country_phase13";

    CREATE TYPE "public"."enum_addresses_country_phase13" AS ENUM(
      'US', 'GB', 'CA', 'AU', 'AT', 'BE', 'BR', 'BG', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE',
      'GR', 'HK', 'HU', 'IN', 'IE', 'IT', 'JP', 'LV', 'LT', 'LU', 'MY', 'MT', 'MX', 'NL', 'NZ',
      'NO', 'PL', 'PT', 'RO', 'SG', 'SK', 'SI', 'ES', 'SE', 'CH'
    );

    -- 1. Guard: a stored VN (or TH/LA/KH/MM/PH/ID/CN) cannot be carried back to phase 13.
    DO $$
    DECLARE stranded bigint;
    BEGIN
      IF to_regclass('public.addresses') IS NOT NULL THEN
        EXECUTE $q$
          SELECT count(*) FROM public.addresses a
          WHERE a.country IS NOT NULL
            AND a.country::text NOT IN (
              SELECT e.enumlabel
              FROM pg_enum e
              JOIN pg_type t ON t.oid = e.enumtypid
              WHERE t.typname = 'enum_addresses_country_phase13'
            )
        $q$ INTO stranded;

        IF stranded > 0 THEN
          RAISE EXCEPTION 'phase14 down: public.addresses holds % row(s) naming a country that phase 13 cannot represent; refusing to restore the 40-value enum_addresses_country', stranded;
        END IF;
      END IF;
    END $$;

    -- 2. Swap back, drop the 48-value type, take the name again.
    ALTER TABLE "addresses"
      ALTER COLUMN "country" TYPE "public"."enum_addresses_country_phase13"
      USING "country"::text::"public"."enum_addresses_country_phase13";

    DROP TYPE "public"."enum_addresses_country";
    ALTER TYPE "public"."enum_addresses_country_phase13" RENAME TO "enum_addresses_country";
  `)
}
