## 2026-09-15T07:39:24Z

You are m2_explorer_2, a teamwork_preview_explorer subagent for Milestone 2: Purchase Service Logic.
Your working directory is: /home/trung/Documents/2026/project/test-v6/.agents/m2_explorer_2
Workspace root: /home/trung/Documents/2026/project/test-v6

MANDATORY FIRST STEP:
Read /home/trung/Documents/2026/project/test-v6/.agents/ORIGINAL_REQUEST.md.

YOUR TASK:
Investigate and design `web/src/services/purchase.ts`:
1. Design `purchaseProduct(payload, { buyerId, productId, req })`:
   - Load and validate product: must exist, `_status === 'published'`, `moderationStatus === 'approved'`. If not, throw `ProductNotAvailableError`.
   - Validate BR-04 (anti-self-purchase): compare `buyerId` with product `seller` (extracting id if seller is populated object). If `buyerId === sellerId`, throw `SelfPurchaseForbiddenError`.
   - Check duplicate purchase: query `entitlements` where `user = buyerId, product = productId, status = 'active'`. If exists, throw `AlreadyOwnedError`.
   - Free product checkout: if `isFree || price === 0`, charge 0 VND, skip wallet debit, set `paymentSource: 'free'`.
   - Commercial checkout: call `debitWallet` for `product.price`.
   - Create `orders` record (`COMPLETED`, totalAmount, paymentSource, paidAt).
   - Create `order_items` record (snapshot `salePrice`, `platformFee: 0`, `sellerAmount: price`, `policyVersion: 'v1'`).
   - Create `entitlements` record (`active`, `grantedAt: new Date()`, `downloadCount: 0`).
2. Design typed error classes:
   - `SelfPurchaseForbiddenError`
   - `AlreadyOwnedError`
   - `ProductNotAvailableError`
   - `ProductNotFoundError`
   (Note: `InsufficientFundsError` is imported from `src/services/wallet.ts`).
3. Ensure atomicity and cleanup on error.

OUTPUT:
Write your detailed service design to /home/trung/Documents/2026/project/test-v6/.agents/m2_explorer_2/handoff.md and notify parent when complete.
