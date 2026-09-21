# 0016 The Revenue-Share Figure Is Read From the Setting, Never Written Into Copy

Date: 2026-09-21

## Status

Accepted

## Context

The owner asked on 2026-09-21 whether the storefront's "Chia sẻ doanh thu" percentage or
`commission_settings.default_rate = 0.30` is the correct number.

The question came from a real defect, recorded as **D9** in
`docs/plans/completed/ui-api-integration.md:565`: `CreatorBanner/index.tsx:116` rendered a hard-coded
**"80% Chia sẻ doanh thu"** while `commission_settings.default_rate` was `0.30` — the platform keeps
30%, so the site-wide promise paid sellers **70%**. The eight sampled `seller_earnings` rows paid
80/75/70/75/78/70/78/70%, so 80% was not even the ceiling in practice; it was a number with no
source.

That defect was repaired inside the increment delivered as commit `7cd3397` (2026-09-21): the literal
is gone and the banner now renders a computed value. Measured on the settled tree, 2026-09-21:

- `select default_rate from commission_settings` → **0.30**.
- `web/src/components/CreatorBanner/index.tsx:124` renders
  `` `${revenueSharePercent}% Chia sẻ doanh thu` ``, and `web/src/app/(app)/page.tsx:237-241`
  computes `revenueSharePercent = Math.round((1 - Number(defaultRate ?? 0)) * 100)` from
  `payload.findGlobal({ slug: 'commission_settings' })`. The homepage therefore renders **70%**.
- The string `80%` occurs **0 times** in `web/src` and **0 times** in a full
  `pg_dump --data-only` of the development database (6377 lines), so nothing — code, CMS content or
  record — promises it any more.
- The schema documents the same value with the same meaning in two places:
  `globals/CommissionSettings.ts:22` ("mặc định: 0.30 tức 30%") and `collections/SellerProfiles.ts:109`
  ("mặc định toàn sàn (30%)").

So the number is now single-sourced and correct; what remained was to prove it on the rendered page
rather than by reading the component, and to write down the rule so the literal cannot come back.

## Decision

1. `commission_settings.default_rate` is the single source of the site-wide revenue-share figure.
   Every displayed share is **computed from it at render time**; no percentage of the commission is
   written into a component, a string literal, or CMS content.
2. `0.30` stands as the platform commission, i.e. the seller keeps **70%**. Nothing in the
   repository, the database or the running storefront claims a different number. Changing it is an
   operator action in the admin (`/admin/globals/commission_settings`) and the copy follows with no
   deploy — that is the point of clause 1.
3. The homepage banner states the **site default**. A surface that describes one seller's rate must
   read that transaction's snapshot (`seller_earnings.commissionRate`, BR-07), never the live global
   and never `seller_profiles.commissionRateOverride`.
4. A share figure counts as verified only when it has been **rendered and compared with the database
   value**, including a mutation that moves it. Reading the component is not evidence.

## Alternatives Considered

1. **Change the setting to `0.20` so the copy could say 80%.** Rejected: 80% had no source other than
   a hard-coded string, and inventing a business term to preserve a fabricated number is the defect
   class this increment exists to close.
2. **Hard-code 70% and drop the lookup.** Rejected: the setting is the operator's control; a literal
   drifts the moment the rate changes, which is exactly how D9 happened.
3. **Show a range of per-seller rates on the homepage.** Rejected: the banner is a platform-level
   statement, and publishing per-seller commercial terms is not the homepage's job.

## Consequences

Positive:

- The number on the page cannot disagree with the number in the database, by construction, and a rate
  change needs no code change.
- D9's history is recorded next to the rule it produced, so a later reader does not "fix" the banner
  back to a literal.

Tradeoffs:

- The banner renders whatever an operator sets, including an unattractive rate. That is intended: the
  display follows the configuration of record.
- An operator edit changes public copy with no review. `commission_settings` is admin-only
  (`isAdmin` access on the global), so the exposure is the operator's own account.

## Verification

1. Read `default_rate` from Postgres.
2. Render `/` and extract the figure next to "Chia sẻ doanh thu".
3. Assert `figure == Math.round((1 - rate) * 100)`.
4. **Mutation test:** set `default_rate` to a second value (e.g. `0.25`), re-render, assert the figure
   is `75`; restore `0.30`, re-render, assert `70`. The instrument is trusted only if it moves.

## Follow-Up

- A future loyalty or campaign rate is a different surface and a different decision (see 0017).
- **Open, measured 2026-09-21 by t23:** the derived figure is currently rendered inside an
  `sr-only` block. `CreatorBanner/index.tsx:121-136` carries a block labelled *"Invariant Test
  Compatibility Layer (satisfies existing challenger assertions)"* holding `${revenueSharePercent}%
  Chia sẻ doanh thu`, the refund/quality promises and two links, and two challenger specs assert that
  block and even that its `className` contains `sr-only`
  (`tests/challenger/m5-r2-compact-stress.spec.tsx:256`, `m5-r2-responsive-viewport.spec.tsx:131`).
  Consequence: a sighted visitor sees no revenue-share figure; a screen-reader user hears it and can
  focus two links sighted keyboard users cannot see. The data is correct — this is a **visibility and
  accessibility** defect in the storefront's design layer, not a fabricated value, so it is the
  owner's and the storefront vertical's call whether the figure becomes visible or the promise is
  dropped; this decision's clauses 1-4 hold either way, and no agent may "fix" it by writing a literal
  back into the visible copy.
