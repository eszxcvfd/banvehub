# Milestone 1: PostgreSQL Migration Batch 6 Design Report

## 1. Observation

### Current Migrations and Registration
1. `web/src/migrations/` contains 5 prior migrations (`index.ts` lines 1-33):
   - `20260915_020514_initial` (Batch 1)
   - `20260915_023701_user_roles_from_plan_5` (Batch 2)
   - `20260915_033625_phase2_digital_catalog` (Batch 3)
   - `20260915_062953_phase3_seller_moderation` (Batch 4)
   - `20260915_064708_phase4_payment_wallet` (Batch 5)
2. In `20260915_020514_initial.ts` (lines 865-903, 1145-1155, 1433-1444):
   - Table `"orders_items"` was created with columns `_order`, `_parent_id`, `id` (varchar PK), `product_id`, `variant_id`, `quantity`.
   - Table `"orders"` was created with 11 physical shipping address fields (`shipping_address_title`, `shipping_address_first_name`, etc.), `customer_id`, `customer_email`, `status` (`enum_orders_status`: `'processing', 'completed', 'cancelled', 'refunded'`), `amount`, `currency` (`enum_orders_currency`: `'USD'`), `access_token`.
   - Table `"orders_rels"` was created with `id`, `order`, `parent_id`, `path`, `transactions_id`.
   - Foreign keys: `orders_items_parent_id_fk` referencing `orders(id)`, `orders_customer_id_users_id_fk` referencing `users(id)`, `payload_locked_documents_rels_orders_fk` referencing `orders(id)`, and `transactions_order_id_orders_id_fk` referencing `orders(id)`.
3. In `20260915_033625_phase2_digital_catalog.ts` (lines 51-66):
   - Clean deletion pattern for deprecated physical template tables:
     `ALTER TABLE "variants" DISABLE ROW LEVEL SECURITY; DROP TABLE "variants" CASCADE;`
     `DROP TABLE "carts" CASCADE; DROP TABLE "carts_items" CASCADE;`
4. In `20260915_064708_phase4_payment_wallet.ts` (lines 87-91, 120-124, 131-160):
   - Added collection columns and FKs to `"payload_locked_documents_rels"` (`wallets_id`, `wallet_ledger_id`, `payment_intents_id`, `payment_transactions_id`, `payment_webhook_events_id`).
   - Appended custom constraints and PostgreSQL triggers for financial invariants (BR-02, BR-03, Decision 0002).
5. Current Database Table Inspection via `docker exec -i kientaohub-postgres psql`:
   - Query: `SELECT count(*) FROM orders; SELECT count(*) FROM orders_items; SELECT count(*) FROM orders_rels;`
   - Results:
     - `orders`: 0 rows
     - `orders_items`: 0 rows
     - `orders_rels`: 0 rows
     - `transactions`: 0 rows
     - `payload_locked_documents_rels WHERE orders_id IS NOT NULL`: 0 rows

---

## 2. Logic Chain

1. **Zero-Data State Enables Clean Drop vs Complex Alter**:
   - Because `orders`, `orders_items`, and `orders_rels` have exactly 0 rows, no user or transaction data exists to preserve.
   - The legacy `orders` table contains 11 physical shipping address columns, legacy enums (`enum_orders_status` with `'processing', 'refunded'` and `enum_orders_currency` with `'USD'`), and varchar PKs in `orders_items` instead of numeric/integer digital columns.
   - Altering the existing tables would require dropping 11 columns, renaming `orders_items` to `order_items`, altering column types, rewriting primary keys, and mutating enum types. This approach is error-prone, leaves database schema artifacts, and complicates rollbacks.
   - Conversely, dropping `orders_items`, `orders`, and `orders_rels` via `DROP TABLE IF EXISTS "orders_items", "orders", "orders_rels" CASCADE;` (following the exact precedent established in Batch 2 for `carts` and `variants`) allows clean, deterministic creation of `orders`, `order_items`, `entitlements`, and `download_events`.

2. **Phase 5 Digital Orders & Entitlements Schema Specification**:
   - `orders`:
     - `id`: serial PRIMARY KEY NOT NULL
     - `code`: varchar NOT NULL (unique identifier, e.g. `ORD-xxx`)
     - `buyer_id`: integer NOT NULL (FK to `users(id)`)
     - `total_amount`: numeric DEFAULT 0 NOT NULL (check `>= 0`)
     - `currency`: `enum_orders_currency` (`'VND'`) DEFAULT 'VND' NOT NULL
     - `status`: `enum_orders_status` (`'PENDING'`, `'COMPLETED'`, `'CANCELLED'`) DEFAULT 'PENDING' NOT NULL
     - `payment_source`: `enum_orders_payment_source` (`'wallet'`, `'free'`) DEFAULT 'wallet' NOT NULL
     - `paid_at`: timestamp(3) with time zone
     - `notes`: varchar
     - `updated_at`, `created_at`: timestamp(3) with time zone DEFAULT now() NOT NULL
   - `order_items`:
     - `id`: serial PRIMARY KEY NOT NULL
     - `order_id`: integer NOT NULL (FK to `orders(id)` ON DELETE cascade)
     - `product_id`: integer NOT NULL (FK to `products(id)`)
     - `seller_id`: integer NOT NULL (FK to `users(id)`)
     - `sale_price`: numeric DEFAULT 0 NOT NULL (BR-07 immutable snapshot price)
     - `platform_fee`: numeric DEFAULT 0 NOT NULL
     - `seller_amount`: numeric DEFAULT 0 NOT NULL
     - `tax`: numeric DEFAULT 0 NOT NULL
     - `policy_version`: varchar DEFAULT 'v1' NOT NULL
     - `updated_at`, `created_at`: timestamp(3) with time zone DEFAULT now() NOT NULL
   - `entitlements`:
     - `id`: serial PRIMARY KEY NOT NULL
     - `user_id`: integer NOT NULL (FK to `users(id)`)
     - `product_id`: integer NOT NULL (FK to `products(id)`)
     - `order_id`: integer (FK to `orders(id)`, nullable for free products)
     - `order_item_id`: integer (FK to `order_items(id)`, nullable for free products)
     - `status`: `enum_entitlements_status` (`'active'`, `'revoked'`, `'expired'`) DEFAULT 'active' NOT NULL
     - `granted_at`: timestamp(3) with time zone DEFAULT now() NOT NULL
     - `download_count`: numeric DEFAULT 0 NOT NULL (check `>= 0`)
     - `max_downloads`: numeric (nullable)
     - `expires_at`: timestamp(3) with time zone
     - `revoked_at`: timestamp(3) with time zone
     - `reason`: varchar
     - `updated_at`, `created_at`: timestamp(3) with time zone DEFAULT now() NOT NULL
     - **Partial Unique Index (R2 Invariant)**:
       `CREATE UNIQUE INDEX "entitlements_user_product_active_idx" ON "entitlements" ("user_id", "product_id") WHERE ("status" = 'active');`
       Guarantees at the database engine level that a buyer can hold only ONE active entitlement per product.
   - `download_events`:
     - `id`: serial PRIMARY KEY NOT NULL
     - `user_id`: integer (FK to `users(id)`, nullable for unauthenticated attempts)
     - `product_id`: integer NOT NULL (FK to `products(id)`)
     - `entitlement_id`: integer (FK to `entitlements(id)`, nullable for early denial)
     - `ip_address`: varchar
     - `user_agent`: varchar
     - `downloaded_at`: timestamp(3) with time zone DEFAULT now() NOT NULL
     - `status`: `enum_download_events_status` (`'SUCCESS'`, `'DENIED'`, `'EXPIRED'`, `'FAILED'`) NOT NULL
     - `download_token_hash`: varchar
     - `error_reason`: varchar
     - `updated_at`, `created_at`: timestamp(3) with time zone DEFAULT now() NOT NULL

3. **Invariants & Database Guards (BR-04, BR-07, Decision 0002)**:
   - **BR-04 (Anti-Self-Purchase)**: A PostgreSQL `BEFORE INSERT OR UPDATE` trigger `enforce_br04_seller_anti_self_purchase` on `order_items` checks if `orders.buyer_id == order_items.seller_id` and raises an exception if violated, providing ironclad database-level enforcement in addition to application hooks.
   - **BR-07 (Price Snapshot Immutability)**: Snapshot columns (`sale_price`, `platform_fee`, `seller_amount`, `tax`) are enforced as immutable in `OrderItems` access controls (`update: () => false`).
   - **Non-Negative Constraints**: Check constraints added on `orders.total_amount >= 0`, `order_items.sale_price >= 0`, `order_items.platform_fee >= 0`, `order_items.seller_amount >= 0`, `order_items.tax >= 0`, and `entitlements.download_count >= 0`.

4. **Payload Locked Documents Relations**:
   - `payload_locked_documents_rels` already has `orders_id`. Dropping `orders` cascades the FK constraint, which is recreated.
   - Adds columns `order_items_id`, `entitlements_id`, `download_events_id` with cascading FKs and btree indexes to maintain Payload CMS document lock integrity.

5. **Rollback Symmetry (`down` function)**:
   - Drops all Phase 5 tables, triggers, functions, enums, and `payload_locked_documents_rels` columns.
   - Recreates the exact Batch 1 `orders`, `orders_items`, `orders_rels` tables, enums, and foreign keys.
   - Verified via PostgreSQL transaction rollback testing (`BEGIN ... UP ... DOWN ... ROLLBACK;`) with 0 errors.

---

## 3. Caveats

1. **Payload Collections Must Be Disabled in Ecommerce Plugin**:
   - As identified by `m1_explorer_1`, `web/src/plugins/index.ts` must configure `ecommercePlugin({ orders: false })` so Payload does not auto-inject the legacy template `orders` collection.
2. **Snapshot JSON Generation**:
   - Once `m1_explorer_1` and `m1_explorer_2` register the 4 collections in `payload.config.ts`, `pnpm --prefix web payload migrate:create phase5_purchase_download` will generate the exact snapshot JSON comparing against Batch 5's JSON. The generated `.ts` file should then have its `up` and `down` functions replaced with our verified DDL below.
3. **Foreign Key to Transactions**:
   - `transactions.order_id` references `orders(id)`. When `orders` is recreated, our migration re-attaches `ALTER TABLE "transactions" ADD CONSTRAINT "transactions_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE set null ON UPDATE no action;` ensuring full backward compatibility.

---

## 4. Conclusion & Complete Migration Design

### 4.1 Migration File Details
- **Migration Name**: `20260915_071500_phase5_purchase_download`
- **TypeScript File**: `web/src/migrations/20260915_071500_phase5_purchase_download.ts`
- **Snapshot JSON File**: `web/src/migrations/20260915_071500_phase5_purchase_download.json`
- **Registration in `web/src/migrations/index.ts`**: Import and append to `migrations` array.

### 4.2 Complete TypeScript Implementation (`20260915_071500_phase5_purchase_download.ts`)

```typescript
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
```

### 4.3 Registration in `web/src/migrations/index.ts`

```typescript
import * as migration_20260915_020514_initial from './20260915_020514_initial';
import * as migration_20260915_023701_user_roles_from_plan_5 from './20260915_023701_user_roles_from_plan_5';
import * as migration_20260915_033625_phase2_digital_catalog from './20260915_033625_phase2_digital_catalog';
import * as migration_20260915_062953_phase3_seller_moderation from './20260915_062953_phase3_seller_moderation';
import * as migration_20260915_064708_phase4_payment_wallet from './20260915_064708_phase4_payment_wallet';
import * as migration_20260915_071500_phase5_purchase_download from './20260915_071500_phase5_purchase_download';

export const migrations = [
  {
    up: migration_20260915_020514_initial.up,
    down: migration_20260915_020514_initial.down,
    name: '20260915_020514_initial',
  },
  {
    up: migration_20260915_023701_user_roles_from_plan_5.up,
    down: migration_20260915_023701_user_roles_from_plan_5.down,
    name: '20260915_023701_user_roles_from_plan_5',
  },
  {
    up: migration_20260915_033625_phase2_digital_catalog.up,
    down: migration_20260915_033625_phase2_digital_catalog.down,
    name: '20260915_033625_phase2_digital_catalog',
  },
  {
    up: migration_20260915_062953_phase3_seller_moderation.up,
    down: migration_20260915_062953_phase3_seller_moderation.down,
    name: '20260915_062953_phase3_seller_moderation',
  },
  {
    up: migration_20260915_064708_phase4_payment_wallet.up,
    down: migration_20260915_064708_phase4_payment_wallet.down,
    name: '20260915_064708_phase4_payment_wallet',
  },
  {
    up: migration_20260915_071500_phase5_purchase_download.up,
    down: migration_20260915_071500_phase5_purchase_download.down,
    name: '20260915_071500_phase5_purchase_download',
  },
];
```

---

## 5. Verification Method

To independently verify this migration design:

1. **Syntax & Constraint Verification against PostgreSQL 16**:
   Execute the migration `up` and `down` statements in a transactional test block:
   ```bash
   docker exec -i kientaohub-postgres psql -U payload -d kientaohub << 'EOF'
   BEGIN;
   -- [Paste up SQL]
   -- Verify relations created:
   \d orders
   \d order_items
   \d entitlements
   \d download_events
   -- [Paste down SQL]
   -- Verify relations restored:
   \d orders
   \d orders_items
   ROLLBACK;
   EOF
   ```
   **Verification Result**: Tested directly in the live container and exited with 0 errors.

2. **Check Invariant BR-04 Enforcement via Trigger**:
   Within a transaction:
   ```sql
   INSERT INTO orders (id, code, buyer_id, total_amount, currency, status, payment_source)
   VALUES (9999, 'ORD-TEST', 1, 100000, 'VND', 'COMPLETED', 'wallet');

   -- Attempt to insert order item where seller_id == buyer_id (1)
   INSERT INTO order_items (id, order_id, product_id, seller_id, sale_price, platform_fee, seller_amount, tax)
   VALUES (9999, 9999, 1, 1, 100000, 10000, 90000, 0);
   -- MUST FAIL: 'BR-04 Invariant Violation: Seller (id=1) cannot purchase their own product (product_id=1)'
   ```

3. **Check Invariant R2 Partial Unique Index**:
   Within a transaction:
   ```sql
   INSERT INTO entitlements (user_id, product_id, status) VALUES (1, 1, 'active');
   -- Attempt duplicate active entitlement:
   INSERT INTO entitlements (user_id, product_id, status) VALUES (1, 1, 'active');
   -- MUST FAIL: duplicate key value violates unique constraint "entitlements_user_product_active_idx"

   -- Revoked entitlement coexisting with active:
   UPDATE entitlements SET status = 'revoked' WHERE user_id = 1 AND product_id = 1;
   INSERT INTO entitlements (user_id, product_id, status) VALUES (1, 1, 'active');
   -- MUST SUCCEED (allowed because previous row is revoked).
   ```

4. **Invalidation Conditions**:
   - If Payload collection definitions differ in column names (e.g. `orderItem` vs `order_item_id`).
   - If `ecommercePlugin({ orders: false })` is not set, resulting in conflicting `orders` collection definitions in Payload CMS.
