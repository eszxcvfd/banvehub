/**
 * Verifier instrument for task `t24` — the VN address country, record-backed product attributes and the
 * revenue-share / loyalty claims, measured on the running app and in Postgres.
 *
 * Written by `verifier` for this task. It does NOT run or cite the implementers' probes
 * (`tests/helpers/probe-phase14-address-countries.mts`, `tests/e2e/probe-product-attributes-provenance.mts`).
 *
 * Sections (`--section=all|address|literals|write|revenue|loyalty`, default all):
 *   address  — the browser's address form: which country the select shows selected and what the first
 *              option is; saving an address with country VN and reading it back with SQL; deleting it;
 *              a country outside the list being refused. `--expect-default=US` is the mutation control
 *              and must FAIL.
 *   literals — a product page with empty specs and one with filled specs swept for the six fabricated
 *              literals, with a scratch-copy negative control.
 *   write    — the seller product form driven in a browser with the version field untouched: the request
 *              body is captured and the created row's `technical_specs_software_version` is read with SQL.
 *   revenue  — the rendered revenue-share figure vs `(1 - commission_settings.default_rate) * 100`, with a
 *              mutation to 0.25 and a restore to 0.30 both shown by re-reading.
 *   loyalty  — the loyalty term set counted in `web/src`, `web/tests` and a fresh `pg_dump --data-only`
 *              (asserting the data carries none and every production hit is a comment), and `/wallet` +
 *              `/login` rendered to show they carry no points/coin/tier figure.
 *
 * Owner data it creates (addresses, a temporary product, commission_settings) is deleted or restored and
 * the restore is shown by re-reading. Application code is never modified.
 *
 * Usage (from `web/`): NODE_OPTIONS="--no-deprecation --import=tsx/esm" node tests/e2e/probe-verify-vn-and-attributes.mts
 */
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from '@playwright/test'

const HERE = dirname(fileURLToPath(import.meta.url))
const WEB = resolve(HERE, '../..')
const BASE = process.env.PROBE_BASE ?? 'http://localhost:3000'
const PASSWORD = process.env.PROBE_PASSWORD ?? 'KienTao@2026'
const EVIDENCE = resolve(WEB, '../.lit/evidence/verifier-t24')

const arg = (name: string, fallback?: string): string | undefined => {
  const hit = process.argv.find((value) => value.startsWith(`--${name}=`))
  return hit ? hit.slice(name.length + 3) : fallback
}
const SECTION = arg('section', 'all') as string
const EXPECT_DEFAULT = arg('expect-default', 'VN') as string
const MUTATE_LITERALS = arg('mutate-literals', '') as string
const wants = (section: string) => SECTION === 'all' || SECTION === section

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

// ---------------------------------------------------------------------------------------------
// Postgres (direct, not through the app)
// ---------------------------------------------------------------------------------------------
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

const one = (query: string): string => psql(query)[0]?.[0] ?? ''
const raw = (query: string): string =>
  execFileSync(
    'docker',
    ['exec', 'kientaohub-postgres', 'psql', '-U', 'payload', '-d', 'kientaohub', '-t', '-A', '-c', query],
    { encoding: 'utf8' },
  ).trim()

// ---------------------------------------------------------------------------------------------
// the app over HTTP
// ---------------------------------------------------------------------------------------------
const login = async (email: string): Promise<string> => {
  const res = await fetch(`${BASE}/api/users/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: PASSWORD }),
  })
  const cookies: string[] = (res.headers as any).getSetCookie?.() ?? [res.headers.get('set-cookie') ?? '']
  const match = cookies.map((cookie) => /(^|,\s*)payload-token=([^;]+)/.exec(cookie || '')).find(Boolean)
  if (!match) throw new Error(`login failed for ${email}: ${res.status}`)
  return match[2]
}

const htmlOf = async (path: string, token?: string): Promise<string> => {
  const res = await fetch(`${BASE}${path}`, { headers: token ? { Cookie: `payload-token=${token}` } : {} })
  return res.text()
}

const pageText = async (path: string, token?: string): Promise<string> => {
  const html = await htmlOf(path, token)
  return html
    .replace(/<script[\s\S]*?<\/script>/g, ' ')
    .replace(/<style[\s\S]*?<\/style>/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
}

// ---------------------------------------------------------------------------------------------
// the six fabricated literals
// ---------------------------------------------------------------------------------------------
const FABRICATED_LITERALS = [
  'Tệp kỹ thuật chuẩn',
  'Tương thích mọi phiên bản',
  'Đang cập nhật',
  'Hệ Mét (mm / m)',
  'Đa nền tảng CAD/BIM',
  'Hồ sơ kỹ thuật tổng hợp',
]
const countLiteral = (html: string, literal: string): number => html.split(literal).length - 1
const scanLiterals = (html: string): Array<{ literal: string; count: number }> =>
  FABRICATED_LITERALS.map((literal) => ({ literal, count: countLiteral(html, literal) }))

// ---------------------------------------------------------------------------------------------
// Payload local API (only to create/delete the temporary product; never to read the assertions)
// ---------------------------------------------------------------------------------------------
const payloadClient = async (): Promise<any> => {
  process.loadEnvFile(resolve(WEB, '.env'))
  const payloadMod: any = await import(resolve(WEB, 'node_modules/payload/dist/index.js'))
  const configMod: any = await import(resolve(WEB, 'src/payload.config.ts'))
  return payloadMod.getPayload({ config: configMod.default })
}

const LOYALTY_TERMS: Array<[string, RegExp]> = [
  ['điểm thưởng', /điểm thưởng/gi],
  ['điểm tích lũy', /điểm tích lũy/gi],
  ['tích xu / hoàn xu', /tích xu|hoàn xu/gi],
  ['loyalty', /\bloyalty\b/gi],
  ['reward(s)', /\brewards?\b/gi],
  ['coin(s)', /\bcoins?\b/gi],
  ['tier', /\btier\b/gi],
]

const main = async () => {
  const browser = await chromium.launch({
    executablePath: [process.env.PROBE_CHROMIUM, join(homedir(), '.cache/ms-playwright/chromium-1234/chrome-linux64/chrome')]
      .filter(Boolean)
      .find((candidate) => existsSync(candidate as string)) as string | undefined,
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
  })

  // =============================================================================================
  // ADDRESS — default, save with VN, refusal of an unknown country
  // =============================================================================================
  if (wants('address')) {
    console.log('=== ADDRESS (browser, buyer01) ===')
    const token = await login('buyer01@kientaohub.vn')
    const context = await browser.newContext()
    await context.addCookies([{ name: 'payload-token', value: token, url: BASE }])
    const page = await context.newPage()
    await page.goto(`${BASE}/account/addresses`, { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(2500)

    const listMod: any = await import(`${resolve(WEB, 'src/constants/countries.ts')}?t=${Date.now()}`)
    const countries: Array<{ value: string; label: string }> = listMod.SUPPORTED_COUNTRIES ?? []
    const expectedLabel = countries[0]?.label ?? '(list empty)'
    info(`  shared list: ${countries.length} entries, first = ${JSON.stringify(countries[0])}`)

    const openButton = page.getByRole('button', { name: /Thêm địa chỉ/ }).first()
    await openButton.waitFor({ state: 'visible', timeout: 20000 }).catch(() => {})
    await openButton.click()
    await page.waitForTimeout(1200)

    const modal = page.locator('.ant-modal').first()
    // Diagnostics: every form item with the value its select/input shows, so a wrong locator is visible.
    const itemDump = await modal.locator('.ant-form-item').evaluateAll((items) =>
      items.map((item) => {
        const label = (item.querySelector('label')?.textContent || '').trim()
        const selected = (item.querySelector('.ant-select-selection-item')?.textContent || '').trim()
        const input = (item.querySelector('input') as HTMLInputElement | null)?.value ?? ''
        return `${label} → select="${selected}" input="${input}"`
      }),
    )
    info(`  modal form items: ${JSON.stringify(itemDump)}`)
    const countryItem = modal.locator('.ant-form-item').filter({ has: page.locator('input#country') }).first()
    const countryBox = countryItem.locator('.ant-select').first()
    info(`  country control html: ${(await countryItem.locator('.ant-select').first().innerHTML().catch(() => '(none)')).replace(/\s+/g, ' ').slice(0, 700)}`)
    info(`  country control text: "${(await countryBox.innerText().catch(() => '')).replace(/\s+/g, ' ').trim()}"`)
    info(`  country form value via #country input value: "${await modal.locator('input#country').first().inputValue().catch(() => '?')}"`)
    info(`  validation errors present: ${JSON.stringify(await modal.locator('.ant-form-item-explain-error').allInnerTexts().catch(() => []))}`)
    // antd 6 renders the selected label in `.ant-select-content` (with a `title`), not in the v5
    // `.ant-select-selection-item`; read the control's own text and cross-check its title attribute.
    const selectedFromBox =
      (await countryItem.locator('.ant-select-content').first().innerText().catch(() => '')).replace(/\s+/g, ' ').trim() ||
      (await countryBox.innerText().catch(() => '')).replace(/\s+/g, ' ').trim()
    const selectedTitle = (await countryItem.locator('.ant-select-content').first().getAttribute('title').catch(() => null)) ?? ''
    await countryBox.click().catch(() => {})
    await page.waitForTimeout(600)
    const firstOption = (await page.locator('.ant-select-item-option').first().innerText().catch(() => '')).trim()
    const optionCount = await page.locator('.ant-select-item-option').count()
    info(`  select shows: "${selectedFromBox}"; first option "${firstOption}" of ${optionCount} rendered options`)
    const expectedSelected = EXPECT_DEFAULT === 'US' ? 'United States' : expectedLabel
    check('address', 'country select default (rendered)', selectedFromBox, `${expectedSelected}`, selectedFromBox === expectedSelected)
    check('address', 'the rendered default carries that label as its title attribute', selectedTitle, expectedSelected, selectedTitle === expectedSelected)
    check('address', 'first option in the list', firstOption, `the list’s first entry (${expectedLabel})`, firstOption === expectedLabel)
    check('address', 'the list’s first entry is VN', JSON.stringify(countries[0] ?? null), 'the first entry has value "VN"', countries[0]?.value === 'VN')
    await page.keyboard.press('Escape')
    await page.waitForTimeout(400)

    const marker = `t24 verifier ${Date.now()}`
    const fill = async (id: string, value: string) => {
      const field = modal.locator(`input#${id}`).first()
      const count = await field.count()
      if (count === 0) {
        info(`  fill: no input#${id} in the modal`)
        return
      }
      await field.fill(value).catch((error) => info(`  fill #${id} failed: ${(error as Error).message.slice(0, 80)}`))
      info(`  fill #${id} = "${value}" (now "${await field.inputValue().catch(() => '?')}")`)
    }
    await fill('lastName', 'T24')
    await fill('firstName', 'Verifier')
    await fill('phone', '0912345678')
    await fill('addressLine1', marker)
    await fill('city', 'Hà Nội')
    await fill('postalCode', '100000')
    const submitLabel = (await modal.locator('button[type="submit"]').first().innerText().catch(() => '')).trim()
    info(`  submit button: "${submitLabel}"`)
    const addressPosts: Array<{ status?: number; body?: string }> = []
    page.on('response', async (response) => {
      if (response.url().includes('/api/addresses') && response.request().method() === 'POST') {
        addressPosts.push({ status: response.status(), body: (await response.text().catch(() => '')).slice(0, 220) })
      }
    })
    await modal.locator('button[type="submit"]').first().click()
    await page.waitForTimeout(3500)
    info(`  POST /api/addresses responses: ${JSON.stringify(addressPosts)}`)
    const modalAfterSubmit = (await modal.innerText().catch(() => '')).replace(/\s+/g, ' ').slice(0, 300)
    info(`  modal after submit: ${modalAfterSubmit}`)
    info(`  validation errors after submit: ${JSON.stringify(await modal.locator('.ant-form-item-explain-error').allInnerTexts().catch(() => []))}`)

    const savedRow = psql(`select id, country, address_line1 from addresses where address_line1 = '${marker}' order by id desc limit 1`)[0]
    info(`  SQL read-back: ${savedRow ? savedRow.join(' | ') : '(no row)'}`)
    check('address', 'saved through the form, read back with SQL', savedRow ? savedRow[1] : '(no row)', 'VN', savedRow?.[1] === 'VN')
    const savedId = savedRow?.[0]

    const refused = await fetch(`${BASE}/api/addresses`, {
      method: 'POST',
      headers: { Cookie: `payload-token=${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ customer: 9, addressLine1: 't24 rejected', city: 'Hà Nội', country: 'ZZ' }),
    })
    const refusedBody = (await refused.text()).slice(0, 200)
    info(`  POST /api/addresses country=ZZ → ${refused.status} ${refusedBody}`)
    check('address', 'a country outside the list is refused', String(refused.status), '400', refused.status === 400)
    const refusedRows = one(`select count(*) from addresses where address_line1 = 't24 rejected'`)
    check('address', 'the refused body created no row', refusedRows, '0', refusedRows === '0')

    if (savedId) {
      const deleted = raw(`delete from addresses where id = ${savedId} returning id`)
      info(`  deletion of address ${savedId}: ${deleted}`)
      const remaining = one(`select count(*) from addresses where id = ${savedId}`)
      check('address', 'the verifier’s address is deleted', remaining, '0 rows left', remaining === '0')
    }
    await context.close()
  }

  // =============================================================================================
  // LITERALS — empty-specs and filled-specs product pages
  // =============================================================================================
  if (wants('literals')) {
    console.log('')
    console.log('=== FABRICATED LITERALS on rendered product pages ===')
    const payload = await payloadClient()
    let tempProductId: number | undefined
    try {
      const tempSlug = `t24-verifier-spec-less-${Date.now()}`
      const created = await payload.create({
        collection: 'products',
        data: { title: `T24 verifier spec-less product ${Date.now()}`, slug: tempSlug, _status: 'published', price: 0, isFree: true, seller: 4 },
        overrideAccess: true,
      })
      tempProductId = created.id
      const row = psql(
        `select id, coalesce(technical_specs_file_format::text,'NULL'), coalesce(technical_specs_file_size,'NULL'), coalesce(technical_specs_software_version::text,'NULL'), coalesce(technical_specs_unit::text,'NULL') from products where id = ${tempProductId}`,
      )[0]
      info(`  empty-specs product: id=${row?.[0]} format=${row?.[1]} size=${row?.[2]} version=${row?.[3]} unit=${row?.[4]}`)
      const emptyHtml = await htmlOf(`/products/${tempSlug}`)
      const filledRow = psql(
        `select id, slug, coalesce(technical_specs_file_format::text,'NULL'), coalesce(technical_specs_file_size,'NULL'), coalesce(technical_specs_software_version::text,'NULL'), coalesce(technical_specs_unit::text,'NULL') from products where id = 3`,
      )[0]
      info(`  filled-specs product: id=${filledRow?.[0]} slug=${filledRow?.[1]} format=${filledRow?.[2]} size=${filledRow?.[3]} version=${filledRow?.[4]} unit=${filledRow?.[5]}`)
      const filledHtml = await htmlOf(`/products/${filledRow?.[1]}`)

      // `--mutate-literals=<literal>` runs the whole check set against a scratch copy of the rendered
      // page carrying that literal: the instrument must FAIL, which is the negative control the
      // acceptance asks for. A normal run (no flag) must PASS.
      const subjectHtml = MUTATE_LITERALS
        ? emptyHtml.replace('</body>', `<div>${MUTATE_LITERALS}</div></body>`)
        : emptyHtml
      if (MUTATE_LITERALS) info(`  MUTATION: the empty-specs page is a scratch copy carrying "${MUTATE_LITERALS}" — the checks below must fail`)
      for (const [label, html] of [
        [MUTATE_LITERALS ? 'MUTATED scratch copy' : 'empty-specs page', subjectHtml],
        ['filled-specs page', filledHtml],
      ] as Array<[string, string]>) {
        for (const { literal, count } of scanLiterals(html)) {
          check('literals', `${label} contains "${literal}"`, String(count), '0 occurrences', count === 0)
        }
      }

      const injected = emptyHtml.replace('<body', '<body data-t24="Đang cập nhật" ')
      check('literals', 'NEGATIVE CONTROL: a scratch copy carrying one literal is detected', String(countLiteral(injected, 'Đang cập nhật')), '>= 1 occurrence', countLiteral(injected, 'Đang cập nhật') >= 1)
      check('literals', 'the same detector on the real page', String(countLiteral(emptyHtml, 'Đang cập nhật')), '0 occurrences', countLiteral(emptyHtml, 'Đang cập nhật') === 0)
    } finally {
      if (tempProductId) {
        await payload.delete({ collection: 'products', id: tempProductId, overrideAccess: true })
        info(`  temporary product ${tempProductId} deleted; rows left = ${one(`select count(*) from products where id = ${tempProductId}`)}`)
      }
    }
  }

  // =============================================================================================
  // WRITE SIDE — the seller form with the version field untouched
  // =============================================================================================
  if (wants('write')) {
    console.log('')
    console.log('=== SELLER FORM write side (seller01, version field untouched) ===')
    const token = await login('seller01@kientaohub.vn')
    const context = await browser.newContext()
    await context.addCookies([{ name: 'payload-token', value: token, url: BASE }])
    const page = await context.newPage()
    let captured: { body: any; status?: number; responseBody?: string } | null = null
    await page.route('**/api/seller/products', async (route) => {
      const request = route.request()
      try {
        captured = { body: request.postDataJSON() }
      } catch {
        captured = { body: request.postData() }
      }
      await route.continue()
    })
    page.on('response', async (response) => {
      if (response.url().includes('/api/seller/products') && captured) {
        captured.status = response.status()
        captured.responseBody = (await response.text().catch(() => '')).slice(0, 200)
      }
    })
    await page.goto(`${BASE}/seller/products/new`, { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(3000)
    const title = `t24 verifier seller-form ${Date.now()}`
    await page.locator('input#title').first().fill(title).catch(() => {})
    await page.getByRole('button', { name: /Lưu bản nháp/ }).first().click()
    await page.waitForTimeout(3500)

    if (!captured) {
      check('write', 'the form issued POST /api/seller/products', 'no request captured', 'a captured request', false)
    } else {
      const body = captured.body as Record<string, unknown>
      info(`  captured body: ${JSON.stringify(body).slice(0, 300)}`)
      info(`  response: ${captured.status} ${captured.responseBody ?? ''}`)
      const version = body?.softwareVersion
      check('write', 'captured body softwareVersion (field untouched)', JSON.stringify(version ?? null), '"" or absent — never a fabricated literal', version === '' || version === undefined || version === null)
      const created = psql(`select id, coalesce(technical_specs_software_version::text,'NULL') from products where title = '${title}' order by id desc limit 1`)[0]
      info(`  SQL read-back of the created row: ${created ? created.join(' | ') : '(no row)'}`)
      check('write', 'created product technical_specs_software_version', created ? created[1] : '(no row)', 'NULL or empty', created ? created[1] === 'NULL' || created[1] === '' : false)
      if (created?.[0]) {
        const payload = await payloadClient()
        await payload.delete({ collection: 'products', id: Number(created[0]), overrideAccess: true })
        info(`  created product ${created[0]} deleted; rows left = ${one(`select count(*) from products where id = ${created[0]}`)}`)
      }
    }
    await context.close()
  }

  // =============================================================================================
  // REVENUE SHARE
  // =============================================================================================
  if (wants('revenue')) {
    console.log('')
    console.log('=== REVENUE SHARE (rendered / vs commission_settings.default_rate) ===')
    const rate0 = Number(one('select default_rate from commission_settings limit 1'))
    const readRendered = async (): Promise<number | null> => {
      const match = /(\d+)\s*%\s*Chia sẻ doanh thu/.exec(await pageText('/'))
      return match ? Number(match[1]) : null
    }
    const expectedFor = (rate: number) => Math.round((1 - rate) * 100)
    const rendered0 = await readRendered()
    info(`  default_rate=${rate0} → (1-r)*100=${expectedFor(rate0)}; rendered=${rendered0}`)
    check('revenue', 'rendered share equals (1 - default_rate) * 100', String(rendered0), String(expectedFor(rate0)), rendered0 === expectedFor(rate0))

    try {
      raw(`update commission_settings set default_rate = 0.25`)
      const rate1 = Number(one('select default_rate from commission_settings limit 1'))
      const mutated = await readRendered()
      info(`  MUTATION: default_rate=${rate1} → expected ${expectedFor(rate1)}; rendered=${mutated}`)
      check('revenue', 'MUTATION: the rendered figure moved', String(mutated), String(expectedFor(rate1)), mutated === expectedFor(rate1))
    } finally {
      raw(`update commission_settings set default_rate = 0.30`)
    }
    const rateBack = Number(one('select default_rate from commission_settings limit 1'))
    const renderedBack = await readRendered()
    info(`  RESTORE: default_rate re-read = ${rateBack}; rendered=${renderedBack}`)
    check('revenue', 'restored setting re-read from SQL', String(rateBack), '0.3', rateBack === 0.3)
    check('revenue', 'restored rendered figure', String(renderedBack), String(expectedFor(rateBack)), renderedBack === expectedFor(rateBack))
  }

  // =============================================================================================
  // LOYALTY — counts in the source/tests, none in the data, none rendered
  // =============================================================================================
  if (wants('loyalty')) {
    console.log('')
    console.log('=== LOYALTY (term set in web/src, web/tests and a fresh pg_dump --data-only) ===')
    const grep = (root: string): Array<{ file: string; line: string }> =>
      execFileSync(
        'bash',
        ['-lc', `grep -rIn --exclude-dir=node_modules -E "điểm thưởng|điểm tích lũy|tích xu|hoàn xu|loyalty|rewards?|coins?|tier" ${root} || true`],
        { encoding: 'utf8' },
      )
        .split('\n')
        .filter(Boolean)
        .map((entry) => {
          const first = entry.indexOf(':')
          const second = entry.indexOf(':', first + 1)
          return { file: entry.slice(0, first), line: entry.slice(second + 1) }
        })
    const counts = (hits: Array<{ line: string }>): Record<string, number> => {
      const out: Record<string, number> = {}
      for (const [label, pattern] of LOYALTY_TERMS) out[label] = hits.filter((hit) => pattern.test(hit.line)).length
      return out
    }
    const srcHits = grep(`${WEB}/src`)
    const testHits = grep(`${WEB}/tests`)
    report('loyalty', 'web/src term counts', JSON.stringify(counts(srcHits)))
    report('loyalty', 'web/tests term counts', JSON.stringify(counts(testHits)))
    for (const hit of srcHits) report('loyalty', 'web/src hit', `${hit.file.replace(WEB + '/', '')}: ${hit.line.trim().slice(0, 110)}`)
    const productionNonComments = srcHits.filter((hit) => !/^\s*(\/\/|\*|\/\*)/.test(hit.line))
    check(
      'loyalty',
      'every loyalty-term line in production code is a comment (no live promise)',
      productionNonComments.length === 0 ? `${srcHits.length} hit(s), all comments` : JSON.stringify(productionNonComments.map((hit) => `${hit.file}: ${hit.line.slice(0, 60)}`)),
      'no non-comment production hit',
      productionNonComments.length === 0,
    )

    const dumpPath = resolve(EVIDENCE, 'pg-dump-data-only.sql')
    execFileSync('bash', ['-lc', `docker exec kientaohub-postgres pg_dump -U payload --data-only kientaohub > ${dumpPath}`], { encoding: 'utf8' })
    const dump = readFileSync(dumpPath, 'utf8')
    info(`  fresh pg_dump --data-only: ${dump.length} bytes at ${dumpPath.replace(WEB + '/', '')}`)
    for (const [label, pattern] of LOYALTY_TERMS) {
      const count = (dump.match(pattern) ?? []).length
      check('loyalty', `dump carries no "${label}" value`, String(count), '0 occurrences', count === 0)
    }

    const token = await login('buyer01@kientaohub.vn')
    const context = await browser.newContext()
    await context.addCookies([{ name: 'payload-token', value: token, url: BASE }])
    const page = await context.newPage()
    for (const path of ['/wallet', '/login']) {
      await page.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded' })
      await page.waitForTimeout(2500)
      const text = await page.locator('body').innerText()
      const hits = LOYALTY_TERMS.map(([label, pattern]) => [label, (text.match(pattern) ?? []).length] as const).filter(([, count]) => count > 0)
      check('loyalty', `rendered ${path} carries no points/coin/tier term`, JSON.stringify(hits), 'no term rendered', hits.length === 0)
      const figures = Array.from(text.matchAll(/([\d.]+)\s*(điểm|xu|coin|point)/gi)).map((match) => match[0])
      check('loyalty', `rendered ${path} carries no points/coin figure`, figures.join(', ') || '(none)', 'no figure', figures.length === 0)
    }
    await context.close()
  }

  await browser.close()

  const failed = results.filter((entry) => !entry.ok)
  console.log('')
  console.log(`checks: ${results.length}, failing: ${failed.length}`)
  for (const entry of failed) console.log(`  FAIL [${entry.section}] ${entry.step}: "${entry.value}" vs ${entry.truth}`)
  writeFileSync(
    resolve(EVIDENCE, `probe-verify-vn-and-attributes-${SECTION}.json`),
    JSON.stringify({ ranAt: new Date().toISOString(), section: SECTION, expectDefault: EXPECT_DEFAULT, results, reports }, null, 2),
  )
  console.log(failed.length === 0 ? 'VN-AND-ATTRIBUTES: PASS' : 'VN-AND-ATTRIBUTES: FAIL')
  process.exit(failed.length === 0 ? 0 : 1)
}

main().catch((error) => {
  console.error('probe crashed:', error)
  process.exit(2)
})
