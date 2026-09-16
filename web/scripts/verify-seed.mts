/**
 * web/scripts/verify-seed.mts
 *
 * Repository-shipped validation runner for the realistic seed
 * (docs/plans/completed/realistic-db-seed.md).
 *
 * WHY THIS EXISTS
 * ---------------
 * .agents/ORIGINAL_REQUEST.md:909 requires that every number the plan states be
 * "derived by queries that ship with the repository and run as part of
 * validation, so they cannot drift from the database again. A number no probe
 * produces must not appear." Before this runner, the plan cited `verify_e9.sql`
 * and `verify_e10.sql` as the evidence behind its E9/E10 headline numbers while
 * NO `.sql` file existed anywhere in the repository -- a closed loop with no
 * database in it.
 *
 * WHAT IT DOES
 * ------------
 * Runs every `scripts/verify-seed/*.sql` file against the live database, in
 * filename order, and prints a graded report. Each probe emits tab-separated
 * rows of the form:
 *
 *     PROBE <criterion> <measured value> <threshold> <PASS|FAIL|INFO>
 *
 * The runner parses those rows, tallies PASS/FAIL, and exits non-zero if ANY
 * probe FAILs (or if a probe file errors outright, which is itself a failure --
 * a probe that cannot run cannot report a number).
 *
 * THRESHOLDS
 * ----------
 * Thresholds are NOT set here. They live beside the query they grade, inside
 * each .sql file, together with the source of the threshold and what the
 * passing value means about the domain (durable rule §9). A threshold is never
 * weakened to make a measurement pass: the probe reports the measured value
 * next to the threshold and prints FAIL when they disagree.
 *
 * DB ACCESS
 * ---------
 * `psql` is NOT installed on the host. Every query goes through
 *     docker exec -i kientaohub-postgres psql -U payload -d kientaohub
 * The `-i` is REQUIRED: without it `psql -f -` reads nothing from stdin and
 * returns a false-clean empty result. Override the target with
 * VERIFY_SEED_CONTAINER / VERIFY_SEED_DB / VERIFY_SEED_PGUSER.
 *
 * Probes are READ-ONLY (SELECT only). This runner never writes to the database.
 *
 * USAGE
 * -----
 *   pnpm verify:seed                     # every probe
 *   pnpm verify:seed verify_e9           # only files whose name contains the arg
 *   pnpm verify:seed --quiet             # graded lines only
 *
 * Exit codes: 0 = every graded probe PASSed; 1 = at least one FAIL or error.
 */

import { spawnSync } from 'child_process'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const PROBE_DIR = path.join(__dirname, 'verify-seed')

const CONTAINER = process.env.VERIFY_SEED_CONTAINER ?? 'kientaohub-postgres'
const PGUSER = process.env.VERIFY_SEED_PGUSER ?? 'payload'
const PGDB = process.env.VERIFY_SEED_DB ?? 'kientaohub'

const argv = process.argv.slice(2)
const QUIET = argv.includes('--quiet')
const FILTERS = argv.filter((a) => !a.startsWith('--'))

type Verdict = 'PASS' | 'FAIL' | 'INFO'

interface GradedLine {
  file: string
  criterion: string
  measured: string
  threshold: string
  verdict: Verdict
}

/** Run one .sql file and return raw stdout, stderr and exit status. */
function runProbe(file: string): { stdout: string; stderr: string; status: number } {
  const sql = fs.readFileSync(file, 'utf8')

  // `-f -` reads the script from stdin; `-i` on docker exec is REQUIRED for
  // stdin to reach the container at all. `-t -A` strips headers/alignment so
  // the output is machine-parseable. `-v ON_ERROR_STOP=1` makes a SQL error a
  // non-zero exit rather than a silently truncated report.
  const res = spawnSync(
    'docker',
    [
      'exec',
      '-i',
      CONTAINER,
      'psql',
      '-U',
      PGUSER,
      '-d',
      PGDB,
      '-v',
      'ON_ERROR_STOP=1',
      '-t',
      '-A',
      '-f',
      '-',
    ],
    { input: sql, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
  )

  return {
    stdout: res.stdout ?? '',
    stderr: res.stderr ?? '',
    status: res.status ?? (res.error ? 1 : 0),
  }
}

function main(): void {
  if (!fs.existsSync(PROBE_DIR)) {
    console.error(`✗ probe directory not found: ${PROBE_DIR}`)
    process.exit(1)
  }

  let files = fs
    .readdirSync(PROBE_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort()

  if (FILTERS.length > 0) {
    files = files.filter((f) => FILTERS.some((needle) => f.includes(needle)))
  }

  if (files.length === 0) {
    console.error(`✗ no .sql probes matched${FILTERS.length ? `: ${FILTERS.join(', ')}` : ''}`)
    process.exit(1)
  }

  console.log(`=== verify:seed -- ${files.length} probe file(s) against ${CONTAINER}/${PGDB} ===`)
  console.log(`    target: docker exec -i ${CONTAINER} psql -U ${PGUSER} -d ${PGDB}`)
  console.log(`    mode:   read-only (SELECT-only probes)`)
  console.log('')

  const graded: GradedLine[] = []
  const erroredFiles: string[] = []

  for (const file of files) {
    const full = path.join(PROBE_DIR, file)
    console.log(`--- ${file} ---`)

    const { stdout, stderr, status } = runProbe(full)

    // Raw probe output, unchanged. Section headers from \echo come through too,
    // so the log reads as a measurement, not a bare verdict.
    if (!QUIET) {
      for (const raw of stdout.split('\n')) {
        if (raw.trim() === '') continue
        // Keep non-graded informational lines visible; graded lines are
        // re-printed in the summary below. Skipping them here would hide the
        // measurement context, so we print everything.
        console.log(`    ${raw}`)
      }
    } else {
      for (const raw of stdout.split('\n')) {
        if (/^(PROBE|COUNTS)\t/.test(raw)) console.log(`    ${raw}`)
      }
    }

    for (const raw of stdout.split('\n')) {
      const cols = raw.split('\t')
      if (cols.length < 5) continue
      if (cols[0] !== 'PROBE' && cols[0] !== 'COUNTS') continue
      const verdict = cols[4].trim()
      if (verdict !== 'PASS' && verdict !== 'FAIL' && verdict !== 'INFO') continue
      graded.push({
        file,
        criterion: cols[1].trim(),
        measured: cols[2].trim(),
        threshold: cols[3].trim(),
        verdict: verdict as Verdict,
      })
    }

    if (status !== 0) {
      erroredFiles.push(file)
      console.log(`    ✗ probe ERRORED (psql exit ${status}) -- an unrunnable probe is a FAIL`)
      if (stderr.trim()) {
        for (const line of stderr.trim().split('\n')) console.log(`      ! ${line}`)
      }
    }

    console.log('')
  }

  const fails = graded.filter((g) => g.verdict === 'FAIL')
  const passes = graded.filter((g) => g.verdict === 'PASS')
  const infos = graded.filter((g) => g.verdict === 'INFO')

  console.log('='.repeat(78))
  console.log('SUMMARY -- measured value vs threshold')
  console.log('='.repeat(78))
  for (const g of graded) {
    const tag = g.verdict === 'PASS' ? 'PASS' : g.verdict === 'FAIL' ? 'FAIL' : 'INFO'
    console.log(`[${tag}] ${g.criterion}`)
    console.log(`        measured : ${g.measured}`)
    console.log(`        required : ${g.threshold}`)
  }

  console.log('')
  console.log('='.repeat(78))
  console.log(
    `RESULT: ${passes.length} PASS / ${fails.length} FAIL / ${infos.length} INFO` +
      `  across ${files.length} probe file(s)` +
      (erroredFiles.length ? `  (${erroredFiles.length} file(s) errored)` : ''),
  )
  if (fails.length > 0) {
    console.log('')
    console.log('Failing criteria:')
    for (const f of fails) {
      console.log(`  - [${f.file}] ${f.criterion}  measured=${f.measured}  required=${f.threshold}`)
    }
  }
  if (erroredFiles.length > 0) {
    console.log('')
    console.log('Errored probe files:')
    for (const f of erroredFiles) console.log(`  - ${f}`)
  }
  console.log('='.repeat(78))

  process.exit(fails.length > 0 || erroredFiles.length > 0 ? 1 : 0)
}

main()
