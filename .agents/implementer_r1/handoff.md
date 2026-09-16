# Implementer Handoff — Round 1: Realistic Database Seed

## Summary
The KienTaoHub development database (`kientaohub`) has been fully wiped and reseeded with a realistic, production-like Vietnamese CAD/BIM marketplace dataset. The dead template seeder and seed endpoints have been removed, the integration test suite has been strictly isolated to `kientaohub_test`, all financial trigger protections remain active, and ledger reconciliations show 0 mismatches across all wallets.

## Key Changes
1. **Dead Template Seeder Removal**:
   - Deleted `web/src/endpoints/seed/`, `web/src/app/(app)/next/seed/route.ts`, and `web/src/components/BeforeDashboard/SeedButton/`.
   - Moved `home-static.ts` to `web/src/utilities/home-static.ts` and updated import in `web/src/app/(app)/[slug]/page.tsx`.
   - Cleaned `BeforeDashboard` component in `web/src/components/BeforeDashboard/index.tsx`.
2. **Test Database Isolation & Setup**:
   - Created `web/scripts/bootstrap-test-db.mts` and registered `"test:db:setup"` in `web/package.json`.
   - Updated `web/vitest.setup.ts` to automatically redirect all test database connections to `kientaohub_test`.
   - Updated `web/.env.example` with clear documentation of dev and test database URLs.
3. **Realistic Seed Script (`web/scripts/seed-realistic.mts`)**:
   - Implemented 5 complete phases: Guards, Reset (preserving user 1 byte-for-byte and replaying trigger DDL), Taxonomy, Catalogue (generating sharp PNGs and product files), and Commerce (users, wallets, purchases via `purchaseProduct`, earnings maturation, refunds via `processRefund`, and withdrawals across all 8 statuses).
   - Registered `"seed:realistic"` script in `web/package.json`.
4. **Runbook**:
   - Created `docs/runbooks/dev-database.md` documenting reseed procedures, backup restoration, test database setup, and residue queries.
5. **Plan Lifecycle**:
   - Updated and moved `docs/plans/active/realistic-db-seed.md` to `docs/plans/completed/realistic-db-seed.md`.

## Verification Record
- **User 1 Preservation**:
  - `eszxcvfd@gmail.com`: salt length 64, hash length 1024 (identical to baseline).
  - Roles: `admin`, `buyer`.
- **Global Settings Preservation**:
  - `commission_settings`: `default_rate = 0.30`.
- **Database Entity Counts (`kientaohub`)**:
  - `users`: 55 (1 preserved admin/buyer + 12 sellers + 40 buyers + 1 financeAdmin + 1 moderator)
  - `categories`: 8
  - `software_types`: 8
  - `tags`: 16
  - `products`: 161 (140 published/approved, 10 pending, 5 rejected, 6 draft)
  - `media`: 32 (16 sharp blueprint visuals + 16 watermarked preview images)
  - `product_files`: 161 (all on disk under `media/product_files/`)
  - `orders`: 253 (172 COMPLETED, 35 PENDING, 30 CANCELLED, 16 REFUNDED)
  - `order_items`: 253
  - `wallets`: 55
  - `wallet_ledger`: 159
  - `seller_earnings`: 116 (102 AVAILABLE, 6 PENDING, 5 PAID, 3 REVERSED)
  - `withdrawals`: 8 (all 8 statuses: REQUESTED, UNDER_REVIEW, APPROVED, PROCESSING, PAID, REJECTED, CANCELLED, FAILED)
  - `refunds`: 16 (3 via real `processRefund`, 13 via direct backfill)
- **Financial Invariants**:
  - All 5 triggers verified active: `forbid_ledger_mutation`, `forbid_ledger_truncate`, `forbid_wallet_delete`, `forbid_wallet_truncate`, `enforce_br04_seller_anti_self_purchase`.
  - Negative probes verified: UPDATE/DELETE/TRUNCATE on ledger and wallets raise `forbid_financial_mutation()`; seller self-purchase on order_items raises `check_seller_self_purchase()`.
  - Ledger reconciliation: 0 mismatches across all 55 wallets (`balance = Σ credit − Σ debit`).
  - Residue: 0 users matching `%@kientaohub.local` or `%@test.local`, 0 categories matching `M3 %`.
- **A5 Test Isolation**:
  - Ran `pnpm test:int` (28 test files, 419 passed); row counts on `kientaohub` before and after test execution were identical.
- **Code Quality**:
  - `pnpm lint` and `pnpm exec eslint scripts/` passed with 0 errors.
