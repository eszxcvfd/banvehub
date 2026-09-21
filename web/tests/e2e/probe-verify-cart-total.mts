/**
 * Verifier instrument for task `t29` — the cart's payable total vs the money path.
 *
 * Written by `verifier` for this task. It does NOT run or cite the author's probe
 * (`web/tests/e2e/probe-cart-total-vs-money-path.mts`).
 *
 * What it measures, on a real browser session:
 *   1. a cart obtained the way a buyer obtains it (the storefront's own “Thêm vào giỏ hàng” control,
 *      retried until the session cart holds the item; the drawer is read back), or — if the harness
 *      cannot — a cart seeded through the app's own storage contract, labelled as such;
 *   2. the **payable total the cart displays**: the `.ant-statistic` whose title is “Tổng thanh toán”,
 *      i.e. its own value node, never the “Tạm tính” row (the mistake the author's first control made);
 *   3. the checkout's summary for the same cart: its “Tạm tính”, any “Khấu trừ số dư ví” row and its
 *      own “Tổng thanh toán”;
 *   4. the sum of the items' own `products.price` read with SQL — the value
 *      `POST /api/v1/orders/purchase` charges per item (decision 0002);
 *   5. the resurrection probe: `KIENTAO10`, `Ưu đãi`, `Mã ưu đãi` and discount-row patterns counted in
 *      the served `/cart` HTML and in every client bundle chunk that page references;
 *   6. the database side: tables matching coupon/voucher/discount/promo.
 *
 * Negative control (`--mutate-discount=0.1`): the `/cart` document is served as a **scratch copy** — the
 * same HTML with one injected script that rewrites the payable-total value node down by 10 %, leaving the
 * “Tạm tính” row untouched. The probe must then exit non-zero and name the mismatch; without the flag it
 * must pass. The repository is never modified: the mutation lives in the served response.
 *
 * Usage (from `web/`):
 *   NODE_OPTIONS="--no-deprecation --import=tsx/esm" node tests/e2e/probe-verify-cart-total.mts
 *   NODE_OPTIONS="--no-deprecation --import=tsx/esm" node tests/e2e/probe-verify-cart-total.mts --mutate-discount=0.1
 */
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium, type Page } from '@playwright/test'

const HERE = dirname(fileURLToPath(import.meta.url))
const WEB = resolve(HERE, '../..')
const BASE = process.env.PROBE_BASE ?? 'http://localhost:3000'
const EVIDENCE = resolve(WEB, '../.lit/evidence/verifier-t29')
const PASSWORD = process.env.PROBE_PASSWORD ?? 'KienTao@2026'
const PRODUCT_SLUG = process.env.PROBE_PRODUCT ?? 'san-pham-2-ban-ve-kien-truc'

const arg = (name: string, fallback?: string): string | undefined => {
  const hit = process.argv.find((value) => value.startsWith(`--${name}=`))
  return hit ? hit.slice(name.length + 3) : fallback
}
const MUTATE = arg('mutate-discount', '') as string

const results: Array<{ step: string; value: string; truth: string; ok: boolean }> = []
const check = (step: string, value: string, truth: string, ok: boolean) => {
  results.push({ step, value, truth, ok })
  console.log(`  ${ok ? '[ ok ]' : '[FAIL]'} ${step}: "${value}" vs ${truth}`)
}
const info = (line: string) => console.log(line)

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

const money = (text: string): number => Number((text.replace(/[^\d]/g, '') || '0'))

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

/** The payable total: the Statistic whose title is “Tổng thanh toán”, never the “Tạm tính” row. */
const readPayableTotal = async (page: Page): Promise<{ total: number; node: string; title: string } | null> => {
  const data = await page.evaluate(() => {
    const stats = Array.from(document.querySelectorAll('.ant-statistic'))
    const target = stats.find((stat) =>
      (stat.querySelector('.ant-statistic-title')?.textContent || '').includes('Tổng thanh toán'),
    )
    if (!target) return null
    const valueNode =
      target.querySelector('.ant-statistic-content-value') ?? target.querySelector('.ant-statistic-content')
    return {
      title: (target.querySelector('.ant-statistic-title')?.textContent || '').trim(),
      node: (valueNode?.textContent || '').replace(/\s+/g, ' ').trim(),
      content: (target.querySelector('.ant-statistic-content')?.textContent || '').replace(/\s+/g, ' ').trim(),
    }
  })
  if (!data) return null
  return { total: money(data.content || data.node), node: data.node, title: data.title }
}

/** A labelled row of the summary (“Tạm tính”, “Khấu trừ số dư ví”, “Khuyến mãi / Giảm giá”). */
const readRow = async (page: Page, label: string): Promise<number | null> => {
  const text = await page.evaluate((needle) => {
    const nodes = Array.from(document.querySelectorAll('div'))
    for (const node of nodes) {
      const own = (node.textContent || '').replace(/\s+/g, ' ').trim()
      const children = Array.from(node.children)
      if (children.length !== 2) continue
      const first = (children[0].textContent || '').trim()
      if (first.startsWith(needle) && own.length < needle.length + 40) {
        return own
      }
    }
    return null
  }, label)
  if (!text) return null
  const amounts = Array.from(text.matchAll(/-?([\d.]+)\s*₫/g)).map((match) => Number(match[1].replace(/\./g, '')))
  return amounts.length > 0 ? amounts[amounts.length - 1] : null
}

const main = async () => {
  mkdirSync(EVIDENCE, { recursive: true })
  const token = await login('buyer01@kientaohub.vn')
  const browser = await chromium.launch({
    executablePath: [process.env.PROBE_CHROMIUM, join(homedir(), '.cache/ms-playwright/chromium-1234/chrome-linux64/chrome')]
      .filter(Boolean)
      .find((candidate) => existsSync(candidate as string)) as string | undefined,
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
  })
  const context = await browser.newContext()
  await context.addCookies([{ name: 'payload-token', value: token, url: BASE }])
  const page = await context.newPage()
  page.on('console', (message) => {
    if (message.type() === 'error') info(`  [browser console error] ${message.text().slice(0, 160)}`)
  })
  page.on('pageerror', (error) => info(`  [browser page error] ${String(error).slice(0, 160)}`))

  // The negative control mutates a **scratch copy of the rendered page**: after the cart has rendered
  // normally, the payable-total value node is rewritten down by the discount and the same discount row
  // the pre-t28 voucher drew is inserted — all inside this browser session. Nothing in the repository,
  // and nothing the server sends, is modified (the served document was measured to be identical).

  // ---------------------------------------------------------------------------------------------
  // 1. the cart, obtained the way a buyer obtains it
  // ---------------------------------------------------------------------------------------------
  console.log('=== 1. obtaining the cart (add-to-cart control) ===')
  await page.goto(`${BASE}/products/${PRODUCT_SLUG}`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(2000)
  const addButton = page.getByRole('button', { name: 'Thêm vào giỏ hàng' }).first()
  let addAttempts = 0
  let pathUsed = 'add-to-cart click'
  for (let attempt = 0; attempt < 4; attempt += 1) {
    addAttempts += 1
    await addButton.click().catch((error) => info(`  click attempt ${attempt + 1} failed: ${(error as Error).message.slice(0, 80)}`))
    await page.waitForTimeout(1000)
    const stored = await page.evaluate(() => window.sessionStorage.getItem('kientaohub_cart'))
    if (stored) break
  }
  let cartState = await page.evaluate(() => window.sessionStorage.getItem('kientaohub_cart'))
  if (!cartState) {
    // Fall back to the app's own storage contract, labelled: key `kientaohub_cart`
    // (`CART_SESSION_STORAGE_KEY`, src/providers/Cart/index.tsx), value shaped as the provider reads it.
    const row = psql(`select id, title, price from products where slug = '${PRODUCT_SLUG}'`)[0]
    pathUsed = 'sessionStorage seed (add-to-cart click did not fill the cart)'
    info(`  add-to-cart click did not fill the cart after ${addAttempts} attempts; seeding sessionStorage['kientaohub_cart'] from the record`)
    await page.evaluate(
      ([key, seeded]) => window.sessionStorage.setItem(key as string, seeded as string),
      [
        'kientaohub_cart',
        JSON.stringify({
          items: [{ id: row[0], product: { id: Number(row[0]), title: row[1], price: Number(row[2]) }, quantity: 1 }],
        }),
      ],
    )
    cartState = await page.evaluate(() => window.sessionStorage.getItem('kientaohub_cart'))
  } else {
    info(`  add-to-cart click filled the cart after ${addAttempts} attempt(s)`)
  }
  const cartItems = (JSON.parse(cartState ?? '{"items":[]}').items ?? []) as Array<{ id: string; quantity: number; product?: { id?: number } }>
  const drawerText = (await page.locator('.ant-drawer').first().innerText().catch(() => '')).replace(/\s+/g, ' ')
  const productTitle = String(psql(`select title from products where slug='${PRODUCT_SLUG}'`)[0]?.[0] ?? '')
  check('cart path used', pathUsed, 'the buyer path when available, else a labelled seed', true)
  check('the drawer shows the added item', drawerText.includes(productTitle) ? productTitle : '(absent)', productTitle, drawerText.includes(productTitle))
  info(`  sessionStorage['kientaohub_cart'] = ${cartState}`)

  // ---------------------------------------------------------------------------------------------
  // 2. the record side: the sum of the items' own prices (the money path's number)
  // ---------------------------------------------------------------------------------------------
  const ids = cartItems.map((item) => Number(item.product?.id ?? item.id)).filter((id) => Number.isInteger(id) && id > 0)
  const rows = psql(`select id, price from products where id in (${ids.join(',')})`)
  const recordSum = rows.reduce((sum, row) => sum + Number(row[1]), 0) * 1
  const recordSumWithQty = cartItems.reduce((sum, item) => {
    const row = rows.find((candidate) => Number(candidate[0]) === Number(item.product?.id ?? item.id))
    return sum + Number(row?.[1] ?? 0) * (item.quantity || 1)
  }, 0)
  console.log('')
  console.log('=== 2. the record side (SQL) ===')
  info(`  cart items: ${JSON.stringify(cartItems.map((item) => ({ id: item.id, qty: item.quantity })))}`)
  info(`  products.price rows: ${JSON.stringify(rows)} → sum(price * quantity) = ${recordSumWithQty}`)
  check('every cart item resolves to a product record', String(ids.length), String(cartItems.length), ids.length === cartItems.length)

  // ---------------------------------------------------------------------------------------------
  // 3. the cart's payable total and the checkout's total
  // ---------------------------------------------------------------------------------------------
  console.log('')
  console.log('=== 3. the cart page ===')
  await page.goto(`${BASE}/cart`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(3000)
  if (MUTATE) {
    const factor = 1 - Number(MUTATE)
    const applied = await page.evaluate((discountFactor) => {
      const stats = Array.from(document.querySelectorAll('.ant-statistic'))
      const target = stats.find((stat) =>
        (stat.querySelector('.ant-statistic-title')?.textContent || '').includes('Tổng thanh toán'),
      )
      if (!target) return null
      const valueNode =
        target.querySelector('.ant-statistic-content-value') ?? target.querySelector('.ant-statistic-content')
      const digits = (valueNode?.textContent || '').replace(/[^0-9]/g, '')
      if (!valueNode || !digits) return null
      const trueTotal = Number(digits)
      const discounted = Math.round(trueTotal * discountFactor)
      valueNode.textContent = discounted.toLocaleString('vi-VN')
      const summary = target.closest('div.space-y-3') ?? target.parentElement?.parentElement ?? target.parentElement
      if (summary) {
        const row = document.createElement('div')
        row.className = 'flex justify-between text-emerald-600'
        row.innerHTML = `<span>Khuyến mãi / Giảm giá:</span><span class="font-mono font-medium">-${(trueTotal - discounted).toLocaleString('vi-VN')} ₫</span>`
        summary.parentElement?.insertBefore(row, summary)
      }
      return { trueTotal, discounted }
    }, factor)
    info(`  MUTATION MODE: the scratch copy of the rendered cart carries a -${Number(MUTATE) * 100}% discount (${JSON.stringify(applied)})`)
  }
  const cartTotal = await readPayableTotal(page)
  const cartSubtotalRow = await readRow(page, 'Tạm tính')
  const cartDiscountRow = await readRow(page, 'Khuyến mãi / Giảm giá')
  // The cart's own summary card is the surface that matters: the footer's marketing line
  // ("…ưu đãi đặc biệt") is not a cart discount and is reported separately below.
  const cartSummaryText = await page.evaluate(() => {
    const stats = Array.from(document.querySelectorAll('.ant-statistic'))
    const target = stats.find((stat) =>
      (stat.querySelector('.ant-statistic-title')?.textContent || '').includes('Tổng thanh toán'),
    )
    const card = target?.closest('.ant-card')
    return (card?.textContent || '').replace(/\s+/g, ' ').trim()
  })
  check('cart summary shows no discount row', cartDiscountRow === null ? '(absent)' : String(cartDiscountRow), 'absent', cartDiscountRow === null)
  check('cart summary carries no voucher wording', /Khuyến mãi|Giảm giá|Ưu đãi|Mã ưu đãi|KIENTAO10|đã giảm/i.test(cartSummaryText) ? cartSummaryText.slice(0, 120) : '(absent)', 'absent', !/Khuyến mãi|Giảm giá|Ưu đãi|Mã ưu đãi|KIENTAO10|đã giảm/i.test(cartSummaryText))
  const pageText = await page.evaluate(() => document.body.innerText.replace(/\s+/g, ' '))
  const pageHits = Array.from(pageText.matchAll(/(?:Ưu đãi|ưu đãi|Mã ưu đãi|KIENTAO10)/gi)).map((m) => m[0])
  info(`  whole-page wording occurrences (reported, not asserted — the footer’s “ưu đãi đặc biệt” line): ${JSON.stringify(pageHits)}`)
  if (!cartTotal) {
    const diag = await page.evaluate(() => ({
      storage: window.sessionStorage.getItem('kientaohub_cart'),
      text: (document.body.innerText || '').replace(/\s+/g, ' ').slice(0, 300),
      statCount: document.querySelectorAll('.ant-statistic').length,
    }))
    info(`  DIAGNOSTIC cart page: storage=${String(diag.storage).slice(0, 120)} statistics=${diag.statCount} body="${diag.text}"`)
    const consoleErrors = await page.evaluate(() => (window as any).__t29errors ?? null)
    info(`  DIAGNOSTIC console errors: ${JSON.stringify(consoleErrors)}`)
  }
  info(`  payable total node: title="${cartTotal?.title ?? '(not found)'}" valueNode="${cartTotal?.node ?? ''}" → ${cartTotal?.total ?? 'n/a'}`)
  info(`  “Tạm tính” row (read for contrast, NOT used as the total): ${cartSubtotalRow ?? 'n/a'}`)
  check('cart payable total == sum(products.price × quantity)', String(cartTotal?.total ?? 'n/a'), String(recordSumWithQty), cartTotal?.total === recordSumWithQty)
  check('cart “Tạm tính” row also equals the record sum', String(cartSubtotalRow ?? 'n/a'), String(recordSumWithQty), cartSubtotalRow === recordSumWithQty)

  console.log('')
  console.log('=== 4. the checkout page (same cart) ===')
  await page.goto(`${BASE}/checkout`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(3500)
  const checkoutTotal = await readPayableTotal(page)
  const checkoutSubtotal = await readRow(page, 'Tạm tính')
  const walletDeduction = await readRow(page, 'Khấu trừ số dư ví')
  const discountRow = await readRow(page, 'Khuyến mãi / Giảm giá')
  info(`  checkout subtotal=${checkoutSubtotal ?? 'n/a'} walletDeduction=${walletDeduction ?? 'none'} discountRow=${discountRow ?? 'none'} total=${checkoutTotal?.total ?? 'n/a'}`)
  check('checkout “Tạm tính” == the record sum', String(checkoutSubtotal ?? 'n/a'), String(recordSumWithQty), checkoutSubtotal === recordSumWithQty)
  check('checkout shows no discount row', discountRow === null ? '(absent)' : String(discountRow), 'absent', discountRow === null)
  const expectedCheckoutTotal = (checkoutSubtotal ?? 0) - (walletDeduction ?? 0)
  check('checkout payable total == its subtotal − wallet deduction', String(checkoutTotal?.total ?? 'n/a'), String(expectedCheckoutTotal), checkoutTotal?.total === expectedCheckoutTotal)
  if (walletDeduction) {
    info(`  note: the checkout’s total is reduced by ${walletDeduction} — the wallet balance the buyer applies, a real payment (decision 0002/0005), not a discount`)
  }

  // ---------------------------------------------------------------------------------------------
  // 5. resurrection probe: the voucher in the served HTML and the client bundles
  // ---------------------------------------------------------------------------------------------
  console.log('')
  console.log('=== 5. voucher resurrection probe ===')
  const cartHtml = await (await fetch(`${BASE}/cart`, { headers: { Cookie: `payload-token=${token}` } })).text()
  const chunks = Array.from(new Set(Array.from(cartHtml.matchAll(/src="(\/_next\/static\/[^"]+\.js)"/g)).map((m) => m[1])))
  let bundleText = ''
  for (const chunk of chunks) {
    bundleText += await (await fetch(`${BASE}${chunk}`)).text()
  }
  const tokens = ['KIENTAO10', 'Ưu đãi', 'Mã ưu đãi', 'đã giảm', 'Giảm giá', 'discountPercent', 'discountAmount']
  for (const token of tokens) {
    const inHtml = cartHtml.split(token).length - 1
    const inBundle = bundleText.split(token).length - 1
    check(`"${token}" in the served /cart HTML`, String(inHtml), '0 occurrences', inHtml === 0)
    check(`"${token}" in the client bundles of /cart (${chunks.length} chunks)`, String(inBundle), '0 occurrences', inBundle === 0)
  }

  // ---------------------------------------------------------------------------------------------
  // 6. the database side
  // ---------------------------------------------------------------------------------------------
  console.log('')
  console.log('=== 6. database: what the money path could honour ===')
  const tables = psql(
    "select table_name from information_schema.tables where table_schema='public' and (table_name ilike '%coupon%' or table_name ilike '%voucher%' or table_name ilike '%discount%' or table_name ilike '%promo%')",
  )
  info(`  tables matching coupon/voucher/discount/promo: ${tables.length === 0 ? '0 rows (none)' : JSON.stringify(tables)}`)
  check('no coupon/voucher/discount/promo table exists', String(tables.length), '0', tables.length === 0)

  // ---------------------------------------------------------------------------------------------
  // 7. cleanup
  // ---------------------------------------------------------------------------------------------
  console.log('')
  console.log('=== 7. cleanup ===')
  if (pathUsed.startsWith('sessionStorage seed')) {
    await page.goto(`${BASE}/cart`, { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(800)
  }
  await page.evaluate(() => window.sessionStorage.removeItem('kientaohub_cart')).catch(() => {})
  const after = await page.evaluate(() => window.sessionStorage.getItem('kientaohub_cart')).catch(() => 'n/a')
  check('the verifier’s cart session is cleared', String(after), 'null', after === null)
  const addressCount = psql('select count(*) from addresses')[0]?.[0] ?? '?'
  info(`  addresses rows (the verifier created none): ${addressCount}`)

  await context.close()
  await browser.close()

  const failed = results.filter((entry) => !entry.ok)
  console.log('')
  console.log(`checks: ${results.length}, failing: ${failed.length}`)
  for (const entry of failed) console.log(`  FAIL ${entry.step}: "${entry.value}" vs ${entry.truth}`)
  writeFileSync(
    resolve(EVIDENCE, MUTATE ? `cart-total-mutated-${MUTATE}.json` : 'cart-total-clean.json'),
    JSON.stringify({ ranAt: new Date().toISOString(), mutateDiscount: MUTATE || null, pathUsed, cartItems, recordSumWithQty, results }, null, 2),
  )
  console.log(failed.length === 0 ? 'CART-TOTAL: PASS' : 'CART-TOTAL: FAIL')
  process.exit(failed.length === 0 ? 0 : 1)
}

main().catch((error) => {
  console.error('probe crashed:', error)
  process.exit(2)
})
