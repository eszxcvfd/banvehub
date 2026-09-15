# BRIEFING — 2026-09-15T07:48:20Z

## Mission
Investigate transaction coordination between debitWallet and Payload database adapter (PostgreSQL/Drizzle) for purchaseProduct atomic boundary.

## 🔒 My Identity
- Archetype: explorer
- Roles: explorer, synthesis
- Working directory: /home/trung/Documents/2026/project/test-v6/.agents/m2_explorer_1
- Original parent: 902fae86-8610-4959-9027-f4a48d29b1e8
- Milestone: Milestone 2: Wallet Transaction Coordination

## 🔒 Key Constraints
- Read-only investigation — do NOT implement
- Write only to .agents/m2_explorer_1/
- Inspect web/src/services/wallet.ts (especially debitWallet, getOrCreateWallet, lines 179-285)
- Examine PostgreSQL transactions with @payloadcms/db-postgres and Drizzle
- Check if debitWallet's raw SQL query participates in req.transactionID and how to ensure atomic commit/rollback
- Design exact transaction boundary helper/pattern for purchaseProduct (Decision 0002)
- Output findings and technical design to .agents/m2_explorer_1/handoff.md and notify parent via send_message

## Current Parent
- Conversation ID: 902fae86-8610-4959-9027-f4a48d29b1e8
- Updated: 2026-09-15T07:48:20Z

## Investigation State
- **Explored paths**: `web/src/services/wallet.ts`, `web/src/services/payment.ts`, `@payloadcms/db-postgres`, `@payloadcms/drizzle` (`beginTransaction`, `commitTransaction`, `rollbackTransaction`, `execute`, `getTransaction`), `web/src/collections/{Orders,OrderItems,Entitlements}`, `web/src/migrations/20260915_071500_phase5_purchase_download.ts`, `web/tests/int/{wallet-ledger-invariants,purchase-workflow,purchase-invariants}.int.spec.ts`.
- **Key findings**:
  1. `payload.db` in `wallet.ts:209` failed with `TypeError: Cannot read properties of undefined (reading 'execute')` because `@payloadcms/drizzle` `execute` expects `{ db, drizzle, raw, sql }` and `payload.db` is the adapter, not Drizzle. The error was caught and swallowed, falling back to non-locking `payload.update`.
  2. Transaction sessions in `@payloadcms/db-postgres` store the Drizzle transaction at `payload.db.sessions[txId].db`. Resolving `dTx = payload.db.sessions[txId]?.db || payload.db.drizzle` allows raw SQL updates in `debitWallet` to execute within the active PostgreSQL transaction.
  3. Payload exports `createLocalReq`, `initTransaction`, `commitTransaction`, and `killTransaction`. When threaded via `req: { transactionID }`, collection operations and raw SQL queries share the identical PostgreSQL transaction.
  4. Programmatically verified that rollback restores balances and deletes uncommitted orders, order items, and ledger rows.
- **Unexplored areas**: Milestone complete.

## Key Decisions Made
- Provided patch for `web/src/services/wallet.ts` to bind raw SQL updates to active Drizzle transaction.
- Designed complete `purchaseProduct` service with `withTransaction` pattern in `handoff.md`.

## Artifact Index
- `DISPATCH.md` — Initial prompt and task metadata
- `BRIEFING.md` — Working memory and status
- `progress.md` — Liveness heartbeat
- `handoff.md` — Comprehensive technical report and implementation blueprint
