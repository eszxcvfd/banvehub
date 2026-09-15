import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
  -- 1. Drop old template tables and enums from Batch 1
  DROP TABLE IF EXISTS "orders_items", "orders", "orders_rels" CASCADE;
  DROP TYPE IF EXISTS "public"."enum_orders_status";
  DROP TYPE IF EXISTS "public"."enum_orders_currency";

  -- 2. Create Phase 5 ENUMs
  CREATE TYPE "public"."enum_orders_currency" AS ENUM('VND');
  CREATE TYPE "public"."enum_orders_status" AS ENUM('PENDING', 'COMPLETED', 'CANCELLED');
  CREATE TYPE "public"."enum_orders_payment_source" AS ENUM('wallet', 'free');
  CREATE TYPE "public"."enum_entitlements_status" AS ENUM('active', 'revoked', 'expired');
  CREATE TYPE "public"."enum_download_events_status" AS ENUM('SUCCESS', 'DENIED', 'EXPIRED', 'FAILED');

  -- 3. Create Phase 5 Tables
  CREATE TABLE "orders" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"code" varchar NOT NULL,
  	"buyer_id" integer NOT NULL,
  	"total_amount" numeric DEFAULT 0 NOT NULL,
  	"currency" "enum_orders_currency" DEFAULT 'VND' NOT NULL,
  	"status" "enum_orders_status" DEFAULT 'PENDING' NOT NULL,
  	"payment_source" "enum_orders_payment_source" DEFAULT 'wallet' NOT NULL,
  	"paid_at" timestamp(3) with time zone,
  	"notes" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );

  CREATE TABLE "order_items" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order_id" integer NOT NULL,
  	"product_id" integer NOT NULL,
  	"seller_id" integer NOT NULL,
  	"sale_price" numeric DEFAULT 0 NOT NULL,
  	"platform_fee" numeric DEFAULT 0 NOT NULL,
  	"seller_amount" numeric DEFAULT 0 NOT NULL,
  	"tax" numeric DEFAULT 0 NOT NULL,
  	"policy_version" varchar DEFAULT 'v1' NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );

  CREATE TABLE "entitlements" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"user_id" integer NOT NULL,
  	"product_id" integer NOT NULL,
  	"order_id" integer,
  	"order_item_id" integer,
  	"status" "enum_entitlements_status" DEFAULT 'active' NOT NULL,
  	"granted_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"download_count" numeric DEFAULT 0 NOT NULL,
  	"max_downloads" numeric,
  	"expires_at" timestamp(3) with time zone,
  	"revoked_at" timestamp(3) with time zone,
  	"reason" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );

  CREATE TABLE "download_events" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"user_id" integer,
  	"product_id" integer NOT NULL,
  	"entitlement_id" integer,
  	"ip_address" varchar,
  	"user_agent" varchar,
  	"downloaded_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"status" "enum_download_events_status" NOT NULL,
  	"download_token_hash" varchar,
  	"error_reason" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );

  -- 4. Payload Locked Documents Relations
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN IF NOT EXISTS "order_items_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN IF NOT EXISTS "entitlements_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN IF NOT EXISTS "download_events_id" integer;

  -- 5. Foreign Key Constraints
  ALTER TABLE "orders" ADD CONSTRAINT "orders_buyer_id_users_id_fk" FOREIGN KEY ("buyer_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;

  ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "order_items" ADD CONSTRAINT "order_items_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "order_items" ADD CONSTRAINT "order_items_seller_id_users_id_fk" FOREIGN KEY ("seller_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;

  ALTER TABLE "entitlements" ADD CONSTRAINT "entitlements_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "entitlements" ADD CONSTRAINT "entitlements_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "entitlements" ADD CONSTRAINT "entitlements_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "entitlements" ADD CONSTRAINT "entitlements_order_item_id_order_items_id_fk" FOREIGN KEY ("order_item_id") REFERENCES "public"."order_items"("id") ON DELETE set null ON UPDATE no action;

  ALTER TABLE "download_events" ADD CONSTRAINT "download_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "download_events" ADD CONSTRAINT "download_events_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "download_events" ADD CONSTRAINT "download_events_entitlement_id_entitlements_id_fk" FOREIGN KEY ("entitlement_id") REFERENCES "public"."entitlements"("id") ON DELETE set null ON UPDATE no action;

  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_orders_fk" FOREIGN KEY ("orders_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_order_items_fk" FOREIGN KEY ("order_items_id") REFERENCES "public"."order_items"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_entitlements_fk" FOREIGN KEY ("entitlements_id") REFERENCES "public"."entitlements"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_download_events_fk" FOREIGN KEY ("download_events_id") REFERENCES "public"."download_events"("id") ON DELETE cascade ON UPDATE no action;

  ALTER TABLE "transactions" ADD CONSTRAINT "transactions_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE set null ON UPDATE no action;

  -- 6. Indexes
  CREATE UNIQUE INDEX "orders_code_idx" ON "orders" USING btree ("code");
  CREATE INDEX "orders_buyer_idx" ON "orders" USING btree ("buyer_id");
  CREATE INDEX "orders_updated_at_idx" ON "orders" USING btree ("updated_at");
  CREATE INDEX "orders_created_at_idx" ON "orders" USING btree ("created_at");

  CREATE INDEX "order_items_order_idx" ON "order_items" USING btree ("order_id");
  CREATE INDEX "order_items_product_idx" ON "order_items" USING btree ("product_id");
  CREATE INDEX "order_items_seller_idx" ON "order_items" USING btree ("seller_id");
  CREATE INDEX "order_items_updated_at_idx" ON "order_items" USING btree ("updated_at");
  CREATE INDEX "order_items_created_at_idx" ON "order_items" USING btree ("created_at");

  CREATE INDEX "entitlements_user_idx" ON "entitlements" USING btree ("user_id");
  CREATE INDEX "entitlements_product_idx" ON "entitlements" USING btree ("product_id");
  CREATE INDEX "entitlements_order_idx" ON "entitlements" USING btree ("order_id");
  CREATE INDEX "entitlements_order_item_idx" ON "entitlements" USING btree ("order_item_id");
  CREATE INDEX "entitlements_updated_at_idx" ON "entitlements" USING btree ("updated_at");
  CREATE INDEX "entitlements_created_at_idx" ON "entitlements" USING btree ("created_at");

  CREATE INDEX "download_events_user_idx" ON "download_events" USING btree ("user_id");
  CREATE INDEX "download_events_product_idx" ON "download_events" USING btree ("product_id");
  CREATE INDEX "download_events_entitlement_idx" ON "download_events" USING btree ("entitlement_id");
  CREATE INDEX "download_events_token_hash_idx" ON "download_events" USING btree ("download_token_hash");
  CREATE INDEX "download_events_downloaded_at_idx" ON "download_events" USING btree ("downloaded_at");
  CREATE INDEX "download_events_updated_at_idx" ON "download_events" USING btree ("updated_at");
  CREATE INDEX "download_events_created_at_idx" ON "download_events" USING btree ("created_at");

  CREATE INDEX IF NOT EXISTS "payload_locked_documents_rels_orders_id_idx" ON "payload_locked_documents_rels" USING btree ("orders_id");
  CREATE INDEX "payload_locked_documents_rels_order_items_id_idx" ON "payload_locked_documents_rels" USING btree ("order_items_id");
  CREATE INDEX "payload_locked_documents_rels_entitlements_id_idx" ON "payload_locked_documents_rels" USING btree ("entitlements_id");
  CREATE INDEX "payload_locked_documents_rels_download_events_id_idx" ON "payload_locked_documents_rels" USING btree ("download_events_id");

  -- 7. Special Constraints & Invariants
  -- R2 Invariant: Partial Unique Index - A buyer can only hold ONE active entitlement per product
  CREATE UNIQUE INDEX "entitlements_user_product_active_idx" ON "entitlements" ("user_id", "product_id") WHERE ("status" = 'active');

  -- Non-negative monetary checks
  ALTER TABLE "orders" ADD CONSTRAINT "orders_total_amount_non_negative" CHECK ("total_amount" >= 0);
  ALTER TABLE "order_items" ADD CONSTRAINT "order_items_sale_price_non_negative" CHECK ("sale_price" >= 0);
  ALTER TABLE "order_items" ADD CONSTRAINT "order_items_platform_fee_non_negative" CHECK ("platform_fee" >= 0);
  ALTER TABLE "order_items" ADD CONSTRAINT "order_items_seller_amount_non_negative" CHECK ("seller_amount" >= 0);
  ALTER TABLE "order_items" ADD CONSTRAINT "order_items_tax_non_negative" CHECK ("tax" >= 0);
  ALTER TABLE "entitlements" ADD CONSTRAINT "entitlements_download_count_non_negative" CHECK ("download_count" >= 0);

  -- BR-04 Invariant Database Trigger: Anti-Self-Purchase
  CREATE OR REPLACE FUNCTION check_seller_self_purchase()
  RETURNS trigger AS $$
  DECLARE
    order_buyer_id integer;
  BEGIN
    SELECT buyer_id INTO order_buyer_id FROM "orders" WHERE id = NEW.order_id;
    IF order_buyer_id IS NOT NULL AND order_buyer_id = NEW.seller_id THEN
      RAISE EXCEPTION 'BR-04 Invariant Violation: Seller (id=%) cannot purchase their own product (product_id=%)', NEW.seller_id, NEW.product_id;
    END IF;
    RETURN NEW;
  END;
  $$ LANGUAGE plpgsql;

  CREATE TRIGGER enforce_br04_seller_anti_self_purchase
  BEFORE INSERT OR UPDATE ON "order_items"
  FOR EACH ROW EXECUTE FUNCTION check_seller_self_purchase();
  `)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
  -- 1. Drop trigger and function
  DROP TRIGGER IF EXISTS enforce_br04_seller_anti_self_purchase ON "order_items";
  DROP FUNCTION IF EXISTS check_seller_self_purchase();

  -- 2. Drop Phase 5 tables
  DROP TABLE IF EXISTS "download_events" CASCADE;
  DROP TABLE IF EXISTS "entitlements" CASCADE;
  DROP TABLE IF EXISTS "order_items" CASCADE;
  DROP TABLE IF EXISTS "orders" CASCADE;

  -- 3. Drop locked documents relations added in Phase 5
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_download_events_fk";
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_entitlements_fk";
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_order_items_fk";
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_orders_fk";

  DROP INDEX IF EXISTS "payload_locked_documents_rels_download_events_id_idx";
  DROP INDEX IF EXISTS "payload_locked_documents_rels_entitlements_id_idx";
  DROP INDEX IF EXISTS "payload_locked_documents_rels_order_items_id_idx";

  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN IF EXISTS "download_events_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN IF EXISTS "entitlements_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN IF EXISTS "order_items_id";

  -- 4. Drop Phase 5 Enums
  DROP TYPE IF EXISTS "public"."enum_download_events_status";
  DROP TYPE IF EXISTS "public"."enum_entitlements_status";
  DROP TYPE IF EXISTS "public"."enum_orders_payment_source";
  DROP TYPE IF EXISTS "public"."enum_orders_status";
  DROP TYPE IF EXISTS "public"."enum_orders_currency";

  -- 5. Restore Batch 1 Template Tables, Enums, and Constraints
  CREATE TYPE "public"."enum_orders_status" AS ENUM('processing', 'completed', 'cancelled', 'refunded');
  CREATE TYPE "public"."enum_orders_currency" AS ENUM('USD');

  CREATE TABLE "orders" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"shipping_address_title" varchar,
  	"shipping_address_first_name" varchar,
  	"shipping_address_last_name" varchar,
  	"shipping_address_company" varchar,
  	"shipping_address_address_line1" varchar,
  	"shipping_address_address_line2" varchar,
  	"shipping_address_city" varchar,
  	"shipping_address_state" varchar,
  	"shipping_address_postal_code" varchar,
  	"shipping_address_country" varchar,
  	"shipping_address_phone" varchar,
  	"customer_id" integer,
  	"customer_email" varchar,
  	"status" "enum_orders_status" DEFAULT 'processing',
  	"amount" numeric,
  	"currency" "enum_orders_currency" DEFAULT 'USD',
  	"access_token" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );

  CREATE TABLE "orders_items" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"product_id" integer,
  	"quantity" numeric DEFAULT 1 NOT NULL
  );

  CREATE TABLE "orders_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"transactions_id" integer
  );

  ALTER TABLE "orders_items" ADD CONSTRAINT "orders_items_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "orders_items" ADD CONSTRAINT "orders_items_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "orders" ADD CONSTRAINT "orders_customer_id_users_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "orders_rels" ADD CONSTRAINT "orders_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "orders_rels" ADD CONSTRAINT "orders_rels_transactions_fk" FOREIGN KEY ("transactions_id") REFERENCES "public"."transactions"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_orders_fk" FOREIGN KEY ("orders_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "transactions" ADD CONSTRAINT "transactions_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE set null ON UPDATE no action;

  CREATE INDEX "orders_items_order_idx" ON "orders_items" USING btree ("_order");
  CREATE INDEX "orders_items_parent_id_idx" ON "orders_items" USING btree ("_parent_id");
  CREATE INDEX "orders_items_product_idx" ON "orders_items" USING btree ("product_id");
  CREATE INDEX "orders_customer_idx" ON "orders" USING btree ("customer_id");
  CREATE UNIQUE INDEX "orders_access_token_idx" ON "orders" USING btree ("access_token");
  CREATE INDEX "orders_updated_at_idx" ON "orders" USING btree ("updated_at");
  CREATE INDEX "orders_created_at_idx" ON "orders" USING btree ("created_at");
  CREATE INDEX "orders_rels_order_idx" ON "orders_rels" USING btree ("order");
  CREATE INDEX "orders_rels_parent_idx" ON "orders_rels" USING btree ("parent_id");
  CREATE INDEX "orders_rels_path_idx" ON "orders_rels" USING btree ("path");
  CREATE INDEX "orders_rels_transactions_id_idx" ON "orders_rels" USING btree ("transactions_id");
  `)
}
