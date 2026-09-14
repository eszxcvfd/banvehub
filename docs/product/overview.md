# Product Overview

Derived from accepted intent stated by the repository owner plus behavior
observed on the running instance (2026-09-14). No feature is claimed here that
has not been exercised.

## Intent

Run **daptin** locally as the backend/API and admin surface, and use the
frontend in `web/` as the operator console for reading and writing records of a
table. The repository is `test-v6`; `daptin/` holds the backend source and
runtime, `web/` holds the frontend.

## Current Behavior

| Surface | Path | Observed |
|---|---|---|
| Admin dashboard | `GET /` on `:6336` | 200, `Daptin Admin` single-page app (dashboard assets embedded in the binary) |
| Operator console | `GET /` on `:5173` | 200; sign-in, entity index, and per-table records (`web/`) |
| JSON:API | `/api/<table>` | 200 for `products`, `user_account`, `usergroup`, `action` |
| Actions | `/action/<type>/<action>` | `signin`, `signup`, `become_an_administrator` return 200 |
| Health | `GET /ping`, `GET /ready` | 200 (`pong`) |
| Statistics / OpenAPI / JS model | `/statistics`, `/api/openapi`, `/api/js_model` | served by daptin |

Authorization behavior on a business table created from
`daptin/schema/schema_products.yaml`:

| Caller | Operation | Observed |
|---|---|---|
| Anonymous | read, create, delete | 403 |
| Administrator | create / update / delete | 201 / 200 / 200 |
| Any caller | unknown entity id | 404 |

Anonymous access is denied at the table gate for that table. A table declared
without `AccessGroups` falls back to daptin's permissive default and **is**
writable by anonymous callers — see
`decisions/0002-business-table-authorization-pattern.md`.

## Product Contract In Force

- Every business table declares `AccessGroups` explicitly.
- Table rows are shared with the `users` group on creation; a
  row-shared-to-group table requires the join-table cascade patch to be
  deletable (see `decisions/0001-...`, `0002-...`).
- No mail delivery is configured, so flows that depend on email
  (password reset by mail, verified signup) do not complete; accounts work
  without confirmation.
- The operator console is read-and-write for `products`-style tables: it reads
  the schema from `/api/world`, lists records, adds records from schema-derived
  fields, and deletes records after inline confirmation. It does not edit
  existing records yet and offers no relation pickers.
- The console reports authorization instead of hiding it: a 403 on a table is
  rendered as an explicit denied state, and an unreachable backend is named as
  such with the command that starts it.

## Out Of Scope Right Now

- No product domain beyond the demonstration `products` table.
- No editing of existing records, no relation pickers, no file uploads.
- No deployment story for `web/`: it is served by the Vite dev server only.
- No network exposure beyond `127.0.0.1`; no TLS; no SMTP.
- No API plan/metering configuration in use.

## Open Questions (authority missing — do not invent)

1. What product domain and entities will replace the `products` demonstration
   table, and who may write them (administrators only, or any signed-in user)?
2. Resolved 2026-09-14: the console calls the API through the dev proxy and holds
   the JWT in `localStorage` for now — see
   `decisions/0004-web-session-and-api-access.md` for the limits before any
   non-local deployment.
3. Resolved 2026-09-14: `web/` serves from `:5173` with no CORS change to the
   backend. Still open: whether a deployed build shares an origin with the
   backend or goes through a reverse proxy.

## Evidence

- `docs/RUNBOOK.md` (commands used for every row above)
- `daptin/schema/schema_products.yaml`
- `daptin/docker-compose.override.yml`
- Session verification recorded in `docs/plans/completed/` if a plan was used
