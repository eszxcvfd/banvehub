# Dispatch Instructions — SWE Orchestrator Gen 3

## Identity & Paths
- **Role**: SWE Orchestrator Gen 3 (`teamwork_preview_swe`)
- **Working directory**: `/home/trung/Documents/2026/project/test-v6/.agents/swe_orchestrator_gen3`
- **Workspace root**: `/home/trung/Documents/2026/project/test-v6`
- **Parent**: Sentinel (`2043e3d8-deab-474f-8b62-964634955fb9`)

---

## Authoritative Directives & Reference Material
Read and strictly adhere to:
1. `AGENTS.md` and `docs/WORKFLOW.md` — repository workflow and authority boundaries.
2. `/home/trung/Documents/2026/project/test-v6/.agents/ORIGINAL_REQUEST.md`:
   - `## 2026-09-16T10:55:03Z` (§1 to §9: E¹³ gap list & wipe/reseed authorisation)
   - `## 2026-09-16T11:14:28Z` (Items A–F: Entitlements grant latency, refund decoupling, spread, probe assertions)
   - `## 2026-09-16T11:29:19Z` (Project Prompt: Full Option (a) requirements)
3. `docs/plans/active/realistic-db-seed.md` — approved execution plan (maintain ## Progress, ## Decisions, ## Validation, and ## Result).
4. `docs/runbooks/dev-database.md` — runbook for dev database operations and backup/restore procedures.
5. Backup baseline to preserve: `/home/trung/.local/share/kientaohub-backups/kientaohub-20260916-110336.dump` (MUST NEVER BE OVERWRITTEN OR DELETED).

---

## Mission & Requirements

Execute Option (a) Full Fix for Finding E¹³ (Realistic Database Seed for KienTaoHub) via SWE Light loop:

### R1. Unified Timeline Model & Dynamic Interleaving (E¹³-A/B/C/G)
- Replace independent entity-type `NOW() - N whole days` constants (users 245, products 224, topups 176, orders 172, withdrawals 25, refunds 4) with a continuous unified timeline.
- Users (sellers and buyers) and products must continue to arrive and be created throughout the 169-day trading window (March 28 to September 12, 2026).
- Every trading month (April, May, June, July, August, September 2026) must show non-zero user signups and non-zero product listings.
- In Phase 7 order generation (`seed-realistic.mts`): dynamically expand the available buyer and product pools as order index/time advances. Orders placed at time T may only purchase products published prior to T, by buyers registered prior to T.
- Buyer initial wallet top-up must precede buyer's first purchase (user.created_at + delta t).
- Causal invariants B1–B8 must hold by construction: 0 orders/ledger/products/entitlements/refunds predate their owner.
- Chronological monotonicity (E¹⁰): `id` order must strictly match `created_at` arrival order with 0.00% discordant pairs across all timelined tables; `id = 1` is the oldest row.
- Sub-minute jitter (E⁹): 0 seed-run instant fingerprints across all 34 timestamp columns; distinct sub-seconds.
- Wall-clock headroom (E¹²): deterministic timeline terminates with ~3.5 days headroom before `now()`; zero future-dated timestamps.

### R2. Mechanical Defect Corrections (E¹³-E, E¹³-N, E¹³-J)
- **E¹³-E (`updated_at` positive polarity)**: `withdrawals.updated_at` must be strictly later than every touch of that withdrawal, including its own `withdrawal_events` audit trail.
  - ⚠️ **DO NOT USE** the naive clamp `GREATEST(requested_at, coalesce(reviewed_at, requested_at), coalesce(paid_at, requested_at)) + INTERVAL '2 seconds'` — that formula was tested live and produced negative deltas on rows 2, 4, 8 because it ignores post-review events (`APPROVED→PROCESSING`, `PROCESSING→FAILED`).
  - Calculate `updated_at` from the true last event touch: `updated_at = max(events.timestamp) + jitter` (positive delta on all 8 rows, avoiding constant-interval fingerprints).
- **E¹³-N (NULL `paid_at` for non-PAID withdrawals)**:
  - `withdrawals.id = 8` (status `FAILED`) must have `paid_at = NULL` (set `paid_offset = NULL::interval`).
  - Terminal event for row 8 must resolve accurately without masked timestamps.
- **E¹³-J (Decoupled withdrawal statuses)**:
  - Decouple `withdrawals.status` from `id` so status is not a 1:1 monotone enum mapping (`1 REQUESTED ... 8 FAILED`).
  - Preserve coverage of all 8 statuses with realistic business progression and irregular gaps.

### R3. Addendum Items A–D: Entitlements & Refunds Realism
- **Item A (Entitlements timestamp separation)**:
  - `entitlements.created_at` must not be byte-identical to `orders.created_at` (currently 188/188 identical).
  - Derive `entitlements.created_at` from `orders.paid_at` plus a realistic grant latency (e.g. 1–15 seconds), preserving chronological `id` monotonicity (E¹⁰).
- **Item B (Decouple refund delay from `refunds.id`)**:
  - Eliminate deterministic staircase ordering (`corr(id, delta_hours) = -0.9977`).
  - Replace cumulative backward walk with independent per-refund draws from a plausible latency band (`abs(corr(refunds.id, delta_hours)) < 0.35`).
- **Item C (Spread refunds across trading window)**:
  - Eliminate the 20-hour end-of-timeline burst.
  - Spread all 16 refunds across the trading window following their respective orders (`count(DISTINCT created_at::date) >= 8`, `max(delta_hours) <= 720`, median delay < 21 days).
- **Item D (Seed verification probe enforcement)**:
  - Update seed verification logic to mechanically assert refund delay bounds and low correlation (`min(delta_hours) >= 13 AND max(delta_hours) <= 720 AND abs(corr(id, delta_hours)) < 0.35`).

### R4. Joint Preservation of Closed Invariants (Non-Regression)
- Admin `id = 1` (`eszxcvfd@gmail.com`) byte-for-byte preserved (timestamp `2026-01-14 08:52:56.753+00`, salt len 64, hash len 1024, roles `admin,buyer`).
- Commission global setting preserved (default_rate 0.30).
- Ratified 32-file media set (~1.9 MB) preserved — DO NOT expand media files.
- All 5 PostgreSQL triggers active and byte-identical to migrations.
- Complete financial ledger reconciliation: `balance = Σ credits − Σ debits` with 0 mismatches, 0 negative balances across all 55 wallets.
- Entitlement counts: exactly 188 entitlements (172 active, 16 revoked).
- Exactly 16 refunds created via domain service with populated `ledger_transaction_id`.
- Test isolation: `pnpm --prefix web test:int` passes against `kientaohub_test` with 0 dev database mutations.

### R5. Documentation Sweep (E¹³-DOC)
- Sweep `docs/plans/active/realistic-db-seed.md` and `docs/runbooks/dev-database.md`.
- Re-derive all distinct-day and distinct-value figures from live SQL queries executed against the reseeded database (resolving products distinct days, orders distinct days, wallet ledger distinct days, paid orders in last 45 days).
- Add the products distinct-days probe to plan `## Validation`.
- Ensure zero internal contradictions across the document.
- Move plan to `docs/plans/completed/realistic-db-seed.md` only after all post-reseed proof is captured.

---

## Operating Protocol (SWE Light)
- You are a pure dispatch-only orchestrator. DO NOT edit source code files yourself.
- Dispatch one implementer (`teamwork_preview_implementer`) to execute the full change.
- Run repeated adversarial review rounds (`teamwork_preview_reviewer`) carrying a cumulative open-issues ledger.
- Create a fresh pre-wipe `pg_dump` backup in `/home/trung/.local/share/kientaohub-backups/` before wiping the dev DB.
- Run `SEED_CONFIRM=yes pnpm -C web seed:realistic`.
- Verify using live SQL probes and test suites (`verify_e10.sql`, `verify_e9.sql`, `pnpm --prefix web test:int`, `pnpm --prefix web lint`, `pnpm --prefix web build`).
- Maintain `progress.md` and `BRIEFING.md` in your working directory.
- Report completion back to Sentinel with complete raw evidence.

## 2026-09-16T11:30:43Z

You are the SWE Orchestrator Gen 3 (teamwork_preview_swe) for the KienTaoHub Realistic DB Seed task.

Your working directory is:
/home/trung/Documents/2026/project/test-v6/.agents/swe_orchestrator_gen3

Project workspace root:
/home/trung/Documents/2026/project/test-v6

Parent conversation ID: 2043e3d8-deab-474f-8b62-964634955fb9 (Sentinel)

Read your full dispatch instructions at:
/home/trung/Documents/2026/project/test-v6/.agents/swe_orchestrator_gen3/DISPATCH.md

Authoritative request and supervisor directives:
Read /home/trung/Documents/2026/project/test-v6/.agents/ORIGINAL_REQUEST.md (specifically ## 2026-09-16T10:55:03Z, Addendum ## 2026-09-16T11:14:28Z, and ## 2026-09-16T11:29:19Z).

Approved execution plan:
Read and maintain /home/trung/Documents/2026/project/test-v6/docs/plans/active/realistic-db-seed.md.
Also read docs/WORKFLOW.md and AGENTS.md.

Task and Mode:
Run the SWE Light loop (one implementer plus repeated adversarial review) to execute the Option (a) Full Fix for Finding E¹³:
1. Unified Timeline Interleaving (E¹³-A/B/C/G):
   - Replace independent entity-type NOW() - N whole days constants with a continuous unified timeline.
   - Users and products continue to arrive throughout the 169-day trading window. Non-zero signups and listings every month.
   - Dynamic pool expansion in Phase 7 order generation so causal invariants B1-B8 hold by construction.
   - Chronological monotonicity (E¹⁰): 0.00% discordant pairs across all tables; id=1 oldest row.
   - Sub-minute jitter (E⁹): 0 fingerprint columns across all 34 timestamp columns.
   - Headroom (E¹²): ~3.5 days before now().
2. Mechanical Defects:
   - E¹³-E: withdrawals.updated_at strictly later than every touch including withdrawal_events audit trail across all 8 rows (do NOT use the naive clamp formula; derive from true last touch max(events.timestamp) + jitter).
   - E¹³-N: Failed withdrawal 8 (status = FAILED) must have paid_at = NULL (paid_offset = NULL::interval).
   - E¹³-J: Decouple withdrawal status from ID so statuses do not follow enum index 1..8.
3. Addendum Items A-D:
   - Item A: Entitlements timestamp separation: derive entitlements.created_at from orders.paid_at + grant latency (1-15s), preserving E¹⁰.
   - Item B: Decouple refund delay from refunds.id: replace cumulative backward walk with independent per-refund draws (abs(corr(refunds.id, delta_hours)) < 0.35).
   - Item C: Spread all 16 refunds across the trading window following their orders (count(DISTINCT created_at::date) >= 8, max(delta_hours) <= 720, median delay < 21 days).
   - Item D: Update seed verification logic to mechanically assert refund delay bounds and low correlation.
4. Non-Regression Invariants (All 12 closed findings must hold jointly):
   - Admin id=1 byte-for-byte preserved (2026-01-14 08:52:56.753+00, salt len 64, hash len 1024, email).
   - Ratified 32-file media set preserved.
   - All 5 triggers active.
   - Ledger balance reconciliation with 0 mismatches, 0 negative balances.
   - 188 entitlements (172 active, 16 revoked).
   - 16 refunds with ledger_transaction_id.
   - Test isolation: pnpm --prefix web test:int passes against kientaohub_test with 0 dev mutations.
5. Documentation Sweep (E¹³-DOC):
   - Re-derive all distinct-day and distinct-value figures from live SQL queries executed against reseeded database.
   - Add products-distinct-days probe to plan ## Validation.
   - Move plan from docs/plans/active/ to docs/plans/completed/ only after post-reseed proof is captured.
6. Execution & Verification:
   - Create a fresh pre-wipe pg_dump backup in /home/trung/.local/share/kientaohub-backups/ before wiping dev DB.
   - Reseed: SEED_CONFIRM=yes pnpm -C web seed:realistic.
   - Run verify_e10.sql, verify_e9.sql, test:int, lint, build, and report raw query/test output.

Remember: As SWE Light orchestrator, do not write code yourself. Dispatch teamwork_preview_implementer, run adversarial review rounds (teamwork_preview_reviewer), track open-issues ledger, and update progress.md regularly. Report back to Sentinel when complete.
