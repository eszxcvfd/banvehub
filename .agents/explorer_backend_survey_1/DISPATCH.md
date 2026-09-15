# Dispatch Log

## 2026-09-15T07:01:00Z
From: parent (902fae86-8610-4959-9027-f4a48d29b1e8)

Investigate the existing backend architecture in `web/` to understand existing patterns for:
1. Payload CMS setup: payload.config.ts, collections structure, field definitions, hooks, access control, auth.
2. PostgreSQL database migrations: where migrations live, how Batch 1-5 were implemented, naming conventions, runner scripts.
3. Money Write Layer: inspect `src/services/wallet.ts`, `debitWallet`, transaction helpers, how atomic transactions are executed with Payload/PostgreSQL/Drizzle.
4. Storage configuration: how uploads/media are configured, where `web/private/product_files` is or should be configured, access control.
5. Integration test setup: how existing 17 integration test suites in `tests/int/` are structured, database setup/teardown, fixtures, helpers (e.g. creating test users, top-up wallets, products).
6. Commands: verify exact test commands, lint commands, build commands in package.json.
