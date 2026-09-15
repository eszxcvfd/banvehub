# BRIEFING — 2026-09-15T07:43:30Z

## Mission
Investigate API route designs and integration test compatibility for Milestone 2 (Purchase API & Test Integration).

## 🔒 My Identity
- Archetype: explorer
- Roles: investigation, synthesis
- Working directory: /home/trung/Documents/2026/project/test-v6/.agents/m2_explorer_3
- Original parent: 902fae86-8610-4959-9027-f4a48d29b1e8
- Milestone: Milestone 2: Purchase API & Test Integration

## 🔒 Key Constraints
- Read-only investigation — do NOT implement
- Only write within /home/trung/Documents/2026/project/test-v6/.agents/m2_explorer_3/

## Current Parent
- Conversation ID: 902fae86-8610-4959-9027-f4a48d29b1e8
- Updated: 2026-09-15T07:43:30Z

## Investigation State
- **Explored paths**:
  - `ORIGINAL_REQUEST.md` (Phase 5 requirements R1-R5)
  - `web/tests/int/purchase-workflow.int.spec.ts` (Full e2e flow, contracts, interface assertions)
  - `web/tests/int/purchase-invariants.int.spec.ts` (BR-04 anti-self-purchase, BR-07 snapshot price, insufficient funds, duplicate purchases, product status)
  - `web/tests/int/challenger-m1-invariants.int.spec.ts` (DB triggers & hook behavior)
  - `web/src/collections/Orders/index.ts` & `web/src/collections/OrderItems/index.ts` & `web/src/collections/Entitlements/index.ts`
  - `web/src/collections/OrderItems/hooks/validateAntiSelfPurchase.ts` & `web/src/collections/Entitlements/hooks/enforceEntitlementInvariants.ts`
  - `web/src/access/orderAccess.ts` & `web/src/access/entitlementAccess.ts`
  - `web/src/services/wallet.ts` (InsufficientFundsError, debitWallet, creditWallet)
  - `web/src/app/api/v1/me/wallet/route.ts` & `web/src/app/api/v1/me/wallet/ledger/route.ts` & `web/src/app/api/v1/payments/topup/route.ts`
  - `web/src/migrations/20260915_071500_phase5_purchase_download.ts`
- **Key findings**:
  - `purchaseProduct` contract: `(payload: Payload, params: { buyerId: number; productId: number; req?: any }) => Promise<PurchaseResult>`
  - Return structure: `{ success: true, orderId: string, orderCode: string, entitlementId: number, productTitle: string, pricePaid: number }`
  - Direct REST write access on `orders`, `order_items`, and `entitlements` is disabled (`orderCreateAccess = () => false`), making dedicated API routes essential.
  - Next.js App Router authentication pattern in KienTaoHub: `const { user } = await payload.auth({ headers: await getHeaders() })`.
  - Error classes and codes must support exact naming and codes:
    - `SelfPurchaseForbiddenError` (code: `SELF_PURCHASE_FORBIDDEN`, status: 400)
    - `InsufficientFundsError` (code: `INSUFFICIENT_FUNDS`, status: 400, properties: `required`, `balance`)
    - `ProductNotAvailableError` (code: `PRODUCT_NOT_AVAILABLE`, status: 400)
    - `AlreadyOwnedError` (code: `ALREADY_OWNED`, status: 409, property: `entitlementId`)
    - `ProductNotFoundError` (code: `PRODUCT_NOT_FOUND`, status: 404)
  - Route symmetry: `/api/v1/orders/purchase` and `/api/v1/purchases` can share identical logic via re-export.
  - Order listing: `GET /api/v1/me/orders` queries `orders` by `buyer: user.id` with `depth: 2` to populate items and products.
- **Unexplored areas**:
  - None within Milestone 2 scope.

## Key Decisions Made
- Architected unified error-handling mapping function handling both typed class instances and raw hook/validation error strings.
- Re-export pattern designed for `/api/v1/purchases/route.ts` pointing to `/api/v1/orders/purchase/route.ts` to ensure 100% DRY parity.
- Designed comprehensive API test suite specification `purchase-api.int.spec.ts`.

## Artifact Index
- DISPATCH.md — Recorded dispatch instructions
- BRIEFING.md — Situational awareness
- progress.md — Liveness heartbeat
- handoff.md — Final handoff report containing API route designs and test integration mapping
