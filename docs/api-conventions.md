# API Conventions (daptin wire contract of record)

Version: 1.0 — 2026-09-14. Pinned to `daptin-local:v0.13.9-patched`
behavior. Every rule below is validated by an already-executed probe
(phase-0 plan Validation rows) or a `file:line` citation. No rule
asserts a capability not present in the repo.

## 1. Surface / versioning

The wire contract of record is daptin's actual surface:

- `GET/POST/PATCH/DELETE /api/<table>` (JSON:API).
- `POST /action/<type>/<action_name>` for custom actions.
- `GET /asset/{table}/{id}/{column}` for blobs
  (`daptin/server/server.go:564`).

No `/api/v1` prefix exists in the router (grep-verified absent from
`daptin/server/*.go`). `PLAN.md` §18's `/api/v1/...` paths
(`PLAN.md:2311-2324`) are SUPERSEDED as the internal API surface
(decision 0005: daptin is the API of record) and become the Next.js
storefront's own public route contract mapping onto `/api/<table>`.
No `/api/v1` alias layer is built — rejected as a daptin patch for
zero consumer benefit (decision 0001 patch cost); reverse-proxy
aliasing of daptin's action/asset routes is likewise rejected (it
bypasses the permission middleware the money proofs depend on).

Versioning = this document's version + the pinned daptin behavior:
additive schema/actions only; breaking JSON:API behavior changes
require an ADR (satisfies §33.8, `PLAN.md:3116`).

## 2. Auth

Bearer JWT from `POST /action/user_account/signin`. The token is
returned inside a `client.store.set` array entry
(`daptin/wiki/Authentication.md:43-69`; emitted at
`daptin/server/actions/action_generate_jwt_token.go:83`; extracted
from `Authorization: Bearer` / `?token=` / `token` cookie at
`daptin/server/auth/auth.go:135-137` — cite the right end: the
emission line is the action, the extractor lines are the middleware).

All four money actions require it (`Permission: 2097152` =
AuthenticatedExecute, `schema/schema_wallet.yaml:106,124,154,186`).
Money actions are row-owner-gated: a signed-in stranger cannot debit
a known wallet (measured — stranger-debit attribution proven in the
pg contract test; ledger `user_account_id` is the wallet's owner).
`localStorage` token storage (decision 0004) is acceptable local-only;
revisit before any non-local deployment.

## 3. Error taxonomy

Five classes, all measured. Callers branch on status+code, never on
200-with-flag (decision 0006 alternative 3):

| Class | Wire shape | Anchor |
|---|---|---|
| 400 validation | `invalid_amount` / `invalid_currency` | `daptin/server/actions/action_wallet.go:146,190`; schema validation `required,gt=0`, `schema/schema_wallet.yaml:136-138` |
| 403 denied | three named causes: (a) TableAccessPermissionChecker direct-write refusal — the financial denylist check at `daptin/server/resource/middleware_tableaccess_permission.go:91` precedes the administrator early-return at `:96` within the same `InterceptBefore` method; (b) `financial_write_denied` write-method action outcomes; (c) the AuthenticatedExecute action-gate refusal | middleware + `financial_guard.go`; `schema_wallet.yaml` action permissions |
| 404 unknown entity | missing id answers 404, not 500 | local patch `36b947f6` |
| 409 conflict | `insufficient_funds` — refused, NOTHING moved | `daptin/server/actions/action_wallet.go:221-227` |
| 5xx | mid-action failure with FULL rollback | `daptin/server/resource/handle_action.go:133-134` |

Documented quirk: bare `PATCH/DELETE /api/<table>` without an id
serves the SPA shell with HTTP 200 and no API effect (phase-0 plan
row 11) — clients always address by id.

## 4. Pagination

JSON:API offset only (`page[number]`, `page[size]`). Cursor
pagination is PROHIBITED — documented broken
(`daptin/wiki/Filtering-and-Pagination.md:490-495`). `contains`
requires caller-supplied `%` wildcards.

## 5. Idempotency

Webhook replay protection = the BR-02 unique constraint
`(provider, provider_transaction_id)` on `payment_transactions` —
lands with this package's schema step
(`schema/schema_payment.yaml`).

Money-action correlation: the wire InField is `reference_id`, mapped
by the performer to the ledger column `reference_code`, because
daptin reserves `reference_id` as the system bytea row identity and
silently drops a declared column with that name
(`schema/schema_wallet.yaml:69-76`). Current wire shape: the action
inputs keep the name `reference_id` (optional correlation label);
target contract: `reference_type` + `reference_id` become required
inputs, enforced when the schema step adds the validation. Both
states are stated here so no reader mistakes today's shape for the
target.

Purchase idempotency is required (FLOW-U03, `PLAN.md:1120-1122`:
"Endpoint purchase phải idempotent"); the client-generated
`order_code` mechanism is marked PROPOSED-UNVERIFIED and is decided
by the Phase 1 order ADR — not here.

## 6. Rate limits

daptin's per-IP route limiter via the `limit.rate` config (per-route
JSON limits, default empty = unlimited, `X-RateLimit-*` response
headers — `daptin/server/middleware_ratelimit.go:20,125-127`;
wired at `daptin/server/server.go:176-185,205`) plus
`limit.max_connections` default 100/IP (`server.go:168-171`).

Phase 1 defaults (stated as defaults, not guarantees): strict on
auth actions, moderate on `/api/*`, generous on the webhook route
plus a provider allowlist — an allowlist never replaces signature
verification (§11.3, `PLAN.md:1535`).

## 7. Standing honesty marker

No live administrator HTTP measurement exists for any rule in this
document — no obtainable credential; proof of the admin path is
mechanism-level (denylist ordering,
`TestFinancialDenylistBindsAdministrator`, role-independent
triggers). Every 403 claim above is measured for anonymous and
signed-in non-administrators over live HTTP.
