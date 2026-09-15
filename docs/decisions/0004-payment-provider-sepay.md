# 0004 Payment Provider: SePay for P0 Wallet Top-Up

Date: 2026-09-15

Provenance: restored from `470bf41:docs/decisions/0008-kientaohub-payment-provider.md`
(accepted 2026-09-14). The selection and its rationale are retained verbatim in
substance; the integration owner is restated for Payload, where the daptin
`$payment` action no longer exists.

## Status

Accepted

## Context

`PLAN.md` FR-12 (`PLAN.md:563-589`) requires a wallet top-up rail: the system
creates a payment intent, shows a QR or payment instruction, the provider
confirms by webhook, the system verifies the signature, checks idempotency,
moves the payment to PAID, writes a ledger credit, and updates the wallet. FR-12
mandates a provider adapter and names candidate rails, with "SePay / bank
transfer QR" first.

Constraints from the repository:

- Money is integer VND (`PLAN.md:271-281`), never floating point.
- Webhook security is mandatory per §11.3 (`PLAN.md:1527-1538`): HTTPS, verify
  the provider's signature scheme, idempotency, allowlist never replaces the
  signature, masked raw-payload logging, rate limiting, replay protection.
- Withdrawals are manual Finance-Admin bank transfers (FR-32,
  `PLAN.md:1019-1056`): the seller requests, balance is reserved, Finance
  reviews, payout happens off-provider. No payout API is needed at P0.
- The template currently routes payment through Stripe with placeholder keys
  (`web/src/plugins/index.ts`), which decision 0001 records as temporary.

Authority: `PLAN.md` FR-12 names SePay first; decision 0001 records that the
internal wallet plus this rail replaces the template's Stripe payment method;
plan `docs/plans/active/phase-1-foundation.md` carries the owner's approval to
restore this record.

## Decision

**SePay** (Vietnamese bank-connect aggregator: VietQR bank-transfer checkout
with bank-arrival webhooks) is the P0 wallet top-up provider.

1. VND-native bank-transfer QR is the first rail FR-12 names and the dominant
   low-fee method for Vietnamese digital-goods buyers.
2. Webhook on money arrival matches FR-12's exact chain and §11.3's security
   list.
3. Withdrawals are manual, so the absence of provider payout features is
   irrelevant at P0.
4. VND-only matches §6.2 integer VND.
5. The FR-12 adapter mandate is preserved: this is a routing decision, not
   lock-in. The adapter interface is built so VNPay or MoMo can be added without
   touching the state machine in decision 0005.

Scope honesty, stated in the decision rather than buried:

- no provider integration exists, not even in test mode;
- webhook authentication is the provider's own scheme. SePay's current webhook
  auth is a static secret token header, not a payload HMAC; the exact scheme
  must be confirmed against provider documentation at integration time and must
  never be assumed;
- sandbox availability is asserted from public documentation and is unverified
  until an account is registered.

## Alternatives Considered

1. **VNPay** — full acquiring-gateway onboarding with contract lead time; better
   suited to the P1 direct-payment adapter (FR-13) than the P0 top-up rail.
2. **MoMo / ZaloPay** — e-wallet rails requiring verified business accounts and
   app-bound users, a mismatch with a bank-QR-first intent. P1 candidates.
3. **Manual bank-transfer reconciliation with no provider** — rejected: without
   webhooks, FR-12 automation and BR-02 idempotency degrade to human
   double-entry and invite double-crediting.
4. **Stripe or PayPal** — not VND-local; the template's Stripe adapter serves
   the demo storefront and is not the product rail.

## Consequences

Positive:

- P0 top-up has exactly one integration target and one webhook contract to
  build first.
- No payout-API requirement keeps the provider surface to inbound webhooks.

Tradeoffs:

- Account type (personal vs business) and sandbox access are unverified until an
  account is registered.
- E-wallet users are not served at P0; they arrive with the P1 adapter.
- The template's Stripe checkout must be removed or gated behind a feature flag
  (`PLAN.md` §38 lists new payment providers and checkout as flag targets), and
  that work is not done.

## Follow-Up

- Phase 4 payment slice: adapter interface, webhook route with signature
  verification per §11.3, BR-02 unique index on
  `payment_transactions (provider, provider_transaction_id)`, and the write path
  from decision 0005 over the rules in decision 0002.
- Confirm the webhook authentication scheme against provider documentation at
  integration time.
- Decide the fate of the template's Stripe adapter and the demo checkout flow
  before any storefront payment copy ships.
