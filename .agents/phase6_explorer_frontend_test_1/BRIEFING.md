# BRIEFING — 2026-09-15T10:33:00Z

## Mission
Investigate frontend components, seller dashboard, admin operations, and test architecture for Phase 6 (Seller Revenue) and design a comprehensive 4-tier E2E/integration test strategy.

## 🔒 My Identity
- Archetype: explorer
- Roles: investigation, synthesis
- Working directory: /home/trung/Documents/2026/project/test-v6/.agents/phase6_explorer_frontend_test_1
- Original parent: 97815561-5c1e-4548-8e83-6acb89c4e2aa
- Milestone: Phase 6 Frontend & Test Exploration

## 🔒 Key Constraints
- Read-only investigation — do NOT implement
- Do NOT modify source code or tests in the project repository
- Follow Handoff Protocol (Observation, Logic Chain, Caveats, Conclusion, Verification Method)

## Current Parent
- Conversation ID: 97815561-5c1e-4548-8e83-6acb89c4e2aa
- Updated: 2026-09-15T10:33:00Z

## Investigation State
- **Explored paths**: `web/src/app/(app)/seller/page.tsx`, `web/src/collections/SellerProfiles.ts`, `web/src/collections/Users/index.ts`, `web/src/collections/OrderItems/index.ts`, `web/src/services/purchase.ts`, `web/tests/int/`, `web/vitest.config.mts`, `web/src/migrations/index.ts`
- **Key findings**:
  1. `/seller/page.tsx` currently only contains product listing and moderation KPIs; revenue KPIs, withdrawal requests, withdrawal history, and per-product breakdown need to be added.
  2. `seller_profiles` already defines `payoutInfo` (bankName, accountNumber, accountHolderName).
  3. Existing test suite passes 100% (22 test files, 347 tests, 50.18s execution time).
  4. Roles: `financeAdmin` is an established role in `Users.roles`, ready for endpoint authorization.
  5. Vitest runs with `fileParallelism: false` for database isolation.
- **Unexplored areas**: None; all required areas surveyed and documented in handoff.md.

## Key Decisions Made
- Architected Seller Dashboard into 3 tabs (Products, Per-Product Breakdown, Withdrawal History) with 4 top KPI cards (Available Balance, Pending, Lifetime, Paid Out).
- Designed dedicated Finance Operations UI pattern matching the `/moderation` architecture.
- Designed 4-tier test strategy across 4 focused suites (`seller-earnings`, `seller-withdrawals`, `refund-ledger`, `seller-revenue-e2e`).

## Artifact Index
- DISPATCH.md — Dispatch instructions log
- BRIEFING.md — Persistent working memory
- progress.md — Liveness heartbeat
- handoff.md — Complete 5-component handoff report
