# 0011 In-app notification policy

Date: 2026-09-19

Provenance: implements the `PLAN.md` §13 P0 in-app channel in commit `e65df0f`;
the increment plan is `docs/plans/completed/notifications-inapp.md`. Review round
1 returned `pass` with four non-blocking findings, all recorded here, and the
F1/F4 repair is `285c73d`. Raw reviewer trees under `.lit/evidence/` are
workspace-only scratch, so this record and the increment plan carry the durable
results.

## Status

Accepted

## Context

`PLAN.md` §13 names two P0 channels — in-app and email — over twelve events.
Decision 0003 has already taken email out of launch-blocking scope, so this
increment could only deliver in-app. §17 names the entity (`notifications`) and
§25 screen 21 the surface. Three constraints were locked when the increment was
commissioned: a notification is side-effect free on business state, it is emitted
at most once per business event, and a user reads only their own notifications.

Two rules the repository had already accepted decide the hard parts:

- BR-02 makes a replayed payment webhook a no-op, so a duplicate notification
  attempt must neither fail nor abort the webhook's other writes.
- BR-03 makes the ledger immutable, so the notification path may not touch money
  rows.

Three questions were open and are decided here: what "at most once" is enforced
by, whether the notification write joins the caller's transaction, and who may
read another principal's notifications.

## Decision

1. **Channel scope.** In-app only. Email stays deferred by decision 0003 and is
   not reopened here; web push, Zalo and SMS are §13 P1. Ten of the twelve §13
   events are implemented — exactly those that already had an emitting site.
   `Verify account` and `Password/security event` are deferred as email-shaped.
2. **Entity.** `notifications` per §17: type enum `enum_notifications_type` (10
   values), `recipient` → `users` with `ON DELETE CASCADE`, `readAt`, `link`, and
   `dedupeKey` NOT NULL.
3. **At most once per business event** is enforced by a required `dedupeKey`
   naming the business event — `payment-intent:<code>`,
   `payment-mismatch:<providerTxId>`, `order:<code>`, `seller-earning:<id>:matured`,
   `withdrawal:<id>:<status>`, `order:<code>:refunded`, `product:<id>:<verdict>`,
   `ticket:<id>:reply:<ordinal>` — plus UNIQUE
   `(recipient_id, type, dedupe_key)`. A duplicate is a no-op, not an error. The
   column is NOT NULL because Postgres never treats NULLs as equal, so a nullable
   key would silently disable the guarantee.
4. **The notification write does not join the caller's transaction.** The service
   writes through the Payload local API with `req` deliberately not forwarded — it does
   **not** own a pool of its own — and swallows every failure, so "never breaks the
   caller" is structural rather than a promise: Payload's local API
   rolls back the caller's entire transaction on any write error
   (`payload/dist/collections/operations/create.js:338` calls `killTransaction`),
   which is the BR-02 failure mode, and a SAVEPOINT cannot prevent it because that
   rollback happens above the driver. Because that write still needs a connection from
   the **shared** pool, the pool's acquisition wait is bounded at 5 s
   (`POOL_ACQUISITION_TIMEOUT_MS` in `web/src/payload.config.ts`), so an emit can never
   hold its caller's transaction open without bound; a saturated skip is reported as
   `'failed'` and does not consume the dedupe key, so the next genuine event still lands
   exactly once. Accepted consequences, stated plainly: **a
   notification is not atomic with the business flow and can outlive a rolled-back
   business transaction**, and the bound is app-wide, so any query may fail after 5 s of
   pool saturation instead of queueing. The constraint is proven by DB-forced failure, not by
   inspection: with every notification INSERT rejected by a CHECK, purchase, the
   SePay webhook, earnings, withdrawal, refund and moderation all still wrote their
   business rows.
5. **Access is own-rows-only for every principal, administrators included.** Read
   is scoped to `recipient = user.id`; create is closed to the collection API; the
   only field update may touch is `readAt`; delete is admin-only. §22 is silent on
   notifications, so this follows §22's ledger analogue ("own ledger for buyer and
   seller", `PLAN.md:2520`). No support/ops read path exists — an owner policy
   item, see Follow-Up.
6. **Announce only after the business write; never from `beforeChange`.** A
   notification may only describe an event that happened, so where the announce
   site sits inside a collection is part of the contract, not an implementation
   detail. The bound of this rule is measured, not assumed: Payload runs
   `afterChange` inside the document transaction after the database write, and no
   collection hook runs after commit (`create.js:306` `afterOperation` precedes
   `create.js:324` `commitTransaction`; `updateByID.js:153` precedes `:166`). A
   write rejected by the database therefore announces nothing, while a failure to
   commit can still leave a notification for a rollback — see alternative 4.
7. **Recorded latent constraint.** `purchaseProduct` emits before the caller's
   commit when it is handed its own transaction; no production caller does today,
   and a future caller must not pass one.

## Alternatives Considered

1. **Forward the caller's `req` to the notification write.** Rejected after
   reproduction: a duplicate notification aborted the caller's earlier writes, so
   an already-notified business event could break a webhook (BR-02).
2. **Nullable `dedupeKey`.** Rejected: NULLs never collide in a Postgres unique
   index, so the at-most-once guarantee would be silently disabled.
3. **Insert with `ON CONFLICT DO NOTHING` inside the caller's transaction.**
   Rejected: it removes the duplicate hazard but any other insert error still
   poisons the shared transaction (25P02), which is the same failure mode.
4. **Transactional outbox with a delivery worker.** Deferred, not rejected: it is
   the only design that makes a notification atomic with the business row, and it
   costs a table, a worker and a retry policy. Revisit if a notification becoming
   visible before a rolled-back purchase ever matters.
5. **Announce from `afterOperation`.** Rejected: it also runs before commit
   (`create.js:306`, `updateByID.js:153`), so it buys nothing over `afterChange`.

## Consequences

Positive:

- A replay (BR-02) stays a no-op and can never fail a business write, which the
  fault-injection probe demonstrates instead of asserting.
- The dedupe key is a business-event key, so at-most-once is auditable from the
  row itself.
- Nobody, administrators included, reads another user's inbox.

Tradeoffs:

- A notification can outlive a rolled-back business transaction (decision 4);
  closing that needs alternative 4.
- An operator cannot inspect a user's inbox without database access — the
  deliberate cost of decision 5.
- `Verify account` and `Password/security event` have no delivery channel until
  email re-enters scope (decision 0003).

## Follow-Up

- **F1 (medium, repaired in `285c73d`).** The product
  verdict was announced from a `beforeChange` hook
  (`web/src/collections/Products/hooks/enforceModerationState.ts`), so with a real
  `BEFORE UPDATE` trigger rejecting the write, the product stayed `draft` while
  `PRODUCT_APPROVED` was already committed (measured, notification id 923). The
  false row also consumed `product:<id>:approved`, so the later real verdict was
  swallowed as an existing key — the seller never received the true notification.
  The announce now lives in an `afterChange` hook registered in
  `web/src/collections/Products/index.ts` (the file the increment could not touch),
  with a regression test that fails the write and asserts zero verdict
  notifications. Residual, recorded rather than hidden: a commit failure after
  `afterChange` can still orphan the notification (decision 6).
- **F2 (low, repaired in `26057ae`).** Round 1 suggested F1's move would
  close it; round 2 measured that it does not, and the correction is worth keeping because
  the reasoning is easy to repeat: moving the emit to `afterChange` changes *when* it runs
  relative to the document write, not *which connection* it needs. Payload runs a collection
  `afterChange` inside the operation before commit
  (`payload/dist/collections/operations/utilities/update.js:330` vs
  `collections/operations/updateByID.js:166`), so the emit still waits on the same pool while
  the operation holds a connection. `createNotification` owns no pool — it calls the Payload
  local API without forwarding `req` — and the pool was configured with `connectionString`
  only, so that wait was unbounded. This repository has already paid for the failure class
  once (the ticket lock comment records that an unbounded wait with N >= `pool.max` left the
  pool unable to recover); the repair bounds the wait in the same shape, and alternative 4
  remains the only design that removes the coupling entirely.
  Repaired and measured: `connectionTimeoutMillis` is armed from
  `POOL_ACQUISITION_TIMEOUT_MS = 5000`. With every other connection held, a verdict update
  inside a caller-owned transaction settles in 5052 ms and commits with zero notifications for
  the skipped emit; under `pool.max` concurrent verdict updates, 9 of 10 commit in 5167 ms and
  the tenth is rejected with the bounded `cannot begin transaction: timeout exceeded` — no hang,
  no duplicate, no half-written row. A control run with the bound removed sat at a 15 s guard on
  all three probes, and before the fix the probe spec's own `afterAll` was killed by vitest's
  10 s hook limit because cleanup could not get a connection either. The bound is app-wide and
  that is deliberate: under saturation a query now fails after 5 s rather than queueing, the
  failure happens before any statement runs (BR-03 unaffected), and no path in the tree depends
  on a longer pool wait.
- **F3 (low, open, test hygiene).** Each full `test:int` run leaves ~26
  notification rows in `kientaohub_test` (measured 78 → 104) owned by six
  pre-existing money specs' fixtures; BR-03 makes those users undeletable, so the
  fixture owners must sweep by recipient id. The development database stays at 0.
- **F4 (low, repaired in `285c73d`).** The `TICKET_REPLY` notification carried `link: null`
  with a rationale claiming no buyer-facing thread view exists, but buyers do have
  one (`OrderTicketsSection` on `/orders/[id]`, `web/src/app/(app)/(account)/orders/[id]/page.tsx:212`).
  The link is now honest per recipient.
- §13's two email-shaped events and the P1 channels (web push, Zalo/SMS) stay
  deferred; email re-enters only by explicit owner decision (decision 0003).
- Whether an audited support read path should exist is an owner policy item, not a
  defect.

## Closed after this record was written

- F1 and F4 were repaired together in `285c73d`, with the regression test red before the fix
  and green after under an identical final test file; review round 2 re-derived F1 with its
  own `BEFORE UPDATE` trigger, showed the test is drift-sensitive by restoring the pre-fix
  hook in a scratch copy, and returned `pass`. Round 2 also produced this record's F2
  disposition above.
- F2 was repaired in `26057ae` and passed review round 3, which reproduced the saturation
  scenario with its own fixtures and confirmed the bound is what removes the wait: a control
  pool configured with `connectionTimeoutMillis: 0` left its waiter unresolved past 3 s and was
  served only when the holder released. Round 3 also verified the probe cannot starve sibling
  spec files (`fileParallelism: false` with per-file process isolation, measured from the
  process tree) and that the value the service reports comes from the same `options` object
  pg-pool arms its timer with, so it cannot drift from what is enforced. Its two low findings —
  wording that still claimed a connection of its own, and a cleanup that swallowed its own
  errors while stranding fixtures — are carried into the increment's final round.
- Evidence availability, stated plainly: the reviewer and verifier trees under `.lit/evidence/`
  are workspace-only scratch. The owner's cleanup during the session removed round 1's tree
  (`reviewer-t4`) and the verifier's (`s13-verify`); round 2's report
  (`.lit/evidence/reviewer-t6/REPORT.md`) embeds its raw output inline so it survives a sweep.
  The verdicts, gate counts and reproduction methods are recorded here and in the increment
  plan, which is what CI and future readers can rely on.
