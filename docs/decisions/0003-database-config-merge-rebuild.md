# 0003 Treat the Database as a Config Merge Target, Rebuild Over Migrate

Date: 2026-09-14

## Status

Accepted

## Context

Daptin loads table and relation configuration from two places at startup and
merges them (`daptin/server/server.go`, `GetTablesFromWorld` + `MergeTables`):

1. the schema files supplied through `DAPTIN_SCHEMA_FOLDER` plus the built-in
   `StandardTables` / `StandardRelations` from code, and
2. the copy persisted in the database in `world.world_schema_json`.

The merge is additive and de-duplicates only by full shape. After the relation
names in code changed (patch 1 of `0001-run-locally-patched-daptin-image.md`),
the database still held rows describing the old relation names, so the merged
configuration contained both old and new relations. The result was a second
round of duplicate-route errors, and the row for `llm_batch` grew from 5 to 7
relations.

`DAPTIN_SKIP_CONFIG_FROM_DATABASE=true` exists but was not exercised; it would
also disable configuration that only lives in the database.

## Decision

Treat the database as a **merge target**, not as the source of truth:

- Configuration changes belong in `schema/schema_*.yaml` of this repository
  (mounted into `daptin/` by `daptin/docker-compose.override.yml`) or in code, then
  a hard restart applies them.
- When persisted configuration has drifted from the intended configuration, the
  database is **rebuilt** (`docker compose down`,
  `docker volume rm daptin_postgres-data daptin_daptin-data`,
  `docker compose up -d --wait`) instead of being hand-edited.
- Direct `SQL` edits to `world.world_schema_json` are a one-off recovery tool
  only, with a backup of the affected rows taken first.

Recreating an account after a rebuild is part of the reset procedure in
`docs/RUNBOOK.md`.

## Alternatives Considered

1. **Hand-edit the drifted rows in place.** This was done once (removing the four
   stale relation entries) and worked, but it does not scale: the same drift
   returns for every table whose code-side shape changes, and each edit risks
   corrupting a JSON blob the server rewrites at boot.
2. **Set `DAPTIN_SKIP_CONFIG_FROM_DATABASE=true`.** Rejected as the standing
   policy because the flag's effect on runtime-created tables and permissions
   was not verified; it would make the database-only configuration invisible.
3. **Keep the pre-rebuild database and migrate it.** Rejected: at that point the
   database held no data worth preserving (a single administrator account and an
   empty demonstration table), so a clean rebuild was cheaper and left no
   residual state.

## Consequences

Positive:

- `llm_batch` again has exactly 5 relations, with no stale entries.
- A clean database reproduces the intended configuration from source alone.
- The reset procedure is deterministic and verified end to end (empty-database
  boot log has no `ERRO`/`WARN`).

Tradeoffs:

- A rebuild destroys every account, record, and blob; it is destructive and must
  be a deliberate action.
- Configuration that exists only in the database (created through the
  dashboard/API) would be lost by a rebuild, so such changes must be written
  back into schema files to survive.
- The database copy can still drift between rebuilds; nothing currently detects
  that drift.

## Follow-Up

- Capture intended configuration in `schema/` whenever it is changed
  through the UI or API.
- Reconsider `DAPTIN_SKIP_CONFIG_FROM_DATABASE` only after testing its effect on
  runtime-created tables and permission rows.
- If this instance ever holds real data, replace the rebuild rule with an
  export/compare procedure.
