# BRIEFING — 2026-09-15T10:54:15Z

## Mission
Explore requirements and exact implementation design for Phase 6 (Seller Revenue) Milestone 1: Focus Area 2: `withdrawals` & `withdrawal_events` Collections in Payload CMS, including field definitions, indices, hooks, access controls, and DB schema.

## 🔒 My Identity
- Archetype: explorer
- Roles: investigation, synthesis
- Working directory: /home/trung/Documents/2026/project/test-v6/.agents/m1_explorer_2
- Original parent: 902fae86-8610-4959-9027-f4a48d29b1e8
- Milestone: Milestone 1: Entitlements & DownloadEvents Schema
- Phase 6 Milestone: Milestone 1 - Focus Area 2: withdrawals & withdrawal_events Collections
- Current Parent conversation ID: 97815561-5c1e-4548-8e83-6acb89c4e2aa

## 🔒 Key Constraints
- Read-only investigation — do NOT implement directly in source code
- Produce structured analysis and detailed design in handoff.md
- Verify all codebase conventions, types, and existing patterns
- Focus Area 2: withdrawals & withdrawal_events collections
- Strict access control: canEditMoney (deny direct create/update/delete via REST), read access for seller owner, financeAdmin, admin
- Immutable / append-only audit trail for withdrawal_events
- Vietnamese Dong (VND) currency constraints: amount min 50,000, max 50,000,000

## Current Parent
- Conversation ID: 97815561-5c1e-4548-8e83-6acb89c4e2aa
- Updated: 2026-09-15T10:54:15Z

## Investigation State
- **Explored paths**:
  - `.agents/ORIGINAL_REQUEST.md` (Phase 6 R2, R4, lines 73-150)
  - `PLAN.md` (FR-32, FLOW-U13, §11.1, §18, §22)
  - `docs/decisions/` (0002-money-write-layer.md, 0005-financial-state-machine.md, 0008-role-model.md)
  - `web/src/collections/` (`WalletLedger.ts`, `Wallets.ts`, `Orders/index.ts`, `OrderItems/index.ts`, `SellerProfiles.ts`, `DownloadEvents/index.ts`, `Entitlements/index.ts`)
  - `web/src/access/` (`canEditMoney.ts`, `financialAccess.ts`, `orderAccess.ts`, `entitlementAccess.ts`, `downloadEventAccess.ts`, `utilities.ts`)
  - `web/src/migrations/` (Batch 1-6 migrations, especially `20260915_062953` and `20260915_071500`)
  - `web/tests/int/` (`wallet-ledger-invariants.int.spec.ts`, `m1-access-control.int.spec.ts`)
  - Peer agent scopes (`.agents/m1_explorer_1/DISPATCH.md`, `.agents/m1_explorer_3/DISPATCH.md`)
- **Key findings**:
  - `withdrawals` collection:
    - slug: `withdrawals`, group: `'Finance'`, useAsTitle: `'code'`.
    - Fields: `code` (text, unique, indexed, generated as `WTH-YYYYMMDD-XXXXX`), `seller` (rel: users, indexed), `amount` (number VND, min 50000, max 50000000, step 1), `currency` (select 'VND', default 'VND'), `status` (select: REQUESTED, UNDER_REVIEW, APPROVED, PROCESSING, PAID, REJECTED, CANCELLED, FAILED), `bankInfo` (group: bankName, accountNumber, accountHolderName), `requestedAt` (date, default now), `reviewedAt` (date), `reviewedBy` (rel: users), `paidAt` (date), `rejectionReason` (text), `failureReason` (text), `notes` (textarea), `events` (join: withdrawal_events on withdrawal).
    - Access control: `create`, `update`, `delete` denied via `canEditMoney`. Read access: `admin` and `financeAdmin` get full access; `seller` gets `{ seller: { equals: user.id } }`; buyers and guests denied.
    - Hooks: `generateWithdrawalCode` on `beforeValidate`; `validateWithdrawalInvariants` preventing update of `amount`, `seller`, `currency`, `code` and checking state machine transitions.
  - `withdrawal_events` collection:
    - slug: `withdrawal_events`, group: `'Finance'`, useAsTitle: `'id'`.
    - Fields: `withdrawal` (rel: withdrawals, indexed), `fromStatus` (text), `toStatus` (text), `actor` (rel: users), `actorRole` (text), `reason` (text), `notes` (textarea), `timestamp` (date, default now), `metadata` (json).
    - Access control: `create`, `update`, `delete` denied via `canEditMoney`. Read access: `admin` and `financeAdmin` get full access; `seller` gets `{ 'withdrawal.seller': { equals: user.id } }`.
    - Hooks: `preventWithdrawalEventMutation` throwing error on `update` and `preventWithdrawalEventDeletion` throwing error on `delete` (append-only ledger).
  - PostgreSQL Batch 7 migration specifications and integration test suite designed.
- **Unexplored areas**: None for Focus Area 2. Fully investigated and documented.

## Key Decisions Made
- Slugs aligned to snake_case (`withdrawals`, `withdrawal_events`).
- Access rules strictly enforce REST mutation denial via `canEditMoney` for both collections.
- Defense-in-depth: hook-level immutability enforcement on `withdrawal_events` preventing any update or deletion.
- Code generation follows established pattern `WTH-${dateStr}-${randomSuffix}`.
- Payload 3.x `join` relationship used on `withdrawals` to surface audit events.

## Artifact Index
- /home/trung/Documents/2026/project/test-v6/.agents/m1_explorer_2/DISPATCH.md — Incoming dispatches
- /home/trung/Documents/2026/project/test-v6/.agents/m1_explorer_2/BRIEFING.md — Situational awareness
- /home/trung/Documents/2026/project/test-v6/.agents/m1_explorer_2/progress.md — Liveness heartbeat
- /home/trung/Documents/2026/project/test-v6/.agents/m1_explorer_2/handoff.md — Final design handoff report
