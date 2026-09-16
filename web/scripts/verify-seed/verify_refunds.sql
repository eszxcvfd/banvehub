-- ============================================================================
-- verify_refunds.sql  --  Refund spread: refunds are jittered, not bursty
--
-- INVARIANTS & THRESHOLDS:
--   (a) >= 8 distinct refund calendar days        (plan ## Validation)
--   (b) median refund delay < 21 days             (plan ## Validation)
--   (c) every refund <= 30 days (720 h) after its own order's paid_at
--   (d) abs(corr(refunds.id, refund_delay_hours)) < 0.35
--   (e) 0 refunds with an exactly-24h delay (a constant round-trip is a tell)
-- Source: docs/plans/completed/realistic-db-seed.md ## Validation, refund block.
-- delay is measured as refund.created_at - order.paid_at, i.e. the real
-- customer-visible wait, and is joined on refunds.order_id = orders.id.
--
-- THRESHOLD DERIVATION, (d) IN PARTICULAR (this one is weak, and the probe
-- says so rather than pretending otherwise): for a sample correlation with
-- n = 16 observations the standard error is about 1/sqrt(n - 2) = 1/sqrt(14)
-- = 0.267. A bound of 0.35 is therefore only ~1.31 sigma. At alpha = 0.05 with
-- n = 16 (df = 14) the two-sided critical t is ~2.145, giving a critical
-- correlation of r_crit = t / sqrt(t^2 + df) = 2.145 / sqrt(18.601) = ~0.497309.
-- A bound of 0.35 lies BELOW that critical value, so a correlation of up to
-- ~0.4973 would be statistically indistinguishable from 0 and would STILL PASS
-- this probe only by accident of the bound being below the noise floor. The
-- plan itself flags criterion (d) as under-powered and states that the powered
-- criteria -- (a) >= 8 distinct days, (b) median < 21 d, (c) max <= 30 d --
-- "should carry the enforcement". It is retained here for continuity with the
-- plan's text, with this caveat printed inline. Do NOT treat (d) passing as
-- evidence of decoupling; treat (a)/(b)/(c) passing as the evidence.
--
-- WHAT THE PASSING VALUES MEAN (.agents/ORIGINAL_REQUEST.md §9): ">= 8 distinct
-- days" means refunds are spread across the calendar like real complaints
-- rather than concentrated in one batch; "median < 21 days" means the typical
-- refund happens within a plausible customer-service window, not immediately
-- and not months later; "max <= 30 days" means no refund escapes the platform
-- SLA. The cheap way to satisfy a count-only probe (create 16 refunds all on
-- the same day) fails (a).
--
-- READ-ONLY: SELECT-only.
-- ============================================================================
\set ON_ERROR_STOP on
\echo '### Refund spread & delay distribution'

WITH r AS (
  SELECT rf.id, rf.created_at,
         EXTRACT(EPOCH FROM (rf.created_at - o.paid_at)) / 3600.0 AS delay_h
  FROM refunds rf
  JOIN orders o ON o.id = rf.order_id
  WHERE o.paid_at IS NOT NULL
)
SELECT 'PROBE' || E'\t' || 'REFUNDS control: refunds joined to a paid order (0 would make every line below vacuous)' || E'\t' ||
       count(*)::text || E'\t' || '= 16' || E'\t' ||
       CASE WHEN count(*) = 16 THEN 'PASS' ELSE 'FAIL' END
FROM r
UNION ALL
SELECT 'PROBE' || E'\t' || 'REFUNDS distinct refund calendar days' || E'\t' ||
       count(DISTINCT date_trunc('day', created_at))::text || E'\t' || '>= 8' || E'\t' ||
       CASE WHEN count(DISTINCT date_trunc('day', created_at)) >= 8 THEN 'PASS' ELSE 'FAIL' END
FROM r
UNION ALL
SELECT 'PROBE' || E'\t' || 'REFUNDS median delay in days' || E'\t' ||
       COALESCE(round((percentile_cont(0.5) WITHIN GROUP (ORDER BY delay_h) / 24)::numeric, 2)::text, 'n/a') || E'\t' || '< 21' || E'\t' ||
       CASE WHEN COALESCE(percentile_cont(0.5) WITHIN GROUP (ORDER BY delay_h) / 24, 0) < 21 THEN 'PASS' ELSE 'FAIL' END
FROM r
UNION ALL
SELECT 'PROBE' || E'\t' || 'REFUNDS max delay in hours (SLA <= 30 days)' || E'\t' ||
       COALESCE(round(max(delay_h)::numeric, 2)::text, 'n/a') || E'\t' || '<= 720' || E'\t' ||
       CASE WHEN COALESCE(max(delay_h), 0) <= 720 THEN 'PASS' ELSE 'FAIL' END
FROM r
UNION ALL
SELECT 'PROBE' || E'\t' || 'REFUNDS min delay in hours (must be > 0: a refund cannot precede payment)' || E'\t' ||
       COALESCE(round(min(delay_h)::numeric, 2)::text, 'n/a') || E'\t' || '> 0' || E'\t' ||
       CASE WHEN COALESCE(min(delay_h), 0) > 0 THEN 'PASS' ELSE 'FAIL' END
FROM r
UNION ALL
SELECT 'PROBE' || E'\t' || 'REFUNDS distinct delay values' || E'\t' ||
       count(DISTINCT delay_h)::text || E'\t' || '= 16' || E'\t' ||
       CASE WHEN count(DISTINCT delay_h) = 16 THEN 'PASS' ELSE 'FAIL' END
FROM r
UNION ALL
SELECT 'PROBE' || E'\t' || 'REFUNDS rows with an exactly-24h delay' || E'\t' ||
       count(*) FILTER (WHERE delay_h = 24)::text || E'\t' || '0' || E'\t' ||
       CASE WHEN count(*) FILTER (WHERE delay_h = 24) = 0 THEN 'PASS' ELSE 'FAIL' END
FROM r
UNION ALL
SELECT 'PROBE' || E'\t' || 'REFUNDS abs(corr(id, delay_hours))  [WEAK at n=16: SE~0.267, so 0.35 is only ~1.3 sigma; (a)(b)(c) carry enforcement]' || E'\t' ||
       COALESCE(round(abs(corr(id::numeric, delay_h))::numeric, 4)::text, 'n/a') || E'\t' || '< 0.35' || E'\t' ||
       CASE WHEN COALESCE(abs(corr(id::numeric, delay_h)), 1) < 0.35 THEN 'PASS' ELSE 'FAIL' END
FROM r;

-- Refund amount / status integrity, and the ledger linkage the plan asserts
-- (16/16 refunds must carry a ledger_transaction_id).
\echo '### Refund linkage & amount integrity'
SELECT 'PROBE' || E'\t' || 'REFUNDS rows with NULL ledger_transaction_id (plan asserts 16/16 populated)' || E'\t' ||
       count(*) FILTER (WHERE ledger_transaction_id IS NULL)::text || E'\t' || '0' || E'\t' ||
       CASE WHEN count(*) FILTER (WHERE ledger_transaction_id IS NULL) = 0 THEN 'PASS' ELSE 'FAIL' END
FROM refunds
UNION ALL
SELECT 'PROBE' || E'\t' || 'REFUNDS with a ledger_transaction_id that names no wallet_ledger row' || E'\t' ||
       count(*)::text || E'\t' || '0' || E'\t' ||
       CASE WHEN count(*) = 0 THEN 'PASS' ELSE 'FAIL' END
FROM refunds rf
WHERE rf.ledger_transaction_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM wallet_ledger l WHERE l.id = rf.ledger_transaction_id)
UNION ALL
SELECT 'PROBE' || E'\t' || 'REFUNDS whose refunded total (amount) does not equal platform_fee_refunded + seller_amount_refunded' || E'\t' ||
       count(*)::text || E'\t' || '0' || E'\t' ||
       CASE WHEN count(*) = 0 THEN 'PASS' ELSE 'FAIL' END
FROM refunds
WHERE abs(amount - (platform_fee_refunded + seller_amount_refunded)) > 0.01
UNION ALL
SELECT 'PROBE' || E'\t' || 'REFUNDS whose refunded amount exceeds what the order was paid' || E'\t' ||
       count(*)::text || E'\t' || '0' || E'\t' ||
       CASE WHEN count(*) = 0 THEN 'PASS' ELSE 'FAIL' END
FROM refunds rf JOIN orders o ON o.id = rf.order_id
WHERE rf.amount > o.total_amount + 0.01
UNION ALL
SELECT 'PROBE' || E'\t' || 'REFUNDS whose own order is not in status REFUNDED' || E'\t' ||
       count(*)::text || E'\t' || '0' || E'\t' ||
       CASE WHEN count(*) = 0 THEN 'PASS' ELSE 'FAIL' END
FROM refunds rf JOIN orders o ON o.id = rf.order_id
WHERE o.status <> 'REFUNDED'
UNION ALL
SELECT 'PROBE' || E'\t' || 'REFUNDS control: back-refund ledger credit rows (reference_type = order + type = refund)' || E'\t' ||
       count(*)::text || E'\t' || '= 16' || E'\t' ||
       CASE WHEN count(*) = 16 THEN 'PASS' ELSE 'FAIL' END
FROM wallet_ledger WHERE reference_type = 'order' AND type = 'refund'
UNION ALL
SELECT 'PROBE' || E'\t' || 'REFUNDS status distribution' || E'\t' ||
       COALESCE(string_agg(d, ' | '), 'none') || E'\t' || 'informational' || E'\t' || 'INFO'
FROM (SELECT status::text || '=' || count(*)::text AS d FROM refunds GROUP BY status) s;
