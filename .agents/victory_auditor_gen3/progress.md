# Audit Progress Log

Last visited: 2026-09-16T12:49:00Z
Status: IN_PROGRESS
Phase: Phase C Next.js Production Build

- [x] Initialized DISPATCH.md and BRIEFING.md
- [x] Read ORIGINAL_REQUEST.md directives and active/completed plans
- [x] Phase A — Timeline & Provenance Audit:
  - Baseline backups preserved byte-for-byte: `kientaohub-20260916-110336.dump` (938,678 bytes) and `kientaohub-pre-seed-20260916.dump` (938,678 bytes). Pre-wipe dumps present.
  - Ratified 32-file media set in `web/public/media/` (~1.9 MB) and 161 private files in `web/private/product_files/` (656 KB) verified intact and unexpanded.
- [x] Phase B — Forensic Integrity Audit:
  - 165/165 probes PASS on repository verify runner (`web/scripts/verify-seed.mts`).
  - E¹⁰ chronological ID monotonicity: 0.00% discordant pairs across all 10 tables, id=1 oldest row in all tables.
  - E⁹ sub-minute jitter: 0 fingerprint columns across 84 scanned timestamp columns. 0 residue 20260916 day-stamps.
  - E¹³-A/B/C/G unified timeline: verified cross-entity overlap and monthly cohort matrix (signups 6, 7, 6, 8, 7, 7, 6, 6, 2; listings 0, 11, 24, 23, 24, 24, 23, 24, 8; all trading months Apr-Sep have non-zero signups & listings).
  - E¹³-E withdrawal updated_at: strictly later than max(withdrawal_events) across all 8 rows (+22.038s to +102.471s, non-constant jitter).
  - E¹³-N withdrawal 8 (FAILED): paid_at IS NULL (paid_offset = NULL::interval).
  - E¹³-J withdrawal statuses: decoupled from ID sequence (1:PAID, 2:REJECTED, 3:CANCELLED, 4:PROCESSING, 5:APPROVED, 6:UNDER_REVIEW, 7:REQUESTED, 8:FAILED; corr = 0.2381).
  - Addendum Item A: 188 entitlements, 0 identical to order created_at, derived from order paid_at + latency (1.095s to 15.802s).
  - Addendum Items B/C/D: 16 refunds spread across 15 distinct days (min 135.40h, max 567.71h <= 720h, median 18.95d < 21d, corr(id, delta) = +0.0331 with abs < 0.35).
  - Non-regression invariants: Admin id=1 byte-for-byte preserved (email, salt len 64, hash len 1024, roles admin,buyer, created_at 2026-01-14 08:52:56.753+00); commission default_rate 0.30; all 5 triggers active and enabled; negative trigger probes raise; ledger balance reconciliation 0 mismatches across 55 wallets; 0 negative balances.
- [x] Phase C — Independent Test Execution:
  - Integration suite `pnpm --prefix web test:int`: 28/28 files passed, 419/419 passed.
  - Database row counts before and after `test:int` verified byte-for-byte identical (0 mutations).
  - Linter: `pnpm --prefix web lint` and `pnpm --prefix web exec eslint scripts/` passed with 0 errors.
  - Next.js production build (`pnpm --prefix web build`): in-flight (task-182).
