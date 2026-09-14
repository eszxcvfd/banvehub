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

Authorization behavior, measured on a business table declared in `schema/` (the
original observation was made on the demonstration `products` table, which the
catalog slice retired when it took that table name):

| Caller | Operation | Observed |
|---|---|---|
| Anonymous | read, create, delete | 403 |
| Administrator | create / update / delete | 201 / 200 / 200 |
| Any caller | unknown entity id | 404 |

Anonymous access is denied at the table gate for that table. A table declared
without `AccessGroups` falls back to daptin's permissive default and **is**
writable by anonymous callers — see
`decisions/0002-business-table-authorization-pattern.md`.

The catalog slice (`schema/schema_catalog.yaml`, 2026-09-14) was verified by a
clean boot and by reading the result back out of the database: `categories`,
`software_types`, `tags`, `products`, `product_files`, and `product_previews`
exist with exactly the declared table-gate permissions (3, 3, 3, 3, 1, 3); the
`belongs_to` foreign keys `products.category_id`, `products.software_id`,
`categories.parent_id`, `product_files.product_id`, and
`product_previews.product_id` are `NOT NULL`; and `products` ↔ `tags` uses
daptin's generated join table `products_products_id_has_tags_tags_id` rather than
a hand-written `product_tags`. Anonymous and signed-in non-administrator
`POST /api/products` and `POST /api/product_files` return 403.

Not yet proven: row-level visibility of a draft versus a published product. The
publish flow that would grant guests read on a published row does not exist yet,
so today no product row is readable by a guest at all.

Money path (implemented and proven live 2026-09-14, decision 0006):
`schema/schema_wallet.yaml` declares owner-scoped `wallets` and append-only
`wallet_ledger`; the only write surface is the `$wallet` action performer
(`wallet_create`, `wallet_credit`, `wallet_debit`). Observed: credit/debit move
the balance with a chained ledger row (`balance_before`/`balance_after`); a
debit above the balance is refused with HTTP 409 `insufficient_funds` and
writes nothing; malformed amounts are refused with HTTP 400; direct
`POST`/`PATCH`/`DELETE /api/wallets|/api/wallet_ledger` return 403 for
anonymous and signed-in non-administrators (the administrator case could not be
measured — no administrator credential is available); ledger `UPDATE`/`DELETE`
and wallet `DELETE` are refused at the database level for every role. Full
evidence: `docs/plans/active/kientaohub-phase-0.md`.

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

1. Stated by the repository owner on 2026-09-14 in `PLAN.md`: the product is
   KienTaoHub, a marketplace for CAD/design files, with the entities listed in
   its §17 and the roles and write permissions in its §5 and §22. Not yet
   implemented in this repository — the P0 scope, the financial state machine,
   and the payment provider are still open Phase 0 items, tracked in
   `docs/plans/active/kientaohub-phase-0.md`; the architecture that will build it
   is `docs/decisions/0005-kientaohub-builds-on-daptin.md`.
2. Resolved 2026-09-14: the console calls the API through the dev proxy and holds
   the JWT in `localStorage` for now — see
   `decisions/0004-web-session-and-api-access.md` for the limits before any
   non-local deployment.
3. Resolved 2026-09-14: `web/` serves from `:5173` with no CORS change to the
   backend. Still open: whether a deployed build shares an origin with the
   backend or goes through a reverse proxy.

## Evidence

- `docs/RUNBOOK.md` (commands used for every row above)
- `schema/schema_catalog.yaml`
- `daptin/docker-compose.override.yml`
- Session verification recorded in `docs/plans/completed/` if a plan was used
