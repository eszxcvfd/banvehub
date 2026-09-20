# 0013 Remove the Unused Template Commerce Ledger

Date: 2026-09-20

## Status

Accepted

## Context

`web/src/plugins/index.ts` still mounted `@payloadcms/plugin-ecommerce` with its `transactions`
collection and a Stripe payment adapter. Decision 0001 recorded that the internal wallet plus SePay
replaces the template's Stripe payment method, decision 0004 selected SePay, and phase 2 disabled the
plugin's physical-goods half (`carts`, `products`, `orders`, `variants`) and dropped those tables —
but the ledger they fed stayed enabled. Decision 0002 had already classified it in as many words:
"its `transactions` and `orders` collections are the template's Stripe physical-goods bookkeeping,
not the `PLAN.md` §11.1 ledger." The surviving half was this:

- `transactions` (payment intent, billing address, amount) and `transactions_items` (the purchased
  items) had **no writer** in `web/src`. The only code that wrote them was the plugin's own
  `/api/payments/stripe/initiate` and `/api/payments/stripe/confirm-order` endpoints, and nothing in
  the application ever called those endpoints. Measured on 2026-09-20 before removal:
  `transactions` 0 rows, `transactions_items` 0 rows, `payload_locked_documents_rels.transactions_id`
  0 rows — on the development database and on `kientaohub_test` alike.
- Nothing read them either: no `web/src` module imported the generated `Transaction` type.
- What the collection did produce was an admin list view (`/admin/collections/transactions`) that can
  never hold a row, and with it a one-item "Ecommerce" group in the admin sidebar — on a marketplace
  whose money lives in `payment_intents` → `payment_transactions` → `wallet_ledger`.

The owner asked what that admin page was for; told it was a permanently empty template leftover, the
owner chose to remove the surface rather than leave it.

`addresses` is the other plugin collection and is **not** removable: the account area lists addresses
through the plugin's `useAddresses` hook (`web/src/app/(app)/(account)/account/addresses`) and `users`
joins it, so the plugin itself stays configured.

## Decision

1. The plugin's `transactions` collection is disabled (`transactions: false`) and its `payments` block
   is omitted, so no `/api/payments/*` endpoint is registered — the Stripe adapter was the only
   payment method. Disabling the collection also removes the "Ecommerce" admin group, because the
   group existed only for it.
2. Migration `20260920_160000_phase13_drop_unused_ecommerce_transactions` drops `transactions`,
   `transactions_items`, the three `enum_transactions_*` types, and the
   `payload_locked_documents_rels.transactions_id` column with its key and index. It refuses to run
   while `transactions` holds a row, and its down path restores the phase-12 schema.
3. `customers`, `addresses` and the plugin's `useAddresses` client context stay: they are load-bearing
   for the account area.
4. Stripe is not a payment rail of this application. If a card rail is ever adopted it arrives as a
   provider behind `PLAN.md` FR-12's seam with a real writer and a migration — never by re-enabling
   the template's ledger.

## Alternatives Considered

1. Keep the collection and only hide it in the admin. The tables would stay, the schema would keep
   claiming data ownership it does not have, and a future reader would still find a money-shaped table
   that nothing writes to.
2. Disable the whole `ecommercePlugin`. It also supplies `addresses` and the `users` customer fields
   the account area renders, so the storefront would break in the same commit.
3. Delete the plugin and hand-build an addresses collection. Larger than the defect justifies, and it
   would discard a working `useAddresses` implementation.

## Consequences

Positive:

- No admin surface promises a payment history the application cannot produce; the one-item
  "Ecommerce" sidebar group is gone.
- The database stops carrying two tables and three enum types belonging to a rail that was never
  integrated, so the schema describes the money path decision 0002 defines and nothing else.
- The next person asking "where do Stripe payments live?" gets a config that answers "nowhere"
  instead of a plugin mount with placeholder keys.

Tradeoffs:

- The removal is destructive. The down path restores the schema, not the rows; accepted because both
  databases measured 0 rows and no code path could write them, and the migration refuses to run if
  that ever stops being true.
- `@payloadcms/plugin-ecommerce` remains a dependency of the storefront for `addresses`, and its
  Stripe client is still mounted by `web/src/providers/index.tsx` (`stripeAdapterClient`) with no
  server endpoint behind it. That client-side leftover is tracked in the follow-up below rather than
  removed here, because the checkout components that consume `usePayments` belong to the storefront
  team.

## Follow-Up

- Client-side leftovers: `stripeAdapterClient` in `web/src/providers/index.tsx`, the `stripe`,
  `@stripe/react-stripe-js` and `@stripe/stripe-js` dependencies, the `stripe-webhooks` script, and
  the `STRIPE_*` variables. Removing the client adapter means replacing the `usePayments` consumers
  in the checkout and cart components.
- A future provider integration (VNPay or MoMo at P1 per decision 0004) writes through the
  wallet/payment-intent model, not through a resurrected template ledger.
