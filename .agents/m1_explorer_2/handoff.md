# Implementation Design & Handoff Report: Entitlements & DownloadEvents Schema (Milestone 1)

## 1. Observation

### 1.1 Requirements & Specifications
- In `.agents/ORIGINAL_REQUEST.md` (lines 23-35, 51-65):
  - **R2. Entitlements Ledger**:
    > "Implement the `entitlements` collection as an independent authority for asset ownership per PLAN.md FR-16 and Decision 0006:
    > - Fields: `user`, `product`, `order` (optional for free products), `status` (`active`, `revoked`, `expired`), `grantedAt`.
    > - Unique constraint: A buyer can only hold one active entitlement per product; duplicate purchases of already-owned assets are refused or redirected to download.
    > - Free downloads automatically create an active entitlement row per FR-18."
  - **R3. Secure Authenticated Download Engine & Token Rail**:
    > "Validates token signature and expiration, streams the file bytes with proper MIME type and filename attachment header, and records an audit row in `download_events` (user, product, IP, user-agent, timestamp, status)."
  - **Acceptance Criteria**:
    > "Collections `orders`, `order_items`, `entitlements`, and `download_events` registered in Payload config with versioned PostgreSQL migration Batch 6."
- In `PLAN.md` lines 668-685 (FR-16):
  ```text
  entitlement:
  - user_id
  - product_id
  - order_item_id
  - granted_at
  - expires_at nullable
  - max_downloads nullable
  - download_count
  - revoked_at nullable
  - reason
  ```
- In `PLAN.md` lines 2509-2524 (§22 Authorization Matrix):
  - Action `Download owned`: Guest ❌, Buyer ✅, Seller ✅, Moderator ✅, Finance ✅, Admin ✅
- In `docs/decisions/0006-secure-download-path.md`:
  - Download is entitlement-gated and served through an authenticated application route, not a public URL.
  - Download events are recorded per attempt to satisfy audit and abuse-detection requirements.
- In `docs/decisions/0008-role-model.md`:
  - Roles are: `admin` (Super Admin), `buyer`, `seller`, `moderator`, `financeAdmin`.

### 1.2 Codebase Patterns & Existing Conventions
- **Collection Slug Convention**:
  - `web/src/collections/WalletLedger.ts` (line 13): `slug: 'wallet_ledger'`
  - `web/src/collections/PaymentIntents.ts` (line 13): `slug: 'payment_intents'`
  - `web/src/collections/ProductFiles/index.ts` (line 17): `slug: 'product_files'`
  - `web/src/collections/PaymentWebhookEvents.ts` (line 12): `slug: 'payment_webhook_events'`
  - Slugs follow snake_case in PostgreSQL database tables (`"entitlements"`, `"download_events"`).
- **Access Control Conventions**:
  - `web/src/access/utilities.ts` (lines 3-13): exports `checkRole(allRoles, user)`.
  - `web/src/access/canEditMoney.ts` (lines 15-21): `export const canEditMoney: Access = () => false`.
  - `web/src/access/financialAccess.ts` (lines 10-24, 32-46): returns boolean or `Where` clause filtering by `user: { equals: user.id }`.
  - `web/src/access/isAdmin.ts` (lines 10-16): checks `checkRole(['admin'], req.user)`.
- **Append-Only Audit Log Convention**:
  - `web/src/collections/PaymentWebhookEvents.ts` (lines 13-18):
    ```ts
    access: {
      create: canEditMoney, // returns false
      delete: canEditMoney, // returns false
      read: webhookEventReadAccess,
      update: canEditMoney, // returns false
    }
    ```
  - All audit fields configured with `admin: { readOnly: true }`.
- **Database Migrations & PostgreSQL Types**:
  - `web/src/migrations/20260915_064708_phase4_payment_wallet.ts`:
    - Enum types named `"enum_" + collection_slug + "_" + field_name`:
      e.g., `"enum_wallets_currency"`, `"enum_wallet_ledger_type"`.
    - CamelCase fields map to snake_case columns:
      `downloadCount` → `"download_count"`, `ipAddress` → `"ip_address"`, `orderItem` → `"order_item_id"`.
- **Peer Milestone Dispatches**:
  - `.agents/m1_explorer_1/DISPATCH.md`: designs collections `Orders` (`slug: 'orders'`) and `OrderItems` (`slug: 'order_items'`).
  - `.agents/m1_explorer_3/DISPATCH.md`: designs migration Batch 6 including tables `"entitlements"` and `"download_events"`, with partial unique index:
    `CREATE UNIQUE INDEX "entitlements_user_product_active_idx" ON "entitlements" ("user_id", "product_id") WHERE ("status" = 'active');`.

---

## 2. Logic Chain

1. **Naming & Slug Consistency**:
   - `ORIGINAL_REQUEST.md` and `m1_explorer_3/DISPATCH.md` prescribe tables `entitlements` and `download_events`.
   - By convention, Payload collection slugs map directly to PostgreSQL table names:
     - `slug: 'entitlements'` → table `"entitlements"`
     - `slug: 'download_events'` → table `"download_events"`
   - Relationships to peer collections:
     - `order` relates to `slug: 'orders'`
     - `orderItem` relates to `slug: 'order_items'`
     - `product` relates to `slug: 'products'`
     - `user` relates to `slug: 'users'`

2. **Entitlements Access Control Architecture**:
   - **Read**:
     - `admin` and `financeAdmin` must inspect all entitlements across the platform per PLAN.md §22 (`checkRole(['admin', 'financeAdmin'], user) === true`).
     - Regular authenticated buyers must only view their own active entitlements (`{ and: [{ user: { equals: user.id } }, { status: { equals: 'active' } }] }`).
     - Unauthenticated guests are denied (`if (!user) return false`).
   - **Create**:
     - Direct creation via public REST/GraphQL API must be prohibited (`() => false`).
     - Entitlement grants occur exclusively via transactional purchase services (`services/purchase.ts`) or free checkout services on the server with `overrideAccess: true`.
   - **Delete**:
     - Direct deletion via REST must be prohibited (`() => false`). Entitlements are an audit-trailed ledger; revoking ownership is handled by transitioning `status` to `'revoked'`, not deleting records.
   - **Update**:
     - Only `admin` can perform updates (revocation, manual expiry, or reason annotation).
     - Field-level restrictions: core relations (`user`, `product`, `order`, `orderItem`, `grantedAt`, `downloadCount`) are marked `admin: { readOnly: true }` so only administrative fields (`status`, `revokedAt`, `reason`, `expiresAt`, `maxDownloads`) are editable.

3. **Anti-Duplicate Active Entitlement Invariant**:
   - The requirement dictates: *A buyer can only hold one active entitlement per product*.
   - Defense-in-depth architecture:
     1. **Database Layer (Hard Constraint)**: Handled by migration Batch 6 via partial unique index:
        `CREATE UNIQUE INDEX "entitlements_user_product_active_idx" ON "entitlements" ("user_id", "product_id") WHERE ("status" = 'active');`
     2. **Application Hook Layer (Early Friendly Validation)**: A `beforeChange` hook checks `req.payload.find` for an existing active entitlement for `(user, product)`. Passing `req` allows this check to participate in the active database transaction.

4. **DownloadEvents Access Control & Immutability**:
   - `download_events` is a security and abuse-detection audit log per PLAN.md FR-17 and Decision 0006.
   - **Read**: Only `admin` and `financeAdmin` (`checkRole(['admin', 'financeAdmin'], user)`). Buyers and guests cannot inspect download event logs.
   - **Create / Update / Delete**: Strictly denied for all external REST principals (`() => false`).
   - Writes are performed exclusively by the internal secure download streaming route (`GET /api/v1/downloads/[token]`) using `overrideAccess: true`.
   - All fields in `DownloadEvents` are marked `admin: { readOnly: true }` to guarantee audit trail immutability.

5. **Payload Configuration Integration**:
   - `web/src/payload.config.ts` must import `Entitlements` from `@/collections/Entitlements` and `DownloadEvents` from `@/collections/DownloadEvents`.
   - Both collections are appended to the `collections` array in `buildConfig`.
   - Both collections are categorized under `admin: { group: 'Commerce' }` for cohesive admin navigation alongside `Orders` and `OrderItems`.

---

## 3. Detailed Implementation Proposals

### 3.1 File 1: `web/src/access/entitlementAccess.ts`
```typescript
import type { Access, Where } from 'payload'
import { checkRole } from '@/access/utilities'

/**
 * Access rule for reading entitlements (PLAN.md §22, FR-16, Decision 0006):
 * - Admin and FinanceAdmin can view all entitlements.
 * - Authenticated users can view only their own active entitlements.
 * - Unauthenticated users (guests) are denied.
 */
export const entitlementReadAccess: Access = ({ req: { user } }) => {
  if (!user) return false

  if (checkRole(['admin', 'financeAdmin'], user)) {
    return true
  }

  const query: Where = {
    and: [
      {
        user: {
          equals: user.id,
        },
      },
      {
        status: {
          equals: 'active',
        },
      },
    ],
  }

  return query
}

/**
 * Access rule for updating entitlements:
 * - Admin only (for revocation, setting expiresAt, or adding administrative reasons).
 * - All other users are denied direct updates.
 */
export const entitlementUpdateAccess: Access = ({ req: { user } }) => {
  if (!user) return false
  return checkRole(['admin'], user)
}

/**
 * Direct create and delete operations via REST API are strictly denied.
 * Entitlements are created exclusively via transactional checkout or free-download services
 * on the server using `overrideAccess: true`.
 * Hard deletion is forbidden to preserve the ownership ledger.
 */
export const entitlementNoDirectWrite: Access = () => false
```

---

### 3.2 File 2: `web/src/collections/Entitlements/hooks/enforceEntitlementInvariants.ts`
```typescript
import type { CollectionBeforeChangeHook } from 'payload'

/**
 * Hook to enforce Entitlement lifecycle defaults and unique active entitlement invariant (R2, FR-16).
 */
export const enforceEntitlementInvariants: CollectionBeforeChangeHook = async ({
  data,
  req,
  operation,
  originalDoc,
}) => {
  // 1. Ensure grantedAt is populated upon creation
  if (operation === 'create' && !data.grantedAt) {
    data.grantedAt = new Date().toISOString()
  }

  // 2. Default downloadCount to 0 if undefined
  if (operation === 'create' && (data.downloadCount === undefined || data.downloadCount === null)) {
    data.downloadCount = 0
  }

  // 3. Auto-populate revokedAt when status transitions to 'revoked'
  if (data.status === 'revoked' && !data.revokedAt) {
    data.revokedAt = new Date().toISOString()
  }

  // 4. Invariant check: Only one active entitlement per (user, product)
  if (data.status === 'active') {
    const userId = typeof data.user === 'object' && data.user !== null ? data.user.id : data.user
    const productId = typeof data.product === 'object' && data.product !== null ? data.product.id : data.product

    if (userId && productId) {
      const existing = await req.payload.find({
        collection: 'entitlements',
        where: {
          and: [
            { user: { equals: userId } },
            { product: { equals: productId } },
            { status: { equals: 'active' } },
          ],
        },
        limit: 1,
        overrideAccess: true,
        req, // participate in active transaction if applicable
      })

      if (existing.totalDocs > 0) {
        const existingDoc = existing.docs[0]
        const currentDocId = operation === 'update' ? (originalDoc?.id ?? data.id) : null
        if (currentDocId !== existingDoc.id) {
          throw new Error(
            `Invariant Violation: User ${userId} already has an active entitlement for product ${productId}. Duplicate active entitlements are prohibited.`,
          )
        }
      }
    }
  }

  return data
}
```

---

### 3.3 File 3: `web/src/collections/Entitlements/index.ts`
```typescript
import type { CollectionConfig } from 'payload'
import {
  entitlementNoDirectWrite,
  entitlementReadAccess,
  entitlementUpdateAccess,
} from '@/access/entitlementAccess'
import { enforceEntitlementInvariants } from './hooks/enforceEntitlementInvariants'

export const Entitlements: CollectionConfig = {
  slug: 'entitlements',
  access: {
    create: entitlementNoDirectWrite,
    delete: entitlementNoDirectWrite,
    read: entitlementReadAccess,
    update: entitlementUpdateAccess,
  },
  admin: {
    defaultColumns: ['id', 'user', 'product', 'status', 'downloadCount', 'grantedAt'],
    group: 'Commerce',
    useAsTitle: 'id',
    description: 'Sổ cái quyền sở hữu và tải tài nguyên số (Entitlements Ledger - PLAN.md FR-16, Decision 0006)',
  },
  fields: [
    {
      name: 'user',
      type: 'relationship',
      relationTo: 'users',
      required: true,
      index: true,
      admin: {
        position: 'sidebar',
        readOnly: true,
        description: 'Người dùng sở hữu quyền tải',
      },
    },
    {
      name: 'product',
      type: 'relationship',
      relationTo: 'products',
      required: true,
      index: true,
      admin: {
        position: 'sidebar',
        readOnly: true,
        description: 'Sản phẩm được cấp quyền',
      },
    },
    {
      name: 'order',
      type: 'relationship',
      relationTo: 'orders',
      required: false,
      index: true,
      admin: {
        position: 'sidebar',
        readOnly: true,
        description: 'Đơn hàng mua sản phẩm (để trống nếu là tải miễn phí)',
      },
    },
    {
      name: 'orderItem',
      type: 'relationship',
      relationTo: 'order_items',
      required: false,
      index: true,
      admin: {
        position: 'sidebar',
        readOnly: true,
        description: 'Mục đơn hàng liên kết (để trống nếu là tải miễn phí)',
      },
    },
    {
      name: 'status',
      type: 'select',
      required: true,
      defaultValue: 'active',
      index: true,
      options: [
        { label: 'Có hiệu lực (active)', value: 'active' },
        { label: 'Bị thu hồi (revoked)', value: 'revoked' },
        { label: 'Hết hạn (expired)', value: 'expired' },
      ],
      admin: {
        position: 'sidebar',
        description: 'Trạng thái quyền tải',
      },
    },
    {
      name: 'grantedAt',
      type: 'date',
      required: true,
      defaultValue: () => new Date().toISOString(),
      admin: {
        position: 'sidebar',
        readOnly: true,
        description: 'Thời điểm cấp quyền',
      },
    },
    {
      name: 'downloadCount',
      type: 'number',
      required: true,
      defaultValue: 0,
      min: 0,
      admin: {
        position: 'sidebar',
        readOnly: true,
        description: 'Số lần đã tải file thành công',
      },
    },
    {
      name: 'maxDownloads',
      type: 'number',
      required: false,
      min: 1,
      admin: {
        description: 'Giới hạn số lần tải tối đa (để trống nếu không giới hạn)',
      },
    },
    {
      name: 'expiresAt',
      type: 'date',
      required: false,
      admin: {
        description: 'Thời điểm hết hạn tải (để trống nếu vĩnh viễn)',
      },
    },
    {
      name: 'revokedAt',
      type: 'date',
      required: false,
      admin: {
        description: 'Thời điểm thu hồi quyền',
      },
    },
    {
      name: 'reason',
      type: 'text',
      required: false,
      admin: {
        description: 'Lý do thu hồi hoặc ghi chú cấp quyền',
      },
    },
  ],
  hooks: {
    beforeChange: [enforceEntitlementInvariants],
  },
}
```

---

### 3.4 File 4: `web/src/access/downloadEventAccess.ts`
```typescript
import type { Access } from 'payload'
import { checkRole } from '@/access/utilities'

/**
 * Access rule for reading download audit events (PLAN.md §22, Decision 0006):
 * - Admin and FinanceAdmin can inspect download audit logs.
 * - Regular buyers, sellers, and unauthenticated guests are denied.
 */
export const downloadEventReadAccess: Access = ({ req: { user } }) => {
  if (!user) return false
  return checkRole(['admin', 'financeAdmin'], user)
}

/**
 * Download events are append-only server-side audit logs.
 * Direct creation, update, or deletion via public REST is strictly denied for all principals.
 * Writes occur exclusively via the download streaming handler with `overrideAccess: true`.
 */
export const downloadEventNoDirectWrite: Access = () => false
```

---

### 3.5 File 5: `web/src/collections/DownloadEvents/index.ts`
```typescript
import type { CollectionConfig } from 'payload'
import {
  downloadEventNoDirectWrite,
  downloadEventReadAccess,
} from '@/access/downloadEventAccess'

export const DownloadEvents: CollectionConfig = {
  slug: 'download_events',
  access: {
    create: downloadEventNoDirectWrite,
    delete: downloadEventNoDirectWrite,
    read: downloadEventReadAccess,
    update: downloadEventNoDirectWrite,
  },
  admin: {
    defaultColumns: ['id', 'product', 'user', 'status', 'downloadedAt', 'ipAddress'],
    group: 'Commerce',
    useAsTitle: 'id',
    description: 'Nhật ký kiểm toán lượt tải tệp riêng tư (Append-Only Audit Log - PLAN.md FR-17, Decision 0006)',
  },
  fields: [
    {
      name: 'user',
      type: 'relationship',
      relationTo: 'users',
      required: false,
      index: true,
      admin: {
        position: 'sidebar',
        readOnly: true,
        description: 'Người dùng thực hiện yêu cầu tải (để trống nếu là khách hoặc unauthenticated)',
      },
    },
    {
      name: 'product',
      type: 'relationship',
      relationTo: 'products',
      required: true,
      index: true,
      admin: {
        position: 'sidebar',
        readOnly: true,
        description: 'Sản phẩm được yêu cầu tải',
      },
    },
    {
      name: 'entitlement',
      type: 'relationship',
      relationTo: 'entitlements',
      required: false,
      index: true,
      admin: {
        position: 'sidebar',
        readOnly: true,
        description: 'Quyền sở hữu liên kết (để trống nếu bị từ chối trước khi xác thực quyền)',
      },
    },
    {
      name: 'ipAddress',
      type: 'text',
      required: false,
      admin: {
        readOnly: true,
        description: 'Địa chỉ IP của client',
      },
    },
    {
      name: 'userAgent',
      type: 'text',
      required: false,
      admin: {
        readOnly: true,
        description: 'User-Agent header của client',
      },
    },
    {
      name: 'downloadedAt',
      type: 'date',
      required: true,
      defaultValue: () => new Date().toISOString(),
      index: true,
      admin: {
        position: 'sidebar',
        readOnly: true,
        description: 'Thời điểm ghi nhận lượt tải',
      },
    },
    {
      name: 'status',
      type: 'select',
      required: true,
      index: true,
      options: [
        { label: 'Thành công (SUCCESS)', value: 'SUCCESS' },
        { label: 'Từ chối (DENIED)', value: 'DENIED' },
        { label: 'Hết hạn (EXPIRED)', value: 'EXPIRED' },
        { label: 'Lỗi kỹ thuật (FAILED)', value: 'FAILED' },
      ],
      admin: {
        position: 'sidebar',
        readOnly: true,
        description: 'Kết quả của yêu cầu tải',
      },
    },
    {
      name: 'downloadTokenHash',
      type: 'text',
      required: false,
      index: true,
      admin: {
        readOnly: true,
        description: 'Mã băm SHA-256 của token một lần (phục vụ đối soát và chống replay)',
      },
    },
    {
      name: 'errorReason',
      type: 'text',
      required: false,
      admin: {
        readOnly: true,
        description: 'Nguyên nhân từ chối hoặc chi tiết lỗi kỹ thuật',
      },
    },
  ],
}
```

---

### 3.6 File 6: `web/src/payload.config.ts` Diff Patch
```diff
--- a/web/src/payload.config.ts
+++ b/web/src/payload.config.ts
@@ -23,6 +23,8 @@ import { PaymentWebhookEvents } from '@/collections/PaymentWebhookEvents'
 import { ProductFiles } from '@/collections/ProductFiles'
 import { ProductPreviews } from '@/collections/ProductPreviews'
 import { Products } from '@/collections/Products'
+import { Entitlements } from '@/collections/Entitlements'
+import { DownloadEvents } from '@/collections/DownloadEvents'
 import { SellerProfiles } from '@/collections/SellerProfiles'
 import { SoftwareTypes } from '@/collections/SoftwareTypes'
 import { Tags } from '@/collections/Tags'
@@ -66,6 +68,8 @@ export default buildConfig({
     PaymentIntents,
     PaymentTransactions,
     PaymentWebhookEvents,
+    Entitlements,
+    DownloadEvents,
   ],
   db: postgresAdapter({
```

---

### 3.7 PostgreSQL Migration Batch 6 Schema Specifications (for `m1_explorer_3`)

The following SQL DDL defines the exact database schema to be emitted in PostgreSQL migration Batch 6:

```sql
-- 1. PostgreSQL Enum Types
CREATE TYPE "public"."enum_entitlements_status" AS ENUM('active', 'revoked', 'expired');
CREATE TYPE "public"."enum_download_events_status" AS ENUM('SUCCESS', 'DENIED', 'EXPIRED', 'FAILED');

-- 2. Entitlements Table
CREATE TABLE "entitlements" (
  "id" serial PRIMARY KEY NOT NULL,
  "user_id" integer NOT NULL,
  "product_id" integer NOT NULL,
  "order_id" integer,
  "order_item_id" integer,
  "status" "enum_entitlements_status" DEFAULT 'active' NOT NULL,
  "granted_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  "download_count" numeric DEFAULT 0 NOT NULL,
  "max_downloads" numeric,
  "expires_at" timestamp(3) with time zone,
  "revoked_at" timestamp(3) with time zone,
  "reason" varchar,
  "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
);

-- Foreign Keys for entitlements
ALTER TABLE "entitlements" ADD CONSTRAINT "entitlements_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "entitlements" ADD CONSTRAINT "entitlements_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "entitlements" ADD CONSTRAINT "entitlements_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "entitlements" ADD CONSTRAINT "entitlements_order_item_id_order_items_id_fk" FOREIGN KEY ("order_item_id") REFERENCES "public"."order_items"("id") ON DELETE set null ON UPDATE no action;

-- Indexes for entitlements
CREATE INDEX "entitlements_user_idx" ON "entitlements" USING btree ("user_id");
CREATE INDEX "entitlements_product_idx" ON "entitlements" USING btree ("product_id");
CREATE INDEX "entitlements_order_idx" ON "entitlements" USING btree ("order_id");
CREATE INDEX "entitlements_order_item_idx" ON "entitlements" USING btree ("order_item_id");
CREATE INDEX "entitlements_status_idx" ON "entitlements" USING btree ("status");
CREATE INDEX "entitlements_updated_at_idx" ON "entitlements" USING btree ("updated_at");
CREATE INDEX "entitlements_created_at_idx" ON "entitlements" USING btree ("created_at");

-- HARD INVARIANT: Only 1 active entitlement per (user_id, product_id)
CREATE UNIQUE INDEX "entitlements_user_product_active_idx" ON "entitlements" ("user_id", "product_id") WHERE ("status" = 'active');

-- 3. Download Events Table
CREATE TABLE "download_events" (
  "id" serial PRIMARY KEY NOT NULL,
  "user_id" integer,
  "product_id" integer NOT NULL,
  "entitlement_id" integer,
  "ip_address" varchar,
  "user_agent" varchar,
  "downloaded_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  "status" "enum_download_events_status" NOT NULL,
  "download_token_hash" varchar,
  "error_reason" varchar,
  "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
);

-- Foreign Keys for download_events
ALTER TABLE "download_events" ADD CONSTRAINT "download_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "download_events" ADD CONSTRAINT "download_events_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "download_events" ADD CONSTRAINT "download_events_entitlement_id_entitlements_id_fk" FOREIGN KEY ("entitlement_id") REFERENCES "public"."entitlements"("id") ON DELETE set null ON UPDATE no action;

-- Indexes for download_events
CREATE INDEX "download_events_user_idx" ON "download_events" USING btree ("user_id");
CREATE INDEX "download_events_product_idx" ON "download_events" USING btree ("product_id");
CREATE INDEX "download_events_entitlement_idx" ON "download_events" USING btree ("entitlement_id");
CREATE INDEX "download_events_downloaded_at_idx" ON "download_events" USING btree ("downloaded_at");
CREATE INDEX "download_events_status_idx" ON "download_events" USING btree ("status");
CREATE INDEX "download_events_download_token_hash_idx" ON "download_events" USING btree ("download_token_hash");
CREATE INDEX "download_events_updated_at_idx" ON "download_events" USING btree ("updated_at");
CREATE INDEX "download_events_created_at_idx" ON "download_events" USING btree ("created_at");

-- 4. Locked Documents Rel Columns
ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "entitlements_id" integer;
ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "download_events_id" integer;
```

---

## 4. Caveats

1. **Active Entitlements vs Inactive History in UI**:
   - The read access query for regular users enforces `{ and: [{ user: { equals: user.id } }, { status: { equals: 'active' } }] }`. If the user library UI ever needs to display expired or revoked entitlements (e.g., with a badge "Revoked - Contact Support"), this query can be relaxed to `{ user: { equals: user.id } }` while keeping the active entitlement check in the download token issuance endpoint. For Milestone 1, the design adheres strictly to the requirement: *user can read own active entitlements*.
2. **PostgreSQL Partial Unique Index vs Payload CMS Config**:
   - Payload CMS field definitions support standard `unique: true` across all rows, but do not provide a native config DSL for conditional `WHERE ("status" = 'active')` partial unique indexes. Therefore, this invariant is enforced jointly: by the Payload `beforeChange` hook at the application layer, and by migration Batch 6's raw DDL index at the PostgreSQL storage engine layer.
3. **Relation to `orders` and `order_items`**:
   - `order` and `orderItem` relations point to `slug: 'orders'` and `slug: 'order_items'`. When Milestone 1 lands, both `m1_explorer_1` (Orders & OrderItems) and `m1_explorer_2` (Entitlements & DownloadEvents) must register in `web/src/payload.config.ts` together so Payload validates all foreign relationships during startup and type generation.

---

## 5. Conclusion

The implementation design for `Entitlements` and `DownloadEvents` is fully specified and aligned with:
- The Phase 5 digital architecture (PLAN.md FR-16, FR-17, FR-18, §22, Decision 0006).
- The anti-duplicate active ownership invariant (`CREATE UNIQUE INDEX ... WHERE status = 'active'`).
- The security boundary denying all direct REST collection API writes for untrusted principals.
- Peer milestones: `m1_explorer_1` (Orders & OrderItems collections) and `m1_explorer_3` (PostgreSQL Batch 6 migration).

---

## 6. Verification Method

### 6.1 Programmatic Unit / Integration Test Assertions
Create or execute a test suite `web/tests/int/entitlements-schema.int.spec.ts` testing the following assertions:

1. **Direct REST Writes Denied**:
   ```ts
   // Guest / Buyer cannot create entitlements directly
   await expect(
     payload.create({
       collection: 'entitlements',
       data: { user: buyer.id, product: product.id, status: 'active' },
       user: buyer,
       overrideAccess: false,
     })
   ).rejects.toThrow()

   // Admin cannot create entitlements directly without overrideAccess
   await expect(
     payload.create({
       collection: 'entitlements',
       data: { user: buyer.id, product: product.id, status: 'active' },
       user: admin,
       overrideAccess: false,
     })
   ).rejects.toThrow()

   // Direct creation of download_events is denied for all
   await expect(
     payload.create({
       collection: 'download_events',
       data: { product: product.id, status: 'SUCCESS' },
       user: buyer,
       overrideAccess: false,
     })
   ).rejects.toThrow()
   ```

2. **Read Scope Validation**:
   ```ts
   // Buyer can read own active entitlement
   const docs = await payload.find({
     collection: 'entitlements',
     where: { product: { equals: product.id } },
     user: buyer,
     overrideAccess: false,
   })
   expect(docs.totalDocs).toBe(1)

   // Buyer cannot read other users' entitlements
   const otherDocs = await payload.find({
     collection: 'entitlements',
     where: { user: { equals: otherBuyer.id } },
     user: buyer,
     overrideAccess: false,
   })
   expect(otherDocs.totalDocs).toBe(0)

   // Buyer cannot read revoked entitlement
   await payload.update({
     collection: 'entitlements',
     id: activeEntitlement.id,
     data: { status: 'revoked' },
     overrideAccess: true,
   })
   const revokedDocs = await payload.find({
     collection: 'entitlements',
     where: { id: { equals: activeEntitlement.id } },
     user: buyer,
     overrideAccess: false,
   })
   expect(revokedDocs.totalDocs).toBe(0)
   ```

3. **Anti-Duplicate Invariant**:
   ```ts
   // Attempting to grant a second active entitlement for same user & product throws
   await expect(
     payload.create({
       collection: 'entitlements',
       data: { user: buyer.id, product: product.id, status: 'active' },
       overrideAccess: true,
     })
   ).rejects.toThrow(/already has an active entitlement/)
   ```

### 6.2 Execution Commands
```bash
# 1. Lint check
pnpm --prefix web lint

# 2. TypeScript compilation & schema check
pnpm --prefix web build --no-lint

# 3. Integration tests
pnpm --prefix web vitest run tests/int/entitlements-schema.int.spec.ts
```
