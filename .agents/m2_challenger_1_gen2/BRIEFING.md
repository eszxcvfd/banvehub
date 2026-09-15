# BRIEFING — 2026-09-15T08:58:30Z

## Mission
Adversarially challenge the financial integrity and transaction atomicity of Milestone 2.

## 🔒 My Identity
- Archetype: teamwork_preview_challenger
- Roles: critic, specialist
- Working directory: /home/trung/Documents/2026/project/test-v6/.agents/m2_challenger_1_gen2
- Original parent: d337f9f2-2542-44fe-ac67-5e70f44da16a
- Milestone: Milestone 2 (Purchase workflow, wallet debit, transaction atomicity)
- Instance: 1 of 2 (gen2)

## 🔒 Key Constraints
- Review-only — do NOT modify implementation code
- Empirical challenger: must write and execute tests/harnesses, verify directly against PostgreSQL DB
- State verdict explicitly: APPROVE or REQUEST_CHANGES
- Write report to handoff.md

## Current Parent
- Conversation ID: d337f9f2-2542-44fe-ac67-5e70f44da16a
- Updated: 2026-09-15T08:58:30Z

## Review Scope
- **Files to review**:
  - ORIGINAL_REQUEST.md
  - .agents/orchestrator/PROJECT.md
  - .agents/m2_worker_1/handoff.md
  - web/src/server/routers/purchase.ts (or purchase service/actions)
  - web/tests/int/purchase-workflow.int.spec.ts
  - web/tests/int/purchase-invariants.int.spec.ts
- **Interface contracts**: PROJECT.md, schema.prisma, financial atomicity rules
- **Review criteria**:
  - Atomicity & Rollback under failure
  - Exact balance boundary (balance == price -> 0 VND)
  - Insufficient balance boundary (balance == price - 1 VND -> error, no change)
  - Ledger balance derivation (wallet.balance == sum(credits) - sum(debits))

## Attack Surface
- **Hypotheses tested**: [TBD]
- **Vulnerabilities found**: [TBD]
- **Untested angles**: [TBD]

## Loaded Skills
None requested.

## Key Decisions Made
- Initializing empirical testing plan.

## Artifact Index
- DISPATCH.md — Task assignment
- BRIEFING.md — Situational awareness
- progress.md — Liveness heartbeat
- handoff.md — Final challenge report
