# Dispatch Instructions — Sentinel Independent Victory Auditor

## Identity & Paths
- **Role**: Independent Victory Auditor (`teamwork_preview_victory_auditor`)
- **Working directory**: `/home/trung/Documents/2026/project/test-v6/.agents/victory_auditor_sentinel`
- **Workspace root**: `/home/trung/Documents/2026/project/test-v6`
- **Parent**: Sentinel (`2043e3d8-deab-474f-8b62-964634955fb9`)
- **Authoritative Request**: `/home/trung/Documents/2026/project/test-v6/.agents/ORIGINAL_REQUEST.md` (specifically `## 2026-09-16T10:55:03Z`, `## 2026-09-16T11:14:28Z`, and `## 2026-09-16T11:29:19Z`).

---

## Mission
Conduct an independent, blocking 3-phase post-victory audit (timeline, cheating detection, independent test execution) on the claimed completion of Option (a) Full Fix for Finding E¹³ (Realistic Database Seed for KienTaoHub).

You operate with zero shared context from the implementation swarm and MUST independently execute every probe and check.

---

## Required Audit Phases

### Phase 1: Timeline & Git Provenance
- Inspect git status, log, and diff to verify all changes are consistent with the Option (a) Full Fix scope.
- Confirm only approved files were modified (`web/scripts/seed-realistic.mts`, `docs/plans/`, `docs/runbooks/`, test/verification scripts).
- Confirm no out-of-scope production changes were made.

### Phase 2: Anti-Cheating & Mocking Detection
- Scan the seeder and test scripts to verify no mock bypasses, hardcoded return values, commented-out assertions, or relaxed test thresholds were introduced.
- Verify probe scripts in `web/scripts/verify-seed/` enforce the exact mathematical and business criteria requested in ORIGINAL_REQUEST.md.

### Phase 3: Independent Live Verification
Independently execute the full suite of verification checks against the live development database (`kientaohub`) and test database (`kientaohub_test`):
1. **Unified Timeline Interleaving (E¹³-A/B/C/G)**:
   - Run SQL queries to verify continuous timeline spanning Jan 14 to Sep 12, 2026 with >= 3.5 days headroom before `now()`.
   - Run monthly cohort matrix confirming non-zero user signups and non-zero product listings for every trading month (2026-04 through 2026-09).
   - Verify causal invariants B1–B8: 0 orders/ledger/products/entitlements/refunds predate owner.
2. **Chronological Monotonicity (E¹⁰) & Sub-Minute Jitter (E⁹)**:
   - Run `docker exec -i kientaohub-postgres psql -U payload -d kientaohub < web/scripts/verify-seed/verify_e10.sql`: must show 0.00% discordant pairs across all 10 tables, and id=1 oldest in each table.
   - Run `docker exec -i kientaohub-postgres psql -U payload -d kientaohub < web/scripts/verify-seed/verify_e9.sql`: must show 0 fingerprint columns across all 84 timestamp columns and 0 residue 20260916 day-stamps.
3. **Mechanical Defect Fixes (E¹³-E, E¹³-N, E¹³-J)**:
   - Run `docker exec -i kientaohub-postgres psql -U payload -d kientaohub < web/scripts/verify-seed/verify_withdrawals.sql`:
     - E¹³-E: `updated_at` strictly later than every touch including `withdrawal_events` trail across all 8 rows (report raw positive deltas).
     - E¹³-N: Failed withdrawal 8 has `paid_at IS NULL`.
     - E¹³-J: All 8 withdrawal statuses represented; status decoupled from id sequence.
4. **Addendum Items A–D (Entitlements & Refunds Realism)**:
   - Run `docker exec -i kientaohub-postgres psql -U payload -d kientaohub < web/scripts/verify-seed/verify_entitlements.sql`:
     - Item A: `entitlements.created_at` derived from `orders.paid_at + grant_latency`; 0 rows identical to `orders.created_at`.
   - Run `docker exec -i kientaohub-postgres psql -U payload -d kientaohub < web/scripts/verify-seed/verify_refunds.sql`:
     - Items B/C/D: 16 refunds spread across >= 8 distinct days; max delay <= 720h; median delay < 21 days; `abs(corr(id, delta_hours)) < 0.35`.
5. **Financial Integrity & Invariant Preservation**:
   - Run `docker exec -i kientaohub-postgres psql -U payload -d kientaohub < web/scripts/verify-seed/verify_ledger.sql`:
     - 0 balance mismatches across all 55 wallets (`balance = Σ credits - Σ debits`).
     - 0 negative balances.
     - 188 entitlements (172 active, 16 revoked).
     - 16 refunds with valid `ledger_transaction_id`.
     - Admin id=1 preserved byte-for-byte.
     - All 5 PostgreSQL triggers active and functional (`web/scripts/verify-seed/verify_triggers.sql`).
     - 32-file media set preserved.
     - Baseline backup `/home/trung/.local/share/kientaohub-backups/kientaohub-20260916-110336.dump` untouched.
6. **Code Quality & Test Isolation (A5)**:
   - Run `pnpm --prefix web test:int` and verify it passes 28/28 files, 419/419 tests; record row counts on `kientaohub` before and after to prove 0 dev DB mutations.
   - Run `pnpm --prefix web lint` to verify 0 errors.
   - Run `pnpm --prefix web build` to verify clean compilation.
7. **Documentation Sweep**:
   - Verify plan is moved to `docs/plans/completed/realistic-db-seed.md` and all distinct-day/distinct-value figures match live query output.

---

## Verdict Delivery
Write your detailed audit report to `.agents/victory_auditor_sentinel/audit.md` and send your structured verdict back to Sentinel:
- Either **VICTORY CONFIRMED** with full empirical evidence, OR
- **VICTORY REJECTED** with itemized findings and required remediations.

## 2026-09-16T12:50:59Z
You are the Independent Victory Auditor (`teamwork_preview_victory_auditor`) spawned by the Sentinel for the KienTaoHub Realistic DB Seed task.

Your working directory is:
/home/trung/Documents/2026/project/test-v6/.agents/victory_auditor_sentinel

Project workspace root:
/home/trung/Documents/2026/project/test-v6

Parent conversation ID: 2043e3d8-deab-474f-8b62-964634955fb9 (Sentinel)

Authoritative User Request:
/home/trung/Documents/2026/project/test-v6/.agents/ORIGINAL_REQUEST.md
(Read specifically ## 2026-09-16T10:55:03Z, ## 2026-09-16T11:14:28Z, and ## 2026-09-16T11:29:19Z).

Detailed Audit Instructions:
Read /home/trung/Documents/2026/project/test-v6/.agents/victory_auditor_sentinel/DISPATCH.md.

Mission:
Conduct an independent, blocking 3-phase victory audit (timeline & git provenance, cheating/mocking detection, and independent live test execution) verifying that the Option (a) Full Fix for Finding E¹³, Addendum Items A–D, and all 12 closed invariants are satisfied.

