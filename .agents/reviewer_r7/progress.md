# Reviewer Round 7 Progress Tracker

## Status: COMPLETED
Started: 2026-09-16T16:06:30+07:00
Completed: 2026-09-16T16:37:00+07:00

## Active Directives & Resolutions:
- FINDING E9: Sub-minute residue leakage across 34 fingerprint columns, E9-B (40 topup ledger reference_ids encode epoch_ms), E9-C (constant 70h withdrawal cadence), admin id=1 created_at preservation. -> RESOLVED & VERIFIED.
- FINDING E10: ID <-> created_at coherence (monotone chronological sequence, discordant pairs < 1%, id=1 oldest, de-stratified status without timestamp permutation). -> RESOLVED & VERIFIED.
- FINDING E11: SQLSTATE 42804 in §12c refunds type mismatch & timeline headroom. -> RESOLVED & VERIFIED.

## Execution Sequence:
1. [x] Pre-wipe backup snapshot: `kientaohub-r7-pre-wipe-20260916-161148.dump`
2. [x] Run baseline verification: `verify_e9.sql` (failed 20 notices, E9-B, E9-C) & `verify_e10.sql` (failed ~50% discordant pairs, id=1 inverted)
3. [x] Design & implement Joint Fix (E10 + E9) in `web/scripts/seed-realistic.mts`:
   - [x] E10: Interleave order statuses naturally at creation in Phase 7 (so status is not stratified by ID bands).
   - [x] E10 + E9: Monotone chronological `created_at` for `orders`: `anchor + \sum_{k <= id} step(k)` with irregular positive steps and distinct `SS.MS` subminutes.
   - [x] E10 + E9: Monotone chronological `created_at` for `products` (preceding orders) with distinct `SS.MS`.
   - [x] E10 + E9: Monotone chronological `users` (admin id=1 oldest, staff, sellers, buyers preceding topups) with distinct `SS.MS`.
   - [x] E10 + E9: Chronological `refunds`, `seller_earnings`, `entitlements`, `wallet_ledger`.
   - [x] E9-B & E9-B2: Canonical `KTH...` codes for 40 top-ups, matching 40 `payment_intents` records (`PAID`, 0 orphans).
   - [x] E9-C: Irregular withdrawal intervals and jittered event timestamps.
   - [x] E8: Lockstep code regeneration for orders, refunds, withdrawals, notes, ledger descriptions.
   - [x] Admin id=1: Preserved byte-for-byte (`2026-01-14 08:52:56.753+00`, salt, hash, email).
4. [x] Re-seed database: `SEED_CONFIRM=yes pnpm -C web seed:realistic`.
5. [x] Run `verify_e10.sql`: Confirmed 0.00% discordant pairs and id=1 oldest across tables.
6. [x] Run `verify_e9.sql`: Confirmed 0 FINGERPRINT notices, canonical KTH codes, 40 payment_intents, irregular withdrawals.
7. [x] Run 30-check regression suite (A1-A7, B1-B8, C1-C3, D1-D2, E1-E4).
8. [x] Run integration tests (419/419 passed) & verify database isolation (0 rows changed).
9. [x] Run linter (0 errors).
10. [x] Update documentation (`docs/plans/completed/realistic-db-seed.md`, `docs/runbooks/dev-database.md`).
11. [x] Stage git deliverables and generate handoff report.
