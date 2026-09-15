# 0001 Payload CMS as the application platform

Date: 2026-09-15

## Status

Accepted

## Context

The repository previously implemented KienTaoHub on a locally patched daptin
image with a Vue console; decisions 0001–0011 recorded that stack. That code and
those records were removed in `366ac21`, leaving `PLAN.md` as the product source
of record and the installed harness as the only other repository content.

The owner then selected Payload CMS (https://payloadcms.com) as the platform and
asked for a template install so the site is usable.

Constraints found while installing:

- `create-payload-app` requires an interactive TTY, so it cannot be used by an
  agent in a non-interactive shell.
- The `ecommerce` template on the Payload repository's `main` branch targets
  `4.0.0-canary.14`, which is not published; it imports `TableFeature`, while the
  published stable package only exports `EXPERIMENTAL_TableFeature`.
- The template's `package.json` depends on `workspace:*`, which only resolves
  inside the Payload monorepo.
- pnpm 11 ignores `pnpm.onlyBuiltDependencies` in `package.json`, and
  `pnpm install` exits non-zero on ignored build scripts, which aborts
  `pnpm dev` before Next.js starts.

## Decision

Payload CMS 3.89.0 on Next.js 16 in `web/` is the application platform: it owns
the admin panel, the REST/GraphQL API, and the public storefront. It replaces
daptin; no second CMS or backend is introduced.

- Starting point is the `ecommerce` template from Payload tag `v3.89.0`, so the
  template and every `@payloadcms/*` package stay on the same released version.
- Template dependencies are pinned to published `3.89.0` instead of
  `workspace:*`.
- Dependency-build policy lives in `web/pnpm-workspace.yaml` under `allowBuilds`
  (the pnpm 11 replacement for `pnpm.onlyBuiltDependencies`).
- Local development uses SQLite through `@payloadcms/db-sqlite` at
  `web/payload.db`; Postgres is the production target.
- Payment stays on the template's Stripe adapter until the internal wallet and
  SePay rail from `PLAN.md` §11 are built.

## Alternatives Considered

1. Keep daptin with the Vue console and `schema/` YAML — the stack removed in
   `366ac21`.
2. Payload `website` template — CMS-first; product, order, and customer
   modelling would start from nothing.
3. Payload `blank` template — maximum control, most work before any site exists.
4. The `main`-branch template with `4.0.0-canary` packages — no matching
   published release; would pin the repository to unstable canaries.
5. MongoDB (template default) or Postgres from the first commit — rejected in
   favor of SQLite for local speed, with Postgres as the production target.

## Consequences

Positive:

- Storefront, admin panel, auth, access control, SEO, layout builder, forms, and
  a REST/GraphQL API exist and run on the first day.
- Order, cart, transaction, and customer modelling exists before custom wallet
  or entitlement work starts.
- The data model is reviewable code in `web/src/collections`, not database state.

Tradeoffs:

- The template targets a foreign product shape: physical-goods ecommerce, Stripe
  checkout, en-US copy, and "Payload Commerce" branding. Currency presentation
  (VND), language, payment rail, and branding all need replacement.
- SQLite is not the production database; money features must not be exercised
  before the Postgres migration.
- Template and packages must move together; an upgrade must take a matching
  Payload tag, not `main`.
- `web/` adds a second toolchain (pnpm 11, Node >= 24.15, Next.js 16) inside the
  harness repository.

## Follow-Up

- Create the first admin user and seed demo content.
- Replace the Stripe payment method with the internal wallet plus SePay rail from
  `PLAN.md` §11, and add entitlement-gated download.
- Migrate to Postgres before any money path is used.
- Rebrand to KienTaoHub with Vietnamese copy and VND presentation.
- Decide how the Next.js-generated `web/AGENTS.md` and `web/CLAUDE.md` relate to
  the harness `AGENTS.md`.
