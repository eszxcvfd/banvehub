# BRIEFING — 2026-09-15T07:44:30Z

## Mission
Investigate and design `web/src/services/purchase.ts` for Milestone 2: Purchase Service Logic per PLAN.md §27, Decision 0002, Decision 0006, BR-04, BR-07.

## 🔒 My Identity
- Archetype: explorer
- Roles: investigation, synthesis
- Working directory: /home/trung/Documents/2026/project/test-v6/.agents/m2_explorer_2
- Original parent: 902fae86-8610-4959-9027-f4a48d29b1e8
- Milestone: Milestone 2: Purchase Service Logic

## 🔒 Key Constraints
- Read-only investigation — do NOT implement in source code
- Service design for `web/src/services/purchase.ts`
- Validate product availability, BR-04 anti-self-purchase, duplicate entitlements, free vs commercial checkout, order/order_item/entitlement creation, typed errors, atomicity/cleanup

## Current Parent
- Conversation ID: 902fae86-8610-4959-9027-f4a48d29b1e8
- Updated: 2026-09-15T07:44:30Z

## Investigation State
- **Explored paths**:
  - `web/tests/int/purchase-workflow.int.spec.ts` (examined contract, steps, assertions)
  - `web/tests/int/purchase-invariants.int.spec.ts` (examined BR-04, BR-07, error types and codes)
  - `web/src/services/wallet.ts` (examined `debitWallet`, `creditWallet`, `InsufficientFundsError`, `req` threading)
  - `web/src/collections/Orders/index.ts` & `OrderItems/index.ts` (examined schema, hooks, snapshot fields)
  - `web/src/collections/Entitlements/index.ts` & hooks (examined active status, unique constraint)
  - `web/src/collections/Products/index.ts` (examined fields `_status`, `moderationStatus`, `price`, `isFree`, `seller`)
  - `web/node_modules/.pnpm/node_modules/@payloadcms/drizzle/dist/transactions/` (examined transaction mechanics)
- **Key findings**:
  - `web/src/services/purchase.ts` must export `purchaseProduct` and typed errors: `SelfPurchaseForbiddenError` (aliased as `SelfPurchaseError`), `AlreadyOwnedError` (aliased as `AlreadyEntitledError`), `ProductNotAvailableError`, `ProductNotFoundError`, and re-export `InsufficientFundsError`.
  - Order code `ORD-YYYYMMDD-XXXXXX` generated upfront allows passing `orderCode` as `referenceId` in `debitWallet`, matching `wallet_ledger` checks in tests.
  - Calling `debitWallet` BEFORE creating `orders` guarantees 0 orders created on `InsufficientFundsError`.
  - Transaction boundary `beginTransaction`/`commitTransaction`/`rollbackTransaction` ensures atomic ACID guarantees across wallets, ledger, orders, items, entitlements.
- **Unexplored areas**:
  - Download token generation (`web/src/services/download.ts`), scoped to Milestone 3.
  - Storefront UI components, scoped to Milestone 4.

## Key Decisions Made
- Export primary error names per prompt and alias legacy/test names (`SelfPurchaseError`, `AlreadyEntitledError`).
- Generate `orderCode` prior to `debitWallet` to establish canonical ledger `referenceId`.
- Provide self-managed transaction boundary in `purchaseProduct` when `req.transactionID` is omitted, while respecting outer transaction when passed.
- Return `orderId: String(orderDoc.id)` in `PurchaseResult` matching both interface and DB serialization.

## Artifact Index
- /home/trung/Documents/2026/project/test-v6/.agents/m2_explorer_2/handoff.md — Detailed service design handoff report
