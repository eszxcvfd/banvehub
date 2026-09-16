# Reviewer Round 4 Final Adversarial Handoff Report

> [!WARNING] **Skepticism Disclaimer**
> High confidence in database financial invariants, causal ordering, temporal de-stratification, and test isolation following code-level resolution of Findings E⁴, E⁵, and E⁶; live third-party banking gateways (SePay/VietQR network endpoints) remain integration-mocked rather than end-to-end simulated with real bank accounts.

---

## 1. What the prior attempt got wrong

### Finding E⁶: Causal Impossibility (All Orders and Ledger Rows Predating User Accounts)
- **Input**: Database `kientaohub` after Round 3 seed execution.
- **Expected**: Every order, wallet top-up, ledger row, product, entitlement, and refund occurs strictly AFTER its corresponding user account and seller profile was created (`users.created_at < activity.created_at`).
- **Actual**:
  - `SELECT count(*) FROM orders o JOIN users u ON u.id = o.buyer_id WHERE u.created_at > o.created_at;` returned **253** (100% of orders predated the buyer account).
  - `SELECT count(*) FROM wallet_ledger l JOIN wallets w ON w.id = l.wallet_id JOIN users u ON u.id = w.user_id WHERE u.created_at > l.created_at;` returned **201** (100% of ledger transactions predated account registration).
  - `SELECT count(*) FROM products p JOIN seller_profiles sp ON sp.user_id = p.seller_id WHERE p.created_at < sp.created_at;` returned **161** (100% of products were published before the seller profile was created).
  - All 54 newly seeded users had `created_at` sitting at today (`2026-09-16`), while orders were backdated to March–August 2026.
- **Root Cause**: Phase 12 backdated downstream commerce records (`orders`, `products`, `wallet_ledger`, `withdrawals`), but completely omitted backdating for the `users` and `seller_profiles` tables.

### Finding E⁵: Monotone ID-Date Formula & Order Status Stratification
- **Input**: Querying order distribution in the recent 30-day and 45-day windows.
- **Expected**: A healthy, natural mix of COMPLETED, PENDING, CANCELLED, and REFUNDED orders across all months, including recent activity in July, August, and September 2026.
- **Actual**:
  - In the recent 30 days (`NOW() - INTERVAL '30 days'`), there were **0 COMPLETED orders**, **0 REFUNDED orders**, 14 PENDING, and 30 CANCELLED orders.
  - COMPLETED order IDs [1..186] strictly preceded PENDING [189..223], which strictly preceded CANCELLED [224..253].
- **Root Cause**:
  1. `seed-realistic.mts` created orders in sequential batches: 188 purchases via `purchaseProduct`, followed by 35 PENDING orders, followed by 30 CANCELLED orders.
  2. Phase 12 assigned timestamps using a monotone ID-based formula: `created_at = NOW() - ((254 - id) * INTERVAL '16 hours')`. Because `id` and insertion order were strictly correlated, the most recent 30 days only received the final CANCELLED and PENDING batches.

### Finding E⁴: Refund Timestamp Uniformity (Zero Jitter)
- **Input**: Querying refund creation delay relative to the original order (`r.created_at - o.created_at`).
- **Expected**: Realistic customer refund requests occurring anywhere from several hours to a few days after purchase (2–72 hours).
- **Actual**: All 16 refunds had an identical, uniform `+1 day` (86400s) timestamp offset.
- **Root Cause**: Phase 12 bluntly set `r.created_at = o.created_at + INTERVAL '1 day'` with zero variance or jitter.

---

## 2. What I changed

1. **`web/scripts/seed-realistic.mts`**:
   - **Interleaved Order Generation (Check C3 & Finding E⁵)**: Refactored Phase 7 into a single unified loop that interleaves the generation of 188 purchases via `purchaseProduct`, 35 PENDING orders, and 30 CANCELLED orders. This creates overlapping primary key ranges across all statuses (COMPLETED [2, 253], PENDING [6, 239], CANCELLED [8, 245], REFUNDED [1, 241]).
   - **Even Refund Distribution**: Spread the 16 refund candidates evenly across the 188 completed purchases (sampling every 11th completed purchase) rather than slicing the last 16.
   - **Deterministic Permutation Date Distribution (Finding E⁵)**: Applied a coprime modular permutation (`perm_slot = ((id - 1) * 71) % 253`) in Phase 12a to interleave order dates across the full 6 months. This guarantees a healthy mix of paid orders across all 7 calendar months, including 55 paid orders in the recent 45-day window (Jul: 31, Aug: 37, Sep: 19).
   - **Causal Alignment of Products (Finding E⁶)**: In Phase 12b, updated `products` so that every product bought in an order was created 2–5 days BEFORE its earliest purchase (`p.created_at < min(order.created_at)`), with `product_files` updated via subquery join on `products_rels`.
   - **Jittered Refunds (Finding E⁴)**: In Phase 12c, jittered refund creation dates using `r.created_at = o.created_at + ((2 + ((r.id * 17) % 70)) * INTERVAL '1 hour')`. This produces 16 distinct delay deltas ranging from 13 to 70 hours (0 uniform 24h deltas), and synchronizes `entitlements.revoked_at`, `seller_earnings.reversed_at`, and `wallet_ledger` refund credits.
   - **Causal User & Profile Backdating (Finding E⁶)**: In Phase 12e:
     - Admin user `id = 1` preserved as earliest account (`NOW() - INTERVAL '245 days'`).
     - Staff accounts registered 230–235 days ago.
     - 12 sellers backdated across 12 distinct calendar days (`NOW() - (190 + ((u.id % 12) * 3)) * INTERVAL '1 day'`) before any product was published.
     - 12 seller profiles created 1 hour after seller user registration (12 distinct days > 5).
     - 40 buyers backdated 1–3 days prior to their initial wallet top-up across 44 distinct days.
   - **Automated 30-Check Acceptance Suite**: Added assertions 14–17 to `seed-realistic.mts` validating all supervisor acceptance criteria.

2. **Database Snapshot & Reseed**:
   - Preserved baseline backup `/home/trung/.local/share/kientaohub-backups/kientaohub-20260916-110336.dump` (938,678 bytes).
   - Captured fresh pre-wipe snapshot `/home/trung/.local/share/kientaohub-backups/kientaohub-r4-pre-wipe-20260916-151913.dump` (573,039 bytes).
   - Re-seeded `kientaohub` via `SEED_CONFIRM=yes pnpm -C web seed:realistic` (exit code 0).

3. **Documentation**:
   - **`docs/plans/completed/realistic-db-seed.md`**: Documented resolutions for Findings E⁴, E⁵, and E⁶ under `## Decisions`, and updated `## Validation` and `## Result` with the verified 30-check acceptance criteria.
   - **`docs/runbooks/dev-database.md`**: Updated Section 4 to record the temporal de-stratification, causal ordering, and refund jitter invariants.

4. **Git Staging**:
   - Staged all modified code and documentation deliverables cleanly (`git add docs/ web/`).

---

## 3. Verification Record

### Deep Verification (ran actual tests):

#### 1. Supervisor 30-Check Automated Acceptance Suite on Live Database `kientaohub`

##### Suite A: Financials
- **A1: Completed wallet orders without purchase debit**:
  ```sql
  SELECT count(*) FROM orders o WHERE o.payment_source = 'wallet' AND o.status = 'COMPLETED' AND o.paid_at IS NOT NULL AND NOT EXISTS (SELECT 1 FROM wallet_ledger l WHERE l.reference_id = o.code AND l.type = 'purchase' AND l.direction = 'debit');
  ```
  --> **0**
- **A2: Refunded orders without refund credit**:
  ```sql
  SELECT count(*) FROM refunds r JOIN orders o ON o.id = r.order_id WHERE NOT EXISTS (SELECT 1 FROM wallet_ledger l WHERE l.reference_id = o.code AND l.type = 'refund' AND l.direction = 'credit');
  ```
  --> **0**
- **A3: Refund credits without purchase debit (Money-creation check)**:
  ```sql
  SELECT count(*) FROM wallet_ledger l JOIN orders o ON l.reference_type::text = 'order' AND o.code = l.reference_id WHERE l.type = 'refund' AND NOT EXISTS (SELECT 1 FROM wallet_ledger p WHERE p.reference_id = o.code AND p.type = 'purchase' AND p.direction = 'debit');
  ```
  --> **0**
- **A4: Refunds with populated vs NULL `ledger_transaction_id`**:
  ```sql
  SELECT count(*) as total, count(ledger_transaction_id) as populated, count(*) FILTER (WHERE ledger_transaction_id IS NULL) as null_count FROM refunds;
  ```
  --> **total: 16 | populated: 16 | null: 0**
- **A5: Wallet ledger reconciliation (`balance = Σ credits − Σ debits`)**:
  ```sql
  SELECT count(*) FROM (SELECT w.id, w.balance, (COALESCE(SUM(CASE WHEN l.direction = 'credit' THEN l.amount ELSE 0 END), 0) - COALESCE(SUM(CASE WHEN l.direction = 'debit' THEN l.amount ELSE 0 END), 0)) as calc FROM wallets w LEFT JOIN wallet_ledger l ON l.wallet_id = w.id GROUP BY w.id, w.balance HAVING w.balance != (COALESCE(SUM(CASE WHEN l.direction = 'credit' THEN l.amount ELSE 0 END), 0) - COALESCE(SUM(CASE WHEN l.direction = 'debit' THEN l.amount ELSE 0 END), 0))) sub;
  ```
  --> **0 mismatches across all 55 wallets**
- **A6: Negative wallet balances**:
  ```sql
  SELECT count(*) FROM wallets WHERE balance < 0;
  ```
  --> **0**
- **A7: Wallet-paid orders without ledger row**:
  ```sql
  SELECT count(*) FROM orders o WHERE o.payment_source = 'wallet' AND o.status IN ('COMPLETED', 'REFUNDED') AND NOT EXISTS (SELECT 1 FROM wallet_ledger l WHERE l.reference_id = o.code);
  ```
  --> **0**

##### Suite B: E⁶ Causal Integrity
- **B1: Orders whose buyer account was created AFTER the order**:
  ```sql
  SELECT count(*) FROM orders o JOIN users u ON u.id = o.buyer_id WHERE u.created_at > o.created_at;
  ```
  --> **0** (was 253)
- **B2: Wallet ledger rows predating owner's account registration**:
  ```sql
  SELECT count(*) FROM wallet_ledger l JOIN wallets w ON w.id = l.wallet_id JOIN users u ON u.id = w.user_id WHERE u.created_at > l.created_at;
  ```
  --> **0** (was 201)
- **B3: Products published before seller profile creation**:
  ```sql
  SELECT count(*) FROM products p JOIN seller_profiles sp ON sp.user_id = p.seller_id WHERE p.created_at < sp.created_at;
  ```
  --> **0** (was 161)
- **B4: Entitlements predating order creation**:
  ```sql
  SELECT count(*) FROM entitlements e JOIN orders o ON o.id = e.order_id WHERE e.created_at < o.created_at;
  ```
  --> **0**
- **B5: Refunds predating order creation**:
  ```sql
  SELECT count(*) FROM refunds r JOIN orders o ON o.id = r.order_id WHERE r.created_at < o.created_at;
  ```
  --> **0**
- **B6: Distinct creation days**:
  ```sql
  SELECT (SELECT count(DISTINCT created_at::date) FROM users) as user_days, (SELECT count(DISTINCT created_at::date) FROM seller_profiles) as seller_profile_days;
  ```
  --> **user_days: 44 (> 30 target) | seller_profile_days: 12 (> 5 target)**
- **B7: Admin user `id = 1` preserved as earliest account**:
  ```sql
  SELECT (SELECT created_at FROM users WHERE id = 1) as admin_created_at, (SELECT min(created_at) FROM users WHERE id != 1) as earliest_other_user, (SELECT created_at FROM users WHERE id = 1) <= (SELECT min(created_at) FROM users WHERE id != 1) as is_admin_earliest;
  ```
  --> **admin_created_at: 2026-01-14 | earliest_other_user: 2026-01-24 | is_admin_earliest: t**
- **B8: Non-admin user creation spread across months**:
  ```sql
  SELECT min(created_at), max(created_at), count(DISTINCT to_char(created_at, 'YYYY-MM')) FROM users WHERE id != 1;
  ```
  --> **Span: 2026-01-24 to 2026-05-26 | 5 distinct months**

##### Suite C: E⁵ Recency & De-stratification
- **C1: Paid orders in last 45 days**:
  ```sql
  SELECT count(*) FROM orders WHERE paid_at IS NOT NULL AND created_at >= NOW() - INTERVAL '45 days';
  ```
  --> **55 paid orders** (> 0)
- **C2: Paid orders non-zero across all months, Jul/Aug/Sep non-zero**:
  ```sql
  SELECT to_char(created_at, 'YYYY-MM') as month, count(*) as paid_orders FROM orders WHERE paid_at IS NOT NULL GROUP BY to_char(created_at, 'YYYY-MM') ORDER BY month;
  ```
  - `2026-03`: 3
  - `2026-04`: 26
  - `2026-05`: 36
  - `2026-06`: 36
  - `2026-07`: 31
  - `2026-08`: 37
  - `2026-09`: 19
  --> **All 7 months non-zero; Jul=31, Aug=37, Sep=19**
- **C3: Overlapping ID ranges across all statuses**:
  ```sql
  SELECT status, min(id), max(id), count(*) FROM orders GROUP BY status ORDER BY min(id);
  ```
  - `REFUNDED`: min 1, max 241 (count 16)
  - `COMPLETED`: min 2, max 253 (count 172)
  - `PENDING`: min 6, max 239 (count 35)
  - `CANCELLED`: min 8, max 245 (count 30)
  --> **All 4 status ID ranges overlap across [1, 253]**

##### Suite D: E⁴ Refund Jitter
- **D1 & D2: Refund delay distribution**:
  ```sql
  SELECT count(DISTINCT EXTRACT(EPOCH FROM (r.created_at - o.created_at))) as distinct_deltas, count(*) FILTER (WHERE EXTRACT(EPOCH FROM (r.created_at - o.created_at)) = 86400) as exact_24h_count, min(EXTRACT(EPOCH FROM (r.created_at - o.created_at))/3600) as min_delay_hours, max(EXTRACT(EPOCH FROM (r.created_at - o.created_at))/3600) as max_delay_hours FROM refunds r JOIN orders o ON o.id = r.order_id;
  ```
  --> **distinct_deltas: 16 | exact_24h_count: 0 | min_delay: 13.0h | max_delay: 70.0h**

##### Suite E: Preservation & Cleanliness
- **E1: Admin `id = 1` preservation**:
  ```sql
  SELECT u.id, u.email, length(u.salt) as salt_len, length(u.hash) as hash_len, ur.value as role FROM users u JOIN users_roles ur ON ur.parent_id = u.id WHERE u.id = 1;
  ```
  --> `id: 1 | email: eszxcvfd@gmail.com | salt_len: 64 | hash_len: 1024 | roles: ['admin', 'buyer']` (byte-for-byte identical to baseline backup)
- **E2: Commission settings global**:
  ```sql
  SELECT id, default_rate FROM commission_settings;
  ```
  --> `id: 1 | default_rate: 0.30`
- **E3: All 5 triggers enabled**:
  ```sql
  SELECT tgname, relname, tgenabled FROM pg_trigger JOIN pg_class ON pg_trigger.tgrelid = pg_class.oid WHERE NOT tgisinternal;
  ```
  --> All 5 triggers active (`tgenabled = 'O'`):
  - `enforce_br04_seller_anti_self_purchase` on `order_items`
  - `forbid_ledger_mutation` on `wallet_ledger`
  - `forbid_ledger_truncate` on `wallet_ledger`
  - `forbid_wallet_delete` on `wallets`
  - `forbid_wallet_truncate` on `wallets`
- **E4: Exact entity counts**:
  - `users`: 55
  - `products`: 161 (140 published/approved across all 8 categories)
  - `orders`: 253
  - `order_items`: 253
  - `entitlements`: 188
  - `wallet_ledger`: 201
  - `refunds`: 16
  - `withdrawals`: 8
  - `seller_profiles`: 12
  - `categories`: 8

#### 2. Negative Trigger Probes
- `UPDATE wallet_ledger SET amount = 0 WHERE id = 1;` -> Raised `ERROR: Direct update or deletion on financial tables is strictly forbidden by Decision 0002 / BR-03`.
- `DELETE FROM wallet_ledger WHERE id = 1;` -> Raised `ERROR: Direct update or deletion on financial tables is strictly forbidden by Decision 0002 / BR-03`.
- `TRUNCATE wallet_ledger CASCADE;` -> Raised `ERROR: Direct update or deletion on financial tables is strictly forbidden by Decision 0002 / BR-03`.
- `DELETE FROM wallets WHERE id = 1;` -> Raised `ERROR: Direct update or deletion on financial tables is strictly forbidden by Decision 0002 / BR-03`.
- `TRUNCATE wallets CASCADE;` -> Raised `ERROR: Direct update or deletion on financial tables is strictly forbidden by Decision 0002 / BR-03`.
- Anti-self-purchase INSERT on `order_items` (buyer = seller) -> Raised `ERROR: BR-04 Invariant Violation: Seller (id=17) cannot purchase their own product (product_id=1)`.

#### 3. Category Product Distribution (Defect G)
- Cat 1 (Bản vẽ Kiến trúc): 18 published, 3 draft
- Cat 2 (Bản vẽ Kết cấu): 17 published, 3 draft
- Cat 3 (Bản vẽ Cơ điện MEP): 17 published, 3 draft
- Cat 4 (Mô hình BIM Revit): 18 published, 2 draft
- Cat 5 (Thư viện SketchUp & 3ds Max): 17 published, 3 draft
- Cat 6 (Hồ sơ Quy hoạch & Hạ tầng): 18 published, 2 draft
- Cat 7 (Thiết kế Nội thất): 17 published, 3 draft
- Cat 8 (Bản vẽ Cảnh quan & Sân vườn): 18 published, 2 draft
--> **Total published: 140 across all 8 categories (0 empty categories)**.

#### 4. Requirement R5 Test Isolation Proof
- **Before `pnpm test:int`**:
  `users:55, seller_profiles:12, products:161, categories:8, software_types:8, tags:16, media:32, product_files:161, orders:253, order_items:253, entitlements:188, refunds:16, withdrawals:8, withdrawal_events:25, seller_earnings:145, wallets:55, wallet_ledger:201`
- **Command executed**: `pnpm -C web test:int`
- **Result**: **28 test files passed (419 tests passed, 0 failed, duration 69.69s)**.
- **After `pnpm test:int`**:
  `users:55, seller_profiles:12, products:161, categories:8, software_types:8, tags:16, media:32, product_files:161, orders:253, order_items:253, entitlements:188, refunds:16, withdrawals:8, withdrawal_events:25, seller_earnings:145, wallets:55, wallet_ledger:201`
- **Isolation proof**: 100% identical row counts across all 17 tables on `kientaohub`. Zero test pollution.

#### 5. Code Quality & Production Build
- `pnpm -C web lint` & `pnpm -C web exec eslint scripts/seed-realistic.mts`: **0 errors**.
- Next.js production build (`pnpm -C web build`): **42/42 static and dynamic routes compiled successfully (exit code 0)**.

### Shallow Verification (manual only):
- Verified 32 generated blueprint media assets under `web/public/media/`.
- Verified 161 private product files under `web/private/product_files/`.

### Unverified aspects:
- Browser E2E Playwright suite against live external banking APIs (SePay/VietQR) was not run because simulated webhooks and payment intents are verified in the integration suite.

---

## 4. Known Issues

- `Minor Robustness Risk`: The PostgreSQL CLI client (`psql`) is not installed on the Linux host PATH, requiring database commands to be executed via `docker exec -i kientaohub-postgres psql ...` as documented in `docs/runbooks/dev-database.md`.

---

## 5. Remaining risk & next step

**Status**: The task is **COMPLETE**. All requirements R1 through R5, all acceptance criteria, and all 30 supervisor acceptance checks are verified with raw SQL proof. The victory auditor may proceed.
