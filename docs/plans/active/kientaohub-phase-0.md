# Execution Plan: KienTaoHub Phase 0 — Product Definition And Money-Path Proof

Date: 2026-09-14

## Status

Active

## Outcome

`PLAN.md` Phase 0 is closed, and Phase 1 can start without re-deciding
architecture. Concretely:

- The capability questions that block the money path are answered by an
  executable spike against the running daptin instance, not by reading docs:
  a custom action writes a wallet row and its ledger entry in one transaction
  and rolls both back on failure, and a direct
  `POST`/`PATCH`/`DELETE /api/<financial-table>` returns 403 for every role.
- The Phase 0 artifacts `PLAN.md` §27 requires exist in this repository: ERD,
  API conventions, threat model, locked P0 scope, approved financial state
  machine, and a chosen payment provider.
- The three architecture choices ADR 0005 defers — secure-download path, search
  engine, ledger append-only enforcement — are each recorded as a decision.

## Context

Authority and product:

- `PLAN.md` — KienTaoHub v1.0 (2026-09-14): marketplace for CAD/design files;
  §26 P0 list, §27 Phase 0 deliverables and exit criteria, §42 prohibitions,
  §43 proposed stack, §34 proposed repository layout.
- `docs/decisions/0005-kientaohub-builds-on-daptin.md` — daptin is the backend
  and API of record; Next.js is the SEO storefront; `web/` is the operator and
  admin console; money-moving tables are read-only through the generic API.
- `docs/product/overview.md` — current verified product behavior.
- `docs/ARCHITECTURE.md`, `docs/RUNBOOK.md`, `docs/RUNBOOK-web-console.md` —
  runtime topology, operation, and the console's verified journey.

Capability evidence gathered 2026-09-14 from the checked-out source
(`daptin/server/**`, `daptin/wiki/**`). Labels: **V** = verified in code,
**D** = documentation only, **N** = not found.

Money path (the spike's subject):

- A custom action runs inside one `sqlx.Tx`, rolled back on error and committed
  on success — **V** `daptin/server/resource/handle_action.go:120`,
  `:132-137`; all CRUD outcomes share that transaction — **V**
  `handle_action.go:510`, `:583`, `:597`, `:622`, `:665`; the performer
  contract passes the transaction — **V**
  `daptin/server/actionresponse/action_pojo.go:25-28`.
- `$transaction` performer with `begin/commit/rollback/query` — **V**
  `daptin/server/actions/action_transaction.go:17-19`, `:29-65`; a mid-action
  `commit` acts on the same transaction the outer handler will commit again, and
  no savepoint/nested handling was found — **V** (untested risk)
  `action_transaction.go:28-66`.
- Generic CRUD is permission-gated per table and per row — **V**
  `resource/middleware_tableaccess_permission.go:101-149`,
  `resource/middleware_objectaccess_permission.go:180-216`; action execution is
  gated separately — **V** `handle_action.go:296-302`. Denying Create/Update/
  Delete on a table therefore blocks direct writes while actions still work.
- Action outcomes run with the administrator group appended — **V**
  `handle_action.go:401-403`, `permission/permission.go:102-105`, `:127-130`,
  `:153-156`; the DELETE outcome bypasses permission middleware by
  construction — **V** `handle_action.go:597`. Append-only enforcement, an
  immutability trigger, and any tested wallet/ledger multi-write are **N**.

Secure download (`PLAN.md` FR-17):

- A client gets metadata with a relative storage key, never a signed URL; files
  are proxied by `GET /asset/{table}/{id}/{column}` with per-request
  table-and-row permission checks — **V** `server/server.go:563`,
  `server/asset_route_handler.go:72-91`, `:159-163`, `:174-183`, `:407-423`,
  `:518-524`; cloud upload stores metadata only — **V**
  `resource/dbmethods.go:3551-3558`.
- Presigning exists for **upload only** (`PresignPutObject`/`PresignUploadPart`,
  fixed one-hour TTL) — **V** `server/asset_presigned_url.go:186-189`,
  `:252-268`, `:273-293`; `PresignGetObject`, `X-Amz-Expires`, a `/downloads/*`
  route, and any redirect-to-storage are **N**.

State machine and audit (`PLAN.md` FR-15, FR-28, NFR-14):

- `smd` declares states and events, `IsStateTrackingEnabled: true` creates
  `{table}_state`, and each transition writes a state row — **V**
  `wiki/State-Machines.md:24-34`, `:131-150`, `server/fsm/fsm_manager.go:89-94`,
  `server/handlers.go:136-155`, `:158-175`. One Execute gate covers every event
  of an `smd`; per-transition permission and guards are **N**
  (`server/handlers.go:106-112`, `:247-251`;
  `wiki/State-Machines.md:398-406`).
- `IsAuditEnabled: true` creates `{table}_audit` with a before-image — **V**
  `resource/dbfunctions_create.go:27-44`, `:540-575`,
  `resource_update.go:551-583`, `resource_delete.go:38-63`; CREATE writes
  nothing, there is no `reason` field, and there is no action-level audit —
  **V/N** `wiki/Audit-Logging.md:45-67`, `:363-368`.

Storefront:

- CORS is a JSON blob `backend/cors.config` (no wildcard origins) — **V**
  `server/cors.go:42-50`, `:63-105`, `:111`, `server/server.go:186-202`; the
  wiki documents a different, obsolete key — **D** `wiki/API-Reference.md:587-595`.
- Sign-in returns the token inside a `client.store.set` array entry — **V**
  `wiki/Authentication.md:43-69`, `server/auth/auth.go:135-137`.
- JSON:API filtering, sorting, and offset pagination exist; `contains` needs
  manual `%` and cursor pagination is documented broken — **D**
  `wiki/Filtering-and-Pagination.md:13-18`, `:61-77`, `:490-495`.
- No full-text search: only `LIKE`/`SOUNDEX` fuzzy operators — **V**
  `resource/resource_findallpaginated.go:1585-1659`; no `tsvector`/`to_tsquery`
  anywhere — **N**.
- No sitemap, no robots, and no cache headers on the JSON:API list path — **V/N**
  `server/file_serving_utils.go:43-46` (files only). daptin's routed templates
  register at startup and are unsuitable for thousands of product pages — **D**
  `wiki/Template-Rendering.md:381-385`, `:568`, `:593-595`.

## Scope

In scope:

- One money-path spike on the local instance: financial tables declared with
  explicit authorization, one custom action performing a conditional debit plus
  a ledger insert inside a single transaction, positive proof, forced-failure
  rollback proof, and negative proof that direct writes are refused.
- Phase 0 documents: ERD for the entities `PLAN.md` §17 names, API conventions,
  threat model, locked P0 scope, approved financial state machine, chosen
  payment provider.
- Decision records for the download path, search engine, and ledger
  append-only enforcement.
- Version-control durability for `PLAN.md` and `daptin/schema/`.

Out of scope:

- Phase 1 implementation (auth, catalog, seller, upload, moderation, wallet,
  payment integration, order, entitlement, withdrawal).
- The Next.js storefront and any change to `web/` behavior.
- Any payment provider integration, even in test mode.
- Deployment, TLS, CDN, and the production serving strategy left open by
  decision 0004.

## Approach

1. **Spike first, because it can invalidate the architecture.** Add the
   financial tables to `daptin/schema/`, declare `AccessGroups` with no Create,
   Update, or Delete (deny by construction, per decision 0002), and add one
   custom action that performs the conditional debit
   (`UPDATE ... WHERE balance >= :amount`, affected rows must be 1), inserts the
   ledger row, and fails the whole action on any mismatch. Restart daptin
   (schema changes need a hard restart, `docs/RUNBOOK.md`).
2. **Prove it through the real interface**, per `docs/WORKFLOW.md`: happy path
   (wallet debited, ledger row present, one transaction), forced failure (no
   partial write survives), and negative authorization (direct
   `POST`/`PATCH`/`DELETE` on the ledger table returns 403 for anonymous, signed
   in, and administrator callers — the administrator case is the one that
   matters, because actions themselves run admin-augmented).
3. **Record the spike result in this plan** with the exact commands and observed
   output, then decide whether the money path stays in daptin or moves to the
   separate service that ADR 0005 keeps as fallback.
4. **Write the Phase 0 documents** in the order the decisions depend on each
   other: ERD → API conventions → threat model. The ERD is written in daptin's
   schema vocabulary (`TableName`, `ColumnType`, relations,
   `IsStateTrackingEnabled`, `IsAuditEnabled`, `AccessGroups`) so it converts
   directly into `daptin/schema/` files instead of being redrawn.
5. **Lock the remaining owner decisions** — P0 scope, payment provider,
   financial state machine — as their own decision records, since `PLAN.md`
   §27 makes them Phase 0 exit criteria.
6. **Record the deferred architecture choices** — download path, search engine,
   ledger enforcement — as decisions 0006+ citing the evidence in Context.
7. **Make durable memory durable**: bring `PLAN.md` and `daptin/schema/` under
   version control, since both are outside git today, and update
   `docs/product/overview.md`, `docs/ARCHITECTURE.md`, and
   `docs/decisions/README.md` to describe two frontends over one daptin backend.

## Risks And Recovery

- **The spike changes the shared local instance.** Mitigation: only add new
  tables; never touch the existing `products` table or existing accounts. The
  reset procedure in `docs/RUNBOOK.md` restores a known state.
- **The spike may show daptin cannot hold the money path** (append-only
  enforcement is unverified, and action outcomes run admin-augmented).
  Mitigation: that is the point of running it first; the fallback in ADR 0005
  alternative 3 is promoted to its own decision instead of being improvised
  later.
- **Patch accumulation.** Any missing capability becomes another local patch on
  already-patched files and raises upstream rebase cost (decision
  0001 — seven local commits at the time, nine after the money-path change).
  Mitigation: prefer schema plus custom actions over Go patches, and
  require a recorded decision before the next patch. (2026-09-14 correction:
  the "thirteen patches" wording this risk inherited from decision 0001 was
  stale; the true count is `git log --oneline origin/master..HEAD`.)
- **Phase 0 is document-heavy and can be declared done without proof.**
  Mitigation: the spike is the completion gate; without its observed output the
  plan does not move to `completed/`.
- **`PLAN.md` and `daptin/schema/` exist only on this machine.** Mitigation:
  step 7 records both in git.
- Recovery: this plan only adds documents and new schema tables. Reverting is
  deleting the added schema file and its tables; nothing existing depends on it.

## Progress

- [x] Capability research against daptin source with file-and-line evidence
- [x] Record the stack decision as `docs/decisions/0005-kientaohub-builds-on-daptin.md`
- [x] Money-path spike: schema, custom action, restart, readiness
- [x] Spike proof: happy path, rollback, direct-write denial (see Validation)
- [x] Catalog slice of the data model: taxonomy, products, files, previews — proven by clean boot and read-back
- [x] Bring product policy and the data model under version control (`PLAN.md`, `schema/`)
- [x] Update `overview.md`, `ARCHITECTURE.md`, `RUNBOOK.md`, `decisions/README.md`
- [ ] Remaining `PLAN.md` §17 entities (seller, order, entitlement, review, ticket, CMS, audit); the wallet/ledger proof slice (`wallets`, `wallet_ledger`, decision 0006, 2026-09-14) is done, the rest wait for the P0 scope-lock package
- [ ] Publish flow that grants a guest read on a published product row — until it exists, no product row is guest-readable
- [x] Close the admin-bypass path on financial tables (2026-09-14: decision 0006 — middleware denylist before the admin short-circuit, `__data_import` guard, boot-installed triggers; administrator HTTP proof unattempted, no credential available)
- [ ] API conventions (auth, errors, pagination, versioning, rate limits)
- [ ] Threat model from `PLAN.md` §32 against this architecture
- [ ] Lock P0 scope, payment provider, and financial state machine as decisions
- [ ] Decisions: download path, search engine (ledger append-only enforcement recorded 2026-09-14 in decision 0006)

## Decisions

- 2026-09-14: KienTaoHub is built on daptin rather than on a from-scratch Go
  backend and monorepo — promoted to `docs/decisions/0005-kientaohub-builds-on-daptin.md`.
- 2026-09-14: The Phase 0 gate is an executable money-path spike, not document
  volume, because every open question that could invalidate the architecture
  (transaction semantics, append-only enforcement, direct-write denial) is only
  answerable by running it.
- 2026-09-14 (spike result): **the money path can live in daptin.** Multi-table
  atomicity and rollback are real, and a conditional debit is enforceable at the
  SQL level. Two gaps were measured, not assumed, and both need a decision before
  Phase 1:
  1. **No bound parameters.** `$n` placeholders are consumed by daptin's own
     `$`-substitution (`server/resource/handle_action.go:1257`,
     `EvaluateString`) and `~field` substitutes only when the whole attribute
     starts with `~` (`handle_action.go:1229`). A value can therefore only reach
     SQL by being concatenated into the statement text from a `{{ ... }}` JS
     expression — an injection surface guarded only by the action's `InFields`
     typing.
  2. **No success signal.** The conditional `UPDATE` returns no affected-row
     count and the action replied `HTTP 200 {"Attributes":[]}` both when the
     debit applied and when the guard refused it. An order flow cannot branch on
     whether money moved, and a following ledger insert cannot be made
     conditional on the guard.
  Consequence: the ledger/wallet action is a candidate for a small Go action
  performer inside daptin (still "on daptin", still one transaction) rather than
  a schema-only `$transaction query` action. That choice is Phase 0 work and is
  not yet made.
- 2026-09-14 (catalog slice): the schema is now the product's data model for
  taxonomy and catalog, and four platform behaviours were measured rather than
  assumed:
  1. **`DefaultValue` must not be a quoted string.** `DefaultValue: "ACTIVE"` on a
     `label` column makes daptin emit `DEFAULT ACTIVE`, and table creation fails
     with `pq: cannot use column reference in DEFAULT expression`. Numeric and
     boolean defaults are fine. Status values are therefore set by the
     application/action, not by a column default.
  2. **A `belongs_to` foreign key is named by `ObjectName`, not `SubjectName`.**
     With `SubjectName: category_id` daptin still created `categories_id`, because
     `SubjectName` only names the subject FK of a join table
     (`wiki/Relationships.md:100-101`).
  3. **A self-referencing `belongs_to` works**: `categories.parent_id` was created
     `NOT NULL`, which is what the FR-02 category tree needs.
  4. **Many-to-many needs no hand-written table**: `products` ↔ `tags` produced
     `products_products_id_has_tags_tags_id`. `PLAN.md` §17 names a
     `product_tags` table; daptin's own relationship mechanism is used instead,
     per the upstream rule against shadow mapping tables.
- 2026-09-14 (catalog slice): **the demonstration `products` declaration was
  retired.** `schema_products.yaml` and `schema_catalog.yaml` both declared
  `products`, so they fought: the demo file's `Permission: 16384` overwrote the
  catalog declaration, and daptin could not add the `NOT NULL` category foreign
  key to a table that already held a demo row. One table is now declared by
  exactly one file, and the demo table (its `name`/`price` columns and its single
  record) was dropped so the catalog shape could be created cleanly.
- 2026-09-14 (catalog slice): **the schema moved out of `daptin/` to `schema/` at
  the repository root**, because `.gitignore` excludes `daptin/` wholesale and
  git cannot re-include a path under an ignored directory. The compose override
  mounts `../schema` back into the container. Operational detail learned: a
  schema *content* change needs `docker compose restart daptin`, but a *mount*
  change needs `docker compose up -d` — `restart` reuses the old container and the
  schema silently loaded as `Found files to load: []`.
- 2026-09-14 (spike result): **administrators bypass table permission by
  platform rule** — `wiki/Permissions.md:242` states it and
  `server/resource/middleware_tableaccess_permission.go:88-90` implements it.
  So "money tables are read-only through the generic API" holds for anonymous and
  for signed-in non-administrators (both measured 403), but cannot hold for an
  administrator by permission bits alone. Closing that path needs a design
  choice (no human account in the `administrators` group for money tables, a
  service account for actions, or a local patch), and the per-table audit is only
  a partial compensating control because the audit row carries no actor column
  and CREATE is not audited at all.
- 2026-09-14 (money write layer): **decisions (a)/(b)/(c) implemented as
  `docs/decisions/0006-kientaohub-money-write-layer.md`** — (a) Go `$wallet`
  performer (bound parameters, typed responses, HTTP 409 refusal); (b)
  financial-write denylist before the administrator early-return plus the
  `__data_import` guard; (c) boot-installed, fatal-on-failure append-only
  triggers. Three corrections to the design draft were forced by measurement
  during execution, each kept minimal: (1) the ledger's business correlation
  column is `reference_code`, not `reference_id` — daptin reserves
  `reference_id` as the system bytea identity and silently drops a declared
  column with that name (the action-level `reference_id` input name is
  unchanged); (2) owner row permission is `13696`
  (UserPeek+UserRead+UserUpdate+UserExecute+UserRefer) on wallets and `384`
  (UserPeek+UserRead) on the ledger, not `9472`/`256` — the subject load of an
  `InstanceOptional: false` action is a GET gated by `CanPeek` and the subject
  is gated by `CanExecute`, so Peek and Execute bits are load-bearing
  (measured: `9472` fails the subject load with 403); as a side effect,
  non-owners can no longer invoke wallet actions on others' wallets — stricter
  than the draft's coarse-gate residual; (3) malformed performer inputs return
  HTTP 400 (`invalid_amount` etc., per the §7 taxonomy), not 500.
  `daptin/` commit `2926a062` (9 local commits ahead of upstream `8e2f6a9`);
  outer `schema/schema_wallet.yaml` + decisions + this plan update committed
  separately. Image tag `daptin-local:v0.13.9-patched-pre-money` preserves the
  pre-money binary.
- 2026-09-14 (money write-layer remediation, findings F1–F10): the raw design
  transcript `docs/plans/active/notes/money-write-layer-plan.md` (committed at
  `31e6593`) is removed here — its durable content already lives in decision
  0006 and in this log; the authoritative remediation plan is preserved at
  `docs/plans/active/notes/money-write-layer-remediation-plan.md`. What the
  remediation changed: (1) anonymous mint closed — all four wallet actions
  `Permission: 2097152` (`AuthenticatedExecute`) plus a 403 backstop in
  `createWallet`; the orphan row (wallets id=6, NULL owner) is preserved as
  evidence. (2) Guard installer dialect/existence-safe (sqlite3 and fresh-DB
  boots skip with a warning instead of dying), post-install trigger-count
  verification, and a positive `financial guards installed: ...` boot line;
  genuine postgres install failures stay fatal. (3) Bypass surfaces closed at
  the app layer: `$transaction` lexical 403, `world.delete`/column DDL guards,
  cloud-store import guard, and 403 for write-method action outcomes on money
  tables (fixes the DELETE-outcome 500-vs-403). (4) Ledger `user_account_id`
  is now the WALLET's owner (actor fallback only for the legacy orphan row).
  (5) `docs/product/` restored as canonical; decision 0002 records the
  verified fallback constants (`561441`/`2097151`); decision 0006 carries the
  bypass-closure amendment. Honesty residuals: no live administrator session
  was measurable (deny proven at mechanism level by test); `INSERT`
  mint/forgery and `wallets` UPDATE remain triggerless by design; the
  `$transaction` refusal is lexical. Full evidence: decision 0006 amendment +
  the Result section below.

## Validation

### Money-path spike, executed 2026-09-14 on the local instance

Temporary schema `daptin/schema/schema_spike.yaml` (since deleted) declared
`spike_wallet` and `spike_ledger` with `Permission: 33` (Guest Peek + Execute,
no Create/Update/Delete) and three actions with `Permission: 32`. Loaded by
`docker compose restart daptin`; boot log showed
`Found files to load: [.../schema_products.yaml .../schema_spike.yaml]`, all
actions registered, and **0** `ERRO`/`WARN` lines before `Listening at: [:8080]`.

| # | Call | Observed |
|---|---|---|
| 1 | `POST /action/spike_wallet/spike_create_wallet` (anonymous) | 200; wallet `spike-a` created, `balance=1000`, ledger empty |
| 2 | `POST /action/spike_wallet/spike_debit_ok` (anonymous, two write outcomes) | 200; `balance=900`, `ledger_rows=1 ledger_sum=100` — both writes committed together |
| 3 | `POST /action/spike_wallet/spike_debit_fail` (outcome 1 PATCH, outcome 2 invalid SQL) | 500 `pq: relation "spike_table_that_does_not_exist" does not exist`; `balance=900` unchanged, `ledger_rows=1` — **the PATCH was rolled back** |
| 4 | `POST/PATCH/DELETE /api/spike_wallet` anonymous | 403 / 403 / 403 |
| 5 | `POST /api/spike_ledger` anonymous | 403 |
| 6 | `GET /api/spike_wallet` anonymous | 200 with `"data":[],"total":0` — Peek alone exposes nothing |
| 7 | `POST/PATCH/DELETE /api/spike_wallet` as signed-in non-administrator | 403 / 403 / 403 |
| 8 | `POST /action/spike_wallet/spike_debit_ok` as signed-in non-administrator | 200 — `Permission: 32` is callable by anonymous **and** by any signed-in account |
| 9 | Conditional debit, `{{ }}` JS-built SQL `UPDATE ... WHERE balance >= <amount>` | amount 50 → 200, `balance 700→650`; amount 999999 → 200, `balance=650` **unchanged** (guard held) |
| 10 | Same, `$1`/`$2` placeholders | 500 `pq: syntax error at or near "<"` (placeholders eaten by `$` substitution) |
| 11 | Same, `~amount` inside the query text | 500 `pq: column "amount" does not exist` (`~field` substitutes only a whole attribute) |
| 12 | `IsAuditEnabled: true` on both tables, then a debit | wallet audit: **1 row**, `operation=update`, `balance=800` (before-image). Ledger audit: **0 rows** — INSERT is not audited. Audit columns contain no actor/`user_account_id` and no `reason` |
| 13 | Denied requests in the server log | `WARN ... BeforeCreate[TableAccessPermissionChecker]: http error (403) ... [table] [spike_ledger] access not allowed for action [POST] to user [00000000-...]` |

Not proven: the administrator case. No administrator credential is available to
this run, and the platform rule (code + `wiki/Permissions.md:242`) says an
administrator bypasses these checks, so permission bits cannot deny them.

### Cleanup performed

Schema file deleted; the spike actions had `permission` set to 0 directly in the
database (they now answer 403); restarted and verified the instance is back to
its declared state — `Found files to load: [schema_products.yaml]`, `GET /ping`
200, `GET /api/products` 403 as before, dashboard 200. The `ERRO`/`WARN` count
recorded for that boot is **not** evidence: it was sliced from the first boot in
the accumulated log instead of the current one. That pitfall is documented in
`schema/README.md`, and every later check slices from the last
`Found files to load`.
The `spike_*` tables, their rows, and the audit row remain in the database as
inert evidence, together with the test account `spike-nonadmin@example.com`
(created by this run through the real signup action; it is not an administrator).

### Catalog slice, applied 2026-09-14

`schema/schema_catalog.yaml` — tracked at the repository root, mounted into the
container — declares `categories`, `software_types`, `tags`, `products`,
`product_files`, `product_previews`, and the relations between them. Applied with
`docker compose up -d` because the mount had changed.

| Check | Observed |
|---|---|
| Boot | `Found files to load: [/var/lib/daptin/schema/schema_catalog.yaml]`; zero `ERRO`/`WARN` in this boot's log segment |
| Table gates | `world.permission` = categories 3, software_types 3, tags 3, products 3, product_previews 3, product_files 1 — exactly as declared |
| Access groups | the `world → users` relation permission = 49152 on the five public tables, 16384 on `product_files` |
| Foreign keys | `products.category_id`, `products.software_id`, `categories.parent_id`, `product_files.product_id`, `product_previews.product_id` all exist and are `NOT NULL` |
| Join table | `products_products_id_has_tags_tags_id` created by daptin; no hand-written `product_tags` |
| `products` columns | the full declared shape plus daptin's system columns; the retired demo columns `name`/`price` are gone |
| Anonymous API | `GET /api/<each table>` 200 with empty `data`; `POST /api/products` 403; `POST /api/product_files` 403 |
| Signed-in non-administrator | `GET /api/products` 200; `POST /api/products` 403; `POST /api/tags` 403 |
| Regression after the mount move | `GET /ping` 200; all six tables and their permissions unchanged |

Not proven here: a guest seeing a published product but not a draft. No row-level
grant exists yet, so the check that matters for the storefront waits for the
publish flow.

- Focused proof: rows 1–3 and 9 of the money-path table, and the table-gate and
  foreign-key rows above.
- Integration proof: rows 4–8 and 13 above, through the real HTTP interface.
- Repository-required checks: none configured. This repository has no CI and no
  schema lint; the Follow-Up in decision 0002 proposes one once more than one
  business table exists, which this plan will reach.

### Money write layer, implemented and proven 2026-09-14

Decision `docs/decisions/0006-kientaohub-money-write-layer.md`, executed by its
plan (`docs/plans/active/notes/money-write-layer-plan.md`). `daptin/` commit
`2926a062` (one commit: `server/actions/action_wallet.go`,
`server/resource/financial_guard.go`, `server/resource/financial_guard_test.go`,
`server/action_provider/action_provider.go`,
`server/resource/middleware_tableaccess_permission.go`,
`server/endpoint_init.go`, `server/actions/action_import_data.go`).
Image `daptin-local:v0.13.9-patched` rebuilt three times (final build carries
the 400-mapping fix); pre-money binary preserved as
`daptin-local:v0.13.9-patched-pre-money`. Test principal: signed-in
`wallet-test@example.com` (created for this run); anonymous; administrator
proofs UNATTEMPTED — the admin account `eszxcvfd@gmail.com` exists with an
unknown password outside the repo, and the `administrators` group is non-empty
so `become_an_administrator` is closed.

| # | Call | Observed |
|---|---|---|
| 1 | Boot gate | `Found files to load: [.../schema_catalog.yaml .../schema_wallet.yaml]`; zero `ERRO`/`WARN` in the boot segment; triggers `wallet_ledger_append_only` + `wallets_no_hard_delete` present; `GET /ping` → `pong` |
| 2 | `POST /action/wallets/wallet_create` `{"currency":"VND"}` (signed-in) | 200 `wallet.created`, uuid ref; row: `balance=0`, `user_account_id=4`, `permission=13696` |
| 3 | `POST /action/wallets/wallet_credit` 100 then `wallet_debit` 50 | 200 `wallet.mutation` `0→100`, `100→50`; ledger rows `(credit,100,IN,0,100)`, `(debit,50,OUT,100,50)` with `permission=384`; `reference_type`/`reference_code` stored verbatim |
| 4 | `wallet_debit` 999999 on balance 50 | **HTTP 409** `insufficient_funds`/`insufficient funds`; balance 50, ledger count unchanged |
| 5 | `wallet_rollback_probe` amount 10 (debit then query on nonexistent table) | HTTP 500 `pq: relation "wallet_probe_table_that_does_not_exist" does not exist`; balance and ledger count unchanged — the debit rolled back |
| 6 | `wallet_debit` amount 0 | HTTP 400 (action `required,gt=0` validation) |
| 7 | `POST /api/wallets`, `POST /api/wallet_ledger` with valid JSON:API body, anonymous | 403 `TableAccessPermissionChecker` on both |
| 8 | Same `POST`s as signed-in non-administrator | 403 / 403 |
| 9 | `PATCH`/`DELETE /api/wallets/<ref>`, `/api/wallet_ledger/<ref>`, anonymous and signed-in | 403 × 8 (every line) |
| 10 | `POST /api/wallets/<ref>/relationships/user_account_id`, anonymous and signed-in | 403 / 403 |
| 11 | Bare `PATCH`/`DELETE /api/wallets` (no id) | 200 serving the dashboard SPA shell (static fallback, no API effect — balances/counts unchanged). The draft's bare-request matrix rows are uninformative as written; rows 9–10 are the real denial proof |
| 12 | `UPDATE wallet_ledger ...`, `DELETE FROM wallet_ledger`, `DELETE FROM wallets` in psql | `ERROR: kientaohub: UPDATE|DELETE on ... is refused (append-only, docs/decisions/0006)` × 3; counts unchanged |
| 13 | `TRUNCATE wallet_ledger`, `TRUNCATE wallets` in psql | refused by FK ordering (`cannot truncate a table referenced in a foreign key constraint`) before reaching the trigger; trigger TRUNCATE coverage verified in code + `TestFinancialGuardStatementsCoverTruncate`, not live-fired |
| 14 | `POST /action/world/import_data` targeting the wallets world row, signed-in | 403 at the world-row subject gate (`not allowed action on this object: import_data`) — the action is admin-gated, so the new `__data_import` denylist is code-verified but not live-executed (same credential reason as the admin matrix) |
| 15 | `wallet_debit` amount `"50' OR '1'='1"` and `"1; DROP TABLE wallet_ledger"` | HTTP 400 × 2 (`invalid_amount`); ledger count and balance unchanged; `wallet_ledger` still listed — no partial effect |
| 16 | `wallet_credit` with `reference_type: "x'--"` | 200; stored verbatim — text fields are bound parameters, never concatenated |
| 17 | Regression | `GET /ping` 200; `GET /api/products` 200; signin 200; both containers healthy; `GET /api/wallets` anonymous 200 with empty data; `GET /api/wallet_ledger` signed-in owner 200 |
| 18 | Unit | `go test ./server/resource/ -run TestFinancial` ok; `go vet` clean (third-party sqlite warning only); `go build ./...` ok |

NOT measured (same credential reason): the 6 administrator direct-write rows
(POST/PATCH/DELETE × 2 tables), admin `PATCH`/`DELETE` on a ledger row, the
admin relationships row, admin `GET /api/wallet_ledger`, and a live
`__data_import` refusal. The middleware ordering (denylist before the
`IsAdminWithTransaction` early-return) is verified in the committed diff, and
the triggers refuse every role at the database level (rows 12–13) independent
of principals.

Test data left in place (inert, documented): wallets `01a09f11-...` (balance
105, permission-probe history) and `01a09f1a-...` (balance 57), 5 ledger rows,
account `wallet-test@example.com`. Not deleted: the earlier spike's `spike_*`
tables/rows and `spike-nonadmin@example.com` are untouched.

## Result

Remediation executed and measured 2026-09-14 on the live instance
(`daptin-daptin-1` image `daptin-local:v0.13.9-patched`, `daptin/` commit
`003a4968`, outer schema commit `87bde2b`). Rollback image
`daptin-local:v0.13.9-patched-pre-remediation` tagged before rebuild.

- **F1 closed.** Anonymous `POST /action/wallets/wallet_create` → 403 (was
  measured 200); NULL-owner wallet count 1→1 (only the preserved evidence
  row id=6). Same call signed-in → 200 `wallet.created`, owner-scoped row.
  Stored action permissions live: all four wallet actions `=2097152`.
- **F1/F2 regression intact.** Signed-in create→credit 100→debit 50 all 200;
  debit above balance → 409 writing nothing; `"50' OR '1'='1"` → 400;
  `wallet_rollback_probe` → 500 with balance unchanged (probe query names no
  money table, so the new lexical guard lets it through by design).
- **Concurrency re-run on the remediated build** (the fix touched the
  lock-select): balance 100 + 10 simultaneous debits of 30 → exactly
  3 × 200 / 7 × 409, final balance 10, ledger OUT sum 90, chain invariant
  (`balance_after = balance_before ± amount`) 0 violations.
- **Boot gate (replaces the old `ERRO|WARN` filter).** Boot log contains
  `financial guards installed: wallet_ledger_append_only,
  wallets_no_hard_delete`; presence query prints exactly the two trigger
  lines; both triggers fire with the exact `kientaohub:` message. The old
  gate is retired because logrus truncates levels to 4 chars
  (`DisableLevelTruncation: false`), so a fatal install failure prints
  `FATA` — invisible to an `ERRO|WARN` filter. The new gate asserts
  presence, firing, and the positive line instead.
- **F2 sqlite path.** `go test . -run TestServerApis` (repo root, corrected
  from the plan's `./server/` path): pristine tree dies mid-boot (FAIL,
  7.4s, no assertions); remediated tree boots and serves through the full
  HTTP matrix to the FTP stage (FAIL at `server_test.go:1491`, FTP `CD`
  `/site.daptin.com/` — code untouched by this diff, reported as observed).
- **New tests, all executed.** `server/resource`: SQL-refusal cases,
  sqlite dialect gate, `TestFinancialDenylistBindsAdministrator` (synthetic
  admin recognised, then 403 — mechanism-level proof); env-gated postgres
  contract (`DAPTIN_TEST_POSTGRES_DSN`, scratch DB, since dropped):
  trigger presence + refusals, documented residuals (ledger INSERT lands,
  wallets UPDATE lands), owner attribution incl. NULL-orphan fallback,
  post-sync permission `=2097152`. `server/actions`: anonymous-create,
  `$transaction`, cloud-import, `__data_import` refusals (all 403/denied,
  nil-tx). `server`: write-surface tripwire. Full suites
  (`resource`, `actions`, `server`) green; `go vet` clean.
- **F6/F4/F5 honesty.** No schema action carries a DELETE outcome and none
  exposes caller-controlled `$transaction` text, so the 403s for those paths
  are proven by executed unit tests + the tripwire, NOT live over HTTP
  (marked code-verified in decision 0006). Live admin-gated DDL performers
  refuse a non-admin token at the action gate (observed 403s).
- **F7.** Live ledger rows carry `user_account_id` = wallet owner (9=9);
  stranger-debit attribution proven in the pg test.
- **F3.** `docs/product/` canonical; `docs/plans/product/` gone;
  `docs/product/README.md` sha256 matches `.harness-core/manifest.json`;
  all seven `docs/product` references resolve; overview diff vs `31e6593`
  is exactly the +13-line money section.
- **Evidence preserved, not mutated:** wallets ids 1–6 (all `permission`
  13696, incl. id=3 and the NULL-owner id=6), spike tables/rows, test
  accounts, `wallets_audit` table. Added by this validation (expected): probe
  account + wallets, race wallet + 4 ledger rows.
- **Stays unproven (F10 honesty):** no live administrator HTTP session was
  measurable (no credential obtainable); `$transaction` refusal is lexical;
  money path remains postgres-only; `wallets` UPDATE and both tables' INSERT
  have no database barrier by design (decision 0006 amendment).

Phase 1 may build wallet/order/entitlement on this layer within the stated
residuals. Follow-up lives in decision 0006 and `docs/RUNBOOK.md`
(wallet-503 recovery, boot gate).
