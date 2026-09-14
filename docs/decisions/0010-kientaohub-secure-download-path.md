# 0010 Secure-Download Path

Date: 2026-09-14

## Status

Accepted

## Context

`PLAN.md` FR-17 requires intent-controlled download of purchased files:
short-lived access, abuse detection. What the repo proves today:
files are proxied by `GET /asset/{table}/{id}/{column}` with
per-request table-and-row permission checks
(`daptin/server/server.go:564`;
`daptin/server/asset_route_handler.go:72-91,:159-163,:174-183,:407-423,:518-524`);
cloud upload stores metadata only
(`daptin/server/resource/dbmethods.go:3551-3558`). Presigning exists
for UPLOAD ONLY (`PresignPutObject`/`PresignUploadPart`, fixed
one-hour TTL — `daptin/server/asset_presigned_url.go:186-189,:252-268,
:273-293`); `PresignGetObject`, `X-Amz-Expires`, a `/downloads/*`
route, and any redirect-to-storage are absent (grep-verified).
`product_files` is table-gate 1 with owner-only rows
(`schema/schema_catalog.yaml:222-228`); no guest can read a product
row yet (publish flow pending, phase-0 plan row 205).

Authority: decision 0005 Follow-Up (download path reserved as its own
decision); phase-0 plan Context rows 67-78.

## Decision

Entitlement-gated proxy download inside daptin. A Phase 1 `$download`
Go action performer (`POST /action/products/download`) verifies
entitlement, logs a `download_events` row, and serves bytes through
daptin's existing per-request permission-checked asset streaming path
(`daptin/server/server.go:564`), fronted by a short-TTL one-time token
(1–10 min per FR-17, `PLAN.md:705-707`). FR-17's intent-control goal
is met without a shareable URL.

Honest re-framing (required reading): FR-17's literal "signed URL ngắn
hạn" wording is NOT met by this mechanism — there is no presigned
storage URL, only a one-time proxy token. When public
deployment/CDN arrives, `PresignGetObject` becomes the sanctioned
15th daptin patch with `GET /downloads/{product}` + 302. That trigger
condition is pre-approved here; no new architecture decision is needed
then, only the patch record.

No live administrator HTTP measurement exists for the download path
(the same standing credential gap as the money path); enforcement is
row-permission + entitlement-check by construction.

## Alternatives Considered

1. **Presign-first** — rejected: a 15th patch on hot upstream storage
   code before any deployment exists (decision 0001 patch-cost
   discipline).
2. **A separate signing service holding storage credentials** —
   rejected: a second write-path authority, for the same reason 0006
   rejected a separate money service.
3. **Static/public URLs** — rejected: forbidden by §42.1 (never
   publish original files by static URL).

## Consequences

Positive:

- Zero new daptin patches; download rides the measured asset path.
- Every download is entitlement-checked and logged from day one.

Tradeoffs:

- Proxy streaming couples download bandwidth to the daptin process
  until the CDN trigger fires (§42.9 noted; accepted for P0 local-only).
- Bot-download heuristics (FR-17:711-714) and scan caps are Phase 1
  upload/download-slice work, not here.

## Follow-Up

- Phase 1: `$download` performer, `download_events` table (decision
  0007 entity list), one-time-token TTL final value (owner policy;
  1–10 min until set), entitlement enforcement wiring to the order
  slice.
