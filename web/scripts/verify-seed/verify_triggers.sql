-- ============================================================================
-- verify_triggers.sql  --  Financial-safety triggers present and active
--
-- INVARIANT: all 5 financial-safety triggers exist and are ENABLED, i.e.
-- tgenabled IN ('O','A') ('O' = fires on origin, 'A' = always/replica too).
-- A trigger that exists but is DISABLED ('D') is worse than an absent one: the
-- table looks protected in a schema dump and is not protected at runtime.
-- Threshold: count = 5, 0 disabled.
-- Source: docs/plans/completed/realistic-db-seed.md ## Validation ("All 5 triggers
-- verified active") and .agents/ORIGINAL_REQUEST.md (the BR-04 anti-self-
-- purchase rule is a domain invariant, not a seed convenience).
--
-- The NEGATIVE half of this invariant -- that each trigger actually RAISES on a
-- prohibited statement -- inherently requires DML and therefore lives in the
-- existing harness (seed-realistic.mts / the test-int suite); a SELECT-only
-- verifier cannot prove a trigger raises. What this probe CAN prove, and does,
-- is presence + enabled state + correct event/table binding, and it says so.
--
-- WHAT THE PASSING VALUE MEANS (.agents/ORIGINAL_REQUEST.md §9): "5, all
-- enabled" means the append-only ledger, the undeletable wallets and the
-- seller anti-self-purchase rule are enforced by the DATABASE rather than by
-- application convention -- so a bug in the seed (or in any future migration)
-- cannot quietly mutate financial history. The number is graded jointly with
-- the binding columns, because 5 triggers on the wrong tables would be a
-- spurious pass.
--
-- READ-ONLY: SELECT-only.
-- ============================================================================
\set ON_ERROR_STOP on
\echo '### Financial-safety triggers'

SELECT 'PROBE' || E'\t' || 'TRIGGERS present count' || E'\t' ||
       count(*)::text || E'\t' || '= 5' || E'\t' ||
       CASE WHEN count(*) = 5 THEN 'PASS' ELSE 'FAIL' END
FROM pg_trigger t
JOIN pg_class c ON c.oid = t.tgrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND NOT t.tgisinternal
UNION ALL
SELECT 'PROBE' || E'\t' || 'TRIGGERS enabled count (tgenabled IN O,A)' || E'\t' ||
       count(*) FILTER (WHERE t.tgenabled IN ('O', 'A'))::text || E'\t' || '= 5' || E'\t' ||
       CASE WHEN count(*) FILTER (WHERE t.tgenabled IN ('O', 'A')) = 5 THEN 'PASS' ELSE 'FAIL' END
FROM pg_trigger t
JOIN pg_class c ON c.oid = t.tgrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND NOT t.tgisinternal
UNION ALL
SELECT 'PROBE' || E'\t' || 'TRIGGERS DISABLED (tgenabled = D) -- absence-of-protection' || E'\t' ||
       count(*) FILTER (WHERE t.tgenabled = 'D')::text || E'\t' || '0' || E'\t' ||
       CASE WHEN count(*) FILTER (WHERE t.tgenabled = 'D') = 0 THEN 'PASS' ELSE 'FAIL' END
FROM pg_trigger t
JOIN pg_class c ON c.oid = t.tgrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND NOT t.tgisinternal
UNION ALL
SELECT 'PROBE' || E'\t' || 'TRIGGERS control: any trigger present at all (0 would make the lines above vacuous)' || E'\t' ||
       count(*)::text || E'\t' || '> 0' || E'\t' ||
       CASE WHEN count(*) > 0 THEN 'PASS' ELSE 'FAIL' END
FROM pg_trigger t
JOIN pg_class c ON c.oid = t.tgrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND NOT t.tgisinternal;

-- Per-trigger binding. Expected set:
--   enforce_br04_seller_anti_self_purchase on order_items
--   forbid_ledger_mutation               on wallet_ledger
--   forbid_ledger_truncate               on wallet_ledger
--   forbid_wallet_delete                 on wallets
--   forbid_wallet_truncate               on wallets
SELECT 'PROBE' || E'\t' || 'TRIGGERS ' || t.tgname || ' on ' || c.relname || ' enabled=' || t.tgenabled::text || E'\t' ||
       'expected ' || e.relname || E'\t' ||
       (CASE WHEN c.relname = e.relname AND t.tgenabled IN ('O', 'A') THEN 'PASS' ELSE 'FAIL' END)
FROM pg_trigger t
JOIN pg_class c ON c.oid = t.tgrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
JOIN (VALUES
        ('enforce_br04_seller_anti_self_purchase', 'order_items'),
        ('forbid_ledger_mutation',                 'wallet_ledger'),
        ('forbid_ledger_truncate',                 'wallet_ledger'),
        ('forbid_wallet_delete',                   'wallets'),
        ('forbid_wallet_truncate',                 'wallets')
     ) AS e(tgname, relname) ON e.tgname = t.tgname
WHERE n.nspname = 'public' AND NOT t.tgisinternal
ORDER BY t.tgname;

-- Each expected trigger must be individually accounted for: a missing one
-- cannot hide behind the count of 5 if some unexpected trigger replaced it.
WITH expected(tgname, relname) AS (
  VALUES ('enforce_br04_seller_anti_self_purchase', 'order_items'),
         ('forbid_ledger_mutation',                 'wallet_ledger'),
         ('forbid_ledger_truncate',                 'wallet_ledger'),
         ('forbid_wallet_delete',                   'wallets'),
         ('forbid_wallet_truncate',                 'wallets')
)
SELECT 'PROBE' || E'\t' || 'TRIGGERS expected trigger MISSING or on the wrong table: ' || e.tgname || E'\t' ||
       COALESCE('found on ' || (SELECT c.relname FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid WHERE t.tgname = e.tgname LIMIT 1), 'NOT FOUND') || E'\t' ||
       'expected ' || e.relname || E'\t' ||
       CASE WHEN EXISTS (SELECT 1 FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
                         WHERE t.tgname = e.tgname AND c.relname = e.relname AND t.tgenabled IN ('O', 'A'))
            THEN 'PASS' ELSE 'FAIL' END
FROM expected e
ORDER BY e.tgname;

-- The trigger function itself must exist.
SELECT 'PROBE' || E'\t' || 'TRIGGERS forbid_financial_mutation() function present' || E'\t' ||
       count(*)::text || E'\t' || '= 1' || E'\t' ||
       CASE WHEN count(*) = 1 THEN 'PASS' ELSE 'FAIL' END
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname = 'forbid_financial_mutation'
UNION ALL
SELECT 'PROBE' || E'\t' || 'TRIGGERS check_seller_self_purchase() function present' || E'\t' ||
       count(*)::text || E'\t' || '= 1' || E'\t' ||
       CASE WHEN count(*) = 1 THEN 'PASS' ELSE 'FAIL' END
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname = 'check_seller_self_purchase';
