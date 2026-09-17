import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    -- 1. Create Reviews Status ENUM
    DO $$ BEGIN
      CREATE TYPE "public"."enum_reviews_status" AS ENUM('published', 'pending', 'rejected');
    EXCEPTION
      WHEN duplicate_object THEN null;
    END $$;

    -- 2. Create reviews table
    CREATE TABLE IF NOT EXISTS "reviews" (
      "id" serial PRIMARY KEY NOT NULL,
      "product_id" integer NOT NULL,
      "user_id" integer NOT NULL,
      "entitlement_id" integer NOT NULL,
      "rating" numeric NOT NULL,
      "title" varchar,
      "content" varchar NOT NULL,
      "status" "enum_reviews_status" DEFAULT 'published' NOT NULL,
      "seller_reply_comment" varchar,
      "seller_reply_replied_at" timestamp(3) with time zone,
      "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
      "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
    );

    -- 3. Foreign Key Constraints
    DO $$ BEGIN
      ALTER TABLE "reviews" ADD CONSTRAINT "reviews_product_id_products_id_fk"
        FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;
    EXCEPTION
      WHEN duplicate_object THEN null;
    END $$;

    DO $$ BEGIN
      ALTER TABLE "reviews" ADD CONSTRAINT "reviews_user_id_users_id_fk"
        FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
    EXCEPTION
      WHEN duplicate_object THEN null;
    END $$;

    DO $$ BEGIN
      ALTER TABLE "reviews" ADD CONSTRAINT "reviews_entitlement_id_entitlements_id_fk"
        FOREIGN KEY ("entitlement_id") REFERENCES "public"."entitlements"("id") ON DELETE cascade ON UPDATE no action;
    EXCEPTION
      WHEN duplicate_object THEN null;
    END $$;

    -- 4. Payload Locked Documents Relations
    ALTER TABLE "payload_locked_documents_rels" ADD COLUMN IF NOT EXISTS "reviews_id" integer;

    DO $$ BEGIN
      ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_reviews_fk"
        FOREIGN KEY ("reviews_id") REFERENCES "public"."reviews"("id") ON DELETE cascade ON UPDATE no action;
    EXCEPTION
      WHEN duplicate_object THEN null;
    END $$;

    CREATE INDEX IF NOT EXISTS "payload_locked_documents_rels_reviews_id_idx"
      ON "payload_locked_documents_rels" USING btree ("reviews_id");

    -- 5. Standard Indexes
    CREATE INDEX IF NOT EXISTS "reviews_product_idx" ON "reviews" USING btree ("product_id");
    CREATE INDEX IF NOT EXISTS "reviews_user_idx" ON "reviews" USING btree ("user_id");
    CREATE INDEX IF NOT EXISTS "reviews_entitlement_idx" ON "reviews" USING btree ("entitlement_id");
    CREATE INDEX IF NOT EXISTS "reviews_status_idx" ON "reviews" USING btree ("status");
    CREATE INDEX IF NOT EXISTS "reviews_updated_at_idx" ON "reviews" USING btree ("updated_at");
    CREATE INDEX IF NOT EXISTS "reviews_created_at_idx" ON "reviews" USING btree ("created_at");

    -- 6. Unique Constraint per Buyer-Product Pair (R1 / Anti-Abuse)
    CREATE UNIQUE INDEX IF NOT EXISTS "reviews_user_product_idx" ON "reviews" ("user_id", "product_id");

    -- 7. Rating check constraint (1 <= rating <= 5)
    DO $$ BEGIN
      ALTER TABLE "reviews" ADD CONSTRAINT "reviews_rating_range" CHECK ("rating" >= 1 AND "rating" <= 5);
    EXCEPTION
      WHEN duplicate_object THEN null;
    END $$;
  `)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    DROP TABLE IF EXISTS "reviews" CASCADE;
    DROP TYPE IF EXISTS "public"."enum_reviews_status";
    ALTER TABLE "payload_locked_documents_rels" DROP COLUMN IF EXISTS "reviews_id";
  `)
}
