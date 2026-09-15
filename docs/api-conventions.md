# API Conventions

Date: 2026-09-15

Provenance: replaces `470bf41:docs/api-conventions.md`, which pinned the daptin
wire contract removed in `366ac21`. Every status code and response shape below
was observed live against `web/` on 2026-09-15; nothing is asserted from memory
or from framework documentation.

## 1. Surface

The application is one Next.js process with Payload embedded, so the surface is:

| Surface | Path | Notes |
|---|---|---|
| Collection REST | `/api/<collection>` | Payload-generated; `GET /api/products` observed 200 |
| GraphQL | `/api/graphql` | Payload-generated; not exercised here |
| Admin panel | `/admin` | observed 200 |
| Storefront | `/` and its routes | observed 200 |
| Auth | `/api/users/me`, `/api/users/login` | observed below |

The daptin surfaces (`/action/<type>/<action>`, `/asset/...`, `/ping`) no longer
exist.

Two custom routes are planned and do not exist yet: the entitlement-gated
download route at `/downloads/{product}` (decision 0006) and the payment
provider webhook (decision 0004).

Versioning: there is no `/api/v1` prefix. `PLAN.md` §18's `/api/v1/...` paths are
the public storefront route contract, not the internal Payload API. `PLAN.md`
§33.8 requires a versioned API; that policy is unimplemented and the internal
API is Payload's default today. Adding a version prefix or a public API contract
is an open decision, not a convention.

## 2. Authentication And Authorization

Observed live:

| Call | Result |
|---|---|
| `GET /api/users/me` anonymous | **200** with body `{"user":null,"message":"Account"}` — anonymous identity is a success response with a null user, not 401 |
| `POST /api/users/login` with unknown email and wrong password | **401** |
| `POST /api/products` anonymous | **403** — collection access control denies creation |
| `POST /api/users` (registration) | permitted by `create: publicAccess` in `web/src/collections/Users/index.ts:15` |

Consequences for callers: branch on the response body for authentication state
(`GET /api/users/me`), and on the status code for authorization (403). Do not
treat 200 as proof of an authenticated user.

Roles are `admin` and `customer` only, default `customer`, with the first user
promoted to admin. The `PLAN.md` §5 five-role model and §22 matrix are
unimplemented; authorization rules that assume Seller, Moderator, Finance Admin,
or Super Admin cannot be written yet.

Token lifetime is configured as 1209600 seconds (14 days) in
`web/src/collections/Users/index.ts`.

## 3. Errors

Only these status classes are observed, and each is claimed only for the call
that produced it: 401 for failed login, 403 for an access-control denial, and
200 with a null payload for anonymous identity. Payload's general error body
shape is not asserted here because it was not exercised. Money conventions from
decision 0002 require that a refusal is distinguishable from success and is
never a success response with a flag; no money endpoint exists yet.

## 4. Pagination And Querying

Observed on `GET /api/products?limit=2&page=1`:

```json
{"docs":[],"hasNextPage":false,"hasPrevPage":false,"limit":2,"nextPage":null,
 "page":1,"pagingCounter":1,"prevPage":null,"totalDocs":0,"totalPages":1}
```

So pagination is `limit` plus `page` with a `docs` envelope and derived
`totalDocs` and `totalPages`. Filtering uses Payload's `where` syntax, which was
not exercised here and is therefore not documented. Decision 0007 records that
P0 search runs through this query surface and that diacritics, toneless matching,
and typo tolerance are accepted gaps until the search slice.

## 5. Idempotency

Nothing is implemented. BR-02 requires a unique constraint on
`payment_transactions (provider, provider_transaction_id)` and hides behind no
route yet. Purchase idempotency is required by `PLAN.md` FLOW-U03 and its
mechanism is undecided; the order slice owns that decision.

## 6. Rate Limits

None configured on any surface. `PLAN.md` §11.3 requires rate limiting and replay
protection on the payment webhook route, and §11.3 also states that a provider
allowlist never replaces signature verification. Both are unimplemented.

## 7. Honesty Marker

Everything in this document that is not explicitly marked as observed or planned
is absent. There is no authenticated money call to measure, no webhook route, no
download route, and no public API contract. Treat every "required by PLAN.md"
line above as a gap to close in the owning slice, not as current behaviour.
