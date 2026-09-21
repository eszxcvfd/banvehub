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
 * The labels are the plugin's own English names for those 40 values (the repository's
 * `src/blocks/Form/Country/options.ts` uses English country names too); the eight additions follow
 * the same convention. Only the values and their order are the contract — `SUPPORTED_COUNTRIES`
 * values must equal the labels of `enum_addresses_country` as a set, and
 * `tests/helpers/probe-phase14-address-countries.mts` fails if they drift.
 */
export type SupportedCountry = {
  /** Human-readable country name, as rendered by the address forms. */
  label: string
  /** ISO 3166-1 alpha-2 country code — the value stored in `addresses.country`. */
  value: string
}

export const SUPPORTED_COUNTRIES: SupportedCountry[] = [
  { label: 'Vietnam', value: 'VN' },
  { label: 'Thailand', value: 'TH' },
  { label: 'Laos', value: 'LA' },
  { label: 'Cambodia', value: 'KH' },
  { label: 'Myanmar', value: 'MM' },
  { label: 'Philippines', value: 'PH' },
  { label: 'Indonesia', value: 'ID' },
  { label: 'China', value: 'CN' },
  // The 40 values `@payloadcms/plugin-ecommerce` shipped, in its order.
  { label: 'United States', value: 'US' },
  { label: 'United Kingdom', value: 'GB' },
  { label: 'Canada', value: 'CA' },
  { label: 'Australia', value: 'AU' },
  { label: 'Austria', value: 'AT' },
  { label: 'Belgium', value: 'BE' },
  { label: 'Brazil', value: 'BR' },
  { label: 'Bulgaria', value: 'BG' },
  { label: 'Cyprus', value: 'CY' },
  { label: 'Czech Republic', value: 'CZ' },
  { label: 'Denmark', value: 'DK' },
  { label: 'Estonia', value: 'EE' },
  { label: 'Finland', value: 'FI' },
  { label: 'France', value: 'FR' },
  { label: 'Germany', value: 'DE' },
  { label: 'Greece', value: 'GR' },
  { label: 'Hong Kong', value: 'HK' },
  { label: 'Hungary', value: 'HU' },
  { label: 'India', value: 'IN' },
  { label: 'Ireland', value: 'IE' },
  { label: 'Italy', value: 'IT' },
  { label: 'Japan', value: 'JP' },
  { label: 'Latvia', value: 'LV' },
  { label: 'Lithuania', value: 'LT' },
  { label: 'Luxembourg', value: 'LU' },
  { label: 'Malaysia', value: 'MY' },
  { label: 'Malta', value: 'MT' },
  { label: 'Mexico', value: 'MX' },
  { label: 'Netherlands', value: 'NL' },
  { label: 'New Zealand', value: 'NZ' },
  { label: 'Norway', value: 'NO' },
  { label: 'Poland', value: 'PL' },
  { label: 'Portugal', value: 'PT' },
  { label: 'Romania', value: 'RO' },
  { label: 'Singapore', value: 'SG' },
  { label: 'Slovakia', value: 'SK' },
  { label: 'Slovenia', value: 'SI' },
  { label: 'Spain', value: 'ES' },
  { label: 'Sweden', value: 'SE' },
  { label: 'Switzerland', value: 'CH' },
]
