# 0002 Declare Business-Table Authorization Explicitly

Date: 2026-09-14

## Status

Accepted

## Context

Daptin's default table permission is not a denial. A business table declared in
a schema file without `AccessGroups` was observed to accept an anonymous
`POST`:

```
POST /api/products (no token) -> 201
DELETE /api/products/<id> (no token) -> 200
```

Built-in tables such as `usergroup` refuse anonymous writes with 403, so the
permissive default applies specifically to tables added through schema files —
which is exactly where this repository's own entities will be added.

Daptin documents two tested shapes for signed-in applications
(`wiki/Authorization-Scenario-Private-Site.md`,
`wiki/Authorization-Scenario-Semi-Private-Owner-Rows.md`) and warns that
`Permission: 0` is treated as "unset" during schema sync.

## Decision

Every business table declares `AccessGroups` and a non-zero `Permission`
explicitly. The starting pattern is the repository's Private-Site shape:

```yaml
Permission: 16384          # table gate; anonymous callers get 403
DefaultPermission: 1       # rows without a group relation
AccessGroups:
  - Name: users
    Permission: 114688     # GroupPeek + GroupRead + GroupCreate
DefaultGroups:
  - Name: users
    Permission: 49152      # GroupPeek + GroupRead for new rows
```

Any departure (owner-only rows, guest-readable public rows, administrator-only
writes) is a product choice that must be stated by the repository owner before
the schema is changed.

## Alternatives Considered

1. **Rely on daptin's default.** Rejected: it grants anonymous write access to
   tables this repository adds.
2. **Owner-only rows** (`Semi-Private-Owner-Rows`: drop `DefaultGroups`, set
   `DefaultPermission: 256`). Viable and safer per-user isolation, but it was
   not selected because the intended audience and write permissions are not yet
   stated.
3. **Restrict to administrators only.** Rejected for the starting table because
   signed-in, non-administrator use is expected once `web/` exists.

## Consequences

Positive:

- Anonymous read and write on business tables return 403 (verified).
- New rows are readable by signed-in users of the `users` group.
- The pattern is copy-pasteable for every table added later, with the reason
  recorded next to the values.

Tradeoffs:

- `DefaultGroups` creates a row-group relation, so deletion depends on the
  join-table cascade patch from `0001-run-locally-patched-daptin-image.md`.
  Without that patch such rows cannot be deleted.
- Permission numbers are bitmasks; changing them requires reading
  `daptin/wiki/Permissions.md` and the tested scenario files rather than
  guessing.
- Every new table carries a deliberate block of authorization settings.

## Follow-Up

- Confirm with the repository owner whether business rows should be shared among
  signed-in users or owned per user, then narrow or keep `DefaultGroups`.
- Decide whether guests may read any business table once the frontend's public
  surface is defined.
- Add a schema lint (a check that every `Tables:` entry has `AccessGroups`) once
  more than one business table exists.
