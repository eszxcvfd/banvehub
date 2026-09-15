# Harness

Product principles and the installed-core model for this repository.

Provenance: restored from `470bf41:docs/HARNESS.md` on 2026-09-15 and refreshed
against the reinstall performed that day.

## Installed Core

| Item | Value |
|---|---|
| Core version | `0.1.10` (`.harness-core/manifest.json`) |
| Binary | `scripts/bin/harness` (linux-x64), git-ignored |
| Base copy | `.harness-core/base/` — untouched install source for three-way merges |
| Managed paths | 26 paths listed in `.harness-core/manifest.json` |
| Install date | 2026-09-15 |

Install command used:

```sh
curl -fsSL "https://raw.githubusercontent.com/hoangnb24/repository-harness/main/scripts/install-harness.sh" | bash -s -- --yes
```

## Model

- **Copy-on-install.** Harness writes its core into this repository; the source
  repository is only read to fetch files. `AGENTS.md`, `docs/README.md`,
  `docs/WORKFLOW.md`, `docs/patterns/`, `docs/templates/`, `docs/plans/*/README.md`,
  `docs/product/README.md`, `docs/decisions/README.md`, and `.agents/skills/` are
  harness-managed.
- **Consumer-owned truth.** `PLAN.md`, `docs/ARCHITECTURE.md`, `docs/product/`
  documents other than the managed README, `docs/decisions/0001` onward,
  `docs/plans/active/`, `web/`, and runtime signals stay authoritative. An update
  never overwrites consumer truth; conflicts are analyzed three-way against
  `.harness-core/base/`.
- **No control plane.** No task database or orchestration lifecycle. Work memory
  is the repository: `docs/plans/active/` while in flight,
  `docs/plans/completed/` after validation.
- **Managed paths are safe to edit.** Editing a managed file marks it
  `modified` in `harness status`; the updater preserves the local change and
  reports a conflict only for overlapping edits. `docs/decisions/README.md` and
  `docs/plans/README.md` are intended to be extended with local indexes.

## Commands

```sh
./scripts/bin/harness status   # installed vs target version, modifications, drift
./scripts/bin/harness doctor   # provenance, path safety, merge support, transactions
./scripts/bin/harness update   # preview/apply a three-way core update
./scripts/bin/harness install --help
```

Observed on 2026-09-15:

- `status` → `Harness core: current (installed=0.1.10, target=0.1.10, modified=2, missing=0)`.
  The two modified paths are the decision and plan indexes extended locally.
- `doctor` → `pass` for transaction, update resolution, three-way merge support,
  provenance, and every managed path.

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

- `./scripts/bin/harness status`, `./scripts/bin/harness doctor` (2026-09-15)
- `.harness-core/manifest.json`, `.harness-core/base/`
- `.gitignore` (Harness binary rules only)
- `.agents/skills/*/SKILL.md`
