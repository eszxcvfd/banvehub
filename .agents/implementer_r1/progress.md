# Implementer Progress — Realistic DB Seed

## Status: Complete

### Checklist
- [x] 1. Explore and document current database state and test setup
- [x] 2. Create isolated test database `kientaohub_test` and update `vitest.setup.ts`, `package.json`, `.env.example`
- [x] 3. Verify test isolation (`vitest.setup.ts` targets `kientaohub_test`, 28 test files / 419 tests passed, dev counts untouched)
- [x] 4. Clean up dead template seeder (`src/endpoints/seed/`, `SeedButton`, seed route, moved `home-static.ts` to `utilities/`)
- [x] 5. Implement `web/scripts/seed-realistic.mts` with all 5 phases:
  - Phase 1: Guards (DB name check, seed confirmation, backup verification)
  - Phase 2: Reset (preserve user 1 + roles, drop truncate triggers, truncate tables, restore user 1 + sequence, restore triggers)
  - Phase 3: Taxonomy (categories, software types, tags)
  - Phase 4: Catalogue (sharp image generation, product files, products with moderation states and gallery, previews)
  - Phase 5: Commerce (users with seller/buyer profiles, wallets, orders via purchaseProduct/direct, earnings, refunds, withdrawals)
- [x] 6. Add `pnpm seed:realistic` to `package.json` (Done)
- [x] 7. Write runbook `docs/runbooks/dev-database.md`
- [x] 8. Execute `pnpm seed:realistic` on `kientaohub` and collect database verification evidence
- [x] 9. Run all negative probes and financial integrity queries
- [x] 10. Run `pnpm test:int` and verify dev database counts are untouched (A5 isolation)
- [x] 11. Run `pnpm lint` and verify clean
- [x] 12. Update `docs/plans/active/realistic-db-seed.md` and move to `docs/plans/completed/realistic-db-seed.md`
- [x] 13. Write `handoff.md` and report to orchestrator
