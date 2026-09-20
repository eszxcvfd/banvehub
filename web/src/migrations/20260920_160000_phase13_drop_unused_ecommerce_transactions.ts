import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * Phase 13 — drop the template's commerce ledger, which KienTaoHub never wrote to.
 *
 * `transactions` and `transactions_items` came from `@payloadcms/plugin-ecommerce`: the storefront
 * template's Stripe flow (cart → order → payment → one `transactions` row holding the payment intent
 * and the purchased items). Decision 0004 replaced that rail with SePay plus the wallet ledger, and
 * the physical-goods half of the plugin (`carts`, `products`, `orders`, `variants`) was dropped in
 * phase 2 — so since phase 4 these two tables have had no writer in `web/src` and no reader
 * anywhere. Measured before this migration: 0 rows in both `kientaohub` and `kientaohub_test`, and 0
 * rows in `payload_locked_documents_rels` holding a `transactions_id`. What remained was a
 * permanently empty admin list view (`/admin/collections/transactions`) and the one-item "Ecommerce"
 * group it created in the sidebar.
 *
 * `addresses` is deliberately NOT touched. It is the other surviving plugin collection, but the
 * account area lists addresses through the plugin's `useAddresses` hook
 * (`web/src/app/(app)/(account)/account/addresses`) and `users` joins it, so only the dead money
 * tables are removed here.
 *
 * The up path is destructive, so it refuses to run on a database that still holds rows: template
 * Stripe records are not something this migration may silently discard, and phase 2 set the
 * precedent that a removed plugin collection takes its table with it. The down path restores the
 * schema exactly as phase 12 left it (enum types, both tables, keys, indexes, and the
 * locked-documents relationship column) and is idempotent, but it cannot restore rows.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    -- 0. Refuse to discard data. Emptiness is a checked precondition, not an assumption.
    DO $$
    DECLARE rows_present bigint;
    BEGIN
      IF to_regclass('public.transactions') IS NOT NULL THEN
        EXECUTE 'SELECT count(*) FROM public.transactions' INTO rows_present;
        IF rows_present > 0 THEN
          RAISE EXCEPTION 'phase13: public.transactions holds % row(s); the template commerce layer is being removed, so archive them before running this migration', rows_present;
        END IF;
      END IF;
    END $$;

    -- 1. The locked-documents relationship column is the only inbound reference to these tables.
    --    It has to be dropped explicitly: dropping the referenced table leaves the column behind,
    --    dangling, and Payload would then read a relationship the config no longer declares.
    ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_transactions_fk";
    DROP INDEX IF EXISTS "payload_locked_documents_rels_transactions_id_idx";
    ALTER TABLE "payload_locked_documents_rels" DROP COLUMN IF EXISTS "transactions_id";

    -- 2. Child table before parent table.
    ALTER TABLE IF EXISTS "transactions_items" DISABLE ROW LEVEL SECURITY;
    ALTER TABLE IF EXISTS "transactions" DISABLE ROW LEVEL SECURITY;
    DROP TABLE IF EXISTS "transactions_items" CASCADE;
    DROP TABLE IF EXISTS "transactions" CASCADE;

    -- 3. The three enum types were referenced by those two tables and nothing else (checked in
    --    pg_attribute before writing this), so they are dead once the tables are gone.
    DROP TYPE IF EXISTS "public"."enum_transactions_payment_method";
    DROP TYPE IF EXISTS "public"."enum_transactions_status";
    DROP TYPE IF EXISTS "public"."enum_transactions_currency";
  `)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    DO $$ BEGIN
      CREATE TYPE "public"."enum_transactions_payment_method" AS ENUM('stripe');
    EXCEPTION
      WHEN duplicate_object THEN null;
    END $$;

    DO $$ BEGIN
      CREATE TYPE "public"."enum_transactions_status" AS ENUM('pending', 'succeeded', 'failed', 'cancelled', 'expired', 'refunded');
    EXCEPTION
      WHEN duplicate_object THEN null;
    END $$;

    DO $$ BEGIN
      CREATE TYPE "public"."enum_transactions_currency" AS ENUM('USD');
    EXCEPTION
      WHEN duplicate_object THEN null;
    END $$;

    CREATE TABLE IF NOT EXISTS "transactions" (
      "id" serial PRIMARY KEY NOT NULL,
      "payment_method" "enum_transactions_payment_method",
      "stripe_customer_i_d" varchar,
      "stripe_payment_intent_i_d" varchar,
      "billing_address_title" varchar,
      "billing_address_first_name" varchar,
      "billing_address_last_name" varchar,
      "billing_address_company" varchar,
      "billing_address_address_line1" varchar,
      "billing_address_address_line2" varchar,
      "billing_address_city" varchar,
      "billing_address_state" varchar,
      "billing_address_postal_code" varchar,
      "billing_address_country" varchar,
      "billing_address_phone" varchar,
      "status" "enum_transactions_status" DEFAULT 'pending' NOT NULL,
      "customer_id" integer,
      "customer_email" varchar,
      "order_id" integer,
      "amount" numeric,
      "currency" "enum_transactions_currency" DEFAULT 'USD',
      "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
      "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
    );

    CREATE TABLE IF NOT EXISTS "transactions_items" (
      "_order" integer NOT NULL,
      "_parent_id" integer NOT NULL,
      "id" varchar PRIMARY KEY NOT NULL,
      "product_id" integer,
      "quantity" numeric DEFAULT 1 NOT NULL
    );

    ALTER TABLE "transactions_items" DROP CONSTRAINT IF EXISTS "transactions_items_parent_id_fk";
    ALTER TABLE "transactions_items" ADD CONSTRAINT "transactions_items_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."transactions"("id") ON DELETE cascade ON UPDATE no action;
    ALTER TABLE "transactions_items" DROP CONSTRAINT IF EXISTS "transactions_items_product_id_products_id_fk";
    ALTER TABLE "transactions_items" ADD CONSTRAINT "transactions_items_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE set null ON UPDATE no action;

    ALTER TABLE "transactions" DROP CONSTRAINT IF EXISTS "transactions_customer_id_users_id_fk";
    ALTER TABLE "transactions" ADD CONSTRAINT "transactions_customer_id_users_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
    ALTER TABLE "transactions" DROP CONSTRAINT IF EXISTS "transactions_order_id_orders_id_fk";
    ALTER TABLE "transactions" ADD CONSTRAINT "transactions_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE set null ON UPDATE no action;

    CREATE INDEX IF NOT EXISTS "transactions_customer_idx" ON "transactions" USING btree ("customer_id");
    CREATE INDEX IF NOT EXISTS "transactions_order_idx" ON "transactions" USING btree ("order_id");
    CREATE INDEX IF NOT EXISTS "transactions_updated_at_idx" ON "transactions" USING btree ("updated_at");
    CREATE INDEX IF NOT EXISTS "transactions_created_at_idx" ON "transactions" USING btree ("created_at");
    CREATE INDEX IF NOT EXISTS "transactions_items_order_idx" ON "transactions_items" USING btree ("_order");
    CREATE INDEX IF NOT EXISTS "transactions_items_parent_id_idx" ON "transactions_items" USING btree ("_parent_id");
    CREATE INDEX IF NOT EXISTS "transactions_items_product_idx" ON "transactions_items" USING btree ("product_id");

    ALTER TABLE "payload_locked_documents_rels" ADD COLUMN IF NOT EXISTS "transactions_id" integer;
    ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_transactions_fk";
    ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_transactions_fk" FOREIGN KEY ("transactions_id") REFERENCES "public"."transactions"("id") ON DELETE cascade ON UPDATE no action;
    CREATE INDEX IF NOT EXISTS "payload_locked_documents_rels_transactions_id_idx" ON "payload_locked_documents_rels" USING btree ("transactions_id");
  `)
}
