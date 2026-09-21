# Execution Plan: Wire the storefront UI to the API it actually has

Date: 2026-09-20

## Status

Running. The owner reports the storefront UI vertical finished its work at the current revision and
asked for the components to be wired to the correct API, with missing endpoints added where the UI
genuinely needs one. One team is running this increment: `mapper` (inventory), `engineer` (repair),
`verifier` (independent verification), `reviewer` (adversarial review). The captain integrates and
commits.

`t2` (repair) is done and waits for `t6`/`t7`: A9, A1 and B30 are repaired and proved by the sweep in
the Repair log below, A5 and A3/A4 are reported with the tasks that own them, and nothing else in the
tree was touched. The three repaired files and the sweep are the only ones this increment changes from
the inventory's perspective; `CheckoutPage.tsx` is now free for `t7`/the vertical.

## Outcome

Every data path a user can reach in `web/src/app/**` and `web/src/components/**` talks to an API that
exists, with the method, body, query parameters, credentials and response shape the endpoint really
implements — and the API holds every endpoint the UI needs, with roles and input validation that match
the decisions of record. No surface dead-ends: no UI call reaches a route that is missing, and no
repaired path returns 404 or 500 for its own request shape.

## Context

Measured on 2026-09-20 at `5dbcc24` (the working tree also held the UI vertical's uncommitted work — **163
files as of 2026-09-20**; review round 2 measured 101 modified tracked + 94 untracked entries on
2026-09-21, so the figure is a date-stamped observation, not the current count — and this increment must
not discard any of it):

- The custom API surface is 36 routes: `/api/v1/**` (purchases, payments + SePay webhook, wallet and
  ledger, entitlements and downloads, orders, notifications, reviews, comments, reports, tickets,
  seller earnings and withdrawals, admin refunds and withdrawals) plus `/api/moderation` and
  `/api/seller/**` (register, products, upload-file, upload-preview). Payload's own REST and GraphQL
  serve the collections behind them.
- The UI reaches data two ways: `fetch('/api/v1/...')` from client components (30+ distinct call
  sites across purchase, wallet, top-up, downloads, comments, reviews, reports, tickets, withdrawals,
  admin refunds, notifications) and Payload's local API inside server components (13 files, e.g.
  `(app)/products/[slug]/page.tsx`, `(app)/wallet/page.tsx`, `(app)/shop/page.tsx`).
- Existence is therefore not the problem — `docs/decisions/0013` already records one dead end
  (the checkout's Stripe option, whose endpoints phase 13 removed). The work is the contract:
  parameters the endpoint ignores, response fields the UI reads but never receives, error shapes the
  UI cannot render, credentials the client forgets to send, role checks that disagree with the UI's
  idea of who may act, and endpoints the UI needs that were never written.
- Authority: the owner's instruction of 2026-09-20 to wire the UI to the API and add what is missing;
  decisions 0002 (one money write path, paired ledger rows), 0005 (payment state machine), 0008 (role
  model), 0012 (refund policy) and 0013 (the removed commerce ledger) constrain any endpoint this
  increment adds or repairs.

## Scope

In: `web/src/app/**` (pages, client components and the API routes they call), `web/src/components/**`,
`web/src/services/**` only where a route's contract needs it, an inventory section in this file, and a
probe under `web/tests/helpers/`.

Out: `web/src/migrations/**` and any schema change (a missing column or collection is reported as a
follow-up increment instead, because the schema is migration-owned per `PLAN.md` §37);
`web/package.json` and `web/pnpm-lock.yaml` (the storefront vertical is editing them); the storefront
vertical's copy and visual design decisions; decision 0013's Stripe dead end, which stays with the
storefront vertical as that decision records.

## Approach

Inventory first, then repair, then verify independently. The inventory is the contract of this
increment: every UI data path is listed with the contract it assumes, the contract the API implements,
a verdict, the evidence for that verdict, and the smallest correct fix. The engineer resolves the
inventory; the verifier re-derives it with its own instruments rather than trusting the repair's probe.

## Inventory

Filled by `mapper`, 2026-09-21, against the running dev server on `:3000` and the development
database. One row per UI data path: `file:line` of the call, the target, the contract the UI assumes
(method, body/query, credentials, response fields read, error shape rendered), the contract the API
implements (`file:line`, parameters read, status codes, response fields, access rule), the verdict,
the evidence, and the smallest correct fix.

**78 rows: 72 `MATCHES`, 2 `UI_WRONG`, 1 `API_WRONG`, 2 `ENDPOINT_MISSING`, 1 `UI_UNWIRED`.** Rows
`A1`–`A44` are client `fetch()` sites in `web/src/app/**` and `web/src/components/**` (44 rows);
rows `B1`–`B34` are server components reading Payload's local API, where the "API" side is the
collection's access rule and field shape rather than a route (34 rows).

### How the evidence was taken

Identities: seeded `buyer01@kientaohub.vn` (user 9), `seller01@kientaohub.vn` (user 4),
`finance@kientaohub.vn` (user 2), `moderator@kientaohub.vn` (user 3) — password `KienTao@2026` from
`web/scripts/seed-realistic.mts:701`; plus a throwaway `probe-inventory-t1@example.com` (user 1352)
created through `POST /api/users` so the write-path probes never touch a seeded identity. The owner's
own admin account was not used. Session cookies were obtained from `POST /api/users/login`.

The probes are two throwaway scripts outside the repository (`/tmp/probe.sh` and `/tmp/probe2.py`):
each row is one curl whose method, cookie jar, body and multipart payload are the ones the call site
sends, and whose output is parsed for the exact response fields the UI reads (present / missing) plus
the HTTP status. Cross-checked against a browser load of
`/products/san-pham-159-ban-ve-canh-quan-san-vuon`, which showed the same calls
(`/api/v1/products/159/reviews?page=1&limit=6` → 200, `/api/v1/products/159/comments?page=1&limit=10`
→ 200, `/api/v1/me/entitlements?productId=159` → 200, `/api/addresses?...` → 200). Where a success
branch could not be exercised with curl because it moves money or seeded state, the row says so and
carries the two-sided source snippet instead — that is called out in the Evidence cell.

Side effects of probing, disclosed in full (and resolved on 2026-09-21 by task `t5` — see
"Probe residue: removed and kept" below): `buyer01` bought products 159 and 158 through
`POST /api/v1/orders/purchase` while establishing the 200 shape (balance 6,100,000 → 5,160,000 and two
new `orders`/`entitlements` rows), and the free-asset path bought product 157 for 0₫; one 50,000₫
top-up intent (`KTHMUAMPFRA382`, PENDING), one ticket (`TCK-20260921-4A247F`, CLOSED), one comment +
reply + one report + one review on product 159, one notification read and one read-all, one throwaway
seller profile (user 1352, id 13), one throwaway product (id 1645) and one throwaway media +
product_preview + product_file; `buyer01`'s display name was changed to "Probe Name" by one probe and
restored to "Nguyễn Văn An" in the next command. No seeded withdrawal, refund, entitlement or
moderation state was changed.

### Probe residue: removed and kept

Every probe-created row was deleted on 2026-09-21 through Payload's **local API**
(`payload.delete({ collection, id, overrideAccess: true })`, never SQL and never REST), from
`.lit/evidence/probe-cleanup-t5/cleanup.mts`; the run's full output is
`.lit/evidence/probe-cleanup-t5/before.txt` (report) and `after.txt` (apply), and the independent
curl re-check is `.lit/evidence/probe-cleanup-t5/verify-after.txt`. All twelve targets were
unreferenced before the delete (fifteen inbound-reference probes across `order_items`, `entitlements`,
`reviews`, `comments`, `moderation_cases`, `tickets`, `download_events`, `seller_earnings`,
`withdrawals`, `orders` and the user-side of each all returned 0) and eleven were deleted outright:

| Deleted (collection/id) | What created it | Delete result |
|---|---|---|
| `products` 1645 (`probe`, slug `probe-1789957947479`, draft) | probe C37 | DELETED |
| `product_previews` 17 (`probe-preview.png`) | probe C35 | DELETED |
| `media` 33 (`probe-preview.png`; file removed from `public/media`) | probe C35 | DELETED |
| `product_files` 162 (`probe-file.pdf`) | probe C36 | DELETED |
| `seller_profiles` 13 | probe C34 | DELETED |
| `users` 1352 (`probe-inventory-t1@example.com`) | probe C41 | DELETED |
| `tickets` 1 (`TCK-20260921-4A247F`, CLOSED) | probe C19 | DELETED |
| `comments` 1 (comment on product 159) | probe C12 | DELETED |
| `comments` 2 (reply to comment 1) | probe C13 | already gone — deleting comment 1 removed the reply with it, so the second call returned `NotFound`; `comments where product=159` is 0 |
| `moderation_cases` 15 (report, `FILE_CORRUPTED`) | probe C18 | DELETED |
| `reviews` 1 (product 159, rating 4, published) | probes C16/C17 | DELETED |
| `payment_intents` 44 (`KTHMUAMPFRA382`, PENDING, 50,000₫) | probe C03 | DELETED |

No delete was refused by a rule or a trigger. The one non-`DELETED` line is `comments` 2 above, and the
before/after count table (`comments` 2 → 0) shows both comment rows did leave the database.

**Permanent residue that stays** — the money model and BR-03 protect it, so nothing here was touched:

- `orders` **347** `ORD-20260921-C25408` — 510,000 VND, COMPLETED (product 159, bought by probe 2.9).
- `orders` **348** `ORD-20260921-86626E` — 0 VND, COMPLETED (product 157, the free-asset self-grant
  fired by probe 2.12; it carried no ledger row, and it was not in the deletable list, so it stays).
- `orders` **349** `ORD-20260921-1A0888` — 430,000 VND, COMPLETED (product 158, bought by probe C02).
- `entitlements` **189** (user 9, product 159, active), **190** (user 9, product 157, active),
  **191** (user 9, product 158, active).
- `wallet_ledger` **242** (purchase, debit, 510,000, `ORD-20260921-C25408`, 6,100,000 → 5,590,000) and
  **243** (purchase, debit, 430,000, `ORD-20260921-1A0888`, 5,590,000 → 5,160,000) — immutable per
  BR-03. `buyer01`'s wallet 16 therefore stands at **5,160,000 VND**.
- Derived rows that stay because they belong to the residue orders/ticket and are outside the cleanup's
  list: `notifications` **109**, **111**, **112** (ORDER_SUCCESS to buyer 9, links `/orders/347`,
  `/orders/348`, `/orders/349`; `readAt` set by probes C23/C22), **110** and **113** (SELLER_SALE to the
  sellers of products 159/158), and **114** (TICKET_REPLY, `link: null`, emitted by probe C20 before the
  ticket was deleted).

The before/after counts, measured in the same run (`.lit/evidence/probe-cleanup-t5/after.txt`):

| Collection | Before | After | Δ |
|---|---|---|---|
| products | 166 | 165 | −1 |
| users | 60 | 59 | −1 |
| seller_profiles | 13 | 12 | −1 |
| media | 33 | 32 | −1 |
| product_previews | 17 | 16 | −1 |
| product_files | 162 | 161 | −1 |
| tickets | 1 | 0 | −1 |
| comments | 2 | 0 | −2 |
| moderation_cases | 1 | 0 | −1 |
| reviews | 1 | 0 | −1 |
| payment_intents | 44 | 43 | −1 |
| payment_transactions | 0 | 0 | 0 |
| orders | 256 | 256 | 0 |
| entitlements | 191 | 191 | 0 |
| wallet_ledger | 243 | 243 | 0 |
| wallets | 58 | 58 | 0 |
| notifications | 46 | 46 | 0 |
| addresses | 0 | 0 | 0 |

Verified independently of the cleanup script, with curl against the running dev server: the throwaway
user can no longer log in (401), `GET /api/products/1645` 404s,
`GET /api/products?where[seller][equals]=1352` returns 0,
`GET /api/seller_profiles?where[user][equals]=1352` returns 0, `/products/probe-1789957947479` 404s,
`GET /api/reviews|comments?where[product][equals]=159` return 0, and media 33 / product_previews 17 /
product_files 162 / tickets 1 / moderation_cases 15 / `GET /api/v1/payments/KTHMUAMPFRA382` all 404. On
the protected side, orders 347/348/349, entitlements 189/190/191 and ledger rows 242/243 still answer
200, the wallet still reads 5,160,000 VND, the storefront still lists 140 published products, and `/`,
`/shop` and the product page still return 200. The one 500 seen
(`/api/media/file/probe-preview.png`) is the file route's pre-existing answer for *any* absent file — a
control request for a name that never existed returns the same 500 while a seeded file returns 200 — and
the uploaded files are gone from `public/media` on disk.

### A. Client-side `fetch()` paths

| # | UI path (file:line) | Target | UI assumes | API implements | Verdict | Evidence | Smallest fix |
|---|---|---|---|---|---|---|---|
| A1 | `web/src/components/checkout/CheckoutPage.tsx:85` | `GET /api/v1/me/wallet` | GET, no body, same-origin cookies (`credentials` unset ⇒ `same-origin`). Body is stored whole (`setWallet(data)`, :87-88) and then read as top-level `wallet.balance` / `wallet.pendingBalance` (:121-122). | `web/src/app/api/v1/me/wallet/route.ts:7` (`GET`), :19-28 ⇒ 200 `{success, wallet:{id,balance,pendingBalance,currency,status}}`; 401 `{error}`; :13 auth = any authenticated user. | **UI_WRONG** | `curl -b buyer.jar http://localhost:3000/api/v1/me/wallet` → `{"success":true,"wallet":{"id":16,"balance":5590000,"pendingBalance":0,…}}`: probe C01 reports `wallet.balance` PRESENT and top-level `balance` MISSING. CheckoutPage:121 `wallet?.balance ?? 0` therefore always yields 0, so `isWalletSufficient` (:122) is always false and the wallet button always answers "Số dư ví không đủ để thanh toán đơn hàng này!" (:159-162). | One line: `setWallet(data?.wallet ?? null)` in the `.then` at :87-89, or read `data.wallet` at :121. Keep the endpoint's nested shape — `WalletClient` (A7) already reads `data.wallet`. |
| A2 | `web/src/components/checkout/CheckoutPage.tsx:172` | `POST /api/v1/orders/purchase` | POST, `Content-Type: application/json`, same-origin cookies, body `{productId}`; on `!res.ok` reads `data.message` (:179-180); on success reads `data.orderId` (:184-186). | `web/src/app/api/v1/orders/purchase/route.ts:16`, body read at :50, 200 at :110-120 ⇒ `{success,orderId,orderCode,entitlementId,productTitle,pricePaid}`; 400 `{error,message}` / `{error,message,required,balance}` / `{error,message}`; 401 `{error,message}`; 404; 409 `{error,message,entitlementId}`; 500; :27 auth = authenticated user; money written only through `purchaseProduct` (`@/services/purchase`, decision 0002). | MATCHES | `curl -b buyer.jar -H 'Content-Type: application/json' -d '{"productId":158}' …/api/v1/orders/purchase` → 200 `{"success":true,"orderId":"349","orderCode":"ORD-20260921-1A0888",…}` (probe C02); `-d '{"productId":159}'` on the now-owned product → 409 `{"error":"ALREADY_OWNED","message":"…","entitlementId":189}`. | None. |
| A3 | `web/src/components/checkout/CheckoutPage.tsx:205-216` (`handleVietQROrder`) | **no request at all** | The VietQR radio branch reports `message.success('Đơn hàng đã được ghi nhận! Vui lòng hoàn tất quét mã VietQR để nhận bản vẽ.')`, calls `clearCart()` and `router.push('/orders')` without calling any endpoint — no order, no payment intent, no access token is created. | No route is reached. The only money-writing endpoints that could back this branch are `POST /api/v1/orders/purchase` (wallet) and `POST /api/v1/payments/topup` (intent); neither is called. | **UI_UNWIRED** | `grep -n "fetch(" web/src/components/checkout/CheckoutPage.tsx` returns exactly two hits (lines 85 and 172); the whole handler body :205-216 is `setProcessingPayment(true)` → `message.success(…)` → `await clearCart()` → `router.push('/orders')` → `finally`. Nothing else in the file mentions `vietqr` beyond the radio label and this handler. | Decide the rail, then wire or hide. Smallest *safe* change inside this increment's scope: hide/disable the VietQR radio option with a "chưa khả dụng" notice (copy belongs to the storefront vertical) so the user is never told an order was recorded; actually *creating* the order means routing the branch through `POST /api/v1/orders/purchase` (and deciding who pays), which needs an owner decision. |
| A4 | `web/src/components/checkout/CheckoutPage.tsx:127` (`initiatePayment('stripe', …)` → plugin client) | `POST /api/payments/stripe/initiate` | The plugin's `initiatePayment` POSTs `${baseAPIURL}/payments/${methodID}/initiate` with `credentials:'include'` and parses the JSON body. | No such route exists: decision 0013 §1 omits the plugin's `payments` block (`web/src/plugins/index.ts:106-109`), so no `/api/payments/*` endpoint is registered. | **ENDPOINT_MISSING** — *out of scope per decision 0013 and the plan's Scope* | Plugin side: `node_modules/@payloadcms/plugin-ecommerce/dist/react/provider/index.js:514`. Measured: `curl -b buyer.jar -X GET /api/payments/stripe/initiate` → 404 `{"message":"Route not found \"/api/payments/stripe/initiate\""}`. CheckoutPage:36-37 still mounts `stripeAdapterClient` via `web/src/providers/index.tsx:33-37`. | Out of scope: stays with the storefront vertical as decision 0013 records. If it is ever picked up, the smallest fix is to stop offering the Stripe radio option (the dead-end control), not to re-register the template endpoints. |
| A5 | Cart vertical: `web/src/components/Cart/CartDrawer.tsx:60`, `CartPageClient.tsx:38`, `DeleteItemButton.tsx:10`, `EditItemQuantityButton.tsx:10`, `OpenCart.tsx:18`, plus `CheckoutPage.tsx:41,60`, `ConfirmOrder.tsx:10`, `CheckoutForm/index.tsx:28` (all `useCart()`) | `/api/carts` and `/api/carts/{id}[/add-item\|/remove-item\|/update-item\|/clear]` | The plugin's cart context GETs/POSTs `${baseAPIURL}/carts…` with `credentials:'include'`; `createCart` POSTs `{currency, customer}` and **throws** when the response is not ok. Every cart control (add, quantity, remove, clear, the header badge, and checkout's `cart.items` loop) depends on it. | No `carts` collection and no `/api/carts` route: the plugin is mounted with `carts:false` (`web/src/plugins/index.ts:95`), the state decision 0013's Context records as disabled in phase 2. `useCart()` also reads `/api/users/me?select[cart]`. | **ENDPOINT_MISSING** | Plugin side: `…/react/provider/index.js:129,168,226,291,341,394,447` (all `${baseAPIURL}/${cartsSlug}`) with `cartsSlug = 'carts'` default at :55 — `web/src/providers/index.tsx:20-37` passes no `cartsSlug` override. Measured: `curl -X GET /api/carts` → 404 `{"message":"Route not found \"/api/carts\""}`, `curl -X POST /api/carts -d '{"currency":"VND","customer":9}'` → 404 same body, while the sibling `/api/addresses` on the same provider returns 200. | Out of scope here: restoring a cart needs a collection + migration, and the plan puts `web/src/migrations/**` and schema changes in a separate increment. Report as that follow-up increment (restore `carts` + `/api/carts`, or remove the cart controls); the smallest *repository-level* answer today is to stop rendering add-to-cart/cart controls, which is a storefront-vertical decision. |
| A6 | `web/src/components/wallet/WalletClient.tsx:136` | `POST /api/v1/payments/topup` | POST, `Content-Type: application/json`, same-origin cookies, body `{amount}`; reads `data.intent` (:147) into `TopupIntentResponse` (`code,amount,status,expiresAt,checkoutUrl,bankCode,accountNo,accountName`, :81-92) and renders `data.error` on `!res.ok` (:143-145). | `web/src/app/api/v1/payments/topup/route.ts:7`, body read at :17-25 (`amount` integer ≥ 10000), 200 at :32-46 ⇒ `{success,intent{id,code,amount,currency,status,expiresAt,checkoutUrl,bankCode,accountNo,accountName}}`; 400/401/500 `{error}`; :13 auth = authenticated user. | MATCHES | `curl -b buyer.jar -d '{"amount":50000}' …/api/v1/payments/topup` → 200 with `intent.code=KTHMUAMPFRA382`, `intent.amount=50000`, `intent.status=PENDING`, `intent.checkoutUrl`, `intent.bankCode=MB`, `intent.accountNo`, `intent.accountName`, `intent.expiresAt` all PRESENT (probe C03). `-d '{"amount":9999}'` → 400 `{"error":"Số tiền nạp tối thiểu là 10.000₫ và phải là số nguyên (VND)."}` — the exact key the UI renders. | None. |
| A7 | `web/src/components/wallet/WalletClient.tsx:160` | `GET /api/v1/me/wallet` | GET, same-origin cookies; on `res.ok` reads `data.wallet` and replaces state (:164-165), which is read as `wallet.balance` (:376) and `wallet.pendingBalance` (:489). | Same route as A1: 200 `{success,wallet{…}}`; 401 `{error}`. | MATCHES | Probe C04: `GET /api/v1/me/wallet` (buyer) → 200, `wallet.balance` 5160000, `wallet.pendingBalance` 0, `wallet.currency` "VND", `wallet.status` "active" — all PRESENT. Note this call site reads the correct nested shape, which is what makes A1 a UI-side bug rather than an API-shape question. | None. |
| A8 | `web/src/components/wallet/WalletClient.tsx:161` | `GET /api/v1/me/wallet/ledger?limit=50` | GET with `limit=50` query, same-origin cookies; reads `data.docs` (:169) and renders `type,amount,direction,referenceId,balanceAfter,description,createdAt` (:224-305). | `web/src/app/api/v1/me/wallet/ledger/route.ts:6`, query read at :16-18 (`page`,`limit`), :20-31 filters `user = session user` with `overrideAccess:true`, 200 at :33-51 ⇒ `{success,docs[{id,type,amount,direction,referenceType,referenceId,balanceBefore,balanceAfter,description,createdAt}],totalDocs,totalPages,page,limit}`; 401 `{error}`; 500 `{error}`. | MATCHES | Probe C05: 200 with `docs` PRESENT and `docs.0.type="purchase"`, `docs.0.amount=430000`, `docs.0.direction="debit"`, `docs.0.referenceId="ORD-20260921-1A0888"`, `docs.0.balanceAfter=5160000`, `docs.0.description` PRESENT. Anon probe 1.2 → 401 `{error}`. | None. |
| A9 | `web/src/components/wallet/WalletClient.tsx:184` | `GET /api/v1/payments/{code}` | GET, same-origin cookies; only reads the body when `res.ok` (:185), then `data.intent.status` compared against `'PAID'` and `'EXPIRED'` (:187-194). The UI is the intent's owner polling its own code, and it assumes the endpoint it polls is at least as strict as the collection behind it. | Route `web/src/app/api/v1/payments/[code]/route.ts:6-35` ⇒ 200 `{success,intent{id,code,amount,currency,status,reconciliationFlag,expiresAt,checkoutUrl,bankCode,accountNo,accountName}}`; 404 `{error}`; 500 `{error}` — **but** :12-18 goes straight from `getPayload` to `getPaymentIntentWithLazyExpiry({code})` with **no** `payload.auth()` and no ownership check, whereas the collection's own rule `paymentIntentReadAccess` (`web/src/access/financialAccess.ts:54-68`) allows only the owner or admin/financeAdmin. | **API_WRONG** (the UI's status/field contract is correct — the endpoint's access rule is missing) | Both directions measured. UI contract: intent `KTHMUAMPFRA382` (created by probe C03, status PENDING) → `curl -b buyer.jar /api/v1/payments/KTHMUAMPFRA382` → 200 `status=PENDING`, top-level keys `['success','intent']`; unknown code → 404 `{error}`, which the UI's `res.ok` guard already skips (probe C06). API defect: the *same* request replayed with a brand-new empty cookie jar (anonymous) → **200** `{"success":true,"intent":{"id":44,"code":"KTHMUAMPFRA382","amount":50000,"status":"PENDING",…,"bankCode":"MB","accountNo":"0987654321","accountName":"KIENTAOHUB"}}`, while the sibling `/api/v1/me/wallet` and `/api/v1/me/wallet/ledger` answer 401 `{error}` for that same jar (probes 1.1, 1.2). | In the route, after resolving the intent: `const headers = await getHeaders(); const { user } = await payload.auth({ headers })`; refuse unless `user` and (`String(intent.user) === String(user.id)` or `checkRole(['admin','financeAdmin'], user)`), answering the **existing** 404 body (`{error:'Không tìm thấy giao dịch nạp tiền.'}`) so codes stay unenumerable. ~8 lines, no schema change. |
| A10 | `web/src/components/download/DownloadButton.tsx:50` | `POST /api/v1/downloads/token` | POST, `Content-Type: application/json`, same-origin cookies (`credentials` unset), body `{productId: Number(productId)}`; reads `data.success` (:62) and `data.data.downloadUrl` (:66), then navigates to it; renders `data.message` on failure (:63). | `web/src/app/api/v1/downloads/token/route.ts:20`, body read at :54-96 (`productId` number or digit-string), 200 at :171-174 ⇒ `{success,data{token,downloadUrl,expiresAt,…}}` (`downloadUrl` composed in `web/src/services/download.ts:160`); 400/401/403/404/500 `{error,message}`; :31 auth = authenticated user; free products self-grant through `purchaseProduct` (:140-165). | MATCHES | Probe C07: `curl -b buyer.jar -d '{"productId":158}'` → 200 `{success:true, data.downloadUrl:"/api/v1/downloads/<jwt>"}` — both keys the UI reads are PRESENT. Error side: `-d '{}'` → 400 `{error,message}`, `-d '{"productId":158}'` as a non-owner (probe 2.11, product not owned) → 403 `{error,message}`. | None. |
| A11 | `web/src/components/product/DigitalProductCTA.tsx:118` and `:189` | `GET /api/v1/me/entitlements?productId={id}` | GET with `productId` query, `credentials:'include'`; reads `data.hasEntitlement` (:125, :194) and treats a non-ok response as "no entitlement". | `web/src/app/api/v1/me/entitlements/route.ts:7`, query read at :27-51, :88-93 filters own active entitlements with `overrideAccess:true`, 200 at :97-112 ⇒ `{success,isAuthenticated,hasEntitlement,docs[{id,productId,status,grantedAt,downloadCount}]}`; anonymous ⇒ 200 `{success,isAuthenticated:false,hasEntitlement:false,docs:[]}` (:18-25); malformed `productId` ⇒ 400 `{error,message}`. | MATCHES | Probe C08 (buyer, product 158) → 200, `hasEntitlement` PRESENT `true`, `isAuthenticated` PRESENT `true`; probe 1.3 (anonymous, product 159) → 200 `{success,isAuthenticated:false,hasEntitlement:false,docs:[]}` — exactly the shape the UI's `res.ok ? res.json() : null` path expects. | None. |
| A12 | `web/src/components/product/DigitalProductCTA.tsx:248` | `POST /api/v1/downloads/token` | POST, `Content-Type: application/json`, `credentials:'include'`, body `{productId: pId}`; requires `data.data.downloadUrl` (:257), maps `res.status === 401` to the login modal (:258-260), renders `data.message` otherwise (:262). | Same route as A10; 401 `{error:'UNAUTHORIZED',message}` for anonymous. | MATCHES | Probe C09 (buyer, product 158) → 200 `{success:true,data.downloadUrl}`; probe 1.6/2.10 error branches as in A10. The 401 branch the UI handles is the 401 this route returns at :32-38. | None. |
| A13 | `web/src/components/product/DigitalProductCTA.tsx:310` | `POST /api/v1/orders/purchase` | POST, `Content-Type: application/json`, `credentials:'include'`, body `{productId}`; reads `data.success` (:319), then branches on `data.error === 'ALREADY_OWNED'` (:329), `'INSUFFICIENT_FUNDS'` with `data.required`/`data.balance` (:339-343), `'UNAUTHORIZED'` (:347), `'SELF_PURCHASE_FORBIDDEN'` (:352), else `data.message` (:357). | Same route as A2: 409 `{error:'ALREADY_OWNED',message,entitlementId}` (:178-197), 400 `{error:'INSUFFICIENT_FUNDS',message,required,balance}` (:143-158), 401 `{error:'UNAUTHORIZED',message}` (:27-35), 400 `{error:'SELF_PURCHASE_FORBIDDEN',message}` (:123-140). | MATCHES | Probe C10 (throwaway user 1352, zero balance, product 158) → 400 `{"error":"INSUFFICIENT_FUNDS","required":430000,"balance":0,"message":"Số dư ví không đủ …"}` — `required` and `balance` both PRESENT, which is the branch at :340-341. Owned-product probe → 409 `{"error":"ALREADY_OWNED",…}`. `SELF_PURCHASE_FORBIDDEN` verified by source at :123-140 (not curl-exercised: it needs a seller session to hit it). | None. |
| A14 | `web/src/components/product/ProductCommentsSection.tsx:129` | `GET /api/v1/products/{id}/comments?page={p}&limit=10` | GET with page/limit query, `credentials:'include'`; reads `data.success`, `data.comments`, `data.totalComments`, `data.pagination.totalPages`, `data.pagination.page` (:136-141). | `web/src/app/api/v1/products/[id]/comments/route.ts:111`, query read at :111-120 (`page`,`limit`), 200 ⇒ `{success,comments[{id,productId,content,status,parentId,user{…},replies:[…],createdAt}],totalComments,pagination{page,limit,totalPages,totalDocs}}`; 404 `{error,message}`; 500 `{error,message}`. Public (no auth required). | MATCHES | Probe C11 (anonymous, product 159) → 200 with top-level keys `success,comments,totalComments,pagination`; `totalComments` PRESENT `0`, `pagination.totalPages` PRESENT `1`, `pagination.page` PRESENT `1`. Browser load on the same product issued the identical request and got 200. | None. |
| A15 | `web/src/components/product/ProductCommentsSection.tsx:171` | `POST /api/v1/products/{id}/comments` | POST, `Content-Type: application/json`, `credentials:'include'`, body `{content}`; reads `data.success` (:181) and renders `data.message` when the response is not ok or not successful (:187). | Same route, `POST` at :230: body read at :269-312 (`content` ≥ 3 chars trimmed), 201 at :438 ⇒ `{success,comment{…,replies:[]}}`; 400/401/404/500 `{error,message}`. | MATCHES | Probe C12 (buyer, product 159) → 201 `{success:true, comment:{id:1,productId:159,content:"probe cau hoi",status:"published",…}}`; `success` and `comment` PRESENT. Validation branch: source :269-312 returns `{error,message}`, the key the UI renders. | None. |
| A16 | `web/src/components/product/ProductCommentsSection.tsx:211` | `POST /api/v1/products/{id}/comments` (reply) | Same as A15 but body `{parentId, content}`; reads `data.success` (:224), renders `data.message` (:230). | Same route; the parent is read as `body.parent \|\| body.parentId` (:279-302), 201 shape identical to A15. | MATCHES | Probe C13 (buyer, `{parentId:1,content:"probe tra loi"}`) → 201 `{success:true,comment:{id:2,parentId:1,…}}`. | None. |
| A17 | `web/src/components/product/ProductCommentsSection.tsx:244` | `PATCH /api/v1/products/{id}/comments/{commentId}` | PATCH, `Content-Type: application/json`, `credentials:'include'`, body `{status:'hidden'}`; reads `data.success` (:254), renders `data.message` (:258). The control is rendered when `canHide = isAuthor \|\| isPrivileged` (:386, :553). | `web/src/app/api/v1/products/[id]/comments/[commentId]/route.ts:113`, authorization at :196-213 (`isAuthor \|\| isAdmin \|\| isModerator`, else 403 `{error,message}`), body read at :219-304 (`status`), 200 at :486 ⇒ `{success,comment}` — **no `message` in the 200 body** (corrected in review round 1, R8); 400/401/403/404/500 `{error,message}`. | MATCHES | Probe C14 (buyer = author of comment 1) → 200 `{success:true,comment:{…,"status":"hidden"}}`; `success` and `comment` PRESENT. This cell originally claimed the 200 carried `message`; review round 1 measured that it does not, and the UI does not need it — `data.message` is rendered on the failure path only (`:258`), which keeps the row's verdict unchanged. The rendered-control rule (`isAuthor \|\| isAdmin \|\| isModerator`, :386/:553) is byte-identical to the route's :201-205 rule. | None. |
| A18 | `web/src/components/product/ProductReviewsSection.tsx:136` and `:167` | `GET /api/v1/products/{id}/reviews?page={p}&limit=6` | GET with page/limit query, `credentials:'include'`; reads `data.success`, `data.reviews`, `data.summary`, `data.userReview`, `data.canReview` (:143-149, :173-177). | `web/src/app/api/v1/products/[id]/reviews/route.ts:69`, query read at :85-87, 200 at :314-330 ⇒ `{success,summary{averageRating,totalCount,distribution},reviews[…],pagination{…},userReview,canReview}`; 404 `{error,message}`; 500 `{error,message}`. Public. | MATCHES | Probe C15 (anonymous, product 159) → 200 with top-level keys `success,summary,reviews,pagination,userReview,canReview` — all five fields the UI reads are PRESENT (`reviews: []`, `summary` populated, `userReview: null`, `canReview: false`). Browser load issued the same call → 200. | None. |
| A19 | `web/src/components/product/ProductReviewsSection.tsx:219` | `POST`/`PUT /api/v1/products/{id}/reviews` | Method is chosen at runtime (`isEditing ? 'PUT' : 'POST'`), `Content-Type: application/json`, `credentials:'include'`, body `{rating,title,content}`; handles `res.status` 401 / 403 / 409 with `data.message`, else `data.message` (:237-249). | `web/src/app/api/v1/products/[id]/reviews/route.ts:353` (POST 201 `{success,message,review{…}}`), `:641` (PUT 200 `{success,message,review{…}}`); 400/401/403/404/409/500 `{error,message}` with `{error,message,existingReviewId}` on the duplicate 409 (:542). | MATCHES | Probe C16 (POST, buyer previously bought 159) → 201 `{success:true,message:"Đánh giá đã được gửi thành công.",review:{id:1,rating:5,…}}`; probe C17 (PUT, same buyer) → 200 `{success:true,message:"Đánh giá đã được cập nhật thành công.",review:{…}}`. Both statuses the UI special-cases are the ones the route declares. | None. |
| A20 | `web/src/components/product/ProductReportDialog.tsx:72` | `POST /api/v1/products/{id}/reports` | POST, `Content-Type: application/json`, same-origin cookies, body `{reason, description: description.trim() \|\| undefined}`; reads `data.success` (:85), `data.case` (:89), renders `data.message` (:86). The reason option list comes from `MODERATION_CASE_REASON_OPTIONS` (:20, :204-205). | `web/src/app/api/v1/products/[id]/reports/route.ts:134`, body read at :192-232 (`reason` must be one of the seven `MODERATION_CASE_REASONS` from `web/src/collections/ModerationCases/reasons.ts:30-32`; `description` optional string ≤ MAX), 201 at :279 ⇒ `{success,case{id,productId,reporterId,reason,description,status,resolutionNotes,resolvedAt,createdAt,updatedAt}}`; 400 `{error,message}` / `{error:'INVALID_REASON',message}`; 401; 404; 409 `{error,message}`. | MATCHES | First probe used a non-enum value `COUNTERFEIT` → 400 `{"error":"INVALID_REASON","message":"Lý do báo cáo (reason) không hợp lệ. Phải là một trong: FILE_CORRUPTED, CONTENT_MISMATCH, COPYRIGHT_VIOLATION, SPAM, PROHIBITED_CONTENT, MISLEADING_PREVIEW, OTHER."}`; probe C18 with the dialog's own first option `FILE_CORRUPTED` → 201 `{success:true,case:{id:15,productId:159,reporterId:9,reason:"FILE_CORRUPTED",…}}`. The dialog's option list is imported from the same module the route validates against, so the enum cannot drift. | None. |
| A21 | `web/src/components/dispute/OrderDisputeModal.tsx:102` | `POST /api/v1/tickets` | POST, `Content-Type: application/json`, same-origin cookies, body `{orderId, productId, reason, subject, description, priority}` (:107-114); reads `data.success`, `data.ticket` (`data.ticket.code` at :125), renders `data.message` (:120). Reason options :26-32, priority options :331-334. | `web/src/app/api/v1/tickets/route.ts:52`, body read at :72-183 (`reason` ∈ VALID_REASONS :15-21, `subject`, `description`, `orderId`, `productId`, `priority` ∈ VALID_PRIORITIES :23), 201 at :215 ⇒ `{success,ticket}`; 400 `{error,message}` or `{error,code,message}`; 401; 403; 404; 500. | MATCHES | Probe C19 (buyer, order 227) → 201 `{success:true,ticket:{id:1,code:"TCK-20260921-4A247F",status:"OPEN",…}}`. Enum parity checked by reading both sides: the dialog's five reasons (`FILE_CORRUPTED, MISLEADING_CONTENT, DOWNLOAD_ERROR, BILLING_DISPUTE, OTHER`, :26-32) equal the route's `VALID_REASONS`, and the dialog's four priorities equal `VALID_PRIORITIES`. Anonymous probe 1.6 → 401 `{error,message}`. | None. |
| A22 | `web/src/components/dispute/OrderTicketsSection.tsx:111` | `POST /api/v1/tickets/{id}/messages` | POST, `Content-Type: application/json`, same-origin cookies, body `{message}`; reads `data.success`, `data.ticket` (:122-123), renders `data.message` on failure (:119). | `web/src/app/api/v1/tickets/[id]/messages/route.ts:78`, access at :119-125 (author/seller/admin), body read at :137-143, 201 at :274-281 ⇒ `{success,message:<the new message object>,ticket:<updated ticket>}`; 400/401/403/404 `{error,message}`; 409 `{error:'CONFLICT',message}` when the ticket is CLOSED (:176-180). | MATCHES | Probe C20 (buyer, ticket 1) → 201 `{success:true,message:{sender:9,senderRole:"buyer",message:"probe phan hoi",…},ticket:{…}}`; `data.ticket.id` present, so the UI's `setTickets(map(t.id === updated.id))` (:123) resolves. Note the `message` key is an object on 201 and a string on errors, but the UI only renders it when `!res.ok`, so the two never collide. | None. |
| A23 | `web/src/components/dispute/OrderTicketsSection.tsx:137` | `PATCH /api/v1/tickets/{id}` | PATCH, `Content-Type: application/json`, same-origin cookies, body `{status:'CLOSED'}`; reads `data.success`, `data.ticket` (:148-149), renders `data.message` (:145). | `web/src/app/api/v1/tickets/[id]/route.ts:226`, field-level authorization in `planTicketUpdate` (:62-157) — a buyer may only set `CLOSED`/`RESOLVED` (:77-85, else 403) and may not touch `priority`/`resolution` (:68-76), 200 at :358-361 ⇒ `{success,ticket}`; 400/401/403/404/409 `{error[,code],message}`. | MATCHES | Probe C21 (buyer, ticket 1, `{"status":"CLOSED"}`) → 200 `{success:true,ticket:{…,status:"CLOSED"}}`; `data.ticket.id` present. The route's buyer rule (:77-85) permits exactly the value the UI sends. | None. |
| A24 | `web/src/app/(app)/(account)/notifications/NotificationsList.tsx:147` | `POST /api/v1/me/notifications/{id}/read` | POST, no body, no custom headers, same-origin cookies; on success updates local state optimistically, on failure renders `data?.message` (:151). | `web/src/app/api/v1/me/notifications/[id]/read/route.ts:28` ⇒ 200 `{success,id,readAt,isRead,updated}`; 400 `{error}`; 401 `{error,message}`; 404 `{error}` (`{error,message}` on the not-found body); 500 `{error,message}`. | MATCHES | Probe C22 (buyer, notification 112) → 200 `{success:true,id:112,readAt:"…",isRead:true,updated:1}`. The error shape the UI renders is the one the route sends: probe 2.16 (`id 999999`) → 404 `{"error":"NOT_FOUND","message":"Thông báo không tồn tại."}`. | None. |
| A25 | `web/src/app/(app)/(account)/notifications/NotificationsList.tsx:171` | `POST /api/v1/me/notifications/read-all` | POST, no body, same-origin cookies; reads `data?.unreadCount` (:180) and renders `data?.message` on failure (:175). | `web/src/app/api/v1/me/notifications/read-all/route.ts:19` ⇒ 200 `{success,updated,failed,readAt,unreadCount}`; 401 `{error,message}`; 500 `{error,message}`. | MATCHES | Probe C23 (buyer) → 200 `{success:true,updated:0,failed:0,readAt:"…",unreadCount:0}`; `unreadCount` and `success` PRESENT. | None. |
| A26 | `web/src/app/(app)/finance/FinanceOperations.tsx:118` | `POST /api/v1/admin/withdrawals/{id}/review` | POST, no body, same-origin cookies; updates local status to `UNDER_REVIEW`, renders `data.message \|\| data.error` (:120). | `web/src/app/api/v1/admin/withdrawals/[id]/review/route.ts:19`, role gate at :26-38 (`checkRole(['admin','financeAdmin'])` ⇒ 401 `{error}` / 403 `{error}`), 200 at :53 ⇒ `{success,data}`; 400 `{error,message}`. | MATCHES | Probe C24 (finance cookie, id 999999) → 400 `{"error":"BAD_REQUEST","message":"Not Found"}` — both keys the UI renders are PRESENT, and probe 4.11 (buyer cookie) → 403 `{error,message}` as the UI's role model expects. The **200 branch was not curl-exercised** (it advances a seeded withdrawal); the two sides are identical in shape to its four siblings below and read `{success,data}` at route :53. | None. |
| A27 | `web/src/app/(app)/finance/FinanceOperations.tsx:141` | `POST /api/v1/admin/withdrawals/{id}/approve` | POST, `Content-Type: application/json`, same-origin cookies, body `{notes: string \| undefined}`; on failure renders `data.message \|\| data.error` (:147). | `…/[id]/approve/route.ts:19`, body read at :42 (`notes`), 200 at :62 ⇒ `{success,data}`; 400/401/403 `{error,message}`. | MATCHES | Probe C25 → 400 `{"error":"BAD_REQUEST","message":"Not Found"}`; the `notes` key the UI sends is the one the route reads (:42). 200 branch not curl-exercised (mutates a seeded withdrawal) — same shape as C24's sibling. | None. |
| A28 | `web/src/app/(app)/finance/FinanceOperations.tsx:178` | `POST /api/v1/admin/withdrawals/{id}/reject` | POST, JSON, body `{reason}`; the UI refuses client-side when `reason` is empty (:171-174); renders `data.message \|\| data.error` (:184). | `…/[id]/reject/route.ts:19`, body read at :42-57 (`reason` required ⇒ 400 `{error,message}`), 200 at :69 ⇒ `{success,data}`; 401/403 `{error}`. | MATCHES | Probe C26 → 400 `{"error":"BAD_REQUEST","message":"Not Found"}`. The route's required `reason` (:42-57) matches the only body key the UI sends. 200 branch not curl-exercised. | None. |
| A29 | `web/src/app/(app)/finance/FinanceOperations.tsx:209` | `POST /api/v1/admin/withdrawals/{id}/process` | POST, no body; renders `data.message \|\| data.error` (:211). | `…/[id]/process/route.ts:19`, 200 at :53 ⇒ `{success,data}`; 400/401/403 `{error,message}`. | MATCHES | Probe C27 → 400 `{error,message}`. 200 branch not curl-exercised. | None. |
| A30 | `web/src/app/(app)/finance/FinanceOperations.tsx:233` | `POST /api/v1/admin/withdrawals/{id}/finalize` | POST, no body; renders `data.message \|\| data.error` (:235). | `…/[id]/finalize/route.ts:19`, 200 at :53 ⇒ `{success,data}`; 400/401/403 `{error,message}`. | MATCHES | Probe C28 → 400 `{error,message}`. 200 branch not curl-exercised (it marks a withdrawal PAID and debits). | None. |
| A31 | `web/src/app/(app)/finance/FinanceOperations.tsx:314` | `POST /api/v1/admin/refunds` | POST, JSON, body `{orderId, reason, faultBasis, overrideWindow?:true, revokeEntitlement}` (:317-325); validation of `faultBasis` and the Decision 0012 §6 window is done client-side too (:274-310); on `!res.ok` renders `data.message \|\| data.error`, and re-opens the override checkbox when the message mentions the window (:328-336). | `web/src/app/api/v1/admin/refunds/route.ts:19`, role gate at :23-42, body read at :46-104 (`orderId`,`reason`,`faultBasis`,`overrideWindow` boolean-only,`revokeEntitlement`), 200 at :106 ⇒ `{success,data}`; 400 `{error,message}` ×6; 401/403 `{error}`; 500. | MATCHES | Probe C29 (finance, order 227 PENDING) → 400 `{"error":"BAD_REQUEST","message":"Order 227 is not eligible for refund (status: PENDING)"}`; probe 4.8 (`{}`) → 400 `{error,message}`; probe 4.9 (bad `faultBasis`) → 400 `{error,message}`; probe 4.10 (buyer cookie) → 403 `{error,message}`. The 200 branch **was not curl-exercised** (it moves money per decision 0002/0012); the UI never reads any field of that body — it only branches on `res.ok` (:328, :339) — so the body shape cannot break this call site. | None. |
| A32 | `web/src/app/(app)/finance/FinanceOperations.tsx:353` | `GET /api/v1/admin/refunds` | GET, same-origin cookies; reads `refundsData.docs` (:356). | `web/src/app/api/v1/admin/refunds/route.ts:116`, query read at :127-155 (`page`,`limit`,`orderId`,`buyerId`,`sellerId`), 200 ⇒ `{success,docs,totalDocs,page,totalPages,hasNextPage,hasPrevPage}`; 401/403 `{error,message}`. | MATCHES | Probe C30 (finance) → 200 with `docs` PRESENT (16 refunds, first `{"id":16,"code":"REF-20260909-D492DD",…}`) and `totalDocs` 16; probe 4.12 (seller cookie) → 403 `{error,message}`. | None. |
| A33 | `web/src/app/(app)/moderation/ModerationQueue.tsx:70` | `POST /api/moderation/action` | POST, JSON, body `{productId, action, note}`; `action` ∈ `'approved' \| 'changes_requested' \| 'rejected'` (:46-51, :169-184); requires a note for the two non-approval actions (:61-64); renders `data.error` (:81). | `web/src/app/api/moderation/action/route.ts:7`, role gate at :13-15 (`checkRole(['admin','moderator'])` ⇒ 403 `{error}`), body read at :17-27 (`productId`, `action` ∈ `['approved','changes_requested','rejected','in_review']`, `note` default `''`), 200 at :41 ⇒ `{success,product}`; 400 `{error}`; 500 `{error}`. | MATCHES | Probe C31 (moderator, product 159, `{"action":"approved","note":""}`) → 200 `{success:true,product:{…}}`; probe 5.2 (bad action) → 400 `{error:"Hành động không hợp lệ. Cho phép: approved, changes_requested, rejected, in_review"}`; probe 5.3 (no productId) → 400 `{error}`; probe 3.11 (seller cookie) → 403 `{error}`. The UI's three action values are a subset of the route's four. | None. |
| A34 | `web/src/app/(app)/seller/register/RegisterForm.tsx:40` | `POST /api/seller/register` | POST, JSON, body `{displayName, bio, phone, bankName, accountNumber, accountHolderName, sellerTermsAccepted}`; client-side requires `displayName` and the terms checkbox (:27-35); renders `data.error` (:57). | `web/src/app/api/seller/register/route.ts:6`, auth at :12-14 (401 `{error}`), body read at :16-33 (`displayName` ≥ 2 chars, `sellerTermsAccepted` required), upserts `seller_profiles` and appends the `seller` role to the user (:96-107), 200 at :109 ⇒ `{success,profile}`; 400/500 `{error}`. | MATCHES | Probe C34 with the throwaway identity (user 1352) → 200 `{success:true,profile:{id:13,user:{id:1352,…}}}`; `{}` → 400 `{"error":"Tên thương hiệu / người bán không hợp lệ (tối thiểu 2 ký tự)."}` and without the terms flag → 400 `{"error":"Bạn phải đồng ý với Điều khoản dành cho Người bán."}` — the same key the UI renders. All seven body keys are read by the route. | None. |
| A35 | `web/src/app/(app)/seller/WithdrawalModal.tsx:85` | `POST /api/v1/seller/withdrawals` | POST, JSON, body `{amount, bankInfo{bankName,accountNumber,accountHolderName}}`; client-side caps at 50,000,000₫ and at the available balance (:66-80); renders `data.message \|\| data.error` (:100). | `web/src/app/api/v1/seller/withdrawals/route.ts:77`, auth at :80-92 (401/403), body read at :104-117 (`amount` required, `bankInfo` required object), 201 at :125 ⇒ `{success,data}`; any service failure ⇒ 400 `{error:'BAD_REQUEST',message}` (:126-132). | MATCHES | Probe C32 (seller, `{"amount":99999999,…}`) → 400 `{"error":"BAD_REQUEST","message":"Maximum withdrawal amount is 50,000,000 VND"}`; `{}` → 400 `{"error":"INVALID_REQUEST","message":"Số tiền rút (amount) là bắt buộc."}`; without `bankInfo` → 400 `{"error":"INVALID_REQUEST",…}`. Body keys `amount`/`bankInfo` are the two the route reads. The **201 branch was not curl-exercised** (it reserves a seeded seller's balance): route :119-125 returns `{success,data}`, and the UI reads none of that body — only `res.ok` (:99). | None. |
| A36 | `web/src/app/(app)/seller/WithdrawalHistoryTable.tsx:87` | `POST /api/v1/seller/withdrawals/{id}/cancel` | POST, no body, no `Content-Type`, same-origin cookies; sets local status to `CANCELLED` on success; renders `data.message \|\| data.error` (:93). | `web/src/app/api/v1/seller/withdrawals/[id]/cancel/route.ts:19`, role gate at :26-38, ownership/state checked in `cancelWithdrawal`, 200 at :53 ⇒ `{success,data}`; 400/401/403 `{error,message}`. | MATCHES | Probe C33 (seller, id 999999) → 400 `{"error":"BAD_REQUEST","message":"Not Found"}`; a missing-body POST is exactly what the route expects (it never calls `req.json()`). The 200 branch is not curl-exercised (it refunds a reserved balance): route :53. | None. |
| A37 | `web/src/app/(app)/seller/ProductEditorModal.tsx:89` and `web/src/app/(app)/seller/products/new/ProductEditorForm.tsx:62` | `POST /api/seller/upload-preview` | POST `FormData` with `file` (and `title` from the form), no explicit `Content-Type`, same-origin cookies; reads `data.preview.id` and `data.preview.url` (:70-71 in the form; the modal sets its preview the same way), renders `data.error` (:68). | `web/src/app/api/seller/upload-preview/route.ts:7`, role gate at :13-15 (`checkRole(['seller','admin'])` ⇒ 403 `{error}`), `formData` read at :17-19 (`file`, `title`), creates `media` + `product_previews`, 201 at :57-62 ⇒ `{success,preview{id,title,url}}`; 400 `{error}`; 500 `{error}`. | MATCHES | Probe C35 with a real multipart file (user 1352) → 201 `{success:true,preview:{id:17,title:"…",url:"/api/media/file/probe-preview.png"}}`; `preview.id` and `preview.url` PRESENT. A probe that sent the field as a *text* part instead of a file produced 500 `{"error":"file.arrayBuffer is not a function"}` — the browser `FormData` always appends a `File`, so this is not reachable from the UI; see API-side observations. | None. |
| A38 | `web/src/app/(app)/seller/ProductEditorModal.tsx:116` and `…/products/new/ProductEditorForm.tsx:91` | `POST /api/seller/upload-file` | POST `FormData` with `file`; reads `data.file.id`, `data.file.filename`, `data.file.checksum`, `data.file.fileSize` (:99-105), renders `data.error` (:97). | `web/src/app/api/seller/upload-file/route.ts:7`, same role gate, `formData` at :17-18, creates a `product_files` document, 201 at :46-55 ⇒ `{success,file{id,filename,checksum,fileSize,status}}`; 400/403/500 `{error}`. | MATCHES | Probe C36 with a real multipart file → 201 `{success:true,file:{id:162,filename:"probe-file.pdf",checksum:"…",fileSize:2000,status:"…"}}`; every field the UI reads is PRESENT. | None. |
| A39 | `web/src/app/(app)/seller/ProductEditorModal.tsx:181` and `…/products/new/ProductEditorForm.tsx:129` | `POST /api/seller/products` | POST, JSON, body `{title,price,isFree,fileFormat,softwareVersion,fileSize,unit,categories[],software_types[],previewGallery[],originalFiles[],copyrightDeclared,submitForReview}`; requires `title` and, when submitting, the copyright flag (:116-124); renders `data.error` (:150). | `web/src/app/api/seller/products/route.ts:7`, role gate at :13-15, body read at :18-33 (all thirteen keys), title check :35-37, copyright check :39-41, `payload.create` :51-76, 201 at :78 ⇒ `{success,product}`; 400/500 `{error}`. | MATCHES | Probe C37 (user 1352, `{"title":"probe","price":100000}`) → 201 `{success:true,product:{id:1645,…}}`; probe 3.7 (`{}`) → 400 `{"error":"Tiêu đề sản phẩm là bắt buộc."}`. Every body key the UI sends is destructured by the route. | None. |
| A40 | `web/src/components/addresses/AddressListing.tsx:68` | `DELETE /api/addresses/{id}` | DELETE, `credentials:'include'`, no body; reads nothing from the body — only `response.ok` (:73), then reloads the page (:79); shows a fixed message otherwise (:81). | Payload's plugin-generated `addresses` collection (`slug: 'addresses'`, `…/plugin-ecommerce/dist/collections/addresses/createAddressesCollection.js:38`); `access.delete = accessOR(isAdmin, isDocumentOwner)` (:41), i.e. `isDocumentOwner` = `{customer equals user.id}` (`web/src/access/isDocumentOwner.ts:14-31`). | MATCHES | Round trip with the UI's own call: `POST /api/addresses` `{customer:9,…}` → 201 `{"doc":{"id":1,…}}`, then `DELETE /api/addresses/1` (buyer) → **200** `{"doc":{"id":1,…}}`; a foreign/absent id → 403 `{"errors":[{"message":"You are not allowed to perform this action."}]}`; anonymous `GET /api/addresses/1` → 403. The UI's `response.ok` guard matches the 200 the route really returns. | None. |
| A41 | `web/src/components/forms/AccountForm/index.tsx:81` | `PATCH /api/users/{user.id}` | PATCH, `credentials:'include'`, JSON body `{name, email}`; on success reads `json.doc` and stores it as the user (:94-95); on failure renders `json?.errors?.[0]?.message` (:98-99). | Payload's `users` collection: 200 `{doc,message}`; 400/403/500 `{errors:[{message}]}`; the collection's update access restricts a non-admin to their own row. | MATCHES | `curl -X PATCH -b buyer.jar -H 'Content-Type: application/json' -d '{"name":"Nguyễn Văn An","email":"buyer01@kientaohub.vn"}' /api/users/9` → 200 `{"doc":{"id":9,…},"message":"Updated successfully."}` — `doc` PRESENT. Error shape measured: `PATCH /api/users/4` (the seller's row) with the buyer cookie → 403 `{"errors":[{"message":"You are not allowed to perform this action."}]}`, i.e. the key the UI renders. (A PATCH with no body at all returns 500 `{"errors":[{"message":"Something went wrong."}]}`; the UI always sends a body.) | None. |
| A42 | `web/src/components/forms/AccountForm/index.tsx:125` | `PATCH /api/users/{user.id}` | PATCH, `credentials:'include'`, JSON body `{password, passwordConfirm}`; client-side equality and ≥6-char checks (:112-120); on success reads `json.doc` (:139); on failure `json?.errors?.[0]?.message` (:144). | Same collection route as A41. | MATCHES | `curl -X PATCH -b buyer.jar -d '{"password":"KienTao@2026"}' /api/users/9` → 200 `{"doc":{"id":9,…},"message":"Updated successfully."}` — `doc` PRESENT (and `passwordConfirm` is optional there, so the UI's extra field is additive, not required). | None. |
| A43 | `web/src/components/forms/CreateAccountForm/index.tsx:84` | `POST /api/users` | POST, JSON body `{email, password, passwordConfirm}`; on failure prefers `resData?.errors?.[0]?.message`, falls back to `resData?.message` then `response.statusText` (:96-112). | Payload's `users` create: 201 `{doc,message}`; validation failure 400 `{errors:[{name,data,message}],…}`. | MATCHES | `curl -X POST /api/users -d '{"email":"probe-inventory-t1@example.com",…}'` → **201** `{"doc":{"id":1352,…},"message":"User successfully created."}`. Failure side: repeating the same POST → 400 with top-level `errors` and `errors[0].message` — the first key the UI tries. | None. |
| A44 | `web/src/components/forms/ForgotPasswordForm/index.tsx:46` | `POST /api/users/forgot-password` | POST, JSON body `{email}`; treats any ok response as success (:54-57); on failure renders `data?.errors?.[0]?.message` with a fixed fallback (:59-63). | Payload's built-in `forgot-password` route: 200 `{message:'Success'}`; 400 `{errors:[…]}`. | MATCHES | `curl -X POST /api/users/forgot-password -d '{"email":"buyer01@kientaohub.vn"}'` → 200 `{"message":"Success"}` — the UI does not read the body on success, so only `response.ok` matters, and it is 200. | None. |

### B. Server components using Payload's local API

For these rows the "API" column is the collection's access rule (and the field shape the page reads),
not a route, exactly as the plan states. Every row cites the REST equivalent for the same collection as
measured evidence, because Payload serves both through the same access functions.

| # | UI path (file:line) | Target | UI assumes | API implements | Verdict | Evidence | Smallest fix |
|---|---|---|---|---|---|---|---|
| B1 | `web/src/app/(app)/(account)/account/page.tsx:24` | `orders.find` (buyer's own 5 newest) | `limit:5, pagination:false, user, overrideAccess:false, where:{buyer:{equals:user.id}}, sort:'-createdAt'`; page renders `orders.docs` (`order.code`, `order.status`, `order.totalAmount`). | `orderReadAccess` (`web/src/access/orderAccess.ts:10-24`): anon `false`; admin/financeAdmin `true`; otherwise `{buyer:{equals:user.id}}` — the same filter the page writes. | MATCHES | `curl -b buyer.jar -g '/api/orders?limit=20&depth=2&where[buyer][equals]=9'` → 200 with `docs` PRESENT (first `{"id":349,"code":"ORD-20260921-1A0888",…}`) and `totalDocs` 23 (probe S01); anon `GET /api/orders?limit=2` → **403** `{"errors":[…]}`, i.e. the access rule really denies guests (probe 6.8). | None. |
| B2 | `web/src/app/(app)/(account)/notifications/page.tsx:41` and `:70` | `notifications.find` (inbox page + unread count) | `overrideAccess:false, user`, `where:{recipient:{equals:user.id}}` (:41) and `where:{and:[{recipient},{readAt:{exists:false}}]}` (:70); page renders `docs` and `totalDocs`. | `notificationReadAccess` (`web/src/collections/Notifications/access.ts:25-33`): anon `false`; every principal (admin included) is narrowed to `{recipient:{equals:user.id}}`. | MATCHES | `curl -b buyer.jar '/api/notifications?limit=1&depth=0'` → 200 `docs` PRESENT (first `{"id":112,"recipient":9,"type":"ORDER_SUCCESS",…}`), `totalDocs` 3 (probe S02) — and every row is addressed to user 9, which is the rule working. | None. |
| B3 | `web/src/app/(app)/(account)/orders/[id]/page.tsx:40` | `orders.findByID` (order detail) | `user, overrideAccess:false`; the page treats a throw/null as `notFound()` (:47-49), so the whole page is behind "this order is mine". | `orderReadAccess` as B1; a foreign order throws rather than returning the row. | MATCHES | `curl -b buyer.jar /api/orders/227?depth=2` → 200 `{id:227,code:"ORD-20260826-950E63",items:{docs:[…]},…}` (probe S03). The negative side is the same rule measured at B1 (anon 403). | None. |
| B4 | `web/src/app/(app)/(account)/orders/[id]/page.tsx:52` | `order_items.find` (line items of that order) | `where:{order:{equals:orderId}}, depth:2, overrideAccess:true` — i.e. the collection's rule is deliberately bypassed. | `orderItemReadAccess` (`web/src/access/orderAccess.ts:41-64`): anon `false`; admin/financeAdmin `true`; otherwise `{or:[{seller equals user.id},{'order.buyer' equals user.id}]}`. | MATCHES *(by reachability, not by rule)* | `curl -b buyer.jar -g '/api/order_items?where[order][equals]=227&depth=2&limit=100'` → 200 `docs` PRESENT, and the same REST path under the collection's own rule returns buyer-visible rows (`{"id":227,"order":227,"product":49,"seller":7,…}`, probe S04). The bypass is only reachable after B3 succeeded for this user, so it cannot widen what a visitor sees; it is nonetheless a bypass whose safety rests on line :40. | Optional hardening, not a defect: pass `user` with `overrideAccess:false` so the collection's own rule (`'order.buyer' equals user.id`) proves the same thing without depending on the preceding read. |
| B5 | `web/src/app/(app)/(account)/orders/[id]/page.tsx:66` | `tickets.find` (that order's dispute tickets) | `where:{order:{equals:orderId}}, sort:'-createdAt', depth:2, overrideAccess:true`. | `ticketReadAccess` (`web/src/access/ticketAccess.ts:11-34`): admin/moderator/financeAdmin `true`; otherwise `{or:[{user equals},{seller equals}]}`. | MATCHES *(by reachability, not by rule)* | `curl -b buyer.jar -g '/api/tickets?where[order][equals]=227&depth=1&limit=100'` → 200 with `docs` PRESENT (`{"id":1,"code":"TCK-20260921-4A247F","user":{…}}`, probe S05). Same reasoning as B4: gated by the order read at :40. | Optional hardening: add `user` + `overrideAccess:false` (the rule already returns the author's own tickets). |
| B6 | `web/src/app/(app)/(account)/orders/page.tsx:24` | `orders.find` (order list) | `limit:100, user, overrideAccess:false, where:{buyer:{equals:user.id}}, sort:'-createdAt', depth:2`. | `orderReadAccess` as B1. | MATCHES | Same measurement as B1 (`where[buyer][equals]=9` → 200, 23 docs); the page's own `where` is the same filter the access function contributes. | None. |
| B7 | `web/src/app/(app)/[slug]/page.tsx:17` | `pages.find` (route enumeration for `generateStaticParams`) | `draft:false, limit:1000, overrideAccess:false, pagination:false, select:{slug:true}`, no `where`. | `adminOrPublishedStatus` (`web/src/plugins/index.ts:24` → `web/src/access/adminOrPublishedStatus.ts`): guests/buyers are narrowed to `{_status:{equals:'published'}}`. | MATCHES | `curl '/api/pages?limit=5&depth=0&select[slug]=true'` → 200 `{"docs":[{"id":1,"slug":"home"}],"totalDocs":1,…}` (probe, published-only). The query carries no `where`, so the access rule is what produces the filter — and it is applied because `overrideAccess:false`. | None. |
| B8 | `web/src/app/(app)/[slug]/page.tsx:87` | `pages.find` (the page body) | `draft, limit:1, overrideAccess:draft, pagination:false, where:{and:[{slug},{...(draft?[]:[{_status:{equals:'published'}}])}]}` — the same flag drives both the override and the explicit filter. | `adminOrPublishedStatus`; with `draft:false` the access rule and the explicit `_status` filter agree; with `draft:true` (Next draft mode only) the override is intentional preview behaviour. | MATCHES | Source parity: the query's `_status` filter (:87-105) is the same predicate `adminOrPublishedStatus` returns for a guest, so the two sides cannot disagree; the positive/negative 200 behaviour is the measurement recorded for B7/C23 (`totalDocs` 1 for `select[slug]`, and `where[slug][equals]=chinh-sach-hoan-tien` → 200 with `docs: []` because that slug is a route, not a CMS page). | None. |
| B9 | `web/src/app/(app)/finance/page.tsx:32` | `withdrawals.find` (admin console list) | `sort:'-requestedAt', limit:100, overrideAccess:true, depth:1`; the page gates on `checkRole(['admin','financeAdmin'])` and redirects otherwise (:24-29). | `withdrawalReadAccess` (`web/src/access/withdrawalAccess.ts:32-46`): anon `false`; admin/financeAdmin `true`; else `{seller:{equals:user.id}}`. | MATCHES *(the page, not the collection, is the guard)* | `curl -b finance.jar '/api/withdrawals?limit=100&depth=2'` → 200 with `docs` PRESENT (8 rows, first `{"id":8,"code":"WTH-20260910-7B0B27B9","seller":18,…}`), `totalDocs` 8 (probe S06). The role guard that makes the override safe was measured by the sibling route: `GET /api/v1/admin/withdrawals` with a buyer cookie → 403 `{error,message}` (probe 4.11). | None. |
| B10 | `web/src/app/(app)/finance/page.tsx:56` | `refunds.find` | `sort:'-createdAt', limit:100, overrideAccess:true, depth:1`, behind the same `checkRole(['admin','financeAdmin'])` gate. | `refundReadAccess` (`web/src/access/refundAccess.ts:11-34`): admin/financeAdmin `true`; else `{or:[{buyer equals},{seller equals}]}`. | MATCHES | `curl -b finance.jar '/api/refunds?limit=100&depth=2'` → 200 `docs` PRESENT (first `{"id":16,"code":"REF-20260909-D492DD","order":{"id":240,…}}`, probe S07); the console's own route answers 403 to a seller cookie (probe 4.12). | None. |
| B11 | `web/src/app/(app)/finance/page.tsx:85` | `orders.find` (refund-window context) | `sort:'-createdAt', limit:100, overrideAccess:true, depth:0`, behind the same role gate; used only to evaluate `evaluateRefundWindow` locally so the operator can see the Decision 0012 §6 window. | `orderReadAccess` (admin/financeAdmin `true`). | MATCHES | `curl -b finance.jar '/api/orders?limit=100&depth=1'` → 200 `docs` PRESENT (first `{"id":349,"code":"ORD-20260921-1A0888","buyer":9,…}`, probe S08); the same fetch under a buyer session is narrowed to their own rows (B1). | None. |
| B12 | `web/src/app/(app)/moderation/page.tsx:23` | `products.find` (moderation queue) | `where:{moderationStatus:{in:['submitted','in_review']}}, overrideAccess:true, sort:'createdAt', limit:100, depth:2`, behind `checkRole(['admin','moderator'])` (:18-20). | `adminSellerModeratorOrPublished` (`web/src/access/adminSellerModeratorOrPublished.ts:12-22`): admin/moderator `true`; everyone else `{_status:{equals:'published'}}`. | MATCHES | REST equivalent with the page's own filter: `curl -b moderator.jar -g '/api/products?where[moderationStatus][in][0]=submitted&where[moderationStatus][in][1]=in_review&limit=2&depth=0&sort=createdAt'` → **200** with `docs` PRESENT (`{"id":20,"title":"Bản vẽ thiết kế biệt thự song lập…"}`). (`pending_review` is not a member of that enum: the same query with it answers 500 — the page uses the two valid values.) | None. |
| B13 | `web/src/app/(app)/page.tsx:145`, `:154`, `:163` | `products.find` ×3 (home: newest, best sellers, new arrivals) | `depth:1, draft:false, overrideAccess:false, where: storefrontVisibilityWhere()` (`cleanFilter`, :141), sorts `-createdAt` / `-price` / `-createdAt`, limits 5/8/8. | `adminSellerModeratorOrPublished` for a guest ⇒ `{_status:'published'}`; `draft:false` keeps the draft filter, and the page filter is ANDed on top. | MATCHES | `curl '/api/products?limit=3&depth=1&where[_status][equals]=published'` → 200 `docs` PRESENT, first `{"id":159,"title":"Bản vẽ cảnh quan…"}` (probe S10). The two predicates are ANDed, so a draft can never surface. | None. |
| B14 | `web/src/app/(app)/products/[slug]/page.tsx:442` | `products.find` (product detail) | `depth:3, draft:isDraftPreview, limit:1, overrideAccess:isDraftPreview, pagination:false, where: storefrontProductWhere({slug},{draftMode:isDraftPreview})`. | `adminSellerModeratorOrPublished`; with `overrideAccess:isDraftPreview === false` the rule contributes `_status:'published'`, and the page's own `storefrontProductWhere` adds the same visibility predicate. | MATCHES | `curl '/api/products?where[slug][equals]=san-pham-159-ban-ve-canh-quan-san-vuon&limit=1&depth=0'` → 200 `docs` PRESENT with the expected row (probe S11). | None. |
| B15 | `web/src/app/(app)/seller/page.tsx:44` | `seller_profiles.find` (seller dashboard profile) | `where:{user:{equals:user.id}}, overrideAccess:true, limit:1`, behind `checkRole(['seller','admin'])` (:29-31). | `sellerProfileReadAccess` (`web/src/access/sellerProfileAccess.ts:10-39`): admin/moderator `true`; an authenticated user gets `{or:[{status:'active'},{user equals user.id}]}`; guests get `{status:'active'}`. | MATCHES | `curl -b seller.jar -g '/api/seller_profiles?where[user][equals]=4&limit=1&depth=1'` → 200 `docs` PRESENT (`{"id":1,"user":{"id":4,…},"displayName":"KTS ArcStudio Việt Nam",…}`, probe S12). Note the rule already covers "own profile even if not active", so the override does not change the answer here. | None. |
| B16 | `web/src/app/(app)/seller/page.tsx:51` | `withdrawals.find` (seller's own) | `where:{seller:{equals:user.id}}, sort:'-createdAt', limit:50, overrideAccess:true`, behind the same role gate. | `withdrawalReadAccess` as B9 (seller ⇒ own rows). | MATCHES | `curl -b seller.jar -g '/api/withdrawals?where[seller][equals]=4&limit=100&depth=1'` → 200 `docs` PRESENT (first `{"id":1,"code":"WTH-20260715-056800AD","seller":{…}}`, probe S13); a buyer cookie on the API route → 403 (probe 3.13). | None. |
| B17 | `web/src/app/(app)/seller/page.tsx:58` | `seller_earnings.find` | `where:{seller:{equals:user.id}}, limit:1000, overrideAccess:true, depth:1`. | `sellerEarningsReadAccess` (`web/src/access/sellerEarningsAccess.ts:10-24`): admin/financeAdmin `true`; else `{seller:{equals:user.id}}`. | MATCHES | `curl -b seller.jar -g '/api/seller_earnings?where[seller][equals]=4&limit=100&depth=1'` → 200 `docs` PRESENT (`{"id":144,"seller":{…},…}`, probe S14). | None. |
| B18 | `web/src/app/(app)/seller/page.tsx:65` | `products.find` (seller's catalogue) | `where:{seller:{equals:user.id}}, overrideAccess:true, sort:'-createdAt', limit:100`. | `adminSellerModeratorOrPublished`: a `seller` role gets `true`, so the page's own `where` is the only filter. | MATCHES | `curl -b seller.jar -g '/api/products?where[seller][equals]=4&limit=100&depth=1'` → 200 `docs` PRESENT (first `{"id":157,…}`, probe S15). | None. |
| B19 | `web/src/app/(app)/seller/page.tsx:72`, `:73`, `:74` | `categories.find` / `software_types.find` / `tags.find` | `limit:100, pagination:false, overrideAccess:true`, no `where`; used to populate the product-editor selects. | `publicAccess` on all three (`web/src/collections/Categories.ts:23`, `SoftwareTypes.ts:16`, `Tags.ts:17`). | MATCHES | `curl -b seller.jar '/api/categories?limit=100&pagination=false&depth=0'` → 200 `docs` PRESENT (`{"id":8,"title":"Bản vẽ Cảnh quan & Sân vườn","slug":"ban-ve-…"}`, probe S16); the same reads are public, so the override changes nothing (probes S18/S19/S20 as anon). | None. |
| B20 | `web/src/app/(app)/seller/register/page.tsx:24` | `seller_profiles.find` (has this user already registered?) | `where:{user:{equals:user.id}}, overrideAccess:true, limit:1`; the page redirects when a profile already exists. | `sellerProfileReadAccess` (own profile always visible to the owner). | MATCHES | `curl -b buyer.jar -g '/api/seller_profiles?where[user][equals]=9&limit=1'` → 200 `docs: []` (correct: buyer01 has no profile), probe S17. | None. |
| B21 | `web/src/app/(app)/shop/page.tsx:35` | `categories.find` (category filter landing) | `where:{slug}` or `{or:[{id},{slug}]}` when numeric, `limit:1, overrideAccess:true, select:{title,slug,description}`; the helper returns `id,title,slug,description`. | `publicAccess` read; the `select` includes every field the helper returns. | MATCHES | `curl '/api/categories?limit=100&depth=1'` → 200 with `docs` PRESENT and rows carrying `title`, `slug`, `description` (probes S18, S26). | None. |
| B22 | `web/src/app/(app)/shop/page.tsx:60` | `software_types.find` | `where:{slug}` / `{or:[{id},{slug}]}`, `limit:1, overrideAccess:true, select:{title,slug}`; helper returns `id,title,slug`. | `publicAccess`; `select` covers exactly the three returned fields. | MATCHES | `curl '/api/software_types?limit=100&depth=1'` → 200 `docs` PRESENT (`{"id":8,"title":"PDF / Vector","slug":"pdf-vector",…}`, probes S19, S27). | None. |
| B23 | `web/src/app/(app)/shop/page.tsx:319`, `:328`, `:337` | `categories`/`software_types`/`tags`.find (keyword search → slug redirects) | `where:{or:[{title:{like:rawSearch}},{slug:{like:rawSearch}}]}, limit:50, overrideAccess:true, select:{slug:true}`; only `slug` is consumed. | `publicAccess` on all three; `like` is a supported Payload operator. | MATCHES | `curl '/api/categories?limit=100&depth=1'` → 200 (probe S18) confirms the collections and the `slug` field; the `like` operator is exercised by the working `/shop?q=` path in the browser load (the page rendered its category menus). | None. |
| B24 | `web/src/app/(app)/shop/page.tsx:376` | `products.find` (shop grid) | `draft:false, overrideAccess:false, page, limit, sort, select:{title,slug,gallery,previewGallery,categories,software_types,tags,price,isFree,seller,technicalSpecs,createdAt}, where:{and:andConditions}`. | `adminSellerModeratorOrPublished` for a guest ⇒ `_status:'published'`, ANDed with the facet conditions built at :280-315; every field the card renders is in the `select`. | MATCHES | `curl '/api/products?limit=12&depth=1&where[_status][equals]=published'` → 200 with `docs` PRESENT and `totalDocs` 140 (probe S21). | None. |
| B25 | `web/src/app/(app)/sitemap.ts:58` | `products.find` (sitemap entries) | `draft:false, overrideAccess:false, limit:1000, pagination:false, where:{_status:{equals:'published'}}, select:{slug,updatedAt,_status}`. | `adminSellerModeratorOrPublished` ⇒ the same `_status` predicate. | MATCHES | `curl '/api/products?limit=1000&depth=0'` → 200 `docs` PRESENT (probe S22); the access rule and the explicit filter are the same predicate, so they cannot disagree. | None. |
| B26 | `web/src/app/(app)/sitemap.ts:86` | `categories.find` | `limit:1000, pagination:false, where:{or:[{status:{equals:'active'}},{status:{exists:false}}]}, select:{slug,updatedAt,status}`. | `publicAccess`; `status` is a real field on `categories` (`web/src/collections/Categories.ts:83`), so `exists:false` is meaningful. | MATCHES | `curl -g '/api/categories?where[or][0][status][equals]=active&where[or][1][status][exists]=false&limit=2&depth=0&select[slug]=true'` → **200** with `{"docs":[{"id":8,"slug":"ban-ve-canh-quan-san-vuon"},{"id":7,"slug":"thiet-ke-noi-that"}],"totalDocs":8,…}` — both `or` branches are accepted and the `select` returns the requested fields. | None. |
| B27 | `web/src/app/(app)/sitemap.ts:113` | `software_types.find` | `limit:1000, pagination:false, select:{slug,updatedAt}`. | `publicAccess`. | MATCHES | `curl '/api/software_types?limit=3&depth=1'` → 200 `docs` PRESENT with `slug`/`updatedAt` (probe S19). | None. |
| B28 | `web/src/app/(app)/sitemap.ts:135` | `pages.find` | `draft:false, overrideAccess:false, limit:1000, pagination:false, where:{and:[{slug:{not_equals:'home'}},{_status:{equals:'published'}}]}, select:{slug,updatedAt,_status}`. | `adminOrPublishedStatus` for a guest ⇒ `{_status:'published'}`, ANDed with the explicit filter. | MATCHES | `curl '/api/pages?limit=5&depth=0&select[slug]=true'` → 200 `{"docs":[{"id":1,"slug":"home"}],"totalDocs":1}` — the published-only rule is what limits the result, and `home` is the page the query excludes. | None. |
| B29 | `web/src/app/(app)/wallet/page.tsx:29` and `:32` | `wallets` via `getOrCreateWallet`, then `wallet_ledger.find` | Page redirects anonymous visitors first (:22-26), then `getOrCreateWallet(payload,{userId})` (`web/src/services/wallet.ts:81-98`: find + create with `overrideAccess:true`) and `wallet_ledger.find({where:{user:{equals:user.id}}, sort:'-createdAt', limit:50, overrideAccess:true})`; the page then maps exactly the fields `WalletClient` (A7/A8) expects. | `walletReadAccess` / `walletLedgerReadAccess` (`web/src/access/financialAccess.ts:10-46`) both narrow a non-admin to `{user:{equals:user.id}}`; `wallets.create` is `canEditMoney`, which is why the service creates with `overrideAccess:true`. | MATCHES | `curl -b buyer.jar -g '/api/wallet_ledger?where[user][equals]=9&limit=50&depth=0'` → 200 `docs` PRESENT (`{"id":243,"wallet":16,"user":9,"type":"purchase",…}`, probe S24); `curl -b buyer.jar '/api/wallets?limit=2&depth=0'` → 200 (probe 6.11) while the anonymous call → **403** (probe 6.10), matching `walletReadAccess`. | None. |
| B30 | `web/src/components/forms/FindOrderForm/sendOrderAccessEmail.ts:24` | `orders.find` from a **guest** server action (the `/find-order` "email me my order link" control) | `payload.find({collection:'orders', where:{and:[{id:{equals:orderID}},{customerEmail:{equals:email}}]}, limit:1, depth:0})` — no `user`, no `overrideAccess`. The action then reads `orders[0]` and, when it has an `accessToken`, sends the email (:33-57); when `orders[0]` is undefined it returns `{success:true}` **without sending** (:35-37), and the form shows success (`FindOrderForm/index.tsx:48-52`). | `orderReadAccess` (`web/src/access/orderAccess.ts:10-24`) returns `false` for an unauthenticated request, so this local-API read is denied: `docs` is always empty for a guest. | **UI_WRONG** | Two sides, measured and cited: (1) the call site has no `overrideAccess` while it is reached from `web/src/app/(app)/find-order/page.tsx:10-19`, a public page that renders `FindOrderForm` for anonymous visitors (no redirect); (2) `curl` with an empty cookie jar `-g '/api/orders?where[accessToken][equals]=probe&limit=1&depth=0'` → **403** `{"errors":[…]}` and `-g '/api/orders?limit=2&depth=0'` → 403 (probes S25, 6.8) — the same access function governs the local API. Consequence: `orders[0]` is always `undefined`, so the action hits :35 and returns `{success:true}` at :36 without ever calling `payload.sendEmail`, and the user waits for an email that is never sent. Corroborating coverage gap: the only test that touches this surface (`web/tests/e2e/frontend.e2e.spec.ts:315-328`) submits `orderID=999999` with a non-existent email and asserts the anti-enumeration "Check your email" heading — it exercises the *miss* branch only, so this defect is invisible to the suite. | One line: add `overrideAccess: true` to the `find` at :24 (the action already restricts the row by `id` **and** `customerEmail`, so it cannot read a row the requester does not already know the email for, and the anti-enumerating miss branch at :35-37 is unchanged). Alternatively return `{success:false, error:…}` instead of `{success:true}` when the row is not found, so the failure is at least visible; the fix above is the correct one because the row exists. |
| B31 | `web/src/components/layout/search/Categories.tsx:11` | `categories.find` (header nav) | `payload.find({collection:'categories', sort:'title'})` — no `user`, no `overrideAccess`, so the collection's own rule decides. | `publicAccess` read on `categories` (`web/src/collections/Categories.ts:23`). | MATCHES | `curl '/api/categories?limit=100&depth=1'` (anonymous) → 200 `docs` PRESENT (`{"id":8,"title":"Bản vẽ Cảnh quan & Sân vườn",…}`, probe S26). The rendered header nav in the browser load listed the same eight categories. | None. |
| B32 | `web/src/components/layout/search/SoftwareTypes.tsx:11` | `software_types.find` (header nav) | `payload.find({collection:'software_types', sort:'sortOrder'})` — no override. | `publicAccess` read (`web/src/collections/SoftwareTypes.ts:16`). | MATCHES | `curl '/api/software_types?limit=100&depth=1'` (anonymous) → 200 `docs` PRESENT (probe S27). | None. |
| B33 | `web/src/components/Header/index.tsx:9` and `web/src/components/Footer/index.tsx:7` via `web/src/utilities/getGlobals.ts:12` | `findGlobal` for the `header` and `footer` globals | `payload.findGlobal({slug, depth})` inside `unstable_cache`, with no `user` and no `overrideAccess` — the public nav must render for guests. | The `header`/`footer` globals' own read access (default public for these globals in this config). | MATCHES | `curl '/api/globals/header?depth=1'` → 200 with `navItems` PRESENT (probe S28); `curl '/api/globals/footer?depth=1'` → 200 with `navItems` PRESENT (probe S29). Both are anonymous, which is the contract the cached read assumes. | None. |
| B34 | `web/src/services/commission.ts:125` | `findGlobal('commission_settings')` (commission maths behind the seller payout figures) | `payload.findGlobal({slug:'commission_settings', overrideAccess:true, req})`. | The `commission_settings` global (`web/src/globals/CommissionSettings.ts:5`, `defaultRate`). | MATCHES | `curl '/api/globals/commission_settings?depth=0'` → 200 `{"id":1,"defaultRate":…,"globalType":"commission_settings"}` (probe S30). | None. |

### Verdict roll-up

| Verdict | Count | Rows |
|---|---|---|
| `MATCHES` | 72 | A2, A6-A8, A10-A44 (39), B1-B29, B31-B34 (33) |
| `UI_WRONG` | 2 | **A1** (checkout reads `balance` on a response that nests it under `wallet`), **B30** (guest order-access email fires an access-denied read and reports success) |
| `API_WRONG` | 1 | **A9** (`GET /api/v1/payments/{code}` serves any intent to an anonymous caller: no auth, no owner check) |
| `ENDPOINT_MISSING` | 2 | **A4** (Stripe initiate — out of scope, decision 0013), **A5** (`/api/carts` — schema-level follow-up increment) |
| `UI_UNWIRED` | 1 | **A3** (checkout's VietQR branch reports a recorded order and calls nothing) |

### The ten rows with the highest user impact, ordered

1. **A5 — the whole cart is a dead end** (`ENDPOINT_MISSING`). Every add-to-cart, quantity, remove,
   clear and the header badge call `/api/carts`, which 404s; `createCart` throws on the first
   add. Checkout's item loop (`CheckoutPage.tsx:108-176`) iterates `cart.items`, so the buyer cannot
   reach a payable cart at all. Needs its own increment because the fix is schema-level.
2. **A1 — checkout always says the wallet is empty** (`UI_WRONG`). `wallet?.balance` is read off the
   envelope instead of `wallet.wallet.balance`, so `isWalletSufficient` is permanently false and the
   "pay with wallet" button is unusable even with funds. One-line fix, highest impact per character.
3. **B30 — "email me my order link" silently sends nothing** (`UI_WRONG`). The guest server action
   read is denied by `orderReadAccess` and the action reports success, so the buyer is told to check an
   inbox that will never receive the mail; the same access rule keeps the guest out of the linked order
   page. One-line fix.
4. **A3 — checkout's VietQR branch confirms an order that does not exist** (`UI_UNWIRED`). The user is
   told "Đơn hàng đã được ghi nhận", the cart is cleared and they land on `/orders` with nothing there
   — a lost sale and a false record of it.
5. **A9x — any anonymous caller can read a payment intent by code** (`API_WRONG`). `codes` are handed
   to the user as the bank-transfer reference; the endpoint returns amount, status and bank details
   with no session and no ownership check, while every sibling `/api/v1/me/**` route answers 401.
6. **A2 + A13 — the wallet purchase path** (`MATCHES`, but it is the money path the two rows above sit
   in front of). Its contract is correct and curl-verified end to end (200 `{success,orderId,…}`,
   409 `ALREADY_OWNED`, 400 `INSUFFICIENT_FUNDS` with `required`/`balance`), so once A1/A3/A5 are
   resolved this is the rail the buyer can actually use.
7. **A6 + A8 — top-up and ledger** (`MATCHES`). Wallet top-up (intent with QR payload, min-amount
   validation) and the ledger table are correct; the ledger is the only place a buyer can audit money,
   so its correctness matters as much as the write path.
8. **A10-A13 — download entitlement and token** (`MATCHES`). Three of the four calls decide whether a
   paying buyer can actually get the file (free-asset self-grant, 401→login modal, 403 for unowned
   products); all verified against the live route.
9. **A19 + A21 + A23 — after-sales surfaces** (`MATCHES`). Submit/edit review (BR-05 gate, 409
   duplicate), open a dispute ticket and close it are the buyer's only recourse when a file is wrong;
   the enums and status codes on both sides line up.
10. **A26-A32 — the operator console** (`MATCHES`). Review/approve/reject/process/finalize plus refund
    execution and its list are the paths that move seller money; their error contracts are
    curl-verified, and their 200 bodies carry `{success,data}` which the UI never reads (it branches on
    `res.ok` only), so the remaining risk is state-machine, not contract.

### API-side observations (no UI row, recorded so the sweep is not silent)

- `post /api/seller/upload-file` and `/api/seller/upload-preview` answer **500**
  (`{"error":"file.arrayBuffer is not a function"}`) when the `file` part is not a real `File`
  (`upload-file/route.ts:18-24`, `upload-preview/route.ts:18-25`): the `!file` guard passes for a plain
  string part and the `.arrayBuffer()` call then throws. A browser `FormData` always appends a `File`,
  so no UI row can reach it; a 400 would be the correct answer if it is ever hit from another client.
- The five `/api/v1/admin/withdrawals/{id}/**` actions answer **400 `{error:'BAD_REQUEST',message:'Not
  Found'}`** for an id that does not exist (probes C24-C28) rather than 404. The console renders
  `data.message`, so nothing breaks; 404 would be the more accurate code.
- `PATCH /api/users/{id}` with **no body** answers 500 `{"errors":[{"message":"Something went
  wrong."}]}` (measured). Both UI call sites (A41, A42) always send a JSON body, so this is only a
  robustness note on Payload's route, not a UI path.
- API routes with **no UI caller** in `web/src/{app,components}` (they are exercised only by tests or
  external callers, so they carry no inventory row): `GET /api/v1/me/orders`, `GET /api/v1/orders`,
  `POST /api/v1/purchases` (alias of the purchase handler),
  `GET /api/v1/tickets`, `GET /api/v1/seller/earnings`, `GET /api/v1/admin/withdrawals`,
  `GET /api/v1/products/[id]`, and `POST /api/v1/payments/webhook/sepay`. `/api/v1/me/orders` in
  particular duplicates the server-rendered order list (B6) and is worth either wiring or retiring in a
  later increment.

## Handoff to the storefront vertical (owner's rule: an API with no interface gets an interface)

The owner's instruction of 2026-09-20 was that an API which no interface uses should get one, built by
the storefront vertical, and that removing the card option is theirs too. This is that list, with the
recommendation the captain owes them rather than a mechanical mapping — three of these routes are
machine-facing or deliberately redundant, and adding a client-side list beside a server-rendered one
would be work with no user in it.

| Item | What it is | Recommendation |
|---|---|---|
| **A4, the card/Stripe option** in `CheckoutPage.tsx` | Its endpoints were removed by decision 0013; `t7` gives it an honest deterministic refusal (`POST /api/v1/payments/card/initiate` → 501) so it can no longer 404 | **Remove the option** (decision 0004 keeps card out of P0, and the `STRIPE_*` variables are placeholders). Do it **after** `t7` closes: the vertical and this increment must not hold `CheckoutPage.tsx` at the same time. Decision 0013's Follow-Up lists every file, including the three dependencies and the `stripe-webhooks` script |
| **The VietQR button label** `'Xác nhận đặt hàng với VietQR'` in `CheckoutPage.tsx` | After `t7` the branch no longer places an order: it creates a wallet top-up and hands the buyer to `/wallet?topup=<code>` to pay it, and the purchase happens afterwards through the wallet branch | Re-word it (copy belongs to the vertical): the button should say the buyer is taken to the payment step. One string, no logic — recorded here because it is the only copy the increment leaves over-promising |
| **The homepage's empty-catalogue fallback** `CLEAN_FALLBACK_PRODUCTS` in `web/src/app/(app)/page.tsx:23-130` | Eight invented products with invented prices (450.000, 320.000, 750.000, 1.200.000 …) used when the product query returns nothing. Their cards link to slugs like `san-pham-1-ho-so-thiet-ke-ban-ve-thi-cong-biet-thu-vuon-2-tang-hien-dai-12x15m`, which do not exist — so on an empty catalogue the homepage offers eight 404s | Product decision for the vertical and the owner: what should the homepage show when the catalogue is genuinely empty — an honest empty state, a "coming soon" section, or nothing at all. Showing invented products with dead links is the one option that cannot stay. Not in `t8`'s scope, which fixes the case the owner reported (real products showing masked values) |
| **Every curated fallback's slugs are dead links** — `CLEAN_FALLBACK_PRODUCTS` (`web/src/app/(app)/page.tsx`, 8 slugs), `CURATED_RECENT_ITEMS` (`RecentResources/index.tsx`, 5), `EDITORIAL_SLIDES` (`Hero/EditorialHero.tsx`, 3) | Measured in review round 1: **all 16 slugs are 0-row in `products`**, so every card rendered from a fallback links to a 404. Since `t8`/`t12` made the mapping product-first, these values only appear when the catalogue is genuinely empty — the rows above fix the case the owner reported (a real record showing masked values); this is the empty-catalogue case | Same product decision as the row above, extended to all three groups: when the catalogue is empty, show an honest empty state, seed real demo products, or render the fallback cards as non-links. What must not stay is a card that promises a product and opens nothing |
| `GET /api/v1/me/orders` | The buyer's own orders as JSON; the account area server-renders the same list (row B6) | **Wire or retire — an explicit choice, not silence.** Wiring it means a client-side order list (useful for paging/refresh without a full render); retiring it means deleting a route nothing calls. Leaving both is what produced this audit |
| `GET /api/v1/seller/earnings` | The seller's earnings as JSON; `(app)/seller/page.tsx` server-renders them | Keep as a machine interface unless the dashboard wants client-side paging; if it stays, say so in `PLAN.md` so the next audit does not re-open it |
| `GET /api/v1/admin/withdrawals` | The finance queue as JSON; `(app)/finance/page.tsx` server-renders it | Same as `seller/earnings` |
| `GET /api/v1/orders` | The ops-wide order list as JSON | Same; it has no UI at all today, so it is either an external interface or dead weight |
| `GET /api/v1/tickets` | Ticket list as JSON (the UI creates and reads single tickets) | Decide with the tickets screen: a list view would use it, otherwise retire |
| `GET /api/v1/products/[id]` | A single product as JSON | Useful for client-side widgets (quick view, compare) that do not exist yet; keep, and let the widget that needs it come with its own increment |
| `POST /api/v1/purchases` | An alias of the purchase handler | **Keep, no UI needed**: it exists for external callers; the UI uses `/api/v1/orders/purchase` |
| `POST /api/v1/payments/webhook/sepay` | SePay's server-to-server webhook | **No UI, ever**: provider-facing by design (decision 0004) |

Two robustness notes from the same section belong to no vertical and are recorded only so they are not
lost: a non-`File` part on the two seller upload routes now answers 400 (fixed in `t2`), and
`PATCH /api/users/{id}` with an empty body answers 500 on Payload's own route — both UI call sites
always send a body, so neither is reachable from the storefront today.

## Repair log (`engineer`, `t2`, 2026-09-21)

Every row of the Inventory is resolved here: **three repaired** (A9, A1, B30), **three reported** with
the task and the decision that own them (A5 → `t6`/decision 0014, A3 and A4 → `t7`), and the rest left
as measured — `MATCHES`, or with a 200 branch that is a money or state write and is therefore verified
by reading both sides instead of being curl-exercised (the list at the end of this section). Both sides
of every repaired row are cited by post-change `file:line`.

### Repaired

| Row | Was | After — UI side | After — API side | Evidence |
|---|---|---|---|---|
| **A1** | `setWallet(data)` (`CheckoutPage.tsx:87-88`) stored the envelope, so `wallet?.balance` at `:121` was always `undefined`, `isWalletSufficient` (`:122`) always false, and the wallet button answered "Số dư ví không đủ để thanh toán đơn hàng này!" even with funds. | `web/src/components/checkout/CheckoutPage.tsx:85-94`: the fetch stores `data.wallet` at `:91`; `wallet?.balance` / `wallet?.pendingBalance` at `:124-125` now read the level the route sends. | Unchanged: `web/src/app/api/v1/me/wallet/route.ts:7` ⇒ 200 `{success,wallet:{id,balance,pendingBalance,currency,status}}`; 401 `{error}`. | Sweep `A1`/`A7` → **200** with `wallet.balance` present. The shape this call site reads is now the shape its sibling `WalletClient` (`web/src/components/wallet/WalletClient.tsx:164-165`) has always read. |
| **A9** | `GET /api/v1/payments/{code}` went from `getPayload` straight to the lookup: no `payload.auth()`, no ownership check, so an anonymous jar read buyer01's intent (amount, status, bank details) while `/api/v1/me/wallet*` answered 401 to the same jar. | Unchanged and still satisfied: `web/src/components/wallet/WalletClient.tsx:184-197` is the owner polling its own code and only reads the body under `res.ok` (`:185`). | `web/src/app/api/v1/payments/[code]/route.ts:20-33`: authenticate at `:20-21`, 401 at `:23-26`, then scope a non-privileged caller to its own intents at `:30-33`. `web/src/services/payment.ts:426-438` honours `scopeUserId`, so a code the caller does not own resolves like an unknown code **and never reaches the lazy-expiry update** (`:452-465`). The rule is the collection's own `paymentIntentReadAccess` (`web/src/access/financialAccess.ts:54-68`): owner, or admin/financeAdmin. | curl on one intent code, four identities: **anon → 401** (was 200 carrying `amount`, `status`, `bankCode`, `accountNo`, `accountName`); owner → **200** (UI contract intact); seller01 and moderator01 → **404** with the identical body an unknown code answers, so codes stay unenumerable; finance → **200**, matching the collection rule. Sweep rows `A9` + four `A9+` probes. |
| **B30** | The guest server action read orders with no `user` and no `overrideAccess`; `orderReadAccess` denies a guest, `docs` stayed empty and the action returned `{success:true}` at `:35-37` without ever sending. | Unchanged: `web/src/components/forms/FindOrderForm/index.tsx:48-52` shows "Check your email" on `result.success` — the branch the miss path keeps returning. | `web/src/components/forms/FindOrderForm/sendOrderAccessEmail.ts:23-85`: `orderID` parsed and validated at `:25-27`, the requester's account resolved by email at `:34-45`, the order resolved by `id` **and** `buyer` with `overrideAccess:true` at `:47-60`, the link composed at `:69`, sent at `:82-86`. | In-process proof with the transport stubbed (sweep `B30`): buyer01 + its own order → **1 send** to `buyer01@kientaohub.vn` with link `http://localhost:3000/orders/349` and no dead `accessToken` param; unknown email, non-numeric id and another buyer's order → **0 sends** with `{success:true}`, so the anti-enumeration branch is intact. |

### The row's prescription for B30 was not the fix — measured

The B30 row prescribes adding `overrideAccess: true` to the `find` at `:24`. That alone does **not**
repair it on this tree: the same `find` also names `customerEmail`, and `orders` has no such column
(`web/src/collections/Orders/index.ts:39-155` — code, buyer, totalAmount, currency, status,
paymentSource, paidAt, notes, items, earnings). Payload rejects the path before touching access:

```
payload.find({ collection:'orders', where:{ and:[{id:{equals:227}},{customerEmail:{equals:'x@y.z'}}] } })
  → THREW: The following path cannot be queried: customerEmail      (identical with overrideAccess:true)
```

`orders.accessToken` does not exist either (`grep -rn accessToken web/src` finds it only in the two
template checkout components, which read it off a result object that never carries it), so the action's
`:35-37` miss branch was the *only* branch it could ever take. The fix therefore resolves the requester
through the ownership link this schema really has — `orders.buyer → users.email` — and both reads carry
`overrideAccess:true` because the form is public. No schema change was needed.

### Reported, not repaired

| Row | Verdict | Why it stays open | Owner |
|---|---|---|---|
| **A3** | `UI_UNWIRED` | `web/src/components/checkout/CheckoutPage.tsx:205-216` still announces "Đơn hàng đã được ghi nhận!", clears the cart and routes to `/orders` while calling nothing — the rail itself is a product decision (which money path backs the QR) and `CheckoutPage.tsx` must not be edited by two sides at once. | `t7`: the branch will create a real top-up through `POST /api/v1/payments/topup` (decision 0004's SePay rail) and then pay with the wallet. |
| **A4** | `ENDPOINT_MISSING` | `POST /api/payments/stripe/initiate` → **404** re-measured in this run's follow-up section; decision 0013 keeps the Stripe dead end with the storefront vertical, and removing the card *option* is a design change the owner assigned to that vertical after this increment. | `t7`: the card rail answers a deterministic, honest refusal from an existing endpoint instead of a 404. |
| **A5** | `ENDPOINT_MISSING` | `GET /api/carts` → **404** re-measured; there is no `carts` collection (`carts:false`, decision 0013) and no table, so a route cannot be added without the schema change this increment excludes. | `t6` + decision 0014: the cart moves into the buyer's `sessionStorage` as a drop-in for the plugin's `useCart` surface — still no collection, no table, no migration. |

### Repaired outside the table: the two upload guards (plan's API-side observations)

Both routes answered **500** `{"error":"file.arrayBuffer is not a function"}` when the `file` part was
a plain string (the `!file` guard passes for a string and `.arrayBuffer()` then throws). The guard now
requires a blob-like part and answers its own **400**:
`web/src/app/api/seller/upload-file/route.ts:20-22` and
`web/src/app/api/seller/upload-preview/route.ts:20-22`. Sweep rows `A37+`/`A38+` send exactly that
shape and record **400**. A browser `FormData` always appends a `File`, so no UI row's 201 path changes.

### One authorized line in a file this increment does not own

`eslint .` on the shared tree was red with exactly one error, and it was **not** in an inventory row:
`web/src/app/(app)/seller/SellerDashboardClient.tsx:198:9 — react-hooks/set-state-in-effect`
(`setCreateProductModalOpen(true)` called synchronously inside the mount effect at `:190-201`). The
file is new and untracked work of the UI vertical, so it was reported to the captain rather than
touched; the captain authorized a single mechanical line (the vertical's own `queueMicrotask` pattern
from `CheckoutPage.tsx:84`) and amended `t2`'s contract with that exception. The change is that one
statement (`:198-200`); nothing else in the file was reformatted or altered. This file is not part of
the increment's scope, only of its gate evidence: `eslint .` went from `1 error` to `0 errors`.

### Rows whose 200 branch is a money or state write (two-sided verification, not curl)

A26-A31, A35 and A36 (withdrawals review/approve/reject/process/finalize, refund execution, the
withdrawal request and its cancel) were measured by `t1` only on their error branch, because a 200
moves money. This increment re-verified them by reading both sides and, in the sweep, by sending the
UI's own method/URL/credentials with a body that the route's own validation rejects before any write:

- `A26`-`A30` → **400 `{error,message}`** (`/api/v1/admin/withdrawals/999999/**`); the console renders
  `data.message` (`FinanceOperations.tsx:120`, `:147`, `:184`, `:211`, `:235`), and a buyer's cookie is
  refused with **403** (`A26+`), which is the decision-0008 role gate the console's UI assumes.
- `A31` → **400** for `{}` (orderId required, `route.ts:46-104`); the UI reads no field of the 200 body,
  it branches on `res.ok` (`FinanceOperations.tsx:328`, `:339`), and the money path stays in
  `executeRefund` (decision 0002/0012).
- `A35` → **400** over the 50,000,000₫ cap and `A36` → **400** for an unknown id; both 200 branches are
  `{success,data}` (`route.ts:119-125`, `[id]/cancel/route.ts:53`) and the UI reads neither.

### The sweep

`web/tests/helpers/probe-ui-api-contracts.mts` (new) walks the Inventory: rows A1-A44 as the UI's own
HTTP requests with the identity the component runs as, rows B1-B34 through the REST equivalent of the
same collection (Payload serves both through the same access function), and B30 in-process with its
mail transport stubbed. It is **read-only**: no purchase, top-up, withdrawal, refund, comment, review,
ticket, report, product or media write. A write path is probed with the UI's own method/URL/headers and
a body the route's validation rejects first, or with an unimplemented method (answered 405), and a row
with no read-only probe at all is printed with its reason rather than dropped. A response fails the row
when it is a 5xx, a **route-missing** 404 (Payload's `Route not found` body is checked before the
expected-status list, so it can never pass as a documented 404), an unexpected status, an unhandled
401/403, or an undeclared resource 404. Two disclosures: `A42` re-applies buyer01's *current* password
with the UI's own body (no credential change — the run re-logs-in at the end and prints the result), and
a row whose fixture the database does not hold (`A17`, `A19+`, `A22`, `A23` — `t5` removed the probe's
ticket/comment/review residue) is exercised on its **documented not-found branch** instead, which is
what proves the path is mounted and answers its own error shape.

Result on the shared tree at `5dbcc24` + this increment's changes, dev server on `:3000`:

```
=== 87 probes reached their expected branch, 0 failed,
    7 exercised the row's documented not-found branch (A9+, A9+, A17, A19+, A22, A23, A24);
    0 rows skipped with a reason; A3/A4/A5 reported as follow-ups ===
```

The run also carries a **negative control** — it requests a route that does not exist and passes only
when the missing-route detector fires (`[ ok ] CTRL 404 GET /api/v1/khong-ton-tai → route missing (404
from Payload's catch-all)`), so "0 failures" cannot come from a detector that never fails.

## Displayed data that is not derived from the record it describes (invented-data inventory)

Owner report of 2026-09-21, after `t8` closed the homepage defect: *"còn nhiều cái truyền dữ liệu
bịp"*. This subsection is that audit — complete and evidence-backed, **not fixed**. It is the
companion of the Inventory above: the Inventory asks "does this call reach the API it assumes?", this
one asks "does the value a visitor reads come from the record it describes?".

### The class, precisely

A display site belongs to this class when the value it renders is **not derivable from the record the
site is about** — the product, seller, review, order or account the visitor is looking at. Five
verdicts, used consistently below:

- **FABRICATED** — the value exists nowhere in the database. It is a constant in a component, or a
  formula over something unrelated (the product id is the worst offender: `1000 + (id*137 % 900)`
  renders as "lượt tải").
- **INDEX_MASKED** — the component links to real record A but renders record B's values, or discards
  A's own value in favour of a curated/constant one. This is the `RecentResources` defect class from
  `t8`, and it is the most dangerous kind because every individual field looks plausible.
- **FALLBACK_INVENTED** — real data exists in the record but is empty/null, and the code substitutes an
  invented value instead of an empty state. The honest render is nothing.
- **REAL** — checked against the running page *and* the database and found genuinely derived. Rows are
  kept so the sweep is not silent about what is honest, and so a future regression is visible.
- **UNVERIFIABLE** — the derivation is real but no record exists to exercise it (D48: relative comment
  dates while the `comments` table has no rows). It is **not** a pass: the row stays on the
  carried-unproven list, and review round 3's P1 caught the roll-up using this fifth class while this
  header still said four.

A row is never closed with "keep the invented value": where the value is computable the fix is to
compute it, where nothing real exists the fix is to omit the element.

### How this was measured

Every rendered value below was read from the **running application** at `http://localhost:3000` (the
same tree as this working copy) — HTML fetched with `curl` and reduced to visible text lines, so the
value quoted is the value on the page, not the literal in the source. Every "real" side was read from
the **development database** with
`docker exec kientaohub-postgres psql -U payload -d kientaohub` (row counts, per-product sums, the
`technical_specs_*` columns, `products_rels`). Source `file:line` is cited only to locate the defect,
never as its proof. Sessions used: seeded `buyer01`, `seller01`, `finance@`, `moderator@` (as in
"Probe residue" above); the public pages were read anonymously.

Two database facts bound almost every social-proof row, and they are the single most useful thing in
this subsection:

| Measured on the development database | Value |
|---|---|
| `select count(*) from reviews` | **0** |
| `select avg(rating) from reviews` | **0** (no rows) |
| `select count(*) from download_events` | **0** |
| `select count(*) from products` / `where _status='published'` | 165 / **140** |
| `select count(*) from users` | 59 |
| `select count(*) from categories` (published products each) | 8 (17-18 each) |
| `select default_rate from commission_settings` | **0.30** (⇒ sellers keep 70%, not 80%) |
| `select count(*) from reviews` for the audited product 159 | 0 |
| `select count(*) from download_events` for product 159 | 0 |
| `select count(*) from comments` for product 159 | 0 |

There is no loyalty/points storage anywhere in the schema (`select table_name from
information_schema.columns where column_name ilike '%point%' or ilike '%reward%'` → only
`pg_stat_bgwriter`), and no `experience`/`drawing count`/`compatibility` field on `products` — the
`technical_specs_*` columns are exactly four: `file_format`, `software_version`, `file_size`, `unit`.

### Rows — homepage `/`

| # | Display site (file:line) | Rendered value (measured on `/`) | Real source / database truth | Verdict | Smallest fix |
|---|---|---|---|---|---|
| D1 | `web/src/components/CategoryTabs/index.tsx:92,100,107,115,122,129,136,143` → rendered at `:212`, section at `web/src/app/(app)/page.tsx:221` | "Danh Mục Tài Nguyên" tiles: **2.500+** hồ sơ (Bản vẽ kiến trúc), **1.800+** (kết cấu), **1.200+** (Cơ điện MEP), **2.600+** (Mô hình BIM Revit), **1.400+** (Nội thất), **900+** (Thiết kế 3D), **600+** (Hồ sơ quy hoạch), **300+** (Tất cả danh mục); sr-only 850+/340+ | `categories` × `products_rels` (`path='categories'`) joined to published products: **18, 17, 17, 18, 17, 17, 18** published each; 140 published in total. The tiles overstate by ~100× | **FABRICATED** (counts) + drifted hardcoded labels ("Thiết kế 3D" for the DB's "Thư viện SketchUp & 3ds Max") | Compute: one grouped `count(*)` over `products_rels` for the 8 real categories (the same shape `/shop` already runs for its facets). The array must stop carrying counts and labels; if the design needs 9 tiles, the 9th is "all" (`140`) |
| D2 | `web/src/components/Hero/EditorialHero.tsx:44` and `:186` | "Hàng nghìn tài nguyên BIM, CAD, bản vẽ thiết kế, mô hình 3D được kiểm duyệt" | 140 published products / 165 total | **FABRICATED** (unsupported by ~7×; "hàng nghìn" = thousands) | Compute (`{totalDocs}` from the same products query the hero already fetches) or drop the quantity — copy change, needs the storefront vertical's wording |
| D3 | `web/src/components/ProductGridItem/index.tsx:32-155` (array) → `:196`, `:249-266` (merge) → rendered `:356-360`, `:368-378` | Bestseller card titles: "Hồ sơ thiết kế biệt thự hiện đại 2 tầng", "Bản vẽ kết cấu nhà phố 4 tầng", "Mô hình BIM MEP tòa nhà văn phòng", "Bộ 3D nội thất căn hộ chung cư", … | Each card links to a **real** product whose DB title differs: card 1 → `/products/san-pham-11-…` = *"Hồ sơ kiến trúc bệnh viện đa khoa tư nhân…"*; card 2 → product 70 = *"Mô hình BIM Revit bệnh viện 5 tầng…"*; card 3 → product 15 = *"Hồ sơ kiến trúc khu nghỉ dưỡng resort…"* | **INDEX_MASKED** | Use the product's own `title` (and `meta.description` for the subtitle); the curated array keeps no title |
| D4 | `ProductGridItem/index.tsx:273` (`displayPrice = curated.price`) → rendered `:383-390` | Card prices **1.200.000 ₫** (card 2), **1.800.000 ₫** (card 6) | The linked products' own pages render **1.450.000 ₫** (product 70, DB `price=1450000`) and **1.200.000 ₫** (product 106, DB `price=1200000`). 7 of the 8 card prices differ from the record's | **INDEX_MASKED** — and it contradicts the product page a click away, so it is a price-misrepresentation defect, not a cosmetic one | Delete `curated.price`; the card already receives the real `price` prop |
| D5 | `ProductGridItem/index.tsx:249-251` (`1000 + (Math.abs(numId*137) % 900)`) → rendered `:360` | "1268 / 982 / 764 / 642 / 525 / 412 / 357 / 298 lượt tải" | `download_events` = **0 rows in the whole database**; product 11 has 4 entitlements, 70 has 1, 15 has 1, 64 has 0 — none is a download count | **FABRICATED** (a formula over the id) | Compute from `download_events` (and show nothing when 0), or omit the "lượt tải" element until the event table has rows |
| D6 | `ProductGridItem/index.tsx:255-259` (curated `rating`/`reviews`) → rendered `:374-378` | "★ 4.9 (320)", "★ 4.8 (210)", "★ 4.8 (187)", "★ 4.7 (142)", "★ 4.8 (96)", "★ 4.9 (76)", "★ 4.7 (64)", "★ 4.8 (52)" | `reviews` = **0 rows in the whole database** | **FABRICATED** | Compute the average and count from `reviews` where `status='published'`; when the result is empty, omit the star block |
| D7 | `ProductGridItem/index.tsx:264-265` (`curated.author`, fallback `'KTS. Nguyễn Văn A'`) → rendered `:367-372` | Every bestseller card shows a "K"-initial avatar and a name: "KTS. Nguyễn Văn A", "KTS. Trần Thị B", "Kỹ sư Lê Văn C", "KTS. Phạm Thị D", "KTS. Hoàng Minh E", "KTS. Đặng Văn F", "KS. Lê Anh G", "KTS. Nguyễn Thị H" | The real sellers of those products are "Landscape Design Đà Nẵng" (8), "Quy Hoạch & Hạ Tầng Miền Trung" (7), "MEP Engineering Đồng Nai" (6), "Kết Cấu Thép Vững Bền Cần Thơ" (11); products 76 and 106 have no seller at all. None of the eight displayed names exists anywhere in the database | **FABRICATED** | Render `seller.display_name` from the record (the query already selects `seller`); when there is no seller, omit the attribution row |
| D8 | `ProductGridItem/index.tsx:203-224` (`curated.image`, else `CURATED_ARCHITECTURAL_THUMBNAILS[fallbackIndex % 8]`) → rendered as the card cover | The 8 bestseller cards show the 8 curated photos (`/media/curated/bestseller-1-villa.jpg` … `bestseller-8-townhouse.jpg`) as if they were those products' drawings | The linked products' own media are `kientaohub-preview-wm-*`/`kientaohub-gallery-*` (product 159 has 1 preview + 1 original file, 0 gallery rows) | **INDEX_MASKED** (visual) | Show the product's own cover; when it is a watermarked preview, say so instead of substituting a stranger's villa |
| D9 | `web/src/components/CreatorBanner/index.tsx:116` → rendered `/` line 200 and 209 | "**80%** Chia sẻ doanh thu" / "Tỷ lệ chia sẻ doanh thu" | `commission_settings.default_rate = 0.30` ⇒ the platform default pays sellers **70%**; the eight sampled `seller_earnings` rows pay 80/75/70/75/78/70/78/70% | **FABRICATED** as a platform-wide promise | Compute from `commission_settings.default_rate` (`(1-rate)*100`) or state "tới 80%" from the real ceiling — wording is the storefront vertical's call |
| D10 | `CreatorBanner/index.tsx:106` → rendered `/` line 198 | "Kết nối, chia sẻ và học hỏi cùng **hàng nghìn** thành viên" (and `/` line 20's "hàng nghìn tài nguyên", `EditorialHero.tsx:44`) | `users` = **59** rows | **FABRICATED** | Compute the member count or drop the quantity |
| D11 | `web/src/components/RecentResources/index.tsx:103-125` (product-first merge) → rendered `/` lines 213-235 | "Tài Nguyên Mới Cập Nhật": five cards showing `.dwg · 44.6 MB · 510.000 ₫`, `.dwg · 17.7 MB · 430.000 ₫`, `.skp · 38.9 MB · 0 ₫`, `.rvt · 58.6 MB`, `.dwg · 37.3 MB` and the products' own titles/images, with no star block | All five match the five newest published products in the database exactly (ids 159, 158, 157, 156, 155 — title, `technical_specs_file_format`, `technical_specs_file_size`, `price`, and the real `kientaohub-gallery-*.png` covers) | **REAL** (this is `t8`'s fix holding) | None. Keep it as the reference pattern for D3-D8 |
| D12 | `/shop` pagination, rendered `/shop` line 295 | "1-12 của 140 sản phẩm" | 140 published products | **REAL** | None |

### Rows — `/shop`

Page 1 renders 12 cards. All 12 were measured; the numbers below are the rendered ones.

| # | Display site (file:line) | Rendered value (measured on `/shop`) | Real source / database truth | Verdict | Smallest fix |
|---|---|---|---|---|---|
| D13 | `ProductGridItem/index.tsx:249-251` → rendered `:360` | `1183`, `1046`, `1809`, `1672`, `1535`, `1398`, `1261`, `1124`, `1887`, `1750`, `1613`, `1476` lượt tải | The formula `1000 + (id*137 % 900)` reproduces all twelve exactly for ids 159, 158, 157, 156, 155, 154, 153, 152, … ; `download_events` = 0 rows for every one of them and 0 in the whole table | **FABRICATED** | Compute from `download_events`; omit the element while it is 0 |
| D14 | `ProductGridItem/index.tsx:255-259` → rendered `:374-378` | `4.7 (269)`, `4.9 (228)`, `4.8 (187)`, `4.7 (146)`, `4.9 (105)`, `4.8 (64)`, `4.7 (323)`, `4.8 (282)`, `4.7 (241)`, `4.9 (200)`, `4.8 (159)`, `4.8 (118)` | `4.7 + (id%3)/10` and `50 + (id*41 % 300)` reproduce all twelve exactly; `reviews` = 0 rows | **FABRICATED** | Same as D6 |
| D15 | `ProductGridItem/index.jsx:264-266` (fallback `'KTS. Nguyễn Văn A'`) → rendered `:367-372` | **All 12 cards** show the same name "KTS. Nguyễn Văn A" and the same "K" avatar | The 12 products' real sellers are "Thiết Kế Nội Thất An Cường" (159), "BIM Structure Solutions Hà Nội" (158), "KTS ArcStudio Việt Nam" (157), … — twelve different sellers, none named Nguyễn Văn A. The fallback fires because `product.seller` is not populated as an object in this query | **FABRICATED** + **INDEX_MASKED** at once (one wrong name over every record) | Render the real seller; the query's `select` must populate it (`depth: 1`) or the page must join `seller_profiles` |
| D16 | `ProductGridItem/index.tsx:203-224` → card covers | **All 12 cards render the same photo**, `/media/curated/bestseller-1-villa.jpg` (measured: the page's only image URL) | The seeds' covers are `kientaohub-preview-wm-*.png` / `kientaohub-gallery-*.png`; `isCadPlaceholder` matches any URL containing `gallery`/`preview-wm`, and `fallbackIndex` never varies because `index` defaults to 0 in this render path, so `CURATED_ARCHITECTURAL_THUMBNAILS[0]` is used for every card | **INDEX_MASKED** (visual) — the shop looks like twelve copies of one product | Show the product's own cover (or a neutral per-product placeholder); never a shared curated photo |
| D17 | `ProductGridItem/index.tsx:273` (`curated ? curated.price : price`) — `/shop` passes no `isBestseller`, so the real price is shown | Prices 510.000 / 430.000 / 0 / 650.000 / 320.000 ₫ … | DB `price` for 159/158/157/156/155 = 510000/430000/0/650000/320000 | **REAL** | None (worth stating: the price bug in D4 is specific to the `isBestseller` path) |
| D18 | `web/src/components/product/*` — the card's spec line, rendered `:361` | `.dwg · 44.6 MB`, `.dwg · 17.7 MB`, `.skp · 38.9 MB`, `.rvt · 58.6 MB` … | DB `technical_specs_file_format` / `technical_specs_file_size` match exactly per product | **REAL** (the format/size half of the line; the download half is D13) | Split the line so the fabricated half cannot hide behind the real half |

### Rows — product detail `/products/san-pham-159-ban-ve-canh-quan-san-vuon`

Product 159: `title` "Bản vẽ cảnh quan khu lăng mộ gia tộc…", `price` 510000, `seller_id` 6 =
"Thiết Kế Nội Thất An Cường" (15 published products, `bio` "Thư viện 3ds Max, SketchUp nội thất phong
cách Bắc Âu, Indochine và hiện đại."), `technical_specs`: `.dwg` / `AutoCAD 2022+` / `44.6 MB`,
`meta_description` **NULL**, 0 reviews, 0 comments, 0 download_events, 1 preview + 1 original file.

| # | Display site (file:line) | Rendered value (measured on the page) | Real source / database truth | Verdict | Smallest fix |
|---|---|---|---|---|---|
| D19 | `web/src/components/product/ProductDescription.tsx:95-96` | Header line: "★ **4.8** (120 đánh giá)" | `reviews` for product 159 = 0; whole table = 0 | **FABRICATED** | Feed `summary.averageRating` / `summary.totalCount` from the reviews endpoint (the section below already fetches them) or omit |
| D20 | `ProductDescription.tsx:103` | "**2.450 lượt tải**" | `download_events` for product 159 = 0 | **FABRICATED** | Compute from `download_events`; omit while 0 |
| D21 | `ProductDescription.tsx:141` (`sellerObj?.name \|\| 'KTS. Nguyễn Văn A'`) and `SellerAttribution.tsx:14,50-52` | Visible seller "**KTS. Nguyễn Văn A**" + "Chuyên gia"/"Đã xác minh" badge; sr-only "KienTaoHub Studio & Creators" | The record's seller is **"Thiết Kế Nội Thất An Cường"** (`seller_profiles.display_name`), `status='active'`, `total_sales=31`. "KTS. Nguyễn Văn A" and "KienTaoHub Studio & Creators" exist nowhere | **FABRICATED** (name) — the fallback fires because the page passes no `sellerObj` | Pass `seller_profiles.display_name` (+ the user's `name`) through; drop the constant |
| D22 | `ProductDescription.tsx:142` | Seller title "**Kiến trúc sư • 5 năm kinh nghiệm • 236 sản phẩm**" | No `experience`-like field exists on `seller_profiles`; the seller has **15** published products (17 total, `total_sales=31`) | **FABRICATED** | Derive the product count from `products` (or omit); delete the experience claim — no real source exists |
| D23 | `ProductDescription.tsx:143` | Seller bio "Chúng tôi cung cấp các bộ hồ sơ thiết kế chất lượng cao, được kiểm tra kỹ lưỡng, phù hợp với tiêu chuẩn Việt Nam và quốc tế." | The record **has** a bio: "Thư viện 3ds Max, SketchUp nội thất phong cách Bắc Âu, Indochine và hiện đại." | **FALLBACK_INVENTED** (a real value is discarded) | Render `seller_profiles.bio` |
| D24 | `ProductDescription.tsx:78-79` | Summary line "Bộ hồ sơ thiết kế kiến trúc đầy đủ cho công trình, bao gồm bản vẽ, thuyết minh, bảng thống kê và file gốc chất lượng cao." | `products.meta_description` for 159 is **NULL** | **FALLBACK_INVENTED** | Render nothing (or the first sentence of the real `description`) when `meta.description` is empty |
| D25 | `web/src/components/product/ProductDetailTabs.tsx:171-173` and `:190-192` | Tab pills "Đánh giá **120**" and "Hỏi đáp **8**" | Product 159: `reviews` 0, `comments` 0 — and the same page renders "Danh sách nhận xét ( 0 )" a few sections below, contradicting the pill | **FABRICATED** | Pass the real counts down (the comments section already loads `totalComments`; the reviews endpoint returns `summary.totalCount`) |
| D26 | `ProductDetailTabs.tsx:79-80` | Product info row "Số lượng bản vẽ — **120 bản vẽ**" | `products` has no such column (the schema's specs are exactly `file_format`, `software_version`, `file_size`, `unit`); the product has 1 original file | **FABRICATED** (no real source exists) | Omit the row — no field can feed it; a real count would need a schema change (separate increment) |
| D27 | `ProductDetailTabs.tsx:89-90` | Product info row "Tương thích — **Windows**" | No such column or relation on `products` | **FABRICATED** (no real source exists) | Omit the row |
| D28 | `ProductDetailTabs.tsx:95-100` | "Nội dung gói tài nguyên": six checked items including "File Revit đầy đủ (có family, layer)" and "Bản vẽ PDF chất lượng cao" — on an **AutoCAD `.dwg`** product | The product's files are 1 `product_files` row (`.dwg`); no Revit or PDF file exists for it | **FABRICATED** (not derived from `originalFiles`/`product_files`) | Derive the list from the product's real files (extension/format), or omit the block |
| D29 | `web/src/components/product/ProductReviewsSection.tsx:333-334`, `:347-348`, `:351`, `:358-366` | "**4.8** / 5", "**120 đánh giá**", "**100% người mua đã xác thực**", distribution "5 sao 92% / 4 sao 6% / 3 sao 1% / 2 sao 1% / 1 sao 0%" | `reviews` for product 159 = 0, so `summary.totalCount` is 0 and the component falls through to the constants `'4.8'`, `'120 đánh giá'` and `defaultDistribution {5:92,4:6,3:1,2:1,1:0}` | **FABRICATED** | Render the real empty state the block already has further down ("Chưa có đánh giá nào", `:506-508`) instead of the mockup numbers |
| D30 | `ProductReviewsSection.tsx:389`, `:396`, `:397`, `:404` | A "featured review" quote — *"Bộ hồ sơ rất đầy đủ, bản vẽ chi tiết, đúng tiêu chuẩn. Tôi đã sử dụng cho dự án thực tế…"* — attributed to "**Nguyễn Hoàng Nam**", dated **12/09/2025**, with a photo captioned "**Dự án thực tế**" (`/media/curated/bestseller-1-villa.jpg`) | No review exists on this product; no user named Nguyễn Hoàng Nam exists (`select count(*) from users where name ilike '%Hoàng Nam%'` = 0); the date predates any review row | **FABRICATED** (a fabricated testimonial attributed to a fabricated person, with a stock photo as their project) | Omit the block; if a featured quote is wanted, it must come from a `reviews` row (status published) |
| D31 | `web/src/app/(app)/products/[slug]/page.tsx:259-320` (array), `:321-330` (merge) → rendered under "Có thể bạn cũng thích" | Five cards: "Bản vẽ biệt thự 2 tầng hiện đại" ★4.8 (96) 1.200.000 đ, "Hồ sơ kết cấu nhà phố 4 tầng" ★4.7 (64) 960.000 đ, "Bản vẽ chung cư cao tầng" ★4.9 (112) 2.500.000 đ, "Bản vẽ hệ thống MEP" ★4.6 (75) 1.800.000 đ, "Hồ sơ nội thất căn hộ cao cấp" ★4.8 (56) 1.100.000 đ | All five slugs (`ban-ve-biet-thu-2-tang-hien-dai`, `ho-so-ket-cau-nha-pho-4-tang`, `ban-ve-chung-cu-cao-tang`, `ban-ve-he-thong-mep`, `ho-so-noi-that-can-ho-cao-cap`) return **0 rows** in `products` and their URLs answer **404**. The product has no real related products, so the curated set fills all five slots | **FABRICATED** + dead links (five 404s reached from a live product page) | Render only real related products; when there are none, omit the section (or link to `/shop`) |
| D32 | `web/src/components/product/Gallery.tsx:38` (array), `:145-160` (pad to 8) → rendered as the image carousel with counter "1 / 8" | The gallery shows the product's one real watermarked preview **plus seven curated architectural photos** (`bestseller-1-villa`, `-2-frame`, `-3-mep`, `-4-interior`, `-6-highrise`, and the `kientaohub-gallery-*.png` set) presented as this drawing's pages | Product 159: `products_rels` has 1 `previewGallery` row and 0 `gallery` rows | **INDEX_MASKED** (visual) | Show only the product's own media; the pad-to-eight must go |
| D33 | `ProductDescription.tsx:110,117`, `ProductDetailTabs.tsx:66,71,76`, header line | ".dwg", "44.6 MB", "AutoCAD 2022+", "Ngày cập nhật 21/09/2026", price "Mua ngay — 510.000 ₫", the description body, the category/software badges, "Danh sách nhận xét ( 0 )" | DB: `file_format='.dwg'`, `file_size='44.6 MB'`, `software_version='AutoCAD 2022+'`, `updated_at` 2026-09-21, `price=510000`, the lexical `description` text matches, 0 comments | **REAL** | None — this is the half of the page that is honest, and the fixes above should copy its pattern (read the record, render nothing when empty) |

### Rows — seller page, cart, checkout, account area, consoles, login

| # | Display site (file:line) | Rendered value | Real source / database truth | Verdict | Smallest fix |
|---|---|---|---|---|---|
| D34 | `web/src/app/(app)/seller/SellerDashboardClient.tsx:712` (+ `:236-238`) | "**7 sản phẩm 12 lượt bán**" | `seller_earnings` for seller 4: 7 distinct `product_id`, 14 rows of which 2 are `REVERSED` ⇒ 12 counted | **REAL** (correctly excludes reversed sales) | None |
| D35 | `web/src/app/(app)/seller/page.tsx` KPIs → rendered lines 28-42 | "Số dư khả dụng 876.000 đ", "Tổng tiền đã rút 1.500.000 đ", "Tổng thu nhập tích lũy 2.376.000 đ", seller name "KTS ArcStudio Việt Nam" + the real bio | `getSellerBalance` over `seller_earnings` (AVAILABLE sum 2.376.000; PAID 2.328.000; withdrawn 1.500.000) and `seller_profiles.display_name`/`bio` | **REAL** | None |
| D36 | `web/src/components/wallet/WalletClient.tsx:117-122` — this row cited `app/(app)/wallet/WalletClient.tsx` until review round 2's G2 caught it (the file has never lived there), and the fabricated formula itself sat at `:153` before `t13` removed it, as review round 1 recorded — → rendered `/wallet` lines 65-68 | "**Điểm thưởng tích lũy 484 điểm**" under the label "**Tích lũy 1% mỗi đơn hàng**" | No points/rewards column or collection exists anywhere; the value is `Math.floor(totalSpent / 10000)` computed client-side from the loaded ledger page (50 rows). The label's "1%" contradicts the formula (1 point per 10,000₫) | **FABRICATED** (the metric, its unit and its rate; only the spend input is real) | Omit the card, or replace it with the real spend it is derived from until a loyalty model exists |
| D37 | `WalletClient.tsx:117-119` → rendered `/wallet` lines 62-64 | "Đã chi tiêu mua bản vẽ **4.840.000 ₫**" | `select sum(amount) from wallet_ledger where user_id=9 and type='purchase' and direction='debit'` = **4.840.000** (9 rows) | **REAL** today, but computed from a **50-row page** of the ledger, so it will silently under-report past 50 rows | Move the sum server-side (`sum` over the ledger) — the value is right, the derivation is fragile |
| D38 | `/orders` KPIs, rendered `/orders` lines 39-47 | "23 đơn hàng", "Tổng đơn hàng 23", "Đã thanh toán 12", "Tổng chi tiêu 4.840.000 đ", "Tài nguyên sở hữu 12" | `orders where buyer_id=9` = 23 (11 PENDING + 12 COMPLETED); `entitlements where user_id=9` = 12 active; ledger purchase debits = 4.840.000 | **REAL** | None |
| D39 | `web/src/components/AccountNav/AccountDashboardLayout.tsx:49-56` → rendered on every account page | Tier badge "Khách hàng thành viên" (and "Người bán uy tín"/"Kế toán"/"Kiểm duyệt viên" for other roles) | Derived from `user.roles` | **REAL** | None |
| D40 | `web/src/app/(app)/login/LoginBanner.tsx:101-102` → rendered `/login` lines 40-41 | "**4.9 / 5.0**" and "(**12.000+** đánh giá tin cậy)" | `reviews` = 0 rows; `avg(rating)` undefined | **FABRICATED** (by four orders of magnitude) | Omit the rating block until reviews exist, or compute it |
| D41 | `LoginBanner.tsx:108-110` → rendered `/login` lines 42-44 | Testimonial attributed to "**KTS. Hoàng Nam • Trưởng nhóm thiết kế**" with an "**Đã xác thực**" badge | No such user or review row exists | **FABRICATED** | Omit, or quote a real published review |
| D42 | `LoginBanner.tsx:118-119` → rendered `/login` lines 45-46 | "**50.000+** Tài nguyên CAD/3D" | 165 products, 140 published | **FABRICATED** (~300×) | Compute, or drop the number |
| D43 | `LoginBanner.tsx:36-37` → rendered `/login` lines 36-37 | "Tích xu thưởng & Quyền lợi thành viên — Tích lũy điểm thưởng và hoàn xu trên mỗi đơn hàng. Quy đổi giảm giá linh hoạt…" | No loyalty/points/rewards storage exists (schema scan above) | **FABRICATED** (promises a mechanism the system does not have) | Remove the promise, or implement the model in its own increment |
| D44 | `web/src/components/Footer/index.client.tsx:312` → rendered on every page (e.g. `/cart` line 56, `/checkout` line 54) | Payment-method list: "**Stripe**", "VietQR", "Thẻ ATM/Visa" | Decision 0013 removed the plugin's `payments` block; `POST /api/payments/stripe/initiate` → **404** (measured in the Inventory, row A4). No Stripe rail exists | **FABRICATED** (advertises a payment method the platform cannot process) | Remove "Stripe" from the list; the two SePay/VietQR-adjacent entries reflect what exists |
| D45 | `web/src/app/(app)/finance/page.tsx` KPIs → rendered `/finance` lines 25-31 | "Đã thanh toán chi trả ( 1 ) 1.500.000 ₫", "Tổng tiền đã bồi hoàn ( 16 ) 8.850.000 ₫", "Hàng đợi rút tiền ( 8 )" | `withdrawals` PAID = 1 row / 1.500.000; `refunds` = 16 rows / 8.850.000; `withdrawals` total = 8 | **REAL** | None |
| D46 | `web/src/app/(app)/moderation/ModerationQueue.tsx` cards → rendered `/moderation` lines 60-79 | Product specs `.dwg` / `AutoCAD 2022+` / `metric` / `59.9 MB`, "Tệp: kientaohub-file-59.dwg", "SHA-256: 7ddca756…", "Tác giả: Studio Diễn Họa 3D Cung Đình" | The row's `technical_specs_*`, its `product_files.checksum` and the seller's `display_name` | **REAL** | None |
| D47 | `/cart` and `/checkout` bodies, rendered `/cart` lines 19-22 and `/checkout` lines 17-20 | Empty states only ("Giỏ hàng của bạn đang trống") — no aggregates | Nothing to derive (the cart is empty; `/api/carts` is the separate ENDPOINT_MISSING defect of the Inventory, row A5) | **REAL** (empty, honest) | None |
| D48 | `web/src/components/product/ProductCommentsSection.tsx:78-84` | Relative dates "vừa xong / N phút trước / N giờ trước / N ngày trước" | Computed from the comment's real `createdAt` | **UNVERIFIABLE** — reading-verified only: the derivation is real, but no comment row exists to render a date, so both verification rounds could not measure it. It stays on the carried-unproven list, and review round 3's P1 caught this cell still reading `REAL` after the roll-up had been corrected |

### Page types reached, and what could not be reached

Reached and measured: `/` (homepage), `/shop`, `/products/[slug]` (product detail — product 159 plus
the three bestseller-linked products 70, 106 and 11 for the price cross-check), `/seller` (seller
dashboard), `/cart`, `/checkout`, `/account`, `/account/addresses`, `/orders`, `/orders/[id]`,
`/notifications`, `/wallet`, `/login`, `/find-order`, `/chinh-sach-hoan-tien`, `/finance` (finance
admin), `/moderation` (moderator), `/seller/products/new`, `/seller/register`.

Not reachable, with the reason rather than silence:

- **The Payload `carousel` block** (`web/src/blocks/Carousel/Component.client.tsx:27`, `FALLBACK_SLIDES`)
  — no page renders it: `select count(*) from pages_blocks_carousel` = **0** and the homepage is a
  bespoke React page (`web/src/app/(app)/page.tsx`), not a `pages` document. It is a latent copy of the
  same defect (hardcoded slides/alt text), not a live display site; it becomes reachable the moment
  anyone adds a Carousel block to a CMS page.
- **`/admin`** (Payload's admin panel at `/admin/[[...segments]]`) — not a storefront page and outside
  this increment's scope.
- **`/[slug]` CMS pages** — only one `pages` row exists (`slug='home'`) and the homepage route does not
  read it, so there is no visitor-facing CMS page to audit.
- **Product detail for the five curated "related" slugs** — they 404, which is itself row D31.

### Verdict roll-up

| Verdict | Count | Rows |
|---|---|---|
| **FABRICATED** | 27 | D1, D2, D5, D6, D7, D9, D10, D13, D14, D15, D19, D20, D21, D22, D25, D26, D27, D28, D29, D30, D31, D36, D40, D41, D42, D43, D44 |
| **INDEX_MASKED** | 5 | D3, D4, D8, D16, D32 |
| **FALLBACK_INVENTED** | 2 | D23, D24 |
| **REAL** | 13 | D11, D12, D17, D18, D33, D34, D35, D37, D38, D39, D45, D46, D47 |
| **UNVERIFIABLE** | 1 | D48 — the relative dates are computed from the comment's real `createdAt`, so the code is real, but **no comment row exists** to render one: both verification rounds called this row unverifiable and it stays on the carried list (review round 2's G3 caught it sitting in `REAL`) |

48 rows total. Two rows sit in two classes at once — D15 (a fabricated name shown under real records)
and D16 (one curated photo standing in for twelve real covers) — and each is counted once, by the
verdict that carries the fix: D15 under FABRICATED, D16 under INDEX_MASKED.

### The ten rows with the highest visitor impact, ordered

1. **D13 + D14 — every `/shop` card carries a fabricated download count, star rating and review count**
   (`1000+(id*137%900)`, `4.7+(id%3)/10`, `50+(id*41%300)`; twelve of twelve cards measured, database
   `download_events` = 0 and `reviews` = 0). This is the storefront's main browsing surface. **Removing
   it needs no design change** — the honest empty state is "no rating yet", and the numbers are
   computable from `reviews`/`download_events` the moment those tables have rows.
2. **D16 — all twelve `/shop` cards show the same curated villa photo** as their cover (measured: the
   page's only image URL). A catalogue that looks like one product repeated. **Needs the owner's
   decision only if a per-product placeholder must be designed**; simply rendering the product's own
   cover (or a neutral placeholder) needs none.
3. **D15 — all twelve `/shop` cards name the same fabricated seller "KTS. Nguyễn Văn A"** while twelve
   real sellers exist. Removing it needs no design change (the real seller is already in the record and
   only has to be populated by the query).
4. **D4 — the homepage bestseller cards advertise prices the product pages contradict** (card 1.200.000 ₫
   → product page 1.450.000 ₫; card 1.800.000 ₫ → product page 1.200.000 ₫; 7 of 8 cards differ).
   Money-facing. Removing it needs no design change — the real `price` is already a prop.
5. **D3 + D7 — the homepage bestseller cards show another product's title and an invented author** for
   eight real products (each card links to record A and displays record B's title/author). Removing it
   needs no design change.
6. **D19 + D20 — the product page header claims "4.8 (120 đánh giá)" and "2.450 lượt tải"** for a
   product with zero reviews and zero downloads, on the page where a buyer decides. Removing it needs
   no design change.
7. **D21 + D22 + D23 — the product page attributes the product to "KTS. Nguyễn Văn A", "5 năm kinh
   nghiệm", "236 sản phẩm"** while the record's seller is "Thiết Kế Nội Thất An Cường" with 15 published
   products and a real bio that goes unrendered. Removing/replacing it needs no design change.
8. **D29 + D30 — the review block shows a fabricated 4.8/5, a 92 % five-star distribution and a
   fabricated testimonial from a person who does not exist**, on a product with zero reviews. Removing
   it needs no design change (the component already has a real empty state).
9. **D31 — five "Có thể bạn cũng thích" cards with fabricated titles, ratings and prices whose links all
   404.** This is both invented data and a dead end. Removing it needs no design change (render only
   real related products, or omit the section).
10. **D40 + D41 + D42 — the login page's social proof: "4.9/5.0", "12.000+ đánh giá tin cậy",
    "50.000+ Tài nguyên" and a verified-looking testimonial** against 0 reviews and 165 products.
    Removing it needs no design change.

Runners-up that need the owner rather than a plain deletion: **D9** (the "80 % revenue share" promise —
the platform's own `commission_settings.default_rate` is 0.30, so either the number or the setting is
wrong and only the owner can say which), **D1** (the eight category tiles: the counts are computable,
but the tile set and its labels drifted from the 8 real categories, which is a design decision), **D43 +
D36** (the loyalty/points promise and card exist nowhere in the model — removing them removes a
marketing feature) and **D2, D10** ("hàng nghìn"): copy, so the storefront vertical's call.

Two rows are worth keeping visibly: **D11** (`RecentResources`, the `t8` fix holding — product-first
cards with real title, price, format, size, image and no rating) is the pattern the fixes above should
copy, and **D37** (the wallet spend figure) is arithmetically right today but computed from a 50-row
page, so it belongs in any follow-up that touches the wallet.

## Validation

- The inventory itself: every UI data path appears exactly once, with both sides cited by file:line.
- The sweep probe: each client path is exercised against the running dev server with the credentials
  its own code sends, and the assertion is that it never returns 404 or 500 (401/403 are acceptable
  only where the UI's own code handles them).
- Repository gates on the tree the captain commits. This item formerly claimed a full `test:int` run and
  an in-place build "on the shared tree once the team is idle" when neither existed for this cycle
  (review round 2's G1); both now exist, so the claim is replaced by measurements:
  - `tsc --noEmit` exit 0 and `eslint .` 0 errors — `verifier-t11/gates/*-after-t13.log` and
    `reviewer-ui-api-t16/gates/{tsc,eslint}.log`; `test:challenger` **30 files / 463 tests, exit 0** —
    `.lit/evidence/captain-final-gates/challenger-after-t20.log`, matching the independent runs in
    `verifier-t11/gates/vitest-challenger-after-t13.log` and review round 2's gates.
  - **`test:int`, full suite: 42 files / 654 tests, exit 0** —
    `.lit/evidence/captain-final-gates/test-int-after-t20.log`, and the same suite green from the
    engineer's side in `captain-final-gates/test-int-engineer.log`. The captain's **first** run of this
    gate on the frozen tree failed one test (653/654: `storefront-visibility-single-source` caught
    `login/page.tsx` inlining the published literal instead of using decision 0010's single owner); `t20`
    repaired it and the failing log is kept beside the green one, because that is what makes the green
    run mean something. `test:int` runs on `kientaohub_test` through `TEST_DATABASE_URL`, not on the
    development database, so re-running it does not disturb what the verification rounds measured.
  - **Build, in place: exit 0** — `✓ Compiled successfully in 13.4s`, `Finished TypeScript in 10.3s` —
    `.lit/evidence/captain-final-gates/build-inplace-after-t20.log`; the shared dev server survived it
    (200 on `/admin/login` and `/`, 404 on `/api/transactions`). An isolated build from earlier in the
    session also exists (`verifier-t3/gates/t3-build-isolated.log`); the in-place form is the stronger.
- **Not taken or not proven**, stated here so the record does not read as complete: `test:e2e` (the
  full-suite run needs a quiet window no round secured); A13's `INSUFFICIENT_FUNDS` branch; the 200/201
  branches of A26-A31 and A34-A39; B4/B5 by reachability; D48; V4; V5.
- Independent verification and review before the captain commits: the verifier re-derived the
  inventory with its own instruments (`verifier-t3/REPORT-t3-independent-verification.md`,
  `verifier-t11/REPORT-t11-invented-data.md`, `verifier-t11/REPORT-t14-reverification.md`), and the
  reviewer judged completeness plus the new endpoints against decisions 0002, 0005, 0008, 0012, 0013 and
  0014 across four rounds (`reviewer-ui-api-t4/REPORT-t4-review-round1.md`,
  `reviewer-ui-api-t16/REPORT-t16-review-round2.md`,
  `reviewer-ui-api-t17/REPORT-t17-closeout-conformance.md`,
  `reviewer-ui-api-t19/REPORT-t19-review-round3.md`).

## Progress

- 2026-09-20 — owner reports the UI vertical finished and asks for the API wiring; captain measures
  the API surface (36 routes) and the UI's data paths (13 server components plus 30+ client fetches),
  writes this plan, and stages the team. The working tree carries the UI vertical's uncommitted work:
  this increment commits only the files it changes, and says so in the commit message.
- 2026-09-20 — `t1` (mapper) delivered the inventory above: 78 rows, 72 `MATCHES`, and six real rows —
  A9 (an anonymous jar reads another buyer's payment intent), A1 (the wallet balance is read from the
  wrong level, so the wallet path is permanently refused), B30 (the order-access email server action
  never sends because it reads orders as a guest), A5 (the cart), A3 (the VietQR branch announces an
  order it never recorded) and A4 (the card option decision 0013 recorded). `t5` then removed the
  probe residue that inventory created: the throwaway identity, ticket, comment, report, review and
  the pending top-up intent are deleted and re-checked with an independent curl sweep, while the three
  orders, their entitlements and the two ledger rows are named as permanent residue on the record.
- 2026-09-20 — the owner settled the cart's design question: **no UI design changes**, the API and the
  wiring must satisfy the interface as it stands, and the cart is **not** server-side — it lives in the
  buyer's `sessionStorage`. Recorded as **decision 0014**, which keeps decision 0013 intact (no `carts`
  collection, no cart table, no migration) and settles the checkout's money paths. The DAG was extended
  accordingly: `t2` (A9 first, then A1, B30 and the remaining non-cart rows) → `t6` (a `sessionStorage`
  cart as a drop-in for the plugin's `useCart` surface, plus wiring the "Thêm vào giỏ hàng" control
  that reached nothing) → `t7` (VietQR through the top-up rail of decision 0004, and a deterministic
  honest refusal for the card option) → `t3` (independent verification of all three) → `t4` (review).
- 2026-09-20 — the owner ruled on the card option's fate: removing it from the checkout is a **design
  change and therefore the storefront vertical's work, to be done after this increment** ("sẽ sửa sau…
  có vấn đề gì team UI sẽ làm sau"). This increment therefore keeps the option rendered and only makes
  it fail honestly (A4 in `t7`); the file-by-file brief for the vertical is in decision 0013's follow-up,
  and `CheckoutPage.tsx` must not be edited by both sides at once — the vertical starts once `t7` is
  closed and the captain says so.
- 2026-09-21 — `t2` closed (repairs in its own Repair log section): A9 now answers 401 to an anonymous
  caller and 404 to a caller who does not own the intent (the same body as an unknown code, so codes
  stay unenumerable) with the owner-or-admin scope of `paymentIntentReadAccess`, and a non-owner never
  reaches the lazy-expiry write; A1 stores `data.wallet`; B30 resolves ownership through
  `orders.buyer → users.email` because the inventory's prescribed `overrideAccess` one-liner was
  measured insufficient (`orders` has no `customerEmail`/`accessToken`, and Payload rejects the query
  path); both seller upload routes answer 400 instead of the recorded 500. Gates: `tsc` 0, `eslint .`
  0 errors, and the read-only sweep `web/tests/helpers/probe-ui-api-contracts.mts` 87 probes / 0 failed
  with a negative control that proves the missing-route detector fires. The independent verification of
  these repairs, including its own sweep (`probes/sweep-final.log`, 137 probes, `failed: 0`,
  `SWEEP: PASS`), is `.lit/evidence/verifier-t3/REPORT-t3-independent-verification.md`. One captain-authorised
  exception is on t2's revisions ledger: a single `queueMicrotask` line in the storefront vertical's
  `SellerDashboardClient.tsx:198`, whose pre-existing `react-hooks/set-state-in-effect` error blocked
  the repository's lint gate (it is CI's gate, not this task's file), fixed with the vertical's own
  pattern.
- 2026-09-21 — `t6` closed: `web/src/providers/Cart` (new) is a `sessionStorage` store behind exactly
  the consumed `useCart` surface, the eight consumers changed import lines only, `EcommerceProvider`
  stays mounted with `syncLocalStorage={false}` so the plugin cannot fetch `/api/carts/{id}`, and
  `DigitalProductCTA`'s "Thêm vào giỏ hàng" now adds to it. Instrument
  `web/tests/challenger/cart-session.spec.tsx` 16/16, full challenger suite 27 files / 445 tests green,
  `tsc` 0 and `eslint .` 0 errors. A real browser run on the shared dev server showed the stored
  snapshot, badge 1 and the `/cart` row with no `/api/carts` request (the plugin's
  `GET /api/users/me?select[cart]=true`, which still happens, is named rather than hidden). Two
  findings were reported instead of fixed: two vertical specs needed their cart mock retargeted (the
  engineer changed the mock target only, leaving their assertions intact), and the CTA's
  `openCartDrawer()` event cannot open the drawer the app mounts because `OpenCartButton` renders a
  controlled `CartDrawer` — the captain amended `t7` to close that wiring gap rather than hand a
  user-visible break to the vertical.
- 2026-09-21 — `t7` closed: the VietQR branch creates a real top-up through
  `POST /api/v1/payments/topup` and hands the buyer to `/wallet?topup=<code>`, which `WalletClient`
  resumes into the existing QR/polling step — the cart is no longer cleared, and the false
  "Đơn hàng đã được ghi nhận" survives only in a comment recording its removal. The card option now
  receives a deterministic refusal from a new stateless endpoint
  `POST /api/v1/payments/card/initiate` → 501 with a message naming the two rails that work; it carries
  no SDK, no key and no collection, so it can neither leak nor move money, and it is **the one endpoint
  this increment adds** (justified by inventory A4 — `ENDPOINT_MISSING` — plus decision 0014 §5, which
  keeps the option rendered). The add-to-cart click now opens exactly one drawer: `OpenCartButton`
  subscribes to `OPEN_CART_EVENT`, measured in a browser as 0 before and exactly 1 after the fix, with
  a mutation check that reproduces the pre-fix failure. Gates: `tsc` 0, `eslint .` 0 errors (1410
  warnings, below the 1413 the tree carried before this task — narrative counts, logs in
  `verifier-t11/gates/` and `reviewer-ui-api-t16/gates/`), the new checkout spec 10/10 and the full
  challenger suite 28 files / 455 tests green. `t3` was amended to name the three new behaviours it must
  verify by measurement rather than by reading the code, and `t4` follows it.
- 2026-09-21 — the owner-reported homepage defect is closed by `t8`. The "Tài nguyên mới" section was
  carrying the curated list's invented title, price, format and size on cards that linked to real
  products: `RecentResources/index.tsx:87-101` mapped the products it was handed onto
  `CURATED_RECENT_ITEMS` by index and kept every displayed value of the curated item, taking only `id`
  and `slug` from the product. Before the fix the new read-only probe
  `web/tests/helpers/probe-homepage-prices.mts` failed five of five cards — `san-pham-159` 510.000 shown
  as 950.000, `158` 430.000 as 600.000, `157` (free) as 1.300.000, `156` 650.000 as 750.000, `155`
  320.000 as 2.500.000 — and after it the same five match the product's own title, price (including
  `0 ₫` for the free one), format and size, with no invented ★ rating on a product-backed card. The
  mapping is now product-first (the `EditorialHero` pattern) and the curated list is a fallback again,
  proven by `web/tests/challenger/recent-resources-fallback.spec.tsx` (5/5, with a mutation check that
  restores the mask and fails). Gates: `tsc` 0, `eslint .` 0 errors, challenger 29 files / 460 tests
  green.
- 2026-09-21 — captain note on an interference this task hit and resolved: the tree went red on a
  `prefer-const` error inside the verifier's **in-flight** probe
  `web/tests/helpers/probe-verify-cart-checkout.mts`. The engineer reported it to the verifier, then —
  when it persisted and because the path is inside `t8`'s scope and its acceptance requires a green
  lint gate — applied the two-line semantics-preserving fix itself. Ruling: acceptable **because** it
  reported first and the change preserves semantics, but the standing rule for the rest of this
  increment is that an artifact another member is running is not edited by anyone else; the blocked
  member reports it to the captain, who either authorises the minimal fix or asks the file's owner. The
  verifier was told and asked to re-run its probe and say whether its evidence was affected — a
  verification whose evidence moved under it is worth less than one that says so.
- 2026-09-21 — `t2` (engineer) closed the repair scope it owns, in the captain's priority order.
  **A9** (the anonymous intent read) is repaired with auth plus an ownership scope threaded through the
  service so a non-owner's lookup cannot even trigger the lazy-expiry write; **A1** reads the wallet
  level the route actually sends; **B30** no longer depends on `orders.customerEmail`/`accessToken`
  (neither exists — the row's one-line `overrideAccess` prescription was measured insufficient) and
  resolves ownership through `orders.buyer → users.email`, which makes the email send for real. The two
  upload routes from the plan's API-side observations now answer 400 instead of 500 for a non-`File`
  part. `web/tests/helpers/probe-ui-api-contracts.mts` swept all 78 rows against the running dev server
  (read-only): **87 probes on their expected branch, 0 failures, 7 on a documented not-found branch, 0
  rows skipped**; A3/A4/A5 were left untouched for `t6`/`t7` as instructed and are reported in the
  Repair log. No schema, migration, `package.json` or lockfile change. The shared tree's single
  pre-existing `eslint .` error (`web/src/app/(app)/seller/SellerDashboardClient.tsx:198`, an untracked
  UI-vertical file) was reported to the captain and, on the captain's explicit authorization recorded
  as an amendment to `t2`, fixed with one mechanical `queueMicrotask` line — the file is the vertical's,
  this increment does not own it, and nothing else in it was touched. Gates after the change:
  `tsc --noEmit` exit 0, `eslint .` **0 errors** (1413 warnings — the warning counts in these entries are
  narrative; the log behind the claim is `.lit/evidence/verifier-t11/gates/eslint-after-t13.log`), sweep
  87/0/7/0 with its negative
  control firing.
- 2026-09-21 — `t10` **failed with the tree red**, and the way it failed is worth recording. The captain
  repaired what was mechanical — `LoginBanner.tsx` carried one extra `</div>` after its root closed, and
  `WalletClient.tsx` an orphan `</Row>` whose opening tag went with the loyalty card — then measured the
  rest instead of guessing: inside that `return` the file had **51 `</div>` against 44 `<div>` openers**
  and a `</Modal>` with **no `<Modal>` opener anywhere**, because the removal had also taken the modal's
  opening tag and its conditional wrappers. A reconstructed shell would have dropped the modal's QR
  content, so the captain stopped and handed the file back to the member who removed it: `t12` (repair,
  source `t10`) restored the structure from the content it had deleted and finished the scope.
- 2026-09-21 — `t12` closed with the invented-data class genuinely gone, measured end to end: the probe
  `web/tests/e2e/probe-rendered-vs-db.mts` went **29 ok / 109 failing → 143 / 1 → 144 checks, 144 ok,
  exit 0**. The single remaining failure was the probe's own defect — a bare `N / M` regex matching the
  footer's "24/7" — now anchored to the preview label, and its D8 check resolves
  `previewGallery → previewImage` through `product_previews`. The wallet's top-up modal is proven intact
  rather than a shell by `web/tests/challenger/wallet-topup-modal.spec.tsx` (3/3: presets → amount field
  → `POST /api/v1/payments/topup` → QR image with bank, account, amount and reference → reset). The
  verifier's **V1** is closed for the reachable case: `country: 'VN'` answered 400 `invalid selection` and
  the form now posts **201** with a valid default (its probe address was deleted afterwards). **V3** is
  closed: the challenger suite is **30 files / 463 tests, exit 0**; the earlier exit 1 came from seven
  assertions `t10`'s removals broke, and they now assert the honest contract instead of having been
  deleted. D1 (tiles count published products per category — 17/18 each), D2 ("Hơn 140 tài nguyên…", and
  quantity-free when no count is passed), D32 (gallery counter measured honest) and the fabricated
  'KienTaoHub Studio & Creators' default in `SellerAttribution` are closed as well. With `reviews` and
  `download_events` empty, a card and the product header render **no** star block and **no** 'lượt tải',
  and the reviews section shows its own 'Chưa có đánh giá nào' state.
- 2026-09-21 — **follow-up the owner must authorise, because it is schema and therefore migration-owned.**
  The country select the address forms validate against is the plugin's list of 40 countries and it holds
  **no Vietnam** — the region offers only Singapore and Malaysia — so a Vietnamese buyer or seller cannot
  enter a Vietnamese address. Measured in `enum_addresses_country` (40 labels, none of them `VN`). The fix
  is one small increment: a phase-14 migration adding `VN` (and the neighbouring countries) to the enum, a
  `supportedCountries` override in `web/src/plugins/index.ts` so the form's options and the enum agree,
  and a `VN` default in the address forms. Until it lands the form saves correctly with a foreign
  default — honest, but wrong for the marketplace's own country.
- 2026-09-21 — the captain's two documentation items from review round 1 are closed here (R5, R8).
  **R5:** the handoff now names every dead-slug fallback group in one row — `CLEAN_FALLBACK_PRODUCTS`
  (8 slugs), `CURATED_RECENT_ITEMS` (5) and `EDITORIAL_SLIDES` (3), all 16 measured 0-row in `products` —
  so the empty-catalogue decision the vertical and the owner owe is stated once and completely instead of
  a group at a time. **R8:** A17's evidence cell is corrected (the route's 200 body carries
  `{success,comment}`, not `message`; the UI renders `message` on the failure path only, so the verdict
  `MATCHES` is unchanged), and the inventory's line cites are marked as **of the inventory's revision**:
  five tasks (t2, t7, t8, t12, t13) have moved lines in those files since, so the current authority for
  file:line is review round 1's re-derivation in
  `.lit/evidence/reviewer-ui-api-t4/REPORT-t4-review-round1.md` with its `revision-snapshot.txt`, which
  restated all 78 rows at the revision it judged.
- 2026-09-21 — **the image provenance rule, which is review round 1's R3 documentation half** (the
  engineer supplied the wording; `docs/` is outside its scope, so the captain lands it here):

  > Image provenance rule: a record-backed element shows the record's own media; when the record has no
  > usable media the element **omits** the image and lets its own placeholder render — never a curated
  > substitute, because that asserts "this is what the record looks like". A curated image belongs only
  > on a fallback slot with no record at all (the curated cards a section renders when the database is
  > empty). Enforced by `web/tests/e2e/probe-rendered-vs-db.mts` (F1 rows + provenance D8 + the `CTRL`
  > rows).

  `t13` closed the rule's enforcement with a control that can actually fail: mutating the hero back to
  `fallback.image` and `isVerified = true` makes the probe exit 1 with exactly the four F1/F2 rows
  failing, and reverting makes it 151 checks / 0 failing / exit 0. Measured on the final tree: all three
  hero slides render their own product's media (`kientaohub-gallery-15/14/13.png`, none fell back), the
  verification badge is absent on every surface, the hero tag reads the product's own
  `technicalSpecs.softwareVersion` (`AutoCAD 2022+`, `AutoCAD 2022+`, `SketchUp 2022+`), the four count
  claims promise no number, and the dead `rewardPoints` derivation is gone. The verifier's own instrument
  moved from 209 tied / 5 not tied to **218 tied / 0 not tied** (the instrument gained a check as the
  rendered shapes changed; the authority is
  `.lit/evidence/verifier-t11/REPORT-t11-invented-data.md`, whose `probes/render-vs-db.log` carries
  `checks: 217, tied: 209, not tied: 5, unverifiable: 3`, together with
  `verifier-t11/probes/render-vs-db-after-t13.log` — this line said 214 until review round 2's note N2
  caught the drift), its browser probe 20/20 and its boundary probe 20/20.
- 2026-09-21 — process note worth carrying: the engineer reported that its **assignment prompt listed six
  acceptance items while the stored contract had ten**, because the captain amended `t13` mid-flight to
  absorb review round 1's R2/R3/R4/R6. The member read the contract from the task record and delivered
  against all ten, which is the right behaviour — but the divergence is a property of the mechanism, not
  of that task: an amendment lands in the record and the already-delivered prompt does not change. Future
  amendments to a claimed task should say so explicitly in the amendment reason so the member knows to
  re-read, and members should treat the record as authoritative.
- 2026-09-21 — captain's ruling on the one curated asset that survived the sweep, so the next audit does
  not re-open it. The verifier's round-2 instrument reported `bestseller-6-highrise` once on `/seller`,
  where `SellerDashboardClient.tsx:517-525` paints it as a 20 %-opacity **decorative** overlay behind the
  seller's profile banner. `t15` confirmed the removal works and then reverted it, because the verifier's
  own rule asserts those assets only on the record-backed surfaces (`/`, `/shop`) and reports them
  elsewhere as *decorative curated-asset uses*, and because that file was outside `t15`'s declared scope.
  **Ruling: keep it.** The provenance rule governs elements that make a claim about a record — a product
  card, a hero slide, a gallery, a seller's identity; a background wash behind a banner makes no claim
  about any record, and deleting it would be a design change, which the owner ruled out. The line this
  increment drew is the one to hold, now stated so it is not re-litigated: a curated asset used as
  **decoration** is allowed and must be reported as decoration; a curated asset **substituted for a
  record's own media** is the defect that was removed. The asset itself is still in the tree — the
  captain re-checked `SellerDashboardClient.tsx:520` — so the verifier's "decorative curated uses: none"
  line means its rule stopped asserting curated assets on `/seller`, not that the image was deleted.
- 2026-09-21 — one **latent** row the round-2 verification named and the captain is recording rather than
  fixing now: `web/src/app/(app)/products/[slug]/page.tsx:394` still has a curated fallback in the same
  shape the provenance rule forbids — a record-backed element substituting media instead of omitting it.
  It is unreachable today (the related list renders 0 links, and **0 of 140 published products has no
  media**), so touching it now would invalidate the round-2 verification that gates `t16`/`t17` for a
  branch no visitor can enter. Recorded with its exact fix so it is not lost: when that element has no
  record media it must render no image, per the rule above. If the reviewer judges it a blocker it is a
  one-line change; if not, it belongs to the next sweep with the fallback-slug question the handoff
  already owns.
- 2026-09-21 — review round 2 passed (`.lit/evidence/reviewer-ui-api-t16/REPORT-t16-review-round2.md`
  with its `revision-snapshot.txt`; the gate logs it ran are in `reviewer-ui-api-t16/gates/`), and its
  remaining non-blocking notes are recorded here as follow-ups rather than fixed before commit, because
  any change now would invalidate the verification that gates the commit:
  **N1** (corrected): the round-2 re-verification's evidence lives at
  `.lit/evidence/verifier-t11/REPORT-t14-reverification.md` with `verifier-t11/{gates,probes}/*after-t13*`,
  not in a `verifier-t14/` directory that earlier contract text named.
  **N2** (corrected above): the progress entry's tied-count drifted to 214; the instrument reports
  **218/218**.
  **N3** (follow-up): `web/tests/e2e/probe-rendered-vs-db.mts` blocklists the three retired tag strings
  instead of comparing each rendered tag with the product's `technicalSpecs.softwareVersion`, and its
  badge check is a `/\bverif|badge/i` field-name heuristic. The verifier's instrument does both properly;
  import that approach when the repo probe is next touched, and until then treat its tag and badge
  coverage as weaker than a green run suggests.
  **N4** (recorded above): the latent curated fallback at `products/[slug]/page.tsx:394`, unreachable
  while `products_rels path='relatedProducts'` has 0 rows.
  **N5** (follow-up): `curatedFallback` is a dead prop (`(app)/products/[slug]/page.tsx:272`,
  `Gallery.tsx:34,44,105`) kept alive by the same unreachable path — remove it with N4 in the next sweep.

## Repair round 2 (t15, engineer, 2026-09-21): R1-R8 checked with measurements

`t15` re-checked review round 1's eight findings against the tree as `t13` left it. Seven are closed and
one **new** row surfaced from the verifier's round-2 instrument; the measurements are below so the next
audit reads numbers, not claims.

- **R1 (badge) — closed.** `SellerAttribution.tsx:19` reads `isVerified = false` and the only caller
  (`ProductDescription.tsx:170-172`) passes no value. Measured on the live pages of a paid (159) and a
  free (157) product: 0 occurrences of `Chuyên gia` / `Đã xác minh`. The verifier's row holds.
- **R2 (hero) — closed.** The product-backed mapping reads `EditorialHero.tsx:118` (`shortTitle: p.title`,
  shortened) and `:125` (`tag: technicalSpecs.softwareVersion`), the image chain at `:110` is product-first,
  and the rendered first slide carries product 159's own title. `EDITORIAL_SLIDES` keeps its constants only
  for the no-record case.
- **R3 (instrument provenance) — closed and strengthened.** `tests/e2e/probe-rendered-vs-db.mts` fails any
  cover that is not the record's own media (the `media.length === 0` escape is gone), adds F1 x3, F2 and F3,
  carries the substitute-vs-omit rule in its header, and ships two `CTRL` rows. Negative control measured:
  mutating the hero back and restoring `isVerified = true` makes it exit 1 with exactly four failing rows;
  reverting makes it 151 checks / 0 failing / exit 0.
- **R4 (four count claims) — closed.** `OrdersTableClient.tsx:386`, `AccountClientView.tsx:60`,
  `seller/register/page.tsx:51` and `SellerDashboardClient.tsx:158` now promise no number; no `hàng nghìn`
  remains in `src/` outside two explanatory comments.
- **R5 (dead-slug fallbacks) — closed as documentation** by the captain at lines 856-861 (all 16 slugs
  named, all measured 0-row). The empty-catalogue choice remains the owner's and the vertical's.
- **R6 (dead `rewardPoints`) — closed.** `grep -c rewardPoints src/components/wallet/WalletClient.tsx` = 0.
- **R7 (address default) — closed as a disclosed workaround**, no change inside the increment: the form
  defaults to `countryOptions[0]` (`US`) because `enum_addresses_country` has no `VN`; the VN enum
  increment stays on the owner's queue (lines 850-855).
- **R8 (documentation) — closed** by the captain at lines 860-866 (A17's cell corrected; the inventory's
  line cites are marked as of the inventory's revision with round 1's re-derivation as the current
  authority).

**The one `/seller` occurrence, resolved as decoration (no repair needed).** While `t15` ran, the
verifier's instrument (217 -> 218 checks) briefly failed a single row — `"bestseller-6-highrise" on /seller:
1 occurrence(s) — a retired curated hero image` — and then refined the rule at 12:19: the retired curated
hero assets are asserted only where they used to stand in for a product (`/`, `/shop`); on other pages a
curated photo may be honest decoration and the occurrence is **printed, not failed**. Its final run prints
`seller dashboard: bestseller-6-highrise × 1` in the "decorative curated-asset uses" line and passes
(218 checks, tied 218, not tied 0, exit 0). Source of that occurrence:
`web/src/app/(app)/seller/SellerDashboardClient.tsx:517-525`, a 20%-opacity overlay painting
`/media/curated/bestseller-6-highrise.jpg` behind the seller's profile banner — decoration, matching round
1's classification, and it stands as the owner's/vertical's design call. `t15` therefore changed no
application file: the tree is exactly the t13 state the reviewers measured. If the decision is to drop the
photo anyway, the change is one deletion (the overlay `<div>`); the banner keeps its own card background.

Gates after the check (tree unchanged by `t15`): `tsc --noEmit` exit 0; `eslint .` exit 0 (0 errors);
`tests/helpers/probe-ui-api-contracts.mts` exit 0 (87 probes reached their expected branch, 0 failed,
7 documented not-found branches, A3/A4/A5 reported as follow-ups); `tests/e2e/probe-rendered-vs-db.mts`
151 checks / 0 failing, exit 0.

## Delivered — 2026-09-21, commit `7cd3397`

The increment is committed and pushed, and the team reports **Delivery: ok** with all twenty tasks
terminal. What the commit carries: the 78-row inventory and its repairs (A9's authorization hole, A1's
wallet balance, B30's never-sending email, the two upload guards), the sessionStorage cart of decision
0014, the checkout's real money paths, and the removal of the invented-data class — with an instrument
that now fails on a substituted image and a negative control proving it can.

Gates on the committed tree, taken in this cycle: `test:int` **42 files / 654 tests exit 0**,
`test:challenger` **30 files / 463 tests exit 0**, `next build` **in place exit 0**, `tsc` 0 and
`eslint .` 0 errors. The captain's first `test:int` run on the frozen tree failed one test
(`login/page.tsx` inlining decision 0010's visibility literal); `t20` repaired it and both logs are kept.

Independent verification and four review rounds closed it: `verifier-t3` (137-probe sweep),
`verifier-t11` (t11 and the re-verification t14), and reviews t4 (`needs_revision`) → t16 (`pass`) →
t17 (close-out conformance) → t19 (`ready-to-commit`), each re-deriving rather than trusting a green
probe. Two rounds were missed by the same instrument defect — a probe that reported 144/144 while three
findings were live — which is why the record now says plainly: **`MATCHES` certifies the contract, never
the render.**

Disclosures on the commit: 45 of its files are shared with the storefront vertical (23 it redesigned,
22 it created) and no file-granular separation exists, so the message says the commit carries its work
inside those files; three captain-authorised exceptions are named (the vertical's lint line, two cart
mock targets, two lines in the verifier's probe); `.lit/evidence/**` is deliberately not committed.

Still open, with the owner: the `VN` country option (a schema increment — `enum_addresses_country` has
no Vietnam, so the address form defaults to a foreign country), the homepage's "80% chia sẻ doanh thu"
against `commission_settings.default_rate = 0.30`, the loyalty-points promise with no storage, and
whether the invented product attributes should become real seller-filled fields. The handoff section
above carries the vertical's items, and the carried-unproven list in Validation is what this increment
did **not** prove.
