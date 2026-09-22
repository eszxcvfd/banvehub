# 0020 The Invented Spec Versions Were Purged, with a Committed Rollback

Date: 2026-09-21

## Status

Accepted

## Context

Decision 0018 stopped the seller path inventing specification values, but the rows already stored stayed
in place, reported rather than purged: **161 of 165** products carry a `technical_specs_software_version`
of the shape `'<Software> 2022+'` — `AutoCAD 2022+` 74, `Revit 2022+` 40, `SketchUp 2022+` 27,
`3ds Max 2022+` 17, `PDF / Vector 2022+` 2, `Lumion 2022+` 1 (plus 4 nulls). The evidence that these are
platform-authored rather than seller-authored:

- The generator is **in the tree**: `web/scripts/seed-realistic.mts:2138` writes
  ``softwareVersion: `${sw.title} 2022+` `` for every product it seeds, where `sw` is that product's own
  `software_types` relation.
- Measured before the purge: **161 of 161** stored values equal `software_types.title || ' 2022+'`, over
  161 distinct products — `select count(*) from products p join products_rels pr on pr.parent_id = p.id
  and pr.path = 'software_types' join software_types st on st.id = pr.software_types_id where
  p.technical_specs_software_version = st.title || ' 2022+'` → `161|161|161` (corroborated | matched |
  distinct products). The fabrication is therefore provable per row from that row's own relation, not
  inferred from the shape of the string.
- The seller form's old default (`useState('AutoCAD 2022+')`, removed in `359e515`) taught the same
  value independently, which is why `AutoCAD 2022+` is the largest variant; that defect was already
  closed by decision 0018 and is not what put 161 rows in the database.

Correction (pre-flight measurement, 2026-09-21, before this record was committed): the first draft of
this Context said the five non-`AutoCAD` variants "appear **nowhere** in the repository". They do. The
previous increment's scope carve-out for `web/scripts/**` kept the seed out of its audit, so the audit
reported a generator that "is not part of the tree" when a single grep of the script settles it. Nothing
in the Decision below changes — the purge is now provable per row rather than inferred from a pattern —
and clause 6 fixes the generator line in the same change, so re-seeding cannot restore what clause 1
removes.

So the storefront displays, on 161 product pages, a **compatibility claim the platform made up**. Since
decision 0018 clause 2 says a displayed attribute comes from the record or is not shown, the remaining
defect is the stored value itself, not its rendering.

## Decision

1. **Purge.** A phase-15 migration sets `technical_specs_software_version` to `NULL` for every row
   matching the invented pattern (`~ ' 2022\+$'`), behind a guard that refuses to run when the affected
   count is neither the **161** this record documents nor **0** (a database that never held them, such
   as the test database), plus a post-condition that raises if any matching row survives — so a
   surprise is a loud failure rather than a silent edit.
2. **The purge is reversible by design, not by hope.** The 161 `(id, value)` pairs are exported to a
   committed snapshot (`web/src/migrations/data/phase15-invented-spec-versions.tsv`) and the migration
   header carries the exact restore statement, so "cannot be undone" is false. The earlier claim that a
   purge is irreversible was the reason this was deferred; committing the snapshot removes it.
3. **Only the invented field is purged.** `technical_specs_file_format` and `technical_specs_file_size`
   were measured from the real uploaded file at upload time (`ProductEditorModal.tsx:127-136`) and stay
   untouched; `unit` keeps the schema's own `metric` default, which is a declared default rather than a
   claim about a particular product.
4. **No archive column and no legacy table.** Preserving the values in the schema would add permanent
   fields that nothing renders; the snapshot file is the archive — of the `products` rows. It is not the
   only copy that exists: Payload's versions table (`_products_v`) keeps its own document snapshots and
   still holds **162 rows matching the invented pattern** over the same 161 products (measured by t53's
   review on this increment's revision). They render nowhere and this decision does not authorise
   rewriting version history, but an admin "restore version" would write the invented value back into
   `products`, where it would render — a future increment that wants the version history clean makes that
   choice explicitly.
5. **Sellers re-declare whatever they want.** The form writes an empty string when the field is blank
   (decision 0018 clause 1), so a version appears on a product only when a seller types one — and the
   product page then renders the record's own value.
6. **The generator is fixed in the same change.** `web/scripts/seed-realistic.mts` stops composing the
   invented suffix, so re-seeding a database cannot restore what clause 1 removes. That file carries
   another workstream's uncommitted hunks at the time of writing; **only this one line is staged**, and
   the file's other changes stay in the working tree untouched.

## Alternatives Considered

1. **Keep the values.** Rejected: 161 live pages would keep stating a specification no seller supplied,
   which is precisely what this increment exists to stop; "the write path is fixed now" answers how the
   data arrived, not whether it may be displayed.
2. **Purge only the 74 exact form literals.** Rejected as arbitrary: all six variants come from the same
   generator line and every one of the 161 is reproducible from its own `software_types` relation, so
   treating the other five as seller-authored would be a guess in the opposite direction.
3. **Copy the old values into a new hidden field before nulling.** Rejected: schema noise that will
   outlive the demo data, and a field that renders nowhere is still a field every future reader must
   reason about.
4. **Leave the decision to the owner.** This was the earlier position; with full authority granted on
   2026-09-21 and a committed rollback available, deferring would leave a known fabrication on 161
   pages for no benefit.

## Consequences

Positive:

- No product page states a software version the platform invented. A product with no seller-declared
  version shows the honest absence, exactly as decision 0018 requires.
- The purge is auditable and reversible: the snapshot plus the restore statement reproduce the previous
  state mechanically, so the decision can be revisited without data loss.

Tradeoffs:

- 161 demo products lose a compatibility line buyers may have found useful, until a seller declares a
  version. That information was never verified in the first place.
- The migration is the first in this repository whose `down` cannot restore data by itself: the
  snapshot's ids are **this database's** ids, so a generic restore statement cannot be honest in
  another one. Its `down` is therefore a documented no-op and the header carries the restore statement
  that fits this database. A future data-fix migration must follow the same pattern: guard, snapshot,
  restore statement.

## Verification

1. Before: `select count(*) from products where technical_specs_software_version ~ ' 2022\+$'` → **161**.
2. The snapshot file contains exactly 161 rows, and every `(id, value)` pair in it matches a row that
   the migration nulled (checked by the probe, not by eye).
3. After: the count is **0**, `select technical_specs_software_version from products` shows only nulls,
   and the product page for an affected product renders no version row (or the honest absence).
4. The restore statement, run against a scratch clone that still holds the pre-purge values, reproduces
   all 161 values exactly.
5. The generator is gone: `grep -n "softwareVersion" web/scripts/seed-realistic.mts` → **0**, and a seed
   run against a scratch database produces **0** rows matching `~ ' 2022\+$'` (the un-fixed generator
   produces 161 of 165 — that baseline is in the plan).
