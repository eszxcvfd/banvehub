# Phase 5 Test Suite Ready: Purchase & Download Track

**Author**: `test_writer_e2e` (Phase 5 E2E Testing Track)  
**Date**: 2026-09-15  
**Target Milestone**: Phase 5 (Purchase & Download)  
**Status**: TEST_READY (Authoritative test suites created, validated against test runner and lint)  

---

## 1. Test Architecture & Overview

The Phase 5 test suite delivers comprehensive, opaque-box integration tests derived strictly from `ORIGINAL_REQUEST.md` (R1 – R5), `PLAN.md` (§8, §10, §11, §17, §27, §29), `Decision 0002` (Money Write Layer), and `Decision 0006` (Secure Download Path).

The suites are organized across 3 dedicated files in `web/tests/int/`:
1. `web/tests/int/purchase-workflow.int.spec.ts`: End-to-end atomic wallet purchase workflow, wallet balance decrements, order creation (status `COMPLETED`), immutable snapshot order items, active entitlement generation, and free product checkout.
2. `web/tests/int/secure-download.int.spec.ts`: Cryptographically signed one-time download token rail (JWT 5-min TTL), expiration enforcement, invalid signature rejection, active entitlement checking, private file streaming from `web/private/product_files`, and `download_events` audit trail.
3. `web/tests/int/purchase-invariants.int.spec.ts`: BR-04 seller self-purchase refusal, BR-07 snapshot price protection against subsequent product price changes, insufficient funds rejection without balance deduction or order creation, and duplicate purchase prevention.

---

## 2. Test Execution Commands

```bash
# Run individual test suites
pnpm --prefix web test:int tests/int/purchase-workflow.int.spec.ts
pnpm --prefix web test:int tests/int/secure-download.int.spec.ts
pnpm --prefix web test:int tests/int/purchase-invariants.int.spec.ts

# Run all Phase 5 test suites together
pnpm --prefix web test:int tests/int/purchase-*.int.spec.ts tests/int/secure-download.int.spec.ts

# Run full integration regression (17 existing suites + 3 new Phase 5 suites)
pnpm --prefix web test:int

# Code quality validation
pnpm --prefix web lint
```

---

## 3. Test Suites & Test Inventory (26 Tests Total)

| Test File | Test Description | Tier | Target Requirement | Current Status |
|---|---|:---:|---|:---:|
| **`purchase-workflow.int.spec.ts`** | Complete wallet purchase flow for commercial product debits balance and creates completed order and active entitlement | Tier 1 | FR-14, R1, Decision 0002 | Pending M2 (`purchaseProduct`) |
| | Boundary: Exact balance purchase decrements wallet balance cleanly to 0 VND | Tier 2 | FR-14, BR-01 | Pending M2 (`purchaseProduct`) |
| | Free product checkout creates order with 0 VND total and grants active entitlement without deducting wallet | Tier 1 | FR-18, R1, Decision 0006 | Pending M2 (`purchaseProduct`) |
| | Multiple different products purchased by same buyer receive separate orders and active entitlements | Tier 3 | FR-15, FR-16, R2 | Pending M2 (`purchaseProduct`) |
| | End-to-End integration: User purchases product -> requests download token -> streams private file bytes matching upload | Tier 4 | R5, FR-14, FR-17 | Pending M2/M3 (`purchase` + `download`) |
| | Ledger balance invariant: wallet balance strictly equals sum of all wallet_ledger rows for buyer | Tier 3 | Decision 0002, BR-01 | **PASSED** (100%) |
| **`secure-download.int.spec.ts`** | Authenticated user with active entitlement receives signed download token with 5-minute expiry | Tier 1 | FR-17, R3, Decision 0006 | Pending M3 (`createDownloadToken`) |
| | Streaming private file bytes: validates signature and streams file with attachment header and proper MIME type | Tier 1 | FR-17, R3, Decision 0006 | Pending M3 (`verifyAndStreamDownload`) |
| | Audit log: Each stream attempt creates an audit row in `download_events` with status `SUCCESS` | Tier 1 | FR-17, R3, Decision 0006 | Pending M3 (`download_events`) |
| | Boundary: Unauthenticated guest requesting download token is rejected with 401 Unauthorized | Tier 2 | FR-17, R3 | Pending M3 (`createDownloadToken`) |
| | Boundary: Authenticated user WITHOUT active entitlement requesting token is rejected with 403 Forbidden | Tier 2 | FR-16, FR-17, R3 | Pending M3 (`createDownloadToken`) |
| | Boundary: User with REVOKED entitlement requesting token is rejected with 403 Forbidden | Tier 2 | FR-16, Decision 0006 | Pending M3 (`createDownloadToken`) |
| | Boundary: Expired token returns 401/403 and records audit row with status `EXPIRED` | Tier 2 | FR-17, Decision 0006 | Pending M3 (`verifyAndStreamDownload`) |
| | Adversarial: Tampered token signature is rejected and records audit row | Tier 2 | FR-17, Decision 0006 | Pending M3 (`verifyAndStreamDownload`) |
| | Private file boundary (BR-06): `web/private/product_files` is not accessible publicly without entitlement | Tier 1 | BR-06, R3 | **PASSED** (100%) |
| | Token replay window allows multiple downloads within 5-minute TTL, incrementing downloadCount and audit events | Tier 4 | FR-17, Decision 0006 | Pending M3 (`download` service) |
| **`purchase-invariants.int.spec.ts`** | BR-04 Anti-Self-Purchase: Seller attempting to purchase own product is strictly refused with typed error | Tier 1 | BR-04, R1 | Pending M2 (`purchaseProduct`) |
| | Pairwise: BR-04 applies to free products: Seller cannot claim own free product | Tier 3 | BR-04, FR-18 | Pending M2 (`purchaseProduct`) |
| | Boundary: Third party buyer CAN purchase the seller product without BR-04 restriction | Tier 2 | BR-04, FR-14 | Pending M2 (`purchaseProduct`) |
| | BR-07 Snapshot Pricing: If product.price is changed after order creation, order_item.salePrice on existing order remains unchanged | Tier 1 | BR-07, R1, Decision 0003 | Pending M2 (`purchaseProduct`) |
| | Boundary: BR-07 Snapshot Pricing when product price is reduced after checkout | Tier 2 | BR-07, Decision 0003 | Pending M2 (`purchaseProduct`) |
| | Insufficient Funds: When wallet balance < product.price, purchase fails with InsufficientFundsError, 0 VND debited, 0 orders created | Tier 1 | BR-01, R1, Decision 0002 | Pending M2 (`purchaseProduct`) |
| | Boundary: Insufficient balance by exactly 1 VND fails with typed InsufficientFundsError | Tier 2 | BR-01, Decision 0002 | Pending M2 (`purchaseProduct`) |
| | Duplicate Purchase: Attempting to purchase a product already held as an active entitlement is refused | Tier 1 | FR-16, R2 | Pending M2 (`purchaseProduct`) |
| | Unapproved / Draft Product: Cannot purchase unpublished or draft products | Tier 1 | FR-14, R1 | Pending M2 (`purchaseProduct`) |
| | Boundary: Cannot purchase product with moderationStatus rejected | Tier 2 | FR-14, R1 | Pending M2 (`purchaseProduct`) |

**Total Test Count**: 26 tests (Target was >= 25).

---

## 4. Feature Coverage Matrix (Tiers 1 – 4)

| Feature # | Feature Name | Source | Tier 1 (Feature) | Tier 2 (Boundary) | Tier 3 (Pairwise) | Tier 4 (Scenario) | Test Files |
|:---:|---|---|:---:|:---:|:---:|:---:|---|
| **F1** | Wallet Digital Purchase | R1, FR-14 | ✓ | ✓ (Exact 0 balance) | ✓ (Ledger balance) | ✓ (Top-up -> Buy -> Stream) | `purchase-workflow.int.spec.ts` |
| **F2** | Anti-Self-Purchase (BR-04) | R1, BR-04 | ✓ | ✓ (3rd party allowed) | ✓ (Free product self-claim) | — | `purchase-invariants.int.spec.ts` |
| **F3** | Snapshot Pricing (BR-07) | R1, BR-07 | ✓ (Price doubled) | ✓ (Price reduced) | — | — | `purchase-invariants.int.spec.ts` |
| **F4** | Free Product Instant Checkout | R1, FR-18 | ✓ | ✓ (0 VND wallet) | ✓ (BR-04 on free) | ✓ (Free claim -> Stream) | `purchase-workflow.int.spec.ts` |
| **F5** | Entitlements Ledger & Unique Active | R2, FR-16 | ✓ (Active grant) | ✓ (Revoked reject) | ✓ (Multi-product) | ✓ (downloadCount increment) | `purchase-workflow`, `secure-download`, `purchase-invariants` |
| **F6** | Signed Download Token Rail | R3, FR-17 | ✓ (JWT 5-min) | ✓ (Guest 401, No ent 403, Expired 401) | ✓ (Tampered payload) | ✓ (Replay within TTL) | `secure-download.int.spec.ts` |
| **F7** | Secure Private Streaming | R3, BR-06 | ✓ (Byte match) | ✓ (Private storage boundary) | — | ✓ (Full file stream) | `secure-download.int.spec.ts` |
| **F8** | Download Events Audit Logging | R3, Decision 0006 | ✓ (SUCCESS logged) | ✓ (EXPIRED logged) | — | ✓ (Multi-download count) | `secure-download.int.spec.ts` |

---

## 5. Implementation Readiness & Transition

1. **Clean Compilation & Zero Lint Errors**: All 3 test files pass ESLint check with 0 errors (`pnpm --prefix web lint`).
2. **Zero Regressions**: Existing 17 test suites (242 tests) continue to pass 100%.
3. **Progressive Testability**:
   - The test suites use safe dynamic path resolution with `@vite-ignore` to inspect whether `web/src/services/purchase.ts` and `web/src/services/download.ts` are present.
   - When Milestone 2 lands `web/src/services/purchase.ts`, `purchase-invariants.int.spec.ts` and `purchase-workflow.int.spec.ts` will immediately execute and validate.
   - When Milestone 3 lands `web/src/services/download.ts`, `secure-download.int.spec.ts` will immediately execute and validate.
   - The test suites establish strict baseline invariants and will serve as the verification barrier for Milestone 5 (Final Verification & Adversarial Hardening).
