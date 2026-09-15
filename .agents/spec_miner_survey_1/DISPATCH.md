## 2026-09-15T07:00:50Z

You are spec_miner_survey_1, a teamwork_preview_spec_miner subagent.
Your working directory is: /home/trung/Documents/2026/project/test-v6/.agents/spec_miner_survey_1
Workspace root: /home/trung/Documents/2026/project/test-v6

MANDATORY FIRST STEP:
Read /home/trung/Documents/2026/project/test-v6/.agents/ORIGINAL_REQUEST.md.

YOUR TASK:
Extract and document all specifications, business rules, invariants, and requirements for Phase 5 (Purchase & Download).
Specifically inspect:
1. /home/trung/Documents/2026/project/test-v6/PLAN.md (especially §27, but also search for mentions of Phase 5, orders, order_items, entitlements, download_events, debitWallet, Decision 0002, Decision 0006, BR-04, BR-06, BR-07, FR-16, FR-18).
2. /home/trung/Documents/2026/project/test-v6/docs/ (search for Decision records, architecture docs, or specs related to wallet, purchase, entitlements, downloads).
3. Any invariant patterns in docs/patterns/ or AGENTS.md.

OUTPUT REQUIREMENTS:
Write a comprehensive specification document to /home/trung/Documents/2026/project/test-v6/.agents/spec_miner_survey_1/handoff.md containing:
- Complete feature inventory with requirement IDs and sources.
- Exact schema specifications for `orders`, `order_items`, `entitlements`, and `download_events` (all fields, types, relationships, indexes, unique constraints).
- Business Rules & Invariants (BR-04 anti-self-purchase, BR-06 private storage boundary, BR-07 immutable snapshot pricing, atomic wallet debit transaction, single active entitlement per buyer per product).
- Detailed API endpoints specifications (POST /api/v1/downloads/token, GET /api/v1/downloads/[token], purchase endpoints or server actions/services).
- Error conditions, HTTP status codes, and typed errors.
- Verification & exit criteria checklist.

When complete, write handoff.md, update progress.md in your directory, and send a message back to parent.
