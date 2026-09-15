# Milestone 1: Schema & Migration Batch 6 — Review & Adversarial Verification Report

**Reviewer**: `m1_reviewer_1` (teamwork_preview_reviewer)  
**Verdict**: **APPROVE**  
**Integrity Evaluation**: **PASSED** (Zero integrity violations; genuine implementation and empirical verification confirmed)

---

## 1. Observation

### 1.1 Source Code and Configuration Inspection
The implementation of Milestone 1 was inspected across all assigned files:

1. **Digital Orders Collection (`web/src/collections/Orders/index.ts`)**:
   - Slug `orders`, group `Commerce`, default columns configured (lines 19–28).
   - Invariant code generation hook `beforeValidate` generates `ORD-${dateStr}-${randomSuffix}` on create if absent (lines 46–56).
   - Fields: `buyer` (`users` relationship), `totalAmount` (`number`, `min: 0`), `currency` (`select`, `'VND'`), `status` (`'PENDING'`, `'COMPLETED'`, `'CANCELLED'`), `paymentSource` (`'wallet'`, `'free'`), `paidAt` (`date`), and `items` (`join` on `order_items` via `order`).
   - Access control bound to `orderCreateAccess`, `orderDeleteAccess`, `orderReadAccess`, `orderUpdateAccess` (lines 12–17).

2. **Snapshot Order Items Collection (`web/src/collections/OrderItems/index.ts`)**:
   - Slug `order_items`, group `Commerce` (lines 12, 30).
   - Fields: `order` (`orders`), `product` (`products`), `seller` (`users`), `salePrice` (`min: 0`), `platformFee` (`min: 0`, default 0), `sellerAmount` (`min: 0`), `tax` (`min: 0`, default 0), `policyVersion` (default `'v1'`).
   - Hooks:
     - `beforeValidate`: `validateAntiSelfPurchase` (`web/src/collections/OrderItems/hooks/validateAntiSelfPurchase.ts`).
       - Resolves authoritative seller directly from `products` via `req.payload.findByID` and forces `data.seller = sellerId` (lines 23–44), preventing seller spoofing.
       - Resolves buyer from order or `req.user.id` and throws `ValidationError` if `buyerId === sellerId` (lines 47–84).
     - `beforeChange`: `preventOrderItemMutation` (`web/src/collections/OrderItems/hooks/preventOrderItemMutation.ts`).
       - Enforces BR-07: throws `Error` if `operation === 'update'`, rejecting any programmatic update even with `overrideAccess: true` (lines 6–12).
   - Access controls: direct create, update, delete are strictly denied (`() => false`).

3. **Entitlements Ledger Collection (`web/src/collections/Entitlements/index.ts`)**:
   - Slug `entitlements`, group `Commerce` (lines 9, 19).
   - Fields: `user` (`users`), `product` (`products`), `order` (`orders`, optional for free claims), `orderItem` (`order_items`, optional), `status` (`'active'`, `'revoked'`, `'expired'`), `grantedAt` (`date`), `downloadCount` (`number`, default 0, `min: 0`), `maxDownloads` (`min: 1`), `expiresAt` (`date`), `revokedAt` (`date`), `reason` (`text`).
   - Hook: `enforceEntitlementInvariants` (`web/src/collections/Entitlements/hooks/enforceEntitlementInvariants.ts`).
     - Auto-populates `grantedAt` on create (lines 13–15).
     - Defaults `downloadCount` to 0 (lines 18–20).
     - Auto-sets `revokedAt` when transitioning to `'revoked'` (lines 23–25).
     - Queries `entitlements` collection for existing active entitlement for `(user, product)`; throws Invariant Violation if duplicate found (lines 28–57).
   - Access controls: direct create and delete are denied (`() => false`); update is restricted to `admin` only.

4. **Download Events Audit Collection (`web/src/collections/DownloadEvents/index.ts`)**:
   - Slug `download_events`, group `Commerce` (lines 8, 17).
   - Append-only schema with `user`, `product`, `entitlement`, `ipAddress`, `userAgent`, `downloadedAt`, `status` (`'SUCCESS'`, `'DENIED'`, `'EXPIRED'`, `'FAILED'`), `downloadTokenHash`, `errorReason`.
   - Access control: read restricted to `admin` and `financeAdmin`; create, update, delete denied via REST (`() => false`).

5. **Access Control Modules (`web/src/access/`)**:
   - `orderAccess.ts`: `orderReadAccess` allows `admin`/`financeAdmin` or `buyer: { equals: user.id }`; `orderItemReadAccess` allows `admin`/`financeAdmin`, seller, or buyer; direct mutations return `false`.
   - `entitlementAccess.ts`: `entitlementReadAccess` allows `admin`/`financeAdmin` or `{ and: [{ user: { equals: user.id } }, { status: { equals: 'active' } }] }`; direct create/delete return `false`; update allows `admin`.
   - `downloadEventAccess.ts`: `downloadEventReadAccess` allows `admin`/`financeAdmin`; direct mutations return `false`.

6. **Configuration & Migration Alignment**:
   - `web/src/plugins/index.ts`: disabled legacy ecommerce orders with `orders: false` and pruned JSON Schema definition (lines 91, 125–130).
   - `web/src/collections/Users/index.ts`: updated join field `orders` to `on: 'buyer'` (line 74).
   - `web/src/payload.config.ts`: registered `Orders`, `OrderItems`, `Entitlements`, and `DownloadEvents` in `collections` array (lines 72–75).
   - `web/src/payload-types.ts`: generated types containing `Order`, `OrderItem`, `Entitlement`, `DownloadEvent`.
   - `web/src/migrations/20260915_071500_phase5_purchase_download.ts`: DDL creating Phase 5 tables, enums, FK constraints, indexes, non-negative checks, trigger `enforce_br04_seller_anti_self_purchase` calling `check_seller_self_purchase()`, and partial unique index `entitlements_user_product_active_idx`. Complete `down` rollback function provided.

### 1.2 Command Outputs & Verifications

1. **Migration Status (`pnpm --prefix web payload migrate:status`)**:
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
   Exit code: 0.

2. **ESLint Verification (`pnpm --prefix web lint`)**:
   ```text
   ✖ 334 problems (0 errors, 334 warnings)
     0 errors and 7 warnings potentially fixable with the `--fix` option.
   ```
   Exit code: 0.

3. **Pre-existing 17 Integration Test Suites Regression Check**:
   Command: `./node_modules/.bin/vitest run --config ./vitest.config.mts tests/int/api.int.spec.ts tests/int/catalog-m3-storefront.int.spec.ts tests/int/catalog-rbac.int.spec.ts tests/int/challenger-m2.int.spec.ts tests/int/challenger-m3-detail.int.spec.ts tests/int/challenger-m3.int.spec.ts tests/int/challenger-m4-seo.int.spec.ts tests/int/challenger-m4-sitemap.int.spec.ts tests/int/m1-schema-stress.int.spec.ts tests/int/moderation-lifecycle.int.spec.ts tests/int/payment-failure-recovery.int.spec.ts tests/int/payment-webhook-duplicate.int.spec.ts tests/int/product-files-security.int.spec.ts tests/int/rbac.int.spec.ts tests/int/seller-onboarding.int.spec.ts tests/int/seo-sitemap.int.spec.ts tests/int/wallet-ledger-invariants.int.spec.ts`
   ```text
   Test Files  17 passed (17)
        Tests  242 passed (242)
     Start at  14:34:00
     Duration  34.12s
   ```
   Exit code: 0 (100% pass across all 242 pre-existing tests; 0 regressions).

4. **Milestone 1 Dedicated Invariants Challenge Suite (`tests/int/challenger-m1-invariants.int.spec.ts`)**:
   Command: `./node_modules/.bin/vitest run --config ./vitest.config.mts tests/int/challenger-m1-invariants.int.spec.ts`
   ```text
   Test Files  1 passed (1)
        Tests  20 passed (20)
     Duration  2.81s
   ```
   Exit code: 0 (Verified: BR-04 hook and DB trigger self-purchase block, seller spoofing defense, BR-07 immutability hook, partial unique index active uniqueness & multiple revoked allowance, non-negative checks on orders, order_items, entitlements).

5. **Milestone 1 Dedicated Access Control Challenge Suite (`tests/int/m1-access-control.int.spec.ts`)**:
   Command: `./node_modules/.bin/vitest run --config ./vitest.config.mts tests/int/m1-access-control.int.spec.ts`
   ```text
   Test Files  1 passed (1)
        Tests  54 passed (54)
     Duration  4.21s
   ```
   Exit code: 0 (Verified: Direct mutation denial on Orders/OrderItems/Entitlements/DownloadEvents across unauthenticated callers, buyers, sellers, financeAdmins, and admins; HTTP REST route rejection; buyer/seller order and order item read access scoping; active-only entitlement read scoping for buyers; admin/financeAdmin audit log read scoping).

6. **PostgreSQL Direct SQL Invariant Verification**:
   - `orders_total_amount_non_negative`: Blocked negative total amount with check violation.
   - `enforce_br04_seller_anti_self_purchase` trigger: Blocked direct SQL insert when seller equals order buyer with message `BR-04 Invariant Violation: Seller (id=1) cannot purchase their own product (product_id=3607)`.
   - `entitlements_user_product_active_idx`: Blocked duplicate active entitlement with `duplicate key value violates unique constraint "entitlements_user_product_active_idx"`.
   - Revoked entitlement allowed alongside active: Verified.
   - `order_items_sale_price_non_negative`: Blocked negative sale price with check violation.

---

## 2. Logic Chain

1. **Integrity & Authenticity Check**:
   - Inspected source code for fake facades, hardcoded test IDs, or dummy mocks: all collections, hooks, access controls, and migrations implement real business logic and schema definitions.
   - Independent runs of tests and database operations confirmed all claims made in the worker's handoff report are accurate and reproducible.
2. **Schema Correctness**:
   - Replacing the legacy physical goods `orders` collection from the ecommerce plugin with custom digital `Orders` and `OrderItems` collections matches PROJECT.md specifications and eliminates legacy physical shipping artifacts.
   - Aligning `Users.orders` join to `on: 'buyer'` provides proper relational integrity between buyers and digital orders.
   - The DDL migration cleanly created 5 ENUM types, 4 tables, 13 B-tree indexes, foreign keys, non-negative check constraints, a partial unique index, and a PL/pgSQL trigger.
3. **Defense-in-Depth Invariant Architecture**:
   - **BR-04 (Anti-Self-Purchase)**: Protected at application level via `validateAntiSelfPurchase` (which resolves authoritative seller from product, preventing spoofing) and at database level via `enforce_br04_seller_anti_self_purchase` trigger.
   - **BR-07 (Price Snapshot Immutability)**: Protected at API level via `orderItemUpdateAccess: () => false` and at server/Payload level via `preventOrderItemMutation` hook.
   - **R2 (Unique Active Entitlement)**: Protected at application level via `enforceEntitlementInvariants` hook and at database engine level via `entitlements_user_product_active_idx` partial unique index.
   - **Append-Only Audit Trail**: `download_events` cannot be modified or deleted by any principal via REST or GraphQL (`() => false`).
4. **Regression Safety**:
   - 17 pre-existing test suites (242 tests) passed with 0 regressions.
   - ESLint passed with 0 errors.

---

## 3. Caveats

1. **Downstream Test Suites Pending M2/M3**:
   Running `pnpm --prefix web test:int` without file filters executes all 22 test files in `tests/int/`. Three suites (`purchase-invariants.int.spec.ts`, `purchase-workflow.int.spec.ts`, and `secure-download.int.spec.ts`) fail with explicit errors indicating downstream services (`web/src/services/purchase.ts` and `web/src/services/download.ts`) are pending Milestone 2 and Milestone 3 implementation. This is normal and expected at Milestone 1 stage.
2. **Legacy Orders Frontend UI**:
   The legacy template account orders pages (`web/src/app/(app)/(account)/orders/`) still reference legacy physical order fields. Migrating this UI to the new digital orders schema is assigned to Milestone 4.

---

## 4. Conclusion

**Verdict**: **APPROVE**

Milestone 1 implementation is complete, well-architected, and fully verified.
- Digital order and entitlement schemas comply with PROJECT.md, PLAN.md §27, Decision 0002, and Decision 0006.
- Database migration Batch 6 is successfully applied in PostgreSQL with full index, constraint, and trigger coverage.
- All 74 dedicated Milestone 1 adversarial challenge and access control tests pass with 100% success rate.
- All 242 pre-existing regression tests pass with zero regressions.
- ESLint reports 0 errors.
- No integrity violations or facade implementations exist.

Milestone 1 is ready for Milestone 2 (`purchaseProduct` atomic wallet service) to build upon.

---

## 5. Verification Method

To independently reproduce and verify these findings:

1. **Verify Migration Status**:
   ```bash
   pnpm --prefix web payload migrate:status
   ```
   *Expected*: Shows Batch 6 `20260915_071500_phase5_purchase_download` with `Ran: Yes`.

2. **Verify 17 Pre-existing Regression Suites (242 tests)**:
   ```bash
   ./web/node_modules/.bin/vitest run --config ./web/vitest.config.mts \
     web/tests/int/api.int.spec.ts \
     web/tests/int/catalog-m3-storefront.int.spec.ts \
     web/tests/int/catalog-rbac.int.spec.ts \
     web/tests/int/challenger-m2.int.spec.ts \
     web/tests/int/challenger-m3-detail.int.spec.ts \
     web/tests/int/challenger-m3.int.spec.ts \
     web/tests/int/challenger-m4-seo.int.spec.ts \
     web/tests/int/challenger-m4-sitemap.int.spec.ts \
     web/tests/int/m1-schema-stress.int.spec.ts \
     web/tests/int/moderation-lifecycle.int.spec.ts \
     web/tests/int/payment-failure-recovery.int.spec.ts \
     web/tests/int/payment-webhook-duplicate.int.spec.ts \
     web/tests/int/product-files-security.int.spec.ts \
     web/tests/int/rbac.int.spec.ts \
     web/tests/int/seller-onboarding.int.spec.ts \
     web/tests/int/seo-sitemap.int.spec.ts \
     web/tests/int/wallet-ledger-invariants.int.spec.ts
   ```
   *Expected*: 17 test files passed, 242 tests passed, 0 failed.

3. **Verify Milestone 1 Dedicated Invariant & Access Control Challenge Suites (74 tests)**:
   ```bash
   cd web && ./node_modules/.bin/vitest run --config ./vitest.config.mts \
     tests/int/challenger-m1-invariants.int.spec.ts \
     tests/int/m1-access-control.int.spec.ts
   ```
   *Expected*: 2 test files passed, 74 tests passed, 0 failed.

4. **Verify ESLint Quality Gate**:
   ```bash
   pnpm --prefix web lint
   ```
   *Expected*: 0 errors.

5. **Verify Database Trigger and Constraints via PostgreSQL**:
   ```bash
   docker exec -i kientaohub-postgres psql -U payload -d kientaohub -c "\d orders; \d order_items; \d entitlements; \d download_events;"
   ```
   *Expected*: Tables reflect check constraints, indexes, triggers, and foreign keys.
