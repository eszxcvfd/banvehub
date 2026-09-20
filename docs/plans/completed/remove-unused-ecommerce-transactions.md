# Execution Plan: Remove the unused template commerce ledger (phase 13)

Date: 2026-09-20

## Status

Landed as commit `65b8d19` (pushed to `main`): the code, the migration, the regenerated types, the new
integration spec and the documentation are in `web/`, and the migration is applied to both the
development database and `kientaohub_test`. Every gate is now taken, including the in-place whole-tree
build (exit 0 at 17:37, after which the shared dev server still answered 200 on `/admin/login` and `/`,
403 on `/api/orders` and 404 on `/api/transactions`). Authority is decision 0013, which
the owner asked for directly; there is no AgentTeams team for this increment because the repository
runs one team slot at a time and `refund-policy` still holds it. The captain executes it as a bounded
change, with the proof recorded below.

## Outcome

The admin no longer offers an "Ecommerce" group for a page that can never hold a row: the plugin's
`transactions` collection is off, no `/api/payments/*` endpoint exists, and the two dead tables, their
three enum types and their locked-documents relationship column are gone from the schema — while
`addresses` and `customers`, which the account area reads through the plugin's `useAddresses`, keep
working.

## Context

- Owner decision (2026-09-20), after asking what `/admin/collections/transactions` was for and being
  told it is a permanently empty template leftover: remove the surface rather than leave it, and keep
  `addresses` because our own code references it (`web/src/collections/Users/index.ts`,
  `web/src/app/(app)/(account)/account/addresses`).
- Measured before the change: `transactions` 0 rows, `transactions_items` 0 rows, and
  `payload_locked_documents_rels.transactions_id` set on 0 rows, in both `kientaohub` and
  `kientaohub_test`; no `web/src` module imported the generated `Transaction` type; the only writers
  were the plugin's own `/api/payments/stripe/initiate`, `/payments/stripe/confirm-order` and
  `/payments/stripe/webhooks` endpoints, which nothing in the application called.
- Decisions 0001 and 0004 had already replaced the template's Stripe rail with the internal wallet
  plus SePay, and phase 2 had dropped the plugin's physical-goods tables; the ledger they fed was the
  last survivor, and it created the one-item "Ecommerce" admin group.
- The plugin's own slug map lists every ecommerce slug unconditionally, so `generate:types` keeps
  naming disabled collections in its `ecommerce.collections` block. The existing patch in
  `web/src/plugins/index.ts` already removed `carts` and `orders`; it now removes `transactions` too,
  through one loop instead of two copy-pasted blocks.

## Scope

In: `web/src/plugins/index.ts`, one new migration plus `web/src/migrations/index.ts`,
`web/src/payload-types.ts` (regenerated), one new integration spec, and the documentation
(decision 0013, this plan, `docs/product/overview.md`).

Out: the client-side Stripe leftovers (`web/src/providers/index.tsx` mounts `stripeAdapterClient`, the
`stripe` / `@stripe/react-stripe-js` / `@stripe/stripe-js` dependencies, the `stripe-webhooks` script,
the `STRIPE_*` variables). Removing the client adapter means replacing the `usePayments` consumers in
the checkout and cart components, which the owner's parallel storefront team owns; it is recorded as
follow-up in decision 0013 instead.

## Approach

Disable the collection and omit the `payments` block first, then drop the schema it owned in a single
migration that refuses to destroy rows, then pin the result with an integration spec. The plugin stays
configured for `addresses`/`customers`.

## Evidence

Authored and proven in an isolated copy (`~/Documents/2026/project/p13-work`, hard-linked
`node_modules`, private databases `p13_scratch` / `p13_test` / `p13_red`) so that the `refund-policy`
team's in-flight verification was not disturbed; then re-run in the shared tree.

1. **Real CLI on a true pre-change clone.** `payload migrate` on `p13_scratch` (schema clone of the
   development database plus its `payload_migrations` rows for phases 1–12) applied phase 13 in
   27 ms: `transactions`/`transactions_items` gone, `enum_transactions_*` 0, the
   `payload_locked_documents_rels` column + key + index gone, no foreign key anywhere referencing the
   dropped tables, 104 → 102 public tables.
2. **Idempotency and the data guard** (`p13-idempotency.probe.mts`, driving `up()`/`down()` through
   the same `payload.db.drizzle` surface the runner passes to a migration): `up()` twice and `down()`
   twice are no-ops the second time; `down()` restores 2 tables, 3 enum types, 4 foreign keys,
   7 indexes and the rels column + key + index exactly (back to 104 tables); with one row inserted,
   `up()` throws `phase13: public.transactions holds 1 row(s); …` and changes nothing.
3. **Generated types.** Regeneration and the auto-generation that runs with `migrate` both remove
   `Transaction`, `TransactionsSelect`, the three `transactions` map entries and the locked-documents
   `relationTo: 'transactions'` member — removals only, no dangling reference; no module imported
   those types.
4. **The new spec is not vacuous.** `web/tests/int/ecommerce-plugin-surface.int.spec.ts` is 4/4 green
   on the migrated schema, and each half fails when its cause is restored: with the previous plugin
   config the two config assertions fail (`expected [ … ] to not include 'transactions'`,
   `expected [ '/payments/stripe/initiate', …(2) ] to deeply equal []`), and against the
   pre-migration clone the two schema assertions fail (`expected [ Array(2) ] to deeply equal []`,
   `expected [ { column_name: 'transactions_id' } ] to deeply equal []`).
5. **Shared tree, development database.** `payload migrate` at 17:02:59 (29 ms): 104 → 102 tables,
   `tx_tables=none`, `tx_enums=0`, `rels_col=0`, migrations 14 → 15, and the money line unchanged
   character for character — `users=59 products=167 orders=253 order_items=253 entitlements=188
   wallet_ledger=216 payment_intents=40 payment_transactions=0 seller_earnings=145 refunds=16
   tickets=0 notifications=15`. `payload-types.ts` regenerated in place and is byte-identical to the
   file proven in the copy.
6. `eslint` on the touched files: 0 errors, 1 warning that is the pre-existing `as any` cast in the
   `typescript.schema` patch.

## Remaining

- The **client-side Stripe leftovers** are the owner's call (decision 0013, Follow-Up):
  `web/src/providers/index.tsx` still mounts `stripeAdapterClient`, with the `stripe`,
  `@stripe/react-stripe-js` and `@stripe/stripe-js` dependencies, the `stripe-webhooks` script and the
  `STRIPE_*` variables. Removing the client adapter means replacing the `usePayments` consumers in the
  checkout and cart components, which the storefront vertical owns.
- Two **test-hygiene findings** from the refund round are recorded in that increment's plan: T3-F2 (a
  fixture's draft version is repaired while its main row keeps `seller = NULL`) and T3-F3
  (`tests/int/challenger-m3.int.spec.ts:6.5` is sensitive to how much data the database holds).

## Results (in-tree, 2026-09-20)

- **Whole-tree `lint`: exit 0**, 0 errors and 1327 warnings — the same warning count the tree carried
  before this increment, so it added none.
- **`test:int`: exit 0**, 40 files / 648 tests (39 files / 644 before, i.e. exactly this increment's
  new spec and its four tests). Run after bringing `kientaohub_test` to head — see the finding below.
- **`test:challenger`: 301/303 with 1–2 failures in `m5-challenger1-empirical.spec.tsx`** (the
  storefront VietQR top-up modal), all `Error: Test timed out in 5000ms`. Not this increment's: with
  the plugin config reverted to its previous state the same spec fails the same way (1 failed /
  22 passed), the failing test differs between runs (`clicking 500k preset…` vs `submits topup
  intent…`), the whole suite passes with nothing else running, and the spec touches no file this
  increment changed. The machine is running the `refund-policy` verifier's Playwright suite at the
  same time; these are load-sensitive timeouts in a storefront spec the UI team owns.
- **`build` in place: exit 0** at 17:37 in the shared tree — `✓ Compiled successfully in 11.5s`,
  `Finished TypeScript in 6.7s` — and the shared dev server survived it (200 on `/admin/login` and `/`,
  403 on `/api/orders`, 404 on `/api/transactions`), so it needed no restart. This is the stronger of
  the two build results below.
- **`build` in the isolated copy: exit 0** — `✓ Compiled successfully in 13.4s` and
  `Finished TypeScript in 9.6s`. See the note below on why it also ran there.
- **The migration proof is reproducible from the repo.** `web/tests/helpers/probe-phase13-ledger-removal.mts`
  drives `up()` and `down()` through `payload.db.drizzle` — the same surface Payload's runner hands to
  a migration — and against a scratch database it prints every check PASSED and exits 0: both
  directions idempotent, `down()` restoring 2 tables / 3 enum types / 4 foreign keys / 7 indexes / the
  rels column + key + index, and the guard refusing to run while a row exists.

## Finding: the shared test database was two phases behind

`kientaohub_test` sat at 13 migrations (`20260919_000000_phase11_notifications`) with 104 tables: the
refund increment's phase 12 had never been applied to it, so any `test:int` run against the default
test database would have failed on the missing `refunds.fault_basis` — not because of a defect but
because the database was stale. `scripts/bootstrap-test-db.mts` exists to run `payload migrate`
against it, so the gap is process, not code. Bringing it to head took both migrations (34 ms and
32 ms) and left 102 tables; the int suite above is the evidence that the result is correct.

## Note on where the build ran

`next build` writes to the shared `web/.next`, and the `refund-policy` verifier was running a Playwright
suite against the shared dev server on port 3000 while this increment was being integrated. Rather than
risk its run, the first build was taken in the isolated copy (`~/Documents/2026/project/p13-work`,
private `.next`, hard-linked `node_modules`) against a private database. That proved the increment
type-checks and compiles without touching the shared environment; the in-place build was then taken in
the quiet window after the review round closed (17:37, exit 0, dev server healthy), which is the
authoritative result.


## Progress

- 16:52 — owner chooses removal; reconnaissance measures the collection, its tables, its endpoints and
  every reference in `web/`.
- 16:55 — isolated copy created; migration, plugin config, `migrations/index.ts` and the integration
  spec authored there.
- 16:56–17:00 — proofs 1–4 above; the new spec's assertions are shown to fail under both mutations.
- 17:02 — shared tree integrated; migration applied to the development database; proof 5; the
  `refund-policy` verifier is told which files changed so it does not attribute a gate failure to the
  refund increment.
- 17:05–17:15 — in-tree gates: whole-tree `lint` exit 0 (0 errors, 1327 warnings — unchanged), `test:int`
  exit 0 (40 files / 648 tests), `test:challenger` 301/303 with a load-sensitive timeout in the
  storefront wallet spec that reproduces identically with this change reverted, and the isolated build
  exit 0. `kientaohub_test` was found two phases behind and brought to head.
- 17:20 — committed `65b8d19` and pushed; the migration proof was promoted from the isolated copy into
  `web/tests/helpers/probe-phase13-ledger-removal.mts` and re-run from the repo (all checks passed).
