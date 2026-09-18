# Execution Plan: FR-22 round-3 repair — single-sourced visibility + draft-preview entry point

Date: 2026-09-18

## Status

Completed — R1 and R2 closed, independently verified (`t8` PASS 8/8), reviewed
`pass` (`t9` round 3: findings R3-1, R3-2, plus one proposal), and integrated in
the commit that introduces this record. Not pushed. R3-1 and the structural-guard
proposal remain open by owner choice, alongside F2/F4/F5.

## Outcome

- **R1** — the storefront visibility rule has exactly one owner (a shared module).
  Both the report route and the product-detail page import it, no literal copy remains
  in either consumer, and a **behavioural** agreement test ties the two surfaces: a
  product the storefront shows is reportable, a product the storefront hides is not.
  The test is drift-sensitive, which the round-2 review measured the previous assertion
  was not.
- **R2** — the product page stops rendering the report entry point while it is in
  draft-preview mode, so a previewing user no longer sees a control whose `POST` now
  answers `404`. The decision is made on the server from `draftMode().isEnabled`, never
  by hiding on the client.

## Context

- `docs/plans/completed/fr-22-review-followups.md` — the F1/F3 increment, its evidence,
  and where R1/R2 were recorded.
- `docs/decisions/0010-product-report-policy.md` — the three owner policies and the
  Tradeoffs/Follow-Up entries that name R1 and R2 as open.
- The duplication R1 targets: `storefrontVisibilityWhere()` in
  `web/src/app/api/v1/products/[id]/reports/route.ts:35` and the non-preview branch of
  `queryProductBySlug` in `web/src/app/(app)/products/[slug]/page.tsx:249-274`.
- The drift measurement from `t6`: with only the page mutated to a stricter rule that
  keeps the same literal, the existing `F3c` assertion **stayed green**; it binds the
  two copies by substring only.
- `web/src/utilities/home-static.ts:6` also contains `_status: 'published'`, but it is a
  seed-data literal for a `pages` document, not a copy of the visibility rule, and must
  not be folded in.
- Draft-preview plumbing exists: `web/src/app/(app)/next/preview/route.ts` and
  `web/src/app/(app)/next/exit-preview/route.ts`; the page already calls `draftMode()`
  in `queryProductBySlug` (`page.tsx:250`).
- `web/AGENTS.md` warns that this Next.js version differs from training data; the
  relevant guide under `web/node_modules/next/dist/docs/` must be read before editing.

## Scope

In scope (task `t7`):

- A shared module under `web/src/utilities/` that owns the visibility rule.
- `web/src/app/api/v1/products/[id]/reports/route.ts` — import it, drop the local copy.
- `web/src/app/(app)/products/[slug]/page.tsx` — import it, and do not render the report
  entry point in draft-preview mode.
- `web/src/components/product/` — only if the entry point needs a flag threaded.
- `web/tests/int/` — the R1 agreement/drift test and the R2 test.

Out of scope:

- **F2** (assert `#report-section` in the committed e2e suite), **F4**
  (`migrate:down` of `phase9_tickets`), **F5** (redact the inert JWT in `.lit/evidence/`)
  — not selected by the owner.
- `web/tests/e2e/`, `web/tests/helpers/**`, `web/playwright.config.ts`, `.github/**`,
  `docs/**`, `PLAN.md`, `web/src/migrations/`, `web/src/payload.config.ts`,
  `web/src/payload-types.ts`, `web/src/collections/Products/**`, `web/src/services/`,
  the money path.
- No schema change; the rule itself is not redefined, only relocated and shared.
- No client-side hiding of the entry point.
- No `git add`/`commit`/`push` by members.

## Approach

Third cycle of the same `fr22-product-reports` team, same roster:

1. `t7` — repair, assignee `engineer`: single-source the rule, import it in both
   consumers, gate the entry point on server-side draft mode, add the tests.
2. `t8` — independent verification, assignee `verifier`, depends on `t7`. Must run the
   drift experiment itself on a `/tmp` scratch copy (changing the shared rule must
   redden the agreement test), grep for remaining copies, and produce its own HTML
   evidence for the draft-preview case.
3. `t9` — review round 3, assignee `reviewer`, depends on `t8`, judging `t7`.

Gate commands (from the repository root):

```text
pnpm --prefix web test:int
pnpm --prefix web test:challenger
pnpm --prefix web lint
pnpm --prefix web build
pnpm --prefix web test:e2e
```

After a `pass` verdict the captain commits the in-scope paths (no push), corrects ADR
0010 so R1/R2 are recorded as shipped rather than open, and moves this file to
`docs/plans/completed/`.

## Risks And Recovery

- **Cosmetic single-sourcing** — moving the literal into a module while each consumer
  re-wraps it in its own condition would satisfy a grep and defeat the point. The
  reviewer must check that the module is the actual decision owner.
- **A drift test that is not drift-sensitive** — the failure mode R1 exists to fix. The
  verifier must reproduce the round-2 drift experiment, not accept an argument.
- **Client-side hiding** — a CSS/JS hide would leave the control in the HTML and still
  reachable. R2 requires server-side gating, proven from rendered HTML.
- **Preview plumbing needs a secret** — if the verifier cannot honestly enable draft
  mode, the R2 claim must be reported as unverified rather than inferred; the
  component-level render test is the fallback evidence, and the report must say which
  one was used.
- **Probe residue** — any fixture the verifier creates (unpublished product, session,
  case) must be deleted in `finally`; `test:e2e` must still end with 12 fixture
  identities and `seller-asset-*` at 0.
- Recovery: confined to a shared utility plus two consumers and tests; reverting those
  paths restores the previous behaviour with no data implications.

## Progress

- [x] Owner selected R1 + R2; F2/F4/F5 stay open by choice.
- [x] Chain staged: `t7` → `t8` → `t9` (repair, verification, review round 3).
- [x] `t7` repair complete (attempt 1, engineer) — five in-scope files: new
  `web/src/utilities/storefrontVisibility.ts`, modified
  `web/src/app/api/v1/products/[id]/reports/route.ts` (`:9` import) and
  `web/src/app/(app)/products/[slug]/page.tsx` (`:11` import), new
  `web/tests/int/product-report-agreement.int.spec.ts` (4 tests), modified
  `web/tests/int/product-reports.int.spec.ts`.
  `grep -rn "_status: { equals: 'published' }" web/src/` now hits only the owner module;
  the one other hit (`web/src/app/(app)/[slug]/page.tsx:100`) queries the CMS `pages`
  collection and is not this rule. The agreement spec renders the real page through the
  real `draftMode()` branch and drives the real route on the same fixtures —
  `published: page=rendered route=201 | draft, submitted, in_review, changes_requested,
  rejected: page=notFound route=404` — with no source-substring evidence.
  Drift was proven by executed mutations on scratch copies: rule mutated → red, route
  usage mutated → red, page usage mutated → red, R2 gate removed → red.
  Gates: `test:int` 33 files / 590 tests (+4) · challenger 101 · lint 0 errors ·
  build exit 0 · `test:e2e` 60 passed.
- [x] R2 proven live through the real preview route by the implementer: preview cookie →
  the draft product returns `200` with zero `id="report-section"`; after exit-preview the
  same slug returns `404`; the published slug returns `200` with exactly one section.
  **Independent reproduction is what `t8` still owes.**
- [x] `t8` independent verification complete — **PASS, 8/8, 0 FAIL** (attempt 1,
  verifier; `.lit/evidence/verifier-t8-REPORT.md`). The verifier reproduced the drift
  experiment with **its own** four mutations on a `/tmp` scratch copy (workspace md5s
  recorded identical before and after): owner rule emptied → red
  (`expected 201 to be 404`); owner rule inverted → red
  (`page for published: expected 'notFound' to be 'rendered'`); page drops the
  draft-preview option → red; page reverts to a bespoke inline clause → red. Its grep
  confirms the literal survives only in the owner module and in the unrelated CMS
  `pages` query. R2 was proven through the real preview entry points with no mocks: a
  moderator session drives `/next/preview` → `307` + `__prerender_bypass`, and with that
  cookie the unpublished product renders (`200`, draft slug present twice — draft mode
  genuinely active) while `id="report-section"` count is `0`; `/next/exit-preview`
  restores the published page with exactly one section. The absence is in
  server-rendered HTML, so a client-side hide is excluded.
  Gates: `test:int` 33 files / 590 tests · challenger 101 · lint 0 errors · build exit 0
  · `test:e2e` 60 passed with fixture identities and `seller-asset-*` back to 0.
- [x] `t9` review round 3 verdict **pass** (attempt 1) with two low findings and one
  proposal. The reviewer enumerated all 26 deleted lines in the old spec: exactly three
  `expect(...)` and all three are the `toContain` source checks that R1b ordered
  replaced — **zero** `.toBe()` removed, `F1a`/`F1b`/`F3a`/`F3b` untouched, no
  `.skip/.only/.todo`, int 586 → 590 (+4 = the new file). It also ran its own drift
  experiments: `V1a`/`V1b` (owner rule mutated) → red on the per-state policy
  assertions; `V3`/`V4` (consumer drops the clause) → red on the preview render; `N1`
  (unconditional consumer-side extra condition) → red via the R2 tests only; and
  **`N3`** — the faithful round-2 analogue, an extra `moderationStatus = 'approved'` in
  the non-preview branch only — **4 passed, so that drift escapes**, which is finding
  **R3-1**. It confirmed M2-green is honest (M2 leaves the page's decision unchanged
  because the products read rule already hides unpublished rows, while M2b with
  `overrideAccess: true` goes red), so the agreement suite keeps its meaning.
- [x] R3-2 (captain-owned): ADR 0010's Tradeoffs and Follow-Up no longer claim the rule
  lives in two places or that draft preview still renders the entry point; R1/R2 are
  recorded as shipped, and R3-1 plus the structural-guard proposal are recorded as open.
- [x] Captain committed the in-scope paths (no push) and moved this plan to completed.

## Decisions

- 2026-09-18: the rule moves to `web/src/utilities/` as the single owner and both
  consumers import it; the rule itself is unchanged, because changing it is a product
  decision, not a refactor.
- 2026-09-18: the page↔route agreement must be asserted **behaviourally** and must be
  drift-sensitive, because the round-2 review measured that the substring assertion
  survived a stricter page rule.
- 2026-09-18: the draft-preview gate is server-side (`draftMode().isEnabled`), not a
  client hide, so the control is absent from the HTML rather than merely invisible.
- 2026-09-18: `web/src/utilities/home-static.ts` is explicitly excluded — its
  `_status: 'published'` is seed data, not the visibility rule.

## Validation

- Focused proof: the R1 agreement test and the R2 render test, plus the verifier's own
  drift experiment and HTML evidence.
- Integration or end-to-end proof: full `test:e2e` run with the fixture-residue check.
- Repository-required checks: `test:int`, `test:challenger`, `lint` (0 errors),
  `build` (exit 0).

## Result

Completed 2026-09-18. R1 and R2 are closed, independently verified, reviewed `pass`,
and integrated in the commit that introduces this record; **not pushed**.

What changed: five product files plus this record and ADR 0010.

- New `web/src/utilities/storefrontVisibility.ts` — the single owner of the storefront
  visibility rule (`storefrontVisibilityWhere` + `storefrontProductWhere`, with the
  draft-preview exemption inside the module).
- `web/src/app/api/v1/products/[id]/reports/route.ts` and
  `web/src/app/(app)/products/[slug]/page.tsx` — both import the owner and add no
  condition of their own; the page gates the report entry point on a server-side
  `draftMode().isEnabled` read.
- New `web/tests/int/product-report-agreement.int.spec.ts` — renders the real page over
  the real `draftMode()` branch and drives the real route on the same fixtures
  (`published: page=rendered route=201 | draft, submitted, in_review, changes_requested,
  rejected: page=notFound route=404`), plus the draft-preview gating.
- `web/tests/int/product-reports.int.spec.ts` — the three weak source-substring checks
  replaced; every behavioural assertion kept.

Evidence:

- Verifier (own mutations on `/tmp`, workspace md5s unchanged): owner rule emptied →
  red (`expected 201 to be 404`); owner rule inverted → red (`page for published:
  expected 'notFound' to be 'rendered'`); page drops the preview option → red; page
  reverts to a bespoke inline clause → red. R2 through the real preview entry points:
  moderator session → `/next/preview` → `307` + `__prerender_bypass`; with the cookie the
  unpublished product renders `200` (draft slug present twice) and `id="report-section"`
  is `0`; `/next/exit-preview` restores one section on the published page.
- Reviewer: enumerated the 26 deleted lines (three `toContain` checks only, zero
  `.toBe()`), reproduced the agreement output, and ran `N1`/`N3` — `N3` is the drift that
  still escapes, now recorded as R3-1.
- Gates: `test:int` 33 files / 590 tests · `test:challenger` 101 · `lint` 0 errors ·
  `build` exit 0 · `test:e2e` 60 passed with 12 fixture identities and
  `seller-asset-*` back to 0.

Limitations — measured, not inferred:

- **R3-1**: the agreement matrix keys both surfaces on `_status` only, so a rule that
  also narrowed on `moderationStatus` in the non-preview branch would still pass
  (measured: 4 passed under `N3`).
- A behaviour-neutral duplicate of the rule in a consumer cannot fail any behavioural
  test; only a structural check would catch it, and that check needs its own accepted
  authority first.
- Verification covers server-rendered HTML and real preview cookies, not browser
  hydration; the `web/AGENTS.md` "read the Next docs first" step is a process claim with
  no artifact.
- Not verified: a genuinely simultaneous double-POST race, the CI e2e branch
  (`retries=3`, `workers=1`), the `/admin` UI in a browser.

Follow-ups not in this increment: **R3-1** (add the `_status = 'published'` +
non-approved `moderationStatus` matrix row), the optional structural guard, **F2**
(e2e assertion for `#report-section`), **F4** (`migrate:down` of `phase9_tickets`), and
**F5** (redact the inert JWT in `.lit/evidence/`). ADR 0010 records R1/R2 as shipped and
lists these under its Follow-Up.
