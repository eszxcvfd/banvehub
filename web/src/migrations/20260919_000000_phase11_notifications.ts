import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * `PLAN.md` §13 (in-app notification channel, P0) + §17:2291 (`notifications` table).
 *
 * Additive only: one enum, one table, its foreign key, its indexes and the Payload
 * locked-documents relation column. No existing column, row or index is rewritten, so the
 * migration is safe on the populated development database and on the freshly created test
 * database alike.
 *
 * `notifications_recipient_type_dedupe_key_unique_idx` is the load-bearing constraint of
 * the whole feature: it makes "at most ONE notification per business event per recipient"
 * a database invariant rather than a service-hope. A replayed event (BR-02: the SePay
 * webhook replay must stay a no-op `200`) that races past the service's pre-check still
 * collides here instead of producing a second row. `dedupe_key` is therefore NOT NULL —
 * in Postgres two NULLs never collide, so a nullable dedupe key would disable the guard.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    -- 1. Event vocabulary (10 in-app events; §13's two email-shaped events are out of
    -- scope per ADR 0003 and are NOT part of this enum).
    DO $$ BEGIN
      CREATE TYPE "public"."enum_notifications_type" AS ENUM(
        'PAYMENT_SUCCESS',
        'PAYMENT_FAILED',
        'ORDER_SUCCESS',
        'SELLER_SALE',
        'EARNINGS_AVAILABLE',
        'WITHDRAWAL_STATUS',
        'REFUND',
        'PRODUCT_APPROVED',
        'PRODUCT_REJECTED',
        'TICKET_REPLY'
      );
    EXCEPTION
      WHEN duplicate_object THEN null;
    END $$;

    -- 2. notifications table
    CREATE TABLE IF NOT EXISTS "notifications" (
      "id" serial PRIMARY KEY NOT NULL,
      "recipient_id" integer NOT NULL,
      "type" "enum_notifications_type" NOT NULL,
      "title" varchar NOT NULL,
      "body" varchar NOT NULL,
      "link" varchar,
      "read_at" timestamp(3) with time zone,
      "dedupe_key" varchar NOT NULL,
      "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
      "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
    );

    -- 3. Foreign key. A notification has no meaning without its recipient, so it cascades
    -- (same shape as "comments"/"moderation_cases") instead of dangling on a NOT NULL column.
    DO $$ BEGIN
      ALTER TABLE "notifications" ADD CONSTRAINT "notifications_recipient_id_users_id_fk"
        FOREIGN KEY ("recipient_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
    EXCEPTION
      WHEN duplicate_object THEN null;
    END $$;

    -- 4. Payload locked-document relations (Payload registers every collection here)
    ALTER TABLE "payload_locked_documents_rels" ADD COLUMN IF NOT EXISTS "notifications_id" integer;

    DO $$ BEGIN
      ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_notifications_fk"
        FOREIGN KEY ("notifications_id") REFERENCES "public"."notifications"("id") ON DELETE cascade ON UPDATE no action;
    EXCEPTION
      WHEN duplicate_object THEN null;
    END $$;

    CREATE INDEX IF NOT EXISTS "payload_locked_documents_rels_notifications_id_idx"
      ON "payload_locked_documents_rels" USING btree ("notifications_id");

    -- 5. Standard indexes. The inbox query is "my notifications, newest first"
    -- (recipient + created_at), which is what §25 #21 renders.
    CREATE INDEX IF NOT EXISTS "notifications_recipient_idx" ON "notifications" USING btree ("recipient_id");
    CREATE INDEX IF NOT EXISTS "notifications_updated_at_idx" ON "notifications" USING btree ("updated_at");
    CREATE INDEX IF NOT EXISTS "notifications_created_at_idx" ON "notifications" USING btree ("created_at");

    -- 6. THE constraint: one row per (recipient, type, dedupeKey). The service pre-checks
    -- with a SELECT for the ordinary replay, this index is the backstop for the concurrent
    -- one, and it is also the index the pre-check SELECT is served from.
    CREATE UNIQUE INDEX IF NOT EXISTS "notifications_recipient_type_dedupe_key_unique_idx"
      ON "notifications" USING btree ("recipient_id", "type", "dedupe_key");
  `)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    DROP INDEX IF EXISTS "notifications_recipient_type_dedupe_key_unique_idx";
    DROP TABLE IF EXISTS "notifications" CASCADE;

    ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_notifications_fk";
    DROP INDEX IF EXISTS "payload_locked_documents_rels_notifications_id_idx";
    ALTER TABLE "payload_locked_documents_rels" DROP COLUMN IF EXISTS "notifications_id";

    DROP TYPE IF EXISTS "public"."enum_notifications_type";
  `)
}
