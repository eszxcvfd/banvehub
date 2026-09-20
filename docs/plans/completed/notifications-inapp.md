# Execution Plan: §13 In-app notifications

Date: 2026-09-19

## Status

Completed 2026-09-19 — delivered in `e65df0f`, independently verified (t3, pass 7/7) and
adversarially reviewed (t4, pass with four non-blocking findings). The F1/F2/F4 repairs are
tracked in `docs/plans/active/notification-announce-after-write.md`; F3 stays open as test
fixture hygiene. Policy of record: decision 0011.

## Outcome

`PLAN.md` §13's notification channel exists in `web/` for the **in-app** channel:
a `notifications` entity, one service that creates a notification for one recipient, an
emission at each of the §13 business events whose emitting code already exists, a
caller-scoped API under `/api/v1/me/notifications`, and the account screen §25 lists as
number 21.

Three properties are contractual, not aspirational:

- **Side-effect free.** Creating a notification never changes a balance, a ledger row, an
  order status, an entitlement, or a product's moderation state.
- **At most once per business event.** A unique `(recipient, type, dedupeKey)` plus a
  service that treats a duplicate as a no-op, so a replayed SePay webhook (BR-02) cannot
  produce a second notification and cannot fail because of one.
- **Caller-scoped.** A user reads and marks read only their own notifications.

## Context

- `PLAN.md` §13 (`PLAN.md:1653-1680`): P0 channels are in-app and email; P1 is web push
  and Zalo/SMS; twelve events are listed.
- `PLAN.md` §17 (`PLAN.md:2291`): `notifications` is a named core table.
- `PLAN.md` §25 (`PLAN.md:2626`): buyer screen 21 is Notifications.
- `PLAN.md` §28: the Definition of Done each feature must clear.
- Decision 0003: **email is out of launch-blocking scope** and re-enters only by explicit
  owner decision, so this increment is in-app only and the Nodemailer adapter stays
  commented out (`web/src/payload.config.ts:137`).
- Decision 0008: the five-role model the access rules must follow.
- Decision 0010: the precedent that a user-facing action must not silently change
  business state.
- BR-02 (webhook idempotency) and BR-03 (append-only ledger) constrain where emission may
  sit and what it may touch.
- Existing conventions: `/api/v1/me/{wallet,orders,entitlements}` is the caller-scoped
  route shape; the account area is `web/src/app/(app)/(account)/`; migration names follow
  `phase7_reviews`, `phase8_comments`, `phase9_tickets`, `phase10_moderation_cases`.
- Lessons carried in from the FR-22 increment: an entry point needs a rendered e2e
  assertion (F2), a structural claim needs a mutation-sensitivity proof (R3-1), a broken
  `migrate:down` blocks the chain (F4), and a spec that assumes ambient data is green
  locally and red on CI (the first-user promotion fix). CI now bootstraps and migrates the
  test database, so a pristine-database run is the honest local equivalent.

## Scope

In scope, slice 1 (`t1`): `web/src/collections/Notifications/`,
`web/src/services/notifications.ts`, one migration plus its registration,
`web/src/payload.config.ts`, `web/src/payload-types.ts`, and the integration spec.

In scope, slice 2 (`t2`): emission calls in `web/src/services/payment.ts`,
`purchase.ts`, `earnings.ts`, `withdrawal.ts`, `refund.ts`, the Products moderation hook,
and the ticket messages route; `web/src/app/api/v1/me/notifications/**`; the account
screen; integration tests; one e2e assertion in `web/tests/e2e/frontend.e2e.spec.ts`.

The ten events, each with an emitting site that already exists: payment success and
payment failure (buyer), order success (buyer), seller sale (seller), earnings available
(seller), withdrawal status (seller), refund (buyer), product approved and product
rejected (seller), ticket reply (the counterparty).

Out of scope:

- **Email** (§13's P0 email channel) — decision 0003 defers it.
- **Web push, Zalo, SMS** — §13 P1.
- **Verify account and password/security events** — email-shaped, deferred with decision
  0003 and recorded as follow-up.
- A global header bell, retention or cleanup policy, digests, real-time delivery, and a
  notification-preferences UI.
- Any change to money-path semantics, the moderation lifecycle, `web/tests/helpers/**`,
  `web/playwright.config.ts`, `.github/**`, `docs/**`, `PLAN.md`.
- `git add`/`commit`/`push` by members; the captain integrates.

## Approach

Dependency chain in the `notifications-inapp` team, three members:

1. `t1` — implementation, assignee `engineer`: entity, migration, access rules, the
   `createNotification` service with dedupe, and their integration tests.
2. `t2` — implementation, assignee `engineer`, depends on `t1`: the ten emission points, the
   caller-scoped API, the account screen, the integration tests per event, and the e2e
   assertion.
3. `t3` — independent verification, assignee `verifier`, depends on `t2`: drive every event
   itself, replay the webhook, probe cross-user isolation over HTTP, and re-measure the
   business invariants by raw SQL.
4. `t4` — review round 1, assignee `reviewer`, depends on `t3`, judging `t2` and covering
   `t1`: the critical question is whether emission can ever break or alter the business
   path it observes.

Gate commands (from the repository root):

```text
pnpm --prefix web payload migrate
pnpm --prefix web test:int
pnpm --prefix web test:challenger
pnpm --prefix web lint
pnpm --prefix web build
pnpm --prefix web test:e2e
```

After a `pass` verdict the captain commits the in-scope paths (no push), records the
notification policy in `docs/decisions/`, and moves this file to
`docs/plans/completed/`.

## Risks And Recovery

- **Emission on a critical path.** The payment webhook must keep returning its no-op `200`
  on a replay (BR-02) and the purchase/refund paths must not change their result because a
  notification failed. The service swallows its own failures, and the reviewer must read
  every call site rather than trust the service contract.
- **Duplicate notifications on retry.** The unique constraint is the authority; the service
  treats a conflict as a no-op. Verified by replaying the webhook and by a raw duplicate
  insert.
- **Cross-user leakage.** Access rules plus an HTTP probe with two real sessions, including
  the mark-read route.
- **Ambient-data assumptions.** New specs must not depend on rows another spec left behind;
  the first-user promotion (`ensureFirstUserIsAdmin`) is a known trap and the fix pattern is
  the sentinel used in `product-reports.int.spec.ts`.
- **Scope creep into email or push.** Both are explicitly out; the reviewer checks it.
- **Residue.** Every new fixture is removed by identity, and the e2e run must end with the
  twelve fixture identities at 0 and `seller-asset-*` at 0.
- **Recovery.** The change is additive: a new collection, a new service, added calls, new
  routes and one screen. Reverting the in-scope paths restores the previous behaviour;
  the migration's `down()` is idempotent, following the F4 lesson.

## Progress

- [x] Authority and scope resolved: in-app only (decision 0003 defers email), ten events.
- [x] Chain staged: `t1` → `t2` → `t3` → `t4`.
- [x] Owner approved the staged plan; the scheduler dispatched `t1`.
- [x] `t1` entity and service complete (attempt 1, engineer). Evidence: migration applies on a
  brand-new database (`20260919_000000_phase11_notifications`) with the enum, the unique
  `(recipient_id, type, dedupe_key)` index and the users FK; `down()` twice then `up()` twice
  on a scratch database (the F4 lesson); `test:int` 35 files / 613 tests (the new spec is 21);
  challenger 101; lint 0 errors; build exit 0; `test:e2e` 61 passed with the twelve fixture
  identities and `seller-asset-*` back to 0.
  **Finding that shapes `t2` and the review:** Payload's local API kills the caller's whole
  transaction on any write error (`create.js:338` → `killTransaction`), which is exactly the
  BR-02 failure mode; a SAVEPOINT cannot save it. `createNotification` therefore does not
  forward the caller's `req` and writes on its own pooled connection, so "never breaks the
  caller" is structural. Trade-off, recorded for the reviewer to rule on: a notification is
  not transactional with the business flow and can survive a rolled-back business
  transaction. At-most-once still holds.
- [x] `t2` emission, API and screen complete (attempt 1, engineer). Evidence: `test:int` 36
  files / 630 tests (17 new in `notification-events.int.spec.ts`), challenger 101, lint 0
  errors, build exit 0, `test:e2e` 62 passed (the new §25 #21 test included) with the twelve
  fixture identities, `seller-asset-*` and dev-DB notifications back to 0. Ten emit points
  wired with per-event dedupe keys, emitted after the business state is written; the API is
  caller-scoped (`GET`, `{id}/read`, `read-all`); the account screen and its nav link exist.
  Two items the engineer flagged rather than fixed, both handed to `t4`:
  **(i)** the product verdict announcement sits in a `beforeChange` hook, so it precedes the
  row write and a later DB failure could announce a verdict that never landed. Closing that
  window needs an `afterChange` hook in `web/src/collections/Products/index.ts`, which the
  `t2` `inScope` excluded — a scoping mistake by the captain, to be corrected in a repair if
  the review agrees it is a defect.
  **(ii)** because the emit points are now live, six other integration specs leave ~26
  notification rows for their wallet-bound money fixtures. Harmless (the suite is green with
  them) but visible residue of the class the fixture-hardening increments removed.
- [x] `t3` independent verification complete — **PASS, 7/7, 0 FAIL** (attempt 1, verifier;
  `.lit/evidence/s13-verify/REPORT.md` plus six verifier-authored probe logs and raw psql
  dumps). Highlights: each of the ten events produced exactly one notification for the right
  recipient, with negatives (a buyer never receives `SELLER_SALE`, unrelated buyers/sellers/
  moderators receive nothing, a seller self-verdict emits nothing); the webhook replay path
  answered `200/200/200` with one credit and one notification; real sessions (no auth mock)
  proved anonymous `401`, cross-user `404` with the other user's row fingerprints
  byte-identical, own-rows-only listing and idempotent `read-all`; and **fault injection** —
  every notifications `INSERT` forced to fail by a database `CHECK` — left purchase, webhook,
  earning, withdrawal, refund and moderation flows succeeding with their business rows
  written. Gates: `test:int` 630 passed · challenger 101 · lint 0 errors · build exit 0 ·
  `test:e2e` 62 passed with all residue at 0; 794 → 833 test cases with none reduced.
  Independently measured follow-up: with a database-rejected product UPDATE, the
  `PRODUCT_APPROVED` notification is already committed while the row stays draft — the
  `beforeChange` window is real, not theoretical.
- [ ] `t4` review verdict `pass`.
- [ ] Captain commits in-scope paths (no push), records the policy decision, moves this
      plan to completed.

## Decisions

- 2026-09-19: this increment implements the in-app channel only. Email stays deferred by
  decision 0003 and is not re-opened here; web push is §13 P1.
- 2026-09-19: ten of the twelve §13 events are in scope because each already has an
  emitting site. `Verify account` and `Password/security event` are deferred as
  email-shaped.
- 2026-09-19: at-most-once emission is enforced by a unique `(recipient, type, dedupeKey)`
  with a no-op service, because a replayed webhook must stay a no-op (BR-02) and must never
  fail because a notification row already exists.
- 2026-09-19: the notification entity is `notifications` per §17, not a differently named
  table.
- 2026-09-19: the caller-scoped API follows the existing `/api/v1/me/*` shape, and the
  screen lives in the account area as §25 screen 21.
- 2026-09-19: **`createNotification` does not join the caller's transaction.** Payload's
  local API rolls back the caller's entire transaction on any write error
  (`payload/dist/collections/operations/create.js:338` calls `killTransaction`), which is the
  BR-02 failure mode: one duplicate notification would abort a webhook's earlier writes, and
  a SAVEPOINT cannot prevent it because the rollback happens above the driver. The service
  therefore writes through its own pooled connection, making "never breaks the caller"
  structural rather than a promise. Accepted trade-off, for the reviewer to rule on: a
  notification is not transactional with the business flow and can outlive a rolled-back
  business transaction. At-most-once still holds.
- 2026-09-19: `dedupeKey` is required and the column is `NOT NULL`, because Postgres never
  treats NULLs as equal, so a nullable key would silently disable the at-most-once guarantee.
- 2026-09-19: access is deliberately narrow — read is own-rows-only for every principal
  including administrators (nobody needs another user's inbox), create is closed to the
  collection API, update touches only `readAt`, and delete is admin-only.

## Validation

- Focused proof: the integration specs per event, the dedupe conflict at the database, the
  access rules, and the caller-scoped API negatives.
- Integration or end-to-end proof: one e2e assertion that the account screen shows a
  notification created for the signed-in fixture user and marks it read, with the run
  ending at zero fixture residue.
- Repository-required checks: `payload migrate`, `test:int`, `test:challenger`, `lint`
  (0 errors), `build` (exit 0).

## Result

Delivered in `e65df0f` (25 files, +3863/-4) and accepted by both gates. Policy of record:
`docs/decisions/0011-in-app-notification-policy.md`.

- **Independent verification (t3): pass, 7/7 acceptance criteria.** The verifier ran its own
  gates and probes rather than reusing the implementer's logs: event coverage 59/59,
  slice-1 access 23/23, database-forced fault injection 19/19 (with every notification
  INSERT rejected by a CHECK, purchase, the SePay webhook, earnings, withdrawal, refund and
  moderation all still wrote their business rows), real-HTTP 64/64, webhook replay 11/11.
  Gates: `payload migrate`, `test:int` 630, `test:challenger` 101, `lint` 0 errors, `build`
  exit 0, `test:e2e` 62 — fixture residue 0. Evidence: `.lit/evidence/s13-verify/` (removed by
  the owner's workspace cleanup — see the availability note under Findings).
- **Adversarial review round 1 (t4): pass,** with four non-blocking findings. The reviewer
  re-ran `test:int` (36 files / 630 tests) and `test:e2e` (62 passed) itself and re-derived
  the schema constraints from psql (UNIQUE `(recipient_id, type, dedupe_key)`, `dedupeKey`
  NOT NULL, 10-value enum, duplicate → 23505, whole-table duplicate probe 0). Evidence:
  `.lit/evidence/reviewer-t4/` — **no longer present**: the reviewer/verifier trees under
  `.lit/evidence/` are workspace-only scratch and the owner's workspace cleanup removed this
  tree and `s13-verify` during the session. Round 2's report
  (`.lit/evidence/reviewer-t6/REPORT.md`) embeds its raw output inline for that reason; the
  durable record of every verdict, gate count and method is this plan and decision 0011.
- **Findings.** F1 (medium) is a real defect — the product verdict was announced from a
  `beforeChange` hook, so a database-rejected product update left a committed
  `PRODUCT_APPROVED` for a row that stayed `draft`, and the false row consumed
  `product:<id>:approved` so the later real verdict was swallowed as an existing key. F1 and
  F4 were repaired in `285c73d` and passed review round 2. F2 (low) does **not** close with F1
  — round 2 measured that moving the emit to `afterChange` changes when it runs, not which
  connection it needs, because Payload runs collection `afterChange` inside the operation
  before commit — so it is repaired in its own round by bounding the pool wait, tracked in
  `docs/plans/active/notification-announce-after-write.md`, opened because the F1 fix needs
  `web/src/collections/Products/index.ts`, which t2's scope deliberately excluded — the
  captain's scoping error, not the implementer's.
- **F3 (low, open).** Each full `test:int` run leaves ~26 notification rows in
  `kientaohub_test` (measured 78 → 104) owned by six pre-existing money specs' fixtures;
  BR-03 makes those users undeletable, so those fixture owners must sweep by recipient id.
  The development database stays at 0. Recorded in decision 0011.
- **Remaining limitation, recorded rather than hidden.** A notification is not atomic with
  the business flow and can outlive a rolled-back business transaction, because no Payload
  collection hook runs after commit; closing it needs a transactional outbox (decision 0011,
  alternative 4). `Verify account` and `Password/security event` stay deferred as
  email-shaped until email re-enters scope by owner decision (decision 0003).
