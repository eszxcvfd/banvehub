-- ============================================================================
-- verify_ledger.sql  --  Ledger reconciliation & wallet solvency
--
-- INVARIANT: for EVERY wallet, `balance = SUM(credit) - SUM(debit)` over its
-- ledger rows. A wallet balance IS a running total of an append-only ledger;
-- if the stored balance can be attained by any other route the ledger is
-- decorative. Threshold 0 mismatches / 0 negative balances.
-- Source: docs/plans/completed/realistic-db-seed.md ## Validation ("Ledger
-- reconciliation: 0 mismatches across all 55 wallets (balance = SUM credit -
-- SUM debit)"), mirrored by seed-realistic.mts section "Financial A1-A7".
--
-- WHAT THE PASSING VALUE MEANS (.agents/ORIGINAL_REQUEST.md §9): "0 mismatches"
-- means the ledger is a COMPLETE and EXCLUSIVE record of balance movement --
-- no balance was set by fiat and no ledger row is unbacked. A probe that only
-- counted ledger rows would pass on a database whose balances were invented;
-- this one cross-foots the two, so the cheapest way to satisfy it is to
-- actually derive balances from the ledger.
--
-- NOTE ON JOIN KEYS (trap): wallet_ledger.reference_id joins to orders.CODE,
-- not orders.id. For refund rows reference_type is 'order', not 'refund'.
-- Those traps are graded in verify_entitlements.sql / verify_e8_codes.sql.
--
-- READ-ONLY: SELECT-only.
-- ============================================================================
\set ON_ERROR_STOP on
\echo '### Ledger reconciliation & wallet solvency'

-- 1. Control: we must actually be reconciling wallets that have ledger rows.
SELECT 'PROBE' || E'\t' || 'LEDGER control: wallets reconciled (0 would make the mismatch count vacuous)' || E'\t' ||
       (SELECT count(*) FROM wallets)::text || E'\t' || '= 55' || E'\t' ||
       CASE WHEN (SELECT count(*) FROM wallets) = 55 THEN 'PASS' ELSE 'FAIL' END
UNION ALL
SELECT 'PROBE' || E'\t' || 'LEDGER control: wallet_ledger rows in scope' || E'\t' ||
       (SELECT count(*) FROM wallet_ledger)::text || E'\t' || '= 201' || E'\t' ||
       CASE WHEN (SELECT count(*) FROM wallet_ledger) = 201 THEN 'PASS' ELSE 'FAIL' END;

-- 2. Per-wallet reconciliation.
WITH sums AS (
  SELECT w.id AS wallet_id, w.balance,
         COALESCE(sum(l.amount) FILTER (WHERE l.direction = 'credit'), 0) AS credits,
         COALESCE(sum(l.amount) FILTER (WHERE l.direction = 'debit'), 0)  AS debits
  FROM wallets w
  LEFT JOIN wallet_ledger l ON l.wallet_id = w.id
  GROUP BY w.id, w.balance
),
graded AS (
  SELECT wallet_id, balance, credits, debits,
         balance - (credits - debits) AS diff
  FROM sums
)
SELECT 'PROBE' || E'\t' || 'LEDGER wallets where balance <> SUM(credit) - SUM(debit)' || E'\t' ||
       count(*) FILTER (WHERE abs(diff) > 0.01)::text || ' of ' || count(*)::text || ' wallets' || E'\t' || '0' || E'\t' ||
       CASE WHEN count(*) FILTER (WHERE abs(diff) > 0.01) = 0 THEN 'PASS' ELSE 'FAIL' END
FROM graded
UNION ALL
SELECT 'PROBE' || E'\t' || 'LEDGER worst |balance - (credits - debits)| in cents' || E'\t' ||
       COALESCE(round(max(abs(diff)) * 100, 2)::text, 'n/a') || E'\t' || '0' || E'\t' ||
       CASE WHEN COALESCE(max(abs(diff)), 0) <= 0.01 THEN 'PASS' ELSE 'FAIL' END
FROM graded
UNION ALL
SELECT 'PROBE' || E'\t' || 'LEDGER wallets with a negative balance' || E'\t' ||
       count(*) FILTER (WHERE balance < 0)::text || E'\t' || '0' || E'\t' ||
       CASE WHEN count(*) FILTER (WHERE balance < 0) = 0 THEN 'PASS' ELSE 'FAIL' END
FROM wallets
UNION ALL
SELECT 'PROBE' || E'\t' || 'LEDGER wallets with a negative pending_balance' || E'\t' ||
       count(*) FILTER (WHERE COALESCE(pending_balance, 0) < 0)::text || E'\t' || '0' || E'\t' ||
       CASE WHEN count(*) FILTER (WHERE COALESCE(pending_balance, 0) < 0) = 0 THEN 'PASS' ELSE 'FAIL' END
FROM wallets;

-- 3. Ledger direction/type sanity: the shape of a balanced ledger means every
--    credit raises and every debit lowers, and balance_after agrees with the
--    row's own before+amount arithmetic.
SELECT 'PROBE' || E'\t' || 'LEDGER rows where balance_after <> balance_before +/- amount' || E'\t' ||
       count(*)::text || E'\t' || '0' || E'\t' ||
       CASE WHEN count(*) = 0 THEN 'PASS' ELSE 'FAIL' END
FROM wallet_ledger
WHERE abs(
        balance_after - CASE WHEN direction = 'credit' THEN balance_before + amount
                             ELSE balance_before - amount END) > 0.01
UNION ALL
SELECT 'PROBE' || E'\t' || 'LEDGER reference_type values present (must be order/payment_intent only)' || E'\t' ||
       COALESCE(string_agg(distro, ' | ' ORDER BY distro), 'none') || E'\t' || 'order|payment_intent' || E'\t' || 'INFO'
FROM (SELECT reference_type::text || '=' || count(*)::text AS distro
      FROM wallet_ledger GROUP BY reference_type) d
UNION ALL
SELECT 'PROBE' || E'\t' || 'LEDGER order-linked rows with NO matching orders.code (orphans)' || E'\t' ||
       count(*)::text || E'\t' || '0' || E'\t' ||
       CASE WHEN count(*) = 0 THEN 'PASS' ELSE 'FAIL' END
FROM wallet_ledger l
WHERE l.reference_type = 'order'
  AND NOT EXISTS (SELECT 1 FROM orders o WHERE o.code = l.reference_id)
UNION ALL
SELECT 'PROBE' || E'\t' || 'LEDGER rows whose user_id disagrees with the wallet owner' || E'\t' ||
       count(*)::text || E'\t' || '0' || E'\t' ||
       CASE WHEN count(*) = 0 THEN 'PASS' ELSE 'FAIL' END
FROM wallet_ledger l JOIN wallets w ON w.id = l.wallet_id
WHERE l.user_id IS DISTINCT FROM w.user_id
UNION ALL
SELECT 'PROBE' || E'\t' || 'LEDGER paid COMPLETED orders with no purchase debit (unlogged)' || E'\t' ||
       count(*)::text || E'\t' || '0' || E'\t' ||
       CASE WHEN count(*) = 0 THEN 'PASS' ELSE 'FAIL' END
FROM orders o
WHERE o.status = 'COMPLETED' AND o.paid_at IS NOT NULL AND o.total_amount > 0
  AND NOT EXISTS (SELECT 1 FROM wallet_ledger l
                  WHERE l.reference_type = 'order' AND l.reference_id = o.code
                    AND l.type = 'purchase');
