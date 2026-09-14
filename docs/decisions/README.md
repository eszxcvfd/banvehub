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
| [0001 Run a locally patched daptin image](0001-run-locally-patched-daptin-image.md) | Accepted | Go changes require `daptin/build-local-image.sh`; upstream upgrades must rebase thirteen patches; the compose override sets `pull_policy: missing` |
| [0002 Declare business-table authorization explicitly](0002-business-table-authorization-pattern.md) | Accepted | Every business table declares `AccessGroups` and a non-zero `Permission`; signed-in sharing uses `DefaultGroups` and depends on the join-table cascade patch |
| [0003 Treat the database as a config merge target](0003-database-config-merge-rebuild.md) | Accepted | Intended config lives in `schema/` at the repository root; drifted persisted config is fixed by rebuilding the database, not by hand-editing `world_schema_json` |
| [0004 Web session and API access](0004-web-session-and-api-access.md) | Accepted | `web/` is Vue + Vite + TypeScript with Ark UI Vue; it reaches the backend through the dev proxy; the JWT lives in `localStorage` and must be replaced before any non-local deployment |
| [0005 KienTaoHub builds on daptin](0005-kientaohub-builds-on-daptin.md) | Accepted | daptin stays the backend and API of record; a Next.js storefront owns the SEO surface; `web/` is the operator and admin console; money-moving tables declare no Create/Update/Delete and are mutated only through custom actions |
