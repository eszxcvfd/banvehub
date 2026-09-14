Both reviews are in, with concrete verified findings. Now I'll synthesize the final plan myself (STAGE 3), resolving the conflicts:

- **Adopt from Plan 1**: the `$wallet` performer with a `create_wallet` operation (closes Reviewer 2's BLOCKER — Plan 2 had no wallet-creation path); the 409 insufficient-funds contract (Reviewer 1 verified `api2go.HTTPError` status propagates, `handle_action.go:188-191`); TRUNCATE trigger coverage; `DefaultPermission: 9472`/`256` (Reviewer 2's own bit-math confirmed Plan 2's `DefaultPermission: 33` would make wallet balances world-readable — a real leak).
- **Adopt from Plan 2**: boot-hook in `endpoint_init.go` after `CreateIndexes` (Reviewer 2 verified table creation precedes it, `:17` → `:35`); the correct wrapper-branch syntax `{{ debit.status == 'OK' }}` (Reviewer 2 disproved Plan 1's Condition path and Plan 1's `$.amount` path in the same stroke).
- **Adopt from the reviews (verified against code)**: use `~amount` whole-attribute substitution, never `$.amount` (R1-MAJOR-1); request shape must include `wallets_id` (R1-MAJOR-2); close the `__data_import` `DirectInsert`/`TruncateTable` bypass (R1-MAJOR-3); make trigger-install failure fatal (R2-M3); fix the V3/V10 contradiction (R2-M2); image-retag before rebuild (R1-MINOR-2); drop the dead `OnDelete: restrict` claim (R1-MINOR-1).

---

# KienTaoHub — Money-Path Write Layer: Final Implementation Plan

Repository: `/home/trung/Documents/2026/project/test-v6` (outer repo, branch `main`, HEAD `6191601`) · backend clone `daptin/` (branch `master`, **7 local commits** ahead of `origin/master`: `1cb9e326…0ae6d95b`). Runtime verified live: `daptin-daptin-1` (`daptin-local:v0.13.9-patched`, `127.0.0.1:6336→8080`) and `daptin-postgres-1` (postgres:17-bookworm) healthy; `GET /ping` 200, `GET /api/products` 200. `daptin/` working tree is dirty: `M docker-compose.override.yml`, `D schema/schema_products.yaml` (intentional — schema moved to `../schema`, mounted read-only via `DAPTIN_SCHEMA_FOLDER=/var/lib/daptin/schema`, `daptin/docker-compose.override.yml`).

Owner grant 2026-09-14 ('Cho bạn toàn quyền, và tự chọn công nghệ phù hợp, tiếp tục thực hiện'): full authority to select the technology and proceed, **including a Go change inside `daptin/`**. It does not extend to product policy (pricing, commission, provider choice, wallet-ownership policy) — those are explicitly deferred.

---

## 1. Decision

### (a) Money-path write layer — **a Go action performer `$wallet` inside daptin**, writing wallet + ledger rows with bound parameters on the action's injected `*sqlx.Tx`, returning a typed `ActionResponse` and a distinct HTTP 409 on refusal.

**Reason:** the schema-only path is measured-broken for money (not assumed): no bound parameters (`$1` is destroyed by daptin's `$`-substitution, `daptin/server/resource/handle_action.go:1257`; `~field` substitutes only a whole attribute, `:1229` — spike rows 10–11), and no success signal (`HTTP 200 {"Attributes":[]}` both when the debit applied and when refused — spike row 9), so no order flow can branch. The performer extension point is verified end-to-end and precedent-backed: `CreatePostActionHandler(initConfig *CmsConfig, cruds map[string]*DbResource, actionPerformers []actionresponse.ActionPerformerInterface)` (`handle_action.go:74-89`), performers assembled in `daptin/server/action_provider/action_provider.go` (`$transaction` appended at `:179-181`, `RegisterGlobalActionHandler` loop at `:263-265`), wired at `daptin/server/server.go:473-477`, interface `DoAction(request Outcome, inFields map[string]interface{}, transaction *sqlx.Tx) (api2go.Responder, []ActionResponse, []error)` / `Name() string` (`daptin/server/actionresponse/action_pojo.go:25-28`), all on the single action transaction rolled back on any error and committed on success (`handle_action.go:120, 132-137`).

**Rejected alternatives:**
1. *Schema-only `$transaction query` action with `{{ }}`-concatenated SQL* — the measured gaps are disqualifying for money; values can only reach SQL by string concatenation (injection surface), and refusal is unobservable.
2. *Separate Go money service* (ADR 0005 alternative 3) — the fallback trigger ("daptin cannot hold the money path") did not fire: multi-table atomicity and rollback are real (spike rows 2–3); both remaining gaps close with one small performer. Stays recorded as the fallback.
3. *Insufficient-funds as HTTP 200 + status field* — considered; rejected because `api2go.NewHTTPError` status verifiably propagates to the HTTP response (`handle_action.go:188-191`), and a non-2xx is unambiguous at every client and aborts later outcomes of a wrapper action, which is the correct behavior when money did not move.

### (b) Admin-bypass closure — **a financial-write denylist checked in `TableAccessPermissionChecker.InterceptBefore` before the administrator early-return, plus the same denylist applied to the `__data_import` performer, with DB triggers (decision (c)) as the backstop for middleware-bypassing paths.**

**Reason:** administrators bypass table permission by platform rule (`daptin/wiki/Permissions.md:242`; `middleware_tableaccess_permission.go:88-90`; every `Can*` returns true for the admin group, `daptin/server/permission/permission.go:102-105, :127-130, :153-156`), so no permission bit can deny an admin. `InterceptBefore` (`:75`) is the last in-app choke point before that early return; action CRUD outcomes (`POST`/`PATCH`) run through `CreateWithTransaction`/`UpdateWithTransaction` whose before-chains invoke it (`handle_action.go:510, :583`; `resource_create.go:1051`; `resource_update.go:1244-1258`), so the denylist closes the generic API **and** every action CRUD outcome against money tables, for every principal including the appended administrator. The one verified middleware bypass — the action DELETE outcome's `DeleteWithoutFilters` (`handle_action.go:597`, `resource_delete.go:27`) — is covered only by the decision-(c) triggers, which is why the two mechanisms are selected together and both are mandatory. The measured-audit control is rejected as enforcement (CREATE writes nothing, no actor column, no reason — spike row 12; `dbfunctions_create.go:27-44, :540-575`) and kept only as optional secondary evidence.

**Precise limits (named residuals, §6):** the `__data_import` action performer calls `DirectInsert`/`TruncateTable` with a caller-supplied table name (`daptin/server/actions/action_import_data.go:185, :165`) and does **not** pass through `InterceptBefore` — an administrator can execute it — so the same commit adds a denylist refusal there; `TRUNCATE` is additionally blocked by the triggers. `wallets` UPDATE cannot be trigger-blocked (a trigger cannot distinguish the performer's legitimate debit from a same-connection edit); it is closed at the app layer only, and direct `psql` access remains an operational boundary.

**Why actions still work, and as which principal:** the action path continues to run as the caller's `sessionUser` with the administrator group appended (`handle_action.go:401-403`) — unchanged. (i) An `EXECUTE` outcome reaches its performer directly (`handle_action.go:607-641`) without the table-access middleware, and the `$wallet` performer writes bound SQL on the action transaction, never through `DbResource`, so the denylist never sees it; (ii) the action-gate itself is untouched (`handle_action.go:296-302`); (iii) the subject-load inside `HandleActionRequest` runs as `GET` (`:267`), so the non-GET denylist does not break subject fetching for the wallet actions.

### (c) Ledger append-only enforcement — **boot-installed, idempotent PostgreSQL triggers**, installed from Go at every boot, fatal on failure.

**Reason:** only a DB-level guard fires on *every* path and role — including `DeleteWithoutFilters` (`handle_action.go:597`) and any future raw-SQL path — and decision 0003 makes the database a merge target that is periodically rebuilt, so enforcement living only in the DB silently disappears; installing it from the same image that owns all other DDL makes it self-healing across every rebuild. PLAN.md BR-03 (reversal entries, never update/delete; `PLAN.md:1393`) and §42.7 (no hard-delete) are enforced at the lowest surviving layer.

**Selected triggers** (`wallet_ledger`: `BEFORE UPDATE OR DELETE OR TRUNCATE`, statement-level; `wallets`: `BEFORE DELETE OR TRUNCATE`; `wallets` UPDATE deliberately not blocked — the performer's debit needs it). Installation is fatal-on-failure (not `CheckErr`, which only logs — `dbfunctions_check.go:28-42`), because the trigger is the sole guard on the `DeleteWithoutFilters` path.

**Rejected alternatives:** hand-applied psql triggers (violates decision 0003; silently lost on rebuild; acceptable only as the fallback if the Go-change grant is ever revoked — same SQL, plus a documented re-apply step); performer-only discipline (the `DeleteWithoutFilters` path proves convention is not enforcement); Postgres RLS (daptin connects as one role, the table owner — no second boundary); a session-GUC-guarded `wallets`-UPDATE trigger (a psql superuser can set the same GUC — adds protocol, closes nothing).

---

## 2. Authority

| Claim | Citation |
|---|---|
| daptin is backend and API of record; money tables read-only via generic API, writes via custom actions; separate service only as fallback | `docs/decisions/0005-kientaohub-builds-on-daptin.md` (Decision + Alternative 3) |
| Every business table declares `AccessGroups` + non-zero `Permission`; `Permission: 0` → 2097151 full access | `docs/decisions/0002-business-table-authorization-pattern.md` (Decision block); `schema/README.md` "Never Permission: 0" |
| Intended config lives in `schema/`/code; drift fixed by rebuild — why triggers are boot-installed | `docs/decisions/0003-database-config-merge-rebuild.md` |
| Go changes via `daptin/build-local-image.sh`; patch cost recorded | `docs/decisions/0001-run-locally-patched-daptin-image.md` (note: its "thirteen patches" is stale — see Step 0) |
| Performer extension point | `handle_action.go:74-89`; `action_provider.go:179-181, :263-265`; `server/server.go:473-477`; `action_pojo.go:25-28`; precedent `daptin/server/actions/action_transaction.go:38-60` (Preparex/Queryx bound args on the injected tx) |
| One action transaction, rollback on error | `handle_action.go:120, :132-137`; outcomes share it `:510, :583, :597, :622, :665` |
| Admin bypass rule | `wiki/Permissions.md:242`; `middleware_tableaccess_permission.go:88-90`; `permission/permission.go:102-105, :127-130, :153-156` |
| `__data_import` in-app bypass | `daptin/server/actions/action_import_data.go:165` (TruncateTable), `:185` (DirectInsert) |
| Conditional debit (affected rows must gate the write), ledger immutability, no hard-delete | `PLAN.md` BR-01 (`:1364`), BR-03 (`:1393`), §42.7; §33 (integer money, UTC); §42.2/42.3/42.6 |
| `wallet_ledger` columns incl. `balance_before`/`balance_after`; payment status enum | `PLAN.md` §11.1 (`balance_before` at `:1506`), §11.2 |
| Spike evidence rows 1–13 (atomicity, 403s, gaps 1–3, audit limits) | `docs/plans/active/kientaohub-phase-0.md` Validation table |
| Owner grant incl. Go change; product policy excluded | Session record, 2026-09-14 |
| Permission bit values | `daptin/server/auth/auth.go:36-61` (Peek=1, Execute=32; 33 = GuestPeek+GuestExecute; 9472 = UserRead+UserUpdate+UserRefer; 256 = UserRead; 16384 = GroupPeek) |

**Unverified in this session, measured during execution:** `endpoint_init.go` hook lines (`CheckAuditTables` ~`:10`, `CheckAllTableStatus` ~`:17`, `CreateIndexes` ~`:35` per review verification), `Validations:` YAML load from a schema-file `Actions:` block, and administrator behavior on this instance (no admin credential existed during the spike).

---

## 3. Implementation steps

### Step 0 — Git hygiene and patch-count correction

```sh
cd /home/trung/Documents/2026/project/test-v6/daptin
git add docker-compose.override.yml schema/schema_products.yaml
git commit -m "chore(local): mount schema from ../schema, retire demo products schema"
git status --porcelain   # must be empty
```

`build-local-image.sh:38-41` embeds `GitState=dirty` into the binary when the tree is dirty — the build in Step 6 must run from a clean tree. In the outer repo, correct the stale count in `docs/decisions/0001-run-locally-patched-daptin-image.md` (the "thirteen patches" text appears at three places — `:39`, `:71`, `:80`) to "**seven local commits** (`1cb9e326…0ae6d95b`), becoming eight with the money-path change", and the same wording in `docs/plans/active/kientaohub-phase-0.md` (Risks section).

### Step 1 — Record the decision

Create `docs/decisions/0006-kientaohub-money-write-layer.md`: decisions (a)/(b)/(c) as in §1, with the evidence citations, the named residual bypass paths, and the extension rule ("every new money table = schema entry + `FinancialWriteDeniedTables` entry + trigger entry, one commit"). Note that the plpgsql installer is PostgreSQL-specific — correct for this deployment (`daptin/docker-compose.yml` uses postgres:17-bookworm).

### Step 2 — `schema/schema_wallet.yaml` (new file in outer `schema/`)

Each table declared in exactly one file (schema/README.md rule); applied by `docker compose restart daptin` (content change; `up -d` in Step 6 covers it anyway since the image changes too). Exact content:

```yaml
# KienTaoHub money-path proof slice — wallets + wallet_ledger (decisions a/b/c).
# Authority: PLAN.md §11.1, §17, FR-11, BR-01, BR-03, §33, §42.2/3/6/7;
#   docs/decisions/0002 (AccessGroups + non-zero Permission; never 0);
#   docs/decisions/0005 (money tables read-only via generic API; writes via $wallet);
#   docs/decisions/0006 (this decision).
# Bitmask (schema/README.md, daptin/server/auth/auth.go:36-61):
#   Peek=1 Read=2 Create=4 Update=8 Delete=16 Execute=32 Refer=64.
# Row policy is PROOF scope: owner-scoped rows (no world bits) so an anonymous
#   GET list exposes nothing (spike row 6 semantics). Owner/entitlement shaping
#   of rows is product policy deferred to the P0 scope-lock package — this file
#   is marked removable at that decision.
Tables:
  - TableName: wallets
    IsTopLevel: true
    TableDescription: "Wallet (PLAN.md FR-11). Writes only via the $wallet performer."
    Permission: 33            # table gate: Guest Peek + Execute (actions need Execute; handle_action.go:296-302)
    DefaultPermission: 9472   # new rows: owner Read+Update+Refer — no world bits
    AccessGroups:
      - Name: users
        Permission: 16384     # GroupPeek only — balances are not group-readable
    Columns:
      - Name: currency
        ColumnType: label
        DataType: varchar(10)
        IsNullable: false
      - Name: balance
        ColumnType: measurement
        DataType: bigint      # integer money (PLAN.md §33, §42.2); bigint cannot overflow int32
        IsNullable: false
      - Name: status
        ColumnType: label
        DataType: varchar(50) # set by the performer; never a quoted-string DefaultValue (schema/README.md rule)
    IsAuditEnabled: true      # secondary evidence only (before-image on UPDATE); not enforcement

  - TableName: wallet_ledger
    IsTopLevel: true
    TableDescription: "Append-only ledger (PLAN.md §11.1, BR-03). INSERT via $wallet only."
    Permission: 1             # Guest Peek only at the table gate
    DefaultPermission: 256    # new rows: owner Read only
    AccessGroups:
      - Name: users
        Permission: 16384     # GroupPeek only
    Columns:
      - Name: type
        ColumnType: label
        DataType: varchar(50)
        IsNullable: false
      - Name: amount
        ColumnType: measurement
        DataType: bigint
        IsNullable: false
      - Name: direction
        ColumnType: label
        DataType: varchar(10)   # IN | OUT (PLAN.md §11.1)
        IsNullable: false
      - Name: reference_type
        ColumnType: label
        DataType: varchar(100)
      - Name: reference_id
        ColumnType: label
        DataType: varchar(100)
      - Name: reason
        ColumnType: label
        DataType: varchar(500)
      - Name: balance_before
        ColumnType: measurement
        DataType: bigint
        IsNullable: false
      - Name: balance_after
        ColumnType: measurement
        DataType: bigint
        IsNullable: false
      - Name: entry_at
        ColumnType: datetime
        DataType: timestamp     # UTC (PLAN.md §33)

Relations:
  - Subject: wallet_ledger
    Object: wallets
    Relation: belongs_to
    ObjectName: wallet_id     # the FK is named by ObjectName (schema/README.md)
# No cascade: the ledger must not die with a wallet (PLAN.md §42.7); the FK
# defaults to NO ACTION and the trigger below makes deletion impossible anyway.
```

Do **not** declare `payment_intents`/`payment_transactions` here — this package adds only what the three decisions need; they are declared as the next package's interface (§7).

Actions in the same file (top-level `Actions:`; format per `daptin/examples/payment-checkout/schemas/schema_payment_checkout.yaml`):

```yaml
Actions:
  - Name: wallet_create
    Label: Create a wallet for the signed-in user
    OnType: wallets
    InstanceOptional: true
    Permission: 32
    InFields:
      - Name: currency
        ColumnType: label
        DataType: varchar(10)
        IsNullable: false
    OutFields:
      - Type: $wallet
        Method: EXECUTE
        Reference: wallet_create
        Attributes:
          operation: create_wallet
          currency: "~currency"          # whole-attribute ~ substitution against validated InFields

  - Name: wallet_debit
    Label: Conditionally debit a wallet and append a ledger entry
    OnType: wallets
    InstanceOptional: false              # subject = the wallet row; caller sends wallets_id
    Permission: 32
    InFields:
      - Name: amount
        ColumnType: measurement
        DataType: bigint
        IsNullable: false
      - Name: reference_type
        ColumnType: label
        DataType: varchar(100)
      - Name: reference_id
        ColumnType: label
        DataType: varchar(100)
    Validations:
      - ColumnName: amount
        Tags: "required,gt=0"            # server-side reject before any SQL
    OutFields:
      - Type: $wallet
        Method: EXECUTE
        Reference: debit
        Attributes:
          operation: debit
          amount: "~amount"
          wallet_reference_id: "$.reference_id"   # $. resolves against the SUBJECT (the wallet row)
          reference_type: "~reference_type"
          reference_id: "~reference_id"

  - Name: wallet_credit                  # symmetric to wallet_debit (operation: credit)
    Label: Credit a wallet and append a ledger entry
    OnType: wallets
    InstanceOptional: false
    Permission: 32
    InFields:
      - Name: amount
        ColumnType: measurement
        DataType: bigint
        IsNullable: false
      - Name: reference_type
        ColumnType: label
        DataType: varchar(100)
      - Name: reference_id
        ColumnType: label
        DataType: varchar(100)
    Validations:
      - ColumnName: amount
        Tags: "required,gt=0"
    OutFields:
      - Type: $wallet
        Method: EXECUTE
        Reference: credit
        Attributes:
          operation: credit
          amount: "~amount"
          wallet_reference_id: "$.reference_id"
          reference_type: "~reference_type"
          reference_id: "~reference_id"

  # PROOF-ONLY, REMOVABLE after validation §4 step 5: forces a mid-action failure
  # after a successful debit, proving the whole action transaction rolls back.
  - Name: wallet_rollback_probe
    Label: Proof action - debit then force a failure
    OnType: wallets
    InstanceOptional: false
    Permission: 32
    InFields:
      - Name: amount
        ColumnType: measurement
        DataType: bigint
        IsNullable: false
    Validations:
      - ColumnName: amount
        Tags: "required,gt=0"
    OutFields:
      - Type: $wallet
        Method: EXECUTE
        Reference: debit
        Attributes:
          operation: debit
          amount: "~amount"
          wallet_reference_id: "$.reference_id"
      - Type: $transaction
        Method: EXECUTE
        Attributes:
          action: query
          typeName: probe
          query: "SELECT 1 FROM wallet_probe_table_that_does_not_exist"
          arguments: []
```

**Attribute-substitution rule (load-bearing, review-verified):** `~name` resolves against validated InFields (`handle_action.go:1229-1252`); `$.name` resolves against the **subject instance map** (`:1257-1321`, empty field-part remaps to `subject`) — so `amount: "~amount"` and `wallet_reference_id: "$.reference_id"` are both correct, while `$.amount` would be wrong (the wallet row has no `amount` column and `wallet_create` has no subject). `~subject.reference_id` is NOT used. Do not put any value inside query text.

### Step 3 — `daptin/server/actions/action_wallet.go` (new file, package `actions`)

Contract (imitates `action_transaction.go`; return `(nil responder, responses, errs)` matching `action_transaction.go:56`):

```go
package actions

type walletActionPerformer struct {
    cmsConfig *resource.CmsConfig
    cruds     map[string]*resource.DbResource
}

func (d *walletActionPerformer) Name() string { return "$wallet" }

func (d *walletActionPerformer) DoAction(request actionresponse.Outcome,
    inFields map[string]interface{}, transaction *sqlx.Tx) (
    api2go.Responder, []actionresponse.ActionResponse, []error)

func NewActionWalletPerformer(initConfig *resource.CmsConfig,
    cruds map[string]*resource.DbResource) (actionresponse.ActionPerformerInterface, error)
```

Behavior, per `inFields["operation"]`:

1. **`create_wallet`** — `currency` must be a non-empty string; `amount` semantics: insert with balance 0. Bound insert:
   `INSERT INTO wallets (reference_id, balance, currency, status, user_account_id, permission) VALUES ($1,$2,$3,$4,$5,$6) RETURNING reference_id`
   with a fresh uuid reference id, balance `0`, status `ACTIVE`, owner = the session user (`inFields["sessionUser"]` reaches the EXECUTE performer via `handle_action.go:619`/`:359`; set `user_account_id` from its `UserId`), permission `9472` (matches `DefaultPermission` — set explicitly so the row does not depend on column defaults). Return `[]ActionResponse{resource.NewActionResponse("wallet.created", map[string]interface{}{"applied": true, "wallet_reference_id": <ref>, "balance": 0})}`.
2. **`debit` / `credit`** — `amount` must cast to `int64 > 0` in Go (this is where `"1; DROP TABLE ..."` and `"50' OR '1'='1"` die, before any SQL); `wallet_reference_id` must be a non-empty string.
   - `SELECT id, reference_id, balance FROM wallets WHERE reference_id = $1 FOR UPDATE` (bound; `Preparex`). Row missing → return an error (`wallet not found`) → action 500, rollback.
   - For debit with `balance < amount`: **return `api2go.NewHTTPError(errors.New("insufficient funds"), "insufficient_funds", 409)` and nothing else** — no writes; the error propagates as HTTP 409 (`handle_action.go:188-191`) and rolls the transaction back (`:133-134`).
   - Otherwise `UPDATE wallets SET balance = $1 WHERE id = $2` (bound), assert `RowsAffected() == 1` (lib/pq v1.10.9 implements it — `daptin/go.mod`), then bound insert:
     `INSERT INTO wallet_ledger (reference_id, wallet_id, type, amount, direction, reference_type, reference_id, reason, balance_before, balance_after, entry_at, user_account_id, permission) VALUES ($1,...,$13)`
     with a fresh uuid, `amount` always positive, `direction` = `OUT`/`IN`, `entry_at` = UTC now, permission `256`. Return
     `[]ActionResponse{resource.NewActionResponse("wallet.mutation", map[string]interface{}{"applied": true, "wallet_reference_id": ..., "operation": ..., "amount": ..., "balance_before": ..., "balance_after": ..., "ledger_reference_id": ...})}`.
3. Any SQL error → `[]error{err}` → whole-action rollback. **No caller value is ever interpolated into SQL text**; every value is a bind argument. Log the session user's reference id with each mutation (attribution until the audit-actor decision; the ledger itself carries no actor column in proof scope — §6).

### Step 4 — Register the performer: `daptin/server/action_provider/action_provider.go`

Immediately after the `$transaction` block (`:179-181`), following the file's pattern:

```go
walletActionPerformer, err := actions.NewActionWalletPerformer(initConfig, cruds)
resource.CheckErr(err, "Failed to create wallet action performer")
performers = append(performers, walletActionPerformer)
```

No other wiring: the loop at `:263-265` calls `resource.RegisterGlobalActionHandler(performer.Name(), performer)`, and `server.go:473-477` propagates the list.

### Step 5 — `daptin/server/resource/financial_guard.go` (new file) + three integration edits

New file containing:

```go
// FinancialWriteDeniedTables lists money tables whose writes go ONLY through
// the $wallet performer. Every new financial table adds an entry here, a
// trigger below, and its schema entry — in the same commit (docs/decisions/0006).
var FinancialWriteDeniedTables = map[string]bool{
    "wallets":       true,
    "wallet_ledger": true,
}

func FinancialWriteDenied(tableName string) bool { ... }

// InstallFinancialGuards applies the append-only / no-hard-delete triggers.
// Idempotent, runs every boot, survives a DB rebuild (docs/decisions/0003).
func InstallFinancialGuards(db *sqlx.DB) error {
    // CREATE OR REPLACE FUNCTION kientaohub_financial_reject() RETURNS trigger AS $$
    //   BEGIN RAISE EXCEPTION 'kientaohub: % on % is refused (append-only, docs/decisions/0006)', TG_OP, TG_TABLE_NAME; END;
    // $$ LANGUAGE plpgsql;
    // DROP TRIGGER IF EXISTS wallet_ledger_append_only ON wallet_ledger;
    // CREATE TRIGGER wallet_ledger_append_only BEFORE UPDATE OR DELETE OR TRUNCATE ON wallet_ledger
    //   FOR EACH STATEMENT EXECUTE FUNCTION kientaohub_financial_reject();
    // DROP TRIGGER IF EXISTS wallets_no_hard_delete ON wallets;
    // CREATE TRIGGER wallets_no_hard_delete BEFORE DELETE OR TRUNCATE ON wallets
    //   FOR EACH STATEMENT EXECUTE FUNCTION kientaohub_financial_reject();
}
```

Edits:

1. **`daptin/server/resource/middleware_tableaccess_permission.go`** — inside `InterceptBefore` (`:75`), **before** the `IsAdminWithTransaction` early return (`:88-90`): if `FinancialWriteDenied(dr.model.GetName())` and the request method is not `GET`/`HEAD` → log a `WARN` (method, table, user) and return the same 403 shape the file already uses (`api2go.NewHTTPError(..., pc.String(), 403)`, cf. `:104`). Keep the edit ≤10 lines (hot upstream file). GET stays permission-gated as today — the admin keeps ledger read for the console.
2. **`daptin/server/endpoint_init.go`** — inside `InitialiseServerResources`, immediately after `resource.CreateIndexes(initConfig, db)` (~`:35`; tables are created earlier in the same function by `CheckAllTableStatus` ~`:17`, so triggers find their tables even on first boot after a rebuild):
   ```go
   if err := resource.InstallFinancialGuards(db); err != nil {
       log.Fatalf("financial guards not installed: %v", err)   // fatal, NOT CheckErr — the trigger is the sole guard on the DeleteWithoutFilters path
   }
   ```
3. **`daptin/server/actions/action_import_data.go`** — in the `__data_import` performer, before the `TruncateTable` call (`:165`) and the `DirectInsert` call (`:185`): if `resource.FinancialWriteDenied(table_name)` → return an error (`financial table %s is write-protected`). This closes the one found in-app INSERT/TRUNCATE path that bypasses `InterceptBefore` and is executable by an administrator.

Plus one minimal test file `daptin/server/resource/financial_guard_test.go`: `FinancialWriteDenied` lookup truth-table, and that the trigger SQL statements mention `TRUNCATE` for both tables (guards against silent regression). Run `go vet ./...` and `go build ./...` before the image build.

### Step 6 — Build and deploy

```sh
cd /home/trung/Documents/2026/project/test-v6/daptin
go vet ./... && go build ./...
docker tag daptin-local:v0.13.9-patched daptin-local:v0.13.9-patched-pre-money   # preserve known-good (the build reuses the same TAG)
./build-local-image.sh
docker compose up -d --wait
```

Commit in `daptin/` as **one commit (#8)** `feat(money): $wallet performer, financial write denylist, boot-installed append-only guards` — exactly: `server/actions/action_wallet.go` (new), `server/resource/financial_guard.go` (new), `server/resource/financial_guard_test.go` (new), `server/action_provider/action_provider.go`, `server/resource/middleware_tableaccess_permission.go`, `server/endpoint_init.go`, `server/actions/action_import_data.go`. One commit because (a)/(b)/(c) are one decision set — splitting them leaves the performer without its enforcement. Commit the outer-repo changes (`schema/schema_wallet.yaml`, decisions 0006 + 0001 correction, plan update) separately.

---

## 4. Validation

Conventions: `BASE=http://127.0.0.1:6336`; psql via `docker compose exec -T postgres psql -U daptin -d daptin`; log slicing per `schema/README.md` — `docker compose logs` accumulates across restarts, so always slice from the last `Found files to load` line (commands below).

**0. Boot gate**
```sh
cd /home/trung/Documents/2026/project/test-v6/daptin
docker compose logs --no-color daptin | sed -E 's/\x1b\[[0-9;]*m//g' | grep 'Found files to load' | tail -1
#   assert: contains schema_wallet.yaml (and schema_catalog.yaml)
docker compose logs --no-color daptin | sed -E 's/\x1b\[[0-9;]*m//g' \
  | awk '/Found files to load/{n=NR} {l[NR]=$0} END{for(i=n;i<=NR;i++) if (l[i] ~ /ERRO|WARN/) print l[i]}'
#   assert: no output (zero ERRO/WARN in the current boot)
docker compose exec -T postgres psql -U daptin -d daptin -tAc \
  "SELECT tgname FROM pg_trigger WHERE tgrelid='wallet_ledger'::regclass AND NOT tgisinternal;"
#   assert: wallet_ledger_append_only — installed by THIS boot
curl -fsS http://127.0.0.1:6336/ping   # assert: pong
```

**1. Sessions.** Administrator: `docs/RUNBOOK.md:29-30` records the live admin email `eszxcvfd@gmail.com` and that **no password is in the repository** — the executor obtains it from the owner; fallback is the documented destructive reset + provisioning (`docs/RUNBOOK.md:91-113`: signup → signin → `POST /action/world/become_an_administrator`, accepted only while the `administrators` group is empty). Mark the admin-denial results "measured" only after this succeeds.
```sh
ADMIN_TOKEN=$(curl -sS -X POST "$BASE/action/user_account/signin" -H 'Content-Type: application/json' \
  -d '{"attributes":{"email":"eszxcvfd@gmail.com","password":"<PASSWORD>"}}' \
  | python3 -c 'import json,sys;print(next(a["Attributes"]["value"] for a in json.load(sys.stdin) if a.get("ResponseType")=="client.store.set"))')
#   assert: non-empty JWT
curl -sS -X POST "$BASE/action/user_account/signup" -H 'Content-Type: application/json' \
  -d '{"attributes":{"email":"wallet-test@example.com","name":"wallet-test","password":"<PW>","passwordConfirm":"<PW>"}}'
USER_TOKEN=$(curl -sS -X POST "$BASE/action/user_account/signin" -H 'Content-Type: application/json' \
  -d '{"attributes":{"email":"wallet-test@example.com","password":"<PW>"}}' \
  | python3 -c 'import json,sys;print(next(a["Attributes"]["value"] for a in json.load(sys.stdin) if a.get("ResponseType")=="client.store.set"))')
```

**2. Wallet creation and debit success** (`wallet_create` is the decided creation mechanism — no other write path exists):
```sh
WALLET_REF=$(curl -sS -X POST "$BASE/action/wallets/wallet_create" -H 'Content-Type: application/json' \
  -d '{"attributes":{"currency":"VND"}}' \
  | python3 -c 'import json,sys;print(next(a["Attributes"]["wallet_reference_id"] for a in json.load(sys.stdin) if a.get("ResponseType")=="wallet.created"))')
#   assert: a uuid string
curl -sS -X POST "$BASE/action/wallets/wallet_debit" -H 'Content-Type: application/json' \
  -d "{\"attributes\":{\"wallets_id\":\"$WALLET_REF\",\"amount\":50,\"reference_type\":\"proof\",\"reference_id\":\"proof-1\"}}"
#   assert: HTTP 200; body contains ResponseType "wallet.mutation" with applied=true,
#           balance_before=0, balance_after=0 (credit-first) or per direction, ledger_reference_id present
docker compose exec -T postgres psql -U daptin -d daptin -tAc \
  "SELECT balance FROM wallets WHERE reference_id='$WALLET_REF'; SELECT count(*) FROM wallet_ledger;"
#   assert: balance reflects the movement; exactly the expected ledger rows with consistent before/after
```
(Request shape note: `wallets_id` names the subject for `InstanceOptional: false` actions — `handle_action.go:262-278`, required-or-400 at `:306-308`.)

**3. Insufficient funds is DISTINGUISHABLE at the caller:**
```sh
curl -sS -o /dev/null -w '%{http_code}\n' -X POST "$BASE/action/wallets/wallet_debit" -H 'Content-Type: application/json' \
  -d "{\"attributes\":{\"wallets_id\":\"$WALLET_REF\",\"amount\":999999}}"
#   assert: HTTP 409 (not 200, not 500); response body mentions insufficient_funds
docker compose exec -T postgres psql -U daptin -d daptin -tAc "SELECT count(*) FROM wallet_ledger;"
#   assert: unchanged — a refusal writes nothing
```

**4. Forced-failure rollback** (debit succeeds, then the probe's second outcome errors on a nonexistent table):
```sh
curl -sS -o /dev/null -w '%{http_code}\n' -X POST "$BASE/action/wallets/wallet_rollback_probe" -H 'Content-Type: application/json' \
  -d "{\"attributes\":{\"wallets_id\":\"$WALLET_REF\",\"amount\":10}}"
#   assert: 4xx/5xx; and BOTH unchanged afterwards:
docker compose exec -T postgres psql -U daptin -d daptin -tAc \
  "SELECT balance FROM wallets WHERE reference_id='$WALLET_REF'; SELECT count(*) FROM wallet_ledger;"
```
(Do **not** use `amount: 0` as the failure trigger — the `required,gt=0` validation rejects it with 400 before the performer runs; keep that as its own check: `amount 0 → HTTP 400`.)

**5. Direct-write matrix — every financial table × POST/PATCH/DELETE × anonymous / signed-in non-admin / administrator (18 requests, all 403):**
```sh
for T in wallets wallet_ledger; do for M in POST PATCH DELETE; do
  BODY="-H 'Content-Type: application/vnd.api+json' -d '{\"data\":{\"type\":\"$T\",\"attributes\":{\"balance\":1}}}'"
  echo "$T $M anon  $(curl -sS -o /dev/null -w '%{http_code}' -X $M $BASE/api/$T)"
  echo "$T $M user  $(curl -sS -o /dev/null -w '%{http_code}' -X $M $BASE/api/$T -H "Authorization: Bearer $USER_TOKEN" $BODY)"
  echo "$T $M admin $(curl -sS -o /dev/null -w '%{http_code}' -X $M $BASE/api/$T -H "Authorization: Bearer $ADMIN_TOKEN" $BODY)"
done; done
#   assert: every line 403 — including the three administrator rows (the previously unproven case).
#   A 404 on an admin PATCH/DELETE would mean the denylist is not ahead of the admin
#   short-circuit: fail. Bodies are valid JSON so denials come from the middleware, not the parser.
# Relationships endpoints are covered by the same middleware:
echo "rel admin $(curl -sS -o /dev/null -w '%{http_code}' -X POST $BASE/api/wallets/$WALLET_REF/relationships/user_account_id -H "Authorization: Bearer $ADMIN_TOKEN" -H 'Content-Type: application/vnd.api+json' -d '{"data":{}}')"
#   assert: 403
```
Read-side regression: `GET /api/wallets` anonymous → 200 with empty `data` (row bits hide rows); `GET /api/wallet_ledger` as admin → 200 (console read preserved).

**6. Ledger UPDATE/DELETE refused — three layers:**
```sh
LEDGER_REF=$(docker compose exec -T postgres psql -U daptin -d daptin -tAc "SELECT reference_id FROM wallet_ledger LIMIT 1")
curl -sS -o /dev/null -w '%{http_code}\n' -X PATCH "$BASE/api/wallet_ledger/$LEDGER_REF" \
  -H "Authorization: Bearer $ADMIN_TOKEN" -H 'Content-Type: application/vnd.api+json' \
  -d '{"data":{"type":"wallet_ledger","id":"'$LEDGER_REF'","attributes":{"amount":1}}}'          # assert 403
curl -sS -o /dev/null -w '%{http_code}\n' -X DELETE "$BASE/api/wallet_ledger/$LEDGER_REF" -H "Authorization: Bearer $ADMIN_TOKEN"   # assert 403
docker compose exec -T postgres psql -U daptin -d daptin -c "UPDATE wallet_ledger SET amount = amount + 1;"
docker compose exec -T postgres psql -U daptin -d daptin -c "DELETE FROM wallet_ledger;"
docker compose exec -T postgres psql -U daptin -d daptin -c "DELETE FROM wallets;"
#   each: ERROR: kientaohub: UPDATE/DELETE on wallet_ledger/wallets is refused (append-only, docs/decisions/0006)
#   positive proof: step 2's ledger INSERT succeeded — triggers block UPDATE/DELETE/TRUNCATE, never INSERT
```

**7. The `__data_import` bypass is closed** (administrator-executable in-app write path, `action_import_data.go:165,:185`):
```sh
curl -sS -o /dev/null -w '%{http_code}\n' -X POST "$BASE/action/world/__data_import" \
  -H "Authorization: Bearer $ADMIN_TOKEN" -H 'Content-Type: application/json' \
  -d '{"attributes":{"table_name":"wallet_ledger"}}'
#   assert: non-2xx (performer refuses the financial table); wallet_ledger row count unchanged
```

**8. SQL-injection resistance of the performer path:**
```sh
curl -sS -o /dev/null -w '%{http_code}\n' -X POST "$BASE/action/wallets/wallet_debit" -H 'Content-Type: application/json' \
  -d "{\"attributes\":{\"wallets_id\":\"$WALLET_REF\",\"amount\":\"50' OR '1'='1\",\"reference_type\":\"x'--\",\"reason\":\"O''Brien; --\"}}"
#   assert: 400 (Go int64 cast / validation rejects before SQL) — no 500-with-partial-effect
docker compose exec -T postgres psql -U daptin -d daptin -tAc "SELECT count(*) FROM wallet_ledger; SELECT balance FROM wallets WHERE reference_id='$WALLET_REF';"
#   assert: both unchanged; \dt still lists wallet_ledger (the DROP TABLE payload had no effect)
```

**9. Regression:** `GET /ping` → 200; `GET /api/products` → 200; `docker compose ps` both healthy; non-financial actions still work (e.g. signin again → 200).

Record every observed output in `docs/plans/active/kientaohub-phase-0.md` (Progress checkboxes, Decisions log dated, Validation with observed output) — that file is the repository's completion gate.

---

## 5. Rollback and recovery

| Scope | Command | Resulting state |
|---|---|---|
| Schema + actions | delete `schema/schema_wallet.yaml` → `cd daptin && docker compose restart daptin` | money actions stop resolving; tables/triggers/rows remain in the DB as inert evidence (harmless; triggers keep enforcing) |
| Go change #8, keep history | `cd daptin && git revert <commit8> && ./build-local-image.sh && docker compose up -d --wait` | binary without `$wallet`, denylist, trigger installer, import guard; DB triggers persist until rebuild (remove via rebuild if (c) must also go) |
| Image, no git surgery | restore the preserved tag: set `DAPTIN_IMAGE=daptin-local:v0.13.9-patched-pre-money` in `daptin/.env` → `docker compose up -d --wait` | returns to the pre-money binary (tag preserved in Step 6 because the build reuses `TAG=v0.13.9-patched` and would otherwise overwrite it) |
| Full reset (destructive) | `cd daptin && docker compose down && docker volume rm daptin_postgres-data daptin_daptin-data && docker compose up -d --wait` (docs/RUNBOOK.md) | empty DB; all proof tables/rows/triggers gone; admin re-provisioned per `docs/RUNBOOK.md:91-113`; financial guards re-installed automatically at boot by design (c) |
| Verified baseline after rollback | `curl -fsS $BASE/ping` → 200; `curl -fsS -o /dev/null -w '%{http_code}\n' $BASE/api/products` → 200; both containers healthy | the exact state verified at plan time |

---

## 6. Residual risks and limits (named, honest)

1. **Host/superuser psql.** Anyone with `docker compose exec postgres psql` can `UPDATE wallets` (no UPDATE trigger by design — the performer needs it), forge ledger **INSERTs** (triggers block UPDATE/DELETE/TRUNCATE only), and `DROP TRIGGER` (between boots undetectable; re-installed at next boot). Host access is already administrator-equivalent; mitigation is operational (credential custody), out of scope.
2. **Future/builtin performers that write arbitrary tables.** `__data_import` is closed in this plan; any other current or future performer issuing raw SQL against money tables bypasses both app layers except the triggers. Rule (recorded in decision 0006): every new money table gets schema + `FinancialWriteDeniedTables` + trigger entries in the same commit; a new arbitrary-table write performer requires a denylist check — review-blocking if missed.
3. **Coarse Execute gate.** `Permission: 33` + action `Permission: 32` lets any caller invoke `wallet_debit` on a wallet whose `reference_id` they know. Row-ownership/entitlement shaping of wallets is product policy — deferred to the P0 scope-lock package, not silently changed here.
4. **No actor column in `wallet_ledger`** (proof scope). §42.6 holds structurally — no principal, admin included, can change a balance outside the `$wallet` performer, and every movement is a ledger row — but "who triggered" is in server logs only until the audit-actor decision.
5. **Idempotency is a hook, not yet a constraint.** `reference_type`/`reference_id` on the ledger are the BR-02 idempotency hooks; the unique constraint lands on `payment_transactions` in the next package. Double-debit with the same reference is **not** prevented here.
6. **Assumptions to measure during execution** (each has a falsifying assertion in §4): system columns on the new tables (`reference_id`, `user_account_id`, `permission`) — verify with `\d wallets` after first boot; `Validations:` YAML loading from a schema-file `Actions:` block; `endpoint_init.go` hook line numbers (`~:10/:17/:35`); administrator credential availability (RUNBOOK:29-30 — password outside the repo); `api2go.NewHTTPError` 409 propagation (`handle_action.go:188-191` — code-verified, HTTP-unverified until §4 step 3).
7. **Patch cost.** Commit #8 touches a hot upstream file (`middleware_tableaccess_permission.go`) — the denylist edit is ≤10 lines to minimize rebase conflict; decision 0001's stale count is corrected as part of this package.

---

## 7. Interfaces the next package consumes (P0 scope / state machine / payment provider)

- **Actions (only write surface for money):** `POST /action/wallets/wallet_create` `{currency}`; `POST /action/wallets/wallet_debit` and `wallet_credit` with `{"attributes":{"wallets_id":"<wallet ref>","amount":<positive int>,"reference_type":...,"reference_id":...}}`. The purchase flow (FR-14) is a wrapper action: `$wallet debit` EXECUTE outcome → CRUD outcomes for `orders`/`order_items`/`entitlements` (allowed — they are non-financial tables) — all inside the wrapper's single transaction. Later outcomes branch with `Condition: "{{ debit.status }}"`-style JS **or** simply rely on the abort semantics: a 409 refusal aborts remaining outcomes and rolls everything back.
- **Response/error taxonomy (stable contract):** `200` + `ResponseType: "wallet.created"|"wallet.mutation"` with `{applied, wallet_reference_id, operation, amount, balance_before, balance_after, ledger_reference_id}` = money moved; `409` + `insufficient_funds` = refused, nothing moved; `400` validation; `403` denylist/permission; `5xx` = internal error, rolled back. Callers must not parse log lines to learn outcomes.
- **Tables:** `wallets` (system columns + `currency`, `balance bigint`, `status`), `wallet_ledger` (`wallet_id` FK, `type`, `amount bigint` always positive, `direction IN|OUT`, `reference_type`, `reference_id`, `reason`, `balance_before`, `balance_after`, `entry_at`) — `payment_intents` and `payment_transactions` (§11.1/§11.2) are declared by the next package, each with the decision-0002 authorization block, a `FinancialWriteDeniedTables` entry, and a trigger entry, in one commit.
- **Invariants the next package must not break:** exactly one financial write path (`$wallet`); every balance change paired with a ledger row (§42.3); ledger corrections are reversal entries (BR-03 — INSERT a new row, never UPDATE); BR-02 idempotency implemented as a unique constraint on `payment_transactions (provider, provider_transaction_id)` consumed from `reference_type`/`reference_id` hooks; money integer, UTC (§33); no `Permission: 0` (ADR 0002).

---

**Summary of what this package delivers:** one write layer (`$wallet` performer — closes measured GAPs 1 and 2), one admin-bypass closure (middleware denylist before the admin short-circuit + `__data_import` guard, trigger backstop for `DeleteWithoutFilters`), one append-only mechanism (boot-installed, fatal-on-failure PostgreSQL triggers, rebuild-proof per ADR 0003), executable validation for all six graded proofs, a rollback that returns the instance to the verified baseline, and the typed interfaces (action names, request/response contract, error taxonomy, table shapes) that the P0-scope / state-machine / payment-provider package will consume without re-deciding.