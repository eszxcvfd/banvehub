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

- Unpublished products are not reportable: the route resolves only
  `_status = 'published'` products, so a draft answers exactly like a nonexistent
  product. This closed the enumeration channel that the first release left open
  (`201`/`409` versus `404`), measured as review finding F3 and shipped in the
  follow-up repair round of 2026-09-18.
- The visibility rule has a single owner: `web/src/utilities/storefrontVisibility.ts`,
  imported by both the report route and the product-detail page. It was first written in
  two places because the F3 repair was scoped to the route; review finding R1 measured
  that the agreement assertion then bound the copies by substring only and survived a
  separately tightened page rule, so the rule was single-sourced and the assertion
  replaced by a behavioural agreement suite (real page render versus real route) in the
  round-3 repair of 2026-09-18.
- Draft preview no longer shows the report entry point: the page gates it on a
  server-side `draftMode().isEnabled` read, so the control is absent from the rendered
  HTML rather than merely hidden. Consequence, deliberate: a *published* product viewed
  in draft preview also hides the control. Review finding R2, shipped in the same round.
- Drift protection is behavioural, not structural. A consumer that re-introduces an
  *equivalent* copy of the rule cannot change behaviour and therefore cannot fail a
  behavioural test; only a structural check would catch it, and that check needs its own
  accepted authority before it can be added (recorded under Follow-Up rather than
  invented here).
- The agreement matrix also pins a second column: a row with `_status = 'published'` and
  `moderationStatus = 'submitted'` fails if either surface narrows its rule to
  `moderationStatus = 'approved'` — measured under mutation `N3` (page) and `N3b` (route)
  and shipped in the round-4 repair of 2026-09-18. Honest boundary: the matrix pins this
  one second-column value, so a condition that excluded some other pair would still
  escape, and that residual is what the structural guard would cover.
- Rate limiting is still absent (NFR-17), so the dedupe rule is today's only
  anti-abuse measure for this surface.
- A reporter can see only the fact that their report exists; the case is not
  readable by its author, so resolution is communicated out of band until
  notifications (§13) exist.

## Follow-Up

- Structural guard for the equivalent-literal residual: optional, and only after
  authority is accepted for it, per `docs/patterns/encoding-invariants.md` §2-§3.
- F2 from the first review round: assert the rendered `#report-section` entry point in
  the committed e2e suite (`web/tests/e2e/frontend.e2e.spec.ts`), which today covers
  cart machinery only.
- F4/F5 hygiene from the first review round: `migrate:down` of
  `web/src/migrations/20260917_052848_phase9_tickets.ts` fails on an unguarded
  `DROP CONSTRAINT`, and `.lit/evidence/verifier-t2-http.log` holds an inert JWT that
  must be redacted before any `.lit/` commit (`.lit/` is untracked scratch today).
- §13 notifications remain out of P0 per decision 0003, so reporters are not yet
  told the outcome of their report.
