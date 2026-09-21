/**
 * Probe (t22): product attributes come from the record — no invented spec value on write, none on
 * display (decision `docs/decisions/0018-product-attributes-come-from-the-record.md`).
 *
 * It measures four things, each against the record rather than against a claim:
 *
 *   1. **Source provenance of the write path.** The two seller forms must not turn an example into
 *      catalog data: no `|| '<literal>'` for `softwareVersion`, no literal seed in `initialValues` or
 *      `useState`, and the example must still be visible as the input's `placeholder`.
 *   2. **Source provenance of the display path.** `TechnicalSpecsTable` must not contain the six
 *      invented fallbacks, and `ProductDetailTabs` must not carry the unreachable package checklist.
 *   3. **The rendered pages.** For a product with specifications, the page shows the record's own
 *      values and none of the invented literals; for a product whose `technicalSpecs` is empty, none of
 *      the literals appears either.
 *   4. **The write path end to end.** A product created through the seller route (`POST
 *      /api/seller/products`, the endpoint both forms post to) without a version stores NULL/empty —
 *      read back with SQL — and the probe product is deleted again, with the deletion shown.
 *
 * The last row is a shipped control: the detector is fed a fabricated snippet and must reject it, so a
 * detector that has silently stopped failing is visible in every run. The end-to-end negative control
 * (restore `|| 'AutoCAD 2022+'` in the modal, run, see it fail, revert, see it pass) is recorded in the
 * task report; run 1 reported the fabrication, run 2 was clean.
 *
 * Read-only with respect to everything except the single probe product it creates and deletes.
 *
 * Run from `web/`: NODE_OPTIONS="--no-deprecation --import=tsx/esm" node tests/e2e/probe-product-attributes-provenance.mts
 */
import 'dotenv/config'

import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import path from 'node:path'

import { getPayload } from 'payload'

import config from '../../src/payload.config'

const BASE = process.env.PROBE_BASE_URL || 'http://localhost:3000'
const SELLER = { email: 'seller01@kientaohub.vn', password: 'KienTao@2026' }
const PRODUCT_WITH_SPECS = 'san-pham-159-ban-ve-canh-quan-san-vuon'

const INVENTED = [
  'Tệp kỹ thuật chuẩn',
  'Tương thích mọi phiên bản',
  'Đang cập nhật',
  'Đa nền tảng CAD/BIM',
  'Hồ sơ kỹ thuật tổng hợp',
  'Đã kiểm duyệt cấu trúc layer, xref và kích thước chuẩn',
]

type Row = { id: string; area: string; claim: string; ok: boolean; detail: string }
const rows: Row[] = []

const add = (id: string, area: string, claim: string, ok: boolean, detail: string) => {
  rows.push({ id, area, claim, ok, detail })
  const mark = ok ? 'ok  ' : 'FAIL'
  console.log(`${mark} ${id.padEnd(7)} ${area.padEnd(10)} ${claim} — ${detail}`)
}

const read = (relative: string) => readFileSync(path.join(process.cwd(), relative), 'utf8')

const sql = (statement: string) =>
  execFileSync(
    'docker',
    ['exec', 'kientaohub-postgres', 'psql', '-U', 'payload', '-d', 'kientaohub', '-tAc', statement],
    { encoding: 'utf8' },
  ).trim()

const stripTags = (html: string) =>
  html
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<script[\s\S]*?<\/script>/g, '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')

/** The detector the shipped control below proves can fail. */
const detectsLiteral = (source: string, literal: string) => source.includes(literal)

const main = async () => {
  console.log('=== product attributes come from the record (decision 0018) ===\n')

  // ---------------------------------------------------------------- 1. write path, source
  const modal = read('src/app/(app)/seller/ProductEditorModal.tsx')
  const newForm = read('src/app/(app)/seller/products/new/ProductEditorForm.tsx')

  add(
    'W1',
    'write src',
    "ProductEditorModal sends no invented softwareVersion",
    !/\|\|\s*'AutoCAD 2022\+'/.test(modal),
    /softwareVersion:\s*values\.softwareVersion/.test(modal)
      ? 'the payload passes the field through (values.softwareVersion || \'\')'
      : 'no pass-through found — check the payload',
  )
  add(
    'W2',
    'write src',
    'ProductEditorModal seeds no spec example in initialValues',
    !/initialValues\s*=\s*\{[\s\S]{0,400}?softwareVersion:/.test(modal) &&
      !/useState<string>\('25 MB'\)/.test(modal) &&
      !/useState<string>\('\.dwg'\)/.test(modal),
    'fileFormat/fileSize/softwareVersion start empty and are filled only from the seller or the uploaded file',
  )
  add(
    'W3',
    'write src',
    'the example survives as the input placeholder',
    /<Input placeholder="AutoCAD 2022\+"/.test(modal),
    'ProductEditorModal keeps placeholder="AutoCAD 2022+"',
  )
  add(
    'W4',
    'write src',
    'the new-product form starts empty too',
    !/useState\('AutoCAD 2022\+'\)/.test(newForm) &&
      !/useState\('25 MB'\)/.test(newForm) &&
      !/useState\('\.dwg'\)/.test(newForm),
    'ProductEditorForm: fileFormat/softwareVersion/fileSize all start as empty strings',
  )

  // ---------------------------------------------------------------- 2. display path, source
  const specsTable = read('src/components/product/TechnicalSpecsTable.tsx')
  const tabs = read('src/components/product/ProductDetailTabs.tsx')

  const literalsInTable = INVENTED.filter((literal) => detectsLiteral(specsTable, literal))
  add(
    'D1',
    'display src',
    'TechnicalSpecsTable carries no invented fallback',
    literalsInTable.length === 0,
    literalsInTable.length === 0
      ? `none of ${INVENTED.length} invented literals is present`
      : `still present: ${literalsInTable.join(', ')}`,
  )
  add(
    'D2',
    'display src',
    'every spec row is gated on the record value',
    /specs\.fileFormat\s*\?/.test(specsTable) &&
      /specs\.softwareVersion\s*\?/.test(specsTable) &&
      /specs\.fileSize\s*\?/.test(specsTable) &&
      /specs\.unit\s*\?/.test(specsTable) &&
      /softwareTypes\.length > 0\s*\?/.test(specsTable) &&
      /categories\.length > 0\s*\?/.test(specsTable),
    'fileFormat, softwareVersion, fileSize, unit, software types and categories each render only when present',
  )
  add(
    'D3',
    'display src',
    'ProductDetailTabs has no unreachable package checklist',
    !tabs.includes('Danh mục bản vẽ & Tệp đính kèm') &&
      !tabs.includes('isFileListModalOpen') &&
      !tabs.includes('WindowsOutlined') &&
      !tabs.includes('Thư viện Revit Family'),
    'the modal, its state and its imports are gone; the tabs themselves are untouched',
  )
  add(
    'D4',
    'display src',
    'the package checklist did not move somewhere else',
    !read('src/components/product/ProductDescription.tsx').includes('Tệp đính kèm') &&
      !read('src/components/product/ProductDescription.tsx').includes('Revit Family'),
    'ProductDescription carries no copy of it',
  )

  // ---------------------------------------------------------------- shipped control
  const fabricatedSnippet = "softwareVersion: values.softwareVersion || 'AutoCAD 2022+',"
  add(
    'CTRL',
    'control',
    'the detector rejects a fabricated snippet',
    detectsLiteral(fabricatedSnippet, "'AutoCAD 2022+'") &&
      !detectsLiteral("softwareVersion: values.softwareVersion || '',", "'AutoCAD 2022+'"),
    'a fabricated snippet is reported, the honest one is not',
  )
  add(
    'CTRL',
    'control',
    'the display detector rejects an invented fallback',
    detectsLiteral("{specs.fileFormat || 'Tệp kỹ thuật chuẩn'}", 'Tệp kỹ thuật chuẩn') &&
      !detectsLiteral('<Tag>{specs.fileFormat}</Tag>', 'Tệp kỹ thuật chuẩn'),
    'the old row shape is reported, the gated shape is not',
  )

  // ---------------------------------------------------------------- 3. rendered pages
  const payload = await getPayload({ config })

  const withSpecs = await fetch(`${BASE}/products/${PRODUCT_WITH_SPECS}`)
  const withSpecsHtml = stripTags(await withSpecs.text())
  const dbWithSpecs = sql(
    `select coalesce(technical_specs_file_format,'') || '|' || coalesce(technical_specs_software_version,'') || '|' || coalesce(technical_specs_file_size,'') from products where slug='${PRODUCT_WITH_SPECS}'`,
  )
  const [dbFormat, dbVersion, dbSize] = dbWithSpecs.split('|')

  for (const literal of INVENTED) {
    add(
      'R1',
      'rendered',
      `"${literal}" on /products/${PRODUCT_WITH_SPECS}`,
      !withSpecsHtml.includes(literal),
      withSpecsHtml.includes(literal) ? 'rendered' : 'absent',
    )
  }
  for (const [label, value] of [
    ['fileFormat', dbFormat],
    ['softwareVersion', dbVersion],
    ['fileSize', dbSize],
  ] as const) {
    add(
      'R2',
      'rendered',
      `the product's own ${label} is shown`,
      withSpecsHtml.includes(value),
      `db=${value} rendered=${withSpecsHtml.includes(value) ? 'present' : 'ABSENT'}`,
    )
  }

  // ---------------------------------------------------------------- 4. write path, end to end
  const cookie = await (async () => {
    const res = await fetch(`${BASE}/api/users/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(SELLER),
    })
    const raw = res.headers.getSetCookie?.() ?? []
    return raw.map((entry) => entry.split(';')[0]).join('; ')
  })()

  const title = `Probe t22 attributes ${Date.now()}`
  const created = await fetch(`${BASE}/api/seller/products`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    // the form's own body with the version/format/size fields left as the seller left them: empty
    body: JSON.stringify({
      title,
      price: 0,
      isFree: true,
      categories: [],
      software_types: [],
      tags: [],
      previewGallery: [],
      originalFiles: [],
      copyrightDeclared: true,
      submitForReview: false,
    }),
  })
  const createdBody = (await created.json()) as {
    product?: { id: number }
    doc?: { id: number }
    id?: number
    error?: string
  }
  const newId = createdBody.product?.id ?? createdBody.doc?.id ?? createdBody.id
  add(
    'W5',
    'write e2e',
    'POST /api/seller/products without a version',
    Boolean(newId),
    newId ? `created product ${newId}` : `no id (${created.status}: ${createdBody.error ?? 'unknown'})`,
  )

  if (newId) {
    const stored = sql(
      `select coalesce(technical_specs_software_version,'<null>') || '|' || coalesce(technical_specs_file_format,'<null>') || '|' || coalesce(technical_specs_file_size,'<null>') from products where id=${newId}`,
    )
    const [storedVersion, storedFormat, storedSize] = stored.split('|')
    add(
      'W6',
      'write e2e',
      'the stored version is NULL/empty, not an example',
      storedVersion === '' || storedVersion === '<null>',
      `select technical_specs_software_version … = ${JSON.stringify(storedVersion)} (format ${JSON.stringify(storedFormat)}, size ${JSON.stringify(storedSize)})`,
    )

    // publish it long enough to read the rendered page for a record with empty specs
    await payload.update({
      collection: 'products',
      id: newId,
      data: { _status: 'published' },
      overrideAccess: true,
    })
    const probeProduct = await payload.findByID({
      collection: 'products',
      id: newId,
      depth: 0,
      overrideAccess: true,
    })
    const emptyPage = await fetch(`${BASE}/products/${probeProduct.slug}`)
    const emptyHtml = stripTags(await emptyPage.text())
    const literalOnEmpty = INVENTED.filter((literal) => emptyHtml.includes(literal))
    add(
      'R3',
      'rendered',
      `none of the invented literals on a record with empty specs (/products/${probeProduct.slug})`,
      literalOnEmpty.length === 0,
      literalOnEmpty.length === 0
        ? `${emptyHtml.length} chars of rendered text, no invented literal (HTTP ${emptyPage.status})`
        : `still rendered: ${literalOnEmpty.join(', ')}`,
    )

    await payload.delete({ collection: 'products', id: newId, overrideAccess: true })
    const remaining = Number(sql(`select count(*) from products where id=${newId}`))
    add(
      'C1',
      'cleanup',
      'the probe product is deleted again',
      remaining === 0,
      `rows left for id ${newId}: ${remaining}`,
    )
  }

  const failed = rows.filter((row) => !row.ok)
  console.log('')
  console.log(`=== ${rows.length} checks: ${rows.length - failed.length} ok, ${failed.length} failing ===`)
  if (failed.length > 0) {
    for (const row of failed) console.log(`  FAIL ${row.id} ${row.area} ${row.claim} — ${row.detail}`)
    process.exit(1)
  }
  process.exit(0)
}

await main()
