import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
  -- 1. Extend existing enums
  ALTER TYPE "public"."enum_orders_status" ADD VALUE IF NOT EXISTS 'REFUNDED';
  ALTER TYPE "public"."enum_orders_status" ADD VALUE IF NOT EXISTS 'PARTIALLY_REFUNDED';
  DO $$ BEGIN
    ALTER TYPE "public"."enum_wallet_ledger_reference_type" ADD VALUE 'refund';
  EXCEPTION
    WHEN duplicate_object THEN null;
  END $$;

  -- 2. Create Phase 6 ENUMs
  DO $$ BEGIN
    CREATE TYPE "public"."enum_seller_earnings_currency" AS ENUM('VND');
  EXCEPTION
    WHEN duplicate_object THEN null;
  END $$;

  DO $$ BEGIN
    CREATE TYPE "public"."enum_seller_earnings_status" AS ENUM('PENDING', 'AVAILABLE', 'REVERSED', 'PAID');
  EXCEPTION
    WHEN duplicate_object THEN null;
  END $$;

  DO $$ BEGIN
    CREATE TYPE "public"."enum_withdrawals_currency" AS ENUM('VND');
  EXCEPTION
    WHEN duplicate_object THEN null;
  END $$;

  DO $$ BEGIN
    CREATE TYPE "public"."enum_withdrawals_status" AS ENUM('REQUESTED', 'UNDER_REVIEW', 'APPROVED', 'PROCESSING', 'PAID', 'REJECTED', 'CANCELLED', 'FAILED');
  EXCEPTION
    WHEN duplicate_object THEN null;
  END $$;

  DO $$ BEGIN
    CREATE TYPE "public"."enum_refunds_currency" AS ENUM('VND');
  EXCEPTION
    WHEN duplicate_object THEN null;
  END $$;

  DO $$ BEGIN
    CREATE TYPE "public"."enum_refunds_status" AS ENUM('COMPLETED', 'FAILED');
  EXCEPTION
    WHEN duplicate_object THEN null;
  END $$;

  -- 3. Extend existing tables
  ALTER TABLE "seller_profiles" ADD COLUMN IF NOT EXISTS "commission_rate" numeric;
  ALTER TABLE "seller_profiles" DROP CONSTRAINT IF EXISTS "seller_profiles_commission_rate_valid";
  ALTER TABLE "seller_profiles" ADD CONSTRAINT "seller_profiles_commission_rate_valid"
    CHECK ("commission_rate" IS NULL OR ("commission_rate" >= 0 AND "commission_rate" <= 1));

  -- 4. Create Phase 6 Tables

  -- 4.1 seller_earnings
  CREATE TABLE IF NOT EXISTS "seller_earnings" (
    "id" serial PRIMARY KEY NOT NULL,
    "seller_id" integer NOT NULL,
    "order_id" integer NOT NULL,
    "order_item_id" integer NOT NULL,
    "product_id" integer NOT NULL,
    "sale_price" numeric DEFAULT 0 NOT NULL,
    "platform_fee" numeric DEFAULT 0 NOT NULL,
    "seller_amount" numeric DEFAULT 0 NOT NULL,
    "tax" numeric DEFAULT 0 NOT NULL,
    "commission_rate" numeric DEFAULT 0 NOT NULL,
    "currency" "enum_seller_earnings_currency" DEFAULT 'VND' NOT NULL,
    "status" "enum_seller_earnings_status" DEFAULT 'PENDING' NOT NULL,
    "hold_period_days" numeric DEFAULT 7 NOT NULL,
    "hold_until" timestamp(3) with time zone NOT NULL,
    "available_at" timestamp(3) with time zone,
    "paid_at" timestamp(3) with time zone,
    "reversed_at" timestamp(3) with time zone,
    "policy_version" varchar DEFAULT 'v1' NOT NULL,
    "notes" varchar,
    "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
    "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );

  -- tax snapshot column on seller_earnings. It is declared inside the CREATE TABLE above
  -- for fresh databases, but that statement is a no-op when the table already exists,
  -- so this ALTER is required to add it to databases where Batch 7 ran without the column.
  ALTER TABLE "seller_earnings" ADD COLUMN IF NOT EXISTS "tax" numeric DEFAULT 0 NOT NULL;

  -- 4.2 withdrawals
  CREATE TABLE IF NOT EXISTS "withdrawals" (
    "id" serial PRIMARY KEY NOT NULL,
    "code" varchar NOT NULL,
    "seller_id" integer NOT NULL,
    "amount" numeric NOT NULL,
    "currency" "enum_withdrawals_currency" DEFAULT 'VND' NOT NULL,
    "status" "enum_withdrawals_status" DEFAULT 'REQUESTED' NOT NULL,
    "bank_info_bank_name" varchar NOT NULL,
    "bank_info_account_number" varchar NOT NULL,
    "bank_info_account_holder_name" varchar NOT NULL,
    "requested_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
    "reviewed_at" timestamp(3) with time zone,
    "reviewed_by_id" integer,
    "paid_at" timestamp(3) with time zone,
    "rejection_reason" varchar,
    "failure_reason" varchar,
    "notes" varchar,
    "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
    "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );

  -- 4.3 withdrawal_events
  CREATE TABLE IF NOT EXISTS "withdrawal_events" (
    "id" serial PRIMARY KEY NOT NULL,
    "withdrawal_id" integer NOT NULL,
    "from_status" varchar,
    "to_status" varchar NOT NULL,
    "actor_id" integer,
    "actor_role" varchar,
    "reason" varchar,
    "notes" varchar,
    "timestamp" timestamp(3) with time zone DEFAULT now() NOT NULL,
    "metadata" jsonb,
    "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
    "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );

  -- 4.4 refunds
  CREATE TABLE IF NOT EXISTS "refunds" (
    "id" serial PRIMARY KEY NOT NULL,
    "code" varchar NOT NULL,
    "order_id" integer NOT NULL,
    "order_item_id" integer NOT NULL,
    "buyer_id" integer NOT NULL,
    "seller_id" integer NOT NULL,
    "amount" numeric NOT NULL,
    "platform_fee_refunded" numeric DEFAULT 0 NOT NULL,
    "seller_amount_refunded" numeric DEFAULT 0 NOT NULL,
    "currency" "enum_refunds_currency" DEFAULT 'VND' NOT NULL,
    "reason" varchar NOT NULL,
    "status" "enum_refunds_status" DEFAULT 'COMPLETED' NOT NULL,
    "processed_by_id" integer NOT NULL,
    "ledger_transaction_id" integer,
    "entitlement_revoked" boolean DEFAULT false NOT NULL,
    "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
    "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );

  -- 5. Payload Locked Documents Relations
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN IF NOT EXISTS "seller_earnings_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN IF NOT EXISTS "withdrawals_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN IF NOT EXISTS "withdrawal_events_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN IF NOT EXISTS "refunds_id" integer;

  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_seller_earnings_fk";
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_seller_earnings_fk"
    FOREIGN KEY ("seller_earnings_id") REFERENCES "public"."seller_earnings"("id") ON DELETE cascade ON UPDATE no action;

  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_withdrawals_fk";
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_withdrawals_fk"
    FOREIGN KEY ("withdrawals_id") REFERENCES "public"."withdrawals"("id") ON DELETE cascade ON UPDATE no action;

  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_withdrawal_events_fk";
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_withdrawal_events_fk"
    FOREIGN KEY ("withdrawal_events_id") REFERENCES "public"."withdrawal_events"("id") ON DELETE cascade ON UPDATE no action;

  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_refunds_fk";
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_refunds_fk"
    FOREIGN KEY ("refunds_id") REFERENCES "public"."refunds"("id") ON DELETE cascade ON UPDATE no action;

  CREATE INDEX IF NOT EXISTS "payload_locked_documents_rels_seller_earnings_id_idx" ON "payload_locked_documents_rels" USING btree ("seller_earnings_id");
  CREATE INDEX IF NOT EXISTS "payload_locked_documents_rels_withdrawals_id_idx" ON "payload_locked_documents_rels" USING btree ("withdrawals_id");
  CREATE INDEX IF NOT EXISTS "payload_locked_documents_rels_withdrawal_events_id_idx" ON "payload_locked_documents_rels" USING btree ("withdrawal_events_id");
  CREATE INDEX IF NOT EXISTS "payload_locked_documents_rels_refunds_id_idx" ON "payload_locked_documents_rels" USING btree ("refunds_id");

  -- 6. Foreign Key Constraints
  ALTER TABLE "seller_earnings" DROP CONSTRAINT IF EXISTS "seller_earnings_seller_id_users_id_fk";
  ALTER TABLE "seller_earnings" ADD CONSTRAINT "seller_earnings_seller_id_users_id_fk"
    FOREIGN KEY ("seller_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;

  ALTER TABLE "seller_earnings" DROP CONSTRAINT IF EXISTS "seller_earnings_order_id_orders_id_fk";
  ALTER TABLE "seller_earnings" ADD CONSTRAINT "seller_earnings_order_id_orders_id_fk"
    FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE set null ON UPDATE no action;

  ALTER TABLE "seller_earnings" DROP CONSTRAINT IF EXISTS "seller_earnings_order_item_id_order_items_id_fk";
  ALTER TABLE "seller_earnings" ADD CONSTRAINT "seller_earnings_order_item_id_order_items_id_fk"
    FOREIGN KEY ("order_item_id") REFERENCES "public"."order_items"("id") ON DELETE set null ON UPDATE no action;

  ALTER TABLE "seller_earnings" DROP CONSTRAINT IF EXISTS "seller_earnings_product_id_products_id_fk";
  ALTER TABLE "seller_earnings" ADD CONSTRAINT "seller_earnings_product_id_products_id_fk"
    FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE set null ON UPDATE no action;

  ALTER TABLE "withdrawals" DROP CONSTRAINT IF EXISTS "withdrawals_seller_id_users_id_fk";
  ALTER TABLE "withdrawals" ADD CONSTRAINT "withdrawals_seller_id_users_id_fk"
    FOREIGN KEY ("seller_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;

  ALTER TABLE "withdrawals" DROP CONSTRAINT IF EXISTS "withdrawals_reviewed_by_id_users_id_fk";
  ALTER TABLE "withdrawals" ADD CONSTRAINT "withdrawals_reviewed_by_id_users_id_fk"
    FOREIGN KEY ("reviewed_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;

  ALTER TABLE "withdrawal_events" DROP CONSTRAINT IF EXISTS "withdrawal_events_withdrawal_id_withdrawals_id_fk";
  ALTER TABLE "withdrawal_events" ADD CONSTRAINT "withdrawal_events_withdrawal_id_withdrawals_id_fk"
    FOREIGN KEY ("withdrawal_id") REFERENCES "public"."withdrawals"("id") ON DELETE cascade ON UPDATE no action;

  ALTER TABLE "withdrawal_events" DROP CONSTRAINT IF EXISTS "withdrawal_events_actor_id_users_id_fk";
  ALTER TABLE "withdrawal_events" ADD CONSTRAINT "withdrawal_events_actor_id_users_id_fk"
    FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;

  ALTER TABLE "refunds" DROP CONSTRAINT IF EXISTS "refunds_order_id_orders_id_fk";
  ALTER TABLE "refunds" ADD CONSTRAINT "refunds_order_id_orders_id_fk"
    FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE set null ON UPDATE no action;

  ALTER TABLE "refunds" DROP CONSTRAINT IF EXISTS "refunds_order_item_id_order_items_id_fk";
  ALTER TABLE "refunds" ADD CONSTRAINT "refunds_order_item_id_order_items_id_fk"
    FOREIGN KEY ("order_item_id") REFERENCES "public"."order_items"("id") ON DELETE set null ON UPDATE no action;

  ALTER TABLE "refunds" DROP CONSTRAINT IF EXISTS "refunds_buyer_id_users_id_fk";
  ALTER TABLE "refunds" ADD CONSTRAINT "refunds_buyer_id_users_id_fk"
    FOREIGN KEY ("buyer_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;

  ALTER TABLE "refunds" DROP CONSTRAINT IF EXISTS "refunds_seller_id_users_id_fk";
  ALTER TABLE "refunds" ADD CONSTRAINT "refunds_seller_id_users_id_fk"
    FOREIGN KEY ("seller_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;

  ALTER TABLE "refunds" DROP CONSTRAINT IF EXISTS "refunds_processed_by_id_users_id_fk";
  ALTER TABLE "refunds" ADD CONSTRAINT "refunds_processed_by_id_users_id_fk"
    FOREIGN KEY ("processed_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;

  ALTER TABLE "refunds" DROP CONSTRAINT IF EXISTS "refunds_ledger_transaction_id_wallet_ledger_id_fk";
  ALTER TABLE "refunds" ADD CONSTRAINT "refunds_ledger_transaction_id_wallet_ledger_id_fk"
    FOREIGN KEY ("ledger_transaction_id") REFERENCES "public"."wallet_ledger"("id") ON DELETE set null ON UPDATE no action;

  -- 7. Indices
  CREATE UNIQUE INDEX IF NOT EXISTS "seller_earnings_order_item_idx" ON "seller_earnings" USING btree ("order_item_id");
  CREATE INDEX IF NOT EXISTS "seller_earnings_seller_idx" ON "seller_earnings" USING btree ("seller_id");
  CREATE INDEX IF NOT EXISTS "seller_earnings_order_idx" ON "seller_earnings" USING btree ("order_id");
  CREATE INDEX IF NOT EXISTS "seller_earnings_product_idx" ON "seller_earnings" USING btree ("product_id");
  CREATE INDEX IF NOT EXISTS "seller_earnings_status_idx" ON "seller_earnings" USING btree ("status");
  CREATE INDEX IF NOT EXISTS "seller_earnings_hold_until_idx" ON "seller_earnings" USING btree ("hold_until");
  CREATE INDEX IF NOT EXISTS "seller_earnings_status_hold_until_idx" ON "seller_earnings" USING btree ("status", "hold_until");
  CREATE INDEX IF NOT EXISTS "seller_earnings_updated_at_idx" ON "seller_earnings" USING btree ("updated_at");
  CREATE INDEX IF NOT EXISTS "seller_earnings_created_at_idx" ON "seller_earnings" USING btree ("created_at");

  CREATE UNIQUE INDEX IF NOT EXISTS "withdrawals_code_idx" ON "withdrawals" USING btree ("code");
  CREATE INDEX IF NOT EXISTS "withdrawals_seller_idx" ON "withdrawals" USING btree ("seller_id");
  CREATE INDEX IF NOT EXISTS "withdrawals_status_idx" ON "withdrawals" USING btree ("status");
  CREATE INDEX IF NOT EXISTS "withdrawals_reviewed_by_idx" ON "withdrawals" USING btree ("reviewed_by_id");
  CREATE INDEX IF NOT EXISTS "withdrawals_requested_at_idx" ON "withdrawals" USING btree ("requested_at");
  CREATE INDEX IF NOT EXISTS "withdrawals_updated_at_idx" ON "withdrawals" USING btree ("updated_at");
  CREATE INDEX IF NOT EXISTS "withdrawals_created_at_idx" ON "withdrawals" USING btree ("created_at");

  CREATE INDEX IF NOT EXISTS "withdrawal_events_withdrawal_idx" ON "withdrawal_events" USING btree ("withdrawal_id");
  CREATE INDEX IF NOT EXISTS "withdrawal_events_actor_idx" ON "withdrawal_events" USING btree ("actor_id");
  CREATE INDEX IF NOT EXISTS "withdrawal_events_timestamp_idx" ON "withdrawal_events" USING btree ("timestamp");
  CREATE INDEX IF NOT EXISTS "withdrawal_events_updated_at_idx" ON "withdrawal_events" USING btree ("updated_at");
  CREATE INDEX IF NOT EXISTS "withdrawal_events_created_at_idx" ON "withdrawal_events" USING btree ("created_at");

  CREATE UNIQUE INDEX IF NOT EXISTS "refunds_code_idx" ON "refunds" USING btree ("code");
  CREATE INDEX IF NOT EXISTS "refunds_order_idx" ON "refunds" USING btree ("order_id");
  CREATE INDEX IF NOT EXISTS "refunds_order_item_idx" ON "refunds" USING btree ("order_item_id");
  CREATE INDEX IF NOT EXISTS "refunds_buyer_idx" ON "refunds" USING btree ("buyer_id");
  CREATE INDEX IF NOT EXISTS "refunds_seller_idx" ON "refunds" USING btree ("seller_id");
  CREATE INDEX IF NOT EXISTS "refunds_status_idx" ON "refunds" USING btree ("status");
  CREATE INDEX IF NOT EXISTS "refunds_processed_by_idx" ON "refunds" USING btree ("processed_by_id");
  CREATE INDEX IF NOT EXISTS "refunds_ledger_transaction_idx" ON "refunds" USING btree ("ledger_transaction_id");
  CREATE INDEX IF NOT EXISTS "refunds_updated_at_idx" ON "refunds" USING btree ("updated_at");
  CREATE INDEX IF NOT EXISTS "refunds_created_at_idx" ON "refunds" USING btree ("created_at");

  -- 8. Business Rule & Integrity Check Constraints
  ALTER TABLE "withdrawals" DROP CONSTRAINT IF EXISTS "withdrawals_amount_limits";
  ALTER TABLE "withdrawals" ADD CONSTRAINT "withdrawals_amount_limits"
    CHECK ("amount" >= 50000 AND "amount" <= 50000000);

  ALTER TABLE "seller_earnings" DROP CONSTRAINT IF EXISTS "seller_earnings_sale_price_non_negative";
  ALTER TABLE "seller_earnings" ADD CONSTRAINT "seller_earnings_sale_price_non_negative"
    CHECK ("sale_price" >= 0);

  ALTER TABLE "seller_earnings" DROP CONSTRAINT IF EXISTS "seller_earnings_platform_fee_non_negative";
  ALTER TABLE "seller_earnings" ADD CONSTRAINT "seller_earnings_platform_fee_non_negative"
    CHECK ("platform_fee" >= 0);

  ALTER TABLE "seller_earnings" DROP CONSTRAINT IF EXISTS "seller_earnings_seller_amount_non_negative";
  ALTER TABLE "seller_earnings" ADD CONSTRAINT "seller_earnings_seller_amount_non_negative"
    CHECK ("seller_amount" >= 0);

  ALTER TABLE "seller_earnings" DROP CONSTRAINT IF EXISTS "seller_earnings_tax_non_negative";
  ALTER TABLE "seller_earnings" ADD CONSTRAINT "seller_earnings_tax_non_negative"
    CHECK ("tax" >= 0);

  ALTER TABLE "seller_earnings" DROP CONSTRAINT IF EXISTS "seller_earnings_commission_rate_valid";
  ALTER TABLE "seller_earnings" ADD CONSTRAINT "seller_earnings_commission_rate_valid"
    CHECK ("commission_rate" >= 0 AND "commission_rate" <= 1);

  ALTER TABLE "seller_earnings" DROP CONSTRAINT IF EXISTS "seller_earnings_hold_period_days_non_negative";
  ALTER TABLE "seller_earnings" ADD CONSTRAINT "seller_earnings_hold_period_days_non_negative"
    CHECK ("hold_period_days" >= 0);

  ALTER TABLE "seller_earnings" DROP CONSTRAINT IF EXISTS "seller_earnings_math_check";
  ALTER TABLE "seller_earnings" ADD CONSTRAINT "seller_earnings_math_check"
    CHECK ("seller_amount" + "platform_fee" + "tax" = "sale_price");

  ALTER TABLE "refunds" DROP CONSTRAINT IF EXISTS "refunds_amount_non_negative";
  ALTER TABLE "refunds" ADD CONSTRAINT "refunds_amount_non_negative"
    CHECK ("amount" >= 0);

  ALTER TABLE "refunds" DROP CONSTRAINT IF EXISTS "refunds_platform_fee_refunded_non_negative";
  ALTER TABLE "refunds" ADD CONSTRAINT "refunds_platform_fee_refunded_non_negative"
    CHECK ("platform_fee_refunded" >= 0);

  ALTER TABLE "refunds" DROP CONSTRAINT IF EXISTS "refunds_seller_amount_refunded_non_negative";
  ALTER TABLE "refunds" ADD CONSTRAINT "refunds_seller_amount_refunded_non_negative"
    CHECK ("seller_amount_refunded" >= 0);
  `)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
  -- 1. Drop tables in reverse dependency order
  DROP TABLE IF EXISTS "refunds" CASCADE;
  DROP TABLE IF EXISTS "withdrawal_events" CASCADE;
  DROP TABLE IF EXISTS "withdrawals" CASCADE;
  DROP TABLE IF EXISTS "seller_earnings" CASCADE;

  -- 2. Drop columns and constraints from payload_locked_documents_rels
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_refunds_fk";
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_withdrawal_events_fk";
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_withdrawals_fk";
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_seller_earnings_fk";

  DROP INDEX IF EXISTS "payload_locked_documents_rels_refunds_id_idx";
  DROP INDEX IF EXISTS "payload_locked_documents_rels_withdrawal_events_id_idx";
  DROP INDEX IF EXISTS "payload_locked_documents_rels_withdrawals_id_idx";
  DROP INDEX IF EXISTS "payload_locked_documents_rels_seller_earnings_id_idx";

  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN IF EXISTS "refunds_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN IF EXISTS "withdrawal_events_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN IF EXISTS "withdrawals_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN IF EXISTS "seller_earnings_id";

  -- 3. Remove commission_rate from seller_profiles
  ALTER TABLE "seller_profiles" DROP CONSTRAINT IF EXISTS "seller_profiles_commission_rate_valid";
  ALTER TABLE "seller_profiles" DROP COLUMN IF EXISTS "commission_rate";

  -- 4. Drop Phase 6 ENUMs
  DROP TYPE IF EXISTS "public"."enum_refunds_status";
  DROP TYPE IF EXISTS "public"."enum_refunds_currency";
  DROP TYPE IF EXISTS "public"."enum_withdrawals_status";
  DROP TYPE IF EXISTS "public"."enum_withdrawals_currency";
  DROP TYPE IF EXISTS "public"."enum_seller_earnings_status";
  DROP TYPE IF EXISTS "public"."enum_seller_earnings_currency";
  `)
}
