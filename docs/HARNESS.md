# Harness

Product principles and the installed-core model for this repository.

## Installed Core

| Item | Value |
|---|---|
| Core version | `0.1.10` (`.harness-core/manifest.json`) |
| Binary | `scripts/bin/harness` (Rust, linux-x64), git-ignored |
| Base copy | `.harness-core/base/` — untouched install source for three-way merges |
| Managed files | 26 paths listed in `.harness-core/manifest.json` |
| Install date | 2026-09-14 |

Install command used:

```sh
curl -fsSL "https://raw.githubusercontent.com/hoangnb24/repository-harness/main/scripts/install-harness.sh" | bash -s -- --yes
```

## Model

- **Copy-on-install.** Harness writes its core into this repository; the source
  repository is only read to fetch files. `docs/README.md` and `docs/WORKFLOW.md`
  are Harness-managed.
- **Consumer-owned truth.** `README`, `docs/ARCHITECTURE.md`, `docs/product/`,
  `docs/RUNBOOK.md`, decisions, plans, code, tests, and runtime signals stay
  authoritative. An update never overwrites consumer truth; conflicts are
  analyzed three-way against `.harness-core/base/`.
- **No control plane.** No task database or orchestration lifecycle. Work memory
  is the repository: `docs/plans/active/` while in flight,
  `docs/plans/completed/` after validation.
- **Managed paths are safe to edit.** Editing a managed file marks it
  `modified` in `harness status`; the updater preserves the local change and
  reports a conflict only for overlapping edits. `docs/decisions/README.md` is
  intended to be extended with local decision indexes.

## Commands

```sh
./scripts/bin/harness status   # installed vs target version, modifications, drift
./scripts/bin/harness doctor    # provenance, path safety, merge support, transactions
./scripts/bin/harness update    # preview/apply a three-way core update
./scripts/bin/harness install --help
```

Observed on 2026-09-14:

- `status` → `Harness core: current (installed=0.1.10, target=0.1.10, modified=0, missing=0)`
- `doctor` → all `pass` (transaction, update resolution, three-way merge support, provenance, every managed path)

## Skills Installed

| Skill | Use |
|---|---|
| `onboard-repository` | derive a repository's docs and validation from evidence |
| `encode-invariant` | turn accepted rules into mechanical validation |
| `improve-harness` | explicit-only; change harness guidance after a baseline/rerun |
| `audit-onboarding-proposal` | validate an onboarding evidence capsule |

The `engineering-wisdom` advisory skill was **not** installed (explicit opt-in,
`--with-engineering-wisdom`).

## Evidence

- `./scripts/bin/harness status`, `./scripts/bin/harness doctor`
- `.harness-core/manifest.json`, `.harness-core/base/`
- `.gitignore` (Harness binary rules only)
- `.agents/skills/*/SKILL.md`
