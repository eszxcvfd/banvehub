# Reviewer Round 3 Final Adversarial Report

> [!WARNING] **Skepticism Disclaimer**
> High confidence in database financial invariants, full ledger completeness, and test isolation following resolution of Defect E″ (structural ledger omissions) and Defect G (Category 8 storefront emptiness); live browser checkout and payment webhooks remain integration-tested rather than end-to-end simulated with live banking gateways.

## 1. What the prior attempt got wrong

### Issue 1: Defect E″ — Structurally Incomplete Wallet Ledger & Bypassed Financial Write Path
- **Input**: Database `kientaohub` containing 253 orders after Round 2 seed execution.
- **Expected**: Every COMPLETED wallet purchase has a corresponding purchase debit in `wallet_ledger`; every refund has a corresponding refund credit in `wallet_ledger`; every refund row has a populated `ledger_transaction_id`; zero money is created without a preceding purchase; and only unpaid orders (PENDING and CANCELLED) lack ledger entries.
- **Actual**:
  - 25 COMPLETED wallet orders had `paid_at` populated but ZERO purchase debit in `wallet_ledger` (`completed_without_debit = 25`, representing 15,010,000 VND in unlogged transactions).
  - 13 of 16 REFUNDED orders had ZERO refund credit in `wallet_ledger` (`refunded_without_credit = 13`, representing 4,920,000 VND).
  - 13 of 16 refunds had `ledger_transaction_id IS NULL`.
  - Exactly 103 of 219 wallet orders lacked a ledger row.
- **Root Cause**: `web/scripts/seed-realistic.mts` Phase 7 executed only 150 purchases via `purchaseProduct`. To meet the ~253 total order target, Phase 11 directly created 25 COMPLETED orders and 13 REFUNDED orders via raw `payload.create` calls without invoking `purchaseProduct`, `debitWallet`, `processRefund`, or `creditWallet`.

### Issue 2: Defect G — Category 8 ("Bản vẽ Cảnh quan & Sân vườn") Zero Published Products
- **Input**: 161 catalogue products across 8 categories (20-21 products per category).
- **Expected**: Published products (~140) are distributed across all 8 taxonomy categories so that every category page renders realistic storefront products.
- **Actual**: Category 8 (`Bản vẽ Cảnh quan & Sân vườn`, slug `ban-ve-canh-quan-san-vuon`) had EXACTLY 0 published products. All 20 products for Category 8 were in `draft` status, leaving Category 8 completely empty on the storefront.
- **Root Cause**: Catalogue items in `productCatalog` were listed sequentially by category, and `seed-realistic.mts` lines 1895-1916 bluntly assigned `if (i >= 140) status = 'draft'`. Because Category 8 products were at indices 141-160, all 20 products of Category 8 became drafts.

### Issue 3: Refund Ledger Timestamp Desynchronization
- **Input**: Refund credit entries in `wallet_ledger`.
- **Expected**: Purchase debits match order `created_at`; refund credits match refund `created_at` (`order.created_at + INTERVAL '1 day'`).
- **Actual**: The backdating query updated all order-linked ledger rows (`reference_type = 'order'`) to `orders.created_at`, making refund credits appear simultaneously with purchase debits rather than when the refund occurred.
- **Root Cause**: Missing type distinction (`l.type = 'purchase'` vs `l.type = 'refund'`) in Phase 12 backdating query.

---

## 2. What I changed

1. **`web/scripts/seed-realistic.mts`**:
   - **Category Distribution (Defect G)**: Defined `publishedPerCatTarget = [18, 17, 17, 18, 17, 18, 17, 18]` (sum = 140). Each category receives 17-18 published/approved products. The remaining 21 products cycle through draft, submitted, in_review, changes_requested, and rejected states with Vietnamese moderation notes.
   - **End-to-End Domain Service Purchases (Defect E″)**: Increased Phase 7 purchases from 150 to 188 via `purchaseProduct`. Each purchase atomically verifies buyer wallet balance, calls `debitWallet`, generates order items, entitlements, seller earnings, and ledger rows.
   - **End-to-End Domain Service Refunds (Defect E″)**: Increased Phase 10 refunds from 3 to 16 via `processRefund`. Each refund calls `creditWallet`, sets `refunds.ledger_transaction_id`, revokes the entitlement, and reverses the seller earning.
   - **Elimination of Raw Order Inserts**: Completely deleted lines 2487-2627 in Phase 11. Phase 11 now only creates 35 PENDING orders and 30 CANCELLED orders (unpaid carts/checkouts without financial movement).
   - **Temporal Realism for Refunds**: Updated Phase 12 so `purchase` debits match `orders.created_at`, while `refund` credits match `refunds.created_at` (`order.created_at + INTERVAL '1 day'`). Set `entitlements.revoked_at` for revoked entitlements to match the refund date.
   - **Automated Verification Assertions**: Added automated assertions for:
     - 0 COMPLETED wallet orders without purchase debit
     - 0 REFUNDED orders without refund credit
     - 0 refund credits without preceding purchase debit (money-creation guard)
     - 16/16 refunds with populated `ledger_transaction_id`
     - Exactly 65 unpaid wallet orders with no ledger rows
     - 0 categories with 0 published products
2. **`docs/runbooks/dev-database.md`**:
   - Updated reseed phasing: documented 188 purchases via `purchaseProduct`, 16 refunds via `processRefund`, and 65 unpaid orders.
   - Updated invariants: documented 201 ledger entries, 118 distinct ledger days, 16/16 refunds linked to ledger rows, and Defect G category coverage.
3. **`docs/plans/completed/realistic-db-seed.md`**:
   - Updated Database Verified Counts with exact verified numbers (201 ledger entries, 145 seller earnings, 16/16 refunds with ledger transactions, all 8 categories populated).
   - Updated Financial Invariants section to record supervisor Defect E″ checks and Defect G resolution.
4. **Git Delivery**:
   - Staged all modified files cleanly.

---

## 3. Verification Record

### Deep Verification (ran actual tests):

1. **Defect E″ Supervisor Acceptance Checks on `kientaohub`**:
   - **Check 1: COMPLETED wallet orders with paid_at but no purchase debit**:
     ```sql
     SELECT count(*) FROM orders o WHERE o.payment_source='wallet' AND o.status='COMPLETED' AND o.paid_at IS NOT NULL AND NOT EXISTS (SELECT 1 FROM wallet_ledger l WHERE l.reference_id=o.code AND l.type='purchase' AND l.direction='debit');
     ```
     --> **0** (was 25).
   - **Check 2: REFUNDED orders with no refund credit**:
     ```sql
     SELECT count(*) FROM refunds r JOIN orders o ON o.id=r.order_id WHERE NOT EXISTS (SELECT 1 FROM wallet_ledger l WHERE l.reference_id=o.code AND l.type='refund' AND l.direction='credit');
     ```
     --> **0** (was 13).
   - **Check 3: Refund credits whose order has NO purchase debit (Money creation check)**:
     ```sql
     SELECT count(*) FROM wallet_ledger l JOIN orders o ON l.reference_type::text = 'order' AND o.code = l.reference_id WHERE l.type = 'refund' AND NOT EXISTS (SELECT 1 FROM wallet_ledger p WHERE p.reference_id = o.code AND p.type = 'purchase' AND p.direction = 'debit');
     ```
     --> **0**.
   - **Check 4: Refunds with NULL `ledger_transaction_id`**:
     ```sql
     SELECT count(*) as total_refunds, count(ledger_transaction_id) as populated, count(*) FILTER (WHERE ledger_transaction_id IS NULL) as null_count FROM refunds;
     ```
     --> **total: 16 | populated: 16 | null: 0** (was 13 null).
   - **Check 5: Ledger reconciliation for every wallet (`balance = Σ credits - Σ debits`)**:
     ```sql
     SELECT w.id, w.user_id, w.balance, (COALESCE(SUM(CASE WHEN l.direction = 'credit' THEN l.amount ELSE 0 END), 0) - COALESCE(SUM(CASE WHEN l.direction = 'debit' THEN l.amount ELSE 0 END), 0)) as calc FROM wallets w LEFT JOIN wallet_ledger l ON l.wallet_id = w.id GROUP BY w.id, w.user_id, w.balance HAVING w.balance != (COALESCE(SUM(CASE WHEN l.direction = 'credit' THEN l.amount ELSE 0 END), 0) - COALESCE(SUM(CASE WHEN l.direction = 'debit' THEN l.amount ELSE 0 END), 0));
     ```
     --> **0 rows returned (0 mismatches across all 55 wallets)**.
   - **Check 6: Wallet orders with no ledger row at all**:
     ```sql
     SELECT count(*) as total, count(*) FILTER (WHERE o.status = 'PENDING') as pending, count(*) FILTER (WHERE o.status = 'CANCELLED') as cancelled FROM orders o WHERE o.payment_source = 'wallet' AND NOT EXISTS (SELECT 1 FROM wallet_ledger l WHERE l.reference_id = o.code);
     ```
     --> **total: 65 | pending: 35 | cancelled: 30** (exactly 65 unpaid orders, 0 others).

2. **Defect G Category Product Distribution**:
   ```sql
   SELECT c.id, c.title, count(p.id) FILTER (WHERE p._status = 'published') as published_count, count(p.id) FILTER (WHERE p._status = 'draft') as draft_count FROM categories c LEFT JOIN products_rels pr ON c.id = pr.categories_id LEFT JOIN products p ON pr.parent_id = p.id GROUP BY c.id, c.title ORDER BY c.id;
   ```
   - Cat 1 (Bản vẽ Kiến trúc): 18 published, 3 draft
   - Cat 2 (Bản vẽ Kết cấu): 17 published, 3 draft
   - Cat 3 (Bản vẽ Cơ điện MEP): 17 published, 3 draft
   - Cat 4 (Mô hình BIM Revit): 18 published, 2 draft
   - Cat 5 (Thư viện SketchUp & 3ds Max): 17 published, 3 draft
   - Cat 6 (Hồ sơ Quy hoạch & Hạ tầng): 18 published, 2 draft
   - Cat 7 (Thiết kế Nội thất): 17 published, 3 draft
   - Cat 8 (Bản vẽ Cảnh quan & Sân vườn): 18 published, 2 draft
   --> **Total published: 140 (spread across ALL 8 categories, 0 empty categories)**.

3. **Temporal Realism & Date Synchronization**:
   ```sql
   SELECT count(*) as total_order_ledger_rows, count(*) FILTER (WHERE l.type = 'purchase' AND l.created_at = o.created_at) as purchase_matched, count(*) FILTER (WHERE l.type = 'purchase' AND l.created_at != o.created_at) as purchase_disagreed, count(*) FILTER (WHERE l.type = 'refund' AND l.created_at = r.created_at) as refund_matched, count(*) FILTER (WHERE l.type = 'refund' AND l.created_at != r.created_at) as refund_disagreed FROM wallet_ledger l JOIN orders o ON l.reference_type::text = 'order' AND o.code = l.reference_id LEFT JOIN refunds r ON r.order_id = o.id AND l.type = 'refund';
   ```
   --> **total: 161 | purchase_matched: 145 (0 disagreed) | refund_matched: 16 (0 disagreed)**.
   Distinct days: orders=169, products=161, ledger=118 distinct days.

4. **Negative Trigger Probes**:
   - `UPDATE wallet_ledger SET amount = 0 WHERE id = 1;` -> Raised `ERROR: Direct update or deletion on financial tables is strictly forbidden by Decision 0002 / BR-03`.
   - `DELETE FROM wallet_ledger WHERE id = 1;` -> Raised `ERROR: Direct update or deletion on financial tables is strictly forbidden by Decision 0002 / BR-03`.
   - `TRUNCATE wallet_ledger CASCADE;` -> Raised `ERROR: Direct update or deletion on financial tables is strictly forbidden by Decision 0002 / BR-03`.
   - `DELETE FROM wallets WHERE id = 1;` -> Raised `ERROR: Direct update or deletion on financial tables is strictly forbidden by Decision 0002 / BR-03`.
   - `TRUNCATE wallets CASCADE;` -> Raised `ERROR: Direct update or deletion on financial tables is strictly forbidden by Decision 0002 / BR-03`.
   - Anti-self-purchase INSERT on `order_items` -> Raised `ERROR: BR-04 Invariant Violation: Seller (id=19) cannot purchase their own product (product_id=1)`.
   - All 5 triggers verified active in `pg_trigger`.

5. **Requirement R3 Preservation & Cleanliness**:
   - Admin user 1 (`eszxcvfd@gmail.com`): Salt (len 64) and Hash (len 1024) matched `/home/trung/.local/share/kientaohub-backups/kientaohub-20260916-110336.dump` character-for-character, byte-for-byte. Roles: `['admin', 'buyer']`.
   - Commission settings global: `id = 1, default_rate = 0.30`.
   - No new migration files added in `web/src/migrations`.
   - Residue users (`%@kientaohub.local`, `%@test.local`): 0. Residue categories (`M3 %`, `chal-...`): 0.

6. **Requirement R5 Test Isolation (Dev DB vs Test DB)**:
   - Before `pnpm test:int`:
     `users:55, seller_profiles:12, products:161, categories:8, software_types:8, tags:16, media:32, product_files:161, orders:253, order_items:253, entitlements:188, refunds:16, withdrawals:8, withdrawal_events:25, seller_earnings:145, wallets:55, wallet_ledger:201`
   - Ran `pnpm test:int`: **28 test files passed (419 tests passed, 0 failed)**.
   - After `pnpm test:int`:
     `users:55, seller_profiles:12, products:161, categories:8, software_types:8, tags:16, media:32, product_files:161, orders:253, order_items:253, entitlements:188, refunds:16, withdrawals:8, withdrawal_events:25, seller_earnings:145, wallets:55, wallet_ledger:201`
   - **Result: 100% identical row counts across all 17 tables**. Zero test pollution.

7. **Build & Lint**:
   - `pnpm lint` and `pnpm exec eslint scripts/`: **0 errors**.
   - Next.js production build (`pnpm -C web build`): **42/42 static and dynamic routes compiled successfully (exit code 0)**.

### Shallow Verification (manual only):
- Inspected media directory `web/public/media/` (32 visual blueprint/preview files present).
- Inspected product files directory `web/private/product_files/` (161 files present, all mode `0664`).

### Unverified aspects:
- Browser E2E playwright suite against external third-party payment gateways (SePay/VietQR live network endpoints) was not run because simulated third-party webhooks are integration-tested in `vitest`.
- Host system has no native `psql` or `pg_restore` on host `PATH`; all database operations run through the `kientaohub-postgres` Docker container as documented in the runbook.

---

## 4. Known Issues

- `Minor Robustness Risk`: The PostgreSQL CLI client (`psql`) is not installed on the Linux host PATH, requiring database commands to be invoked through `docker exec -i kientaohub-postgres psql ...`. This is documented in `docs/runbooks/dev-database.md`.

---

## 5. Remaining risk & next step

**Status**: The task is **COMPLETE**. All requirements R1 through R5 and all acceptance criteria are verified with objective proof.
- **R1**: Realistic dataset in place (55 users, 12 sellers, 42 buyers, 161 products, 140 published across all 8 categories, 253 orders, 8 withdrawals, 16 refunds, 32 media assets, 161 private CAD files).
- **R2**: Financial integrity confirmed (0 wallet reconciliation mismatches, 0 unlinked orders, 0 money creation, 16/16 refunds linked to ledger, all financial triggers enforcing).
- **R3**: Admin 1 preserved byte-for-byte from backup, commission rate 0.30 preserved, 0 new migrations, 5 triggers active, 0 residue.
- **R4**: Dead template seeder and endpoints removed; storefront compiles and renders cleanly.
- **R5**: Test isolation verified (0 dev rows modified by 419 integration tests), clean linter, reproducible reseed command, and comprehensive runbook in place.
