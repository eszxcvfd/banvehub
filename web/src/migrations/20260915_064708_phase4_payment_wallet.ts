import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_wallets_currency" AS ENUM('VND');
  CREATE TYPE "public"."enum_wallets_status" AS ENUM('active', 'frozen', 'closed');
  CREATE TYPE "public"."enum_wallet_ledger_type" AS ENUM('topup', 'purchase', 'refund', 'adjustment', 'withdrawal', 'payout');
  CREATE TYPE "public"."enum_wallet_ledger_direction" AS ENUM('credit', 'debit');
  CREATE TYPE "public"."enum_wallet_ledger_reference_type" AS ENUM('payment_intent', 'order', 'adjustment', 'withdrawal', 'system');
  CREATE TYPE "public"."enum_payment_intents_provider" AS ENUM('sepay', 'vnpay', 'momo');
  CREATE TYPE "public"."enum_payment_intents_currency" AS ENUM('VND');
  CREATE TYPE "public"."enum_payment_intents_status" AS ENUM('CREATED', 'PENDING', 'PAID', 'EXPIRED', 'FAILED', 'CANCELLED', 'REFUNDED');
  CREATE TYPE "public"."enum_payment_transactions_status" AS ENUM('SUCCESS', 'FAILED', 'PENDING');
  CREATE TYPE "public"."enum_payment_webhook_events_status" AS ENUM('processed', 'duplicate_ignored', 'amount_mismatch', 'invalid_signature', 'failed');
  CREATE TABLE "wallets" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"user_id" integer NOT NULL,
  	"balance" numeric DEFAULT 0 NOT NULL,
  	"pending_balance" numeric DEFAULT 0 NOT NULL,
  	"currency" "enum_wallets_currency" DEFAULT 'VND' NOT NULL,
  	"status" "enum_wallets_status" DEFAULT 'active' NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "wallet_ledger" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"wallet_id" integer NOT NULL,
  	"user_id" integer NOT NULL,
  	"type" "enum_wallet_ledger_type" NOT NULL,
  	"amount" numeric NOT NULL,
  	"direction" "enum_wallet_ledger_direction" NOT NULL,
  	"reference_type" "enum_wallet_ledger_reference_type" NOT NULL,
  	"reference_id" varchar NOT NULL,
  	"balance_before" numeric NOT NULL,
  	"balance_after" numeric NOT NULL,
  	"description" varchar,
  	"metadata" jsonb,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "payment_intents" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"code" varchar NOT NULL,
  	"user_id" integer NOT NULL,
  	"provider" "enum_payment_intents_provider" DEFAULT 'sepay' NOT NULL,
  	"amount" numeric NOT NULL,
  	"currency" "enum_payment_intents_currency" DEFAULT 'VND' NOT NULL,
  	"status" "enum_payment_intents_status" DEFAULT 'CREATED' NOT NULL,
  	"reconciliation_flag" boolean DEFAULT false,
  	"reconciliation_note" varchar,
  	"expires_at" timestamp(3) with time zone NOT NULL,
  	"checkout_url" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "payment_transactions" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"payment_intent_id" integer NOT NULL,
  	"user_id" integer NOT NULL,
  	"provider" varchar DEFAULT 'sepay' NOT NULL,
  	"provider_transaction_id" varchar NOT NULL,
  	"amount" numeric NOT NULL,
  	"raw_reference" jsonb,
  	"status" "enum_payment_transactions_status" DEFAULT 'SUCCESS' NOT NULL,
  	"paid_at" timestamp(3) with time zone NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "payment_webhook_events" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"provider" varchar DEFAULT 'sepay' NOT NULL,
  	"event_id" varchar,
  	"payload" jsonb NOT NULL,
  	"headers" jsonb,
  	"signature_valid" boolean DEFAULT false NOT NULL,
  	"status" "enum_payment_webhook_events_status" NOT NULL,
  	"processed_at" timestamp(3) with time zone NOT NULL,
  	"error_details" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "wallets_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "wallet_ledger_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "payment_intents_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "payment_transactions_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "payment_webhook_events_id" integer;
  ALTER TABLE "wallets" ADD CONSTRAINT "wallets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "wallet_ledger" ADD CONSTRAINT "wallet_ledger_wallet_id_wallets_id_fk" FOREIGN KEY ("wallet_id") REFERENCES "public"."wallets"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "wallet_ledger" ADD CONSTRAINT "wallet_ledger_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payment_intents" ADD CONSTRAINT "payment_intents_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payment_transactions" ADD CONSTRAINT "payment_transactions_payment_intent_id_payment_intents_id_fk" FOREIGN KEY ("payment_intent_id") REFERENCES "public"."payment_intents"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payment_transactions" ADD CONSTRAINT "payment_transactions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  CREATE UNIQUE INDEX "wallets_user_idx" ON "wallets" USING btree ("user_id");
  CREATE INDEX "wallets_updated_at_idx" ON "wallets" USING btree ("updated_at");
  CREATE INDEX "wallets_created_at_idx" ON "wallets" USING btree ("created_at");
  CREATE INDEX "wallet_ledger_wallet_idx" ON "wallet_ledger" USING btree ("wallet_id");
  CREATE INDEX "wallet_ledger_user_idx" ON "wallet_ledger" USING btree ("user_id");
  CREATE INDEX "wallet_ledger_reference_id_idx" ON "wallet_ledger" USING btree ("reference_id");
  CREATE INDEX "wallet_ledger_updated_at_idx" ON "wallet_ledger" USING btree ("updated_at");
  CREATE INDEX "wallet_ledger_created_at_idx" ON "wallet_ledger" USING btree ("created_at");
  CREATE UNIQUE INDEX "payment_intents_code_idx" ON "payment_intents" USING btree ("code");
  CREATE INDEX "payment_intents_user_idx" ON "payment_intents" USING btree ("user_id");
  CREATE INDEX "payment_intents_updated_at_idx" ON "payment_intents" USING btree ("updated_at");
  CREATE INDEX "payment_intents_created_at_idx" ON "payment_intents" USING btree ("created_at");
  CREATE INDEX "payment_transactions_payment_intent_idx" ON "payment_transactions" USING btree ("payment_intent_id");
  CREATE INDEX "payment_transactions_user_idx" ON "payment_transactions" USING btree ("user_id");
  CREATE INDEX "payment_transactions_provider_idx" ON "payment_transactions" USING btree ("provider");
  CREATE INDEX "payment_transactions_provider_transaction_id_idx" ON "payment_transactions" USING btree ("provider_transaction_id");
  CREATE INDEX "payment_transactions_updated_at_idx" ON "payment_transactions" USING btree ("updated_at");
  CREATE INDEX "payment_transactions_created_at_idx" ON "payment_transactions" USING btree ("created_at");
  CREATE INDEX "payment_webhook_events_provider_idx" ON "payment_webhook_events" USING btree ("provider");
  CREATE INDEX "payment_webhook_events_event_id_idx" ON "payment_webhook_events" USING btree ("event_id");
  CREATE INDEX "payment_webhook_events_updated_at_idx" ON "payment_webhook_events" USING btree ("updated_at");
  CREATE INDEX "payment_webhook_events_created_at_idx" ON "payment_webhook_events" USING btree ("created_at");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_wallets_fk" FOREIGN KEY ("wallets_id") REFERENCES "public"."wallets"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_wallet_ledger_fk" FOREIGN KEY ("wallet_ledger_id") REFERENCES "public"."wallet_ledger"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_payment_intents_fk" FOREIGN KEY ("payment_intents_id") REFERENCES "public"."payment_intents"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_payment_transactions_fk" FOREIGN KEY ("payment_transactions_id") REFERENCES "public"."payment_transactions"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_payment_webhook_events_fk" FOREIGN KEY ("payment_webhook_events_id") REFERENCES "public"."payment_webhook_events"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_wallets_id_idx" ON "payload_locked_documents_rels" USING btree ("wallets_id");
  CREATE INDEX "payload_locked_documents_rels_wallet_ledger_id_idx" ON "payload_locked_documents_rels" USING btree ("wallet_ledger_id");
  CREATE INDEX "payload_locked_documents_rels_payment_intents_id_idx" ON "payload_locked_documents_rels" USING btree ("payment_intents_id");
  CREATE INDEX "payload_locked_documents_rels_payment_transactions_id_idx" ON "payload_locked_documents_rels" USING btree ("payment_transactions_id");
  CREATE INDEX "payload_locked_documents_rels_payment_webhook_events_id_idx" ON "payload_locked_documents_rels" USING btree ("payment_webhook_events_id");

  -- BR-02 Idempotency Unique Constraint
  CREATE UNIQUE INDEX "payment_transactions_provider_tx_idx" ON "payment_transactions" ("provider", "provider_transaction_id");

  -- Non-negative balance constraints
  ALTER TABLE "wallets" ADD CONSTRAINT "wallets_balance_non_negative" CHECK ("balance" >= 0);
  ALTER TABLE "wallets" ADD CONSTRAINT "wallets_pending_balance_non_negative" CHECK ("pending_balance" >= 0);

  -- Decision 0002 / BR-03 Immutable Ledger & Protected Wallets PostgreSQL Triggers
  CREATE OR REPLACE FUNCTION forbid_financial_mutation()
  RETURNS trigger AS $$
  BEGIN
    RAISE EXCEPTION 'Direct update or deletion on financial tables is strictly forbidden by Decision 0002 / BR-03';
  END;
  $$ LANGUAGE plpgsql;

  CREATE TRIGGER forbid_ledger_mutation
  BEFORE UPDATE OR DELETE ON "wallet_ledger"
  FOR EACH ROW EXECUTE FUNCTION forbid_financial_mutation();

  CREATE TRIGGER forbid_ledger_truncate
  BEFORE TRUNCATE ON "wallet_ledger"
  EXECUTE FUNCTION forbid_financial_mutation();

  CREATE TRIGGER forbid_wallet_delete
  BEFORE DELETE ON "wallets"
  FOR EACH ROW EXECUTE FUNCTION forbid_financial_mutation();

  CREATE TRIGGER forbid_wallet_truncate
  BEFORE TRUNCATE ON "wallets"
  EXECUTE FUNCTION forbid_financial_mutation();`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP TRIGGER IF EXISTS forbid_ledger_mutation ON "wallet_ledger";
  DROP TRIGGER IF EXISTS forbid_ledger_truncate ON "wallet_ledger";
  DROP TRIGGER IF EXISTS forbid_wallet_delete ON "wallets";
  DROP TRIGGER IF EXISTS forbid_wallet_truncate ON "wallets";
  DROP FUNCTION IF EXISTS forbid_financial_mutation();
  ALTER TABLE IF EXISTS "wallets" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE IF EXISTS "wallet_ledger" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE IF EXISTS "payment_intents" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE IF EXISTS "payment_transactions" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE IF EXISTS "payment_webhook_events" DISABLE ROW LEVEL SECURITY;
  DROP TABLE IF EXISTS "wallets" CASCADE;
  DROP TABLE IF EXISTS "wallet_ledger" CASCADE;
  DROP TABLE IF EXISTS "payment_intents" CASCADE;
  DROP TABLE IF EXISTS "payment_transactions" CASCADE;
  DROP TABLE IF EXISTS "payment_webhook_events" CASCADE;
  ALTER TABLE IF EXISTS "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_wallets_fk";
  
  ALTER TABLE IF EXISTS "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_wallet_ledger_fk";
  
  ALTER TABLE IF EXISTS "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_payment_intents_fk";
  
  ALTER TABLE IF EXISTS "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_payment_transactions_fk";
  
  ALTER TABLE IF EXISTS "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_payment_webhook_events_fk";
  
  DROP INDEX IF EXISTS "payload_locked_documents_rels_wallets_id_idx";
  DROP INDEX IF EXISTS "payload_locked_documents_rels_wallet_ledger_id_idx";
  DROP INDEX IF EXISTS "payload_locked_documents_rels_payment_intents_id_idx";
  DROP INDEX IF EXISTS "payload_locked_documents_rels_payment_transactions_id_idx";
  DROP INDEX IF EXISTS "payload_locked_documents_rels_payment_webhook_events_id_idx";
  ALTER TABLE IF EXISTS "payload_locked_documents_rels" DROP COLUMN IF EXISTS "wallets_id";
  ALTER TABLE IF EXISTS "payload_locked_documents_rels" DROP COLUMN IF EXISTS "wallet_ledger_id";
  ALTER TABLE IF EXISTS "payload_locked_documents_rels" DROP COLUMN IF EXISTS "payment_intents_id";
  ALTER TABLE IF EXISTS "payload_locked_documents_rels" DROP COLUMN IF EXISTS "payment_transactions_id";
  ALTER TABLE IF EXISTS "payload_locked_documents_rels" DROP COLUMN IF EXISTS "payment_webhook_events_id";
  DROP TYPE IF EXISTS "public"."enum_wallets_currency";
  DROP TYPE IF EXISTS "public"."enum_wallets_status";
  DROP TYPE IF EXISTS "public"."enum_wallet_ledger_type";
  DROP TYPE IF EXISTS "public"."enum_wallet_ledger_direction";
  DROP TYPE IF EXISTS "public"."enum_wallet_ledger_reference_type";
  DROP TYPE IF EXISTS "public"."enum_payment_intents_provider";
  DROP TYPE IF EXISTS "public"."enum_payment_intents_currency";
  DROP TYPE IF EXISTS "public"."enum_payment_intents_status";
  DROP TYPE IF EXISTS "public"."enum_payment_transactions_status";
  DROP TYPE IF EXISTS "public"."enum_payment_webhook_events_status";`)
}

