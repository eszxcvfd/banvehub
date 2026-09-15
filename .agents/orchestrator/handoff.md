# Orchestrator State Dump & Soft Handoff (Generation 1 -> Generation 2)

## 1. Milestone State
| Milestone | Description | Status | Verification Summary |
|---|---|:---:|---|
| **Step 0: Survey** | Probed PLAN.md §27, Decisions 0002/0006, existing collections, tests, and UI | **DONE** | 3 survey explorers (`spec_miner_survey_1`, `explorer_backend_survey_1`, `explorer_frontend_survey_1`) delivered full reports. |
| **Test Track** | Authored 3 E2E test suites (26 tests total) covering Tiers 1-4 | **DONE** | Published `TEST_READY.md`. Zero regressions on existing 242 tests. |
| **Milestone 1** | Digital collections (`Orders`, `OrderItems`, `Entitlements`, `DownloadEvents`), access controls, hooks (BR-04, BR-07, R2), PostgreSQL migration Batch 6 | **DONE** | **PASSED GATE**: 2 Reviewers APPROVE, 2 Challengers APPROVE (79 adversarial tests), Auditor CLEAN. All 301 tests passing. |
| **Milestone 2** | Atomic Wallet Purchase & Free Product Checkout (`purchaseProduct` service, `debitWallet` transaction coordination, API routes) | **READY FOR IMPLEMENTATION** | Exploration complete (`m2_explorer_1`, `m2_explorer_2`, `m2_explorer_3` delivered reports). Ready to dispatch `m2_worker_1`. |
| **Milestone 3** | Secure Private File Storage & Signed Token Streaming Rail | **PLANNED** | Awaiting M2 completion. |
| **Milestone 4** | Storefront Purchase Modal & Buyer Library UI | **PLANNED** | Awaiting M2 & M3 completion. |
| **Milestone 5** | Final E2E Test Suite Execution & Adversarial Hardening (Tier 5) | **PLANNED** | Final exit criteria verification. |

## 2. Active Subagents
- None currently active. All 16 subagents from Generation 1 have delivered their handoffs and are retired.

## 3. Pending Decisions & Technical Context for Successor
1. **`debitWallet` Transaction Session Fix** (identified by `m2_explorer_1` in `.agents/m2_explorer_1/handoff.md`):
   - In `web/src/services/wallet.ts:209`, `db.execute(sql...)` is currently called on `payload.db` directly instead of the Drizzle transaction session `((payload.db as any).sessions?.[req.transactionID]?.db || (payload.db as any).drizzle)`.
   - `m2_worker_1` should update `wallet.ts` so the conditional UPDATE participates cleanly in `req.transactionID`.
2. **`purchaseProduct` Service Structure** (designed by `m2_explorer_2` in `.agents/m2_explorer_2/handoff.md`):
   - Location: `web/src/services/purchase.ts`.
   - Implements `purchaseProduct(payload, { buyerId, productId, req })`.
   - Validates product existence, publication (`_status === 'published'`), moderation (`moderationStatus === 'approved'`).
   - Validates BR-04 (seller !== buyer), throws `SelfPurchaseForbiddenError` / `SelfPurchaseError`.
   - Validates active entitlement uniqueness, throws `AlreadyOwnedError` / `AlreadyEntitledError`.
   - Handles free products (0 VND total, paymentSource 'free', skip debit).
   - Handles commercial products (`debitWallet` inside transaction).
   - Creates `orders` (COMPLETED), `order_items` (snapshot price BR-07), and `entitlements` (active).
   - Uses Payload transaction management (`beginTransaction`, `commitTransaction`, `rollbackTransaction`).
3. **API Routes** (designed by `m2_explorer_3` in `.agents/m2_explorer_3/handoff.md`):
   - `web/src/app/api/v1/orders/purchase/route.ts` & `web/src/app/api/v1/purchases/route.ts` (re-export).
   - `web/src/app/api/v1/me/orders/route.ts` & `web/src/app/api/v1/orders/route.ts` (re-export).
4. **Passing Existing Tests**:
   - `web/tests/int/purchase-workflow.int.spec.ts` (6 tests) and `web/tests/int/purchase-invariants.int.spec.ts` (10 tests) will pass 100% once M2 is implemented.

## 4. Remaining Work & Concrete Next Steps
1. **Dispatch Milestone 2 Worker (`m2_worker_1`)**:
   - Write ownership: `web/src/services/purchase.ts`, `web/src/services/wallet.ts` (fix transaction binding), `web/src/app/api/v1/orders/purchase/route.ts`, `web/src/app/api/v1/purchases/route.ts`, `web/src/app/api/v1/me/orders/route.ts`, `web/src/app/api/v1/orders/route.ts`.
   - Run tests: `pnpm --prefix web test:int tests/int/purchase-workflow.int.spec.ts tests/int/purchase-invariants.int.spec.ts`.
   - Verify zero regressions: `pnpm --prefix web test:int`.
2. **Execute Milestone 2 Gate**:
   - Dispatch 2 Reviewers, 2 Challengers, 1 Auditor.
   - Evaluate `GATE_STATUS.md` (pass criteria: all approve, auditor clean).
3. **Execute Milestone 3 (Secure Download Engine & Token Rail)**:
   - Explorer -> Worker -> Reviewer / Challenger / Auditor -> Gate.
   - Files: `web/src/services/download.ts`, `POST /api/v1/downloads/token`, `GET /api/v1/downloads/[token]`.
   - Validates `web/tests/int/secure-download.int.spec.ts`.
4. **Execute Milestone 4 (Storefront Purchase Flow & Buyer Library UI)**:
   - Explorer -> Worker -> Reviewer / Challenger / Auditor -> Gate.
   - Files: `WalletPurchaseModal.tsx`, `DigitalProductCTA.tsx`, `ProductDescription.tsx`, `/account/downloads/page.tsx`, `BuyerDownloadsClient.tsx`, `AccountNav`.
5. **Execute Milestone 5 (Final Verification & Adversarial Hardening Tier 5)**:
   - 100% pass across all 20 test suites, Challenger coverage audit (Tier 5), 0 ESLint errors, clean Next.js build.
   - Report completion to Sentinel.

## 5. Key Artifacts
- `/home/trung/Documents/2026/project/test-v6/.agents/ORIGINAL_REQUEST.md` — Authoritative user requirements
- `/home/trung/Documents/2026/project/test-v6/.agents/orchestrator/PROJECT.md` — Project architecture, feature inventory, milestones, contracts
- `/home/trung/Documents/2026/project/test-v6/.agents/orchestrator/TEST_INFRA.md` — Test methodology & tier coverage
- `/home/trung/Documents/2026/project/test-v6/.agents/orchestrator/TEST_READY.md` — 26 E2E test cases published
- `/home/trung/Documents/2026/project/test-v6/.agents/orchestrator/GATE_STATUS.md` — Milestone 1 PASSED gate status
- `/home/trung/Documents/2026/project/test-v6/.agents/orchestrator/progress.md` — Persistent progress checkpoint
- `/home/trung/Documents/2026/project/test-v6/.agents/orchestrator/BRIEFING.md` — Working memory & identity
- Exploration handoffs for M2:
  - `/home/trung/Documents/2026/project/test-v6/.agents/m2_explorer_1/handoff.md`
  - `/home/trung/Documents/2026/project/test-v6/.agents/m2_explorer_2/handoff.md`
  - `/home/trung/Documents/2026/project/test-v6/.agents/m2_explorer_3/handoff.md`
