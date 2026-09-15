# Threat Model (preliminary)

Date: 2026-09-15

Provenance: replaces `470bf41:docs/threat-model.md`, which mapped the same
threats onto the daptin architecture removed in `366ac21`. Every control cell
below states either an observed behaviour with a path, or `none`. A row may claim
a control only with evidence; an empty control column is a real gap, not a
formatting choice.

Scope: `PLAN.md` §32's twenty named threats, in its order. Owning phase uses
`PLAN.md` §27 vocabulary. The application today is the Payload ecommerce
template; almost no §32 control exists, so this table is mostly a gap list.

| # | §32 threat | Current control | Missing control | Owning phase |
|---|---|---|---|---|
| T1 | Guessing the URL of an original file | none for product files: no digital-file modelling exists; the template's `media` collection serves uploads from public paths | private uploads, unguessable storage keys, entitlement gate | Phase 5 (decision 0006) |
| T2 | Sharing a signed URL | none | short-lived one-time token, entitlement check, no public originals | Phase 5 (decision 0006) |
| T3 | Credential stuffing | `POST /api/users/login` with wrong credentials returns 401 (observed); `users.create` is `publicAccess` (`web/src/collections/Users/index.ts:15`), so registration is open | rate limiting, lockout, captcha where risky (`PLAN.md` FR-07) | Phase 1 (rate limiting) |
| T4 | Forged payment webhook | none: no webhook route exists; the template's Stripe adapter uses placeholder keys | provider signature or secret verification per provider scheme (§11.3) | Phase 4 (decision 0004) |
| T5 | Webhook replay | none: BR-02 is stated in `PLAN.md` and unimplemented | unique constraint on `payment_transactions (provider, provider_transaction_id)` | Phase 4 (decision 0005) |
| T6 | Wallet double-spend | none: no wallet, ledger, or money write path exists | single write path plus the conditional debit with row locking (BR-01, decision 0002) | Phase 4 |
| T7 | Withdrawal race | none: no withdrawal entity exists | reserve-balance design and a race test (FR-32) | Phase 6 |
| T8 | Seller uploads malware | none | asynchronous scan stage and a file status field | Phase 3 |
| T9 | Stored XSS in descriptions or comments | React escaping by default; no comment entity exists | sanitization policy for rich text and moderation | Phase 3 |
| T10 | IDOR on another user's orders | template cart and order access is scoped per customer; not audited here | apply owner-scoped access explicitly to orders and entitlements | Phase 5 |
| T11 | Admin privilege escalation | `admin` panel access requires the `admin` role; `roles` field is admin-only for read, create, and update (`web/src/collections/Users/index.ts`) | a live authorization matrix, credential custody, and the §22 role split | Phase 1 (RBAC) |
| T12 | Spam products | none | moderation gate and rate caps (FR-28) | Phase 3 |
| T13 | Copyright abuse | none | report, dispute, and takedown flow | Phase 3, takedown at P2 |
| T14 | Catalog scraping | none | rate limits and caching; accepted for P0 because SEO wants crawlers | Phase 1 or P1 |
| T15 | Bot downloads | none | download events plus heuristics (FR-17) | Phase 5 |
| T16 | CSRF | Payload authentication cookies with SameSite defaults; not verified here | verify cookie and CSRF policy against Payload guidance before any non-local deployment | pre-deployment |
| T17 | SSRF through URL import | not applicable: no URL-import feature exists | review gate if such a feature is ever added | cut at P0 |
| T18 | Zip bomb | none | archive inspection and size caps in the scan stage | Phase 3 |
| T19 | MIME spoofing | none | MIME and checksum validation in the scan stage (FR-27) | Phase 3 |
| T20 | Large-upload resource exhaustion | none configured | upload size caps and streaming limits (FR-27) | Phase 3 |

## Standing Residuals

Stated so no later reader mistakes the gaps for solved problems:

- No money path exists at all, so T4–T7 have no partial control to build on.
- No PostgreSQL yet: the dev database is SQLite, which cannot enforce the
  transaction and constraint behaviour the money rules assume.
- No rate limiting on any route, and none configured for the future webhook
  route that §11.3 requires it for.
- No audit trail beyond Payload's document history; §NFR-14's required fields
  (actor, action, resource, before, after, reason, IP, request id) are not
  implemented.
- Template payment code with placeholder Stripe keys ships in the repository and
  must not be exposed publicly.
- No TLS, no deployment, no backup, and no restore rehearsal: local
  single-machine only.
