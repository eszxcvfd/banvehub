# 0009 Seller Revenue: Commission Resolution, Hold Period, Withdrawal Bounds, Earning Equation

Date: 2026-09-15

## Status

Accepted

## Context

`PLAN.md` fixes the shape of seller revenue but deliberately leaves four
numbers or orderings unstated:

- §6.3 (`PLAN.md:285-311`) requires a site-wide default commission, a
  per-seller override, and a per-campaign override, and says
  "Không hard-code tỷ lệ" — it never states the default rate nor the
  precedence between the three levels, and it requires each order item to
  snapshot `sale_price`, `platform_fee`, `seller_amount`, `tax nếu có`, and
  `applied_policy_version`.
- FR-31 (`PLAN.md:993-1016`) requires `PENDING → AVAILABLE` after a hold
  period and offers "3 ngày / 7 ngày / cấu hình được" as examples without
  choosing one.
- FR-32 (`PLAN.md:1019-1054`) requires validating the withdrawal amount but
  gives no minimum or maximum; the only hint is `PLAN.md:1304` in FLOW-U13:
  "Validate min/max + available balance".
- §6.3 says to snapshot `tax nếu có` but does not define the tax term's
  arithmetic relationship to the other three amounts.

Phase 6 Milestone 1 materialized these gaps as hard-coded values in three
synchronized places (collection field bounds, collection hook, and a
PostgreSQL `CHECK` constraint) and left `seller_earnings` without a `tax`
column. Because the bounds live in a database `CHECK`, any later change is a
migration, so the numbers cannot stay undefined.

Observed at the time of this decision:

- `50.000` / `50.000.000` VND appeared in
  `web/src/collections/Withdrawals/index.ts`,
  `web/src/collections/Withdrawals/hooks/validateWithdrawalInvariants.ts`, and
  the Batch 7 migration's `withdrawals_amount_limits` constraint, with no
  source in `PLAN.md`, `docs/`, or `.agents/ORIGINAL_REQUEST.md`.
- `hold_period_days` defaulted to `7` in the Batch 7 migration and in
  `calculateHoldUntil.ts`, with no recorded authority.
- `seller_earnings` had no `tax` column and its constraint read
  `seller_amount + platform_fee = sale_price`, while
  `OrderItems/index.ts` documents the same field as
  `salePrice - platformFee - tax`. A non-zero tax would violate the
  constraint.
- No site-default commission value or global exists anywhere in `web/src`; the
  only commission storage is `seller_profiles.commission_rate`.

Repository authority for these gaps is the owner. The owner accepted item one
below explicitly and delegated item four; items two and three are recorded
because the values already exist in a `CHECK` constraint and leaving them
unnamed would leave a launched schema unowned.

## Decision

1. **Withdrawal bounds are `50.000` to `50.000.000` VND, inclusive, and are
   official product policy.** Accepted explicitly by the owner on
   2026-09-15. They are enforced in the collection field, the pre-validate
   hook, and the `withdrawals_amount_limits` database constraint, which must
   stay in agreement. Changing them is a migration.

2. **The seller hold period is a per-earning snapshot, defaulting to 7 days.**
   `hold_period_days` is copied onto each earning at creation and is not read
   live, so changing the default does not move existing earnings. 7 is
   accepted as the launch default within FR-31's "3 / 7 / configurable" set.
   Per-earning configurability is what makes FR-31's "cấu hình được" true;
   no site-level hold setting exists in P0.

3. **Commission is resolved by snapshot, never by live lookup.** Precedence,
   most specific first: campaign override, then seller override, then site
   default. The applicable rate and the `policyVersion` it came from are
   copied onto the earning and the order item at creation, per §6.3 and BR-07.
   The rate is configuration, not code: no literal default rate may be
   hard-coded in the commission path. The site-default commission setting now
   exists as authoritative data in the `CommissionSettings` Payload global
   (PostgreSQL table `commission_settings`, seeded at 0.30 in Batch 8 migration),
   with a strict prohibition against hard-coded fallback rates in code. Failure
   to load configuration throws an explicit `CommissionConfigurationError`.

4. **The earning equation includes tax:**
   `seller_amount + platform_fee + tax = sale_price`. `seller_earnings` must
   carry a `tax` column with the same non-negative integer rules as the other
   amounts, and both the collection-level validation and
   `seller_earnings_math_check` must use the tax-inclusive form. This follows
   from §6.3's `tax nếu có` snapshot plus the already-documented meaning of
   `sellerAmount` in `OrderItems/index.ts` (`salePrice - platformFee - tax`);
   it is not an independent product choice.

5. **Tax is not computed in P0.** The purchase path writes `tax: 0` and no
   tax engine, rate, or jurisdiction exists. The schema and the equation
   admit a non-zero tax so that turning one on later is data, not a
   migration; no rate is implied by this record.

All amounts remain integer VND per §6.2, and every snapshot is immutable
after creation per BR-03 and BR-07.

## Alternatives Considered

1. **Leave the withdrawal bounds unwritten and change them later** — rejected:
   the numbers already exist in a `CHECK` constraint, so the repository would
   ship a launched financial limit with no owner and no rationale.
2. **Define tax as reducing the platform fee rather than the seller amount**
   — rejected: it contradicts the documented meaning of `sellerAmount` in
   `OrderItems/index.ts` and would silently change seller income.
3. **Keep `seller_amount + platform_fee = sale_price` and treat tax as
   included in `platform_fee`** — rejected: it hides tax from the snapshot
   §6.3 requires and makes the platform's take unreadable.
4. **Global site-wide hold period read live at payout time** — rejected:
   changing the setting would retroactively move earnings already promised
   under an older policy, violating §6.3's "Thay đổi commission không ảnh
   hưởng giao dịch cũ" in spirit.
5. **Hard-code a default commission rate such as the 30% illustration** —
   rejected: §6.3 states "Không hard-code tỷ lệ", and the illustration is an
   example, not a rate.

## Consequences

Positive:

- Each financial limit and default has one owner and one stated rationale.
- The withdrawal bounds are identical in the hook and the database, so the
  barrier survives direct SQL and a database rebuild.
- The earning equation tolerates tax, so FR-32 and FLOW-U15 refunds stay
  arithmetically closed when a tax term arrives.
- Commission precedence is decided before any commission code exists, which
  is when it is cheapest to decide.

Tradeoffs:

- Changing the withdrawal bounds or the hold default is a migration or a new
  snapshot, not a config edit.
- `seller_earnings.tax` is a column that P0 never populates with a non-zero
  value.
- Until a site-default commission setting exists, commission cannot be
  computed at all; the per-seller column alone is insufficient.

## Follow-Up

- **Resolved (2026-09-15): decision item 4 is implemented.** The Batch 7
  migration creates `seller_earnings` with a `tax` column and an idempotent
  `ALTER TABLE "seller_earnings" ADD COLUMN IF NOT EXISTS "tax" numeric DEFAULT
  0 NOT NULL;` immediately after the `CREATE TABLE IF NOT EXISTS` block. The
  `ALTER` is required because `CREATE TABLE IF NOT EXISTS` is a no-op on a
  database where the table already exists, so the `CREATE` alone can never add
  the column; the migration name was already recorded in the ledger, so
  `payload migrate` would not re-run it. `seller_earnings_tax_non_negative`
  rejects negative tax and `seller_earnings_math_check` enforces the
  tax-inclusive form `seller_amount + platform_fee + tax = sale_price`.
  `validateEarningMath.ts` validates the three-term equation and includes
  `tax` in the non-negative guard; `preventEarningMutation.ts` treats it as an
  immutable snapshot field; `SellerEarnings/index.ts` exposes the field and its
  `sellerAmount` description now reads `salePrice - platformFee - tax`.
  Verified empirically against the live database: `seller_earnings` has 21
  columns and 7 constraints, and a row with
  `sale_price=100000, platform_fee=20000, seller_amount=75000, tax=5000` is
  accepted while the two-term form and `tax=-5000` are both rejected. P0
  behaviour is unchanged because the purchase path writes `tax: 0`.
- **Resolved (2026-09-16): decision item 3 is implemented.** The Batch 8
  migration `20260916_000000_phase6_commission_settings` creates the
  `commission_settings` table in PostgreSQL and seeds initial row
  `default_rate: 0.30`, tracked in `payload_migrations`. The `CommissionSettings`
  global is registered in Payload config with `adminOnly` update permissions and
  public read. Resolution precedence (`resolveCommissionRate`) enforces:
  Tier 1 (promotional campaigns if active, deferred from P0 per Decision A2),
  Tier 2 (seller profile override `seller_profiles.commissionRate`), and
  Tier 3 (site default from `commission_settings.defaultRate`). Policy versioning
  follows deterministic grammar `site-default-v1-${Number(rate).toFixed(2)}`
  (e.g., `site-default-v1-0.30`). Hard-coded fallback rates in code are strictly
  prohibited per Decision A1; failure to read data or invalid rate values throw
  explicit `CommissionConfigurationError`.
- `docs/product/overview.md` lists commission rate and hold period as open
  owner decisions; this record supersedes that listing for hold period and
  narrows it for commission to the unavailable site default.
- Withdrawal bounds and hold default become operator-facing configuration in
  a later phase; until then they are constants with this record as their
  authority.
