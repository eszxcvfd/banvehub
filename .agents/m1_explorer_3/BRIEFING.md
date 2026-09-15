# BRIEFING — 2026-09-15T07:17:00Z

## Mission
Investigate and design PostgreSQL Migration Batch 6 for Phase 5 (Digital Orders, Entitlements, Download Events).

## 🔒 My Identity
- Archetype: explorer
- Roles: investigation, synthesis
- Working directory: /home/trung/Documents/2026/project/test-v6/.agents/m1_explorer_3
- Original parent: 902fae86-8610-4959-9027-f4a48d29b1e8
- Milestone: Milestone 1 - Phase 5 PostgreSQL Migration Batch 6 Design

## 🔒 Key Constraints
- Read-only investigation — do NOT implement
- Inspect existing migrations in web/src/migrations/
- Verify orders/orders_items table state
- Complete DDL and snapshot design for Phase 5
- Safe rollback down function

## Current Parent
- Conversation ID: 902fae86-8610-4959-9027-f4a48d29b1e8
- Updated: 2026-09-15T07:17:00Z

## Investigation State
- **Explored paths**:
  - `web/src/migrations/` (Batch 1 through Batch 5 migrations, JSON snapshots, `index.ts`)
  - Live PostgreSQL database via docker exec psql
  - `web/src/plugins/index.ts`, `web/src/payload.config.ts`, `web/tests/int/purchase-workflow.int.spec.ts`
- **Key findings**:
  - `orders`, `orders_items`, `orders_rels` have exactly 0 rows in PostgreSQL.
  - Dropping old template tables (`DROP TABLE IF EXISTS "orders_items", "orders", "orders_rels" CASCADE;`) and recreating digital tables is vastly cleaner, safer, and faster than ALTER TABLE.
  - Complete DDL designed and verified with PostgreSQL 16: `orders`, `order_items`, `entitlements`, `download_events`.
  - Invariants encoded: Partial unique index `entitlements_user_product_active_idx`, check constraints on non-negative balances/amounts, and trigger `enforce_br04_seller_anti_self_purchase` for anti-self-purchase.
  - Full reversible `down()` function restores initial template tables with 0 data loss.
- **Unexplored areas**: None. Complete migration ready for implementer.

## Key Decisions Made
- Batch 6 drops old 0-row template tables (`orders_items`, `orders`, `orders_rels`) and enums with CASCADE, recreating clean digital collections.
- Migration name: `20260915_071500_phase5_purchase_download`.
- Symmetrical rollback restores Batch 1 schema state.

## Artifact Index
- handoff.md — Complete 5-component handoff report with production-ready DDL and verification method
