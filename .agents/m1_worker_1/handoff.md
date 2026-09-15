# Milestone 1: Schema & Migration Batch 6 — Completion Handoff Report

## 1. Observation

### 1.1 Code Modifications & Implementations
The following files were created and updated in strict adherence to exclusive write ownership and explorer specifications:

1. **Access Controls**:
   - `web/src/access/orderAccess.ts`:
     - `orderReadAccess`: Allows `admin` and `financeAdmin`, or `buyer: { equals: user.id }`.
     - `orderCreateAccess`, `orderUpdateAccess`, `orderDeleteAccess`: Denied (`() => false`) via REST.
     - `orderItemReadAccess`: Allows `admin` and `financeAdmin`, product `seller: { equals: user.id }`, or order `'order.buyer': { equals: user.id }`.
     - `orderItemCreateAccess`, `orderItemUpdateAccess`, `orderItemDeleteAccess`: Denied (`() => false`) via REST.
   - `web/src/access/entitlementAccess.ts`:
     - `entitlementReadAccess`: Allows `admin` and `financeAdmin`, or `{ and: [{ user: { equals: user.id } }, { status: { equals: 'active' } }] }`.
     - `entitlementUpdateAccess`: Restricted to `admin` only (`checkRole(['admin'], user)`).
     - `entitlementNoDirectWrite`: Denied (`() => false`) for create and delete via REST.
   - `web/src/access/downloadEventAccess.ts`:
     - `downloadEventReadAccess`: Restricted to `admin` and `financeAdmin`.
     - `downloadEventNoDirectWrite`: Denied (`() => false`) for create, update, delete via REST (append-only audit trail).

2. **Collections & Invariant Hooks**:
   - `web/src/collections/Orders/index.ts`:
     - Digital order schema (`slug: 'orders'`) with `code` (auto-generating `ORD-${dateStr}-${randomSuffix}` on create), `buyer` (relationship to `users`), `totalAmount` (min 0), `currency` (`'VND'`), `status` (`'PENDING'`, `'COMPLETED'`, `'CANCELLED'`), `paymentSource` (`'wallet'`, `'free'`), `paidAt`, `notes`, and join `items` on `order_items`.
   - `web/src/collections/OrderItems/hooks/validateAntiSelfPurchase.ts`:
     - Enforces BR-04 before validation on create: queries `products` collection to obtain authoritative `seller`, checks against `orders.buyer` or `req.user.id`. Throws `ValidationError` if `buyerId === sellerId`.
   - `web/src/collections/OrderItems/hooks/preventOrderItemMutation.ts`:
     - Enforces BR-07: throws Error if `operation === 'update'`.
   - `web/src/collections/OrderItems/index.ts`:
     - Digital order item schema (`slug: 'order_items'`) with `order` (relationship to `orders`), `product` (relationship to `products`), `seller` (relationship to `users`), `salePrice` (immutable snapshot price, min 0), `platformFee`, `sellerAmount`, `tax`, `policyVersion`.
   - `web/src/collections/Entitlements/hooks/enforceEntitlementInvariants.ts`:
     - Enforces R2 invariant: defaults `grantedAt` and `downloadCount`, auto-populates `revokedAt`, and validates that no other `active` entitlement exists for `(user, product)` (defense-in-depth beforeChange check).
   - `web/src/collections/Entitlements/index.ts`:
     - Entitlement ledger schema (`slug: 'entitlements'`) with `user`, `product`, `order`, `orderItem`, `status` (`'active'`, `'revoked'`, `'expired'`), `grantedAt`, `downloadCount`, `maxDownloads`, `expiresAt`, `revokedAt`, `reason`.
   - `web/src/collections/DownloadEvents/index.ts`:
     - Append-only audit schema (`slug: 'download_events'`) with `user`, `product`, `entitlement`, `ipAddress`, `userAgent`, `downloadedAt`, `status` (`'SUCCESS'`, `'DENIED'`, `'EXPIRED'`, `'FAILED'`), `downloadTokenHash`, `errorReason`. All fields marked `admin: { readOnly: true }`.

3. **System Integration & Configuration Alignment**:
   - `web/src/plugins/index.ts`:
     - Replaced ecommerce plugin orders config with `orders: false`.
     - Added schema pruning in `incomingConfig.typescript.schema` to excise `orders` from `jsonSchema.properties.ecommerce.properties.collections`.
   - `web/src/collections/Users/index.ts`:
     - Updated join field `orders` from `on: 'customer'` to `on: 'buyer'`, with defaultColumns `['id', 'code', 'createdAt', 'totalAmount', 'status']`.
   - `web/src/payload.config.ts`:
     - Registered `Orders`, `OrderItems`, `Entitlements`, and `DownloadEvents` in `collections` array.
   - `web/src/payload-types.ts`:
     - Regenerated TypeScript types containing interfaces `Order`, `OrderItem`, `Entitlement`, `DownloadEvent`.

4. **PostgreSQL Migration Batch 6**:
   - `web/src/migrations/20260915_071500_phase5_purchase_download.ts` and `.json`:
     - Drops old 0-row ecommerce template tables (`orders_items`, `orders`, `orders_rels`) and enums.
     - Creates ENUMs: `enum_orders_currency` ('VND'), `enum_orders_status` ('PENDING', 'COMPLETED', 'CANCELLED'), `enum_orders_payment_source` ('wallet', 'free'), `enum_entitlements_status` ('active', 'revoked', 'expired'), `enum_download_events_status` ('SUCCESS', 'DENIED', 'EXPIRED', 'FAILED').
     - Creates tables: `orders`, `order_items`, `entitlements`, `download_events`.
     - Adds locked document relation columns and FKs in `payload_locked_documents_rels`.
     - Creates foreign key constraints and B-tree indexes.
     - Creates PostgreSQL trigger `enforce_br04_seller_anti_self_purchase` calling `check_seller_self_purchase()` to prevent seller self-purchase at DB engine level.
     - Creates partial unique index: `CREATE UNIQUE INDEX "entitlements_user_product_active_idx" ON "entitlements" ("user_id", "product_id") WHERE ("status" = 'active');`.
     - Adds non-negative check constraints on `orders.total_amount`, `order_items.sale_price`, `platform_fee`, `seller_amount`, `tax`, and `entitlements.download_count`.
     - Provides symmetric rollback `down` function restoring Batch 1 template tables and enums.
   - `web/src/migrations/index.ts`:
     - Registered `migration_20260915_071500_phase5_purchase_download`.

### 1.2 Command Outputs & Verifications

1. **Migration Execution (`pnpm --prefix web payload migrate`)**:
   ```text
   [14:25:56] INFO: Reading migration files from /home/trung/Documents/2026/project/test-v6/web/src/migrations
   [14:25:56] INFO: Migrating: 20260915_071500_phase5_purchase_download
   [14:25:57] INFO: Migrated:  20260915_071500_phase5_purchase_download (257ms)
   [14:25:57] INFO: Done.
   ```

2. **Migration Status (`pnpm --prefix web payload migrate:status`)**:
   ```text
   ┌──────────────────────────────────────────┬───────┬─────┐
   │                                     Name │ Batch │ Ran │
   ├──────────────────────────────────────────┼───────┼─────┤
   │                  20260915_020514_initial │     1 │ Yes │
   │   20260915_023701_user_roles_from_plan_5 │     2 │ Yes │
   │   20260915_033625_phase2_digital_catalog │     3 │ Yes │
   │ 20260915_062953_phase3_seller_moderation │     4 │ Yes │
   │    20260915_064708_phase4_payment_wallet │     5 │ Yes │
   │ 20260915_071500_phase5_purchase_download │     6 │ Yes │
   └──────────────────────────────────────────┴───────┴─────┘
   ```

3. **Database Constraints Testing in PostgreSQL**:
   - Anti-Self-Purchase Trigger:
     `NOTICE: SUCCESS: BR-04 Trigger blocked self-purchase with message: BR-04 Invariant Violation: Seller (id=1) cannot purchase their own product (product_id=1)`
   - Partial Unique Index:
     `NOTICE: SUCCESS: R2 Partial unique index blocked duplicate active entitlement: duplicate key value violates unique constraint "entitlements_user_product_active_idx"`
   - Non-negative check constraint:
     `NOTICE: SUCCESS: Negative total_amount blocked by check constraint: new row for relation "orders" violates check constraint "orders_total_amount_non_negative"`

4. **Integration Test Suite Execution (`pnpm run test:int` on existing 17 suites)**:
   ```text
   Test Files  17 passed (17)
        Tests  242 passed (242)
     Start at  14:27:08
     Duration  33.30s (transform 432ms, setup 88ms, import 15.12s, tests 11.38s, environment 5.29s)
   ```

5. **Lint Execution (`pnpm --prefix web lint`)**:
   ```text
   ✖ 280 problems (0 errors, 280 warnings)
     0 errors and 7 warnings potentially fixable with the `--fix` option.
   ```
   Exit code: 0.

---

## 2. Logic Chain

1. **Pre-existing State**:
   - The ecommerce template had default physical goods orders configured in `web/src/plugins/index.ts` with shipping address fields and USD currency.
   - Database tables `orders` and `orders_items` had 0 rows.
2. **Schema Separation**:
   - Setting `orders: false` in `ecommercePlugin` and cleaning up the typescript JSON schema prevented the legacy order collection from loading into Payload CMS.
   - Adding dedicated collections `Orders` and `OrderItems` allows pure digital product lifecycle management with snapshot pricing (BR-07) and fee breakdown.
   - Aligning `Users` collection join `orders` to `on: 'buyer'` resolved schema relationship validation errors.
3. **Defense-in-Depth Invariants**:
   - **BR-04 (Anti-Self-Purchase)**: Enforced at application level via `validateAntiSelfPurchase` hook which verifies authoritative seller and order buyer, and at database engine level via trigger `enforce_br04_seller_anti_self_purchase`.
   - **BR-07 (Price Snapshot Immutability)**: Direct REST updates are rejected by access controls (`update: () => false`) and programmatic mutation is rejected by `preventOrderItemMutation` hook.
   - **R2 (Unique Active Entitlement)**: Enforced at application level via `enforceEntitlementInvariants` hook and at database engine level via partial unique index `entitlements_user_product_active_idx` (`WHERE status = 'active'`).
4. **Database State & Migration**:
   - Applying migration `20260915_071500_phase5_purchase_download` dropped legacy empty physical tables and built the digital tables, constraints, enums, and triggers.
   - All 17 existing integration test suites passed with 242/242 tests passing and 0 regressions.
   - ESLint completed with 0 errors.

---

## 3. Caveats

1. **Legacy Storefront Orders Page**:
   `web/src/app/(app)/(account)/orders/page.tsx` and `web/src/app/(app)/(account)/orders/[id]/page.tsx` are legacy ecommerce template pages querying `customer`. Updating those UI pages to digital orders is assigned to Milestone 4 (`m4_worker`).
2. **New Phase 5 Test Suites**:
   The test track worker recently added `purchase-invariants.int.spec.ts`, `purchase-workflow.int.spec.ts`, and `secure-download.int.spec.ts` which test downstream Milestone 2 (`purchaseProduct` service, atomic wallet purchase) and Milestone 3 (`createDownloadToken`, `verifyAndStreamDownload` streaming). These suites fail pending M2 and M3 implementations as planned. All 17 pre-existing test suites pass 100%.

---

## 4. Conclusion

Milestone 1 is complete. All 4 digital collections (`Orders`, `OrderItems`, `Entitlements`, `DownloadEvents`), 3 access control modules (`orderAccess`, `entitlementAccess`, `downloadEventAccess`), hooks enforcing BR-04 and BR-07, configuration integrations in `plugins/index.ts`, `Users/index.ts`, and `payload.config.ts`, PostgreSQL migration Batch 6 (`20260915_071500_phase5_purchase_download`), and generated TypeScript types are implemented, verified, and active in the database.

---

## 5. Verification Method

### 5.1 Verification Commands

1. **Migration Status**:
   ```bash
   pnpm --prefix web payload migrate:status
   ```
   *Expected output*: Shows Batch 6 `20260915_071500_phase5_purchase_download` with `Ran: Yes`.

2. **Integration Tests**:
   ```bash
   ./web/node_modules/.bin/vitest run --dir web \
     tests/int/api.int.spec.ts \
     tests/int/catalog-m3-storefront.int.spec.ts \
     tests/int/catalog-rbac.int.spec.ts \
     tests/int/challenger-m2.int.spec.ts \
     tests/int/challenger-m3-detail.int.spec.ts \
     tests/int/challenger-m3.int.spec.ts \
     tests/int/challenger-m4-seo.int.spec.ts \
     tests/int/challenger-m4-sitemap.int.spec.ts \
     tests/int/m1-schema-stress.int.spec.ts \
     tests/int/moderation-lifecycle.int.spec.ts \
     tests/int/payment-failure-recovery.int.spec.ts \
     tests/int/payment-webhook-duplicate.int.spec.ts \
     tests/int/product-files-security.int.spec.ts \
     tests/int/rbac.int.spec.ts \
     tests/int/seller-onboarding.int.spec.ts \
     tests/int/seo-sitemap.int.spec.ts \
     tests/int/wallet-ledger-invariants.int.spec.ts
   ```
   *Expected output*: 17 test files passed, 242 tests passed, 0 failed.

3. **Lint Verification**:
   ```bash
   pnpm --prefix web lint
   ```
   *Expected output*: 0 errors.

4. **Database Invariants Check**:
   ```bash
   docker exec -i kientaohub-postgres psql -U payload -d kientaohub -c "\d orders; \d order_items; \d entitlements; \d download_events;"
   ```
   *Expected output*: Schema tables display valid check constraints, triggers, and indices.
