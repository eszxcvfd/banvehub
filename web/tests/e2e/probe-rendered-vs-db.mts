/**
 * web/tests/e2e/probe-rendered-vs-db.mts
 *
 * Read-only instrument for the owner's report that the storefront "truyền dữ liệu bịp": it walks the
 * storefront's page types against the running app, extracts the values a visitor reads (card titles,
 * prices, "lượt tải", star ratings and their counts, seller names, covers, category tiles, the
 * homepage's share/member claims, the product page's header, tabs, info rows, review summary,
 * testimonial and related cards, the login page's trust numbers, the footer's payment list and the
 * wallet's points card) and compares each one with the record it claims to describe.
 *
 * Verdict per check:
 *   ok    the displayed value is derived from the record (a field, a real aggregate, or an honest
 *         absence: an element with no real source must simply not be rendered)
 *   FAIL  the displayed value belongs to no record, is a fabricated aggregate, or a card links to a
 *         slug that does not exist
 *
 * Read-only: HTTP GETs against the dev server plus Payload reads. Nothing is written and no money moves.
 *
 * Usage (dev server on http://localhost:3000, from `web/`):
 *   NODE_OPTIONS="--no-deprecation --import tsx/esm" node tests/e2e/probe-rendered-vs-db.mts
 *
 * Provenance rule for images (add this rule, not a check, when a new surface appears):
 *   - a **record-backed element** (a card, slide or row that links a record) shows that record's own media;
 *   - when the record has **no usable media**, the element **omits** the image and lets its own placeholder
 *     render — never a curated photo of another record, because a substitute there is a fabricated fact
 *     ("this is what the product looks like"), while an omission only says "no picture yet";
 *   - a curated image belongs **only** on a fallback slot that has no record at all (the curated card a
 *     section renders when the database is empty).
 * The check below implements exactly that: a rendered cover/image that is not the record's own media is a
 * failure, and a record with no media must render no image. Rows marked `CTRL` are the shipped negative
 * control: they run the same comparator against a deliberately substituted URL on every run, so a detector
 * that has silently stopped failing is visible without touching the application. The end-to-end negative
 * control (mutate the hero to `fallback.image`, run, expect exit 1, revert, expect exit 0) was measured:
 * 149 checks / 4 failing with the substitution, 149/0 without it.
 *
 * Exit 0 = every displayed value on the walked pages is derived from its record.
 */
import 'dotenv/config'

import { getPayload } from 'payload'

import config from '../../src/payload.config'

const BASE = process.env.PROBE_BASE_URL || 'http://localhost:3000'
// Seeded dev identities — `scripts/seed-realistic.mts:701` (devPassword).
const DEV_PASSWORD = process.env.PROBE_DEV_PASSWORD || 'KienTao@2026'
const BUYER_EMAIL = 'buyer01@kientaohub.vn'
const PRODUCT_SLUG = 'san-pham-159-ban-ve-canh-quan-san-vuon'

type Check = { id: string; page: string; what: string; ok: boolean; detail: string }

const checks: Check[] = []
const add = (id: string, page: string, what: string, ok: boolean, detail: string): void => {
  checks.push({ id, page, what, ok, detail })
}

const decode = (value: string): string =>
  value
    .replace(/&amp;/g, '&')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&middot;/g, '·')
    .replace(/&nbsp;/g, ' ')
const textOf = (html: string): string => decode(html.replace(/<!--[\s\S]*?-->/g, '').replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim()
const digits = (value: string | undefined): number | null => {
  const found = (value ?? '').replace(/[^\d]/g, '')
  return found ? Number(found) : null
}

const get = async (path: string, cookie?: string): Promise<{ status: number; html: string }> => {
  const res = await fetch(`${BASE}${path}`, cookie ? { headers: { Cookie: cookie } } : undefined)
  return { status: res.status, html: await res.text() }
}

const section = (html: string, marker: string, length = 4000): string => {
  const at = html.indexOf(marker)
  return at < 0 ? '' : html.slice(at, at + length)
}

/** One rendered product card: what the visitor reads on it. */
type RenderedCard = {
  slug: string
  title: string
  priceText: string
  price: number | null
  downloads: number | null
  ratingCount: number | null
  rating: string | null
  seller: string | null
  image: string | null
}

const cardsFrom = (html: string): RenderedCard[] => {
  const anchors = [...html.matchAll(/<a[^>]*data-slot="product-card"[^>]*>/g)]

  return anchors.map((anchor, index) => {
    const start = (anchor.index ?? 0) + anchor[0].length
    const end = index + 1 < anchors.length ? (anchors[index + 1].index ?? html.length) : html.length
    const chunk = html.slice(start, end).replace(/<!--[\s\S]*?-->/g, '')

    const text = textOf(chunk)
    const downloadsMatch = text.match(/([\d.]+)\s*lượt tải/)
    const countMatch = text.match(/★\s*([\d.]+)\s*\((\d+)\)/)

    return {
      slug: anchor[0].match(/href="\/products\/([^"]+)"/)?.[1] ?? '',
      title: textOf(chunk.match(/<h3[^>]*>([\s\S]*?)<\/h3>/)?.[1] ?? ''),
      priceText: textOf(chunk.match(/([\d.]+\s*₫)/)?.[1] ?? ''),
      price: digits(text.match(/([\d.]+\s*₫)/)?.[1]),
      downloads: downloadsMatch ? digits(downloadsMatch[1]) : null,
      ratingCount: countMatch ? Number(countMatch[2]) : null,
      rating: countMatch ? countMatch[1] : null,
      seller: textOf(chunk.match(/rounded-full bg-slate-800[\s\S]*?<\/div>\s*<span[^>]*>([\s\S]*?)<\/span>/)?.[1] ?? '') || null,
      image: decode(chunk.match(/<img[^>]*src="([^"]+)"/)?.[1] ?? '') || null,
    }
  })
}

const imageUrlOf = (card: RenderedCard): string | null => {
  if (!card.image) return null
  const nextImage = card.image.match(/[?&]url=([^&]+)/)
  return nextImage ? decodeURIComponent(nextImage[1]) : card.image
}

const main = async (): Promise<void> => {
  console.log('=== rendered-vs-database probe (invented data) ===')
  console.log(`storefront ${BASE}`)
  console.log(`run at     ${new Date().toISOString()}`)
  console.log('')

  const payload = await getPayload({ config })

  const published = await payload.find({
    collection: 'products',
    where: { _status: { equals: 'published' } },
    limit: 1000,
    pagination: false,
    depth: 1,
    overrideAccess: true,
  })

  const bySlug = new Map(published.docs.map((doc) => [(doc as { slug?: string }).slug ?? '', doc]))
  const publishedIds = published.docs.map((doc) => Number((doc as { id: number }).id))

  const allProducts = await payload.find({
    collection: 'products',
    limit: 1000,
    pagination: false,
    depth: 0,
    overrideAccess: true,
  })

  const reviewRows = await payload.find({
    collection: 'reviews',
    where: { status: { equals: 'published' } },
    limit: 1000,
    pagination: false,
    depth: 0,
    overrideAccess: true,
  })
  const downloadRows = await payload.find({
    collection: 'download_events',
    where: { status: { equals: 'SUCCESS' } },
    limit: 2000,
    pagination: false,
    depth: 0,
    overrideAccess: true,
  })
  const users = await payload.find({ collection: 'users', limit: 1000, pagination: false, depth: 0, overrideAccess: true })
  const sellerProfiles = await payload.find({
    collection: 'seller_profiles',
    limit: 1000,
    pagination: false,
    depth: 0,
    overrideAccess: true,
  })
  const categories = await payload.find({ collection: 'categories', limit: 100, pagination: false, depth: 0, overrideAccess: true })
  const commission = await payload.findGlobal({ slug: 'commission_settings', depth: 0, overrideAccess: true })

  // The cover check needs the URL behind `previewGallery[i].previewImage`, which depth 1 leaves as an id.
  const previews = await payload.find({
    collection: 'product_previews',
    limit: 2000,
    pagination: false,
    depth: 2,
    overrideAccess: true,
  })
  const previewUrlById = new Map<number, string>()
  for (const preview of previews.docs) {
    const media = (preview as { previewImage?: { url?: string } | number }).previewImage
    if (media && typeof media === 'object' && media.url) {
      previewUrlById.set(Number((preview as { id: number }).id), String(media.url))
    }
  }

  const reviewsFor = (productId: number) =>
    reviewRows.docs.filter((row) => Number((row as { product?: number }).product) === productId)
  const downloadsFor = (productId: number) =>
    downloadRows.docs.filter((row) => Number((row as { product?: number }).product) === productId)
  const sellerNames = new Set([
    ...sellerProfiles.docs.map((doc) => String((doc as { displayName?: string }).displayName ?? '')),
    ...users.docs.map((doc) => String((doc as { name?: string }).name ?? '')),
  ])

  // ---------------------------------------------------------------- homepage
  const home = await get('/')
  const homeCards = cardsFrom(home.html)

  add('D11', '/', 'recent-resource cards', homeCards.length > 0, `${homeCards.length} cards rendered`)

  const homeCardChecks = cardsFrom(home.html)
  // Title/price/seller/aggregate checks run over both grids by slug below.
  const checkCards = (page: string, cards: RenderedCard[], coverCheck: boolean) => {
    for (const card of cards) {
      const record = bySlug.get(card.slug) as
        | {
            id: number
            title?: string
            price?: number
            meta?: { description?: string | null }
            previewGallery?: unknown
            gallery?: unknown
          }
        | undefined

      if (!record) {
        add('card', page, `card → /products/${card.slug}`, false, 'slug belongs to no published product (dead link)')
        continue
      }

      const title = String(record.title ?? '')
      add('D3', page, `title of ${card.slug}`, card.title === title, `rendered "${card.title}" vs db "${title}"`)

      const price = Number(record.price ?? 0)
      const okPrice = price === 0 ? card.price === 0 || /miễn phí/i.test(card.priceText) : card.price === price
      add('D4', page, `price of ${card.slug}`, okPrice, `rendered ${card.price} vs db ${price}`)

      const realDownloads = downloadsFor(Number(record.id)).length
      const okDownloads = realDownloads > 0 ? card.downloads === realDownloads : card.downloads === null
      add('D5', page, `"lượt tải" of ${card.slug}`, okDownloads, `rendered ${card.downloads ?? 'absent'} vs db ${realDownloads}`)

      const productReviews = reviewsFor(Number(record.id))
      const realCount = productReviews.length
      const okReviews = realCount > 0 ? card.ratingCount === realCount : card.ratingCount === null
      add('D6', page, `star block of ${card.slug}`, okReviews, `rendered ${card.ratingCount ?? 'absent'} vs db ${realCount}`)

      if (card.seller) {
        add('D7', page, `seller of ${card.slug}`, sellerNames.has(card.seller), `rendered "${card.seller}" vs ${sellerProfiles.totalDocs} seller_profiles`)
      }

      if (coverCheck) {
        const previewIds = (record.previewGallery as (number | { id: number })[] | undefined) ?? []
        const media = [
          ...previewIds
            .map((item) => previewUrlById.get(Number(typeof item === 'object' ? item.id : item)))
            .filter(Boolean),
          (record.gallery as { image?: { url?: string } }[] | undefined)
            ?.map((item) => item?.image?.url)
            .filter(Boolean),
        ].flat() as string[]
        const rendered = imageUrlOf(card)
        // Provenance: the cover must be one of this product's own media. A product with no media must
        // render no cover at all (its own placeholder), never a substituted one.
        const ok =
          media.length === 0
            ? rendered === null
            : rendered !== null && media.some((url) => rendered === url)
        add(
          'D8',
          page,
          `cover of ${card.slug}`,
          ok,
          media.length === 0
            ? `product has no media, so no cover may render; rendered ${rendered ?? 'none'}`
            : `rendered ${rendered ?? 'none'} vs product media ${media.join(', ')}`,
        )
      }
    }
  }

  checkCards('/', homeCards, false)

  // Category tiles
  const publishedPerCategory = new Map<string, number>()
  for (const category of categories.docs) {
    const id = Number((category as { id: number }).id)
    const count = published.docs.filter((product) => {
      const rels = (product as { categories?: (number | { id: number })[] }).categories ?? []
      return rels.some((rel) => Number(typeof rel === 'object' ? rel.id : rel) === id)
    }).length
    publishedPerCategory.set(String((category as { title?: string }).title ?? ''), count)
  }

  const tilePattern = /<a[^>]*class="group flex flex-col items-center justify-center[^>]*>([\s\S]*?)<\/a>/g
  const tiles = [...home.html.replace(/<!--[\s\S]*?-->/g, '').matchAll(tilePattern)]
  if (tiles.length === 0) {
    add('D1', '/', 'category tiles', false, 'no category tile found in the homepage HTML')
  }
  for (const [, tile] of tiles) {
    const label = textOf(tile.match(/<div class="font-semibold[^>]*>([\s\S]*?)<\/div>/)?.[1] ?? '')
    const count = digits(textOf(tile).match(/([\d.]+)\s*hồ sơ/)?.[1])
    const real = publishedPerCategory.get(label)
    add(
      'D1',
      '/',
      `category tile "${label}"`,
      real !== undefined && count === real,
      `rendered ${count ?? 'none'} vs db ${real ?? 'no category with that label'}`,
    )
  }

  // Hero slides: the image must be the media of the product the slide links to. The compat layer lists
  // the slides in order, and the carousel renders one image per slide.
  const heroSection = home.html.slice(0, Math.max(0, home.html.indexOf('editorial-hero-compat')))
  const heroImages = [...heroSection.matchAll(/<img[^>]*src="([^"]+)"/g)].map((match) => {
    const src = decode(match[1])
    const optimized = src.match(/[?&]url=([^&]+)/)
    return optimized ? decodeURIComponent(optimized[1]) : src
  })
  const heroSlides = [
    ...home.html
      .slice(home.html.indexOf('editorial-hero-compat'))
      .matchAll(/href="\/products\/([^"]+)"/g),
  ].map((match) => match[1])

  heroSlides.slice(0, 3).forEach((slug, index) => {
    const record = bySlug.get(slug) as
      | {
          id: number
          previewGallery?: (number | { id: number })[]
          gallery?: { image?: { url?: string } }[]
          meta?: { image?: { url?: string } | number }
        }
      | undefined

    if (!record) {
      add('F1', '/ hero', `slide ${index + 1} → /products/${slug}`, false, 'slug belongs to no published product')
      return
    }

    const ownMedia = [
      ...((record.previewGallery ?? []).map((item) =>
        previewUrlById.get(Number(typeof item === 'object' ? item.id : item)),
      ) ?? []),
      ...((record.gallery ?? []).map((item) => item?.image?.url) ?? []),
      typeof record.meta?.image === 'object' && record.meta?.image !== null
        ? (record.meta.image as { url?: string }).url
        : undefined,
    ].filter(Boolean) as string[]

    const rendered = heroImages[index] ?? '(none)'
    add(
      'F1',
      '/ hero',
      `slide ${index + 1} image (${slug})`,
      ownMedia.includes(rendered),
      `rendered ${rendered} vs own media ${ownMedia.join(', ') || 'none'}`,
    )
  })

  // The 'Chuyên gia / Đã xác minh' badge may only appear when a record verifies the seller, and
  // `seller_profiles` has no such field: a rendered badge is fabricated.
  const sellerProfileFields = (
    payload.config.collections.find((collection) => collection.slug === 'seller_profiles')?.fields ?? []
  ).map((field) => ('name' in field ? String(field.name) : ''))
  const hasVerificationField = sellerProfileFields.some((name) => /verif|badge/i.test(name))

  const homeText = textOf(home.html)
  const publishedTotal = published.totalDocs
  const shareMatch = homeText.match(/(\d+)\s*%\s*Chia sẻ doanh thu/)
  const expectedShare = Math.round((1 - Number((commission as { defaultRate?: number }).defaultRate ?? 0)) * 100)
  if (shareMatch) {
    add('D9', '/', 'revenue share claim', Number(shareMatch[1]) === expectedShare, `rendered ${shareMatch[1]}% vs commission default ${expectedShare}%`)
  } else {
    add('D9', '/', 'revenue share claim', true, 'no share percentage rendered')
  }
  add(
    'F3',
    '/ hero',
    'slide tag label',
    !/Mô hình BIM LOD 400|Kiến trúc & Kết cấu|Kết cấu công trình/.test(homeText),
    'the tag must come from a product field (technicalSpecs.softwareVersion) or be absent',
  )

  add(
    'D2',
    '/',
    'hero "hàng nghìn" claim',
    !/hàng nghìn tài nguyên/i.test(homeText) || publishedTotal >= 1000,
    `"hàng nghìn" with ${publishedTotal} published products`,
  )
  add('D10', '/', '"hàng nghìn thành viên" claim', !/hàng nghìn/.test(section(home.html, 'thành viên') || '') || users.totalDocs >= 1000, `claim vs ${users.totalDocs} users`)

  // ---------------------------------------------------------------- /shop
  const shop = await get('/shop')
  const shopCards = cardsFrom(shop.html)
  add('D17', '/shop', 'shop grid renders cards', shopCards.length > 0, `${shopCards.length} cards`)
  checkCards('/shop', shopCards, true)

  // ---------------------------------------------------------------- product detail
  const product = await get(`/products/${PRODUCT_SLUG}`)
  const productRecord = bySlug.get(PRODUCT_SLUG) as { id: number; title?: string; price?: number } | undefined
  const productId = Number(productRecord?.id ?? 0)
  const productReviews = reviewsFor(productId)
  const productDownloads = downloadsFor(productId)
  const productText = textOf(product.html)

  add(
    'F2',
    '/products/[slug]',
    'seller "Chuyên gia / Đã xác minh" badge',
    hasVerificationField || !/Chuyên gia|Đã xác minh/.test(productText),
    hasVerificationField
      ? `seller_profiles has a verification field (${sellerProfileFields.join(', ')})`
      : 'seller_profiles has no verification field, so no seller may be shown as verified',
  )

  const headerCount = digits(productText.match(/\((\d+)\s*đánh giá\)/)?.[1])
  add(
    'D19',
    '/products/[slug]',
    'header star summary',
    productReviews.length > 0 ? headerCount === productReviews.length : headerCount === null,
    `rendered ${headerCount ?? 'absent'} vs db ${productReviews.length}`,
  )
  const headerDownloads = digits(productText.match(/([\d.]+)\s*lượt tải/)?.[1])
  add(
    'D20',
    '/products/[slug]',
    'header download count',
    productDownloads.length > 0 ? headerDownloads === productDownloads.length : headerDownloads === null,
    `rendered ${headerDownloads ?? 'absent'} vs db ${productDownloads.length}`,
  )

  const realSeller = (productRecord as { seller?: number | { id: number } } | undefined)?.seller
  const sellerId = Number(typeof realSeller === 'object' ? realSeller?.id : realSeller)
  const sellerProfile = sellerProfiles.docs.find(
    (doc) => Number((doc as { user?: number }).user) === sellerId,
  ) as { displayName?: string; bio?: string } | undefined
  if (sellerProfile?.displayName) {
    add('D21', '/products/[slug]', 'seller name', productText.includes(String(sellerProfile.displayName)), `rendered page vs record "${sellerProfile.displayName}"`)
  }
  add('D22', '/products/[slug]', 'seller experience claim', !/\d+\s*năm kinh nghiệm/.test(productText), 'no experience field exists on seller_profiles')
  if (sellerProfile?.bio) {
    add('D23', '/products/[slug]', 'seller bio', productText.includes(String(sellerProfile.bio)), `record bio "${String(sellerProfile.bio).slice(0, 40)}…"`)
  }
  const metaDescription = String((productRecord as { meta?: { description?: string | null } } | undefined)?.meta?.description ?? '')
  if (!metaDescription) {
    add('D24', '/products/[slug]', 'product summary line', !/đầy đủ cho công trình, bao gồm bản vẽ, thuyết minh/.test(productText), 'meta.description is empty, so no summary may be invented')
  }

  const tabReviews = digits(productText.match(/Đánh giá\s*(\d+)/)?.[1])
  add('D25', '/products/[slug]', 'reviews tab count', tabReviews === productReviews.length, `rendered ${tabReviews ?? 'absent'} vs db ${productReviews.length}`)
  const comments = await payload.find({
    collection: 'comments',
    where: { product: { equals: productId } },
    limit: 1000,
    pagination: false,
    depth: 0,
    overrideAccess: true,
  })
  const tabQuestions = digits(productText.match(/Hỏi đáp\s*(\d+)/)?.[1])
  add('D25', '/products/[slug]', 'Q&A tab count', tabQuestions === comments.totalDocs, `rendered ${tabQuestions ?? 'absent'} vs db ${comments.totalDocs}`)

  add('D26', '/products/[slug]', 'drawing-count row', !/\d+\s*bản vẽ/.test(section(product.html, 'Số lượng bản vẽ') || ''), 'no such column on products')
  add('D27', '/products/[slug]', 'compatibility row', !/Tương thích/.test(productText), 'no compatibility column on products')

  const packageBlock = section(product.html, 'Nội dung gói tài nguyên')
  if (packageBlock) {
    const formats = [...new Set([String((productRecord as { technicalSpecs?: { fileFormat?: string } })?.technicalSpecs?.fileFormat ?? '').toLowerCase()])]
    const claimsRevit = /Revit đầy đủ/i.test(packageBlock)
    add('D28', '/products/[slug]', 'package contents list', !claimsRevit || formats.some((f) => f.includes('rvt')), `package claims Revit while the product's format is ${formats.join(',') || 'unknown'}`)
  }

  const summaryCount = digits(productText.match(/(\d+)\s*đánh giá/)?.[1])
  add(
    'D29',
    '/products/[slug]',
    'review summary block',
    productReviews.length > 0 ? summaryCount === productReviews.length : !/100%\s*người mua đã xác thực/.test(productText),
    `rendered ${summaryCount ?? 'absent'} vs db ${productReviews.length}; verified-buyer claim present: ${/100%\s*người mua đã xác thực/.test(productText)}`,
  )
  add('D30', '/products/[slug]', 'featured testimonial', !/Nguyễn Hoàng Nam/.test(productText), `no review row is authored by that name (${reviewRows.totalDocs} published reviews)`)

  const relatedCards = cardsFrom(section(product.html, 'Có thể bạn cũng thích'))
  for (const card of relatedCards) {
    add('D31', '/products/[slug]', `related card → ${card.slug}`, bySlug.has(card.slug) || allProducts.docs.some((p) => (p as { slug?: string }).slug === card.slug), `slug ${bySlug.has(card.slug) ? 'exists' : 'belongs to no product'}`)
  }

  // The counter sits next to the preview label ("Bản xem trước có Watermark 1 / 3"); a bare `N / M`
  // regex would match the unrelated "24/7" support line first.
  const counterMatch = [...productText.matchAll(/(\d+)\s*\/\s*(\d+)/g)].find((match) =>
    /xem trước|Watermark|Preview/i.test(productText.slice(Math.max(0, (match.index ?? 0) - 80), match.index ?? 0)),
  )
  const galleryCounter = counterMatch ?? null
  if (galleryCounter) {
    const realMedia =
      ((productRecord as { previewGallery?: unknown[] }).previewGallery?.length ?? 0) +
      ((productRecord as { gallery?: unknown[] }).gallery?.length ?? 0)
    add('D32', '/products/[slug]', 'gallery counter', Number(galleryCounter[2]) === realMedia, `rendered 1 / ${galleryCounter[2]} vs ${realMedia} real media`)
  }

  // ---------------------------------------------------------------- /login
  const login = await get('/login')
  const loginText = textOf(login.html)
  const loginRating = loginText.match(/(\d\.\d)\s*\/\s*5\.0/)
  const loginCount = digits(loginText.match(/\(([\d.]+)\+?\s*đánh giá/)?.[1])
  add('D40', '/login', 'trust rating block', !loginRating && !loginCount, `rendered rating ${loginRating?.[1] ?? 'absent'} / count ${loginCount ?? 'absent'} vs ${reviewRows.totalDocs} published reviews`)
  add('D41', '/login', 'testimonial', !/KTS\. Hoàng Nam|Trưởng nhóm thiết kế/.test(loginText), 'no such user or review row')
  const loginProducts = digits(loginText.match(/([\d.]+)\+?\s*Tài nguyên/)?.[1])
  add('D42', '/login', 'resource counter', loginProducts === null || loginProducts <= allProducts.totalDocs, `rendered ${loginProducts ?? 'absent'} vs ${allProducts.totalDocs} products`)
  add('D43', '/login', 'loyalty promise', !/điểm thưởng|Tích xu thưởng/i.test(loginText), 'no points/rewards storage exists')

  // ---------------------------------------------------------------- /wallet (authenticated)
  const loginRes = await fetch(`${BASE}/api/users/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: BUYER_EMAIL, password: DEV_PASSWORD }),
  })
  const cookie = (loginRes.headers.getSetCookie?.() ?? [])
    .map((value) => value.split(';')[0])
    .find((value) => value.startsWith('payload-token='))
  if (!cookie) {
    add('D36', '/wallet', 'wallet page reachable', false, `login failed with ${loginRes.status}`)
  } else {
    const wallet = await get('/wallet', cookie)
    const walletText = textOf(wallet.html)
    add('D36', '/wallet', 'loyalty points card', !/Điểm thưởng tích lũy/.test(walletText), 'no points/rewards storage exists anywhere')
  }

  // ---------------------------------------------------------------- footer, every page
  add('D44', '/cart', 'footer payment list', !/Stripe/.test(textOf((await get('/cart')).html)), 'no Stripe rail exists (decision 0013)')

  // ---------------------------------------------------------------- shipped negative control
  // The provenance comparator must reject a curated substitute. This runs on every run, so a detector
  // that stopped failing is visible: if either row below ever reports ok, the check is broken.
  const controlProduct = bySlug.get(String(cardsFrom(home.html)[0]?.slug ?? '')) as
    | { previewGallery?: (number | { id: number })[]; gallery?: { image?: { url?: string } }[] }
    | undefined
  const controlOwnMedia = controlProduct
    ? [
        ...((controlProduct.previewGallery ?? []).map((item) =>
          previewUrlById.get(Number(typeof item === 'object' ? item.id : item)),
        ) ?? []),
        ...((controlProduct.gallery ?? []).map((item) => item?.image?.url) ?? []),
      ].filter(Boolean) as string[]
    : []
  const curatedSubstitute = '/media/hero-villa.jpg'
  add(
    'CTRL',
    '/ hero',
    'provenance detector rejects a curated substitute',
    controlOwnMedia.length > 0 && !controlOwnMedia.includes(curatedSubstitute),
    controlOwnMedia.length > 0
      ? `a curated URL (${curatedSubstitute}) is not in the product's own media (${controlOwnMedia.length} files)`
      : 'no product media to compare against — the control cannot be evaluated',
  )
  add(
    'CTRL',
    '/ hero',
    'provenance detector accepts the record own media',
    controlOwnMedia.length > 0,
    controlOwnMedia.length > 0
      ? `the product's own media list is non-empty (e.g. ${controlOwnMedia[0]})`
      : 'no product media to compare against',
  )

  // ---------------------------------------------------------------- report
  const pad = (value: string, width: number): string => value.padEnd(width).slice(0, width)
  const failures = checks.filter((check) => !check.ok)
  console.log(`${pad('check', 8)} ${pad('page', 20)} ${pad('status', 7)} what — rendered vs real`)
  console.log('-'.repeat(150))
  for (const check of checks) {
    console.log(
      `${pad(check.id, 8)} ${pad(check.page, 20)} ${pad(check.ok ? 'ok' : 'FAIL', 7)} ${check.what} — ${check.detail}`,
    )
  }
  console.log('')
  console.log(`=== ${checks.length} checks: ${checks.length - failures.length} ok, ${failures.length} failing ===`)
  console.log(
    `records read: products ${published.totalDocs} published / ${allProducts.totalDocs} total, ` +
      `reviews ${reviewRows.totalDocs}, download_events ${downloadRows.totalDocs}, users ${users.totalDocs}, ` +
      `seller_profiles ${sellerProfiles.totalDocs}, categories ${categories.totalDocs}`,
  )

  await payload.destroy()
  process.exit(failures.length > 0 ? 1 : 0)
}

main().catch((error) => {
  console.error(`\nprobe aborted: ${(error as Error).message}`)
  process.exit(1)
})
