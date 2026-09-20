# Execution Plan: Announce a notification only after the business write

Date: 2026-09-19

## Status

Active — opened by review round 1 of the §13 in-app increment
(`docs/plans/completed/notifications-inapp.md`, commit `e65df0f`). F1 and F4 shipped in
`285c73d` and passed review round 2; F2 (bounding the pool wait) is the remaining round, with
its own review. F3 (test fixture hygiene) stays open and is explicitly not in scope here.

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

F2 (narrow liveness risk: an emit awaiting a pooled connection while the operation holds
one) is **not** closed by moving the emit, which round 2 measured after round 1 assumed the
opposite. `afterChange` changes when the emit runs relative to the document write, not which
connection it needs: Payload runs a collection `afterChange` inside the operation before
commit (`payload/dist/collections/operations/utilities/update.js:330` vs
`collections/operations/updateByID.js:166`). `createNotification` owns no pool — it calls the
Payload local API without forwarding `req` — and `web/src/payload.config.ts` configures the
pool with `connectionString` only, so the wait for a connection is unbounded. With N >=
`pool.max` such emits, every connection is held by a transaction that is itself waiting; the
repository already recorded that failure class for tickets (`web/src/collections/Tickets/hooks/enforceTicketInvariants.ts:52-59`)
and bounded that wait at 5000 ms. F2 is repaired in its own round, in the same shape.

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
- `web/src/payload.config.ts` and `web/src/services/notifications.ts` — F2: bound the wait for
  a pool connection and correct the service's documented isolation semantics.
- `web/tests/int/` — the F2 saturation probe.

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
- 2026-09-19: F1 and F4 repaired in `285c73d` (5 files, +301/-71). Red-then-green with an
  identical final test file: the regression test forces a real database rejection and asserts
  zero `product:<id>:approved` rows (RED: `expected 1 to be +0`), while the genuine verdict
  still notifies exactly once with the written title and note and a re-approval is swallowed
  by the same key. F4's first cut derived the link from the sender, so the **seller** received
  `/orders/<id>`; the test caught it, and the link is now honest per recipient.
- 2026-09-19: review round 2 returned `pass` on its own evidence: its own `BEFORE UPDATE`
  trigger reproduction of F1, a drift-sensitivity proof that restores the pre-fix hook in a
  scratch copy (RED) while the real tree is green, no regressions with every notification
  INSERT rejected, and its own `test:int` 631 / `test:e2e` 62 runs. It also corrected round
  1's claim that F1's move would close F2.
- 2026-09-19: F2 handed to its own repair round (bounded pool wait) with its own review, so
  this plan stays in `active/` until that lands.
- Note on evidence: the reviewer/verifier raw trees under `.lit/evidence/` are workspace-only
  scratch, and the owner's workspace cleanup removed round 1's and the verifier's trees during
  the session. Round 2's report embeds its raw output inline so it survives a sweep; the
  durable record is this plan and decision 0011.

## Decisions

- 2026-09-19: the fix is the `afterChange` hook, not an `afterOperation` hook, because
  `afterOperation` also runs before commit and would buy nothing (decision 0011,
  alternative 5).
- 2026-09-19: the commit-failure residual is documented rather than engineered away; closing
  it needs a transactional outbox, which decision 0011 defers.
- 2026-09-19: F2 is closed by **bounding the wait for a pool connection** — the shape the
  ticket lock already uses in this repository — and not by moving the emit, which round 2
  proved does not change the connection requirement. A dedicated bounded pool for the
  notification path is equally acceptable if its isolation is demonstrated rather than
  asserted.

## Validation

- Focused proof: a test that forces the product write to fail at the database and asserts
  zero verdict notifications for that product, plus an assertion that a successful verdict
  still notifies exactly once and a replay is swallowed by the same key.
- F4: the buyer-facing `TICKET_REPLY` notification carries `/orders/<id>`; the seller-facing
  one stays null with a rationale that matches reality.
- Repository-required checks: `test:int`, `test:challenger`, `lint` (0 errors), `build`
  (exit 0), `test:e2e`.

## Result

F1 and F4 are shipped in `285c73d` and passed review round 2. F2 remains **open**: it is
repaired in its own round by bounding the wait for a pool connection, and this plan moves to
`docs/plans/completed/` only once that repair passes its review, with the commit and the
measured saturation evidence recorded here.
