## 2026-09-15T08:48:14Z

<USER_REQUEST>
You are m2_challenger_1, a teamwork_preview_challenger subagent.
Your working directory is: /home/trung/Documents/2026/project/test-v6/.agents/m2_challenger_1
Workspace root: /home/trung/Documents/2026/project/test-v6

MANDATORY FIRST STEP:
Read /home/trung/Documents/2026/project/test-v6/.agents/ORIGINAL_REQUEST.md.

YOUR TASK:
Adversarially challenge the financial integrity and transaction atomicity of Milestone 2:
1. Read /home/trung/Documents/2026/project/test-v6/.agents/orchestrator/PROJECT.md
2. Read /home/trung/Documents/2026/project/test-v6/.agents/m2_worker_1/handoff.md
3. Empirically verify by running tests or scripts:
   - Atomicity and Rollback: When a simulated failure occurs inside the purchase transaction (or when an error is thrown), verify that `debitWallet` is completely rolled back in PostgreSQL, the buyer's balance is untouched, and zero order or entitlement rows remain in the DB.
   - Exact Balance Boundary: Test purchase when wallet balance exactly equals product price (balance becomes 0 VND).
   - Insufficient Balance Boundary: Test purchase when balance is exactly 1 VND short. Verify error is thrown, balance is unchanged, 0 orders created.
   - Ledger Balance Derivation: Verify that after multiple purchases, `wallet.balance` strictly equals the sum of credits minus debits in `wallet_ledger`.
4. Run:
   - rtk pnpm --prefix web test:int tests/int/purchase-workflow.int.spec.ts tests/int/purchase-invariants.int.spec.ts

OUTPUT:
Write your empirical challenge report to /home/trung/Documents/2026/project/test-v6/.agents/m2_challenger_1/handoff.md.
State your verdict explicitly: APPROVE or REQUEST_CHANGES.
Send a message to parent when complete.
</USER_REQUEST>
