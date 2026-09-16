-- ============================================================================
-- verify_entitlements.sql  --  Entitlement coverage & refund revocation
--
-- INVARIANTS:
--   (a) entitlements count = 188 = 172 active + 16 revoked;
--   (b) 0 COMPLETED digital orders without an ACTIVE entitlement (a buyer who
--       paid must be able to download what they paid for);
--   (c) 0 refunds whose order still has an ACTIVE entitlement (a refunded buyer
--       must not retain access).
-- Thresholds: exact counts 188/172/16 and 0/0.
-- Source: docs/plans/completed/realistic-db-seed.md ## Validation ("Entitlements:
-- count = 188 (172 active / 16 revoked); 0 completed digital orders lacking
-- active entitlements; 0 refunds without revoked entitlements").
--
-- JOIN-KEY TRAP (explicitly called out in the task brief): wallet_ledger
-- refund rows carry reference_type = 'order', NOT 'refund'. Querying
-- reference_type = 'refund' returns 0 rows and manufactures a FALSE CLEAN
-- result. Probe (c) below therefore joins refunds -> entitlements on
-- order_id with status = 'revoked', and uses refunds.entitlement_revoked as
-- the authoritative flag -- it never filters the ledger on 'refund'.
--
-- WHAT THE PASSING VALUE MEANS (.agents/ORIGINAL_REQUEST.md §9): "188 = 172 +
-- 16" means access rights are a bijection with paid orders plus revoked
-- refunds -- every paid order has exactly one grant and every refund has
-- exactly one revocation. "0 active entitlements on refunded orders" means
-- revocation actually happened rather than being merely intended; the cheap
-- way to satisfy a count-only probe (flip 16 rows to 'revoked' without
-- touching the refunds) still fails probe (c)'s converse.
--
-- READ-ONLY: SELECT-only.
-- ============================================================================
\set ON_ERROR_STOP on
\echo '### Entitlements coverage'

SELECT 'PROBE' || E'\t' || 'ENTITLEMENTS total count' || E'\t' ||
       (SELECT count(*) FROM entitlements)::text || E'\t' || '188' || E'\t' ||
       CASE WHEN (SELECT count(*) FROM entitlements) = 188 THEN 'PASS' ELSE 'FAIL' END
UNION ALL
SELECT 'PROBE' || E'\t' || 'ENTITLEMENTS active count' || E'\t' ||
       (SELECT count(*) FROM entitlements WHERE status = 'active')::text || E'\t' || '172' || E'\t' ||
       CASE WHEN (SELECT count(*) FROM entitlements WHERE status = 'active') = 172 THEN 'PASS' ELSE 'FAIL' END
UNION ALL
SELECT 'PROBE' || E'\t' || 'ENTITLEMENTS revoked count' || E'\t' ||
       (SELECT count(*) FROM entitlements WHERE status = 'revoked')::text || E'\t' || '16' || E'\t' ||
       CASE WHEN (SELECT count(*) FROM entitlements WHERE status = 'revoked') = 16 THEN 'PASS' ELSE 'FAIL' END
UNION ALL
SELECT 'PROBE' || E'\t' || 'ENTITLEMENTS expired count (must be 0; expired is a 4th lifecycle state)' || E'\t' ||
       (SELECT count(*) FROM entitlements WHERE status = 'expired')::text || E'\t' || '0' || E'\t' ||
       CASE WHEN (SELECT count(*) FROM entitlements WHERE status = 'expired') = 0 THEN 'PASS' ELSE 'FAIL' END
UNION ALL
SELECT 'PROBE' || E'\t' || 'ENTITLEMENTS status partition reconciles (active + revoked + expired = total)' || E'\t' ||
       (SELECT (count(*) FILTER (WHERE status = 'active'))::text || '+' ||
               (count(*) FILTER (WHERE status = 'revoked'))::text || '+' ||
               (count(*) FILTER (WHERE status = 'expired'))::text || ' = ' || count(*)::text
        FROM entitlements) || E'\t' || 'sum = total' || E'\t' ||
       CASE WHEN (SELECT count(*) FROM entitlements) =
                 (SELECT count(*) FILTER (WHERE status = 'active') + count(*) FILTER (WHERE status = 'revoked') + count(*) FILTER (WHERE status = 'expired') FROM entitlements)
            THEN 'PASS' ELSE 'FAIL' END;

-- (b) COMPLETED orders lacking an active entitlement.
SELECT 'PROBE' || E'\t' || 'ENTITLEMENTS COMPLETED orders with NO active entitlement' || E'\t' ||
       count(*)::text || E'\t' || '0' || E'\t' ||
       CASE WHEN count(*) = 0 THEN 'PASS' ELSE 'FAIL' END
FROM orders o
WHERE o.status = 'COMPLETED'
  AND NOT EXISTS (SELECT 1 FROM entitlements e
                  WHERE e.order_id = o.id AND e.status = 'active')
UNION ALL
SELECT 'PROBE' || E'\t' || 'ENTITLEMENTS control: COMPLETED orders in scope (0 would make the line above vacuous)' || E'\t' ||
       count(*)::text || E'\t' || '> 0' || E'\t' ||
       CASE WHEN count(*) > 0 THEN 'PASS' ELSE 'FAIL' END
FROM orders WHERE status = 'COMPLETED'
UNION ALL
SELECT 'PROBE' || E'\t' || 'ENTITLEMENTS duplicate active grants for the same order' || E'\t' ||
       COALESCE(sum(c - 1), 0)::text || E'\t' || '0' || E'\t' ||
       CASE WHEN COALESCE(sum(c - 1), 0) = 0 THEN 'PASS' ELSE 'FAIL' END
FROM (SELECT order_id, count(*) AS c FROM entitlements WHERE status = 'active' GROUP BY order_id HAVING count(*) > 1) d;

-- (c) Refunds must have revoked the entitlement. NEVER filter the ledger on
--     reference_type = 'refund' here -- that returns 0 and fakes a pass.
SELECT 'PROBE' || E'\t' || 'ENTITLEMENTS refunds with entitlement_revoked = true but the order still has an ACTIVE entitlement' || E'\t' ||
       count(*)::text || E'\t' || '0' || E'\t' ||
       CASE WHEN count(*) = 0 THEN 'PASS' ELSE 'FAIL' END
FROM refunds r
WHERE r.entitlement_revoked = true
  AND EXISTS (SELECT 1 FROM entitlements e WHERE e.order_id = r.order_id AND e.status = 'active')
UNION ALL
SELECT 'PROBE' || E'\t' || 'ENTITLEMENTS control: refunds flagged entitlement_revoked = true in scope' || E'\t' ||
       count(*)::text || E'\t' || '16' || E'\t' ||
       CASE WHEN count(*) = 16 THEN 'PASS' ELSE 'FAIL' END
FROM refunds WHERE entitlement_revoked = true
UNION ALL
SELECT 'PROBE' || E'\t' || 'ENTITLEMENTS refunds whose order has NO revoked entitlement row' || E'\t' ||
       count(*)::text || E'\t' || '0' || E'\t' ||
       CASE WHEN count(*) = 0 THEN 'PASS' ELSE 'FAIL' END
FROM refunds r
WHERE NOT EXISTS (SELECT 1 FROM entitlements e
                  WHERE e.order_id = r.order_id AND e.status = 'revoked')
UNION ALL
SELECT 'PROBE' || E'\t' || 'ENTITLEMENTS revoked rows whose order has NO REFUNDED order (revocation without cause)' || E'\t' ||
       count(*)::text || E'\t' || '0' || E'\t' ||
       CASE WHEN count(*) = 0 THEN 'PASS' ELSE 'FAIL' END
FROM entitlements e
WHERE e.status = 'revoked'
  AND NOT EXISTS (SELECT 1 FROM orders o WHERE o.id = e.order_id AND o.status = 'REFUNDED');

-- E4 causal integrity: an entitlement must never predate the order it grants.
SELECT 'PROBE' || E'\t' || 'ENTITLEMENTS granted_at earlier than their order created_at' || E'\t' ||
       count(*)::text || E'\t' || '0' || E'\t' ||
       CASE WHEN count(*) = 0 THEN 'PASS' ELSE 'FAIL' END
FROM entitlements e JOIN orders o ON o.id = e.order_id
WHERE e.granted_at < o.created_at
UNION ALL
SELECT 'PROBE' || E'\t' || 'ENTITLEMENTS active grants with granted_at identical to the order paid_at (no latency)' || E'\t' ||
       count(*)::text || E'\t' || '0' || E'\t' ||
       CASE WHEN count(*) = 0 THEN 'PASS' ELSE 'FAIL' END
FROM entitlements e JOIN orders o ON o.id = e.order_id
WHERE e.status = 'active' AND o.paid_at IS NOT NULL AND e.granted_at = o.paid_at
UNION ALL
SELECT 'PROBE' || E'\t' || 'ENTITLEMENTS revoked rows whose revoked_at = granted_at' || E'\t' ||
       count(*)::text || E'\t' || '0' || E'\t' ||
       CASE WHEN count(*) = 0 THEN 'PASS' ELSE 'FAIL' END
FROM entitlements
WHERE status = 'revoked' AND revoked_at IS NOT NULL AND revoked_at = granted_at;
