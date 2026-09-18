# 0010 Product Report Policy: Who May Report, What A Report Changes, Duplicate Handling

Date: 2026-09-18

## Status

Accepted

## Context

`PLAN.md` FR-22 (`PLAN.md:797-810`) fixes the seven report reasons and the
outcome — "Tạo moderation case" — and deliberately states nothing else:

- `PLAN.md` §17 (`PLAN.md:2293-2294`) names `moderation_cases` and
  `moderation_actions` as core tables but no fields.
- `PLAN.md` §22 (`PLAN.md:2509-2524`) has no row for reporting a product; it only
  fixes "Moderate product" as Moderator/Admin.
- `PLAN.md` §32 lists "Spam product" (12) and "Copyright abuse" (13) as threats the
  platform must handle, and NFR-17 (`PLAN.md:2025-2036`) requires rate limits, but
  `docs/ARCHITECTURE.md` records that no rate limiting exists on any surface.
- The in-repository precedent is FR-21 comments
  (`web/src/app/api/v1/products/[id]/comments/route.ts`) and FR-23 tickets
  (`web/src/app/api/v1/tickets/route.ts`): authenticated-only, `{error, message}`
  envelope in Vietnamese, `401/400/404/403/409` classes.

Three materially different choices were therefore open — who may report, whether a
report changes the product, and what happens on a repeated report. Configurable
defaults are not authority, so the owner decided all three on 2026-09-18 before any
code was written.

## Decision

1. **Reports are authenticated-only.** Anonymous `POST` returns
   `401 UNAUTHORIZED` and the storefront invites the visitor to sign in. Every
   report therefore carries a durable reporter identity.
2. **A report never changes the product.** The report handler writes no
   `products.moderationStatus`, no `products._status`, and nothing about
   storefront availability; only an existing Moderator/Admin moderation action
   changes moderation state (FR-28 and BR-08 are untouched). A report is a case
   for a human, never an automatic sanction.
3. **One open case per `(reporter, product)`.** `OPEN` and `IN_REVIEW` count as
   open, so a second report for the same pair while one is open returns
   `409 DUPLICATE_REPORT`; `RESOLVED` and `DISMISSED` release the pair. The rule is
   enforced in the route *and* by the partial unique index
   `moderation_cases_open_reporter_product_idx` on
   `(reporter_id, product_id) WHERE status IN ('OPEN','IN_REVIEW')`, so a
   check-then-insert race cannot produce two open cases.
4. **The entity is `moderation_cases`** per `PLAN.md` §17 — not a new `reports`
   table. The seven FR-22 reasons are single-sourced in
   `web/src/collections/ModerationCases/reasons.ts`, which the collection field, the
   route, and the storefront dialog all read, so no surface can accept a reason
   another surface rejects.
5. **Moderator handling happens in the Payload admin** (decision 0001). No separate
   application screen was added for cases.

## Alternatives Considered

1. **Guest reports** — rejected: no identity to dedupe or hold accountable, no
   rate-limiting infrastructure to absorb spam (NFR-17 unimplemented), and the
   spam/copyright threats in §32 are exactly what an anonymous report channel
   amplifies.
2. **Automatically move an approved product to `in_review` on report** — rejected:
   one report would hide a live product, which is weaponizable against any seller.
   The automatic transition can be added later only as an explicit policy with its
   own threshold, not as a side effect of FR-22.
3. **Allow repeated concurrent reports per user** — rejected: duplicates add no
   moderation signal beyond a count and complicate the queue.
4. **A dedicated `reports` table** — rejected: §17 already names
   `moderation_cases` as the core entity; two tables would split one lifecycle.
5. **Route-only dedupe** — rejected as the sole mechanism: the check and the insert
   are not atomic. The index is the authority and the route maps the conflict to
   `409`, so the API contract holds under concurrency.

## Consequences

Positive:

- The report contract is fixed and testable: `401/404/400/409/201`, exactly seven
  reasons, side-effect free on the catalog.
- The catalog cannot be altered by a report, so a buyer cannot hide a competitor's
  product and a seller has no new self-service surface to abuse.
- The dedupe guarantee holds at the database, not only in application code.

Tradeoffs:

- Draft products are currently reportable and unpublished ids/slugs are
  enumerable (`201`/`409` versus `404`), because the route resolves a product
  without a `_status = published` filter. Measured as review finding F3 and
  recorded as a follow-up; fixing it needs its own change.
- Rate limiting is still absent (NFR-17), so the dedupe rule is today's only
  anti-abuse measure for this surface.
- A reporter can see only the fact that their report exists; the case is not
  readable by its author, so resolution is communicated out of band until
  notifications (§13) exist.

## Follow-Up

- F3 above: add a visibility filter to the report route, or record explicitly why
  drafts stay reportable.
- F1/F2 from the same review: test the `500` path and assert the rendered
  `#report-section` entry point in the committed e2e suite.
- §13 notifications remain out of P0 per decision 0003, so reporters are not yet
  told the outcome of their report.
