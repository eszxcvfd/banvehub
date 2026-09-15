# BRIEFING — 2026-09-15T07:17:00Z

## Mission
Investigate and design the exact implementation for Payload collections `Entitlements` and `DownloadEvents`, including access control and registration in `payload.config.ts`.

## 🔒 My Identity
- Archetype: explorer
- Roles: investigation, synthesis
- Working directory: /home/trung/Documents/2026/project/test-v6/.agents/m1_explorer_2
- Original parent: 902fae86-8610-4959-9027-f4a48d29b1e8
- Milestone: Milestone 1: Entitlements & DownloadEvents Schema

## 🔒 Key Constraints
- Read-only investigation — do NOT implement directly in source code
- Produce structured analysis and detailed design in handoff.md
- Verify all codebase conventions, types, and existing patterns

## Current Parent
- Conversation ID: 902fae86-8610-4959-9027-f4a48d29b1e8
- Updated: not yet

## Investigation State
- **Explored paths**:
  - `.agents/ORIGINAL_REQUEST.md`
  - `PLAN.md` (FR-16, FR-17, FR-18, §22)
  - `docs/decisions/0006-secure-download-path.md`, `0008-role-model.md`
  - `web/src/collections/` (`WalletLedger.ts`, `ProductFiles/index.ts`, `PaymentWebhookEvents.ts`, `Products/index.ts`, `Users/index.ts`, etc.)
  - `web/src/access/` (`canEditMoney.ts`, `financialAccess.ts`, `isAdmin.ts`, `utilities.ts`, `adminOrSelf.ts`, etc.)
  - `web/src/migrations/20260915_064708_phase4_payment_wallet.ts`
  - `web/tests/int/wallet-ledger-invariants.int.spec.ts`, `product-files-security.int.spec.ts`
  - `.agents/m1_explorer_1/`, `.agents/m1_explorer_3/` dispatches and progress
- **Key findings**:
  - Slugs: `entitlements` and `download_events`.
  - Entitlements field mappings: `user`, `product`, `order`, `orderItem`, `status`, `grantedAt`, `downloadCount`, `maxDownloads`, `expiresAt`, `revokedAt`, `reason`.
  - Entitlements access control: user can read own active entitlements (`{ and: [{ user: { equals: user.id } }, { status: { equals: 'active' } }] }`), admin/financeAdmin can read all; create/delete denied via REST (`() => false`); update only by admin (revocation).
  - Anti-duplicate invariant: hook + PostgreSQL partial unique index `("user_id", "product_id") WHERE ("status" = 'active')`.
  - DownloadEvents field mappings: `user`, `product`, `entitlement`, `ipAddress`, `userAgent`, `downloadedAt`, `status` ('SUCCESS' | 'DENIED' | 'EXPIRED' | 'FAILED'), `downloadTokenHash`, `errorReason`.
  - DownloadEvents access control: append-only server log, read-only for admin/financeAdmin, direct create/update/delete denied via REST (`() => false`).
  - Payload config registration: import and add to `collections` array in `web/src/payload.config.ts`.
- **Unexplored areas**: None for Milestone 1 schema scope. Ready for compilation.

## Key Decisions Made
- Slugs aligned to snake_case table names (`entitlements`, `download_events`).
- Access rules strictly enforce REST denial for direct collection API writes, requiring server operations to use `overrideAccess: true`.
- Hook level check implemented for defense-in-depth on duplicate active entitlements alongside DB partial index.

## Artifact Index
- /home/trung/Documents/2026/project/test-v6/.agents/m1_explorer_2/DISPATCH.md — Incoming dispatches
- /home/trung/Documents/2026/project/test-v6/.agents/m1_explorer_2/BRIEFING.md — Situational awareness
- /home/trung/Documents/2026/project/test-v6/.agents/m1_explorer_2/progress.md — Liveness heartbeat
- /home/trung/Documents/2026/project/test-v6/.agents/m1_explorer_2/handoff.md — Final design handoff
