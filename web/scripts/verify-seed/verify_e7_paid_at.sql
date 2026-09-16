-- ============================================================================
-- verify_e7_paid_at.sql  --  Finding E7: paid_at latency is jittered, non-zero
--
-- INVARIANTS:
--   (a) count(DISTINCT (paid_at - created_at)) > 20 -- payment latency is not
--       a constant (a constant would let a reader recover the seed formula);
--   (b) max(paid_at - created_at) < 300 s -- latency stays inside the payment
--       window; an order cannot be "paid" five minutes after it was created
--       when the simulated gateway is synchronous;
--   (c) 0 orders with total_amount = 0 AND paid_at <> created_at -- a free
--       order has no gateway round-trip, so its paid_at MUST equal created_at.
--
-- THRESHOLD DERIVATION (not invented -- read off the generator):
--   seed-realistic.mts:2741/2745 sets latency =
--       (1 + (id * 13) % 89) * INTERVAL '1 second' + random() * 0.999 * INTERVAL '1 second'
--   => structural term is bounded by 89 s and the jitter by <1 s, so the
--      generator's own maximum is 89.999 s.  The < 300 s bar therefore carries
--      ~3.3x headroom over the generator and still fails loudly if anyone ever
--      re-introduces a whole-minute offset.
--   => the structural term can take at most 89 distinct values, but the
--      sub-second random term makes the exact-difference count far larger
--      (~146 measured), so "> 20" carries ~7x headroom and is not a
--      threshold that a constant would slip past.
--   (d) min latency over PAID orders >= 1 s. This one is also read off the
--       generator, not invented: the structural term is (1 + (id*13)%89), so
--       `1 +` is a hard lower bound of exactly 1 s for EVERY paid order, plus
--       a non-negative jitter. A paid order whose latency is 0 s can only mean
--       paid_at was copied from created_at, i.e. the latency field was faked.
--       Free orders are EXCLUDED from this line because their latency is 0 by
--       construction (probe (c) pins that separately) -- grading them together
--       is what made the previous revision of this line report a spurious 0.000.
--       The plan asserts no median for E7, so the median is reported as INFO
--       rather than graded; inventing a median bar would be exactly the
--       unsourced-threshold failure this file is supposed to prevent.
-- Source: docs/plans/completed/realistic-db-seed.md ## Validation (E7 block:
-- "146 distinct latencies (> 20 target); max latency 89.46s (< 300s target);
-- 0 free order mismatches") for (a)/(b)/(c); (d) from seed-realistic.mts:2741.
--
-- WHAT THE PASSING VALUE MEANS (.agents/ORIGINAL_REQUEST.md §9): a large
-- distinct-latency count means latency is a PER-ORDER property, not a
-- per-run constant; the max < 300 s means no order was back-dated into a
-- different payment epoch. Crucially probe (c) is the anti-corruption guard:
-- the cheapest way to make (a) and (b) pass is to give free orders a fake
-- non-zero latency, which is exactly the data-corrupting shortcut this rule
-- exists to forbid.
--
-- READ-ONLY: SELECT-only.
-- ============================================================================
\set ON_ERROR_STOP on
\echo '### E7 -- paid_at latency'

SELECT 'PROBE' || E'\t' || 'E7 control: orders in scope (0 would make every latency line below vacuous)' || E'\t' ||
       (SELECT count(*) FROM orders)::text || E'\t' || '253' || E'\t' ||
       CASE WHEN (SELECT count(*) FROM orders) = 253 THEN 'PASS' ELSE 'FAIL' END
UNION ALL
SELECT 'PROBE' || E'\t' || 'E7 paid orders in scope (paid_at IS NOT NULL)' || E'\t' ||
       (SELECT count(*) FROM orders WHERE paid_at IS NOT NULL)::text || E'\t' || '> 0' || E'\t' ||
       CASE WHEN (SELECT count(*) FROM orders WHERE paid_at IS NOT NULL) > 0 THEN 'PASS' ELSE 'FAIL' END
UNION ALL
SELECT 'PROBE' || E'\t' || 'E7 distinct paid_at - created_at latencies' || E'\t' ||
       count(DISTINCT EXTRACT(EPOCH FROM (paid_at - created_at)))::text || E'\t' || '> 20' || E'\t' ||
       CASE WHEN count(DISTINCT EXTRACT(EPOCH FROM (paid_at - created_at))) > 20 THEN 'PASS' ELSE 'FAIL' END
FROM orders WHERE paid_at IS NOT NULL
UNION ALL
SELECT 'PROBE' || E'\t' || 'E7 max latency in seconds' || E'\t' ||
       COALESCE(round(max(EXTRACT(EPOCH FROM (paid_at - created_at)))::numeric, 3)::text, 'n/a') || E'\t' || '< 300' || E'\t' ||
       CASE WHEN COALESCE(max(EXTRACT(EPOCH FROM (paid_at - created_at))), 0) < 300 THEN 'PASS' ELSE 'FAIL' END
FROM orders WHERE paid_at IS NOT NULL
UNION ALL
SELECT 'PROBE' || E'\t' || 'E7 min latency over PAID orders, seconds (free orders excluded -- they are 0 by construction)' || E'\t' ||
       COALESCE(min(round(EXTRACT(EPOCH FROM (paid_at - created_at))::numeric, 3))::text, 'n/a') || E'\t' ||
       '>= 1 (generator structural floor: 1 + (id*13)%89 seconds)' || E'\t' ||
       CASE WHEN COALESCE(min(EXTRACT(EPOCH FROM (paid_at - created_at))), -1) >= 1 THEN 'PASS' ELSE 'FAIL' END
FROM orders WHERE paid_at IS NOT NULL AND total_amount > 0
UNION ALL
SELECT 'PROBE' || E'\t' || 'E7 median latency over PAID orders, seconds' || E'\t' ||
       COALESCE(round(percentile_cont(0.5) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (paid_at - created_at)))::numeric, 3)::text, 'n/a') || E'\t' ||
       'informational, no plan threshold' || E'\t' || 'INFO'
FROM orders WHERE paid_at IS NOT NULL AND total_amount > 0
UNION ALL
SELECT 'PROBE' || E'\t' || 'E7 negative latency (paid BEFORE created)' || E'\t' ||
       count(*)::text || E'\t' || '0' || E'\t' ||
       CASE WHEN count(*) = 0 THEN 'PASS' ELSE 'FAIL' END
FROM orders WHERE paid_at IS NOT NULL AND paid_at < created_at;

-- (c) Free orders. The guard against the cheapest available corruption.
SELECT 'PROBE' || E'\t' || 'E7 control: free (total_amount = 0) orders in scope' || E'\t' ||
       count(*)::text || E'\t' || '> 0' || E'\t' ||
       CASE WHEN count(*) > 0 THEN 'PASS' ELSE 'FAIL' END
FROM orders WHERE total_amount = 0
UNION ALL
SELECT 'PROBE' || E'\t' || 'E7 free orders with paid_at <> created_at (free orders must have zero gateway round-trip)' || E'\t' ||
       count(*)::text || E'\t' || '0' || E'\t' ||
       CASE WHEN count(*) = 0 THEN 'PASS' ELSE 'FAIL' END
FROM orders WHERE total_amount = 0 AND paid_at IS NOT NULL AND paid_at <> created_at
UNION ALL
SELECT 'PROBE' || E'\t' || 'E7 free orders with a NULL paid_at though COMPLETED (free order still settles)' || E'\t' ||
       count(*)::text || E'\t' || '0' || E'\t' ||
       CASE WHEN count(*) = 0 THEN 'PASS' ELSE 'FAIL' END
FROM orders WHERE total_amount = 0 AND status = 'COMPLETED' AND paid_at IS NULL
UNION ALL
SELECT 'PROBE' || E'\t' || 'E7 paid non-CANCELLED orders with NULL paid_at' || E'\t' ||
       count(*)::text || E'\t' || '0' || E'\t' ||
       CASE WHEN count(*) = 0 THEN 'PASS' ELSE 'FAIL' END
FROM orders WHERE status IN ('COMPLETED', 'REFUNDED') AND paid_at IS NULL
UNION ALL
SELECT 'PROBE' || E'\t' || 'E7 CANCELLED/PENDING orders that carry a paid_at (unpaid but stamped)' || E'\t' ||
       count(*)::text || E'\t' || '0' || E'\t' ||
       CASE WHEN count(*) = 0 THEN 'PASS' ELSE 'FAIL' END
FROM orders WHERE status IN ('CANCELLED', 'PENDING') AND paid_at IS NOT NULL;
