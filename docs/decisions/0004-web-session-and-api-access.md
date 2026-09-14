# 0004 Web Session And API Access

Date: 2026-09-14

## Status

Accepted

## Context

`web/` is the first consumer of the backend API. Three choices had to be made
before any code was written, and each is observable from outside the app:

1. **Stack.** The repository owner asked for Vue with Ark-UI-style primitives
   and delegated the remaining technology choices.
2. **How the browser reaches the backend.** The backend listens on
   `127.0.0.1:6336`; a Vite dev server on `:5173` is a different origin, and
   daptin ships `cors.allowed_origins` empty (`server/cors.go`,
   `wiki/API-Reference.md`).
3. **Where the JWT lives.** daptin authenticates with a bearer token returned by
   `POST /action/user_account/signin`; something in the browser has to hold it.

`docs/product/overview.md` recorded questions 2 and 3 as open for exactly these
reasons.

## Decision

- **Stack:** Vue 3 + Vite + TypeScript, scaffolded with `create-vue`
  (ESLint, Prettier, Vitest included), Tailwind CSS v4 through
  `@tailwindcss/vite`, Ark UI Vue as the headless component layer, Pinia for
  state, Vue Router for the three routes, and self-hosted IBM Plex.
- **Transport:** the dev server proxies `/api`, `/action`, `/jsmodel`,
  `/aggregate`, `/_config`, `/ping`, and `/ready` to
  `http://127.0.0.1:6336` (`DAPTIN_URL` overrides the target). No CORS
  configuration is added to the backend for development.
- **Session:** the JWT is stored in `localStorage` under `daptin.token` and sent
  as `Authorization: Bearer`. Signing out is client-side; the token stays valid
  in the backend until it expires (3 days by default) or `auth_version` is
  bumped by a password change.

## Alternatives Considered

1. **Enable CORS on the backend for `http://localhost:5173` and call it
   directly.** Rejected for now: it widens the backend's browser-facing surface
   for a development-only convenience, and it would have to be revisited anyway
   for deployment.
2. **Same-origin deployment from the start** (build `web/` into something the
   backend serves). Rejected as premature: the app's shape is still changing, and
   the proxy already provides the same-origin behaviour during development.
3. **httpOnly cookie session through a server-side proxy in `web/`.** The safer
   end state for a deployed app, but it requires a server component that does not
   exist yet; recorded as follow-up rather than built speculatively.

## Consequences

Positive:

- The backend needs no CORS change and keeps its `127.0.0.1`-only exposure.
- One request path (`/api/...`) works in development and can be reproduced by
  any reverse proxy in deployment.
- The stack is the mainstream Vue toolchain, so `create-vue`'s update path
  remains available.

Tradeoffs:

- **A JWT in `localStorage` is readable by any script on the page.** Acceptable
  for a local operator console on a single machine; not acceptable for a public
  deployment. Any XSS in this app or its dependencies would expose the token.
- The dev proxy is development-only. A production build served from a different
  origin than the backend needs either a reverse proxy or CORS, and that decision
  is deferred.
- The frontend depends on backend response shapes by hand: `world_schema_json`
  field names, `is_top_level`, and daptin's `client.store.set` sign-in response
  are all inferred from the running backend and are not schema-versioned.

## Follow-Up

- Before any non-local deployment: replace the `localStorage` token with an
  httpOnly cookie session behind a server-side proxy, and add a Content Security
  Policy.
- Decide the production serving strategy (same origin vs reverse proxy vs CORS)
  and record it as its own decision.
- If daptin's `world` payload ever changes shape, the parsing helpers in
  `web/src/lib/daptin.ts` are the single place to update, and they are covered by
  unit tests with fixtures taken from the real response.
