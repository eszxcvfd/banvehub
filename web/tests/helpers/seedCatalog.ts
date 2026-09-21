import { getPayload, type Payload } from 'payload'
import configPromise from '../../src/payload.config'

export interface SeedCatalogResult {
  users: {
    admin: Record<string, unknown>
    seller: Record<string, unknown>
    moderator: Record<string, unknown>
    buyer: Record<string, unknown>
  }
  categories: Record<string, Record<string, unknown>>
  products: Record<string, Record<string, unknown>>
}

export interface FixtureIdentityCounts {
  users: number
  categories: number
  products: number
}

export interface FixtureCleanupReport {
  deleted: FixtureIdentityCounts
  remaining: FixtureIdentityCounts
}

export const TEST_PASSWORD = 'kientaohub-test-password-2026'

export const TEST_USERS = {
  admin: { email: 'e2e-admin@kientaohub.test', password: TEST_PASSWORD, roles: ['admin'] as const },
  seller: { email: 'e2e-seller@kientaohub.test', password: TEST_PASSWORD, roles: ['seller'] as const },
  moderator: { email: 'e2e-moderator@kientaohub.test', password: TEST_PASSWORD, roles: ['moderator'] as const },
  buyer: { email: 'e2e-buyer@kientaohub.test', password: TEST_PASSWORD, roles: ['buyer'] as const },
}

/**
 * Shared e2e fixture lifecycle - the identity lists below are the single owner of "which rows
 * belong to the e2e suite", and they are used in BOTH directions: `seedCatalogData()` creates
 * exactly these rows, `cleanupCatalogFixtures()` deletes exactly these rows (and nothing else).
 *
 * Why the lifecycle is suite-level and not per spec file: Playwright runs every spec FILE in its
 * own worker process, so a per-file `beforeAll`/`afterAll` pair is not a lifecycle. Whichever file
 * finishes first would delete fixtures the other files are still using (observed as a 403 flake in
 * `T1-F5-05: Seller role is permitted to create products`, where the seller token outlived the
 * seller row), and whichever file merely consumed an already-seeded fixture would leave it behind
 * in the dev database, because the previous id-array bookkeeping only knew about rows the current
 * process had created itself.
 *
 * `tests/helpers/global-setup.ts` and `tests/helpers/global-teardown.ts` (wired in
 * playwright.config.ts) now own the lifecycle: one seed before the first worker starts, one
 * teardown after the last worker exits. Every fixture row therefore lives for the whole run no
 * matter which worker would otherwise have created it.
 */
export const FIXTURE_USER_EMAILS: string[] = Object.values(TEST_USERS).map((user) => user.email)

export const FIXTURE_CATEGORY_DEFS = [
  { title: 'Kiến trúc', slug: 'kien-truc' },
  { title: 'Kết cấu', slug: 'ket-cau' },
  { title: 'MEP', slug: 'mep' },
] as const

export const FIXTURE_CATEGORY_SLUGS: string[] = FIXTURE_CATEGORY_DEFS.map((category) => category.slug)

/**
 * The five products the e2e suite owns. `_status: 'draft'` marks the product that must stay
 * invisible to guests (T2-B3-01 asserts a 404 on its slug); `categorySlug` is resolved to the
 * seeded category id at seed time.
 */
export const FIXTURE_PRODUCT_DEFS = [
  {
    title: 'Biệt thự hiện đại 3 tầng 5x20m',
    slug: 'biet-thu-hien-dai-3-tang',
    priceInUSD: 25,
    isFree: false,
    price: 250000,
    productCode: 'KTH-KT-001',
    _status: 'published' as const,
    categorySlug: 'kien-truc' as const,
  },
  {
    title: 'Hồ sơ kết cấu trung tâm thương mại',
    slug: 'ho-so-ket-cau-tttm',
    priceInUSD: 50,
    isFree: false,
    price: 500000,
    productCode: 'KTH-KC-002',
    _status: 'published' as const,
    categorySlug: 'ket-cau' as const,
  },
  {
    title: 'Thư viện SketchUp biệt thự vườn',
    slug: 'thu-vien-sketchup-biet-thu-vuon',
    priceInUSD: 0,
    isFree: true,
    price: 0,
    productCode: 'KTH-KT-003',
    _status: 'published' as const,
    categorySlug: 'kien-truc' as const,
  },
  {
    title: 'Sơ đồ nguyên lý điện chiếu sáng MEP',
    slug: 'so-do-nguyen-ly-dien-mep',
    priceInUSD: 0,
    isFree: true,
    price: 0,
    productCode: 'KTH-MEP-01',
    _status: 'published' as const,
    categorySlug: 'mep' as const,
  },
  {
    title: 'Bản vẽ nhà văn hóa đang soạn thảo',
    slug: 'ban-ve-nha-van-hoa-draft',
    priceInUSD: 15,
    isFree: false,
    price: 150000,
    productCode: 'KTH-DRAFT-005',
    _status: 'draft' as const,
    categorySlug: null,
  },
] as const

export const FIXTURE_PRODUCT_SLUGS: string[] = FIXTURE_PRODUCT_DEFS.map((product) => product.slug)

export async function getTestPayload(): Promise<Payload> {
  const config = await configPromise
  return getPayload({ config })
}

/**
 * Race-safe find-or-create for the shared e2e fixtures.
 *
 * The suite-level seed runs before any worker starts, so in a normal run this only ever reads. It
 * stays race-safe for callers that run outside that lifecycle (e.g. a single file executed through
 * another runner): a plain find-then-create would race, because two workers can both observe "no
 * such row", both INSERT, and the loser dies with `ValidationError: The following field is
 * invalid: <field>` - Payload maps the Postgres unique violation of `users.email` /
 * `categories.slug` / `products.slug` onto the field. Re-reading after a failed create lets the
 * loser adopt the winner's row instead of failing its whole file.
 */
async function findOrCreate(
  payload: Payload,
  collection: 'users' | 'categories' | 'products',
  where: Record<string, unknown>,
  create: () => Promise<Record<string, unknown>>,
  findOptions: Record<string, unknown> = {},
): Promise<{ doc: Record<string, unknown>; created: boolean }> {
  const read = async (): Promise<Record<string, unknown>[]> => {
    const found = (await payload.find({
      collection,
      where,
      limit: 1,
      overrideAccess: true,
      ...findOptions,
    } as never)) as unknown as { docs: Record<string, unknown>[] }
    return found.docs
  }

  const existing = await read()
  if (existing.length > 0) {
    return { doc: existing[0], created: false }
  }

  try {
    return { doc: await create(), created: true }
  } catch (err) {
    const raced = await read().catch(() => [])
    if (raced.length > 0) {
      return { doc: raced[0], created: false }
    }
    throw err
  }
}

/**
 * Resolves a relationship value (raw id, populated doc, null) to an id.
 */
const relationshipId = (value: unknown): string | number | null => {
  if (value === null || value === undefined || value === '') return null
  if (typeof value === 'object') {
    const id = (value as { id?: unknown }).id
    return id === null || id === undefined || id === '' ? null : (id as string | number)
  }
  return value as string | number
}

/**
 * A fixture product MUST carry the fixture seller.
 *
 * `enforceModerationState` only auto-assigns `products.seller` when the write carries an
 * authenticated user (`if (operation === 'create' && user?.id && !data.seller)`), and this seed runs
 * through the Local API without one — so a fixture product created here is born with `seller = null`.
 * That state is fatal downstream: `OrderItems.validateAntiSelfPurchase` refuses every order item for
 * a product with no assigned seller ("Product X has no assigned seller"), which makes any spec that
 * builds an order for a fixture product fail for a reason that has nothing to do with what it tests.
 *
 * `cleanupCatalogFixtures()` already deletes products before categories and users, so it does not
 * leave residue behind; the seller-less state comes from the create path, not from a teardown. Both
 * halves are therefore repaired here: new rows are created with the seller, and an adopted row whose
 * seller is missing is updated instead of being used as-is. That is what makes a second run against
 * a database that already contains seller-less fixture products behave like the first.
 */
async function ensureFixtureProductSeller(
  payload: Payload,
  doc: Record<string, unknown>,
  sellerId: string | number,
  draft: boolean,
): Promise<Record<string, unknown>> {
  // The decision has to be made on the MAIN row, not on the document this helper was handed: the
  // caller adopts through `findOrCreate(..., { draft: true })`, so for a drafts-enabled collection the
  // document can come from the version rows — which already carry the seller — while the main row is
  // the one still missing it, and the repair was skipped on exactly that difference (finding T3-F2).
  const mainRow = (
    await payload.find({
      collection: 'products',
      where: { id: { equals: doc.id as string | number } },
      draft: false,
      limit: 1,
      overrideAccess: true,
    })
  ).docs[0] as Record<string, unknown> | undefined

  const currentSeller = relationshipId(mainRow?.seller)
  if (currentSeller !== null && String(currentSeller) === String(sellerId)) return doc

  // `draft: true` writes only the version rows and leaves the main row alone (finding T3-F2), so a
  // repaired draft fixture kept `seller = null` on exactly the row `OrderItems.validateAntiSelfPurchase`
  // reads. A `draft: false` update is not the answer either: it publishes the document, and this
  // fixture exists to stay a draft so the storefront hides it. The main row is therefore written
  // through the database adapter — the same layer the write path uses internally — which touches no
  // version row and changes no status. Field hooks deliberately do not run for this write: the value
  // is the fixture seller itself, and the whole point of the helper is to repair rows the normal write
  // path left unusable.
  await payload.db.updateOne({
    collection: 'products',
    id: doc.id as string | number,
    data: { seller: sellerId } as never,
  })

  // Then bring the newest version in step with the main row, so a draft read (`draft: true`) sees the
  // seller too and the two halves of the document do not disagree.
  const repaired = (await payload.update({
    collection: 'products',
    id: doc.id as string | number,
    data: { seller: sellerId } as never,
    draft,
    overrideAccess: true,
  })) as unknown as Record<string, unknown>

  return repaired
}

export async function seedCatalogData(): Promise<SeedCatalogResult> {
  const payload = await getTestPayload()

  // 1. Seed or retrieve users
  const users: Record<string, Record<string, unknown>> = {}
  for (const [key, userData] of Object.entries(TEST_USERS)) {
    const { doc } = await findOrCreate(
      payload,
      'users',
      { email: { equals: userData.email } },
      async () =>
        (await payload.create({
          collection: 'users',
          data: {
            email: userData.email,
            password: userData.password,
            name: `Test ${key}`,
            roles: [...userData.roles],
          },
          overrideAccess: true,
        })) as unknown as Record<string, unknown>,
    )

    users[key] = doc
  }

  // 2. Seed categories
  const categories: Record<string, Record<string, unknown>> = {}
  for (const cat of FIXTURE_CATEGORY_DEFS) {
    const { doc } = await findOrCreate(
      payload,
      'categories',
      { slug: { equals: cat.slug } },
      async () =>
        (await payload.create({
          collection: 'categories',
          data: { title: cat.title, slug: cat.slug },
          overrideAccess: true,
        })) as unknown as Record<string, unknown>,
    )

    categories[cat.slug] = doc
  }

  // 3. Seed digital products
  const categoryIds = new Map(
    Object.entries(categories).map(([slug, doc]) => [slug, doc.id as string | number]),
  )

  // Every fixture product is owned by the fixture seller (see `ensureFixtureProductSeller`): a
  // product without a seller cannot receive an order item at all, so an unusable fixture product is
  // worse than no fixture product.
  const fixtureSellerId = relationshipId(users.seller?.id)
  if (fixtureSellerId === null) {
    throw new Error(
      'The fixture seller account is missing, so fixture products cannot be given an owner.',
    )
  }

  const products: Record<string, Record<string, unknown>> = {}
  for (const prod of FIXTURE_PRODUCT_DEFS) {
    try {
      const categoryId = prod.categorySlug ? categoryIds.get(prod.categorySlug) : undefined
      const isDraftProduct = prod._status === 'draft'
      const { doc } = await findOrCreate(
        payload,
        'products',
        { slug: { equals: prod.slug } },
        async () =>
          (await payload.create({
            collection: 'products',
            draft: isDraftProduct,
            data: {
              title: prod.title,
              slug: prod.slug,
              priceInUSD: prod.priceInUSD,
              isFree: prod.isFree,
              price: prod.price,
              productCode: prod.productCode,
              seller: fixtureSellerId,
              _status: prod._status,
              // The draft product is created as a draft document (Payload keeps `draft` on the
              // data it was handed); published products must not carry it.
              ...(isDraftProduct ? { draft: true } : {}),
              categories: categoryId ? [categoryId] : [],
            } as never,
            overrideAccess: true,
          })) as unknown as Record<string, unknown>,
        { draft: true },
      )

      products[prod.slug] = await ensureFixtureProductSeller(
        payload,
        doc,
        fixtureSellerId,
        isDraftProduct,
      )
    } catch (err) {
      console.warn(`Could not seed product ${prod.slug}:`, err)
    }
  }

  return {
    users: users as unknown as SeedCatalogResult['users'],
    categories,
    products,
  }
}

/**
 * Reads the fixture rows that currently exist, selected by identity only (emails / slugs).
 * Drafts are included, so the draft product counts here too.
 */
async function findFixtureDocs(
  payload: Payload,
  collection: 'users' | 'categories' | 'products',
  where: Record<string, unknown>,
  findOptions: Record<string, unknown> = {},
): Promise<Record<string, unknown>[]> {
  const found = (await payload.find({
    collection,
    where,
    limit: 0,
    overrideAccess: true,
    ...findOptions,
  } as never)) as unknown as { docs: Record<string, unknown>[] }
  return found.docs
}

export async function countCatalogFixtures(): Promise<FixtureIdentityCounts> {
  const payload = await getTestPayload()

  const [users, categories, products] = await Promise.all([
    findFixtureDocs(payload, 'users', { email: { in: FIXTURE_USER_EMAILS } }),
    findFixtureDocs(payload, 'categories', { slug: { in: FIXTURE_CATEGORY_SLUGS } }),
    findFixtureDocs(payload, 'products', { slug: { in: FIXTURE_PRODUCT_SLUGS } }, { draft: true }),
  ])

  return { users: users.length, categories: categories.length, products: products.length }
}

/**
 * Deletes the shared e2e fixtures by IDENTITY, not by "ids this process happens to remember".
 *
 * That is what makes the teardown independent of which worker seeded: rows created by any process
 * (including earlier runs that crashed before their teardown) match the same emails / slugs and are
 * removed. Selection is strictly limited to the fixture identities, so the rest of the dev
 * database - seed data, `dev@payloadcms.com`, anything a developer created - is untouched. Only the
 * Payload Local API is used: no raw SQL, no DDL and no trigger bypass.
 *
 * Children go first (products reference categories, products/users reference each other through
 * `seller_id`), and a failed delete is NOT swallowed: the caller re-counts and fails loudly rather
 * than leaving residue behind silently.
 */
export async function cleanupCatalogFixtures(): Promise<FixtureCleanupReport> {
  const payload = await getTestPayload()

  const targets: {
    collection: 'products' | 'categories' | 'users'
    where: Record<string, unknown>
    findOptions: Record<string, unknown>
  }[] = [
    { collection: 'products', where: { slug: { in: FIXTURE_PRODUCT_SLUGS } }, findOptions: { draft: true } },
    { collection: 'categories', where: { slug: { in: FIXTURE_CATEGORY_SLUGS } }, findOptions: {} },
    { collection: 'users', where: { email: { in: FIXTURE_USER_EMAILS } }, findOptions: {} },
  ]

  const deleted: FixtureIdentityCounts = { users: 0, categories: 0, products: 0 }

  for (const { collection, where, findOptions } of targets) {
    for (const doc of await findFixtureDocs(payload, collection, where, findOptions)) {
      await payload.delete({ collection, id: doc.id as string | number, overrideAccess: true })
      deleted[collection] += 1
    }
  }

  return { deleted, remaining: await countCatalogFixtures() }
}
