# 0018 A Product Attribute Comes From the Record, or Is Not Shown

Date: 2026-09-21

## Status

Accepted

## Context

The owner asked on 2026-09-21 whether the invented product attributes the storefront used to display
("Số lượng bản vẽ", "Tương thích Windows", the package checklist) should become real seller-filled
fields. Three of those displays were inventoried as **D26/D27/D28** and removed in the increment
delivered as commit `7cd3397`. What measurement on the settled tree found afterwards:

**Write side — the form invents values that are then stored as if the seller supplied them.**

- `web/src/app/(app)/seller/ProductEditorModal.tsx:189` — `softwareVersion: values.softwareVersion ||
  'AutoCAD 2022+'`; `:267` — `initialValues.softwareVersion = 'AutoCAD 2022+'`;
  `web/src/app/(app)/seller/products/new/ProductEditorForm.tsx:29` —
  `useState('AutoCAD 2022+')`. A seller who never touches the field writes the literal into
  `products.technical_specs_software_version`.
- Stored distribution measured 2026-09-21 (`select technical_specs_software_version, count(*) from
  products group by 1`): `AutoCAD 2022+` **74**, `Revit 2022+` **40**, `SketchUp 2022+` **27**,
  `3ds Max 2022+` **17**, `PDF / Vector 2022+` **2**, `Lumion 2022+` **1**, null **4** — 161 of 165
  rows carry a `'<Software> 2022+'` string. The `AutoCAD 2022+` rows are the exact literal the two
  forms default to; the other five variants are consistent with a seed outside this repository (the
  string does not appear anywhere in `web/` outside `src/`, built chunks and the archived team
  record), so their provenance cannot be established from the repo and is **not** claimed here.
- `fileFormat` and `fileSize` are different in kind: the upload path detects them from the real file
  (`ProductEditorModal.tsx:127-136`, `.dwg` 74 / `.rvt` 40 / `.skp` 27 / `.max` 17 / `.pdf` 2 / `.ls`
  1 / null 4; file sizes are distinct real values). Detection is evidence; `'AutoCAD 2022+'` is not.
- The API route is honest (`web/src/app/api/seller/products/route.ts:59-62` writes
  `softwareVersion || ''`), so the fabrication is confined to the two client forms.

**Display side — dead code that still carries the fabrication.**

- `web/src/components/product/TechnicalSpecsTable.tsx` renders six invented fallbacks:
  `:86` `'Tệp kỹ thuật chuẩn'`, `:98` `'Tương thích mọi phiên bản'`, `:108` `'Đang cập nhật'`, `:119`
  `unitMap.metric` for an empty `unit`, plus `'Đa nền tảng CAD/BIM'` and `'Hồ sơ kỹ thuật tổng hợp'`.
  The component is **not rendered anywhere in the app** (`grep -rn TechnicalSpecsTable web/src` →
  only its own definition), but `web/tests/challenger/product-detail.spec.tsx:188-200` **asserts all
  six fallbacks**, so the fabrication is currently protected by a passing test.
- `web/src/components/product/ProductDetailTabs.tsx:183-231` renders a five-row "
  Danh mục bản vẽ & Tệp đính kèm" checklist (drawing names, `.rvt/.dwg/.rfa` formats, "Thư viện Revit
  Family độc quyền đi kèm") for every product, inside a modal with **no reachable opener**:
  `setIsFileListModalOpen(true)` appears nowhere in `web/src`, and the `WindowsOutlined` import is
  unused.
- The remaining live specs surfaces (`ProductDetailTabs`'s `productInfoItems`, `ProductDescription`)
  already follow the honest pattern — D33 recorded that half of the page as REAL.

## Decision

1. **No invented attribute on write.** A seller form writes a spec value only when the seller supplied
   it or when it was measured from the uploaded file. A placeholder example belongs in the input's
   `placeholder`, never in `initialValues` or in a `||` fallback, because a form default becomes
   catalog data.
2. **No invented attribute on display.** An attribute row renders only from the product's record; when
   the record has no value the row is **omitted**. No plausible default may stand in for a missing
   value, and no unit, compatibility or capacity may be inferred.
3. **The unreachable package checklist is deleted, not repaired.** Private originals
   (`products.originalFiles`, BR-06) must not be enumerated before purchase, and the public previews a
   buyer may see are the gallery's job. A future "what is in the package" block needs a
   seller-authored field and its own decision.
4. **No new seller fields in this increment.** The attributes that were removed have no seller
   meaning to store: a drawing count has no column and no unit of record, and "compatibility" is
   already the `software_types` relation (`ProductEditorModal` writes it from a real select). Adding
   fields that no surface renders is the mirror image of the defect this decision closes; a new
   attribute is added when a named seller input and a rendered surface arrive together.
5. **The 161 provenance-suspect stored values are reported, not purged.** They are now ordinary
   record values, and deleting them is destructive and irreversible; the plan carries the exact SQL
   and the counts, and the purge is the owner's call.

## Alternatives Considered

1. **Add `drawingCount`, `windowsCompatible`, `packageContents` fields and let sellers fill them.**
   Rejected for now: nothing measures or validates them, the removed displays had no unit or taxonomy
   behind them, and the storefront already answers these questions with real data (the file list, the
   format, the software relation).
2. **Keep the fallbacks but mark them as defaults.** Rejected: a row that renders a value no record
   holds is the same lie whether or not it is labelled, and labelling was never rendered.
3. **Delete `TechnicalSpecsTable.tsx` outright instead of making it honest.** Rejected: it has a real
   test suite and the product page has a specs section a future increment may use; honest behaviour
   costs less than removing coverage, and the class clause is "no fabricated literal", not "no unused
   component".
4. **Null out all `'% 2022+'` spec rows in a migration.** Rejected for this increment: it destroys 161
   values whose provenance for five of the six variants cannot be established from the repository, and
   data loss with a difficult recovery is a decision the owner must take explicitly.

## Consequences

Positive:

- A new product can no longer be born with a specification the seller never typed.
- The two fabricated display paths are gone, and the test that protected the fallbacks is rewritten to
  assert the honest contract (omit when absent), so the fabrication cannot return through a green
  suite.

Tradeoffs:

- A seller who leaves the specs blank now gets an empty spec section instead of a plausible-looking
  one. That is the intended trade: an empty section is honest, and the seller editor shows the field
  with an example placeholder.
- The 161 stored rows keep their questionable values until the owner decides; the storefront displays
  them as the record's data, which it now is.

## Verification

1. Write side: create a product through the seller editor without touching `softwareVersion`, then
   read `products.technical_specs_software_version` from Postgres — it must be NULL/empty, not
   `'AutoCAD 2022+'`.
2. Display side: render a product whose specs are empty and assert none of the six literals appears;
   render a product whose specs are filled and assert the values appear.
3. Negative control: re-introduce one fallback literal in a scratch copy and show the instrument
   fails.
4. `test:challenger` passes with the rewritten spec, which must assert **absence** for empty specs.
