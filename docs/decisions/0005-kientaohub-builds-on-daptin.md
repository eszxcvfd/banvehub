# 0005 KienTaoHub Builds On Daptin

Date: 2026-09-14

## Status

Accepted

## Context

`PLAN.md` (KienTaoHub v1.0, 2026-09-14) defines a Vietnamese marketplace for
CAD/design files and technical documents: catalog with SEO as a P0 channel,
wallet + ledger + payment, entitlement + secure download, seller earnings and
withdrawal, moderation, and an admin CMS. Its §27 puts Phase 0 (Product
Definition) before any implementation, and §43/§34 propose a from-scratch **Go
modular monolith + Next.js** in a new monorepo layout.

This repository already runs a different, verified system: a locally patched
**daptin** (Go, LGPL-3.0) with PostgreSQL
(decision [0001](0001-run-locally-patched-daptin-image.md)), a tested
authorization pattern (decision
[0002](0002-business-table-authorization-pattern.md)), database-as-config
handling (decision [0003](0003-database-config-merge-rebuild.md)), and a working
Vue operator console over the JSON:API (decision
[0004](0004-web-session-and-api-access.md)). `PLAN.md` never mentions daptin or
Vue, so the two documents describe two different architectures for one product.

The repository owner decided on 2026-09-14 to build KienTaoHub **on** daptin
rather than replace it. Capability research against the checked-out source
(`daptin/server/**`, `daptin/wiki/**`, 2026-09-14) established what daptin
already covers and what it does not; those findings are recorded in
`docs/plans/active/kientaohub-phase-0.md` with file-and-line evidence rather than
repeated here.

## Decision

- **daptin stays the backend and API of record.** Its JSON:API, custom actions,
  permission system, state tracking, audit tables, asset storage, PostgreSQL,
  and the existing schema/config workflow are inherited instead of rebuilt.
  `PLAN.md` §43's "backend language: Go" is satisfied by daptin itself; a
  second from-scratch Go service is not created for the areas daptin already
  owns.
- **A separate Next.js storefront serves the SEO-critical public surface**
  (homepage, category, product detail, sitemap, robots, structured data). It
  reads daptin through the JSON:API and owns all rendering, caching, and
  indexability. daptin's own subsites/routed templates are not used for the
  product catalog.
- **The `web/` Vue console becomes the operator/admin console** of the same
  product, remaining the surface where the repository's verification journey is
  run.
- **Money-moving tables are read-only through the generic API.** Tables such as
  `wallets`, `wallet_ledger`, `orders`, `order_items`, `entitlements`,
  `seller_earnings`, and `withdrawals` declare no Create, Update, or Delete for
  any group; every mutation happens inside a custom action that is gated by its
  own Execute permission. This is required by `PLAN.md` §42 items 3 and 6 and
  §12.2, and it is what keeps the verified single-transaction behaviour of
  actions (`daptin/server/resource/handle_action.go:120-137`) from being
  bypassed by a direct `POST/PATCH/DELETE /api/<table>`.

## Alternatives Considered

1. **Replace daptin and the Vue console with the from-scratch stack of
   `PLAN.md` §43/§34.** Rejected: it discards verified local patches (decision
   0001), the tested authorization pattern (0002), the database-config workflow
   (0003), and a working console (0004), and it duplicates in new code what
   daptin already provides.
2. **Keep this repository as a daptin console only and build KienTaoHub
   elsewhere.** Rejected by the owner: `PLAN.md` is the product this repository
   is for.
3. **Keep daptin for admin and catalog, but write a separate Go service for the
   money paths.** Not rejected outright; deferred until the Phase 0 spike shows
   whether daptin's transaction and permission model is sufficient. If the spike
   fails, this becomes the fallback and is promoted to its own decision record.

## Consequences

Positive:

- Auth, RBAC, per-row permissions, custom actions, state tracking, audit
  tables, asset storage, and PostgreSQL are inherited rather than built.
- A custom action already runs inside one `sqlx.Tx` and rolls back on error, so
  a multi-table money operation has a transaction to live in.
- The operator console and its verification journey keep working against the
  same backend the storefront will use.

Tradeoffs:

- **Every missing capability becomes another local daptin patch.** daptin is
  LGPL-3.0 and already carries thirteen patched files; upstream upgrades must
  rebase them (decision 0001). Verified gaps: there is no download-side signed
  URL (only `PresignPutObject`, fixed one-hour TTL), so `PLAN.md` FR-17 needs
  new code; daptin's state machine has one Execute gate per `smd` row and no
  per-transition permission, so moderator-versus-admin separation needs a
  wrapper action; audit records a before-image only, has no `reason` field, and
  writes nothing on CREATE; there is no full-text search, so Vietnamese search
  needs an external index.
- **Append-only ledger is not enforced by the platform.** Action outcomes run
  with the administrator group appended, and an administrator bypasses table
  permission by platform rule (`wiki/Permissions.md:242`,
  `server/resource/middleware_tableaccess_permission.go:88-90`). Measured on
  2026-09-14 (`docs/plans/active/kientaohub-phase-0.md` → Validation): direct
  `POST/PATCH/DELETE` on a money table returns 403 for anonymous and for
  signed-in non-administrators, an action rolls both writes back when one
  outcome fails, and a conditional debit held its guard — but an administrator
  cannot be denied by permission bits, the per-table audit records a before-image
  with no actor column and nothing at all on CREATE, and the caller gets no
  signal whether the guard applied.
- **SEO and caching move entirely to Next.js**: daptin serves no sitemap or
  robots, and its list API sends no cache directives.
- daptin's documentation disagrees with its code in at least three places
  (CORS config key, relation-include parameter, whether DELETE is audited);
  every contract must be verified against source before it is relied on.

## Follow-Up

- Choose the secure-download path: extend daptin with a presigned GET plus a 302
  redirect (a fourteenth local patch), or add a separate signing service that
  checks entitlement through daptin and holds the storage credentials. Record
  it as its own decision.
- Choose the search engine (Meilisearch/Typesense) and its index-sync path.
- Design and test ledger append-only enforcement, including a negative test that
  direct `POST/PATCH/DELETE` on every financial table returns 403 for anonymous
  and for signed-in non-administrators. Administrators bypass table permission
  by platform rule, so their path must be closed by design — no human account in
  the `administrators` group for money tables, a dedicated action identity, or a
  local patch — and the decision must state which.
- Decide how the wallet/ledger action is implemented: a small Go action
  performer inside daptin, or a schema-only `$transaction query` action whose SQL
  is concatenated from caller input (no bound parameters) and which cannot report
  whether the guard applied.
- Choose the payment provider; `PLAN.md` FR-12 lists SePay/bank QR, VNPay, MoMo,
  and ZaloPay and none is selected.
- Production serving strategy remains open from decision
  [0004](0004-web-session-and-api-access.md), now covering two frontends.
- Product policy and the data model are now under version control (2026-09-14):
  `PLAN.md` is tracked, and the schema moved out of the ignored `daptin/` tree to
  `schema/` at the repository root, mounted back in by
  `daptin/docker-compose.override.yml`. Before this, both existed only on one
  machine.
