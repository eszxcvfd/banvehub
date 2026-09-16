# BRIEFING — 2026-09-15T10:37:02Z

## Mission
Design and author opaque-box integration test suites for Phase 6 (Seller Revenue) of KienTaoHub per Dual Track orchestration.

## 🔒 My Identity
- Archetype: teamwork_preview_test_writer
- Roles: specialist, qa
- Working directory: /home/trung/Documents/2026/project/test-v6/.agents/phase6_test_writer_1
- Original parent: 97815561-5c1e-4548-8e83-6acb89c4e2aa
- Milestone: Phase 6 - Seller Revenue

## 🔒 Key Constraints
- Write and modify test code only — never implementation code.
- Escalate implementation bugs to the implementing agent / orchestrator.
- Progressive Testability & Independence: each test self-contained, isolated, with explicit cleanup.
- Follow existing Vitest + Payload Local API + Next.js route handler conventions.
- Report results and publish test catalog in TEST_READY.md.

## Current Parent
- Conversation ID: 97815561-5c1e-4548-8e83-6acb89c4e2aa
- Updated: not yet

## Loaded Skills
- None

## Quality Status
- Build/test result: TBD
- Lint status: TBD
- Tests added/modified: 0

## Task Summary
- **What to build**: 4 integration test suites in `web/tests/int/`:
  1. `seller-earnings.int.spec.ts`
  2. `seller-withdrawals.int.spec.ts`
  3. `refund-ledger.int.spec.ts`
  4. `seller-revenue-e2e.int.spec.ts`
- **Success criteria**: Comprehensive tests covering 3-tier commission resolution, OrderItem snapshots, seller_earnings lifecycle & hold maturation, 8-state withdrawal lifecycle, balance reservation & concurrency, refund ledger immutability & compensating transactions, RBAC matrix, and API endpoints.
- **Interface contracts**: `PROJECT.md`, `phase6_spec_miner_1/handoff.md`, `phase6_explorer_frontend_test_1/handoff.md`
- **Code layout**: `web/tests/int/*.int.spec.ts`

## Key Decisions Made
- Initializing test writing workflow.

## Artifact Index
- [TBD]
