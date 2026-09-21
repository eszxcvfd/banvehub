/**
 * web/tests/helpers/probe-homepage-prices.mts
 *
 * Read-only instrument for the owner's report that `/` showed prices its products do not have. It
 * fetches the homepage, extracts every recent-resource card (`[data-slot="recent-resource-card"]`) —
 * the slug it links to, the title it prints, the `format · size` line, the price and the rating — and
 * then loads those slugs through Payload and compares the card against the row it links to.
 *
 * Verdicts, per card:
 *   MATCH          the slug resolves to a product and every compared field is that product's own value
 *   MISMATCH       the slug resolves to a product and a field does not belong to it            -> exit 1
 *   FALLBACK       the slug resolves to no product: this is the curated list doing its job, which is
 *                  only legitimate while the product list is empty or short. If the card's price is
 *                  the price of some product it is reported as `FALLBACK price-in-catalog`; a price
 *                  that belongs to no product at all is a failure                            -> exit 1
 *
 * Compared fields: title, price (a free product must render as 0 ₫), and — when the product actually
 * carries them — `technicalSpecs.fileFormat` (first token, the same normalisation
 * `components/Hero/EditorialHero.tsx:113` applies) and `technicalSpecs.fileSize`. A product that does
 * not carry a format/size falls back to the curated line by design, and that is reported as
 * `fallback(no db field)` instead of a mismatch. The product's rating/review count does not exist in
 * this schema, so a product-backed card must render none — a `★` on such a card fails the run.
 *
 * It is read-only: one GET of `/` plus Payload reads. Nothing is written, no money moves.
 *
 * Usage (dev server on http://localhost:3000, from `web/`):
 *   NODE_OPTIONS="--no-deprecation --import tsx/esm" node tests/helpers/probe-homepage-prices.mts
 *
 * Exit 0 = every card carries its own product's values. Non-zero = at least one card lies.
 */
import 'dotenv/config'

import { getPayload } from 'payload'

import config from '../../src/payload.config'

const BASE = process.env.PROBE_BASE_URL || 'http://localhost:3000'

type Card = {
  slug: string
  title: string
  format: string
  size: string
  price: number | null
  renderedPrice: string
  rating: string | null
  reviews: string | null
  image: string
}

const decodeEntities = (value: string): string =>
  value
    .replace(/&amp;/g, '&')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&middot;/g, '·')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')

const textOf = (html: string): string => decodeEntities(html.replace(/<[^>]*>/g, '')).replace(/\s+/g, ' ').trim()

const firstToken = (value: string | null | undefined): string => String(value ?? '').split(/[,/]/)[0].trim()

const parseVnd = (value: string): number | null => {
  const digits = value.replace(/[^\d]/g, '')
  return digits ? Number(digits) : null
}

/** One card per `data-slot="recent-resource-card"` anchor, in document order. */
const extractCards = (html: string): Card[] => {
  const anchors = [...html.matchAll(/<a[^>]*data-slot="recent-resource-card"[^>]*>/g)]

  return anchors.map((anchor, index) => {
    const start = (anchor.index ?? 0) + anchor[0].length
    const end = index + 1 < anchors.length ? (anchors[index + 1].index ?? html.length) : html.length
    // React separates interpolated text nodes with `<!-- -->`, which would break the span captures.
    const chunk = html.slice(start, end).replace(/<!--[\s\S]*?-->/g, '')

    const title = textOf(chunk.match(/line-clamp-2[^>]*>([\s\S]*?)<\/div>/)?.[1] ?? '')
    const formatSize = textOf(
      chunk.match(/anticon-file-text[\s\S]*?<\/span><span>([\s\S]*?)<\/span>/)?.[1] ?? '',
    )
    const renderedPrice = textOf(chunk.match(/tracking-tight"><p>([\s\S]*?)<\/p>/)?.[1] ?? '')
    const ratingText = textOf(chunk.match(/text-amber-500[\s\S]*?<\/div>/)?.[0] ?? '')
    const rating = ratingText.match(/★\s*([\d.]+)/)?.[1] ?? null
    const reviews = ratingText.match(/\((\d+)\)/)?.[1] ?? null
    const image = decodeEntities(chunk.match(/src="([^"]+)"/)?.[1] ?? '')

    const [format = '', size = ''] = formatSize.split('·').map((part) => part.trim())

    return {
      slug: anchor[0].match(/href="\/products\/([^"]+)"/)?.[1] ?? '<no slug>',
      title,
      format,
      size,
      price: renderedPrice ? parseVnd(renderedPrice) : null,
      renderedPrice: renderedPrice || '<none>',
      rating,
      reviews,
      image,
    }
  })
}

const main = async (): Promise<void> => {
  console.log('=== homepage price integrity probe ===')
  console.log(`homepage  ${BASE}/`)
  console.log(`run at    ${new Date().toISOString()}`)
  console.log('')

  const res = await fetch(`${BASE}/`)
  if (!res.ok) throw new Error(`GET / answered ${res.status}`)
  const html = await res.text()

  const cards = extractCards(html)
  if (cards.length === 0) {
    console.log('no recent-resource cards found in the homepage HTML — the section did not render')
    process.exit(1)
  }

  const payload = await getPayload({ config })

  const catalog = await payload.find({
    collection: 'products',
    limit: 1000,
    pagination: false,
    depth: 0,
    overrideAccess: true,
  })
  const priceBelongsToSomeProduct = new Set(
    catalog.docs.map((doc) => Number((doc as { price?: number }).price ?? 0)),
  )

  type Verdict = { card: Card; database: Record<string, unknown> | null; problems: string[]; notes: string[] }
  const verdicts: Verdict[] = []

  for (const card of cards) {
    const found = await payload.find({
      collection: 'products',
      where: { slug: { equals: card.slug } },
      limit: 1,
      depth: 0,
      overrideAccess: true,
    })
    const product = found.docs[0] as
      | {
          id: number
          title?: string
          slug?: string
          price?: number
          isFree?: boolean
          technicalSpecs?: { fileFormat?: string | null; fileSize?: string | null }
        }
      | undefined

    if (!product) {
      const inCatalog = card.price !== null && priceBelongsToSomeProduct.has(card.price)
      verdicts.push({
        card,
        database: null,
        problems: inCatalog ? [] : ['a card with no product row renders a price that belongs to no product'],
        notes: [`FALLBACK ${inCatalog ? 'price-in-catalog' : 'price-not-in-catalog'}`],
      })
      continue
    }

    const problems: string[] = []
    const notes: string[] = []

    const dbTitle = textOf(String(product.title ?? ''))
    if (dbTitle && dbTitle !== card.title) problems.push(`title: card "${card.title}" ≠ db "${dbTitle}"`)

    const dbPrice = Number(product.price ?? 0)
    const dbFree = Boolean(product.isFree) || dbPrice === 0
    if (card.price === null) {
      problems.push(`price: card renders no price while the product price is ${dbPrice}`)
    } else if (card.price !== dbPrice) {
      problems.push(`price: card renders ${card.price} ≠ db ${dbPrice}${dbFree ? ' (the product is free)' : ''}`)
    }

    const dbFormat = product.technicalSpecs?.fileFormat ? firstToken(String(product.technicalSpecs.fileFormat)) : ''
    if (dbFormat && dbFormat !== card.format) {
      problems.push(`format: card "${card.format}" ≠ db "${dbFormat}"`)
    } else if (!dbFormat) {
      notes.push('fallback(no db fileFormat)')
    }

    const dbSize = product.technicalSpecs?.fileSize ? String(product.technicalSpecs.fileSize).trim() : ''
    if (dbSize && dbSize !== card.size) {
      problems.push(`size: card "${card.size}" ≠ db "${dbSize}"`)
    } else if (!dbSize) {
      notes.push('fallback(no db fileSize)')
    }

    if (card.rating !== null || card.reviews !== null) {
      problems.push(
        `rating: card renders ★${card.rating ?? '?'} (${card.reviews ?? '?'}) although this schema has no product rating`,
      )
    }

    verdicts.push({ card, database: product as unknown as Record<string, unknown>, problems, notes })
  }

  const pad = (value: string, width: number): string => value.padEnd(width).slice(0, width)
  const truncate = (value: string, width: number): string => (value.length > width ? `${value.slice(0, width - 1)}…` : value)

  console.log(
    `${pad('slug', 42)} ${pad('db price', 10)} ${pad('rendered', 10)} ${pad('verdict', 22)} title / format / size / rating`,
  )
  console.log('-'.repeat(150))

  let failures = 0
  for (const { card, database, problems, notes } of verdicts) {
    const isFallback = database === null
    const verdict = isFallback ? (notes[0] ?? 'FALLBACK').replace('FALLBACK ', '') : problems.length > 0 ? 'MISMATCH' : 'MATCH'
    if (problems.length > 0) failures += 1

    const dbPrice = isFallback ? '—' : String(Number((database as { price?: number }).price ?? 0))
    const ratingShown = card.rating !== null || card.reviews !== null ? `★${card.rating ?? '?'}(${card.reviews ?? '?'})` : '—'

    console.log(
      `${pad(truncate(card.slug, 42), 42)} ${pad(dbPrice, 10)} ${pad(card.renderedPrice, 10)} ${pad(verdict, 22)} ` +
        `${truncate(card.title, 46)} | ${card.format || '—'} | ${card.size || '—'} | ${ratingShown}` +
        `${notes.length > 0 && !isFallback ? `  [${notes.join(', ')}]` : ''}`,
    )

    for (const problem of problems) console.log(`    ! ${problem}`)
  }

  console.log('')
  console.log(
    `=== ${verdicts.length} cards: ${verdicts.length - failures} ok, ${failures} failing; ` +
      `${verdicts.filter((v) => v.database === null).length} fallback card(s) ===`,
  )
  console.log(`catalog: ${catalog.totalDocs} published+all products read for the price cross-check`)

  await payload.destroy()
  process.exit(failures > 0 ? 1 : 0)
}

main().catch(async (error) => {
  console.error(`\nprobe aborted: ${(error as Error).message}`)
  process.exit(1)
})
