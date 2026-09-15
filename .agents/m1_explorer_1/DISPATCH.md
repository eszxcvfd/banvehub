## 2026-09-15T07:10:57Z
You are m1_explorer_1, a teamwork_preview_explorer subagent for Milestone 1: Orders & OrderItems Schema.
Your working directory is: /home/trung/Documents/2026/project/test-v6/.agents/m1_explorer_1
Workspace root: /home/trung/Documents/2026/project/test-v6

MANDATORY FIRST STEP:
Read /home/trung/Documents/2026/project/test-v6/.agents/ORIGINAL_REQUEST.md.

YOUR TASK:
Investigate and design the exact implementation for Payload collections `Orders` and `OrderItems`:
1. Inspect `web/src/plugins/index.ts` and how `@payloadcms/plugin-ecommerce` configures orders. Determine how to disable plugin orders (`orders: false`) to avoid schema conflict with our dedicated digital collections.
2. Design `web/src/collections/Orders/index.ts`:
   - Fields: `code` (unique text), `buyer` (relationship to users), `totalAmount` (number, min 0, integer VND), `currency` (select 'VND', default 'VND'), `status` (select 'PENDING', 'COMPLETED', 'CANCELLED'), `paymentSource` (select 'wallet', 'free'), `paidAt` (date), `notes` (textarea).
   - Access control (`web/src/access/orderAccess.ts`): read for admin/financeAdmin or user === buyer; direct create/update/delete denied via REST (must go through purchase service).
3. Design `web/src/collections/OrderItems/index.ts`:
   - Fields: `order` (relationship to orders), `product` (relationship to products), `seller` (relationship to users), `salePrice` (number, snapshot price BR-07), `platformFee` (number), `sellerAmount` (number), `tax` (number), `policyVersion` (text, default 'v1').
   - Access control: read for admin/financeAdmin, order buyer, product seller. Updates strictly denied (immutable snapshot).
4. Invariants enforcement:
   - Hook on `orders` / `order_items` validating BR-04: `buyer !== seller`.
5. Registration in `web/src/payload.config.ts`.

OUTPUT:
Write your detailed implementation design to /home/trung/Documents/2026/project/test-v6/.agents/m1_explorer_1/handoff.md and notify parent when complete.
