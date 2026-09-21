/**
 * Verifier instrument for task `t11` (ui-api-integration) — rendered values vs the database.
 *
 * Written by `verifier`. It does not import, run or read the engineer's probe
 * (`web/tests/helpers/probe-invented-data.mts`) nor the t9 inventory's numbers: every comparison below
 * is (a) a value extracted from the HTML the running server sends at http://localhost:3000, and
 * (b) the database truth read directly with `docker exec kientaohub-postgres psql`.
 *
 * For every page it prints, per displayed value, the rendered text and the record it was compared to,
 * so a reader can see which values are tied to a record and which are not. It exits 1 if any displayed
 * value cannot be tied to a record.
 *
 * Run from `web/`: NODE_OPTIONS=--no-deprecation node --import tsx/esm tests/helpers/probe-verify-render-vs-db.mts
 */
import { execFileSync } from 'node:child_process'
import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'

const BASE = process.env.PROBE_BASE ?? 'http://localhost:3000'
const REPORT = process.env.PROBE_REPORT ?? ''
const PASSWORD = process.env.PROBE_PASSWORD ?? 'KienTao@2026'

// ---------------------------------------------------------------------------------------------
// database truth (direct SQL, not through the app)
// ---------------------------------------------------------------------------------------------
const sql = (query: string): string[][] => {
  const out = execFileSync(
    'docker',
    ['exec', 'kientaohub-postgres', 'psql', '-U', 'payload', '-d', 'kientaohub', '-t', '-A', '-F', '|', '-c', query],
    { encoding: 'utf8' },
  )
  return out
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => line.split('|'))
}

const scalar = (query: string): string => sql(query)[0]?.[0] ?? ''

/** Every media filename a product can legitimately display: its preview rel, its direct gallery, its meta image. */
const ownMediaSql = `select filename from (
        select m.filename from products_rels pr join product_previews pp on pp.id = pr.product_previews_id join media m on m.id = pp.preview_image_id where pr.parent_id={PID}
        union
        select m.filename from products_gallery g join media m on m.id = g.image_id where g._parent_id={PID}
        union
        select m.filename from products p join media m on m.id = p.meta_image_id where p.id={PID}
      ) t`

// ---------------------------------------------------------------------------------------------
// page access
// ---------------------------------------------------------------------------------------------
const jars: Record<string, string> = {}

const login = async (key: string, email: string) => {
  const res = await fetch(`${BASE}/api/users/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: PASSWORD }),
  })
  const list: string[] = (res.headers as any).getSetCookie?.() ?? [res.headers.get('set-cookie') ?? '']
  const match = list.map((c) => /(^|,\s*)payload-token=([^;]+)/.exec(c || '')).find(Boolean)
  if (!match) throw new Error(`login failed for ${email}: ${res.status}`)
  jars[key] = `payload-token=${match[2]}`
}

const getPage = async (path: string, jar?: string): Promise<string> => {
  const res = await fetch(`${BASE}${path}`, {
    headers: jar && jars[jar] ? { Cookie: jars[jar] } : {},
    redirect: 'follow',
  })
  return await res.text()
}

// ---------------------------------------------------------------------------------------------
// HTML → visible values
// ---------------------------------------------------------------------------------------------
const decode = (value: string): string =>
  value
    .replace(/<[^>]*>/g, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim()

const withoutScripts = (html: string): string =>
  html.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<style[\s\S]*?<\/style>/g, '')

const visibleText = (html: string): string => decode(withoutScripts(html))

type Card = {
  slug: string
  alt: string
  media: string[]
  text: string
  price?: string
  spec?: string
  seller?: string
  hasRating: boolean
  hasReviewCount: boolean
  hasDownloadCount: boolean
}

const parseCards = (html: string): Card[] => {
  const blocks = Array.from(withoutScripts(html).matchAll(/<a[^>]*data-slot="product-card"[^>]*>([\s\S]*?)<\/a>/g)).map((m) => {
    const block = m[0]
    const inner = m[1]
    const href = /href="\/products\/([^"]+)"/.exec(block)?.[1] ?? ''
    const alt = /<img[^>]*alt="([^"]*)"/.exec(block)?.[1] ?? ''
    const media = Array.from(new Set(Array.from(block.matchAll(/url=%2Fapi%2Fmedia%2Ffile%2F([^&"]+)/g)).map((m2) => decodeURIComponent(m2[1]))))
    const text = visibleText(inner)
    const price = /(\d[\d.]*\s*₫|Miễn phí|0\s*₫ \(Miễn phí\))/.exec(text)?.[1]
    const spec = /(\.[a-z0-9]{2,5})\s*·\s*([\d.,]+\s*[KMG]B)/.exec(text)
    return {
      slug: href,
      alt: decode(alt),
      media,
      text,
      price,
      spec: spec ? `${spec[1]} · ${spec[2]}` : undefined,
      hasRating: /★/.test(text) || /\b[1-5]\.[0-9]\s*\(/.test(text),
      hasReviewCount: /đánh giá/.test(text),
      hasDownloadCount: /lượt tải/.test(text),
    }
  })
  return blocks
}

const stripTitleOf = (card: Card) => card.alt

// ---------------------------------------------------------------------------------------------
// check plumbing
// ---------------------------------------------------------------------------------------------
type Check = { page: string; site: string; rendered: string; truth: string; tied: boolean | 'unverifiable'; note?: string }
const checks: Check[] = []
const absences: Array<{ page: string; token: string; count: number; reason: string }> = []

const record = (page: string, site: string, rendered: string, truth: string, tied: boolean | 'unverifiable', note?: string) => {
  checks.push({ page, site, rendered, truth, tied, note })
}

const checkEq = (page: string, site: string, rendered: string, truth: string, note?: string) => {
  record(page, site, rendered, truth, rendered.trim() === truth.trim(), note)
}

const absent = (page: string, html: string, token: string, reason: string) => {
  const count = withoutScripts(html).split(token).length - 1
  absences.push({ page, token, count, reason })
}

// ---------------------------------------------------------------------------------------------
// the sweep
// ---------------------------------------------------------------------------------------------
const main = async () => {
  await login('seller', 'seller01@kientaohub.vn')
  await login('buyer', 'buyer01@kientaohub.vn')
  await login('finance', 'finance@kientaohub.vn')
  await login('moderator', 'moderator@kientaohub.vn')

  const globalReviews = Number(scalar('select count(*) from reviews'))
  const globalDownloads = Number(scalar('select count(*) from download_events'))
  const published = Number(scalar("select count(*) from products where _status='published'"))
  const users = Number(scalar('select count(*) from users'))
  const commission = Number(scalar('select default_rate from commission_settings limit 1'))
  console.log(
    `DB baseline — published products: ${published}, users: ${users}, reviews: ${globalReviews}, download_events: ${globalDownloads}, commission default_rate: ${commission}`,
  )
  console.log('')

  // ===========================================================================================
  // HOMEPAGE
  // ===========================================================================================
  const home = await getPage('/')
  const homeText = visibleText(home)
  console.log('=== / (homepage) ===')

  const dbTiles = sql(
    "select c.title, count(p.id) from categories c left join products_rels pr on pr.categories_id=c.id and pr.path='categories' left join products p on p.id=pr.parent_id and p._status='published' group by 1 order by 1",
  )
  let tilesTied = 0
  for (const [title, count] of dbTiles) {
    const escaped = title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const rendered = new RegExp(`${escaped}\\s+(\\d{1,5})\\s+hồ sơ`).exec(homeText)
    if (rendered) {
      checkEq('/ homepage', `category tile "${title}"`, rendered[1], count, 'published products in that category')
      tilesTied += 1
    } else {
      record('/ homepage', `category tile "${title}" (a real category)`, 'not rendered on the homepage', `${count} published products`, 'unverifiable', 'the tile set is a design choice; every tile that IS rendered was checked')
    }
  }
  const renderedTileCounts = Array.from(homeText.matchAll(/(\d{1,5})\s+hồ sơ/g)).map((m) => m[1])
  console.log(`  category tiles: ${tilesTied} of ${dbTiles.length} DB categories rendered with a count; ${renderedTileCounts.length} "hồ sơ" counts on the page`)

  const homeCards = parseCards(home)
  const recentCards = homeCards.slice(0, 5)
  const bestsellerCards = homeCards.slice(5)
  console.log(`  rendered product cards: ${homeCards.length} (5 recent + ${bestsellerCards.length} bestseller)`)

  for (const card of [...recentCards, ...bestsellerCards]) {
    const rows = sql(
      `select p.title, p.price, p.is_free, coalesce(p.technical_specs_file_format::text,''), coalesce(p.technical_specs_file_size,''), coalesce(sp.display_name,'') from products p left join seller_profiles sp on sp.user_id=p.seller_id where p.slug='${card.slug}' limit 1`,
    )
    const [title, price, isFree, format, size, sellerName] = rows[0] ?? []
    if (!title) {
      record('/ homepage', `card ${card.slug}`, stripTitleOf(card) || '(no title)', 'no such product slug', false)
      continue
    }
    checkEq('/ homepage', `card ${card.slug} title`, stripTitleOf(card), title)
    const expectedPrice = String(isFree) === 't' || Number(price) === 0 ? '(0 ₫|Miễn phí)' : `${Number(price).toLocaleString('vi-VN')} ₫`
    const priceOk = new RegExp(expectedPrice).test(card.price ?? '')
    record('/ homepage', `card ${card.slug} price`, card.price ?? '(none)', `${price} (isFree=${isFree})`, priceOk)
    if (format && size) checkEq('/ homepage', `card ${card.slug} format/size`, card.spec ?? '(none)', `${format} · ${size}`)
    if (sellerName) {
      const shownSeller = card.text.includes(sellerName)
      record('/ homepage', `card ${card.slug} seller`, card.text.slice(0, 0) + (shownSeller ? sellerName : '(seller name not found in card text)'), sellerName, shownSeller)
    }
    // images: every media the card shows must belong to that product's own rels
    const ownMedia = new Set(
      sql(
        `${ownMediaSql.replace(/\{PID\}/g, `(select id from products where slug='${card.slug}')`)}`,
      ).map((r) => r[0]),
    )
    for (const media of card.media) {
      record('/ homepage', `card ${card.slug} image`, media, ownMedia.has(media) ? 'in the product’s own rels' : `NOT in the product’s rels (${Array.from(ownMedia).join(', ') || 'none'})`, ownMedia.has(media))
    }
  }

  // ---- hero (EditorialHero) slides -------------------------------------------------------
  {
    const compatIdx = home.indexOf('data-testid="editorial-hero-compat"')
    const seg = compatIdx === -1 ? '' : home.slice(compatIdx, compatIdx + 6000)
    const slideParts = seg.split('<div>').slice(1)
    let index = 0
    for (const part of slideParts) {
      const spans = Array.from(part.matchAll(/<span>([\s\S]*?)<\/span>/g)).map((m) => decode(m[1]))
      const href = /<a href="\/products\/([^"]+)"/.exec(part)?.[1]
      if (!href || spans.length < 4) continue
      index += 1
      const [title, tag, format, badge] = spans
      const rows = sql(
        `select p.title, p.price, p.is_free, coalesce(p.technical_specs_file_format::text,''), coalesce(p.technical_specs_file_size,''), coalesce(p.technical_specs_software_version::text,'') from products p where p.slug='${href}'`,
      )[0]
      if (!rows) {
        record('/ homepage hero', `slide ${index} link /products/${href}`, title, 'no product with that slug', false)
        continue
      }
      const [dbTitle, price, isFree, dbFormat, dbSize, dbVersion] = rows
      checkEq('/ homepage hero', `slide ${index} title`, title, dbTitle)
      checkEq('/ homepage hero', `slide ${index} format`, format, dbFormat)
      const badgeOk = String(isFree) === 't' ? /Miễn phí/.test(badge) : !/Miễn phí/.test(badge)
      record('/ homepage hero', `slide ${index} badge`, badge, `isFree=${isFree}`, badgeOk)
      // The tag is now the record's software version (t13): compare it with the column and require it to
      // be absent when the column is empty.
      if (dbVersion && dbVersion.trim() !== '') {
        record('/ homepage hero', `slide ${index} tag (= technical_specs_software_version)`, tag, dbVersion, tag === dbVersion)
      } else {
        record('/ homepage hero', `slide ${index} tag`, tag || '(absent)', 'technical_specs_software_version is NULL', tag === '')
      }
      const ownMedia = sql(`${ownMediaSql.replace(/\{PID\}/g, `(select id from products where slug='${href}')`)}`).map((r) => r[0])
      // Attribute-order-independent image lookup: the slide's own title is the img alt.
      const imgTag =
        Array.from(home.matchAll(/<img\b[^>]*>/g))
          .map((m) => m[0])
          .find((tagHtml) => {
            const alt = /\balt="([^"]*)"/.exec(tagHtml)?.[1]
            return alt === title
          }) ?? ''
      const src = /\bsrc="([^"]+)"/.exec(imgTag)?.[1] ?? ''
      const isOwn = src !== '' && ownMedia.some((media) => src.includes(media))
      record('/ homepage hero', `slide ${index} image`, src || '(none)', `own media: ${ownMedia.join(', ') || 'none'}`, isOwn)
      const sizeShown = visibleText(home).includes(dbSize)
      record('/ homepage hero', `slide ${index} size`, sizeShown ? dbSize : '(not shown in the hero text)', `technical_specs_file_size=${dbSize}`, sizeShown, 'a size the page omits is not a fabrication')
      if (index === 1) {
        // The visible (active) slide heading is the product's own title, truncated the way the component
        // documents (28 chars + '...' above 30); it must not read a curated headline.
        const heading = /truncate text-sm font-semibold text-white">([^<]*)</.exec(home)?.[1] ?? ''
        const expected = dbTitle.length > 30 ? `${dbTitle.slice(0, 28)}...` : dbTitle
        record('/ homepage hero', 'visible slide heading', decode(heading), `product title (truncated: ${expected})`, decode(heading) === expected)
      }
    }
    if (index === 0) record('/ homepage hero', 'hero slides', '(none parsed)', 'hero renders 3 slides', 'unverifiable')
    console.log(`  hero slides parsed: ${index}`)
  }

  // creator banner + hero numbers
  const membersMatch = /cùng\s*([\d.]+)\s*thành viên/.exec(homeText)
  if (membersMatch) checkEq('/ homepage', 'creator banner member count', membersMatch[1].replace(/\./g, ''), String(users), 'users table')
  const revenueMatch = /(\d+)\s*%\s*Chia sẻ doanh thu/.exec(homeText)
  if (revenueMatch) checkEq('/ homepage', 'creator banner revenue share', revenueMatch[1], String(Math.round((1 - commission) * 100)), `1 - commission_settings.default_rate (${commission})`)
  if (/hàng nghìn/i.test(homeText)) record('/ homepage', 'hero/banner “hàng nghìn” claim', 'present', `${published} published products`, false)
  if (homeText.includes('Điểm thưởng') || /tích (xu|điểm)/i.test(homeText)) record('/ homepage', 'loyalty/points claim', 'present', 'no points storage in the schema', false)
  const claimMatches = Array.from(homeText.matchAll(/([\d][\d.,]*)\s*\+?\s*(tài nguyên|bản vẽ|thành viên)/gi)).map((m) => m[0])
  for (const claim of claimMatches) {
    const num = Number((/([\d][\d.,]*)/.exec(claim)?.[1] ?? '0').replace(/[.,]/g, ''))
    if (!Number.isFinite(num) || num < 100) continue
    const kind = /thành viên/.test(claim) ? users : published
    record('/ homepage', `numeric claim "${claim}"`, String(num), `DB: ${kind}`, num <= kind, 'a claim may understate the record; only overstatement fails')
  }

  console.log('')

  // ===========================================================================================
  // /shop
  // ===========================================================================================
  const shop = await getPage('/shop')
  const shopCards = parseCards(shop)
  console.log(`=== /shop — ${shopCards.length} rendered cards ===`)
  const shopPageInfo = /(\d+)-(\d+)\s*của\s*(\d+)\s*sản phẩm/.exec(visibleText(shop))
  if (shopPageInfo) checkEq('/shop', 'pagination "x-y của N sản phẩm"', shopPageInfo[3], String(published))
  for (const card of shopCards) {
    const rows = sql(
      `select p.title, p.price, p.is_free, coalesce(p.technical_specs_file_format::text,''), coalesce(p.technical_specs_file_size,''), coalesce(sp.display_name,'') from products p left join seller_profiles sp on sp.user_id=p.seller_id where p.slug='${card.slug}' limit 1`,
    )
    const [title, price, isFree, format, size, sellerName] = rows[0] ?? []
    checkEq('/shop', `card ${card.slug} title`, stripTitleOf(card), title ?? '(no such product)')
    const expected = String(isFree) === 't' || Number(price) === 0 ? '(0 ₫|Miễn phí)' : `${Number(price).toLocaleString('vi-VN')} ₫`
    record('/shop', `card ${card.slug} price`, card.price ?? '(none)', `${price} (isFree=${isFree})`, new RegExp(expected).test(card.price ?? ''))
    if (format && size) checkEq('/shop', `card ${card.slug} format/size`, card.spec ?? '(none)', `${format} · ${size}`)
    if (sellerName) record('/shop', `card ${card.slug} seller`, card.text.includes(sellerName) ? sellerName : '(absent)', `${sellerName} (seller_profiles.display_name)`, card.text.includes(sellerName))
    const ownMedia = sql(
      `${ownMediaSql.replace(/\{PID\}/g, `(select id from products where slug='${card.slug}')`)}`,
    ).map((r) => r[0]).filter(Boolean)
    record('/shop', `card ${card.slug} images`, card.media.join(', ') || '(none)', `own rels: ${ownMedia.join(', ') || 'none'}`, card.media.length > 0 && card.media.every((m) => ownMedia.includes(m)))
  }
  const shopDownloadTokens = shopCards.filter((c) => c.hasDownloadCount).length
  const shopRatingTokens = shopCards.filter((c) => c.hasRating).length
  const shopReviewTokens = shopCards.filter((c) => c.hasReviewCount).length
  console.log(`  cards with a download count: ${shopDownloadTokens}, with a star rating: ${shopRatingTokens}, with a review count: ${shopReviewTokens} (DB: ${globalDownloads} download events, ${globalReviews} reviews)`)
  record('/shop', 'cards showing a download count', String(shopDownloadTokens), `${globalDownloads} download_events rows exist`, globalDownloads > 0 || shopDownloadTokens === 0)
  record('/shop', 'cards showing a star rating', String(shopRatingTokens), `${globalReviews} review rows exist`, globalReviews > 0 || shopRatingTokens === 0)
  record('/shop', 'cards showing a review count', String(shopReviewTokens), `${globalReviews} review rows exist`, globalReviews > 0 || shopReviewTokens === 0)
  const uniqueShopImages = new Set(shopCards.flatMap((c) => c.media))
  console.log(`  distinct images across the ${shopCards.length} cards: ${uniqueShopImages.size}`)
  console.log('')

  // ===========================================================================================
  // PRODUCT DETAIL — paid (159) and free (157)
  // ===========================================================================================
  for (const slug of ['san-pham-159-ban-ve-canh-quan-san-vuon', 'san-pham-157-ban-ve-canh-quan-san-vuon']) {
    const html = await getPage(`/products/${slug}`)
    const text = visibleText(html)
    const rows = sql(
      `select p.id, p.title, p.price, p.is_free, coalesce(p.technical_specs_file_format::text,''), coalesce(p.technical_specs_file_size,''), coalesce(p.technical_specs_software_version::text,''), coalesce(p.technical_specs_unit::text,''), coalesce(p.meta_description,''), p.updated_at::date, coalesce(sp.display_name,''), coalesce(sp.bio,''), coalesce(sp.id,0) from products p left join seller_profiles sp on sp.user_id=p.seller_id where p.slug='${slug}'`,
    )[0]
    const [id, title, price, isFree, format, size, version, unit, metaDescription, updatedAt, sellerName, sellerBio, sellerProfileId] = rows
    console.log(`=== /products/${slug} (product ${id}) ===`)
    const reviews = Number(scalar(`select count(*) from reviews where product_id=${id}`))
    const downloads = Number(scalar(`select count(*) from download_events where product_id=${id}`))
    const publishedReviews = Number(scalar(`select count(*) from reviews where product_id=${id} and status='published'`))
    const reviewAvg = scalar(`select coalesce(round(avg(rating),1),0) from reviews where product_id=${id} and status='published'`)
    const comments = Number(scalar(`select count(*) from comments where product_id=${id}`))
    const productFiles = sql(`select pf.id, pf.filename from products_rels pr join product_files pf on pf.id=pr.product_files_id where pr.parent_id=${id} and pr.path='originalFiles'`)
    const galleryRels = sql(`select path, count(*) from products_rels where parent_id=${id} and path in ('gallery','previewGallery') group by 1`)
    const ownMedia = sql(
      `${ownMediaSql.replace(/\{PID\}/g, String(id))}`,
    ).map((r) => r[0]).filter(Boolean)

    const verifiedBadge = /Đã xác minh/.test(text)
    record(`product ${id}`, '“Chuyên gia / Đã xác minh” seller badge', verifiedBadge ? 'present' : '(absent)', 'seller_profiles has no verification field (status is active for every seed row); SellerAttribution.tsx:14 defaults isVerified=true and the caller passes nothing', !verifiedBadge)
    checkEq(`product ${id}`, 'title (h1/alt)', /<h1[^>]*>([\s\S]*?)<\/h1>/.exec(html) ? decode(/<h1[^>]*>([\s\S]*?)<\/h1>/.exec(html)![1]) : '(no h1)', title)
    const renderedPrice = /Mua ngay\s*—\s*([\d.]+)\s*₫/.exec(text)?.[1] ?? /(Miễn phí)/.exec(text)?.[1]
    if (String(isFree) === 't' || Number(price) === 0) record(`product ${id}`, 'price', renderedPrice ?? '(none)', '0 (isFree=true)', /Miễn phí|0\s*₫/.test(text))
    else checkEq(`product ${id}`, 'price ("Mua ngay — …")', (renderedPrice ?? '').replace(/\./g, ''), price)
    checkEq(`product ${id}`, 'format', text.includes(format) ? format : '(absent)', format)
    checkEq(`product ${id}`, 'file size', text.includes(size) ? size : '(absent)', size)
    checkEq(`product ${id}`, 'software version', text.includes(version) ? version : '(absent)', version)
    {
      const [y, m, d] = String(updatedAt).split('-')
      const padded = `${d}/${m}/${y}`
      const unpadded = `${Number(d)}/${Number(m)}/${y}`
      const present = text.includes(padded) || text.includes(unpadded)
      record(`product ${id}`, 'updated date', present ? (text.includes(padded) ? padded : unpadded) : '(absent)', `updated_at ${updatedAt}`, present)
    }

    // aggregates: the page must not claim any when the DB has none
    const ratingClaim = /★\s*([\d.]+)\s*\((\d+)\s*đánh giá\)/.exec(text)
    const downloadClaim = /([\d.]+)\s*lượt tải/.exec(text)
    if (reviews === 0) {
      record(`product ${id}`, 'rating/review claim in the header', ratingClaim ? ratingClaim[0] : '(absent)', '0 review rows', !ratingClaim)
    } else {
      record(`product ${id}`, 'rating/review claim in the header', ratingClaim ? ratingClaim[0] : '(absent)', `${reviewAvg} from ${publishedReviews} published reviews`, Boolean(ratingClaim) && Number(ratingClaim![2]) === publishedReviews)
    }
    if (downloads === 0) {
      record(`product ${id}`, 'download-count claim', downloadClaim ? downloadClaim[0] : '(absent)', '0 download_events rows', !downloadClaim)
    } else {
      record(`product ${id}`, 'download-count claim', downloadClaim ? downloadClaim[0] : '(absent)', `${downloads} download_events`, Boolean(downloadClaim) && Number(downloadClaim![1].replace(/\./g, '')) === downloads)
    }
    const reviewPill = /Đánh giá\s*(\d+)/.exec(text)
    const qaPill = /Hỏi đáp\s*(\d+)/.exec(text)
    record(`product ${id}`, 'tab pill "Đánh giá N"', reviewPill ? reviewPill[0] : '(absent)', `${publishedReviews} published reviews`, reviewPill ? Number(reviewPill[1]) === publishedReviews : true)
    record(`product ${id}`, 'tab pill "Hỏi đáp N"', qaPill ? qaPill[0] : '(absent)', `${comments} comments`, qaPill ? Number(qaPill[1]) === comments : true)
    const listCount = /Danh sách nhận xét\s*\(\s*(\d+)\s*\)/.exec(text)
    record(`product ${id}`, 'comment-count line "Danh sách nhận xét ( N )"', listCount ? listCount[0] : '(absent)', `${comments} comments`, listCount ? Number(listCount[1]) === comments : true)
    const reviewBlockRating = /(\d\.\d)\s*\/\s*5/.exec(text)
    record(`product ${id}`, 'review block "X / 5"', reviewBlockRating ? reviewBlockRating[0] : '(absent)', reviews === 0 ? 'no reviews' : `${reviewAvg} from ${publishedReviews}`, reviews > 0 || !reviewBlockRating)
    const distributions = Array.from(text.matchAll(/([1-5])\s*sao\s*(\d+)%/g)).map((m) => m[0])
    record(`product ${id}`, 'star distribution', distributions.join(', ') || '(absent)', reviews === 0 ? 'no reviews' : 'published review distribution', reviews > 0 || distributions.length === 0)
    const verifiedClaim = /(\d+)%\s*người mua đã xác thực/.exec(text)
    record(`product ${id}`, '“N% người mua đã xác thực”', verifiedClaim ? verifiedClaim[0] : '(absent)', reviews === 0 ? 'no reviews' : 'published review count', reviews > 0 || !verifiedClaim)

    // invented seller / seller claims
    const inventedSummary = /Bộ hồ sơ thiết kế kiến trúc đầy đủ cho công trình/.test(text)
    record(`product ${id}`, 'invented summary line (D24 fallback copy)', inventedSummary ? 'present' : '(absent)', metaDescription ? `meta_description "${metaDescription.slice(0, 40)}"` : 'meta_description is NULL', !inventedSummary)
    const testimonial = /Nguyễn Hoàng Nam|Dự án thực tế/.exec(text)
    record(`product ${id}`, 'fabricated testimonial (D30)', testimonial ? testimonial[0] : '(absent)', '0 review rows; no such user', !testimonial)
    const sellerRendered = sellerName ? text.includes(sellerName) : false
    record(`product ${id}`, 'seller name', sellerRendered ? sellerName : '(not rendered)', `${sellerName} (seller_profiles ${sellerProfileId})`, sellerRendered)
    record(`product ${id}`, 'seller bio', sellerBio && text.includes(sellerBio.slice(0, 40)) ? sellerBio.slice(0, 60) : '(record bio not rendered)', `${sellerBio}`, Boolean(sellerBio) && text.includes(sellerBio.slice(0, 40)))
    const productCountClaim = /([\d.]+)\s*sản phẩm/.exec(text)
    const sellerPublished = Number(scalar(`select count(*) from products where seller_id=(select seller_id from products where id=${id}) and _status='published'`))
    if (productCountClaim) record(`product ${id}`, 'seller “N sản phẩm”', productCountClaim[0], `${sellerPublished} published products by that seller`, Number(productCountClaim[1].replace(/\./g, '')) === sellerPublished)
    else record(`product ${id}`, 'seller “N sản phẩm”', '(absent)', `${sellerPublished} published products`, true)
    const experienceClaim = /(\d+)\s*năm kinh nghiệm/.exec(text)
    record(`product ${id}`, 'seller “N năm kinh nghiệm”', experienceClaim ? experienceClaim[0] : '(absent)', 'no experience column exists on seller_profiles', !experienceClaim)
    const drawingCountClaim = /(\d+)\s*bản vẽ/.exec(text)
    record(`product ${id}`, '“N bản vẽ” info row', drawingCountClaim ? drawingCountClaim[0] : '(absent)', `${productFiles.length} product_files row(s)`, !drawingCountClaim || Number(drawingCountClaim[1]) === productFiles.length)
    const compatibilityClaim = /Windows|macOS/.exec(text)
    record(`product ${id}`, '“Tương thích Windows/macOS” row', compatibilityClaim ? compatibilityClaim[0] : '(absent)', 'no compatibility column exists on products', !compatibilityClaim)
    const revitClaim = /File Revit|Revit đầy đủ/.exec(text)
    record(`product ${id}`, 'package contents mentioning Revit', revitClaim ? revitClaim[0] : '(absent)', `product format is ${format}`, format.toLowerCase().includes('.rvt') || !revitClaim)

    // gallery: every image must be the product's own media
    const galleryImages = Array.from(
      new Set([
        ...Array.from(withoutScripts(html).matchAll(/url=%2Fapi%2Fmedia%2Ffile%2F([^&"]+)/g)).map((m) => decodeURIComponent(m[1])),
        ...Array.from(withoutScripts(html).matchAll(/\/api\/media\/file\/([A-Za-z0-9._-]+)/g)).map((m) => m[1]),
      ]),
    )
    const foreignImages = galleryImages.filter((m) => !ownMedia.includes(m))
    record(`product ${id}`, 'images on the page', `${galleryImages.length} (${galleryImages.slice(0, 4).join(', ')}${galleryImages.length > 4 ? ', …' : ''})`, `own rels: ${ownMedia.join(', ') || 'none'}`, foreignImages.length === 0)
    const galleryRegion = (() => {
      const idx = text.indexOf('Bản vẽ mẫu')
      const alt = text.indexOf('Thư viện ảnh')
      const start = idx >= 0 ? idx : alt >= 0 ? alt : -1
      return start === -1 ? '' : text.slice(Math.max(0, start - 200), start + 400)
    })()
    const counter = /(?:^|[^\d])(\d{1,2})\s*\/\s*(\d{1,2})(?:[^\d]|$)/.exec(galleryRegion)
    if (counter) record(`product ${id}`, 'gallery counter', counter[0].trim(), `${ownMedia.length} media rows belong to the product (the browser probe checks the images themselves)`, Number(counter[2]) === ownMedia.length, 'the counter must not pad the gallery')
    console.log(
      `  DB: reviews ${reviews} (published ${publishedReviews}), downloads ${downloads}, comments ${comments}, files ${productFiles.length}, gallery rels ${JSON.stringify(galleryRels)}, own media ${ownMedia.length}`,
    )
    console.log(`  rendered claims: rating ${ratingClaim ? ratingClaim[0] : 'none'}, downloads ${downloadClaim ? downloadClaim[0] : 'none'}, distribution ${distributions.length}, verified ${verifiedClaim ? verifiedClaim[0] : 'none'}, experience ${experienceClaim ? experienceClaim[0] : 'none'}, drawing count ${drawingCountClaim ? drawingCountClaim[0] : 'none'}`)
  }
  console.log('')

  // ===========================================================================================
  // RELATED PRODUCTS (the five dead links of D31)
  // ===========================================================================================
  {
    const html = await getPage('/products/san-pham-159-ban-ve-canh-quan-san-vuon')
    const related = Array.from(new Set(Array.from(withoutScripts(html).matchAll(/href="\/products\/([^"]+)"/g)).map((m) => m[1]))).filter(
      (slug) => slug !== 'san-pham-159-ban-ve-canh-quan-san-vuon',
    )
    const section = visibleText(html)
    const hasRelatedSection = /Có thể bạn cũng thích|Sản phẩm liên quan|Tài nguyên tương tự/.test(section)
    record('product 159', 'related-products section', hasRelatedSection ? 'present' : '(absent)', `${related.length} distinct product links on the page`, true)
    for (const slug of related) {
      const exists = Number(scalar(`select count(*) from products where slug='${slug}'`))
      record('product 159', `related link /products/${slug}`, `link present`, exists > 0 ? 'product exists' : 'NO product with that slug (404)', exists > 0)
    }
    for (const slug of related) {
      const res = await fetch(`${BASE}/products/${slug}`, { redirect: 'manual' })
      record('product 159', `related link status /products/${slug}`, String(res.status), 'must not be 404', res.status !== 404)
    }
  }
  console.log('')

  // ===========================================================================================
  // SELLER PAGE (seller01)
  // ===========================================================================================
  {
    const html = await getPage('/seller', 'seller')
    const text = visibleText(html)
    console.log('=== /seller (seller01) ===')
    // The page's finance figures come from getSellerBalance (src/services/earnings.ts:108-185):
    //   available = sum(seller_amount where status='AVAILABLE') - in-flight withdrawals - PAID withdrawals
    //   totalEarned = AVAILABLE + PENDING;  withdrawnTotal = PAID
    const sellerUserId = 4
    const availableGross = scalar(
      `select coalesce(sum(seller_amount),0) from seller_earnings where seller_id=${sellerUserId} and status='AVAILABLE'`,
    )
    const pendingGross = scalar(
      `select coalesce(sum(seller_amount),0) from seller_earnings where seller_id=${sellerUserId} and status='PENDING'`,
    )
    const reserved = scalar(
      `select coalesce(sum(amount),0) from withdrawals where seller_id=${sellerUserId} and status in ('REQUESTED','UNDER_REVIEW','APPROVED','PROCESSING')`,
    )
    const withdrawn = scalar(`select coalesce(sum(amount),0) from withdrawals where seller_id=${sellerUserId} and status='PAID'`)
    const available = String(Math.max(0, Number(availableGross) - Number(reserved) - Number(withdrawn)))
    const totalEarned = String(Number(availableGross) + Number(pendingGross))
    const earningProducts = scalar(
      `select count(distinct product_id) from seller_earnings where seller_id=${sellerUserId} and status <> 'REVERSED'`,
    )
    const earningRows = scalar(`select count(*) from seller_earnings where seller_id=${sellerUserId} and status <> 'REVERSED'`)
    const fmt = (v: string) => Number(v).toLocaleString('vi-VN')
    const windowAfter = (label: string, len = 80) => {
      const idx = text.indexOf(label)
      return idx === -1 ? '' : text.slice(idx, idx + len)
    }
    for (const [label, truth] of [
      ['Số dư khả dụng', available],
      ['Tổng tiền đã rút', withdrawn],
      ['Tổng thu nhập tích lũy', totalEarned],
    ] as Array<[string, string]>) {
      const window = windowAfter(label)
      record('/seller', label, window.slice(0, 60), `${fmt(truth)} ₫ (AVAILABLE ${availableGross} − reserved ${reserved} − withdrawn ${withdrawn}; totalEarned = AVAILABLE+PENDING)`, window.includes(fmt(truth)))
    }
    const productCount = /(\d+)\s*sản phẩm/.exec(text)
    const salesCount = /(\d+)\s*lượt bán/.exec(text)
    record('/seller', '“N sản phẩm” KPI', productCount ? productCount[0] : '(absent)', `${earningProducts} distinct products in non-reversed seller_earnings`, Boolean(productCount) && Number(productCount![1]) === Number(earningProducts))
    record('/seller', '“N lượt bán” KPI', salesCount ? salesCount[0] : '(absent)', `${earningRows} non-reversed seller_earnings rows`, Boolean(salesCount) && Number(salesCount![1]) === Number(earningRows))
    const stripeClaim = /Stripe/.test(text)
    record('/seller', 'Stripe in the footer', stripeClaim ? 'present' : '(absent)', 'decision 0013 removed the Stripe rail', !stripeClaim)
  }
  console.log('')

  // ===========================================================================================
  // ACCOUNT AREA + WALLET
  // ===========================================================================================
  {
    const buyerId = 9
    const orders = Number(scalar(`select count(*) from orders where buyer_id=${buyerId}`))
    const entitlements = Number(scalar(`select count(*) from entitlements where user_id=${buyerId} and status='active'`))
    const spend = scalar(`select coalesce(sum(amount),0) from wallet_ledger where user_id=${buyerId} and type='purchase' and direction='debit'`)
    const fmt = (v: string) => Number(v).toLocaleString('vi-VN')

    const ordersHtml = await getPage('/orders', 'buyer')
    const ordersText = visibleText(ordersHtml)
    console.log('=== /orders (buyer01) ===')
    console.log(`  DB: orders ${orders}, active entitlements ${entitlements}, purchase debits ${spend}`)
    for (const [label, truth] of [
      ['Tổng đơn hàng', String(orders)],
      ['Tài nguyên sở hữu', String(entitlements)],
    ] as Array<[string, string]>) {
      const idx = ordersText.indexOf(label)
      const window = idx === -1 ? '(label absent)' : ordersText.slice(idx, idx + 40)
      record('/orders', label, window.slice(0, 50), truth, window.includes(truth))
    }
    const spendLabelIdx = ordersText.indexOf('Tổng chi tiêu')
    const spendWindow = spendLabelIdx === -1 ? '' : ordersText.slice(spendLabelIdx, spendLabelIdx + 60)
    record('/orders', 'Tổng chi tiêu', spendWindow.slice(0, 50), `${fmt(spend)} ₫`, spendWindow.includes(fmt(spend)))

    const walletHtml = await getPage('/wallet', 'buyer')
    const walletText = visibleText(walletHtml)
    console.log('=== /wallet (buyer01) ===')
    const spendIdxW = walletText.indexOf('Đã chi tiêu mua bản vẽ')
    const spendWindowW = spendIdxW === -1 ? '' : walletText.slice(spendIdxW, spendIdxW + 60)
    record('/wallet', 'Đã chi tiêu mua bản vẽ', spendWindowW.slice(0, 50), `${fmt(spend)} ₫ (sum of purchase debits)`, spendWindowW.includes(fmt(spend)))
    const points = /Điểm thưởng[^₫]*/.exec(walletText)
    record('/wallet', 'loyalty points card', points ? points[0].slice(0, 60) : '(absent)', 'no points/rewards column exists in the schema', !points)
    const balanceIdx = walletText.indexOf('Số dư khả dụng')
    const balanceWindow = balanceIdx === -1 ? '' : walletText.slice(balanceIdx, balanceIdx + 40)
    const dbBalance = scalar(`select balance from wallets where user_id=${buyerId}`)
    record('/wallet', 'Số dư khả dụng', balanceWindow.slice(0, 40), `${fmt(dbBalance)} ₫ (wallets.balance)`, balanceWindow.includes(fmt(dbBalance)))

    const accountHtml = await getPage('/account', 'buyer')
    const accountText = visibleText(accountHtml)
    console.log('=== /account (buyer01) ===')
    const tier = /Khách hàng thành viên|Người bán uy tín|Kế toán|Kiểm duyệt viên/.exec(accountText)
    record('/account', 'role/tier badge', tier ? tier[0] : '(absent)', 'derived from users.roles', Boolean(tier))
    const accountOrders = /(\d+)\s*đơn/.exec(accountText)
    if (accountOrders) record('/account', 'order count', accountOrders[0], `${orders} orders`, Number(accountOrders[1]) === orders)
  }
  console.log('')

  // ===========================================================================================
  // FINANCE + MODERATION CONSOLES
  // ===========================================================================================
  {
    const financeHtml = await getPage('/finance', 'finance')
    const financeText = visibleText(financeHtml)
    console.log('=== /finance (financeAdmin) ===')
    const paidCount = Number(scalar("select count(*) from withdrawals where status='PAID'"))
    const paidSum = scalar("select coalesce(sum(amount),0) from withdrawals where status='PAID'")
    const refundCount = Number(scalar('select count(*) from refunds'))
    const refundSum = scalar('select coalesce(sum(amount),0) from refunds')
    const queue = Number(scalar("select count(*) from withdrawals where status in ('REQUESTED','UNDER_REVIEW')"))
    const fmt = (v: string) => Number(v).toLocaleString('vi-VN')
    for (const [label, truth, rendered] of [
      ['Đã thanh toán chi trả', `${paidCount}|${fmt(paidSum)}`],
      ['Tổng tiền đã bồi hoàn', `${refundCount}|${fmt(refundSum)}`],
      ['Chờ xử lý rút', `${queue}`],
    ] as Array<[string, string]>) {
      const idx = financeText.indexOf(label)
      const window = idx === -1 ? '(label absent)' : financeText.slice(idx, idx + 90)
      const [count, sum] = truth.split('|')
      const ok = window.includes(count) && (sum === undefined || window.includes(sum))
      record('/finance', label, window.slice(0, 60), `count ${count}${sum ? ` sum ${sum}` : ''}`, ok)
    }

    const moderationHtml = await getPage('/moderation', 'moderator')
    const moderationText = visibleText(moderationHtml)
    console.log('=== /moderation (moderator) ===')
    const firstSpec = /Thông số kỹ thuật[\s\S]{0,400}/.exec(moderationText)?.[0] ?? ''
    const fileMatch = /Tệp:\s*([^\s]+)/.exec(firstSpec)
    const shaMatch = /SHA-256:\s*([0-9a-f]+)/.exec(firstSpec)
    const formatMatch = /Định dạng:\s*([.\w]+)/.exec(firstSpec)
    const versionMatch = /Phiên bản:\s*([^•]+?)\s*•/.exec(firstSpec)
    const sizeMatch = /Dung lượng:\s*([\d.,]+\s*[KMG]B)/.exec(firstSpec)
    const unitMatch = /Đơn vị:\s*([\w]+)/.exec(firstSpec)
    if (fileMatch) {
      const fileRow = sql(
        `select pf.checksum, pr.parent_id, p.technical_specs_file_format::text, p.technical_specs_software_version::text, p.technical_specs_file_size, p.technical_specs_unit::text from product_files pf join products_rels pr on pr.product_files_id=pf.id join products p on p.id=pr.parent_id where pf.filename='${fileMatch[1]}' limit 1`,
      )[0]
      record('/moderation', 'file name', fileMatch[1], fileRow ? `product_files row of product ${fileRow[1]}` : 'no such product_files row', Boolean(fileRow))
      if (shaMatch) record('/moderation', 'SHA-256', shaMatch[1].slice(0, 20) + '…', fileRow ? fileRow[0] : 'n/a', Boolean(fileRow) && fileRow![0] === shaMatch[1])
      if (formatMatch) record('/moderation', 'format', formatMatch[1], fileRow ? fileRow[2] : 'n/a', Boolean(fileRow) && fileRow![2] === formatMatch[1])
      if (versionMatch) record('/moderation', 'software version', versionMatch[1].trim(), fileRow ? fileRow[3] : 'n/a', Boolean(fileRow) && fileRow![3] === versionMatch[1].trim())
      if (sizeMatch) record('/moderation', 'file size', sizeMatch[1], fileRow ? fileRow[4] : 'n/a', Boolean(fileRow) && fileRow![4] === sizeMatch[1])
      if (unitMatch) record('/moderation', 'unit', unitMatch[1], fileRow ? fileRow[5] : 'n/a', Boolean(fileRow) && fileRow![5] === unitMatch[1])
    }
  }
  console.log('')

  // ===========================================================================================
  // CART, CHECKOUT, LOGIN, FOOTER
  // ===========================================================================================
  {
    const cartHtml = await getPage('/cart')
    const cartText = visibleText(cartHtml)
    console.log('=== /cart (anonymous, empty session) ===')
    const emptyClaim = /Giỏ hàng của bạn đang trống/.test(cartText)
    record('/cart', 'empty state', emptyClaim ? 'Giỏ hàng của bạn đang trống' : '(absent)', 'no cart items in a fresh session (decision 0014)', emptyClaim)
    const cartNumbers = Array.from(cartText.matchAll(/([\d.]+)\s*(₫|sản phẩm|lượt tải|đánh giá)/g)).map((m) => m[0])
    record('/cart', 'numeric claims besides the empty state', cartNumbers.join(', ') || '(none)', 'nothing to derive', cartNumbers.length === 0)

    const checkoutHtml = await getPage('/checkout', 'buyer')
    const checkoutText = visibleText(checkoutHtml)
    console.log('=== /checkout (buyer01, server render, no client cart yet) ===')
    const checkoutEmpty = /Giỏ hàng của bạn đang trống/.test(checkoutText)
    record('/checkout', 'empty state', checkoutEmpty ? 'Giỏ hàng của bạn đang trống' : '(absent)', 'the cart lives in the browser session; a server fetch has none', checkoutEmpty, 'the populated checkout is measured by the browser probe')

    const loginHtml = await getPage('/login')
    const loginText = visibleText(loginHtml)
    console.log('=== /login ===')
    console.log(`  DB: reviews ${globalReviews}, published products ${published}, users ${users}`)
    const ratingClaim = /([\d.]+)\s*\/\s*5\.0/.exec(loginText)
    record('/login', 'rating "X / 5.0"', ratingClaim ? ratingClaim[0] : '(absent)', `${globalReviews} review rows`, globalReviews > 0 || !ratingClaim)
    const reviewCountClaim = /\(([\d.]+)\+?\s*đánh giá/.exec(loginText)
    record('/login', '“N+ đánh giá tin cậy”', reviewCountClaim ? reviewCountClaim[0] : '(absent)', `${globalReviews} review rows`, globalReviews > 0 || !reviewCountClaim)
    const resourceClaim = /([\d.]+)\+\s*Tài nguyên/.exec(loginText)
    record('/login', '“N+ Tài nguyên CAD/3D”', resourceClaim ? resourceClaim[0] : '(absent)', `${published} published products`, !resourceClaim || Number(resourceClaim[1].replace(/\./g, '')) <= published)
    const verified = /Đã xác thực/.test(loginText)
    record('/login', '“Đã xác thực” testimonial badge', verified ? 'present' : '(absent)', 'no review table rows to verify', !verified)
    const loyalty = /Tích xu thưởng|điểm thưởng|hoàn xu/i.exec(loginText)
    record('/login', 'loyalty/points promise', loyalty ? loyalty[0] : '(absent)', 'no points storage in the schema', !loyalty)
    const testimonialName = /KTS\.\s*Hoàng Nam/.exec(loginText)
    record('/login', 'testimonial author name', testimonialName ? testimonialName[0] : '(absent)', 'no such user row', !testimonialName)

    for (const [page, html] of [['/', home], ['/shop', shop]] as Array<[string, string]>) {
      absent(page, html, 'Stripe', 'decision 0013 removed the Stripe rail; the footer must not advertise it')
      if (page === '/shop') absent(page, html, 'curated/', 'no product card may show a curated image instead of the product’s own media')
      absent(page, html, 'KTS. Nguyễn Văn A', 'fabricated seller constant')
      absent(page, html, 'lượt tải', `download_events has ${globalDownloads} rows`)
      absent(page, html, 'đánh giá', `reviews has ${globalReviews} rows`)
    }
  }
  console.log('')

  // ---- global scan: the retired badge and curated hero assets must not be rendered anywhere ----
  {
    const decorativeUses: string[] = []
    const scanPages: Array<[string, string]> = [
      ['/', home],
      ['/shop', shop],
      ['/products/…159', await getPage('/products/san-pham-159-ban-ve-canh-quan-san-vuon')],
      ['/products/…157', await getPage('/products/san-pham-157-ban-ve-canh-quan-san-vuon')],
      ['/seller', await getPage('/seller', 'seller')],
      ['/orders', await getPage('/orders', 'buyer')],
      ['/wallet', await getPage('/wallet', 'buyer')],
      ['/account', await getPage('/account', 'buyer')],
      ['/finance', await getPage('/finance', 'finance')],
      ['/moderation', await getPage('/moderation', 'moderator')],
      ['/cart', await getPage('/cart')],
      ['/checkout', await getPage('/checkout', 'buyer')],
      ['/login', await getPage('/login')],
    ]
    for (const [page, html] of scanPages) {
      absent(page, html, 'Đã xác minh', 'no record marks a seller verified (SellerAttribution.tsx:19 defaults isVerified=false)')
      absent(page, html, 'Chuyên gia', 'the badge label must not exist without a record')
      absent(page, html, 'Mô hình BIM LOD 400', 'the retired curated hero tag')
      // The retired curated hero assets are asserted on the pages where they used to stand in for
      // products (the homepage hero and the product cards). Elsewhere a curated photo may be honest
      // decoration (the seller dashboard's promo banner) — those occurrences are printed, not failed.
      for (const token of ['/media/hero-villa.jpg', 'bestseller-6-highrise', 'recent-3-warehouse']) {
        const occurrences = withoutScripts(html).split(token).length - 1
        if (page === '/' || page === '/shop') {
          absent(page, html, token, 'a retired curated hero image — it must not stand in for a product')
        } else if (occurrences > 0) {
          decorativeUses.push(`${page}: ${token} × ${occurrences}`)
        }
      }
    }
    console.log('')
    console.log(`decorative curated-asset uses (not claims about a record): ${decorativeUses.join('; ') || 'none'}`)
  }

  // ---------------------------------------------------------------------------------------------
  // report
  // ---------------------------------------------------------------------------------------------
  const failed = checks.filter((c) => c.tied === false)
  const unverifiable = checks.filter((c) => c.tied === 'unverifiable')
  const absentFailed = absences.filter((a) => a.count > 0)

  console.log('=== displayed values that could NOT be tied to a record ===')
  if (failed.length === 0) console.log('  none')
  for (const f of failed) console.log(`  FAIL ${f.page} — ${f.site}: rendered "${f.rendered}" vs ${f.truth}`)
  console.log('')
  console.log('=== values I could not compare (named) ===')
  if (unverifiable.length === 0) console.log('  none')
  for (const u of unverifiable) console.log(`  UNVERIFIABLE ${u.page} — ${u.site}: ${u.rendered} / ${u.truth}${u.note ? ` (${u.note})` : ''}`)
  console.log('')
  console.log('=== absence checks (fabricated tokens) ===')
  for (const a of absences) console.log(`  ${a.count === 0 ? 'ok  ' : 'FAIL'} "${a.token}" on ${a.page}: ${a.count} occurrence(s) — ${a.reason}`)
  console.log('')
  console.log(`checks: ${checks.length}, tied: ${checks.length - failed.length - unverifiable.length}, not tied: ${failed.length}, unverifiable: ${unverifiable.length}`)

  if (REPORT) {
    mkdirSync(dirname(REPORT), { recursive: true })
    writeFileSync(REPORT, JSON.stringify({ ranAt: new Date().toISOString(), baseline: { published, users, globalReviews, globalDownloads, commission }, checks, absences }, null, 2))
  }

  const ok = failed.length === 0 && absentFailed.length === 0
  console.log(ok ? 'RENDER-VS-DB: PASS' : 'RENDER-VS-DB: FAIL')
  process.exit(ok ? 0 : 1)
}

main().catch((error) => {
  console.error('probe crashed:', error)
  process.exit(2)
})
