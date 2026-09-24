import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * Decision 0012 (refund policy) phase 12 — schema only, one migration for both halves:
 *
 * 1. `refunds` carries the policy inputs Decision 0012 made mandatory:
 *    - `fault_basis` (§7): whose fault it was, which is what decides who bears the refund
 *      (SELLER reverses the seller's earning, PLATFORM refunds the buyer only). Rows written
 *      before this migration predate the field and were produced by a service that reversed the
 *      seller earning unconditionally ("step c"), so their money outcome *was* a seller-fault
 *      outcome: backfilling them with `SELLER` records what actually happened rather than
 *      inventing a platform fault. The column default keeps the add safe on a populated database
 *      (the development database already holds refunds) instead of failing on NOT NULL.
 *    - `out_of_window` (§6): true when the request came after the 5-day window and the operator
 *      overrode it, so the record itself says the refund was out of policy. Legacy rows get
 *      `false` because the window rule did not exist when they were executed and no override was
 *      ever recorded for them.
 *
 * 2. `footer` carries the contact channel Decision 0012 §2 requires the site to publish. The
 *    operator edits them in the admin panel and the storefront renders them; the columns are
 *    nullable because a fresh install has no contact information yet and the UI must be able to
 *    render "not configured" instead of a blank string.
 *
 * Additive only: no existing column, row or index is rewritten, so it applies on the populated
 * development database and on a freshly created database alike. `push` stays off (PLAN.md §37):
 * the schema is owned by this migration. The down path drops what the up path added and is
 * idempotent (`IF EXISTS`), matching the rule phase 10/11 established.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    -- 1. Fault basis vocabulary (Decision 0012 §7).
    DO $$ BEGIN
      CREATE TYPE "public"."enum_refunds_fault_basis" AS ENUM('SELLER', 'PLATFORM');
    EXCEPTION
      WHEN duplicate_object THEN null;
    END $$;

    -- 2. refunds: the fault basis, backfilled as SELLER for pre-policy rows (see header).
    ALTER TABLE "refunds" ADD COLUMN IF NOT EXISTS "fault_basis" "enum_refunds_fault_basis" DEFAULT 'SELLER' NOT NULL;

    -- 3. refunds: the out-of-window marker (Decision 0012 §6).
    ALTER TABLE "refunds" ADD COLUMN IF NOT EXISTS "out_of_window" boolean DEFAULT false NOT NULL;

    -- 4. footer: the published contact channel (Decision 0012 §2).
    ALTER TABLE "footer" ADD COLUMN IF NOT EXISTS "contact_email" varchar;
    ALTER TABLE "footer" ADD COLUMN IF NOT EXISTS "contact_phone" varchar;
    ALTER TABLE "footer" ADD COLUMN IF NOT EXISTS "contact_note" varchar;
  `)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "footer" DROP COLUMN IF EXISTS "contact_note";
    ALTER TABLE "footer" DROP COLUMN IF EXISTS "contact_phone";
    ALTER TABLE "footer" DROP COLUMN IF EXISTS "contact_email";

    ALTER TABLE "refunds" DROP COLUMN IF EXISTS "out_of_window";
    ALTER TABLE "refunds" DROP COLUMN IF EXISTS "fault_basis";

    DROP TYPE IF EXISTS "public"."enum_refunds_fault_basis";
  `)
}
