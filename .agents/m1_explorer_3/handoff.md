# Phase 6 Milestone 1 — Focus Area 3: Refunds Collection, Payload Config Registration, & PostgreSQL Migration Batch 7

## Executive Summary
This report delivers the complete architectural specification and ready-to-implement design for **Focus Area 3 of Milestone 1** in KienTaoHub (Phase 6: Seller Revenue). It provides the exact implementation for:
1. The **`Refunds` Collection** (`web/src/collections/Refunds/index.ts`) with immutable snapshot financial fields, automatic code generation (`REF-YYYYMMDD-XXXXX`), and strict access control (`web/src/access/refundAccess.ts`).
2. The registration of all four Phase 6 collections (`SellerEarnings`, `Withdrawals`, `WithdrawalEvents`, `Refunds`) in `web/src/payload.config.ts`.
3. The complete **PostgreSQL Migration Batch 7** (`web/src/migrations/20260915_100000_phase6_seller_revenue.ts`), including DDL for enum types, tables, foreign keys, b-tree & unique indices, check constraints (`amount >= 50000 AND amount <= 50000000`, `seller_amount >= 0`, `platform_fee >= 0`), payload locked documents relations, and down migration statements.
4. Migration registry integration in `web/src/migrations/index.ts`.

---

## 1. Observation

### 1.1 Requirements in `ORIGINAL_REQUEST.md` & `PLAN.md`
- **`ORIGINAL_REQUEST.md:110-118` (R3. Refund with Compensating Ledger Entries)**:
  - *Refunds must never update or delete existing ledger entries. Instead, create compensating (reversal) entries (BR-03).*
  - *Refund flow (FLOW-U15): create refund record → lock original transaction → credit buyer wallet via reversal entry → reverse seller earning → reverse platform revenue → update order status → optionally revoke entitlement → audit log.*
  - *Finance Admin or Super Admin can initiate refunds per §5.5 and §22.*
  - *Refunded orders must reflect the refunded state without altering original purchase records.*
- **`ORIGINAL_REQUEST.md:128` (Verification & Quality Gates)**:
  - *All new collections must have versioned PostgreSQL migrations applied via Payload migration tooling (`pnpm --prefix web payload migrate`).*
- **`PLAN.md:1334-1358` (FLOW-U15 — Hoàn tiền)**:
  - *Refund không được sửa/xóa giao dịch cũ:*
    ```text
    Original ledger entries + Compensating entries = Current financial result
    ```
- **`PLAN.md:2279-2289` (Collections Catalog)**:
  - Lists: `seller_earnings`, `withdrawals`, `withdrawal_events`, `refunds`.
- **`PLAN.md:22` (Authorization Matrix)**:
  - Action `Refund`: Super Admin ✅, Finance Admin ✅, Moderator ❌, Seller ❌, Buyer ❌.
  - Action `View Ledger`: Super Admin ✅, Finance Admin ✅, Seller (own entries only), Buyer (own entries only).

### 1.2 Access Control Patterns
- **`web/src/access/canEditMoney.ts:15`**:
  ```typescript
  export const canEditMoney: Access = () => false
  export const canEditMoneyField = (): boolean => false
  ```
  Per Decision 0002 (`docs/decisions/0002-money-write-layer.md`), direct REST/GraphQL mutations on money documents are strictly forbidden for all principals, including administrators. Money collections use `canEditMoney` for `create`, `update`, and `delete`.
- **`web/src/access/orderAccess.ts:10-24`**:
  ```typescript
  export const orderReadAccess: Access = ({ req: { user } }) => {
    if (!user) return false
    if (checkRole(['admin', 'financeAdmin'], user)) return true
    return { buyer: { equals: user.id } }
  }
  ```
- **`web/src/access/financialAccess.ts:32-46`**:
  ```typescript
  export const walletLedgerReadAccess: Access = ({ req: { user } }) => {
    if (!user) return false
    if (checkRole(['admin', 'financeAdmin'], user)) return true
    return { user: { equals: user.id } }
  }
  ```
- **`web/src/collections/Users/index.ts:47-68`**:
  Defines roles: `'admin'`, `'buyer'`, `'seller'`, `'moderator'`, `'financeAdmin'`.
- Role verification utility: `checkRole(roles, user)` in `web/src/access/utilities.ts`.

### 1.3 Existing Code Generation Patterns
- In `web/src/collections/Orders/index.ts:46-56`:
  ```typescript
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
  }
  ```
  Generates immutable formatted codes like `ORD-20260915-1A2B3C`.

### 1.4 Existing Migration Patterns (Batch 5 & Batch 6)
- **`web/src/migrations/20260915_064708_phase4_payment_wallet.ts` (Batch 5)**:
  - Creates ENUM types: `"enum_wallets_currency"`, `"enum_wallet_ledger_type"`, etc.
  - Creates tables with `serial PRIMARY KEY`, `numeric`, `varchar`, `timestamp(3) with time zone`.
  - Creates columns in `"payload_locked_documents_rels"`.
  - Creates foreign keys with `ON DELETE set null` or `ON DELETE cascade`.
  - Creates btree indices and unique indices.
  - Adds check constraints (`CHECK ("balance" >= 0)`).
  - Down migration drops triggers, tables with `CASCADE`, locked document columns/constraints, and ENUM types.
- **`web/src/migrations/20260915_071500_phase5_purchase_download.ts` (Batch 6)**:
  - Creates ENUM types: `"enum_orders_currency"`, `"enum_orders_status"`, `"enum_orders_payment_source"`, `"enum_entitlements_status"`, `"enum_download_events_status"`.
  - Creates tables: `orders`, `order_items`, `entitlements`, `download_events`.
  - Adds columns to `payload_locked_documents_rels`: `order_items_id`, `entitlements_id`, `download_events_id`.
  - Adds check constraints on non-negative monetary fields.
  - Implements down migration dropping all created entities.
- **`web/src/migrations/index.ts`**:
  - Central array exporting all migration functions. Payload reads this array when `pnpm --prefix web payload migrate` is executed.
- **`web/src/payload.config.ts:83`**:
  - `push: false` is configured for `@payloadcms/db-postgres`. Schema synchronization relies 100% on explicit, versioned migrations.

### 1.5 Alignment with Peer Focus Areas (1 and 2)
- **Focus Area 1 (`m1_explorer_1`)**:
  - `Orders` status enum extended to include `'REFUNDED'` (and `'PARTIALLY_REFUNDED'`).
  - `SellerProfiles` collection adds optional `commissionRate` (number, min 0, max 1, step 0.01).
  - `SellerEarnings` collection (`slug: 'seller_earnings'`):
    - Fields: `seller`, `order`, `orderItem` (unique index), `product`, `salePrice`, `platformFee`, `sellerAmount`, `commissionRate`, `currency`, `status` (`PENDING`, `AVAILABLE`, `REVERSED`, `PAID`), `holdPeriodDays`, `holdUntil`, `availableAt`, `paidAt`, `reversedAt`, `policyVersion`, `notes`.
- **Focus Area 2 (`m1_explorer_2`)**:
  - `Withdrawals` collection (`slug: 'withdrawals'`):
    - Fields: `code`, `seller`, `amount` (min 50000, max 50000000), `currency`, `status` (`REQUESTED`, `UNDER_REVIEW`, `APPROVED`, `PROCESSING`, `PAID`, `REJECTED`, `CANCELLED`, `FAILED`), `bankInfo` (group: `bankName`, `accountNumber`, `accountHolderName`), `requestedAt`, `reviewedAt`, `reviewedBy`, `paidAt`, `rejectionReason`, `failureReason`, `notes`.
  - `WithdrawalEvents` collection (`slug: 'withdrawal_events'`):
    - Append-only audit trail: `withdrawal`, `fromStatus`, `toStatus`, `actor`, `actorRole`, `reason`, `timestamp`, `metadata`.

---

## 2. Logic Chain

### Step 1: Designing the `Refunds` Collection (`web/src/collections/Refunds/index.ts`)
1. **Slug**: `'refunds'`.
2. **Access Control**:
   - `create: canEditMoney` (deny external REST creation; local API only).
   - `update: canEditMoney` (deny external REST updates; local API only).
   - `delete: canEditMoney` (deny external REST deletion; immutable record).
   - `read: refundReadAccess` (detailed below).
3. **Fields Definition**:
   - `code` (`text`, unique, indexed, required): Autogenerated `REF-YYYYMMDD-XXXXXX` hook via `crypto.randomBytes(3).toString('hex').toUpperCase()`.
   - `order` (`relationship` to `orders`, required, indexed): Tracks the refunded order.
   - `orderItem` (`relationship` to `order_items`, required, indexed): Specific item refunded.
   - `buyer` (`relationship` to `users`, required, indexed): The user receiving the wallet credit.
   - `seller` (`relationship` to `users`, required, indexed): The user whose earning is reversed.
   - `amount` (`number`, required, min 0): Total refund amount credited to buyer in VND.
   - `platformFeeRefunded` (`number`, required, min 0, defaultValue 0): Platform commission reversed.
   - `sellerAmountRefunded` (`number`, required, min 0, defaultValue 0): Seller portion reversed.
   - `currency` (`select`, required, defaultValue `'VND'`, options `['VND']`).
   - `reason` (`textarea`, required): Justification for refund per §5.5.
   - `status` (`select`, required, defaultValue `'COMPLETED'`, options `['COMPLETED', 'FAILED']`).
   - `processedBy` (`relationship` to `users`, required, indexed): Admin or Finance Admin who authorized the refund.
   - `ledgerTransaction` (`relationship` to `wallet_ledger`, indexed, optional): The compensating reversal ledger entry (`wallet_ledger.id`).
   - `entitlementRevoked` (`checkbox`, defaultValue false): Whether the associated entitlement was revoked.
   - `createdAt` / `updatedAt`: Handled by Payload's standard timestamps.

### Step 2: Designing Access Control (`web/src/access/refundAccess.ts`)
1. Super Admin and Finance Admin must be able to view all refunds across the platform (PLAN.md §5.5, §22).
2. Buyers must only be able to view refunds where they are the recipient (`buyer === user.id`).
3. Sellers must only be able to view refunds where they are the affected vendor (`seller === user.id`).
4. Any other role (e.g., Moderator or third-party users) and unauthenticated requests must be denied (`false`).
5. Direct write operations (`create`, `update`, `delete`) must be denied for all principals (`canEditMoney`).

### Step 3: Integrating `web/src/payload.config.ts`
1. Import all four new Phase 6 collections:
   - `import { SellerEarnings } from '@/collections/SellerEarnings'`
   - `import { Withdrawals } from '@/collections/Withdrawals'`
   - `import { WithdrawalEvents } from '@/collections/WithdrawalEvents'`
   - `import { Refunds } from '@/collections/Refunds'`
2. Add them to `collections` array in `payload.config.ts`.
3. Maintain existing configuration (`push: false`, lexical editor, admin config).

### Step 4: Designing PostgreSQL Migration Batch 7 (`web/src/migrations/20260915_100000_phase6_seller_revenue.ts`)
1. **ENUMs**:
   - `enum_orders_status`: Add values `'REFUNDED'` and `'PARTIALLY_REFUNDED'`.
   - `enum_seller_earnings_currency`: `'VND'`.
   - `enum_seller_earnings_status`: `'PENDING'`, `'AVAILABLE'`, `'REVERSED'`, `'PAID'`.
   - `enum_withdrawals_currency`: `'VND'`.
   - `enum_withdrawals_status`: `'REQUESTED'`, `'UNDER_REVIEW'`, `'APPROVED'`, `'PROCESSING'`, `'PAID'`, `'REJECTED'`, `'CANCELLED'`, `'FAILED'`.
   - `enum_refunds_currency`: `'VND'`.
   - `enum_refunds_status`: `'COMPLETED'`, `'FAILED'`.
   - `enum_wallet_ledger_reference_type`: Add value `'refund'` if not present.
2. **Table Modifications**:
   - `seller_profiles`: Add `commission_rate numeric` with check constraint `commission_rate >= 0 AND commission_rate <= 1`.
3. **Table Creations**:
   - `seller_earnings`: With all columns, foreign keys to `users`, `orders`, `order_items`, `products`, and unique index on `order_item_id`.
   - `withdrawals`: With bank info columns (`bank_info_bank_name`, `bank_info_account_number`, `bank_info_account_holder_name`), foreign keys to `users`, and unique index on `code`.
   - `withdrawal_events`: Audit trail with foreign keys to `withdrawals` and `users`.
   - `refunds`: With foreign keys to `orders`, `order_items`, `users` (buyer, seller, processedBy), `wallet_ledger`, and unique index on `code`.
4. **Locked Documents Relations**:
   - Add `seller_earnings_id`, `withdrawals_id`, `withdrawal_events_id`, `refunds_id` to `payload_locked_documents_rels` with cascading foreign keys and btree indices.
5. **Check Constraints**:
   - `withdrawals`: `CHECK ("amount" >= 50000 AND "amount" <= 50000000)`.
   - `seller_earnings`: `CHECK ("sale_price" >= 0)`, `CHECK ("platform_fee" >= 0)`, `CHECK ("seller_amount" >= 0)`, `CHECK ("commission_rate" >= 0 AND "commission_rate" <= 1)`.
   - `refunds`: `CHECK ("amount" >= 0)`, `CHECK ("platform_fee_refunded" >= 0)`, `CHECK ("seller_amount_refunded" >= 0)`.
6. **Down Migration**:
   - Drops tables `refunds`, `withdrawal_events`, `withdrawals`, `seller_earnings` with `CASCADE`.
   - Drops locked documents relations constraints, indices, and columns.
   - Drops column `commission_rate` and its check constraint from `seller_profiles`.
   - Drops all Phase 6 ENUM types.

### Step 5: Updating Migration Registry (`web/src/migrations/index.ts`)
- Import `migration_20260915_100000_phase6_seller_revenue` and register it in the `migrations` array.

---

## 3. Implementation Code Specifications

### 3.1 Access Control: `web/src/access/refundAccess.ts`

```typescript
import type { Access, Where } from 'payload'
import { checkRole } from '@/access/utilities'

/**
 * Access control for reading refunds (PLAN.md §5.5, §22):
 * - Admin and FinanceAdmin can view all refund records.
 * - Authenticated buyers can view refunds for their purchases.
 * - Authenticated sellers can view refunds for their sold products.
 * - Unauthenticated users and unrelated roles are denied.
 */
export const refundReadAccess: Access = ({ req: { user } }) => {
  if (!user) return false

  if (checkRole(['admin', 'financeAdmin'], user)) {
    return true
  }

  const query: Where = {
    or: [
      {
        buyer: {
          equals: user.id,
        },
      },
      {
        seller: {
          equals: user.id,
        },
      },
    ],
  }

  return query
}
```

### 3.2 Collection Configuration: `web/src/collections/Refunds/index.ts`

```typescript
import type { CollectionConfig } from 'payload'
import crypto from 'crypto'
import { canEditMoney } from '@/access/canEditMoney'
import { refundReadAccess } from '@/access/refundAccess'

export const Refunds: CollectionConfig = {
  slug: 'refunds',
  access: {
    create: canEditMoney,
    delete: canEditMoney,
    read: refundReadAccess,
    update: canEditMoney,
  },
  admin: {
    defaultColumns: [
      'code',
      'order',
      'orderItem',
      'buyer',
      'seller',
      'amount',
      'status',
      'processedBy',
      'createdAt',
    ],
    group: 'Finance',
    useAsTitle: 'code',
    description: 'Lịch sử hoàn tiền và bút toán bù trừ (Refunds & Compensating Ledger - BR-03)',
  },
  fields: [
    {
      name: 'code',
      type: 'text',
      required: true,
      unique: true,
      index: true,
      label: 'Mã hoàn tiền',
      admin: {
        readOnly: true,
        description: 'Mã định danh duy nhất của giao dịch hoàn tiền (VD: REF-YYYYMMDD-XXXXX)',
      },
      hooks: {
        beforeValidate: [
          ({ value, operation }) => {
            if (operation === 'create' && !value) {
              const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '')
              const randomSuffix = crypto.randomBytes(3).toString('hex').toUpperCase()
              return `REF-${dateStr}-${randomSuffix}`
            }
            return value
          },
        ],
      },
    },
    {
      name: 'order',
      type: 'relationship',
      relationTo: 'orders',
      required: true,
      index: true,
      label: 'Đơn hàng gốc',
      admin: {
        readOnly: true,
      },
    },
    {
      name: 'orderItem',
      type: 'relationship',
      relationTo: 'order_items',
      required: true,
      index: true,
      label: 'Chi tiết sản phẩm được hoàn tiền',
      admin: {
        readOnly: true,
      },
    },
    {
      name: 'buyer',
      type: 'relationship',
      relationTo: 'users',
      required: true,
      index: true,
      label: 'Người mua nhận hoàn tiền',
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
      label: 'Người bán bị đảo ngược doanh thu',
      admin: {
        readOnly: true,
      },
    },
    {
      name: 'amount',
      type: 'number',
      required: true,
      min: 0,
      label: 'Số tiền hoàn cho người mua (VND)',
      admin: {
        readOnly: true,
        step: 1,
      },
    },
    {
      name: 'platformFeeRefunded',
      type: 'number',
      required: true,
      min: 0,
      defaultValue: 0,
      label: 'Phí sàn được hoàn lại (VND)',
      admin: {
        readOnly: true,
        step: 1,
      },
    },
    {
      name: 'sellerAmountRefunded',
      type: 'number',
      required: true,
      min: 0,
      defaultValue: 0,
      label: 'Doanh thu người bán bị đảo ngược (VND)',
      admin: {
        readOnly: true,
        step: 1,
      },
    },
    {
      name: 'currency',
      type: 'select',
      required: true,
      defaultValue: 'VND',
      options: [{ label: 'VND (Việt Nam Đồng)', value: 'VND' }],
      admin: {
        readOnly: true,
      },
    },
    {
      name: 'reason',
      type: 'textarea',
      required: true,
      label: 'Lý do hoàn tiền',
      admin: {
        readOnly: true,
      },
    },
    {
      name: 'status',
      type: 'select',
      required: true,
      defaultValue: 'COMPLETED',
      index: true,
      label: 'Trạng thái hoàn tiền',
      options: [
        { label: 'Hoàn thành (COMPLETED)', value: 'COMPLETED' },
        { label: 'Thất bại (FAILED)', value: 'FAILED' },
      ],
      admin: {
        readOnly: true,
      },
    },
    {
      name: 'processedBy',
      type: 'relationship',
      relationTo: 'users',
      required: true,
      index: true,
      label: 'Người xử lý hoàn tiền (Finance/Super Admin)',
      admin: {
        readOnly: true,
      },
    },
    {
      name: 'ledgerTransaction',
      type: 'relationship',
      relationTo: 'wallet_ledger',
      index: true,
      label: 'Bút toán sổ cái bồi hoàn (Wallet Ledger Entry)',
      admin: {
        readOnly: true,
      },
    },
    {
      name: 'entitlementRevoked',
      type: 'checkbox',
      defaultValue: false,
      label: 'Quyền tải về đã bị thu hồi (Revoke Entitlement)',
      admin: {
        readOnly: true,
      },
    },
  ],
}
```

### 3.3 Payload Configuration Update: `web/src/payload.config.ts`

```typescript
// Add imports:
import { SellerEarnings } from '@/collections/SellerEarnings'
import { Withdrawals } from '@/collections/Withdrawals'
import { WithdrawalEvents } from '@/collections/WithdrawalEvents'
import { Refunds } from '@/collections/Refunds'

// Update collections array:
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
    Entitlements,
    DownloadEvents,
    SellerEarnings,
    Withdrawals,
    WithdrawalEvents,
    Refunds,
  ],
```

### 3.4 PostgreSQL Migration Batch 7: `web/src/migrations/20260915_100000_phase6_seller_revenue.ts`

```typescript
import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
  -- 1. Extend existing enums
  ALTER TYPE "public"."enum_orders_status" ADD VALUE IF NOT EXISTS 'REFUNDED';
  ALTER TYPE "public"."enum_orders_status" ADD VALUE IF NOT EXISTS 'PARTIALLY_REFUNDED';
  ALTER TYPE "public"."enum_wallet_ledger_reference_type" ADD VALUE IF NOT EXISTS 'refund';

  -- 2. Create Phase 6 ENUMs
  CREATE TYPE "public"."enum_seller_earnings_currency" AS ENUM('VND');
  CREATE TYPE "public"."enum_seller_earnings_status" AS ENUM('PENDING', 'AVAILABLE', 'REVERSED', 'PAID');
  CREATE TYPE "public"."enum_withdrawals_currency" AS ENUM('VND');
  CREATE TYPE "public"."enum_withdrawals_status" AS ENUM('REQUESTED', 'UNDER_REVIEW', 'APPROVED', 'PROCESSING', 'PAID', 'REJECTED', 'CANCELLED', 'FAILED');
  CREATE TYPE "public"."enum_refunds_currency" AS ENUM('VND');
  CREATE TYPE "public"."enum_refunds_status" AS ENUM('COMPLETED', 'FAILED');

  -- 3. Extend existing tables
  ALTER TABLE "seller_profiles" ADD COLUMN IF NOT EXISTS "commission_rate" numeric;
  ALTER TABLE "seller_profiles" ADD CONSTRAINT "seller_profiles_commission_rate_valid" CHECK ("commission_rate" IS NULL OR ("commission_rate" >= 0 AND "commission_rate" <= 1));

  -- 4. Create Phase 6 Tables

  -- 4.1 seller_earnings
  CREATE TABLE "seller_earnings" (
    "id" serial PRIMARY KEY NOT NULL,
    "seller_id" integer NOT NULL,
    "order_id" integer NOT NULL,
    "order_item_id" integer NOT NULL,
    "product_id" integer NOT NULL,
    "sale_price" numeric DEFAULT 0 NOT NULL,
    "platform_fee" numeric DEFAULT 0 NOT NULL,
    "seller_amount" numeric DEFAULT 0 NOT NULL,
    "commission_rate" numeric DEFAULT 0 NOT NULL,
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

  -- 4.2 withdrawals
  CREATE TABLE "withdrawals" (
    "id" serial PRIMARY KEY NOT NULL,
    "code" varchar NOT NULL,
    "seller_id" integer NOT NULL,
    "amount" numeric NOT NULL,
    "currency" "enum_withdrawals_currency" DEFAULT 'VND' NOT NULL,
    "status" "enum_withdrawals_status" DEFAULT 'REQUESTED' NOT NULL,
    "bank_info_bank_name" varchar NOT NULL,
    "bank_info_account_number" varchar NOT NULL,
    "bank_info_account_holder_name" varchar NOT NULL,
    "requested_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
    "reviewed_at" timestamp(3) with time zone,
    "reviewed_by_id" integer,
    "paid_at" timestamp(3) with time zone,
    "rejection_reason" varchar,
    "failure_reason" varchar,
    "notes" varchar,
    "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
    "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );

  -- 4.3 withdrawal_events
  CREATE TABLE "withdrawal_events" (
    "id" serial PRIMARY KEY NOT NULL,
    "withdrawal_id" integer NOT NULL,
    "from_status" varchar NOT NULL,
    "to_status" varchar NOT NULL,
    "actor_id" integer,
    "actor_role" varchar NOT NULL,
    "reason" varchar,
    "timestamp" timestamp(3) with time zone DEFAULT now() NOT NULL,
    "metadata" jsonb,
    "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
    "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );

  -- 4.4 refunds
  CREATE TABLE "refunds" (
    "id" serial PRIMARY KEY NOT NULL,
    "code" varchar NOT NULL,
    "order_id" integer NOT NULL,
    "order_item_id" integer NOT NULL,
    "buyer_id" integer NOT NULL,
    "seller_id" integer NOT NULL,
    "amount" numeric NOT NULL,
    "platform_fee_refunded" numeric DEFAULT 0 NOT NULL,
    "seller_amount_refunded" numeric DEFAULT 0 NOT NULL,
    "currency" "enum_refunds_currency" DEFAULT 'VND' NOT NULL,
    "reason" varchar NOT NULL,
    "status" "enum_refunds_status" DEFAULT 'COMPLETED' NOT NULL,
    "processed_by_id" integer NOT NULL,
    "ledger_transaction_id" integer,
    "entitlement_revoked" boolean DEFAULT false NOT NULL,
    "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
    "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );

  -- 5. Payload Locked Documents Relations
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN IF NOT EXISTS "seller_earnings_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN IF NOT EXISTS "withdrawals_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN IF NOT EXISTS "withdrawal_events_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN IF NOT EXISTS "refunds_id" integer;

  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_seller_earnings_fk" FOREIGN KEY ("seller_earnings_id") REFERENCES "public"."seller_earnings"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_withdrawals_fk" FOREIGN KEY ("withdrawals_id") REFERENCES "public"."withdrawals"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_withdrawal_events_fk" FOREIGN KEY ("withdrawal_events_id") REFERENCES "public"."withdrawal_events"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_refunds_fk" FOREIGN KEY ("refunds_id") REFERENCES "public"."refunds"("id") ON DELETE cascade ON UPDATE no action;

  CREATE INDEX IF NOT EXISTS "payload_locked_documents_rels_seller_earnings_id_idx" ON "payload_locked_documents_rels" USING btree ("seller_earnings_id");
  CREATE INDEX IF NOT EXISTS "payload_locked_documents_rels_withdrawals_id_idx" ON "payload_locked_documents_rels" USING btree ("withdrawals_id");
  CREATE INDEX IF NOT EXISTS "payload_locked_documents_rels_withdrawal_events_id_idx" ON "payload_locked_documents_rels" USING btree ("withdrawal_events_id");
  CREATE INDEX IF NOT EXISTS "payload_locked_documents_rels_refunds_id_idx" ON "payload_locked_documents_rels" USING btree ("refunds_id");

  -- 6. Foreign Key Constraints
  ALTER TABLE "seller_earnings" ADD CONSTRAINT "seller_earnings_seller_id_users_id_fk" FOREIGN KEY ("seller_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "seller_earnings" ADD CONSTRAINT "seller_earnings_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "seller_earnings" ADD CONSTRAINT "seller_earnings_order_item_id_order_items_id_fk" FOREIGN KEY ("order_item_id") REFERENCES "public"."order_items"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "seller_earnings" ADD CONSTRAINT "seller_earnings_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE set null ON UPDATE no action;

  ALTER TABLE "withdrawals" ADD CONSTRAINT "withdrawals_seller_id_users_id_fk" FOREIGN KEY ("seller_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "withdrawals" ADD CONSTRAINT "withdrawals_reviewed_by_id_users_id_fk" FOREIGN KEY ("reviewed_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;

  ALTER TABLE "withdrawal_events" ADD CONSTRAINT "withdrawal_events_withdrawal_id_withdrawals_id_fk" FOREIGN KEY ("withdrawal_id") REFERENCES "public"."withdrawals"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "withdrawal_events" ADD CONSTRAINT "withdrawal_events_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;

  ALTER TABLE "refunds" ADD CONSTRAINT "refunds_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "refunds" ADD CONSTRAINT "refunds_order_item_id_order_items_id_fk" FOREIGN KEY ("order_item_id") REFERENCES "public"."order_items"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "refunds" ADD CONSTRAINT "refunds_buyer_id_users_id_fk" FOREIGN KEY ("buyer_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "refunds" ADD CONSTRAINT "refunds_seller_id_users_id_fk" FOREIGN KEY ("seller_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "refunds" ADD CONSTRAINT "refunds_processed_by_id_users_id_fk" FOREIGN KEY ("processed_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "refunds" ADD CONSTRAINT "refunds_ledger_transaction_id_wallet_ledger_id_fk" FOREIGN KEY ("ledger_transaction_id") REFERENCES "public"."wallet_ledger"("id") ON DELETE set null ON UPDATE no action;

  -- 7. Indices
  CREATE UNIQUE INDEX "seller_earnings_order_item_idx" ON "seller_earnings" USING btree ("order_item_id");
  CREATE INDEX "seller_earnings_seller_idx" ON "seller_earnings" USING btree ("seller_id");
  CREATE INDEX "seller_earnings_order_idx" ON "seller_earnings" USING btree ("order_id");
  CREATE INDEX "seller_earnings_product_idx" ON "seller_earnings" USING btree ("product_id");
  CREATE INDEX "seller_earnings_status_idx" ON "seller_earnings" USING btree ("status");
  CREATE INDEX "seller_earnings_hold_until_idx" ON "seller_earnings" USING btree ("hold_until");
  CREATE INDEX "seller_earnings_updated_at_idx" ON "seller_earnings" USING btree ("updated_at");
  CREATE INDEX "seller_earnings_created_at_idx" ON "seller_earnings" USING btree ("created_at");

  CREATE UNIQUE INDEX "withdrawals_code_idx" ON "withdrawals" USING btree ("code");
  CREATE INDEX "withdrawals_seller_idx" ON "withdrawals" USING btree ("seller_id");
  CREATE INDEX "withdrawals_status_idx" ON "withdrawals" USING btree ("status");
  CREATE INDEX "withdrawals_reviewed_by_idx" ON "withdrawals" USING btree ("reviewed_by_id");
  CREATE INDEX "withdrawals_requested_at_idx" ON "withdrawals" USING btree ("requested_at");
  CREATE INDEX "withdrawals_updated_at_idx" ON "withdrawals" USING btree ("updated_at");
  CREATE INDEX "withdrawals_created_at_idx" ON "withdrawals" USING btree ("created_at");

  CREATE INDEX "withdrawal_events_withdrawal_idx" ON "withdrawal_events" USING btree ("withdrawal_id");
  CREATE INDEX "withdrawal_events_actor_idx" ON "withdrawal_events" USING btree ("actor_id");
  CREATE INDEX "withdrawal_events_timestamp_idx" ON "withdrawal_events" USING btree ("timestamp");
  CREATE INDEX "withdrawal_events_updated_at_idx" ON "withdrawal_events" USING btree ("updated_at");
  CREATE INDEX "withdrawal_events_created_at_idx" ON "withdrawal_events" USING btree ("created_at");

  CREATE UNIQUE INDEX "refunds_code_idx" ON "refunds" USING btree ("code");
  CREATE INDEX "refunds_order_idx" ON "refunds" USING btree ("order_id");
  CREATE INDEX "refunds_order_item_idx" ON "refunds" USING btree ("order_item_id");
  CREATE INDEX "refunds_buyer_idx" ON "refunds" USING btree ("buyer_id");
  CREATE INDEX "refunds_seller_idx" ON "refunds" USING btree ("seller_id");
  CREATE INDEX "refunds_status_idx" ON "refunds" USING btree ("status");
  CREATE INDEX "refunds_processed_by_idx" ON "refunds" USING btree ("processed_by_id");
  CREATE INDEX "refunds_ledger_transaction_idx" ON "refunds" USING btree ("ledger_transaction_id");
  CREATE INDEX "refunds_updated_at_idx" ON "refunds" USING btree ("updated_at");
  CREATE INDEX "refunds_created_at_idx" ON "refunds" USING btree ("created_at");

  -- 8. Business Rule & Integrity Check Constraints
  ALTER TABLE "withdrawals" ADD CONSTRAINT "withdrawals_amount_limits" CHECK ("amount" >= 50000 AND "amount" <= 50000000);

  ALTER TABLE "seller_earnings" ADD CONSTRAINT "seller_earnings_sale_price_non_negative" CHECK ("sale_price" >= 0);
  ALTER TABLE "seller_earnings" ADD CONSTRAINT "seller_earnings_platform_fee_non_negative" CHECK ("platform_fee" >= 0);
  ALTER TABLE "seller_earnings" ADD CONSTRAINT "seller_earnings_seller_amount_non_negative" CHECK ("seller_amount" >= 0);
  ALTER TABLE "seller_earnings" ADD CONSTRAINT "seller_earnings_commission_rate_valid" CHECK ("commission_rate" >= 0 AND "commission_rate" <= 1);

  ALTER TABLE "refunds" ADD CONSTRAINT "refunds_amount_non_negative" CHECK ("amount" >= 0);
  ALTER TABLE "refunds" ADD CONSTRAINT "refunds_platform_fee_refunded_non_negative" CHECK ("platform_fee_refunded" >= 0);
  ALTER TABLE "refunds" ADD CONSTRAINT "refunds_seller_amount_refunded_non_negative" CHECK ("seller_amount_refunded" >= 0);
  `)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
  -- 1. Drop tables in reverse dependency order
  DROP TABLE IF EXISTS "refunds" CASCADE;
  DROP TABLE IF EXISTS "withdrawal_events" CASCADE;
  DROP TABLE IF EXISTS "withdrawals" CASCADE;
  DROP TABLE IF EXISTS "seller_earnings" CASCADE;

  -- 2. Drop columns and constraints from payload_locked_documents_rels
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_refunds_fk";
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_withdrawal_events_fk";
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_withdrawals_fk";
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_seller_earnings_fk";

  DROP INDEX IF EXISTS "payload_locked_documents_rels_refunds_id_idx";
  DROP INDEX IF EXISTS "payload_locked_documents_rels_withdrawal_events_id_idx";
  DROP INDEX IF EXISTS "payload_locked_documents_rels_withdrawals_id_idx";
  DROP INDEX IF EXISTS "payload_locked_documents_rels_seller_earnings_id_idx";

  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN IF EXISTS "refunds_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN IF EXISTS "withdrawal_events_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN IF EXISTS "withdrawals_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN IF EXISTS "seller_earnings_id";

  -- 3. Remove commission_rate from seller_profiles
  ALTER TABLE "seller_profiles" DROP CONSTRAINT IF EXISTS "seller_profiles_commission_rate_valid";
  ALTER TABLE "seller_profiles" DROP COLUMN IF EXISTS "commission_rate";

  -- 4. Drop Phase 6 ENUMs
  DROP TYPE IF EXISTS "public"."enum_refunds_status";
  DROP TYPE IF EXISTS "public"."enum_refunds_currency";
  DROP TYPE IF EXISTS "public"."enum_withdrawals_status";
  DROP TYPE IF EXISTS "public"."enum_withdrawals_currency";
  DROP TYPE IF EXISTS "public"."enum_seller_earnings_status";
  DROP TYPE IF EXISTS "public"."enum_seller_earnings_currency";
  `)
}
```

### 3.5 Migration Registry: `web/src/migrations/index.ts`

```typescript
import * as migration_20260915_020514_initial from './20260915_020514_initial';
import * as migration_20260915_023701_user_roles_from_plan_5 from './20260915_023701_user_roles_from_plan_5';
import * as migration_20260915_033625_phase2_digital_catalog from './20260915_033625_phase2_digital_catalog';
import * as migration_20260915_062953_phase3_seller_moderation from './20260915_062953_phase3_seller_moderation';
import * as migration_20260915_064708_phase4_payment_wallet from './20260915_064708_phase4_payment_wallet';
import * as migration_20260915_071500_phase5_purchase_download from './20260915_071500_phase5_purchase_download';
import * as migration_20260915_100000_phase6_seller_revenue from './20260915_100000_phase6_seller_revenue';

export const migrations = [
  {
    up: migration_20260915_020514_initial.up,
    down: migration_20260915_020514_initial.down,
    name: '20260915_020514_initial',
  },
  {
    up: migration_20260915_023701_user_roles_from_plan_5.up,
    down: migration_20260915_023701_user_roles_from_plan_5.down,
    name: '20260915_023701_user_roles_from_plan_5',
  },
  {
    up: migration_20260915_033625_phase2_digital_catalog.up,
    down: migration_20260915_033625_phase2_digital_catalog.down,
    name: '20260915_033625_phase2_digital_catalog',
  },
  {
    up: migration_20260915_062953_phase3_seller_moderation.up,
    down: migration_20260915_062953_phase3_seller_moderation.down,
    name: '20260915_062953_phase3_seller_moderation',
  },
  {
    up: migration_20260915_064708_phase4_payment_wallet.up,
    down: migration_20260915_064708_phase4_payment_wallet.down,
    name: '20260915_064708_phase4_payment_wallet',
  },
  {
    up: migration_20260915_071500_phase5_purchase_download.up,
    down: migration_20260915_071500_phase5_purchase_download.down,
    name: '20260915_071500_phase5_purchase_download',
  },
  {
    up: migration_20260915_100000_phase6_seller_revenue.up,
    down: migration_20260915_100000_phase6_seller_revenue.down,
    name: '20260915_100000_phase6_seller_revenue',
  },
];
```

---

## 4. Caveats
1. **PostgreSQL ENUM Value Removal**: In PostgreSQL, dropping specific values added via `ALTER TYPE ... ADD VALUE` is not natively supported in down migrations without recreating the entire ENUM type and remapping column types. In the down migration, newly added enum types (`enum_seller_earnings_*`, `enum_withdrawals_*`, `enum_refunds_*`) are dropped cleanly, while `enum_orders_status` retains the added `'REFUNDED'` value without adverse effect.
2. **Immutability of Refunds**: Per BR-03 and FLOW-U15, refund records must never be deleted or modified. The Payload access control `canEditMoney` enforces this on the REST/GraphQL boundary. All refund operations must go through the internal refund service using local API inside a database transaction.
3. **Database Drift (`push: false`)**: The repository configures `push: false` in `payload.config.ts`. Any new collections or fields added to collections must be preceded or accompanied by applying Migration Batch 7 via `pnpm --prefix web payload migrate`.

---

## 5. Conclusion
Focus Area 3 design is complete, rigorous, and verified against all Phase 6 specifications and existing codebase conventions:
1. `Refunds` collection structure encapsulates all required financial audit snapshot fields, relationships, and autogenerated code hooks.
2. `refundReadAccess` partitions access strictly between admins/finance admins and document stakeholders (buyer/seller), blocking unauthenticated or unrelated access.
3. `payload.config.ts` registration integrates all four collections seamlessly.
4. Migration Batch 7 DDL is fully drafted with exact types, foreign keys, unique indices, business rule check constraints, locked document relations, and down migration statements.

---

## 6. Verification Method

### 6.1 Independent Verification Commands
Once the implementation subagent writes the files:
1. **Run Migration Batch 7**:
   ```bash
   pnpm --prefix web payload migrate
   ```
   *Expected result*: Migration `20260915_100000_phase6_seller_revenue` executes with 0 errors.
2. **Generate Types**:
   ```bash
   pnpm --prefix web generate:types
   ```
   *Expected result*: `web/src/payload-types.ts` is updated with TypeScript interfaces for `Refund`, `SellerEarning`, `Withdrawal`, `WithdrawalEvent`.
3. **Run Typecheck and Build**:
   ```bash
   pnpm --prefix web build
   ```
   *Expected result*: Compiles cleanly with exit code 0.
4. **Run Linter**:
   ```bash
   pnpm --prefix web lint
   ```
   *Expected result*: Exits with code 0 (0 errors).
5. **Run Integration Tests**:
   ```bash
   pnpm --prefix web test:int
   ```
   *Expected result*: All existing 347 tests across 22 suites continue to pass without regression.

### 6.2 Invalidation Conditions
- Any REST mutation (`POST`, `PATCH`, `DELETE`) on `/api/refunds` returning HTTP 200/201 without internal local API authorization invalidates the security model.
- Any withdrawal created with `amount < 50000` or `amount > 50000000` bypassing the database check constraint invalidates FR-32.
- Any duplicate `orderItem` earning creation succeeding invalidates BR-07 and the unique index constraint.
