import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_tickets_messages_sender_role" AS ENUM('buyer', 'seller', 'admin');
  CREATE TYPE "public"."enum_tickets_reason" AS ENUM('FILE_CORRUPTED', 'MISLEADING_CONTENT', 'DOWNLOAD_ERROR', 'BILLING_DISPUTE', 'OTHER');
  CREATE TYPE "public"."enum_tickets_status" AS ENUM('OPEN', 'IN_PROGRESS', 'WAITING_USER', 'RESOLVED', 'CLOSED');
  CREATE TYPE "public"."enum_tickets_priority" AS ENUM('LOW', 'NORMAL', 'HIGH', 'URGENT');
  CREATE TYPE "public"."enum_tickets_resolution" AS ENUM('EXPLAINED', 'FIX_PROVIDED', 'REFUNDED', 'REJECTED');
  CREATE TABLE "tickets_messages" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"sender_id" integer NOT NULL,
  	"sender_role" "enum_tickets_messages_sender_role" NOT NULL,
  	"message" varchar NOT NULL,
  	"created_at" timestamp(3) with time zone
  );
  
  CREATE TABLE "tickets" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"code" varchar NOT NULL,
  	"user_id" integer NOT NULL,
  	"seller_id" integer,
  	"order_id" integer,
  	"product_id" integer,
  	"reason" "enum_tickets_reason" NOT NULL,
  	"subject" varchar NOT NULL,
  	"description" varchar NOT NULL,
  	"status" "enum_tickets_status" DEFAULT 'OPEN' NOT NULL,
  	"priority" "enum_tickets_priority" DEFAULT 'NORMAL' NOT NULL,
  	"resolution" "enum_tickets_resolution",
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "tickets_id" integer;
  ALTER TABLE "tickets_messages" ADD CONSTRAINT "tickets_messages_sender_id_users_id_fk" FOREIGN KEY ("sender_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "tickets_messages" ADD CONSTRAINT "tickets_messages_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."tickets"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "tickets" ADD CONSTRAINT "tickets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "tickets" ADD CONSTRAINT "tickets_seller_id_users_id_fk" FOREIGN KEY ("seller_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "tickets" ADD CONSTRAINT "tickets_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "tickets" ADD CONSTRAINT "tickets_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "tickets_messages_order_idx" ON "tickets_messages" USING btree ("_order");
  CREATE INDEX "tickets_messages_parent_id_idx" ON "tickets_messages" USING btree ("_parent_id");
  CREATE INDEX "tickets_messages_sender_idx" ON "tickets_messages" USING btree ("sender_id");
  CREATE UNIQUE INDEX "tickets_code_idx" ON "tickets" USING btree ("code");
  CREATE INDEX "tickets_user_idx" ON "tickets" USING btree ("user_id");
  CREATE INDEX "tickets_seller_idx" ON "tickets" USING btree ("seller_id");
  CREATE INDEX "tickets_order_idx" ON "tickets" USING btree ("order_id");
  CREATE INDEX "tickets_product_idx" ON "tickets" USING btree ("product_id");
  CREATE INDEX "tickets_status_idx" ON "tickets" USING btree ("status");
  CREATE INDEX "tickets_updated_at_idx" ON "tickets" USING btree ("updated_at");
  CREATE INDEX "tickets_created_at_idx" ON "tickets" USING btree ("created_at");
  CREATE INDEX "tickets_user_status_idx" ON "tickets" USING btree ("user_id", "status");
  CREATE INDEX "tickets_seller_status_idx" ON "tickets" USING btree ("seller_id", "status");
  CREATE INDEX "tickets_order_user_idx" ON "tickets" USING btree ("order_id", "user_id");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_tickets_fk" FOREIGN KEY ("tickets_id") REFERENCES "public"."tickets"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_tickets_id_idx" ON "payload_locked_documents_rels" USING btree ("tickets_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "tickets_messages" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "tickets" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "tickets_messages" CASCADE;
  DROP TABLE "tickets" CASCADE;
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_tickets_fk";
  
  DROP INDEX "payload_locked_documents_rels_tickets_id_idx";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "tickets_id";
  DROP TYPE "public"."enum_tickets_messages_sender_role";
  DROP TYPE "public"."enum_tickets_reason";
  DROP TYPE "public"."enum_tickets_status";
  DROP TYPE "public"."enum_tickets_priority";
  DROP TYPE "public"."enum_tickets_resolution";`)
}
