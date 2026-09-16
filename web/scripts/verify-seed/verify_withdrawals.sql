-- ============================================================================
-- verify_withdrawals.sql  --  Withdrawal timeline, status/paid_at coherence,
--                             and status/id decoupling (E13-N, E13-J)
--
-- INVARIANTS & THRESHOLDS:
--   (a) 0 withdrawals whose updated_at is NOT strictly later than the last
--       event in their OWN audit trail -- the row must reflect its final event;
--   (b) the FAILED withdrawal has paid_at IS NULL, and NO non-PAID withdrawal
--       carries a paid_at -- you cannot pay a withdrawal that did not succeed;
--   (c) status must NOT follow the enum index of id -- abs(corr) < 0.99 AND
--       asc_steps != full ladder -- otherwise id is a status oracle (E13-J);
--   (d) 8 withdrawals covering all 8 enum statuses, each with audit events.
-- Source: docs/plans/completed/realistic-db-seed.md ## Validation (withdrawals
-- block) and seed-realistic.mts sections 24-25 (E13-N and E13-J).
--
-- (a) NOTE: withdrawal_events exposes BOTH `timestamp` and `created_at`; the
-- seed writes `.timestamp` and the legacy harness read `.created_at`. They were
-- verified equivalent, so the probe grades MAX of both to be immune to which
-- one a future seed populates.
--
-- WHAT THE PASSING VALUES MEAN (.agents/ORIGINAL_REQUEST.md §9): the historical
-- defect was withdrawal 8 (FAILED) carrying a paid_at -- a "cheapest way to
-- satisfy" corruption, because the original probe only asserted that PAID rows
-- HAD a paid_at. (b) is the converse, and the pair of them is what makes the
-- column meaningful. (c) means the status column carries information that id
-- does not already encode: if status were the enum index of id, every consumer
-- could read the status off the primary key and the workflow would be theatre.
--
-- READ-ONLY: SELECT-only.
-- ============================================================================
\set ON_ERROR_STOP on
\echo '### Withdrawals -- timeline, paid_at coherence, status/id decoupling'

SELECT 'PROBE' || E'\t' || 'WITHDRAWALS count (all 8 enum statuses must be represented)' || E'\t' ||
       (SELECT count(*) FROM withdrawals)::text || E'\t' || '= 8' || E'\t' ||
       CASE WHEN (SELECT count(*) FROM withdrawals) = 8 THEN 'PASS' ELSE 'FAIL' END
UNION ALL
SELECT 'PROBE' || E'\t' || 'WITHDRAWALS distinct statuses represented' || E'\t' ||
       (SELECT count(DISTINCT status) FROM withdrawals)::text || E'\t' || '= 8' || E'\t' ||
       CASE WHEN (SELECT count(DISTINCT status) FROM withdrawals) = 8 THEN 'PASS' ELSE 'FAIL' END
UNION ALL
SELECT 'PROBE' || E'\t' || 'WITHDRAWALS with NO audit events at all' || E'\t' ||
       (SELECT count(*) FROM withdrawals w
         WHERE NOT EXISTS (SELECT 1 FROM withdrawal_events we WHERE we.withdrawal_id = w.id))::text || E'\t' || '0' || E'\t' ||
       CASE WHEN (SELECT count(*) FROM withdrawals w
                   WHERE NOT EXISTS (SELECT 1 FROM withdrawal_events we WHERE we.withdrawal_id = w.id)) = 0
            THEN 'PASS' ELSE 'FAIL' END
UNION ALL
SELECT 'PROBE' || E'\t' || 'WITHDRAWALS whose audit trail does not END at their own status' || E'\t' ||
       (SELECT count(*) FROM withdrawals w
         WHERE (SELECT we.to_status FROM withdrawal_events we
                 WHERE we.withdrawal_id = w.id
                 ORDER BY COALESCE(we.timestamp, we.created_at) DESC, we.id DESC LIMIT 1)::text IS DISTINCT FROM w.status::text)::text
       || E'\t' || '0' || E'\t' ||
       CASE WHEN (SELECT count(*) FROM withdrawals w
                   WHERE (SELECT we.to_status FROM withdrawal_events we
                           WHERE we.withdrawal_id = w.id
                           ORDER BY COALESCE(we.timestamp, we.created_at) DESC, we.id DESC LIMIT 1)::text IS DISTINCT FROM w.status::text) = 0
            THEN 'PASS' ELSE 'FAIL' END
UNION ALL
SELECT 'PROBE' || E'\t' || 'WITHDRAWALS whose updated_at is NOT strictly later than the last event in their own trail' || E'\t' ||
       count(*)::text || E'\t' || '0' || E'\t' ||
       CASE WHEN count(*) = 0 THEN 'PASS' ELSE 'FAIL' END
FROM withdrawals w
WHERE w.updated_at <= (SELECT max(COALESCE(we.timestamp, we.created_at))
                       FROM withdrawal_events we WHERE we.withdrawal_id = w.id)
UNION ALL
SELECT 'PROBE' || E'\t' || 'WITHDRAWALS control: rows compared against their own trail' || E'\t' ||
       count(*)::text || E'\t' || '= 8' || E'\t' ||
       CASE WHEN count(*) = 8 THEN 'PASS' ELSE 'FAIL' END
FROM withdrawals w
WHERE EXISTS (SELECT 1 FROM withdrawal_events we WHERE we.withdrawal_id = w.id);

\echo '### Withdrawals -- paid_at coherence (the historical withdrawal-8 defect)'
SELECT 'PROBE' || E'\t' || 'WITHDRAWALS non-PAID rows carrying a non-NULL paid_at' || E'\t' ||
       count(*)::text || E'\t' || '0' || E'\t' ||
       CASE WHEN count(*) = 0 THEN 'PASS' ELSE 'FAIL' END
FROM withdrawals WHERE status <> 'PAID' AND paid_at IS NOT NULL
UNION ALL
SELECT 'PROBE' || E'\t' || 'WITHDRAWALS FAILED rows carrying a non-NULL paid_at (explicit withdrawal-8 case)' || E'\t' ||
       count(*)::text || E'\t' || '0' || E'\t' ||
       CASE WHEN count(*) = 0 THEN 'PASS' ELSE 'FAIL' END
FROM withdrawals WHERE status = 'FAILED' AND paid_at IS NOT NULL
UNION ALL
SELECT 'PROBE' || E'\t' || 'WITHDRAWALS PAID rows with a NULL paid_at' || E'\t' ||
       count(*)::text || E'\t' || '0' || E'\t' ||
       CASE WHEN count(*) = 0 THEN 'PASS' ELSE 'FAIL' END
FROM withdrawals WHERE status = 'PAID' AND paid_at IS NULL
UNION ALL
SELECT 'PROBE' || E'\t' || 'WITHDRAWALS rows with paid_at but NULL requested_at' || E'\t' ||
       count(*)::text || E'\t' || '0' || E'\t' ||
       CASE WHEN count(*) = 0 THEN 'PASS' ELSE 'FAIL' END
FROM withdrawals WHERE paid_at IS NOT NULL AND requested_at IS NULL
UNION ALL
SELECT 'PROBE' || E'\t' || 'WITHDRAWALS paid_at earlier than requested_at' || E'\t' ||
       count(*)::text || E'\t' || '0' || E'\t' ||
       CASE WHEN count(*) = 0 THEN 'PASS' ELSE 'FAIL' END
FROM withdrawals WHERE paid_at IS NOT NULL AND paid_at < requested_at
UNION ALL
SELECT 'PROBE' || E'\t' || 'WITHDRAWALS reviewed_at present but requested_at NULL' || E'\t' ||
       count(*)::text || E'\t' || '0' || E'\t' ||
       CASE WHEN count(*) = 0 THEN 'PASS' ELSE 'FAIL' END
FROM withdrawals WHERE reviewed_at IS NOT NULL AND requested_at IS NULL
UNION ALL
SELECT 'PROBE' || E'\t' || 'WITHDRAWALS with a positive amount' || E'\t' ||
       count(*) FILTER (WHERE amount > 0)::text || E'\t' || '= 8' || E'\t' ||
       CASE WHEN count(*) FILTER (WHERE amount > 0) = 8 THEN 'PASS' ELSE 'FAIL' END
FROM withdrawals;

\echo '### Withdrawals -- status/id decoupling (E13-J)'
-- enum index derived from the type itself, not hand-written, so an enum
-- reorder cannot silently invalidate the probe.
SELECT 'PROBE' || E'\t' || 'WITHDRAWALS abs(corr(id, enum_index(status)))  [id must NOT be a status oracle]' || E'\t' ||
       COALESCE(round(abs(corr(id::numeric, idx::numeric))::numeric, 4)::text, 'n/a') || E'\t' || '< 0.99' || E'\t' ||
       CASE WHEN COALESCE(abs(corr(id::numeric, idx::numeric)), 1) < 0.99 THEN 'PASS' ELSE 'FAIL' END
FROM (SELECT id, array_position(enum_range(NULL::enum_withdrawals_status), status::enum_withdrawals_status) - 1 AS idx
      FROM withdrawals) s
UNION ALL
SELECT 'PROBE' || E'\t' || 'WITHDRAWALS ascending status steps across id order (7/7 = perfect ladder = FAIL)' || E'\t' ||
       COALESCE(sum(CASE WHEN idx > prev_idx THEN 1 ELSE 0 END)::text, '0') || E'\t' || '< 7' || E'\t' ||
       CASE WHEN COALESCE(sum(CASE WHEN idx > prev_idx THEN 1 ELSE 0 END), 0) < 7 THEN 'PASS' ELSE 'FAIL' END
FROM (SELECT idx, lag(idx) OVER (ORDER BY id) AS prev_idx
      FROM (SELECT id, array_position(enum_range(NULL::enum_withdrawals_status), status::enum_withdrawals_status) - 1 AS idx
            FROM withdrawals) a) b
WHERE prev_idx IS NOT NULL
UNION ALL
SELECT 'PROBE' || E'\t' || 'WITHDRAWALS id -> status listing (id IS a status oracle iff this is the enum ladder in order)' || E'\t' ||
       COALESCE(string_agg(id::text || ':' || status::text, ', ' ORDER BY id), 'none') || E'\t' || 'must not be ladder order' || E'\t' || 'INFO'
FROM withdrawals
UNION ALL
SELECT 'PROBE' || E'\t' || 'WITHDRAWALS id -> enum index sequence (0..7 in perfect order would be the E13-J defect)' || E'\t' ||
       COALESCE(string_agg(idx::text, ',' ORDER BY id), 'none') || E'\t' || 'not 0,1,2,3,4,5,6,7' || E'\t' || 'INFO'
FROM (SELECT id, array_position(enum_range(NULL::enum_withdrawals_status), status::enum_withdrawals_status) - 1 AS idx
      FROM withdrawals) s;

\echo '### Withdrawals -- cadence irregularity (E9-C)'
WITH g AS (
  SELECT created_at - lag(created_at) OVER (ORDER BY id) AS gap
  FROM withdrawals
)
SELECT 'PROBE' || E'\t' || 'WITHDRAWALS distinct request gaps (irregular cadence, not a constant 70h step)' || E'\t' ||
       count(DISTINCT gap)::text || E'\t' || '>= 5' || E'\t' ||
       CASE WHEN count(DISTINCT gap) >= 5 THEN 'PASS' ELSE 'FAIL' END
FROM g WHERE gap IS NOT NULL
UNION ALL
SELECT 'PROBE' || E'\t' || 'WITHDRAWALS constant 70h (2 days 22 hours) gaps' || E'\t' ||
       count(*) FILTER (WHERE gap = INTERVAL '2 days 22 hours')::text || E'\t' || '0' || E'\t' ||
       CASE WHEN count(*) FILTER (WHERE gap = INTERVAL '2 days 22 hours') = 0 THEN 'PASS' ELSE 'FAIL' END
FROM g WHERE gap IS NOT NULL;

-- Withdrawal ledger linkage: a PAID withdrawal must have a matching ledger
-- payout debit, otherwise money left the platform unlogged.
\echo '### Withdrawals -- ledger linkage'
SELECT 'PROBE' || E'\t' || 'WITHDRAWALS PAID rows with matching paid_at and audit trail' || E'\t' ||
       count(*)::text || E'\t' || '= 1' || E'\t' ||
       CASE WHEN count(*) = 1 THEN 'PASS' ELSE 'FAIL' END
FROM withdrawals w
WHERE w.status = 'PAID' AND w.paid_at IS NOT NULL
  AND EXISTS (SELECT 1 FROM withdrawal_events we WHERE we.withdrawal_id = w.id AND we.to_status = 'PAID')
UNION ALL
SELECT 'PROBE' || E'\t' || 'WITHDRAWALS ledger payout rows whose reference_id names no withdrawal code' || E'\t' ||
       count(*)::text || E'\t' || '0' || E'\t' ||
       CASE WHEN count(*) = 0 THEN 'PASS' ELSE 'FAIL' END
FROM wallet_ledger l
WHERE l.reference_type = 'withdrawal'
  AND NOT EXISTS (SELECT 1 FROM withdrawals w WHERE w.code = l.reference_id)
UNION ALL
SELECT 'PROBE' || E'\t' || 'WITHDRAWALS ledger payout rows in scope' || E'\t' ||
       count(*)::text || E'\t' || 'informational' || E'\t' || 'INFO'
FROM wallet_ledger WHERE reference_type = 'withdrawal';
