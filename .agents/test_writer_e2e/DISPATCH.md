## 2026-09-15T07:10:57Z

You are test_writer_e2e, a teamwork_preview_test_writer subagent for the E2E Testing Track of Phase 5.
Your working directory is: /home/trung/Documents/2026/project/test-v6/.agents/test_writer_e2e
Workspace root: /home/trung/Documents/2026/project/test-v6

MANDATORY FIRST STEP:
Read /home/trung/Documents/2026/project/test-v6/.agents/ORIGINAL_REQUEST.md.

INPUT DOCUMENTS TO READ:
1. /home/trung/Documents/2026/project/test-v6/.agents/orchestrator/PROJECT.md
2. /home/trung/Documents/2026/project/test-v6/.agents/orchestrator/TEST_INFRA.md
3. /home/trung/Documents/2026/project/test-v6/.agents/spec_miner_survey_1/handoff.md
4. Existing integration test patterns in web/tests/int/ (e.g. tests/int/wallet-ledger-invariants.int.spec.ts, tests/int/payment-topup-workflow.int.spec.ts, tests/int/product-files-security.int.spec.ts) to see how Payload is initialized, test users/wallets created, vitest configured.

YOUR EXCLUSIVE WRITE OWNERSHIP:
You own writing the 3 dedicated test files in web/tests/int/:
1. `web/tests/int/purchase-workflow.int.spec.ts`
2. `web/tests/int/secure-download.int.spec.ts`
3. `web/tests/int/purchase-invariants.int.spec.ts`
And publishing `TEST_READY.md` to `/home/trung/Documents/2026/project/test-v6/.agents/orchestrator/TEST_READY.md`.
Do NOT edit other files.

TEST SUITE REQUIREMENTS (4 Tiers per TEST_INFRA.md):
- `purchase-workflow.int.spec.ts`:
  1. Complete wallet purchase flow for commercial product: tops up buyer wallet, executes purchase, verifies wallet balance decremented by price, order created with status COMPLETED and paymentSource 'wallet', order_item created with snapshot price, active entitlement created.
  2. Free product checkout flow: 0 VND debit, order created with paymentSource 'free', active entitlement created.
  3. Multiple different products purchased by same buyer receive separate orders and active entitlements.
  4. End-to-end integration: user purchases product -> uses entitlement to request download token.
- `secure-download.int.spec.ts`:
  1. Authenticated user with active entitlement requests download token (POST /api/v1/downloads/token) -> returns valid signed token with 5-minute expiry.
  2. Streaming private file bytes: GET /api/v1/downloads/[token] validates signature and streams file with Content-Disposition attachment and proper MIME type.
  3. Audit log: Each stream attempt creates an audit row in `download_events` with status 'SUCCESS'.
  4. Unauthenticated guest requesting download token returns 401 Unauthorized.
  5. Authenticated user WITHOUT active entitlement requesting token returns 403 Forbidden.
  6. Expired token returns 401/403 and records audit row with status 'EXPIRED'.
  7. Tampered token signature returns 401/403 and records audit row.
  8. Private file boundary: `web/private/product_files` is not accessible publicly.
- `purchase-invariants.int.spec.ts`:
  1. BR-04 Anti-Self-Purchase: Seller attempting to purchase own product is strictly refused with typed error (e.g. SelfPurchaseForbiddenError / 400).
  2. BR-07 Snapshot Pricing: If product.price is changed after order creation, order_item.salePrice on existing order remains unchanged.
  3. Insufficient Funds: When wallet balance < product.price, purchase fails with InsufficientFundsError, 0 VND debited, 0 orders created.
  4. Duplicate Purchase: Attempting to purchase a product already held as an active entitlement is refused or redirected.
  5. Unapproved/Draft Product: Cannot purchase unpublished or draft products.

COMPLETION REQUIREMENTS:
1. Write the 3 test suite files cleanly adhering to TypeScript and ESLint standards.
2. Publish `/home/trung/Documents/2026/project/test-v6/.agents/orchestrator/TEST_READY.md` with test runner commands, test counts, and feature coverage matrix.
3. Write `/home/trung/Documents/2026/project/test-v6/.agents/test_writer_e2e/handoff.md`.
4. Send a message to parent when finished.
