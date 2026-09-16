# Reviewer Round 1 — Progress Tracking

## Step 1: Independent Understanding of Requirements
- Task: Replace development database (`kientaohub`) with realistic, coherent, production-like CAD/BIM marketplace dataset.
- Core Requirements:
  1. R1: Coherent Vietnamese CAD/BIM dataset:
     - ~12 seller studios, ~40 buyers.
     - ~140 published products across real taxonomy (8 categories).
     - Working gallery images and watermarked preview for each published product.
     - Working downloadable product files on disk.
     - ~250 orders across all order states (pending, completed, cancelled, refunded) with plausible proportions and matching line items.
     - 8 withdrawals covering every status in withdrawal status enum, with history matching state machine.
     - Handful of refunds produced via refund service, resulting order states consistent.
     - Seller earnings in all supported statuses, matured earnings reflected in wallet balance.
     - Consistent Vietnamese names, taxonomy, prices, dates.
  2. R2: Financial integrity:
     - For every wallet, `balance = Σ credits − Σ debits` (zero mismatches).
     - Balances move only via existing server-side write path / domain services (`purchaseProduct`, `processRefund`, withdrawal service, etc.).
     - Financial guards / triggers still present and enforcing:
       * `forbid_ledger_mutation`
       * `forbid_ledger_truncate`
       * `forbid_wallet_delete`
       * `forbid_wallet_truncate`
       * `enforce_br04_seller_anti_self_purchase`
     - Negative probes raise errors as expected today.
  3. R3: Non-disturbance of pre-existing critical data:
     - User id = 1 (admin) preserved byte-for-byte (id, email, password salt, hash, roles).
     - Commission rate global setting preserved.
     - No new database migrations added.
     - All 5 triggers present.
     - No test residue (e.g. no `%@kientaohub.local`, `%@test.local`, no test-prefixed categories).
  4. R4: Dead template seeder removed:
     - Template seeder code & admin seed endpoints removed.
     - Any needed dependencies (like `home-static.ts` for home page) preserved/moved cleanly.
     - Storefront and admin render cleanly without broken imports or missing seed assets.
  5. R5: Test isolation and runbook:
     - Integration tests do NOT touch development database (`kientaohub`); redirected to test database (`kientaohub_test`).
     - Pre-reseed backup `/home/trung/.local/share/kientaohub-backups/kientaohub-20260916-110336.dump` intact.
     - Runbook in `docs/runbooks/dev-database.md` documenting reseed, backup restore, test DB setup, residue check.
     - Single reproducible command (`pnpm run seed:realistic` or similar).
     - Linting passes cleanly.
     - Plan updated and moved.

## Step 2: Adversarial Audit & Findings
- [x] DEFECT A (BLOCKING): 25 COMPLETED orders created in Phase 11 had NO `entitlements` row.
- [x] DEFECT B (BLOCKING): 13 backfill refunds had `entitlementRevoked = true` pointing at non-existent entitlements.
- [x] DEFECT C (REALISM): All 253 orders and 161 products had timestamps within 17 seconds of each other.
- [x] DEFECT D (MINOR): `seller_profiles.total_sales` was 0 for all 12 sellers, and `commission_rate` was null for all sellers.
- [x] DEFECT E (SCOPE): `media` generated was 32 files / 1.9 MB vs 211 files / ~70 MB. Decision documented in plan.
- [x] SAFETY GUARD BUG: `isTargetDb` used `.includes('/kientaohub')`, which falsely matched `kientaohub_test`. Fixed to parse exact dbName.
- [x] FRONTEND VALIDATION: Verified Next.js queries across `/shop`, `/products/[slug]`, `/orders`, and `/orders/[id]` against all 8 categories.
- [x] A5 ISOLATION: Verified `pnpm test:int` runs against `kientaohub_test` and leaves `kientaohub` counts 100% unchanged.

## Step 3 & 4: Fix & Re-verify
- Applied surgical fixes to `web/scripts/seed-realistic.mts`.
- Reseeded `kientaohub` successfully.
- Re-verified all invariants:
  - 188 entitlements (172 active on 100% of COMPLETED digital orders, 16 revoked on 100% of REFUNDED orders).
  - Orders distributed across 169 distinct calendar days; products across 161 distinct days.
  - All 12 sellers have populated `total_sales` (13-15) and top 3 sellers have custom commission rates (20%, 25%, 22%).
  - 0 ledger mismatches across all 55 wallets.
  - All 5 triggers verified active and negative probes verified.
  - Preserved admin account byte-for-byte.
  - All 28 integration test suites passed (419 tests) with 0 count modifications to `kientaohub`.
  - Linters clean (0 errors).
