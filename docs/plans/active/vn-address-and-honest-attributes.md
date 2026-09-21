# Vietnam in the address list, and attributes that come from the record

Status: active
Authority: the owner's grant of 2026-09-21 — *"cho bạn toàn quyền làm việc này"* — over the four
items they listed: the missing `VN` address country, the "80% chia sẻ doanh thu" figure, the loyalty
"xu" promise, and the invented product attributes. Decisions `docs/decisions/0015` (Vietnam-first
address countries), `0016` (commission copy reads the setting), `0017` (no loyalty points without a
ledger), `0018` (a product attribute comes from the record, or is not shown) are the contract of
record; this plan is the execution.

## What measurement changed about the four items

Three of the four premises were partly or wholly stale by the time they were measured on the settled
tree (commit `7cd3397`, 2026-09-21). The corrections are part of the deliverable, because the owner
asked these questions from an earlier report.

| # | Owner's item | Measured state, 2026-09-21 | Work left |
|---|---|---|---|
| 1 | `VN` missing from `enum_addresses_country`, form defaults to `US` | **Confirmed.** The enum holds 40 values and no `VN`; the plugin builds the `select` from `addresses.supportedCountries ?? defaultCountries`; both client forms pin the default to `countryOptions[0]` = `US`; the same form already offers Vietnamese provinces; `addresses` held 0 rows | Schema + single list + default (decision 0015) |
| 2 | "80% Chia sẻ doanh thu" vs `default_rate = 0.30` | **Real when reported, already repaired.** It was D9: a hard-coded `80%` at `CreatorBanner.tsx:116`. Commit `7cd3397` replaced it with `Math.round((1 - defaultRate) * 100)`; the homepage now renders **70%**, and `80%` occurs 0× in `web/src` and 0× in a full data dump | Prove it on the rendered page with a mutation test (decision 0016) |
| 3 | Loyalty "xu": copy promises, schema empty | **Real when reported, already repaired.** D36 (`/wallet` "Điểm thưởng tích lũy 484 điểm") and D43 (`/login` "Tích xu thưởng & Quyền lợi thành viên") were both removed in `7cd3397`; the terms now match **0** display strings and **0** database rows | Prove the absence on the rendered surfaces, and keep it that way (decision 0017) |
| 4 | Invented attributes ("Số lượng bản vẽ", "Tương thích Windows", package checklist) | **Partly live, partly dead code.** D26/D27/D28 were removed in `7cd3397`. Still present: the seller form **writes** `'AutoCAD 2022+'` when the seller leaves the version blank (`ProductEditorModal.tsx:189,267`, `ProductEditorForm.tsx:29`; 74/165 stored rows carry exactly that literal); `TechnicalSpecsTable.tsx` carries six invented fallbacks (`:86,98,108,119,143,168`) — not rendered in the app, but asserted by `tests/challenger/product-detail.spec.tsx:188-215`; `ProductDetailTabs.tsx:183-231` carries an unreachable five-row package checklist | Stop the write-side default, make the display side omit instead of invent, delete the unreachable modal (decision 0018) |

## Deliverables

1. **Country (decision 0015)** — `web/src/constants/countries.ts` (`SUPPORTED_COUNTRIES`, `VN` first),
   `addresses: { supportedCountries }` in `web/src/plugins/index.ts`, both client forms defaulting to
   `VN`, and migration `20260921_*_phase14_address_countries.ts` replacing `enum_addresses_country`
   transactionally with the union of the old 40 and `VN, TH, LA, KH, MM, PH, ID, CN`.
2. **Attributes (decision 0018)** — the seller editor stops inventing spec values; `ProductDetailTabs`
   loses the unreachable fabricated checklist; `TechnicalSpecsTable` renders a row only from the
   record; its challenger spec asserts absence rather than the fabrications.
3. **Evidence for items 2 and 3 (decisions 0016/0017)** — a mutation-tested rendered measurement of the
   revenue-share figure, and a recorded search + rendered check proving no loyalty promise exists.
4. **The 161 stored `'% 2022+'` spec rows reported, not purged** — exact SQL, counts and the six
   distinct values, handed to the owner with the purge as their call.

## Out of scope

- Any UI redesign: the owner's standing instruction is that the API and the wiring satisfy the
  interface, not the other way round.
- Purging or rewriting stored `technicalSpecs` values (decision 0018 clause 5).
- Adding new seller fields for attributes no surface renders (decision 0018 clause 4).
- `package.json`, `pnpm-lock.yaml`, `next.config.ts`, `vitest.challenger.config.mts`, `web/scripts/**`,
  generated import map, `.agents/**`, `.agent-teams/**` — not staged by this increment.
- The storefront vertical's files outside the paths this increment edits.

## Acceptance (increment level)

1. A real user can save an address with country `VN`, and `VN` is the form's default; a value outside
   the list is still refused; the enum and the shared list are equal sets (SQL against `pg_enum`).
2. The migration applies, reverses and re-applies on a scratch database with no error and no residue.
3. A product created through the seller editor without a version stores no version.
4. No fabricated attribute literal is displayed on any product page, proven by rendering, with a
   negative control that shows the instrument fails when a literal returns.
5. The homepage revenue-share figure equals `(1 - commission_settings.default_rate) * 100`, proven by
   a mutation that moves it, and no loyalty figure appears on `/wallet` or `/login`.
6. Gates green on the frozen revision: `payload migrate`, `test:int`, `test:challenger`, `lint`,
   `tsc --noEmit`, `next build`.

## Task graph

| id | kind | subject | owner | depends on |
|---|---|---|---|---|
| **t21** | implementation | `VN` in the address country list (shared list, plugin, forms, phase-14 migration) | engineer-schema | — → completed |
| **t25 → t31 → t32** | review / repair / review | decision 0015 | reviewer / engineer-schema | needs_revision (evidence layer) → repair → **pass** |
| **t22** | implementation | record-backed attributes on both paths (write + display) | engineer | `failed` on a captain contract defect (t22-F1); its content reviewed **pass** at t26 and the commit message carries the explanation |
| **t23** | work | revenue-share figure + loyalty promise on the render | mapper | completed — no display/data mismatch |
| **t24** | verification | independent verification of t21/t22/t23 | verifier | 9/9 |
| **t26** | review | decision 0018 | reviewer | **pass**, with handoffs R1 (order-page version claim) and R2 (description chip) |
| **t33 → t34 → t35** | repair / verify / review | order page + description must not claim a version the record lacks | engineer / verifier / reviewer | needs_revision: the same class one line below, live |
| **t38 → t39** | repair / review | the order table's format cell | engineer / reviewer | needs_revision: `.rvt` (80 order items / 28 buyers) rendered CAD / DWG |
| **t40 → t41** | repair / review | the matcher covers the whole stored extension domain | engineer / reviewer | **pass** — rendered on live orders; V9 reads the domain from the database |
| **t42 → t43** | repair / review | LUMION keyed on real tokens + expectation-based guard | engineer / reviewer | t42 completed; t43 in flight |
| **t28 → t29 → t30 → t36 → t37** | repair / verify / review / repair / review | the cart total equals the money path (and the dead discount capability deleted) | engineer / verifier / reviewer | needs_revision → repair → **pass** |
| **t27** | integration | gates on the frozen revision, one commit, close the plan | mapper | holding until t43 is terminal (a race the captain stopped) |

## Findings raised by the measurement task (t23), and what happens to each

1. **The revenue-share figure is derived and follows the setting — proven, not read.** Baseline
   `default_rate = 0.30` → rendered `70%`; mutation to `0.25` → rendered `75%`; restore → `70%`, with
   the restore shown by re-reading the row; no caching observed (plain `curl`, no cache-busting).
   The adjacent member count (`59`) also equals `select count(*) from users`. The removed `80%` never
   entered git history: `CreatorBanner` was first committed by `7cd3397` out of the vertical's
   uncommitted tree.
2. **The figure is only visible to screen readers — handed to the owner.** `CreatorBanner/index.tsx:121-136`
   holds an `sr-only` block labelled *"Invariant Test Compatibility Layer (satisfies existing
   challenger assertions)"* with the share figure, the refund/quality promises and two links, and two
   challenger specs assert that block (including that its class contains `sr-only`). A sighted visitor
   sees no share figure; a screen-reader user hears it and can focus links sighted users cannot see.
   The data is correct, so this is a **visibility/accessibility** defect in the design layer — the
   storefront vertical's and the owner's call. Recorded in decision 0016's Follow-Up; no agent may
   "fix" it by writing a literal back into visible copy.
3. **The cart's `-10%` voucher was client state only — repaired under t28.** `CartPageClient.tsx`
   computed a 10% discount for the code `KIENTAO10` while `CheckoutPage.tsx:806` rendered
   `OrderSummaryCard` without its `discount` prop, and no coupon/voucher/discount/promo table exists
   in the database — the cart promised a price the buyer is not charged. A real voucher programme is a
   separate increment (table + redemption rule + money-path change + decision under 0002).
4. **Dev-server disclosure.** The measurement task found `:3000` was *not* running (nothing listening)
   when it began and started it as a managed background job; it restarted nothing, and its renders
   therefore start at 20:18. The captain re-checked afterwards: `:3000` answers `200`.

## Contract defects found during execution (captain-owned)

The task contracts are the captain's, so a task that fails on its contract is a captain defect. Four
found in this increment, each only when a member hit it:

1. **t22-F1 — `inScope` forbade the file the objective required.** Acceptance item 9 required
   `pnpm test:challenger` to be green, but `web/tests/challenger/m3-challenger2-empirical.spec.tsx`
   asserted the same six fallbacks the objective removes, so the gate could not go green without
   editing a file the declared scope excluded. The author kept the green fix and reported the conflict
   instead of shipping a red gate (correct choice). A failed contract is terminal and cannot be
   amended, so the repair is: reopen t22, extend `inScope`, re-submit without code work.
   **Check for next time:** for every acceptance criterion that requires a gate to be green, list the
   files that gate touches and confirm each one is inside `inScope` before dispatch.
2. **t24 — a verification contract that named the author's probe as a model.** Its scope excluded
   `web/tests/helpers/` except two exact files, which is fine, but the contract did not require the
   verifier to validate its own selector against the installed antd. That is what let a false FAIL
   (`"" vs Vietnam`) reach a report (t25's F2).
   **Check for next time:** require every instrument that reads a rendered DOM to name the selector it
   uses and the source that proves the selector exists in the installed dependency version.
3. **Reviewer serialization.** t26 was created without a dependency on t25, so the reviewer claimed it
   while t22 was still unfinished. Harmless here (the reviewer judges artefacts, not statuses) but it
   widens the window in which a verdict can be issued against a moving task.
   **Check for next time:** give review tasks an explicit dependency on the task they judge plus the
   verification that precedes them.
4. **t28 — an acceptance that required a negative control, without naming the element it must read.**
   The contract said "the negative control is shown" but not *which node* proves the total, so the
   author's probe read a row that does not move when the discount is mutated and its control never
   fired. The author refused to claim it (correct — the alternative was to certify a blind
   instrument). The captain retried the task with the sensitivity fix in scope, and amended the
   verifier's t29 contract to name the payable-total element, require the control to be **observed
   firing** before the instrument is trusted, and require the cart-seeding path to be disclosed.
   **Check for next time:** when an acceptance criterion names a rendered value, name the element the
   instrument reads and require the failure run, not just the passing one.
5. **t22-F1, second-order: a frozen contract cannot be repaired.** After review t26 returned `pass` on
   t22's content, the runtime froze t22's contract, so the `inScope` extension that would have made its
   completion legal was rejected (*"task t22 already passed review; its contract is frozen"*). The
   consequences are recorded here rather than papered over:
   - t22's **content** is delivered, measured and reviewed `pass` (t26), and the tree carries it.
   - t22's **status** stays `failed` on the captain's contract defect. No attempt was made to omit
     `changedPaths` or otherwise satisfy the validator by hiding the file; the engineer was told to make
     one attempt, report the rejection verbatim, and stop.
   - The commit message must name `web/tests/challenger/m3-challenger2-empirical.spec.tsx` as a file this
     increment changed **and** the reason its task reads `failed`, so a later reader does not mistake a
     captain bookkeeping defect for unfinished or unverified work.
   - Outcome, verbatim: the engineer made exactly one completion attempt and it was rejected with
     `implementation cannot complete: web/tests/challenger/m3-challenger2-empirical.spec.tsx is
     undeclared`. They did **not** drop the path to slip past the validator, and they stopped as
     directed. t22 therefore stays `failed` with t22-F1 as its finding.
   - Current-tree evidence for the commit message and any later reader, re-measured after the freeze
     (HEAD `7f42759`, 83 modified tracked + 72 untracked at that moment): probe
     `web/tests/e2e/probe-product-attributes-provenance.mts` **23/23, exit 0** (sha1 `d9d0d6cbf0`);
     negative control re-run the same day — the old `|| 'AutoCAD 2022+'` restored → **exit 1**
     (`FAIL W1 … sends no invented softwareVersion`), byte-identical revert (sha1 `bd8ab77195`) → 23/23;
     `tsc` exit 0; `lint` exit 0 with 0 errors; challenger **31 files / 467 tests** exit 0 (30/464 at the
     first run — the extra file and tests are the cart-total, order-detail-version and address-enum
     ones); end to end, a product created through `POST /api/seller/products` with no version stored
     `technical_specs_software_version = ""` (format and size empty), was published, read, and deleted,
     with the orphan from the first probe run also deleted. Work artefacts by sha1:
     `ProductEditorModal` `bd8ab77195`, `ProductEditorForm` `189595c634`, `TechnicalSpecsTable`
     `59d79df901`, `ProductDetailTabs` `ddea29eb56`, `product-detail.spec` `abda36a564`,
     `m3-challenger2-empirical.spec` `f68a2f9c47`, the probe `d9d0d6cbf0`.
   **Check for next time:** validate `inScope` against every file the acceptance gates touch *before*
   dispatch, because after the first passing review there is no repair path inside that task.
6. **A replaced contract does not reach the member.** When the captain swapped t36's auto-generated
   acceptance block for the findings-driven one (7 items), the member's delivered prompt still carried
   the old block, so its first two completion attempts were rejected on the item-count mismatch. The
   record was right; the prompt was stale.
   **Check for next time:** whenever a contract is amended after dispatch, send one line naming what
   changed and how many acceptance items the record now holds.
7. **The same defect recurred on t38 and cost a whole round.** The member asked for two paths to be
   added to `inScope` — `web/src/components/orders/OrderDetailClient.tsx` and
   `web/tests/challenger/order-detail-version.spec.tsx` — and reported rather than editing them, which
   was right. But the amended record **already contained both**; the member was reading the stale
   delivered prompt, and the captain's notice had said "read the record, 7 items" without quoting the
   paths. So the lesson from item 6 was applied too weakly.
   **Check for next time:** the notice must **quote the full `inScope` list verbatim**, not point at
   the record; and before dispatch, cross-check that every file named in the acceptance or verify text
   is inside `inScope` — that single check would have caught t22, t36 and t38.
8. **An acceptance item that requires an artefact must include the path the artefact lives at.** t42's
   item 3 required "both runs recorded", but its `inScope` listed only source and test files, so the
   engineer had nowhere legal to write the control logs and they existed only as prose; review t43
   failed the criterion on exactly that, and the captain had to add `.lit/evidence/engineer-t44/` to
   the next contract. **Check for next time:** when an acceptance item says "record", "paste", "log" or
   "report", name the directory in `inScope` in the same breath.

## Progress

- t45 completed (reviewer, verdict **pass**) — the last gate before integration. Round 1's two findings
  are closed and the reviewer proved the coverage guard **with its own control** rather than by reading:
  a scratch product with `.obj` (id 1667, slug `reviewer-t45-scratch-domain`) made the probe exit 1 with
  `FAIL V9 … unclassified stored value(s): .obj — classify them before shipping`; the reviewer deleted
  it, verified 0 rows and the catalogue back at **165**, and the probe exited 0 at 13/13. F2 is closed
  too: the four control files are openable with hashes recorded, and the matcher's sha256 matches the
  hash the revert logged, so what was reviewed is the reverted state. Gates: probe 13/13, spec 7/7,
  `tsc` 0, `lint` 0 errors, challenger 31 files / 469 tests. Scope: the probe plus four evidence files,
  no `web/src` edit.
  - **One claim of the review was stale, and the captain checked rather than repeated it.** The review
    noted that t44's injected-run file still kept the stray `INSERT01` line; `grep -c INSERT01
    .lit/evidence/engineer-t44/*.txt` now returns **0 for all four files**, so the cleanup is complete
    and the note was written from a read that overlapped it. Recorded because a stale observation that
    nobody re-checks becomes a permanent accusation in a plan.
  - Carried, unrelated and unchanged: the add-time cart snapshot, and `.pdf`/`.ls` pinned at component
    level only (no order references them).

- t44 completed (engineer): the guard's coverage claim is now true by construction, and the two controls
  are recorded as files rather than prose. **V9** builds the domain from the database **in the same run**
  and fails on any stored value missing from the classification table, while **V9b** fails in the other
  direction (a classification naming a value the catalogue no longer stores), so the classified set
  **equals** the measured set — the tautological sum check is gone. **V10** walks the stored keys and
  requires each one's branch to render its classified tag; **V11** keeps the free-text/no-substring
  assertion. Probe **13 checks / 13 ok**.
  - Control 1 (a value the guard was not written for): a scratch product with `.obj` → probe exit 1,
    `FAIL V9 … unclassified stored value(s): .obj — classify them before shipping`; after `DELETE 1` →
    exit 0, 13/13, cleanup count 0. Files: `new-value-domain-control.txt`, `…-after-cleanup.txt`.
  - Control 2: the bare `LS` substring restored (diff recorded) → exit 1 (`V10 .ls: no branch for '.LS'`
    plus the V11 capture); after a byte-identical revert (sha256 equal) → exit 0, 13/13. Files:
    `negative-control-ls-substring.txt`, `probe-run-after-revert.txt`.
  - Domain re-measured and all seven values classified (`.dwg` 74, `.rvt` 40, `.skp` 27, `.max` 17, null
    4, `.pdf` 2, `.ls` 1); catalogue back to 165. Gates: probe 13/13, spec 7/7, `tsc` 0, `lint` 0 errors,
    challenger 31 files / 469 tests. Scope: the probe plus four evidence files and **no `web/src` edit** —
    the mutation was applied and reverted inside the control run.
  - **Captain follow-up asked for and granted:** a stray `INSERT01` fragment from psql's RETURNING
    output sits in one evidence header; the engineer was asked to remove it and to name which evidence
    directory is canonical (the t42-era copies landed in a second directory because t42's contract
    declared no evidence path — contract defect 8).

- t43 failed as **needs_revision**, and the verdict is precise about what is and is not wrong: **the
  display is correct and the guard oversold its coverage**. The reviewer re-derived the stored domain
  itself (matching 165) and evaluated the matcher independently — `Models`, `Tools`, `CAD Models`,
  `Models / CAD`, `DWG files`, `Photoshop` → `'Chưa khai báo'`; `.ls`/`LUMION` → LUMION;
  `.dwg`/`CAD`/`AutoCAD 2022+` → CAD / DWG; empty/whitespace/null/undefined → the absence — so the
  free-text vector is closed rather than narrowed, and live renders confirmed the claimed tags
  (206/192/130 → BIM / REVIT, 348 → SKETCHUP, 349 → CAD / DWG, 169 as buyer11 → 3DS MAX, with
  `.pdf`/`.ls` pinned at component level because no order exists for them).
  - **F1 medium → t44 (repair) / its review.** V10 iterates a fixed six-entry `expectations` list and
    `continue`s past any stored value outside it, while V9's "adds up to the catalogue" assertion is a
    **tautology** (the sum of a `group by` over the same table). A new stored value — `.obj`, `.zip`,
    seller prose like `BIM models` — would therefore pass V9, V10 and V11 unasserted, which is exactly
    what t42's acceptance item 4 existed to prevent. The repair must iterate the measured domain, fail
    on any value without an expectation or an explicit `unrecognised → honest absence` classification,
    replace the tautology with an assertion that can fail (the expectation set **equals** the measured
    set), and prove it on a value the guard was not written for.
  - **F2 low — the captain's defect, recorded as such.** t42's acceptance item 3 required both control
    runs recorded, but t42's contract gave the engineer **no evidence path to write them to**, so they
    existed only as prose and the reviewer had nothing to read. t44's contract adds
    `.lit/evidence/engineer-t44/` to `inScope`. This is contract defect **8**: an acceptance item that
    requires an artefact must include the path that artefact lives at.

- t42 completed (engineer): the last vector is closed and the guard asserts expectations rather than
  existence. LUMION is keyed on the tokens (`=== '.LS' || === 'LS' || includes('LUMION')`) instead of a
  bare two-letter substring, and the spec proves `Models`, `Tools` and `CAD Models` each render
  `'Chưa khai báo'` and never LUMION while `.ls` still maps to LUMION. The final ordered mapping is:
  empty → `'Chưa khai báo'`; `.rvt`/`.rfa`/REVIT/BIM → BIM / REVIT; `.skp`/SKP/SKETCHUP → SKETCHUP;
  `.max`/MAX/3DS/3DSMAX → 3DS MAX; `.ls`/LS/LUMION → LUMION; PDF/`.doc`/`.docx` → TÀI LIỆU; MEP → MEP;
  `.dwg`/DWG/`.dxf`/DXF/AUTOCAD/CAD/`'CAD / DWG'` → CAD / DWG; **anything else → `'Chưa khai báo'`**, so
  an unrecognised free-text value is honest rather than guessed (`includes('CAD')` is deliberately not
  used, which is what keeps `CAD Models` absent). The guard grew from one row to three: **V9**
  re-measures the stored domain live and asserts it adds up to the catalogue (165); **V10** carries an
  expectation per stored value and fails unless that value's branch renders the expected tag; **V11**
  asserts the synthetic free-text case reaches the absence and that no bare `'LS'` substring exists.
  Control both ways: with the substring restored the probe exits 1 (`FAIL V10 … .ls: no branch for
  '.LS'` plus the V11 capture), and after a byte-identical revert it is **12 checks / 12 ok, exit 0**.
  Gates: probe 12/12, spec 7/7, `tsc` 0, `lint` 0 errors, challenger **31 files / 469 tests**. Three
  files changed, all inside the quoted `inScope`; the orders page needed no edit this run.
  - **Two follow-ups named, none blocking:** (1) the out-of-scope spec
    `m5-challenger2-empirical.spec.tsx` feeds the **label** `'CAD / DWG'` as a format *value*, so rather
    than edit that spec the engineer taught the CAD branch to recognise the label-shaped value — the
    suite is green and `CAD Models` still renders the absence, but that spec's fixtures test a label
    round-trip where records hold extensions, which is test-hygiene work for a later sweep; (2) the
    add-time cart snapshot carried from the cart review.

- **Race caught at integration (captain).** `t27` (integration) became ready and started as soon as
  `t41` passed — and `t42` was opened minutes later on the same four order-format files, so the frozen
  revision could have swept in an unverified, possibly half-finished edit. The runtime refused the
  dependency correction (`task "t27" has already started and cannot be edited`), so the captain sent the
  integration owner an explicit hold: do not freeze, gate or commit until `t42` and `t43` are terminal,
  with read-only preparation in the meantime and no `next build` while an edit is in flight. Recorded
  because the shape recurs: **a task becomes ready the moment its last dependency passes, so opening
  new work on the same paths afterwards races the integration that was already dispatched.** The
  structural fix is to create follow-up repairs *before* integration becomes ready, or to give
  integration a dependency on the review that will judge the last repair.
  - **The commit set, measured rather than assumed** (the integration owner corrected his own first
    number, which is the behaviour this increment wants): 36 paths = **22 new (untracked) files + 14
    tracked-modified**. The new ones land whole: decisions 0015–0018, this plan,
    `web/src/constants/countries.ts`, the phase-14 migration, `ProductEditorModal.tsx`,
    `OrderSummaryCard.tsx`, `OrderDetailClient.tsx`, and 13 new specs/probes. Of the 14 tracked files,
    two are the storefront vertical's own Ant Design rewrites that this increment also had to change —
    `TechnicalSpecsTable.tsx` (+215/−168) and `orders/[id]/page.tsx` (+55/−130) — and the rest are
    small and subject-scoped (largest: `CartPageClient.tsx` +4/−45 for the voucher deletion,
    `ProductDetailTabs.tsx` +1/−53 for the checklist deletion). The commit message states that split
    explicitly rather than letting a reader discover it.

- t41 completed (reviewer, verdict **pass**): the format class is closed on the render, not the diff.
  `.rvt` (40 products, **80 order items across 28 buyers**) renders **BIM / REVIT** on the three live
  orders the reviewer opened as buyer01 (206, 192, 130) with no `CAD / DWG`; `.skp` → SKETCHUP (348);
  `.dwg` → CAD / DWG (349); `.max` → **3DS MAX** (order 169 as buyer11 — the branch that was dead in
  round 2). The matcher is one ordered, documented chain with the empty-record branch first and no
  shadowing, and the page's stale comment is accurate again. The reviewer re-derived the stored domain
  itself (`.dwg` 74, `.rvt` 40, `.skp` 27, `.max` 17, null 4, `.pdf` 2, `.ls` 1 = 165) and evaluated
  the chain per value plus real `undefined`/`null`/`''` → `'Chưa khai báo'`. Gates: probe 10/10 (V9
  reads the stored domain from the database and fails if a value lacks a branch), spec 6/6, `tsc` 0,
  `lint` 0 errors, challenger 31 files / 468 tests.
  - **Residual named rather than left implicit → t42 / t43.** The `LS` branch matches a bare two-letter
    substring while `technicalSpecs.fileFormat` is **free text written from the seller form**, so
    `Models`/`Tools`/`CAD Models` would render `LUMION`; and V9 only fails when a stored value has
    **no** branch, so a mis-captured free-text value would pass both V9 and the spec. Reachability
    today is zero (no stored value trips it), and the captain opened a task anyway, on the increment's
    own rule: it is the last known instance of a class that has already taken four rounds
    (t33 → t38 → t40 → t42), it was introduced by our own repair, and shipping a known false-label
    vector while decision 0018 says a display comes from the record or is not shown would contradict
    the work. t42 also routes unrecognised non-empty values to an honest absence (the `CAD / DWG`
    fallback is right for `.dwg`/`CAD` tokens and a guess for anything else) and strengthens the guard
    from branch-existence to **expected tag per stored value**.

- t40 completed (engineer): the `.rvt` defect is fixed and the matcher now covers the data rather than
  one extension at a time. `getFormatTag` carries one ordered, documented mapping —
  `RVT/RFA/REVIT/BIM → BIM / REVIT`, `SKP/SKETCHUP → SKETCHUP`, `MAX/3DS → 3DS MAX`,
  `LS/LUMION → LUMION`, `PDF/DOC → TÀI LIỆU`, `MEP → MEP`, `.dwg` and anything else → `CAD / DWG`, and
  an empty record → the honest absence `'Chưa khai báo'`. Re-measured on the reviewer's case as
  buyer01: orders **206, 192 and 130** (product 46, record `.rvt` / `Revit 2022+`) now render
  **BIM / REVIT** with no `CAD / DWG` on those pages. F3 resolved: the old `3D|MAX|SKETCHUP → 3D MODEL`
  branch that made `3DS MAX` dead is deleted, `.max → 3DS MAX` is pinned in the spec, and the stale page
  comment now describes the current chain and matcher. **F2 closed by coverage:** a new probe row
  **V9** reads the stored domain from the database (`.dwg` 74, `.rvt` 40, `.skp` 27, `.max` 17, `.pdf` 2,
  `.ls` 1, null 4) and fails if any stored value has no token branch — where V7/V8 only checked the
  chain's shape. The spec pins all six stored values. Gates: probe 10/10, spec 6/6, `tsc` 0, `lint` 0
  errors, challenger **31 files / 468 tests**. Scope: the four quoted paths only.
  - **Captain sweep, answering the engineer's round-4 suggestion** ("the same 'keyed on a word instead
    of the stored token' shape is worth grepping beyond this matcher"): the sweep found exactly **one**
    such helper in the repository — `getFormatTag`, now fixed and coverage-asserted — plus two families
    that are *not* the defect shape: `AccountDashboardLayout.tsx:51-54` matches **stored role codes**
    (`roles.includes('admin')`), where the token compared is the token stored, and
    `CategoryMenu.tsx:28-40` keys off **URL search params** (navigation input, not a record value). The
    status tables in `FinanceOperations.tsx` and `WithdrawalHistoryTable.tsx` switch on stored enum
    codes, which is the correct shape. So the class has no remaining instance to open a task for; V9 is
    the guard that keeps this domain covered.

- t39 failed as **needs_revision**, and the finding is bigger than the one before it: `getFormatTag`'s
  BIM/REVIT branch keys on the **words** `BIM`/`REVIT` while the record's value is the **extension**
  `.rvt`, which contains neither — and the previous repair added branches for `.skp`/`.max`/`.ls` but
  skipped `.rvt`. Measured live by the reviewer as buyer01: **order 206** (product 46, record `.rvt` /
  `Revit 2022+`) renders `CAD / DWG` and not `BIM / REVIT`, while order 348 (`.skp`) shows SKETCHUP and
  349 (`.dwg`) shows CAD / DWG. Reachability: **80 order items across 28 buyers** — the second-largest
  ordered format after `.dwg` (buyer01 alone holds 206, 192, 130, 124). Two low findings accompany it:
  the instrument checks the chain's *shape* (V7 undeclared reads, V8 literal fallback) while the spec
  covers only `.skp` and the empty case, so a branch gap for another stored value passes every gate;
  and the new `3DS MAX` branch is unreachable because the earlier `3D`/`MAX` branch wins, while the
  page comment is stale.
  - **t40 (repair) / t41 (review)**, with the contract amended by the captain to require **coverage
    rather than shape**: measure the stored extension domain first, give every distinct value an
    explicit branch (`.rvt` → BIM / REVIT, and the rest of the catalogue), let anything outside it be
    the honest absence, and make the probe assert that every distinct stored `fileFormat` reaches a
    non-default branch, with `.rvt` pinned in the spec and a control that fires when the branch is
    removed. The captain also sent the engineer the **full `inScope` quoted verbatim**, per the rule
    recorded in contract defect 7.
  - **The increment's main process lesson, stated plainly:** the order table has now taken three rounds
    (t33 → t38 → t40) because each repair was instance-shaped while the instrument verified shape, not
    coverage. The same illusion — "the gate is green, so the class is closed" — is what let the six
    `TechnicalSpecsTable` fallbacks, the unreachable package checklist and the dead discount tests
    survive earlier rounds. Coverage assertions are the fix; instance fixes are not.

- t37 completed (reviewer, verdict **pass**): round 1's F1 is closed exactly as asked.
  `OrderSummaryCard.tsx` (sha `3643dd6db23187`) declares no `discount`, subtracts none
  (`finalAmount = Math.max(0, subtotal + platformFee − walletDeduction)`, comment naming decision 0002
  and the zero coupon/voucher tables) and renders no discount row; `grep -rn discount
  web/src/components/checkout/` = 0; the two tests that certified the fabricated `-100.000 ₫` row and
  the floor-at-zero total are deleted with their wallet fixtures restored at module scope, so the file
  passes 21/21 and **no spec anywhere asserts a discount a table cannot honour**. Every remaining
  mention is enumerated and none can render or assert a reduction (`OrderSummaryCard.tsx:32-34` and
  `CartPageClient.tsx:49` comments; `AccountForm/index.tsx:429` newsletter copy, a handoff to the
  storefront vertical; `voucher=DISCOUNT` inside redirect-safety URL fixtures in `login.spec.tsx` and
  `m4-challenger1-empirical.spec.tsx`). The reviewer's own re-measurement with the storefront's
  add-to-cart click reproduces the totals (record 320000 = cart 320000; checkout total 0 ₫ = subtotal −
  wallet), the probe is 10/10 and the recorded control still exits 1 naming `288000 vs 320000`. Gates:
  `tsc` 0, `lint` 0 errors, challenger 31 files / 467 tests. One tree event, named per the guidance:
  the reviewer's first suite run failed two tests in `order-detail-version.spec.tsx` because t38's
  format-cell repair was rewriting that spec at that moment; the immediate re-run was green and t36's
  file was green in both runs, so the transient red belongs to the in-flight repair, not to this one.
  - **Captain action from this report:** t27's dependency list still named two **failed** reviews
    (`t25`, `t35`), so the integration task could never have become ready. Rewired to the four passing
    or in-flight gates only: `t26`, `t32`, `t37`, `t39`.

- t38 completed (engineer, attempt 2): the format tag now comes from the record, and the instrument gap
  is closed at the class level. The page reads `format: product?.technicalSpecs?.fileFormat ||
  undefined`, `OrderDetailItem.format?: string` (no cast), and `getFormatTag` gained the branches the
  record's real extensions needed (**SKETCHUP**, **3DS MAX**, **LUMION**) plus an explicit
  **`'Chưa khai báo'`** for an empty format — the same honest absence the version cell uses.
  Rendered on the reviewer's own counter-example: `/orders/348` (product 157, SQL `.skp` /
  `SketchUp 2022+`) now shows **SKETCHUP** with no `CAD / DWG` on the page, and the positive control
  `/orders/349` (`.dwg`) still shows **CAD / DWG**. The chain-against-schema enumeration is recorded
  with file:line for every field it reads, and the captain's count became permanent: **3 undeclared
  names in executable code → 0**, with both explanatory comments retained because they are why the
  ghosts have not returned. **F2 closed as a class, not an instance:** the probe's **V7** sweeps all of
  `src/`, strips comments, extracts every `product.<field>` / `technicalSpecs.<field>` read and fails
  against `payload-types.ts`, while **V8** fails on any quoted literal fallback in the chain — the half
  V7 alone would miss. Both controls fire (V7 on `product?.format`; V8 on `|| 'CAD'`, reporting
  `literal fallback: format: product?.technicalSpecs?.fileFormat || 'CAD'`) and revert byte-identically
  to **9 checks / 9 ok, exit 0**. Gates: probe 9/9, spec 5/5 (`.skp → SKETCHUP ≠ CAD / DWG`, and no
  `fileFormat` → no `CAD / DWG` but `'Chưa khai báo'`), `tsc` 0, `lint` 0 errors, challenger **31 files
  / 467 tests**. Scope: the order page, the orders component and the two named test files only.

- t35 failed as **needs_revision** on one clause, and it is a **live** instance of the class, one line
  below the chain t33 fixed: `orders/[id]/page.tsx:110` built the order item as
  `format: product?.format || 'CAD'` while `Product` declares no `format` field at any layer (not in
  `collections/Products/index.ts`, not in `payload-types.ts`; the database holds only
  `technical_specs_file_format`), so every order row was tagged from the constant. The reviewer's own
  Chromium render as buyer01 of **order 348** (product 157, record `.skp` / `SketchUp 2022+`) showed
  `CAD / DWG` and no `3D MODEL` tag. The version half was verified complete, and reachability was
  measured by SQL rather than inferred: 4 of 165 products lack a version, **0 published**, and **0**
  order items or entitlements reference one.
  - **F1 medium → t38 (repair) / its review.** The auto-generated repair contract carried no findings,
    so the captain amended it: feed the format cell from `technicalSpecs.fileFormat`, state the absence
    explicitly when the record has none, and enumerate every field the chain dereferences against the
    schema.
  - **F2 low → folded into t38.** The probe inspected only `technicalSpecs.<field>` names and the
    spec's fixtures all passed `format: '.dwg'`, so this class passed every gate green; the repair must
    close the instrument gap, not only the instance.
  - **The class was then measured by the captain and is finite.** A scripted sweep (parse the `Product`
    interface and the inline `technicalSpecs` shape out of `payload-types.ts`, then collect every
    `product.<field>` and `technicalSpecs.<field>` read under `src/`) found: 25 declared Product fields,
    `technicalSpecs` = `fileFormat, softwareVersion, fileSize, unit`, **23** distinct `product.<field>`
    reads and **5** `technicalSpecs.<field>` reads across `src/`, of which exactly **three** names are
    undeclared anywhere — `format`, `softwareSupport`, `technicalSpecs.version`. By the time of the
    sweep all three survived only inside explanatory comments (the two fixed ones and the one in
    flight), i.e. executable code reads zero undeclared product fields. The engineer was asked to turn
    that sweep into the instrument's assertion and to report the count before and after, so the class
    closure is one line rather than a story.

- t36 completed (engineer): the dead discount capability is deleted, not preserved. `OrderSummaryCard`
  no longer declares, subtracts or renders a discount (`finalAmount = Math.max(0, subtotal +
  platformFee − walletDeduction)`, with the comment naming decision 0002 and the zero
  coupon/voucher/discount/promo tables), and the two tests that certified it are deleted from
  `m5-challenger1-empirical.spec.tsx` — the author restored the two fixtures those tests had declared
  inside their own span to module scope, which a naive deletion would have left the file uncompilable.
  Measured: `grep -rn discount web/src/components/checkout/` = 0; the only caller
  (`CheckoutPage.tsx:806`) never passed the prop; every other mention (newsletter copy naming 'voucher',
  and `voucher=DISCOUNT` inside redirect-safety fixtures in `login.spec.tsx` and
  `m4-challenger1-empirical.spec.tsx`) can neither render nor assert a reduction; and the payable total
  read from `.ant-statistic-content` is identical before and after (320.000 / 320.000 / 320.000 for
  record, cart and checkout, with the wallet deduction and platform fee untouched). Gates: probe 10/10,
  m5 spec 21/21, `tsc` 0, `lint` 0 errors, challenger **31 files / 465 tests** (467 minus the two
  deleted). Scope: two files; the cart client is still sha1 `b081ac1edf45`.

- t34 completed (verifier, 9/9): no buyer surface claims a version the record does not hold, and the
  ghost fields are gone at every layer. The verifier's own instrument read the chain
  (`technicalSpecs.softwareVersion || undefined`), confirmed `softwareVersion` is declared in
  `collections/Products/index.ts` and `payload-types.ts` alongside exactly `fileFormat`/`softwareVersion`/
  `fileSize`/`unit`, and proved the two phantom reads are absent **everywhere**: not in either file, and
  **not as database columns** (`information_schema` holds only `technical_specs_file_format`,
  `_file_size`, `_software_version`, `_unit`; the count for `technical_specs_version` +
  `software_support` is 0). Its own sweep of 412 files: `'Tất cả phiên bản'` = 0 (asserted),
  `'Chưa khai báo'` = 1 (the honest replacement, reported), `'Đang cập nhật'` = 0,
  `'Không xác định'` = 1 (an unrelated order-status label, reported as a code reading).
  Render on real Chromium with buyer01: order 349 → product 158, SQL version `'AutoCAD 2022+'`, the
  `'Phiên bản phần mềm'` cell reads exactly that, and no `'Tất cả phiên bản'` appears on the page. The
  version-less case is **unreachable through a real order** (SQL: 0 orders reference a version-less
  product; all four version-less products are drafts), so it was measured at **component level and
  labelled as such**: no version → no claim, only `'Chưa khai báo'`; a mixed order is correct per row;
  and for `ProductDescription` the version chip appears when there is a value and is absent when there
  is none, while the software-type title lives only in its own separate link chip. Both controls fire:
  the pre-t33 chain restored in a scratch copy → 4 findings naming `version`, `softwareSupport` and
  `'Tất cả phiên bản'` twice; the old fallback restored in a scratch component → the same spec set exits
  1 (3 failed | 2 passed) while the honest copy is 15/15 probe and 5/5 jsdom. Type honesty:
  `softwareVersion?: string` with no cast, `tsc` exit 0. Gates: challenger 31 files / 467 tests,
  `test:int` 43 files / 658 tests, no flake. Residue: the probe is read-only, `addresses` = 0.

- t30 failed as **needs_revision** on exactly one clause, and the instance plus the class are otherwise
  clean by the reviewer's own measurement: `CartPageClient.tsx` (sha `b081ac1edf45`, the verifier's
  frozen hash) holds no voucher state, no `KIENTAO10`, no discount row or discounted total; the six
  resurrection tokens are 0 in `web/src`, 0 in the served `/cart` HTML and 0 across its 43 client
  chunks; the reviewer's own browser reader used the storefront's add-to-cart click (no seeding) and
  measured record 320 000 = cart payable total 320 000, with checkout `Tổng thanh toán` 0 ₫ =
  subtotal − wallet (a real wallet payment, not a discount); `purchase.ts:184-252` charges
  `product.price`, the same column every surface displays. Gates: `tsc` 0, `lint` 0 errors, challenger
  31 files / 467 tests.
  - **F1 medium → t36 (repair) / t37 (re-review).** The capability the voucher fed is still alive:
    `OrderSummaryCard.tsx:19,29,34,99-103` declares, subtracts and renders a `discount`, and
    `m5-challenger1-empirical.spec.tsx:527` and `:557` assert the fabricated `-100.000 ₫` row, a
    600.000 ₫ total and a floor-at-zero total. Nothing user-visible is wrong (the only caller passes
    none; 0 coupon/voucher/discount/promo tables), but the tests certify a discount no table can honour.
    **Captain's decision, taken not delegated: delete it, not preserve it as a reserved interface** —
    every other unreachable fabricated surface in this increment was removed, and a test asserting an
    impossible discount is the same "green test protects the fabrication" pattern that already cost two
    review rounds. The auto-generated repair contract carried none of this, so it was amended with the
    findings, and the decision was sent to the engineer with its reasoning.
  - **F2 low, carried as a follow-up:** the cart's number is the add-time snapshot of `products.price`
    while the purchase re-reads the record, so a mid-session price edit would show one price in the cart
    and charge another. Reachable only if a price-edit feature or cart refresh lands; no instrument
    covers that interval today. Recorded so the next price-edit change inherits it.

- t29 completed (verifier, 10/10): the cart's payable total equals the money path, measured by an
  instrument that can fail. Two things matter beyond the verdict:
  - **The real buyer path works.** The verifier obtained the cart by clicking the storefront's own
    "Thêm vào giỏ hàng" control (one click, the drawer showed the product, `sessionStorage` printed) —
    no seeding. That closes the author's t28-F2 disclosure as a *harness* limit, not a UI defect: the
    earlier probe simply failed to register the click.
  - **The reader reads the right node.** Raw numbers — SQL `products.price` for the cart line
    **320000**; the cart's payable total, read from `.ant-statistic` titled "Tổng thanh toán" (value
    node `320,000`) = **320000**; the subtotal row **320000** for comparison; checkout subtotal
    **320000** with wallet deduction **320000** and total **0** (the instrument asserts
    `total = subtotal − walletDeduction`, a real wallet payment and not a discount, and asserts no
    discount row). Sensitivity: `--mutate-discount=0.1` overwrites the total node in a scratch copy of
    the rendered page to **288.000** and adds a "Khuyến mãi / Giảm giá" row → **exit 1** with three
    FAILs naming `cart payable total: 288000 vs 320000`, while the subtotal row stayed 320000 — which is
    exactly the discrimination t28-F1 lacked. Two earlier control attempts (intercepting the RSC
    request, reusing a gzip header with the decoded body) broke hydration; both are kept and labelled
    as the verifier's own instrument failures.
  - Resurrection sweep: `KIENTAO10`, `Ưu đãi`, `Mã ưu đãi`, `đã giảm`, `Giảm giá`, `discountPercent`,
    `discountAmount` → **0** in the served `/cart` HTML and in 43 client chunks; the database has **0**
    coupon/voucher/discount/promo tables. One non-asserted observation recorded so a later sweep does
    not chase it: the footer's marketing sentence contains the ordinary word "ưu đãi đặc biệt".
  - The rewritten spec judged as a test: run against the real component it passes; against a scratch
    copy with the pre-t28 voucher restored it fails (`expected <input …> to be null`). The verifier
    states its limit honestly: that spec only catches the restored input, so the applied-discount branch
    rests on its own render instrument.
  - Gates: challenger 31 files / 467 tests, `test:int` 43 files / 658 tests, `tsc` 0 (t31's two errors
    gone), scoped `eslint` clean. Residue: cart session cleared and re-read `null`, `addresses` 0.

- t33 completed (engineer): the version claim now comes from the record or is not shown. The chain at
  `orders/[id]/page.tsx:96-101` is `technicalSpecs.softwareVersion || undefined`, with the two ghost
  reads (`technicalSpecs.version`, `product.softwareSupport`) gone; `OrderDetailItem.softwareVersion`
  is now optional (`?: string`, previously a required `string` under a cast) and the cell renders the
  tag only with a value, otherwise the explicit honest statement **'Chưa khai báo'**; the description's
  version chip is gated on `technicalSpecs.softwareVersion` alone, so a software-type title can no
  longer stand in for a version (it keeps its own chip and label). `grep -rn "Tất cả phiên bản" web/src`
  = **0** across 412 files. Instruments in both directions: a render spec 3/3 (value renders, absence
  renders no claim, mixed orders correct) and a probe 7/7 that **cross-checks the chain against the
  schema's own field list** rather than a hardcoded one, with the negative control firing (old fallback
  restored → exit 1 naming the fabricated text and file; byte-identical revert `8e0823e5ed6e` → 7/7).
  Gates: spec 3/3, `tsc` 0, `lint` 0 errors, challenger **31 files / 467 tests**. Every other surface
  that prints version/format/size was enumerated and gates on the record.

- t32 completed (reviewer, verdict **pass**): all five findings of round 1 are closed on the artefact,
  in both directions. F1 — the reviewer's own run of the repaired probe exits 0 at 15 PASS / 0 FAIL
  **printing the node it read** (`.ant-select-content[title="Vietnam"]`), with the expectation pinned to
  the literal `VN` rather than "whatever leads the list", and its recorded failure run (form default
  `'US'`) exits 1 naming both sides, the mutated file restored to an identical sha256; the verifier's
  instrument independently fails under `--expect-default=US`. F2 — the verifier's report keeps its two
  bad runs as labelled instrument history and states they were its own defects; its corrected run
  matches the reviewer's measurement character for character, and no line implies a product failure.
  F4 — `addresses` count 0 by the reviewer's own SQL, round 1's row 27 gone. F5 — the guard test asserts
  the list's leading values, the live enum ordered by `enumsortorder`, the sanitized collection's
  options and the plugin source, with a recorded failure run (plugin block removed → exit 1 showing the
  plugin's silent 40-country fallback) and byte-identical restore. F3 — `lint` exit 0, 0 errors;
  `tsc` exit 0. **Decision 0015 re-issued pass**, with the unsolved restated and measured: countries
  outside the 48 are refused (`ZZ` → 400, no row), the admin create form has no `VN` default
  (source-read, not rendered), English labels on a Vietnamese-facing form are a storefront-vertical
  handoff, and the new guard protects the pair only when `test:int` runs — which is why the integration
  task's gate list includes it.

- t26 completed (reviewer, verdict **pass**) and t35 opened to carry its handoffs. Judged on the
  artefacts, not the status: the seller forms write no invented spec value; `TechnicalSpecsTable`
  gates every row on the record with none of the six literals left in `web/src`;
  `ProductDetailTabs` lost the checklist, modal, state and unused import; `product-detail.spec.tsx`
  asserts the honest contract with `queryByText(...).toBeNull()`, which a returned fallback fails;
  `Products/index.ts` has no diff (clause 4) and nothing was purged (clause 5: 165 products, 161 still
  carrying a `'… 2022+'` value). The reviewer's own boundary measurement: a browser drive with a real
  4 KiB `.dwg` uploaded and the version untouched produced
  `{"softwareVersion":"","fileFormat":".dwg","fileSize":"0.0 MB","unit":"metric"}` → 201 → SQL empty
  → deleted; a scratch version-less product rendered `.dwg` + `0.0 MB` with the `Phiên bản` row
  **omitted**. Four handoffs carried:
  - **R1 medium (now t33/t34/t35)** — the buyer order page's `'Phiên bản phần mềm'` column ended in the
    fabricated `'Tất cả phiên bản'`. The chain at `orders/[id]/page.tsx:96-101` read
    `technicalSpecs.version` and `product.softwareSupport` — **two fields no schema declares** — then
    fell back to the literal, so the literal was always what a buyer saw. Unreachable before this
    increment (the seller form always wrote a version) and **armed by our own write fix**, which is why
    it is repaired here rather than deferred.
  - **R2 low (folded into t33)** — `ProductDescription.tsx:143-146` showed a software-type title where a
    version belongs.
  - **R3 low** — the t22 inScope gap; the reopen is queued behind the engineer's current task.
  - **R4 low** — the intermittent challenger flake. Two signatures now recorded: `window is not
    defined` from an rc-component timer attributed to `login.spec.tsx` (first run exit 1, immediate
    re-run exit 0, `login.spec` 19/19 alone), and `checkout-payment-branches.spec.tsx` reporting
    `1 error` with all 464 tests passing (10/10 alone, suite clean on re-run). A gate that is
    intermittently red is a gate that will be ignored; both are follow-ups with their signatures.

- t28 completed (engineer, attempt 2): the cart's fabricated 10% voucher is gone and the instrument
  that proves it can now fail. Attempt 1 was recorded `failed` by its own author because the negative
  control would not fire — the assertion read a generic "label then any ₫" lookup that settled on the
  **subtotal row** instead of the total. Attempt 2 reads the total element itself
  (`.ant-statistic-content`) and the control fires: with the 10% discount restored the probe exits 1
  (`FAIL M3 — cart shows 288.000 ₫ vs records 320.000 ₫`), and after a byte-identical revert
  (sha1 `b081ac1edf45`) it exits 0 at 10/10. Green state: record **320.000 ₫** = cart **320.000 ₫** =
  checkout **320.000 ₫**; `tsc` 0; `lint` 0 errors; challenger 30 files / 464 tests. Disclosed: the
  cart is seeded through the app's own `sessionStorage` contract because the headless add-to-cart click
  did not register (t29 must try the real click and report what happens); `OrderSummaryCard`'s
  `discount` prop has no caller passing it; no coupon/voucher/discount/promo table exists.

- t31 completed (engineer-schema, repair round 2): the evidence layer is trustworthy and the tree is
  green. F1 — the probe now waits for `.ant-modal-wrap`, waits for the country field to paint a
  non-empty value, pins the default to the literal `VN` and **prints the node it read**; the selector
  is proven from the installed tree rather than assumed: antd 6.6.4 → `@rc-component/select@1.10.1`
  builds `ant-select-content` in `Content/SingleContent.js:88`, while `.ant-select-selection-item`
  exists only in `MultipleContent.js:43` (multiple/tag mode). Final run exit 0, 15/0; the sibling
  probe 32/0 on dev and 50/0 on the clone. F4 — residue gone (`addresses` 0 rows) and the
  create → SQL 1 → DELETE 200 → SQL 0 cycle re-demonstrated. F5 — new
  `web/tests/int/address-countries-single-source.int.spec.ts` (4 tests) asserts the live enum equals
  `SUPPORTED_COUNTRIES` as a set **and in `enumsortorder`**, that entry 0 is `VN`, that the sanitized
  `addresses` collection the API validates against serves the same 48 options in order, and that
  `web/src/plugins/index.ts` still hands the list over. **Both negative controls fired and were
  reverted byte-identically**: form default `'US'` → probe exit 1 naming
  `"United States" (expected "Vietnam")`; `supportedCountries` block removed → spec exit 1 showing the
  plugin's silent 40-country fallback (`[ 'US','GB',… ]` vs `[ 'VN','TH',… ]`). Gates: `test:int`
  43 files / 658 tests, `tsc` 0, `lint` 0 errors. Recorded side effect: `kientaohub_test` was at phase
  13 (40 labels) and is now migrated to phase 14 (48, batch 5) so the new gate can run; an unmigrated
  test database fails the gate loudly instead of skipping.

- t24 completed (verifier, 9/9): independent instruments, never the authors' probes. ENUM 48 = LIST 48
  with an empty symmetric difference and a self-test proving the comparator can fail; the migration
  exercised on the verifier's own clone (down → 40 → apply → 48, a working `VN` insert, and the
  negative control firing: `down` with a `VN` row present refuses and leaves the enum and row intact);
  the browser default measured as `.ant-select-content[title="Vietnam"]` with
  `--expect-default=US` failing by design; a `VN` address saved through the form (201 → SQL read-back →
  deleted) and `ZZ` refused at 400; the six fabricated literals absent on both an empty-specs and a
  filled product with `--mutate-literals` making the instrument fail; the seller form driven **and**
  intercepted (body `softwareVersion: ""` → 201 → SQL empty); revenue 0.30 → 70, mutate 0.25 → 75,
  restore re-read 0.30 → 70. Its two earlier false FAILs are kept as instrument history and labelled
  as such, which is exactly what review t25's F2 demanded. Residue cleaned and re-read
  (`addresses` = 0, `default_rate` = 0.30, clone dropped). Gates it ran: `test:int` 43 files / 658
  tests, challenger 30 files / 464 tests, `eslint .` 0 errors, sweep 40/0 — and tree-wide `tsc`, red
  while t31's guard test was mid-write, is green again as of this entry.

- t23 completed (auditor): report `.lit/evidence/auditor-t23/REPORT-t23-revenue-share-and-loyalty.md`
  — 24 percentage display strings enumerated, 1 derived site and 0 literals for the commission rate;
  18 loyalty regexes over `web/src` and an 883,618-byte `pg_dump --data-only` with 0 loyalty displays
  and 0 database matches; `/wallet` and `/login` rendered, the D36 card and the D43 block absent.
  One residual nit reported: an unused `Coins` icon import at `login/LoginBanner.tsx:2`.

- t25 completed as **needs_revision** (reviewer, round 1): the product change is judged complete and
  was re-verified by the reviewer itself (48-entry list identical in order and label to the plugin's
  defaults; migration registered last, atomic swap under Payload's `initTransaction → commit`, `down`
  restoring the initial migration's exact order; dev DB left migrated at enum 48 / batch 16; render
  measured as `title="Vietnam"`, the dropdown in the intended order, a 201 carrying
  `{"country":"VN"}` and a `KR` refusal at 400). The failure is the **evidence layer**:
  - **F1 medium** — the country task's own probe reads `.ant-select-selection-item`, which the
    installed antd replaced with `.ant-select-content`, and never opens the modal, so it reports a
    false FAIL on a correct product.
  - **F2 medium** — the verifier's browser probe has the same defect, already recorded in its
    `address-run1/2.log` (`"" vs Vietnam`, `POST responses: []`); its report must not carry a product
    failure. The reviewer sent the DOM fact; the captain directed the verifier to fix the selector and
    correct the report.
  - **F3 low** — tree-wide `eslint .` exits 1 on the verifier's in-flight probe
    (`probe-verify-vn-and-attributes.mts:224 prefer-const`); the task's own files are clean scoped.
  - **F4 low** — a leftover probe address (id 27) whose cleanup never ran.
  - **F5 (gap)** — nothing pins the list↔enum pair or "entry 0 is `VN`", so dropping the plugin's
    config line would silently return the API and admin to 40 countries while the forms keep 48.
  Repair is **t31** (contract amended by the captain to carry F1/F4/F5 plus the tree-lint report) and
  re-review is **t32** (criteria amended to judge each finding's closure, including whether the
  verifier's report stopped carrying a product failure). Unsolved-but-accepted, restated with
  reachability: countries outside the 48 are refused (decision 0015's tradeoff), the admin create form
  has no `VN` default (source-read, not rendered), and country labels are English on a
  Vietnamese-facing form — handed to the storefront vertical as a UX/product item, not a data defect.

## Evidence rules for this increment

- A probe that cannot fail is not evidence: every instrument ships a negative control or a mutation.
- Rendered measurements name the URL, the selector and the database value compared against.
- `MATCHES` certifies the contract, never the render: a green probe does not close a display finding.
- Store owners' data is not mutated without a recorded restore: the settings mutation in t3 and any
  scratch product in t2/t4 must be restored or deleted, and the restore must be shown.

## Validation

_(evidence from this cycle only; filled at integration)_
