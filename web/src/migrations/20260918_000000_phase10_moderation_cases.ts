import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * FR-22 (`PLAN.md:797-810`, `PLAN.md` §17:2293) — `moderation_cases`.
 *
 * Additive only: one enum pair, one table, its foreign keys and indexes. No existing
 * column, row or index is rewritten, so the migration is safe on the populated
 * development database (161 products / 55 users) and the test database alike.
 *
 * `moderation_cases_open_reporter_product_idx` is a PARTIAL unique index over
 * `(reporter_id, product_id)` restricted to the still-open statuses. It is the
 * database-level twin of the `409` the report route returns: even two concurrent
 * requests that both pass the pre-check cannot create a second open case for the same
 * `(reporter, product)` pair. Resolved/dismissed cases fall outside the predicate, so
 * a user may report the same product again later.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    -- 1. Reason and status vocabularies (FR-22 reasons: PLAN.md:800-807)
    DO $$ BEGIN
      CREATE TYPE "public"."enum_moderation_cases_reason" AS ENUM(
        'FILE_CORRUPTED',
        'CONTENT_MISMATCH',
        'COPYRIGHT_VIOLATION',
        'SPAM',
        'PROHIBITED_CONTENT',
        'MISLEADING_PREVIEW',
        'OTHER'
      );
    EXCEPTION
      WHEN duplicate_object THEN null;
    END $$;

    DO $$ BEGIN
      CREATE TYPE "public"."enum_moderation_cases_status" AS ENUM(
        'OPEN',
        'IN_REVIEW',
        'RESOLVED',
        'DISMISSED'
      );
    EXCEPTION
      WHEN duplicate_object THEN null;
    END $$;

    -- 2. moderation_cases table
    CREATE TABLE IF NOT EXISTS "moderation_cases" (
      "id" serial PRIMARY KEY NOT NULL,
      "product_id" integer NOT NULL,
      "reporter_id" integer NOT NULL,
      "reason" "enum_moderation_cases_reason" NOT NULL,
      "description" varchar,
      "status" "enum_moderation_cases_status" DEFAULT 'OPEN' NOT NULL,
      "resolution_notes" varchar,
      "resolved_by_id" integer,
      "resolved_at" timestamp(3) with time zone,
      "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
      "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
    );

    -- 3. Foreign keys. A case has no meaning without its product or its reporter, so
    -- both cascade (same shape as "comments") instead of dangling on a NOT NULL column.
    DO $$ BEGIN
      ALTER TABLE "moderation_cases" ADD CONSTRAINT "moderation_cases_product_id_products_id_fk"
        FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;
    EXCEPTION
      WHEN duplicate_object THEN null;
    END $$;

    DO $$ BEGIN
      ALTER TABLE "moderation_cases" ADD CONSTRAINT "moderation_cases_reporter_id_users_id_fk"
        FOREIGN KEY ("reporter_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
    EXCEPTION
      WHEN duplicate_object THEN null;
    END $$;

    DO $$ BEGIN
      ALTER TABLE "moderation_cases" ADD CONSTRAINT "moderation_cases_resolved_by_id_users_id_fk"
        FOREIGN KEY ("resolved_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
    EXCEPTION
      WHEN duplicate_object THEN null;
    END $$;

    -- 4. Payload locked-document relations (Payload registers every collection here)
    ALTER TABLE "payload_locked_documents_rels" ADD COLUMN IF NOT EXISTS "moderation_cases_id" integer;

    DO $$ BEGIN
      ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_moderation_cases_fk"
        FOREIGN KEY ("moderation_cases_id") REFERENCES "public"."moderation_cases"("id") ON DELETE cascade ON UPDATE no action;
    EXCEPTION
      WHEN duplicate_object THEN null;
    END $$;

    CREATE INDEX IF NOT EXISTS "payload_locked_documents_rels_moderation_cases_id_idx"
      ON "payload_locked_documents_rels" USING btree ("moderation_cases_id");

    -- 5. Standard indexes
    CREATE INDEX IF NOT EXISTS "moderation_cases_product_idx" ON "moderation_cases" USING btree ("product_id");
    CREATE INDEX IF NOT EXISTS "moderation_cases_reporter_idx" ON "moderation_cases" USING btree ("reporter_id");
    CREATE INDEX IF NOT EXISTS "moderation_cases_status_idx" ON "moderation_cases" USING btree ("status");
    CREATE INDEX IF NOT EXISTS "moderation_cases_resolved_by_idx" ON "moderation_cases" USING btree ("resolved_by_id");
    CREATE INDEX IF NOT EXISTS "moderation_cases_updated_at_idx" ON "moderation_cases" USING btree ("updated_at");
    CREATE INDEX IF NOT EXISTS "moderation_cases_created_at_idx" ON "moderation_cases" USING btree ("created_at");

    -- 6. One OPEN/IN_REVIEW case per (reporter, product): the DB-level guard behind the
    -- route's 409. The predicate excludes RESOLVED/DISMISSED so a closed case never
    -- blocks a later report of the same product by the same user.
    CREATE UNIQUE INDEX IF NOT EXISTS "moderation_cases_open_reporter_product_idx"
      ON "moderation_cases" USING btree ("reporter_id", "product_id")
      WHERE "status" IN ('OPEN', 'IN_REVIEW');
  `)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    DROP INDEX IF EXISTS "moderation_cases_open_reporter_product_idx";
    DROP TABLE IF EXISTS "moderation_cases" CASCADE;

    ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_moderation_cases_fk";
    DROP INDEX IF EXISTS "payload_locked_documents_rels_moderation_cases_id_idx";
    ALTER TABLE "payload_locked_documents_rels" DROP COLUMN IF EXISTS "moderation_cases_id";

    DROP TYPE IF EXISTS "public"."enum_moderation_cases_reason";
    DROP TYPE IF EXISTS "public"."enum_moderation_cases_status";
  `)
}
