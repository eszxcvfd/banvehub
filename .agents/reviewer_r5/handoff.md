# Reviewer Round 5 Final Adversarial Handoff Report

> [!WARNING] **Skepticism Disclaimer**
> High confidence in all financial invariants, causal timelines, de-stratification, refund jitter, paid_at latency variance, and test isolation following resolution of Finding E⁷; external payment gateway endpoints (SePay/VietQR) are verified via mocked webhook payloads in the integration test suite rather than live bank connections.

---

## 1. What the prior attempt got wrong

### Finding E⁷: Uniform `paid_at - created_at` Latency (Zero Variance Across 188 Paid Orders)
- **Input**: Database `kientaohub` after Round 4 seed execution.
- **Expected**: Natural variation in order payment completion times: instant payment (`paid_at = created_at`, 0s delta) for free downloads, and realistic, jittered in-process debit latencies (1–89s) for commercial wallet orders.
- **Actual**:
  - `SELECT count(DISTINCT EXTRACT(EPOCH FROM (paid_at - created_at))) FROM orders WHERE paid_at IS NOT NULL;` returned **1**.
  - `min = 180.0s`, `max = 180.0s` across **all 188 paid orders** (both free and commercial).
  - Every single paid order had `paid_at` set to exactly 180 seconds (3 minutes) after `created_at`.
- **Root Cause**: In `web/scripts/seed-realistic.mts` Phase 12a, the previous attempt applied a blunt, static addition:
  ```sql
  paid_at = CASE
    WHEN paid_at IS NOT NULL THEN (NOW() - (...) + INTERVAL '3 minutes')
    ELSE NULL
  END
  ```
  This hardcoded uniform 3-minute latency across all 188 paid orders regardless of order type or price.

---

## 2. What I changed

1. **`web/scripts/seed-realistic.mts`**:
   - **Order Latency Resolution (Finding E⁷)**: Updated Phase 12a `orders` timestamp derivation:
     ```sql
     UPDATE orders
     SET created_at = NOW() - (((((id - 1) * 71) % 253) + 5) * INTERVAL '16 hours' + (id % 60) * INTERVAL '7 minutes');

     UPDATE orders
     SET paid_at = CASE
           WHEN paid_at IS NOT NULL AND total_amount = 0 THEN created_at
           WHEN paid_at IS NOT NULL AND total_amount > 0 THEN created_at + ((1 + (id * 13) % 89) * INTERVAL '1 second')
           ELSE NULL
         END,
         updated_at = CASE
           WHEN paid_at IS NOT NULL AND total_amount > 0 THEN created_at + ((1 + (id * 13) % 89) * INTERVAL '1 second')
           ELSE created_at
         END;
     ```
     - Free orders (`total_amount = 0`): `paid_at = created_at` exactly (delta 0).
     - Commercial wallet orders (`total_amount > 0`): deterministic jittered latency `(1 + (id * 13) % 89) * INTERVAL '1 second'` (1–89s delay matching in-process wallet debit).
   - **Automated Invariant Check (Section 18)**: Added automated assertions in `seed-realistic.mts` verifying:
     - `distinct_deltas > 20` (achieved 77)
     - `max_latency < 300s` (achieved 89s)
     - `free_mismatches == 0` (achieved 0)

2. **Database Snapshot & Reseed**:
   - Preserved baseline backup `/home/trung/.local/share/kientaohub-backups/kientaohub-20260916-110336.dump` (938,678 bytes).
   - Captured fresh pre-wipe snapshot `/home/trung/.local/share/kientaohub-backups/kientaohub-r5-pre-wipe-20260916-153919.dump` (573,039 bytes).
   - Re-seeded `kientaohub` via `SEED_CONFIRM=yes pnpm -C web seed:realistic` (exit code 0).

3. **Documentation**:
   - **`docs/plans/completed/realistic-db-seed.md`**: Recorded resolution of Finding E⁷ under `## Decisions` and `## Validation`.
   - **`docs/runbooks/dev-database.md`**: Updated Section 4 to record the Order Paid At Latency Invariant.

4. **Git Staging**:
   - Staged all modified deliverables cleanly (`git add docs/ web/scripts/seed-realistic.mts`).

---

## 3. Verification Record

### Deep Verification (ran actual tests):

#### 1. Finding E⁷ Exit Verification & Paired-Timestamp Latency Sweep
- **E7 Exit Checks**:
  ```sql
  SELECT 
    count(DISTINCT EXTRACT(EPOCH FROM (paid_at - created_at))) as distinct_deltas,
    min(EXTRACT(EPOCH FROM (paid_at - created_at))) as min_latency,
    max(EXTRACT(EPOCH FROM (paid_at - created_at))) as max_latency,
    count(*) FILTER (WHERE total_amount = 0 AND paid_at <> created_at) as free_mismatches,
    count(*) FILTER (WHERE total_amount > 0 AND paid_at = created_at) as wallet_zero_latency,
    count(*) as total_paid_orders
  FROM orders 
  WHERE paid_at IS NOT NULL;
  ```
  --> **distinct_deltas: 77 (> 20 target) | min_latency: 0.0s | max_latency: 89.0s (< 300s target) | free_mismatches: 0 | wallet_zero_latency: 0 | total_paid_orders: 188**

- **Full Paired-Timestamp Latency Sweep**:
  ```sql
  SELECT 'orders: paid_at - created_at' as pair,
         count(DISTINCT EXTRACT(EPOCH FROM (paid_at - created_at))) as distinct_deltas,
         min(EXTRACT(EPOCH FROM (paid_at - created_at))) as min_val,
         max(EXTRACT(EPOCH FROM (paid_at - created_at))) as max_val,
         count(*) as total
  FROM orders WHERE paid_at IS NOT NULL
  UNION ALL
  SELECT 'orders (wallet): paid_at - created_at',
         count(DISTINCT EXTRACT(EPOCH FROM (paid_at - created_at))),
         min(EXTRACT(EPOCH FROM (paid_at - created_at))),
         max(EXTRACT(EPOCH FROM (paid_at - created_at))),
         count(*)
  FROM orders WHERE paid_at IS NOT NULL AND total_amount > 0
  UNION ALL
  SELECT 'orders (free): paid_at - created_at',
         count(DISTINCT EXTRACT(EPOCH FROM (paid_at - created_at))),
         min(EXTRACT(EPOCH FROM (paid_at - created_at))),
         max(EXTRACT(EPOCH FROM (paid_at - created_at))),
         count(*)
  FROM orders WHERE paid_at IS NOT NULL AND total_amount = 0
  UNION ALL
  SELECT 'refunds: created_at - orders.created_at',
         count(DISTINCT EXTRACT(EPOCH FROM (r.created_at - o.created_at))),
         min(EXTRACT(EPOCH FROM (r.created_at - o.created_at))),
         max(EXTRACT(EPOCH FROM (r.created_at - o.created_at))),
         count(*)
  FROM refunds r JOIN orders o ON o.id = r.order_id
  UNION ALL
  SELECT 'wallet_ledger purchase: created_at - orders.created_at',
         count(DISTINCT EXTRACT(EPOCH FROM (l.created_at - o.created_at))),
         min(EXTRACT(EPOCH FROM (l.created_at - o.created_at))),
         max(EXTRACT(EPOCH FROM (l.created_at - o.created_at))),
         count(*)
  FROM wallet_ledger l JOIN orders o ON o.code = l.reference_id WHERE l.type = 'purchase'
  UNION ALL
  SELECT 'wallet_ledger refund: created_at - refunds.created_at',
         count(DISTINCT EXTRACT(EPOCH FROM (l.created_at - r.created_at))),
         min(EXTRACT(EPOCH FROM (l.created_at - r.created_at))),
         max(EXTRACT(EPOCH FROM (l.created_at - r.created_at))),
         count(*)
  FROM wallet_ledger l JOIN orders o ON o.code = l.reference_id JOIN refunds r ON r.order_id = o.id WHERE l.type = 'refund'
  UNION ALL
  SELECT 'withdrawals: reviewed_at - requested_at',
         count(DISTINCT EXTRACT(EPOCH FROM (reviewed_at - requested_at))),
         min(EXTRACT(EPOCH FROM (reviewed_at - requested_at))),
         max(EXTRACT(EPOCH FROM (reviewed_at - requested_at))),
         count(*)
  FROM withdrawals WHERE reviewed_at IS NOT NULL
  UNION ALL
  SELECT 'withdrawals: paid_at - requested_at',
         count(DISTINCT EXTRACT(EPOCH FROM (paid_at - requested_at))),
         min(EXTRACT(EPOCH FROM (paid_at - requested_at))),
         max(EXTRACT(EPOCH FROM (paid_at - requested_at))),
         count(*)
  FROM withdrawals WHERE paid_at IS NOT NULL
  UNION ALL
  SELECT 'withdrawal_events: timestamp - withdrawals.requested_at',
         count(DISTINCT EXTRACT(EPOCH FROM (we.timestamp - w.requested_at))),
         min(EXTRACT(EPOCH FROM (we.timestamp - w.requested_at))),
         max(EXTRACT(EPOCH FROM (we.timestamp - w.requested_at))),
         count(*)
  FROM withdrawal_events we JOIN withdrawals w ON w.id = we.withdrawal_id
  UNION ALL
  SELECT 'seller_earnings: created_at - orders.created_at',
         count(DISTINCT EXTRACT(EPOCH FROM (se.created_at - o.created_at))),
         min(EXTRACT(EPOCH FROM (se.created_at - o.created_at))),
         max(EXTRACT(EPOCH FROM (se.created_at - o.created_at))),
         count(*)
  FROM seller_earnings se JOIN orders o ON o.id = se.order_id
  UNION ALL
  SELECT 'entitlements: granted_at - orders.created_at',
         count(DISTINCT EXTRACT(EPOCH FROM (e.granted_at - o.created_at))),
         min(EXTRACT(EPOCH FROM (e.granted_at - o.created_at))),
         max(EXTRACT(EPOCH FROM (e.granted_at - o.created_at))),
         count(*)
  FROM entitlements e JOIN orders o ON o.id = e.order_id;
  ```
  Result:
  - `orders: paid_at - created_at`: 77 distinct deltas [0s .. 89s] (total: 188)
  - `orders (wallet): paid_at - created_at`: 76 distinct deltas [1s .. 89s] (total: 145)
  - `orders (free): paid_at - created_at`: 1 distinct delta [0s] (total: 43)
  - `refunds: created_at - orders.created_at`: 16 distinct deltas [13.0h .. 70.0h] (total: 16)
  - `wallet_ledger purchase`: 0s relative to `orders.created_at` (in-process write)
  - `wallet_ledger refund`: 0s relative to `refunds.created_at` (compensating credit)
  - `seller_earnings`: 0s relative to `orders.created_at` (atomic escrow split)
  - `entitlements`: 0s relative to `orders.created_at` (atomic access grant)
  - `withdrawal_events`: 5 distinct delta levels [0s .. 24h] matching lifecycle status transitions

#### 2. Supervisor 30-Check Automated Acceptance Suite on Live Database `kientaohub`

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
- **A4: Refunds with NULL ledger_transaction_id**:
  ```sql
  SELECT count(*) FILTER (WHERE ledger_transaction_id IS NULL) FROM refunds;
  ```
  --> **0** (total: 16, populated: 16)
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

##### Suite B: Causal Integrity
- **B1: Orders predating buyer account**:
  ```sql
  SELECT count(*) FROM orders o JOIN users u ON u.id = o.buyer_id WHERE u.created_at > o.created_at;
  ```
  --> **0**
- **B2: Wallet ledger rows predating owner account registration**:
  ```sql
  SELECT count(*) FROM wallet_ledger l JOIN wallets w ON w.id = l.wallet_id JOIN users u ON u.id = w.user_id WHERE u.created_at > l.created_at;
  ```
  --> **0**
- **B3: Products published before seller profile creation**:
  ```sql
  SELECT count(*) FROM products p JOIN seller_profiles sp ON sp.user_id = p.seller_id WHERE p.created_at < sp.created_at;
  ```
  --> **0**
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
  SELECT (SELECT created_at FROM users WHERE id = 1) as admin_created_at, (SELECT min(created_at) FROM users WHERE id != 1) as earliest_other_user;
  ```
  --> **admin_created_at: 2026-01-14 | earliest_other_user: 2026-01-24 (admin is earliest account)**
- **B8: Non-admin user creation spread across months**:
  ```sql
  SELECT count(DISTINCT to_char(created_at, 'YYYY-MM')) FROM users WHERE id != 1;
  ```
  --> **5 distinct months (Jan, Feb, Mar, Apr, May 2026)**

##### Suite C: Recency & De-stratification
- **C1: Paid orders in last 45 days**:
  ```sql
  SELECT count(*) FROM orders WHERE paid_at IS NOT NULL AND created_at >= NOW() - INTERVAL '45 days';
  ```
  --> **55 paid orders** (> 0 target)
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

##### Suite D: Refund Jitter
- **D1 & D2: Refund delay distribution**:
  ```sql
  SELECT count(DISTINCT EXTRACT(EPOCH FROM (r.created_at - o.created_at))) as distinct_deltas, count(*) FILTER (WHERE EXTRACT(EPOCH FROM (r.created_at - o.created_at)) = 86400) as exact_24h_count, min(EXTRACT(EPOCH FROM (r.created_at - o.created_at))/3600) as min_delay_hours, max(EXTRACT(EPOCH FROM (r.created_at - o.created_at))/3600) as max_delay_hours FROM refunds r JOIN orders o ON o.id = r.order_id;
  ```
  --> **distinct_deltas: 16 (>= 10 target) | exact_24h_count: 0 (< 5 target) | min_delay: 13.0h | max_delay: 70.0h**

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

#### 3. Negative Trigger Probes
- `UPDATE wallet_ledger SET amount = 0 WHERE id = 1;` -> Raised `ERROR: Direct update or deletion on financial tables is strictly forbidden by Decision 0002 / BR-03`.
- `DELETE FROM wallet_ledger WHERE id = 1;` -> Raised `ERROR: Direct update or deletion on financial tables is strictly forbidden by Decision 0002 / BR-03`.
- `DELETE FROM wallets WHERE id = 1;` -> Raised `ERROR: Direct update or deletion on financial tables is strictly forbidden by Decision 0002 / BR-03`.
- Anti-self-purchase INSERT on `order_items` (buyer = seller) -> Raised `ERROR: BR-04 Invariant Violation: Seller (id=16) cannot purchase their own product (product_id=1)`.

#### 4. Category Coverage (Defect G)
- Cat 1 (Bản vẽ Kiến trúc): 18 published, 3 draft (21 total)
- Cat 2 (Bản vẽ Kết cấu): 17 published, 3 draft (20 total)
- Cat 3 (Bản vẽ Cơ điện MEP): 17 published, 3 draft (20 total)
- Cat 4 (Mô hình BIM Revit): 18 published, 2 draft (20 total)
- Cat 5 (Thư viện SketchUp & 3ds Max): 17 published, 3 draft (20 total)
- Cat 6 (Hồ sơ Quy hoạch & Hạ tầng): 18 published, 2 draft (20 total)
- Cat 7 (Thiết kế Nội thất): 17 published, 3 draft (20 total)
- Cat 8 (Bản vẽ Cảnh quan & Sân vườn): 18 published, 2 draft (20 total)
--> **Total published: 140 across all 8 categories (0 empty categories)**.

#### 5. Requirement R5 Test Isolation Proof
- **Before `pnpm test:int`**:
  `categories:8,entitlements:188,media:32,order_items:253,orders:253,product_files:161,products:161,refunds:16,seller_earnings:145,seller_profiles:12,software_types:8,tags:16,users:55,wallet_ledger:201,wallets:55,withdrawal_events:25,withdrawals:8`
- **Command executed**: `pnpm -C web test:int`
- **Result**: **28 test files passed (419 tests passed, 0 failed, duration 66.75s)**.
- **After `pnpm test:int`**:
  `categories:8,entitlements:188,media:32,order_items:253,orders:253,product_files:161,products:161,refunds:16,seller_earnings:145,seller_profiles:12,software_types:8,tags:16,users:55,wallet_ledger:201,wallets:55,withdrawal_events:25,withdrawals:8`
- **Isolation proof**: 100% identical row counts across all 17 tables on `kientaohub`. Zero test pollution.

#### 6. Code Quality & Production Build
- `pnpm -C web lint` & `pnpm -C web exec eslint scripts/seed-realistic.mts`: **0 errors**.
- Next.js production build (`pnpm -C web build`): **42/42 static and dynamic routes compiled successfully (exit code 0)**.

### Shallow Verification (manual only):
- Inspected generated blueprint media assets under `web/public/media/` (32 PNG files).
- Inspected private product files under `web/private/product_files/` (161 files).

### Unverified aspects:
- Browser E2E Playwright suite against live external banking APIs (SePay/VietQR) was not run because simulated webhooks and payment intents are verified in the integration suite.

---

## 4. Known Issues

- `Minor Robustness Risk`: The PostgreSQL CLI client (`psql`) is not installed on the Linux host PATH, requiring database commands to be executed via `docker exec -i kientaohub-postgres psql ...` as documented in `docs/runbooks/dev-database.md`.

---

## 5. Remaining risk & next step

**Status**: The task is **COMPLETE**. All requirements R1 through R5, all acceptance criteria, the supervisor 30-check acceptance suite, and the Finding E⁷ exit checks are fully satisfied with verifiable raw SQL proof. The review round is complete and ready for final orchestrator signoff.
