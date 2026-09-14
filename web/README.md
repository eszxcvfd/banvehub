# daptin records (`web/`)

Frontend for the local daptin backend. It reads the backend's own schema and
lets an operator read, add, and delete records of a table — and it shows what the
signed-in account is allowed to do.

## Stack

| Piece | Choice | Why |
|---|---|---|
| Framework | Vue 3 + Vite + TypeScript | owner's request; `create-vue` supplies a maintained toolchain (ESLint, Prettier, Vitest) |
| Components | [Ark UI Vue](https://ark-ui.com) | headless primitives with correct ARIA and focus behaviour; used for dialog, pagination, and form fields |
| Styling | Tailwind CSS v4 | Ark UI documents styling through data attributes, which reads directly in markup |
| State | Pinia | session and schema stores |
| Routing | Vue Router | `signin`, index, and per-table record routes |
| Type | IBM Plex Serif / Sans / Mono (self-hosted via `@fontsource`) | one superfamily, three roles: headings, interface text, and data |

## Run it

The backend must be running first — see `../docs/RUNBOOK.md`.

```sh
npm install
npm run dev          # http://localhost:5173
```

Other commands:

```sh
npm run test         # unit tests (vitest run)
npm run type-check   # vue-tsc
npm run lint         # oxlint + eslint (fixes in place)
npm run build        # type-check + production build into dist/
npm run preview      # serve the built output
```

## How it talks to the backend

The dev server proxies `/api`, `/action`, `/jsmodel`, `/aggregate`, `/_config`,
`/ping`, and `/ready` to `http://127.0.0.1:6336`, so the browser sees a single
origin and the backend needs no CORS configuration during development. Override
the target with `DAPTIN_URL=<url> npm run dev`.

A production build emits static files; whatever serves them must route the same
paths to the backend, or the proxy equivalent must be reproduced there.

Sign in goes through `POST /action/user_account/signin`; the returned JWT is kept
in `localStorage` and sent as `Authorization: Bearer`. The limits of that choice
are recorded in `../docs/decisions/0004-web-session-and-api-access.md`.

## What the app shows

- **Index (`/`)** — every table the account can read, with the columns this
  console can write and a link into its records.
- **Records (`/t/<table>`)** — a ledger of the table's records: monospaced data
  cells with right-aligned numerics, `id` first, `created_at`/`updated_at` kept
  as provenance. States: loading, empty, access denied (403), backend
  unreachable, unknown table.
- **Add a record** — a dialog whose fields are derived from the table's own
  schema (label, measurement, url, text, boolean). Relations and bookkeeping
  columns are not offered.
- **Delete** — inline confirmation per row before the request is sent.

## Structure

```text
src/
  lib/daptin.ts             typed backend client (pure parsing helpers are unit-tested)
  stores/session.ts         JWT + signed-in email
  stores/schema.ts          entity list read from /api/world
  layouts/ConsoleLayout.vue top strip, schema rail, main pane
  views/                    SignInView, IndexView, RecordsView
  components/               LedgerTable, NewRecordDialog
```

## Not built yet

- Relation pickers and editing existing records (only create and delete).
- Server-side session or httpOnly cookie auth (see decision 0004).
- Deployment: sharing the origin with the backend, TLS, and a production-ready
  serving strategy.
