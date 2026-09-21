/**
 * Verifier instrument for task `t3` (ui-api-integration) — the cart (decision 0014 / task `t6`) and the
 * checkout's three payment branches (task `t7`) driven through the real UI in Chromium.
 *
 * It is written by `verifier` and does not reuse the engineer's spec. Every assertion below is a
 * browser observation (DOM text, sessionStorage, navigation, the actual HTTP the page issues).
 *
 * Run from `web/`:
 *   NODE_OPTIONS=--no-deprecation node --import tsx/esm tests/helpers/probe-verify-cart-checkout.mts
 *
 * The one write it performs is the top-up intent the VietQR branch creates; it prints its code so
 * `.lit/evidence/verifier-t3/probes/cleanup-residue.mts` can delete it, and it deletes the saved
 * address it needs for the checkout step itself.
 */
import { chromium, type BrowserContext, type Page } from '@playwright/test'
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

/**
 * This checkout has browsers under a newer revision than `@playwright/test@1.58.2` expects
 * (`chromium-1234` vs the package's default), so the verifier points the launch at the binary that is
 * actually installed instead of downloading anything.
 */
const resolveExecutable = (): string | undefined => {
  const candidates = [
    process.env.PROBE_CHROMIUM,
    join(homedir(), '.cache/ms-playwright/chromium-1234/chrome-linux64/chrome'),
  ].filter(Boolean) as string[]
  return candidates.find((candidate) => existsSync(candidate))
}

const BASE = process.env.PROBE_BASE ?? 'http://localhost:3000'
const PASSWORD = process.env.PROBE_PASSWORD ?? 'KienTao@2026'
const BUYER = 'buyer01@kientaohub.vn'
const BUYER_ID = 9
const OWNED_PRODUCT = 158
const OWNED_PRODUCT_TITLE = 'Hồ sơ thiết kế đường dạo ven sông và bến thuyền kayak du lịch'
const OWNED_PRODUCT_PRICE = 430000
const PRODUCT_SLUG = 'san-pham-158-ban-ve-canh-quan-san-vuon'

type Line = { kind: 'ok' | 'FAIL' | 'info'; text: string }
const DUMP = process.env.PROBE_DUMP ?? ''
const lines: Line[] = []
const ok = (text: string) => lines.push({ kind: 'ok', text })
const fail = (text: string) => lines.push({ kind: 'FAIL', text })
const info = (text: string) => lines.push({ kind: 'info', text })
const dump = async (page: Page, name: string) => {
  if (!DUMP) return
  const { writeFileSync } = await import('node:fs')
  writeFileSync(`${DUMP}/${name}.html`, await page.content())
  writeFileSync(`${DUMP}/${name}.txt`, await page.locator('body').innerText())
}

const requests: Array<{ method: string; url: string; postData: string | null }> = []
const blockImages = (page: Page) => {
  // No assertion below depends on a bitmap, and the product/homepage markup ships large images that
  // this loaded machine's renderer cannot hold; blocking them keeps the DOM assertions honest.
  void page.route('**/*.{png,jpg,jpeg,webp,gif,avif,svg}', (route) => route.abort()).catch(() => {})
}

const watch = (page: Page, tag: string) => {
  page.on('request', (r) => {
    const url = r.url()
    if (url.startsWith(BASE) && (url.includes('/api/') || url.includes('/products/') || url.startsWith(`${BASE}/cart`))) {
      requests.push({ method: r.method(), url: url.replace(BASE, ''), postData: r.postData() })
    }
  })
  page.on('console', (m) => {
    if (m.type() === 'error' && /api\//.test(m.text())) info(`[console error ${tag}] ${m.text().slice(0, 200)}`)
  })
}

const loginCookie = async (): Promise<string> => {
  const res = await fetch(`${BASE}/api/users/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: BUYER, password: PASSWORD }),
  })
  const setCookie = (res.headers as any).getSetCookie?.() ?? []
  const cookie = setCookie.map((c: string) => /(^|,\s*)payload-token=([^;]+)/.exec(c)).find(Boolean)
  if (!cookie) throw new Error(`login failed: ${res.status}`)
  return cookie[2]
}

const api = async (method: string, path: string, jar: string, body?: unknown) => {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { Cookie: `payload-token=${jar}`, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const text = await res.text()
  let json: any = null
  try {
    json = JSON.parse(text)
  } catch {
    json = null
  }
  return { status: res.status, json, text }
}

/**
 * The storefront is server-rendered; the first paint carries the markup but not the React handlers
 * yet, so a click landing in that window does nothing. Retry the click until `observed` reports the
 * effect the handler is supposed to have.
 */
const clickUntil = async (
  page: Page,
  click: () => Promise<void>,
  observed: () => Promise<boolean>,
  attempts = 4,
): Promise<boolean> => {
  for (let i = 0; i < attempts; i += 1) {
    await click().catch(() => {})
    await page.waitForTimeout(900)
    if (await observed()) return true
  }
  return false
}

const waitForCheckout = async (page: Page) => {
  // Next streams: `domcontentloaded` fires with only the shell in the DOM. Wait for the checkout's
  // own client render before asserting on its text.
  await page
    .getByText('Thanh toán an toàn', { exact: false })
    .first()
    .waitFor({ state: 'visible', timeout: 30000 })
    .catch(() => {})
  await page.getByText('Ví KienTaoHub', { exact: false }).first().waitFor({ state: 'visible', timeout: 30000 }).catch(() => {})
}

const sessionCart = async (page: Page): Promise<any> => {
  const raw = await page.evaluate(() => window.sessionStorage.getItem('kientaohub_cart'))
  try {
    return raw ? JSON.parse(raw) : null
  } catch {
    return { unparsable: raw }
  }
}

const main = async () => {
  const browser = await chromium.launch({
    executablePath: resolveExecutable(),
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
  })
  const jar = await loginCookie()
  let intentCode = ''

  // ----------------------------------------------------------------------------------------
  // PART A — the cart: sessionStorage-only, no /api/carts, real add → drawer → /cart
  // ----------------------------------------------------------------------------------------
  info('=== PART A — cart (anonymous, fresh browser session) ===')
  const anonContext = await browser.newContext()
  const anonPage = await anonContext.newPage()
  blockImages(anonPage)
  watch(anonPage, 'A')

  await anonPage.goto(`${BASE}/products/${PRODUCT_SLUG}`, { waitUntil: 'domcontentloaded' })
  const before = await sessionCart(anonPage)
  if (before === null) ok('A1 fresh session: sessionStorage has no cart key')
  else fail(`A1 fresh session: cart key already present: ${JSON.stringify(before)}`)

  const addButton = anonPage.getByRole('button', { name: 'Thêm vào giỏ hàng' }).first()
  if ((await addButton.count()) === 0) {
    fail('A2 "Thêm vào giỏ hàng" button not found on the product page')
  } else {
    const added = await clickUntil(
      anonPage,
      async () => {
        await addButton.click()
      },
      async () => Boolean((await sessionCart(anonPage))?.items?.length),
    )
    if (!added) fail('A2 add-to-cart never wrote the session cart (clicked 4×)')

    const after = await sessionCart(anonPage)
    const item = after?.items?.[0]
    if (item && String(item.id) === String(OWNED_PRODUCT)) {
      ok(`A3 add-to-cart wrote sessionStorage['kientaohub_cart']: id=${item.id} quantity=${item.quantity} price=${item.product?.price}`)
    } else {
      fail(`A3 add-to-cart did not write the expected item: ${JSON.stringify(after)}`)
    }

    await anonPage.locator('.ant-drawer-content').first().waitFor({ state: 'visible', timeout: 10000 }).catch(() => {})
    await anonPage.waitForTimeout(400)
    const drawerCount = await anonPage.locator('.ant-drawer').count()
    const visibleDrawers = await anonPage.locator('.ant-drawer:visible').count()
    info(`  drawers in the DOM after add-to-cart: ${drawerCount} (visible: ${visibleDrawers})`)
    if (visibleDrawers === 1) ok('A2b the add-to-cart click opened exactly one drawer (t6: 0 before the fix)')
    else fail(`A2b the add-to-cart click opened ${visibleDrawers} visible drawer(s)`)
    await dump(anonPage, 'A-drawer')
    const drawerText = await anonPage.locator('.ant-drawer').first().innerText().catch(() => '')
    if (drawerText.includes(OWNED_PRODUCT_TITLE)) ok('A4 the cart drawer renders the product it just added')
    else fail(`A4 drawer does not render the product title; drawer text: ${drawerText.replace(/\n/g, ' | ').slice(0, 300)}`)
    if (drawerText.includes(OWNED_PRODUCT_PRICE.toLocaleString('vi-VN'))) ok('A5 the drawer subtotal shows the product price from the cart snapshot')
    else fail(`A5 drawer shows no ${OWNED_PRODUCT_PRICE.toLocaleString('vi-VN')} subtotal; text: ${drawerText.replace(/\n/g, ' | ').slice(0, 300)}`)

    const badge = await anonPage.locator('[data-slot="cart"] .ant-badge-count').first().innerText().catch(() => '')
    if (badge.trim() === '1') ok('A6 header badge reads 1')
    else fail(`A6 header badge reads "${badge.trim()}" (expected 1)`)
  }

  await anonPage.goto(`${BASE}/cart`, { waitUntil: 'domcontentloaded' })
  await anonPage.waitForTimeout(400)
  let cartPageText = await anonPage.locator('body').innerText()
  if (cartPageText.includes(OWNED_PRODUCT_TITLE)) ok('A7 /cart renders the item after a client-side navigation')
  else fail(`A7 /cart does not render the item; body text: ${cartPageText.replace(/\n/g, ' | ').slice(0, 300)}`)

  await anonPage.reload({ waitUntil: 'domcontentloaded' })
  await anonPage.waitForTimeout(400)
  cartPageText = await anonPage.locator('body').innerText()
  const afterReload = await sessionCart(anonPage)
  if (cartPageText.includes(OWNED_PRODUCT_TITLE) && afterReload?.items?.length === 1) ok('A8 reload keeps the cart (sessionStorage)')
  else fail(`A8 reload lost the cart; storage=${JSON.stringify(afterReload)} text=${cartPageText.replace(/\n/g, ' | ').slice(0, 200)}`)

  const cartCalls = requests.filter((r) => /\/api\/carts/.test(r.url))
  if (cartCalls.length === 0) ok('A9 no /api/carts request originated from the cart path (requests watched: ' + requests.length + ')')
  else fail(`A9 the cart path issued ${cartCalls.length} /api/carts request(s): ${JSON.stringify(cartCalls.slice(0, 3))}`)

  const anonContext2 = await browser.newContext()
  const anonPage2 = await anonContext2.newPage()
  await anonPage2.goto(`${BASE}/cart`, { waitUntil: 'domcontentloaded' })
  await anonPage2.waitForTimeout(400)
  const freshText = await anonPage2.locator('body').innerText()
  if (/trống/i.test(freshText)) ok('A10 a new browser session starts with an empty cart (no server-side cart restored)')
  else fail(`A10 a new session rendered a non-empty cart: ${freshText.replace(/\n/g, ' | ').slice(0, 300)}`)
  const freshStorage = await anonPage2.evaluate(() => window.sessionStorage.getItem('kientaohub_cart'))
  if (!freshStorage) ok('A11 the new session has no cart key (nothing came back from a server)')
  else fail(`A11 the new session already holds a cart: ${freshStorage}`)

  // ----------------------------------------------------------------------------------------
  // PART B — the checkout's three branches, logged in as buyer01 (owned product → no money moves)
  // ----------------------------------------------------------------------------------------
  info('=== PART B — checkout branches (buyer01, product 158 already owned) ===')
  const addressRes = await api('POST', '/api/addresses', jar, {
    firstName: 'Verifier',
    lastName: 'Probe',
    phone: '0912345678',
    company: null,
    addressLine1: 'verifier browser probe (deleted at the end)',
    addressLine2: null,
    city: 'Hà Nội',
    state: null,
    postalCode: '100000',
    country: 'US',
  })
  const addressId: number | undefined = addressRes.json?.doc?.id
  info(`  saved address for the logged-in checkout: ${addressId ?? 'NOT CREATED'} (POST /api/addresses → ${addressRes.status})`)

  const context = await browser.newContext()
  await context.addCookies([{ name: 'payload-token', value: jar, url: BASE }])
  const page = await context.newPage()
  blockImages(page)
  watch(page, 'B')

  await page.goto(`${BASE}/products/${PRODUCT_SLUG}`, { waitUntil: 'domcontentloaded' })
  const addOwned = page.getByRole('button', { name: 'Thêm vào giỏ hàng' }).first()
  await addOwned.click().catch(() => {})
  await page.waitForTimeout(600)
  const seeded = await sessionCart(page)
  info(`  cart seeded with product ${OWNED_PRODUCT}: ${JSON.stringify(seeded?.items?.map((i: any) => ({ id: i.id, q: i.quantity })))}`)

  await page.goto(`${BASE}/checkout`, { waitUntil: 'domcontentloaded' })
  await waitForCheckout(page)
  await page.waitForTimeout(1200)

  await dump(page, 'B-checkout-step0')
  // Step 0's order summary only deducts the wallet when `isWalletSufficient` is true, which only
  // happens when `wallet.balance` was read off the level the route actually sends (inventory A1).
  const deductionVisible = await page
    .getByText('Khấu trừ số dư ví', { exact: false })
    .first()
    .waitFor({ state: 'visible', timeout: 25000 })
    .then(() => true)
    .catch(() => false)
  const step0 = await page.locator('body').innerText()
  if (deductionVisible && /-\s?430\.000/.test(step0)) {
    ok('B1 step 0 deducts the wallet (−430.000 ₫) ⇒ isWalletSufficient is true ⇒ the balance was read from the API’s nesting (inventory A1 holds in the UI)')
  } else {
    fail(`B1 step 0 did not deduct the wallet; snippet: ${step0.replace(/\n/g, ' | ').slice(0, 500)}`)
  }

  const continueButton = page.getByRole('button', { name: /Tiếp tục: Chọn phương thức thanh toán/ })
  const disabled = await continueButton.isDisabled().catch(() => true)
  if (!disabled) ok('B2 step 0 → payment is reachable (address prefilled from the saved address)')
  else fail('B2 the step-0 continue button is disabled (no billing address reached the page)')
  await continueButton.click().catch(() => {})
  await page.waitForTimeout(500)

  const optionTexts: Array<[string, string]> = [
    ['wallet', 'Ví KienTaoHub (Khuyên dùng)'],
    ['vietqr', 'VietQR 24/7'],
    ['stripe', 'Thẻ thanh toán quốc tế'],
  ]
  await dump(page, 'B-checkout-step1')
  const step1Text = await page.locator('body').innerText()
  const balanceLine = /Số dư khả dụng:\s*5\.160\.000/.test(step1Text)
  if (balanceLine) ok('B4 step 1 wallet panel reads "Số dư khả dụng: 5.160.000 ₫" (the fetched balance, rendered)')
  else fail(`B4 step 1 does not show the fetched balance line; snippet: ${step1Text.replace(/\n/g, ' | ').slice(0, 500)}`)
  const missing: string[] = []
  for (const [key, text] of optionTexts) {
    const visible = await page
      .getByText(text, { exact: false })
      .first()
      .waitFor({ state: 'visible', timeout: 20000 })
      .then(() => true)
      .catch(() => false)
    if (!visible) missing.push(key)
  }
  if (missing.length === 0) ok('B3 step 1 renders all three payment options')
  else fail(`B3 step 1 is missing: ${missing.join(', ')}`)

  // ---- wallet branch ---------------------------------------------------------------------


  const beforeWallet = requests.length
  await page.getByRole('button', { name: /Tiếp tục: Xác nhận đơn hàng/ }).click()
  await page.waitForTimeout(600)
  const walletConfirm = page.getByRole('button', { name: /Xác nhận thanh toán Ví/ })
  if ((await walletConfirm.count()) === 0) {
    fail('B5 the wallet confirm button is absent from step 2')
  } else {
    info(`  wallet confirm enabled: ${!(await walletConfirm.isDisabled())}`)
    await walletConfirm.click()
    await page.waitForTimeout(1500)
    const purchase = requests.slice(beforeWallet).find((r) => r.url === '/api/v1/orders/purchase')
    if (purchase) {
      ok(`B6 wallet branch issued POST ${purchase.url} body=${purchase.postData}`)
      if (purchase.postData && /"productId":\s*"?158"?/.test(purchase.postData)) ok('B7 the body carries the cart line’s productId (158)')
      else fail(`B7 wallet body does not carry productId 158: ${purchase.postData}`)
    } else {
      fail(`B6 the wallet branch issued no POST /api/v1/orders/purchase; requests since: ${JSON.stringify(requests.slice(beforeWallet))}`)
    }
    const afterWalletText = await page.locator('body').innerText()
    if (/sở hữu|đã sở hữu|ALREADY/i.test(afterWalletText)) ok('B8 the 409 ALREADY_OWNED answer is rendered to the buyer')
    else fail(`B8 the 409 answer is not visible; text: ${afterWalletText.replace(/\n/g, ' | ').slice(0, 400)}`)
    if (!/Thanh toán thành công/.test(afterWalletText)) ok('B9 the wallet branch announced no success for a refused purchase')
    else fail('B9 the wallet branch announced success although the purchase was refused')
    if (!/\/orders\/\d+/.test(page.url())) ok('B10 no navigation to an order page after the refusal')
    else fail(`B10 navigated to ${page.url()} although the purchase was refused`)
  }

  // ---- VietQR branch ---------------------------------------------------------------------
  const beforeQr = requests.length
  await page.getByRole('button', { name: /Đổi phương thức thanh toán/ }).click().catch(() => {})
  await page.waitForTimeout(500)
  const qrRadio = page.locator('label', { hasText: 'VietQR 24/7' }).first()
  await qrRadio.click().catch(async () => {
    await page.getByText('VietQR 24/7').first().click().catch(() => {})
  })
  await page.waitForTimeout(400)
  await page.getByRole('button', { name: /Tiếp tục: Xác nhận đơn hàng/ }).click().catch(() => {})
  await page.waitForTimeout(700)
  const qrConfirm = page.getByRole('button', { name: /Xác nhận đặt hàng với VietQR/ })
  if ((await qrConfirm.count()) === 0) {
    fail('B11 the VietQR confirm button is absent (radio not selected?)')
  } else {
    await qrConfirm.click()
    await page.waitForTimeout(2500)
    const topup = requests.slice(beforeQr).find((r) => r.url === '/api/v1/payments/topup')
    if (topup) {
      ok(`B12 VietQR branch issued POST ${topup.url} body=${topup.postData}`)
      if (topup.postData && /"amount":\s*430000/.test(topup.postData)) ok('B13 the top-up amount is the cart subtotal (430000)')
      else fail(`B13 top-up body does not carry the subtotal: ${topup.postData}`)
    } else {
      fail(`B12 the VietQR branch issued no POST /api/v1/payments/topup; requests: ${JSON.stringify(requests.slice(beforeQr))}`)
    }
    const url = new URL(page.url())
    if (url.pathname === '/wallet' && url.searchParams.get('topup')) {
      intentCode = url.searchParams.get('topup') as string
      ok(`B14 the branch navigated to the wallet payment step with ?topup=${intentCode}`)
    } else {
      fail(`B14 no hand-off to /wallet?topup=…; landed on ${page.url()}`)
    }
    const walletText2 = await page.locator('body').innerText()
    if (intentCode && walletText2.includes(intentCode)) ok('B15 the wallet payment step renders the created intent’s code')
    else if (!intentCode) fail('B15 no code to look for')
    else fail(`B15 the wallet step does not render the code ${intentCode}; text: ${walletText2.replace(/\n/g, ' | ').slice(0, 400)}`)
    const postQrCart = await sessionCart(page)
    if (postQrCart?.items?.length === 1) ok('B16 the VietQR branch left the cart intact (it does not clear a cart that was never paid)')
    else fail(`B16 the cart changed after the VietQR branch: ${JSON.stringify(postQrCart)}`)
  }

  // ---- card branch -----------------------------------------------------------------------
  await page.goto(`${BASE}/checkout`, { waitUntil: 'domcontentloaded' })
  await waitForCheckout(page)
  await page.waitForTimeout(800)
  await page.getByRole('button', { name: /Tiếp tục: Chọn phương thức thanh toán/ }).click().catch(() => {})
  await page.waitForTimeout(500)
  await page.locator('input.ant-radio-input[value="stripe"]').first().click({ force: true }).catch(async () => {
    await page.getByText('Thẻ thanh toán quốc tế').first().click().catch(() => {})
  })
  await page.waitForTimeout(400)
  const beforeCard = requests.length
  await page.getByRole('button', { name: /Tiếp tục: Xác nhận đơn hàng/ }).click()
  await page.waitForTimeout(1800)
  const cardReq = requests.slice(beforeCard).find((r) => r.url === '/api/v1/payments/card/initiate')
  if (cardReq) ok(`B17 the card branch issued POST ${cardReq.url} body=${cardReq.postData}`)
  else fail(`B17 the card branch issued no POST /api/v1/payments/card/initiate; requests: ${JSON.stringify(requests.slice(beforeCard))}`)
  const cardText = await page.locator('body').innerText()
  if (/chưa được hỗ trợ/.test(cardText)) ok('B18 the 501 refusal message is rendered in the checkout error surface')
  else fail(`B18 the refusal message is not rendered; text: ${cardText.replace(/\n/g, ' | ').slice(0, 400)}`)
  const finishCard = page.getByRole('button', { name: /Hoàn tất thanh toán qua thẻ/ })
  if ((await finishCard.count()) > 0 && (await finishCard.isDisabled())) ok('B19 the card “complete payment” button stays disabled (no success announced)')
  else fail('B19 the card completion button is missing or enabled')
  if (!/stripe\/initiate/.test(JSON.stringify(requests))) ok('B20 no request reached the removed /api/payments/stripe/initiate anywhere in the run')
  else fail('B20 a request reached the removed Stripe route')

  // ----------------------------------------------------------------------------------------
  // cleanup + report
  // ----------------------------------------------------------------------------------------
  const cleanup: string[] = []
  if (addressId) {
    const del = await api('DELETE', `/api/addresses/${addressId}`, jar)
    cleanup.push(`DELETE /api/addresses/${addressId} → ${del.status}`)
  }
  await context.close()
  await anonContext.close()
  await anonContext2.close()
  await browser.close()

  console.log(`verifier browser probe — base=${BASE} — ${new Date().toISOString()}`)
  for (const line of lines) console.log(`[${line.kind === 'info' ? 'info' : line.kind === 'ok' ? ' ok ' : 'FAIL'}] ${line.text}`)
  const failures = lines.filter((l) => l.kind === 'FAIL')
  console.log('')
  console.log(`checks: ${lines.filter((l) => l.kind !== 'info').length}, failed: ${failures.length}`)
  console.log(`top-up intent created by the VietQR branch (delete with cleanup-residue.mts): ${intentCode || 'none'}`)
  console.log(`run cleanup: ${cleanup.join('; ') || 'nothing'}`)
  console.log(`all /api requests observed (${requests.length}):`)
  for (const r of requests.filter((r) => r.url.includes('/api/'))) console.log(`  ${r.method} ${r.url} ${r.postData ? r.postData.slice(0, 160) : ''}`)
  console.log(failures.length === 0 ? 'BROWSER PROBE: PASS' : 'BROWSER PROBE: FAIL')
  process.exit(failures.length === 0 ? 0 : 1)
}

main().catch((error) => {
  console.error('browser probe crashed:', error)
  process.exit(2)
})
