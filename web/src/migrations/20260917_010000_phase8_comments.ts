import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    -- 1. Create Comments Status ENUM
    DO $$ BEGIN
      CREATE TYPE "public"."enum_comments_status" AS ENUM('published', 'pending', 'hidden');
    EXCEPTION
      WHEN duplicate_object THEN null;
    END $$;

    -- 2. Create comments table
    CREATE TABLE IF NOT EXISTS "comments" (
      "id" serial PRIMARY KEY NOT NULL,
      "product_id" integer NOT NULL,
      "user_id" integer NOT NULL,
      "parent_id" integer,
      "content" varchar NOT NULL,
      "status" "enum_comments_status" DEFAULT 'published' NOT NULL,
      "is_seller_reply" boolean DEFAULT false,
      "is_admin_reply" boolean DEFAULT false,
      "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
      "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
    );

    -- 3. Foreign Key Constraints
    DO $$ BEGIN
      ALTER TABLE "comments" ADD CONSTRAINT "comments_product_id_products_id_fk"
        FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;
    EXCEPTION
      WHEN duplicate_object THEN null;
    END $$;

    DO $$ BEGIN
      ALTER TABLE "comments" ADD CONSTRAINT "comments_user_id_users_id_fk"
        FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
    EXCEPTION
      WHEN duplicate_object THEN null;
    END $$;

    DO $$ BEGIN
      ALTER TABLE "comments" ADD CONSTRAINT "comments_parent_id_comments_id_fk"
        FOREIGN KEY ("parent_id") REFERENCES "public"."comments"("id") ON DELETE cascade ON UPDATE no action;
    EXCEPTION
      WHEN duplicate_object THEN null;
    END $$;

    -- 4. Payload Locked Documents Relations
    ALTER TABLE "payload_locked_documents_rels" ADD COLUMN IF NOT EXISTS "comments_id" integer;

    DO $$ BEGIN
      ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_comments_fk"
        FOREIGN KEY ("comments_id") REFERENCES "public"."comments"("id") ON DELETE cascade ON UPDATE no action;
    EXCEPTION
      WHEN duplicate_object THEN null;
    END $$;

    CREATE INDEX IF NOT EXISTS "payload_locked_documents_rels_comments_id_idx"
      ON "payload_locked_documents_rels" USING btree ("comments_id");

    -- 5. Standard Indexes
    CREATE INDEX IF NOT EXISTS "comments_product_idx" ON "comments" USING btree ("product_id");
    CREATE INDEX IF NOT EXISTS "comments_user_idx" ON "comments" USING btree ("user_id");
    CREATE INDEX IF NOT EXISTS "comments_parent_idx" ON "comments" USING btree ("parent_id");
    CREATE INDEX IF NOT EXISTS "comments_status_idx" ON "comments" USING btree ("status");
    CREATE INDEX IF NOT EXISTS "comments_updated_at_idx" ON "comments" USING btree ("updated_at");
    CREATE INDEX IF NOT EXISTS "comments_created_at_idx" ON "comments" USING btree ("created_at");

    -- 6. Compound Index on (product_id, status) per R1 specification
    CREATE INDEX IF NOT EXISTS "comments_product_status_idx" ON "comments" USING btree ("product_id", "status");
  `)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    DROP TABLE IF EXISTS "comments" CASCADE;
    DROP TYPE IF EXISTS "public"."enum_comments_status";
    ALTER TABLE "payload_locked_documents_rels" DROP COLUMN IF EXISTS "comments_id";
  `)
}
