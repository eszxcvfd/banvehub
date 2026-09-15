# Execution Plan: Phase 4 Payment & Wallet

Date: 2026-09-15

## Status

Completed

## Outcome

Delivered Phase 4 per `PLAN.md` §27, Decision 0002, Decision 0004, and Decision 0005, satisfying all official Phase 4 exit criteria:
- **Duplicate webhook test pass**: Idempotent processing guarantees repeated webhooks (sequential or 5x concurrent bursts) credit the wallet exactly once (BR-02, Case 1, Scenario C).
- **Failure recovery test pass**: Amount mismatches flag reconciliation without auto-failing (Case 5), invalid signatures/secrets are strictly rejected with 401 (Case 6), late verified webhooks on expired/cancelled intents still credit the wallet (Decision 0005 T3), and lazy expiry transitions past intents to EXPIRED on read (Decision 0005 T5).
- **Ledger invariant test pass**: Single write path with append-only ledger (Decision 0002), PostgreSQL triggers forbidding UPDATE/DELETE/TRUNCATE on `wallet_ledger` (BR-03) and DELETE/TRUNCATE on `wallets`, database check constraints preventing negative balance (`balance >= 0`), and direct collection mutations denied for all roles including administrators.
- Functional buyer wallet top-up flow with dynamic VietQR generation, copyable transfer syntax, live polling, and transparent financial ledger history.

## Context

- `PLAN.md` §11 (Payment Architecture), §21 (Payment Failure Scenarios), §22 (Authorization Matrix), §27 (Phase 4 scope and exit criteria), §29 (Test Plan), §32 (Security Threats).
- `docs/decisions/0002-money-write-layer.md` (Money-Path Write Layer: One Write Path, Append-Only Ledger).
- `docs/decisions/0004-payment-provider-sepay.md` (Payment Provider: SePay for P0 Wallet Top-Up).
- `docs/decisions/0005-financial-state-machine.md` (Financial State Machine: Payment Intents 7 states [CREATED, PENDING, PAID, EXPIRED, FAILED, CANCELLED, REFUNDED]).

## Scope

In scope:
1. **Schema & Collections**:
   - `wallets`: User relation, integer VND `balance` and `pendingBalance`, currency, status. Direct CRUD denied for all roles including admin.
   - `wallet_ledger`: Append-only entries (`wallet`, `user`, `type`, `amount`, `direction`, `referenceType`, `referenceId`, `balanceBefore`, `balanceAfter`, `description`, `metadata`). Direct CRUD denied.
   - `payment_intents`: Code, user, provider (`sepay`), amount, currency, status (7 states per Decision 0005), reconciliationFlag, reconciliationNote, expiresAt, checkoutUrl.
   - `payment_transactions`: Intent relation, provider, providerTransactionId, amount, rawReference, status, paidAt. Unique constraint on `(provider, providerTransactionId)` per BR-02.
   - `payment_webhook_events`: Provider, eventId, masked raw payload, headers, signatureValid, status, processedAt, errorDetails.
2. **Database Migration & Postgres Triggers**:
   - Versioned migration generated via Payload migration tooling (`20260915_064708_phase4_payment_wallet.ts` and `.json`).
   - PostgreSQL constraints: `CHECK (balance >= 0)`, `CHECK (pending_balance >= 0)`.
   - PostgreSQL triggers: Refuse `UPDATE`, `DELETE`, `TRUNCATE` on `wallet_ledger`; refuse `DELETE`, `TRUNCATE` on `wallets`.
   - Unique composite index on `payment_transactions(provider, provider_transaction_id)`.
3. **Money Write Path Service**:
   - `creditWallet`: Atomically credits balance, writes ledger entry inside transaction.
   - `debitWallet`: Atomically validates funds (`balance >= amount`), decrements balance, writes ledger entry, throws typed `InsufficientFundsError` on refusal (BR-01).
   - `adjustWalletBalance`: Finance admin manual adjustment with mandatory reason and ledger entry.
4. **SePay Integration & Webhook Handler**:
   - Secret / API key verification (§11.3, Case 6).
   - Idempotency guard on `(provider, providerTransactionId)` (BR-02, Case 1).
   - Amount mismatch reconciliation flagging (Decision 0005 Ruling 1, Case 5).
   - Late webhook handling for expired/cancelled intents (Decision 0005 T3).
   - Masked raw payload audit logging in `payment_webhook_events`.
5. **Buyer Wallet Experience**:
   - Top-up API: `POST /api/v1/payments/topup` and `GET /api/v1/payments/[code]`.
   - Buyer wallet API: `GET /api/v1/me/wallet` and `GET /api/v1/me/wallet/ledger`.
   - Storefront UI: `/wallet` with balance display, VietQR display, transfer code copy, live payment polling, and ledger history table.
6. **Automated Verification**:
   - Dedicated integration test suites meeting Phase 4 exit criteria:
     - `tests/int/payment-webhook-duplicate.int.spec.ts` (3 tests)
     - `tests/int/payment-failure-recovery.int.spec.ts` (4 tests)
     - `tests/int/wallet-ledger-invariants.int.spec.ts` (5 tests)
   - 100% pass across all 17 integration test suites (242 tests).
   - 100% pass across challenger (22 tests) and stress privilege escalation (28 tests).
   - Lint (0 errors) and production build (34 routes compiled with exit code 0).

Out of scope:
- Phase 5: Digital product checkout, order creation, purchase debit, and secure download tokens.
- Phase 6: Seller commission, earnings reserve, and bank withdrawal requests.

## Progress

- [x] Step 1: Create collections (`Wallets`, `WalletLedger`, `PaymentIntents`, `PaymentTransactions`, `PaymentWebhookEvents`) and register in `payload.config.ts`.
- [x] Step 2: Generate and apply versioned migration Batch 5 with Postgres triggers and check constraints.
- [x] Step 3: Implement core money write layer (`src/services/wallet.ts`).
- [x] Step 4: Implement SePay adapter and webhook processing engine (`src/services/payment.ts`).
- [x] Step 5: Implement API routes (`/api/v1/payments/*`, `/api/v1/me/wallet*`).
- [x] Step 6: Build buyer wallet frontend UI (`/wallet`).
- [x] Step 7: Write and pass all 3 required exit-criteria integration test suites.
- [x] Step 8: Full repository validation (`test:int`, `lint`, `build`).

## Decisions

- 2026-09-15: Adopt Decision 0002, 0004, and 0005 rules without deviation. Amount mismatch keeps payment intent in PENDING with `reconciliationFlag: true` rather than auto-failing.
- 2026-09-15: VietQR code generation uses standard `img.vietqr.io` URI format with bank code, account number, and unique transfer code for seamless Vietnamese bank apps.
- 2026-09-15: Unique constraint violation in concurrent webhook bursts is caught at the DB level and returned as an idempotent 200 replay with `duplicate: true`, preventing double crediting.

## Validation

- **Focused proof**:
  - `tests/int/payment-webhook-duplicate.int.spec.ts` (3 tests passed)
  - `tests/int/payment-failure-recovery.int.spec.ts` (4 tests passed)
  - `tests/int/wallet-ledger-invariants.int.spec.ts` (5 tests passed)
- **Integration proof**:
  - All 17 integration test suites, 242/242 tests passed in 34.5s.
- **Challenger & Stress proof**:
  - `pnpm test:challenger`: 22/22 passed.
  - `pnpm test:stress`: 28/28 passed.
- **Repository-required checks**:
  - `pnpm --prefix web lint`: 0 errors.
  - `pnpm --prefix web build`: 34 routes cleanly generated with exit code 0.

## Result

Phase 4 (Payment & Wallet) is complete and validated. All exit criteria specified in `PLAN.md` §27 are met with observable evidence. Ready to advance to Phase 5 (Purchase & Download).
