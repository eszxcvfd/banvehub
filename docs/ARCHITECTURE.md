# Architecture

Date: 2026-09-18 (refreshed; the previous revision was dated 2026-09-15)

Current architecture, as built. The product intent behind it is `PLAN.md`;
lasting choices are in `docs/decisions/`. Refreshed at commit `d7c81f8`: the
previous revision still described the money path, the download authority and the
payment provider as unimplemented, and named a `src/endpoints/` directory that no
longer exists.

## Shape

```text
test-v6/
  AGENTS.md          harness entry map (managed)
  PLAN.md            product intent, source of record
  docs/              harness guidance, decisions, plans, product, architecture
  .agents/skills/    harness skills (managed)
  .harness-core/     installed harness core and untouched base copy
  web/               the application: Next.js 16 + Payload CMS 3.89
    src/app/         App Router: (app) storefront, (payload) admin, api route handlers
    src/collections/ 27 Payload collections
    src/services/    money, purchase, download, earnings, refund, withdrawal, commission
    src/access/      authorization helpers, one per §22 row
    src/globals/     CommissionSettings and the template globals
    src/migrations/  12 versioned migrations (schema of record)
    src/plugins/     Payload plugins (SEO, form builder, ecommerce template pieces)
    tests/           int, e2e, challenger, stress suites and the e2e fixture helpers
```

One deployable application. Payload runs inside the Next.js server: it owns the
admin panel at `/admin`, the collection REST API at `/api/<collection>`, GraphQL
at `/api/graphql`, and the storefront renders through the same process. The
product's own HTTP contract lives beside it in `web/src/app/api/v1/**`.

## Boundaries And Ownership

- **Intent** — `PLAN.md`. Nothing in `web/` overrides it; the template's shape is
  a starting point, not policy.
- **Authorization** — Payload collection `access` blocks plus helpers in
  `web/src/access/`. Roles are `admin`, `buyer`, `seller`, `moderator`, and
  `financeAdmin` (decision 0008), and the §22 rows that have entities are
  enforced: product create is Seller or Admin and product update is Moderator or
  Admin; purchase, download, wallet and ledger reads, withdrawal approval,
  refunds, moderation, reviews, comments, tickets and product reports each have
  their own rule. Money documents use `canEditMoney`, which denies every
  principal including administrators (decision 0002).
- **Money** — implemented in `web/src/services/wallet.ts` and its siblings: one
  server-side write path changes a balance and always writes the paired ledger
  row, money collections deny create/update/delete to every principal, and the
  ledger is append-only by database trigger. The installed triggers are
  `forbid_ledger_mutation`, `forbid_ledger_truncate`, `forbid_wallet_delete`,
  `forbid_wallet_truncate`, and `enforce_br04_seller_anti_self_purchase`
  (decision 0002, BR-03, BR-04).
- **Download authority** — implemented: `/api/v1/downloads/token` issues a
  short-lived signed token (`web/src/services/download.ts:142`, 300 seconds) and
  `/api/v1/downloads/[token]` serves the private original through it; originals
  are never served by a fixed public URL (decision 0006, BR-06).
- **Payment provider** — implemented: the wallet top-up rail is SePay behind an
  adapter, and `/api/v1/payments/webhook/sepay` is the inbound rail. Idempotency
  and the state transitions live in `web/src/services/payment.ts`, which records
  every delivery in `payment_webhook_events`, answers a replay with a no-op
  `200` (`:190-211`), and lets the unique constraint catch a concurrent duplicate
  (`:328`) — decisions 0004, 0005 and BR-02. The template's Stripe plugin still
  serves the demo storefront only.
- **Schema** — Payload collections plus 12 versioned migrations in
  `web/src/migrations`, registered in `web/src/migrations/index.ts`. The database
  is not a hand-edited merge target; `PLAN.md` §37 requires versioned,
  expand-migrate-switch-contract migrations.

## Data

Payload's PostgreSQL adapter, selected through `DATABASE_URL` and the adapter in
`web/src/payload.config.ts`. Local development runs `postgres:16-alpine` from
`web/docker-compose.yml` as container `kientaohub-postgres` on
`127.0.0.1:5433`; the host port is 5433 because another stack on this machine
already holds `127.0.0.1:5432`. The schema is owned by the versioned migrations,
created with `payload migrate:create` and applied with `payload migrate`, per
`PLAN.md` §37. An earlier SQLite file at `web/payload.db` remains on disk as a
pre-migration artefact and is no longer read or written. The database carries 103
tables in `public`.

Media uploads and private product originals go to local disk: the template's
`media` collection for public assets, and `web/private/product_files/` for
originals, whose `staticDir` is set in
`web/src/collections/ProductFiles/index.ts:102` and which are reached only
through the download route. There is no object storage, so there is no private
bucket and no presigned URL, which decision 0006 records as a precondition for
the storage slice.

## Missing By Design, Not By Accident

- No worker process: no malware scanning, no async jobs, no email dispatch. The
  Nodemailer adapter stays commented out (`web/src/payload.config.ts:137`).
- No Redis or queue.
- CI covers lint, a dependency audit (`pnpm audit --audit-level=high`),
  migrations, build/type-check, and integration tests (`.github/workflows/ci.yml`).
  It has no unit-test job and no e2e job, so the `PLAN.md` §36 pull-request list is
  only partly covered, and image builds, staging deploys, and smoke tests do not
  exist at all.
- No observability: no structured logging configuration, metrics, tracing, or
  alerting (`PLAN.md` NFR-08).
- No rate limiting on any surface, including the payment webhook route that
  `PLAN.md` §11.3 requires it for (`PLAN.md` NFR-17).

## Layout Decision

The application stays in `web/` rather than moving to `apps/web`.
`PLAN.md` §34 says "Có thể dùng monorepo" — a suggestion, not a mandate — and a
single application does not need workspace indirection yet. The harness
documents remain at the repository root, which keeps `AGENTS.md` and `PLAN.md`
discoverable.

## Deliberately Not Decided

Component boundaries inside `web/src`; the object storage provider; the
observability stack; the CI provider; staging and production topology. Each needs
its own decision when the owning slice starts. The physical-goods question is
settled: `variants`, `carts`, and `addresses` were removed rather than
repurposed, and the storefront is the digital-file shape.
