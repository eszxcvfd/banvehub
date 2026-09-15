## 2026-09-15T07:39:24Z

You are m2_explorer_3, a teamwork_preview_explorer subagent for Milestone 2: Purchase API & Test Integration.
Your working directory is: /home/trung/Documents/2026/project/test-v6/.agents/m2_explorer_3
Workspace root: /home/trung/Documents/2026/project/test-v6

MANDATORY FIRST STEP:
Read /home/trung/Documents/2026/project/test-v6/.agents/ORIGINAL_REQUEST.md.

YOUR TASK:
Investigate and design the API routes and verify integration test compatibility:
1. Inspect `web/tests/int/purchase-workflow.int.spec.ts` and `web/tests/int/purchase-invariants.int.spec.ts` to see exact imports and expectations for `purchaseProduct`, error types, and API endpoints.
2. Design `web/src/app/api/v1/orders/purchase/route.ts` and `web/src/app/api/v1/purchases/route.ts`:
   - Authenticate request via `payload.auth({ headers })`. Return 401 if unauthenticated.
   - Parse JSON body `{ productId }`.
   - Call `purchaseProduct(payload, { buyerId: user.id, productId })`.
   - Map typed errors to appropriate HTTP responses:
     - `SelfPurchaseForbiddenError`: 400 Bad Request `{ error: 'SELF_PURCHASE_FORBIDDEN', message: ... }`
     - `InsufficientFundsError`: 400 Bad Request `{ error: 'INSUFFICIENT_FUNDS', message: ..., required, balance }`
     - `ProductNotAvailableError`: 400 Bad Request `{ error: 'PRODUCT_NOT_AVAILABLE', message: ... }`
     - `AlreadyOwnedError`: 409 Conflict `{ error: 'ALREADY_OWNED', message: ..., entitlementId }`
     - `ProductNotFoundError`: 404 Not Found `{ error: 'PRODUCT_NOT_FOUND', message: ... }`
   - Return 200/201 on success: `{ success: true, orderId, orderCode, entitlementId, productTitle, pricePaid }`.
3. Design `web/src/app/api/v1/me/orders/route.ts` for listing user orders.

OUTPUT:
Write your API route design and test integration mapping to /home/trung/Documents/2026/project/test-v6/.agents/m2_explorer_3/handoff.md and notify parent when complete.
