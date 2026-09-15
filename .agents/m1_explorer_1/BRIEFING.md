# BRIEFING — 2026-09-15T07:18:00Z

## Mission
Investigate and design the exact implementation for Payload collections Orders and OrderItems (Milestone 1).

## 🔒 My Identity
- Archetype: teamwork_preview_explorer
- Roles: explorer, investigator, analyst
- Working directory: /home/trung/Documents/2026/project/test-v6/.agents/m1_explorer_1
- Original parent: 902fae86-8610-4959-9027-f4a48d29b1e8
- Milestone: Milestone 1: Orders & OrderItems Schema

## 🔒 Key Constraints
- Read-only investigation — do NOT implement in codebase
- Write all findings and design to handoff.md in .agents/m1_explorer_1/
- Follow the 5-component handoff protocol
- Send report / completion via send_message to parent

## Current Parent
- Conversation ID: 902fae86-8610-4959-9027-f4a48d29b1e8
- Updated: 2026-09-15T07:18:00Z

## Investigation State
- **Explored paths**:
  - `web/src/plugins/index.ts`
  - `web/src/collections/Users/index.ts`
  - `web/src/collections/Products/index.ts`
  - `web/src/collections/WalletLedger.ts`
  - `web/src/collections/PaymentIntents.ts`
  - `web/src/access/*` (financialAccess.ts, canEditMoney.ts, productFileAccess.ts, etc.)
  - `web/node_modules/@payloadcms/plugin-ecommerce`
  - `web/src/payload.config.ts`
  - `web/src/migrations/20260915_020514_initial.ts`
  - `docs/decisions/0002-money-write-layer.md`
  - `docs/decisions/0006-secure-download-path.md`
  - `PLAN.md` (BR-04, BR-07, §11, §17)
- **Key findings**:
  - Disabling plugin orders is accomplished with `orders: false` in `ecommercePlugin({...})` and pruning `orders` from `typescript.schema` in `plugins/index.ts`.
  - `Users` collection has a join field on `orders` with `on: 'customer'`; this must be updated to `on: 'buyer'` to match the new `Orders.buyer` relation field.
  - Digital `Orders` collection (`slug: 'orders'`) designed with `code`, `buyer`, `totalAmount`, `currency`, `status`, `paymentSource`, `paidAt`, `notes`, and join `items`.
  - Digital `OrderItems` collection (`slug: 'order_items'`) designed with snapshot price `salePrice`, `platformFee`, `sellerAmount`, `tax`, `policyVersion`.
  - BR-04 invariant (anti-self-purchase) enforced via `validateAntiSelfPurchase` hook on `order_items` by comparing authoritative product seller with order buyer.
  - BR-07 (snapshot price immutability) enforced via `preventOrderItemMutation` hook and access control.
  - Access control configured in `orderAccess.ts` denying direct REST mutations (`() => false`).
- **Unexplored areas**: None within Milestone 1 scope.

## Key Decisions Made
- `Orders` slug is `'orders'`, `OrderItems` slug is `'order_items'`.
- Access control denies all direct REST creates, updates, deletes; only server-side service transactions are permitted.
- `Users` join field updated from `on: 'customer'` to `on: 'buyer'`.

## Artifact Index
- `/home/trung/Documents/2026/project/test-v6/.agents/m1_explorer_1/handoff.md` — Complete 5-component implementation design report
- `/home/trung/Documents/2026/project/test-v6/.agents/m1_explorer_1/progress.md` — Liveness heartbeat & checklist
- `/home/trung/Documents/2026/project/test-v6/.agents/m1_explorer_1/BRIEFING.md` — Situational awareness
- `/home/trung/Documents/2026/project/test-v6/.agents/m1_explorer_1/DISPATCH.md` — Inbound message log
