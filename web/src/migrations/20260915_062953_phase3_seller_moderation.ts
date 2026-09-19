import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_product_files_virus_scan_status" AS ENUM('pending', 'clean', 'quarantined');
  CREATE TYPE "public"."enum_product_files_status" AS ENUM('UPLOADING', 'PROCESSING', 'READY', 'FAILED', 'QUARANTINED');
  CREATE TYPE "public"."enum_products_moderation_history_action" AS ENUM('submitted', 'in_review', 'changes_requested', 'approved', 'rejected');
  CREATE TYPE "public"."enum_products_moderation_status" AS ENUM('draft', 'submitted', 'in_review', 'changes_requested', 'approved', 'rejected');
  CREATE TYPE "public"."enum__products_v_version_moderation_history_action" AS ENUM('submitted', 'in_review', 'changes_requested', 'approved', 'rejected');
  CREATE TYPE "public"."enum__products_v_version_moderation_status" AS ENUM('draft', 'submitted', 'in_review', 'changes_requested', 'approved', 'rejected');
  CREATE TYPE "public"."enum_seller_profiles_status" AS ENUM('pending', 'active', 'suspended', 'rejected');
  CREATE TABLE "product_files" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"seller_id" integer NOT NULL,
  	"original_filename" varchar,
  	"file_format" varchar,
  	"checksum" varchar,
  	"file_size" numeric,
  	"virus_scan_status" "enum_product_files_virus_scan_status" DEFAULT 'clean',
  	"status" "enum_product_files_status" DEFAULT 'READY',
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"url" varchar,
  	"thumbnail_u_r_l" varchar,
  	"filename" varchar,
  	"mime_type" varchar,
  	"filesize" numeric,
  	"width" numeric,
  	"height" numeric,
  	"focal_x" numeric,
  	"focal_y" numeric
  );
  
  CREATE TABLE "products_moderation_history" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"reviewer_id" integer,
  	"action" "enum_products_moderation_history_action",
  	"note" varchar,
  	"timestamp" timestamp(3) with time zone
  );
  
  CREATE TABLE "_products_v_version_moderation_history" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"reviewer_id" integer,
  	"action" "enum__products_v_version_moderation_history_action",
  	"note" varchar,
  	"timestamp" timestamp(3) with time zone,
  	"_uuid" varchar
  );
  
  CREATE TABLE "seller_profiles" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"user_id" integer NOT NULL,
  	"display_name" varchar NOT NULL,
  	"bio" varchar,
  	"avatar_id" integer,
  	"phone" varchar,
  	"payout_info_bank_name" varchar,
  	"payout_info_account_number" varchar,
  	"payout_info_account_holder_name" varchar,
  	"seller_terms_accepted" boolean DEFAULT false NOT NULL,
  	"seller_terms_accepted_at" timestamp(3) with time zone,
  	"status" "enum_seller_profiles_status" DEFAULT 'active',
  	"total_sales" numeric DEFAULT 0,
  	"rating" numeric DEFAULT 5,
  	"generate_slug" boolean DEFAULT true,
  	"slug" varchar NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "products" ADD COLUMN "seller_id" integer;
  ALTER TABLE "products" ADD COLUMN "moderation_status" "enum_products_moderation_status" DEFAULT 'draft';
  ALTER TABLE "products" ADD COLUMN "moderation_notes" varchar;
  ALTER TABLE "products" ADD COLUMN "copyright_declared" boolean DEFAULT false;
  ALTER TABLE "products_rels" ADD COLUMN "product_files_id" integer;
  ALTER TABLE "_products_v" ADD COLUMN "version_seller_id" integer;
  ALTER TABLE "_products_v" ADD COLUMN "version_moderation_status" "enum__products_v_version_moderation_status" DEFAULT 'draft';
  ALTER TABLE "_products_v" ADD COLUMN "version_moderation_notes" varchar;
  ALTER TABLE "_products_v" ADD COLUMN "version_copyright_declared" boolean DEFAULT false;
  ALTER TABLE "_products_v_rels" ADD COLUMN "product_files_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "product_files_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "seller_profiles_id" integer;
  ALTER TABLE "product_files" ADD CONSTRAINT "product_files_seller_id_users_id_fk" FOREIGN KEY ("seller_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "products_moderation_history" ADD CONSTRAINT "products_moderation_history_reviewer_id_users_id_fk" FOREIGN KEY ("reviewer_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "products_moderation_history" ADD CONSTRAINT "products_moderation_history_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_products_v_version_moderation_history" ADD CONSTRAINT "_products_v_version_moderation_history_reviewer_id_users_id_fk" FOREIGN KEY ("reviewer_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_products_v_version_moderation_history" ADD CONSTRAINT "_products_v_version_moderation_history_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_products_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "seller_profiles" ADD CONSTRAINT "seller_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "seller_profiles" ADD CONSTRAINT "seller_profiles_avatar_id_media_id_fk" FOREIGN KEY ("avatar_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "product_files_seller_idx" ON "product_files" USING btree ("seller_id");
  CREATE INDEX "product_files_updated_at_idx" ON "product_files" USING btree ("updated_at");
  CREATE INDEX "product_files_created_at_idx" ON "product_files" USING btree ("created_at");
  CREATE UNIQUE INDEX "product_files_filename_idx" ON "product_files" USING btree ("filename");
  CREATE INDEX "products_moderation_history_order_idx" ON "products_moderation_history" USING btree ("_order");
  CREATE INDEX "products_moderation_history_parent_id_idx" ON "products_moderation_history" USING btree ("_parent_id");
  CREATE INDEX "products_moderation_history_reviewer_idx" ON "products_moderation_history" USING btree ("reviewer_id");
  CREATE INDEX "_products_v_version_moderation_history_order_idx" ON "_products_v_version_moderation_history" USING btree ("_order");
  CREATE INDEX "_products_v_version_moderation_history_parent_id_idx" ON "_products_v_version_moderation_history" USING btree ("_parent_id");
  CREATE INDEX "_products_v_version_moderation_history_reviewer_idx" ON "_products_v_version_moderation_history" USING btree ("reviewer_id");
  CREATE UNIQUE INDEX "seller_profiles_user_idx" ON "seller_profiles" USING btree ("user_id");
  CREATE INDEX "seller_profiles_avatar_idx" ON "seller_profiles" USING btree ("avatar_id");
  CREATE UNIQUE INDEX "seller_profiles_slug_idx" ON "seller_profiles" USING btree ("slug");
  CREATE INDEX "seller_profiles_updated_at_idx" ON "seller_profiles" USING btree ("updated_at");
  CREATE INDEX "seller_profiles_created_at_idx" ON "seller_profiles" USING btree ("created_at");
  ALTER TABLE "products" ADD CONSTRAINT "products_seller_id_users_id_fk" FOREIGN KEY ("seller_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "products_rels" ADD CONSTRAINT "products_rels_product_files_fk" FOREIGN KEY ("product_files_id") REFERENCES "public"."product_files"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_products_v" ADD CONSTRAINT "_products_v_version_seller_id_users_id_fk" FOREIGN KEY ("version_seller_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_products_v_rels" ADD CONSTRAINT "_products_v_rels_product_files_fk" FOREIGN KEY ("product_files_id") REFERENCES "public"."product_files"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_product_files_fk" FOREIGN KEY ("product_files_id") REFERENCES "public"."product_files"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_seller_profiles_fk" FOREIGN KEY ("seller_profiles_id") REFERENCES "public"."seller_profiles"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "products_seller_idx" ON "products" USING btree ("seller_id");
  CREATE INDEX "products_rels_product_files_id_idx" ON "products_rels" USING btree ("product_files_id");
  CREATE INDEX "_products_v_version_version_seller_idx" ON "_products_v" USING btree ("version_seller_id");
  CREATE INDEX "_products_v_rels_product_files_id_idx" ON "_products_v_rels" USING btree ("product_files_id");
  CREATE INDEX "payload_locked_documents_rels_product_files_id_idx" ON "payload_locked_documents_rels" USING btree ("product_files_id");
  CREATE INDEX "payload_locked_documents_rels_seller_profiles_id_idx" ON "payload_locked_documents_rels" USING btree ("seller_profiles_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE IF EXISTS "product_files" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE IF EXISTS "products_moderation_history" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE IF EXISTS "_products_v_version_moderation_history" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE IF EXISTS "seller_profiles" DISABLE ROW LEVEL SECURITY;
  DROP TABLE IF EXISTS "product_files" CASCADE;
  DROP TABLE IF EXISTS "products_moderation_history" CASCADE;
  DROP TABLE IF EXISTS "_products_v_version_moderation_history" CASCADE;
  DROP TABLE IF EXISTS "seller_profiles" CASCADE;
  ALTER TABLE IF EXISTS "products" DROP CONSTRAINT IF EXISTS "products_seller_id_users_id_fk";
  
  ALTER TABLE IF EXISTS "products_rels" DROP CONSTRAINT IF EXISTS "products_rels_product_files_fk";
  
  ALTER TABLE IF EXISTS "_products_v" DROP CONSTRAINT IF EXISTS "_products_v_version_seller_id_users_id_fk";
  
  ALTER TABLE IF EXISTS "_products_v_rels" DROP CONSTRAINT IF EXISTS "_products_v_rels_product_files_fk";
  
  ALTER TABLE IF EXISTS "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_product_files_fk";
  
  ALTER TABLE IF EXISTS "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_seller_profiles_fk";
  
  DROP INDEX IF EXISTS "products_seller_idx";
  DROP INDEX IF EXISTS "products_rels_product_files_id_idx";
  DROP INDEX IF EXISTS "_products_v_version_version_seller_idx";
  DROP INDEX IF EXISTS "_products_v_rels_product_files_id_idx";
  DROP INDEX IF EXISTS "payload_locked_documents_rels_product_files_id_idx";
  DROP INDEX IF EXISTS "payload_locked_documents_rels_seller_profiles_id_idx";
  ALTER TABLE IF EXISTS "products" DROP COLUMN IF EXISTS "seller_id";
  ALTER TABLE IF EXISTS "products" DROP COLUMN IF EXISTS "moderation_status";
  ALTER TABLE IF EXISTS "products" DROP COLUMN IF EXISTS "moderation_notes";
  ALTER TABLE IF EXISTS "products" DROP COLUMN IF EXISTS "copyright_declared";
  ALTER TABLE IF EXISTS "products_rels" DROP COLUMN IF EXISTS "product_files_id";
  ALTER TABLE IF EXISTS "_products_v" DROP COLUMN IF EXISTS "version_seller_id";
  ALTER TABLE IF EXISTS "_products_v" DROP COLUMN IF EXISTS "version_moderation_status";
  ALTER TABLE IF EXISTS "_products_v" DROP COLUMN IF EXISTS "version_moderation_notes";
  ALTER TABLE IF EXISTS "_products_v" DROP COLUMN IF EXISTS "version_copyright_declared";
  ALTER TABLE IF EXISTS "_products_v_rels" DROP COLUMN IF EXISTS "product_files_id";
  ALTER TABLE IF EXISTS "payload_locked_documents_rels" DROP COLUMN IF EXISTS "product_files_id";
  ALTER TABLE IF EXISTS "payload_locked_documents_rels" DROP COLUMN IF EXISTS "seller_profiles_id";
  DROP TYPE IF EXISTS "public"."enum_product_files_virus_scan_status";
  DROP TYPE IF EXISTS "public"."enum_product_files_status";
  DROP TYPE IF EXISTS "public"."enum_products_moderation_history_action";
  DROP TYPE IF EXISTS "public"."enum_products_moderation_status";
  DROP TYPE IF EXISTS "public"."enum__products_v_version_moderation_history_action";
  DROP TYPE IF EXISTS "public"."enum__products_v_version_moderation_status";
  DROP TYPE IF EXISTS "public"."enum_seller_profiles_status";`)
}
