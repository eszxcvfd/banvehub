# Execution Plan: FR-22 — Product reports and moderation cases

Date: 2026-09-18

## Status

Completed — FR-22 delivered, independently verified (`t2` PASS 9/9), reviewed
`pass` (`t3`, 5 low non-blocking findings), and integrated in the commit that
introduces this record. Not pushed.

## Outcome

A signed-in user can report a product from the storefront with one of the seven
`PLAN.md` FR-22 reasons. The report creates exactly one `moderation_cases` row —
never a change to the product itself — that a Moderator or Admin can read and
resolve. A second still-open report by the same user for the same product is
refused with `409`, and the database refuses it as well.

Observable surfaces:

- `POST /api/v1/products/{idOrSlug}/reports` — the report contract.
- `moderation_cases` — present in the Payload admin (the admin surface per
  decision 0001) with reporter, product, reason, description, status.
- Storefront product detail — a report entry point for signed-in users.

## Context

- `PLAN.md` FR-22 (`PLAN.md:797-810`): the seven reasons and "Tạo moderation case".
- `PLAN.md` §17 (`PLAN.md:2293-2294`): `moderation_cases` and `moderation_actions`
  are named core tables.
- `PLAN.md` §22 matrix (`PLAN.md:2509-2524`): "Moderate product" is
  Moderator/Admin only; the matrix has no row for reporting, which is why the
  reporting policy needed an owner decision.
- `PLAN.md` §25 (`PLAN.md:2645,2659`) screens 34 (moderation queue) and 48
  (reports); §28 Definition of Done.
- Decisions 0001 (Payload admin is the admin surface), 0003 (P0 scope lock —
  email stays out), 0008 (five-role model).
- Invariants: BR-03 (append-only ledger), BR-08 (no hard delete), FR-28 (a
  seller cannot approve its own product).
- Precedent contracts: `web/src/app/api/v1/products/[id]/comments/route.ts`
  (FR-21) and `web/src/app/api/v1/tickets/route.ts` (FR-23) — `{error, message}`
  envelope in Vietnamese, `401/400/404/403/409` classes.
- Test-fixture lifecycle locked by commits `f6fa88d`, `0affeac`, `779d855` and
  recorded in `.lit/ISSUE_STATE.md`: suite-level seed/teardown by identity, no
  residue after a run.
- `docs/api-conventions.md` predates the `/api/v1` storefront contract and is
  not authority for the new route's shape.

## Scope

In scope (task `t1`):

- `web/src/collections/ModerationCases/` — the collection and its access rules.
- `web/src/payload.config.ts`, `web/src/payload-types.ts`.
- `web/src/migrations/` — one additive migration plus its registration.
- `web/src/app/api/v1/products/[id]/reports/route.ts`.
- `web/src/components/product/` and the product-detail page wiring.
- `web/tests/int/` — one new integration spec.

Out of scope:

- `web/tests/helpers/**` and `web/playwright.config.ts` (fixture lifecycle is
  locked), `web/tests/e2e/**`.
- `.github/**`, `docs/**`, `PLAN.md` (captain owns this plan file).
- The money path (`Wallets`, `WalletLedger`, `Orders`, `OrderItems`,
  `Entitlements`, `DownloadEvents`, `Refunds`, `SellerEarnings`, `Withdrawals`,
  `WithdrawalEvents`) and `web/src/collections/Products/**`.
- Notifications (§13), guest reports, automatic hiding/status change,
  `moderation_actions`, a staff REST endpoint without a consumer, rate limiting.
- `git add` / `commit` / `push` — members never touch history; the captain
  integrates and push stays an operator decision.

## Approach

The captain locked the three open policies with the owner on 2026-09-18
(authenticated-only, no automatic status change, dedupe per open
`(reporter, product)`), then staged one dependency chain in the
`fr22-product-reports` team:

1. `t1` — implementation, assignee `engineer`. Collection + migration + route +
   storefront entry point + integration spec.
2. `t2` — independent verification, assignee `verifier`, depends on `t1`.
   Own HTTP/SQL probes plus a raw re-run of every gate.
3. `t3` — adversarial review, assignee `reviewer`, depends on `t2`, judging the
   latest implementation (`reviewedTaskId: t1`, round 1).

Gate commands (from the repository root):

```text
pnpm --prefix web payload migrate
pnpm --prefix web test:int
pnpm --prefix web test:challenger
pnpm --prefix web lint
pnpm --prefix web build
pnpm --prefix web test:e2e
```

After a `pass` verdict the captain commits the in-scope paths (no push) and
moves this file to `docs/plans/completed/`.

## Risks And Recovery

- Migration runs against a populated development database (`products` 161,
  `users` 55): the migration is additive only — new enum, new table, new index —
  so it cannot rewrite existing rows. Recovery: run the down migration.
- The partial unique index is created on a brand-new table, so no backfill
  conflict is possible.
- The product-detail page is covered by `web/tests/e2e/frontend.e2e.spec.ts`.
  **Corrected after review (finding F2):** that spec asserts cart machinery only
  (`web/tests/e2e/frontend.e2e.spec.ts:93-103`) and never asserts the rendered
  report entry point, so the real mitigation is the jsdom render test of the real
  component plus the live SSR presence of `#report-section` and the `401` probe —
  not a browser-level drive of the dialog.
- Fixture residue: the new spec must clean up after itself by identity, and the
  verifier re-checks the 12 fixture identities plus the `seller-asset-*` delta
  after the e2e run.
- Rubber-stamping: `t2` is forbidden from using the implementer's logs as
  evidence, and `t3` must cite `file:line` for every finding.
- Weakened validation: no existing integration test may be edited to
  accommodate the change; the reviewer checks this explicitly.

## Progress

- [x] Authority and the three open policies resolved with the owner (2026-09-18).
- [x] Team `fr22-product-reports` staged: 3 members, tasks `t1` → `t2` → `t3`.
- [x] Owner approved the staged plan; the scheduler dispatched `t1`.
- [x] `t1` implementation complete (attempt 1, engineer). Self-reported gates:
  `payload migrate` exit 0; `test:int` 32 files / 581 tests passed (new spec = 31);
  `test:challenger` 101 passed; `lint` 0 errors (1085 pre-existing warnings);
  `build` exit 0 with `ƒ /api/v1/products/[id]/reports` in the route table;
  `test:e2e` 60 passed with fixture teardown clean.
- [x] `t2` independent verification complete — **PASS, 9/9 criteria re-verified, 0 FAIL**
  (attempt 1, verifier; report + raw logs in `.lit/evidence/verifier-t2-REPORT.md`).
  Independently measured: gates re-run raw (int 32 files/581 tests, challenger 101,
  lint 0 errors, build exit 0, e2e 60 passed with all 12 fixture identities and
  `seller-asset-*` back to 0); the product row's md5 unchanged around a live report;
  a full-public-schema count diff around one report moved only `moderation_cases`
  0 → 1 (no money-path rows); a raw duplicate INSERT was rejected by
  `moderation_cases_open_reporter_product_idx`, and `RESOLVED`/`DISMISSED` release the
  pair. Explicitly NOT verified (no inference to PASS): the CI branch
  (`retries=3`, `workers=1`), a browser-level e2e drive of the report dialog
  (jsdom + SSR + 401 evidence only), a true simultaneous double-POST race, the
  remaining six reasons over raw HTTP (covered via the spec re-run and the DB enum),
  the e2e hard-kill fixture-leak path, and the `/admin` UI.
- [x] `t3` review verdict `pass` (round 1, attempt 1) — 5 low, non-blocking findings
  (F1–F5). Independently ran `test:int` (32 files/581 tests) with a clean
  `kientaohub_test`, a fresh-DB migration round-trip (12 up; FR-22 down removes only
  its own objects), and applied FR-22 to a copy of the populated dev database
  (161 products / 56 users / 201 ledger rows) with `md5(products)` and every count
  byte-identical except `payload_locked_documents_rels` 34 → 35.
- [x] Captain commits in-scope paths (no push) and moves this plan to completed.

Review focus handed to `t3` when it starts:

1. The duplicate guard maps the uniqueness race by re-reading the pair after a
   failed INSERT rather than pattern-matching the driver error, because
   `@payloadcms/drizzle` rewraps `23505` as a generic `ValidationError`. Confirm the
   non-duplicate failure path still fails loud (`500`) instead of masking a real
   write failure as `409`, and that `findOpenCase` returning `null` on a read
   failure cannot be mistaken for "no duplicate".
2. The integration spec's UI-wiring assertion is source-level (`page.tsx` imports and
   renders `ProductReportDialog`); the runtime proof is a live page containing
   `id="report-section"` plus jsdom render tests of the real component. Judge whether
   that combination is adequate or whether a source-level assertion should be
   replaced by behavioural coverage.

## Decisions

- 2026-09-18: reports are authenticated-only (`401` anonymous), following the
  FR-21/FR-23 precedent — owner decision, because `PLAN.md` §22 has no report row.
- 2026-09-18: reporting never changes `products.moderationStatus` or `_status`;
  only a moderator action does — owner decision.
- 2026-09-18: one open case per `(reporter, product)`; a duplicate returns `409`
  and is additionally refused by a partial unique index — owner decision plus
  captain design for race safety.
- 2026-09-18: the entity is `moderation_cases` per `PLAN.md` §17, not a new
  `reports` table. `moderation_actions` stays unimplemented because existing
  transitions already record `products.moderationHistory`.
- 2026-09-18: the moderator surface is the Payload admin (decision 0001); a case
  list in the app's `/moderation` page is deferred as follow-up.
- 2026-09-18: members never run `git add`/`commit`/`push`; the captain integrates.

## Validation

- Focused proof: the new integration spec plus the verifier's independent HTTP
  and SQL probes (positive and negative paths).
- Integration or end-to-end proof: full `test:e2e` run after the storefront
  change, with the fixture-residue check.
- Repository-required checks: `payload migrate`, `test:int`, `test:challenger`,
  `lint` (0 errors), `build` (exit 0).

## Result

Completed 2026-09-18. FR-22 is delivered in `web/`, independently verified,
reviewed `pass`, and integrated in the commit that introduces this record; the
commit is **not pushed** (an operator decision, unchanged by this work).

Outcome as observed:

- `POST /api/v1/products/{idOrSlug}/reports` creates exactly one `moderation_cases`
  row for a signed-in reporter and returns `201 { success, case }`; anonymous `401`,
  unknown product `404`, invalid reason/body/description `400`, duplicate open report
  `409`, and everything else `500` — all as `{ error, message }` in Vietnamese.
- `moderation_cases` is the only schema addition (enum + table + FKs + indexes +
  partial unique index `moderation_cases_open_reporter_product_idx`);
  `RESOLVED`/`DISMISSED` release the `(reporter, product)` pair.
- Reporting is side-effect free on the catalog: the product row's md5 and every
  money-path count are unchanged around a live report; the only schema-wide count
  movement is `moderation_cases` 0 → 1 (independently measured).
- The storefront product detail renders the report entry point for signed-in users.

Gate evidence (re-run raw by the verifier, not taken from the implementer):
`payload migrate` exit 0 · `test:int` 32 files / 581 tests · `test:challenger` 101 ·
`lint` 0 errors / 1085 pre-existing warnings · `build` exit 0 · `test:e2e` 60 passed
with all 12 fixture identities and `seller-asset-*` back to 0.

Limitations — measured, not inferred:

- The CI e2e branch (`retries=3`, `workers=1`) was not run; local-only, unchanged
  from the previous increment.
- No browser-level e2e drives the report dialog; coverage is a jsdom render test of
  the real component plus SSR presence of `#report-section` plus the `401` probe.
- No true simultaneous double-POST race was exercised; the race is reasoned from the
  pre-check plus the partial unique index.
- Only one of the seven reasons was probed over raw HTTP; the other six are covered
  by the integration spec and the database enum.
- The e2e hard-kill fixture-leak path and the `/admin` UI were not exercised.

Follow-ups recorded from the review (all low, non-blocking, none required for FR-22):

- **F1** `web/src/app/api/v1/products/[id]/reports/route.ts:258` — the `500` path (and
  the `409`-when-the-re-read-finds-the-winner path) has no test. Fix: two
  stubbed-create tests.
- **F2** `web/tests/int/product-reports.int.spec.ts:1018` — the entry point has no
  behavioural committed test; the source-text `toContain` is form-level. Fix: assert
  `#report-section` in `web/tests/e2e/frontend.e2e.spec.ts` (outside the `t1`
  contract's `inScope`, so it needs its own change).
- **F3** `web/src/app/api/v1/products/[id]/reports/route.ts:25` — `resolveProductId`
  has no visibility filter, so draft products are reportable and unpublished
  ids/slugs are enumerable (`201`/`409` versus `404`). Fix: filter
  `_status = published`, or record the intent explicitly.
- **F4** Pre-existing, not FR-22: `migrate:down` of
  `web/src/migrations/20260917_052848_phase9_tickets.ts:67-68` fails because
  `DROP TABLE tickets CASCADE` already removed the foreign key before an unguarded
  `DROP CONSTRAINT`. FR-22's own down migration is correct and idempotent. Keep as a
  separate hygiene item; do not edit the old migration in place.
- **F5** `.lit/evidence/verifier-t2-http.log:5` contains an inert JWT plus PII
  (the session no longer exists). `.lit/` is untracked scratch and was deliberately
  not committed; redact before any future `.lit/` commit.

The recurring policy behind FR-22 is recorded in `docs/decisions/0010-product-report-policy.md`
so it does not live only in this historical plan.
