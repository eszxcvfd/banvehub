# Milestone 1: Access Control & Security Boundaries Empirical Challenge Report

**Verdict**: **APPROVE**  
**Overall Risk Assessment**: **LOW**  
**Agent**: `m1_challenger_2` (Roles: `critic`, `specialist`)  
**Workspace**: `/home/trung/Documents/2026/project/test-v6`  

---

## 1. Observation

### 1.1 Implementation Code Inspected

1. **Order Access Control (`web/src/access/orderAccess.ts`)**:
   - `orderReadAccess` (lines 10–24):
     ```ts
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
     ```
   - Direct mutation access (lines 30–32):
     ```ts
     export const orderCreateAccess: Access = () => false
     export const orderUpdateAccess: Access = () => false
     export const orderDeleteAccess: Access = () => false
     ```
   - OrderItem read and mutation access (lines 41–68):
     - `orderItemReadAccess`: Returns `true` for `admin` / `financeAdmin`, or `{ or: [{ seller: { equals: user.id } }, { 'order.buyer': { equals: user.id } }] }`. Returns `false` if `!user`.
     - `orderItemCreateAccess`, `orderItemUpdateAccess`, `orderItemDeleteAccess`: All set unconditionally to `() => false`.

2. **Entitlement Access Control (`web/src/access/entitlementAccess.ts`)**:
   - `entitlementReadAccess` (lines 10–33):
     ```ts
     export const entitlementReadAccess: Access = ({ req: { user } }) => {
       if (!user) return false
       if (checkRole(['admin', 'financeAdmin'], user)) {
         return true
       }
       const query: Where = {
         and: [
           { user: { equals: user.id } },
           { status: { equals: 'active' } },
         ],
       }
       return query
     }
     ```
   - `entitlementUpdateAccess` (lines 40–43):
     ```ts
     export const entitlementUpdateAccess: Access = ({ req: { user } }) => {
       if (!user) return false
       return checkRole(['admin'], user)
     }
     ```
   - `entitlementNoDirectWrite` (line 51): Unconditionally returns `false` (`create` and `delete`).

3. **DownloadEvent Access Control (`web/src/access/downloadEventAccess.ts`)**:
   - `downloadEventReadAccess` (lines 9–12):
     ```ts
     export const downloadEventReadAccess: Access = ({ req: { user } }) => {
       if (!user) return false
       return checkRole(['admin', 'financeAdmin'], user)
     }
     ```
   - `downloadEventNoDirectWrite` (line 19): Unconditionally returns `false` (`create`, `update`, `delete`).

4. **Collections Access Mapping**:
   - `web/src/collections/Orders/index.ts` (lines 12–17): Maps `create: orderCreateAccess`, `read: orderReadAccess`, `update: orderUpdateAccess`, `delete: orderDeleteAccess`.
   - `web/src/collections/OrderItems/index.ts` (lines 13–18): Maps `create: orderItemCreateAccess`, `read: orderItemReadAccess`, `update: orderItemUpdateAccess`, `delete: orderItemDeleteAccess`.
   - `web/src/collections/Entitlements/index.ts` (lines 11–16): Maps `create: entitlementNoDirectWrite`, `read: entitlementReadAccess`, `update: entitlementUpdateAccess`, `delete: entitlementNoDirectWrite`.
   - `web/src/collections/DownloadEvents/index.ts` (lines 9–14): Maps `create: downloadEventNoDirectWrite`, `read: downloadEventReadAccess`, `update: downloadEventNoDirectWrite`, `delete: downloadEventNoDirectWrite`.

### 1.2 Empirical Test Execution & Results

A dedicated, comprehensive adversarial integration test harness was authored at:  
`web/tests/int/m1-access-control.int.spec.ts` (59 test cases).

The harness directly executes both HTTP REST route handlers (`POST`, `PATCH`, `DELETE` from `@/app/(payload)/api/[...slug]/route`) and Payload Local API operations with `overrideAccess: false` across all role principals (`admin`, `financeAdmin`, `buyer1`, `buyer2`, `seller1`, `seller2`, `moderator`, and unauthenticated `null`).

#### Verification Commands Executed:

1. **Empirical Access Control Suite Run**:
   ```bash
   pnpm --prefix web vitest run tests/int/m1-access-control.int.spec.ts
   ```
   **Verbatim Output**:
   ```text
   ✓ tests/int/m1-access-control.int.spec.ts (59 tests) 1601ms
     ✓ Milestone 1: Access Control & Security Boundaries Empirical Challenge (59)
       ✓ Task 1: Direct Mutation Rejection via Access Controls (() => false) (26)
         ✓ Orders: direct create, update, delete denied for ALL principals (7)
         ✓ OrderItems: direct create, update, delete denied for ALL principals (5)
         ✓ Entitlements: direct create and delete denied for ALL principals (5)
         ✓ DownloadEvents: append-only audit trail denied for ALL direct mutations (3)
         ✓ Direct REST Route Handler (HTTP) Mutation Verification (6)
       ✓ Task 2: Read Access Controls for Orders (10)
         ✓ allows authenticated buyer1 to view only their own orders
         ✓ allows authenticated buyer2 to view only their own order
         ✓ rejects buyer1 trying to findByID an order belonging to buyer2
         ✓ allows admin to see all orders from all buyers
         ✓ allows financeAdmin to see all orders from all buyers
         ✓ denies unauthenticated guests from reading orders (throws Forbidden)
         ✓ OrderItems read access: buyers and sellers access scoping (4)
       ✓ Task 3: Read Access Controls for Entitlements (6)
         ✓ allows buyer1 to see ONLY their own ACTIVE entitlement, filtering out revoked, expired, and foreign entitlements
         ✓ allows buyer2 to see ONLY their own ACTIVE entitlement
         ✓ rejects buyer1 from accessing revoked or expired entitlements via findByID
         ✓ allows admin to see ALL entitlements across all users and statuses
         ✓ allows financeAdmin to see ALL entitlements across all users and statuses
         ✓ denies unauthenticated guests from reading entitlements
       ✓ Adversarial Query Injection & Scope Escape Tests (5)
         ✓ prevents buyer1 from reading buyer2 orders via injected where clause
         ✓ prevents buyer1 from reading revoked entitlements via adversarial OR query injection
         ✓ verifies seller cannot read orders where they are not the buyer, even if they are the seller of items within it
         ✓ prevents users with multiple non-admin roles (buyer + seller + financeAdmin) from updating entitlements
         ✓ prevents large pagination limit or depth from leaking other users data
       ✓ Task 4: Read Access Controls for DownloadEvents (6)
         ✓ strictly allows admin to read all download events
         ✓ strictly allows financeAdmin to read all download events
         ✓ denies buyers from reading download events (even their own events)
         ✓ denies sellers from reading download events (even for their own products)
         ✓ denies moderators from reading download events
         ✓ denies unauthenticated guests from reading download events
       ✓ Task 5: Adversarial Edge Cases & Access Control Function Oracles (6)
         ✓ verifies orderReadAccess returns exact boolean or Where AST
         ✓ verifies orderItemReadAccess returns exact boolean or Where AST
         ✓ verifies entitlementReadAccess returns exact boolean or Where AST
         ✓ verifies entitlementUpdateAccess returns true ONLY for admin
         ✓ verifies downloadEventReadAccess returns true ONLY for admin and financeAdmin
         ✓ verifies unconditional direct write denial functions

    Test Files  1 passed (1)
         Tests  59 passed (59)
      Duration  3.77s
   ```

2. **Full Regression Suite Run (All 18 Suites)**:
   ```bash
   ./node_modules/.bin/vitest run \
     tests/int/api.int.spec.ts \
     tests/int/catalog-m3-storefront.int.spec.ts \
     tests/int/catalog-rbac.int.spec.ts \
     tests/int/challenger-m2.int.spec.ts \
     tests/int/challenger-m3-detail.int.spec.ts \
     tests/int/challenger-m3.int.spec.ts \
     tests/int/challenger-m4-seo.int.spec.ts \
     tests/int/challenger-m4-sitemap.int.spec.ts \
     tests/int/m1-schema-stress.int.spec.ts \
     tests/int/moderation-lifecycle.int.spec.ts \
     tests/int/payment-failure-recovery.int.spec.ts \
     tests/int/payment-webhook-duplicate.int.spec.ts \
     tests/int/product-files-security.int.spec.ts \
     tests/int/rbac.int.spec.ts \
     tests/int/seller-onboarding.int.spec.ts \
     tests/int/seo-sitemap.int.spec.ts \
     tests/int/wallet-ledger-invariants.int.spec.ts \
     tests/int/m1-access-control.int.spec.ts
   ```
   **Verbatim Output**:
   ```text
   Test Files  18 passed (18)
        Tests  301 passed (301)
     Duration  38.45s
   ```

3. **Code Quality & Linter**:
   ```bash
   pnpm --prefix web lint
   ```
   **Verbatim Output**:
   ```text
   ✖ 442 problems (0 errors, 442 warnings)
   Exit code: 0
   ```

---

## 2. Logic Chain

### 2.1 Direct REST Mutation Denial (`() => false`)
- **Premise**: In Payload CMS, endpoints `POST /api/:slug`, `PATCH /api/:slug/:id`, and `DELETE /api/:slug/:id` invoke the collection's configured access functions (`create`, `update`, `delete`). If the access function evaluates to `false`, Payload returns HTTP 403 Forbidden. In local API operations with `overrideAccess: false`, it throws `Forbidden: You are not allowed to perform this action.`.
- **Evidence**:
  - `POST /api/orders`, `POST /api/order_items`, `POST /api/entitlements`, `POST /api/download_events` returned HTTP `403 Forbidden` for all callers.
  - `DELETE /api/orders/:id` and `PATCH /api/order_items/:id` returned HTTP `403 Forbidden`.
  - Local API calls `payload.create()`, `payload.update()`, and `payload.delete()` on `orders`, `order_items`, `entitlements` (create/delete), and `download_events` failed with `Forbidden` exceptions for all roles including `admin`.
  - `entitlementUpdateAccess` correctly allowed `admin` to update administrative fields (`reason`), while rejecting `buyer` and `financeAdmin`.
- **Deduction**: Direct public/REST mutations are completely closed. All transactional writes must be performed programmatically via internal service methods using `overrideAccess: true`.

### 2.2 Read Access Controls for Orders
- **Premise**: Orders represent financial transaction documents. Buyers must only inspect orders where they are the purchasing principal; administrators and finance administrators must inspect all orders for auditing and reconciliations; unauthenticated guests must be strictly denied.
- **Evidence**:
  - When `buyer1` queried `orders`, only orders with `buyer == buyer1.id` were returned. Injected `where: { buyer: buyer2.id }` queries returned 0 results because Payload safely combines the user's where clause with the access control query using logical `AND`.
  - Direct `findByID` calls by `buyer1` on `buyer2`'s orders threw `Forbidden` / `NotFound`.
  - Both `admin` and `financeAdmin` retrieved all orders across all buyers.
  - Unauthenticated guests (`user: null`) attempting `find` or `findByID` were rejected immediately with `Forbidden: You are not allowed to perform this action.`.
  - In `order_items`, buyers saw order items belonging to their orders, sellers saw items for products they authored, and unauthenticated guests were denied.
- **Deduction**: The order read boundary satisfies the Principle of Least Privilege and enforces complete buyer-to-buyer isolation.

### 2.3 Read Access Controls for Entitlements
- **Premise**: An entitlement is an asset ownership grant. Per PLAN.md FR-16 and Decision 0006, buyers must only see their own `active` entitlements. Revoked or expired entitlements must not be queryable by buyers to prevent unauthorized download attempts or UI confusion.
- **Evidence**:
  - `buyer1` had 3 entitlements: 1 active for Product 1, 1 revoked for Product 2, and 1 expired for Product 1.
  - Querying `entitlements` as `buyer1` returned exclusively the 1 active entitlement for Product 1.
  - Revoked and expired entitlements were completely absent from `find` results, and direct `findByID` calls threw `Forbidden`.
  - Foreign active entitlements (e.g. `buyer2`'s active entitlement) were inaccessible to `buyer1`.
  - Adversarial query injection attempting to bypass the active filter via an OR clause (`where: { or: [{ status: 'revoked' }, { id: { not_equals: 0 } }] }`) was safely neutralized by Payload's `AND` composition.
  - `admin` and `financeAdmin` successfully inspected all entitlements across all statuses (`active`, `revoked`, `expired`).
- **Deduction**: The entitlement read access filter (`{ and: [{ user: { equals: user.id } }, { status: { equals: 'active' } }] }`) functions reliably and resists query parameter tampering.

### 2.4 Read Access Controls for DownloadEvents
- **Premise**: `download_events` is an internal security audit ledger storing IP addresses, User-Agents, token hashes, and error reasons. It must be strictly inaccessible to buyers, sellers, and external clients.
- **Evidence**:
  - `downloadEventReadAccess` returned `false` for buyers, sellers, moderators, and unauthenticated callers.
  - Local queries by buyers, sellers, and guests threw `Forbidden: You are not allowed to perform this action.`. Even when a buyer queried for an audit row documenting their own download, access was denied.
  - Sellers could not query download events for their own products.
  - `admin` and `financeAdmin` were the only principals allowed to query and view download audit logs.
- **Deduction**: The download audit trail is strictly confidential and restricted to privileged administrative roles.

---

## 3. Caveats

1. **Downstream API Endpoints (Milestones 2 & 3)**:
   - Route `/api/v1/orders/purchase` (Milestone 2) and routes `/api/v1/downloads/token` / `/api/v1/downloads/[token]` (Milestone 3) are scheduled for downstream implementation. This challenge verified Milestone 1 access controls on collection schemas and REST gateway handlers.
2. **GraphQL Endpoint**:
   - Because Payload binds collection access handlers to both REST and GraphQL execution pipelines identically, GraphQL mutations (`createOrder`, `updateOrderItem`, etc.) inherit the verified `() => false` rejection behavior.

---

## 4. Conclusion

The Milestone 1 access control and security boundaries are **fully validated, robust, and correctly configured**.
- Direct mutations across `orders`, `order_items`, `entitlements`, and `download_events` are completely blocked (`() => false`).
- Order read access strictly isolates buyers to their own orders while granting comprehensive oversight to `admin` and `financeAdmin`.
- Entitlement read access strictly constrains buyers to active entitlements owned by their account, concealing revoked and expired records.
- Download audit events are strictly restricted to `admin` and `financeAdmin`.
- Adversarial attacks (query parameter injection, scope escape, multi-role privilege escalation) were empirically tested and blocked.

The verdict for Milestone 1 Access Control is **APPROVE**.

---

## 5. Verification Method

To independently reproduce and verify this empirical challenge:

1. **Run the Milestone 1 Access Control Test Suite**:
   ```bash
   pnpm --prefix web vitest run tests/int/m1-access-control.int.spec.ts
   ```
   *Expected result*: 59 passing tests, 0 failures.

2. **Run the Full Integration Test Suite**:
   ```bash
   pnpm --prefix web vitest run \
     tests/int/api.int.spec.ts \
     tests/int/catalog-m3-storefront.int.spec.ts \
     tests/int/catalog-rbac.int.spec.ts \
     tests/int/challenger-m2.int.spec.ts \
     tests/int/challenger-m3-detail.int.spec.ts \
     tests/int/challenger-m3.int.spec.ts \
     tests/int/challenger-m4-seo.int.spec.ts \
     tests/int/challenger-m4-sitemap.int.spec.ts \
     tests/int/m1-schema-stress.int.spec.ts \
     tests/int/moderation-lifecycle.int.spec.ts \
     tests/int/payment-failure-recovery.int.spec.ts \
     tests/int/payment-webhook-duplicate.int.spec.ts \
     tests/int/product-files-security.int.spec.ts \
     tests/int/rbac.int.spec.ts \
     tests/int/seller-onboarding.int.spec.ts \
     tests/int/seo-sitemap.int.spec.ts \
     tests/int/wallet-ledger-invariants.int.spec.ts \
     tests/int/m1-access-control.int.spec.ts
   ```
   *Expected result*: 18 test files passed, 301 tests passed, 0 failures.

3. **Verify Lint Compliance**:
   ```bash
   pnpm --prefix web lint
   ```
   *Expected result*: 0 errors.
