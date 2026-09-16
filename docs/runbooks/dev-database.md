# Runbook: Development and Test Database Management

This runbook documents how to seed, recover, isolate, and verify the PostgreSQL databases for KienTaoHub (`kientaohub` development database and `kientaohub_test` test database).

## Scope

- **Development database (`kientaohub`)**: holds realistic Vietnamese CAD/BIM marketplace data for local development, UI testing, and storefront rendering.
- **Test database (`kientaohub_test`)**: dedicated, isolated database target for integration test suites (`pnpm test:int`, `test:challenger`, `test:stress`), preventing test pollution of development data.

## Prerequisites

- PostgreSQL 16 container running in Docker:
  ```bash
  docker ps | grep kientaohub-postgres
  ```
  Ports: `127.0.0.1:5433 -> 5432/tcp`. User: `payload`, Database: `kientaohub`.
- **Note on host tools**: `psql` and `pg_dump` are not required on the host `PATH`. Database CLI operations should be executed via the container:
  ```bash
  docker exec -i kientaohub-postgres psql -U payload -d kientaohub -c "<SQL>"
  ```
- Node.js >= 20.9.0, pnpm >= 9.
- Verified backup file:
  `/home/trung/.local/share/kientaohub-backups/kientaohub-20260916-110336.dump` (must never be deleted or overwritten).

---

## 1. How to Reseed the Development Database

To wipe and reseed the development database with a realistic, production-like CAD/BIM dataset:

```bash
cd web
SEED_CONFIRM=yes pnpm seed:realistic
```

Or directly via node:
```bash
cd web
SEED_CONFIRM=yes node --import tsx/esm scripts/seed-realistic.mts
```

### Safety Guards Enforced
The script will refuse to run unless:
1. `DATABASE_URL` host is local (`127.0.0.1` or `localhost`).
2. Database name is `kientaohub` (or overridden with `SEED_ALLOW_DB=yes`).
3. `SEED_CONFIRM=yes` is explicitly passed in the environment.
4. The baseline backup `/home/trung/.local/share/kientaohub-backups/kientaohub-20260916-110336.dump` exists and has verified size.

### Reseed Phasing
1. **Guards**: verifies host, database target, confirmation, and backup.
2. **Reset**: captures user 1 (`eszxcvfd@gmail.com`) credentials (salt/hash) and roles; temporarily drops the two TRUNCATE-guard triggers (`forbid_ledger_truncate` on `wallet_ledger`, `forbid_wallet_truncate` on `wallets`); truncates collection tables with `RESTART IDENTITY CASCADE`; restores user 1 byte-for-byte; cleans generated uploads; restores the triggers in a `finally` block.
3. **Taxonomy**: creates 8 real CAD/BIM categories, 8 software types, and 16 architectural tags.
4. **Commerce Users**: creates 1 finance admin (`finance@kientaohub.vn`), 1 moderator (`moderator@kientaohub.vn`), 12 seller studios (`seller01@kientaohub.vn` ... `seller12@kientaohub.vn` with full `seller_profiles` and bank details), and 40 buyers (`buyer01@kientaohub.vn` ... `buyer40@kientaohub.vn`). Dev password: `KienTao@2026`.
5. **Media & Previews**: generates lightweight PNG blueprints and watermarked previews via `sharp`.
6. **Catalogue**: creates 161 products (140 published/approved across all 8 categories, plus 21 across draft, submitted, in_review, changes_requested, rejected), attaching gallery images, watermarked previews, and private product files.
7. **Purchases**: executes 188 commercial/free purchases via `purchaseProduct` domain service.
8. **Maturation**: advances hold periods and calls `releaseMaturedEarnings`.
9. **Withdrawals**: executes 8 withdrawals covering all 8 statuses (`REQUESTED`, `UNDER_REVIEW`, `APPROVED`, `PROCESSING`, `PAID`, `REJECTED`, `CANCELLED`, `FAILED`).
10. **Refunds**: processes 16 compensating refunds via `processRefund` domain service.
11. **Orders Target**: seeds 35 PENDING and 30 CANCELLED orders to reach 253 total orders (172 COMPLETED, 16 REFUNDED, 35 PENDING, 30 CANCELLED).
12. **Verification**: validates zero residue, zero ledger discrepancies, all 5 triggers active, Defect E'' acceptance checks (0 unlinked orders, 0 money creation, 16/16 refunds linked), and Defect G category coverage (17-18 published products in all 8 categories).

---

## 2. Test Database Bootstrap & Isolation

### Repeatable One-Time Provisioning
On a fresh clone or new environment, provision and migrate the isolated test database:

```bash
cd web
pnpm test:db:setup
```

This runs `web/scripts/bootstrap-test-db.mts`, which:
1. Connects to PostgreSQL and checks if database `kientaohub_test` exists.
2. Creates `kientaohub_test` if missing.
3. Applies all 8 Payload migrations (`pnpm payload migrate`) against `kientaohub_test`.

### Runtime Test Isolation
`web/vitest.setup.ts` automatically redirects `process.env.DATABASE_URL` to `kientaohub_test`:
```ts
const testDbUrl =
  process.env.TEST_DATABASE_URL ||
  (process.env.DATABASE_URL
    ? process.env.DATABASE_URL.replace(/\/kientaohub(\?.*)?$/, '/kientaohub_test$1')
    : 'postgres://payload:payload@127.0.0.1:5433/kientaohub_test')

process.env.DATABASE_URL = testDbUrl
```
Running `pnpm test:int`, `pnpm test:challenger`, or `pnpm test:stress` will target `kientaohub_test` and leave `kientaohub` row counts unchanged.

---

## 3. How to Recover from Backup

If the development database needs to be restored to its baseline snapshot:

```bash
docker exec -i kientaohub-postgres pg_restore -U payload -d kientaohub --clean --if-exists < /home/trung/.local/share/kientaohub-backups/kientaohub-20260916-110336.dump
```

To take a new manual snapshot:
```bash
docker exec kientaohub-postgres pg_dump -U payload -Fc kientaohub > /home/trung/.local/share/kientaohub-backups/kientaohub-manual-$(date +%Y%m%d-%H%M%S).dump
```

---

## 4. Known Residue & Invariants

After reseeding with `pnpm seed:realistic`:
- **Preserved Administrator**: user `id = 1` (`eszxcvfd@gmail.com`), roles: `admin` and `buyer`. Password hash and salt remain unchanged from the backup.
- **Preserved Globals**: `commission_settings` global has `id = 1, default_rate = 0.30`.
- **Residue users**: 0 users matching `%@kientaohub.local` or `%@test.local`.
- **Residue categories**: 0 categories with test prefixes (`M3 ...` or `chal-...`).
- **Ledger Invariant**: For every wallet, `balance = Σ credits - Σ debits` with **0 mismatches**. All 172 COMPLETED orders have purchase debits; all 16 REFUNDED orders have both purchase debit and refund credit; 16/16 refunds have populated `ledger_transaction_id`; exactly 65 unpaid orders (35 PENDING + 30 CANCELLED) have no ledger entries; zero money creation.
- **Entitlements Invariant**: 188 total entitlements (172 active, 16 revoked); 0 completed digital orders without an active entitlement; 0 refunds without a revoked entitlement.
- **Temporal Invariant & De-stratification (Finding E⁵ & E¹³ Resolved)**: Orders, products, and wallet ledger entries are distributed continuously over 8 months (Jan 14 – Sep 12, 2026). Measured live: 169 distinct order days, 158 distinct product days, 145 distinct ledger days, 54 distinct user registration days, 16 distinct refund days. Order creation and order IDs are interleaved across the timeline (188 purchases, 35 pending, 30 cancelled) with overlapping ID ranges across all statuses (COMPLETED [1, 250], PENDING [3, 241], CANCELLED [6, 253], REFUNDED [5, 240]). Monthly cohort distribution reflects realistic growth across all 9 months:
  - 2026-01: 6 users, 0 products, 0 orders
  - 2026-02: 7 users, 11 products, 0 orders
  - 2026-03: 6 users, 24 products, 6 orders
  - 2026-04: 8 users, 23 products, 45 orders, 2 refunds
  - 2026-05: 7 users, 24 products, 47 orders, 4 refunds
  - 2026-06: 7 users, 24 products, 45 orders, 2 refunds
  - 2026-07: 6 users, 23 products, 46 orders, 3 refunds, 2 withdrawals
  - 2026-08: 6 users, 24 products, 46 orders, 3 refunds, 4 withdrawals
  - 2026-09: 2 users, 8 products, 18 orders, 2 refunds, 2 withdrawals
- **Causal Ordering Invariant (Finding E⁶ Resolved)**: User accounts (54 distinct registration days) and seller profiles (12 distinct creation days) strictly precede all downstream activity: admin user id=1 is preserved as earliest account (245 days ago), staff accounts registered 230–235 days ago, seller studios registered 190–223 days ago across 12 distinct calendar days before publishing products, and buyer accounts registered 1–3 days prior to wallet top-ups across 54 distinct days. Zero orders, ledger rows, products, entitlements, or refunds predate their owner's registration.
- **Refund Jitter & Decoupling Invariant (Supervisor D1–D4 & Addendum Items B/C/D)**: All 16 refunds possess irregular, decoupled delay intervals:
  - Max delay: 320.19 hours (well within <= 720h / 30-day ceiling).
  - Spread across 16 distinct calendar days (threshold >= 8).
  - Median delay: 6.39 days (threshold < 21 days).
  - Correlation: `corr(id, delay_h) = -0.181` (strictly below `|r| < 0.35` threshold).
- **Order Paid At Latency Invariant (Finding E⁷ Resolved)**: Free orders (total_amount = 0) have `paid_at = created_at` exactly (0s delay); wallet orders (total_amount > 0) have realistic jittered payment latencies between 1s and 90s across 146 distinct intervals (0 uniform 180s delays; max delay 89.45s < 300s).
- **Entitlements Latency Separation (Addendum Item A)**: Entitlements are causally derived from `orders.paid_at + grant_latency` (1.08s to 15.99s across 186 distinct latencies), with 0 entitlements byte-identical to `orders.created_at` and 0 predating order payment.
- **Human-Readable Identifier & Lockstep Date Invariant (Finding E⁸ Resolved)**: All human-readable business codes match each entity's own backdated `created_at` timestamp with zero mismatches:
  - `orders.code`: 253/253 orders match `ORD-YYYYMMDD-<6-HEX>` with date identical to `orders.created_at`; artificial prefixes (`ORD-PENDING-` and `ORD-CANCEL-`) are 100% eliminated.
  - `refunds.code`: 16/16 refunds match `REF-YYYYMMDD-<6-HEX>` with date identical to `refunds.created_at`.
  - `withdrawals.code`: 8/8 withdrawals match `WTH-YYYYMMDD-<8-HEX>` with date identical to `withdrawals.created_at`.
  - In lockstep, `wallet_ledger.reference_id` is synchronized to the matching `orders.code`, and both `wallet_ledger.description` and `orders.notes` embed the updated codes with 0 orphaned ledger rows and 0 residue 20260916 day-stamps across all business tables.
- **Chronological ID Monotonicity Invariant (Finding E¹⁰ Resolved)**: In natural databases, auto-increment surrogate IDs and timestamps progress forward together. The seed assigns timestamps via strictly positive cumulative step functions (`anchor + sum(step)`), ensuring **0.00% discordant pairs** across all 8 tables (`orders`, `products`, `users`, `wallet_ledger`, `entitlements`, `seller_earnings`, `refunds`, `withdrawal_events`), with `id = 1` as the oldest entity across all tables and realistic irregular step distributions (252 distinct step values out of 252 steps for orders).
- **Sub-Minute Fingerprint Residue & Canonical Top-Up Invariant (Finding E⁹ Resolved)**:
  - All backdated timestamps include randomized seconds and milliseconds `(random() * 59.999 * INTERVAL '1 second')`, yielding **0 fingerprint columns** across the entire database schema (verified by dynamic `information_schema` scan).
  - All 40 wallet top-ups generate canonical `KTH<base36(ts)><3-digit>` transaction codes lockstep matching topup `created_at` (0 `PI-TOPUP-...` formats, 0 run-instant epoch-ms leakage).
  - 40 matching `PAID` records are populated in `payment_intents` with matching codes, amounts, and expiration timestamps, ensuring **0 orphaned top-up ledger references**.
  - Withdrawal cadence is irregular across 7 distinct gap intervals (1d12h to 4d09h, eliminating constant 70h intervals).
  - Platform administrator `id = 1` (`eszxcvfd@gmail.com`) is byte-for-byte preserved from the backup baseline (`created_at = 2026-01-14 08:52:56.753+00`, salt `39c4aa8dc017d723...`).
- **Withdrawal Lifecycle Invariants (Findings E¹³-E, E¹³-N, E¹³-J)**:
  - E¹³-E (Positive updated_at Polarity): `withdrawals.updated_at` is strictly greater than every touch, including `requested_at`, `reviewed_at`, `paid_at`, and `MAX(we.timestamp)`, with all deltas strictly positive (+43.8s to +67.6s).
  - E¹³-N (NULL paid_at on FAILED): Withdrawal 8 (status `FAILED`) and all other non-PAID withdrawals have `paid_at = NULL`. Only withdrawal 1 (status `PAID`) carries a populated `paid_at`.
  - E¹³-J (Decoupled Status Sequence): Withdrawal statuses are decoupled from surrogate ID sequence: `1:PAID, 2:REJECTED, 3:CANCELLED, 4:PROCESSING, 5:APPROVED, 6:UNDER_REVIEW, 7:REQUESTED, 8:FAILED`.
- **Category Coverage (Defect G)**: All 8 real CAD/BIM categories have 17-18 published products each (140 total published products), ensuring no category page renders empty.
- **Seller Profiles**: All 12 sellers have populated `total_sales` (13-15 each), and top sellers have preferential commission rates (20%, 25%, 22%).
- **Financial Triggers (5 alive)**:
  1. `enforce_br04_seller_anti_self_purchase` on `order_items`
  2. `forbid_ledger_mutation` on `wallet_ledger`
  3. `forbid_ledger_truncate` on `wallet_ledger`
  4. `forbid_wallet_delete` on `wallets`
  5. `forbid_wallet_truncate` on `wallets`
