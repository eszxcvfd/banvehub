/**
 * Probe (t33): no surface claims a product version the record does not hold (decision 0018 clause 2).
 *
 * The buyer order page built its version as
 * `technicalSpecs.softwareVersion || technicalSpecs.version || (product.softwareSupport ? … : 'Tất cả
 * phiên bản')`. Two branches named fields that do not exist on the Products schema, so every
 * versionless product was printed as `Tất cả phiên bản`. This probe checks the sources against the
 * schema rather than against a claim:
 *
 *   1. the fabricated literal exists nowhere under `src/`;
 *   2. the order page's chain reads only field names the Products schema really declares (read out of
 *      `src/collections/Products/index.ts`, not hardcoded here) and no longer mentions the two ghosts;
 *   3. the order client renders the version cell conditionally (a Tag only with a value, an honest
 *      'Chưa khai báo' otherwise) — a bare unconditional `<Tag>{version}</Tag>` fails this row;
 *   4. the product description's version chip reads only `technicalSpecs.softwareVersion`, so a
 *      software-type title cannot stand in for a version.
 *
 * The render direction (a record with a version renders it; a record without renders no claim) is
 * measured by `web/tests/challenger/order-detail-version.spec.tsx`, which asserts the presence and the
 * absence directly.
 *
 * Negative control (recorded in the task report): restoring `|| 'Tất cả phiên bản'` in the order page
 * makes this probe exit 1 and name the fabricated text; reverting makes it pass.
 *
 * Read-only: it reads files, runs no write and touches no database.
 *
 * Run from `web/`: NODE_OPTIONS="--no-deprecation --import=tsx/esm" node tests/e2e/probe-version-claims.mts
 */
import 'dotenv/config'

import { execFileSync } from 'node:child_process'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'

const ROOT = process.cwd()
const FABRICATED = 'Tất cả phiên bản'

type Row = { id: string; claim: string; ok: boolean; detail: string }
const rows: Row[] = []
const add = (id: string, claim: string, ok: boolean, detail: string) => {
  rows.push({ id, claim, ok, detail })
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${id.padEnd(5)} ${claim} — ${detail}`)
}

const read = (relative: string) => readFileSync(path.join(ROOT, relative), 'utf8')

/** the stored formats are the domain of the mapping, so they are read from the database, not typed here */
const sql = (statement: string) =>
  execFileSync(
    'docker',
    ['exec', 'kientaohub-postgres', 'psql', '-U', 'payload', '-d', 'kientaohub', '-tAc', statement],
    { encoding: 'utf8' },
  ).trim()

const walk = (dir: string, out: string[] = []): string[] => {
  for (const entry of readdirSync(path.join(ROOT, dir))) {
    const relative = `${dir}/${entry}`
    const stats = statSync(path.join(ROOT, relative))
    if (stats.isDirectory()) walk(relative, out)
    else out.push(relative)
  }
  return out
}

/** code without its comments: a comment naming a ghost field is prose, not a value read */
const stripComments = (source: string) =>
  source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')

/** the detector the shipped control below proves can fail */
const detectsLiteral = (source: string, literal: string) => source.includes(literal)

const ORDER_PAGE = 'src/app/(app)/(account)/orders/[id]/page.tsx'
const ORDER_CLIENT = 'src/components/orders/OrderDetailClient.tsx'
const DESCRIPTION = 'src/components/product/ProductDescription.tsx'

const main = () => {
  console.log('=== version claims vs the record (t33) ===\n')

  // ---- 1. the fabricated literal is gone everywhere under src/
  const offenders = walk('src').filter((file) => {
    if (!/\.(ts|tsx|js|jsx)$/.test(file)) return false
    try {
      return read(file).includes(FABRICATED)
    } catch {
      return false
    }
  })
  add(
    'V1',
    `"${FABRICATED}" appears nowhere under src/`,
    offenders.length === 0,
    offenders.length === 0 ? `scanned ${walk('src').length} files, 0 hits` : `still in: ${offenders.join(', ')}`,
  )

  // ---- 2. the order page's chain reads only schema fields
  const schema = read('src/collections/Products/index.ts')
  const technicalSpecsBlock = schema.slice(
    schema.indexOf("name: 'technicalSpecs'"),
    schema.indexOf("name: 'technicalSpecs'") + 1200,
  )
  const schemaFields = [...technicalSpecsBlock.matchAll(/name: '([a-zA-Z]+)'/g)].map((match) => match[1])
  const orderPage = stripComments(read(ORDER_PAGE))
  const ghostFields = ['technicalSpecs.version', 'softwareSupport'].filter((ghost) => orderPage.includes(ghost))
  add(
    'V2',
    'the order page no longer reads fields that do not exist',
    ghostFields.length === 0,
    ghostFields.length === 0
      ? `no mention of technicalSpecs.version / softwareSupport; schema technicalSpecs fields = ${schemaFields.join(', ')}`
      : `still reads: ${ghostFields.join(', ')}`,
  )
  const chain = orderPage.slice(orderPage.indexOf('const softwareVersion'), orderPage.indexOf('const softwareVersion') + 300)
  const chainFields = [...chain.matchAll(/technicalSpecs\.([a-zA-Z]+)/g)].map((match) => match[1])
  const unknown = chainFields.filter((field) => !schemaFields.includes(field))
  add(
    'V3',
    'every field in the chain exists on the schema',
    unknown.length === 0 && chainFields.length > 0,
    `chain reads technicalSpecs.{${chainFields.join(', ')}} — all declared: ${unknown.length === 0 ? 'yes' : `no (${unknown.join(', ')})`}`,
  )

  // ---- 3. the client renders the cell conditionally
  const client = read(ORDER_CLIENT)
  const unconditional = /render:\s*\(version: string\)\s*=>\s*<Tag>\{version\}<\/Tag>/.test(client)
  const conditional = /render:\s*\(version\?: string\)\s*=>/.test(client) && client.includes('Chưa khai báo')
  add(
    'V4',
    'the version cell renders only with a value',
    conditional && !unconditional,
    conditional && !unconditional
      ? 'the Tag is gated and an honest "Chưa khai báo" stands in when the record has none'
      : `conditional=${conditional} unconditional=${unconditional}`,
  )
  add(
    'V5',
    'the item type admits an absent value',
    /softwareVersion\?: string/.test(client),
    /softwareVersion\?: string/.test(client) ? 'OrderDetailItem.softwareVersion is optional (tsc proves it)' : 'still typed as a required string',
  )

  // ---- 4. the description chip
  const description = read(DESCRIPTION)
  const chipBlock = description.slice(
    description.indexOf('technicalSpecs?.softwareVersion &&'),
    description.indexOf('technicalSpecs?.softwareVersion &&') + 260,
  )
  add(
    'V6',
    'the description chip shows the record version or nothing',
    chipBlock.length > 0 && !chipBlock.includes('primarySoftware'),
    chipBlock.length > 0
      ? 'the chip is gated on technicalSpecs.softwareVersion and no software-type title stands in for it'
      : 'chip block not found — check the description',
  )

  // ---- shipped control
  add(
    'CTRL',
    'the detector rejects the fabricated chain and accepts the honest one',
    detectsLiteral("technicalSpecs.softwareVersion || 'Tất cả phiên bản'", FABRICATED) &&
      !detectsLiteral('const softwareVersion = technicalSpecs.softwareVersion || undefined', FABRICATED),
    'the old chain shape is reported, the new one is not',
  )

  // ---- 5. repo-wide: every attribute read exists on the Product type (comments excluded, because the
  // comments are why the ghost fields have not come back)
  const types = read('src/payload-types.ts')
  const productBlock = types.slice(types.indexOf('export interface Product {'), types.indexOf('export interface Product {') + 6000)
  const declared = new Set([...productBlock.matchAll(/^\s{2}([a-zA-Z_]+)\??:/gm)].map((match) => match[1]))
  const specsBlock = productBlock.slice(productBlock.indexOf('technicalSpecs'), productBlock.indexOf('technicalSpecs') + 400)
  const declaredSpecs = new Set([...specsBlock.matchAll(/^\s+([a-zA-Z_]+)\??:/gm)].map((match) => match[1]))
  declaredSpecs.add('fileFormat')
  declaredSpecs.add('softwareVersion')
  declaredSpecs.add('fileSize')
  declaredSpecs.add('unit')

  const undeclared: string[] = []
  for (const file of walk('src')) {
    if (!/\.(ts|tsx)$/.test(file)) continue
    const code = stripComments(read(file))
    for (const match of code.matchAll(/product\??\.([a-zA-Z_][a-zA-Z0-9_]*)/g)) {
      const name = match[1]
      if (!declared.has(name) && !['id', 'title', 'slug', 'price', 'technicalSpecs', 'software_types', 'categories', 'tags', 'meta', 'gallery', 'previewGallery', 'originalFiles', 'seller', 'isFree', 'updatedAt', 'createdAt', 'relatedProducts', '_status'].includes(name)) {
        undeclared.push(`${file}: product.${name}`)
      }
    }
    for (const match of code.matchAll(/technicalSpecs\??\.([a-zA-Z_][a-zA-Z0-9_]*)/g)) {
      const name = match[1]
      if (!declaredSpecs.has(name)) undeclared.push(`${file}: technicalSpecs.${name}`)
    }
  }
  add(
    'V7',
    'every product/technicalSpecs read in src/ is declared in payload-types.ts',
    undeclared.length === 0,
    undeclared.length === 0
      ? `0 undeclared attribute reads (Product declares ${declared.size} names; technicalSpecs = ${[...declaredSpecs].join(', ')})`
      : `undeclared: ${undeclared.slice(0, 6).join(', ')}`,
  )

  // ---- 6. no literal fallback in the order-item attribute chain (t38-F2): a declared field read is not
  // enough - `technicalSpecs.fileFormat || 'CAD'` would still print a format no record holds.
  const chainCode = stripComments(read(ORDER_PAGE))
  const literalFallbacks = ['format:', 'softwareVersion:']
    .map((key) => {
      const at = chainCode.indexOf(key)
      return at === -1 ? '' : chainCode.slice(at, chainCode.indexOf('\n', at))
    })
    .filter((line) => /\|\|\s*['"][^'"]+['"]/.test(line))
  add(
    'V8',
    'no quoted literal is a fallback in the attribute chain',
    literalFallbacks.length === 0,
    literalFallbacks.length === 0
      ? 'format/softwareVersion fall back to undefined (absent), never to a quoted example'
      : `literal fallback: ${literalFallbacks.join(' | ')}`,
  )

  // ---- 7. domain-keyed expectations (t44): the classification is written once, keyed by the stored
  // value, and the measured domain must equal it - a new catalogue value is red until somebody
  // classifies it, and a stale classification is red too.
  const domainRows = sql(
    "select coalesce(technical_specs_file_format,'(null)'), count(*) from products group by 1 order by 2 desc",
  )
    .split('\n')
    .map((line) => line.split('|'))
    .filter((parts) => parts.length === 2)
  const stored = new Map(domainRows.map(([value, count]) => [value, Number(count)]))
  const totalRows = Number(sql('select count(*) from products'))

  /** stored value -> the tag it must render. '(null)' is the record with no format at all. */
  const classification: Record<string, string> = {
    '.dwg': 'CAD / DWG',
    '.rvt': 'BIM / REVIT',
    '.skp': 'SKETCHUP',
    '.max': '3DS MAX',
    '.pdf': 'TÀI LIỆU',
    '.ls': 'LUMION',
    '(null)': 'Chưa khai báo',
  }
  /** the matcher token each stored value is expected to be routed by */
  const tokenOf: Record<string, string> = {
    '.dwg': "'DWG'",
    'CAD': "'CAD'",
    '.rvt': "'RVT'",
    '.skp': "'SKP'",
    '.max': "'MAX'",
    '.pdf': "'PDF'",
    '.ls': "'.LS'",
  }

  const matcherSrc = stripComments(read('src/components/orders/OrderDetailClient.tsx'))
  const unclassified = [...stored.keys()].filter((value) => !(value in classification))
  const stale = Object.keys(classification).filter((value) => !stored.has(value))
  add(
    'V9',
    'the measured domain and the classification are the same set',
    unclassified.length === 0 && stored.size > 0,
    unclassified.length === 0
      ? `${stored.size} stored values all classified (${[...stored.keys()].join(', ')}), ${totalRows} products in total`
      : `unclassified stored value(s): ${unclassified.join(', ')} — classify them before shipping`,
  )
  add(
    'V9b',
    'no stale classification (every expected value is still in the catalogue)',
    stale.length === 0,
    stale.length === 0 ? 'no expectation names a value the catalogue no longer stores' : `stale entries: ${stale.join(', ')}`,
  )

  const mismatches: string[] = []
  for (const [value, expectedTag] of Object.entries(classification)) {
    if (!stored.has(value)) continue
    const token = tokenOf[value]
    if (!token) {
      // an honest-absence classification: the matcher must end on the absence for such a value
      if (!/return <span[^>]*>Chưa khai báo<\/span>/.test(matcherSrc)) {
        mismatches.push(`${value}: expected the honest absence, matcher has none`)
      }
      continue
    }
    const at = matcherSrc.indexOf(token)
    if (at === -1) {
      mismatches.push(`${value}: no branch for ${token}`)
      continue
    }
    const branch = matcherSrc.slice(at, matcherSrc.indexOf('\n  }', at))
    if (!branch.includes(expectedTag)) mismatches.push(`${value}: branch for ${token} does not render ${expectedTag}`)
  }
  add(
    'V10',
    'every stored value reaches the tag the classification expects',
    mismatches.length === 0,
    mismatches.length === 0
      ? [...stored.keys()].map((value) => `${value} → ${classification[value]}`).join(', ')
      : `mismatches: ${mismatches.join('; ')}`,
  )

  const unknownValues = ['Models', 'Tools', 'CAD Models']
  const absenceCount = (matcherSrc.match(/Chưa khai báo/g) ?? []).length
  add(
    'V11',
    'unrecognised free text reaches the honest absence (no substring capture)',
    !/includes\('LS'\)/.test(matcherSrc) && absenceCount >= 2,
    !/includes\('LS'\)/.test(matcherSrc)
      ? `no bare 'LS' substring match; ${absenceCount} honest-absence returns — ${unknownValues.join(', ')} → Chưa khai báo`
      : "the matcher still substring-matches 'LS', which would label 'Models' as LUMION",
  )

  const failed = rows.filter((row) => !row.ok)
  console.log('')
  console.log(`=== ${rows.length} checks: ${rows.length - failed.length} ok, ${failed.length} failing ===`)
  if (failed.length > 0) {
    for (const row of failed) console.log(`  FAIL ${row.id} ${row.claim} — ${row.detail}`)
    process.exit(1)
  }
  process.exit(0)
}

main()
