-- ============================================================================
-- verify_counts.sql  --  Entity inventory (the plan's entity-count table)
--
-- INVARIANT: the seeded database contains exactly the entity counts the plan's
-- `## Result` inventory asserts. A count that no probe produces is a number
-- that can drift undetected; this file makes each of them derivable.
-- Source: docs/plans/completed/realistic-db-seed.md `## Result`, entity inventory
-- bullet list (the block listing users/categories/products/media/product_files/
-- orders/order_items/entitlements/seller_profiles/wallets/wallet_ledger/
-- seller_earnings/withdrawals/refunds).
--
-- WHAT THE PASSING VALUES MEAN (.agents/ORIGINAL_REQUEST.md §9): the counts are
-- not decoration -- each is the denominator of an invariant elsewhere.
-- "188 entitlements over 253 orders" is what makes the coverage probe
-- meaningful; "55 wallets" is the denominator of the ledger reconciliation;
-- "16 refunds" is the n behind the refund-spread statistics. A wrong count
-- silently rescales every ratio computed from it, which is precisely how the
-- original 161/44 conflation survived.
--
-- READ-ONLY: SELECT-only.
-- ============================================================================
\set ON_ERROR_STOP on
\echo '### Entity inventory'

SELECT 'COUNTS' || E'\t' || label || E'\t' || actual::text || E'\t' || expected || E'\t' ||
       CASE WHEN actual = expected::bigint THEN 'PASS' ELSE 'FAIL' END
FROM (
  SELECT 'users'            AS label, (SELECT count(*) FROM users)            AS actual, '55'  AS expected
  UNION ALL SELECT 'categories',       (SELECT count(*) FROM categories),       '8'
  UNION ALL SELECT 'products',         (SELECT count(*) FROM products),         '161'
  UNION ALL SELECT 'media',            (SELECT count(*) FROM media),            '32'
  UNION ALL SELECT 'product_files',    (SELECT count(*) FROM product_files),    '161'
  UNION ALL SELECT 'orders',           (SELECT count(*) FROM orders),           '253'
  UNION ALL SELECT 'order_items',      (SELECT count(*) FROM order_items),      '253'
  UNION ALL SELECT 'entitlements',     (SELECT count(*) FROM entitlements),     '188'
  UNION ALL SELECT 'seller_profiles',  (SELECT count(*) FROM seller_profiles),  '12'
  UNION ALL SELECT 'wallets',          (SELECT count(*) FROM wallets),          '55'
  UNION ALL SELECT 'wallet_ledger',    (SELECT count(*) FROM wallet_ledger),    '201'
  UNION ALL SELECT 'seller_earnings',  (SELECT count(*) FROM seller_earnings),  '145'
  UNION ALL SELECT 'withdrawals',      (SELECT count(*) FROM withdrawals),      '8'
  UNION ALL SELECT 'refunds',          (SELECT count(*) FROM refunds),          '16'
  UNION ALL SELECT 'withdrawal_events',(SELECT count(*) FROM withdrawal_events),'25'
  UNION ALL SELECT 'payment_intents',  (SELECT count(*) FROM payment_intents),  '40'
) c
ORDER BY label;

\echo '### Order status distribution'
SELECT 'PROBE' || E'\t' || 'ORDERS status ' || status::text || ' count' || E'\t' ||
       count(*)::text || E'\t' ||
       CASE status::text WHEN 'COMPLETED' THEN '172' WHEN 'PENDING' THEN '35'
                         WHEN 'CANCELLED' THEN '30' WHEN 'REFUNDED' THEN '16' ELSE '0' END || E'\t' ||
       CASE status::text WHEN 'COMPLETED' THEN (CASE WHEN count(*) = 172 THEN 'PASS' ELSE 'FAIL' END)
                         WHEN 'PENDING'   THEN (CASE WHEN count(*) = 35  THEN 'PASS' ELSE 'FAIL' END)
                         WHEN 'CANCELLED' THEN (CASE WHEN count(*) = 30  THEN 'PASS' ELSE 'FAIL' END)
                         WHEN 'REFUNDED'  THEN (CASE WHEN count(*) = 16  THEN 'PASS' ELSE 'FAIL' END)
                         ELSE 'INFO' END
FROM orders GROUP BY status ORDER BY status;

\echo '### Seller earnings status distribution'
SELECT 'PROBE' || E'\t' || 'EARNINGS status ' || se.status::text || ' count' || E'\t' ||
       count(*)::text || E'\t' ||
       CASE se.status::text WHEN 'AVAILABLE' THEN '112' WHEN 'PENDING' THEN '12'
                            WHEN 'PAID' THEN '5' WHEN 'REVERSED' THEN '16' ELSE '0' END || E'\t' ||
       CASE se.status::text WHEN 'AVAILABLE' THEN (CASE WHEN count(*) = 112 THEN 'PASS' ELSE 'FAIL' END)
                            WHEN 'PENDING'   THEN (CASE WHEN count(*) = 12 THEN 'PASS' ELSE 'FAIL' END)
                            WHEN 'PAID'      THEN (CASE WHEN count(*) = 5  THEN 'PASS' ELSE 'FAIL' END)
                            WHEN 'REVERSED'  THEN (CASE WHEN count(*) = 16 THEN 'PASS' ELSE 'FAIL' END)
                            ELSE 'INFO' END
FROM seller_earnings se GROUP BY se.status ORDER BY se.status;

\echo '### Preservation & configuration invariants'
SELECT 'PROBE' || E'\t' || 'CONFIG global commission_rate = 0.30' || E'\t' ||
       COALESCE((SELECT default_rate::text FROM commission_settings WHERE id = 1), 'missing') || E'\t' || '0.30' || E'\t' ||
       CASE WHEN (SELECT default_rate FROM commission_settings WHERE id = 1) = 0.30 THEN 'PASS' ELSE 'FAIL' END
UNION ALL
SELECT 'PROBE' || E'\t' || 'PRESERVE admin id=1 is the earliest account' || E'\t' ||
       (SELECT CASE WHEN u.id = 1 THEN 'yes, created ' || to_char(u.created_at, 'YYYY-MM-DD') ELSE 'no: earliest is id=' || u.id::text END
        FROM users u ORDER BY u.created_at, u.id LIMIT 1) || E'\t' || 'id=1' || E'\t' ||
       CASE WHEN (SELECT id FROM users ORDER BY created_at, id LIMIT 1) = 1 THEN 'PASS' ELSE 'FAIL' END
UNION ALL
SELECT 'PROBE' || E'\t' || 'RESIDUE users with a @kientaohub.local or @test.local placeholder email' || E'\t' ||
       count(*)::text || E'\t' || '0' || E'\t' ||
       CASE WHEN count(*) = 0 THEN 'PASS' ELSE 'FAIL' END
FROM users WHERE email LIKE '%@kientaohub.local' OR email LIKE '%@test.local'
UNION ALL
SELECT 'PROBE' || E'\t' || 'RESIDUE categories with a synthetic "M3 ..." title' || E'\t' ||
       count(*)::text || E'\t' || '0' || E'\t' ||
       CASE WHEN count(*) = 0 THEN 'PASS' ELSE 'FAIL' END
FROM categories WHERE title LIKE 'M3%'
UNION ALL
SELECT 'PROBE' || E'\t' || 'RESIDUE date-stamped placeholder rows visible in any coded table (2026-09-16 run date)' || E'\t' ||
       ((SELECT count(*) FROM orders WHERE created_at::date = DATE '2026-09-16')
      + (SELECT count(*) FROM refunds WHERE created_at::date = DATE '2026-09-16')
      + (SELECT count(*) FROM withdrawals WHERE created_at::date = DATE '2026-09-16'))::text || E'\t' || '0' || E'\t' ||
       CASE WHEN 0 = ((SELECT count(*) FROM orders WHERE created_at::date = DATE '2026-09-16')
                    + (SELECT count(*) FROM refunds WHERE created_at::date = DATE '2026-09-16')
                    + (SELECT count(*) FROM withdrawals WHERE created_at::date = DATE '2026-09-16'))
            THEN 'PASS' ELSE 'FAIL' END;
