# 0008 Role Model From PLAN.md §5 And §22

Date: 2026-09-15

## Status

Accepted

## Context

`PLAN.md` §5 defines five actors — Buyer, Seller, Moderator, Finance Admin,
Super Admin — and §22 gives the authorization matrix over them. `PLAN.md` §22
also states that a moderator may not adjust a balance or approve a withdrawal,
and decision 0002 requires that no principal, including an administrator, may
write a money document directly.

Observed before this decision: the Payload template shipped two roles, `admin`
and `customer`, with `customer` as the default for new accounts, and the §22
rows were not expressed anywhere except the template's `isAdmin` checks. No
product, page, or user document enforced a seller or moderator boundary.

Observed while implementing: the role values live in a PostgreSQL enum,
`enum_users_roles`. With the Postgres adapter set to `push: false`
(decision 0001 amendment), changing a select option does not change the
database, so a migration is required even for a value-list change.

## Decision

Role values, matching §5:

| Role value | `PLAN.md` actor |
|---|---|
| `admin` | Super Admin (§5.6) |
| `buyer` | Buyer (§5.2) |
| `seller` | Seller (§5.3) |
| `moderator` | Moderator (§5.4) |
| `financeAdmin` | Finance Admin (§5.5) |

- `buyer` replaces the template's `customer`. The template's retired value is no
  longer offered and cannot be written. The ecommerce plugin's
  `customerOnlyFieldAccess` configuration key is its own name for the buyer
  concept and is fed by `buyerOnlyFieldAccess`.
- The default role for a new account is `buyer`; the first user is still
  promoted to `admin`.
- Access helpers in `web/src/access/` express §22 rows directly:
  `adminOrSeller` for product creation, `adminOrModerator` for product
  moderation, and `isBuyer`, `isSeller`, `isModerator`, `isFinanceAdmin` for the
  slices that add purchase, seller, moderation, and finance entities.
- Money documents are never directly writable. `canEditMoney` denies create,
  update, and delete for every principal, per decision 0002; an administrator
  adjusts a balance through the dedicated adjustment form in §12.2.
- The `customer` relationship used by the cart, order, and address collections
  is a field name, not a role, and is unchanged.
- The enum is widened by `web/src/migrations/20260915_023701_user_roles_from_plan_5.ts`.

## Alternatives Considered

1. **Keep `customer` and add `buyer`** — rejected: two names for one concept,
   and §22 would have to name either.
2. **Rename `admin` to `superAdmin`** — rejected: the template's first-user hook,
   the admin-panel gate, and every existing `checkRole(['admin'])` call would
   change for a naming preference; `admin` already means Super Admin in §5.6.
3. **Change the option list without a migration** — not possible: the value set
   is a PostgreSQL enum and development no longer pushes schema.
4. **Enforce §22 in hooks instead of access control** — rejected: access control
   is Payload's native authorization owner and runs before hooks.

## Consequences

Positive:

- The §22 rows that have entities today are enforced and covered by
  `tests/int/rbac.int.spec.ts`, which exercises anonymous, buyer, seller,
  moderator, finance admin, and admin through the local API with
  `overrideAccess: false`.
- Role naming matches the product specification, so later slices name roles the
  same way `PLAN.md` does.

Tradeoffs:

- A seller can create a product but not edit it: products carry no seller
  ownership field yet, so seller self-edit (§5.3, FR-29) waits for the Phase 3
  seller entity. Product update is moderated collection-wide instead.
- `moderator` is expressed as collection-level update access, not yet as the
  FR-28 moderation state machine.
- Changing a role value later is a database migration, not a code edit.

## Follow-Up

- Phase 3: seller profiles and product ownership, so §22's seller self-edit and
  FR-29's state restrictions can be expressed per document.
- Phase 3: the FR-28 moderation state machine, which turns moderation into
  transitions rather than plain update access.
- Phases 4 to 6: money collections use `canEditMoney` for create, update, and
  delete, with read access split by §22 (own ledger for buyer and seller, all
  for finance admin and admin).
- §22 rows for purchase, download, ledger view, and withdrawal approval are
  implemented by the slices that create those entities; the matrix test must be
  extended when each lands.
