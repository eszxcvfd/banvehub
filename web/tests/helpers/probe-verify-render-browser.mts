/**
 * Verifier instrument for task `t11` — browser-rendered pages vs the database.
 *
 * The server HTML cannot show a client component's output, and `/cart`, `/checkout` and the wallet's
 * top-up modal are exactly that. This probe drives Chromium against http://localhost:3000 and compares
 * what is on the screen with the record it describes, read directly from Postgres:
 *
 *   1. product page 159: every image on the page must be one of the product's own media (the old defect
 *      padded the gallery with curated photos); the gallery counter must match the real count
 *   2. cart: add product 158 through the product page, then the drawer, `/cart` and `/checkout` must show
 *      that product's own title and its DB price, and the subtotal must be price × quantity
 *   3. wallet (buyer01): the top-up modal must open and render its instructions and presets, and opening
 *      it must not create a payment intent (no top-up is performed by this probe)
 *
 * Run from `web/`: NODE_OPTIONS=--no-deprecation node --import tsx/esm tests/helpers/probe-verify-render-browser.mts
 */
import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { chromium, type Page } from '@playwright/test'

const BASE = process.env.PROBE_BASE ?? 'http://localhost:3000'
const PASSWORD = process.env.PROBE_PASSWORD ?? 'KienTao@2026'

const sql = (query: string): string[][] =>
  execFileSync(
    'docker',
    ['exec', 'kientaohub-postgres', 'psql', '-U', 'payload', '-d', 'kientaohub', '-t', '-A', '-F', '|', '-c', query],
    { encoding: 'utf8' },
  )
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.split('|'))

const results: Array<{ step: string; value: string; truth: string; ok: boolean }> = []
const check = (step: string, value: string, truth: string, ok: boolean) => {
  results.push({ step, value, truth, ok })
  console.log(`  ${ok ? '[ ok ]' : '[FAIL]'} ${step}: "${value}" vs ${truth}`)
}

const ownMediaOf = (productId: number): string[] =>
  sql(`select filename from (
        select m.filename from products_rels pr join product_previews pp on pp.id = pr.product_previews_id join media m on m.id = pp.preview_image_id where pr.parent_id=${productId}
        union
        select m.filename from products_gallery g join media m on m.id = g.image_id where g._parent_id=${productId}
        union
        select m.filename from products p join media m on m.id = p.meta_image_id where p.id=${productId}
      ) t`).map((r) => r[0])

const main = async () => {
  const ownMedia = ownMediaOf(159)
  const product158 = sql(`select title, price, is_free from products where id=158`)[0]
  console.log(`DB: product 159 own media = ${ownMedia.join(', ')}`)
  console.log(`DB: product 158 = "${product158?.[0]}" price ${product158?.[1]} (isFree ${product158?.[2]})`)
  console.log('')

  const executablePath = [
    process.env.PROBE_CHROMIUM,
    join(homedir(), '.cache/ms-playwright/chromium-1234/chrome-linux64/chrome'),
  ]
    .filter(Boolean)
    .find((candidate) => existsSync(candidate as string)) as string | undefined
  const browser = await chromium.launch({
    executablePath,
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
  })

  const requests: Array<{ method: string; url: string; postData: string | null }> = []
  const watch = (page: Page) =>
    page.on('request', (r) => {
      if (r.url().includes('/api/')) requests.push({ method: r.method(), url: r.url().replace(BASE, ''), postData: r.postData() })
    })

  // ---------------------------------------------------------------------------------------
  // 1. product page 159 — images and counter
  // ---------------------------------------------------------------------------------------
  console.log('=== /products/' + 'san-pham-159-ban-ve-canh-quan-san-vuon (anonymous) ===')
  const anon = await browser.newContext()
  const productPage = await anon.newPage()
  watch(productPage)
  await productPage.goto(`${BASE}/products/san-pham-159-ban-ve-canh-quan-san-vuon`, { waitUntil: 'domcontentloaded' })
  await productPage.waitForTimeout(2500)
  const imgSources = await productPage.evaluate(() =>
    Array.from(document.querySelectorAll('img'))
      .map((img) => img.getAttribute('src') || '')
      .map((src) => {
        // `next/image` wraps the real URL in `/_next/image?url=<encoded>`; decode before matching.
        try {
          return src.includes('url=') ? decodeURIComponent(src.split('url=')[1].split('&')[0]) : src
        } catch {
          return src
        }
      })
      .filter((src) => src.includes('/api/media') || src.includes('/media/')),
  )
  const mediaNames = imgSources.map((src) => {
    const own = /\/api\/media\/file\/([^"?]+)/.exec(src)?.[1]
    if (own) return decodeURIComponent(own)
    const curated = /\/media\/curated\/([^"?]+)/.exec(src)?.[1]
    if (curated) return `curated:${curated}`
    return decodeURIComponent(src)
  })
  const foreign = mediaNames.filter((name) => !ownMedia.includes(name))
  console.log(`  images on the page: ${mediaNames.length} → ${Array.from(new Set(mediaNames)).join(', ')}`)
  check('every product image is one of the product’s own media', foreign.length === 0 ? `${new Set(mediaNames).size} own image(s)` : foreign.join(', '), `own media: ${ownMedia.join(', ')}`, foreign.length === 0)
  const counterText = await productPage.getByText(/\d+\s*\/\s*\d+/).first().innerText().catch(() => '')
  const counter = /(\d+)\s*\/\s*(\d+)/.exec(counterText.replace(/\s+/g, ' '))
  check('gallery counter total == the product’s own media count', counter ? counter[0] : '(absent)', `${ownMedia.length} own media`, Boolean(counter) && Number(counter![2]) === ownMedia.length)
  check('gallery counter current == 1 (first slide)', counter ? counter[1] : '(absent)', '1', Boolean(counter) && counter![1] === '1')

  // ---- related cards (the one place that still carries a curated fallback in source) -----
  {
    const related = await productPage.evaluate(() => {
      const current = location.pathname.replace('/products/', '')
      return Array.from(document.querySelectorAll('a[href^="/products/"]'))
        .map((a) => (a.getAttribute('href') || '').replace('/products/', ''))
        .filter((slug) => slug && slug !== current)
        .filter((slug, index, all) => all.indexOf(slug) === index)
    })
    console.log(`  related product links rendered on the page: ${related.length} (${related.slice(0, 5).join(', ') || 'none'})`)
    let foreignCovers = 0
    for (const slug of related.slice(0, 6)) {
      const rows = sql(`select title, price, is_free from products where slug='${slug}'`)[0]
      if (!rows) {
        check(`related card /products/${slug}`, 'link present', 'no product with that slug', false)
        continue
      }
      const card = await productPage.evaluate((target) => {
        const anchor = document.querySelector(`a[href="/products/${target}"]`)
        const img = anchor?.querySelector('img')
        return { text: (anchor?.innerText || '').replace(/\s+/g, ' '), src: img?.getAttribute('src') || '' }
      }, slug)
      const titleOk = card.text.includes(String(rows[0]))
      const priceOk = Number(rows[2] === 't' || Number(rows[1]) === 0)
        ? /Miễn phí|0\s*₫/.test(card.text)
        : card.text.includes(`${Number(rows[1]).toLocaleString('vi-VN')}`)
      check(`related card /products/${slug} title+price`, `"${card.text.slice(0, 50)}"`, `"${rows[0]}" / ${rows[1]}`, titleOk && priceOk)
      const own = ownMediaOf(Number(sql(`select id from products where slug='${slug}'`)[0][0]))
      const ownSrc = own.some((media) => card.src.includes(media))
      if (!ownSrc) foreignCovers += 1
      check(`related card /products/${slug} cover`, card.src || '(none)', `own media: ${own.join(', ') || 'none'}`, ownSrc)
    }
    const curatedInDom = await productPage.evaluate(() =>
      Array.from(document.querySelectorAll('img')).some((img) => (img.getAttribute('src') || '').includes('/media/curated/')),
    )
    check('no curated asset rendered on the product page', String(curatedInDom), 'false — the sheet’s covers are the products’ own media', curatedInDom === false)
    check('related cards with a substituted cover', String(foreignCovers), '0', foreignCovers === 0)
  }

  // ---------------------------------------------------------------------------------------
  // 2. cart + checkout with product 158
  // ---------------------------------------------------------------------------------------
  console.log('')
  console.log('=== /cart and /checkout with product 158 in the session cart ===')
  await productPage.goto(`${BASE}/products/san-pham-158-ban-ve-canh-quan-san-vuon`, { waitUntil: 'domcontentloaded' })
  await productPage.waitForTimeout(1500)
  const addButton = productPage.getByRole('button', { name: 'Thêm vào giỏ hàng' }).first()
  for (let attempt = 0; attempt < 4; attempt += 1) {
    await addButton.click().catch(() => {})
    await productPage.waitForTimeout(900)
    const has = await productPage.evaluate(() => Boolean(window.sessionStorage.getItem('kientaohub_cart')))
    if (has) break
  }
  const cartDrawer = await productPage.locator('.ant-drawer').first().innerText().catch(() => '')
  check('cart drawer shows the product’s own title', cartDrawer.includes(String(product158?.[0])) ? String(product158?.[0]) : '(absent)', String(product158?.[0]), cartDrawer.includes(String(product158?.[0])))
  const drawerPrice = new RegExp(`${Number(product158?.[1]).toLocaleString('vi-VN')}\\s*₫`).test(cartDrawer.replace(/\s+/g, ' '))
  check('cart drawer shows the product’s DB price', drawerPrice ? `${Number(product158?.[1]).toLocaleString('vi-VN')} ₫` : '(absent)', `${product158?.[1]} ₫ from products.price`, drawerPrice)

  await productPage.goto(`${BASE}/cart`, { waitUntil: 'domcontentloaded' })
  await productPage.waitForTimeout(1800)
  const cartText = (await productPage.locator('body').innerText()).replace(/\s+/g, ' ')
  check('/cart shows the product’s own title', cartText.includes(String(product158?.[0])) ? String(product158?.[0]) : '(absent)', String(product158?.[0]), cartText.includes(String(product158?.[0])))
  check('/cart shows the product’s DB price', cartText.includes(`${Number(product158?.[1]).toLocaleString('vi-VN')} ₫`), `${product158?.[1]} ₫`, cartText.includes(`${Number(product158?.[1]).toLocaleString('vi-VN')} ₫`))
  check('/cart shows no rating/download claim for the line', !/lượt tải|\d\.\d\s*\(/.test(cartText) ? '(absent)' : 'present', 'the cart renders the product snapshot only', !/lượt tải|\d\.\d\s*\(/.test(cartText))

  await productPage.goto(`${BASE}/checkout`, { waitUntil: 'domcontentloaded' })
  await productPage.waitForTimeout(2500)
  const checkoutText = (await productPage.locator('body').innerText()).replace(/\s+/g, ' ')
  check('/checkout shows the product’s own title', checkoutText.includes(String(product158?.[0])) ? String(product158?.[0]) : '(absent)', String(product158?.[0]), checkoutText.includes(String(product158?.[0])))
  check('/checkout shows the product’s DB price', checkoutText.includes(`${Number(product158?.[1]).toLocaleString('vi-VN')} ₫`), `${product158?.[1]} ₫`, checkoutText.includes(`${Number(product158?.[1]).toLocaleString('vi-VN')} ₫`))

  // ---------------------------------------------------------------------------------------
  // 3. wallet top-up modal (buyer01) — opens with real content, creates no intent
  // ---------------------------------------------------------------------------------------
  console.log('')
  console.log('=== /wallet top-up modal (buyer01) ===')
  const loginRes = await fetch(`${BASE}/api/users/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'buyer01@kientaohub.vn', password: PASSWORD }),
  })
  const setCookies: string[] = (loginRes.headers as any).getSetCookie?.() ?? []
  const match = setCookies.map((c) => /(^|,\s*)payload-token=([^;]+)/.exec(c || '')).find(Boolean)
  if (!match) throw new Error(`login failed: ${loginRes.status}`)
  const intentsBefore = Number(sql('select count(*) from payment_intents')[0]?.[0] ?? 0)
  const buyer = await browser.newContext()
  await buyer.addCookies([{ name: 'payload-token', value: match[2], url: BASE }])
  const walletPage = await buyer.newPage()
  watch(walletPage)
  await walletPage.goto(`${BASE}/wallet`, { waitUntil: 'domcontentloaded' })
  await walletPage.waitForTimeout(2500)
  const openButton = walletPage.getByRole('button', { name: /Mở cửa sổ nạp tiền/ }).first()
  await openButton.waitFor({ state: 'visible', timeout: 20000 }).catch(() => {})
  const hasOpenButton = (await openButton.count()) > 0 && (await openButton.isVisible().catch(() => false))
  if (!hasOpenButton) {
    const labels = await walletPage
      .evaluate(() => Array.from(document.querySelectorAll('button')).map((b) => (b.innerText || b.getAttribute('aria-label') || '(empty)').replace(/\s+/g, ' ').slice(0, 50)))
      .catch(() => [])
    console.log(`  wallet URL: ${walletPage.url()}`)
    console.log(`  wallet buttons: ${JSON.stringify(labels)}`)
    console.log(`  wallet body window: ${(await walletPage.locator('body').innerText().catch(() => '')).replace(/\n/g, ' | ').slice(0, 400)}`)
  }
  check('the wallet page offers the top-up button', hasOpenButton ? 'present' : '(absent)', 'the restored control exists', hasOpenButton)
  if (hasOpenButton) {
    await openButton.click()
    await walletPage.waitForTimeout(1200)
    const modalText = (await walletPage.locator('.ant-modal').first().innerText().catch(() => '')).replace(/\s+/g, ' ')
    console.log(`  modal text: ${modalText.slice(0, 400)}`)
    for (const [label, token] of [
      ['modal title "Nạp tiền vào ví qua VietQR"', /Nạp tiền vào ví qua VietQR/i],
      ['presets (50.000 / 100.000 / 200.000 …)', /50\.000|100\.000|200\.000/],
      ['the custom-amount note', /Hoặc nhập số tiền khác|Nhập tối thiểu/],
      ['the create-QR action', /Tạo mã QR/],
    ] as Array<[string, RegExp]>) {
      check(label, token.test(modalText) ? 'present' : '(absent)', 't12 restored the real modal', token.test(modalText))
    }
    const qrBeforeIntent = await walletPage.locator('.ant-modal img').count()
    check('no QR image is shown before an intent exists', String(qrBeforeIntent), '0 (the QR comes from a live intent)', qrBeforeIntent === 0)
    await walletPage.keyboard.press('Escape')
    await walletPage.waitForTimeout(500)
  }
  const topupPosts = requests.filter((r) => r.url === '/api/v1/payments/topup')
  const intentsAfter = Number(sql('select count(*) from payment_intents')[0]?.[0] ?? 0)
  check('opening the modal issued no top-up request', String(topupPosts.length), '0 (this probe does not top up)', topupPosts.length === 0)
  check('opening the modal created no payment intent', String(intentsAfter - intentsBefore), '0 new payment_intents row(s)', intentsAfter === intentsBefore)

  await anon.close()
  await buyer.close()
  await browser.close()

  const failed = results.filter((r) => !r.ok)
  console.log('')
  console.log(`browser render checks: ${results.length}, failing: ${failed.length}`)
  for (const f of failed) console.log(`  FAIL ${f.step}: "${f.value}" vs ${f.truth}`)
  console.log(failed.length === 0 ? 'BROWSER RENDER: PASS' : 'BROWSER RENDER: FAIL')
  process.exit(failed.length === 0 ? 0 : 1)
}

main().catch((error) => {
  console.error('probe crashed:', error)
  process.exit(2)
})
