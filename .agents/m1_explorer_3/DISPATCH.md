## 2026-09-15T07:11:00Z
Investigate and design PostgreSQL Migration Batch 6 for Phase 5:
1. Inspect existing migrations in `web/src/migrations/` (especially Batch 1 `20260915_020514_initial.ts` and Batch 5 `20260915_064708_phase4_payment_wallet.ts`).
2. Inspect current database state for tables `orders` and `orders_items` (created in Batch 1 with 0 rows). Determine whether Batch 6 should drop the old template tables (`DROP TABLE IF EXISTS "orders_items", "orders" CASCADE;`) and recreate them with the exact digital columns, or alter them.
3. Design complete DDL for:
   - `orders`: `id`, `code`, `buyer_id`, `total_amount`, `currency`, `status`, `payment_source`, `paid_at`, `notes`, `updated_at`, `created_at`. Unique index on `code`.
   - `order_items`: `id`, `order_id`, `product_id`, `seller_id`, `sale_price`, `platform_fee`, `seller_amount`, `tax`, `policy_version`, `updated_at`, `created_at`.
   - `entitlements`: `id`, `user_id`, `product_id`, `order_id`, `order_item_id`, `status`, `granted_at`, `download_count`, `max_downloads`, `expires_at`, `revoked_at`, `reason`, `updated_at`, `created_at`.
   - Partial unique index on entitlements:
     `CREATE UNIQUE INDEX "entitlements_user_product_active_idx" ON "entitlements" ("user_id", "product_id") WHERE ("status" = 'active');`
   - `download_events`: `id`, `user_id`, `product_id`, `entitlement_id`, `ip_address`, `user_agent`, `downloaded_at`, `status`, `download_token_hash`, `error_reason`, `updated_at`, `created_at`.
4. Migration naming, snapshot json file generation, and registration in `web/src/migrations/index.ts`.
5. Safe migration rollback script (`down` function).
