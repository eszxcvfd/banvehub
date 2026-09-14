# Architecture

Current product, code, state, update, and ownership boundaries for this
repository. Behavior claims here are derived from the running system and the
files listed under Evidence.

## Current Product

A self-hosted **daptin** application server (Go, LGPL-3.0) plus its
PostgreSQL database, running locally through Docker Compose, as the backend for
an operator frontend in `web/`.

The product this repository serves is **KienTaoHub** (`PLAN.md`): a Vietnamese
marketplace for CAD/design files and technical documents.
`decisions/0005-kientaohub-builds-on-daptin.md` fixes its shape — daptin is the
backend and API of record, a **Next.js storefront** (not built yet) owns the
SEO-critical public surface, and the console in `web/` is the operator and admin
surface. Money-moving tables are read-only through the generic JSON:API, with
every mutation going through a custom action; that rule was verified in the
money-path spike recorded in `docs/plans/active/kientaohub-phase-0.md`.

Runtime topology (verified 2026-09-14):

| Component | Image | Published | State |
|---|---|---|---|
| `daptin` | `daptin-local:v0.13.9-patched` (built from `daptin/`) | `127.0.0.1:6336` → container `:8080` | volume `daptin_daptin-data` → `/var/lib/daptin` |
| `postgres` | `postgres:17-bookworm` | not published (container network only) | volume `daptin_postgres-data` |

`web/` is a Vue 3 single-page application (Vite, TypeScript, Tailwind CSS v4,
Ark UI Vue, Pinia, Vue Router) that reads the backend's schema from `/api/world`
and lets an operator read, add, and delete records. It reaches the backend
through the Vite dev proxy (`:5173` → `127.0.0.1:6336`), so the backend needs no
CORS configuration during development. Its structure, stack, and limits are
documented in `web/README.md` and
`decisions/0004-web-session-and-api-access.md`.

## Code Boundaries

- `daptin/` — upstream clone of `https://github.com/daptin/daptin` at commit
  `8e2f6a9` (tag `v0.13.9`), plus local patches. It is its own git repository
  with its own upstream `AGENTS.md` and `docs/`; those are upstream material,
  not this repository's policy.
- `.agents/skills/`, `docs/`, `AGENTS.md`, `.harness-core/`, `scripts/bin/harness`
  — Harness core, managed by `scripts/bin/harness` (see `HARNESS.md`).
- `web/` — the operator frontend (Vue 3 + Vite + TypeScript). Own source tree
  with its own `package.json`, lint, and test setup; it talks to the backend only
  over HTTP.
- `schema/` — the product's data model, as daptin schema files. Version-controlled
  here and mounted read-only into the container by
  `daptin/docker-compose.override.yml`; it deliberately lives outside `daptin/`,
  which git ignores.

Local patches in `daptin/` (13 files, +55/−20 lines vs upstream commit `8e2f6a9`):

| File | Purpose |
|---|---|
| `server/resource/columns.go` | unique relationship names for the two `llm_batch` → `llm_file` relations |
| `server/resource/dbfunctions_create.go` | `on delete cascade` on FK constraints of join tables (`*_has_*`) |
| `server/resource/dbmethods.go` | not-found returns `api2go.HTTPError` 404 instead of 500; `olric` `NX` cache write no longer logs `ErrKeyFound` as an error |
| `server/jwt/jwtmiddleware.go` | same `NX`/`ErrKeyFound` correction for the parsed-token cache |
| `server/resource/cms_config.go` | same `NX`/`ErrKeyFound` correction for the config-value cache |
| `server/auth/auth.go` | same `NX`/`ErrKeyFound` correction for the session-user cache |
| `server/utils.go` | treat "world table absent" as empty config, not an error |
| `server/server.go` | drop spurious error log when JWT issuer config is absent |
| `server/actions/action_generate_jwt_token.go` | same, plus log on failed default write |
| `server/actions/action_switch_session_user.go` | same |
| `server/actions/action_generate_password_reset_flow.go` | same |
| `server/actions/action_generate_password_reset_verify_flow.go` | same |
| `server/actions/action_otp_login_verify.go` | same |

Local-only files inside `daptin/` that upstream does not contain:
`docker-compose.override.yml`, `schema/`, `build-local-image.sh`, `.env`,
`build/`, `daptinweb/`, `rice-box.go` (excluded via `.git/info/exclude`).

## State Ownership

- **Data model and authorization** — `schema/schema_*.yaml` (this repository,
  mounted read-only into the container), loaded at
  startup through `DAPTIN_SCHEMA_FOLDER` and then persisted by daptin into
  `world.world_schema_json`. The database copy is merged with code/schema config
  on every boot, so the database is not the only config source.
- **Runtime configuration** — `daptin/.env` (image tag, host port, Postgres
  credentials, `TZ`) and `daptin/docker-compose.override.yml` (`DAPTIN_*`
  variables, schema volume mount, `pull_policy`).
- **Identity and data** — rows in PostgreSQL (`user_account`, `usergroup`,
  business tables). Removing the `daptin_postgres-data` volume removes every
  account and every record, including the administrator.
- **Blob storage** — `daptin_daptin-data` volume.

## Update Boundaries

| Change | Command |
|---|---|
| Go code in `daptin/` | `daptin/build-local-image.sh` then `docker compose up -d --wait` |
| `schema/*.yaml` | `docker compose restart daptin` (hard restart required) |
| `.env` / compose override | `docker compose up -d --wait` |
| `web/` source | `npm run dev` in `web/`; `npm run test`, `npm run type-check`, `npm run build` for proof |
| Harness core | `scripts/bin/harness update` |
| Upstream daptin release | fetch, rebase the 13 local patches, rebuild the image |

Upstream upgrades are not attempted by the Harness updater: `daptin/` is a
consumer clone, not a Harness-managed surface.

## Deliberate Divergence

Running a locally built image instead of `daptin/daptin:latest` is recorded in
`decisions/0001-run-locally-patched-daptin-image.md`. Business-table
authorization defaults are recorded in
`decisions/0002-business-table-authorization-pattern.md`. Database-as-config
handling is recorded in
`decisions/0003-database-config-merge-rebuild.md`. The frontend stack and its
session handling are recorded in
`decisions/0004-web-session-and-api-access.md`.

## Evidence

- `daptin/docker-compose.yml`, `daptin/docker-compose.override.yml`, `daptin/.env`
- `daptin/docker-compose.override.yml` mounts `../schema` into `/var/lib/daptin/schema` (a mount change needs `docker compose up -d`, not `restart`)
- `docker compose ps` (both services `healthy`, image `daptin-local:v0.13.9-patched`)
- `docker volume ls` (`daptin_postgres-data`, `daptin_daptin-data`)
- `daptin/server/config.go` (`LoadConfigFiles`, `DAPTIN_SCHEMA_FOLDER`)
- `daptin/server/server.go` (database config merge via `MergeTables`)
- `daptin/.git` (upstream commit `8e2f6a9`), `git status --short` inside `daptin/`
- `web/package.json`, `web/vite.config.ts` (dev proxy), `web/src/lib/daptin.ts`
- `docs/RUNBOOK.md` (start, readiness, reset, validation)
