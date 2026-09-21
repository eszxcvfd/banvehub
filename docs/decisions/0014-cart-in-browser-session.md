# 0014 The Storefront Cart Lives in the Browser Session

Date: 2026-09-20

## Status

Accepted

## Context

The storefront the UI vertical built keeps the template's cart surfaces — `CartDrawer`, `/cart`
(`CartPageClient`), the header's `OpenCart` badge, the quantity and delete buttons, `/checkout` and
its `CheckoutForm` — and they read their state from the plugin's `useCart`
(`@payloadcms/plugin-ecommerce/client/react`), which fetches `/api/carts`. That route does not exist:
phase 2 disabled the plugin's `carts` collection (`carts: false`) and decision 0013 removed the
commerce tables the plugin's cart depended on. Measured during the UI↔API inventory on 2026-09-20:
`GET` and `POST /api/carts` answer `404 Route not found`, while `/api/addresses` from the same
provider answers `200`. Two further measurements came out of the same inventory:

- Nothing in the storefront adds an item to the cart. `DigitalProductCTA` renders a "Thêm vào giỏ
  hàng" button that reaches no cart API at all, so the cart could only ever be empty.
- `CheckoutPage`'s VietQR branch (`handleVietQROrder`) told the buyer "Đơn hàng đã được ghi nhận",
  cleared the cart and navigated to `/orders` **without calling any endpoint**, while its wallet branch
  does call `POST /api/v1/orders/purchase` (decision 0002's write path) and its card branch calls the
  plugin's removed `/api/payments/stripe/initiate`.

The owner's instruction of 2026-09-20 settled the design question: **no UI design may change** — the
API and the wiring must satisfy the interface as it stands — and the cart is **not** stored on the
server, it is stored in the buyer's browser session (`sessionStorage`).

## Decision

1. The cart is **client-side state persisted in `sessionStorage`**, keyed per browser session. No
   `carts` collection is created, no cart table comes back, and no migration is added: decision 0013's
   removal of the template commerce ledger stands unchanged.
2. The UI keeps consuming the **same hook surface** it consumes today — `cart` (with `items`, each
   item carrying `id`, `product`, `quantity` and a price), `isLoading`, `addItem`, `removeItem`,
   `incrementItem`, `decrementItem`, `clearCart`, all addressed by item id — because the components'
   design and logic must not change. Only the store behind that surface is ours.
3. The "Thêm vào giỏ hàng" control is wired to that store, so the cart the drawer and `/cart` render
   is the cart the buyer actually filled.
4. Checkout money paths use the APIs this repository already owns and never a removed one: the wallet
   branch keeps `POST /api/v1/orders/purchase` (one service call per item, decision 0002), and the
   VietQR branch creates a wallet top-up through `POST /api/v1/payments/topup` — the SePay rail of
   decision 0004 — instead of announcing an order that was never recorded. After the top-up is paid the
   buyer completes the purchase through the wallet path, which is what the wallet page already does.
5. A card/Stripe rail is **not** part of P0 (decision 0004) and is not resurrected here. The card option
   must receive a deterministic, honest refusal from an endpoint that exists, rendered by the error
   surface the checkout already has, rather than a 404 from a route decision 0013 removed. Whether the
   option should stay on the page at all is a design question for the owner and the storefront
   vertical, not for this decision.

## Alternatives Considered

1. **Re-enable the plugin's `carts` collection** (server-side cart). The UI would work unchanged, but it
   needs a schema migration that recreates what decision 0013 removed, stores shopping intent that the
   buyer never confirmed, and was explicitly rejected by the owner.
2. **Remove the cart surfaces.** Consistent with the buy-now + wallet model and with phase 2, but it is
   a UI design change, which the owner ruled out.
3. **An API route that reads the browser's `sessionStorage`.** Impossible: the server cannot see it.
   The cart therefore has to be a client store, and the only real choice is which client store.

## Consequences

Positive:

- The cart works without a schema change, keeps the design the owner approved, and leaves the
  database a truthful description of the money path.
- The checkout stops lying: the VietQR branch moves money through the rail of record, and the card
  branch fails honestly instead of hitting a route that no longer exists.
- Decision 0013 needs no amendment: nothing about the removed commerce ledger comes back.

Tradeoffs:

- The cart does not survive a new browser session and is not visible to the server, to the admin, or
  across devices. That is the owner's explicit choice, and it is the accepted cost of a cart that only
  exists while the buyer is shopping.
- A guest's cart is therefore also invisible to analytics; any future "abandoned cart" feature would
  need a server-side design and a new decision.
- `@payloadcms/plugin-ecommerce`'s cart context is still mounted by `EcommerceProvider` (the account
  area needs its `useAddresses`), so its own cart fetch must be kept from firing; the drop-in store
  sits beside it rather than replacing the provider.

## Follow-Up

- The storefront vertical's decision on the card option's presence on the checkout page (see
  decision 0013's follow-up for the same surface).
- If a server-side cart is ever wanted (multi-device, admin visibility, abandoned-cart reporting), it
  is a new increment with a schema migration and its own decision — not a change to this one.
