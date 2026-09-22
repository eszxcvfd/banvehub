# Three follow-ups: a visible revenue share, purged invented versions, Vietnamese country labels

Status: active
Authority: the owner's grant of 2026-09-21 — *"cho bạn toàn quyền thực hiện tiếp 3 việc tiếp theo"* —
over the three items this increment's own reports handed back: the revenue-share figure that only
screen readers can reach, the 161 stored `'<Software> 2022+'` spec values, and the English country
labels on a Vietnamese-facing form. Decisions **0019** (the figure is visible; the hidden compatibility
layer is gone), **0020** (the invented versions are purged, with a committed rollback) and **0021**
(country labels are Vietnamese) are the contract of record; this plan is the execution.

## Measured state before the work

| # | Item | Measured | Work |
|---|---|---|---|
| 1 | The 70% figure is only in an `sr-only` block | `CreatorBanner/index.tsx:121-136` holds a block commented *"Invariant Test Compatibility Layer (satisfies existing challenger assertions)"* with the derived figure, four promises and two links; the four **visible** pillars are "Chất lượng được kiểm duyệt", "Tác giả uy tín", "Hỗ trợ 24/7", "Cộng đồng chuyên môn" — none carries the figure. **Three** specs assert the hidden block (`m5-r2-compact-stress.spec.tsx:256-262`, `m5-r2-responsive-viewport.spec.tsx:131-136` — one of them asserting `className` contains `sr-only` — and `m3-challenger1-empirical.spec.tsx:341,347`) | Show the figure visibly, delete the hidden block, rewrite the three assertions (decision 0019) |
| 2 | 161 stored `'<Software> 2022+'` versions | `select technical_specs_software_version, count(*) … group by 1` → `AutoCAD 2022+` 74, `Revit 2022+` 40, `SketchUp 2022+` 27, `3ds Max 2022+` 17, `PDF / Vector 2022+` 2, `Lumion 2022+` 1, null 4 = 165. The generator is in the tree — `web/scripts/seed-realistic.mts:2138` writes ``softwareVersion: `${sw.title} 2022+` `` — and **161 of 161** stored values equal `software_types.title || ' 2022+'` over 161 distinct products (pre-flight query below) | Phase-15 migration nulls the invented pattern behind a count guard, with the 161 `(id, value)` pairs committed as a snapshot plus the restore statement, **and the generator line fixed** so a re-seed cannot restore them (decision 0020) |
| 3 | English country labels | `web/src/constants/countries.ts` carries the plugin's English labels for all 48 entries and feeds both client forms **and** the admin select | Hand-written Vietnamese labels, values and enum untouched, a label test added, and the label-vs-token rule written into the file header (decision 0021) |

## Pre-flight measurements (captain, before dispatch)

Run against the development database on 2026-09-21, because decision 0020's first draft rested on an
inference the repository can settle outright:

- `select coalesce(technical_specs_software_version,'<NULL>'), count(*) from products group by 1 order by
  2 desc` → `AutoCAD 2022+|74`, `Revit 2022+|40`, `SketchUp 2022+|27`, `3ds Max 2022+|17`, `<NULL>|4`,
  `PDF / Vector 2022+|2`, `Lumion 2022+|1` (165 products, 161 matching ` 2022+`).
- `grep -n "softwareVersion" web/scripts/seed-realistic.mts` → **one** hit, line 2138:
  ``softwareVersion: `${sw.title} 2022+`, ``. The generator is committed code, not an external seed.
- Corroboration per row:
  `select count(*) filter (where p.technical_specs_software_version = st.title || ' 2022+') as corroborated,
  count(*) as matched, count(distinct p.id) as products from products p join products_rels pr on
  pr.parent_id = p.id and pr.path = 'software_types' join software_types st on st.id = pr.software_types_id
  where p.technical_specs_software_version like '% 2022+';` → `161|161|161`.
- `select default_rate from commission_settings` → `0.30`, so `/` renders `70%` (item 1's figure).
- The application dev server on `:3000` was **down** at dispatch time; the plan's rendered checks need it,
  so it is started as a managed background job before the tasks run.

The first draft of decision 0020 said the five non-`AutoCAD` variants "appear nowhere in the repository";
that was wrong because the previous increment's scope carve-out for `web/scripts/**` kept the seed out of
its audit. The decision text carries the correction, and this plan's acceptance now includes the
generator fix.

## Deliverables

1. **t46** — `CreatorBanner` shows the setting-derived figure — `{revenueSharePercent}% Chia sẻ doanh thu`
   plus the word `mặc định` — in the existing left column, the `sr-only` compatibility block is deleted,
   and the three specs assert a visible element (none asserting `sr-only`). The copy keeps the exact
   `% Chia sẻ doanh thu` substring the existing render-vs-db probes match on, so those instruments keep
   measuring the same claim without being edited.
2. **t48** — `web/src/migrations/20260922_000000_phase15_null_invented_spec_versions.ts` (+ `index.ts`
   registration) with a count guard and a documented no-op `down`, `web/src/migrations/data/phase15-invented-spec-versions.tsv`
   (the 161 removed pairs), a runnable probe, and the one generator line in
   `web/scripts/seed-realistic.mts` (staged alone; the file's other hunks belong to the refund vertical
   and stay uncommitted). The purge covers `products` only: Payload's versions table `_products_v` keeps
   its own copy of the invention (measured 2026-09-22: 162 of 167 version rows matching, over the same
   161 products) and is deliberately left alone — those rows render nowhere (the storefront and the API
   read `products`), the committed snapshot is the archive for the `products` rows only, and rewriting
   version history is an edit this decision does not authorise; the residual risk, recorded in decision
   0020 clause 1 and in the migration header, is that restoring such a version through the admin would
   write the invented value back into `products`, where it would render again.
3. **t49** — `web/src/constants/countries.ts` with Vietnamese labels, the label test, and the header
   rule that nothing matches on a label. The decisions index `docs/decisions/README.md` gains the rows
   for 0019, 0020 and 0021 (captain, before dispatch) and is staged together with them. The int spec
   pins all 48 expected labels as literals: that is an expectation table that fails when the wording
   drifts (precedent `SHIPPED_40` in `web/tests/helpers/probe-phase14-address-countries.mts:87`), not
   the second source decision 0021 clause 3 forbids — the reviewer is told to judge it that way.
4. **t50** independent verification · **t52**, **t53**, **t54** the three round-1 reviews (t46 against
   decision 0019, t48 against 0020, t49 against 0021) · **t51** integration (gates on the frozen
   revision, one commit, plan closed).
5. Task ids did not land exactly as first drafted, and the difference is recorded rather than hidden:
   **t47** was created without the `implementation` quality kind and was cancelled by the captain
   before any member touched it — the migration is **t48**. **t50** (verification) and **t51**
   (integration) carry the `work` kind because the runtime refuses a captain takeover while a task's
   dependencies are open, so their contracts live in their objectives, acceptance and descriptions
   instead of the quality-kind fields. The three reviews are real `kind=review` gates.

## Out of scope

- Any re-layout of the storefront: decision 0019 clause 5 allows one visible line inside an existing
  column and nothing else.
- Any change to `enum_addresses_country`, its values, or stored address rows (decision 0021 clause 2).
- Purging `technical_specs_file_format` / `_file_size` (measured from real uploads) or the schema's own
  `unit` default (decision 0020 clause 3).
- The storefront vertical's files that this increment does not need to touch; `.lit/**`, `.agents/**`,
  `.agent-teams/**`, `package.json`, `pnpm-lock.yaml`, `next.config.ts` and
  `vitest.challenger.config.mts` are never staged. `web/scripts/**` is staged **only** as the single
  generator line decision 0020 clause 6 requires: the file's other working-tree hunks belong to the
  refund vertical and stay uncommitted.

## Acceptance (increment level)

1. Rendering `/` shows the share figure in a **visible** element equal to
   `Math.round((1 - commission_settings.default_rate) * 100)`, with the database value printed beside it;
   `grep -rn "creator-banner-compat" web/src web/tests` returns 0.
2. No spec asserts that a container's class contains `sr-only`, and each rewritten spec fails if the
   figure leaves the visible tree.
3. `select count(*) from products where technical_specs_software_version ~ ' 2022\+$'` is **0** after the
   migration, the snapshot holds exactly the 161 removed pairs, the restore statement reproduces them on
   a scratch clone, and the generator line is gone — a seed run against a scratch database produces 0
   rows matching the pattern.
4. Every country label is non-empty, differs from its ISO code and reads as Vietnamese; `VN` is first;
   the enum↔list guard test (values only) still passes.
5. Gates green on the frozen revision: `payload migrate`, `test:int`, `test:challenger`, `lint`,
   `tsc --noEmit`, in-place `next build`, and the dev server still answering.

## Evidence rules (unchanged from the previous increment)

- An instrument that cannot fail is not evidence: every claim ships a negative control or a mutation.
- Rendered measurements name the URL, the selector and the database value compared.
- Owner data that a probe mutates is restored, and the restore is shown by re-reading it.
- `MATCHES` certifies the contract, never the render.

## Progress

- 2026-09-21, captain: pre-flight measurements above; decision 0020's Context corrected and the plan's
  acceptance extended to the generator line before dispatch. Dev server started on `:3000` as a managed
  job (`/`, `/shop`, `/admin/login` → 200) because the rendered checks need it.
- 2026-09-21, captain: dispatched t46 (engineer), t48 (engineer-schema), t49 (engineer-labels); t50
  waits on all three, the three reviews wait on t50, t51 waits on the reviews.
- 2026-09-21, t46 complete: the figure renders as `70% Chia sẻ doanh thu mặc định cho người bán` in the
  existing left column, the sr-only block is deleted, and hiding the figure fails all three rewritten
  specs (quoted failures) while the restored tree passes 31 files / 469 tests.
- 2026-09-21, t48 complete: dev database 161 → 0 matching, 165 NULL, `file_format`/`file_size` non-null
  counts unchanged (161/161); guard mutations quoted (count 160 → refuses; a survivor → refuses); the
  restore statement reproduces all 161 on `kientaohub_phase15_scratch` and the clone is left as found;
  the generator line is gone and a scratch seed produces 0 matching rows (161 with the line re-added).
- 2026-09-21, t49 complete: 48 Vietnamese labels with values and enum untouched, four label mutations
  each failing then restored to the same hash, `test:int` 43 files / 659 tests, and the rendered select
  shows `Việt Nam` with the option list in Vietnamese.
- 2026-09-21, captain: two **pre-existing** defects in `web/scripts/seed-realistic.mts` reported by t48
  and deliberately **not** fixed in this increment (its reset truncates `transactions_items`, dropped by
  phase 13, so the seed cannot run from the shared tree; and it unlinks every entry of `public/media`,
  which would delete the 33 `curated` files before failing). They are named in the delivery report as a
  follow-up, and the seed proof above was taken from a scratch copy of `web/` with the shared assets
  verified intact.

- 2026-09-21, t50 complete: 10/10 acceptance measured by the verifier's own instruments — the figure reads
  `70% Chia sẻ doanh thu mặc định cho người bán` beside `default_rate = 0.3` with a working visibility
  control (24 `.sr-only` elements on the page, detector returns false on one) and a provenance mutation
  (0.25 → 75%, restored → 70%); the purge is 0 matching / 165 NULL with `file_format`/`file_size` 161/161;
  its own pre-purge clone restores all 161 through the migration's own `restoreStatement()` and matches
  the committed TSV as a set; the labels render in Vietnamese. Two operational findings recorded, neither
  smoothed over: (a) `test:challenger` flaked once — run 1 exit 1 with `Errors 3 errors`, a leaked
  rc-component timer (`ReferenceError: window is not defined`) in
  `web/tests/challenger/m4-challenger1-empirical.spec.tsx`, which is not an increment file, and run 2
  exit 0 / 31 files / 469 tests; (b) a browser on the `127.0.0.1` origin gets **403** for every
  `/_next/static/chunks/*`, so client-interaction checks must use `localhost` against the same server.

_(updated as tasks report)_

## Review loop on the handoff (t52 → t58) and the captain's own defects

- **t52 (round 1)** found all seven of t46's criteria holding — the banner never changed through any of
  these rounds (sha1 `f254b0bbc6e5d6768a294821731f5b95393188c9`) — but failed the increment on the
  captain's **unbounded class clause**: two specs outside this increment (the storefront vertical's
  untracked files) certify content only a test can see. F1 (hidden `srCount` counts in the no-props
  fallback) and F2 (a CMS-nav block hidden yet focusable) are recorded above with owners; the captain
  chose **containment** over repair because editing another workstream's untracked files would collide
  with it and cannot be staged, and amended the auto-created repair accordingly.
- **t56 (round 2)** and **t58 (round 3)** failed on documentation-only findings in the handoff section
  itself: missing line numbers and an unresolvable citation, then a contradiction left behind because the
  repair inserted corrected bullets **above** the sentences they refute. Both were captain defects (the
  clause and the sloppy repair), not deliverable defects.
- **Escalation and recovery**: after t58 the automatic review loop hit its ceiling and escalated, so no
  follow-up repair task existed. Because the finding was a contradiction in the captain's own plan
  document, the captain rewrote the two clauses by hand — one measured reading per path, the lowercase
  label example deleted (`grep` 0 for both refuted strings) — and **retried the same gate** rather than
  inventing another repair cycle. t58 attempt 2: **pass**, with the reviewer reading the whole section
  for a third contradiction and finding none, and no code file moved.
- **Unrelated observation left in place**: the development database's `addresses` table gained one row
  during the verification window (`id 48`, `customer_id 1`, 09:10 local) that matches no probe's marker
  pattern. The verifier and the captain both left it untouched as another identity's data and reported it
  to the owner instead of deleting it.

## Validation

_(evidence from this cycle only; filled at integration)_

## t55 (engineer, 2026-09-21): containment handoff — the hidden-content findings are not this increment's to fix

t46 closed decision 0019 for the **banner**. t52 then found the same shape elsewhere. This section records
those findings verbatim, accounts for every `sr-only` hit under `web/tests`, and proves this increment's own
surface did not move. Nothing here is fixed in place: the flagged files belong to the storefront vertical's
in-flight work or to another increment, and staging them would collide with that workstream.

### Findings (recorded verbatim, with owners)

**F1 (high) — hidden category counts assert numbers no record carries and a user never sees.**
- Where it renders (re-measured in t57 against the live DOM, not inferred):
  - **`/` renders none of the static numbers.** My own read of the homepage HTML just now:
    `2.500+ hồ sơ` **0**, `1.800+ hồ sơ` **0**, `850+ hồ sơ` **0**, `340+ hồ sơ` **0** occurrences; the
    counts a visitor reads are the real records — `18`, `17`, `18`, `17`, `18`, `17`, `17`, `18` (`N hồ sơ`
    values in document order).
  - **The hidden `srCount` duplicates exist only in the no-props fallback** — the path the flagged spec
    renders (`render(<CategoryCards />)`): `srCount: '850+ hồ sơ'` at
    `web/src/components/CategoryTabs/index.tsx:93` and `srCount: '340+ hồ sơ'` at **`:108`**, rendered by
    the `srCount` span at **`:230-232`** beside the tile's visible `{cat.count} hồ sơ` at **`:229`**.
  - **On `/` the visible label and the hidden `srTitle` token are the same capital-K string** —
    `Bản vẽ Kiến trúc` appears **9** times and the lowercase variant **0**; `Cơ điện (MEP)` **9** vs
    `Cơ điện MEP` **1**. The `srTitle` spans are `web/src/components/CategoryTabs/index.tsx:168-170`
    (tabs strip) and **`:224-226`** (tiles), fed by the array entries at `:91`, `:99`, `:106`, `:114`,
    `:121`, `:128`, `:135`, `:142`; the record-driven path (`:196-206`) sets both to `undefined`.
- What a user sees vs what the DOM hides, **split by path**: in the **no-props fallback** the visible tile
  prints the static `count` (`2.500+ hồ sơ`, `1.800+ hồ sơ`, …) while the duplicate `srCount`
  (`850+ hồ sơ`, `340+ hồ sơ`) sits inside `className="sr-only"`; on **`/`** none of those static numbers
  renders (all four: 0 occurrences) and the visible counts are the real records (`18`, `17`, …). So the
  hidden-count defect is **fallback-only**, and the static numbers are hardcoded in the fallback array
  rather than computed — on `/` every rendered count comes from the catalog.
- Verified rendering paths (my own read of `:196-206`): `CategoryCards` sets `srTitle`/`srCount` to
  `undefined` **when it receives real category records**, so the hidden counts render only in the
  **no-props fallback path** (`render(<CategoryCards />)`) — exactly what the flagged spec does. The
  `srTitle` variants render on the live page from the static array; their tokens are **name variants of the
  visible labels, never numbers** — measured above: `Bản vẽ Kiến trúc` 9 occurrences against the lowercase
  variant 0, `Cơ điện (MEP)` 9 against `Cơ điện MEP` 1.
- Why out of this increment's reach: the component is committed, but the spec that certifies the hidden
  values (`web/tests/challenger/m3-r2-category-stress-verification.spec.tsx:105,107`) is an **untracked**
  file belonging to the storefront vertical.
- Fix shape (for the owner): compute one grouped `count(*) over products_rels` per category (D1's open
  item) and delete `srCount`/`srTitle` entirely — decision 0019 clause 2.
- **Owner: storefront vertical (the untracked spec) + the increment that owns D1 (the counts).**

**F2 (medium) — the CMS nav items are hidden and only the hidden container is asserted.**
- Where it renders: `web/src/components/Header/CategoryMenu.tsx:285-296` — the CMS-nav wrapper
  `<div className="sr-only">` carrying **neither `aria-hidden` nor `tabIndex`** (its `CMSLink` anchors stay
  focusable and invisible). The correct sibling sits directly above at `:279-284`: the `/shop` shortcut
  `Link` with `className="sr-only"` (`:279`), `tabIndex={-1}` (`:280`) and `aria-hidden="true"` (`:281`) —
  the pattern this wrapper should follow, or the items should be rendered visibly, or dropped as the
  banner's hidden `/shop` link was dropped.
- What a user sees vs what the DOM hides: a visitor sees no CMS nav item at all; a screen reader reads the
  label (`Trang chủ`) and the link is focusable while nothing on screen shows it.
- Why out of this increment's reach: both files are untracked storefront-vertical work.
- Fix shape (for the owner): render the items visibly, or drop them as the banner's hidden `/shop` link was
  dropped; if they must stay hidden for a documented reason, add `aria-hidden` + `tabIndex={-1}` and assert
  something a user actually experiences.
- **Owner: storefront vertical.**

**O1 (low) — product-card hidden tokens duplicate the visible badges.**
- Where it renders: `web/src/components/ProductGridItem/index.tsx:141-149`, an `sr-only` span carrying the
  software title, the category title and `Miễn phí`/`Bản quyền` "to prevent duplicate text collision", read
  by legacy specs.
- What a user sees vs what the DOM hides: the visible badges above already carry the skill/format and the
  licence; the hidden span repeats them for assistive tech and for tests.
- Why out of this increment's reach: the file is modified by other work in the same tree, and the specs that
  read the tokens sit in files this increment must not stage.
- Fix shape: carry the text in the card's accessible name (or mark the span `aria-hidden` + no focusable
  content) once those specs are updated in one pass with the component.
- **Owner: the increment that next touches the product card (t10/t22 lineage).**

### `grep -rn "sr-only" web/tests` — all seven hits, each accounted for

| # | Hit | Verdict |
|---|-----|---------|
| 1 | `m6-challenger2-adversarial.spec.tsx` — test name `4.3 CategoryMenu hides CMS nav items visually using sr-only` | **F2** |
| 2 | `m6-challenger2-adversarial.spec.tsx` — comment `… sr-only div to prevent visual clutter` | **F2** (the comment documents the defect) |
| 3 | `m6-challenger2-adversarial.spec.tsx` — `container.querySelector('.sr-only')` assertion | **F2** (certifies the hidden container) |
| 4 | `m3-challenger1-empirical.spec.tsx` — `expect(node.className).not.toContain('sr-only')` ancestor walk | **justified**: a negative assertion written by t46 to prove the figure is reachable |
| 5 | `m5-r2-compact-stress.spec.tsx` — same ancestor walk | **justified** (t46) |
| 6 | `m5-r2-responsive-viewport.spec.tsx` — same ancestor walk | **justified** (t46) |
| 7 | `m3-r2-category-stress-verification.spec.tsx` — comment `Accessible sr-only tokens for legacy test assertions` | **F1** (the file asserts `850+ hồ sơ` / `340+ hồ sơ` at :105,107) |

In the banner and its three specs, `sr-only` now appears **only** inside those negative `not.toContain('sr-only')`
walks (hits 4-6); the banner file itself contains no `sr-only` and no `creator-banner-compat`.

### Containment proof (nothing outside this increment moved)

- `git status --short`: `?? web/src/components/Header/CategoryMenu.tsx`,
  `?? web/tests/challenger/m3-r2-category-stress-verification.spec.tsx`,
  `?? web/tests/challenger/m6-challenger2-adversarial.spec.tsx` — still untracked, never staged.
- sha256 taken before and after this report, identical:
  `m3-r2-category-stress-verification.spec.tsx` = `713d3963597498cd…`,
  `m6-challenger2-adversarial.spec.tsx` = `a5edb715c72cb7dd…`,
  `Header/CategoryMenu.tsx` = `aad6e3c9a836f828…`, `CategoryTabs/index.tsx` = `389213d4276fcf27…`.
- `web/src/components/CreatorBanner/index.tsx` sha1 = `f254b0bbc6e5d6768a294821731f5b95393188c9` — the frozen
  t46 state, unchanged (the control mutation below restored it byte-identically).
- One disclosure: before the hold arrived I had made a single edit under the superseded generic contract —
  adding `aria-hidden="true"` to `ProductGridItem/index.tsx:142`. It was reverted to the byte I found
  (the file now contains no `aria-hidden`), and O1 above records the finding instead of a partial fix.

### Control, from this run

Adding `sr-only` to the figure's class in `CreatorBanner/index.tsx` and running the three banner specs:
**exit 1**, three failures, each `AssertionError: expected 'sr-only text-xs font-semibold text-sl…' not to
contain 'sr-only'` (one per spec file). Restoring the file (sha1 back to `f254b0bb…`) and re-running:
**exit 0**, `Test Files 3 passed (3)`, `Tests 50 passed (50)`.

### Gates on the final tree

`pnpm --prefix web test:challenger` → exit 0, `Test Files 31 passed (31)`, `Tests 469 passed (469)`.
`pnpm --prefix web exec tsc --noEmit` → exit 0. `grep -rn "creator-banner-compat" web/src web/tests` →
no output (exit 1).
