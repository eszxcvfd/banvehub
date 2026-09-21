/**
 * Verifier instrument for task `t34` — no buyer surface claims a version the record does not hold.
 *
 * Written by `verifier` for this task. It does NOT run or cite the author's instrument
 * (`web/tests/e2e/probe-version-claims.mts`) or their challenger spec.
 *
 * Sections:
 *   chain      — the version chain in `orders/[id]/page.tsx`: every field it reads is checked against the
 *                Products declaration (collection file and `payload-types.ts`); a field no schema declares
 *                fails, and a fabricated fallback literal in the chain fails.
 *   control    — the same analysis on a scratch copy of that page with the pre-t33 chain restored must
 *                FAIL and name the fabricated text (the instrument's negative control).
 *   search     — the empty-value claim class counted across `web/src` (`Tất cả phiên bản` must be 0).
 *   order      — the rendered buyer order page in Chromium: the 'Phiên bản phần mềm' cell of the row for
 *                the order's product, compared with that product's `technical_specs_software_version`
 *                read with SQL.
 *   jsdom      — the component-level renders (order table with a version-less item, description chip),
 *                run honestly and against scratch copies carrying the old fallbacks. This is labelled
 *                component-level evidence: no buyer order references a version-less product (SQL below),
 *                so the absence cannot be reached through a real order today.
 *   type       — the `OrderDetailItem.softwareVersion` declaration is quoted and must be optional and
 *                un-cast.
 *
 * Usage (from `web/`): NODE_OPTIONS="--no-deprecation --import=tsx/esm" node tests/e2e/probe-verify-version-claims.mts
 */
import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from '@playwright/test'

const HERE = dirname(fileURLToPath(import.meta.url))
const WEB = resolve(HERE, '../..')
const ROOT = resolve(WEB, '..')
const EVIDENCE = resolve(ROOT, '.lit/evidence/verifier-t34')
const SCRATCH = resolve(EVIDENCE, 'scratch')
const BASE = process.env.PROBE_BASE ?? 'http://localhost:3000'
const PASSWORD = process.env.PROBE_PASSWORD ?? 'KienTao@2026'
const ORDER_ID = process.env.PROBE_ORDER ?? '349'

const ORDER_PAGE = resolve(WEB, 'src/app/(app)/(account)/orders/[id]/page.tsx')
const COLLECTION = resolve(WEB, 'src/collections/Products/index.ts')
const TYPES = resolve(WEB, 'src/payload-types.ts')
const ORDER_CLIENT = resolve(WEB, 'src/components/orders/OrderDetailClient.tsx')

const results: Array<{ section: string; step: string; value: string; truth: string; ok: boolean }> = []
const reports: Array<{ section: string; step: string; value: string }> = []
const check = (section: string, step: string, value: string, truth: string, ok: boolean) => {
  results.push({ section, step, value, truth, ok })
  console.log(`  ${ok ? '[ ok ]' : '[FAIL]'} ${step}: "${value}" vs ${truth}`)
}
const info = (line: string) => console.log(line)
const report = (section: string, step: string, value: string) => {
  reports.push({ section, step, value })
  console.log(`  [info] REPORT ${step}: ${value}`)
}

const psql = (query: string): string[][] =>
  execFileSync(
    'docker',
    ['exec', 'kientaohub-postgres', 'psql', '-U', 'payload', '-d', 'kientaohub', '-t', '-A', '-F', '|', '-c', query],
    { encoding: 'utf8' },
  )
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.split('|'))

const login = async (email: string): Promise<string> => {
  const res = await fetch(`${BASE}/api/users/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: PASSWORD }),
  })
  const cookies: string[] = (res.headers as any).getSetCookie?.() ?? [res.headers.get('set-cookie') ?? '']
  const match = cookies.map((cookie) => /(^|,\s*)payload-token=([^;]+)/.exec(cookie || '')).find(Boolean)
  if (!match) throw new Error(`login failed: ${email}: ${res.status}`)
  return match[2]
}

// ---------------------------------------------------------------------------------------------
// the chain analysis: every field it reads must be declared, and no fabricated fallback
// ---------------------------------------------------------------------------------------------
type Finding = { kind: 'undeclared-field' | 'fabricated-fallback' | 'read-error'; detail: string }

const declaredFields = (): Set<string> => {
  const collection = readFileSync(COLLECTION, 'utf8')
  const groupStart = collection.indexOf("name: 'technicalSpecs'")
  const groupEnd = collection.indexOf("name: 'relatedProducts'", groupStart)
  const group = collection.slice(groupStart, groupEnd === -1 ? groupStart + 1200 : groupEnd)
  const names = new Set(Array.from(group.matchAll(/name:\s*'([a-zA-Z]+)'/g)).map((match) => match[1]))
  names.delete('technicalSpecs')
  const types = readFileSync(TYPES, 'utf8')
  const typeStart = types.indexOf('technicalSpecs?: {')
  const typeBlock = types.slice(typeStart, types.indexOf('};', typeStart))
  for (const match of typeBlock.matchAll(/^\s{4}([a-zA-Z]+)\??:/gm)) names.add(match[1])
  return names
}

const analyzeChain = (source: string): { findings: Finding[]; reads: string[]; chain: string } => {
  const findings: Finding[] = []
  const index = source.indexOf('const softwareVersion')
  if (index === -1) {
    findings.push({ kind: 'read-error', detail: 'const softwareVersion not found' })
    return { findings, reads: [], chain: '' }
  }
  const end = source.indexOf('\n', source.indexOf('\n', index) + 1)
  const chain = source.slice(index, end === -1 ? index + 400 : end)
  const reads = Array.from(
    new Set([
      ...Array.from(chain.matchAll(/(?:technicalSpecs|product)\??\.([a-zA-Z]+)/g)).map((m) => m[1]),
      // `(product as any)?.softwareSupport` — a cast hides the receiver from the simple pattern above.
      ...Array.from(chain.matchAll(/\(\s*[a-zA-Z_$][\w$]*\s+as\s+[\w<>\[\]| ]+\)\??\.([a-zA-Z_$][\w$]*)/g)).map((m) => m[1]),
    ]),
  )
  const declared = declaredFields()
  for (const field of reads) {
    if (!declared.has(field)) {
      findings.push({ kind: 'undeclared-field', detail: `${field} (not declared on Products/technicalSpecs)` })
    }
  }
  for (const match of chain.matchAll(/\|\|\s*'([^']{2,})'/g)) {
    findings.push({ kind: 'fabricated-fallback', detail: match[1] })
  }
  if (/Tất cả phiên bản/.test(chain)) {
    findings.push({ kind: 'fabricated-fallback', detail: 'Tất cả phiên bản' })
  }
  return { findings, reads, chain }
}

// ---------------------------------------------------------------------------------------------
// the empty-value claim class, counted across web/src
// ---------------------------------------------------------------------------------------------
const walk = (dir: string): string[] => {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) out.push(...walk(full))
    else out.push(full)
  }
  return out
}

const main = async () => {
  mkdirSync(SCRATCH, { recursive: true })

  // =============================================================================================
  // 1. the chain, at its source
  // =============================================================================================
  console.log('=== 1. the version chain in orders/[id]/page.tsx ===')
  const source = readFileSync(ORDER_PAGE, 'utf8')
  const declared = declaredFields()
  info(`  fields declared on Products/technicalSpecs (collection + payload-types): ${Array.from(declared).join(', ')}`)
  const analysed = analyzeChain(source)
  info(`  chain: ${analysed.chain.replace(/\s+/g, ' ').trim()}`)
  info(`  fields the chain reads: ${analysed.reads.join(', ') || '(none)'}`)
  for (const field of analysed.reads) {
    check('chain', `field "${field}" is declared by the schema`, declared.has(field) ? 'declared' : 'NOT DECLARED', 'declared', declared.has(field))
  }
  check('chain', 'the chain carries no fabricated fallback literal', JSON.stringify(analysed.findings), '[]', analysed.findings.length === 0)
  const ghostFields = ['version', 'softwareSupport'].filter((field) => new RegExp(`\\.${field}\\b`).test(analysed.chain))
  check('chain', 'the chain reads no ghost field (technicalSpecs.version / softwareSupport)', ghostFields.join(', ') || '(none)', '(none)', ghostFields.length === 0)

  // =============================================================================================
  // 2. the negative control: the same analysis on a scratch copy with the old chain
  // =============================================================================================
  console.log('')
  console.log('=== 2. NEGATIVE CONTROL: a scratch copy with the pre-t33 chain ===')
  const scratchCopy = resolve(SCRATCH, 'page.order-detail.fabricated.tsx.txt')
  const scratchSource = readFileSync(scratchCopy, 'utf8')
  const controlAnalysis = analyzeChain(scratchSource)
  info(`  scratch chain: ${controlAnalysis.chain.replace(/\s+/g, ' ').trim()}`)
  info(`  scratch findings: ${JSON.stringify(controlAnalysis.findings)}`)
  const controlFires = controlAnalysis.findings.length > 0
  check('control', 'the analysis FAILS on the scratch copy', String(controlAnalysis.findings.length) + ' finding(s)', '>= 1 finding', controlFires)
  check(
    'control',
    'the control names the fabricated text',
    controlAnalysis.findings.map((finding) => finding.detail).join('; ') || '(none)',
    'Tất cả phiên bản named',
    controlAnalysis.findings.some((finding) => finding.detail.includes('Tất cả phiên bản')),
  )
  check(
    'control',
    'the control also names the undeclared ghost fields',
    controlAnalysis.findings.filter((finding) => finding.kind === 'undeclared-field').map((finding) => finding.detail).join('; ') || '(none)',
    'version and softwareSupport reported',
    controlAnalysis.findings.some((finding) => finding.detail.startsWith('version')) &&
      controlAnalysis.findings.some((finding) => finding.detail.startsWith('softwareSupport')),
  )

  // =============================================================================================
  // 3. the empty-value claim class across web/src
  // =============================================================================================
  console.log('')
  console.log('=== 3. the empty-value claim class in web/src ===')
  const files = walk(resolve(WEB, 'src'))
  const blob = files.map((file) => readFileSync(file, 'utf8')).join('\n')
  info(`  scanned ${files.length} files under web/src`)
  const terms: Array<[string, boolean]> = [
    ['Tất cả phiên bản', true], // must be 0 — the fabricated claim this task is about
    ['Chưa khai báo', false], // the honest statement the cell makes instead
    ['Đang cập nhật', false],
    ['Không xác định', false],
    ['Chưa cập nhật', false],
    ['Không có phiên bản', false],
  ]
  for (const [term, mustBeZero] of terms) {
    const count = blob.split(term).length - 1
    report('search', `"${term}" occurrences in web/src`, String(count))
    if (mustBeZero) check('search', `"${term}" is gone from web/src`, String(count), '0', count === 0)
  }

  // =============================================================================================
  // 4. the rendered buyer order page (Chromium) vs SQL
  // =============================================================================================
  console.log('')
  console.log('=== 4. the rendered order page vs the record ===')
  const orderRow = psql(
    `select o.id, o.buyer_id, oi.product_id, coalesce(p.technical_specs_software_version,'NULL'), p.title from orders o join order_items oi on oi.order_id=o.id join products p on p.id=oi.product_id where o.id=${ORDER_ID} limit 1`,
  )[0]
  const versionlessInOrders = psql(
    `select count(*) from orders o join order_items oi on oi.order_id=o.id join products p on p.id=oi.product_id where p.technical_specs_software_version is null or p.technical_specs_software_version=''`,
  )[0]?.[0]
  info(`  SQL: order ${ORDER_ID} → product ${orderRow?.[2]} "${orderRow?.[4]}" version "${orderRow?.[3]}" (buyer ${orderRow?.[1]})`)
  info(`  SQL: orders referencing a version-less product: ${versionlessInOrders} (this is why the empty case is measured at component level below)`)
  check('order', 'the order has a recorded version to compare', String(orderRow?.[3] ?? 'NULL'), 'a non-empty value', Boolean(orderRow?.[3]) && orderRow![3] !== 'NULL')

  const buyerEmail = psql(`select email from users where id=${orderRow?.[1]}`)[0]?.[0] ?? ''
  info(`  buyer ${orderRow?.[1]} email (SQL): ${buyerEmail}`)
  const token = await login(buyerEmail)
  const browser = await chromium.launch({
    executablePath: [process.env.PROBE_CHROMIUM, join(homedir(), '.cache/ms-playwright/chromium-1234/chrome-linux64/chrome')]
      .filter(Boolean)
      .find((candidate) => existsSync(candidate as string)) as string | undefined,
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
  })
  const context = await browser.newContext()
  await context.addCookies([{ name: 'payload-token', value: token, url: BASE }])
  const page = await context.newPage()
  await page.goto(`${BASE}/orders/${ORDER_ID}`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(5000)
  const pageState = await page.evaluate(() => ({
    url: location.href,
    hasHeading: (document.body.innerText || '').includes('Phiên bản phần mềm'),
    text: (document.body.innerText || '').replace(/\s+/g, ' ').slice(0, 200),
  }))
  info(`  page url: ${pageState.url}; carries the column header: ${pageState.hasHeading}`)
  info(`  page text: ${pageState.text}`)
  const cell = await page.evaluate(() => {
    // Two tables render on this page (the order header and the item lines): resolve the one that owns
    // the 'Phiên bản phần mềm' column, then read that column from its first body row.
    const headerNodes = Array.from(document.querySelectorAll('th, [role="columnheader"]'))
    const headers = headerNodes.map((th) => (th.textContent || '').trim())
    const target = headerNodes.find((th) => (th.textContent || '').includes('Phiên bản phần mềm'))
    if (!target) return { headers, cell: null, firstRow: [], tables: document.querySelectorAll('table').length, snippet: '' }
    const table = target.closest('table') as HTMLTableElement | null
    const columnHeaders = table
      ? Array.from(table.querySelectorAll('thead th, thead [role="columnheader"]'))
      : [target]
    const index = columnHeaders.indexOf(target as Element)
    const headerLabel = (target.textContent || '').trim()
    const dataRows = table
      ? Array.from(table.querySelectorAll('tbody tr'))
          .filter((row) => row.querySelector('td') !== null)
          // antd v6 keeps a header replica inside the body markup; a data row's cell is not the header.
          .filter((row) => {
            const cells = Array.from(row.querySelectorAll('td')).map((td) => (td.textContent || '').trim())
            return cells[index] !== headerLabel
          })
      : []
    const firstRow = dataRows[0]
    const cells = firstRow ? Array.from(firstRow.querySelectorAll('td, [role="cell"]')).map((td) => (td.textContent || '').trim()) : []
    return {
      headers,
      cell: index === -1 ? null : (cells[index] ?? null),
      firstRow: cells.map((text) => text.slice(0, 30)),
      tables: document.querySelectorAll('table').length,
      snippet: document.body.innerHTML.replace(/\s+/g, ' ').slice(0, 400),
    }
  })
  info(`  table headers: ${JSON.stringify(cell.headers)}`)
  info(`  rendered "Phiên bản phần mềm" cell: ${JSON.stringify(cell.cell)} (tables: ${(cell as any).tables})`)
  info(`  first body row cells: ${JSON.stringify((cell as any).firstRow)}`)
  if (cell.cell === null) info(`  DOM snippet: ${String((cell as any).snippet).slice(0, 300)}`)
  check('order', 'the rendered cell shows the record value', String(cell.cell), String(orderRow?.[3]), cell.cell === orderRow?.[3])
  const pageText = await page.evaluate(() => document.body.innerText)
  check('order', 'the rendered order page carries no fabricated version claim', /Tất cả phiên bản/.test(pageText) ? 'present' : '(absent)', '(absent)', !/Tất cả phiên bản/.test(pageText))
  await context.close()
  await browser.close()

  // =============================================================================================
  // 5. component-level renders (labelled): honest vs the pre-t33 fallbacks
  // =============================================================================================
  console.log('')
  console.log('=== 5. component-level renders (jsdom) ===')
  const runner = resolve(SCRATCH, 'run-spec.mts')
  const runSpec = (spec: string, log: string): number => {
    const result = spawnSync('node', ['--import', 'tsx/esm', runner, spec, WEB], {
      cwd: WEB,
      encoding: 'utf8',
      // The probe itself runs under NODE_OPTIONS="--import=tsx/esm"; passing it on would register tsx
      // twice in the child and break ESM/CJS interop for the antd packages (measured).
      env: { ...process.env, NODE_OPTIONS: '--no-deprecation' },
    })
    writeFileSync(resolve(EVIDENCE, log), (result.stdout ?? '') + (result.stderr ?? ''))
    return result.status ?? 1
  }
  const honestExit = runSpec(resolve(SCRATCH, 'spec-honest.spec.tsx'), 'scratch/spec-honest.log')
  const mutatedExit = runSpec(resolve(SCRATCH, 'spec-mutated.spec.tsx'), 'scratch/spec-mutated.log')
  info(`  honest component render exit: ${honestExit}; mutated (pre-t33 fallbacks restored) exit: ${mutatedExit}`)
  check('jsdom', 'the component renders pass on the real components', String(honestExit), '0', honestExit === 0)
  check('jsdom', 'the same renders FAIL on scratch copies with the old fallbacks', String(mutatedExit), 'non-zero', mutatedExit !== 0)

  // =============================================================================================
  // 6. type honesty
  // =============================================================================================
  console.log('')
  console.log('=== 6. the OrderDetailItem declaration ===')
  const clientSource = readFileSync(ORDER_CLIENT, 'utf8')
  const declaration = /softwareVersion[^\n]*/.exec(clientSource)?.[0]?.trim() ?? '(not found)'
  info(`  quoted declaration: ${declaration}`)
  check('type', 'the declaration is optional', declaration, 'contains "?"', declaration.includes('?'))
  check('type', 'the version is not cast to a non-nullable string', /as string/.test(clientSource) ? 'has "as string"' : '(no cast)', '(no cast)', !/as string/.test(clientSource))
  check('type', 'the honest absence statement is rendered by that component', /Chưa khai báo/.test(clientSource) ? 'present' : '(absent)', 'present', /Chưa khai báo/.test(clientSource))

  const failed = results.filter((entry) => !entry.ok)
  console.log('')
  console.log(`checks: ${results.length}, failing: ${failed.length}`)
  for (const entry of failed) console.log(`  FAIL [${entry.section}] ${entry.step}: "${entry.value}" vs ${entry.truth}`)
  writeFileSync(
    resolve(EVIDENCE, 'probe-verify-version-claims.json'),
    JSON.stringify({ ranAt: new Date().toISOString(), orderId: ORDER_ID, orderRow, results, reports, jsdom: { honestExit, mutatedExit } }, null, 2),
  )
  console.log(failed.length === 0 ? 'VERSION-CLAIMS: PASS' : 'VERSION-CLAIMS: FAIL')
  process.exit(failed.length === 0 ? 0 : 1)
}

main().catch((error) => {
  console.error('probe crashed:', error)
  process.exit(2)
})
