# Decisions

Decision records preserve lasting product, architecture, data ownership,
security, compatibility, and validation choices that future work must inherit.

Use `docs/templates/decision.md`. Task-local implementation choices remain in
the active execution plan and do not require a separate decision.

An installed consumer begins with no fabricated decisions. Add local decision
documents here as real choices are accepted, then index them in this file.

## Decisions

| Record | Status | Constraint future work inherits |
|---|---|---|
| [0001 Run a locally patched daptin image](0001-run-locally-patched-daptin-image.md) | Accepted | Go changes require `daptin/build-local-image.sh`; upstream upgrades must rebase the local commit stack (`git log --oneline origin/master..HEAD`, 11 commits at Phase 0 close); the compose override sets `pull_policy: missing` |
| [0002 Declare business-table authorization explicitly](0002-business-table-authorization-pattern.md) | Accepted | Every business table declares `AccessGroups` and a non-zero `Permission`; signed-in sharing uses `DefaultGroups` and depends on the join-table cascade patch |
| [0003 Treat the database as a config merge target](0003-database-config-merge-rebuild.md) | Accepted | Intended config lives in `schema/` at the repository root; drifted persisted config is fixed by rebuilding the database, not by hand-editing `world_schema_json` |
| [0004 Web session and API access](0004-web-session-and-api-access.md) | Accepted | `web/` is Vue + Vite + TypeScript with Ark UI Vue; it reaches the backend through the dev proxy; the JWT lives in `localStorage` and must be replaced before any non-local deployment |
| [0005 KienTaoHub builds on daptin](0005-kientaohub-builds-on-daptin.md) | Accepted | daptin stays the backend and API of record; a Next.js storefront owns the SEO surface; `web/` is the operator and admin console; money-moving tables declare no Create/Update/Delete and are mutated only through custom actions |
| [0006 Money-path write layer](0006-kientaohub-money-write-layer.md) | Accepted | Exactly one financial write path (the `$wallet` action performer); direct writes to `wallets`/`wallet_ledger` are denied for every principal including administrators; the ledger is append-only at the database level; every new money table adds a schema entry, a `FinancialWriteDeniedTables` entry, and a trigger entry in one commit. CONFIRMED 2026-09-14 by decision 0007 (not re-opened); the BR-02 unique index on `payment_transactions (provider, provider_transaction_id)` landed with `schema/schema_payment.yaml` |
| [0007 P0 scope lock](0007-kientaohub-phase-0-scope-lock.md) | Accepted | P0 launch scope = `PLAN.md` §26 adjudicated (Email/Logs/Backup out of launch-blocking scope; SEO relocated to the storefront track; wireframe/design system are owner artifacts); ERD of record = the 0007 entity list |
| [0008 Payment provider: SePay](0008-kientaohub-payment-provider.md) | Accepted | P0 wallet top-up rail is SePay (paper selection; no Phase 0 integration); Phase 1 builds the adapter interface so VNPay/MoMo can be added |
| [0009 Financial state machine](0009-kientaohub-financial-state-machine.md) | Accepted | `payment_intents` carries the exact §11.2 seven-state enum; seven-row transition table (T1–T7); wallets carry no state machine; orders/withdrawals are separate machines |
| [0010 Secure-download path](0010-kientaohub-secure-download-path.md) | Accepted | Phase 1 `$download` entitlement-gated proxy action with short-TTL one-time token; `PresignGetObject` pre-approved as the 15th patch when public deployment/CDN arrives |
| [0011 Search engine](0011-kientaohub-search-engine.md) | Accepted | P0 search = daptin JSON:API filtering (diacritics/typo gap accepted); Meilisearch selected for P1 |
