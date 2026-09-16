-- ============================================================================
-- verify_e9.sql  --  Finding E9: NO SEED-RUN INSTANT FINGERPRINT
--
-- Cited as the evidence for the E9 headline number in
--   docs/plans/completed/realistic-db-seed.md  (## Result, "Finding E9" block).
-- This file is the probe that makes that citation true.
--
-- INVARIANT (E9): the seed must not leave a machine-detectable "run instant"
-- inside the data. Two observable forms are graded here:
--   (1) a timestamp column whose SUB-MINUTE RESIDUE (SS.MS) is IDENTICAL across
--       every row -- the signature of back-dating with a whole-minute offset
--       from a single NOW();
--   (2) the seed-run date (20260916) written literally into an identifier or
--       free-text column inside the blast radius.
--
-- THRESHOLDS: 0 fingerprint columns / 0 residue rows.
--   Source: seed-realistic.mts section 21 ("Finding E9: Sub-minute Residue
--   Elimination & Canonical Identifier Verification") throws when the scan
--   returns any hit, and .agents/ORIGINAL_REQUEST.md:909 requires that every
--   number in the plan be produced by a query that ships with the repository.
--
-- WHAT THE PASSING VALUE MEANS (durable rule, .agents/ORIGINAL_REQUEST.md §9):
--   "0 fingerprint columns" means NO column's sub-minute value is a constant --
--   i.e. each timestamp was generated per-row, so the rows cannot be separated
--   from a genuine workload by looking at a shared wall-clock residue. The
--   control probe below ("columns actually scanned" > 0) exists so that a zero
--   result is provably a real zero and not an empty-input artefact.
--
-- READ-ONLY: this file is SELECT-only by construction. The dynamic column scan
-- uses query_to_xml() rather than the seed's CREATE OR REPLACE FUNCTION
-- pg_temp.scan_fingerprints(), because the verifier may not write to the DB.
-- ============================================================================
\set ON_ERROR_STOP on
\echo '### E9 -- seed-run instant fingerprint'

-- ---------------------------------------------------------------------------
-- 1+2. Dynamic scan over EVERY timestamp column in schema public.
--      n  = rows in the column (non-NULL)
--      d  = distinct sub-minute residues (SS.MS), floored to milliseconds
--      A column with n > 1 AND d = 1 is a fingerprint.
--      (d = 1 with n <= 1 is trivial -- 0-row/1-row columns -- and is excluded,
--       otherwise a mid-wipe database would report false fingerprints.)
-- ---------------------------------------------------------------------------
WITH cols AS (
  SELECT c.table_name, c.column_name,
         format(
           'SELECT count(*)::text AS n, count(DISTINCT (EXTRACT(EPOCH FROM (%I))::numeric(20,3) %% 60))::text AS d FROM public.%I WHERE %I IS NOT NULL',
           c.column_name, c.table_name, c.column_name) AS q
  FROM information_schema.columns c
  JOIN information_schema.tables t
    ON t.table_schema = c.table_schema
   AND t.table_name  = c.table_name
   AND t.table_type  = 'BASE TABLE'
  WHERE c.table_schema = 'public'
    AND c.data_type IN ('timestamp with time zone', 'timestamp without time zone')
    AND c.table_name NOT LIKE 'payload_%'
    AND c.table_name NOT LIKE '%\_v'
), scanned AS (
  SELECT s.table_name, s.column_name,
         (xpath('/row/n/text()', s.x))[1]::text::int AS n,
         (xpath('/row/d/text()', s.x))[1]::text::int AS d
  FROM (
    SELECT c.table_name, c.column_name, query_to_xml(c.q, true, true, '') AS x
    FROM cols c
  ) s
)
SELECT concat_ws(E'\t', 'PROBE',
       'E9 control: timestamp columns actually scanned (0 would make every other E9 result vacuous)',
       count(*)::text, '> 0',
       CASE WHEN count(*) > 0 THEN 'PASS' ELSE 'FAIL' END)
FROM scanned;

WITH cols AS (
  SELECT c.table_name, c.column_name,
         format(
           'SELECT count(*)::text AS n, count(DISTINCT (EXTRACT(EPOCH FROM (%I))::numeric(20,3) %% 60))::text AS d FROM public.%I WHERE %I IS NOT NULL',
           c.column_name, c.table_name, c.column_name) AS q
  FROM information_schema.columns c
  JOIN information_schema.tables t
    ON t.table_schema = c.table_schema
   AND t.table_name  = c.table_name
   AND t.table_type  = 'BASE TABLE'
  WHERE c.table_schema = 'public'
    AND c.data_type IN ('timestamp with time zone', 'timestamp without time zone')
    AND c.table_name NOT LIKE 'payload_%'
    AND c.table_name NOT LIKE '%\_v'
), scanned AS (
  SELECT s.table_name, s.column_name,
         (xpath('/row/n/text()', s.x))[1]::text::int AS n,
         (xpath('/row/d/text()', s.x))[1]::text::int AS d
  FROM (
    SELECT c.table_name, c.column_name, query_to_xml(c.q, true, true, '') AS x
    FROM cols c
  ) s
)
SELECT 'PROBE' || E'\t' ||
       'E9 timestamp columns whose sub-minute residue (SS.MS) is constant across ALL rows' || E'\t' ||
       count(*) FILTER (WHERE n > 1 AND d = 1)::text || E'\t' || '0' || E'\t' ||
       CASE WHEN count(*) FILTER (WHERE n > 1 AND d = 1) = 0 THEN 'PASS' ELSE 'FAIL' END
FROM scanned
UNION ALL
SELECT 'PROBE' || E'\t' ||
       'E9 fingerprint hits (table.column, n rows)' || E'\t' ||
       COALESCE(string_agg(table_name || '.' || column_name || ' (n=' || n || ')', ', '), 'none') || E'\t' ||
       'none' || E'\t' || 'INFO'
FROM scanned
WHERE n > 1 AND d = 1;

-- ---------------------------------------------------------------------------
-- 3. Seed-run day-stamp residue in the blast radius (6 columns named in the
--    plan's E8/E9 text). A literal 20260916 in an identifier would betray that
--    the row was synthesised on the run date instead of back-dated.
-- ---------------------------------------------------------------------------
SELECT 'PROBE' || E'\t' || 'E9 residue rows carrying the seed-run day-stamp 20260916 in the blast radius' || E'\t' ||
       ((SELECT count(*) FROM orders        WHERE code        LIKE '%20260916%')
      + (SELECT count(*) FROM orders        WHERE notes       LIKE '%20260916%')
      + (SELECT count(*) FROM refunds       WHERE code        LIKE '%20260916%')
      + (SELECT count(*) FROM withdrawals   WHERE code        LIKE '%20260916%')
      + (SELECT count(*) FROM wallet_ledger WHERE reference_id LIKE '%20260916%')
      + (SELECT count(*) FROM wallet_ledger WHERE description  LIKE '%20260916%'))::text || E'\t' || '0' || E'\t' ||
       CASE WHEN 0 = ((SELECT count(*) FROM orders        WHERE code        LIKE '%20260916%')
                    + (SELECT count(*) FROM orders        WHERE notes       LIKE '%20260916%')
                    + (SELECT count(*) FROM refunds       WHERE code        LIKE '%20260916%')
                    + (SELECT count(*) FROM withdrawals   WHERE code        LIKE '%20260916%')
                    + (SELECT count(*) FROM wallet_ledger WHERE reference_id LIKE '%20260916%')
                    + (SELECT count(*) FROM wallet_ledger WHERE description  LIKE '%20260916%'))
            THEN 'PASS' ELSE 'FAIL' END
UNION ALL
SELECT 'PROBE' || E'\t' || 'E9 residue breakdown (per column)' || E'\t' ||
       'orders.code='  || (SELECT count(*) FROM orders        WHERE code        LIKE '%20260916%')
    || ', orders.notes='|| (SELECT count(*) FROM orders        WHERE notes       LIKE '%20260916%')
    || ', refunds.code='||(SELECT count(*) FROM refunds       WHERE code        LIKE '%20260916%')
    || ', wth.code='   || (SELECT count(*) FROM withdrawals   WHERE code        LIKE '%20260916%')
    || ', ledger.ref=' || (SELECT count(*) FROM wallet_ledger WHERE reference_id LIKE '%20260916%')
    || ', ledger.desc='|| (SELECT count(*) FROM wallet_ledger WHERE description  LIKE '%20260916%')
    || E'\t' || '0' || E'\t' || 'INFO'
UNION ALL
SELECT 'PROBE' || E'\t' || 'E9 blast-radius columns inspected (control)' || E'\t' || '6' || E'\t' || '6' || E'\t' || 'INFO';

-- ---------------------------------------------------------------------------
-- 4. Canonical top-up identifier form (E9-B). Non-canonical top-ups carrying a
--    run-instant epoch-ms are the second half of the E9 finding.
-- ---------------------------------------------------------------------------
SELECT 'PROBE' || E'\t' || 'E9 top-up ledger rows (reference_type = payment_intent)' || E'\t' ||
       count(*)::text || E'\t' || '40' || E'\t' ||
       CASE WHEN count(*) = 40 THEN 'PASS' ELSE 'FAIL' END
FROM wallet_ledger WHERE reference_type = 'payment_intent'
UNION ALL
SELECT 'PROBE' || E'\t' || 'E9 top-ups in canonical KTH<base36><3-digit> form' || E'\t' ||
       count(*)::text || E'\t' || '40' || E'\t' ||
       CASE WHEN count(*) = 40 THEN 'PASS' ELSE 'FAIL' END
FROM wallet_ledger WHERE reference_type = 'payment_intent' AND reference_id ~ '^KTH[0-9A-Z]{7,10}[0-9]{3}$'
UNION ALL
SELECT 'PROBE' || E'\t' || 'E9 top-ups in legacy PI-TOPUP-% form' || E'\t' ||
       count(*)::text || E'\t' || '0' || E'\t' ||
       CASE WHEN count(*) = 0 THEN 'PASS' ELSE 'FAIL' END
FROM wallet_ledger WHERE reference_type = 'payment_intent' AND reference_id LIKE 'PI-TOPUP-%'
UNION ALL
SELECT 'PROBE' || E'\t' || 'E9 top-ups carrying epoch-ms (run-instant leak)' || E'\t' ||
       count(*)::text || E'\t' || '0' || E'\t' ||
       CASE WHEN count(*) = 0 THEN 'PASS' ELSE 'FAIL' END
FROM wallet_ledger WHERE reference_type = 'payment_intent' AND reference_id ~ '^PI-TOPUP-[0-9]+-[0-9]{13}$'
UNION ALL
SELECT 'PROBE' || E'\t' || 'E9 distinct sub-minute residues across the 40 top-up rows' || E'\t' ||
       count(DISTINCT to_char(created_at, 'SS.MS'))::text || E'\t' || '>= 35' || E'\t' ||
       CASE WHEN count(DISTINCT to_char(created_at, 'SS.MS')) >= 35 THEN 'PASS' ELSE 'FAIL' END
FROM wallet_ledger WHERE reference_type = 'payment_intent';

-- ---------------------------------------------------------------------------
-- 5. Every top-up reference resolves to a real payment_intents.code (E9-B2).
-- ---------------------------------------------------------------------------
SELECT 'PROBE' || E'\t' || 'E9 payment_intents rows' || E'\t' || (SELECT count(*) FROM payment_intents)::text || E'\t' || '40' || E'\t' ||
       CASE WHEN (SELECT count(*) FROM payment_intents) = 40 THEN 'PASS' ELSE 'FAIL' END
UNION ALL
SELECT 'PROBE' || E'\t' || 'E9 orphan top-up ledger references (no matching payment_intents.code)' || E'\t' ||
       (SELECT count(*) FROM wallet_ledger l
         WHERE l.reference_type = 'payment_intent'
           AND NOT EXISTS (SELECT 1 FROM payment_intents pi WHERE pi.code = l.reference_id))::text || E'\t' || '0' || E'\t' ||
       CASE WHEN (SELECT count(*) FROM wallet_ledger l
                   WHERE l.reference_type = 'payment_intent'
                     AND NOT EXISTS (SELECT 1 FROM payment_intents pi WHERE pi.code = l.reference_id)) = 0
            THEN 'PASS' ELSE 'FAIL' END;

-- ---------------------------------------------------------------------------
-- 6. Withdrawal cadence is irregular (E9-C): constant 70h gaps are a run
--    fingerprint in the timeline, not in a sub-minute residue.
-- ---------------------------------------------------------------------------
WITH g AS (
  SELECT created_at - lag(created_at) OVER (ORDER BY id) AS gap
  FROM withdrawals
)
SELECT 'PROBE' || E'\t' || 'E9 withdrawal cadence distinct gaps (want irregular, not constant)' || E'\t' ||
       count(DISTINCT gap)::text || E'\t' || '>= 5' || E'\t' ||
       CASE WHEN count(DISTINCT gap) >= 5 THEN 'PASS' ELSE 'FAIL' END
FROM g WHERE gap IS NOT NULL
UNION ALL
SELECT 'PROBE' || E'\t' || 'E9 withdrawal cadence constant 70h (2 days 22 hours) gaps' || E'\t' ||
       count(*) FILTER (WHERE gap = INTERVAL '2 days 22 hours')::text || E'\t' || '0' || E'\t' ||
       CASE WHEN count(*) FILTER (WHERE gap = INTERVAL '2 days 22 hours') = 0 THEN 'PASS' ELSE 'FAIL' END
FROM g WHERE gap IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 7. Admin id=1 byte-for-byte preservation (E9 / A2). Back-dating the admin
--    instead of preserving it is the historical root cause of the E9 finding.
-- ---------------------------------------------------------------------------
SELECT 'PROBE' || E'\t' || 'E9/A2 admin id=1 email preserved' || E'\t' ||
       COALESCE(email, 'missing') || E'\t' || 'eszxcvfd@gmail.com' || E'\t' ||
       CASE WHEN email = 'eszxcvfd@gmail.com' THEN 'PASS' ELSE 'FAIL' END
FROM users WHERE id = 1
UNION ALL
SELECT 'PROBE' || E'\t' || 'E9/A2 admin id=1 salt preserved byte-for-byte' || E'\t' ||
       CASE WHEN salt = '39c4aa8dc017d723d2f3cb6513a11b9b3d2a6e4f6846b0e70e3bba8043018678' THEN 'match' ELSE 'MISMATCH: ' || left(COALESCE(salt,'null'), 16) || '...' END || E'\t' ||
       '39c4aa8dc0...(64 hex)' || E'\t' ||
       CASE WHEN salt = '39c4aa8dc017d723d2f3cb6513a11b9b3d2a6e4f6846b0e70e3bba8043018678' THEN 'PASS' ELSE 'FAIL' END
FROM users WHERE id = 1
UNION ALL
SELECT 'PROBE' || E'\t' || 'E9/A2 admin id=1 created_at preserved' || E'\t' ||
       COALESCE(to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'), 'missing') || E'\t' ||
       '2026-01-14T08:52:56.753Z' || E'\t' ||
       CASE WHEN to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') = '2026-01-14T08:52:56.753Z' THEN 'PASS' ELSE 'FAIL' END
FROM users WHERE id = 1;
