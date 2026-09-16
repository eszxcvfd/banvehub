import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "commission_settings" (
      "id" serial PRIMARY KEY NOT NULL,
      "default_rate" numeric DEFAULT 0.30,
      "updated_at" timestamp(3) with time zone,
      "created_at" timestamp(3) with time zone
    );
    INSERT INTO "commission_settings" ("default_rate", "created_at", "updated_at")
    SELECT 0.30, NOW(), NOW()
    WHERE NOT EXISTS (SELECT 1 FROM "commission_settings" WHERE "id" = 1);
  `)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    DROP TABLE IF EXISTS "commission_settings" CASCADE;
  `)
}
