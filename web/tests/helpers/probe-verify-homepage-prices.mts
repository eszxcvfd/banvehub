/**
 * Verifier instrument for task `t3` (ui-api-integration) — homepage render vs database.
 *
 * The captain reported (2026-09-21) that the homepage's "Tài nguyên mới cập nhật" cards render
 * display values that do not belong to the product they link to. This instrument measures that claim
 * directly: it fetches `/` as the browser does, extracts the rendered card (link slug, title, price),
 * re-runs the homepage's own query against the API, and compares the rendered values with the row the
 * card links to.
 *
 * It is independent of both the engineer's probe and the component's internals: the expectation is
 * built from the *API* (`GET /api/products`, the same query the homepage issues) and the observation
 * from the *HTML the server sends*.
 *
 * Exit code 0 = every card's rendered title+price equals the DB row of the slug it links to.
 * Exit code 1 = at least one card shows a value that is not the linked product's (a finding).
 *
 * Run from `web/`:
 *   NODE_OPTIONS=--no-deprecation node --import tsx/esm tests/helpers/probe-verify-homepage-prices.mts
 */
const BASE = process.env.PROBE_BASE ?? 'http://localhost:3000'

type Card = { slug: string; renderedTitle: string; renderedPrice: number | null; rawPrice: string }
type Row = { id: number; slug: string; title: string; price: number | null; isFree: boolean }

const toNumber = (text: string): number | null => {
  // "950.000 ₫" / "1.300.000 ₫" / "0 ₫" — vi-VN grouping, possibly with HTML comments inside
  const cleaned = text
    .replace(/<[^>]*>/g, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/&nbsp;/g, ' ')
    .trim()
  const digits = cleaned.replace(/[^\d]/g, '')
  if (!/[0-9]/.test(cleaned)) return null
  return Number(digits)
}

const decode = (value: string): string =>
  value
    .replace(/<[^>]*>/g, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&nbsp;/g, ' ')
    .trim()

const main = async () => {
  const htmlRes = await fetch(`${BASE}/`, { headers: { Accept: 'text/html' } })
  const html = await htmlRes.text()

  if (!htmlRes.ok) {
    console.error(`homepage fetch failed: ${htmlRes.status}`)
    process.exit(2)
  }

  // The homepage feeds RecentResources from `newArrivals`: published products, sort -createdAt,
  // limit 8, then filtered by the page's own isCleanProduct predicate (title-based).
  const apiRes = await fetch(
    `${BASE}/api/products?limit=8&depth=1&draft=false&sort=-createdAt&where%5B_status%5D%5Bequals%5D=published`,
  )
  const apiJson: any = await apiRes.json()
  const rows: Row[] = (apiJson.docs ?? [])
    .filter((p: any) => p && p.title && (!p._status || p._status === 'published'))
    .filter((p: any) => !/^lifecycle/i.test(p.title) && !/lifecycle asset/i.test(p.title) && !/^test/i.test(p.title))
    .map((p: any) => ({ id: p.id, slug: p.slug, title: p.title, price: p.price ?? 0, isFree: Boolean(p.isFree) }))

  const chunks = html.split('data-slot="recent-resource-card"').slice(1)
  const cards: Card[] = chunks.map((chunk) => {
    const href = /href="([^"]+)"/.exec(chunk)?.[1] ?? ''
    const titleMatch = /line-clamp-2 min-h-\[36px\][^>]*>([\s\S]*?)<\/div>/.exec(chunk)?.[1] ?? ''
    const priceMatch =
      /text-slate-900 dark:text-white font-bold text-xs md:text-sm tracking-tight">([\s\S]*?)<\/div>/.exec(chunk)?.[1] ?? ''
    return {
      slug: href.replace(/^\/products\//, ''),
      renderedTitle: decode(titleMatch),
      renderedPrice: toNumber(priceMatch),
      rawPrice: decode(priceMatch),
    }
  })

  console.log(`homepage render vs database — base=${BASE} — ${new Date().toISOString()}`)
  console.log(`products returned by the homepage query (published, -createdAt, limit 8, cleaned): ${rows.length}`)
  console.log(`curated cards rendered: ${cards.length}`)
  console.log('')

  let mismatches = 0
  const limit = Math.max(5, Math.min(cards.length, rows.length))
  for (let i = 0; i < limit; i += 1) {
    const card = cards[i]
    const row = rows[i]
    if (!card || !row) {
      console.log(`card[${i}]: MISSING (card=${Boolean(card)} row=${Boolean(row)})`)
      mismatches += 1
      continue
    }
    const linked = rows.find((r) => r.slug === card.slug)
    const priceOk = card.renderedPrice === linked?.price
    const titleOk = card.renderedTitle === linked?.title
    if (!priceOk || !titleOk) mismatches += 1
    console.log(`card[${i}] ${card.slug}`)
    console.log(`  rendered: title="${card.renderedTitle}" price=${card.renderedPrice} (raw "${card.rawPrice}")`)
    console.log(`  linked row (by slug): id=${linked?.id ?? 'NOT FOUND'} title="${linked?.title ?? ''}" price=${linked?.price ?? ''}`)
    console.log(`  homepage query row[${i}]: id=${row.id} slug=${row.slug} price=${row.price}`)
    console.log(`  verdict: price=${priceOk ? 'MATCH' : 'MISMATCH'} title=${titleOk ? 'MATCH' : 'MISMATCH'}`)
    console.log('')
  }

  console.log(`cards checked: ${limit}, mismatching cards: ${mismatches}`)
  console.log(mismatches === 0 ? 'HOMEPAGE: PASS' : 'HOMEPAGE: FAIL (rendered values do not belong to the linked products)')
  process.exit(mismatches === 0 ? 0 : 1)
}

main().catch((error) => {
  console.error('probe crashed:', error)
  process.exit(2)
})
