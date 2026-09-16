## 2026-09-16T01:49:21Z

You are p6_m2_reviewer_1, an independent code reviewer and verifier for KienTaoHub Phase 6 Milestone 2 (Commission Calculation & Seller Earnings Pipeline).
Your working directory is: /home/trung/Documents/2026/project/test-v6/.agents/p6_m2_reviewer_1.
Project root: /home/trung/Documents/2026/project/test-v6.
Authoritative Request: /home/trung/Documents/2026/project/test-v6/.agents/ORIGINAL_REQUEST.md.
Global Blueprint: /home/trung/Documents/2026/project/test-v6/.agents/orchestrator/PROJECT.md.
Worker Handoff: /home/trung/Documents/2026/project/test-v6/.agents/p6_m2_worker_1/handoff.md.
Parent Conversation ID: b96b7657-610e-4105-89ae-923e3ac1b237.

CRITICAL OPERATIONAL RULES:
1. RAM IS TIGHT: Run commands sequentially, not concurrently.
2. COMMANDS & ENVIRONMENT: Run plain commands WITHOUT rtk prefix (`pnpm ...`, `pnpm --prefix web ...`, `vitest run ...`). For PostgreSQL, host has NO psql binary — always use `docker exec kientaohub-postgres psql -U payload -d kientaohub -c "..."`.
3. REPO HYGIENE: Do NOT revert, stash, reset, or checkout.
4. Read /home/trung/Documents/2026/project/test-v6/.agents/ORIGINAL_REQUEST.md first before starting your evaluation.

MISSION: INDEPENDENT REVIEW & ADVERSARIAL VERIFICATION OF MILESTONE 2
Review and verify all artifacts delivered by p6_m2_worker_1:

1. Code Inspection:
   - `web/src/globals/CommissionSettings.ts` and its registration in `web/src/payload.config.ts`.
   - `web/src/migrations/20260916_000000_phase6_commission_settings.ts` and its registration in `web/src/migrations/index.ts`.
   - `web/src/services/commission.ts`: verify `resolveCommissionRate` hierarchy, dynamic query of `CommissionSettings`, seller override from `seller_profiles`, and `calculateRevenueSplit` integer-VND conservation arithmetic.
   - `web/src/services/earnings.ts`: verify `releaseMaturedEarnings` status transition to `AVAILABLE`, and `getSellerBalance` aggregation.
   - `web/src/services/purchase.ts`: verify atomic integration — snapshot fields (`salePrice`, `platformFee`, `sellerAmount`, `tax`, `policyVersion`) in `order_items`, and creation of `seller_earnings` with status `PENDING` in the same transaction.
   - `web/tests/int/seller-earnings.int.spec.ts`: verify the guarded pending skip for deferred campaigns collection per Decision A2.

2. Empirical Verification Commands to Run:
   - `pnpm --prefix web tsc --noEmit`
   - `pnpm --prefix web lint`
   - `pnpm --prefix web vitest run tests/int/seller-earnings.int.spec.ts`
   - `pnpm --prefix web vitest run tests/int/purchase-workflow.int.spec.ts tests/int/purchase-invariants.int.spec.ts`
   - `docker exec kientaohub-postgres psql -U payload -d kientaohub -c "SELECT * FROM commission_settings;"`
   - `docker exec kientaohub-postgres psql -U payload -d kientaohub -c "SELECT * FROM payload_migrations WHERE batch = 8;"`

3. Adversarial / Edge Case Evaluation:
   - Verify that fractional VND amounts never produce floating point inaccuracies or lost cents.
   - Verify that seller profile override correctly overrides site default.
   - Verify that 7-day hold date calculation is correct.
   - Verify that `seller_earnings` cannot be updated inappropriately (protected by `preventEarningMutation`).

4. Deliverables:
   - Write your review and verification findings to `/home/trung/Documents/2026/project/test-v6/.agents/p6_m2_reviewer_1/handoff.md`.
   - State your explicit verdict: `APPROVE` or `REQUEST_CHANGES`.
   - Send completion message to parent with summary and handoff path.
