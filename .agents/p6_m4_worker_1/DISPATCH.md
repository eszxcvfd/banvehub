## 2026-09-16T02:30:25Z

You are p6_m4_worker_1, an implementation worker for KienTaoHub Phase 6 Milestone 4 (Compensating Refund Ledger & Reversal Flow).
Your working directory is: /home/trung/Documents/2026/project/test-v6/.agents/p6_m4_worker_1.
Project root: /home/trung/Documents/2026/project/test-v6.
Authoritative Request: /home/trung/Documents/2026/project/test-v6/.agents/ORIGINAL_REQUEST.md.
Global Blueprint: /home/trung/Documents/2026/project/test-v6/.agents/orchestrator/PROJECT.md.
Target Test Suite: /home/trung/Documents/2026/project/test-v6/web/tests/int/refund-ledger.int.spec.ts.
Parent Conversation ID: b96b7657-610e-4105-89ae-923e3ac1b237.

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

CRITICAL OPERATIONAL RULES:
1. RAM IS TIGHT: Run commands sequentially, not concurrently.
2. COMMANDS & ENVIRONMENT: Run plain commands WITHOUT rtk prefix (`pnpm ...`, `pnpm --prefix web ...`, `vitest run ...`). For PostgreSQL, host has NO psql binary — always use `docker exec kientaohub-postgres psql -U payload -d kientaohub -c "..."`.
3. REPO HYGIENE: 55+ uncommitted files carry prior milestone work. Do NOT revert, stash, reset, or checkout. Treat working tree as source of truth. Maintain `docs/plans/active/phase-6-seller-revenue.md`.
4. Read /home/trung/Documents/2026/project/test-v6/.agents/ORIGINAL_REQUEST.md first before starting work.

MISSION: DELIVER MILESTONE 4 (Compensating Refund Ledger & Reversal Flow)
Deliver the following components:

1. `web/src/services/refund.ts`:
   Implement and export the refund service interface contracts required by `web/tests/int/refund-ledger.int.spec.ts` and `PROJECT.md`:
   - Export interfaces:
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
       reversalLedgerEntryId?: number
       entitlementRevoked: boolean
       status: string
     }
     ```
   - Export `processRefund(payload: Payload, params: RefundParams): Promise<RefundResult>`:
     a) Validation:
        - `reason`: required, non-empty string after trimming. If empty/missing, throw an Error (`Refund reason is required`).
        - Verify order exists: `payload.findByID({ collection: 'orders', id: params.orderId, overrideAccess: true })`. If not found, throw Error matching `/not found|eligible/i`.
        - Verify order eligibility:
          - If `order.status === 'REFUNDED'`, throw Error matching `/already|refund/i` (`Order has already been refunded`).
          - If `order.status !== 'COMPLETED'`, throw Error matching `/not found|eligible/i` (`Order is not eligible for refund`).
        - Verify actor authorization: fetch actor `payload.findByID({ collection: 'users', id: params.actorId, overrideAccess: true })`. Actor must have role `'financeAdmin'` or `'admin'`. If not, throw Error (`Unauthorized: User does not have financeAdmin or admin role`).

     b) Buyer Wallet Compensating Credit (BR-03, FLOW-U15, Decision 0002):
        - Identify buyer ID: `order.buyer?.id || order.buyer || order.user?.id || order.user`.
        - Call `creditWallet(payload, { userId: Number(buyerId), amount: Number(order.totalAmount), type: 'refund', referenceType: 'order', referenceId: order.code, description: 'Hoàn tiền đơn hàng ' + order.code + ': ' + params.reason.trim() })`.
        - Note: `creditWallet` creates a compensating reversal entry in `wallet_ledger` with direction `'credit'` and type `'refund'`, and adjusts the wallet balance. It does NOT touch, modify, or delete the original purchase debit entry, strictly honoring ledger immutability (BR-03).
        - Query the latest `wallet_ledger` entry for this credit to capture `reversalLedgerEntryId = entry.id`.

     c) Seller Earnings Reversal:
        - Query `seller_earnings` where `order: params.orderId`.
        - For each earning:
          - Transition status to `'REVERSED'`:
            `await payload.update({ collection: 'seller_earnings', id: earning.id, data: { status: 'REVERSED' }, overrideAccess: true })`.
            (Note: `preventEarningMutation` hook allows `PENDING -> REVERSED`, `AVAILABLE -> REVERSED`, `PAID -> REVERSED`).
        - Aggregate `platformFeeRefunded = sum of earning.platformFee` and `sellerAmountRefunded = sum of earning.sellerAmount`.

     d) Order Status Update:
        - Update order status to `'REFUNDED'`:
          `await payload.update({ collection: 'orders', id: params.orderId, data: { status: 'REFUNDED' }, overrideAccess: true })`.
        - Snapshot line items in `order_items` must remain intact.

     e) Entitlement Revocation:
        - Default policy: If `params.revokeEntitlement === undefined || params.revokeEntitlement === true`:
          - Query `entitlements` where `order: params.orderId`.
          - For each entitlement, update `status: 'revoked'`:
            `await payload.update({ collection: 'entitlements', id: ent.id, data: { status: 'revoked' }, overrideAccess: true })`.
          - `shouldRevoke = true`.
        - Retained entitlement policy: If `params.revokeEntitlement === false`:
          - Entitlements remain active.
          - `shouldRevoke = false`.

     f) Refund Audit Record:
        - Query `order_items` where `order: params.orderId` to get first `orderItem.id` and `seller` ID.
        - Create record in `refunds` collection:
          ```ts
          const refundDoc = await payload.create({
            collection: 'refunds',
            data: {
              order: params.orderId,
              orderItem: orderItemId,
              buyer: Number(buyerId),
              seller: Number(sellerId),
              amount: Number(order.totalAmount),
              platformFeeRefunded: platformFeeRefunded || 0,
              sellerAmountRefunded: sellerAmountRefunded || 0,
              currency: 'VND',
              reason: params.reason.trim(),
              status: 'COMPLETED',
              processedBy: params.actorId,
              ledgerTransaction: reversalLedgerEntryId,
              entitlementRevoked: shouldRevoke,
            },
            overrideAccess: true,
          })
          ```

     g) Return `RefundResult`:
        ```ts
        return {
          refundId: refundDoc.id,
          orderId: params.orderId,
          buyerId: Number(buyerId),
          amountRefunded: Number(order.totalAmount),
          reversalLedgerEntryId,
          entitlementRevoked: shouldRevoke,
          status: 'COMPLETED',
        }
        ```

2. Admin Refund REST API Route:
   Implement `web/src/app/api/v1/admin/refunds/route.ts`:
   - `POST`: Authenticates via Payload auth headers (cookies/authorization).
   - Verifies caller has role `'financeAdmin'` or `'admin'`. (401 unauthenticated, 403 unauthorized).
   - Parses and validates JSON payload: `{ orderId, reason, revokeEntitlement? }`.
   - Calls `processRefund(payload, { orderId, reason, actorId: user.id, revokeEntitlement })`.
   - Returns 200 with result (or 400 on error).

3. Update `docs/plans/active/phase-6-seller-revenue.md` noting Milestone 4 scope, tasks, and status.

4. Verification:
   - Run `pnpm --prefix web vitest run tests/int/refund-ledger.int.spec.ts` -> all tests must pass.
   - Run `pnpm --prefix web vitest run tests/int/seller-withdrawals.int.spec.ts tests/int/seller-earnings.int.spec.ts tests/int/commission-config-error.int.spec.ts` -> all 41 tests must pass.
   - Run regression suites: `purchase-workflow`, `purchase-invariants`, `m1-schema-stress`, `m1-access-control` -> 97/97 pass.
   - Run `pnpm --prefix web tsc --noEmit` -> 0 errors.
   - Run `pnpm --prefix web lint` -> 0 errors.
   - Write handoff report to `.agents/p6_m4_worker_1/handoff.md`.
   - Send completion message to parent when done.
