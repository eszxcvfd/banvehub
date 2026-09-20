# Execution Plan: Announce a notification only after the business write

Date: 2026-09-19

## Status

Completed 2026-09-19 — all findings closed: F1 and F4 in `285c73d` (review round 2, pass), F2 in
`26057ae` (review round 3, pass, with the saturation bound measured), and R3-1/R3-2 in `4679671`.
That final round is the captain's own bounded change because the team was disbanded mid-round;
decision 0011 records the reduced assurance instead of presenting it as a review pass. F3 (test
fixture hygiene) stays open and was never in scope here.

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
- 2026-09-19: F2 repaired in `26057ae`: `POOL_ACQUISITION_TIMEOUT_MS = 5000` arms
  `pool.connectionTimeoutMillis`, and `createNotification` reports a saturated skip as
  `'failed'` with the live bound named in the warning. Measured red-then-green with an identical
  final test file — with every other connection held, the verdict update settles in 5052 ms and
  commits with zero notifications for the skipped emit, while a control run without the bound
  sat at a 15 s guard on all three probes; before the fix this spec's own `afterAll` was killed
  by vitest's 10 s hook limit because cleanup could not get a connection either.
- 2026-09-19: review round 3 returned `pass`, reproducing saturation with its own fixtures (one
  of ten concurrent verdict updates failing with the bounded error instead of hanging), choosing
  a control pool with `connectionTimeoutMillis: 0` to show the bound is what removes the wait,
  and verifying the probe cannot starve sibling spec files (`fileParallelism: false`, per-file
  process isolation). Its two low findings — R3-1, wording that still claimed a connection of its
  own, and R3-2, a cleanup that swallowed its own errors and stranded fixtures — are the final
  round; this plan moves to `completed/` only once that review passes.
- 2026-09-19: final round (`4679671`) after the team was disbanded: R3-1's remaining wording and
  R3-2's silent cleanup are fixed, and the captain's fresh-database verification found and fixed
  one more defect — `notification-events.int.spec.ts` asserted its promoted first-user sentinel.
  Gates re-run on a scratch database created fresh: migrate 104 tables, `test:int` 37/634 (was 1
  failed / 18 skipped), lint 0 errors, build exit 0.
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

F1, F4, F2 and round 3's two findings are all closed.

- **F1** (`285c73d`): the announce moved to an `afterChange` hook with a regression test red
  before the fix and green after under an identical final file.
- **F2** (`26057ae`): the pool acquisition wait is bounded at 5 s (`POOL_ACQUISITION_TIMEOUT_MS`)
  and measured — with every other connection held, a verdict update settles in 5052 ms and commits
  with zero notifications for the skipped emit; under `pool.max` concurrent verdict updates, 9 of
  10 commit and the tenth fails with the bounded error instead of hanging; a control run without
  the bound sat at a 15 s guard on all three probes.
- **R3-1/R3-2** (`4679671`): the surviving false isolation wording is corrected (comment-only in
  the money services), the probe's cleanup can no longer swallow its own failure and now counts
  its marker rows, and a defect found while verifying is fixed —
  `tests/int/notification-events.int.spec.ts` asserted its first-user sentinel's roles, which is
  false exactly on a freshly migrated database. On a scratch database created fresh for the run,
  `test:int` now passes 37 files / 634 tests where the identical run failed before (1 file failed,
  18 skipped); `lint` 0 errors and `build` exit 0.

Remaining, recorded rather than hidden: a commit failure after `afterChange` can still orphan a
notification (decision 0011 decision 6, alternative 4 — the transactional outbox), and F3 fixture
hygiene across six pre-existing money specs stays open.
