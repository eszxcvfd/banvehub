# Original User Request

## 2026-09-15T06:56:40Z

# Teamwork Project Prompt

Requested team: Full team

Implement Phase 5 (Purchase & Download) of KienTaoHub: deliver digital product checkout from internal wallet balance, snapshot-price order creation, entitlement granting, and secure authenticated file streaming from private storage per PLAN.md §27, Decision 0002, and Decision 0006.

Working directory: /home/trung/Documents/2026/project/test-v6
Integrity mode: development

## Requirements

### R1. Digital Orders & Wallet Purchase Transaction
Implement the purchasing workflow enabling authenticated buyers to purchase digital assets using their internal wallet balance:
- Add `orders` and `order_items` collections with immutable snapshot price (BR-07), order status (`PENDING`, `COMPLETED`, `CANCELLED`), buyer relation, and total amount.
- Enforce BR-04: Sellers are strictly prohibited from purchasing their own products (anti-self-purchase invariant).
- Execute money movement via `debitWallet` from the Money Write Layer (`src/services/wallet.ts`) in the same database transaction as order creation and entitlement granting per Decision 0002.
- Support Free products (`isFree: true` or price = 0) with zero-cost checkout granting instant entitlement without deducting wallet funds.

### R2. Entitlements Ledger
Implement the `entitlements` collection as an independent authority for asset ownership per PLAN.md FR-16 and Decision 0006:
- Fields: `user`, `product`, `order` (optional for free products), `status` (`active`, `revoked`, `expired`), `grantedAt`.
- Unique constraint: A buyer can only hold one active entitlement per product; duplicate purchases of already-owned assets are refused or redirected to download.
- Free downloads automatically create an active entitlement row per FR-18.

### R3. Secure Authenticated Download Engine & Token Rail
Deliver the secure private download pipeline per BR-06 and Decision 0006:
- Enforce private storage boundary: Original design files in `web/private/product_files` are never exposed via static public URLs.
- Endpoint `POST /api/v1/downloads/token`: Generates a short-lived, cryptographically signed one-time token (5-minute TTL) for an authenticated buyer with an active entitlement.
- Endpoint `GET /api/v1/downloads/[token]`: Validates token signature and expiration, streams the file bytes with proper MIME type and filename attachment header, and records an audit row in `download_events` (user, product, IP, user-agent, timestamp, status).
- Deny access to unauthenticated guests or buyers without an active entitlement.

### R4. Storefront Purchase Flow & Buyer Library Interface
Provide responsive UI experiences for purchasing and accessing purchased assets:
- Product Detail CTA integration: "Mua ngay bằng ví" button with balance check modal, instant confirmation, and direct download prompt.
- Free product CTA integration: "Tải miễn phí ngay" button triggering entitlement creation and download.
- Buyer library/downloads page (`/account/downloads` or `/account/orders`): Lists all purchased and acquired files with download buttons, file specs, and order receipts.

### R5. Complete Verification & Exit Criteria
Meet the official Phase 5 exit criteria: `Top-up → Buy → Download` end-to-end flow verified programmatically:
- Dedicated test suite `tests/int/purchase-workflow.int.spec.ts`: Validates wallet debit, order creation, and entitlement grant in a single atomic transaction.
- Dedicated test suite `tests/int/secure-download.int.spec.ts`: Validates token generation, expiration rejection, entitlement checking, and private file streaming.
- Dedicated test suite `tests/int/purchase-invariants.int.spec.ts`: Validates BR-04 (seller self-purchase block), BR-07 (snapshot pricing), and insufficient funds rejection.
- 100% pass across all existing 17 test suites (242 tests), zero ESLint errors, and clean Next.js production build.

## Acceptance Criteria

### Schema & Database Invariants
- [ ] Collections `orders`, `order_items`, `entitlements`, and `download_events` registered in Payload config with versioned PostgreSQL migration Batch 6.
- [ ] Check constraint or hook enforces BR-04: Seller cannot buy own product.
- [ ] Snapshot price at order creation cannot be mutated if product price changes later (BR-07).

### Purchase & Entitlement
- [ ] Wallet purchase atomically debits wallet, creates completed order, and grants active entitlement.
- [ ] Insufficient balance returns typed error without creating orders or deducting balance.
- [ ] Free products grant active entitlement with 0 VND debit.

### Secure Download
- [ ] Unauthenticated users and users without active entitlement cannot download private files.
- [ ] Download token expires after TTL (5 minutes) and is rejected upon expiration.
- [ ] Successful download logs an event in `download_events` and streams private file bytes.

### Verification & Quality Gates
- [ ] `Top-up → Buy → Download` integration tests pass cleanly.
- [ ] `pnpm --prefix web test:int` passes 100% of all tests (existing 242 + new Phase 5 suites).
- [ ] `pnpm --prefix web test:challenger` and `pnpm --prefix web test:stress` pass with 0 failures.
- [ ] `pnpm --prefix web lint` exits with code 0 (0 errors).
- [ ] `pnpm --prefix web build` compiles cleanly with exit code 0.

## 2026-09-15T09:37:07Z

# Teamwork Project Prompt

Requested team: Full team

Implement Phase 6 (Seller Revenue) of KienTaoHub: deliver commission calculation, seller earnings with configurable hold period, withdrawal request & approval workflow, and refund with compensating ledger entries. This builds on the existing Phase 5 purchase pipeline.

Working directory: /home/trung/Documents/2026/project/test-v6
Integrity mode: development

## Requirements

### R1. Commission Calculation & Seller Earnings

When a buyer completes a purchase (Phase 5 `purchaseProduct`), the system must atomically calculate commission and create a seller earning record:

- Platform fee = `sale_price × commission_rate` (configurable, not hard-coded per PLAN.md §6.3)
- Seller amount = `sale_price - platform_fee`
- Commission configuration must support: site-wide default rate, per-seller override rate, and per-campaign rate. Changes to commission rate must not affect existing orders (BR-07).
- Each `OrderItem` already stores snapshot fields (`salePrice`, `platformFee`, `sellerAmount`). The purchase service must populate these correctly.
- A `seller_earnings` record is created with status `PENDING` upon order completion.
- After the configurable hold period (default 7 days, per FR-31), status transitions `PENDING → AVAILABLE`.
- The hold period exists to allow time for refund/fraud processing.

### R2. Withdrawal Request & Approval Flow

Sellers can request withdrawal of their available earnings to a bank account (FR-32):

- Seller submits: amount, bank name, account number, account holder name.
- System validates: amount ≤ available balance, respects minimum/maximum withdrawal limits.
- Available balance is reserved (deducted from withdrawable total) upon request.
- Withdrawal states: `REQUESTED → UNDER_REVIEW → APPROVED → PROCESSING → PAID` (success path), with `REJECTED`, `CANCELLED`, `FAILED` as terminal/error states.
- Finance Admin or Super Admin can approve/reject withdrawals (§22 authorization matrix: `Approve withdrawal` = Finance ✅, Admin ✅, all others ❌).
- Rejected withdrawals must release the reserved balance back to available.
- All state transitions must have audit logging via `withdrawal_events`.

### R3. Refund with Compensating Ledger Entries

Implement refund per FLOW-U15 and BR-03 (immutable ledger):

- Refunds must never update or delete existing ledger entries. Instead, create compensating (reversal) entries.
- Refund flow: create refund record → lock original transaction → credit buyer wallet via reversal entry → reverse seller earning → reverse platform revenue → update order status → optionally revoke entitlement → audit log.
- Finance Admin can initiate refunds per §5.5 and §22.
- Refunded orders must reflect the refunded state without altering the original purchase records.

### R4. Finance Admin Operations & Seller Dashboard Integration

- Finance Admin can: view all earnings, view all withdrawals, approve/reject withdrawals, initiate refunds, view the full ledger (§5.5, §22).
- Seller dashboard (`/seller`) must display: total earnings, pending earnings, available balance, withdrawal history, and per-product earnings breakdown.
- API endpoints per PLAN.md §18: `GET /api/v1/seller/earnings`, `POST /api/v1/seller/withdrawals`, `GET /api/v1/admin/withdrawals`, `POST /api/v1/admin/withdrawals/{id}/approve`, `POST /api/v1/admin/refunds`.

### R5. Complete Verification & Regression Testing

Ensure zero regressions across the entire codebase:
- All new collections must have versioned PostgreSQL migrations applied via Payload migration tooling.
- Integration tests must prove the full lifecycle: `Buyer purchase → seller earning PENDING → hold period expires → AVAILABLE → withdrawal REQUESTED → APPROVED → PAID`.
- Integration tests must prove refund creates compensating entries and does not mutate existing ledger records.
- Integration tests must prove access control boundaries: seller sees only own earnings, finance admin sees all, buyer cannot access earnings/withdrawals.
- Existing tests (347 tests across 22 suites) must continue to pass without regression.
- `pnpm --prefix web lint` exits 0 with 0 errors.
- `pnpm --prefix web build` completes successfully.

## Acceptance Criteria

### Verification & Quality Gates
- [ ] Commission is calculated atomically during purchase, with configurable rate (not hard-coded). OrderItem snapshot fields (`platformFee`, `sellerAmount`) are correctly populated.
- [ ] `seller_earnings` records are created with `PENDING` status on purchase completion, and transition to `AVAILABLE` after the hold period.
- [ ] Withdrawal lifecycle (`REQUESTED → UNDER_REVIEW → APPROVED → PROCESSING → PAID`) works end-to-end with balance reservation and release on rejection.
- [ ] Refunds create compensating ledger entries without mutating existing records (BR-03). Buyer wallet is credited, seller earning is reversed.
- [ ] Authorization matrix is enforced: only Finance Admin and Super Admin can approve withdrawals and initiate refunds.
- [ ] Seller dashboard displays earnings summary and withdrawal history.
- [ ] `pnpm --prefix web test:int` passes all integration tests (existing 347 + new Phase 6 tests) with exit code 0.
- [ ] `pnpm --prefix web build` compiles cleanly with exit code 0.
- [ ] `pnpm --prefix web lint` exits with 0 errors.
- [ ] All migrations apply cleanly on PostgreSQL.

## 2026-09-15T12:39:54Z

## RESUME AFTER SERVER RESTART

Server restarted at 2026-09-15T12:39:00Z and stopped all subagents, including your Orchestrator gen2 (`7c1d229b-1583-4f43-924a-e6290887757a`). Your entire swarm is dead. You must relaunch the orchestrator to continue Phase 6.

### Verified on-disk state:
- Phase 6 Milestone 1 — the data layer IS materially implemented:
  - Collections created: `SellerEarnings/`, `Withdrawals/`, `WithdrawalEvents/`, `Refunds/`.
  - Access control created: `sellerEarningsAccess.ts`, `withdrawalAccess.ts`, `refundAccess.ts`, `sellerProfileAccess.ts`.
  - Modified: `Orders/index.ts` (REFUNDED status), `SellerProfiles.ts` (commissionRate override), `OrderStatus/index.tsx`, `me/orders/route.ts`.
  - Registration: `payload.config.ts` registers all 4 new collections.
  - Migration: `web/src/migrations/20260915_100000_phase6_seller_revenue.ts` registered in `web/src/migrations/index.ts`.
  - Types: `payload-types.ts` contains all new types.
  - Test suites authored: `seller-earnings.int.spec.ts`, `seller-withdrawals.int.spec.ts`, `refund-ledger.int.spec.ts`, `seller-revenue-e2e.int.spec.ts`.

### What remains:
- M2: Commission calculation + seller earning creation inside purchase pipeline (`web/src/services/purchase.ts`, commission service, hold period maturation).
- M3: Withdrawal service: request, balance reservation, approval/rejection, reservation release.
- M4: Refund service: compensating ledger entries, wallet credit, earning reversal.
- M5: Seller dashboard (`/seller`) & Finance Admin operations/API routes (`seller/earnings`, `seller/withdrawals`, `admin/withdrawals`, `admin/refunds`).
- M6: Final verification, full regression (347 existing + new Phase 6 tests), lint 0 errors, clean build.

## 2026-09-16T01:38:20Z

## RESUME AFTER SERVER RESTART (restart #3) — M1 IS CLOSED; EXECUTE M2 ONLY

**Timestamp:** 2026-09-16T08:38+07:00 (01:38Z). **Working dir:** `/home/trung/Documents/2026/project/test-v6`.

### 1. Do NOT re-run M1 and do NOT re-convene the M1 gate panel
M1 was already closed by parent on direct empirical verification.
Evidence verified:
- `pnpm tsc --noEmit`: exit 0, 0 errors
- `pnpm lint`: 0 errors
- `vitest run tests/int/m1-schema-stress.int.spec.ts`: 22/22 pass
- `vitest run tests/int/m1-access-control.int.spec.ts`: 59/59 pass
- `tsx .agents/p6_m1_auditor_1/verify_m1_hooks.ts`: 6/6 checks, zero integrity violations
- Live DDL: `seller_earnings` = 21 columns, 7 check constraints
- `seller-earnings.int.spec.ts`: 4 pass / 8 fail — all 8 are honest `M2 pending` skips, zero real assertion failures
- Defect 3 fixed: `generateWithdrawalCode` -> 8 hex chars `WTH-YYYYMMDD-XXXXXXXX`
- Two mis-shaped M2 test guards corrected.
`PROJECT.md` line 63 records M1 `DONE — gate closed`, and `GATE_STATUS.md` holds the verdict table.

### 2. Mission now: M2 — Commission Calculation & Seller Earnings Pipeline
1. `web/src/services/commission.ts` -> `resolveCommissionRate(payload, {sellerId, productId, campaignId?})` returning `{ commissionRate, policyVersion, source }`, plus `calculateRevenueSplit(amountVnd, rate)` returning `{ platformFee, sellerAmount }` with integer-VND, round-half-safe arithmetic (`platformFee + sellerAmount === amountVnd` exactly).
2. `web/src/services/earnings.ts` -> earnings creation on purchase, 7-day hold maturation (`PENDING` -> `AVAILABLE` via `releaseMaturedEarnings(payload, {sellerId, asOf})`), and `getSellerBalance(payload, sellerId)` returning `{ totalEarned, pendingBalance, availableBalance, reservedBalance, withdrawnTotal }`.
3. Atomic integration into `purchaseProduct` (`web/src/services/purchase.ts`) so `order_items` snapshot fields freeze (`salePrice`, `platformFee`, `sellerAmount`, `commissionRate`, `policyVersion`) and a `seller_earnings` row is created as `PENDING` with `holdUntil` = +7 days — in the same transaction as the wallet debit (no partial money state).
4. Payload global `CommissionSettings` (`web/src/globals/CommissionSettings.ts`) + registration in `web/src/payload.config.ts`, and migration Batch 8 appended to BOTH live ledger and `web/src/migrations/index.ts`.

### 3. GOVERNING DECISIONS (User-Answered):
- **A1 (site default rate):** Payload global `CommissionSettings` storing `defaultRate` as DATA (never hard-coded), seeded to 0.30; derive `policyVersion` from that value (e.g. `site-default-v1-0.30`).
- **A2 (campaign tier):** Defer campaigns from P0. Resolver still accepts `campaignId`, but resolves it from a Campaigns collection that does not exist yet -> campaign test must be corrected into a verified pending skip (guarded, honest `M2 pending` message, no fake assertion), and deferral stated explicitly in `PROJECT.md` and ADR 0009 as out of scope for P0. Do not create Campaigns collection or Batch 9 migration in M2. Do not delete campaign tier from PLAN.md.

### 4. Constraints:
- Agent dir names must use `p6_m2_*` prefix. Never reuse bare `m2_*` dirs.
- RAM constraint: Run at most 1–2 agents concurrently, in sequential batches. Smallest panel to falsify claims (1 worker, 1 reviewer/challenger, 1 auditor sequentially).
- Commands run plain (no `rtk` prefix).
- Dev DB: Docker container `kientaohub-postgres`. Use `docker exec kientaohub-postgres psql -U payload -d kientaohub -c "..."`.
- Migration ledger has 7 rows. Batch 8 must be appended to ledger and `web/src/migrations/index.ts`.
- Payload global scalar fields need only 3-column base table (`id`, `updated_at`, `created_at`).
- 55 uncommitted files: do not revert/stash/reset/checkout.
- Maintain `docs/plans/active/phase-6-seller-revenue.md`.


