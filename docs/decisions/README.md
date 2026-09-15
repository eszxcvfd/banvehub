# Decisions

Decision records preserve lasting product, architecture, data ownership,
security, compatibility, and validation choices that future work must inherit.

Use `docs/templates/decision.md`. Task-local implementation choices remain in
the active execution plan and do not require a separate decision.

An installed consumer begins with no fabricated decisions. Add local decision
documents here as real choices are accepted, then index them in this file.

## Decisions

| Record | Status | Constraint future work inherits |
|---|---|---|
| [0001 Payload CMS as the application platform](0001-payload-as-platform.md) | Accepted | Payload CMS 3.89 on Next.js 16 in `web/` is the admin, API, and storefront (replaces daptin); template and `@payloadcms/*` packages move together (template tag `v3.89.0` ↔ packages `3.89.0`); dev is SQLite and Postgres is required before any money path; the internal wallet + SePay rail replaces the template's Stripe payment method |
