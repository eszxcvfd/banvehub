# BRIEFING — 2026-09-15T07:09:00Z

## Mission
Extract and document all specifications, business rules, invariants, and requirements for Phase 5 (Purchase & Download) of KienTaoHub.

## 🔒 My Identity
- Archetype: spec_miner
- Roles: Teamwork preview specification miner, Teamwork specialist
- Working directory: /home/trung/Documents/2026/project/test-v6/.agents/spec_miner_survey_1
- Original parent: 902fae86-8610-4959-9027-f4a48d29b1e8
- Milestone: Phase 5 (Purchase & Download) Survey & Specification Mining

## 🔒 Key Constraints
- Do NOT implement anything — read-only role
- Exhaustively probe and document all business rules, schema specs, API specs, error conditions, invariants
- Prioritize authoritative repository sources (PLAN.md, docs/, existing schema, codebase)
- Document all findings in /home/trung/Documents/2026/project/test-v6/.agents/spec_miner_survey_1/handoff.md following the 5-component handoff protocol
- Keep progress.md updated as a liveness heartbeat
- Send results back to parent via send_message

## Current Parent
- Conversation ID: 902fae86-8610-4959-9027-f4a48d29b1e8
- Updated: not yet

## Task Summary
- **What to build**: Specification document for Phase 5 (Purchase & Download): orders, order_items, entitlements, download_events, wallet debit transaction, private storage streaming token rail.
- **Success criteria**: Comprehensive handoff.md with full feature inventory, exact schemas, business rules/invariants (BR-04, BR-06, BR-07, etc.), API endpoints, error handling, verification checklist.
- **Interface contracts**: PLAN.md §27, Decision 0002, Decision 0006, docs/
- **Code layout**: Payload collections in `src/collections`, wallet service in `src/services/wallet.ts`, API routes in `src/app/api/v1/downloads/`

## Key Decisions Made
- Specification mining completed: Extracted all business rules (BR-01, BR-04, BR-06, BR-07), functional requirements (FR-14, FR-15, FR-16, FR-17, FR-18, FR-19), architecture decisions (0002, 0003, 0005, 0006, 0008), database schemas (orders, order_items, entitlements, download_events), API contracts, and verification plans into handoff.md.

## Artifact Index
- /home/trung/Documents/2026/project/test-v6/.agents/spec_miner_survey_1/DISPATCH.md — Initial dispatch message
- /home/trung/Documents/2026/project/test-v6/.agents/spec_miner_survey_1/progress.md — Liveness heartbeat and progress tracking
- /home/trung/Documents/2026/project/test-v6/.agents/spec_miner_survey_1/handoff.md — Final comprehensive specification handoff report

## Loaded Skills
- **Source**: /home/trung/Documents/2026/project/test-v6/.agents/skills/encode-invariant/SKILL.md
- **Local copy**: N/A (read-only reference)
- **Core methodology**: Convert accepted repository rules into mechanical validation with positive/negative proof
