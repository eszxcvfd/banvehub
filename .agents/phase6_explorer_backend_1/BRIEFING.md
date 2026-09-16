# BRIEFING — 2026-09-15T10:35:00Z

## Mission
Investigate backend architecture, data model, services, migrations, atomicity/concurrency, and APIs for Phase 6 (Seller Revenue).

## 🔒 My Identity
- Archetype: explorer
- Roles: backend investigator, synthesis
- Working directory: /home/trung/Documents/2026/project/test-v6/.agents/phase6_explorer_backend_1
- Original parent: 97815561-5c1e-4548-8e83-6acb89c4e2aa
- Milestone: Phase 6 (Seller Revenue) Backend Exploration

## 🔒 Key Constraints
- Read-only investigation — do NOT implement
- Inspect backend architecture, data models, services, migrations, and concurrency
- Write all artifacts only to /home/trung/Documents/2026/project/test-v6/.agents/phase6_explorer_backend_1/

## Current Parent
- Conversation ID: 97815561-5c1e-4548-8e83-6acb89c4e2aa
- Updated: 2026-09-15T10:31:31Z

## Investigation State
- **Explored paths**:
  - `ORIGINAL_REQUEST.md` (lines 73-150, Phase 6 Seller Revenue requirements)
  - `PLAN.md` (FR-31, FR-32, FLOW-U15, BR-01, BR-02, BR-03, BR-07, §5.5, §6.3, §11, §18, §22)
  - `docs/decisions/` (0001, 0002 Money Write Layer, 0004, 0005 Financial State Machine, 0006)
  - `web/src/collections/` (`Orders`, `OrderItems`, `Users`, `Wallets`, `WalletLedger`, `SellerProfiles`, `Entitlements`)
  - `web/src/payload.config.ts` (19 collections registered, postgresAdapter push: false)
  - `web/src/services/purchase.ts` and `web/src/services/wallet.ts`
  - `web/src/migrations/` (Batches 1-6 verified via `payload migrate:status`)
  - `web/src/app/api/v1/` routes and access patterns
- **Key findings**:
  - `OrderItems` already contains `platformFee` and `sellerAmount` fields, currently hardcoded in `purchase.ts` (0 and pricePaid); needs dynamic commission calculation.
  - `Orders.status` must be extended with `'REFUNDED'`.
  - Four new collections required: `seller_earnings`, `withdrawals`, `withdrawal_events`, `refunds`.
  - Batch 7 migration must add these tables, constraints (`amount > 0`, `seller_amount >= 0`), and append-only triggers on `withdrawal_events` and `refunds`.
  - Concurrency: PostgreSQL row/advisory locks on seller required during withdrawal requests to prevent double reservation.
  - Compensating ledger entries: Refunds use `creditWallet` to write append-only credit entry in `wallet_ledger` (BR-03).
- **Unexplored areas**: None. Backend investigation complete.

## Key Decisions Made
- Confirmed schema specification for `seller_earnings`, `withdrawals`, `withdrawal_events`, `refunds`.
- Defined commission resolution hierarchy: Campaign override -> Seller override -> Site default (30%).
- Defined withdrawal reservation and release logic with concurrency row lock.
- Formulated 5-component handoff report.

## Artifact Index
- DISPATCH.md — Initial dispatch prompt and check-ins
- BRIEFING.md — Working memory and status
- progress.md — Heartbeat and step tracking
- handoff.md — Comprehensive handoff report
