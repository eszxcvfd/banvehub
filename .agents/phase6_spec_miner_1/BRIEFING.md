# BRIEFING — 2026-09-15T10:22:00Z

## Mission
Mine all specifications, business rules, formulas, constraints, and state transitions for Phase 6 (Seller Revenue) of KienTaoHub from authoritative sources (PLAN.md, docs/, ORIGINAL_REQUEST.md).

## 🔒 My Identity
- Archetype: teamwork_preview_spec_miner
- Roles: Specification Miner
- Working directory: /home/trung/Documents/2026/project/test-v6/.agents/phase6_spec_miner_1
- Original parent: 97815561-5c1e-4548-8e83-6acb89c4e2aa
- Milestone: Phase 6 (Seller Revenue) Specification Mining

## 🔒 Key Constraints
- Read-only: do NOT implement anything or modify non-agent files.
- Prioritize authoritative sources over LLM prior knowledge.
- Probe ALL discovered features; do not leave any feature unprobed.
- Document in required tables (Features Discovered, Edge Cases) and follow 5-component Handoff Protocol.

## Current Parent
- Conversation ID: 97815561-5c1e-4548-8e83-6acb89c4e2aa
- Updated: 2026-09-15T10:22:00Z

## Task Summary
- **What to build**: Comprehensive Phase 6 (Seller Revenue) specification discovery report covering R1-R5.
- **Success criteria**: Detailed, unambiguous extraction of commission calculation, withdrawal state machine & flow, refund workflow & immutable ledger rules, finance admin endpoints/dashboards, invariants, error codes, and authorization matrices.
- **Interface contracts**: /home/trung/Documents/2026/project/test-v6/PLAN.md, docs/
- **Code layout**: N/A (read-only specification mining)

## Key Decisions Made
- Fully analyzed PLAN.md (§5.5, §6.2, §6.3, §11.1, §18, §19, §22, §27, §32, FR-31, FR-32, FLOW-U12, FLOW-U13, FLOW-U15, BR-01, BR-03, BR-07).
- Synthesized decisions 0002 (money write layer & append-only ledger), 0005 (financial state machines), 0008 (role model), threat-model.md (Threat T7 withdrawal race).
- Confirmed existing schema states: `order_items` snapshot fields exist; `purchaseProduct` currently sets `platformFee: 0`; 4 new collections needed (`seller_earnings`, `withdrawals`, `withdrawal_events`, `refunds`).
- Formulated full handoff report in `handoff.md` with 26 discovered features, 20 edge cases, deep dive into R1-R5, and 5-component handoff.

## Artifact Index
- DISPATCH.md — Assignment instructions and check-ins
- progress.md — Heartbeat and progress tracking
- handoff.md — Final comprehensive handoff report
