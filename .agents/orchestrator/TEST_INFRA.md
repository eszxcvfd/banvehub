# E2E Test Infra: Phase 6 Seller Revenue

## Test Philosophy
- Opaque-box, requirement-driven testing derived from `ORIGINAL_REQUEST.md` and `PLAN.md` (§5.5, §6.3, §18, §22, FR-31, FR-32, FLOW-U15, BR-03, BR-07).
- Methodology: Category-Partition + Boundary Value Analysis + Pairwise Combinatorial + Real-World Workload Testing.
- Execution: Serial execution in Vitest (`fileParallelism: false`) against local PostgreSQL with clean cleanup in `afterAll()`.

## Test Architecture & Directory Layout
- Test runner: `rtk pnpm --prefix web test:int`
- Suites:
  - `web/tests/int/seller-earnings.int.spec.ts`: Commission calculation hierarchy, rounding conservation, OrderItem snapshot fields (BR-07), `seller_earnings` creation (`PENDING`), hold period maturation (`AVAILABLE`), and balance aggregation.
  - `web/tests/int/seller-withdrawals.int.spec.ts`: Payout request validation, min/max boundaries (50k/50M VND), atomic balance reservation (Threat T7), full 8-state machine, rejection/cancellation balance restoration, and `withdrawal_events` audit logging.
  - `web/tests/int/refund-ledger.int.spec.ts`: Compensating ledger reversal (BR-03, FLOW-U15), zero mutation of existing records, buyer wallet credit, seller earning reversal (`REVERSED`), platform fee reversal, order status update (`REFUNDED`), and optional entitlement revocation.
  - `web/tests/int/seller-revenue-e2e.int.spec.ts`: Multi-actor integration flows (Buyer purchase -> Hold -> Withdrawal -> Payout; Purchase -> Immediate refund during hold; Purchase -> Refund after hold; Concurrent withdrawal overdraft stress), and RBAC authorization matrix enforcement (§22).

## Coverage Thresholds
- Tier 1: ≥5 test cases per feature (Commission, Hold, Withdrawal, Refund, RBAC, API)
- Tier 2: Boundary & Corner Cases (0 VND items, fractional rounding, exact balance withdrawal, min/max limit violations, negative amounts, duplicate refunds)
- Tier 3: Cross-Feature Combinations (Purchase + Refund + Withdrawal; Hold Expiry + Withdrawal + Rejection + Re-request; Multiple Order Items Split)
- Tier 4: Real-World Workloads (Full lifecycle with multiple buyers, sellers, and finance admins; concurrent requests)
