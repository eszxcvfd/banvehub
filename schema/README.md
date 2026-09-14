# `schema/` — data model of KienTaoHub

Daptin schema files for the product described in `PLAN.md`: the tables, their
columns, their authorization, and the custom actions that own the writes daptin's
generic JSON:API must not allow. This directory is version-controlled here
deliberately; `daptin/` is git-ignored because it is a separate upstream
repository.

## How it reaches the backend

daptin loads every `schema_*.yaml | schema_*.json | schema_*.toml` file in
`DAPTIN_SCHEMA_FOLDER`. The local compose override does the wiring:

```yaml
# daptin/docker-compose.override.yml
services:
  daptin:
    environment:
      DAPTIN_SCHEMA_FOLDER: /var/lib/daptin/schema
    volumes:
      - ../schema:/var/lib/daptin/schema:ro
```

That file lives inside the ignored `daptin/` tree, so keep the snippet above in
sync when recreating a checkout.

Apply a change:

```sh
cd daptin
docker compose restart daptin     # schema content changed
docker compose up -d              # the mount itself changed (restart reuses the old container)
```

A mount change applied with `restart` fails silently: the log then reads
`Found files to load: []`.

Check what actually loaded, and only this boot's errors:

```sh
docker compose logs --no-color daptin | sed -E 's/\x1b\[[0-9;]*m//g' | grep 'Found files to load' | tail -1
docker compose logs --no-color daptin | sed -E 's/\x1b\[[0-9;]*m//g' \
  | awk '/Found files to load/{n=NR} {l[NR]=$0} END{for(i=n;i<=NR;i++) if (l[i] ~ /ERRO|WARN/) print l[i]}'
```

`docker compose logs` accumulates across restarts, so slicing from line 1 gives
you the first boot ever, not the current one.

## Rules this repository has already paid for

- **Declare `AccessGroups` and a non-zero `Permission` on every business table.**
  A table without them falls back to daptin's permissive default and becomes
  writable by anonymous callers — see `docs/decisions/0002-...`.
- **Never `Permission: 0`.** Schema sync treats it as unset and applies the
  default (2097151, full access for everyone).
- **`DefaultValue` must not be a quoted string.** `DefaultValue: "ACTIVE"` emits
  `DEFAULT ACTIVE` and table creation fails with
  `pq: cannot use column reference in DEFAULT expression`. Numbers and booleans
  are fine.
- **A `belongs_to` foreign key is named by `ObjectName`.** `SubjectName` only
  names the subject FK of a join table.
- **`Relations:` is a top-level key**, not a child of a table entry.
- **One table is declared by exactly one file.** Two files declaring the same
  table fight over its permission, and a `NOT NULL` foreign key cannot be added
  to a table that already holds rows.
- **Money-moving tables declare no Create, Update, or Delete** for any group;
  writes go through the `$wallet` action performer only
  (`POST /action/wallets/wallet_create|wallet_debit|wallet_credit`). Direct
  writes are refused for every principal including administrators by the
  `FinancialWriteDeniedTables` denylist, and the ledger is append-only at the
  database level (boot-installed triggers) — see
  `docs/decisions/0006-kientaohub-money-write-layer.md` and the proof in
  `docs/plans/active/kientaohub-phase-0.md`.
- **Never declare a business column named `reference_id`.** Daptin reserves it
  as the system bytea row identity: standard columns win silently and the
  declared column is dropped (measured 2026-09-14 — the ledger's business
  correlation id is `reference_code` for this reason).
- **Owner rows on action subjects need `Peek` and `Execute`, not just
  Read/Update.** The subject load of an `InstanceOptional: false` action is a
  GET gated by `CanPeek`, and `HandleActionRequest` gates the subject by
  `CanExecute` (measured 2026-09-14: `DefaultPermission: 9472` fails the
  subject load with 403; wallets use `13696` =
  UserPeek+UserRead+UserUpdate+UserExecute+UserRefer, ledger uses `384` =
  UserPeek+UserRead).
