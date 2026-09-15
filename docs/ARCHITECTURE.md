# Architecture

Date: 2026-09-15

Current architecture, as built. The product intent behind it is `PLAN.md`;
lasting choices are in `docs/decisions/`.

## Shape

```text
test-v6/
  AGENTS.md          harness entry map (managed)
  PLAN.md            product intent, source of record
  docs/              harness guidance, decisions, plans, product, architecture
  .agents/skills/    harness skills (managed)
  .harness-core/     installed harness core and untouched base copy
  web/               the application: Next.js 16 + Payload CMS 3.89
    src/app/         App Router: (app) storefront, (payload) admin
    src/collections/ Payload collections
    src/plugins/     payload plugins (SEO, form builder, ecommerce)
    src/endpoints/   route handlers, including the template seed endpoint
```

One deployable application. Payload runs inside the Next.js server: it owns the
admin panel at `/admin`, the REST API at `/api/<collection>`, GraphQL at
`/api/graphql`, and the storefront renders through the same process.

## Boundaries And Ownership

- **Intent** — `PLAN.md`. Nothing in `web/` overrides it; the template's shape is
  a starting point, not policy.
- **Authorization** — Payload collection `access` blocks. The §5 role model and
  §22 matrix are not implemented; today the only roles are `admin` and
  `customer`.
- **Money** — one server-side write path only, with money collections denying
  create, update, and delete for every principal, and an append-only ledger
  enforced by migration-installed triggers (decision 0002). Not implemented.
- **Download authority** — entitlement-gated route with a short-lived one-time
  token; originals stay private (decision 0006). Not implemented.
- **Payment provider** — SePay behind an adapter (decision 0004); the template's
  Stripe adapter serves the demo storefront only. Not implemented.
- **Schema** — Payload collections plus migrations. The database is not a
  hand-edited merge target; `PLAN.md` §37 requires versioned, expand-migrate-
  switch-contract migrations.

## Data

Payload's Postgres or SQLite adapter, selected by `DATABASE_URL` and the adapter
in `web/src/payload.config.ts`. Local development currently uses SQLite at
`web/payload.db`. `PLAN.md` §27 Phase 1 and decision 0001 require PostgreSQL
before any money work; the migration is the first step of
`docs/plans/active/phase-1-foundation.md`.

Media uploads go to local disk through the template's `media` collection. There
is no object storage, so there is no private bucket and no presigned URL, which
decision 0006 records as a precondition for the storage slice.

## Missing By Design, Not By Accident

- No worker process: no malware scanning, no async jobs, no email dispatch.
- No Redis or queue.
- No CI; `PLAN.md` §36 defines the required pipeline and nothing implements it.
- No observability: no structured logging configuration, metrics, tracing, or
  alerting (`PLAN.md` NFR-08).
- No rate limiting on any surface, including the future webhook route that
  `PLAN.md` §11.3 requires it for.

## Layout Decision

The application stays in `web/` rather than moving to `apps/web`.
`PLAN.md` §34 says "Có thể dùng monorepo" — a suggestion, not a mandate — and a
single application does not need workspace indirection yet. The harness
documents remain at the repository root, which keeps `AGENTS.md` and `PLAN.md`
discoverable.

## Deliberately Not Decided

Component boundaries inside `web/src`; the object storage provider; the
observability stack; the CI provider; staging and production topology; whether
the physical-goods template collections (`variants`, `carts`, `addresses`) are
removed or repurposed for the digital-file shape. Each needs its own decision
when the owning slice starts.
