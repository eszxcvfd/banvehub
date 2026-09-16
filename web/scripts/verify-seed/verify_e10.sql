-- ============================================================================
-- verify_e10.sql  --  Finding E10: CHRONOLOGICAL ID MONOTONICITY
--
-- Cited as the evidence for the E10 headline number in
--   docs/plans/completed/realistic-db-seed.md  (## Result, "Finding E10" block).
-- This file is the probe that makes that citation true.
--
-- INVARIANT (E10): `id` order must AGREE with `created_at` order. Concretely:
--   (a) the number of DISCORDANT PAIRS is 0.00% (standard: a pair (a, b) with
--       a.id < b.id is discordant when a.created_at > b.created_at), and
--   (b) id = 1 is the OLDEST row of every table.
-- Threshold 0.00% is the plan's own bar (docs/plans/...:410 block, and
-- ## Validation "0 rows where code date != created_at" sibling criterion).
-- The seed's own harness (seed-realistic.mts section 20) uses a weaker bar,
-- pct >= 1.0 -> throw. This probe enforces the PLAN's stricter 0.00% and prints
-- the measured percentage, so the two can never silently diverge again.
--
-- WHAT THE PASSING VALUE MEANS (durable rule, .agents/ORIGINAL_REQUEST.md §9):
--   0 discordant pairs means the surrogate key is a faithful record of arrival
--   order: any consumer that sorts by id gets the same sequence as a consumer
--   that sorts by created_at. A non-zero value means the seed rewrote
--   timestamps independently of the key generation order, which is exactly the
--   "inverted ID" defect E10 exists to catch.
--
-- The control probe ("pairs compared" > 0) proves a 0.00% reading is a real
-- zero and not an empty-input artefact.
--
-- READ-ONLY: SELECT-only.
--
-- DIAGNOSED FAILURE (2026-09-16, live kientaohub, 3 FAILs -- ONE root cause):
--   All three failing lines trace to a single inversion: refund id=10
--   (code REF-20260724-CE7AE7, created_at 2026-07-24 17:29:15.314+00) and
--   refund id=11 (code REF-20260721-4B760A, created_at 2026-07-21 05:59:36.385+00)
--   are chronologically SWAPPED relative to their ids: the day-24 refund holds
--   the higher id, the day-21 refund the lower.
--   Mechanism: `refundDelayMs` (seed-realistic.mts:663-671) is a hash of
--   (refund index r, parent order ms), and the delay bounds include
--   `roomMs = now - 3.5d - orderMs` (L667). Refunds 10 and 11 have very
--   different parent-order ages (ORD-20260714 vs ORD-20260704), so refund 11
--   draws a delay small enough to land (07-21) BEFORE refund 10's (07-24) --
--   the deadline-pressure clamp at L668-669 does not keep id order intact.
--   The 7 discordant wallet_ledger pairs are the SAME two events: ledger uses
--   the refund's own created_at (seed-realistic.mts:2936-2954), so ledger rows
--   137 (refund 10) and 141 (refund 11) inherit the swap, and 141 sorts before
--   137/138/139/140.
--   Threshold NOT weakened: 0.00% is the plan's bar. Fix belongs upstream in
--   `refundDelayMs` (e.g. re-sort `refundDates` before the id/date assignment
--   at L2830-2844), not in this probe.
-- ============================================================================
\set ON_ERROR_STOP on
\echo '### E10 -- chronological id monotonicity'

-- ---------------------------------------------------------------------------
-- 1. Discordant pairs per table. Window functions are deliberately NOT used
--    inside FILTER (illegal); the pairwise self-join is the correct shape.
--    Every id reference is qualified (a.id / b.id) because UNION ALL branches
--    after a self-join would otherwise be ambiguous.
-- ---------------------------------------------------------------------------
WITH pairs AS (
  SELECT 'orders' AS t, count(*) AS n,
         count(*) FILTER (WHERE (a.id < b.id) <> (a.created_at < b.created_at)) AS disc
  FROM orders a JOIN orders b ON a.id < b.id
  UNION ALL
  SELECT 'products', count(*), count(*) FILTER (WHERE (a.id < b.id) <> (a.created_at < b.created_at))
  FROM products a JOIN products b ON a.id < b.id
  UNION ALL
  SELECT 'users', count(*), count(*) FILTER (WHERE (a.id < b.id) <> (a.created_at < b.created_at))
  FROM users a JOIN users b ON a.id < b.id
  UNION ALL
  SELECT 'wallet_ledger', count(*), count(*) FILTER (WHERE (a.id < b.id) <> (a.created_at < b.created_at))
  FROM wallet_ledger a JOIN wallet_ledger b ON a.id < b.id
  UNION ALL
  SELECT 'entitlements', count(*), count(*) FILTER (WHERE (a.id < b.id) <> (a.created_at < b.created_at))
  FROM entitlements a JOIN entitlements b ON a.id < b.id
  UNION ALL
  SELECT 'seller_earnings', count(*), count(*) FILTER (WHERE (a.id < b.id) <> (a.created_at < b.created_at))
  FROM seller_earnings a JOIN seller_earnings b ON a.id < b.id
  UNION ALL
  SELECT 'refunds', count(*), count(*) FILTER (WHERE (a.id < b.id) <> (a.created_at < b.created_at))
  FROM refunds a JOIN refunds b ON a.id < b.id
  UNION ALL
  SELECT 'withdrawal_events', count(*), count(*) FILTER (WHERE (a.id < b.id) <> (a.created_at < b.created_at))
  FROM withdrawal_events a JOIN withdrawal_events b ON a.id < b.id
  UNION ALL
  SELECT 'withdrawals', count(*), count(*) FILTER (WHERE (a.id < b.id) <> (a.created_at < b.created_at))
  FROM withdrawals a JOIN withdrawals b ON a.id < b.id
  UNION ALL
  SELECT 'order_items', count(*), count(*) FILTER (WHERE (a.id < b.id) <> (a.created_at < b.created_at))
  FROM order_items a JOIN order_items b ON a.id < b.id
)
SELECT 'PROBE' || E'\t' ||
       'E10 ' || t || ' discordant id/created_at pairs' || E'\t' ||
       n::text || ' pairs, ' || disc::text || ' discordant (' ||
         round(100.0 * disc / GREATEST(n, 1), 2)::text || '%)' || E'\t' ||
       '0.00%' || E'\t' ||
       CASE WHEN disc = 0 THEN 'PASS' ELSE 'FAIL' END
FROM pairs
ORDER BY t;

-- ---------------------------------------------------------------------------
-- 2. Control: the pairwise comparison must actually have compared pairs.
-- ---------------------------------------------------------------------------
SELECT 'PROBE' || E'\t' || 'E10 control: total pairs compared across the 10 tables' || E'\t' ||
       (SELECT sum(n) FROM (
          SELECT count(*) AS n FROM orders a JOIN orders b ON a.id < b.id
          UNION ALL SELECT count(*) FROM products a JOIN products b ON a.id < b.id
          UNION ALL SELECT count(*) FROM users a JOIN users b ON a.id < b.id
          UNION ALL SELECT count(*) FROM refunds a JOIN refunds b ON a.id < b.id
          UNION ALL SELECT count(*) FROM withdrawals a JOIN withdrawals b ON a.id < b.id
        ) x)::text || E'\t' || '> 0' || E'\t' ||
       CASE WHEN (SELECT sum(n) FROM (
                    SELECT count(*) AS n FROM orders a JOIN orders b ON a.id < b.id
                    UNION ALL SELECT count(*) FROM products a JOIN products b ON a.id < b.id
                    UNION ALL SELECT count(*) FROM users a JOIN users b ON a.id < b.id
                    UNION ALL SELECT count(*) FROM refunds a JOIN refunds b ON a.id < b.id
                    UNION ALL SELECT count(*) FROM withdrawals a JOIN withdrawals b ON a.id < b.id
                  ) x) > 0 THEN 'PASS' ELSE 'FAIL' END;

-- ---------------------------------------------------------------------------
-- 3. id = 1 must be the OLDEST row (smallest created_at, tie-broken by id) in
--    every table that carries both columns.
-- ---------------------------------------------------------------------------
WITH oldest AS (
  SELECT 'orders' AS t,
         (SELECT id FROM orders ORDER BY created_at, id LIMIT 1) AS oid,
         (SELECT count(*) FROM orders) AS c
  UNION ALL SELECT 'products',       (SELECT id FROM products       ORDER BY created_at, id LIMIT 1), (SELECT count(*) FROM products)
  UNION ALL SELECT 'users',          (SELECT id FROM users          ORDER BY created_at, id LIMIT 1), (SELECT count(*) FROM users)
  UNION ALL SELECT 'refunds',        (SELECT id FROM refunds        ORDER BY created_at, id LIMIT 1), (SELECT count(*) FROM refunds)
  UNION ALL SELECT 'withdrawals',    (SELECT id FROM withdrawals    ORDER BY created_at, id LIMIT 1), (SELECT count(*) FROM withdrawals)
  UNION ALL SELECT 'wallet_ledger',  (SELECT id FROM wallet_ledger  ORDER BY created_at, id LIMIT 1), (SELECT count(*) FROM wallet_ledger)
  UNION ALL SELECT 'entitlements',   (SELECT id FROM entitlements   ORDER BY created_at, id LIMIT 1), (SELECT count(*) FROM entitlements)
  UNION ALL SELECT 'seller_earnings',(SELECT id FROM seller_earnings ORDER BY created_at, id LIMIT 1), (SELECT count(*) FROM seller_earnings)
  UNION ALL SELECT 'withdrawal_events', (SELECT id FROM withdrawal_events ORDER BY created_at, id LIMIT 1), (SELECT count(*) FROM withdrawal_events)
  UNION ALL SELECT 'order_items',    (SELECT id FROM order_items    ORDER BY created_at, id LIMIT 1), (SELECT count(*) FROM order_items)
)
SELECT 'PROBE' || E'\t' ||
       'E10 ' || t || ' id=1 is the oldest row' || E'\t' ||
       'first by (created_at,id) is id=' || COALESCE(oid::text, 'no rows') || ' over ' || c::text || ' rows' || E'\t' ||
       '1' || E'\t' ||
       CASE WHEN oid = 1 THEN 'PASS' WHEN oid IS NULL THEN 'FAIL' ELSE 'FAIL' END
FROM oldest
ORDER BY t;

-- ---------------------------------------------------------------------------
-- 4. Joint E10+E4 constraint: refund created_at must ascend with id (a refund
--    that is credited before it is requested is impossible).
-- ---------------------------------------------------------------------------
SELECT 'PROBE' || E'\t' || 'E10+E4 refunds: id-ascending created_at inversions' || E'\t' ||
       count(*)::text || E'\t' || '0' || E'\t' ||
       CASE WHEN count(*) = 0 THEN 'PASS' ELSE 'FAIL' END
FROM (SELECT id, created_at, lag(created_at) OVER (ORDER BY id) AS prev FROM refunds) x
WHERE created_at < prev;
