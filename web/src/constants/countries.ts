/**
 * The one ordered list of countries an address may name.
 *
 * Decision 0015 ("Vietnam is a first-class address country"): before this file existed the list had
 * three owners that disagreed — `enum_addresses_country` in Postgres (40 labels, no `VN`), the
 * `select` `@payloadcms/plugin-ecommerce` builds from the plugin's own built-in country list when
 * `addresses.supportedCountries` is not set (the same 40), and the two client forms, which imported
 * that plugin list and pinned their initial value to its first entry (`US`) because every submit
 * carrying `VN` answered `400 invalid selection`.
 *
 * This file is now the single owner. `web/src/plugins/index.ts` hands it to the plugin as
 * `addresses.supportedCountries` (so the collection's validation, the admin select and the REST API
 * accept exactly these values), and both address forms render it and start on its first entry. The
 * typed union in `web/src/payload-types.ts` follows from the same config.
 *
 * Order is part of the contract: `VN` leads, then Vietnam's regional neighbours that the shipped
 * list was missing, then the 40 values the plugin shipped, in the plugin's own order. The first
 * entry is what the forms default to, which is how "a new address defaults to `VN`" is implemented
 * without a second constant to keep in sync.
 *
 * Decision 0021: the labels are Vietnamese, hand-written for this Vietnamese-facing product, and
 * they are **display-only presentation**. The `value`s (ISO 3166-1 alpha-2) are the contract — they
 * are what the Postgres enum `enum_addresses_country` stores and what the plugin configuration, the
 * REST API and every stored address use — so a label may be reworded without a migration while a
 * value may not move. **No code may match on a label**: a rule that needs a country matches the
 * two-letter value (decision 0021 clause 4). `tests/int/address-countries-single-source.int.spec.ts`
 * guards the labels (non-empty, different from the code, unique) and pins the values against the
 * enum; `tests/helpers/probe-phase14-address-countries.mts` fails if the values drift.
 */
export type SupportedCountry = {
  /** Human-readable country name, as rendered by the address forms. */
  label: string
  /** ISO 3166-1 alpha-2 country code — the value stored in `addresses.country`. */
  value: string
}

export const SUPPORTED_COUNTRIES: SupportedCountry[] = [
  { label: 'Việt Nam', value: 'VN' },
  { label: 'Thái Lan', value: 'TH' },
  { label: 'Lào', value: 'LA' },
  { label: 'Campuchia', value: 'KH' },
  { label: 'Myanmar', value: 'MM' },
  { label: 'Philippines', value: 'PH' },
  { label: 'Indonesia', value: 'ID' },
  { label: 'Trung Quốc', value: 'CN' },
  // The 40 values `@payloadcms/plugin-ecommerce` shipped, in its order.
  { label: 'Hoa Kỳ', value: 'US' },
  { label: 'Vương quốc Anh', value: 'GB' },
  { label: 'Canada', value: 'CA' },
  { label: 'Úc', value: 'AU' },
  { label: 'Áo', value: 'AT' },
  { label: 'Bỉ', value: 'BE' },
  { label: 'Brazil', value: 'BR' },
  { label: 'Bulgaria', value: 'BG' },
  { label: 'Síp', value: 'CY' },
  { label: 'Séc', value: 'CZ' },
  { label: 'Đan Mạch', value: 'DK' },
  { label: 'Estonia', value: 'EE' },
  { label: 'Phần Lan', value: 'FI' },
  { label: 'Pháp', value: 'FR' },
  { label: 'Đức', value: 'DE' },
  { label: 'Hy Lạp', value: 'GR' },
  { label: 'Hồng Kông', value: 'HK' },
  { label: 'Hungary', value: 'HU' },
  { label: 'Ấn Độ', value: 'IN' },
  { label: 'Ireland', value: 'IE' },
  { label: 'Ý', value: 'IT' },
  { label: 'Nhật Bản', value: 'JP' },
  { label: 'Latvia', value: 'LV' },
  { label: 'Litva', value: 'LT' },
  { label: 'Luxembourg', value: 'LU' },
  { label: 'Malaysia', value: 'MY' },
  { label: 'Malta', value: 'MT' },
  { label: 'Mexico', value: 'MX' },
  { label: 'Hà Lan', value: 'NL' },
  { label: 'New Zealand', value: 'NZ' },
  { label: 'Na Uy', value: 'NO' },
  { label: 'Ba Lan', value: 'PL' },
  { label: 'Bồ Đào Nha', value: 'PT' },
  { label: 'Romania', value: 'RO' },
  { label: 'Singapore', value: 'SG' },
  { label: 'Slovakia', value: 'SK' },
  { label: 'Slovenia', value: 'SI' },
  { label: 'Tây Ban Nha', value: 'ES' },
  { label: 'Thụy Điển', value: 'SE' },
  { label: 'Thụy Sĩ', value: 'CH' },
]
