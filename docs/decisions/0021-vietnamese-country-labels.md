# 0021 Country Labels Are Vietnamese

Date: 2026-09-21

## Status

Accepted

## Context

Decision 0015 gave the application one ordered country list,
`web/src/constants/countries.ts`, feeding `addresses.supportedCountries` in `web/src/plugins/index.ts`
and both client forms. Its labels came from the plugin's `defaultCountries` and are therefore **English**
on a Vietnamese-facing marketplace: the select that asks a Vietnamese user for their address shows
"Vietnam", "Thailand", "United States". The same list is what Payload renders as the options of the
`addresses.country` field in the admin, so the admin is English too.

The review of the address change (t32) recorded this as an accepted-but-unsolved item and handed it to
the storefront vertical; the owner has since granted authority over it. Two constraints shape the fix:

- **Values must not move.** `enum_addresses_country` stores ISO alpha-2 codes and the migration chain
  depends on them; labels are display-only.
- **Nothing may match on a label.** This increment already paid for that lesson twice: the order table's
  format tag keyed on the *words* `BIM`/`REVIT` while the record stored the *extension* `.rvt`
  (t39 → t40), and the LUMION branch matched a two-letter substring that free text could trip
  (t41 → t42). Code matches stored tokens; humans read labels.

## Decision

1. **The shared list's labels are Vietnamese**, hand-written so the wording is a reviewed choice rather
   than a machine translation: `Việt Nam`, `Hoa Kỳ`, `Vương quốc Anh`, `Nhật Bản`, `Trung Quốc`,
   `Hồng Kông`, `Thái Lan`, `Đức`, and so on for all 48 entries. `VN` stays first (decision 0015
   clause 1).
2. **Values stay ISO codes** and the enum is unchanged: **no migration**, no data rewrite. Existing
   addresses keep working because only the display label changed.
3. **The list remains the only source.** The admin select, both client forms and the address collection
   all read it; no second list and no lookup table is introduced.
4. **No code may match on a label.** If a future rule needs to special-case a country, it matches the
   two-letter value. This is stated in the file's header comment so the next author reads it before
   writing `label === 'Việt Nam'`.
5. **A test guards the list**: every entry has a non-empty Vietnamese label that differs from its code,
   the eight regional entries read as intended, `VN` is first, and the enum↔list guard test (which
   compares **values**) still passes untouched.

## Alternatives Considered

1. **`new Intl.DisplayNames(['vi'], { type: 'region' })`.** Less code and always complete, but it
   depends on the runtime's ICU data (a small-ICU Node build returns the code itself), and its output is
   officialese — "Vương quốc Anh và Bắc Ireland", "Hàn Quốc" vs "Đại Hàn Dân Quốc" — which is poor in a
   48-item select a person scans. A reviewed literal list is deterministic in tests and better to read.
2. **Keep English labels.** Rejected: a Vietnamese marketplace whose address form cannot name its own
   country in its own language is the same class of defect as the missing `VN` that decision 0015 fixed.
3. **Translate only the regional eight.** Rejected: a half-Vietnamese list reads worse than either
   consistent choice, and the admin would stay English for the rest.
4. **Store labels in the database.** Rejected: labels are presentation, the enum is the data, and a
   label table adds a join to every address read for no operational benefit.

## Consequences

Positive:

- A Vietnamese user reads a Vietnamese country list in both the storefront and the admin, without a
  second source of truth and without touching stored values.
- The label-vs-token rule is now written where the next author will hit it, after this increment paid
  for it twice in the order-format matcher.

Tradeoffs:

- The earlier review's fidelity check ("identical in order **and label** to the plugin's
  `defaultCountries`") no longer holds; it is superseded by this decision, and the guard test continues
  to compare **values** plus the order, which is what decision 0015 actually requires.
- English-speaking operators see Vietnamese options in the admin. That is the intended direction for a
  Vietnamese-facing product; an i18n layer, if it ever exists, would key off the value and not the label.

## Verification

1. Every label is non-empty, differs from its code, and the 48 entries keep the contracted order with
   `VN` first.
2. The guard test that pins the enum against the list still passes (it compares values).
3. Rendered: the address form's country select shows `Việt Nam` selected and the option list in
   Vietnamese, and the admin's country options come from the same file (single source).
