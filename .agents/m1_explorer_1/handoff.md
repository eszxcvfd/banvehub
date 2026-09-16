# Handoff Report: Phase 6 Milestone 1 — Focus Area 1 (`seller_earnings` Collection & `Orders` Status Extension)

**Author**: `m1_explorer_1` (teamwork_preview_explorer)  
**Date**: 2026-09-15  
**Target Milestone**: Milestone 1 (Focus Area 1: `seller_earnings` Collection, `Orders` Status Extension, and `SellerProfiles` Commission Override)  
**Status**: Completed (Hard Handoff)  
**Recipients**: Orchestrator (`97815561-5c1e-4548-8e83-6acb89c4e2aa`), `m1_worker_1`, Implementation Team

---

## 1. Observation

Direct observations from the repository codebase, architecture documentation, and test suites:

### 1.1 Requirements in `ORIGINAL_REQUEST.md` (lines 86-97, 110-118, 138-149)
- **R1. Commission Calculation & Seller Earnings**:
  - *"Platform fee = sale_price × commission_rate (configurable, not hard-coded per PLAN.md §6.3)"*
  - *"Seller amount = sale_price - platform_fee"*
  - *"Commission configuration must support: site-wide default rate, per-seller override rate, and per-campaign rate. Changes to commission rate must not affect existing orders (BR-07)."*
  - *"Each OrderItem already stores snapshot fields (salePrice, platformFee, sellerAmount). The purchase service must populate these correctly."*
  - *"A seller_earnings record is created with status PENDING upon order completion."*
  - *"After the configurable hold period (default 7 days, per FR-31), status transitions PENDING → AVAILABLE."*
  - *"The hold period exists to allow time for refund/fraud processing."*
- **R3. Refund & Order Status**:
  - *"Refund flow: create refund record → lock original transaction → credit buyer wallet via reversal entry → reverse seller earning → reverse platform revenue → update order status → optionally revoke entitlement → audit log."*
  - *"Refunded orders must reflect the refunded state without altering the original purchase records."*

### 1.2 Existing Orders Collection (`web/src/collections/Orders/index.ts:92-106`)
- Verbatim field definition:
  ```typescript
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
  ```
- Access control (`web/src/access/orderAccess.ts:10-33`):
  - `orderReadAccess`: Authenticated user can read orders where `buyer === user.id`. Admin and financeAdmin can read all orders.
  - `orderCreateAccess`: `() => false` (denies direct creation via REST).
  - `orderUpdateAccess`: `() => false` (denies direct mutation via REST).
  - `orderDeleteAccess`: `() => false` (denies direct deletion via REST).
  - Orders are only created/updated via trusted server-side services (`purchaseProduct`, `refundOrder`) using `overrideAccess: true`.
- Existing hooks (`web/src/collections/Orders/index.ts:45-56`):
  - `beforeValidate`: Auto-generates unique order code `ORD-YYYYMMDD-XXXXXX` on create if not provided.
- Consumer files observing `status`:
  - `web/src/app/api/v1/me/orders/route.ts:39`:
    `if (statusParam && ['PENDING', 'COMPLETED', 'CANCELLED'].includes(statusParam.toUpperCase()))`
    Needs to include `'REFUNDED'`.
  - `web/src/components/OrderStatus/index.tsx:17-21`:
    Maps CSS badges for `PENDING`, `COMPLETED`, `CANCELLED`. Needs styling for `REFUNDED`.

### 1.3 Existing SellerProfiles Collection (`web/src/collections/SellerProfiles.ts:94-133`)
- Current fields:
  - `user`: relationship to `users` (required, unique, sidebar).
  - `displayName`: text (required).
  - `bio`, `avatar`, `phone`.
  - `payoutInfo`: group (`bankName`, `accountNumber`, `accountHolderName`).
  - `sellerTermsAccepted`: checkbox (required).
  - `status`: select (`pending`, `active`, `suspended`, `rejected`), access update: `adminOrModeratorFieldAccess`.
  - `totalSales`, `rating`: number, access update: `adminOrModeratorFieldAccess`.
- Observation on commission:
  - Currently has no `commissionRate` field.
  - Sits at collection-level access: `update: sellerProfileUpdateAccess` (allows authenticated seller to update own profile).
  - Therefore, any new `commissionRate` field **MUST** have field-level access control restricting updates to `admin` and `financeAdmin`, preventing sellers from modifying their own commission rate.
  - Public visitors (`sellerProfileReadAccess`) must not see internal contractual commission rates.

### 1.4 Money Write Layer & Immutability Decisions
- **`docs/decisions/0002-money-write-layer.md:39-53`**:
  - *"Direct writes denied for every principal, including administrators. Money collections deny create, update, and delete through Payload access control for all roles and expose read only."*
- **`web/src/access/canEditMoney.ts:15-21`**:
  ```typescript
  export const canEditMoney: Access = () => false
  export const canEditMoneyField = (): boolean => false
  ```
- **`docs/decisions/0008-role-model.md` & `PLAN.md §22` (Authorization Matrix)**:
  - Finance Admin (`financeAdmin`) & Super Admin (`admin`): Full read access to earnings, ledger, withdrawals, and refunds.
  - Seller (`seller`): Read access restricted to own earnings (`seller === user.id`).
  - Buyer / Guest: Zero access to seller earnings.

### 1.5 Existing Integration Test Suite (`web/tests/int/seller-earnings.int.spec.ts`)
- The test suite exists and tests:
  - Rate resolution: site-wide default fallback (0.30 / 30%), seller override (0.20 / 20%), campaign override (0.10 / 10%).
  - Integer VND arithmetic: `platformFee = Math.round(salePrice * rate)`, `sellerAmount = salePrice - platformFee`, `platformFee + sellerAmount === salePrice`. Zero remainder across odd amounts (e.g. 199,000 VND, 100,001 VND, 7 VND, 1 VND).
  - Collection creation: Creates `seller_earnings` with `status: 'PENDING'`, `seller`, `order`, `salePrice`, `platformFee`, `sellerAmount`, `holdUntil` (now + 7 days ± 5 minutes).
  - Hold period maturation: transitions `PENDING → AVAILABLE` when `asOf >= holdUntil`.
  - Balance aggregation: `totalEarned`, `pendingBalance`, `availableBalance`, `reservedBalance`, `withdrawnTotal`.

---

## 2. Logic Chain

From the direct observations above, we establish the following step-by-step reasoning:

1. **Orders Status Extension Requirement**:
   - Observation 1.1 & 1.2 demonstrate that `Orders` currently defines `enum_orders_status` with `['PENDING', 'COMPLETED', 'CANCELLED']`.
   - Flow FLOW-U15 and R3 mandate that when a refund occurs, the order status must transition to `REFUNDED` to indicate that the purchase contract was reversed.
   - Adding `'REFUNDED'` to `Orders.status` options in `web/src/collections/Orders/index.ts` extends the collection schema.
   - `orderAccess.ts` already sets `orderUpdateAccess: () => false`, guaranteeing that client-side REST calls cannot tamper with order statuses.
   - The PostgreSQL migration must issue `ALTER TYPE "public"."enum_orders_status" ADD VALUE 'REFUNDED';`.
   - `web/src/app/api/v1/me/orders/route.ts` must allow filtering by `'REFUNDED'` so buyers and sellers can query refunded orders.

2. **SellerProfiles Commission Rate Override**:
   - Observation 1.1 mandates supporting a per-seller commission override rate that takes precedence over the site-wide default (PLAN.md §6.3).
   - In `web/src/collections/SellerProfiles.ts`, adding an optional `commissionRate` field (`type: 'number'`, `min: 0`, `max: 1`, `step: 0.01`) represents the percentage as a decimal (e.g., `0.25` for 25%).
   - Because `SellerProfiles` allows seller profile owners to edit their profile (`displayName`, `bio`, `payoutInfo`), `commissionRate` **must** have strict field-level access:
     - `update: adminOrFinanceAdminFieldAccess` (only `admin` and `financeAdmin` can modify).
     - `read`: only `admin`, `financeAdmin`, or the profile's owner (`seller`). Public visitors browsing `/sellers/[slug]` must never see private commission rates.
   - In PostgreSQL, `commission_rate numeric` with check constraint `CHECK (commission_rate IS NULL OR (commission_rate >= 0 AND commission_rate <= 1))` ensures database integrity.

3. **`seller_earnings` Collection Architecture & Field Specification**:
   - Under FR-31, BR-07, and Decision 0002, seller revenue must be recorded in an immutable ledger collection named `seller_earnings`.
   - Each purchased `order_item` corresponds to exactly one `seller_earnings` record. Therefore, `orderItem` relationship field has `unique: true` and `index: true`, enforcing a strict 1-to-1 invariant.
   - Fields required:
     - `seller` (`relationship` to `users`, required, indexed).
     - `order` (`relationship` to `orders`, required, indexed).
     - `orderItem` (`relationship` to `order_items`, required, unique, indexed).
     - `product` (`relationship` to `products`, required, indexed).
     - `salePrice` (`number`, min 0, integer VND, snapshot of sale price).
     - `platformFee` (`number`, min 0, integer VND, snapshot of platform fee).
     - `sellerAmount` (`number`, min 0, integer VND, snapshot of seller net amount).
     - `commissionRate` (`number`, min 0, max 1, snapshot of applied commission rate).
     - `currency` (`select`, options `['VND']`, default `'VND'`).
     - `status` (`select`, options `['PENDING', 'AVAILABLE', 'REVERSED', 'PAID']`, default `'PENDING'`, indexed).
     - `holdPeriodDays` (`number`, default 7, min 0).
     - `holdUntil` (`date`, required, indexed).
     - `availableAt` (`date`, optional, populated upon hold release).
     - `paidAt` (`date`, optional, populated upon withdrawal payout).
     - `reversedAt` (`date`, optional, populated upon refund reversal).
     - `policyVersion` (`text`, required, default `'v1'`).
     - `notes` (`textarea`, optional).

4. **Access Control Layer**:
   - Following Decision 0002 (`docs/decisions/0002-money-write-layer.md`), `create`, `update`, and `delete` on `seller_earnings` must use `canEditMoney` (`() => false`).
   - Read access (`sellerEarningsReadAccess`):
     - `admin` and `financeAdmin`: `return true` (unrestricted read).
     - Authenticated users: `{ seller: { equals: user.id } }` (read own earnings only).
     - Unauthenticated guests and buyers: `return false`.

5. **Invariants & Lifecycle Hooks**:
   - **`calculateHoldUntil` (`beforeValidate`)**: If `holdUntil` is not set on creation, compute `holdUntil = new Date(Date.now() + (holdPeriodDays ?? 7) * 86400000).toISOString()`. If `holdPeriodDays === 0`, immediately set `status = 'AVAILABLE'` and `availableAt = new Date().toISOString()`.
   - **`validateEarningMath` (`beforeValidate`)**: Enforce integer arithmetic and exact balance equation:
     `salePrice === platformFee + sellerAmount`. Reject any drift or phantom currency.
   - **`preventEarningMutation` (`beforeChange`)**:
     - Snapshot fields (`seller`, `order`, `orderItem`, `product`, `salePrice`, `platformFee`, `sellerAmount`, `commissionRate`, `currency`, `holdPeriodDays`, `policyVersion`) are immutable once created.
     - Status state machine validation:
       - Allowed: `PENDING → AVAILABLE`, `PENDING → REVERSED`, `AVAILABLE → PAID`, `AVAILABLE → REVERSED`.
       - Terminal states: `PAID` and `REVERSED` can never change status.
       - Backward transitions (e.g. `AVAILABLE → PENDING`) are strictly forbidden.
     - Timestamp stamping: Automatically set `availableAt`, `paidAt`, or `reversedAt` when transitioning into corresponding statuses.

6. **PostgreSQL Database Indices & Constraints**:
   - Unique btree index: `CREATE UNIQUE INDEX "seller_earnings_order_item_idx" ON "seller_earnings" ("order_item_id");`
     Guarantees idempotency — no duplicate earning records can ever be created for the same order item.
   - Composite index for the release cron job:
     `CREATE INDEX "seller_earnings_status_hold_until_idx" ON "seller_earnings" ("status", "hold_until");`
     Enables sub-millisecond execution of `SELECT ... WHERE status = 'PENDING' AND hold_until <= NOW()`.
   - Database check constraints:
     - `CHECK ("sale_price" >= 0)`
     - `CHECK ("platform_fee" >= 0)`
     - `CHECK ("seller_amount" >= 0)`
     - `CHECK ("commission_rate" >= 0 AND "commission_rate" <= 1)`
     - `CHECK ("hold_period_days" >= 0)`
     - `CHECK ("seller_amount" + "platform_fee" = "sale_price")`

---

## 3. Caveats

1. **Zero Tax Assumption in Current Phase**:
   Vietnamese digital marketplace platform fees currently operate under net revenue split without separate VAT deduction in `seller_earnings` (`tax = 0`). The `OrderItem` collection already includes a `tax` field (default 0), and if taxation policy changes in the future, the conservation equation would adapt to `salePrice = platformFee + sellerAmount + tax`.
2. **Reverse Refund after Payout**:
   If an order is refunded after its earning has already been transitioned to `PAID` (i.e., seller has already withdrawn funds to their bank), a reversal of the earning creates a negative balance / clawback obligation on the seller's wallet balance (handled in Milestone 2/3 via compensating ledger entries per FLOW-U15 and BR-03).
3. **Database Migration Dependencies**:
   The migration for `seller_earnings` relies on foreign keys to `users`, `orders`, `order_items`, and `products`. Since Phase 5 created `orders` and `order_items`, Batch 7 migrations can safely reference them.

---

## 4. Conclusion & Concrete Implementation Code

The exact code designs for all Focus Area 1 files are specified below.

### 4.1 `web/src/collections/Orders/index.ts` (Modified)
Add `{ label: 'Đã hoàn tiền (REFUNDED)', value: 'REFUNDED' }` to `status.options`:

```typescript
// Target file: web/src/collections/Orders/index.ts
// Lines 92-106 updated to:

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
        { label: 'Đã hoàn tiền (REFUNDED)', value: 'REFUNDED' },
      ],
      admin: {
        readOnly: true,
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
    {
      name: 'earnings',
      type: 'join',
      collection: 'seller_earnings',
      on: 'order',
      label: 'Thu nhập người bán từ đơn hàng',
      admin: {
        allowCreate: false,
      },
    },
```

### 4.2 `web/src/access/sellerProfileAccess.ts` (Updated)
Add `adminOrFinanceAdminFieldAccess` and update read protection for private commission rates:

```typescript
// Target file: web/src/access/sellerProfileAccess.ts
import type { Access, FieldAccess, Where } from 'payload'
import { checkRole } from '@/access/utilities'

// ... (existing sellerProfileReadAccess, sellerProfileUpdateAccess, adminOrModeratorFieldAccess) ...

/**
 * Field-level access for financial administrative fields (e.g. commissionRate):
 * Only Admin and FinanceAdmin can update this field.
 */
export const adminOrFinanceAdminFieldAccess: FieldAccess = ({ req: { user } }) => {
  if (user) {
    return checkRole(['admin', 'financeAdmin'], user)
  }
  return false
}

/**
 * Field-level read access for commissionRate:
 * Admin, FinanceAdmin, and the profile owner (seller) can read.
 * Public visitors cannot view internal commission rates.
 */
export const commissionRateReadAccess: FieldAccess = ({ req: { user }, doc }) => {
  if (!user) return false
  if (checkRole(['admin', 'financeAdmin'], user)) return true
  const profileUserId = typeof doc?.user === 'object' ? doc?.user?.id : doc?.user
  return user.id === profileUserId
}
```

### 4.3 `web/src/collections/SellerProfiles.ts` (Modified)
Add `commissionRate` field definition with access control:

```typescript
// Target file: web/src/collections/SellerProfiles.ts
// Add after 'payoutInfo' or before 'status':

    {
      name: 'commissionRate',
      type: 'number',
      label: 'Tỷ lệ hoa hồng sàn riêng (Commission Rate Override)',
      min: 0,
      max: 1,
      admin: {
        position: 'sidebar',
        step: 0.01,
        description:
          'Tỷ lệ hoa hồng sàn áp dụng riêng cho người bán (0.00 - 1.00, VD: 0.20 = 20%). Nếu để trống sẽ sử dụng tỷ lệ mặc định toàn sàn (30%).',
      },
      access: {
        read: commissionRateReadAccess,
        update: adminOrFinanceAdminFieldAccess,
      },
    },
```

### 4.4 `web/src/access/sellerEarningsAccess.ts` (New File)
Dedicated access control for `SellerEarnings`:

```typescript
// Target file: web/src/access/sellerEarningsAccess.ts
import type { Access, Where } from 'payload'
import { checkRole } from '@/access/utilities'

/**
 * Read access for seller earnings:
 * - Admin and FinanceAdmin can view all earnings across the platform (PLAN.md §5.5, §22).
 * - Authenticated sellers can only view their own earnings.
 * - Buyers and unauthenticated guests are denied.
 */
export const sellerEarningsReadAccess: Access = ({ req: { user } }) => {
  if (!user) return false

  if (checkRole(['admin', 'financeAdmin'], user)) {
    return true
  }

  const query: Where = {
    seller: {
      equals: user.id,
    },
  }

  return query
}
```

### 4.5 `web/src/collections/SellerEarnings/hooks/calculateHoldUntil.ts` (New File)
Automates hold period date calculation on creation:

```typescript
// Target file: web/src/collections/SellerEarnings/hooks/calculateHoldUntil.ts
import type { CollectionBeforeValidateHook } from 'payload'

export const calculateHoldUntil: CollectionBeforeValidateHook = ({ data, operation }) => {
  if (!data) return data

  if (operation === 'create') {
    const holdDays = typeof data.holdPeriodDays === 'number' ? data.holdPeriodDays : 7

    if (!data.holdUntil) {
      const now = Date.now()
      const holdMs = holdDays * 24 * 60 * 60 * 1000
      data.holdUntil = new Date(now + holdMs).toISOString()
    }

    if (holdDays === 0) {
      data.status = 'AVAILABLE'
      data.availableAt = new Date().toISOString()
    }
  }

  return data
}
```

### 4.6 `web/src/collections/SellerEarnings/hooks/validateEarningMath.ts` (New File)
Enforces financial conservation and non-negativity:

```typescript
// Target file: web/src/collections/SellerEarnings/hooks/validateEarningMath.ts
import type { CollectionBeforeValidateHook } from 'payload'

export const validateEarningMath: CollectionBeforeValidateHook = ({ data, operation }) => {
  if (!data) return data

  if (operation === 'create') {
    const salePrice = Number(data.salePrice ?? 0)
    const platformFee = Number(data.platformFee ?? 0)
    const sellerAmount = Number(data.sellerAmount ?? 0)
    const rate = Number(data.commissionRate ?? 0)

    if (salePrice < 0 || platformFee < 0 || sellerAmount < 0) {
      throw new Error('Financial amounts in seller earnings must be non-negative integers.')
    }

    if (rate < 0 || rate > 1) {
      throw new Error(`Commission rate must be between 0 and 1. Received: ${rate}`)
    }

    // Arithmetic conservation: platformFee + sellerAmount === salePrice
    if (platformFee + sellerAmount !== salePrice) {
      throw new Error(
        `Financial invariant violation: platformFee (${platformFee}) + sellerAmount (${sellerAmount}) does not equal salePrice (${salePrice}).`,
      )
    }
  }

  return data
}
```

### 4.7 `web/src/collections/SellerEarnings/hooks/preventEarningMutation.ts` (New File)
Protects snapshot fields and controls status lifecycle:

```typescript
// Target file: web/src/collections/SellerEarnings/hooks/preventEarningMutation.ts
import type { CollectionBeforeChangeHook } from 'payload'

export const preventEarningMutation: CollectionBeforeChangeHook = ({
  data,
  originalDoc,
  operation,
}) => {
  if (operation === 'update' && originalDoc) {
    // 1. Immutable snapshot fields (BR-07)
    const immutableFields = [
      'seller',
      'order',
      'orderItem',
      'product',
      'salePrice',
      'platformFee',
      'sellerAmount',
      'commissionRate',
      'currency',
      'holdPeriodDays',
      'policyVersion',
    ]

    for (const field of immutableFields) {
      const origVal = typeof originalDoc[field] === 'object' && originalDoc[field] !== null
        ? originalDoc[field].id
        : originalDoc[field]
      const newVal = typeof data[field] === 'object' && data[field] !== null
        ? data[field].id
        : data[field]

      if (newVal !== undefined && String(origVal) !== String(newVal)) {
        throw new Error(
          `Snapshot field "${field}" is immutable and cannot be altered after creation (BR-07).`,
        )
      }
    }

    // 2. State machine transitions
    const prevStatus = originalDoc.status
    const nextStatus = data.status

    if (nextStatus && nextStatus !== prevStatus) {
      const allowedTransitions: Record<string, string[]> = {
        PENDING: ['AVAILABLE', 'REVERSED'],
        AVAILABLE: ['PAID', 'REVERSED'],
        REVERSED: [], // terminal
        PAID: ['REVERSED'], // reversal under refund policy
      }

      const validNext = allowedTransitions[prevStatus] || []
      if (!validNext.includes(nextStatus)) {
        throw new Error(
          `Invalid seller earning state transition from ${prevStatus} to ${nextStatus}.`,
        )
      }

      // 3. Automated timestamp stamping
      const nowIso = new Date().toISOString()
      if (nextStatus === 'AVAILABLE' && !data.availableAt) {
        data.availableAt = nowIso
      } else if (nextStatus === 'PAID' && !data.paidAt) {
        data.paidAt = nowIso
      } else if (nextStatus === 'REVERSED' && !data.reversedAt) {
        data.reversedAt = nowIso
      }
    }
  }

  return data
}
```

### 4.8 `web/src/collections/SellerEarnings/index.ts` (New File)
Main collection config:

```typescript
// Target file: web/src/collections/SellerEarnings/index.ts
import type { CollectionConfig } from 'payload'
import { canEditMoney } from '@/access/canEditMoney'
import { sellerEarningsReadAccess } from '@/access/sellerEarningsAccess'
import { calculateHoldUntil } from './hooks/calculateHoldUntil'
import { preventEarningMutation } from './hooks/preventEarningMutation'
import { validateEarningMath } from './hooks/validateEarningMath'

export const SellerEarnings: CollectionConfig = {
  slug: 'seller_earnings',
  access: {
    create: canEditMoney,
    delete: canEditMoney,
    read: sellerEarningsReadAccess,
    update: canEditMoney,
  },
  admin: {
    defaultColumns: [
      'id',
      'seller',
      'order',
      'product',
      'salePrice',
      'platformFee',
      'sellerAmount',
      'status',
      'holdUntil',
      'createdAt',
    ],
    group: 'Finance',
    useAsTitle: 'id',
    description:
      'Sổ cái doanh thu người bán và chính sách giữ tiền (Seller Earnings - PLAN.md FR-31, BR-03)',
  },
  hooks: {
    beforeValidate: [calculateHoldUntil, validateEarningMath],
    beforeChange: [preventEarningMutation],
  },
  fields: [
    {
      name: 'seller',
      type: 'relationship',
      relationTo: 'users',
      required: true,
      index: true,
      label: 'Người bán',
      admin: {
        readOnly: true,
        position: 'sidebar',
      },
    },
    {
      name: 'order',
      type: 'relationship',
      relationTo: 'orders',
      required: true,
      index: true,
      label: 'Đơn hàng',
      admin: {
        readOnly: true,
        position: 'sidebar',
      },
    },
    {
      name: 'orderItem',
      type: 'relationship',
      relationTo: 'order_items',
      required: true,
      unique: true,
      index: true,
      label: 'Chi tiết mục đơn hàng (1-1)',
      admin: {
        readOnly: true,
        position: 'sidebar',
        description: 'Mục đơn hàng tương ứng (đảm bảo tính duy nhất 1-1, tránh trùng lặp doanh thu)',
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
        position: 'sidebar',
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
        description: 'Giá bán của sản phẩm tại thời điểm giao dịch (snapshot)',
      },
    },
    {
      name: 'platformFee',
      type: 'number',
      required: true,
      min: 0,
      label: 'Phí sàn thu (VND)',
      admin: {
        readOnly: true,
        step: 1,
        description: 'Phí hoa hồng nền tảng (salePrice * commissionRate)',
      },
    },
    {
      name: 'sellerAmount',
      type: 'number',
      required: true,
      min: 0,
      label: 'Thu nhập người bán thực nhận (VND)',
      admin: {
        readOnly: true,
        step: 1,
        description: 'Doanh thu chuyển cho người bán (salePrice - platformFee)',
      },
    },
    {
      name: 'commissionRate',
      type: 'number',
      required: true,
      min: 0,
      max: 1,
      label: 'Tỷ lệ hoa hồng áp dụng',
      admin: {
        readOnly: true,
        step: 0.0001,
        description: 'Tỷ lệ chiết khấu snapshot tại thời điểm giao dịch (BR-07)',
      },
    },
    {
      name: 'currency',
      type: 'select',
      required: true,
      defaultValue: 'VND',
      label: 'Loại tiền tệ',
      options: [{ label: 'VND (Việt Nam Đồng)', value: 'VND' }],
      admin: {
        readOnly: true,
        position: 'sidebar',
      },
    },
    {
      name: 'status',
      type: 'select',
      required: true,
      defaultValue: 'PENDING',
      index: true,
      label: 'Trạng thái thu nhập',
      options: [
        { label: 'Chờ đối soát (PENDING)', value: 'PENDING' },
        { label: 'Khả dụng (AVAILABLE)', value: 'AVAILABLE' },
        { label: 'Đã hoàn tiền / Đảo ngược (REVERSED)', value: 'REVERSED' },
        { label: 'Đã thanh toán (PAID)', value: 'PAID' },
      ],
      admin: {
        position: 'sidebar',
        description: 'Vòng đời: PENDING -> AVAILABLE -> PAID (hoặc REVERSED nếu hoàn tiền)',
      },
    },
    {
      name: 'holdPeriodDays',
      type: 'number',
      required: true,
      defaultValue: 7,
      min: 0,
      label: 'Thời gian giữ tiền (ngày)',
      admin: {
        readOnly: true,
        position: 'sidebar',
        step: 1,
        description: 'Số ngày giữ tiền tạm thời trước khi chuyển thành khả dụng (mặc định 7 ngày)',
      },
    },
    {
      name: 'holdUntil',
      type: 'date',
      required: true,
      index: true,
      label: 'Thời điểm hết hạn giữ tiền',
      admin: {
        readOnly: true,
        position: 'sidebar',
        description: 'Thời điểm thu nhập tự động chuyển sang AVAILABLE (createdAt + holdPeriodDays)',
      },
    },
    {
      name: 'availableAt',
      type: 'date',
      label: 'Thời điểm chuyển khả dụng',
      admin: {
        readOnly: true,
        position: 'sidebar',
        description: 'Thời điểm thu nhập thực tế chuyển sang trạng thái AVAILABLE',
      },
    },
    {
      name: 'paidAt',
      type: 'date',
      label: 'Thời điểm thanh toán',
      admin: {
        readOnly: true,
        position: 'sidebar',
        description: 'Thời điểm hoàn tất chi trả tiền cho người bán qua yêu cầu rút tiền',
      },
    },
    {
      name: 'reversedAt',
      type: 'date',
      label: 'Thời điểm đảo ngược',
      admin: {
        readOnly: true,
        position: 'sidebar',
        description: 'Thời điểm đơn hàng bị hoàn trả và thu nhập bị đảo ngược',
      },
    },
    {
      name: 'policyVersion',
      type: 'text',
      required: true,
      defaultValue: 'v1',
      label: 'Phiên bản chính sách',
      admin: {
        readOnly: true,
        position: 'sidebar',
        description: 'Phiên bản chính sách chiết khấu hoa hồng snapshot',
      },
    },
    {
      name: 'notes',
      type: 'textarea',
      label: 'Ghi chú / Diễn giải',
      admin: {
        description: 'Ghi chú nội bộ, lý do hoàn trả hoặc mã đối soát',
      },
    },
  ],
}
```

### 4.9 Consumer Updates
1. `web/src/app/api/v1/me/orders/route.ts:39`:
   ```typescript
   if (statusParam && ['PENDING', 'COMPLETED', 'CANCELLED', 'REFUNDED'].includes(statusParam.toUpperCase())) {
     where.status = {
       equals: statusParam.toUpperCase(),
     }
   }
   ```
2. `web/src/components/OrderStatus/index.tsx:17-22`:
   ```typescript
   className={cn(
     'text-xs tracking-widest font-mono uppercase py-0.5 px-2.5 rounded-full w-fit font-semibold border',
     className,
     {
       'bg-amber-500/10 text-amber-600 border-amber-500/20': status === 'PENDING',
       'bg-emerald-500/10 text-emerald-600 border-emerald-500/20': status === 'COMPLETED',
       'bg-destructive/10 text-destructive border-destructive/20': status === 'CANCELLED',
       'bg-purple-500/10 text-purple-600 border-purple-500/20': status === 'REFUNDED',
     },
   )}
   ```

### 4.10 PostgreSQL DDL Requirements for Batch 7 Migration
To be included in `20260915_100000_phase6_seller_revenue.ts`:

```sql
-- 1. Orders status ENUM expansion
ALTER TYPE "public"."enum_orders_status" ADD VALUE IF NOT EXISTS 'REFUNDED';

-- 2. Seller profiles commission rate column
ALTER TABLE "seller_profiles" ADD COLUMN IF NOT EXISTS "commission_rate" numeric;
ALTER TABLE "seller_profiles" DROP CONSTRAINT IF EXISTS "seller_profiles_commission_rate_range";
ALTER TABLE "seller_profiles" ADD CONSTRAINT "seller_profiles_commission_rate_range"
  CHECK ("commission_rate" IS NULL OR ("commission_rate" >= 0 AND "commission_rate" <= 1));

-- 3. Seller earnings ENUMs
DO $$ BEGIN
  CREATE TYPE "public"."enum_seller_earnings_currency" AS ENUM('VND');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "public"."enum_seller_earnings_status" AS ENUM('PENDING', 'AVAILABLE', 'REVERSED', 'PAID');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- 4. Seller earnings table
CREATE TABLE IF NOT EXISTS "seller_earnings" (
  "id" serial PRIMARY KEY NOT NULL,
  "seller_id" integer NOT NULL,
  "order_id" integer NOT NULL,
  "order_item_id" integer NOT NULL,
  "product_id" integer NOT NULL,
  "sale_price" numeric DEFAULT 0 NOT NULL,
  "platform_fee" numeric DEFAULT 0 NOT NULL,
  "seller_amount" numeric DEFAULT 0 NOT NULL,
  "commission_rate" numeric NOT NULL,
  "currency" "enum_seller_earnings_currency" DEFAULT 'VND' NOT NULL,
  "status" "enum_seller_earnings_status" DEFAULT 'PENDING' NOT NULL,
  "hold_period_days" numeric DEFAULT 7 NOT NULL,
  "hold_until" timestamp(3) with time zone NOT NULL,
  "available_at" timestamp(3) with time zone,
  "paid_at" timestamp(3) with time zone,
  "reversed_at" timestamp(3) with time zone,
  "policy_version" varchar DEFAULT 'v1' NOT NULL,
  "notes" varchar,
  "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
);

-- 5. Foreign keys
ALTER TABLE "seller_earnings" DROP CONSTRAINT IF EXISTS "seller_earnings_seller_id_users_id_fk";
ALTER TABLE "seller_earnings" ADD CONSTRAINT "seller_earnings_seller_id_users_id_fk"
  FOREIGN KEY ("seller_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;

ALTER TABLE "seller_earnings" DROP CONSTRAINT IF EXISTS "seller_earnings_order_id_orders_id_fk";
ALTER TABLE "seller_earnings" ADD CONSTRAINT "seller_earnings_order_id_orders_id_fk"
  FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE set null ON UPDATE no action;

ALTER TABLE "seller_earnings" DROP CONSTRAINT IF EXISTS "seller_earnings_order_item_id_order_items_id_fk";
ALTER TABLE "seller_earnings" ADD CONSTRAINT "seller_earnings_order_item_id_order_items_id_fk"
  FOREIGN KEY ("order_item_id") REFERENCES "public"."order_items"("id") ON DELETE set null ON UPDATE no action;

ALTER TABLE "seller_earnings" DROP CONSTRAINT IF EXISTS "seller_earnings_product_id_products_id_fk";
ALTER TABLE "seller_earnings" ADD CONSTRAINT "seller_earnings_product_id_products_id_fk"
  FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE set null ON UPDATE no action;

-- 6. Indices
CREATE UNIQUE INDEX IF NOT EXISTS "seller_earnings_order_item_idx" ON "seller_earnings" USING btree ("order_item_id");
CREATE INDEX IF NOT EXISTS "seller_earnings_seller_idx" ON "seller_earnings" USING btree ("seller_id");
CREATE INDEX IF NOT EXISTS "seller_earnings_order_idx" ON "seller_earnings" USING btree ("order_id");
CREATE INDEX IF NOT EXISTS "seller_earnings_product_idx" ON "seller_earnings" USING btree ("product_id");
CREATE INDEX IF NOT EXISTS "seller_earnings_status_idx" ON "seller_earnings" USING btree ("status");
CREATE INDEX IF NOT EXISTS "seller_earnings_hold_until_idx" ON "seller_earnings" USING btree ("hold_until");
CREATE INDEX IF NOT EXISTS "seller_earnings_status_hold_until_idx" ON "seller_earnings" ("status", "hold_until");
CREATE INDEX IF NOT EXISTS "seller_earnings_created_at_idx" ON "seller_earnings" USING btree ("created_at");
CREATE INDEX IF NOT EXISTS "seller_earnings_updated_at_idx" ON "seller_earnings" USING btree ("updated_at");

-- 7. Locked documents relation for Payload 3.x
ALTER TABLE "payload_locked_documents_rels" ADD COLUMN IF NOT EXISTS "seller_earnings_id" integer;
ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_seller_earnings_fk";
ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_seller_earnings_fk"
  FOREIGN KEY ("seller_earnings_id") REFERENCES "public"."seller_earnings"("id") ON DELETE cascade ON UPDATE no action;
CREATE INDEX IF NOT EXISTS "payload_locked_documents_rels_seller_earnings_id_idx" ON "payload_locked_documents_rels" USING btree ("seller_earnings_id");

-- 8. Check constraints
ALTER TABLE "seller_earnings" DROP CONSTRAINT IF EXISTS "seller_earnings_sale_price_non_negative";
ALTER TABLE "seller_earnings" ADD CONSTRAINT "seller_earnings_sale_price_non_negative" CHECK ("sale_price" >= 0);

ALTER TABLE "seller_earnings" DROP CONSTRAINT IF EXISTS "seller_earnings_platform_fee_non_negative";
ALTER TABLE "seller_earnings" ADD CONSTRAINT "seller_earnings_platform_fee_non_negative" CHECK ("platform_fee" >= 0);

ALTER TABLE "seller_earnings" DROP CONSTRAINT IF EXISTS "seller_earnings_seller_amount_non_negative";
ALTER TABLE "seller_earnings" ADD CONSTRAINT "seller_earnings_seller_amount_non_negative" CHECK ("seller_amount" >= 0);

ALTER TABLE "seller_earnings" DROP CONSTRAINT IF EXISTS "seller_earnings_commission_rate_range";
ALTER TABLE "seller_earnings" ADD CONSTRAINT "seller_earnings_commission_rate_range" CHECK ("commission_rate" >= 0 AND "commission_rate" <= 1);

ALTER TABLE "seller_earnings" DROP CONSTRAINT IF EXISTS "seller_earnings_hold_period_days_non_negative";
ALTER TABLE "seller_earnings" ADD CONSTRAINT "seller_earnings_hold_period_days_non_negative" CHECK ("hold_period_days" >= 0);

ALTER TABLE "seller_earnings" DROP CONSTRAINT IF EXISTS "seller_earnings_math_check";
ALTER TABLE "seller_earnings" ADD CONSTRAINT "seller_earnings_math_check" CHECK ("seller_amount" + "platform_fee" = "sale_price");
```

---

## 5. Verification Method

Once implemented by `m1_worker_1`, the implementation can be independently verified using the following concrete steps:

1. **Schema & Migration Verification**:
   ```bash
   pnpm --prefix web payload migrate
   ```
   Must apply Batch 7 without syntax or constraint errors.
   Direct SQL verification:
   ```sql
   -- Verify ENUM contains REFUNDED
   SELECT enumlabel FROM pg_enum WHERE enumtypid = 'enum_orders_status'::regtype;
   -- Expected: PENDING, COMPLETED, CANCELLED, REFUNDED

   -- Verify unique index on orderItem
   SELECT indexname, indexdef FROM pg_indexes WHERE tablename = 'seller_earnings';
   -- Expected: seller_earnings_order_item_idx (UNIQUE)
   ```

2. **Integration Test Suite**:
   ```bash
   pnpm --prefix web test:int tests/int/seller-earnings.int.spec.ts
   ```
   Verifies:
   - Rate resolution hierarchy (default 30%, seller override 20%, campaign 10%).
   - Arithmetic conservation and zero rounding error across prices.
   - `seller_earnings` creation with `PENDING` status and correct `holdUntil`.
   - Hold period maturation after 7 days transitioning to `AVAILABLE`.

3. **Type Checking & Linting**:
   ```bash
   pnpm --prefix web generate:types
   pnpm --prefix web lint
   ```
   Must complete with exit code 0 and 0 ESLint errors.

4. **Negative Security Verification (Access Control)**:
   - Attempting `POST /api/seller_earnings` as seller, buyer, or guest must return `403 Forbidden` (`canEditMoney`).
   - Attempting `PATCH /api/seller_earnings/:id` as seller or admin must return `403 Forbidden` (`canEditMoney`).
   - Attempting `GET /api/seller_earnings` as buyer must return 0 documents.
   - Attempting `PATCH /api/seller_profiles/:id` with `commissionRate` as seller must be rejected or ignored.

5. **Invalidation Conditions**:
   - The design is invalidated if:
     - `seller_earnings` allows duplicate records for the same `orderItem` (breaks 1-to-1 invariant).
     - Floating point arithmetic produces unbacked or uncollected VND (`platformFee + sellerAmount !== salePrice`).
     - A seller is able to set or modify their own `commissionRate`.
     - Direct REST clients can mutate `seller_earnings` without server-side business logic.
