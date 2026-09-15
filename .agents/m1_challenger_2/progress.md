# Progress — m1_challenger_2

- [x] Initialized DISPATCH.md and BRIEFING.md
- [x] Read ORIGINAL_REQUEST.md, PROJECT.md, and m1_worker_1/handoff.md
- [x] Inspected implementation of collections and access control logic in `web/src/access/` and `web/src/collections/`
- [x] Wrote and executed adversarial empirical test harness `web/tests/int/m1-access-control.int.spec.ts` (59 tests)
- [x] Test 1: Direct REST mutation requests rejected by access controls (`() => false`)
  - `POST /api/orders`, `POST /api/order_items`, `POST /api/entitlements`, `POST /api/download_events` return HTTP 403 Forbidden
  - Direct local API create/update/delete rejected for all principals
  - Entitlement update allowed only for admin (rejected for buyer, financeAdmin, guest)
- [x] Test 2: Read access controls for Orders
  - Authenticated buyers strictly isolated to own orders (where buyer == user.id)
  - Admins and financeAdmins see all orders across all buyers
  - Unauthenticated guests rejected with Forbidden
  - OrderItems read access: buyers see order items for their orders, sellers see items for their products, admins/financeAdmins see all
- [x] Test 3: Read access controls for Entitlements
  - Users can strictly view only their own ACTIVE entitlements (revoked and expired are filtered out)
  - Foreign entitlements inaccessible via find or findByID
  - Admins and financeAdmins view all entitlements regardless of status or owner
  - Unauthenticated guests rejected with Forbidden
- [x] Test 4: Read access controls for DownloadEvents
  - Strictly restricted to admin and financeAdmin
  - Buyers, sellers, moderators, and unauthenticated guests denied (throws Forbidden)
- [x] Test 5: Adversarial attack scenarios & oracles
  - Where clause injection attempts (`where: { buyer: buyer2 }`) fail to leak foreign data
  - Adversarial OR query injection (`or: [{ status: 'revoked' }, { id: not_equals: 0 }]`) fails to leak revoked entitlements
  - Seller cannot read orders for products they sell if they are not the buyer
  - Multi-role non-admin principals cannot escalate to update entitlements
- [x] Ran all 18 integration test suites (301 tests passed, 0 failed)
- [x] Lint check passed (0 errors)
- [x] Wrote handoff.md with APPROVE verdict
- [ ] Send message to parent

Last visited: 2026-09-15T07:38:00Z
