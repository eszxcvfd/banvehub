# 0019 The Revenue-Share Figure Is Visible, and the Hidden Compatibility Layer Is Gone

Date: 2026-09-21

## Status

Accepted

## Context

Decision 0016 made the site-wide revenue-share figure a value **computed from
`commission_settings.default_rate`**, and the figure is correct: `0.30` renders `70%`, a mutation to
`0.25` renders `75%`, and restoring renders `70%` again (measured, no caching). What the measurement
task (t23) found next is that **nobody sees it**:

- `web/src/components/CreatorBanner/index.tsx:121-136` holds a block whose own comment calls it the
  *"Invariant Test Compatibility Layer (satisfies existing challenger assertions)"*, marked
  `className="sr-only"` and `data-testid="creator-banner-compat"`, carrying the share figure, four
  promise strings and **two links** (`Đăng Ký Bán Bản Vẽ Ngay` → `/seller`,
  `Khám Phá Bản Vẽ Đã Thẩm Định` → `/shop`).
- The banner's four **visible** pillars are "Chất lượng được kiểm duyệt", "Tác giả uy tín",
  "Hỗ trợ 24/7" and "Cộng đồng chuyên môn" (the last carrying the real member count). None of them is
  the share figure, so a sighted visitor sees no revenue-share claim at all.
- Three challenger specs assert the hidden block rather than the interface:
  `m5-r2-compact-stress.spec.tsx:256-262`, `m5-r2-responsive-viewport.spec.tsx:131-136` — which even
  asserts `compat.className` **contains `sr-only`**, i.e. certifies that the content is hidden — and
  `m3-challenger1-empirical.spec.tsx:341,347`, which asserts the two links by accessible role.
- Consequence beyond the missing figure: `sr-only` is *visually* hidden but **not** hidden from
  assistive technology, and the two links inside it are keyboard-focusable, so a sighted keyboard user
  can focus two controls they cannot see — the standard focus-visibility problem, created by a block
  that exists to satisfy tests.

## Decision

1. **The figure is shown.** `CreatorBanner` renders `{revenueSharePercent}% chia sẻ doanh thu` as a
   visible element in the left column it already has (beside the heading and the "Tìm hiểu thêm"
   seller call to action). It stays **computed** from `commission_settings` per decision 0016; no
   literal and no CMS field may hold it.
2. **The hidden block is deleted, not shrunk.** Copy that exists so a test can find it is not a
   feature; a compatibility layer whose purpose is to keep assertions green while users see nothing is
   the same class of defect this increment spent its rounds closing.
3. **The seller call to action stays visible** — the banner already links `/seller` through "Tìm hiểu
   thêm". The hidden `/shop` link is **dropped**: the main navigation owns catalog discovery, and a
   second invisible path to it was only ever there for a test.
4. **The three specs are rewritten to assert what a user sees**: a visible element carrying the
   computed figure, outside any `sr-only` subtree. An assertion that a container's class contains
   `sr-only` is deleted as a rule violation, not adapted.
5. **No other design change.** No new section, no new pillar, no re-layout: one visible line inside the
   existing left column plus the removal of the hidden block.

## Alternatives Considered

1. **Drop the promise instead** (delete the block and show nothing). The most conservative option, and
   it does close the accessibility and test-honesty defects — but it removes a **true and commercially
   useful** claim from the banner whose whole job is recruiting sellers. Rejected: the figure is
   derived, correct and already computed; hiding a true number is not more honest than showing it.
2. **Keep the block and make the figure visible as well.** Rejected: it keeps two copies of the same
   claim, one of which is invisible, and leaves the focus-visibility defect in place.
3. **Move the whole block's copy into the visible columns.** Rejected as a redesign: four promises and
   two links do not fit the banner's current grid, and the owner's standing rule is that this
   workstream does not re-lay-out the storefront.

## Consequences

Positive:

- A sighted visitor sees the real, setting-derived share figure; a screen-reader user hears the same
  thing everyone else sees, and no control is focusable-but-invisible.
- Three specs stop certifying hidden content — the suite now asserts the interface, which is the same
  correction this increment applied to `TechnicalSpecsTable`'s fallbacks and the cart's voucher tests.

Tradeoffs:

- The storefront loses the hidden `/shop` link. Nothing depended on it except the specs that are being
  rewritten.
- If the storefront vertical later redesigns this banner, the figure must remain **derived** (0016) and
  **visible** (this record); a redesign that hides it again needs a new decision.

## Verification

- Render `/`: the figure appears in a visible element (not inside an `sr-only` subtree) and equals
  `Math.round((1 - commission_settings.default_rate) * 100)`, with the database value printed beside it.
- `grep -rn "creator-banner-compat" web/src web/tests` → 0.
- The three rewritten specs pass, and each fails if the figure is removed from the visible tree.
