# Execution Plan: FR-22 review follow-ups (F1 + F3)

Date: 2026-09-18

## Status

Completed — F1 and F3 closed, independently verified (`t5` PASS 7/7), reviewed
`pass` (`t6` round 2, findings R1–R3 low), and integrated in the commit that
introduces this record. Not pushed. R1/R2/F2/F4/F5 remain open by owner choice.

## Outcome

Two measured gaps on the shipped FR-22 report surface are closed:

- **F1** — the report route's failure branches are covered by tests that fail if the
  branch is removed: a non-duplicate `payload.create` failure returns `500` (never
  `201`/`409`, and writes no case), and a create failure while another open case for
  the same `(reporter, product)` exists returns `409 DUPLICATE_REPORT`.
- **F3** — the report route resolves only `_status = 'published'` products, so an
  unpublished product returns a `404` byte-identical to an unknown product when probed
  by id or by slug. The enumeration channel (draft `201`/`409` versus unknown `404`) is
  closed without changing behaviour for published products.

## Context

- `docs/plans/completed/fr-22-product-reports.md` — the delivered FR-22 increment, its
  gate evidence, and the five findings (F1–F5) with the limitation list.
- `docs/decisions/0010-product-report-policy.md` — the three owner policies this repair
  must not change: authenticated-only, no automatic status/visibility change, and one
  open case per `(reporter, product)` with `409` plus the partial unique index.
- Finding locations: F1 `web/src/app/api/v1/products/[id]/reports/route.ts:258` (the
  post-failure re-read branch); F3 `.../route.ts:25` (`resolveProductId`).
- Canonical storefront visibility rule:
  `web/src/app/(app)/products/[slug]/page.tsx:249-274` filters
  `_status: { equals: 'published' }` unless the page's own draft preview is on. The
  report route does not enable draft preview, so drafts are simply not reportable.
- `web/AGENTS.md` warns that this Next.js version differs from training data and that
  the relevant guide under `web/node_modules/next/dist/docs/` must be read first.
- Fixture lifecycle is locked (`f6fa88d`, `0affeac`, `779d855`): new tests clean up
  after themselves and the e2e run must end with 0 fixture residue.

## Scope

In scope (task `t4`):

- `web/src/app/api/v1/products/[id]/reports/route.ts` — the visibility filter and, if
  a seam is needed for the failure-branch tests, that seam.
- `web/tests/int/` — the F1 and F3 tests.

Out of scope:

- **F2** (assert `#report-section` in the committed e2e suite), **F4** (`migrate:down`
  of `phase9_tickets`), **F5** (redact the JWT in `.lit/evidence/`) — not selected.
- `web/tests/e2e/`, `web/tests/helpers/**`, `web/playwright.config.ts`, `.github/**`,
  `docs/**`, `PLAN.md`, `web/src/migrations/`, `web/src/payload.config.ts`,
  `web/src/payload-types.ts`, `web/src/collections/Products/**`, the money path.
- No schema change; the partial unique index stays exactly as shipped.
- No `git add`/`commit`/`push` by members.

## Approach

Dependency chain inside the existing `fr22-product-reports` team, same roster:

1. `t4` — repair, assignee `engineer`: F3 filter plus F1 branch tests.
2. `t5` — independent verification, assignee `verifier`, depends on `t4`. Must prove
   the F1 tests are not tautological by neutralising the branch **in a scratch copy of
   the repository under `/tmp`** (never the workspace) and observing the tests go red,
   and must prove the two `404` bodies are identical by literal comparison for both the
   id and slug paths.
3. `t6` — review round 2, assignee `reviewer`, depends on `t5`, judging `t4`.

Gate commands (from the repository root):

```text
pnpm --prefix web test:int
pnpm --prefix web test:challenger
pnpm --prefix web lint
pnpm --prefix web build
pnpm --prefix web test:e2e
```

After a `pass` verdict the captain commits the in-scope paths (no push) and moves this
file to `docs/plans/completed/`.

## Risks And Recovery

- **Tautological F1 tests** — the main risk: a test that asserts the same constant the
  route returns proves nothing. Mitigated by requiring mutation evidence from the
  verifier on a scratch copy, not an argument.
- **Over-filtering** — a `_status` filter could block reportable published products or
  interfere with the storefront preview flow. Mitigated by aligning exactly with the
  storefront rule and by re-proving `201`/`409` for published products.
- **Residue** — new fixtures (an unpublished product for the F3 probe) must be removed
  in `finally`, and the e2e run must still end with 0 fixture identities.
- Recovery: the change is confined to one route plus tests; revert those paths and the
  shipped FR-22 behaviour returns. No migration, so no data recovery is involved.

## Progress

- [x] Owner selected F1 + F3 as the increment; F2/F4/F5 recorded as not selected.
- [x] Chain staged: `t4` → `t5` → `t6` (repair, verification, review round 2).
- [x] `t4` repair complete (attempt 1, engineer) — only
  `web/src/app/api/v1/products/[id]/reports/route.ts` (23 insertions / 8 deletions)
  and `web/tests/int/product-reports.int.spec.ts` (284 / 0, strictly additive).
  `resolveProductId` now resolves through
  `and: [{ id | slug }, { _status: { equals: 'published' } }]`; the F1 branches are
  covered by `F1a` (500, no row) and `F1b` (409, exactly one row). Self-reported gates:
  `test:int` 586 tests (+5) · challenger 101 · lint 0 errors · build exit 0 ·
  `test:e2e` 60 passed.
- [x] `t5` independent verification complete — **PASS, 7/7, 0 FAIL**
  (attempt 1, verifier; `.lit/evidence/verifier-t5-REPORT.md`).
  The verifier reproduced the mutation runs itself on a scratch copy
  (`/tmp/fr22-scratch`, workspace route md5 unchanged): removing the post-failure
  re-check reddens `F1b`; ignoring its result also reddens `F1b` on the behavioural
  assertion; making every create failure `409` reddens `F1a`; removing the visibility
  filter reddens `F3a`/`F3b` with `expected 201 to be 404` — the enumeration channel was
  real. F3 was probed over real HTTP with the verifier's own fixtures: all five
  unpublished states return `404` by id and by slug, with a body byte-identical to the
  unknown-product `404`, and zero cases written; the published fixture still returns
  `201` then `409`.
  Measured limitation: `F3c`'s assertion is a source-text comparison and is **not**
  mutation-sensitive (it stayed green when the filter was removed); F3 detection rests
  on the behavioural `F3a`/`F3b`. That is one of the points `t6` must rule on.
- [x] `t6` review round 2 verdict **pass** (attempt 1) with three low, non-blocking
  findings R1–R3. The reviewer confirmed F1 is non-tautological (it read the handler
  stack in its own `test:int` log and re-computed the route md5 as
  `a8cd3300fad56212a7b36ea926757847`, matching the verifier's snapshot), confirmed the
  t5 mutation evidence is the verifier's own (`verifier-t5-mutate_route.py`, mutant D
  that the implementer never claimed), and confirmed the spec is strictly additive
  (`284/0`, no `.skip/.only/.todo`, int 581 → 586).
  **R1** — `F3c` binds page↔route by substring only; the reviewer measured on a `/tmp`
  copy that tightening the page rule while keeping the literal still passes, so the two
  copies can drift undetected. Fix: single-source the rule and assert agreement
  behaviourally.
  **R2** — the draft-preview page still renders the report entry point whose `POST` now
  answers `404` (`web/src/app/(app)/products/[slug]/page.tsx` + the route filter); hide
  it when `draftMode().isEnabled`.
  **R3 (captain-owned)** — ADR 0010 still documented drafts as reportable and F3 as
  open; corrected in this commit.
- [x] Captain committed the in-scope paths (no push) and moved this plan to completed.

## Decisions

- 2026-09-18: F3 is closed by filtering `_status = 'published'`, the storefront's own
  visibility rule, rather than by inventing a report-specific rule; unreportable
  products answer exactly like nonexistent ones so the route leaks nothing.
- 2026-09-18: F1 is closed with behaviour tests that must be mutation-proven, because
  the branch under test is exactly the one the review found untested.
- 2026-09-18: the repair runs as `kind=repair` against `t1` with `sourceFindingIds`
  `F1`, `F3`, so the follow-up stays traceable to the review that produced it.

## Validation

- Focused proof: the new F1 and F3 tests, plus the verifier's mutation run on a scratch
  copy and its literal comparison of the two `404` bodies.
- Integration or end-to-end proof: full `test:e2e` run with the fixture-residue check.
- Repository-required checks: `test:int`, `test:challenger`, `lint` (0 errors),
  `build` (exit 0).

## Result

Completed 2026-09-18. F1 and F3 are closed, independently verified, reviewed
`pass`, and integrated in the commit that introduces this record; **not pushed**.

What changed: one route and one spec.

- `web/src/app/api/v1/products/[id]/reports/route.ts` (+23/−8) —
  `resolveProductId` resolves through
  `and: [{ id | slug }, { _status: { equals: 'published' } }]`, so an unpublished
  product takes the same `404` branch as an unknown one; the F1 failure branches are
  unchanged in behaviour and now tested.
- `web/tests/int/product-reports.int.spec.ts` (+284/−0, strictly additive) — `F1a`
  (injected non-duplicate create failure → `500 INTERNAL_ERROR`, one create attempt,
  zero rows), `F1b` (race winner seeded, first lookup blinded, failure injected →
  `409 DUPLICATE_REPORT`, one row kept), and `F3a`/`F3b`/`F3c`.

Evidence:

- Verifier (own runs, scratch copy `/tmp/fr22-scratch`, workspace route md5 unchanged):
  four mutants redden the right test — re-check removed → `F1b` red; re-check ignored →
  `F1b` red on the behavioural assertion; every failure mapped to `409` → `F1a` red;
  filter removed → `F3a`/`F3b` red with `expected 201 to be 404`. Over real HTTP with
  its own fixtures, all five unpublished states returned `404` by id **and** slug with
  a body byte-identical to the unknown-product `404` and zero cases written; the
  published fixture still returned `201` then `409`.
- Gates: `test:int` 32 files / 586 tests · `test:challenger` 101 · `lint` 0 errors ·
  `build` exit 0 · `test:e2e` 60 passed with 12 fixture identities and
  `seller-asset-*` back to 0.
- Reviewer round 2: `pass`, plus its own drift experiment on a `/tmp` copy and a
  re-computed route md5.

Limitations — measured, not inferred:

- `F3c` is a source-text comparison and is **not** mutation-sensitive; F3 detection
  rests on the behavioural `F3a`/`F3b` (R1).
- The visibility rule exists in two copies (route and product page) and can drift
  without a red test (R1).
- Draft preview still shows a report entry point that will `404` (R2).
- Not verified: a genuinely simultaneous double-POST race, the CI e2e branch
  (`retries=3`, `workers=1`), the `/admin` UI in a browser, and a `404` timing side
  channel.

Follow-ups not in this increment: **R1**, **R2** (both need a new change), **F2**
(e2e assertion for `#report-section`), **F4** (`migrate:down` of `phase9_tickets`),
**F5** (redact the inert JWT in `.lit/evidence/`). ADR 0010 was corrected in this
commit to record that F3 shipped, and now lists R1/R2/F2/F4/F5 under its Follow-Up.
