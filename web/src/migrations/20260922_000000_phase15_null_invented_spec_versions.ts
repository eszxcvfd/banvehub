import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * Phase 15 — the seed's invented `'<Software> 2022+'` versions are nulled, behind a count guard.
 *
 * Measured on the development database `kientaohub` on 2026-09-22, **before** this migration ran:
 *
 *     select coalesce(technical_specs_software_version, '(NULL)') as version, count(*)
 *     from products group by 1 order by 2 desc;
 *
 *     AutoCAD 2022+      74
 *     Revit 2022+        40
 *     SketchUp 2022+     27
 *     3ds Max 2022+      17
 *     (NULL)              4
 *     PDF / Vector 2022+  2
 *     Lumion 2022+        1
 *
 *   165 products, **161** of them matching `~ ' 2022\+$'`, and those 161 are the platform's invention
 *   rather than seller data: every one of them equals its own row's `software_types.title` plus the
 *   generator's suffix —
 *
 *     select count(*), count(*) filter (where p.technical_specs_software_version = st.title || ' 2022+'),
 *            count(distinct p.id)
 *     from products p
 *     join products_rels pr on pr.parent_id = p.id and pr.path = 'software_types'
 *     join software_types st on st.id = pr.software_types_id
 *     where p.technical_specs_software_version ~ ' 2022\+$';
 *     -->  161 | 161 | 161
 *
 *   The generator is `web/scripts/seed-realistic.mts`, and this change fixes it too, so a re-seed
 *   cannot restore what this migration removes. Authority:
 *   `docs/decisions/0020-purge-invented-spec-versions.md`, clauses 1, 2 and 6.
 *
 * After: **0** rows match the pattern, and every product holds a NULL version (the 4 that already did
 * are joined by the 161). The two other technical-spec columns are deliberately untouched (clause 3):
 * `technical_specs_file_format` and `technical_specs_file_size` were non-null on the same 161 rows
 * before this migration and are non-null on the same 161 after it — they were measured from the
 * uploaded file, not composed.
 *
 * The count guard accepts exactly two pre-states — **0** (a database that never held the invention;
 * the test database, 47 products with none matching, is one) and the documented **161** — and raises
 * otherwise, so a database this record was not measured against is a loud failure instead of a silent
 * edit. The post-condition raises if any matching row survives. The body is one statement string, so
 * PostgreSQL runs it atomically.
 *
 * THE VERSIONS TABLE IS A SECOND, PRE-EXISTING COPY THIS MIGRATION DELIBERATELY DOES NOT REWRITE.
 * Payload keeps draft history in `_products_v`, and its `version_technical_specs_software_version`
 * column holds the same invention: measured on the development database on 2026-09-22, **162 of its
 * 167** version rows match ` 2022+` (4 NULL) across the same **161** products (one product carries two
 * matching version rows, which is why that count is 162 and not 161). Those rows are not a missed
 * 162nd row and not evidence that the purge failed — the live `products` column this migration owns is
 * 0 matching. Leave them: those rows render nowhere (the storefront and the API read `products`),
 * decision 0020 clause 1 authorises exactly one column of one table, and the committed snapshot is the
 * archive for the `products` rows only — it lists 161 `products` `(id, value)` pairs, not `_products_v`
 * rows — so a "purge" of version history would be an unauthorised edit with no rollback. The one real
 * risk: restoring such a version through the admin panel ("restore version") would write the invented
 * value back into `products`, where it would render again; re-running this migration does not catch
 * that, because the restored row would be the only matching one and the guard accepts 0 or 161 only —
 * such a row has to be nulled by hand (or the version row removed) once it appears.
 *
 * EXACT RESTORE STATEMENT — this database's ids, the 161 `(id, value)` pairs committed verbatim in
 * `web/src/migrations/data/phase15-invented-spec-versions.tsv` and mirrored by `PURGED_VALUES` /
 * `restoreStatement()` below:
 *
 *   UPDATE "products" AS p
 *   SET "technical_specs_software_version" = v.value
 *   FROM (VALUES
 *     (1, 'AutoCAD 2022+'),
 *     (2, 'AutoCAD 2022+'),
 *     (3, 'Revit 2022+'),
 *     (4, 'AutoCAD 2022+'),
 *     (5, 'Revit 2022+'),
 *     (6, 'SketchUp 2022+'),
 *     (7, 'AutoCAD 2022+'),
 *     (8, 'Revit 2022+'),
 *     (9, 'AutoCAD 2022+'),
 *     (10, 'Revit 2022+'),
 *     (11, 'Revit 2022+'),
 *     (12, 'SketchUp 2022+'),
 *     (13, 'SketchUp 2022+'),
 *     (14, 'AutoCAD 2022+'),
 *     (15, 'Revit 2022+'),
 *     (16, 'AutoCAD 2022+'),
 *     (17, 'AutoCAD 2022+'),
 *     (18, 'Revit 2022+'),
 *     (19, 'AutoCAD 2022+'),
 *     (20, 'Revit 2022+'),
 *     (21, 'AutoCAD 2022+'),
 *     (22, 'AutoCAD 2022+'),
 *     (23, 'Revit 2022+'),
 *     (24, 'AutoCAD 2022+'),
 *     (25, 'AutoCAD 2022+'),
 *     (26, 'Revit 2022+'),
 *     (27, 'AutoCAD 2022+'),
 *     (28, 'AutoCAD 2022+'),
 *     (29, 'AutoCAD 2022+'),
 *     (30, 'Revit 2022+'),
 *     (31, 'AutoCAD 2022+'),
 *     (32, 'AutoCAD 2022+'),
 *     (33, 'AutoCAD 2022+'),
 *     (34, 'AutoCAD 2022+'),
 *     (35, 'Revit 2022+'),
 *     (36, 'AutoCAD 2022+'),
 *     (37, 'AutoCAD 2022+'),
 *     (38, 'AutoCAD 2022+'),
 *     (39, 'AutoCAD 2022+'),
 *     (40, 'Revit 2022+'),
 *     (41, 'Revit 2022+'),
 *     (42, 'AutoCAD 2022+'),
 *     (43, 'AutoCAD 2022+'),
 *     (44, 'Revit 2022+'),
 *     (45, 'AutoCAD 2022+'),
 *     (46, 'Revit 2022+'),
 *     (47, 'AutoCAD 2022+'),
 *     (48, 'AutoCAD 2022+'),
 *     (49, 'AutoCAD 2022+'),
 *     (50, 'Revit 2022+'),
 *     (51, 'AutoCAD 2022+'),
 *     (52, 'AutoCAD 2022+'),
 *     (53, 'AutoCAD 2022+'),
 *     (54, 'AutoCAD 2022+'),
 *     (55, 'AutoCAD 2022+'),
 *     (56, 'Revit 2022+'),
 *     (57, 'AutoCAD 2022+'),
 *     (58, 'AutoCAD 2022+'),
 *     (59, 'AutoCAD 2022+'),
 *     (60, 'AutoCAD 2022+'),
 *     (61, 'AutoCAD 2022+'),
 *     (62, 'Revit 2022+'),
 *     (63, 'Revit 2022+'),
 *     (64, 'Revit 2022+'),
 *     (65, 'Revit 2022+'),
 *     (66, 'Revit 2022+'),
 *     (67, 'Revit 2022+'),
 *     (68, 'Revit 2022+'),
 *     (69, 'Revit 2022+'),
 *     (70, 'Revit 2022+'),
 *     (71, 'Revit 2022+'),
 *     (72, 'Revit 2022+'),
 *     (73, 'Revit 2022+'),
 *     (74, 'Revit 2022+'),
 *     (75, 'Revit 2022+'),
 *     (76, 'Revit 2022+'),
 *     (77, 'Revit 2022+'),
 *     (78, 'Revit 2022+'),
 *     (79, 'Revit 2022+'),
 *     (80, 'Revit 2022+'),
 *     (81, 'Revit 2022+'),
 *     (82, '3ds Max 2022+'),
 *     (83, 'SketchUp 2022+'),
 *     (84, '3ds Max 2022+'),
 *     (85, 'SketchUp 2022+'),
 *     (86, '3ds Max 2022+'),
 *     (87, 'SketchUp 2022+'),
 *     (88, '3ds Max 2022+'),
 *     (89, 'SketchUp 2022+'),
 *     (90, '3ds Max 2022+'),
 *     (91, 'SketchUp 2022+'),
 *     (92, '3ds Max 2022+'),
 *     (93, 'SketchUp 2022+'),
 *     (94, '3ds Max 2022+'),
 *     (95, 'SketchUp 2022+'),
 *     (96, '3ds Max 2022+'),
 *     (97, 'SketchUp 2022+'),
 *     (98, '3ds Max 2022+'),
 *     (99, 'SketchUp 2022+'),
 *     (100, '3ds Max 2022+'),
 *     (101, 'SketchUp 2022+'),
 *     (102, 'AutoCAD 2022+'),
 *     (103, 'AutoCAD 2022+'),
 *     (104, 'AutoCAD 2022+'),
 *     (105, 'AutoCAD 2022+'),
 *     (106, 'AutoCAD 2022+'),
 *     (107, 'AutoCAD 2022+'),
 *     (108, 'AutoCAD 2022+'),
 *     (109, 'AutoCAD 2022+'),
 *     (110, 'AutoCAD 2022+'),
 *     (111, 'AutoCAD 2022+'),
 *     (112, 'Revit 2022+'),
 *     (113, 'AutoCAD 2022+'),
 *     (114, 'PDF / Vector 2022+'),
 *     (115, 'AutoCAD 2022+'),
 *     (116, 'AutoCAD 2022+'),
 *     (117, 'AutoCAD 2022+'),
 *     (118, 'AutoCAD 2022+'),
 *     (119, 'AutoCAD 2022+'),
 *     (120, 'AutoCAD 2022+'),
 *     (121, 'AutoCAD 2022+'),
 *     (122, 'SketchUp 2022+'),
 *     (123, '3ds Max 2022+'),
 *     (124, 'AutoCAD 2022+'),
 *     (125, 'SketchUp 2022+'),
 *     (126, '3ds Max 2022+'),
 *     (127, 'AutoCAD 2022+'),
 *     (128, 'SketchUp 2022+'),
 *     (129, 'SketchUp 2022+'),
 *     (130, '3ds Max 2022+'),
 *     (131, 'SketchUp 2022+'),
 *     (132, 'AutoCAD 2022+'),
 *     (133, 'SketchUp 2022+'),
 *     (134, 'AutoCAD 2022+'),
 *     (135, 'SketchUp 2022+'),
 *     (136, '3ds Max 2022+'),
 *     (137, '3ds Max 2022+'),
 *     (138, 'SketchUp 2022+'),
 *     (139, '3ds Max 2022+'),
 *     (140, 'AutoCAD 2022+'),
 *     (141, '3ds Max 2022+'),
 *     (142, 'SketchUp 2022+'),
 *     (143, 'AutoCAD 2022+'),
 *     (144, 'SketchUp 2022+'),
 *     (145, 'Lumion 2022+'),
 *     (146, 'SketchUp 2022+'),
 *     (147, 'AutoCAD 2022+'),
 *     (148, 'AutoCAD 2022+'),
 *     (149, 'SketchUp 2022+'),
 *     (150, 'AutoCAD 2022+'),
 *     (151, 'SketchUp 2022+'),
 *     (152, 'PDF / Vector 2022+'),
 *     (153, 'AutoCAD 2022+'),
 *     (154, 'AutoCAD 2022+'),
 *     (155, 'AutoCAD 2022+'),
 *     (156, 'Revit 2022+'),
 *     (157, 'SketchUp 2022+'),
 *     (158, 'AutoCAD 2022+'),
 *     (159, 'AutoCAD 2022+'),
 *     (160, 'AutoCAD 2022+'),
 *     (161, 'AutoCAD 2022+')
 *   ) AS v(id, value)
 *   WHERE p.id = v.id;
 *
 * `down()` does NOT run it, on purpose — see its comment.
 */

/** The generator's suffix as a Postgres regex: one space, `2022`, a literal `+`, end of the value. */
export const INVENTED_VERSION_PATTERN = ' 2022\\+$'

export async function up({ db }: MigrateUpArgs): Promise<void> {
  // Note on `\\+`: this is a TypeScript template literal, so the source carries a doubled backslash
  // and PostgreSQL receives the single-backslash regex ` 2022\+$` — a literal `+`, not the quantifier.
  await db.execute(sql`
    -- 0. Guard. Two pre-states are legitimate: the documented 161, or 0 for a database that never
    --    held the invention. Anything else means this record's measurement does not describe the
    --    database the migration is running against, and the purge would edit rows nobody measured.
    DO $$
    DECLARE matching bigint;
    BEGIN
      SELECT count(*) INTO matching
      FROM "products"
      WHERE "technical_specs_software_version" ~ ' 2022\\+$';

      IF matching <> 0 AND matching <> 161 THEN
        RAISE EXCEPTION 'phase15: % product(s) match the invented '' 2022+'' version pattern; this migration refuses to guess between 0 and the documented 161', matching;
      END IF;
    END $$;

    -- 1. The purge: one column, the matching rows, NULL. Nothing else is written.
    UPDATE "products"
      SET "technical_specs_software_version" = NULL
      WHERE "technical_specs_software_version" ~ ' 2022\\+$';

    -- 2. Post-condition: a survivor is a failure, not a report.
    DO $$
    DECLARE surviving bigint;
    BEGIN
      SELECT count(*) INTO surviving
      FROM "products"
      WHERE "technical_specs_software_version" ~ ' 2022\\+$';

      IF surviving > 0 THEN
        RAISE EXCEPTION 'phase15: % product(s) still carry the invented '' 2022+'' version after the purge', surviving;
      END IF;
    END $$;
  `)
}

/**
 * Phase 15 has no honest generic `down()`, so this is a documented no-op rather than a TODO.
 *
 * `up()` removed data the schema cannot re-derive, and the rollback is a **file**, not a query:
 * `web/src/migrations/data/phase15-invented-spec-versions.tsv` holds the 161 `(id, value)` pairs, and
 * those ids describe the development database the snapshot was taken from. In any other database id
 * 42 is a different product, so replaying the snapshot there would write an invented version into a
 * row it never belonged to — precisely the class of claim this migration exists to remove. A generic
 * `down()` cannot be honest about ids it has never seen, so it does not pretend to be.
 *
 * Restoring is a deliberate, per-database act: run the restore statement in the header above (or
 * `restoreStatement()` below, which builds the same SQL from `PURGED_VALUES`) against the database
 * whose ids the snapshot holds. Measured on `kientaohub`, 2026-09-22: `payload migrate:down` leaves
 * the pattern count at 0 — the values do not come back.
 */
export async function down(_args: MigrateDownArgs): Promise<void> {
  // Intentionally empty: see this function's comment and the header of this file.
}

/**
 * The 161 `(id, value)` pairs of `data/phase15-invented-spec-versions.tsv`, mirroring that file
 * row-for-row so the restore path and the committed snapshot cannot drift apart silently.
 */
export const PURGED_VALUES: ReadonlyArray<readonly [number, string]> = [
  [1, 'AutoCAD 2022+'],
  [2, 'AutoCAD 2022+'],
  [3, 'Revit 2022+'],
  [4, 'AutoCAD 2022+'],
  [5, 'Revit 2022+'],
  [6, 'SketchUp 2022+'],
  [7, 'AutoCAD 2022+'],
  [8, 'Revit 2022+'],
  [9, 'AutoCAD 2022+'],
  [10, 'Revit 2022+'],
  [11, 'Revit 2022+'],
  [12, 'SketchUp 2022+'],
  [13, 'SketchUp 2022+'],
  [14, 'AutoCAD 2022+'],
  [15, 'Revit 2022+'],
  [16, 'AutoCAD 2022+'],
  [17, 'AutoCAD 2022+'],
  [18, 'Revit 2022+'],
  [19, 'AutoCAD 2022+'],
  [20, 'Revit 2022+'],
  [21, 'AutoCAD 2022+'],
  [22, 'AutoCAD 2022+'],
  [23, 'Revit 2022+'],
  [24, 'AutoCAD 2022+'],
  [25, 'AutoCAD 2022+'],
  [26, 'Revit 2022+'],
  [27, 'AutoCAD 2022+'],
  [28, 'AutoCAD 2022+'],
  [29, 'AutoCAD 2022+'],
  [30, 'Revit 2022+'],
  [31, 'AutoCAD 2022+'],
  [32, 'AutoCAD 2022+'],
  [33, 'AutoCAD 2022+'],
  [34, 'AutoCAD 2022+'],
  [35, 'Revit 2022+'],
  [36, 'AutoCAD 2022+'],
  [37, 'AutoCAD 2022+'],
  [38, 'AutoCAD 2022+'],
  [39, 'AutoCAD 2022+'],
  [40, 'Revit 2022+'],
  [41, 'Revit 2022+'],
  [42, 'AutoCAD 2022+'],
  [43, 'AutoCAD 2022+'],
  [44, 'Revit 2022+'],
  [45, 'AutoCAD 2022+'],
  [46, 'Revit 2022+'],
  [47, 'AutoCAD 2022+'],
  [48, 'AutoCAD 2022+'],
  [49, 'AutoCAD 2022+'],
  [50, 'Revit 2022+'],
  [51, 'AutoCAD 2022+'],
  [52, 'AutoCAD 2022+'],
  [53, 'AutoCAD 2022+'],
  [54, 'AutoCAD 2022+'],
  [55, 'AutoCAD 2022+'],
  [56, 'Revit 2022+'],
  [57, 'AutoCAD 2022+'],
  [58, 'AutoCAD 2022+'],
  [59, 'AutoCAD 2022+'],
  [60, 'AutoCAD 2022+'],
  [61, 'AutoCAD 2022+'],
  [62, 'Revit 2022+'],
  [63, 'Revit 2022+'],
  [64, 'Revit 2022+'],
  [65, 'Revit 2022+'],
  [66, 'Revit 2022+'],
  [67, 'Revit 2022+'],
  [68, 'Revit 2022+'],
  [69, 'Revit 2022+'],
  [70, 'Revit 2022+'],
  [71, 'Revit 2022+'],
  [72, 'Revit 2022+'],
  [73, 'Revit 2022+'],
  [74, 'Revit 2022+'],
  [75, 'Revit 2022+'],
  [76, 'Revit 2022+'],
  [77, 'Revit 2022+'],
  [78, 'Revit 2022+'],
  [79, 'Revit 2022+'],
  [80, 'Revit 2022+'],
  [81, 'Revit 2022+'],
  [82, '3ds Max 2022+'],
  [83, 'SketchUp 2022+'],
  [84, '3ds Max 2022+'],
  [85, 'SketchUp 2022+'],
  [86, '3ds Max 2022+'],
  [87, 'SketchUp 2022+'],
  [88, '3ds Max 2022+'],
  [89, 'SketchUp 2022+'],
  [90, '3ds Max 2022+'],
  [91, 'SketchUp 2022+'],
  [92, '3ds Max 2022+'],
  [93, 'SketchUp 2022+'],
  [94, '3ds Max 2022+'],
  [95, 'SketchUp 2022+'],
  [96, '3ds Max 2022+'],
  [97, 'SketchUp 2022+'],
  [98, '3ds Max 2022+'],
  [99, 'SketchUp 2022+'],
  [100, '3ds Max 2022+'],
  [101, 'SketchUp 2022+'],
  [102, 'AutoCAD 2022+'],
  [103, 'AutoCAD 2022+'],
  [104, 'AutoCAD 2022+'],
  [105, 'AutoCAD 2022+'],
  [106, 'AutoCAD 2022+'],
  [107, 'AutoCAD 2022+'],
  [108, 'AutoCAD 2022+'],
  [109, 'AutoCAD 2022+'],
  [110, 'AutoCAD 2022+'],
  [111, 'AutoCAD 2022+'],
  [112, 'Revit 2022+'],
  [113, 'AutoCAD 2022+'],
  [114, 'PDF / Vector 2022+'],
  [115, 'AutoCAD 2022+'],
  [116, 'AutoCAD 2022+'],
  [117, 'AutoCAD 2022+'],
  [118, 'AutoCAD 2022+'],
  [119, 'AutoCAD 2022+'],
  [120, 'AutoCAD 2022+'],
  [121, 'AutoCAD 2022+'],
  [122, 'SketchUp 2022+'],
  [123, '3ds Max 2022+'],
  [124, 'AutoCAD 2022+'],
  [125, 'SketchUp 2022+'],
  [126, '3ds Max 2022+'],
  [127, 'AutoCAD 2022+'],
  [128, 'SketchUp 2022+'],
  [129, 'SketchUp 2022+'],
  [130, '3ds Max 2022+'],
  [131, 'SketchUp 2022+'],
  [132, 'AutoCAD 2022+'],
  [133, 'SketchUp 2022+'],
  [134, 'AutoCAD 2022+'],
  [135, 'SketchUp 2022+'],
  [136, '3ds Max 2022+'],
  [137, '3ds Max 2022+'],
  [138, 'SketchUp 2022+'],
  [139, '3ds Max 2022+'],
  [140, 'AutoCAD 2022+'],
  [141, '3ds Max 2022+'],
  [142, 'SketchUp 2022+'],
  [143, 'AutoCAD 2022+'],
  [144, 'SketchUp 2022+'],
  [145, 'Lumion 2022+'],
  [146, 'SketchUp 2022+'],
  [147, 'AutoCAD 2022+'],
  [148, 'AutoCAD 2022+'],
  [149, 'SketchUp 2022+'],
  [150, 'AutoCAD 2022+'],
  [151, 'SketchUp 2022+'],
  [152, 'PDF / Vector 2022+'],
  [153, 'AutoCAD 2022+'],
  [154, 'AutoCAD 2022+'],
  [155, 'AutoCAD 2022+'],
  [156, 'Revit 2022+'],
  [157, 'SketchUp 2022+'],
  [158, 'AutoCAD 2022+'],
  [159, 'AutoCAD 2022+'],
  [160, 'AutoCAD 2022+'],
  [161, 'AutoCAD 2022+'],
]

const quoteLiteral = (value: string): string => `'${value.replace(/'/g, "''")}'`

/** Builds the exact restore statement for a snapshot (defaults to the committed one). */
export const restoreStatement = (
  values: ReadonlyArray<readonly [number, string]> = PURGED_VALUES,
): string =>
  [
    'UPDATE "products" AS p',
    '  SET "technical_specs_software_version" = v.value',
    '  FROM (VALUES',
    values.map(([id, value]) => `    (${id}, ${quoteLiteral(value)})`).join(',\n'),
    '  ) AS v(id, value)',
    '  WHERE p.id = v.id;',
  ].join('\n')
