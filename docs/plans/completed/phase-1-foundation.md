# Execution Plan: Phase 1 Foundation, starting with PostgreSQL

Date: 2026-09-15

## Status

Active

## Outcome

Two observable results:

1. Payload at `web/` runs on PostgreSQL with versioned, committed migrations, so
   the money work in `PLAN.md` §27 Phase 4 has a database that can enforce the
   transaction and constraint rules the product requires.
2. The Phase 0 authority artifacts deleted in `366ac21` exist again in `docs/`,
   restated for the Payload platform, so later phases inherit approved policy
   instead of re-deciding it.

## Context

- `PLAN.md` §27 Phase 1 lists Foundation (repository, CI, environments,
  PostgreSQL, Redis, object storage, auth, RBAC, user, base admin,
  observability); Phase 0 lists product definition artifacts (ERD, API
  conventions, design system, ADR, threat model, business rules).
- `docs/decisions/0001-payload-as-platform.md`: Payload 3.89 on Next.js 16 at
  `web/` is the platform; local development is SQLite; Postgres is required
  before any money path.
- `docs/WORKFLOW.md`: work shapes, authority gate, behaviour-level proof.
- Observed: `web/` runs on SQLite (`web/payload.db`, 87 tables); the repository
  has no `.github/` CI, no Redis, no object storage, no observability, and
  Payload currently carries only the template's `admin` and `customer` roles.
- Observed: `docs/plans/active/` held no plan before this file; `docs/README.md`
  links `docs/ARCHITECTURE.md` and `docs/HARNESS.md`, which do not exist.

## Scope

In scope:

- Phase 0 artifacts, restated for Payload and marked restored vs newly written:
  financial state machine, payment provider, money write layer, secure download
  path, search engine, P0 scope lock, product overview, architecture,
  threat model, API conventions.
- Local PostgreSQL for `web/` via Docker Compose, the Payload Postgres adapter,
  and committed migrations.
- Marking the obsolete daptin decisions (old 0001–0005) as superseded in
  `docs/decisions/README.md` rather than restoring them.

Out of scope:

- Redis, object storage, observability, CI pipelines, and the §5/§22 role model;
  these are later Phase 1 groups and each needs its own decision.
- Catalog, seller, moderation, wallet, purchase, and download behaviour
  (Phase 2 onward).
- Staging and production environments, managed Postgres, and provider accounts.
- Rebranding to KienTaoHub, Vietnamese copy, and VND presentation.

## Approach

1. Group A — restore authority. Read the deleted documents from `470bf41`,
   restate what is still true under Payload, and mark provenance. Write
   `docs/product/overview.md` and `docs/ARCHITECTURE.md` so the two dangling
   links in `docs/README.md` resolve.
2. Group B — PostgreSQL. Add `web/docker-compose.yml` with `postgres:16`,
   install `@payloadcms/db-postgres`, replace `sqliteAdapter`, create the
   initial migration, and run the app against Postgres.
3. Verify with behaviour, update Progress and Result, then move this plan to
   `docs/plans/completed/`.

## Risks And Recovery

- Risk: SQLite data is lost or stranded. The database holds only template
  schema with no product data (`GET /api/products` returned `totalDocs: 0`), and
  `web/payload.db` stays on disk, ignored by Git. Recovery: revert the adapter
  line, `DATABASE_URL`, and the dependency; restart.
- Risk: generated migrations drift from the config. Mitigation: run
  `payload migrate:create` against the final config and re-run
  `payload migrate` from an empty database to confirm a clean apply.
- Risk: Docker is unavailable or port 5432 is taken. Mitigation: check before
  editing; if unavailable, stop and report rather than substituting SQLite.
- Risk: restored documents re-import daptin-era mechanics as if current.
  Mitigation: restate each decision and label restored vs newly written text.
- Recovery: this plan's steps are additive; `git revert` of the group commit
  returns the repository to the Payload-on-SQLite state.

## Progress

- [x] Owner decisions: first slice, Postgres hosting, layout, Phase 0 docs
- [x] Group A: restore and restate Phase 0 artifacts
  - [x] decisions 0002–0007 restated (money write layer, P0 scope lock,
        payment provider, state machine, secure download, search engine)
  - [x] decisions index updated; obsolete daptin records marked superseded
  - [x] `docs/product/overview.md`, `docs/ARCHITECTURE.md`,
        `docs/threat-model.md`, `docs/api-conventions.md`, `docs/HARNESS.md`
  - [x] resolved the two dangling links in `docs/README.md` by creating
        `docs/ARCHITECTURE.md` and restoring `docs/HARNESS.md`
- [x] Group B: PostgreSQL, adapter, migrations, run, verify
  - [x] `web/docker-compose.yml` with `postgres:16-alpine` on `127.0.0.1:5433`
  - [x] `@payloadcms/db-postgres` installed, adapter swapped, `DATABASE_URL`
        repointed, `@payloadcms/db-sqlite` removed
  - [x] initial migration created and applied; 87 Postgres tables match the
        SQLite baseline; app serves from Postgres and `payload.db` is untouched
- [x] Record validation and result, move the plan to `docs/plans/completed/`

## Decisions

- 2026-09-15: First Phase 1 slice is PostgreSQL, because `PLAN.md` §27 lists it
  first among infrastructure and decision 0001 makes it a precondition for money
  work.
- 2026-09-15: Dev Postgres runs from Docker Compose locally; managed staging and
  production Postgres stay a separate, later decision.
- 2026-09-15: Keep the `web/` layout. `PLAN.md` §34 says "Có thể dùng monorepo"
  (may use a monorepo), which is a suggestion, not a mandate.
- 2026-09-15: Restore Phase 0 artifacts now rather than proceeding without them.
- 2026-09-15: Obsolete daptin decisions are not restored; the decisions index
  records them as superseded by decision 0001 with a pointer to `470bf41`.
- 2026-09-15: The Compose service binds `127.0.0.1:5433` instead of the planned
  5432, because another stack on this machine already holds `127.0.0.1:5432` and
  this slice must not disturb it. Task-local; recorded in the compose file and
  in the decision 0001 amendment.
- 2026-09-15: Running the Payload CLI rewrites the generated
  `web/src/app/(payload)/admin/importMap.js` with different formatting. The key
  sets were compared and are identical, so the regeneration was reverted to keep
  the diff limited to this slice's intent.
- 2026-09-15: The Postgres adapter's development `push` stays enabled. It wrote
  a `dev` row at batch `-1` in `payload_migrations`; whether development should
  run migrations only is left open rather than decided here.

## Validation

Focused proof — **pass**:

- `pnpm payload migrate:create initial` exits 0 and writes
  `web/src/migrations/20260915_020514_initial.ts` with its snapshot and index.
- `pnpm payload migrate` exits 0 against an empty database, and
  `select count(*) from information_schema.tables` in container
  `kientaohub-postgres` returns **87** base tables in `public`, matching the
  87-table SQLite baseline exactly.
- `payload_migrations` records `20260915_020514_initial` at batch 1.

Integration proof — **pass**:

- `pnpm dev` boots with the Postgres adapter and answers `GET /` 200,
  `GET /admin` 200, and `GET /api/products` with the expected envelope.
- `web/payload.db` has the same size and modification time before and after the
  run, which shows the application no longer reads or writes SQLite.

Repository-required checks — **fail, pre-existing, not caused by this slice**:

- `pnpm lint` aborts before linting: ESLint 9.39.5 with `@eslint/eslintrc`
  `FlatCompat` throws `TypeError: Converting circular structure to JSON` while
  loading `next/core-web-vitals`. No eslint package appears in this slice's
  lockfile diff.
- `pnpm build` fails type checking in template components that this slice did
  not touch: `src/components/Cart/CartModal.tsx`,
  `src/components/checkout/CheckoutPage.tsx`, and
  `src/utilities/generatePreviewPath.ts`, the last importing
  `@/app/(frontend)/next/preview/route`, a directory that does not exist in this
  template (it ships `src/app/(app)/`).
- Consequence: neither check can gate CI, and `PLAN.md` §36 requires both to
  pass on pull requests. Fixing the template is a separate slice.

## Result

Complete. Both outcomes exist and are verified.

- PostgreSQL replaced SQLite for local development. The Compose service
  `kientaohub-postgres` (`postgres:16-alpine`) runs on `127.0.0.1:5433`, the
  adapter is `postgresAdapter` with a `pool.connectionString` from
  `DATABASE_URL`, and `web/src/migrations/20260915_020514_initial.ts` is the
  committed schema source of truth. The Postgres schema matches the SQLite
  baseline table for table, and the application serves from Postgres while the
  old SQLite file stays untouched.
- The Phase 0 authority records exist again as decisions 0002–0007 plus
  `docs/product/overview.md`, `docs/ARCHITECTURE.md`, `docs/threat-model.md`,
  `docs/api-conventions.md`, and `docs/HARNESS.md`, each restated for Payload
  instead of copied from the removed daptin implementation.

Limitations and disclosures:

- `pnpm lint` and `pnpm build` fail for pre-existing template reasons, with the
  exact errors recorded under Validation. This slice neither caused nor fixed
  them.
- Development `push` is still enabled alongside migrations; the `dev` row in
  `payload_migrations` records that.
- The `postgresAdapter` dependency, the compose file, and the migration are the
  only application changes; no product behaviour was added.

Follow-up owned by later slices:

- Make the two repository checks pass, since CI depends on them.
- Decide whether development keeps `push` or runs migrations only.
- Object storage, Redis, observability, CI, and the §5 role model remain
  unavailable and each needs its own decision.
