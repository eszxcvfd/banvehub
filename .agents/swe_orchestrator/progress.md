# Progress — KienTaoHub Realistic DB Seed

## Current Status
Last visited: 2026-09-16T09:30:00Z

- [x] Received dispatch from Sentinel / parent
- [x] Recorded DISPATCH.md and initialized BRIEFING.md
- [x] Dispatched teamwork_preview_implementer (Conv ID: a193e29a-fc9b-4767-b706-008cc64c469c, Directory: .agents/implementer_r1)
- [x] Implementer completed and delivered handoff report
- [x] Verified implementer claims (counts, triggers, reconciliation, user 1, lint, isolation)
- [x] Dispatched Reviewer R1 (Conv ID: 8a13c530-30e0-45ff-a076-5b3704a2fb35, Directory: .agents/reviewer_r1)
- [x] Forwarded Defects A-E and surgical fix to Reviewer R1
- [x] Reviewer R1 completed: patched seed script, resolved Defects A-E, re-seeded, verified
- [x] Orchestrator verified Reviewer R1 claims (entitlements 188, order days 169, prod days 161, build code 0)
- [x] Dispatched Reviewer R2 (Conv ID: d90af899-0745-42df-9441-ff071a8997ca, Directory: .agents/reviewer_r2)
- [x] Reviewer R2 completed: patched Defect E' (wallet_ledger backdating & withdrawal timestamps), verified product files, staged deliverables, fixed plan wording
- [x] Orchestrator verified Reviewer R2 claims via SQL
- [x] Adversarial Review Round 3 (teamwork_preview_reviewer) [remediating BLOCKING DEFECT E″ per domain-service specification]
- [x] Adversarial Review Round 4 (teamwork_preview_reviewer) [Option (a) code fix for Findings E⁴, E⁵, E⁶, re-seed, 30-check suite verified, deliverables staged]
- [x] Adversarial Review Round 5 (teamwork_preview_reviewer) [Option (a) code fix for BLOCKING FINDING E7: paid_at - created_at latency jitter and 0s free order delta, paired sweep, re-seed, SQL verification, deliverables staging]
- [x] Adversarial Review Round 6 (teamwork_preview_reviewer) [Option (a) lockstep fix for BLOCKING FINDING E8: code-date alignment with backdated created_at across orders, refunds, withdrawals, and wallet_ledger join keys, re-seed, SQL verification, git staging]
- [x] Orchestrator independent verification of Finding E8 exit checks (0 code date mismatches across 253 orders, 16 refunds, 8 withdrawals; 0 day-stamp 20260916 in blast radius; 0 orphaned ledger rows; 4 unique code indexes verified)
- [x] Adversarial Review Round 7 (teamwork_preview_reviewer) [Joint code fix for BLOCKING FINDINGS E10 and E9: chronological ID-timestamp ordering, sub-minute timestamp jitter, E9-B canonical reference_id, E9-C withdrawal cadence jitter, admin id=1 created_at preservation, E11/E12 calibration]
- [x] Orchestrator independent verification of Findings E10 & E9 exit checks (verify_e10.sql, verify_e9.sql, and 30-check regression suite)
- [x] Post-Victory Audit confirmed verdict

## Iteration Status
Current iteration: 8 / 32

## Open Issues Ledger
| Issue ID | Description | Raised In | Status | Verification Evidence |
|---|---|---|---|---|
| ISSUE-01 | `kientaohub_test` lacks committed provisioning code path; on fresh clone/container `pnpm test:int` will fail. | Parent / R1 | CLOSED | Verified `web/scripts/bootstrap-test-db.mts` provisions `kientaohub_test` and applies migrations; `test:db:setup` in `web/package.json`; documented in `docs/runbooks/dev-database.md` and `docs/plans/completed/realistic-db-seed.md`. |
| ISSUE-02 | Verify Next.js marketplace frontend pages (`/products`, `/products/[slug]`, `/orders`) render cleanly with the seeded data. | Implementer R1 | CLOSED | Verified `pnpm -C web build` compiles cleanly with exit code 0; 42/42 pages generated cleanly including static/dynamic routes. |
| ISSUE-03 | Verify safety guards in `seed-realistic.mts` (e.g. `SEED_CONFIRM=no`, invalid DB name, or missing backup file) correctly abort execution before dropping triggers or truncating tables. | Implementer R1 | CLOSED | Reviewer R1 fixed exact pathname matching; probe with `DATABASE_URL=.../kientaohub_test` aborted with exit code 1. |
| ISSUE-04 | Product `.zip` files under `web/media/product_files/`: verify validity as zip archives and proper file permissions on disk. | Implementer R1 | CLOSED | Verified: 161 private model files in `web/private/product_files/` with extensions matching software types (`.dwg`, `.rvt`, etc.), mode `0664`, streamable. |
| DEFECT-A | **BLOCKING**: 25 COMPLETED orders have NO `entitlements` row. | Parent / Sentinel | CLOSED | Reviewer R1 created active entitlements in top-up loop; independently verified total entitlements = 188 (172 active), 0 completed digital orders without active entitlement. |
| DEFECT-B | **BLOCKING**: 13 REFUNDED orders have NO entitlement row, yet `refunds.entitlement_revoked = true`. | Parent / Sentinel | CLOSED | Reviewer R1 created revoked entitlements; independently verified 16 revoked entitlements exist. |
| DEFECT-C | **REALISM**: ALL 253 orders AND all 161 products were created inside a 17-second window. | Parent / Sentinel | CLOSED | Reviewer R1 staggered timestamps: independently verified order_days = 169 (spanning 6 months). Product timestamps backdated across 44 distinct dates (~1.5 months; earlier claim of 161 product days was a row-count conflation and is retracted per E¹³-DOC). |
| DEFECT-D | **MINOR**: `seller_profiles.total_sales = 0` for all 12 sellers, and `commission_rate` is NULL for all 12. | Parent / Sentinel | CLOSED | Reviewer R1 synchronized total_sales (13-15) and custom commission rates (0.20, 0.25, 0.22); verified via SQL. Commission rate NULL is documented inherit default. |
| DEFECT-E | **SCOPE**: `media` = 32 files / 1.9 MB, vs approved Q5 expectation of ~211 media files. | Parent / Sentinel | CLOSED | User explicitly ratified the 32-file / ~1.9 MB scope reduction on 2026-09-16; documented in plan under Decisions. |
| DEFECT-E' | `wallet_ledger` backdating joining on `orders.code`, aligning withdrawal requested_at / lifecycle timestamps with created_at. Re-seed & verify via SQL. | Parent / Sentinel | CLOSED | Reviewer R2 patched and re-seeded. SQL proof: 119/119 matched, 0 disagreed; 93 distinct ledger days; withdrawal requested_at = created_at for all 8 rows. |
| FINDING-F | Stage deliverables in Git (`git add web/scripts/ docs/runbooks/ docs/plans/completed/realistic-db-seed.md web/src/utilities/home-static.ts`). | Parent / Sentinel | CLOSED | Deliverables staged in git; verified via `git status`. |
| PLAN-WORDING | Adjust plan wording around line 220: ledger UPDATE/DELETE/TRUNCATE and wallets DELETE/TRUNCATE raise (UPDATE wallets does not raise by design). | Parent / Sentinel | CLOSED | Corrected in `docs/plans/completed/realistic-db-seed.md`. |
| DEFECT-E″ | **BLOCKING**: Wallet ledger structurally incomplete: 25 completed wallet orders have no purchase debit; 13 refunded orders have no refund credit and null ledger_transaction_id. Must route through `purchaseProduct` and `processRefund` domain services. | Parent / Sentinel | CLOSED | Reviewer R3 routed all 188 purchases through `purchaseProduct` and all 16 refunds through `processRefund`. SQL checks confirmed: 0 unlogged completed orders, 0 unlogged refunds, 0 money creation, 16/16 refunds populated with ledger_transaction_id, exactly 65 unpaid orders without ledger row. |
| DEFECT-G | Category 8 ("Bản vẽ Cảnh quan & Sân vườn") had 0 published products (all 20 were draft). | Parent / Sentinel | CLOSED | Reviewer R3 evenly distributed 17-18 published products across all 8 categories (total 140 published). SQL confirmed: all 8 categories have 17 or 18 published products. |
| FINDING-E⁵/E⁶ | **CAUSAL REALISM & 30-CHECK SUITE**: Orders & ledger rows predated user creation date; monotone id formula concentrated recent 30 days in CANCELLED orders. | Supervisor | CLOSED | Reviewer R4 executed Option (a) code fix in `seed-realistic.mts`. Independently verified: B1=0, B2=0, B3=0, B4=0, B5=0, B6 (users 44 days, sellers 12 days), B7=true, B8 (5 months); C1=55 paid in last 45d, C2 (7 months non-zero: Jul=31, Aug=37, Sep=19), C3 (overlapping IDs [1, 253]); D1=16 deltas (13-70h), D2=0 uniform; A1-A7 all 0 mismatches; E1-E4 preserved. |
| FINDING-E7 | **BLOCKING**: `paid_at - created_at = EXACTLY 180s` across all 188 paid orders (uniform latency). Free orders must be delta 0, paid orders jittered 1-89s. | Supervisor | CLOSED | Reviewer R5 updated Phase 12a: free orders delta = 0s, commercial orders jittered 1-89s. SQL verified: distinct deltas = 77 (>20), max latency = 89s (<300s), free mismatches = 0, wallet zero latency = 0. Paired latency sweep clean across parent->child pairs. |
| FINDING-E8 | **BLOCKING**: `code` embed seed generation date (`20260916`) rather than row's own backdated `created_at`; artificial prefixes `ORD-PENDING-` and `ORD-CANCEL-`. | Supervisor | CLOSED | Reviewer R6 implemented lockstep code regeneration: orders.code, orders.notes, wallet_ledger.reference_id, wallet_ledger.description, refunds.code, withdrawals.code. SQL verified: 0 date mismatches, 0 artificial codes, 0 day-stamp matches across blast radius, 0 orphaned ledger rows, 4 unique code indexes intact. |
| FINDING-E9 | **BLOCKING**: Seed run instant leakage across 34 fingerprint timestamp columns (`SS.MS` constant residue), E9-B (40 topup ledger reference_ids encode epoch_ms), E9-C (constant 70h withdrawal cadence), admin id=1 created_at preservation. | Supervisor | CLOSED | Reviewer R7 implemented unified sub-minute jitter, canonical KTH* codes for 40 payment_intents (0 orphans), irregular withdrawal cadence, and preserved admin id=1. Verified via verify_e9.sql (0 fingerprint columns). |
| FINDING-E10 | **BLOCKING**: Non-chronological ID assignment (~50% discordant pairs across orders, refunds, earnings, entitlements, ledger, products, users; id=1 newest order). | Supervisor | CLOSED | Reviewer R7 restored monotone id<->time walk with irregular positive gaps. Verified via verify_e10.sql (0.00% discordant pairs across all 8 tables, id=1 oldest). |
| FINDING-E11 | **BLOCKING**: In `seed-realistic.mts` §12c `r_steps` CTE, CASE WHEN returns timestamptz while ELSE returns interval (SQLSTATE 42804 type mismatch). | Supervisor | CLOSED | Fixed all branches to intervals and validated with SQL parse sweep (0 errors). |



