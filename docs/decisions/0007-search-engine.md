# 0007 Search Engine

Date: 2026-09-15

Provenance: restored from `470bf41:docs/decisions/0011-kientaohub-search-engine.md`
(accepted 2026-09-14). The P0 and P1 split is retained; the P0 mechanism is
restated because the removed daptin JSON:API filtering no longer exists and the
database is now PostgreSQL through Payload.

## Status

Accepted

## Context

`PLAN.md` FR-04 (`PLAN.md:402-433`) requires case-insensitive search, Vietnamese
support, toneless-keyword handling, reasonable typo tolerance, suggest and
autocomplete, and search analytics. §26 lists "Search cơ bản" as P0 and
"Advanced search engine" as P1. `PLAN.md` §43 scales search as PostgreSQL full
text search for the MVP and Meilisearch, Typesense, or OpenSearch at scale.

Observed today: the storefront has the template's product search over Postgres
through Payload's query API, with no full-text index, no diacritics handling, no
autocomplete, and no analytics. No external search engine is deployed.

## Decision

P0 search runs on PostgreSQL through Payload's query API, matching the §43 MVP
row. Meilisearch is selected as the P1 engine, consistent with the §26 P1 row
and the §43 scale row. Index-sync wiring is a named P1 design item, not decided
here.

Accepted P0 limitation, stated explicitly: Vietnamese diacritics and toneless
queries, and typo tolerance, are not met by plain pattern matching. Where
PostgreSQL extension support is available, `unaccent` and `pg_trgm` are the
sanctioned P0 tools to close part of that gap, and adopting them belongs to the
search slice rather than this decision. Storefront copy must not promise
toneless matching or typo tolerance until that slice lands.

## Alternatives Considered

1. **Deploying an external engine during P0** — rejected: no deployment
   environment exists yet, and §26 keeps advanced search at P1.
2. **Pattern matching only, with no extension work** — rejected as a decision
   and kept only as the default behaviour: it leaves FR-04 partially unmet, so
   the gap is recorded rather than hidden.
3. **Meilisearch at P0** — rejected: it adds an operational dependency before
   Phase 1 environments and observability exist.

## Consequences

Positive:

- P0 search needs no new service and keeps search-relevant columns
  (title, slug, product code) stable for the P1 index.
- The P1 engine is named in advance, so the catalog schema is designed for it.

Tradeoffs:

- Toneless Vietnamese queries and typo tolerance fail silently with empty or
  partial results until the gap is closed in the search slice.
- Search analytics (FR-04) has no collection point in P0.

## Follow-Up

- Search slice: decide `unaccent` and `pg_trgm` adoption, add the P0 search
  tests against FR-04, and record which FR-04 clauses remain unmet.
- P1: Meilisearch deployment, index-sync design, and diacritics and typo
  acceptance tests.
