# Reviewer Round 2 Progress

## Status: Complete
- Started: 2026-09-16
- Role: Adversarial Reviewer Round 2

## Execution Summary

### Attack Vector 1: ISSUE-04 — Product ZIP Files & Permissions
- Private product files live in `web/private/product_files/` (configured via `upload.staticDir` in `ProductFiles/index.ts`).
- Software definitions generate real domain CAD/BIM formats: `.dwg`, `.rvt`, `.skp`, `.max`, `.ls`, `.pdf`.
- All 161 generated product files exist on disk with mode `0664` (`-rw-rw-r--`).
- Tested `resolveProductFilePath` and download token/streaming pathways; all 161 database records have matching physical files on disk.

### Attack Vector 2: Media & Previews (Defect E Ratification)
- 32 high-resolution blueprint media files (16 distinct sharp blueprint illustrations + 16 watermarked preview images, ~1.9 MB) deliberately chosen to respect host disk constraints (~11 GB free).
- User explicitly ratified this scope reduction on 2026-09-16. Recorded in `docs/plans/completed/realistic-db-seed.md`.

### Attack Vector 3: Financial Invariants & Defect E'
- Found & fixed Defect E': `wallet_ledger` entries were previously sitting at seed run date.
- Added temporal backdating joining on `orders.code` for order-linked ledger rows and mapping buyer topup entries prior to purchases.
- Temporarily disabled `forbid_ledger_mutation` trigger during the backdate and immediately re-enabled it in a finally block.
- Aligned `withdrawals.requested_at` with `created_at`, plus `reviewed_at` (+2 hours), `paid_at` (+1 day), and progressive `withdrawal_events.timestamp`.
- Reseeded database with `SEED_CONFIRM=yes pnpm seed:realistic`.
- Verified 0 disagreeing dates between `wallet_ledger` and `orders`.
- Verified `wallet_ledger` spans 93 distinct calendar days over ~4 months.
- Verified `withdrawals.requested_at = created_at` for all 8 withdrawals.
- Re-tested all 5 triggers and negative probes; all raise appropriate Decision 0002 / BR-03 and BR-04 exceptions.
- Reconciled all 55 wallets against ledger: 0 mismatches (`balance = Σ credits - Σ debits`).

### Attack Vector 4: Admin User 1 Preservation & Cleanliness
- Extracted user 1 from backup dump `/home/trung/.local/share/kientaohub-backups/kientaohub-20260916-110336.dump` and compared salt/hash against live DB: 100% byte-for-byte identical.
- Global `commission_settings` preserved (`default_rate = 0.30`).
- Zero residue users (`%@kientaohub.local`, `%@test.local`).
- Zero residue categories (`M3 %`, `chal-%`).

### Attack Vector 5: Dead Template Seeder Removal & Deliverable Staging
- Dead template seeder `src/endpoints/seed/`, `SeedButton/`, and seed route cleanly deleted.
- Deliverables staged in Git: `web/scripts/`, `docs/runbooks/`, `docs/plans/completed/realistic-db-seed.md`, `web/src/utilities/home-static.ts`.
- Next.js build compiled cleanly: 42/42 pages, 0 errors.

### Attack Vector 6: Test Isolation & Quality
- Ran `pnpm test:int`: 28 test files, 419 passed.
- Row counts on `kientaohub` before and after test run verified 100% identical across all 12 tables.
- `pnpm lint` and `pnpm exec eslint scripts/` passed with 0 errors.
