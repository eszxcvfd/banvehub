# Execution Plan: Phase 3 Seller Onboarding, Private Files & Moderation Workflow

Date: 2026-09-15

## Status

Completed

## Outcome

Delivered Phase 3 per `PLAN.md` §27, achieving the official exit criteria:
- **Seller có thể tạo → upload file gốc an toàn → submit duyệt → admin/moderator approve → public ra marketplace.**
- Clean separation of public previews (`product_previews`) and private originals (`product_files`) per BR-06 and Decision 0006.
- Strict moderation state machine enforcement per FR-28 and BR-08 (sellers cannot self-publish).
- Fully tested and verified with versioned PostgreSQL migration `20260915_062953_phase3_seller_moderation.ts` and zero regressions across existing test suites.

## Context

- `PLAN.md` §27 Phase 3 (Seller & Moderation), §8 (FR-24 to FR-28), §11 (FLOW-U10, FLOW-U11, FLOW-U14), §22, §26 (EPIC-005, EPIC-006, EPIC-007), §34 (BR-06, BR-08).
- `docs/decisions/0001-payload-as-platform.md` (PostgreSQL with versioned migrations, `push: false`).
- `docs/decisions/0003-p0-scope-lock.md` (ERD: `seller_profiles`, `product_files`, `products`).
- `docs/decisions/0006-secure-download-path.md` (Private originals, no public URLs, entitlement-gated download).
- `docs/decisions/0008-role-model.md` (Roles: `admin`, `moderator`, `seller`, `buyer`, `financeAdmin`).

## Scope

In scope:
1. Data Model & Migration:
   - `seller_profiles` collection (display name, slug, bio, phone, payout bank info, terms acceptance, status, rating, total sales).
   - `product_files` collection (private upload outside `public/`, checksum SHA-256, file size, MIME, processing status).
   - `products` collection enhancement: `seller` relation, `moderationStatus` (`draft`, `submitted`, `in_review`, `changes_requested`, `rejected`, `approved`), `moderationNotes`, `moderationHistory`, `copyrightDeclared`, relation to `product_files`.
   - Versioned PostgreSQL migration applied via Payload migration tooling (`20260915_062953_phase3_seller_moderation.ts`).
2. Invariants & Access Control:
   - Enforce BR-06: `product_files` denied from public and unauthenticated access; buyers cannot read directly.
   - Enforce BR-08 & FR-28: Hook prevents sellers from self-publishing or setting `_status: 'published'` without moderator approval.
   - Seller isolation: Sellers can only read, edit, or submit their own drafts; moderators and admins can review and approve all.
3. Seller Onboarding & Product Editor:
   - Seller registration flow (`/seller/register`).
   - Seller dashboard (`/seller`) with product listings, KPI cards, and moderation statuses.
   - Product creation and editing UI (`/seller/products/new`) with file upload, CAD/BIM technical metadata, preview gallery, and "Submit for Review" action.
4. Moderation Workflow:
   - Moderation queue for moderators and admins (`/moderation`).
   - Review action endpoint (`/api/moderation/action`): Approve (sets `_status: 'published'`), Request Changes (returns to draft with reason), Reject.
   - Audit trail of moderation decisions stored in `moderationHistory`.
5. Verification:
   - 3 new dedicated integration test suites:
     - `tests/int/seller-onboarding.int.spec.ts` (4 tests)
     - `tests/int/product-files-security.int.spec.ts` (5 tests)
     - `tests/int/moderation-lifecycle.int.spec.ts` (6 tests)
   - 100% pass on all existing 215 integration tests (230 tests total across 14 suites).
   - 100% pass on challenger (22 tests) and stress privilege escalation (28 tests).
   - `lint` (0 errors) and Next.js production `build` (29 routes cleanly compiled).

Out of scope:
- Phase 4: Payment integration (SePay, QR, HMAC webhooks, internal wallet, ledger).
- Phase 5: Checkout, orders, purchase entitlement, and secure signed download token redemption.
- Phase 6: Seller commission calculations, earnings ledger, withdrawal payouts.

## Progress

- [x] Milestone 1: Data Model & Schema Migration
- [x] Milestone 2: Security & Moderation Invariants
- [x] Milestone 3: File Processing & Checksum Pipeline
- [x] Milestone 4: Seller Experience (Onboarding, Dashboard, Product Editor)
- [x] Milestone 5: Moderation Workflow & Queue
- [x] Milestone 6: Verification & Hardening

## Validation

- **Integration tests (`pnpm --prefix web test:int`)**:
  - 14 test suites, 230 tests, 100% passed (0 failures):
    - `tests/int/seller-onboarding.int.spec.ts` (4 tests)
    - `tests/int/product-files-security.int.spec.ts` (5 tests)
    - `tests/int/moderation-lifecycle.int.spec.ts` (6 tests)
    - `tests/int/catalog-rbac.int.spec.ts` (14 tests)
    - `tests/int/catalog-m3-storefront.int.spec.ts` (9 tests)
    - `tests/int/seo-sitemap.int.spec.ts` (17 tests)
    - `tests/int/m1-schema-stress.int.spec.ts` (22 tests)
    - `tests/int/challenger-m2.int.spec.ts` (36 tests)
    - `tests/int/challenger-m3.int.spec.ts` (43 tests)
    - `tests/int/challenger-m3-detail.int.spec.ts` (11 tests)
    - `tests/int/challenger-m4-seo.int.spec.ts` (20 tests)
    - `tests/int/challenger-m4-sitemap.int.spec.ts` (15 tests)
    - `tests/int/rbac.int.spec.ts` (14 tests)
    - `tests/int/api.int.spec.ts` (1 test)
- **Challenger component tests (`pnpm --prefix web test:challenger`)**:
  - 22 tests passed (specs table, preview gallery, seller attribution, VND CTA).
- **Stress & privilege escalation tests (`pnpm --prefix web test:stress`)**:
  - 28 tests passed (role spoofing, draft leakage prevention, unauthorized taxonomy mutations).
- **ESLint (`pnpm --prefix web lint`)**:
  - 0 errors across entire codebase.
- **Production build (`pnpm --prefix web build`)**:
  - Exit code 0 across all 29 routes (including `/seller`, `/moderation`, `/seller/products/new`, etc.).

## Result

Phase 3 is fully complete, meeting all exit criteria specified in `PLAN.md` §27:
- Sellers can register, create digital assets, upload private originals with checksum calculation, and submit for review.
- Platform moderators and admins can inspect submissions in the moderation queue, request revisions, reject, or approve into the public catalog.
- Ready to proceed to Phase 4: Payment & Internal Wallet.
