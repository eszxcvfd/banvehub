# Milestone 1: Orders & OrderItems Schema — Implementation Design Report

## Executive Summary
This report provides the complete, production-ready implementation design for the digital `Orders` and `OrderItems` collections in KienTaoHub (Phase 5: Purchase & Download). It details how to disable the default physical-goods orders from `@payloadcms/plugin-ecommerce`, implement dedicated digital schema collections, enforce the anti-self-purchase invariant (BR-04) and immutable snapshot pricing (BR-07), configure atomic access control, and align relations with `Users` and `payload.config.ts`.

---

## 1. Observation

### 1.1 `@payloadcms/plugin-ecommerce` Configuration & Conflicts
In `web/src/plugins/index.ts` (lines 78–136), the ecommerce plugin is currently mounted with:
```typescript
ecommercePlugin({
  access: { ... },
  customers: { slug: 'users' },
  carts: false,
  products: false,
  orders: {
    ordersCollectionOverride: ({ defaultCollection }) => ({
      ...defaultCollection,
      fields: [
        ...defaultCollection.fields,
        {
          name: 'accessToken',
          type: 'text',
          unique: true,
          index: true,
          ...
        },
      ],
    }),
  },
  transactions: { ... },
  payments: { ... },
})
```
- **Line 91**: `orders` is currently enabled with an `ordersCollectionOverride`.
- Inspecting `web/node_modules/@payloadcms/plugin-ecommerce/dist/types/index.d.ts` (line 716):
  ```typescript
  orders?: boolean | OrdersConfig;
  ```
- Inspecting `web/node_modules/@payloadcms/plugin-ecommerce/dist/index.js` (line 116):
  ```javascript
  if (sanitizedPluginConfig.orders) {
    const defaultOrdersCollection = createOrdersCollection({ ... });
    ...
    incomingConfig.collections.push(ordersCollection);
  }
  ```
  Setting `orders: false` completely suppresses the generation and registration of the default ecommerce plugin `orders` collection into `incomingConfig.collections`.
- Inspecting `web/src/plugins/index.ts` (lines 137–155):
  ```typescript
  (incomingConfig) => {
    ...
    incomingConfig.typescript.schema.push(({ jsonSchema }) => {
      const collections = (jsonSchema?.properties?.ecommerce as any)?.properties?.collections
      if (collections?.properties?.carts) {
        delete collections.properties.carts
      }
      if (Array.isArray(collections?.required)) {
        collections.required = collections.required.filter((s: string) => s !== 'carts')
      }
      return jsonSchema
    })
    return incomingConfig
  }
  ```
  Because `carts: false` was set, `carts` was excised from `jsonSchema.properties.ecommerce.properties.collections`. Doing the same for `orders` ensures that the ecommerce plugin's schema definitions do not conflict with or enforce legacy physical-order properties.

### 1.2 Existing Join in `web/src/collections/Users/index.ts`
In `web/src/collections/Users/index.ts` (lines 71–79):
```typescript
{
  name: 'orders',
  type: 'join',
  collection: 'orders',
  on: 'customer',
  admin: {
    allowCreate: false,
    defaultColumns: ['id', 'createdAt', 'total', 'currency', 'items'],
  },
},
```
- In the legacy plugin `orders` collection, the relationship field to `users` was named `customer`.
- For our dedicated digital `Orders` collection, the user relation field is named `buyer` per prompt specification and PLAN.md §11.
- In Payload CMS 3.x, if a `join` field defines `on: 'customer'` but collection `orders` has no `customer` field, Payload schema initialization will throw a runtime relationship validation error. Therefore, `Users.fields.orders` must be updated to `on: 'buyer'`.

### 1.3 Money-Path & Access Patterns
In `web/src/access/canEditMoney.ts`:
```typescript
export const canEditMoney: Access = () => false
```
In `web/src/access/financialAccess.ts`:
```typescript
export const walletLedgerReadAccess: Access = ({ req: { user } }) => {
  if (!user) return false
  if (checkRole(['admin', 'financeAdmin'], user)) return true
  return { user: { equals: user.id } }
}
```
Per Decision 0002 (`docs/decisions/0002-money-write-layer.md`):
- All write paths (`create`, `update`, `delete`) on financial and transactional collections are blocked for all external principals (including admin) via access control returning `false`.
- Writes only execute through internal server code (Payload Local API with `overrideAccess: true`) inside a PostgreSQL transaction (`payload.db.beginTransaction`).

### 1.4 Anti-Self-Purchase (BR-04) & Snapshot Price (BR-07)
- `PLAN.md:1405-1412` defines **BR-04**: "Seller không tự mua sản phẩm của mình" to prevent fake sales, fake reviews, and commission washing.
- `PLAN.md:1436-1439` defines **BR-07**: "Giá tại order là snapshot — Nếu seller đổi giá sau đó, order cũ không đổi."
- `Products` collection (`web/src/collections/Products/index.ts:280`) defines `seller` as a relationship to `users`.

---

## 2. Logic Chain

### Step 1: Disabling Plugin Orders
1. Setting `orders: false` in `ecommercePlugin(...)` inside `web/src/plugins/index.ts` causes `sanitizedPluginConfig.orders` to be `false`.
2. As observed in `node_modules/@payloadcms/plugin-ecommerce/dist/index.js:116`, the plugin will skip `incomingConfig.collections.push(ordersCollection)`.
3. Cleaning up `collections.properties.orders` in `incomingConfig.typescript.schema` mirroring `carts` prevents type generation issues and removes legacy ecommerce order references.

### Step 2: Designing Digital `Orders` Collection (`slug: 'orders'`)
1. Required fields:
   - `code`: unique string identifier, indexed. Must be generated or defaulted if not supplied.
   - `buyer`: relationship to `users` (required, indexed).
   - `totalAmount`: non-negative integer representing VND (min 0).
   - `currency`: select `['VND']`, default `'VND'`, required.
   - `status`: select `['PENDING', 'COMPLETED', 'CANCELLED']`, default `'PENDING'`, indexed.
   - `paymentSource`: select `['wallet', 'free']`, default `'wallet'`.
   - `paidAt`: date field recording timestamp of successful debit/checkout.
   - `notes`: textarea for notes.
   - `items`: join field to `order_items` `on: 'order'` for admin UI inspection.
2. Access Control (`orderAccess.ts`):
   - `read`: Allows `admin` and `financeAdmin` unrestricted access. Allows authenticated users to view only their own orders (`{ buyer: { equals: user.id } }`). Denies unauthenticated access.
   - `create`: Denied (`() => false`) via REST; creations occur via internal purchase service.
   - `update`: Denied (`() => false`) via REST.
   - `delete`: Denied (`() => false`) via REST; immutable records.

### Step 3: Designing Digital `OrderItems` Collection (`slug: 'order_items'`)
1. Required fields:
   - `order`: relationship to `orders` (required, indexed).
   - `product`: relationship to `products` (required, indexed).
   - `seller`: relationship to `users` (required, indexed).
   - `salePrice`: number (min 0, snapshot price at purchase time, BR-07).
   - `platformFee`: number (min 0, fee deducted by platform, VND).
   - `sellerAmount`: number (min 0, net amount credited to seller, VND).
   - `tax`: number (min 0, tax applied, default 0, VND).
   - `policyVersion`: text (default `'v1'`, tracking fee structure).
2. Access Control:
   - `read`: Allows `admin` and `financeAdmin`. Allows order buyer and product seller:
     ```typescript
     {
       or: [
         { seller: { equals: user.id } },
         { 'order.buyer': { equals: user.id } }
       ]
     }
     ```
   - `create`: Denied (`() => false`) via REST.
   - `update`: Denied (`() => false`) via REST.
   - `delete`: Denied (`() => false`) via REST.

### Step 4: Enforcing Invariants
1. **BR-04 (Anti-Self-Purchase)**:
   - Implemented as a `beforeValidate` hook `validateAntiSelfPurchase` on `order_items`.
   - The hook queries `product.seller` from the database to ensure the seller ID cannot be spoofed.
   - It checks `buyerId` from the linked order (or `req.user`).
   - If `String(buyerId) === String(productSellerId)`, it throws a `ValidationError` / `APIError`: `"Anti-self-purchase invariant violated (BR-04): Sellers cannot purchase their own products."`
2. **BR-07 (Immutability of Snapshot Prices)**:
   - Implemented as a `beforeChange` hook `preventOrderItemMutation` on `order_items`.
   - If `operation === 'update'`, it throws an Error: `"Order items are immutable (BR-07). Updating an existing order item is strictly prohibited."`

### Step 5: Integration and Registration
1. `Users` collection join field updated to `on: 'buyer'`.
2. Both `Orders` and `OrderItems` imported and registered in `web/src/payload.config.ts` under `collections`.

---

## 3. Implementation Code Specifications

### 3.1 Plugin Configuration Update: `web/src/plugins/index.ts`
```typescript
// Replace lines 91-118 with:
    orders: false,

// Update lines 144-153 to also prune orders from ecommerce schema:
    incomingConfig.typescript.schema.push(({ jsonSchema }) => {
      const collections = (jsonSchema?.properties?.ecommerce as any)?.properties?.collections
      if (collections?.properties?.carts) {
        delete collections.properties.carts
      }
      if (Array.isArray(collections?.required)) {
        collections.required = collections.required.filter((s: string) => s !== 'carts')
      }
      if (collections?.properties?.orders) {
        delete collections.properties.orders
      }
      if (Array.isArray(collections?.required)) {
        collections.required = collections.required.filter((s: string) => s !== 'orders')
      }
      return jsonSchema
    })
```

### 3.2 Access Control: `web/src/access/orderAccess.ts`
```typescript
import type { Access, Where } from 'payload'
import { checkRole } from '@/access/utilities'

/**
 * Read access for orders:
 * - Admin and FinanceAdmin can view all orders.
 * - Authenticated users can only view orders where they are the buyer.
 * - Unauthenticated users are denied.
 */
export const orderReadAccess: Access = ({ req: { user } }) => {
  if (!user) return false

  if (checkRole(['admin', 'financeAdmin'], user)) {
    return true
  }

  const query: Where = {
    buyer: {
      equals: user.id,
    },
  }

  return query
}

/**
 * Direct create, update, delete on orders are denied for all principals via REST/GraphQL.
 * All state transitions and creation must go through the dedicated purchase/order service.
 */
export const orderCreateAccess: Access = () => false
export const orderUpdateAccess: Access = () => false
export const orderDeleteAccess: Access = () => false

/**
 * Read access for order items:
 * - Admin and FinanceAdmin can view all order items.
 * - Sellers can view order items for their products.
 * - Buyers can view order items for their orders.
 * - Unauthenticated users are denied.
 */
export const orderItemReadAccess: Access = ({ req: { user } }) => {
  if (!user) return false

  if (checkRole(['admin', 'financeAdmin'], user)) {
    return true
  }

  const query: Where = {
    or: [
      {
        seller: {
          equals: user.id,
        },
      },
      {
        'order.buyer': {
          equals: user.id,
        },
      },
    ],
  }

  return query
}

export const orderItemCreateAccess: Access = () => false
export const orderItemUpdateAccess: Access = () => false
export const orderItemDeleteAccess: Access = () => false
```

### 3.3 Orders Collection: `web/src/collections/Orders/index.ts`
```typescript
import type { CollectionConfig } from 'payload'
import crypto from 'crypto'
import {
  orderCreateAccess,
  orderDeleteAccess,
  orderReadAccess,
  orderUpdateAccess,
} from '@/access/orderAccess'

export const Orders: CollectionConfig = {
  slug: 'orders',
  access: {
    create: orderCreateAccess,
    delete: orderDeleteAccess,
    read: orderReadAccess,
    update: orderUpdateAccess,
  },
  admin: {
    defaultColumns: ['code', 'buyer', 'totalAmount', 'currency', 'status', 'paymentSource', 'paidAt', 'createdAt'],
    group: 'Commerce',
    useAsTitle: 'code',
    description: 'Đơn hàng kỹ thuật số (Digital Orders - Immutable Snapshot Price)',
  },
  fields: [
    {
      name: 'code',
      type: 'text',
      required: true,
      unique: true,
      index: true,
      label: 'Mã đơn hàng',
      admin: {
        readOnly: true,
        description: 'Mã định danh duy nhất của đơn hàng (VD: ORD-20260915-XXXXX)',
      },
      hooks: {
        beforeValidate: [
          ({ value, operation }) => {
            if (operation === 'create' && !value) {
              const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '')
              const randomSuffix = crypto.randomBytes(3).toString('hex').toUpperCase()
              return `ORD-${dateStr}-${randomSuffix}`
            }
            return value
          },
        ],
      },
    },
    {
      name: 'buyer',
      type: 'relationship',
      relationTo: 'users',
      required: true,
      index: true,
      label: 'Người mua',
      admin: {
        readOnly: true,
      },
    },
    {
      name: 'totalAmount',
      type: 'number',
      required: true,
      min: 0,
      label: 'Tổng tiền (VND)',
      admin: {
        readOnly: true,
        step: 1,
        description: 'Tổng giá trị đơn hàng tính theo VND',
      },
    },
    {
      name: 'currency',
      type: 'select',
      required: true,
      defaultValue: 'VND',
      options: [
        { label: 'VND (Việt Nam Đồng)', value: 'VND' },
      ],
      admin: {
        readOnly: true,
      },
    },
    {
      name: 'status',
      type: 'select',
      required: true,
      defaultValue: 'PENDING',
      index: true,
      label: 'Trạng thái đơn hàng',
      options: [
        { label: 'Chờ xử lý (PENDING)', value: 'PENDING' },
        { label: 'Hoàn thành (COMPLETED)', value: 'COMPLETED' },
        { label: 'Đã hủy (CANCELLED)', value: 'CANCELLED' },
      ],
      admin: {
        readOnly: true,
      },
    },
    {
      name: 'paymentSource',
      type: 'select',
      required: true,
      defaultValue: 'wallet',
      label: 'Nguồn thanh toán',
      options: [
        { label: 'Ví nội bộ (Internal Wallet)', value: 'wallet' },
        { label: 'Tải miễn phí (Free Asset)', value: 'free' },
      ],
      admin: {
        readOnly: true,
      },
    },
    {
      name: 'paidAt',
      type: 'date',
      label: 'Thời điểm thanh toán',
      admin: {
        readOnly: true,
        description: 'Thời điểm hoàn tất thanh toán và cấp quyền sở hữu',
      },
    },
    {
      name: 'notes',
      type: 'textarea',
      label: 'Ghi chú',
      admin: {
        description: 'Ghi chú nội bộ hoặc thông tin bổ sung về đơn hàng',
      },
    },
    {
      name: 'items',
      type: 'join',
      collection: 'order_items',
      on: 'order',
      label: 'Các mục trong đơn hàng',
      admin: {
        allowCreate: false,
        defaultColumns: ['product', 'seller', 'salePrice', 'platformFee', 'sellerAmount'],
      },
    },
  ],
}
```

### 3.4 Invariants Hook: `web/src/collections/OrderItems/hooks/validateAntiSelfPurchase.ts`
```typescript
import type { CollectionBeforeValidateHook } from 'payload'
import { ValidationError } from 'payload'

/**
 * Enforces BR-04: Sellers are strictly prohibited from purchasing their own products.
 *
 * Checks authoritative seller on the referenced product against the order buyer.
 * If buyer === seller, throws ValidationError to reject creation.
 */
export const validateAntiSelfPurchase: CollectionBeforeValidateHook = async ({
  data,
  req,
  operation,
}) => {
  if (operation !== 'create' || !data) return data

  const productId = typeof data.product === 'object' ? data.product?.id : data.product
  if (!productId) {
    return data
  }

  // 1. Fetch product to obtain authoritative seller ID
  const product = await req.payload.findByID({
    collection: 'products',
    id: productId,
    depth: 0,
    req,
  })

  if (!product) {
    throw new ValidationError({
      errors: [{ field: 'product', message: `Product ${productId} does not exist.` }],
    })
  }

  const sellerId = typeof product.seller === 'object' ? product.seller?.id : product.seller
  if (!sellerId) {
    throw new ValidationError({
      errors: [{ field: 'seller', message: `Product ${productId} has no assigned seller.` }],
    })
  }

  // Ensure data.seller matches the authoritative product seller
  data.seller = sellerId

  // 2. Resolve buyer ID from order or req.user
  let buyerId: string | number | undefined

  if (data.order) {
    if (typeof data.order === 'object' && (data.order as any).buyer) {
      const orderBuyer = (data.order as any).buyer
      buyerId = typeof orderBuyer === 'object' ? orderBuyer?.id : orderBuyer
    } else {
      const orderId = typeof data.order === 'object' ? data.order?.id : data.order
      if (orderId) {
        const order = await req.payload.findByID({
          collection: 'orders',
          id: orderId,
          depth: 0,
          req,
        })
        if (order) {
          buyerId = typeof order.buyer === 'object' ? order.buyer?.id : order.buyer
        }
      }
    }
  }

  if (!buyerId && req.user) {
    buyerId = req.user.id
  }

  // 3. Enforce BR-04
  if (buyerId && String(buyerId) === String(sellerId)) {
    throw new ValidationError({
      errors: [
        {
          field: 'product',
          message: 'Anti-self-purchase invariant violated (BR-04): Sellers cannot purchase their own products.',
        },
      ],
    })
  }

  return data
}
```

### 3.5 Immutability Hook: `web/src/collections/OrderItems/hooks/preventOrderItemMutation.ts`
```typescript
import type { CollectionBeforeChangeHook } from 'payload'

/**
 * Enforces BR-07: Snapshot price and order items are strictly immutable once created.
 */
export const preventOrderItemMutation: CollectionBeforeChangeHook = ({ operation }) => {
  if (operation === 'update') {
    throw new Error('Order items are immutable (BR-07). Modifying an existing order item is strictly prohibited.')
  }
}
```

### 3.6 OrderItems Collection: `web/src/collections/OrderItems/index.ts`
```typescript
import type { CollectionConfig } from 'payload'
import {
  orderItemCreateAccess,
  orderItemDeleteAccess,
  orderItemReadAccess,
  orderItemUpdateAccess,
} from '@/access/orderAccess'
import { validateAntiSelfPurchase } from './hooks/validateAntiSelfPurchase'
import { preventOrderItemMutation } from './hooks/preventOrderItemMutation'

export const OrderItems: CollectionConfig = {
  slug: 'order_items',
  access: {
    create: orderItemCreateAccess,
    delete: orderItemDeleteAccess,
    read: orderItemReadAccess,
    update: orderItemUpdateAccess,
  },
  admin: {
    defaultColumns: ['order', 'product', 'seller', 'salePrice', 'platformFee', 'sellerAmount', 'tax', 'createdAt'],
    group: 'Commerce',
    useAsTitle: 'id',
    description: 'Chi tiết sản phẩm đơn hàng snapshot bất biến (BR-07)',
  },
  hooks: {
    beforeValidate: [validateAntiSelfPurchase],
    beforeChange: [preventOrderItemMutation],
  },
  fields: [
    {
      name: 'order',
      type: 'relationship',
      relationTo: 'orders',
      required: true,
      index: true,
      label: 'Đơn hàng',
      admin: {
        readOnly: true,
      },
    },
    {
      name: 'product',
      type: 'relationship',
      relationTo: 'products',
      required: true,
      index: true,
      label: 'Sản phẩm',
      admin: {
        readOnly: true,
      },
    },
    {
      name: 'seller',
      type: 'relationship',
      relationTo: 'users',
      required: true,
      index: true,
      label: 'Người bán',
      admin: {
        readOnly: true,
      },
    },
    {
      name: 'salePrice',
      type: 'number',
      required: true,
      min: 0,
      label: 'Giá bán snapshot (VND)',
      admin: {
        readOnly: true,
        step: 1,
        description: 'Giá bán snapshot tại thời điểm đặt hàng (BR-07)',
      },
    },
    {
      name: 'platformFee',
      type: 'number',
      required: true,
      min: 0,
      defaultValue: 0,
      label: 'Phí sàn (VND)',
      admin: {
        readOnly: true,
        step: 1,
        description: 'Phí hoa hồng sàn thu',
      },
    },
    {
      name: 'sellerAmount',
      type: 'number',
      required: true,
      min: 0,
      label: 'Doanh thu người bán (VND)',
      admin: {
        readOnly: true,
        step: 1,
        description: 'Số tiền thực nhận của người bán (salePrice - platformFee - tax)',
      },
    },
    {
      name: 'tax',
      type: 'number',
      required: true,
      min: 0,
      defaultValue: 0,
      label: 'Thuế (VND)',
      admin: {
        readOnly: true,
        step: 1,
        description: 'Thuế áp dụng',
      },
    },
    {
      name: 'policyVersion',
      type: 'text',
      required: true,
      defaultValue: 'v1',
      label: 'Phiên bản chính sách phí',
      admin: {
        readOnly: true,
        description: 'Phiên bản chính sách phân chia doanh thu áp dụng tại thời điểm giao dịch',
      },
    },
  ],
}
```

### 3.7 Alignment in `web/src/collections/Users/index.ts`
```typescript
// Update lines 71-79:
    {
      name: 'orders',
      type: 'join',
      collection: 'orders',
      on: 'buyer', // Changed from 'customer' to match Orders.buyer
      admin: {
        allowCreate: false,
        defaultColumns: ['id', 'code', 'createdAt', 'totalAmount', 'status'],
      },
    },
```

### 3.8 Config Registration: `web/src/payload.config.ts`
```typescript
// Import Orders and OrderItems:
import { Orders } from '@/collections/Orders'
import { OrderItems } from '@/collections/OrderItems'

// Add to collections array:
  collections: [
    Users,
    Pages,
    Categories,
    Media,
    SoftwareTypes,
    Tags,
    ProductPreviews,
    ProductFiles,
    Products,
    SellerProfiles,
    Wallets,
    WalletLedger,
    PaymentIntents,
    PaymentTransactions,
    PaymentWebhookEvents,
    Orders,
    OrderItems,
  ],
```

---

## 4. Caveats

1. **Database Schema Replacement (Batch 6 DDL)**:
   In initial migration Batch 1 (`20260915_020514_initial.ts`), old ecommerce template tables `orders` and `orders_items` were created with 0 records. As m1_explorer_3 investigates Batch 6 migration, those empty legacy tables should be dropped (`DROP TABLE IF EXISTS "orders_items", "orders" CASCADE;`) and recreated with our exact columns (`buyer_id`, `total_amount`, `sale_price`, `seller_id`, etc.).
2. **Storefront Orders Page Refactor (Phase 5 UI / Milestone 4)**:
   `web/src/app/(app)/(account)/orders/page.tsx` and `web/src/app/(app)/(account)/orders/[id]/page.tsx` currently query `where: { customer: { equals: user.id } }`. When Milestone 4 updates the UI, these queries will use `buyer: { equals: user.id }` and read the snapshot fields (`totalAmount`, `items`).
3. **Double Verification of Invariant BR-04**:
   The `validateAntiSelfPurchase` hook enforces BR-04 inside Payload. The purchase service in `src/services/purchase.ts` (Milestone 2) should also validate `user.id !== product.seller` before initiating the wallet debit transaction, providing defensive validation at both layers.

---

## 5. Conclusion
- `@payloadcms/plugin-ecommerce` orders can be cleanly disabled by specifying `orders: false` in `plugins/index.ts` and removing `orders` from the typescript JSON schema, without impacting `transactions` or Stripe adapter features.
- Dedicated `Orders` (`slug: 'orders'`) and `OrderItems` (`slug: 'order_items'`) collections completely satisfy all business rules:
  - Atomic access control denies direct REST CRUD while allowing buyer and seller read access.
  - Snapshot pricing is locked and immutable (BR-07).
  - BR-04 is mechanically enforced via authoritative seller verification and comparison in `validateAntiSelfPurchase`.
  - Updating `Users` join `on: 'buyer'` eliminates relationship schema conflicts.

---

## 6. Verification Method

### 6.1 Type Generation Verification
Run:
```bash
pnpm --prefix web generate:types
```
Verify that `Order` in `web/src/payload-types.ts` contains `buyer: (number | null) | User`, `totalAmount: number`, `status: 'PENDING' | 'COMPLETED' | 'CANCELLED'`, and `OrderItem` contains `salePrice: number`, `seller: (number | null) | User`, etc.

### 6.2 Lint & Build Check
Run:
```bash
pnpm --prefix web lint
pnpm --prefix web build
```
Verify 0 lint errors and successful Next.js compile.

### 6.3 Unit / Integration Verification
When tests are added in `tests/int/purchase-invariants.int.spec.ts`:
1. **BR-04 Anti-Self-Purchase**:
   Attempt to create an `order_item` where buyer and product seller are the same user.
   *Expected result*: Error thrown (`Anti-self-purchase invariant violated (BR-04)`).
2. **BR-07 Immutability**:
   Attempt to call `payload.update({ collection: 'order_items', id, data: { salePrice: 999999 } })`.
   *Expected result*: Error thrown (`Order items are immutable (BR-07)`).
3. **Access Control**:
   Attempt `fetch('/api/orders', { method: 'POST', body: ... })` with user JWT.
   *Expected result*: HTTP 403 Forbidden.
