# Execution Plan: Phase 2 Digital Catalog & Storefront

Date: 2026-09-15

## Status

Completed

## Outcome

1. Clean removal of physical goods e-commerce template entities (\`variants\`, \`carts\`, inventory selectors) from Payload configuration and database schema per Decision 0003 and PLAN.md §27.
2. Complete digital catalog data model implemented and applied to PostgreSQL via versioned migration \`20260915_033625_phase2_digital_catalog.ts\`:
   - \`software_types\` (AutoCAD, Revit, SketchUp, 3ds Max, Blender, etc.)
   - \`tags\` (technical keywords, architectural styles)
   - \`product_previews\` (watermarked images, PDF blueprints, 3D model previews)
   - Enriched \`categories\` (slugs, descriptions, icons/images, SEO fields)
   - Digital \`products\` (VND pricing, \`isFree\` toggle, technical specifications, relations, published/draft status)
3. Catalog RBAC access matrix enforced across all collections (\`web/src/access/adminSellerModeratorOrPublished.ts\`):
   - Public guest read access for published products, categories, software types, and tags.
   - Product creation restricted to \`seller\` and \`admin\`.
   - Product moderation, publishing, and updating restricted to \`moderator\` and \`admin\`.
4. Digital catalog storefront browsing and product detail experience delivered:
   - \`/shop\` faceted search with multi-filter support (Category, Software Type, Free vs. Paid), URL parameter preservation, and safe PostgreSQL search against titles and taxonomies.
   - \`/products/[slug]\` detailed engineering asset view with \`TechnicalSpecsTable\`, preview \`Gallery\`, \`SellerAttribution\`, and \`DigitalProductCTA\` (VND / Miễn phí).
5. Dynamic SEO and crawlability infrastructure:
   - Dynamic \`/sitemap.xml\` generated via Payload Local API with strict draft exclusion.
   - Crawl-friendly \`/robots.txt\`.
   - OpenGraph and metadata generation across product detail and category pages.

## Context

- \`PLAN.md\` §27 Phase 2 (Catalog) and §3.2, §4.1, §5, §22.
- \`docs/decisions/0001-payload-as-platform.md\` (PostgreSQL with versioned migrations, \`push: false\`).
- \`docs/decisions/0003-p0-scope-lock.md\` (Digital marketplace ERD; no variants or physical carts).
- \`docs/decisions/0007-search-engine.md\` (PostgreSQL query layer for P0 catalog search).
- \`docs/decisions/0008-role-model.md\` (Admin, Moderator, Seller, Buyer role matrix).
- \`docs/WORKFLOW.md\` (Authority gate, behaviour-level proof, regression testing).

## Scope

In scope:
- Removal of \`variants\` and \`carts\` collections and plugin config.
- Implementation of \`software_types\`, \`tags\`, \`product_previews\`, enriched \`categories\`, and digital \`products\`.
- Generation and execution of versioned migration \`20260915_033625_phase2_digital_catalog.ts\`.
- Collection-level access control matching Decision 0008.
- Storefront catalog browsing (\`/shop\`), faceted filtering, and search.
- Product detail view (\`/products/[slug]\`) customized for digital architecture/engineering files.
- Dynamic \`/sitemap.xml\`, \`/robots.txt\`, and OpenGraph tags.
- Comprehensive integration, challenger, and stress test suites.

Out of scope:
- Phase 3: Seller onboarding, digital file upload storage pipeline (S3/R2 presigned upload), anti-virus scan, seller dashboard.
- Phase 4: SePay integration, internal wallet, ledger invariant enforcement.
- Phase 5: Order checkout, signed download token URLs.

## Decisions

- 2026-09-15: Lexical description fields are stored as \`jsonb\` in PostgreSQL. Searching with \`{ like: search }\` on \`description\` throws PostgreSQL error \`42883\`. Search query scope is restricted to string fields (\`title\`, \`slug\`) and taxonomy relations per Decision 0007.
- 2026-09-15: Concurrency on shared test database caused race conditions during parallel vitest runs. Configured \`fileParallelism: false\` in \`web/vitest.config.mts\` for deterministic, sequential test execution against the local PostgreSQL container.
- 2026-09-15: Hardened query parameters and test data generators to enforce safe 32-bit integers (\`<= 2,147,483,647\`) to prevent PostgreSQL error \`22003\` integer overflow on pagination/pricing fields.

## Validation

- **Integration tests (\`pnpm --prefix web test:int\`)**:
  - 11 test suites, 215 tests, 100% passed (0 failures):
    - \`tests/int/catalog-rbac.int.spec.ts\` (14 tests)
    - \`tests/int/catalog-m3-storefront.int.spec.ts\` (9 tests)
    - \`tests/int/seo-sitemap.int.spec.ts\` (17 tests)
    - \`tests/int/m1-schema-stress.int.spec.ts\` (22 tests)
    - \`tests/int/challenger-m2.int.spec.ts\` (36 tests)
    - \`tests/int/challenger-m3.int.spec.ts\` (43 tests)
    - \`tests/int/challenger-m3-detail.int.spec.ts\` (11 tests)
    - \`tests/int/challenger-m4-seo.int.spec.ts\` (20 tests)
    - \`tests/int/challenger-m4-sitemap.int.spec.ts\` (15 tests)
    - \`tests/int/rbac.int.spec.ts\` (14 tests)
    - \`tests/int/api.int.spec.ts\` (1 test)
- **Challenger component tests (\`pnpm --prefix web test:challenger\`)**:
  - 22 tests passed (specs table, preview gallery, seller attribution, VND CTA).
- **Stress & privilege escalation tests (\`pnpm --prefix web test:stress\`)**:
  - 28 tests passed (role spoofing, draft leakage prevention, unauthorized taxonomy mutations).
- **ESLint (\`pnpm --prefix web lint\`)**:
  - 0 errors across entire codebase.
- **Production build (\`pnpm --prefix web build\`)**:
  - Exit code 0 across all 20 routes (including SSG, dynamic routes, \`/sitemap.xml\`).

## Result

Phase 2 is fully complete, meeting all exit criteria specified in \`PLAN.md\` §27:
- Guests can search, filter, and inspect complete digital products with technical specifications and VND pricing.
- Search engines receive indexable HTML metadata, OpenGraph tags, and a valid dynamic XML sitemap.
- Ready to proceed to Phase 3: Seller Onboarding & Moderation Workflow.
