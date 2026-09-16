# Handoff Report: Phase 6 Milestone 1 — Focus Area 2 (`withdrawals` & `withdrawal_events` Collections)

**Author**: `m1_explorer_2` (teamwork_preview_explorer)  
**Date**: 2026-09-15  
**Target Milestone**: Milestone 1 (Focus Area 2: Withdrawals & Withdrawal Events Schema & Invariants)  
**Status**: Completed (Hard Handoff)

---

## 1. Observation

Direct observations from the repository codebase, specifications, and architecture decisions:

1. **User Request & Requirements (ORIGINAL_REQUEST.md lines 98-109)**:
   - FR-32 / R2 specifies:
     - Seller submits: amount, bank name, account number, account holder name.
     - System validates: amount ≤ available balance, respects min/max limits (min 50,000 VND, max 50,000,000 VND).
     - Available balance is reserved upon request.
     - Withdrawal states: `REQUESTED → UNDER_REVIEW → APPROVED → PROCESSING → PAID` (success path), with `REJECTED`, `CANCELLED`, `FAILED` as terminal/error states.
     - Finance Admin or Super Admin can approve/reject withdrawals (PLAN.md §22 authorization matrix: `Approve withdrawal`: Finance ✅, Admin ✅, all others ❌).
     - Rejected withdrawals must release reserved balance back to available.
     - All state transitions must have audit logging via `withdrawal_events`.

2. **Money Write Path & Denial of Direct Mutations (docs/decisions/0002-money-write-layer.md lines 39-53)**:
   - "Direct writes denied for every principal, including administrators. Money collections deny `create`, `update`, and `delete` through Payload access control for all roles and expose read only."
   - "Ledger append-only. Ledger rows are never updated or deleted; corrections are reversal entries (BR-03)."
   - Confirmed in `web/src/access/canEditMoney.ts`:
     ```typescript
     export const canEditMoney: Access = () => false
     ```
   - Confirmed in `web/src/collections/WalletLedger.ts` (lines 14-19):
     ```typescript
     access: {
       create: canEditMoney,
       delete: canEditMoney,
       read: walletLedgerReadAccess,
       update: canEditMoney,
     }
     ```

3. **Role Model & Access Matrix (docs/decisions/0008-role-model.md lines 29-55 & PLAN.md §22)**:
   - Roles: `admin`, `buyer`, `seller`, `moderator`, `financeAdmin`.
   - Access helper `checkRole` in `web/src/access/utilities.ts`:
     ```typescript
     export const checkRole = (allRoles: User['roles'] = [], user?: User | null): boolean => ...
     ```
   - Withdrawals read access: Admin and FinanceAdmin see all; sellers see only their own (`seller === user.id`); buyers and guests denied.
   - Withdrawal events read access: Admin and FinanceAdmin see all; seller owners see events associated with their own withdrawal (`withdrawal.seller === user.id`); others denied.

4. **Code Generation Patterns in Existing Collections (`web/src/collections/Orders/index.ts` lines 45-56)**:
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
   For withdrawals, the required pattern is `WTH-YYYYMMDD-XXXXX` (e.g. `WTH-20260915-A1B2C`).

5. **Bank Info Group Field Pattern in Existing Collections (`web/src/collections/SellerProfiles.ts` lines 57-77)**:
   ```typescript
   {
     name: 'payoutInfo',
     type: 'group',
     label: 'Thông tin tài khoản nhận thanh toán',
     fields: [
       { name: 'bankName', type: 'text', label: 'Tên ngân hàng' },
       { name: 'accountNumber', type: 'text', label: 'Số tài khoản ngân hàng' },
       { name: 'accountHolderName', type: 'text', label: 'Tên chủ tài khoản' },
     ],
   }
   ```
   In PostgreSQL (`web/src/migrations/20260915_062953_phase3_seller_moderation.ts` lines 62-64), this generates columns `payout_info_bank_name`, `payout_info_account_number`, `payout_info_account_holder_name`.
   For `withdrawals`, group name `bankInfo` generates `bank_info_bank_name`, `bank_info_account_number`, `bank_info_account_holder_name`.

6. **Audit Trail & Immutability Patterns (`web/src/collections/DownloadEvents/index.ts` & `OrderItems/hooks/preventOrderItemMutation.ts`)**:
   - `DownloadEvents` and `OrderItems` are append-only.
   - Updates throw an error:
     ```typescript
     export const preventOrderItemMutation: CollectionBeforeChangeHook = ({ operation }) => {
       if (operation === 'update') {
         throw new Error('Order items are immutable (BR-07). Modifying an existing order item is strictly prohibited.')
       }
     }
     ```
   - For `withdrawal_events`, direct mutations must be blocked at both access control level (`canEditMoney`) and hook level (`beforeChange` rejecting `update`, `beforeDelete` rejecting `delete`).

7. **Payload 3.x Join Relationships (`web/src/collections/Orders/index.ts` lines 139-148)**:
   ```typescript
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
   }
   ```
   Can be leveraged on `withdrawals` with `join` to `withdrawal_events` on `withdrawal`.

8. **Test Harness & Access Control Verification Pattern (`web/tests/int/m1-access-control.int.spec.ts` lines 1293-1324)**:
   Access functions are verified with mock user contexts asserting exact booleans or `Where` AST objects:
   ```typescript
   expect(orderItemReadAccess({ req: { user: null } } as any)).toBe(false)
   expect(orderItemReadAccess({ req: { user: { id: 20, roles: ['admin'] } } } as any)).toBe(true)
   expect(orderItemReadAccess({ req: { user: { id: 21, roles: ['financeAdmin'] } } } as any)).toBe(true)
   expect(orderItemReadAccess({ req: { user: { id: 22, roles: ['buyer'] } } } as any)).toEqual({
     or: [{ seller: { equals: 22 } }, { 'order.buyer': { equals: 22 } }],
   })
   ```

---

## 2. Logic Chain

1. **Denial of Direct REST/GraphQL Mutations**:
   - *Observation*: Decision 0002 explicitly mandates that all financial balance movements and ledger-adjacent tables must deny `create`, `update`, and `delete` through collection access control.
   - *Reasoning*: A seller requesting a withdrawal cannot simply `POST` a withdrawal record to `/api/withdrawals` with arbitrary amount or status, nor can an admin modify fields directly without ledger consistency checks.
   - *Deduction*: `withdrawals` must set `create: canEditMoney`, `update: canEditMoney`, `delete: canEditMoney`. `withdrawal_events` must set `create: canEditMoney`, `update: canEditMoney`, `delete: canEditMoney`. All valid operations occur via dedicated backend service endpoints using `overrideAccess: true`.

2. **Read Access Scoping & RBAC**:
   - *Observation*: PLAN.md §22 gives Super Admin and Finance Admin unrestricted visibility over all financial entities, while sellers may only view their own records. Buyers and unauthenticated users have no access to seller withdrawals.
   - *Reasoning*: For `withdrawals`, when `checkRole(['admin', 'financeAdmin'], user)` is true, return `true`. For authenticated seller, return `{ seller: { equals: user.id } }`. For guests or other users, return `false`.
   - *Reasoning for `withdrawal_events`*: An event references `withdrawal`. A seller owner needs to see the audit trail of their own withdrawal (e.g. why it was rejected, who reviewed it). By using `{ 'withdrawal.seller': { equals: user.id } }`, Payload CMS executes a relational join query to enforce that sellers only see events belonging to their own withdrawal. Admin and FinanceAdmin return `true`.

3. **Unique Withdrawal Code Generation (`code`)**:
   - *Observation*: Requirements dictate format `WTH-YYYYMMDD-XXXXX`.
   - *Reasoning*: Following the pattern established in `Orders/index.ts`, a `beforeValidate` hook checks `operation === 'create' && !value`. If not provided, it generates `WTH-${dateStr}-${crypto.randomBytes(3).toString('hex').slice(0, 5).toUpperCase()}`. This ensures uniqueness, indexing, and human-readable tracking.

4. **Withdrawal Field Validation & Financial Boundaries**:
   - *Observation*: Requirements specify: amount in VND, min 50,000, max 50,000,000, integer step. Bank info contains `bankName`, `accountNumber`, `accountHolderName`.
   - *Reasoning*: In Payload CMS, `amount` field must have `min: 50000`, `max: 50000000`, and a validator/hook ensuring whole integers (`Number.isInteger(amount)`). `currency` must be `select` with single option `'VND'` and `defaultValue: 'VND'`. `bankInfo` must be a `group` field with required subfields. Normalization should trim strings and capitalize `accountHolderName`.

5. **State Machine Invariants & Hooks**:
   - *Observation*: Withdrawal lifecycle is `REQUESTED → UNDER_REVIEW → APPROVED → PROCESSING → PAID`, with terminal/error states `REJECTED`, `CANCELLED`, `FAILED`.
   - *Reasoning*:
     - When status transitions to `UNDER_REVIEW`, `APPROVED`, or `REJECTED`, `reviewedAt` and `reviewedBy` must be recorded.
     - When status transitions to `PAID`, `paidAt` must be recorded.
     - When status transitions to `REJECTED`, `rejectionReason` must be mandatory.
     - When status transitions to `FAILED`, `failureReason` must be mandatory.
     - Once in terminal state `PAID`, `REJECTED`, or `CANCELLED`, no further transitions are allowed.
     - Core financial fields (`amount`, `seller`, `currency`, `code`) are immutable once created.

6. **Append-Only Audit Trail for `withdrawal_events`**:
   - *Observation*: Invariant BR-03 and prompt specify an immutable audit log.
   - *Reasoning*: `withdrawal_events` documents can never be modified or deleted. A `beforeChange` hook throws an exception if `operation === 'update'`. A `beforeDelete` hook throws an exception if deletion is attempted. Fields store `fromStatus`, `toStatus`, `actor`, `actorRole`, `reason/notes`, `timestamp`, and `metadata`.

---

## 3. Caveats

1. **Balance Reservation Mechanism**:
   - This specification designs the Payload schema, access controls, indices, hooks, and migration requirements for `withdrawals` and `withdrawal_events`.
   - The actual balance reservation execution (debiting/reserving available earnings, locking the seller balance during concurrent requests, and crediting back upon `REJECTED` or `CANCELLED`) belongs to Milestone 2 (Withdrawal Service & Endpoints: `web/src/services/withdrawal.ts`). The hooks here provide schema-level defense-in-depth, but do not replace the transactional service.

2. **Nested Relationship Query in PostgreSQL**:
   - In `withdrawalEventReadAccess`, the condition `'withdrawal.seller': { equals: user.id }` relies on Payload 3.x's PostgreSQL query translator joining the `withdrawals` table. This is the standard Payload pattern (matching `orderItemReadAccess`). As an additional optimization, Milestone 2 services can directly query with `overrideAccess: true` and filter explicitly.

3. **Status Extension Alignment**:
   - The status enum `enum_withdrawals_status` contains: `'REQUESTED'`, `'UNDER_REVIEW'`, `'APPROVED'`, `'PROCESSING'`, `'PAID'`, `'REJECTED'`, `'CANCELLED'`, `'FAILED'`. All 8 values are strictly defined per PLAN.md §11 and ORIGINAL_REQUEST.md line 105.

---

## 4. Conclusion & Detailed Design

### 4.1 Architecture Overview

```
web/src/
├── access/
│   └── withdrawalAccess.ts                     # RBAC & canEditMoney rules
├── collections/
│   ├── Withdrawals/
│   │   ├── hooks/
│   │   │   ├── generateWithdrawalCode.ts       # WTH-YYYYMMDD-XXXXX generator
│   │   │   └── validateWithdrawalInvariants.ts # Immutability & transition rules
│   │   └── index.ts                            # Withdrawals CollectionConfig
│   └── WithdrawalEvents/
│       ├── hooks/
│       │   └── preventWithdrawalEventMutation.ts # Immutable append-only audit hook
│       └── index.ts                            # WithdrawalEvents CollectionConfig
```

---

### 4.2 File 1: `web/src/access/withdrawalAccess.ts`

```typescript
import type { Access, Where } from 'payload'
import { checkRole } from '@/access/utilities'
import { canEditMoney } from '@/access/canEditMoney'

/**
 * Access control for Withdrawals & Withdrawal Events
 *
 * Rules:
 * - Direct writes (create, update, delete) via REST/GraphQL are denied for ALL principals (Decision 0002).
 *   Withdrawals and audit events must be created/modified exclusively through dedicated backend
 *   services using `overrideAccess: true`.
 * - Super Admin and FinanceAdmin can read all withdrawals and events (PLAN.md §22).
 * - Sellers can read only their own withdrawals and associated audit events.
 * - Buyers and unauthenticated users are denied.
 */

// Direct collection write denial via REST/GraphQL
export const withdrawalCreateAccess: Access = canEditMoney
export const withdrawalUpdateAccess: Access = canEditMoney
export const withdrawalDeleteAccess: Access = canEditMoney

export const withdrawalEventCreateAccess: Access = canEditMoney
export const withdrawalEventUpdateAccess: Access = canEditMoney
export const withdrawalEventDeleteAccess: Access = canEditMoney

/**
 * Read access for withdrawals:
 * - Super Admin & FinanceAdmin: full read
 * - Seller: read own withdrawals (where seller === req.user.id)
 * - Others: denied
 */
export const withdrawalReadAccess: Access = ({ req: { user } }) => {
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

/**
 * Read access for withdrawal events:
 * - Super Admin & FinanceAdmin: full read
 * - Seller: read events corresponding to own withdrawals
 * - Others: denied
 */
export const withdrawalEventReadAccess: Access = ({ req: { user } }) => {
  if (!user) return false

  if (checkRole(['admin', 'financeAdmin'], user)) {
    return true
  }

  const query: Where = {
    'withdrawal.seller': {
      equals: user.id,
    },
  }

  return query
}
```

---

### 4.3 File 2: `web/src/collections/Withdrawals/hooks/generateWithdrawalCode.ts`

```typescript
import type { FieldHook } from 'payload'
import crypto from 'crypto'

/**
 * Generates unique code in format WTH-YYYYMMDD-XXXXX
 * e.g. WTH-20260915-A1B2C
 */
export const generateWithdrawalCode: FieldHook = ({ value, operation }) => {
  if (operation === 'create' && !value) {
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '')
    const randomSuffix = crypto.randomBytes(3).toString('hex').slice(0, 5).toUpperCase()
    return `WTH-${dateStr}-${randomSuffix}`
  }
  return value
}
```

---

### 4.4 File 3: `web/src/collections/Withdrawals/hooks/validateWithdrawalInvariants.ts`

```typescript
import type { CollectionBeforeChangeHook, CollectionBeforeValidateHook } from 'payload'

const VALID_TRANSITIONS: Record<string, string[]> = {
  REQUESTED: ['UNDER_REVIEW', 'APPROVED', 'REJECTED', 'CANCELLED'],
  UNDER_REVIEW: ['APPROVED', 'REJECTED', 'CANCELLED'],
  APPROVED: ['PROCESSING', 'REJECTED'],
  PROCESSING: ['PAID', 'FAILED'],
  FAILED: ['PROCESSING', 'REJECTED', 'CANCELLED'],
  PAID: [],       // Terminal state
  REJECTED: [],   // Terminal state
  CANCELLED: [],  // Terminal state
}

/**
 * Validates bank info and amount before validation
 */
export const validateWithdrawalBeforeValidate: CollectionBeforeValidateHook = ({
  data,
  operation,
}) => {
  if (!data) return data

  // Normalize bank info
  if (data.bankInfo) {
    if (data.bankInfo.bankName) {
      data.bankInfo.bankName = String(data.bankInfo.bankName).trim()
    }
    if (data.bankInfo.accountNumber) {
      data.bankInfo.accountNumber = String(data.bankInfo.accountNumber).trim().replace(/\s+/g, '')
    }
    if (data.bankInfo.accountHolderName) {
      data.bankInfo.accountHolderName = String(data.bankInfo.accountHolderName).trim().toUpperCase()
    }
  }

  // Validate amount integer
  if (data.amount !== undefined && data.amount !== null) {
    if (!Number.isInteger(data.amount) || data.amount < 50000 || data.amount > 50000000) {
      throw new Error('Withdrawal amount must be an integer between 50,000 and 50,000,000 VND.')
    }
  }

  return data
}

/**
 * Enforces immutability of financial fields and valid state transitions
 */
export const validateWithdrawalInvariants: CollectionBeforeChangeHook = async ({
  data,
  originalDoc,
  operation,
  req,
}) => {
  if (operation === 'update' && originalDoc) {
    // 1. Prevent modification of immutable fields
    if (data.seller !== undefined && data.seller !== originalDoc.seller) {
      const originalSellerId = typeof originalDoc.seller === 'object' ? originalDoc.seller?.id : originalDoc.seller
      const newSellerId = typeof data.seller === 'object' ? data.seller?.id : data.seller
      if (originalSellerId !== newSellerId) {
        throw new Error('Cannot change seller on an existing withdrawal record.')
      }
    }

    if (data.amount !== undefined && data.amount !== originalDoc.amount) {
      throw new Error('Cannot change amount on an existing withdrawal record.')
    }

    if (data.currency !== undefined && data.currency !== originalDoc.currency) {
      throw new Error('Cannot change currency on an existing withdrawal record.')
    }

    if (data.code !== undefined && data.code !== originalDoc.code) {
      throw new Error('Cannot change code on an existing withdrawal record.')
    }

    // 2. Validate state machine transition
    const currentStatus = originalDoc.status
    const targetStatus = data.status

    if (targetStatus && targetStatus !== currentStatus) {
      const allowedNextStates = VALID_TRANSITIONS[currentStatus] || []
      if (!allowedNextStates.includes(targetStatus)) {
        throw new Error(
          `Invalid withdrawal state transition from ${currentStatus} to ${targetStatus}.`,
        )
      }

      const nowIso = new Date().toISOString()

      // Set review metadata
      if (['UNDER_REVIEW', 'APPROVED', 'REJECTED'].includes(targetStatus)) {
        if (!data.reviewedAt) data.reviewedAt = nowIso
        if (req.user?.id && !data.reviewedBy) data.reviewedBy = req.user.id
      }

      // Set paid metadata
      if (targetStatus === 'PAID') {
        if (!data.paidAt) data.paidAt = nowIso
      }

      // Ensure reasons are provided on failure/rejection
      if (targetStatus === 'REJECTED' && !data.rejectionReason && !originalDoc.rejectionReason) {
        throw new Error('Rejection reason is required when rejecting a withdrawal.')
      }

      if (targetStatus === 'FAILED' && !data.failureReason && !originalDoc.failureReason) {
        throw new Error('Failure reason is required when marking a withdrawal as failed.')
      }
    }
  }

  return data
}
```

---

### 4.5 File 4: `web/src/collections/Withdrawals/index.ts`

```typescript
import type { CollectionConfig } from 'payload'
import {
  withdrawalCreateAccess,
  withdrawalDeleteAccess,
  withdrawalReadAccess,
  withdrawalUpdateAccess,
} from '@/access/withdrawalAccess'
import { generateWithdrawalCode } from './hooks/generateWithdrawalCode'
import {
  validateWithdrawalBeforeValidate,
  validateWithdrawalInvariants,
} from './hooks/validateWithdrawalInvariants'

export const Withdrawals: CollectionConfig = {
  slug: 'withdrawals',
  access: {
    create: withdrawalCreateAccess,
    delete: withdrawalDeleteAccess,
    read: withdrawalReadAccess,
    update: withdrawalUpdateAccess,
  },
  admin: {
    defaultColumns: [
      'code',
      'seller',
      'amount',
      'currency',
      'status',
      'requestedAt',
      'reviewedAt',
      'paidAt',
    ],
    group: 'Finance',
    useAsTitle: 'code',
    description: 'Yêu cầu rút tiền của Người bán (Seller Withdrawals - FR-32, FLOW-U13)',
  },
  hooks: {
    beforeValidate: [validateWithdrawalBeforeValidate],
    beforeChange: [validateWithdrawalInvariants],
  },
  fields: [
    {
      name: 'code',
      type: 'text',
      required: true,
      unique: true,
      index: true,
      label: 'Mã yêu cầu rút tiền',
      admin: {
        readOnly: true,
        description: 'Mã định danh duy nhất (VD: WTH-20260915-XXXXX)',
      },
      hooks: {
        beforeValidate: [generateWithdrawalCode],
      },
    },
    {
      name: 'seller',
      type: 'relationship',
      relationTo: 'users',
      required: true,
      index: true,
      label: 'Người bán (Seller)',
      admin: {
        readOnly: true,
        position: 'sidebar',
      },
    },
    {
      name: 'amount',
      type: 'number',
      required: true,
      min: 50000,
      max: 50000000,
      label: 'Số tiền rút (VND)',
      admin: {
        readOnly: true,
        step: 1,
        description: 'Số tiền rút (50.000 VND - 50.000.000 VND)',
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
      name: 'status',
      type: 'select',
      required: true,
      defaultValue: 'REQUESTED',
      index: true,
      label: 'Trạng thái xử lý',
      options: [
        { label: 'Yêu cầu mới (REQUESTED)', value: 'REQUESTED' },
        { label: 'Đang xem xét (UNDER_REVIEW)', value: 'UNDER_REVIEW' },
        { label: 'Đã duyệt (APPROVED)', value: 'APPROVED' },
        { label: 'Đang giải ngân (PROCESSING)', value: 'PROCESSING' },
        { label: 'Đã chi trả (PAID)', value: 'PAID' },
        { label: 'Từ chối (REJECTED)', value: 'REJECTED' },
        { label: 'Đã hủy (CANCELLED)', value: 'CANCELLED' },
        { label: 'Thất bại (FAILED)', value: 'FAILED' },
      ],
      admin: {
        position: 'sidebar',
      },
    },
    {
      name: 'bankInfo',
      type: 'group',
      label: 'Thông tin tài khoản nhận tiền',
      fields: [
        {
          name: 'bankName',
          type: 'text',
          required: true,
          label: 'Tên ngân hàng (ví dụ: Vietcombank, MBBank, Techcombank)',
        },
        {
          name: 'accountNumber',
          type: 'text',
          required: true,
          label: 'Số tài khoản ngân hàng',
        },
        {
          name: 'accountHolderName',
          type: 'text',
          required: true,
          label: 'Tên chủ tài khoản (viết hoa không dấu)',
        },
      ],
    },
    {
      name: 'requestedAt',
      type: 'date',
      required: true,
      defaultValue: () => new Date().toISOString(),
      index: true,
      label: 'Thời điểm yêu cầu',
      admin: {
        readOnly: true,
        position: 'sidebar',
      },
    },
    {
      name: 'reviewedAt',
      type: 'date',
      label: 'Thời điểm xét duyệt',
      admin: {
        readOnly: true,
        position: 'sidebar',
      },
    },
    {
      name: 'reviewedBy',
      type: 'relationship',
      relationTo: 'users',
      label: 'Người xét duyệt (Finance/Admin)',
      admin: {
        readOnly: true,
        position: 'sidebar',
      },
    },
    {
      name: 'paidAt',
      type: 'date',
      label: 'Thời điểm giải ngân thành công',
      admin: {
        readOnly: true,
        position: 'sidebar',
      },
    },
    {
      name: 'rejectionReason',
      type: 'text',
      label: 'Lý do từ chối',
      admin: {
        position: 'sidebar',
      },
    },
    {
      name: 'failureReason',
      type: 'text',
      label: 'Lý do giải ngân thất bại',
      admin: {
        position: 'sidebar',
      },
    },
    {
      name: 'notes',
      type: 'textarea',
      label: 'Ghi chú xử lý nội bộ',
    },
    {
      name: 'events',
      type: 'join',
      collection: 'withdrawal_events',
      on: 'withdrawal',
      label: 'Nhật ký sự kiện (Audit Log)',
      admin: {
        allowCreate: false,
        defaultColumns: ['fromStatus', 'toStatus', 'actor', 'actorRole', 'timestamp', 'reason'],
      },
    },
  ],
}
```

---

### 4.6 File 5: `web/src/collections/WithdrawalEvents/hooks/preventWithdrawalEventMutation.ts`

```typescript
import type { CollectionBeforeChangeHook, CollectionBeforeDeleteHook } from 'payload'

/**
 * Enforces BR-03: Audit events are append-only and strictly immutable.
 */
export const preventWithdrawalEventMutation: CollectionBeforeChangeHook = async ({
  data,
  operation,
  req,
}) => {
  if (operation === 'update') {
    throw new Error(
      'Withdrawal audit events are immutable. Updates to existing audit logs are strictly prohibited.',
    )
  }

  // Ensure timestamp is present
  if (!data.timestamp) {
    data.timestamp = new Date().toISOString()
  }

  // Populate actor and actorRole from session if not explicitly provided
  if (req.user) {
    if (!data.actor) {
      data.actor = req.user.id
    }
    if (!data.actorRole) {
      data.actorRole = req.user.roles?.[0] || 'user'
    }
  }

  return data
}

export const preventWithdrawalEventDeletion: CollectionBeforeDeleteHook = async () => {
  throw new Error(
    'Withdrawal audit events are immutable records and cannot be deleted.',
  )
}
```

---

### 4.7 File 6: `web/src/collections/WithdrawalEvents/index.ts`

```typescript
import type { CollectionConfig } from 'payload'
import {
  withdrawalEventCreateAccess,
  withdrawalEventDeleteAccess,
  withdrawalEventReadAccess,
  withdrawalEventUpdateAccess,
} from '@/access/withdrawalAccess'
import {
  preventWithdrawalEventDeletion,
  preventWithdrawalEventMutation,
} from './hooks/preventWithdrawalEventMutation'

export const WithdrawalEvents: CollectionConfig = {
  slug: 'withdrawal_events',
  access: {
    create: withdrawalEventCreateAccess,
    delete: withdrawalEventDeleteAccess,
    read: withdrawalEventReadAccess,
    update: withdrawalEventUpdateAccess,
  },
  admin: {
    defaultColumns: ['id', 'withdrawal', 'fromStatus', 'toStatus', 'actor', 'actorRole', 'timestamp'],
    group: 'Finance',
    useAsTitle: 'id',
    description: 'Nhật ký kiểm toán sự kiện rút tiền (Append-Only Audit Trail - PLAN.md §11.1)',
  },
  hooks: {
    beforeChange: [preventWithdrawalEventMutation],
    beforeDelete: [preventWithdrawalEventDeletion],
  },
  fields: [
    {
      name: 'withdrawal',
      type: 'relationship',
      relationTo: 'withdrawals',
      required: true,
      index: true,
      label: 'Yêu cầu rút tiền liên kết',
      admin: {
        readOnly: true,
        position: 'sidebar',
      },
    },
    {
      name: 'fromStatus',
      type: 'text',
      required: false,
      label: 'Trạng thái trước',
      admin: {
        readOnly: true,
      },
    },
    {
      name: 'toStatus',
      type: 'text',
      required: true,
      label: 'Trạng thái sau',
      admin: {
        readOnly: true,
      },
    },
    {
      name: 'actor',
      type: 'relationship',
      relationTo: 'users',
      required: false,
      index: true,
      label: 'Người thực hiện thao tác',
      admin: {
        readOnly: true,
        position: 'sidebar',
      },
    },
    {
      name: 'actorRole',
      type: 'text',
      required: false,
      label: 'Vai trò người thực hiện (admin / financeAdmin / seller / system)',
      admin: {
        readOnly: true,
        position: 'sidebar',
      },
    },
    {
      name: 'reason',
      type: 'text',
      required: false,
      label: 'Lý do / Diễn giải',
      admin: {
        readOnly: true,
      },
    },
    {
      name: 'notes',
      type: 'textarea',
      required: false,
      label: 'Ghi chú bổ sung',
      admin: {
        readOnly: true,
      },
    },
    {
      name: 'timestamp',
      type: 'date',
      required: true,
      defaultValue: () => new Date().toISOString(),
      index: true,
      label: 'Thời điểm ghi nhận sự kiện',
      admin: {
        readOnly: true,
        position: 'sidebar',
      },
    },
    {
      name: 'metadata',
      type: 'json',
      required: false,
      label: 'Dữ liệu kỹ thuật đi kèm',
      admin: {
        readOnly: true,
      },
    },
  ],
}
```

---

### 4.8 PostgreSQL Migration Batch 7 Specification

For `web/src/migrations/20260915_100000_phase6_seller_revenue.ts`:

```sql
-- 1. ENUM types
CREATE TYPE "public"."enum_withdrawals_currency" AS ENUM('VND');
CREATE TYPE "public"."enum_withdrawals_status" AS ENUM(
  'REQUESTED',
  'UNDER_REVIEW',
  'APPROVED',
  'PROCESSING',
  'PAID',
  'REJECTED',
  'CANCELLED',
  'FAILED'
);

-- 2. Tables
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

CREATE TABLE "withdrawal_events" (
  "id" serial PRIMARY KEY NOT NULL,
  "withdrawal_id" integer NOT NULL,
  "from_status" varchar,
  "to_status" varchar NOT NULL,
  "actor_id" integer,
  "actor_role" varchar,
  "reason" varchar,
  "notes" varchar,
  "timestamp" timestamp(3) with time zone DEFAULT now() NOT NULL,
  "metadata" jsonb,
  "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
);

-- 3. Payload Locked Documents Relations
ALTER TABLE "payload_locked_documents_rels" ADD COLUMN IF NOT EXISTS "withdrawals_id" integer;
ALTER TABLE "payload_locked_documents_rels" ADD COLUMN IF NOT EXISTS "withdrawal_events_id" integer;

-- 4. Foreign Key Constraints
ALTER TABLE "withdrawals" ADD CONSTRAINT "withdrawals_seller_id_users_id_fk" FOREIGN KEY ("seller_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;
ALTER TABLE "withdrawals" ADD CONSTRAINT "withdrawals_reviewed_by_id_users_id_fk" FOREIGN KEY ("reviewed_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "withdrawal_events" ADD CONSTRAINT "withdrawal_events_withdrawal_id_withdrawals_id_fk" FOREIGN KEY ("withdrawal_id") REFERENCES "public"."withdrawals"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "withdrawal_events" ADD CONSTRAINT "withdrawal_events_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_withdrawals_fk" FOREIGN KEY ("withdrawals_id") REFERENCES "public"."withdrawals"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_withdrawal_events_fk" FOREIGN KEY ("withdrawal_events_id") REFERENCES "public"."withdrawal_events"("id") ON DELETE cascade ON UPDATE no action;

-- 5. Indices & Unique Constraints
CREATE UNIQUE INDEX IF NOT EXISTS "withdrawals_code_idx" ON "withdrawals" ("code");
CREATE INDEX IF NOT EXISTS "withdrawals_seller_idx" ON "withdrawals" ("seller_id");
CREATE INDEX IF NOT EXISTS "withdrawals_status_idx" ON "withdrawals" ("status");
CREATE INDEX IF NOT EXISTS "withdrawals_requested_at_idx" ON "withdrawals" ("requested_at");

CREATE INDEX IF NOT EXISTS "withdrawal_events_withdrawal_idx" ON "withdrawal_events" ("withdrawal_id");
CREATE INDEX IF NOT EXISTS "withdrawal_events_actor_idx" ON "withdrawal_events" ("actor_id");
CREATE INDEX IF NOT EXISTS "withdrawal_events_timestamp_idx" ON "withdrawal_events" ("timestamp");

-- 6. Check Constraints
ALTER TABLE "withdrawals" ADD CONSTRAINT "withdrawals_amount_check" CHECK (amount >= 50000 AND amount <= 50000000);
```

Down migration statements:
```sql
DROP TABLE IF EXISTS "withdrawal_events", "withdrawals" CASCADE;
DROP TYPE IF EXISTS "public"."enum_withdrawals_status";
DROP TYPE IF EXISTS "public"."enum_withdrawals_currency";
ALTER TABLE "payload_locked_documents_rels" DROP COLUMN IF EXISTS "withdrawal_events_id";
ALTER TABLE "payload_locked_documents_rels" DROP COLUMN IF EXISTS "withdrawals_id";
```

---

## 5. Verification Method

### 5.1 Proposed Integration Test: `web/tests/int/withdrawal-schema-invariants.int.spec.ts`

```typescript
import { getPayload, type Payload } from 'payload'
import config from '@/payload.config'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { User } from '@/payload-types'
import {
  withdrawalCreateAccess,
  withdrawalDeleteAccess,
  withdrawalEventCreateAccess,
  withdrawalEventDeleteAccess,
  withdrawalEventReadAccess,
  withdrawalEventUpdateAccess,
  withdrawalReadAccess,
  withdrawalUpdateAccess,
} from '@/access/withdrawalAccess'

describe('Phase 6: Withdrawals & Withdrawal Events Schema & Invariants', () => {
  let payload: Payload
  let adminUser: User
  let financeAdminUser: User
  let sellerUser1: User
  let sellerUser2: User
  let buyerUser: User

  const cleanup = { users: [] as (number | string)[] }

  beforeAll(async () => {
    payload = await getPayload({ config })
    const ts = Date.now()

    adminUser = (await payload.create({
      collection: 'users',
      data: { email: `admin-wth-${ts}@kientaohub.local`, password: 'test-pwd-123', name: 'Admin', roles: ['admin'] },
      overrideAccess: true,
    })) as User
    cleanup.users.push(adminUser.id)

    financeAdminUser = (await payload.create({
      collection: 'users',
      data: { email: `finance-wth-${ts}@kientaohub.local`, password: 'test-pwd-123', name: 'Finance Admin', roles: ['financeAdmin'] },
      overrideAccess: true,
    })) as User
    cleanup.users.push(financeAdminUser.id)

    sellerUser1 = (await payload.create({
      collection: 'users',
      data: { email: `seller1-wth-${ts}@kientaohub.local`, password: 'test-pwd-123', name: 'Seller 1', roles: ['seller'] },
      overrideAccess: true,
    })) as User
    cleanup.users.push(sellerUser1.id)

    sellerUser2 = (await payload.create({
      collection: 'users',
      data: { email: `seller2-wth-${ts}@kientaohub.local`, password: 'test-pwd-123', name: 'Seller 2', roles: ['seller'] },
      overrideAccess: true,
    })) as User
    cleanup.users.push(sellerUser2.id)

    buyerUser = (await payload.create({
      collection: 'users',
      data: { email: `buyer-wth-${ts}@kientaohub.local`, password: 'test-pwd-123', name: 'Buyer', roles: ['buyer'] },
      overrideAccess: true,
    })) as User
    cleanup.users.push(buyerUser.id)
  })

  afterAll(async () => {
    for (const id of cleanup.users) {
      try {
        await payload.delete({ collection: 'users', id, overrideAccess: true })
      } catch (_ignore) {}
    }
  })

  describe('1. Access Control Invariants (canEditMoney & RBAC)', () => {
    it('denies direct creation/modification/deletion via REST for all roles', () => {
      expect(withdrawalCreateAccess({ req: { user: sellerUser1 } } as any)).toBe(false)
      expect(withdrawalCreateAccess({ req: { user: adminUser } } as any)).toBe(false)
      expect(withdrawalUpdateAccess({ req: { user: sellerUser1 } } as any)).toBe(false)
      expect(withdrawalUpdateAccess({ req: { user: adminUser } } as any)).toBe(false)
      expect(withdrawalDeleteAccess({ req: { user: adminUser } } as any)).toBe(false)

      expect(withdrawalEventCreateAccess({ req: { user: adminUser } } as any)).toBe(false)
      expect(withdrawalEventUpdateAccess({ req: { user: adminUser } } as any)).toBe(false)
      expect(withdrawalEventDeleteAccess({ req: { user: adminUser } } as any)).toBe(false)
    })

    it('verifies withdrawalReadAccess returns true for Admin and FinanceAdmin, scoped query for Seller, false for Buyer/Guest', () => {
      expect(withdrawalReadAccess({ req: { user: null } } as any)).toBe(false)
      expect(withdrawalReadAccess({ req: { user: buyerUser } } as any)).toEqual({ seller: { equals: buyerUser.id } })
      expect(withdrawalReadAccess({ req: { user: adminUser } } as any)).toBe(true)
      expect(withdrawalReadAccess({ req: { user: financeAdminUser } } as any)).toBe(true)
      expect(withdrawalReadAccess({ req: { user: sellerUser1 } } as any)).toEqual({ seller: { equals: sellerUser1.id } })
    })

    it('verifies withdrawalEventReadAccess returns true for Admin and FinanceAdmin, joined query for Seller', () => {
      expect(withdrawalEventReadAccess({ req: { user: null } } as any)).toBe(false)
      expect(withdrawalEventReadAccess({ req: { user: adminUser } } as any)).toBe(true)
      expect(withdrawalEventReadAccess({ req: { user: financeAdminUser } } as any)).toBe(true)
      expect(withdrawalEventReadAccess({ req: { user: sellerUser1 } } as any)).toEqual({ 'withdrawal.seller': { equals: sellerUser1.id } })
    })
  })

  describe('2. Withdrawal Code Generation & Validation', () => {
    it('automatically generates code matching WTH-YYYYMMDD-XXXXX when created', async () => {
      const wth = await payload.create({
        collection: 'withdrawals' as any,
        data: {
          seller: sellerUser1.id,
          amount: 200000,
          currency: 'VND',
          status: 'REQUESTED',
          bankInfo: {
            bankName: 'Vietcombank',
            accountNumber: '0123456789',
            accountHolderName: 'nguyen van a',
          },
        },
        overrideAccess: true,
      })

      expect((wth as any).code).toMatch(/^WTH-\d{8}-[A-F0-9]{5,6}$/)
      expect((wth as any).bankInfo.accountHolderName).toBe('NGUYEN VAN A')
      expect((wth as any).bankInfo.accountNumber).toBe('0123456789')
      expect((wth as any).status).toBe('REQUESTED')
    })

    it('rejects withdrawal amount below 50,000 VND or above 50,000,000 VND', async () => {
      await expect(
        payload.create({
          collection: 'withdrawals' as any,
          data: {
            seller: sellerUser1.id,
            amount: 40000,
            currency: 'VND',
            status: 'REQUESTED',
            bankInfo: { bankName: 'MBBank', accountNumber: '123456', accountHolderName: 'TRAN B' },
          },
          overrideAccess: true,
        })
      ).rejects.toThrow()

      await expect(
        payload.create({
          collection: 'withdrawals' as any,
          data: {
            seller: sellerUser1.id,
            amount: 60000000,
            currency: 'VND',
            status: 'REQUESTED',
            bankInfo: { bankName: 'MBBank', accountNumber: '123456', accountHolderName: 'TRAN B' },
          },
          overrideAccess: true,
        })
      ).rejects.toThrow()
    })
  })

  describe('3. Immutability & State Transitions', () => {
    it('rejects updating withdrawal_events (append-only ledger)', async () => {
      const wth = await payload.create({
        collection: 'withdrawals' as any,
        data: {
          seller: sellerUser1.id,
          amount: 500000,
          currency: 'VND',
          status: 'REQUESTED',
          bankInfo: { bankName: 'Techcombank', accountNumber: '987654321', accountHolderName: 'LE C' },
        },
        overrideAccess: true,
      })

      const event = await payload.create({
        collection: 'withdrawal_events' as any,
        data: {
          withdrawal: (wth as any).id,
          fromStatus: null,
          toStatus: 'REQUESTED',
          actor: sellerUser1.id,
          actorRole: 'seller',
          reason: 'Seller requested withdrawal',
        },
        overrideAccess: true,
      })

      await expect(
        payload.update({
          collection: 'withdrawal_events' as any,
          id: (event as any).id,
          data: { reason: 'Tampered reason' },
          overrideAccess: true,
        })
      ).rejects.toThrow(/immutable/)
    })
  })
})
```

### 5.2 Commands to Run for Verification
```bash
# 1. Type generation after registering collections
pnpm --prefix web generate:types

# 2. Migration execution
pnpm --prefix web payload migrate

# 3. Integration test execution
pnpm --prefix web test:int

# 4. Lint and Build validation
pnpm --prefix web lint
pnpm --prefix web build
```

---
*End of Handoff Report.*
