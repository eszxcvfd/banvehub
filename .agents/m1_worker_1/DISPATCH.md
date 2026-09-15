## 2026-09-15T07:19:00Z
You are m1_worker_1, a teamwork_preview_worker subagent for Milestone 1 (Schema & Migration Batch 6).
Your working directory is: /home/trung/Documents/2026/project/test-v6/.agents/m1_worker_1
Workspace root: /home/trung/Documents/2026/project/test-v6

MANDATORY FIRST STEP:
Read /home/trung/Documents/2026/project/test-v6/.agents/ORIGINAL_REQUEST.md.

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

INPUT SPECIFICATIONS TO READ:
1. /home/trung/Documents/2026/project/test-v6/.agents/orchestrator/PROJECT.md
2. /home/trung/Documents/2026/project/test-v6/.agents/m1_explorer_1/handoff.md (Orders & OrderItems design, hooks, access rules, Users join alignment)
3. /home/trung/Documents/2026/project/test-v6/.agents/m1_explorer_2/handoff.md (Entitlements & DownloadEvents design, hooks, access rules)
4. /home/trung/Documents/2026/project/test-v6/.agents/m1_explorer_3/handoff.md (PostgreSQL migration Batch 6 exact DDL, up/down scripts, triggers, indices)

YOUR EXCLUSIVE WRITE OWNERSHIP:
- web/src/collections/Orders/index.ts
- web/src/collections/OrderItems/index.ts
- web/src/collections/Entitlements/index.ts
- web/src/collections/DownloadEvents/index.ts
- web/src/access/orderAccess.ts
- web/src/access/entitlementAccess.ts
- web/src/access/downloadEventAccess.ts
- web/src/collections/Users/index.ts (update join field `orders` to `on: 'buyer'`)
- web/src/plugins/index.ts (disable plugin orders: `orders: false`, clean up schema override)
- web/src/payload.config.ts (register Orders, OrderItems, Entitlements, DownloadEvents)
- web/src/migrations/20260915_071500_phase5_purchase_download.ts
- web/src/migrations/20260915_071500_phase5_purchase_download.json
- web/src/migrations/index.ts
- web/src/payload-types.ts

TASKS TO EXECUTE:
1. Implement `orderAccess.ts`, `entitlementAccess.ts`, and `downloadEventAccess.ts` according to the explorer specifications.
2. Implement `web/src/collections/Orders/index.ts` with code, buyer, totalAmount, currency, status, paymentSource, paidAt, notes.
3. Implement `web/src/collections/OrderItems/index.ts` with order, product, seller, salePrice (BR-07 immutable snapshot), platformFee, sellerAmount, tax, policyVersion. Include hooks for BR-04 (buyer !== seller) and BR-07 immutability.
4. Implement `web/src/collections/Entitlements/index.ts` with user, product, order, orderItem, status, grantedAt, downloadCount, maxDownloads, expiresAt, revokedAt, reason, and hooks for unique active entitlement per user & product.
5. Implement `web/src/collections/DownloadEvents/index.ts` with user, product, entitlement, ipAddress, userAgent, downloadedAt, status, downloadTokenHash, errorReason.
6. In `web/src/plugins/index.ts`, set `orders: false` in `ecommercePlugin` and clean up typescript schema override.
7. In `web/src/collections/Users/index.ts`, update `orders` join to `on: 'buyer'`.
8. In `web/src/payload.config.ts`, register the 4 collections.
9. Implement migration Batch 6: `web/src/migrations/20260915_071500_phase5_purchase_download.ts` and `.json` with the exact SQL DDL from `m1_explorer_3/handoff.md` (dropping old 0-row template tables, creating new digital tables, partial unique index `entitlements_user_product_active_idx`, BR-04 check/trigger, locked document relations, and symmetric rollback). Register in `web/src/migrations/index.ts`.
10. Run migration using `pnpm --prefix web payload migrate`. Verify migration status: `pnpm --prefix web payload migrate:status`.
11. Run `pnpm --prefix web payload generate:types` (or `pnpm --prefix web generate:types`) to regenerate `payload-types.ts`.
12. Run verification:
    - `pnpm --prefix web test:int` (all 17 existing suites must pass 100%)
    - `pnpm --prefix web lint` (0 errors)
