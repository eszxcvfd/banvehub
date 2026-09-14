# 0011 Search Engine

Date: 2026-09-14

## Status

Accepted

## Context

`PLAN.md` FR-04 (`PLAN.md:426-433`) requires: case-insensitive search,
Vietnamese support, toneless-keyword handling, reasonable typo
tolerance, suggest/autocomplete, search analytics. §26 lists "Search cơ
bản" as P0 and "Advanced search engine" as P1 (`PLAN.md:2699`); §43
scales search as `mvp: PostgreSQL FTS` → `scale:
Meilisearch/Typesense/OpenSearch` (`PLAN.md:3435-3437`).

What the repo proves: the ONLY search capability that exists is
daptin's JSON:API filtering — LIKE/contains over
`products.title`/`slug`/`product_code` plus taxonomy filters, with
fuzzy operators backed by LIKE/SOUNDEX
(`daptin/server/resource/resource_findallpaginated.go:1585-1659`).
`tsvector`/`to_tsquery` appear nowhere under `daptin/server/resource`
(grep-verified absent). Cursor pagination is documented broken
(`daptin/wiki/Filtering-and-Pagination.md:490-495`), so search pages
by offset only. No deployment story exists, so no external engine can
run in P0.

## Decision

P0 search = daptin's existing JSON:API filtering (LIKE/contains +
taxonomy filters). Meilisearch is SELECTED as the P1 engine
(consistent with §26 P1 and the §43 scale row). The index-sync wiring
(candidate: storefront-side reindex) is a named P1 design item, not
decided here.

Accepted P0 limitation, stated explicitly: Vietnamese
diacritics/typo tolerance (FR-04:426-433) are NOT met by LIKE
filtering — documented as a P0 acceptance gap, not dropped. The gap
closes when the Meilisearch slice lands.

## Alternatives Considered

1. **Adding tsvector support to daptin** — rejected: a query-builder
   patch on hot upstream code for a P1 need (decision 0001
   patch-cost discipline).
2. **Deploying an external engine during P0** — rejected: no
   deployment story exists; there is nowhere to run it.

## Consequences

Positive:

- P0 search works on day one with zero patches.
- The P1 engine is named, so the catalog schema keeps
  search-relevant columns (title/slug/product_code) stable.

Tradeoffs:

- Toneless Vietnamese queries and typo tolerance fail silently (empty
  result sets) until P1. Storefront copy must not promise them.
- Search analytics (FR-04) has no collection point in P0.

## Follow-Up

- One-line note under the `PLAN.md` §43 search row (this package):
  MVP search is daptin JSON:API filtering per this decision;
  PostgreSQL FTS row deferred to P1.
- Phase 1: Meilisearch slice — engine deployment, index-sync design,
  diacritics/typo acceptance tests against FR-04.
