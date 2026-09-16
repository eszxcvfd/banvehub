# BRIEFING — 2026-09-15T11:00:00Z

## Mission
Explore requirements and exact implementation design for Phase 6 Milestone 1: Focus Area 1: `seller_earnings` Collection & `Orders` Status Extension.

## 🔒 My Identity
- Archetype: teamwork_preview_explorer
- Roles: explorer, investigator, analyst
- Working directory: /home/trung/Documents/2026/project/test-v6/.agents/m1_explorer_1
- Original parent: 902fae86-8610-4959-9027-f4a48d29b1e8
- Milestone: Milestone 1: Orders & OrderItems Schema
- Phase 6 Parent: orchestrator (conversation ID: 97815561-5c1e-4548-8e83-6acb89c4e2aa)
- Phase 6 Milestone: Milestone 1: Focus Area 1 - `seller_earnings` Collection & `Orders` Status Extension

## 🔒 Key Constraints
- Read-only investigation — do NOT implement in codebase
- Write all findings and design to handoff.md in .agents/m1_explorer_1/
- Follow the 5-component handoff protocol
- Send report / completion via send_message to parent
- Phase 6 Focus: Review Orders status ('REFUNDED'), SellerProfiles commissionRate override, design SellerEarnings collection with fields, access control, indices, constraints.

## Current Parent
- Conversation ID: 97815561-5c1e-4548-8e83-6acb89c4e2aa
- Updated: 2026-09-15T10:55:45Z

## Investigation State
- **Explored paths**:
  - `web/src/collections/Orders/index.ts` (status options, hooks, join fields)
  - `web/src/access/orderAccess.ts` (read query, mutation denial)
  - `web/src/collections/SellerProfiles.ts` (profile fields, commissionRate override)
  - `web/src/access/sellerProfileAccess.ts` (adminOrFinanceAdminFieldAccess, commissionRateReadAccess)
  - `web/src/collections/OrderItems/index.ts` (relationship snapshot, fee fields)
  - `web/src/collections/WalletLedger.ts` & `web/src/access/canEditMoney.ts` (money write layer)
  - `web/src/migrations/20260915_071500_phase5_purchase_download.ts` (Batch 6 schema & indexes)
  - `web/tests/int/seller-earnings.int.spec.ts` (rate resolution, integer VND splits, maturation, balance aggregation)
  - Peer handoffs: `.agents/m1_explorer_2/handoff.md` (withdrawals) and `.agents/m1_explorer_3/handoff.md` (refunds & Batch 7 migration)
- **Key findings**:
  - `Orders.status` must include `'REFUNDED'`. `orderAccess.ts` already protects orders from direct REST mutation.
  - `SellerProfiles` needs `commissionRate` (`min: 0`, `max: 1`, `step: 0.01`) with write restricted to `admin` and `financeAdmin`, and read restricted to admin/financeAdmin and profile owner.
  - `SellerEarnings` (`slug: 'seller_earnings'`) designed with strict 1-to-1 relationship to `orderItem` (`unique: true`), non-negative integer VND math check (`sellerAmount + platformFee === salePrice`), immutable snapshot fields (BR-07), and automatic hold period calculation (`holdUntil = createdAt + 7 days`).
  - Access control uses `canEditMoney` for create/update/delete (deny direct REST) and `sellerEarningsReadAccess` for read (admin/financeAdmin see all, sellers see own).
  - PostgreSQL DDL includes unique btree index on `order_item_id`, composite index on `(status, hold_until)`, and check constraints.
- **Unexplored areas**: None within Focus Area 1.

## Key Decisions Made
- `orderItem` is unique in `seller_earnings` to guarantee idempotency and prevent duplicate earnings.
- Integer VND arithmetic avoids rounding drift: `platformFee = Math.round(salePrice * commissionRate)`, `sellerAmount = salePrice - platformFee`.
- `commissionRate` in `SellerProfiles` is protected from modification by sellers via `adminOrFinanceAdminFieldAccess`.

## Artifact Index
- `/home/trung/Documents/2026/project/test-v6/.agents/m1_explorer_1/handoff.md` — Complete 5-component implementation design report for Focus Area 1
- `/home/trung/Documents/2026/project/test-v6/.agents/m1_explorer_1/progress.md` — Liveness heartbeat & checklist
- `/home/trung/Documents/2026/project/test-v6/.agents/m1_explorer_1/BRIEFING.md` — Situational awareness
- `/home/trung/Documents/2026/project/test-v6/.agents/m1_explorer_1/DISPATCH.md` — Inbound message log
