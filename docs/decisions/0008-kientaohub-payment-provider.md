# 0008 Payment Provider: SePay for P0 Wallet Top-Up

Date: 2026-09-14

## Status

Accepted

## Context

`PLAN.md` FR-12 (`PLAN.md:563-587`) requires a wallet top-up rail: system
creates a payment intent, shows a QR/payment instruction, the provider
confirms by webhook, the system verifies the signature, checks idempotency,
moves the payment to PAID, writes a ledger CREDIT, and updates the wallet.
FR-12 mandates a provider adapter (`PLAN.md:579`) and names candidate rails,
with "SePay / bank transfer QR" first (`PLAN.md:583`).

Constraints from the repository:

- Money is integer VND (`PLAN.md:271-281`; `parseWalletAmount` rejects
  anything that is not a whole positive integer,
  `daptin/server/actions/action_wallet.go:69-104`).
- Webhook security is mandatory per §11.3 (`PLAN.md:1527-1538`): HTTPS,
  verify signature per provider scheme, idempotency, allowlist never
  replaces signature, masked raw-payload logging, rate limit, replay
  protection.
- Withdrawals are manual Finance-Admin bank transfers (FR-32,
  `PLAN.md:1019-1054`): seller requests, balance is reserved, Finance
  reviews, payout happens off-provider. No provider payout API is needed
  at P0.

Authority: decision 0006 reserved provider/pricing policy from the earlier
owner grant (`docs/decisions/0006-kientaohub-money-write-layer.md:35-36`).
The owner conveyed a new grant with this package — full authority to select
the technology and proceed without further questions, dated 2026-09-14 —
which supersedes 0006:35-36 for the selections recorded here (decisions
0007–0009). If the owner ever revokes it, this record reverts to Proposed.

## Decision

**SePay** (Vietnamese bank-connect aggregator: VietQR bank-transfer
checkout with real-time bank-arrival webhooks; `developer.sepay.vn`,
`sepay.vn`) is the P0 wallet top-up provider.

Rationale, each point anchored:

1. VND-native bank-transfer QR is the first rail FR-12 names ("SePay /
   bank transfer QR", `PLAN.md:583`) and the dominant low-fee method for
   Vietnamese digital-goods buyers.
2. Webhook-on-money-arrival matches FR-12's exact chain (webhook →
   verify signature → idempotency → PAID → CREDIT ledger,
   `PLAN.md:563-577`) and §11.3's security list (`PLAN.md:1527-1538`).
3. Withdrawals are manual Finance-Admin bank transfers (FR-32,
   `PLAN.md:1019-1054`), so no provider payout API is needed at P0 —
   SePay's lack of payout features is irrelevant.
4. VND-only matches §6.2 integer-VND (`PLAN.md:271-281`).
5. The FR-12 adapter mandate (`PLAN.md:579`) is preserved — this is a
   routing decision, not a lock-in. Phase 1 builds the adapter interface
   so VNPay/MoMo can be added without touching the state machine
   (decision 0009).

Scope honesty, stated in the Decision (not buried in Context):

- no provider integration is built in Phase 0, not even in test mode.
- webhook authentication is the provider's signature/secret scheme —
  SePay's current webhook auth is a static secret token header, not a
  payload HMAC; the exact scheme is confirmed against provider docs at
  integration time.
- sandbox availability is asserted from public provider documentation
  and is unverified until registration.

## Alternatives Considered

1. **VNPay** — full acquiring-gateway onboarding with contract lead time;
   better suited as the P1 direct-payment adapter (FR-13,
   `PLAN.md:599-603`) than the P0 wallet top-up rail. P1 adapter
   candidate.
2. **MoMo / ZaloPay** — e-wallet rails requiring verified business
   accounts (MoMo for Business onboarding), app-bound users, mismatched
   with bank-QR-first intent. P1 adapter candidates.
3. **Manual bank-transfer reconciliation (no provider)** — rejected:
   without webhooks FR-12's automation and BR-02 idempotency degrade to
   human double-entry and invite double-credit.
4. **Stripe/PayPal** — not VND-local, unused by Vietnamese buyers of
   CAD/design files.

## Consequences

Positive:

- P0 top-up has exactly one integration target; the Phase 1 `$payment`
  action implements one webhook contract first.
- No payout-API requirement keeps the provider surface to inbound
  webhooks only.

Tradeoffs:

- SePay account type (personal vs business) and sandbox access are
  unverified until the owner registers — recorded as owner item 3 in
  `docs/plans/active/notes/phase0-decisions-plan.md` (needsOwner).
  Fallback order if a registered business proves mandatory: VNPay →
  MoMo Business.
- E-wallet buyers (MoMo/ZaloPay app users) are not served at P0; they
  arrive via the P1 adapter.

## Follow-Up

- Phase 1 payment slice: adapter interface, SePay webhook verification
  per provider scheme (§11.3), BR-02 unique constraint (lands with
  `schema/schema_payment.yaml` in this package), `$payment` Go action
  performer implementing decision 0009's transition table.
- Confirm the exact webhook auth scheme against provider docs at
  integration time; never assume HMAC.
