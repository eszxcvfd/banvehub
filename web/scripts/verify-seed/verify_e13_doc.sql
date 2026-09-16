-- ============================================================================
-- verify_e13_doc.sql  --  E13-DOC: product creation-day spread
--
-- INVARIANT: products must be listed across MANY distinct calendar days, not
-- dumped on one date.
--   MEASURED: count(DISTINCT to_char(created_at,'YYYY-MM-DD')) FROM products.
--   THRESHOLD: the plan's `## Validation` block, line 350, states the criterion
--   as an EXACT VALUE, not an inequality:
--     "Products distinct-day probe (E13-DOC): products span 158 distinct
--      calendar dates (`SELECT count(DISTINCT to_char(created_at,
--      'YYYY-MM-DD')) FROM products` = 158), backing continuous catalogue
--      growth."
--   so the threshold below is `= 158` with the plan line cited. An exact-value
--   threshold is strictly stronger than the loose ">= 150" this probe used to
--   carry: a `>= 150` bar would let a regression to 151 days pass silently
--   while the plan still claimed 158. There is NO ">= 150" criterion anywhere
--   in the plan (grep '150' matches only an unrelated "150 purchases" at L97
--   and a VND amount at L256) -- that bar was unsourced and is removed.
--
-- WHERE 158 COMES FROM (independently reproduced from the generator, so the
--   probe is not merely trusting the plan): seed-realistic.mts product-date
--   loop starts at 2026-02-15T08:30:15.241Z and advances a cumulative
--   timestamp by stepMs = 19.60h + ((p*17+7)%23)h + ((p*31+13)%60)min
--   + ((p*47+5)%60)s + (p*73%1000)ms for 161 products. Replaying that exact
--   arithmetic in UTC yields 158 distinct calendar days, min step 19.70h, max
--   step 42.47h over a 207-day span -- matching the plan and the live
--   database. (The same timestamps bucket to 160 days in Asia/Bangkok; the
--   server timezone is UTC, so UTC day buckets are the correct ones.)
--
-- ⚠ THE THRESHOLD BELOW IS THE PLAN'S, NOT THE MEASURED VALUE. If the measured
--   value does not equal it, this probe reports FAIL and the plan must be
--   corrected -- the measurement is never adjusted to fit the plan. During the
--   reseed this count read 44 mid-wipe (products repopulating) before settling
--   at 158, which is exactly why the number must come from a probe that ships
--   with the repository rather than from a one-off reading.
--
-- WHAT THE PASSING VALUE MEANS (.agents/ORIGINAL_REQUEST.md §9): a high
-- distinct-day count means the catalogue has a credible listing HISTORY -- new
-- products keep appearing month to month, so a "new this month" or "trending"
-- surface is meaningful. The cheapest way to satisfy a bare row count (create
-- all 161 products with the same timestamp) fails this probe, which is the
-- whole reason the metric is distinct-days rather than count(*).
--
-- READ-ONLY: SELECT-only.
-- ============================================================================
\set ON_ERROR_STOP on
\echo '### E13-DOC -- products listed across distinct calendar days'

SELECT 'PROBE' || E'\t' || 'E13-DOC products row count (the number the plan conflates with the day count)' || E'\t' ||
       (SELECT count(*) FROM products)::text || E'\t' || '= 161' || E'\t' ||
       CASE WHEN (SELECT count(*) FROM products) = 161 THEN 'PASS' ELSE 'FAIL' END
UNION ALL
SELECT 'PROBE' || E'\t' || 'E13-DOC count(DISTINCT to_char(created_at,''YYYY-MM-DD'')) FROM products  <-- THE cited metric' || E'\t' ||
       (SELECT count(DISTINCT to_char(created_at, 'YYYY-MM-DD')) FROM products)::text || E'\t' ||
       '= 158 (plan ## Validation, Products distinct-day probe (E13-DOC), exact value)' || E'\t' ||
       CASE WHEN (SELECT count(DISTINCT to_char(created_at, 'YYYY-MM-DD')) FROM products) = 158 THEN 'PASS' ELSE 'FAIL' END
UNION ALL
SELECT 'PROBE' || E'\t' || 'E13-DOC products creation span in days (first to last created_at)' || E'\t' ||
       COALESCE((SELECT (max(created_at)::date - min(created_at)::date)::text FROM products), 'n/a') || E'\t' || '> 100' || E'\t' ||
       CASE WHEN COALESCE((SELECT (max(created_at)::date - min(created_at)::date) FROM products), 0) > 100 THEN 'PASS' ELSE 'FAIL' END
UNION ALL
SELECT 'PROBE' || E'\t' || 'E13-DOC products first->last created_at' || E'\t' ||
       COALESCE((SELECT to_char(min(created_at), 'YYYY-MM-DD') || ' -> ' || to_char(max(created_at), 'YYYY-MM-DD') FROM products), 'n/a') || E'\t' || 'informational' || E'\t' || 'INFO'
UNION ALL
SELECT 'PROBE' || E'\t' || 'E13-DOC products sharing the single most common creation date' || E'\t' ||
       COALESCE((SELECT max(c)::text FROM (SELECT count(*) AS c FROM products GROUP BY created_at::date) x), 'n/a') || E'\t' || '<= 5' || E'\t' ||
       CASE WHEN COALESCE((SELECT max(c) FROM (SELECT count(*) AS c FROM products GROUP BY created_at::date) x), 0) <= 5 THEN 'PASS' ELSE 'FAIL' END
UNION ALL
SELECT 'PROBE' || E'\t' || 'E13-DOC distinct creation days for the sibling tables (cross-check against the plan narrative)' || E'\t' ||
       'users=' || (SELECT count(DISTINCT created_at::date) FROM users)::text
    || ', orders=' || (SELECT count(DISTINCT created_at::date) FROM orders)::text
    || ', wallet_ledger=' || (SELECT count(DISTINCT created_at::date) FROM wallet_ledger)::text
    || ', seller_profiles=' || (SELECT count(DISTINCT created_at::date) FROM seller_profiles)::text
    || ', products=' || (SELECT count(DISTINCT created_at::date) FROM products)::text
     || E'\t' || 'plan (## Validation Causal integrity + ## Result distinct-days block): users 54, orders 169, ledger 145, seller_profiles 12, products 158' || E'\t' || 'INFO';

-- Products must have a listing date AFTER their seller registered (causal
-- integrity B3) -- otherwise the catalogue predates the studios that own it.
SELECT 'PROBE' || E'\t' || 'E13-DOC products predating their seller profile registration' || E'\t' ||
       count(*)::text || E'\t' || '0' || E'\t' ||
       CASE WHEN count(*) = 0 THEN 'PASS' ELSE 'FAIL' END
FROM products p
JOIN seller_profiles sp ON sp.user_id = p.seller_id
WHERE p.created_at < sp.created_at
UNION ALL
SELECT 'PROBE' || E'\t' || 'E13-DOC products whose moderation_status distribution is a single bucket' || E'\t' ||
       (SELECT count(DISTINCT moderation_status) FROM products)::text || E'\t' || '> 1' || E'\t' ||
       CASE WHEN (SELECT count(DISTINCT moderation_status) FROM products) > 1 THEN 'PASS' ELSE 'FAIL' END
UNION ALL
SELECT 'PROBE' || E'\t' || 'E13-DOC product moderation_status distribution' || E'\t' ||
       COALESCE(string_agg(d, ' | '), 'none') || E'\t' || 'informational' || E'\t' || 'INFO'
FROM (SELECT moderation_status::text || '=' || count(*)::text AS d FROM products GROUP BY moderation_status) s;
