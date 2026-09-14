# Application Runbook: Operator Console (`web/`)

Second surface of the same system; the backend has its own runbook in
`RUNBOOK.md`. Every command and observation here was executed on 2026-09-14.

## Scope

The Vue console in `web/`: signing in against the backend, reading the schema,
reading records of a table, adding a record, and deleting a record. Covers start,
readiness, how to get back to a known state, the interface contract, evidence
retrieval, cleanup, and validation.

## Prerequisites

- The backend running and ready — follow `RUNBOOK.md` first. The console proves
  nothing without it.
- Node.js 24 and npm 11 (**observed**: `node v24.19.0`, `npm 11.17.0`).
- Free TCP port `5173` on `127.0.0.1` — **defaulted** by `vite.config.ts`
  (`server.port`).
- Dependencies installed: `npm install` in `web/` (**required** on a fresh
  checkout).
- An account from the backend. The console never creates accounts, and no
  credentials are stored in this repository.

## Start

```sh
cd web
npm install
npm run dev
```

- Dev server: `http://localhost:5173/` (**observed**).
- Backend target for the proxy: `http://127.0.0.1:6336`, **configurable** with
  `DAPTIN_URL=<url> npm run dev`.
- Proxied prefixes: `/api`, `/action`, `/jsmodel`, `/aggregate`, `/_config`,
  `/ping`, `/ready`.
- Writable state owned by this surface: the token in browser `localStorage`
  (keys `daptin.token`, `daptin.email`) and records created through the console,
  which live in the backend database.

## Readiness

```sh
curl -fsS -o /dev/null -w '%{http_code}\n' http://127.0.0.1:5173/        # 200
curl -fsS http://127.0.0.1:5173/ping                                     # pong (proxy to the backend)
```

The first request also proves the proxy: `pong` comes from daptin, not from Vite.
In the browser, readiness is the sign-in screen rendering; an unreachable backend
is named in the console with the command that starts it.

## Deterministic State

- **Sign out** (button in the top strip) clears `localStorage` and returns to
  `/signin`. Signing out does not revoke the JWT in the backend.
- **Full reset of the surface**: clear site data for `http://localhost:5173` in
  the browser, or run in a fresh profile.
- **Record state** belongs to the backend: an empty `products` table is produced
  by the reset procedure in `RUNBOOK.md`. Deleting a record through the console
  also removes its `products_..._has_usergroup_...` join row (the cascade patch
  in `decisions/0001-...`).
- The console does not seed data. To get back to "no records", delete the records
  it created.

## Interface

| Route | Behavior |
|---|---|
| `/signin` | email + password form; posts to `POST /action/user_account/signin` |
| `/` | index: every table the account can read, its column count, the columns this console can write, link into records |
| `/t/<table>` | ledger of that table's records, with "Add a record" and per-row "Delete" |
| any other path | redirected to `/signin` when no token is present |

Observed behavior worth knowing:

- Unauthenticated `/` redirects to `/signin?next=/`.
- The rail lists the schema read from the backend (39 tables on this instance,
  most of them `is_top_level`).
- **Add a record** builds its fields from the table's own schema: `label`,
  `measurement`, `url`, `text`, and `boolean` columns only; relations and
  bookkeeping columns are not offered. A dialog with no writable column shows
  that as a message instead of a broken form.
- After a successful add the dialog closes (Ark UI keeps the closed dialog
  mounted; `data-state="closed"` and the `hidden` attribute are the observable
  signals — presence of the element in the DOM is not).
- **Delete** asks inline first ("Delete record <id>? This cannot be undone."),
  then sends `DELETE /api/<table>/<id>`.

## Runtime Evidence

```sh
# dev server output: startup, proxy errors, HMR
# (whatever the shell that ran `npm run dev` captures)

# browser console: the app records nothing on its own; watch for errors there
# Vue DevTools is served at http://localhost:5173/__devtools__/
```

Observed on the verified journey: **no browser console errors** at any step
(sign-in, index, records, add, delete), and no Vue warnings. Network failures
surface in the UI as described in "Interface" rather than as console noise.

## Ownership And Cleanup

- The dev server process started by `npm run dev` is owned by the run that
  started it; stop it with Ctrl-C or by killing that process.
- `web/dist/` is build output; `web/node_modules/` is installed dependencies.
  Both are disposable.
- The console owns no backend resources. Records it created remain until they are
  deleted; the backend database is shared with the dashboard and the API.

## Validation

Automated, from `web/`:

```sh
npm run test         # vitest: schema parsing, URL building, error mapping
npm run type-check   # vue-tsc
npm run lint         # oxlint + eslint
npm run build        # type-check + production build
```

Real-interface journey, against a running backend (performed 2026-09-14):

| Step | Observed |
|---|---|
| Open `http://localhost:5173/` with no token | redirected to `/signin?next=/` |
| Sign in with the administrator account | lands on `/`; top strip shows `backend ok` and the account email |
| Index | "39 tables, 39 of them primary"; each row links into records |
| Open `/t/products` with no records | empty state inviting the first record |
| Add a record (`name` = "Bàn làm việc", `price` = 1250000) | "1 record in this table"; ledger shows the row and its real `id`; dialog closes |
| Add a second record | "2 records in this table" |
| Delete one record through the inline confirmation | "1 record in this table"; the deleted row is gone |
| Browser console after all steps | no errors |

## Unknowns

- No production deployment path: the built app expects the same proxied paths
  (`web/README.md`), and neither a reverse proxy nor a CORS change has been
  chosen.
- The JWT is in `localStorage`; an XSS would expose it. Recorded, not solved, in
  `decisions/0004-web-session-and-api-access.md`.
- No mobile viewport emulation was available in the verification environment, so
  narrow-width behaviour is designed (Tailwind breakpoints, intrinsic layout) but
  not measured.
- No committed end-to-end test: the journey above is manually driven through the
  browser, and the unit tests cover only pure helpers.
- Relation pickers, editing existing records, and file upload are not built.
