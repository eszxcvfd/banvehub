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
