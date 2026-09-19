import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_categories_status" AS ENUM('active', 'archived');
  CREATE TYPE "public"."enum_product_previews_preview_type" AS ENUM('image', 'pdf', 'model_viewer');
  CREATE TYPE "public"."enum_products_technical_specs_unit" AS ENUM('metric', 'imperial', 'other');
  CREATE TYPE "public"."enum__products_v_version_technical_specs_unit" AS ENUM('metric', 'imperial', 'other');
  CREATE TABLE "software_types" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"title" varchar NOT NULL,
  	"generate_slug" boolean DEFAULT true,
  	"slug" varchar NOT NULL,
  	"icon_id" integer,
  	"description" varchar,
  	"sort_order" numeric DEFAULT 0,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "software_types_texts" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer NOT NULL,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"text" varchar
  );
  
  CREATE TABLE "tags" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"title" varchar NOT NULL,
  	"generate_slug" boolean DEFAULT true,
  	"slug" varchar NOT NULL,
  	"description" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "product_previews" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"title" varchar NOT NULL,
  	"preview_image_id" integer NOT NULL,
  	"preview_type" "enum_product_previews_preview_type" DEFAULT 'image' NOT NULL,
  	"is_watermarked" boolean DEFAULT true,
  	"caption" varchar,
  	"sort_order" numeric DEFAULT 0,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "variants" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "variants_rels" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "_variants_v" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "_variants_v_rels" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "variant_types" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "variant_options" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "carts_items" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "carts" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "variants" CASCADE;
  DROP TABLE "variants_rels" CASCADE;
  DROP TABLE "_variants_v" CASCADE;
  DROP TABLE "_variants_v_rels" CASCADE;
  DROP TABLE "variant_types" CASCADE;
  DROP TABLE "variant_options" CASCADE;
  DROP TABLE "carts_items" CASCADE;
  DROP TABLE "carts" CASCADE;
  ALTER TABLE "products_gallery" DROP CONSTRAINT IF EXISTS "products_gallery_variant_option_id_variant_options_id_fk";
  
  ALTER TABLE "products_rels" DROP CONSTRAINT IF EXISTS "products_rels_variant_types_fk";
  
  ALTER TABLE "_products_v_version_gallery" DROP CONSTRAINT IF EXISTS "_products_v_version_gallery_variant_option_id_variant_options_id_fk";
  
  ALTER TABLE "_products_v_rels" DROP CONSTRAINT IF EXISTS "_products_v_rels_variant_types_fk";
  
  ALTER TABLE "orders_items" DROP CONSTRAINT IF EXISTS "orders_items_variant_id_variants_id_fk";
  
  ALTER TABLE "transactions_items" DROP CONSTRAINT IF EXISTS "transactions_items_variant_id_variants_id_fk";
  
  ALTER TABLE "transactions" DROP CONSTRAINT IF EXISTS "transactions_cart_id_carts_id_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_variants_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_variant_types_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_variant_options_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_carts_fk";
  
  DROP INDEX IF EXISTS "products_gallery_variant_option_idx";
  DROP INDEX IF EXISTS "products_deleted_at_idx";
  DROP INDEX IF EXISTS "products_rels_variant_types_id_idx";
  DROP INDEX IF EXISTS "_products_v_version_gallery_variant_option_idx";
  DROP INDEX IF EXISTS "_products_v_version_version_deleted_at_idx";
  DROP INDEX IF EXISTS "_products_v_rels_variant_types_id_idx";
  DROP INDEX IF EXISTS "orders_items_variant_idx";
  DROP INDEX IF EXISTS "transactions_items_variant_idx";
  DROP INDEX IF EXISTS "transactions_cart_idx";
  DROP INDEX IF EXISTS "payload_locked_documents_rels_variants_id_idx";
  DROP INDEX IF EXISTS "payload_locked_documents_rels_variant_types_id_idx";
  DROP INDEX IF EXISTS "payload_locked_documents_rels_variant_options_id_idx";
  DROP INDEX IF EXISTS "payload_locked_documents_rels_carts_id_idx";
  ALTER TABLE "categories" ADD COLUMN "description" varchar;
  ALTER TABLE "categories" ADD COLUMN "parent_id" integer;
  ALTER TABLE "categories" ADD COLUMN "icon_id" integer;
  ALTER TABLE "categories" ADD COLUMN "image_id" integer;
  ALTER TABLE "categories" ADD COLUMN "sort_order" numeric DEFAULT 0;
  ALTER TABLE "categories" ADD COLUMN "status" "enum_categories_status" DEFAULT 'active';
  ALTER TABLE "categories" ADD COLUMN "meta_title" varchar;
  ALTER TABLE "categories" ADD COLUMN "meta_image_id" integer;
  ALTER TABLE "categories" ADD COLUMN "meta_description" varchar;
  ALTER TABLE "products_gallery" ADD COLUMN "caption" varchar;
  ALTER TABLE "products" ADD COLUMN "price" numeric DEFAULT 0;
  ALTER TABLE "products" ADD COLUMN "is_free" boolean DEFAULT false;
  ALTER TABLE "products" ADD COLUMN "technical_specs_file_format" varchar;
  ALTER TABLE "products" ADD COLUMN "technical_specs_software_version" varchar;
  ALTER TABLE "products" ADD COLUMN "technical_specs_file_size" varchar;
  ALTER TABLE "products" ADD COLUMN "technical_specs_unit" "enum_products_technical_specs_unit" DEFAULT 'metric';
  ALTER TABLE "products_rels" ADD COLUMN "product_previews_id" integer;
  ALTER TABLE "products_rels" ADD COLUMN "software_types_id" integer;
  ALTER TABLE "products_rels" ADD COLUMN "tags_id" integer;
  ALTER TABLE "_products_v_version_gallery" ADD COLUMN "caption" varchar;
  ALTER TABLE "_products_v" ADD COLUMN "version_price" numeric DEFAULT 0;
  ALTER TABLE "_products_v" ADD COLUMN "version_is_free" boolean DEFAULT false;
  ALTER TABLE "_products_v" ADD COLUMN "version_technical_specs_file_format" varchar;
  ALTER TABLE "_products_v" ADD COLUMN "version_technical_specs_software_version" varchar;
  ALTER TABLE "_products_v" ADD COLUMN "version_technical_specs_file_size" varchar;
  ALTER TABLE "_products_v" ADD COLUMN "version_technical_specs_unit" "enum__products_v_version_technical_specs_unit" DEFAULT 'metric';
  ALTER TABLE "_products_v_rels" ADD COLUMN "product_previews_id" integer;
  ALTER TABLE "_products_v_rels" ADD COLUMN "software_types_id" integer;
  ALTER TABLE "_products_v_rels" ADD COLUMN "tags_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "software_types_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "tags_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "product_previews_id" integer;
  ALTER TABLE "software_types" ADD CONSTRAINT "software_types_icon_id_media_id_fk" FOREIGN KEY ("icon_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "software_types_texts" ADD CONSTRAINT "software_types_texts_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."software_types"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "product_previews" ADD CONSTRAINT "product_previews_preview_image_id_media_id_fk" FOREIGN KEY ("preview_image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  CREATE UNIQUE INDEX "software_types_slug_idx" ON "software_types" USING btree ("slug");
  CREATE INDEX "software_types_icon_idx" ON "software_types" USING btree ("icon_id");
  CREATE INDEX "software_types_updated_at_idx" ON "software_types" USING btree ("updated_at");
  CREATE INDEX "software_types_created_at_idx" ON "software_types" USING btree ("created_at");
  CREATE INDEX "software_types_texts_order_parent" ON "software_types_texts" USING btree ("order","parent_id");
  CREATE UNIQUE INDEX "tags_slug_idx" ON "tags" USING btree ("slug");
  CREATE INDEX "tags_updated_at_idx" ON "tags" USING btree ("updated_at");
  CREATE INDEX "tags_created_at_idx" ON "tags" USING btree ("created_at");
  CREATE INDEX "product_previews_preview_image_idx" ON "product_previews" USING btree ("preview_image_id");
  CREATE INDEX "product_previews_updated_at_idx" ON "product_previews" USING btree ("updated_at");
  CREATE INDEX "product_previews_created_at_idx" ON "product_previews" USING btree ("created_at");
  ALTER TABLE "categories" ADD CONSTRAINT "categories_parent_id_categories_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."categories"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "categories" ADD CONSTRAINT "categories_icon_id_media_id_fk" FOREIGN KEY ("icon_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "categories" ADD CONSTRAINT "categories_image_id_media_id_fk" FOREIGN KEY ("image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "categories" ADD CONSTRAINT "categories_meta_image_id_media_id_fk" FOREIGN KEY ("meta_image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "products_rels" ADD CONSTRAINT "products_rels_product_previews_fk" FOREIGN KEY ("product_previews_id") REFERENCES "public"."product_previews"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "products_rels" ADD CONSTRAINT "products_rels_software_types_fk" FOREIGN KEY ("software_types_id") REFERENCES "public"."software_types"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "products_rels" ADD CONSTRAINT "products_rels_tags_fk" FOREIGN KEY ("tags_id") REFERENCES "public"."tags"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_products_v_rels" ADD CONSTRAINT "_products_v_rels_product_previews_fk" FOREIGN KEY ("product_previews_id") REFERENCES "public"."product_previews"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_products_v_rels" ADD CONSTRAINT "_products_v_rels_software_types_fk" FOREIGN KEY ("software_types_id") REFERENCES "public"."software_types"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_products_v_rels" ADD CONSTRAINT "_products_v_rels_tags_fk" FOREIGN KEY ("tags_id") REFERENCES "public"."tags"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_software_types_fk" FOREIGN KEY ("software_types_id") REFERENCES "public"."software_types"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_tags_fk" FOREIGN KEY ("tags_id") REFERENCES "public"."tags"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_product_previews_fk" FOREIGN KEY ("product_previews_id") REFERENCES "public"."product_previews"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "categories_parent_idx" ON "categories" USING btree ("parent_id");
  CREATE INDEX "categories_icon_idx" ON "categories" USING btree ("icon_id");
  CREATE INDEX "categories_image_idx" ON "categories" USING btree ("image_id");
  CREATE INDEX "categories_meta_meta_image_idx" ON "categories" USING btree ("meta_image_id");
  CREATE INDEX "products_rels_product_previews_id_idx" ON "products_rels" USING btree ("product_previews_id");
  CREATE INDEX "products_rels_software_types_id_idx" ON "products_rels" USING btree ("software_types_id");
  CREATE INDEX "products_rels_tags_id_idx" ON "products_rels" USING btree ("tags_id");
  CREATE INDEX "_products_v_rels_product_previews_id_idx" ON "_products_v_rels" USING btree ("product_previews_id");
  CREATE INDEX "_products_v_rels_software_types_id_idx" ON "_products_v_rels" USING btree ("software_types_id");
  CREATE INDEX "_products_v_rels_tags_id_idx" ON "_products_v_rels" USING btree ("tags_id");
  CREATE INDEX "payload_locked_documents_rels_software_types_id_idx" ON "payload_locked_documents_rels" USING btree ("software_types_id");
  CREATE INDEX "payload_locked_documents_rels_tags_id_idx" ON "payload_locked_documents_rels" USING btree ("tags_id");
  CREATE INDEX "payload_locked_documents_rels_product_previews_id_idx" ON "payload_locked_documents_rels" USING btree ("product_previews_id");
  ALTER TABLE "products_gallery" DROP COLUMN "variant_option_id";
  ALTER TABLE "products" DROP COLUMN "inventory";
  ALTER TABLE "products" DROP COLUMN "enable_variants";
  ALTER TABLE "products" DROP COLUMN "price_in_u_s_d_enabled";
  ALTER TABLE "products" DROP COLUMN "price_in_u_s_d";
  ALTER TABLE "products" DROP COLUMN "deleted_at";
  ALTER TABLE "products_rels" DROP COLUMN "variant_types_id";
  ALTER TABLE "_products_v_version_gallery" DROP COLUMN "variant_option_id";
  ALTER TABLE "_products_v" DROP COLUMN "version_inventory";
  ALTER TABLE "_products_v" DROP COLUMN "version_enable_variants";
  ALTER TABLE "_products_v" DROP COLUMN "version_price_in_u_s_d_enabled";
  ALTER TABLE "_products_v" DROP COLUMN "version_price_in_u_s_d";
  ALTER TABLE "_products_v" DROP COLUMN "version_deleted_at";
  ALTER TABLE "_products_v_rels" DROP COLUMN "variant_types_id";
  ALTER TABLE "orders_items" DROP COLUMN "variant_id";
  ALTER TABLE "transactions_items" DROP COLUMN "variant_id";
  ALTER TABLE "transactions" DROP COLUMN "cart_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "variants_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "variant_types_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "variant_options_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "carts_id";
  DROP TYPE IF EXISTS "public"."enum_variants_status";
  DROP TYPE IF EXISTS "public"."enum__variants_v_version_status";
  DROP TYPE IF EXISTS "public"."enum_carts_currency";`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_variants_status" AS ENUM('draft', 'published');
  CREATE TYPE "public"."enum__variants_v_version_status" AS ENUM('draft', 'published');
  CREATE TYPE "public"."enum_carts_currency" AS ENUM('USD');
  CREATE TABLE "variants" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"title" varchar,
  	"product_id" integer,
  	"inventory" numeric DEFAULT 0,
  	"price_in_u_s_d_enabled" boolean,
  	"price_in_u_s_d" numeric,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"deleted_at" timestamp(3) with time zone,
  	"_status" "enum_variants_status" DEFAULT 'draft'
  );
  
  CREATE TABLE "variants_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"variant_options_id" integer
  );
  
  CREATE TABLE "_variants_v" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"parent_id" integer,
  	"version_title" varchar,
  	"version_product_id" integer,
  	"version_inventory" numeric DEFAULT 0,
  	"version_price_in_u_s_d_enabled" boolean,
  	"version_price_in_u_s_d" numeric,
  	"version_updated_at" timestamp(3) with time zone,
  	"version_created_at" timestamp(3) with time zone,
  	"version_deleted_at" timestamp(3) with time zone,
  	"version__status" "enum__variants_v_version_status" DEFAULT 'draft',
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"latest" boolean,
  	"autosave" boolean
  );
  
  CREATE TABLE "_variants_v_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"variant_options_id" integer
  );
  
  CREATE TABLE "variant_types" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"label" varchar NOT NULL,
  	"name" varchar NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"deleted_at" timestamp(3) with time zone
  );
  
  CREATE TABLE "variant_options" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"_variantoptions_options_order" varchar,
  	"variant_type_id" integer NOT NULL,
  	"label" varchar NOT NULL,
  	"value" varchar NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"deleted_at" timestamp(3) with time zone
  );
  
  CREATE TABLE "carts_items" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"product_id" integer,
  	"variant_id" integer,
  	"quantity" numeric DEFAULT 1 NOT NULL
  );
  
  CREATE TABLE "carts" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"secret" varchar,
  	"customer_id" integer,
  	"purchased_at" timestamp(3) with time zone,
  	"subtotal" numeric,
  	"currency" "enum_carts_currency" DEFAULT 'USD',
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE IF EXISTS "software_types" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE IF EXISTS "software_types_texts" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE IF EXISTS "tags" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE IF EXISTS "product_previews" DISABLE ROW LEVEL SECURITY;
  DROP TABLE IF EXISTS "software_types" CASCADE;
  DROP TABLE IF EXISTS "software_types_texts" CASCADE;
  DROP TABLE IF EXISTS "tags" CASCADE;
  DROP TABLE IF EXISTS "product_previews" CASCADE;
  ALTER TABLE IF EXISTS "categories" DROP CONSTRAINT IF EXISTS "categories_parent_id_categories_id_fk";
  
  ALTER TABLE IF EXISTS "categories" DROP CONSTRAINT IF EXISTS "categories_icon_id_media_id_fk";
  
  ALTER TABLE IF EXISTS "categories" DROP CONSTRAINT IF EXISTS "categories_image_id_media_id_fk";
  
  ALTER TABLE IF EXISTS "categories" DROP CONSTRAINT IF EXISTS "categories_meta_image_id_media_id_fk";
  
  ALTER TABLE IF EXISTS "products_rels" DROP CONSTRAINT IF EXISTS "products_rels_product_previews_fk";
  
  ALTER TABLE IF EXISTS "products_rels" DROP CONSTRAINT IF EXISTS "products_rels_software_types_fk";
  
  ALTER TABLE IF EXISTS "products_rels" DROP CONSTRAINT IF EXISTS "products_rels_tags_fk";
  
  ALTER TABLE IF EXISTS "_products_v_rels" DROP CONSTRAINT IF EXISTS "_products_v_rels_product_previews_fk";
  
  ALTER TABLE IF EXISTS "_products_v_rels" DROP CONSTRAINT IF EXISTS "_products_v_rels_software_types_fk";
  
  ALTER TABLE IF EXISTS "_products_v_rels" DROP CONSTRAINT IF EXISTS "_products_v_rels_tags_fk";
  
  ALTER TABLE IF EXISTS "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_software_types_fk";
  
  ALTER TABLE IF EXISTS "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_tags_fk";
  
  ALTER TABLE IF EXISTS "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_product_previews_fk";
  
  DROP INDEX IF EXISTS "categories_parent_idx";
  DROP INDEX IF EXISTS "categories_icon_idx";
  DROP INDEX IF EXISTS "categories_image_idx";
  DROP INDEX IF EXISTS "categories_meta_meta_image_idx";
  DROP INDEX IF EXISTS "products_rels_product_previews_id_idx";
  DROP INDEX IF EXISTS "products_rels_software_types_id_idx";
  DROP INDEX IF EXISTS "products_rels_tags_id_idx";
  DROP INDEX IF EXISTS "_products_v_rels_product_previews_id_idx";
  DROP INDEX IF EXISTS "_products_v_rels_software_types_id_idx";
  DROP INDEX IF EXISTS "_products_v_rels_tags_id_idx";
  DROP INDEX IF EXISTS "payload_locked_documents_rels_software_types_id_idx";
  DROP INDEX IF EXISTS "payload_locked_documents_rels_tags_id_idx";
  DROP INDEX IF EXISTS "payload_locked_documents_rels_product_previews_id_idx";
  ALTER TABLE IF EXISTS "products_gallery" ADD COLUMN "variant_option_id" integer;
  ALTER TABLE IF EXISTS "products" ADD COLUMN "inventory" numeric DEFAULT 0;
  ALTER TABLE IF EXISTS "products" ADD COLUMN "enable_variants" boolean;
  ALTER TABLE IF EXISTS "products" ADD COLUMN "price_in_u_s_d_enabled" boolean;
  ALTER TABLE IF EXISTS "products" ADD COLUMN "price_in_u_s_d" numeric;
  ALTER TABLE IF EXISTS "products" ADD COLUMN "deleted_at" timestamp(3) with time zone;
  ALTER TABLE IF EXISTS "products_rels" ADD COLUMN "variant_types_id" integer;
  ALTER TABLE IF EXISTS "_products_v_version_gallery" ADD COLUMN "variant_option_id" integer;
  ALTER TABLE IF EXISTS "_products_v" ADD COLUMN "version_inventory" numeric DEFAULT 0;
  ALTER TABLE IF EXISTS "_products_v" ADD COLUMN "version_enable_variants" boolean;
  ALTER TABLE IF EXISTS "_products_v" ADD COLUMN "version_price_in_u_s_d_enabled" boolean;
  ALTER TABLE IF EXISTS "_products_v" ADD COLUMN "version_price_in_u_s_d" numeric;
  ALTER TABLE IF EXISTS "_products_v" ADD COLUMN "version_deleted_at" timestamp(3) with time zone;
  ALTER TABLE IF EXISTS "_products_v_rels" ADD COLUMN "variant_types_id" integer;
  ALTER TABLE IF EXISTS "orders_items" ADD COLUMN "variant_id" integer;
  ALTER TABLE IF EXISTS "transactions_items" ADD COLUMN "variant_id" integer;
  ALTER TABLE IF EXISTS "transactions" ADD COLUMN "cart_id" integer;
  ALTER TABLE IF EXISTS "payload_locked_documents_rels" ADD COLUMN "variants_id" integer;
  ALTER TABLE IF EXISTS "payload_locked_documents_rels" ADD COLUMN "variant_types_id" integer;
  ALTER TABLE IF EXISTS "payload_locked_documents_rels" ADD COLUMN "variant_options_id" integer;
  ALTER TABLE IF EXISTS "payload_locked_documents_rels" ADD COLUMN "carts_id" integer;
  ALTER TABLE IF EXISTS "variants" ADD CONSTRAINT "variants_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE IF EXISTS "variants_rels" ADD CONSTRAINT "variants_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."variants"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE IF EXISTS "variants_rels" ADD CONSTRAINT "variants_rels_variant_options_fk" FOREIGN KEY ("variant_options_id") REFERENCES "public"."variant_options"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE IF EXISTS "_variants_v" ADD CONSTRAINT "_variants_v_parent_id_variants_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."variants"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE IF EXISTS "_variants_v" ADD CONSTRAINT "_variants_v_version_product_id_products_id_fk" FOREIGN KEY ("version_product_id") REFERENCES "public"."products"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE IF EXISTS "_variants_v_rels" ADD CONSTRAINT "_variants_v_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."_variants_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE IF EXISTS "_variants_v_rels" ADD CONSTRAINT "_variants_v_rels_variant_options_fk" FOREIGN KEY ("variant_options_id") REFERENCES "public"."variant_options"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE IF EXISTS "variant_options" ADD CONSTRAINT "variant_options_variant_type_id_variant_types_id_fk" FOREIGN KEY ("variant_type_id") REFERENCES "public"."variant_types"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE IF EXISTS "carts_items" ADD CONSTRAINT "carts_items_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE IF EXISTS "carts_items" ADD CONSTRAINT "carts_items_variant_id_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."variants"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE IF EXISTS "carts_items" ADD CONSTRAINT "carts_items_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."carts"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE IF EXISTS "carts" ADD CONSTRAINT "carts_customer_id_users_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "variants_product_idx" ON "variants" USING btree ("product_id");
  CREATE INDEX "variants_updated_at_idx" ON "variants" USING btree ("updated_at");
  CREATE INDEX "variants_created_at_idx" ON "variants" USING btree ("created_at");
  CREATE INDEX "variants_deleted_at_idx" ON "variants" USING btree ("deleted_at");
  CREATE INDEX "variants__status_idx" ON "variants" USING btree ("_status");
  CREATE INDEX "variants_rels_order_idx" ON "variants_rels" USING btree ("order");
  CREATE INDEX "variants_rels_parent_idx" ON "variants_rels" USING btree ("parent_id");
  CREATE INDEX "variants_rels_path_idx" ON "variants_rels" USING btree ("path");
  CREATE INDEX "variants_rels_variant_options_id_idx" ON "variants_rels" USING btree ("variant_options_id");
  CREATE INDEX "_variants_v_parent_idx" ON "_variants_v" USING btree ("parent_id");
  CREATE INDEX "_variants_v_version_version_product_idx" ON "_variants_v" USING btree ("version_product_id");
  CREATE INDEX "_variants_v_version_version_updated_at_idx" ON "_variants_v" USING btree ("version_updated_at");
  CREATE INDEX "_variants_v_version_version_created_at_idx" ON "_variants_v" USING btree ("version_created_at");
  CREATE INDEX "_variants_v_version_version_deleted_at_idx" ON "_variants_v" USING btree ("version_deleted_at");
  CREATE INDEX "_variants_v_version_version__status_idx" ON "_variants_v" USING btree ("version__status");
  CREATE INDEX "_variants_v_created_at_idx" ON "_variants_v" USING btree ("created_at");
  CREATE INDEX "_variants_v_updated_at_idx" ON "_variants_v" USING btree ("updated_at");
  CREATE INDEX "_variants_v_latest_idx" ON "_variants_v" USING btree ("latest");
  CREATE INDEX "_variants_v_autosave_idx" ON "_variants_v" USING btree ("autosave");
  CREATE INDEX "_variants_v_rels_order_idx" ON "_variants_v_rels" USING btree ("order");
  CREATE INDEX "_variants_v_rels_parent_idx" ON "_variants_v_rels" USING btree ("parent_id");
  CREATE INDEX "_variants_v_rels_path_idx" ON "_variants_v_rels" USING btree ("path");
  CREATE INDEX "_variants_v_rels_variant_options_id_idx" ON "_variants_v_rels" USING btree ("variant_options_id");
  CREATE INDEX "variant_types_updated_at_idx" ON "variant_types" USING btree ("updated_at");
  CREATE INDEX "variant_types_created_at_idx" ON "variant_types" USING btree ("created_at");
  CREATE INDEX "variant_types_deleted_at_idx" ON "variant_types" USING btree ("deleted_at");
  CREATE INDEX "variant_options__variantoptions_options_order_idx" ON "variant_options" USING btree ("_variantoptions_options_order");
  CREATE INDEX "variant_options_variant_type_idx" ON "variant_options" USING btree ("variant_type_id");
  CREATE INDEX "variant_options_updated_at_idx" ON "variant_options" USING btree ("updated_at");
  CREATE INDEX "variant_options_created_at_idx" ON "variant_options" USING btree ("created_at");
  CREATE INDEX "variant_options_deleted_at_idx" ON "variant_options" USING btree ("deleted_at");
  CREATE INDEX "carts_items_order_idx" ON "carts_items" USING btree ("_order");
  CREATE INDEX "carts_items_parent_id_idx" ON "carts_items" USING btree ("_parent_id");
  CREATE INDEX "carts_items_product_idx" ON "carts_items" USING btree ("product_id");
  CREATE INDEX "carts_items_variant_idx" ON "carts_items" USING btree ("variant_id");
  CREATE INDEX "carts_secret_idx" ON "carts" USING btree ("secret");
  CREATE INDEX "carts_customer_idx" ON "carts" USING btree ("customer_id");
  CREATE INDEX "carts_updated_at_idx" ON "carts" USING btree ("updated_at");
  CREATE INDEX "carts_created_at_idx" ON "carts" USING btree ("created_at");
  ALTER TABLE IF EXISTS "products_gallery" ADD CONSTRAINT "products_gallery_variant_option_id_variant_options_id_fk" FOREIGN KEY ("variant_option_id") REFERENCES "public"."variant_options"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE IF EXISTS "products_rels" ADD CONSTRAINT "products_rels_variant_types_fk" FOREIGN KEY ("variant_types_id") REFERENCES "public"."variant_types"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE IF EXISTS "_products_v_version_gallery" ADD CONSTRAINT "_products_v_version_gallery_variant_option_id_variant_options_id_fk" FOREIGN KEY ("variant_option_id") REFERENCES "public"."variant_options"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE IF EXISTS "_products_v_rels" ADD CONSTRAINT "_products_v_rels_variant_types_fk" FOREIGN KEY ("variant_types_id") REFERENCES "public"."variant_types"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE IF EXISTS "orders_items" ADD CONSTRAINT "orders_items_variant_id_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."variants"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE IF EXISTS "transactions_items" ADD CONSTRAINT "transactions_items_variant_id_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."variants"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE IF EXISTS "transactions" ADD CONSTRAINT "transactions_cart_id_carts_id_fk" FOREIGN KEY ("cart_id") REFERENCES "public"."carts"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE IF EXISTS "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_variants_fk" FOREIGN KEY ("variants_id") REFERENCES "public"."variants"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE IF EXISTS "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_variant_types_fk" FOREIGN KEY ("variant_types_id") REFERENCES "public"."variant_types"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE IF EXISTS "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_variant_options_fk" FOREIGN KEY ("variant_options_id") REFERENCES "public"."variant_options"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE IF EXISTS "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_carts_fk" FOREIGN KEY ("carts_id") REFERENCES "public"."carts"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "products_gallery_variant_option_idx" ON "products_gallery" USING btree ("variant_option_id");
  CREATE INDEX "products_deleted_at_idx" ON "products" USING btree ("deleted_at");
  CREATE INDEX "products_rels_variant_types_id_idx" ON "products_rels" USING btree ("variant_types_id");
  CREATE INDEX "_products_v_version_gallery_variant_option_idx" ON "_products_v_version_gallery" USING btree ("variant_option_id");
  CREATE INDEX "_products_v_version_version_deleted_at_idx" ON "_products_v" USING btree ("version_deleted_at");
  CREATE INDEX "_products_v_rels_variant_types_id_idx" ON "_products_v_rels" USING btree ("variant_types_id");
  CREATE INDEX "orders_items_variant_idx" ON "orders_items" USING btree ("variant_id");
  CREATE INDEX "transactions_items_variant_idx" ON "transactions_items" USING btree ("variant_id");
  CREATE INDEX "transactions_cart_idx" ON "transactions" USING btree ("cart_id");
  CREATE INDEX "payload_locked_documents_rels_variants_id_idx" ON "payload_locked_documents_rels" USING btree ("variants_id");
  CREATE INDEX "payload_locked_documents_rels_variant_types_id_idx" ON "payload_locked_documents_rels" USING btree ("variant_types_id");
  CREATE INDEX "payload_locked_documents_rels_variant_options_id_idx" ON "payload_locked_documents_rels" USING btree ("variant_options_id");
  CREATE INDEX "payload_locked_documents_rels_carts_id_idx" ON "payload_locked_documents_rels" USING btree ("carts_id");
  ALTER TABLE IF EXISTS "categories" DROP COLUMN IF EXISTS "description";
  ALTER TABLE IF EXISTS "categories" DROP COLUMN IF EXISTS "parent_id";
  ALTER TABLE IF EXISTS "categories" DROP COLUMN IF EXISTS "icon_id";
  ALTER TABLE IF EXISTS "categories" DROP COLUMN IF EXISTS "image_id";
  ALTER TABLE IF EXISTS "categories" DROP COLUMN IF EXISTS "sort_order";
  ALTER TABLE IF EXISTS "categories" DROP COLUMN IF EXISTS "status";
  ALTER TABLE IF EXISTS "categories" DROP COLUMN IF EXISTS "meta_title";
  ALTER TABLE IF EXISTS "categories" DROP COLUMN IF EXISTS "meta_image_id";
  ALTER TABLE IF EXISTS "categories" DROP COLUMN IF EXISTS "meta_description";
  ALTER TABLE IF EXISTS "products_gallery" DROP COLUMN IF EXISTS "caption";
  ALTER TABLE IF EXISTS "products" DROP COLUMN IF EXISTS "price";
  ALTER TABLE IF EXISTS "products" DROP COLUMN IF EXISTS "is_free";
  ALTER TABLE IF EXISTS "products" DROP COLUMN IF EXISTS "technical_specs_file_format";
  ALTER TABLE IF EXISTS "products" DROP COLUMN IF EXISTS "technical_specs_software_version";
  ALTER TABLE IF EXISTS "products" DROP COLUMN IF EXISTS "technical_specs_file_size";
  ALTER TABLE IF EXISTS "products" DROP COLUMN IF EXISTS "technical_specs_unit";
  ALTER TABLE IF EXISTS "products_rels" DROP COLUMN IF EXISTS "product_previews_id";
  ALTER TABLE IF EXISTS "products_rels" DROP COLUMN IF EXISTS "software_types_id";
  ALTER TABLE IF EXISTS "products_rels" DROP COLUMN IF EXISTS "tags_id";
  ALTER TABLE IF EXISTS "_products_v_version_gallery" DROP COLUMN IF EXISTS "caption";
  ALTER TABLE IF EXISTS "_products_v" DROP COLUMN IF EXISTS "version_price";
  ALTER TABLE IF EXISTS "_products_v" DROP COLUMN IF EXISTS "version_is_free";
  ALTER TABLE IF EXISTS "_products_v" DROP COLUMN IF EXISTS "version_technical_specs_file_format";
  ALTER TABLE IF EXISTS "_products_v" DROP COLUMN IF EXISTS "version_technical_specs_software_version";
  ALTER TABLE IF EXISTS "_products_v" DROP COLUMN IF EXISTS "version_technical_specs_file_size";
  ALTER TABLE IF EXISTS "_products_v" DROP COLUMN IF EXISTS "version_technical_specs_unit";
  ALTER TABLE IF EXISTS "_products_v_rels" DROP COLUMN IF EXISTS "product_previews_id";
  ALTER TABLE IF EXISTS "_products_v_rels" DROP COLUMN IF EXISTS "software_types_id";
  ALTER TABLE IF EXISTS "_products_v_rels" DROP COLUMN IF EXISTS "tags_id";
  ALTER TABLE IF EXISTS "payload_locked_documents_rels" DROP COLUMN IF EXISTS "software_types_id";
  ALTER TABLE IF EXISTS "payload_locked_documents_rels" DROP COLUMN IF EXISTS "tags_id";
  ALTER TABLE IF EXISTS "payload_locked_documents_rels" DROP COLUMN IF EXISTS "product_previews_id";
  DROP TYPE IF EXISTS "public"."enum_categories_status";
  DROP TYPE IF EXISTS "public"."enum_product_previews_preview_type";
  DROP TYPE IF EXISTS "public"."enum_products_technical_specs_unit";
  DROP TYPE IF EXISTS "public"."enum__products_v_version_technical_specs_unit";`)
}
