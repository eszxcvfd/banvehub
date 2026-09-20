# Execution Plan: Operator-executed, fault-based refunds with a contact channel

Date: 2026-09-19

## Status

Proposed — drafted by the captain while the §13 notifications team finishes. No team is staged
and no work is scheduled from this file; the increment is created only after
`notifications-inapp` closes, because the repository runs one team slot at a time. Authority is
decision 0012; both mechanism choices are now decided below, and the parallel UI team's
boundary is recorded there so two teams never edit the same file.

## Outcome

A refund happens only when the operator decides it, only for the seller's fault or the
platform's, and only within 5 days of the purchase — and no surface ever tells a buyer they
were refunded when no money moved. Buyers can reach the operator, because the website
finally publishes contact information.

## Context

Decision 0012 fixes the policy; three measured facts in the tree at `6fc7710` are the work:

- A **seller** can set `resolution = 'REFUNDED'` on a ticket (`web/src/app/api/v1/tickets/[id]/route.ts`,
  `planTicketUpdate` refuses only the buyer) and the ticket UI renders "Đã hoàn tiền"
  (`web/src/collections/Tickets/index.ts:189`) while no refund record exists.
- `processRefund` (`web/src/services/refund.ts`) validates the reason, the acting principal
  and that the order is `COMPLETED`, then reverses **every** seller earning unconditionally
  (step c) with no fault basis and no time window.
- The storefront publishes no contact information: the `footer` global holds only `navItems`
  (`web/src/globals/Footer.ts:14`).

## Scope

In:

- `web/src/app/api/v1/tickets/[id]/route.ts` — refund resolutions become operator-only and may
  not exist without an executed refund for that ticket's order.
- `web/src/services/refund.ts` — required fault basis; branch the seller-earning reversal;
  enforce the 5-day window against `orders.paidAt`; record an out-of-window override.
- `web/src/app/api/v1/admin/refunds/route.ts` — accept the fault basis (and the override).
- `web/src/collections/Refunds/index.ts` + a schema migration — carry the fault basis and the
  window state on the refund record.
- `web/src/globals/Footer.ts` + the same migration — contact fields the operator can edit, and
  the schema the UI team renders.
- Tests: integration specs for the authorization, the fault branching and the window.

Out:

- **Presentation**: the footer/ticket/order components, storefront copy and pages that render
  the contact channel — owned by the owner's parallel UI team, not this one.
- Email delivery (decision 0003), web push/Zalo/SMS (§13 P1), automated payout (§26 P1),
  provider-side reversal, the F3 notification fixture hygiene, and any change to
  `web/src/collections/Products/**` or the notification access rules.

## Approach

Keep the money path exactly where decision 0002 put it: the operator's refund route is the
only writer, and it keeps `processedBy`, the reason and the ledger transaction. The fault
basis becomes a required input rather than free text, because decision 0012 makes it decide
who bears the cost: seller fault reverses the earning, platform fault leaves it to mature and
books no revenue on the order.

The ticket label follows the money, not the other way round: a ticket may only display
"Đã hoàn tiền" when an executed refund exists for its order, and a seller never sets it.

## Two mechanism choices — decided

Owner delegated the choice on 2026-09-19 ("bạn cứ thực hiện"); both remain reviewable at plan
approval, and both are recorded in decision 0012's Follow-Up as belonging to this plan.

1. **How a `REFUNDED` resolution is produced: the operator's refund action resolves the
   related ticket automatically, with the guard kept as the invariant.** One action, and the
   label can never precede the money — the guard (a ticket may only carry `REFUNDED` when an
   executed refund exists for its order) stays enforced independently, so the automatic path
   is a convenience on top of a rule rather than the rule itself.
2. **Where the contact information lives: fields on the `footer` global, rendered in the
   footer, plus a link.** It is where users already look, the operator edits it in the admin
   panel without a deploy, and it needs no new route.

## Parallel work boundary

A second team, created by the owner, works the **UI vertical** of this increment in parallel.
To keep two teams out of each other's files:

- **Schema has exactly one owner at a time: this team.** This team owns
  `web/src/globals/Footer.ts` (the contact fields), `web/src/collections/Refunds/index.ts`,
  the single phase-12 migration, `web/src/migrations/index.ts` and the generated
  `web/src/payload-types.ts`. The UI team consumes those fields and must not add schema,
  write a migration, or regenerate `payload-types.ts`; if it needs another field, it asks this
  team for it instead.
- **Presentation belongs to the UI team**: footer/ticket/order components, storefront copy and
  pages. This team does not edit those paths.
- **Scope checks must be path-filtered.** During parallel work `git status --porcelain` is
  never globally clean, so a task's scope check compares only its own inScope paths instead of
  requiring an empty tree — otherwise every parallel edit looks like a scope violation.
- Migrations run against a shared development database, so this team runs `payload migrate`
  and the UI team does not, which also keeps the migration ordering single-owner.

## Environment limitation — raised and then lifted, on the record

**What was blocked, and why it mattered.** While the increment's slices were being finished, a
parallel team's in-flight files made three whole-tree gates impossible for anyone: the only two
lint errors lived in `web/src/components/checkout/CheckoutPage.tsx:84,98`, `next build` died
collecting page data for `/account` with
`TypeError: (0, a.r(...).createContext) is not a function` at
`web/src/app/(app)/(account)/account/page.tsx:11` importing `@ant-design/icons` (the same
interop that served `/shop` as a 500 in development), and the full e2e suite was red on their
in-flight storefront specs. On top of that, with four to six concurrent Playwright runs on a
14 GB machine Chromium is OOM-killed about thirty seconds into a test, and the shared `pnpm dev`
on port 3000 plus the shared `e2e-*@kientaohub.test` fixtures mean two suites cannot run
concurrently at all.

**Isolated proof taken while it was blocked.** `git archive HEAD` plus this increment's patch
only, hard-linked `node_modules`, private `.next`: `eslint src tests` → 0 errors,
`tsc --noEmit` → clean, `next build` → exit 0. (A symlinked `node_modules` makes Turbopack panic
with "points out of the filesystem root", so isolation must hard-link or copy it on the same
filesystem.)

**Lifted.** The parallel team fixed both blockers. The captain then measured, on the tree as it
stands: whole-tree `pnpm lint` → **exit 0, 0 errors** (1327 warnings), and `next build` on a
full copy of the current tree → **exit 0** ("Compiled successfully", "Finished TypeScript", no
`createContext` failure). The blocked gates therefore went back into the verification and review
contracts — `t3` and `t4` were amended a second time to require whole-tree lint, whole-tree build
and the real `test:int`/`test:challenger` runs rather than the scoped substitutes — and the only
thing that still needs arranging is a quiet window for the full-suite e2e, because that
constraint is machine contention, not code.

**What remains unproven until that window:** the full-suite `test:e2e`. The increment's scoped
e2e evidence stays what it is — one passing run of each critical case, the rest inconclusive
under contention — and must not be reported as a green full suite.

## Risks And Recovery

- The fault basis is a new required input on an existing money path: every existing caller and
  test that refunds must be updated deliberately, and the spec suite is the guard that no
  refund silently defaults to seller fault.
- The 5-day window must not become a soft suggestion in code: an out-of-window refund is
  allowed only with the override recorded, and the record must say which case it was.
- Adding fields to a global and a collection means a migration; `payload migrate` in CI proves
  it applies, and the down path must stay idempotent (the `IF EXISTS` rule that
  `0d29332` established).
- If the operator's surface for refunds is exercised only through the admin API today, the
  increment must not invent a storefront refund button — decision 0012 keeps requests out of
  band.

## Progress

- 2026-09-19: plan drafted from decision 0012 (policy) and the three measured facts above. Not
  staged while `notifications-inapp` still holds the team slot.
- 2026-09-19: the two mechanism choices are decided (automatic ticket resolution behind the
  guard; contact fields on the footer global), the owner having delegated them, and the
  parallel UI team's boundary is recorded above. Validation drops the e2e contact-channel
  assertion because that surface now belongs to the UI team.
- 2026-09-20: owner said continue; the captain kept the increment alive without pretending the
  blocked gates passed. `t2`, `t3` and `t4` contracts were amended to the gates that can be taken
  here (scoped eslint, `tsc --noEmit`, the isolated build), with whole-tree `lint`/`build` and the
  full-suite e2e recorded above as an environment limitation. Slice state: `t1` complete; `t2`,
  `t5`, `t6` and `t7` implemented and int-proven, gate-blocked; `t3` verification and `t4` review
  queued behind them. `t7` additionally closed the stale-fixture defect that was flapping catalog
  and storefront specs across runs, proven by a probe that is red before and green after.
- 2026-09-20: `t8` completed. `web/tests/e2e/financeRefundResidue.ts` sweeps this spec's own
  residue by code prefix (`ORD-E2E-REF-*` orders, `refund-console-*` products) in `beforeAll` as
  well as `afterAll`, so a browser killed mid-run heals instead of poisoning the next run; the
  probe `finance-refund-residue.probe.mts` plants the exact shape that had to be removed by hand
  from the development database and proves the healing (45 → 51 → 45 orders). **A correction worth
  keeping: the deletion order this plan's acceptance named — refunds → order_items →
  seller_earnings → orders — cannot work**, because `refunds.order_item_id` and
  `seller_earnings.order_item_id` are NOT NULL with `ON DELETE SET NULL`, so deleting an item while
  either row exists fails a constraint and the item then disappears uncounted through the order's
  cascade. The working order is refunds → seller_earnings → order_items → orders, and their probe
  caught it: the first version reported "0 order items removed" while the row was gone. The contract
  text was wrong, not the implementation.
- 2026-09-20: the tree is green **in place**, not only in isolation — a real `pnpm build` in the
  working tree exited 0 at 16:26 after confirming no foreign Playwright suite was live, and the
  shared dev server was restarted afterwards and answers 200. With whole-tree `pnpm lint` at
  0 errors, the only gate still waiting on a quiet machine is the full-suite `test:e2e`; the
  verifier has been told to take it when the machine is quiet and to report contention as
  inconclusive rather than red.

## Decisions

- 2026-09-19: the increment implements decision 0012 rather than re-opening it; the two
  mechanism choices above are the only open questions, and both are recorded there as
  belonging to this plan.

## Validation

- Focused proof: a seller cannot set `REFUNDED` (403); a ticket cannot display it without an
  executed refund; a platform-fault refund leaves the seller earning intact and records
  `sellerAmountRefunded = 0`; a seller-fault refund reverses it; a refund requested at day 6
  is refused without the override and recorded with it.
- Integration proof: the operator's refund action resolves the related ticket, and the guard
  refuses a `REFUNDED` resolution whose order has no executed refund.
- The presentation assertions — that the footer renders the contact fields and the copy points
  at them — belong to the parallel UI team's suite; this plan does not duplicate them.
- Repository-required checks: `payload migrate`, `test:int`, `test:challenger`, `lint`
  (0 errors), `build`, `test:e2e`.

## Result

Verification round 1 (t3) closed on 2026-09-20 with verdict **pass**: decision 0012 is enforced by the
shipped code, established by the verifier's own probes and gates rather than by the implementer's logs.
Full record: `.lit/evidence/verifier-t3/REPORT.md`.

What the verifier generated itself: a 157-assertion money/window/guard probe (157/157, exit 0) on a
scratch clone — SELLER fault reverses the earning and records the seller's share with a paired
append-only ledger row, PLATFORM fault leaves the earning field-for-field untouched (still PENDING,
same `holdUntil`), records `sellerAmountRefunded = 0`, credits the buyer the full total, and the earning
matures so the seller is paid in full; the 5-day window measured at the boundary from both sides
against `orders.paidAt` (day 5 in, +1 ms out; a refusal writes no refund row, no ledger row and no
money; the override is recorded as `out_of_window = true`; a download or an entitlement does not
re-anchor); the label guard negatively (seller 403, moderator 403, operator without an executed refund
409 `TICKET_REFUND_NOT_EXECUTED`, through the route **and** through the collection hook on a route-free
write); the console with its own jsdom spec (5/5) plus a live-browser probe. Gates it ran itself:
`payload migrate` down/up on a populated clone and on an empty database, its own migration idempotency
probe (19/19), `test:int` 644/644 on a fresh clone, `test:challenger` 303/303, `tsc` exit 0, scoped
`eslint` 0 errors, whole-tree `lint` 0 errors / 1327 warnings, and an isolated build exit 0.

### Findings this round produced

- **T3-F1 (high, test artifact) — repaired as t9.** `chooseBasis()` in
  `web/tests/e2e/finance-refund.e2e.spec.ts` read `[data-testid=refund-blocked-reason]` with an
  un-timed `textContent()` after the console legitimately unmounts that element, so the read waited out
  the Playwright timeout. Measured live: count 1 → click PLATFORM → count 0, submit not disabled; a
  freeze-isolation probe showed clicks at 34–97 ms and DOM reads at 1–4 ms. The behaviour the spec
  asserts is green in the int, challenger and jsdom instruments, so this is a helper defect, not a
  product defect. t9 was created before the review round could meet the same defect.
- **T3-F2 (low, open).** t7's fixture repair writes the draft *version*, so the draft fixture's main row
  still carries `seller = NULL`. No spec orders that product today, so it is latent.
- **T3-F3 (medium, open).** `tests/int/challenger-m3.int.spec.ts:6.5` (page-1 price sort) is sensitive
  to how much data the database holds: it fails on a populated database and passes on a fresh one. That
  is a pre-existing test fragility, not this increment's, but it makes the suite's result depend on the
  database it runs against.
- **T3-F4 (low, open — policy gap).** A multi-seller order reverses *every* seller's earning. Decision
  0012 is silent on multi-seller orders, so this needs the owner rather than a code change.

### e2e

Full suite: 122 passed / 7 flaky / 8 failed (HEAD `44f7ecc`, no foreign runner at start). Six of the
eight failures are the parallel UI team's specs; two were this increment's finance spec and are the
T3-F1 helper defect (t9). The full-suite e2e for the increment therefore remains **unproven**, and the
scoped spec is expected to be green after t9 — for t4's review to confirm.

### Residue

Both verifier scratch databases dropped; its isolated tree, `/tmp` artefacts and probe symlink removed;
the development database's refunds/orders/order_items/entitlements/seller_earnings/withdrawals/tickets/
users rows are hash-identical before and after, with the two `lifecycle-draft-*` products its failed
catalog run created deleted. One unavoidable named residue: its e2e runs made 6 real refunds into the
spec's wallet-bound buyer `refund-console-buyer@kientaohub-refund.test` plus 6 `wallet_ledger` rows,
which BR-03 forbids deleting.

### Round state

t9 (repair for T3-F1) is **complete**: `chooseBasis()` now guards with `count()` (which never waits) and
reads with `textContent({ timeout: 1000 })`. The scoped spec is green twice in a row — 4 passed in
52.1 s and 4 passed in 32.3 s, the second run starting from the first's post-teardown state, with no
foreign Playwright suite at start. The repair made the helper's terminal assertion **stronger** rather
than weaker: `expect(radio).toBeChecked()` replaced `expect(blockedReason).not.toContainText(...)`, which
had been passing vacuously once the console unmounted the element. The reason itself is still covered
positively by test 1 (`Vui lòng chọn cơ sở lỗi` while no basis is chosen) and test 2
(`cần bật xác nhận ghi đè` while the override is unticked), and both ran green.

t4 (review round 1) had already been dispatched by the scheduler when t3 completed, so the reviewer was
told in writing which change was in flight and that decision 0013 (phase-13 ledger removal, commit
`65b8d19`) is not part of the increment it judges.

The in-place whole-tree build for this increment is still outstanding — named by the verifier as the one
gate it did not take, and deferred until no member is running gates so that a dev-server restart cannot
break a review run.

### Two captain contract defects this round exposed

- **An e2e verify command must carry the loader the repo's own script carries.** `package.json:25` runs
  `playwright test` with `--import=tsx/esm`; the command written into t9's contract had only
  `NODE_OPTIONS=--no-deprecation`, so it aborted in globalSetup after about 3 s with
  `Cannot find module …/next/cache imported from …/revalidatePage.ts`. The engineer ran the identical
  command plus that loader. Future e2e verify lists need `--import=tsx/esm`.
- **An `inScope` directory token needs its trailing slash.** `"web/tests/e2e"` was read as a file path,
  so the scheduler rejected the changed file `web/tests/e2e/finance-refund.e2e.spec.ts` as undeclared
  (t8's `web/tests/e2e/` was accepted). Write `web/tests/e2e/` when the scope is the directory.
