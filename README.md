# test-v6

An operator console for a locally run daptin backend, plus the documentation
that keeps the setup reproducible.

## What is in here

| Path | What it is |
|---|---|
| `web/` | Vue 3 + Vite + TypeScript console (Ark UI Vue, Tailwind CSS v4) that reads the backend's schema and its records |
| `docs/` | architecture, product behavior, runbooks, decisions, and plans |
| `.agents/`, `AGENTS.md`, `docs/WORKFLOW.md` | [repository-harness](https://github.com/hoangnb24/repository-harness) core, managed by `scripts/bin/harness` |
| `docs/HARNESS.md` | what the harness install covers and how to maintain it |

The backend is **not** in this repository. It is an upstream clone of
[`daptin/daptin`](https://github.com/daptin/daptin) carrying local fixes, kept
privately as `daptin-patched` and checked out locally at `daptin/` (which
`.gitignore` excludes). Its fixes and the reasoning behind them are described in
`docs/decisions/0001-run-locally-patched-daptin-image.md`.

## Run it

```sh
# 1. backend (separate repository, checked out at daptin/)
cd daptin && docker compose up -d --wait

# 2. console
cd web && npm install && npm run dev     # http://localhost:5173
```

The console's dev server proxies the API paths to `127.0.0.1:6336`, so the
backend needs no CORS configuration. Sign in with an account that exists in the
backend — accounts are provisioned there, and no credentials are stored in this
repository.

## Documentation

Start at `docs/README.md` (the documentation map), then:

- `docs/ARCHITECTURE.md` — components, state ownership, update boundaries.
- `docs/product/overview.md` — what the product does today and what is still open.
- `docs/RUNBOOK.md` — operating the backend: start, readiness, reset, validation.
- `docs/RUNBOOK-web-console.md` — operating the console.
- `docs/decisions/` — choices future work inherits.

Harness maintenance:

```sh
./scripts/bin/harness status
./scripts/bin/harness doctor
./scripts/bin/harness update
```
