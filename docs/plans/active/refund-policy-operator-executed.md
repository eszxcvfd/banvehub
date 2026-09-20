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

## Environment limitation, recorded rather than hidden

The parallel team's redesign currently makes three whole-tree gates impossible for anyone in this
tree:

- `pnpm lint` — the only two errors are `react-hooks/set-state-in-effect` in
  `web/src/components/checkout/CheckoutPage.tsx:84,98`, a file they have modified.
- `pnpm build` — dies collecting page data for `/account` with
  `TypeError: (0, a.r(...).createContext) is not a function` at
  `web/src/app/(app)/(account)/account/page.tsx:11` importing `@ant-design/icons`; the same
  interop breakage serves `/shop` as a 500 in development.
- `pnpm test:e2e` — the full suite is red on their in-flight storefront specs, and with four to
  six concurrent Playwright runs on a 14 GB machine Chromium is OOM-killed about thirty seconds
  into a test. That is why this increment's scoped console run is recorded as **inconclusive**
  rather than red, and why two earlier attempts collided through the shared `pnpm dev` on port
  3000 and the shared `e2e-*@kientaohub.test` fixtures each suite's `globalTeardown` deletes.

**What the increment proves, isolated from that work.** `git archive HEAD` plus this increment's
patch only, hard-linked `node_modules`, private `.next`: `eslint src tests` → **0 errors**,
`tsc --noEmit` → **clean**, `next build` → **exit 0**. (A symlinked `node_modules` makes Turbopack
panic with "points out of the filesystem root", so isolation must hard-link or copy it on the same
filesystem.) `test:int` 39 files / 644 tests and `test:challenger` 14 files / 247 tests pass on a
scratch clone; the fixture repair is proven by a scripted probe that is red before and green after
plus two consecutive CLI runs of the affected specs on the same database (57 passed each); and the
console's critical path — an out-of-window refund requiring the override, then a 200 with
`faultBasis=SELLER`, `outOfWindow=true`, `sellerAmountRefunded=105000`, earning `REVERSED` —
passed in a scoped run.

**What therefore stays unproven:** the full-suite `test:e2e` for this increment, and whole-tree
`lint`/`build` as gates. The affected task contracts were amended to say exactly that instead of
pretending the gates passed, with each amendment recorded in the task's revisions ledger.

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

Pending.
