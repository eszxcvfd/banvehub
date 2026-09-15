# E2E Test Infra: Phase 5 Purchase & Download

## Test Philosophy
- Opaque-box, requirement-driven derived directly from ORIGINAL_REQUEST.md, PLAN.md §27, Decision 0002, and Decision 0006.
- No dependency on internal implementation shortcuts or bypasses.
- Methodology: Category-Partition + Boundary Value Analysis + Pairwise Interactions + Real-World Workload Scenarios (Tiers 1-4).

## Feature Inventory & Test Coverage Goals
| # | Feature | Source (Requirement) | Tier 1 (Feature) | Tier 2 (Boundary) | Tier 3 (Pairwise) |
|---|---------|---------------------|:----------------:|:-----------------:|:-----------------:|
| 1 | Wallet Digital Purchase (BR-01, FR-14) | ORIGINAL_REQUEST R1, PLAN.md §27 | >=5 | >=5 | ✓ |
| 2 | Anti-Self-Purchase Invariant (BR-04) | ORIGINAL_REQUEST R1, PLAN.md §10 | >=5 | >=5 | ✓ |
| 3 | Immutable Snapshot Pricing (BR-07) | ORIGINAL_REQUEST R1, PLAN.md §10 | >=5 | >=5 | ✓ |
| 4 | Free Product Instant Checkout (FR-18) | ORIGINAL_REQUEST R1, PLAN.md §8 | >=5 | >=5 | ✓ |
| 5 | Entitlements Ledger & Unique Active (FR-16) | ORIGINAL_REQUEST R2, Decision 0006 | >=5 | >=5 | ✓ |
| 6 | Signed Download Token Rail (FR-17) | ORIGINAL_REQUEST R3, Decision 0006 | >=5 | >=5 | ✓ |
| 7 | Secure Private Streaming & Boundary (BR-06) | ORIGINAL_REQUEST R3, Decision 0006 | >=5 | >=5 | ✓ |
| 8 | Download Events Audit Logging | ORIGINAL_REQUEST R3, Decision 0006 | >=5 | >=5 | ✓ |

## Test Architecture
- **Framework**: Vitest v4 (`web/vitest.config.mts`)
- **Location**: `web/tests/int/`
- **Target Test Files**:
  1. `web/tests/int/purchase-workflow.int.spec.ts`: End-to-end atomic wallet purchase, wallet balance decrements, order creation (COMPLETED), order items, and entitlement generation.
  2. `web/tests/int/secure-download.int.spec.ts`: Signed token generation (5-min TTL), expiration enforcement, invalid signature rejection, active entitlement checking, private file streaming from `web/private/product_files`, and `download_events` audit trail.
  3. `web/tests/int/purchase-invariants.int.spec.ts`: BR-04 seller self-purchase refusal, BR-07 snapshot price protection against subsequent product price alterations, insufficient funds handling without debit or order creation, duplicate purchase prevention.

## Real-World Application Scenarios (Tier 4)
| # | Scenario | Features Exercised | Target Spec |
|---|----------|--------------------|-------------|
| 1 | New buyer registers, tops up wallet via VietQR mock, purchases 3D Revit asset, checks order receipt, downloads asset, verifies file contents | F1, F5, F6, F7, F8 | `purchase-workflow.int.spec.ts` |
| 2 | Guest registers, claims free CAD asset (0 VND), verifies wallet balance remains untouched, receives active entitlement, streams asset | F4, F5, F6, F7 | `purchase-workflow.int.spec.ts` |
| 3 | Malicious or concurrent double-click checkout attempt on same asset, verifies exactly one debit and one active entitlement created | F1, F5 | `purchase-invariants.int.spec.ts` |
| 4 | Seller creates product, then attempts to buy own product; receives typed error; product price modified by seller, existing buyer's order maintains original price | F2, F3 | `purchase-invariants.int.spec.ts` |
| 5 | Buyer generates download token, waits or tampers with token/expires token; stream is rejected with 401/403 and logged as EXPIRED/DENIED in download_events | F6, F7, F8 | `secure-download.int.spec.ts` |

## Coverage Thresholds
- Tier 1: Feature Coverage (>=5 tests per feature across workflow, invariants, and downloads)
- Tier 2: Boundary & Corner Cases (insufficient balance by 1 VND, 0 VND free checkout, expired token by 1s, tampered payload, revoked entitlement)
- Tier 3: Cross-Feature Combinations (wallet debit + entitlement grant atomicity, snapshot price vs subsequent price changes)
- Tier 4: Real-World Scenarios (Top-up -> Buy -> Download complete flow)
- Total new test cases target: >= 25 test cases across the 3 test suites.
