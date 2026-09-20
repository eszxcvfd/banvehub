# Execution Plan: Announce a notification only after the business write

Date: 2026-09-19

## Status

Active — opened by review round 1 of the §13 in-app increment
(`docs/plans/completed/notifications-inapp.md`, commit `e65df0f`). Closes findings F1, F2
and F4 from `.lit/evidence/reviewer-t4/REPORT.md`. F3 (test fixture hygiene) stays open and
is explicitly not in scope here.

## Outcome

A seller is told about a product verdict only when that verdict was actually written. Today
a rejected write can announce a verdict that never happened and then swallow the real one.

## Context

Review round 1 reproduced this with a real `BEFORE UPDATE` trigger: the product update threw
and `moderation_status` stayed `draft`, yet `PRODUCT_APPROVED` was already committed
(notification id 923). The false row also consumed `product:<id>:approved`, so the later,
genuine verdict was treated as an existing key and the seller never received it. That breaks
decision 0011 decision 6 ("announce only after the business write; never from
`beforeChange`") and the increment's own promise that a notification describes a real event.

The defect is the captain's scoping error, not the implementer's: t2's inScope deliberately
excluded `web/src/collections/Products/index.ts`, which is where the hook must be
registered, so the implementer could only document the window in a code comment.

F2 (narrow liveness risk: an emit awaiting a second pooled connection while holding the
caller's) closes with F1, because the offending emit is the one being moved.

F4 is the `TICKET_REPLY` notification carrying `link: null` while its comment claims no
buyer-facing thread view exists. Buyers do have one: `OrderTicketsSection` renders on
`/orders/[id]` (`web/src/app/(app)/(account)/orders/[id]/page.tsx:212`), and the notification
convention for buyers is already `/orders/<id>` (`web/src/services/purchase.ts:325`,
`web/src/services/refund.ts:274`). Sellers have no ticket screen, so null is honest only for
them.

## Scope

In:

- `web/src/collections/Products/index.ts` — register the announce hook.
- `web/src/collections/Products/hooks/enforceModerationState.ts` — remove the emit.
- `web/src/collections/Products/hooks/` — the announce hook itself.
- `web/src/app/api/v1/tickets/[id]/messages/route.ts` — F4 link honesty.
- `web/tests/int/notification-events.int.spec.ts` — regression proof and the F4 assertion.

Out:

- Money services, migrations, `payload-types.ts`, other collections, the F3 fixture hygiene,
  the §13 email channel and P1 channels.

## Approach

Register an `afterChange` hook on `Products` (the reviewer's required fix) so the
announcement happens only for a write that landed. Keep the existing conditions exactly:
`operation === 'update'`, a real moderation-status change, a seller recipient, and
`isStaff` so a seller cannot push the channel into notifying themselves. Keep the same
`dedupeKey` (`product:<id>:<verdict>`), so at-most-once behaviour is unchanged.

The boundary must be proven, not asserted. Payload runs `afterChange` inside the document
transaction after the database write, and no collection hook runs after commit
(`payload/dist/collections/operations/create.js:306` precedes `:324`;
`updateByID.js:153` precedes `:166`), so a write rejected by the database announces nothing
while a commit failure can still orphan a notification. State that residual where the hook
lives, in the same honest style as the removed comment.

## Risks And Recovery

- The regression test must be red before the fix and green after; a test that passes both
  ways proves nothing. Record both runs.
- Moving the emit must not change how many notifications a successful verdict produces, nor
  the dedupe behaviour; the existing event suite is the guard.
- `afterChange` receives the written document, not the incoming data, so any field the
  message needs (`title`, `moderationNotes`, seller id) must be read from the document or
  `previousDoc`; do not reintroduce a read that can see pre-write values.

## Progress

- 2026-09-19: plan opened; F1/F2/F4 in scope, F3 recorded as out of scope.

## Decisions

- 2026-09-19: the fix is the `afterChange` hook, not an `afterOperation` hook, because
  `afterOperation` also runs before commit and would buy nothing (decision 0011,
  alternative 5).
- 2026-09-19: the commit-failure residual is documented rather than engineered away; closing
  it needs a transactional outbox, which decision 0011 defers.

## Validation

- Focused proof: a test that forces the product write to fail at the database and asserts
  zero verdict notifications for that product, plus an assertion that a successful verdict
  still notifies exactly once and a replay is swallowed by the same key.
- F4: the buyer-facing `TICKET_REPLY` notification carries `/orders/<id>`; the seller-facing
  one stays null with a rationale that matches reality.
- Repository-required checks: `test:int`, `test:challenger`, `lint` (0 errors), `build`
  (exit 0), `test:e2e`.

## Result

Pending. Record the red-then-green evidence, the round-2 review verdict, and the commit
before moving this plan to `docs/plans/completed/`.
