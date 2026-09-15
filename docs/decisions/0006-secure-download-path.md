# 0006 Secure-Download Path

Date: 2026-09-15

Provenance: restored from `470bf41:docs/decisions/0010-kientaohub-secure-download-path.md`
(accepted 2026-09-14). The intent and its honest framing are retained; the
mechanism is restated for Payload, where the daptin asset-proxy route and the
`PresignGetObject` patch plan no longer exist.

## Status

Accepted

## Context

`PLAN.md` FR-17 (`PLAN.md:689-716`) requires intent-controlled download of
purchased files: short-lived access and abuse detection. FR-16
(`PLAN.md:668-687`) makes entitlement its own entity rather than something
inferred from an order. BR-06 (`PLAN.md:1424-1432`) requires the object storage
bucket holding sold files to be private, with no fixed public URL. FR-18
(`PLAN.md:718-738`) requires a free-file path that still creates an entitlement.
`PLAN.md` §4.2 puts DRM beyond MVP scope, so download control is server-side
authorization, not client protection.

Observed today: files are not modelled as digital goods at all. The template's
`media` collection stores uploads on local disk and serves them through public
paths, with no entitlement, no download event, and no private-originals concept.
No object storage adapter is installed.

## Decision

Download is entitlement-gated and served through an authenticated application
route, not by a public URL.

1. `GET /downloads/{product}` (exact path fixed by FR-17) authenticates the
   request, checks an entitlement row for the user and product, checks that the
   product file is in a servable state, records a download event, and then
   serves or redirects to the bytes.
2. Access is granted by a short-lived one-time token with a lifetime between one
   and ten minutes per FR-17. The exact value is owner policy and is not fixed
   here.
3. Originals stay private. Preview images are separate assets and never the
   original file (FR-05, FR-06); the storage bucket holding originals is
   private and no fixed public URL is rendered (BR-06).
4. Free downloads also create an entitlement (FR-18), so download history and
   abuse signals exist for free products.
5. Download events are recorded per attempt, which is the P0 answer to FR-17's
   abuse-detection requirement; heuristic bot detection and download caps are
   Phase 5 hardening, not this decision.

Honest re-framing, required reading: FR-17's literal wording asks for a signed
storage URL with a short TTL. A one-time application token meets the
intent-control goal without a shareable URL, but it is not a presigned storage
URL, and the bytes transit the application server. When object storage and a CDN
arrive, the sanctioned upgrade is a short-TTL presigned GET from that store with
a redirect, replacing the proxy path. That upgrade needs no new architecture
decision, only the storage slice and its configuration.

## Alternatives Considered

1. **Presigned storage URL first** — viable now that the platform is Node and
   Payload rather than the removed daptin image, but rejected for P0 because no
   object storage adapter or bucket exists yet; adopting it before the storage
   slice would order the work backwards.
2. **A separate signing service holding storage credentials** — rejected for
   the same reason decision 0002 rejects a second money service: a second write
   authority for one concern.
3. **Static or public URLs** — rejected: forbidden by BR-06.
4. **Client-side protection (DRM)** — rejected by `PLAN.md` §4.2.

## Consequences

Positive:

- Every download is authenticated, entitlement-checked, and logged from the
  first version.
- No public URL exists to leak, and the path works with local disk storage
  before any bucket is chosen.

Tradeoffs:

- Proxy streaming couples download bandwidth to the application process until
  the storage and CDN slice lands.
- Token lifetime, download caps, and abuse heuristics stay open owner decisions.
- The route is a custom endpoint outside Payload's collection API, so its
  authorization must be reviewed as security-sensitive code.

## Follow-Up

- Phase 5: entitlement and download-event collections, the route, token
  lifetime decision, and integration with the purchase flow in decision 0005.
- Storage slice: choose object storage, move originals to a private bucket, then
  switch to presigned GET with redirect.
