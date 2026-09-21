/**
 * Verifier instrument for task `t11` — the boundary cases that make a fabricated aggregate visible.
 *
 * The dev database holds **0 review rows and 0 download events**, so the "no reviews / no downloads"
 * side of every claim is measured on the live pages by `probe-verify-render-vs-db.mts`. This script
 * measures the other side — a product that really has one review and three downloads — by creating
 * exactly those two facts, reading the pages again (server HTML *and* Chromium, because the review
 * block is a client component), and deleting them again:
 *
 *   1. baseline: DB counts + the rendered `/shop` card + product page (HTML and browser)
 *   2. inject:  1 published review (rating 4) through `POST /api/v1/products/159/reviews` as buyer01
 *               (the buyer owns 159, so BR-05 passes) and 3 `download_events` rows with
 *               `status='SUCCESS'` inserted directly in the collection's own shape
 *   3. measure: the card and the page must show the *real* 4.0 average, 1 review and 3 downloads
 *   4. cleanup: delete both sets and re-measure that both instruments see nothing again
 *
 * Every step prints raw values. The script is the only writer; it restores the database and prints the
 * before/after counts so that can be checked.
 *
 * Run from `web/`: NODE_OPTIONS=--no-deprecation node --import tsx/esm tests/helpers/probe-verify-aggregate-boundary.mts
 */
import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { chromium } from '@playwright/test'

const BASE = process.env.PROBE_BASE ?? 'http://localhost:3000'
const PRODUCT = 159
const SLUG = 'san-pham-159-ban-ve-canh-quan-san-vuon'
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

const scalar = (query: string) => sql(query)[0]?.[0] ?? ''

const decode = (value: string) =>
  value
    .replace(/<[^>]*>/g, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim()

const htmlTextOf = async (path: string) => {
  const res = await fetch(`${BASE}${path}`)
  return decode((await res.text()).replace(/<script[\s\S]*?<\/script>/g, '').replace(/<style[\s\S]*?<\/style>/g, ''))
}

const cardOf = async (slug: string) => {
  const html = await (await fetch(`${BASE}/shop`)).text()
  const blocks = Array.from(html.matchAll(/<a[^>]*data-slot="product-card"[^>]*>([\s\S]*?)<\/a>/g))
  const block = blocks.find((b) => b[0].includes(`/products/${slug}`))
  return block ? decode(block[1]) : null
}

const results: Array<{ step: string; value: string; truth: string; ok: boolean }> = []
const check = (step: string, value: string, truth: string, ok: boolean) => {
  results.push({ step, value, truth, ok })
  console.log(`  ${ok ? '[ ok ]' : '[FAIL]'} ${step}: "${value}" vs ${truth}`)
}

/** Values the product page shows for aggregates, from server HTML or a browser's rendered text. */
const claimsOf = (text: string) => ({
  headerRating: /([\d.]+)\s*\(\s*(\d+)\s*đánh giá\s*\)/.exec(text),
  downloadClaim: /(\d+)\s*lượt tải/.exec(text),
  score: /(\d\.\d)\s*\/\s*5/.exec(text),
  reviewCountLine: /Dựa trên\s*(\d+)\s*lượt đánh giá/.exec(text),
  distribution: Array.from(text.matchAll(/([1-5])\s*sao\s*(\d+)\s*\((\d+)%\)/g)).map((m) => `${m[1]} sao ${m[2]} (${m[3]}%)`),
  verified: /người mua đã xác thực/.exec(text),
  tabPill: /Đánh giá\s*(\d+)/.exec(text),
})

const main = async () => {
  // login (buyer01 owns product 159 through an active entitlement)
  const loginRes = await fetch(`${BASE}/api/users/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'buyer01@kientaohub.vn', password: PASSWORD }),
  })
  const setCookies: string[] = (loginRes.headers as any).getSetCookie?.() ?? []
  const match = setCookies.map((c) => /(^|,\s*)payload-token=([^;]+)/.exec(c || '')).find(Boolean)
  if (!match) throw new Error(`login failed: ${loginRes.status}`)
  const cookie = `payload-token=${match[2]}`

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
  const context = await browser.newContext()
  const page = await context.newPage()
  await page.route('**/*.{png,jpg,jpeg,webp,gif,avif,svg}', (route) => route.abort()).catch(() => {})

  const browserTextOf = async (path: string) => {
    await page.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(2500)
    return page.locator('body').innerText()
  }

  console.log('=== baseline (no review, no download event for this product) ===')
  const before = {
    reviews: Number(scalar(`select count(*) from reviews where product_id=${PRODUCT}`)),
    events: Number(scalar(`select count(*) from download_events where product_id=${PRODUCT}`)),
    entitlement: scalar(`select count(*) from entitlements where user_id=9 and product_id=${PRODUCT} and status='active'`),
  }
  console.log(`  DB: reviews ${before.reviews}, download_events ${before.events}, buyer01 active entitlement ${before.entitlement}`)
  const basePageHtml = claimsOf(await htmlTextOf(`/products/${SLUG}`))
  const basePageBrowser = claimsOf(await browserTextOf(`/products/${SLUG}`))
  const baseCard = (await cardOf(SLUG)) ?? ''
  check('baseline HTML: no header rating', basePageHtml.headerRating?.[0] ?? '(absent)', '0 review rows', !basePageHtml.headerRating)
  check('baseline HTML: no download count', basePageHtml.downloadClaim?.[0] ?? '(absent)', '0 download_events rows', !basePageHtml.downloadClaim)
  check('baseline browser: no review score block', basePageBrowser.score?.[0] ?? '(absent)', '0 review rows', !basePageBrowser.score)
  check('baseline browser: no “người mua đã xác thực” claim', basePageBrowser.verified?.[0] ?? '(absent)', 'the fabricated claim must not exist at all', !basePageBrowser.verified)
  check('baseline browser: no star distribution', basePageBrowser.distribution.join(', ') || '(absent)', '0 review rows', basePageBrowser.distribution.length === 0)
  check('baseline card: no rating', /★|\b[1-5]\.\d\s*\(\s*\d/.test(baseCard) ? 'present' : '(absent)', '0 review rows', !/★|\b[1-5]\.\d\s*\(\s*\d/.test(baseCard))
  check('baseline card: no download count', /lượt tải/.test(baseCard) ? 'present' : '(absent)', '0 download_events rows', !/lượt tải/.test(baseCard))

  console.log('')
  console.log('=== inject: 3 SUCCESS download_events + 1 published review (rating 4) ===')
  sql(
    `insert into download_events (user_id, product_id, entitlement_id, status, downloaded_at, updated_at, created_at)
     select 9, ${PRODUCT}, e.id, 'SUCCESS', now() - (g || ' minutes')::interval, now(), now()
     from entitlements e, generate_series(1,3) g
     where e.user_id=9 and e.product_id=${PRODUCT}`,
  )
  const insertedEvents = Number(scalar(`select count(*) from download_events where product_id=${PRODUCT} and status='SUCCESS'`))
  console.log(`  download_events inserted: ${insertedEvents}`)
  const reviewRes = await fetch(`${BASE}/api/v1/products/${PRODUCT}/reviews`, {
    method: 'POST',
    headers: { Cookie: cookie, 'Content-Type': 'application/json' },
    body: JSON.stringify({ rating: 4, content: 't11 verifier boundary probe — created and deleted by the verifier' }),
  })
  const reviewBody: any = await reviewRes.json().catch(() => null)
  console.log(`  POST /api/v1/products/${PRODUCT}/reviews → ${reviewRes.status}, review id ${reviewBody?.review?.id}`)

  const injected = {
    reviews: Number(scalar(`select count(*) from reviews where product_id=${PRODUCT} and status='published'`)),
    events: Number(scalar(`select count(*) from download_events where product_id=${PRODUCT} and status='SUCCESS'`)),
    avg: scalar(`select round(avg(rating),2) from reviews where product_id=${PRODUCT} and status='published'`),
  }
  console.log(`  DB now: ${injected.reviews} published review(s) (avg ${injected.avg}), ${injected.events} SUCCESS event(s)`)

  console.log('')
  console.log('=== with the facts present ===')
  const withPageHtmlText = await htmlTextOf(`/products/${SLUG}`)
  const withPageHtml = claimsOf(withPageHtmlText)
  const withPageBrowserText = await browserTextOf(`/products/${SLUG}`)
  const withPageBrowser = claimsOf(withPageBrowserText)
  const withCard = (await cardOf(SLUG)) ?? ''
  {
    const idx = withPageBrowserText.indexOf('Đánh giá & Nhận xét')
    console.log('  --- browser review-section window (raw) ---')
    console.log('  ' + withPageBrowserText.slice(idx, idx + 500).replace(/\n/g, ' | '))
    console.log('  --- browser lines carrying an aggregate ---')
    console.log('  ' + withPageBrowserText.split('\n').filter((l) => /%|sao|đánh giá|xác thực|\/ 5|^\d+$/.test(l)).slice(0, 40).join(' | '))
  }

  check('HTML header rating == real average and count', withPageHtml.headerRating?.[0] ?? '(absent)', `${injected.avg} (${injected.reviews} đánh giá)`, withPageHtml.headerRating?.[1] === '4.0' && withPageHtml.headerRating?.[2] === String(injected.reviews))
  check('HTML download count == the recorded events', withPageHtml.downloadClaim?.[0] ?? '(absent)', `${injected.events} lượt tải`, withPageHtml.downloadClaim?.[1] === String(injected.events))
  check('browser review block score == real average', withPageBrowser.score?.[0] ?? '(absent)', `${injected.avg} / 5`, withPageBrowser.score?.[1] === '4.0')
  check('browser review count == real count', withPageBrowser.reviewCountLine?.[0] ?? '(absent)', `Dựa trên ${injected.reviews} lượt đánh giá`, withPageBrowser.reviewCountLine?.[1] === String(injected.reviews))
  check('browser star distribution == the single 4-star review', withPageBrowser.distribution.join(', ') || '(absent)', '4 sao 1 (100%), the other four 0 (0%)', withPageBrowser.distribution.join(',') === '5 sao 0 (0%),4 sao 1 (100%),3 sao 0 (0%),2 sao 0 (0%),1 sao 0 (0%)')
  check('browser “người mua đã xác thực” claim', withPageBrowser.verified?.[0] ?? '(absent)', 'the fabricated claim must not exist at all', !withPageBrowser.verified)
  check('browser tab pill count == real count', withPageBrowser.tabPill?.[0] ?? '(absent)', `Đánh giá ${injected.reviews}`, withPageBrowser.tabPill?.[1] === String(injected.reviews))
  {
    // The per-review "Đã mua hàng" badge is only honest if posting a review really requires ownership:
    // seller01 holds no entitlement for product 159, so the route must refuse (BR-05).
    const sellerLogin = await fetch(`${BASE}/api/users/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'seller01@kientaohub.vn', password: PASSWORD }),
    })
    const sellerCookies: string[] = (sellerLogin.headers as any).getSetCookie?.() ?? []
    const sellerMatch = sellerCookies.map((c) => /(^|,\s*)payload-token=([^;]+)/.exec(c || '')).find(Boolean)
    const sellerRes = await fetch(`${BASE}/api/v1/products/${PRODUCT}/reviews`, {
      method: 'POST',
      headers: { Cookie: `payload-token=${sellerMatch?.[2]}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ rating: 5, content: 't11 verifier probe — must be refused (BR-05)' }),
    })
    check('BR-05: a non-owner cannot post a review (so “Đã mua hàng” is not a constant)', String(sellerRes.status), '403 (no entitlement)', sellerRes.status === 403)
  }
  check('card download count == the recorded events', /(\d+)\s*lượt tải/.exec(withCard)?.[0] ?? '(absent)', `${injected.events} lượt tải`, /(\d+)\s*lượt tải/.exec(withCard)?.[1] === String(injected.events))
  check('card rating == the real average and count', /([\d.]+)\s*\(\s*(\d+)\s*\)/.exec(withCard)?.slice(0, 3).join(' ') ?? '(absent)', '4.0 (1)', /([\d.]+)\s*\(\s*(\d+)\s*\)/.exec(withCard)?.[1] === '4.0' && /([\d.]+)\s*\(\s*(\d+)\s*\)/.exec(withCard)?.[2] === '1')

  console.log('')
  console.log('=== cleanup: delete both sets again ===')
  const deletedReviews = sql(`delete from reviews where product_id=${PRODUCT} and content like 't11 verifier boundary probe%' returning id`)
  const deletedEvents = sql(`delete from download_events where product_id=${PRODUCT}`)
  console.log(`  deleted reviews: ${deletedReviews.map((r) => r[0]).join(', ') || 'none'}`)
  console.log(`  deleted download_events rows: ${deletedEvents.length}`)
  const afterCleanup = {
    reviews: Number(scalar(`select count(*) from reviews where product_id=${PRODUCT}`)),
    events: Number(scalar(`select count(*) from download_events where product_id=${PRODUCT}`)),
    globalReviews: Number(scalar('select count(*) from reviews')),
    globalEvents: Number(scalar('select count(*) from download_events')),
  }
  console.log(`  DB after cleanup — product ${PRODUCT}: reviews ${afterCleanup.reviews}, events ${afterCleanup.events}; tables: reviews ${afterCleanup.globalReviews}, download_events ${afterCleanup.globalEvents}`)
  const cleanHtml = claimsOf(await htmlTextOf(`/products/${SLUG}`))
  const cleanBrowser = claimsOf(await browserTextOf(`/products/${SLUG}`))
  check('after cleanup HTML shows no rating', cleanHtml.headerRating?.[0] ?? '(absent)', '0 review rows', !cleanHtml.headerRating)
  check('after cleanup HTML shows no download count', cleanHtml.downloadClaim?.[0] ?? '(absent)', '0 download_events rows', !cleanHtml.downloadClaim)
  check('after cleanup browser shows no review score', cleanBrowser.score?.[0] ?? '(absent)', '0 review rows', !cleanBrowser.score)

  await context.close()
  await browser.close()

  const failed = results.filter((r) => !r.ok)
  console.log('')
  console.log(`boundary checks: ${results.length}, failing: ${failed.length}`)
  for (const f of failed) console.log(`  FAIL ${f.step}: "${f.value}" vs ${f.truth}`)
  console.log(failed.length === 0 ? 'AGGREGATE BOUNDARY: PASS' : 'AGGREGATE BOUNDARY: FAIL')
  process.exit(failed.length === 0 && afterCleanup.reviews === 0 && afterCleanup.events === 0 ? 0 : 1)
}

main().catch((error) => {
  console.error('probe crashed:', error)
  process.exit(2)
})
