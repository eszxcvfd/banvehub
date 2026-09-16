=== VICTORY AUDIT REPORT ===

VERDICT: VICTORY CONFIRMED

PHASE A — TIMELINE:
  Result: PASS
  Anomalies: none

PHASE B — INTEGRITY CHECK:
  Result: PASS
  Details: Full forensic integrity verification passed across all 11 repository probes and direct empirical SQL tests. All 5 PostgreSQL triggers (forbid_ledger_mutation, forbid_ledger_truncate, forbid_wallet_delete, forbid_wallet_truncate, enforce_br04_seller_anti_self_purchase) are present and enabled; negative trigger probes raise expected exceptions; admin user id=1 credentials and timestamps preserved byte-for-byte; commission default_rate=0.30 preserved; ratified 32-file media set preserved (~1.9 MB); mechanical defects E¹³-E (positive updated_at polarity via true last event touch across all 8 rows, +22.038s to +102.471s), E¹³-N (NULL paid_at on failed withdrawal 8 and all non-PAID rows), and E¹³-J (decoupled statuses: 1:PAID, 2:REJECTED, 3:CANCELLED, 4:PROCESSING, 5:APPROVED, 6:UNDER_REVIEW, 7:REQUESTED, 8:FAILED with corr=0.2381) are verified; Addendum Item A (188 entitlements derived from order paid_at + latency, 0 identical to order created_at) and Items B/C/D (16 refunds spread across 15 distinct days, max delay 567.71h <= 720h, median delay 18.95d < 21d, corr(id, delta_h)=+0.0331 with |r| < 0.35) are verified.

PHASE C — INDEPENDENT TEST EXECUTION:
  Test command: pnpm --prefix web verify:seed && pnpm --prefix web test:int && pnpm --prefix web lint && pnpm --prefix web build
  Your results:
    - verify:seed: 165 PASS / 0 FAIL across 11 probe SQL files
    - verify_e10.sql: 0.00% discordant pairs across all 10 tables, id=1 oldest row in all tables
    - verify_e9.sql: 0 fingerprint columns across 84 timestamp columns, 0 residue 20260916 day-stamps, 40 canonical KTH top-ups joined 1:1 with payment_intents
    - verify_e13_doc.sql: 158 distinct product creation days spanning Feb 15 to Sep 10, 2026
    - Cross-entity cohort matrix: non-zero signups (8, 7, 7, 6, 6, 2) and listings (23, 24, 24, 23, 24, 8) in every trading month (2026-04 through 2026-09)
    - Causal invariants B1–B8: 0 violations across all 8 relationships
    - Headroom (E¹²): max timestamp is 2026-09-12 14:04:56.076+00 (~3.94 days headroom before now())
    - Ledger reconciliation: 0 mismatches across all 55 wallets (balance = Σ credits - Σ debits); 0 negative balances
    - test:int: 28/28 test files passed (419/419 tests) with 0 row count churn on kientaohub (verified test isolation)
    - lint: 0 errors (711 warnings), scripts lint: 0 errors (25 warnings)
    - build: Next.js 16.3.3 production build compiled 42/42 routes with exit code 0
  Claimed results:
    - verify:seed: 165/165 PASS
    - verify_e10.sql: 0.00% discordant pairs across all 10 tables, id=1 oldest
    - verify_e9.sql: 0 fingerprint columns across 84 timestamp columns
    - test:int: 28/28 files passed, 419/419 tests passed, 0 DB mutations
    - lint: 0 errors
    - build: 42/42 routes compiled cleanly
  Match: YES

EVIDENCE (if REJECTED):
  N/A (VICTORY CONFIRMED)

---

## Detailed Empirical Audit Record

### 1. Scope, Provenance & Backups
- **Baseline backups**:
  - `/home/trung/.local/share/kientaohub-backups/kientaohub-20260916-110336.dump` (938,678 bytes) preserved byte-for-byte.
  - `/home/trung/.local/share/kientaohub-backups/kientaohub-pre-seed-20260916.dump` (938,678 bytes) preserved byte-for-byte.
  - Fresh pre-wipe snapshots (`kientaohub-lead-pre-repair-seed-20260916-193400.dump`, `kientaohub-reviewer-r1-pre-wipe-20260916-192703.dump`) verified present in `/home/trung/.local/share/kientaohub-backups/`.
- **Media Asset Set**:
  - `web/public/media/`: exactly 32 files (1.9 MB).
  - `web/private/product_files/`: exactly 161 files (656 KB).
  - Preserved without out-of-scope expansion.

### 2. Timeline Interleaving & Monthly Cohort Matrix (E¹³-A/B/C/G)
Live SQL measurement against `kientaohub`:
```
  month  | signups | listings | orders | refunds | withdrawals 
---------+---------+----------+--------+---------+-------------
 2026-01 |       6 |        0 |      0 |       0 |           0
 2026-02 |       7 |       11 |      0 |       0 |           0
 2026-03 |       6 |       24 |      6 |       0 |           0
 2026-04 |       8 |       23 |     45 |       2 |           0
 2026-05 |       7 |       24 |     47 |       3 |           0
 2026-06 |       7 |       24 |     45 |       2 |           0
 2026-07 |       6 |       23 |     46 |       4 |           2
 2026-08 |       6 |       24 |     46 |       2 |           4
 2026-09 |       2 |        8 |     18 |       3 |           2
```
- Continuous arrivals across 8 months.
- Non-zero signups and listings in every trading month.
- 129 out of 169 trading days have new accounts or listings (only 40 zero-activity days).

### 3. Mechanical Defect Verifications (E¹³-E, E¹³-N, E¹³-J)
Live SQL measurement of all 8 withdrawals:
```
 id |    status    |        requested_at        |        reviewed_at         |          paid_at           |         updated_at         |        max_event_ts        | delta_seconds 
----+--------------+----------------------------+----------------------------+----------------------------+----------------------------+----------------------------+---------------
  1 | PAID         | 2026-07-15 09:36:59.655+00 | 2026-07-15 11:53:26.871+00 | 2026-07-16 11:28:32.964+00 | 2026-07-16 11:29:12.155+00 | 2026-07-16 11:28:32.964+00 |     39.191000
  2 | REJECTED     | 2026-07-24 16:48:32.598+00 | 2026-07-24 18:34:13.428+00 |                            | 2026-07-24 18:35:20.019+00 | 2026-07-24 18:34:13.428+00 |     66.591000
  3 | CANCELLED    | 2026-08-02 05:17:31.039+00 |                            |                            | 2026-08-02 06:14:42.772+00 | 2026-08-02 06:13:00.301+00 |    102.471000
  4 | PROCESSING   | 2026-08-11 14:54:21.538+00 | 2026-08-11 16:44:40.493+00 |                            | 2026-08-11 17:35:41.387+00 | 2026-08-11 17:34:20.761+00 |     80.626000
  5 | APPROVED     | 2026-08-19 07:08:31.75+00  | 2026-08-19 09:39:22.471+00 |                            | 2026-08-19 09:40:25.192+00 | 2026-08-19 09:39:22.471+00 |     62.721000
  6 | UNDER_REVIEW | 2026-08-27 19:31:12.924+00 | 2026-08-27 20:17:21.386+00 |                            | 2026-08-27 20:19:00.44+00  | 2026-08-27 20:17:21.386+00 |     99.054000
  7 | REQUESTED    | 2026-09-04 03:44:54.468+00 |                            |                            | 2026-09-04 03:45:16.506+00 | 2026-09-04 03:44:54.468+00 |     22.038000
  8 | FAILED       | 2026-09-10 12:20:00.028+00 | 2026-09-10 14:30:27.373+00 |                            | 2026-09-10 19:06:47.82+00  | 2026-09-10 19:05:36.252+00 |     71.568000
```
- E¹³-E: All 8 rows have strictly positive deltas (+22.038s to +102.471s) with randomized sub-minute jitter.
- E¹³-N: Withdrawal 8 (status = FAILED) has `paid_at IS NULL`. Rows 2, 3, 4, 5, 6, 7 also correctly carry `NULL`. Only row 1 (PAID) carries `paid_at`.
- E¹³-J: Status sequence decoupled from surrogate ID sequence: `1:PAID, 2:REJECTED, 3:CANCELLED, 4:PROCESSING, 5:APPROVED, 6:UNDER_REVIEW, 7:REQUESTED, 8:FAILED`.

### 4. Addendum Items A–D: Entitlements & Refunds Realism
- **Item A (Entitlements latency separation)**:
  - `total_ent`: 188
  - `eq_order_created`: 0 (zero entitlements identical to `orders.created_at`)
  - `predate_order`: 0
  - `min_latency_sec`: 1.095 s
  - `max_latency_sec`: 15.802 s
  - `distinct_latencies`: 188 (every single grant latency is distinct)
- **Items B/C/D (Refunds delay decoupling & window spread)**:
  - `count`: 16 refunds
  - `min_h`: 135.40 h (>= 13 h)
  - `max_h`: 567.71 h (<= 720 h / 30-day returns policy)
  - `median_days`: 18.95 days (< 21 days)
  - `distinct_days`: 15 distinct calendar days (>= 8)
  - `corr(refunds.id, delta_hours)`: +0.0331 (`|r| < 0.35`)
  - `ledger_transaction_id`: 16/16 rows populated and linked.

### 5. Non-Regression & Financial Invariants
- Admin user id=1 (`eszxcvfd@gmail.com`): email match, salt length 64, hash length 1024, roles `admin,buyer`, created_at `2026-01-14 08:52:56.753+00` byte-for-byte preserved.
- Commission settings: `default_rate = 0.30` preserved.
- Triggers: 5 active triggers confirmed. Negative probes verified live (UPDATE/DELETE on ledger, DELETE on wallets, and self-purchase INSERT on order_items all throw exception).
- Financial ledger balance reconciliation: `balance = Σ credits - Σ debits` across all 55 wallets with **0 mismatches** and **0 negative balances**.
- Causal invariants B1–B8: all return 0 violations.
- Buyer top-ups precede first purchase: 29/29 buyers verified with topup preceding order by >= 19.9 hours.
- Dynamic pool expansion: 0 orders contain products created after the order.
- Headroom (E¹²): max timestamp `2026-09-12 14:04:56.076+00`, ~3.94 days headroom before current wall-clock.

### 6. Test Suite & Isolation
- `pnpm --prefix web test:int`: 28 test files passed, 419 tests passed (duration: 71.37s).
- Database isolation verified: row counts in development database `kientaohub` before and after test execution were byte-for-byte identical (users: 55, products: 161, orders: 253, ledger: 201, entitlements: 188, refunds: 16, withdrawals: 8, events: 25).
- `pnpm --prefix web lint`: 0 errors.
- `pnpm --prefix web exec eslint scripts/`: 0 errors.
- `pnpm --prefix web build`: 42/42 static and dynamic routes compiled cleanly (exit code 0).
