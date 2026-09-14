# Execution Plan: `web/` Frontend Scaffold

Date: 2026-09-14

## Status

Completed

## Outcome

`web/` contains a runnable Vue frontend that authenticates against the local
daptin backend and lists records of a business table through the real API.

Observable result:

- `npm run dev` in `web/` serves the app; `/` renders without console errors.
- Signing in with the administrator account stores a session; signing out clears
  it.
- The entity list is read from the backend (`/api/world`), not hard-coded.
- Records of `products` render from `GET /api/products`, and the anonymous case
  shows the backend's 403 as an explicit denied state.
- `npm run build` and `npm run test` pass.

## Context

- `docs/product/overview.md` — product intent, current backend behavior, and
  open questions 1–3.
- `docs/ARCHITECTURE.md` — `web/` is reserved and empty; backend surface is
  `127.0.0.1:6336` (JSON:API `/api/*`, actions `/action/*`).
- `docs/RUNBOOK.md` — start/readiness/validation for the backend this app needs.
- `docs/decisions/0002-business-table-authorization-pattern.md` — anonymous
  callers get 403 on business tables; the UI must surface that state.

## Scope

In scope:

- Vite + Vue 3 + TypeScript app shell in `web/`, Tailwind CSS v4, Ark UI Vue as
  the headless component layer, Vue Router, Pinia, ESLint, Vitest.
- Typed daptin API client (`/api/*`, `/action/*`) with JWT session handling.
- Dev proxy from the Vite dev server to `127.0.0.1:6336` so no CORS
  configuration is required during development.
- Two screens: sign-in and an entity list for `products`.
- A design-token layer (color, type, layout) and one shell layout.

Out of scope:

- Record editing dialogs beyond what the list needs, file uploads, GraphQL,
  i18n, SSR, API metering screens.
- Deploying `web/` anywhere; no CORS or TLS changes to the backend.
- Replacing the daptin dashboard, which stays at `/`.

## Approach

1. Scaffold with `create-vue` (TypeScript, Router, Pinia, ESLint, Vitest).
2. Add Tailwind v4 through `@tailwindcss/vite`, Ark UI Vue, self-hosted IBM Plex
   fonts through `@fontsource`.
3. Add a Vite dev proxy for `/api`, `/action`, `/jsmodel`, `/_config`.
4. Write the API client and auth store first, then the shell, then the two
   screens.
5. Validate with typecheck, unit test, production build, and a real browser
   journey against the running backend.

## Risks And Recovery

- **Backend not running** — the UI cannot prove anything. Mitigation: start the
  stack first (`docs/RUNBOOK.md`); the app must show a clear unreachable state
  instead of a blank screen.
- **Bleeding-edge dependency majors** (Vite 8, TypeScript 7 era) — mitigation:
  rely on `create-vue`'s own version matrix rather than pinning versions by hand;
  if the build breaks, fall back to the versions `create-vue` selected.
- **JWT in browser storage** — acceptable for a local operator tool, not for a
  public deployment; recorded as a decision with its limits.
- Recovery: `web/` is additive; deleting the directory restores the previous
  state because nothing else depends on it.

## Progress

- [x] Scaffold `web/` with the agreed feature set
- [x] Add Tailwind v4, Ark UI Vue, fonts, dev proxy
- [x] API client + auth store
- [x] App shell + design tokens
- [x] Sign-in screen
- [x] Entity list screen (records, empty, denied, unreachable states)
- [x] Validation: typecheck, unit test, build, browser journey
- [x] Update `ARCHITECTURE.md`, `product/overview.md`, `RUNBOOK.md`, decision record

## Decisions

- 2026-09-14: Vue 3 + Vite + TypeScript with Ark UI Vue as the headless
  component layer (owner asked for Vue with Ark-UI-like primitives and delegated
  the remaining stack choice).
- 2026-09-14: Tailwind CSS v4 rather than plain CSS, because Ark UI documents
  data-attribute styling and Tailwind renders that directly in markup.
- 2026-09-14: Self-hosted IBM Plex (Serif/Sans/Mono) instead of a CDN font, so
  the app has no runtime dependency on a font host.
- 2026-09-14: Promoted `web/` stack, transport, and session handling into
  `docs/decisions/0004-web-session-and-api-access.md`.
- 2026-09-14: The index screen (not just a redirect) is the landing page, because
  "what does the backend hold" is the console's first question.
- 2026-09-14: `create-vue` shipped `eslint-plugin-oxlint@~1.73.0` alongside
  `oxlint@~1.74.0`, which made `npm install` fail with ERESOLVE; both were moved
  to `~1.82.0`, the newest matching pair.

## Validation

- Focused proof: `npm run test` — 10 tests over schema parsing (including the
  empty-`ForeignKeyData` shape daptin really returns), list-URL building, and
  error mapping for JSON:API and daptin notify payloads. `npm run type-check`,
  `npm run lint`, and `npm run build` all pass.
- Integration or end-to-end proof: browser journey against the running backend —
  unauthenticated `/` redirected to `/signin?next=/`; sign-in landed on the
  index ("39 tables, 39 of them primary", `backend ok`, account email); `/t/products`
  showed its empty state; adding a record reported "1 record in this table" and
  rendered the row with its real `id`; a second add reported 2; deleting one
  through the inline confirmation returned to 1 and removed its row. No browser
  console errors at any step. Recorded in `docs/RUNBOOK-web-console.md`.
- Repository-required checks: none configured for `web/` beyond the npm scripts
  above; the Harness core has no CI in this repository.

## Result

Verified outcome: the console signs in against the local daptin backend, reads
the schema from `/api/world`, lists a table's records, creates records from
schema-derived fields, and deletes records after an inline confirmation. Styling
uses a deliberate token system (cool paper, blue-black ink, crimson ruling, IBM
Plex in three roles); measured: `ink`/`paper` contrast 14.23:1, `slate`/`paper`
5.21:1, no horizontal overflow at 1920px, 2px radius on controls.

Two defects were found by running the app rather than by reading it, and both are
fixed with regression cover:

1. `editableColumns` treated every column as a relation, because daptin sets an
   empty `ForeignKeyData` on plain columns; the add-record dialog offered no
   fields. Fixed by mirroring daptin's own rule
   (`IsForeignKey === true && ForeignKeyData.DataSource === 'self'`) and adding a
   fixture with the real shape.
2. The ledger showed `—` for `id`, because daptin puts the id on the resource
   rather than inside `attributes`; `loadRecords` now carries it across.

Limitations:

- Only create and delete are implemented; editing, relation pickers, and file
  upload are not.
- The JWT lives in `localStorage` and signing out does not revoke it.
- The browser journey is manual; no end-to-end test is committed.
- Narrow-viewport behaviour was designed but not measured (no viewport emulation
  available in the verification environment).

Follow-up: the same items are listed under "Unknowns" in
`docs/RUNBOOK-web-console.md` and under "Follow-Up" in decision 0004.
