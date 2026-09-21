# 0015 Vietnam Is a First-Class Address Country

Date: 2026-09-21

## Status

Accepted

## Context

The owner asked on 2026-09-21 why the address form cannot select Vietnam. Measured that day:

- `enum_addresses_country`, created in `web/src/migrations/20260915_020514_initial.ts:35`, holds
  exactly 40 values — `US, GB, CA, AU, AT, BE, BR, BG, CY, CZ, DK, EE, FI, FR, DE, GR, HK, HU, IN,
  IE, IT, JP, LV, LT, LU, MY, MT, MX, NL, NZ, NO, PL, PT, RO, SG, SK, SI, ES, SE, CH` — and **`VN` is
  not one of them**.
- `@payloadcms/plugin-ecommerce` builds the address `country` field from
  `addresses.supportedCountries ?? defaultCountries`
  (`node_modules/@payloadcms/plugin-ecommerce/dist/collections/addresses/createAddressesCollection.js:2-30`)
  and replaces whatever the field config says with a `select` over that list.
  `web/src/plugins/index.ts` passes no `supportedCountries`, so both the collection's validation list
  and the admin select are the plugin's 40 countries.
- Both client forms import that same plugin default
  (`web/src/components/forms/AddressForm/index.tsx:5`,
  `web/src/components/addresses/AddressFormModal.tsx:22-23`) and pin the initial country to
  `countryOptions[0]` — **United States** (`AddressForm/index.tsx:74-76`). The comment above it
  records the reason: `'VN'` used to be the default and every submit answered `400 invalid
  selection`.
- The form already offers **Vietnamese provinces** (`AddressFormModal.tsx:38`), so the interface asks
  a Vietnamese seller for a Vietnamese city inside a country list that cannot name Vietnam.
- `addresses` held **0 rows** in the development database on 2026-09-21, so the enum can be replaced
  without data migration.

## Decision

1. `VN` is added to the address country list, **first in order**, together with Vietnam's regional
   neighbours that the list is missing: `TH`, `LA`, `KH`, `MM`, `PH`, `ID`, `CN`. The existing 40
   values stay.
2. **One list, one owner.** `web/src/constants/countries.ts` exports `SUPPORTED_COUNTRIES` (ordered,
   `VN` first). The plugin config and both client forms import that list; no surface imports
   `defaultCountries` from the plugin client any more.
3. The plugin receives the list explicitly: `addresses: { supportedCountries: SUPPORTED_COUNTRIES }`,
   so the collection's validation and the admin select agree with the forms.
4. A new address defaults to `VN`, on both forms.
5. The schema change is **phase-14 migration** `20260921_*_phase14_address_countries.ts`, which
   replaces the enum type transactionally (create new type → alter column with `USING country::text`
   → drop old → rename) rather than `ALTER TYPE ... ADD VALUE`: Payload runs each migration inside a
   transaction, and a value added in a transaction cannot be used before that transaction commits.
   The `down` path restores the phase-13 type exactly.
6. The list states which countries an **address** may name. It is not a payout claim, and it does not
   change which countries the platform pays into.

## Alternatives Considered

1. **Leave `VN` out and pick a smaller non-US default.** Rejected: the marketplace sells Vietnamese
   CAD/BIM resources to Vietnamese buyers; a country list that cannot name the market is a lie about
   the product, not a neutral default.
2. **`ALTER TYPE ... ADD VALUE`.** Rejected on transaction semantics (see decision 5); it would also
   need a second migration to use the value.
3. **Add `VN` to the database enum only.** Rejected: the collection's `select` validates against the
   plugin list, so the API would still answer `400` for `VN` — exactly the failure the current
   `US`-pinned default was written to work around.
4. **Full ISO 3166-1 list.** Rejected for now: a 249-value select is worse for the real user, and the
   region-plus-existing-40 list covers the sellers the platform has. Expanding it later is a one-file
   change plus a migration.

## Consequences

Positive:

- A Vietnamese seller or buyer can save the address they actually live at, and the form no longer
  opens on a country the marketplace does not serve.
- One list feeds the database enum, the API validation, the admin select and both forms, so the
  "worked around a `400` by defaulting to the wrong country" class of bug cannot come back.
- The migration is reversible and was written against an empty table, so the risk is confined to the
  enum type itself.

Tradeoffs:

- The list is still not the full ISO set, so a buyer outside the region and the existing 40 countries
  cannot save an address. That is a display/coverage limit, not a data lie, and it is now visible in
  one file.
- `enum_addresses_country` changes shape, so any future migration that adds a country must edit the
  shared list and the enum together — recorded here so the pair is not split.

## Follow-Up

- If real demand appears outside the current list, add the values to `SUPPORTED_COUNTRIES` and the
  enum in one migration; do not reintroduce a second list.
