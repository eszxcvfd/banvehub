# Project: KienTaoHub — Phase 6: Seller Revenue

## Architecture
- **Overview**: Implements the monetization and payout layer of KienTaoHub: 3-tier commission calculation, snapshot line items, seller earnings with configurable hold period (7 days), withdrawal request & approval workflow with atomic balance reservation, compensating ledger entries for refunds (BR-03, FLOW-U15), Finance Admin operations, and responsive Seller Dashboard views.
- **Module Boundaries**:
  - `web/src/collections/`: Data schema definitions:
    - `SellerEarnings` (`seller_earnings`): Earned seller revenue, status (`PENDING`, `AVAILABLE`, `REVERSED`, `PAID`), hold timestamps.
    - `Withdrawals` (`withdrawals`): Bank payout requests, status (`REQUESTED`, `UNDER_REVIEW`, `APPROVED`, `PROCESSING`, `PAID`, `REJECTED`, `CANCELLED`, `FAILED`), bank details.
    - `WithdrawalEvents` (`withdrawal_events`): Append-only audit trail for withdrawal state transitions.
    - `Refunds` (`refunds`): Refund audit records linking orders, buyer refunds, and seller/platform fee reversals.
    - `Orders` update: Extend `status` enum to include `REFUNDED`.
    - `SellerProfiles` update: Support optional `commissionRate` override.
  - `web/src/migrations/`: PostgreSQL Batch 7 migration with DDL, constraints (`CHECK (amount >= 50000)`, `CHECK (amount <= 50000000)`), and audit triggers.
  - `web/src/services/`:
    - `commission.ts`: 3-tier rate resolver (campaign -> seller override -> site default) and integer VND arithmetic.
    - `purchase.ts`: Updated to atomically calculate commission, write snapshot line items, and create `seller_earnings` (`PENDING`) inside the purchase transaction.
    - `earnings.ts`: Seller balance computation (`getSellerBalance`) and hold period maturation (`releaseMaturedEarnings`).
    - `withdrawal.ts`: Atomic balance reservation, request submission, cancellation, review, approval, rejection (balance release), and payout finalization.
    - `refund.ts`: Compensating ledger reversal (BR-03, FLOW-U15), buyer wallet credit, seller earning reversal, platform fee adjustment, order status update, entitlement revocation.
  - `web/src/app/api/v1/`: Next.js REST API routes:
    - Seller: `GET /api/v1/seller/earnings`, `POST /api/v1/seller/withdrawals`, `GET /api/v1/seller/withdrawals`.
    - Admin: `GET /api/v1/admin/withdrawals`, `POST /api/v1/admin/withdrawals/[id]/approve`, `POST /api/v1/admin/withdrawals/[id]/reject`, `POST /api/v1/admin/refunds`.
  - `web/src/app/(app)/seller/`: Seller dashboard with financial KPI cards (available, pending, total), withdrawal modal & history, per-product breakdown.
  - `web/src/app/(app)/finance/`: Finance Admin operations portal for withdrawal approvals/rejections and refunds.
  - `web/tests/int/`: Comprehensive integration test suites across Tiers 1–4.

## Feature Inventory
| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| 1 | 3-Tier Commission Hierarchy | Resolves commission rate: Campaign -> Seller Override -> Site Default (rate decided: 0.30 data-backed in CommissionSettings global, policyVersion: site-default-v1-0.30) | M2 | PLAN.md §6.3, ORIGINAL_REQUEST R1, ADR 0009 |
| 2 | Integer VND Commission Arithmetic | `platformFee = Math.round(salePrice * rate)`, `sellerAmount = salePrice - platformFee` | M2 | PLAN.md §6.2, ORIGINAL_REQUEST R1 |
| 3 | OrderItem Snapshot Line Items | Populates and freezes `salePrice`, `platformFee`, `sellerAmount`, `tax`, `policyVersion` in `order_items` | M2 | PLAN.md BR-07, ORIGINAL_REQUEST R1 |
| 4 | Seller Earnings Collection & Record Creation | Schema `seller_earnings`, created atomically with status `PENDING` during purchase | M1, M2 | PLAN.md FR-31, ORIGINAL_REQUEST R1 |
| 5 | Configurable Hold Period Maturation | Transitions `seller_earnings` from `PENDING` -> `AVAILABLE` when `NOW() >= holdUntil` (default 7 days) | M2 | PLAN.md FR-31, ORIGINAL_REQUEST R1 |
| 6 | Seller Balance Aggregation Service | Computes `availableBalance`, `pendingBalance`, and `totalEarned` for a seller | M2 | PLAN.md FR-31, FR-32 |
| 7 | Withdrawals Collection Schema | Schema `withdrawals` with code, seller, amount, bankInfo, status, timestamps | M1 | PLAN.md FR-32, ORIGINAL_REQUEST R2 |
| 8 | Withdrawal Request Submission | Seller submits payout request to bank account with validation | M3 | PLAN.md FR-32, ORIGINAL_REQUEST R2 |
| 9 | Withdrawal Min/Max Limits Validation | Enforces minimum (50,000 VND) and maximum (50,000,000 VND) limits | M3 | PLAN.md FR-32, ORIGINAL_REQUEST R2 |
| 10 | Atomic Balance Reservation (Anti-Race T7) | Atomically reserves available balance upon request to prevent concurrent overdraft | M3 | PLAN.md BR-01, Threat T7 |
| 11 | Withdrawal State Machine | 8 states: `REQUESTED -> UNDER_REVIEW -> APPROVED -> PROCESSING -> PAID`, `REJECTED`, `CANCELLED`, `FAILED` | M3 | PLAN.md FR-32, Decision 0005 |
| 12 | Withdrawal Balance Release on Rejection/Cancellation | Releases reserved balance back to available on `REJECTED` or `CANCELLED` | M3 | PLAN.md FR-32, ORIGINAL_REQUEST R2 |
| 13 | Withdrawal Events Audit Logging | Schema `withdrawal_events` tracking all state transitions, actor, timestamp, reason | M1, M3 | PLAN.md FR-32, ORIGINAL_REQUEST R2 |
| 14 | Withdrawal RBAC Matrix | Only `financeAdmin` and `admin` can approve/reject; sellers only view/request own | M1, M3 | PLAN.md §5.5, §22, ORIGINAL_REQUEST R2 |
| 15 | Compensating Ledger Refund (Buyer) | Reversal credit entry in `wallet_ledger` for buyer wallet without mutating original entries (BR-03) | M4 | PLAN.md BR-03, FLOW-U15, ORIGINAL_REQUEST R3 |
| 16 | Seller Earning Reversal | Reverses seller earning: marks `REVERSED` if pending, or adjusts balance if available | M4 | PLAN.md FLOW-U15, ORIGINAL_REQUEST R3 |
| 17 | Platform Fee Reversal | Reverses platform revenue associated with refunded order items | M4 | PLAN.md FLOW-U15, ORIGINAL_REQUEST R3 |
| 18 | Order Status Update to REFUNDED | Updates order status to `REFUNDED` while preserving snapshot line items | M1, M4 | PLAN.md FLOW-U15, ORIGINAL_REQUEST R3 |
| 19 | Entitlement Revocation Option | Revokes buyer entitlement (`status: 'revoked'`) upon refund when requested | M4 | PLAN.md FLOW-U15, ORIGINAL_REQUEST R3 |
| 20 | Refunds Collection Schema & Audit Record | Schema `refunds` capturing order, buyer, seller, amounts, actor, reason, timestamps | M1, M4 | PLAN.md FLOW-U15, ORIGINAL_REQUEST R3 |
| 21 | Seller Earnings API (`GET /api/v1/seller/earnings`) | Returns financial summary, pending hold, available balance, itemized list | M5 | PLAN.md §18, ORIGINAL_REQUEST R4 |
| 22 | Seller Withdrawal API (`POST /api/v1/seller/withdrawals`) | Seller submits withdrawal request to bank account | M3, M5 | PLAN.md §18, ORIGINAL_REQUEST R4 |
| 23 | Admin Withdrawals API (`GET /api/v1/admin/withdrawals`) | Finance Admin lists all withdrawal requests with filtering | M3, M5 | PLAN.md §18, §22, ORIGINAL_REQUEST R4 |
| 24 | Admin Withdrawal Actions (`POST .../approve`, `.../reject`) | Finance Admin approves or rejects withdrawal with reason | M3, M5 | PLAN.md §18, §22, ORIGINAL_REQUEST R4 |
| 25 | Admin Refund API (`POST /api/v1/admin/refunds`) | Finance Admin executes compensating refund with reason and revocation choice | M4, M5 | PLAN.md §18, §22, ORIGINAL_REQUEST R4 |
| 26 | Seller Dashboard UI & Payout Portal | Extends `/seller` with financial KPI cards, withdrawal modal, history table, and product breakdown | M5 | ORIGINAL_REQUEST R4 |
| 27 | PostgreSQL Migration Batch 7 | Versioned DDL migration for all new collections, status enum alter, constraints, triggers | M1 | ORIGINAL_REQUEST R5 |
| 28 | Comprehensive Test Suite & Regression Verification | 100% pass across all 347 existing tests + new Phase 6 suites (Tiers 1–4), clean lint, clean build | TestTrack, M6 | ORIGINAL_REQUEST R5 |

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| TestTrack | E2E & Integration Testing Track | Author 4 opaque-box integration test suites (`tests/int/`) covering Tiers 1-4 | none | DONE |
| M1 | Data Models, Access Controls & Migration Batch 7 | Collections `seller_earnings`, `withdrawals`, `withdrawal_events`, `refunds`; update `orders` (`REFUNDED`) & `seller_profiles`; Payload config; Batch 7 migration; DDL constraints | none | DONE — gate closed 2026-09-15 on direct empirical verification (81/81 M1 suites, 0 tsc errors, 0 lint errors, audit script 6/6, live DB 21 cols / 7 constraints). The 5-agent gate panel was lost to a machine restart; `p6_m1_challenger_1` had reported APPROVE. Two M2-pending test guards were corrected and Defect 3 (withdrawal code width) was fixed. |
| M2 | Commission Calculation & Seller Earnings Pipeline | 3-tier commission resolver, integer VND arithmetic, atomic `purchaseProduct` integration, `seller_earnings` creation (`PENDING`), 7-day hold period maturation (`AVAILABLE`), balance computation | M1 | DONE — gate passed 2026-09-16 (27/27 M2 tests pass, Batch 8 migration live, 0 tsc/lint errors, Auditor CLEAN) |
| M3 | Withdrawal Request, Reservation & Approval Workflow | Withdrawal service (`web/src/services/withdrawal.ts`), atomic balance reservation (Threat T7), state machine transitions, rejection release, audit events, seller & admin withdrawal API routes | M1, M2 | DONE — gate passed 2026-09-16 (14/14 tests pass, Threat T7 mutex, 4 REST API routes live, Reviewer APPROVE, Auditor CLEAN) |
| M4 | Compensating Refund Ledger & Reversal Flow | Refund service (`web/src/services/refund.ts`), BR-03 immutable ledger reversal, buyer wallet credit, seller earning reversal, platform fee adjustment, order status update, entitlement revocation, `POST /api/v1/admin/refunds` | M1, M2 | DONE — gate passed 2026-09-16 (10/10 tests pass, BR-03 immutable ledger reversal, Reviewer APPROVE, Auditor CLEAN) |
| M5 | Seller Dashboard UI & Finance Admin Operations | `GET /api/v1/seller/earnings`, `/seller` dashboard financial KPIs, withdrawal modal, payout history, per-product breakdown, Finance Admin operations interface (`/finance`) | M2, M3, M4 | DONE — gate passed 2026-09-16 (169/169 tests pass, Next.js build exit 0, Reviewer APPROVE, Auditor CLEAN) |
| M6 | Final Verification, Full Regression & Adversarial Hardening | Pass 100% of E2E suites (Tiers 1-4), Tier 5 adversarial coverage hardening, zero regressions on all 347 existing tests, 0 ESLint errors, clean Next.js build | TestTrack, M1, M2, M3, M4, M5 | DONE — 2026-09-16 (419/419 `tests/int/` tests pass, 347 prior regression tests pass with 0 regressions, tsc 0 errors, lint 0 errors, Next.js build exit 0; independent Victory Auditor `VICTORY CONFIRMED`. Note: no per-gate reviewer/auditor pair for M6, and the 419 figure excludes the separate challenger/stress/E2E suites) |

## Interface Contracts

### Commission & Earnings
```ts
export interface CommissionResolution {
  commissionRate: number // e.g. 0.30
  policyVersion: string  // e.g. 'v1-default-30'
  source: 'campaign' | 'seller_override' | 'site_default'
}

export function resolveCommissionRate(
  payload: Payload,
  params: {
    sellerId: number
    productId: number
    campaignId?: number
  }
): Promise<CommissionResolution>

export function calculateRevenueSplit(
  salePrice: number,
  commissionRate: number,
  tax = 0
): {
  platformFee: number
  sellerAmount: number
  tax: number
}

export interface SellerBalanceSummary {
  totalEarned: number
  pendingBalance: number
  availableBalance: number
  reservedBalance: number
  withdrawnTotal: number
}

export function getSellerBalance(
  payload: Payload,
  sellerId: number
): Promise<SellerBalanceSummary>

export function releaseMaturedEarnings(
  payload: Payload,
  options?: { sellerId?: number; asOf?: Date }
): Promise<{ releasedCount: number; totalReleasedAmount: number }>
```

### Withdrawal Service
```ts
export interface WithdrawalRequestParams {
  sellerId: number
  amount: number
  bankInfo: {
    bankName: string
    accountNumber: string
    accountHolderName: string
  }
}

export interface WithdrawalResult {
  id: number
  code: string
  amount: number
  status: string
  requestedAt: string
}

export function requestWithdrawal(
  payload: Payload,
  params: WithdrawalRequestParams
): Promise<WithdrawalResult>

export function approveWithdrawal(
  payload: Payload,
  params: { withdrawalId: number; actorId: number; notes?: string }
): Promise<WithdrawalResult>

export function rejectWithdrawal(
  payload: Payload,
  params: { withdrawalId: number; actorId: number; reason: string }
): Promise<WithdrawalResult>

export function cancelWithdrawal(
  payload: Payload,
  params: { withdrawalId: number; sellerId: number }
): Promise<WithdrawalResult>
```

### Refund Service
```ts
export interface RefundParams {
  orderId: number
  reason: string
  actorId: number
  revokeEntitlement?: boolean
}

export interface RefundResult {
  refundId: number
  orderId: number
  buyerId: number
  amountRefunded: number
  reversalLedgerEntryId: number
  entitlementRevoked: boolean
}

export function processRefund(
  payload: Payload,
  params: RefundParams
): Promise<RefundResult>
```

## Code Layout
- `web/src/collections/SellerEarnings/index.ts`: Collection definition for `seller_earnings`
- `web/src/collections/Withdrawals/index.ts`: Collection definition for `withdrawals`
- `web/src/collections/WithdrawalEvents/index.ts`: Collection definition for `withdrawal_events`
- `web/src/collections/Refunds/index.ts`: Collection definition for `refunds`
- `web/src/migrations/20260915_100000_phase6_seller_revenue.ts`: Batch 7 migration
- `web/src/services/commission.ts`: Commission rate resolution & arithmetic
- `web/src/services/earnings.ts`: Seller balance calculation & hold period maturation
- `web/src/services/withdrawal.ts`: Withdrawal lifecycle, balance reservation & events
- `web/src/services/refund.ts`: Compensating refund flow, ledger reversal, entitlement revocation
- `web/src/services/purchase.ts`: Updated checkout pipeline with commission & earnings creation
- `web/src/app/api/v1/seller/earnings/route.ts`: Seller earnings & balance endpoint
- `web/src/app/api/v1/seller/withdrawals/route.ts`: Seller withdrawal list & request endpoint
- `web/src/app/api/v1/admin/withdrawals/route.ts`: Finance Admin list withdrawals
- `web/src/app/api/v1/admin/withdrawals/[id]/approve/route.ts`: Finance Admin approve endpoint
- `web/src/app/api/v1/admin/withdrawals/[id]/reject/route.ts`: Finance Admin reject endpoint
- `web/src/app/api/v1/admin/refunds/route.ts`: Finance Admin refund endpoint
- `web/src/app/(app)/seller/`: Updated Seller Dashboard with financial KPIs & withdrawal form
- `web/src/app/(app)/finance/`: Finance Admin operations page
- `web/tests/int/seller-earnings.int.spec.ts`: Commission, hold period, balance tests
- `web/tests/int/seller-withdrawals.int.spec.ts`: Withdrawal lifecycle, reservations, boundaries
- `web/tests/int/refund-ledger.int.spec.ts`: Compensating ledger reversal, refund invariants
- `web/tests/int/seller-revenue-e2e.int.spec.ts`: End-to-end multi-actor flow & RBAC tests
