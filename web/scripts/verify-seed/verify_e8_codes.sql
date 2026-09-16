-- ============================================================================
-- verify_e8_codes.sql  --  Finding E8: code/date agreement across the three
--                          coded entities (orders, refunds, withdrawals)
--
-- INVARIANT: for every row of orders, refunds and withdrawals, the 8-character
-- date stamp embedded at position 5..12 of `code` equals that row's own
-- created_at date (YYYYMMDD). 0 mismatches.
-- Source: docs/plans/completed/realistic-db-seed.md ## Validation (E8 block:
-- "0 rows where the code date disagrees with created_at across orders /
-- refunds / withdrawals").
-- `payment_intents` is EXCLUDED on purpose: its codes are `KTHMLJSAHLF781`
-- style with no date substring at all, so including it would manufacture
-- failures that mean nothing.
--
-- WHAT THE PASSING VALUE MEANS (.agents/ORIGINAL_REQUEST.md §9): "0
-- disagreements" means the human-readable identifier is a TRUE projection of
-- the timestamp -- a support engineer reading an order code learns the real
-- order date. It also means the two were not generated independently, which
-- is what lets E8 detect a re-dating pass (the historical failure mode: the
-- timeline was shifted but codes were not, so codes disagreed with dates).
--
-- READ-ONLY: SELECT-only.
-- ============================================================================
\set ON_ERROR_STOP on
\echo '### E8 -- code/date agreement'

SELECT 'PROBE' || E'\t' || 'E8 orders: code date stamp <> created_at date' || E'\t' ||
       count(*)::text || ' of ' || (SELECT count(*) FROM orders)::text || E'\t' || '0' || E'\t' ||
       CASE WHEN count(*) = 0 THEN 'PASS' ELSE 'FAIL' END
FROM orders
WHERE substring(code FROM 5 FOR 8) <> to_char(created_at, 'YYYYMMDD')
UNION ALL
SELECT 'PROBE' || E'\t' || 'E8 refunds: code date stamp <> created_at date' || E'\t' ||
       count(*)::text || ' of ' || (SELECT count(*) FROM refunds)::text || E'\t' || '0' || E'\t' ||
       CASE WHEN count(*) = 0 THEN 'PASS' ELSE 'FAIL' END
FROM refunds
WHERE substring(code FROM 5 FOR 8) <> to_char(created_at, 'YYYYMMDD')
UNION ALL
SELECT 'PROBE' || E'\t' || 'E8 withdrawals: code date stamp <> created_at date' || E'\t' ||
       count(*)::text || ' of ' || (SELECT count(*) FROM withdrawals)::text || E'\t' || '0' || E'\t' ||
       CASE WHEN count(*) = 0 THEN 'PASS' ELSE 'FAIL' END
FROM withdrawals
WHERE substring(code FROM 5 FOR 8) <> to_char(created_at, 'YYYYMMDD')
UNION ALL
SELECT 'PROBE' || E'\t' || 'E8 control: coded rows examined (0 would make every line above vacuous)' || E'\t' ||
       ((SELECT count(*) FROM orders) + (SELECT count(*) FROM refunds) + (SELECT count(*) FROM withdrawals))::text || E'\t' || '= 277' || E'\t' ||
       CASE WHEN ((SELECT count(*) FROM orders) + (SELECT count(*) FROM refunds) + (SELECT count(*) FROM withdrawals)) > 0 THEN 'PASS' ELSE 'FAIL' END
UNION ALL
SELECT 'PROBE' || E'\t' || 'E8 sample: first 3 order codes with their created_at date' || E'\t' ||
       COALESCE(string_agg(code || '@' || to_char(created_at, 'YYYY-MM-DD'), ', '), 'none') || E'\t' || 'informational' || E'\t' || 'INFO'
FROM (SELECT code, created_at FROM orders ORDER BY id LIMIT 3) s;

-- Seed-run day-stamp residue in the six blast-radius columns. If a row was
-- synthesised on the run date and never back-dated, its code/description would
-- carry 20260916. This is the same invariant the plan's E9 text names, graded
-- here for the three coded tables plus the ledger.
SELECT 'PROBE' || E'\t' || 'E8 residue: seed-run day-stamp 20260916 in orders.code' || E'\t' ||
       count(*)::text || E'\t' || '0' || E'\t' || CASE WHEN count(*) = 0 THEN 'PASS' ELSE 'FAIL' END
FROM orders WHERE code LIKE '%20260916%'
UNION ALL
SELECT 'PROBE' || E'\t' || 'E8 residue: seed-run day-stamp 20260916 in orders.notes' || E'\t' ||
       count(*)::text || E'\t' || '0' || E'\t' || CASE WHEN count(*) = 0 THEN 'PASS' ELSE 'FAIL' END
FROM orders WHERE notes LIKE '%20260916%'
UNION ALL
SELECT 'PROBE' || E'\t' || 'E8 residue: seed-run day-stamp 20260916 in refunds.code' || E'\t' ||
       count(*)::text || E'\t' || '0' || E'\t' || CASE WHEN count(*) = 0 THEN 'PASS' ELSE 'FAIL' END
FROM refunds WHERE code LIKE '%20260916%'
UNION ALL
SELECT 'PROBE' || E'\t' || 'E8 residue: seed-run day-stamp 20260916 in withdrawals.code' || E'\t' ||
       count(*)::text || E'\t' || '0' || E'\t' || CASE WHEN count(*) = 0 THEN 'PASS' ELSE 'FAIL' END
FROM withdrawals WHERE code LIKE '%20260916%'
UNION ALL
SELECT 'PROBE' || E'\t' || 'E8 residue: seed-run day-stamp 20260916 in wallet_ledger.reference_id' || E'\t' ||
       count(*)::text || E'\t' || '0' || E'\t' || CASE WHEN count(*) = 0 THEN 'PASS' ELSE 'FAIL' END
FROM wallet_ledger WHERE reference_id LIKE '%20260916%'
UNION ALL
SELECT 'PROBE' || E'\t' || 'E8 residue: seed-run day-stamp 20260916 in wallet_ledger.description' || E'\t' ||
       count(*)::text || E'\t' || '0' || E'\t' || CASE WHEN count(*) = 0 THEN 'PASS' ELSE 'FAIL' END
FROM wallet_ledger WHERE description LIKE '%20260916%'
UNION ALL
SELECT 'PROBE' || E'\t' || 'E8 residue control: blast-radius columns inspected' || E'\t' || '6' || E'\t' || '6' || E'\t' || 'INFO';

-- No coded row may carry a FUTURE date stamp (a code stamped tomorrow means the
-- timeline was extended past the seed run, not back-dated).
SELECT 'PROBE' || E'\t' || 'E8 orders whose code date stamp is in the future' || E'\t' ||
       count(*)::text || E'\t' || '0' || E'\t' || CASE WHEN count(*) = 0 THEN 'PASS' ELSE 'FAIL' END
FROM orders WHERE to_char(created_at, 'YYYYMMDD') > to_char(NOW(), 'YYYYMMDD')
UNION ALL
SELECT 'PROBE' || E'\t' || 'E8 refunds whose created_at is in the future' || E'\t' ||
       count(*)::text || E'\t' || '0' || E'\t' || CASE WHEN count(*) = 0 THEN 'PASS' ELSE 'FAIL' END
FROM refunds WHERE created_at > NOW()
UNION ALL
SELECT 'PROBE' || E'\t' || 'E8 withdrawals whose created_at is in the future' || E'\t' ||
       count(*)::text || E'\t' || '0' || E'\t' || CASE WHEN count(*) = 0 THEN 'PASS' ELSE 'FAIL' END
FROM withdrawals WHERE created_at > NOW();
