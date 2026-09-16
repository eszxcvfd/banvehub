# Plan: Storefront Purchase & Download Flow Integration

## Objective
Connect `DigitalProductCTA` on `/products/[slug]` to backend purchase and download APIs, handling entitlement detection, wallet balance debit, free asset downloads, insufficient funds modals, and self-purchase prevention.

## Phases (SWE Light)
1. **Implementation Phase**:
   - Dispatch `teamwork_preview_implementer` to implement R1-R4 requirements and verify R5 quality gates.
2. **Adversarial Review Phase (Min. 3 rounds)**:
   - Round 1 (`teamwork_preview_reviewer`): Attempt to break diff, fix discovered issues, update open-issues ledger.
   - Round 2 (`teamwork_preview_reviewer`): Adversarial inspection, boundary test, regression verification.
   - Round 3 (`teamwork_preview_reviewer`): Final adversarial polish, quality gate enforcement.
3. **Audit & Verification Phase**:
   - Independent test & build re-verification by orchestrator.
   - Dispatch `teamwork_preview_victory_auditor` for blocking audit verdict.
4. **Completion**:
   - Report final completion and test results to Sentinel.
