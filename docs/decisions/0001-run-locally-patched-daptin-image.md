# 0001 Run a Locally Patched daptin Image

Date: 2026-09-14

## Status

Accepted

## Context

The upstream `daptin/daptin:latest` image (v0.13.9, revision `8e2f6a9`) logs
errors and exposes behavior that blocks normal use of the backend:

1. Two `llm_batch` → `llm_file` relations in
   `server/resource/columns.go` shared the same `SubjectName`, so api2go
   registered `/api/llm_file/:id/relationships/llm_batch_id` twice and logged
   `handlers are already registered for path ...` on every boot.
2. `server/resource/dbfunctions_create.go` created foreign keys without
   `ON DELETE CASCADE`. Deleting any row that had a row-group relation (created
   through `DefaultGroups`) failed with
   `violates foreign key constraint ... on table "<table>_<table>_id_has_usergroup_usergroup_id"`.
3. Entities that do not exist returned HTTP 500 (`[897] no such entity`) instead
   of 404, because api2go only derives the status from `api2go.HTTPError`.
4. On an empty database, boot logged transient errors for the missing `world`
   table and for absent JWT config values that the code immediately defaults.
5. Three cache writers used `olric` `NX` (write only when the key is absent) and
   reported the `ErrKeyFound` outcome of a concurrent duplicate write as an
   error, producing `[2099] Failed to set object permission id in olric cache`,
   `[334] Failed to set token in olric cache`, and `[234] failed to store config
   value in cache`. `server/llm/ports.go` and `server/middleware_ratelimit.go`
   already ignored that sentinel, so the handling was inconsistent rather than
   intentional.

The published image also embeds dashboard assets through `rice.FindBox`, so a
plain `go build` of the same source serves an empty dashboard.

## Decision

Maintain a local source clone at `daptin/` (upstream `8e2f6a9`) carrying seven
local commits (`1cb9e326…0ae6d95b`, eight with the money-path change), and run
a locally built image `daptin-local:v0.13.9-patched` from
`daptin/docker-compose.override.yml`, produced by `daptin/build-local-image.sh`.

The script reproduces the upstream release pipeline: dashboard assets from
`artpar/dashboard3`, `rice embed-go`, `go build` with git metadata `-ldflags`,
then `docker build --build-arg TARGETARCH=amd64`.

## Alternatives Considered

1. **Run the upstream image unchanged** and accept the boot errors, the broken
   delete for row-shared tables, and 500s for missing entities.
2. **Patch only the database** (adjust FK constraints and config rows) and keep
   the upstream image. This fixes the delete path for existing tables but leaves
   the duplicate route registration, the 500 responses, and the boot noise in
   place, and it cannot fix relations that are re-registered from code at boot.
3. **Patch and run the binary directly** without an image, losing compose
   orchestration, healthchecks, and the upstream image's runtime user and
   directory layout.

## Consequences

Positive:

- Boot log on both an empty and a populated database is free of `ERRO`/`WARN`.
- Deleting business rows that carry group relations works.
- Unknown entity ids return 404.
- The dashboard is served, and the startup banner reports commit, branch, state,
  build date, and version.

Tradeoffs:

- `daptin/` diverges from upstream; upgrades need the seven local commits rebased
  (eight with the money-path change).
- The image must be rebuilt locally after any Go change
  (`daptin/build-local-image.sh`), and `pull_policy: missing` is required
  because the tag does not exist in a registry.
- Dashboard assets are fetched from a third-party release
  (`artpar/dashboard3`) rather than published by daptin itself.

## Follow-Up

- Offer the seven local commits upstream (eight with the money-path change); drop them locally if accepted.
- Re-check each patch on the next upstream release before upgrading.
- Consider pinning the dashboard asset release instead of `latest`.
- The three cache patches (`[2099]`, `[334]`, `[234]`) are safety corrections
  whose trigger could not be reproduced deterministically; if a cache error line
  reappears, treat this patch set as unproven and investigate the trigger first.
