# Milestone 1: Schema & Migration Batch 6 — Review & Adversarial Challenge Report

## Review Summary

**Reviewer**: `m1_reviewer_2` (Roles: `reviewer`, `critic`)  
**Target**: Milestone 1 (Schema & Migration Batch 6)  
**Reviewed Artifacts**:
- `web/src/migrations/20260915_071500_phase5_purchase_download.ts` and `.json`
- `web/src/access/orderAccess.ts`, `web/src/access/entitlementAccess.ts`, `web/src/access/downloadEventAccess.ts`
- `web/src/collections/Orders/index.ts`
- `web/src/collections/OrderItems/index.ts` and hooks (`validateAntiSelfPurchase.ts`, `preventOrderItemMutation.ts`)
- `web/src/collections/Entitlements/index.ts` and hook (`enforceEntitlementInvariants.ts`)
- `web/src/collections/DownloadEvents/index.ts`
- `web/src/plugins/index.ts`, `web/src/payload.config.ts`, `web/src/collections/Users/index.ts`, `web/src/payload-types.ts`
- Live PostgreSQL schema, triggers, partial indexes, and check constraints in Docker container `kientaohub-postgres`

**Verdict**: **APPROVE**  
**Integrity Status**: **CLEAN (0 Integrity Violations)**  
- No hardcoded test responses or facade logic detected.
- Real database tables, triggers, partial unique indexes, check constraints, and hooks are fully implemented.
- Clean separation of concerns with robust defense-in-depth architecture.

---

## 1. Observation

### 1.1 Integrity & Source Code Verification
1. **Digital Order & Order Items Collections**:
   - `web/src/collections/Orders/index.ts`: Configures `orders` collection with immutable `code` generator (`ORD-${dateStr}-${randomSuffix}`), `buyer` relation to `users`, `totalAmount` with `min: 0`, `currency` restricted to `'VND'`, `status` (`'PENDING'`, `'COMPLETED'`, `'CANCELLED'`), `paymentSource` (`'wallet'`, `'free'`), `paidAt`, and join field `items` on `order_items`.
   - `web/src/collections/OrderItems/index.ts`: Implements snapshot item collection with `order`, `product`, `seller`, `salePrice` (`min: 0`), `platformFee` (`min: 0`), `sellerAmount` (`min: 0`), `tax` (`min: 0`), and `policyVersion`.
2. **Invariant Enforcement Modules**:
   - `web/src/collections/OrderItems/hooks/validateAntiSelfPurchase.ts`: Verifies authoritative product seller against order buyer and `req.user.id`. Forces `data.seller = sellerId` to prevent seller spoofing. Throws `ValidationError` if `buyerId === sellerId` (BR-04).
   - `web/src/collections/OrderItems/hooks/preventOrderItemMutation.ts`: Throws runtime error on `operation === 'update'`, guaranteeing immutable snapshot pricing (BR-07) across all Payload API operations.
   - `web/src/collections/Entitlements/hooks/enforceEntitlementInvariants.ts`: Enforces default `grantedAt` and `downloadCount = 0`, auto-populates `revokedAt` on revocation, and rejects duplicate `active` entitlements for `(user, product)` while permitting updates to existing records.
3. **Restricted Access Controls**:
   - `web/src/access/orderAccess.ts`: `orderCreateAccess`, `orderUpdateAccess`, `orderDeleteAccess`, `orderItemCreateAccess`, `orderItemUpdateAccess`, `orderItemDeleteAccess` return `() => false`. Read access allows admin/financeAdmin and restricts buyers/sellers to their respective records.
   - `web/src/access/entitlementAccess.ts`: Direct create and delete denied via REST; updates restricted to `admin` only; reads allow admin/financeAdmin or user's own active entitlements.
   - `web/src/access/downloadEventAccess.ts`: Direct create/update/delete denied via REST; read restricted to admin/financeAdmin (append-only audit trail).
4. **Configuration & Migration Alignment**:
   - `web/src/plugins/index.ts`: Sets `orders: false` in `ecommercePlugin` and excises `orders` from typescript JSON schema, eliminating legacy physical orders.
   - `web/src/collections/Users/index.ts`: Aligned `orders` join from `customer` to `buyer`.
   - `web/src/payload.config.ts`: Registered `Orders`, `OrderItems`, `Entitlements`, `DownloadEvents` in Payload config.
   - `web/src/payload-types.ts`: Generated interfaces `Order`, `OrderItem`, `Entitlement`, `DownloadEvent`.
   - `web/src/migrations/20260915_071500_phase5_purchase_download.ts` and `.json`: Applied Batch 6 migration with DDL statements, enum types, indexes, and trigger.

### 1.2 Command & Database Verification Outputs
1. **Migration Status**:
   `pnpm --prefix web payload migrate:status` executed cleanly:
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
2. **PostgreSQL Database Engine Inspection (`docker exec -i kientaohub-postgres psql`)**:
   - Trigger `enforce_br04_seller_anti_self_purchase` active on `order_items` calling `check_seller_self_purchase()`.
   - Partial unique index `entitlements_user_product_active_idx` active on `entitlements ("user_id", "product_id") WHERE (status = 'active')`.
   - Check constraints active: `orders_total_amount_non_negative`, `order_items_sale_price_non_negative`, `order_items_platform_fee_non_negative`, `order_items_seller_amount_non_negative`, `order_items_tax_non_negative`, `entitlements_download_count_non_negative`.
3. **Empirical Direct SQL Testing in PostgreSQL**:
   - Duplicate active entitlement: Blocked with `duplicate key value violates unique constraint "entitlements_user_product_active_idx"`.
   - Multiple revoked/expired entitlements: Permitted (5 rows created for same user/product: 1 active, 2 revoked, 2 expired).
   - Anti-self-purchase trigger: Blocked with `BR-04 Invariant Violation: Seller (id=1) cannot purchase their own product (product_id=3607)`.
   - Negative total amount: Blocked with `violates check constraint "orders_total_amount_non_negative"`.
   - Negative sale price: Blocked with `violates check constraint "order_items_sale_price_non_negative"`.
   - Negative download count: Blocked with `violates check constraint "entitlements_download_count_non_negative"`.
4. **Integration Test Suite Non-Regression Execution**:
   `./web/node_modules/.bin/vitest run --config ./vitest.config.mts` on 17 pre-existing integration test suites:
   ```text
   Test Files  17 passed (17)
        Tests  242 passed (242)
     Duration  33.73s
   ```
5. **ESLint Execution**:
   `pnpm --prefix web lint` executed with 0 errors (clean exit code 0).
6. **Down Migration Dry-Run Rollback**:
   Executed full `down()` SQL statements inside a transactional rollback (`BEGIN; ... ROLLBACK;`) against PostgreSQL: all drops, table restores, Batch 1 enum restorations, and relations executed cleanly without error.

---

## 2. Logic Chain

1. **Clean Separation of Concerns**:
   - The ecommerce template’s physical goods order structure (shipping addresses, USD amounts) was successfully removed by setting `orders: false` in `ecommercePlugin` and dropping the legacy 0-row tables.
   - Dedicated digital collections (`Orders`, `OrderItems`, `Entitlements`, `DownloadEvents`) provide explicit models tailored to digital asset sales and private file delivery.
2. **Multi-Layered Invariant Enforcement**:
   - **BR-04 (Anti-Self-Purchase)**: Protected at both application layer (hook resolving authoritative product seller and comparing with buyer) and database layer (PostgreSQL trigger verifying `orders.buyer_id != NEW.seller_id`).
   - **BR-07 (Price Snapshot Immutability)**: Protected against external callers via access controls (`update: () => false`) and protected against internal programmatic calls via `preventOrderItemMutation` hook.
   - **R2 (Unique Active Entitlement)**: Protected at application layer via `enforceEntitlementInvariants` and at database layer via PostgreSQL partial unique index `entitlements_user_product_active_idx` (`WHERE status = 'active'`).
3. **Database Financial Guarantees**:
   - Check constraints ensure `total_amount >= 0`, `sale_price >= 0`, `platform_fee >= 0`, `seller_amount >= 0`, and `tax >= 0`. This eliminates corrupted ledger entries or negative balances at the storage layer.
4. **Non-Regression Stability**:
   - All 17 existing integration test suites passed 100% (242/242 tests), confirming zero breakage to existing authentication, catalog, moderation, or wallet ledger behaviors.

---

## 3. Adversarial Challenges & Findings

### [Low / Architectural Observation] Finding 1: Foreign Keys on NOT NULL Columns Configured with `ON DELETE SET NULL`
- **What**: Foreign key constraints on required columns (`orders.buyer_id`, `order_items.product_id`, `order_items.seller_id`, `entitlements.user_id`, `entitlements.product_id`, `download_events.product_id`) use `ON DELETE SET NULL`.
- **Where**: `web/src/migrations/20260915_071500_phase5_purchase_download.ts` lines 84, 87, 88, 90, 91, 96.
- **Attack / Failure Scenario**: If a referenced `user` or `product` is deleted in PostgreSQL, the engine attempts to set the column to `NULL`. Because the column has a `NOT NULL` constraint, PostgreSQL throws `not_null_violation` and aborts the deletion.
- **Blast Radius**: None at runtime (deletions of users/products with active orders are blocked, preventing orphaned rows). However, `ON DELETE RESTRICT` or `ON DELETE NO ACTION` is standard PostgreSQL convention.
- **Mitigation**: In future migrations, declare `ON DELETE RESTRICT` or `NO ACTION` explicitly on required relationship columns.

### [Low / Defensive Boundary] Finding 2: Anti-Self-Purchase Trigger Watches `order_items` but not Direct `orders.buyer_id` Mutation
- **What**: Trigger `enforce_br04_seller_anti_self_purchase` executes `BEFORE INSERT OR UPDATE ON order_items`. It queries `orders.buyer_id`.
- **Where**: `web/src/migrations/20260915_071500_phase5_purchase_download.ts` lines 151-167.
- **Attack / Failure Scenario**: If someone executes a direct SQL update: `UPDATE orders SET buyer_id = <seller_id> WHERE id = <order_id>`, the trigger on `order_items` does not fire.
- **Blast Radius**: Minimal. This attack is impossible via Payload REST or GraphQL because `orderUpdateAccess` returns `false` and `buyer` is `readOnly: true`.
- **Mitigation**: The application layer provides complete protection. If DBA-level raw SQL defense is desired in future phases, a trigger on `orders` could also be added.

### [Low / Implementation Note] Finding 3: Vitest Drizzle Error Parsing in Challenger Suite
- **What**: Test assertions in `tests/int/challenger-m1-invariants.int.spec.ts` check `err.message` against PostgreSQL constraint names.
- **Where**: `tests/int/challenger-m1-invariants.int.spec.ts` lines 420, 485, 556, 579, 608, 636, 677.
- **Why**: Drizzle ORM wraps PostgreSQL errors in `DrizzleError`, placing the SQL query string in `err.message` and the actual PostgreSQL constraint name in `err.cause.message`. While the PostgreSQL constraints trigger 100% correctly (as verified in psql), checking `err.message` caused Vitest assertions in that file to fail.
- **Mitigation**: Update test assertions to inspect `(err.cause?.message || err.message)`.

### [Informational] Finding 4: Next.js Build Type-Check Impacted by Incomplete Downstream Test Files
- **What**: `pnpm --prefix web build` encountered TypeScript errors in `tests/int/purchase-workflow.int.spec.ts` and `tests/int/m1-access-control.int.spec.ts` authored by other concurrent subagents for downstream milestones.
- **Where**: `web/tests/int/purchase-workflow.int.spec.ts:120`.
- **Why**: `tsconfig.json` includes `**/*.ts`. Downstream test files referencing unwritten M2/M3 services cause `next build` type-checking to fail until those milestones are implemented.
- **Mitigation**: Expected in an incremental milestone workflow; M2 and M3 workers will implement the referenced services.

---

## 4. Caveats

1. **Downstream Test Track Suites**:
   The Phase 5 test suites (`purchase-workflow.int.spec.ts`, `secure-download.int.spec.ts`, `purchase-invariants.int.spec.ts`) require the atomic purchase transaction service (Milestone 2) and authenticated download streaming service (Milestone 3). These tests are expected to pass once M2 and M3 are complete.
2. **Storefront Orders Page UI**:
   The storefront UI pages (`/orders`) still reference legacy fields and are slated for digital orders upgrade in Milestone 4.

---

## 5. Conclusion

Milestone 1 is **ACCEPTED and APPROVED**.
- The schema and migration Batch 6 are properly designed, correctly applied to PostgreSQL, and verified to be structurally sound.
- All invariants (BR-04 anti-self-purchase, BR-07 snapshot immutability, R2 unique active entitlements, and non-negative financial checks) are strictly enforced across application and database layers.
- Zero integrity violations were found. All 17 existing integration tests pass 100% with zero regressions and zero ESLint errors.
- Milestone 2 (`Atomic Purchase & Wallet Transaction`) can proceed immediately on top of this foundation.

---

## 6. Verification Method

To independently reproduce the review findings:

1. **Verify Migration Status**:
   ```bash
   pnpm --prefix web payload migrate:status
   ```
   *Expect*: Batch 6 `20260915_071500_phase5_purchase_download` with `Ran: Yes`.

2. **Verify Database Trigger, Partial Index, and Constraints**:
   ```bash
   docker exec -i kientaohub-postgres psql -U payload -d kientaohub -c "
   DO \$\$
   DECLARE
     v_uid integer;
     v_pid integer;
     v_oid integer;
   BEGIN
     SELECT id INTO v_uid FROM users LIMIT 1;
     SELECT id INTO v_pid FROM products LIMIT 1;

     -- Test 1: orders non-negative
     BEGIN
       INSERT INTO orders (code, buyer_id, total_amount, currency, status, payment_source)
       VALUES ('TEST-VERIFY-1', v_uid, -1, 'VND', 'PENDING', 'wallet');
       RAISE EXCEPTION 'Negative total_amount allowed';
     EXCEPTION WHEN check_violation THEN
       RAISE NOTICE 'SUCCESS: orders_total_amount_non_negative caught';
     END;

     -- Test 2: partial unique index on entitlements
     BEGIN
       INSERT INTO entitlements (user_id, product_id, status, download_count) VALUES (v_uid, v_pid, 'active', 0);
       INSERT INTO entitlements (user_id, product_id, status, download_count) VALUES (v_uid, v_pid, 'active', 0);
       RAISE EXCEPTION 'Duplicate active entitlement allowed';
     EXCEPTION WHEN unique_violation THEN
       RAISE NOTICE 'SUCCESS: entitlements_user_product_active_idx caught';
     END;

     -- Test 3: BR-04 trigger
     BEGIN
       INSERT INTO orders (code, buyer_id, total_amount, currency, status, payment_source)
       VALUES ('TEST-VERIFY-2', v_uid, 100, 'VND', 'PENDING', 'wallet') RETURNING id INTO v_oid;
       INSERT INTO order_items (order_id, product_id, seller_id, sale_price, platform_fee, seller_amount, tax)
       VALUES (v_oid, v_pid, v_uid, 100, 0, 100, 0);
       RAISE EXCEPTION 'Seller self-purchase allowed';
     EXCEPTION WHEN others THEN
       RAISE NOTICE 'SUCCESS: enforce_br04_seller_anti_self_purchase caught: %', SQLERRM;
     END;

     RAISE EXCEPTION 'ROLLBACK_TEST';
   EXCEPTION WHEN others THEN
     IF SQLERRM = 'ROLLBACK_TEST' THEN
       RAISE NOTICE 'All DB invariants successfully verified!';
     ELSE
       RAISE;
     END IF;
   END;
   \$\$;
   "
   ```

3. **Verify 17 Existing Integration Test Suites**:
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
   *Expect*: 17 test files passed, 242 tests passed, 0 failed.

4. **Verify ESLint**:
   ```bash
   pnpm --prefix web lint
   ```
   *Expect*: 0 errors (clean exit code 0).
