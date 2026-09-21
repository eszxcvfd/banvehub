/**
 * web/tests/helpers/probe-phase14-address-default.mts
 *
 * Renders the real address form on the running app and proves the one thing the config cannot:
 * that a new address *opens on* Vietnam and *saves* Vietnam. Decision 0015 clause 4, and the trap
 * the task contract names — the plugin only sets a DB-level default for a one-entry list, so the
 * default has to be observed in the interface, not inferred from `supportedCountries`.
 *
 * What it does, against `http://localhost:3000` (override with `APP_URL`):
 *   1. logs in over REST as the existing e2e fixture buyer,
 *   2. opens `/account/addresses` → "Thêm địa chỉ mới" (the modal that renders
 *      `src/components/forms/AddressForm/index.tsx`) and waits for it to be on screen,
 *   3. waits for the country field to paint, then reads it without touching it — it must show the
 *      label of `VN`, and the shared list must still lead with `VN`,
 *   4. fills the required fields, leaves the country alone, submits,
 *   5. reads the created record back over the REST API — `country` must be `VN`,
 *   6. deletes the address it created (also on failure), and reports.
 *
 * The selectors are the installed antd's, not assumed: with antd 6.6.4 the single-select value node is
 * `.ant-select-content` (`@rc-component/select/es/SelectInput/Content/SingleContent.js:88`), the modal
 * wrapper is `.ant-modal-wrap`, and `.ant-select-selection-item` exists only in the multiple/tag mode
 * (`MultipleContent.js:43`) — reading it reports an empty string on a correct form. Review round 1
 * (F1) found the earlier revision of this probe failing for exactly that reason, plus a read that
 * raced `next dev`'s first compile of the modal chunk; both are fixed here, which is why the probe
 * waits for the modal and then for a non-empty rendered value before it compares anything.
 *
 * Usage (the dev server must already be running; this probe never restarts it):
 *
 *   node_modules/.bin/tsx tests/helpers/probe-phase14-address-default.mts
 *   # the same file under the repository's node runner, which is how the task contract runs it:
 *   NODE_OPTIONS="--no-deprecation --import=tsx/esm" node tests/helpers/probe-phase14-address-default.mts
 *
 * Exit code 0 means the rendered default and the saved value were both `VN`, and the fixture row was
 * deleted again. This probe mutates the dev database only for the duration of the run.
 *
 * Negative control (recorded in `.lit/evidence/engineer-schema-t31/`): pointing the form's
 * `defaultCountry` at `'US'` makes this probe FAIL and name `"United States"` against `"Vietnam"`;
 * restored, it PASSES.
 */
import 'dotenv/config'

import { chromium, type Browser } from '@playwright/test'

import { SUPPORTED_COUNTRIES } from '../../src/constants/countries'

const BASE = process.env.APP_URL ?? 'http://localhost:3000'
const FIXTURE_EMAIL = process.env.PROBE_BUYER_EMAIL ?? 'e2e-refund-buyer@kientaohub.test'
const FIXTURE_PASSWORD = process.env.PROBE_BUYER_PASSWORD ?? 'kientaohub-test-password-2026'
/** Marks the row this probe owns, so cleanup never touches anything else. */
const MARKER = 'probe-phase14-default-vn'
/**
 * Decision 0015 clause 4 pins the default to `VN` itself, not to "whatever leads the list", so the
 * expected value is a literal here and the expected label is read from the shared list. If someone
 * reorders the list, the pin fails; if someone points the form at another country, the rendered label
 * fails and the message names both sides.
 */
const EXPECTED_DEFAULT_VALUE = 'VN'
const EXPECTED_DEFAULT_LABEL =
  SUPPORTED_COUNTRIES.find((country) => country.value === EXPECTED_DEFAULT_VALUE)?.label ?? ''

let failures = 0
const check = (label: string, actual: unknown, expected: unknown) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  if (!ok) failures += 1
  console.log(`${ok ? 'PASS' : 'FAIL'} ${label} → ${JSON.stringify(actual)} (expected ${JSON.stringify(expected)})`)
}
const checkTrue = (label: string, condition: boolean, detail: string) => {
  if (!condition) failures += 1
  console.log(`${condition ? 'PASS' : 'FAIL'} ${label} — ${detail}`)
}

console.log(`--- phase-14 default country: rendering ${BASE}/account/addresses ---`)

const loginResponse = await fetch(`${BASE}/api/users/login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: FIXTURE_EMAIL, password: FIXTURE_PASSWORD }),
})
const loginBody: any = await loginResponse.json()
check('login as the fixture buyer', loginResponse.status, 200)
const token = loginBody?.token as string
checkTrue('login returned a payload token', typeof token === 'string' && token.length > 0, 'token present')

const api = async (path: string, init: RequestInit = {}) =>
  fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `JWT ${token}`,
      ...(init.headers ?? {}),
    },
  })

let createdId: number | null = null
let browser: Browser | null = null

try {
  let launchError: unknown = null
  try {
    browser = await chromium.launch({ channel: 'chrome' })
  } catch (error) {
    launchError = error
    browser = await chromium.launch()
  }
  checkTrue('chromium launched', browser !== null, launchError ? `channel chrome failed (${String(launchError).slice(0, 80)}), used the bundled build` : 'channel chrome')

  const context = await browser.newContext()
  await context.addCookies([
    { name: 'payload-token', value: token, domain: 'localhost', path: '/', httpOnly: true, sameSite: 'Lax' },
  ])
  const page = await context.newPage()

  await page.goto(`${BASE}/account/addresses`, { waitUntil: 'domcontentloaded' })
  await page.waitForLoadState('networkidle')
  // Selectors, taken from the installed tree rather than from memory (review round 1, F1):
  //   - the open modal is `.ant-modal-wrap`;
  //   - a single select's rendered value is `.ant-select-content` — `@rc-component/select`'s
  //     `es/SelectInput/Content/SingleContent.js:88` (antd 6.6.4) builds
  //     `<div class="ant-select-content ant-select-content-has-value" title="…">label<input role="combobox"></div>`;
  //     `.ant-select-selection-item` is only rendered by `MultipleContent.js:43` (multiple/tag mode),
  //     and the combobox `<input>`'s own `value` stays empty — reading either reports `""` on a
  //     correct form;
  //   - an option's label is `.ant-select-item-option-content`.
  const modal = page.locator('.ant-modal-wrap').first()
  // A click that lands before hydration finishes is a no-op, and `next dev` compiles the modal's
  // chunk on first use — so the click is retried, and a modal that is already open is not clicked
  // again (that would be intercepted and time out).
  const openButton = page.getByRole('button', { name: 'Thêm địa chỉ mới' }).first()
  let modalOpened = false
  for (let attempt = 0; attempt < 3 && !modalOpened; attempt += 1) {
    if (!(await modal.isVisible().catch(() => false))) {
      await openButton.click({ timeout: 10000 }).catch(() => {})
    }
    modalOpened = await modal
      .waitFor({ state: 'visible', timeout: 30000 })
      .then(() => true)
      .catch(() => false)
  }
  checkTrue('the address modal opened', modalOpened, 'rendered .ant-modal-wrap after clicking "Thêm địa chỉ mới"')

  const countryItem = modal.locator('.ant-form-item').filter({ hasText: 'Quốc gia' }).first()
  const countryValue = countryItem.locator('.ant-select-content').first()
  // Wait for the field to actually paint a value before reading it: `next dev` compiles this chunk on
  // first use, so a read that races the render used to report `""` while the form was correct.
  await countryValue.waitFor({ state: 'attached', timeout: 20000 }).catch(() => {})
  let renderedCountry = ''
  for (let attempt = 0; attempt < 20 && renderedCountry === ''; attempt += 1) {
    renderedCountry = ((await countryValue.textContent({ timeout: 2000 }).catch(() => '')) ?? '').trim()
    if (renderedCountry === '') await page.waitForTimeout(250)
  }

  checkTrue(
    'the shared list still leads with VN (the default is pinned, not merely "first in the list")',
    SUPPORTED_COUNTRIES[0]?.value === EXPECTED_DEFAULT_VALUE,
    `SUPPORTED_COUNTRIES[0] = ${JSON.stringify(SUPPORTED_COUNTRIES[0])}`,
  )
  // Print the node the probe read, so the selector is checkable against the run rather than trusted.
  console.log(
    `     country field markup: ${(await countryValue.evaluate((el) => el.outerHTML)).replace(/\s+/g, ' ').slice(0, 220)}`,
  )
  check(
    `the country field renders the label of ${EXPECTED_DEFAULT_VALUE} without being touched`,
    renderedCountry,
    EXPECTED_DEFAULT_LABEL,
  )

  // The option list behind the field must start with the eight additions, in the shared order.
  await countryItem.locator('.ant-select').first().click()
  await page.locator('.ant-select-item-option-content').first().waitFor({ timeout: 15000 })
  const options = (await page.locator('.ant-select-item-option-content').allTextContents()).map((option) =>
    option.trim(),
  )
  await page.keyboard.press('Escape')
  check(
    'the opened list starts with the eight additions in the shared order',
    options.slice(0, 8),
    ['Vietnam', 'Thailand', 'Laos', 'Cambodia', 'Myanmar', 'Philippines', 'Indonesia', 'China'],
  )
  checkTrue(
    'the opened list continues with the plugin\u2019s 40 (first is the United States)',
    options[8] === 'United States',
    `visible options: ${options.slice(0, 10).join(', ')}`,
  )

  await modal.locator('#firstName').fill('Kiểm')
  await modal.locator('#lastName').fill('Tra')
  await modal.locator('#addressLine1').fill(`Số 1 ${MARKER}`)
  await modal.locator('#city').fill('Hà Nội')
  await modal.locator('#postalCode').fill('100000')

  const [createResponse] = await Promise.all([
    page.waitForResponse(
      (response) => response.url().includes('/api/addresses') && response.request().method() === 'POST',
      { timeout: 30000 },
    ),
    modal.getByRole('button', { name: 'Lưu địa chỉ mới' }).click(),
  ])
  const created: any = await createResponse.json()
  createdId = created?.doc?.id ?? null
  console.log(
    `     POST /api/addresses → ${createResponse.status()} country=${JSON.stringify(created?.doc?.country)} id=${createdId}`,
  )
  check('submitting the untouched form created an address', createResponse.status(), 201)
  check('the saved country is VN (the form default, never touched)', created?.doc?.country, 'VN')

  const readBack = await api(`/api/addresses/${createdId}`)
  const readBackBody: any = await readBack.json()
  check('GET /api/addresses/{id} reads the row back', readBack.status, 200)
  check('the stored country is VN', readBackBody?.country, 'VN')
  check('the stored row is the one this probe created', readBackBody?.addressLine1, `Số 1 ${MARKER}`)

  const cleanup = await api(`/api/addresses/${createdId}`, { method: 'DELETE' })
  check('DELETE /api/addresses/{id} → 200', cleanup.status, 200)
  const afterDelete = await api(`/api/addresses/${createdId}`)
  check('the deleted address is gone (GET → 404)', afterDelete.status, 404)
  createdId = null
} finally {
  if (createdId !== null) {
    const cleanup = await api(`/api/addresses/${createdId}`, { method: 'DELETE' }).catch(() => null)
    console.log(`     cleanup after failure: DELETE /api/addresses/${createdId} → ${cleanup?.status ?? 'no response'}`)
  }
  if (browser) await browser.close()
}

console.log(`--- ${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`} ---`)
process.exit(failures === 0 ? 0 : 1)
