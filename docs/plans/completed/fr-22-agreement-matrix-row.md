# Execution Plan: FR-22 R3-1 — agreement-matrix row for published-but-unapproved products

Date: 2026-09-18

## Status

Completed — R3-1 closed with a test-only change, independently verified (`t11` PASS 6/6),
reviewed `pass` (`t12` round 4, whose only finding R4-1 is closed by this commit), and
integrated in the commit that introduces this record. Not pushed. The structural-guard
proposal and F2/F4/F5 remain open by owner choice.

## Outcome

Close review finding **R3-1**: add one row to the agreement matrix whose fixture is
`_status = 'published'` **and** `moderationStatus != 'approved'`, so a future rule that
narrows on `moderationStatus` in the page's non-preview branch stops passing silently.
The row must be green on today's code and must go red under the `N3` mutation.

## Context

- Finding source: `t9` (round-3 review), which measured `N3` — an extra
  `moderationStatus = 'approved'` condition in the non-preview branch — leaving the four
  existing agreement tests **passing**.
- `docs/decisions/0010-product-report-policy.md` — the three owner policies; its
  Follow-Up currently lists R3-1 as open.
- `docs/plans/completed/fr-22-visibility-single-source.md` — the R1/R2 increment and the
  evidence that made the matrix behavioural.
- `web/src/utilities/storefrontVisibility.ts` is the single owner of the visibility rule;
  `web/tests/int/product-report-agreement.int.spec.ts` renders the real page through the
  real `draftMode()` branch and drives the real route on the same fixtures.
- Prior commits, all on `main` and **not pushed**: `ebaac32` (FR-22 feature), `7647e95`
  (F1+F3), `3b38d03` (R1+R2, HEAD at the halt).

## Scope

In scope (task `t10`): `web/tests/int/` only.

Out of scope: `web/src/**` (a failing row is a product decision for the owner, never a
test edit), `web/tests/e2e/`, `web/tests/helpers/**`, `web/playwright.config.ts`,
`.github/**`, `docs/**`, `PLAN.md`, migrations, `git add`/`commit`/`push`.

## Approach

Fourth cycle of the `fr22-product-reports` team, same roster:

1. `t10` — repair, assignee `engineer`: the new matrix row + its fixture + cleanup.
2. `t11` — independent verification, assignee `verifier`, depends on `t10`: confirm by
   SQL that the fixture really is published-but-unapproved, and reproduce the `N3`
   mutation on a `/tmp` scratch copy so the new row goes red.
3. `t12` — review round 4, assignee `reviewer`, depends on `t11`, judging `t10`.

After a `pass` verdict the captain commits `web/tests/int/` (no push), removes R3-1 from
ADR 0010's Follow-Up, and moves this file to `docs/plans/completed/`.

## Risks And Recovery

- **A tautological row** — asserting the fixture's own values instead of driving both
  surfaces would satisfy the diff and close nothing. `t11` must show the row is red
  under `N3`.
- **A failing row on today's code** — that would mean the drift is already real; the
  engineer must stop and report rather than edit `web/src/**`.
- **Fixture residue** — the new fixture must be deleted in `finally`; the e2e lifecycle
  is locked and `kientaohub_test` must be left clean.
- **Recovery from this halt** — the working tree holds an uncommitted, unverified,
  incomplete edit to `web/tests/int/product-report-agreement.int.spec.ts`
  (+14/−2, attempt 1 of `t10`, interrupted). On resume, either the engineer finishes
  that row or the owner authorizes reverting it. Nothing else is half-done: HEAD
  `3b38d03` contains only verified, reviewed work, and no task was cancelled.

## Progress

- [x] Owner selected R3-1 as the increment.
- [x] Chain staged: `t10` → `t11` → `t12`.
- [x] `t10` repair complete (attempt 2; attempt 1 was interrupted mid-edit and left the
  fixture assigned but undeclared — the broken intermediate state is gone). Test-only:
  one in-scope file, `web/tests/int/product-report-agreement.int.spec.ts`
  (+76/−2, the two deletions helper-internal, no assertion removed). The new row
  `R3-1: a published product that is not moderation-approved is still shown and still
  reportable` pins its fixture's DB state by raw SQL (`_status='published'`,
  `moderation_status='submitted'`) before asserting both real surfaces: page SSR
  (`outcome === 'rendered'`, html contains `id="report-section"`) and route (`201` with
  `case.status='OPEN'`, then `409 DUPLICATE_REPORT`). Green today — `test:int` 591 tests
  (exactly +1 vs 590), spec 5/5. Drift proof executed on a scratch copy with the `N3`
  mutation: `× R3-1 … expected 'notFound' to be 'rendered'`, `1 failed | 4 passed`, i.e.
  the four `_status`-only rows still pass while the new row catches the narrowing.
  Gates: int 33 files / 591 · challenger 101 · lint 0 errors · build exit 0 ·
  `test:e2e` 60 passed.
- [x] `t11` independent verification complete — **PASS, 6/6, 0 FAIL** (attempt 1,
  verifier; `.lit/evidence/verifier-t11-REPORT.md`). The row was observed running
  (`✓ R3-1 … 106ms`; spec 5 tests; `test:int` 33 files / 591, exactly +1 over 590), and a
  sampler polling `kientaohub_test` during the run caught the live fixture row
  `1525|fr22-agreement-published-unapproved-…|published|submitted` — the pinned pair,
  verified outside the test's own word. Post-run residue for the fixture: 0 products /
  0 users / 0 cases. Drift reproduced by the verifier's own mutations on a scratch copy
  (workspace md5s identical before and after): `N3` (page non-preview branch tightened to
  `moderationStatus='approved'`) → exit 1 with **exactly one** failure,
  `× R3-1 … expected 'notFound' to be 'rendered'`, while the four `_status`-only rows stay
  green; `N3b` (the same tightening applied to the route instead) → exit 1 again with
  exactly the R3-1 row, `expected 404 to be 201` while the page rendered — so the row
  pins both surfaces rather than one. Gates: int 33 files / 591 · challenger 101 ·
  lint 0 errors · build exit 0 · `test:e2e` 60 passed with fixture identities and
  `seller-asset-*` back to 0.
- [x] `t12` review round 4 verdict **pass** (attempt 1) with one low finding —
  **R4-1**, a captain documentation action, not a defect in `t10`. The reviewer confirmed
  the row is not a tautology (`spec:330-371`: raw-SQL fixture proof at `:336-339`, real
  page render at `:342-344`, real `POST` at `:346-368`, agreement invariant at `:370`),
  that `t11`'s mutation evidence is the verifier's own (`verifier-t11-mutate_r3.py`), and
  reproduced both mutations itself on a fresh scratch tree: `K0` 5 passed,
  `K1` (`N3`, page) `1 failed | 4 passed` with only R3-1 red, `K2` (`N3b`, route)
  `1 failed | 4 passed` with only R3-1 red. Its own psql sampler caught the live fixture
  row `1743|fr22-agreement-published-unapproved-…|published|submitted`, and after
  `test:int` plus a standalone run plus three scratch runs the residue was
  `agreement_products=0`, `fr22_users=0`, `moderation_cases=0`. Scope clean: the only
  tracked change is the agreement spec (76 insertions / 2 deletions, both deletions
  helper-internal, 0 `expect` lines removed); its own `test:int` was 33 files / 591.
  It recorded the honest boundary: the matrix pins one second-column value, so a
  condition excluding some *other* pair would still escape.
- [x] R4-1 (captain-owned): ADR 0010 no longer lists R3-1 as open; the shipped row and
  its boundary are recorded under Tradeoffs, and the structural guard plus F2/F4/F5 stay
  under Follow-Up.
- [x] Captain committed the in-scope paths (no push) and moved this plan to completed.

## Decisions

- 2026-09-18: the increment is test-only; `web/src/**` stays out of scope so a red row
  surfaces as a product question instead of being silenced.
- 2026-09-18: the row must be proven drift-sensitive by the verifier's own `N3`
  mutation, not by argument.

## Validation

- Focused proof: the new matrix row, plus the verifier's SQL check of the fixture state
  and its `N3` mutation run on a scratch copy.
- Repository-required checks: `test:int`, `test:challenger`, `lint` (0 errors),
  `build` (exit 0), `test:e2e` with the fixture-residue check.

## Result

Completed 2026-09-18. R3-1 is closed, independently verified, reviewed `pass`, and
integrated in the commit that introduces this record; **not pushed**.

What changed: one test file plus this record and ADR 0010.

- `web/tests/int/product-report-agreement.int.spec.ts` (+76/−2; the two deletions are
  helper-internal — the `mkProduct` signature and its `moderationStatus` default — with
  0 `expect` lines removed) — the new row
  `R3-1: a published product that is not moderation-approved is still shown and still
  reportable` proves its fixture by raw SQL (`_status='published'`,
  `moderation_status='submitted'`, not `approved`) and then drives both real surfaces:
  page SSR (`rendered` + `id="report-section"`) and route (`201` with `case.status='OPEN'`,
  then `409 DUPLICATE_REPORT`), plus the row's agreement invariant.

Evidence:

- Green today without touching `web/src/**`: agreement spec 5/5; `test:int` 33 files /
  591 tests, exactly +1 over 590.
- Drift caught, measured three times independently (implementer, verifier, reviewer) on
  scratch copies with the workspace md5s unchanged: mutation `N3` (page's non-preview
  branch narrowed to `moderationStatus='approved'`) → exactly one failure,
  `× R3-1 … expected 'notFound' to be 'rendered'`, the four `_status`-only rows still
  green; mutation `N3b` (the same narrowing on the route) → again exactly R3-1,
  `expected 404 to be 201` while the page rendered. The escape that survived rounds 2 and
  3 is now caught, and the row pins both surfaces.
- Fixture proven from outside the test process by two independent psql samplers
  (`1525|…|published|submitted` and `1743|…|published|submitted`), with zero residue
  afterwards.
- Gates: `test:int` 33 files / 591 · `test:challenger` 101 · `lint` 0 errors (warning
  count unchanged) · `build` exit 0 · `test:e2e` 60 passed with 12 fixture identities and
  `seller-asset-*` back to 0.

Limitations — measured, not inferred:

- The matrix pins one second-column value; a condition that excluded some *other* pair
  would still escape. That residual is what the structural guard would cover, and it
  needs accepted authority first.
- The SQL samplers are polls, not hooks; the causal link rests on the `N3`/`N3b` runs.
- Not verified: a genuinely simultaneous concurrent report race, the CI e2e branch
  (`retries=3`, `workers=1`), the `/admin` UI in a browser, browser hydration, and e2e
  coverage of the R3-1 row.

Follow-ups not in this increment: the optional structural guard, **F2** (e2e assertion
for `#report-section`), **F4** (`migrate:down` of `phase9_tickets`), **F5** (redact the
inert JWT in `.lit/evidence/`). ADR 0010 records R3-1 as shipped and keeps these open.
