# Application Runbook: Local daptin Backend

Every command here was executed on this machine on 2026-09-14 and produced the
stated result. Values are marked **fixed**, **defaulted**, **configurable**, or
**observed**.

## Scope

The daptin application server and its PostgreSQL database, run with Docker
Compose from `daptin/`. Covers start, readiness, reset to known state,
administrator provisioning, interface access, log retrieval, cleanup, and
validation of the backend surface that `web/` consumes. The console surface has
its own runbook: `RUNBOOK-web-console.md`.

## Prerequisites

- Docker Engine with Compose v2 and a running daemon — **required**
  (`docker info` succeeds; verified).
- Free TCP port `6336` on `127.0.0.1` — **defaulted** by `DAPTIN_HOST_PORT` in
  `daptin/.env`.
- `curl` — **required** for readiness checks and API calls.
- Go toolchain — **only** to rebuild the image. `daptin/go.mod` requires Go
  `1.25.0`; a local Go 1.22.5 resolves it automatically through
  `GOTOOLCHAIN=auto` (**observed**). Module cache grows to ≈2.5 GB
  (**observed**).
- `unzip` + network access to `github.com/artpar/dashboard3` — **only** on a
  first build, to fetch dashboard assets (`build-local-image.sh` does this).
- Administrator credential: obtain it from where it is stored outside the
  repository. **No password is recorded in this repository.** The live instance
  uses administrator email `eszxcvfd@gmail.com` (**observed**).

## Start

```sh
cd daptin
docker compose up -d --wait
```

- Compose project name: `daptin` — **fixed** by `name:` in
  `daptin/docker-compose.yml`, so container and volume names do not change when
  the directory is moved.
- Containers: `daptin-daptin-1`, `daptin-postgres-1` — **observed**.
- Image: `daptin-local:v0.13.9-patched` — **configurable** through
  `DAPTIN_IMAGE` in `daptin/.env`. Upstream alternative: `daptin/daptin:latest`
  (loses the local patches).
- `pull_policy: missing` is set in `daptin/docker-compose.override.yml` because
  upstream's compose file pins `always` and the locally built image is not in a
  registry.
- Writable state: volumes `daptin_daptin-data` (`/var/lib/daptin`, blob
  storage) and `daptin_postgres-data` (database).

### Rebuild the image after changing Go code

```sh
cd daptin
./build-local-image.sh          # dashboard assets -> rice embed-go -> go build -> docker build
docker compose up -d --wait
```

The script reproduces the upstream release pipeline
(`.github/workflows/release.yml`): dashboard assets from `artpar/dashboard3`,
`rice embed-go` to embed them, git metadata through `-ldflags`, then
`docker build` with `TARGETARCH=amd64`.

## Readiness

```sh
curl -fsS http://127.0.0.1:6336/ping            # expect: pong
curl -fsS -o /dev/null -w '%{http_code}\n' http://127.0.0.1:6336/ready   # expect: 200
docker compose ps --format 'table {{.Service}} {{.Status}} {{.Image}}'   # both healthy
```

`healthy` comes from the container healthchecks defined in the compose files.

## Deterministic State

### Reset to an empty database (destructive)

Removes **all** accounts and records, including the administrator.

```sh
cd daptin
docker compose down
docker volume rm daptin_postgres-data daptin_daptin-data
docker compose up -d --wait
```

Expected first-boot result on an empty database: **zero** `ERRO` and `WARN`
lines in the container log (verified).

### Provision the first administrator

Select a password, keep it outside the repository, and use it in place of
`<PASSWORD>` below.

```sh
BASE=http://127.0.0.1:6336
EMAIL=eszxcvfd@gmail.com

curl -sS -X POST "$BASE/action/user_account/signup" -H 'Content-Type: application/json' \
  -d "{\"attributes\":{\"email\":\"$EMAIL\",\"name\":\"admin\",\"password\":\"<PASSWORD>\",\"passwordConfirm\":\"<PASSWORD>\"}}"

TOKEN=$(curl -sS -X POST "$BASE/action/user_account/signin" -H 'Content-Type: application/json' \
  -d "{\"attributes\":{\"email\":\"$EMAIL\",\"password\":\"<PASSWORD>\"}}" \
  | python3 -c 'import json,sys;print(next(a["Attributes"]["value"] for a in json.load(sys.stdin) if a.get("ResponseType")=="client.store.set"))')

curl -sS -X POST "$BASE/action/world/become_an_administrator" \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' -d '{"attributes":{}}'
```

`become_an_administrator` is accepted only while the `administrators` group has
no member. Re-sign-in afterwards; changing a password bumps `auth_version` and
invalidates previously issued tokens.

Rotate the password later:

```sh
curl -sS -X PATCH "$BASE/api/user_account/<USER_ID>" \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/vnd.api+json' \
  -d '{"data":{"type":"user_account","id":"<USER_ID>","attributes":{"password":"<NEW_PASSWORD>"}}}'
```

A mail-independent confirmation flag is available on the same resource
(`"confirmed": true`) because no SMTP server is configured.

## Interface

| Surface | Call |
|---|---|
| Dashboard (SPA) | browser → `http://localhost:6336/` |
| Sign in (JWT) | `POST /action/user_account/signin` |
| JSON:API collection | `GET /api/<table>`; create `POST /api/<table>` with `Content-Type: application/vnd.api+json` |
| JSON:API single row | `GET|PATCH|DELETE /api/<table>/<reference-id>` |
| Relationship | `GET /api/<table>/<reference-id>/relationships/<relation>` |
| Actions | `POST /action/<type>/<action>` |
| Schema upload (runtime) | action `upload_system_schema` / `install_integration` |
| Config store | `GET|POST /_config/backend/<key>` e.g. `cors.allowed_origins` |

Business tables are declared in `schema/schema_*.yaml` at the repository root and require a hard
restart to take effect:

```sh
docker compose restart daptin
```

## Runtime Evidence

Split the log at the point where the server starts serving; only the part before
it is startup evidence.

```sh
cd daptin

# startup portion only (everything before the listener starts)
docker compose logs --no-color daptin \
  | sed -E 's/\x1b\[[0-9;]*m//g' \
  | sed -n '1,/Listening at: \[:8080\]/p' \
  | grep -E 'ERRO|WARN'

# everything after the listener started
docker compose logs --no-color daptin \
  | sed -E 's/\x1b\[[0-9;]*m//g' \
  | sed -n '/Listening at: \[:8080\]/,$p' \
  | grep -E 'ERRO|WARN'

# schema actually loaded
docker compose logs --no-color daptin | grep -E 'Found files to load|Process file'
```

In this container the startup banner (`GitCommit`) is the first log group and
`Listening at: [:8080]` marks the end of startup (**observed**).

Expected and observed:

- **Startup on a populated database: zero `ERRO`/`WARN` lines.** Verified.
- **Startup on an empty database: zero `ERRO`/`WARN` lines.** Verified after the
  local patches; before them the same boot emitted three `ERRO` and two `WARN`.
- **After startup, a denied request adds an audit line at `WARN` level**, for
  example
  `BeforeCreate[TableAccessPermissionChecker] ... access not allowed for action [POST] to user [00000000-...]`.
  That is the audit record of an expected 403, not a fault: the single `WARN` in
  the log of a validation run comes exactly from the anonymous-write check in
  Validation. The count grows with denied requests; nothing else should appear.
- **No cache errors after startup.** `[2099]`, `[334]`, and `[234]` cache lines
  are patched out (see `decisions/0001-run-locally-patched-daptin-image.md`).
  The `[2099]` variant was observed once during a dashboard load before the
  patch; it is concurrency-dependent and could not be reproduced deterministically
  (10-way and 30-way synchronized bursts on the same cache key, plus a 92-table
  `/jsmodel` sweep, produced zero occurrences).
- Build metadata appears in the startup banner (`GitCommit`, `GitState`,
  `Version`) when the image was built with `build-local-image.sh`; a plain
  `go build` leaves those fields empty.
- Correlation identifier: daptin writes one line per request to stdout and the
  request path doubles as the identifier. There is no request id header.

## Ownership And Cleanup

Resources created by a run of this runbook:

| Resource | Name |
|---|---|
| Containers | `daptin-daptin-1`, `daptin-postgres-1` |
| Network | `daptin_default` |
| Volumes | `daptin_daptin-data`, `daptin_postgres-data` |

`docker compose down` removes containers and the network and **keeps** volumes.
Volume removal is a separate, explicitly destructive step (see
Deterministic State). Stop only the stack started by the current run; the Docker
daemon and other projects are not owned by this runbook.

## Validation

```sh
BASE=http://127.0.0.1:6336
curl -fsS -o /dev/null -w 'ping %{http_code}\n' $BASE/ping
curl -sS -o /dev/null -w 'anonymous read %{http_code}\n' $BASE/api/products
curl -sS -o /dev/null -w 'anonymous write %{http_code}\n' -X POST $BASE/api/products \
  -H 'Content-Type: application/vnd.api+json' \
  -d '{"data":{"type":"products","attributes":{"name":"probe","price":1}}}'
```

| Check | Expected |
|---|---|
| `GET /ping` | 200, body `pong` |
| `GET /` | 200 containing `Daptin Admin` |
| Sign in with the administrator credential | 200 and a JWT |
| `GET /api/products` without a token | 403 |
| `POST /api/products` without a token | 403 |
| Authenticated `POST` then `DELETE /api/products/<id>` | 201 then 200; its `products_..._has_usergroup_...` join row is removed with it |
| `GET /api/products/<unknown-id>` | 404 |
| `GET /api/llm_file/<unknown-id>/relationships/input_file_id` | 404 |
| Boot log on a populated database | no `ERRO`/`WARN` |

Full end-to-end evidence for the authorization and cascade rows: see
`decisions/0001-...` and `0002-...`.

## Unknowns

- Where the administrator password is stored (outside this repository, by
  design).
- The future frontend's authentication model and CORS origin
  (`web/` is empty; `cors.allowed_origins` is unset).
- Mail delivery: no SMTP server, so any flow that sends mail is unverified.
- Behavior beyond `127.0.0.1`: TLS, reverse proxy, and multi-host deployment are
  not configured and were not tested.
- Blob/asset uploads through `/api/...` were not exercised; `daptin_daptin-data`
  is currently unused.
