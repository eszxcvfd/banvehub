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

export const TEST_PASSWORD = 'kientaohub-test-password-2026'

export const TEST_USERS = {
  admin: { email: 'e2e-admin@kientaohub.test', password: TEST_PASSWORD, roles: ['admin'] as const },
  seller: { email: 'e2e-seller@kientaohub.test', password: TEST_PASSWORD, roles: ['seller'] as const },
  moderator: { email: 'e2e-moderator@kientaohub.test', password: TEST_PASSWORD, roles: ['moderator'] as const },
  buyer: { email: 'e2e-buyer@kientaohub.test', password: TEST_PASSWORD, roles: ['buyer'] as const },
}

const createdProductIds: (string | number)[] = []
const createdCategoryIds: (string | number)[] = []
const createdUserIds: (string | number)[] = []

export async function getTestPayload(): Promise<Payload> {
  const config = await configPromise
  return getPayload({ config })
}

/**
 * Race-safe find-or-create for the shared e2e fixtures.
 *
 * Playwright runs every spec FILE in its own worker process, and both `catalog.e2e.spec.ts` and
 * `frontend.e2e.spec.ts` call `seedCatalogData()` in `beforeAll`. A plain find-then-create
 * therefore races: both workers can observe "no such row", both INSERT, and the loser dies with
 * `ValidationError: The following field is invalid: <field>` - Payload maps the Postgres unique
 * violation of `users.email` / `categories.slug` / `products.slug` onto the field. Re-reading after
 * a failed create lets the loser adopt the winner's row instead of failing its whole file.
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

export async function seedCatalogData(): Promise<SeedCatalogResult> {
  const payload = await getTestPayload()

  // 1. Seed or retrieve users
  const users: Record<string, Record<string, unknown>> = {}
  for (const [key, userData] of Object.entries(TEST_USERS)) {
    const { doc, created } = await findOrCreate(
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
    if (created) {
      createdUserIds.push(doc.id as string | number)
    }
  }

  // 2. Seed categories
  const categoryDefs = [
    { title: 'Kiến trúc', slug: 'kien-truc' },
    { title: 'Kết cấu', slug: 'ket-cau' },
    { title: 'MEP', slug: 'mep' },
  ]

  const categories: Record<string, Record<string, unknown>> = {}
  for (const cat of categoryDefs) {
    const { doc, created } = await findOrCreate(
      payload,
      'categories',
      { slug: { equals: cat.slug } },
      async () =>
        (await payload.create({
          collection: 'categories',
          data: cat,
          overrideAccess: true,
        })) as unknown as Record<string, unknown>,
    )

    categories[cat.slug] = doc
    if (created) {
      createdCategoryIds.push(doc.id as string | number)
    }
  }

  // 3. Seed digital products
  const kienTrucId = categories['kien-truc']?.id as string | number | undefined
  const ketCauId = categories['ket-cau']?.id as string | number | undefined
  const mepId = categories['mep']?.id as string | number | undefined

  const productDefs = [
    {
      title: 'Biệt thự hiện đại 3 tầng 5x20m',
      slug: 'biet-thu-hien-dai-3-tang',
      priceInUSD: 25,
      isFree: false,
      price: 250000,
      productCode: 'KTH-KT-001',
      _status: 'published' as const,
      categories: kienTrucId ? [kienTrucId] : [],
    },
    {
      title: 'Hồ sơ kết cấu trung tâm thương mại',
      slug: 'ho-so-ket-cau-tttm',
      priceInUSD: 50,
      isFree: false,
      price: 500000,
      productCode: 'KTH-KC-002',
      _status: 'published' as const,
      categories: ketCauId ? [ketCauId] : [],
    },
    {
      title: 'Thư viện SketchUp biệt thự vườn',
      slug: 'thu-vien-sketchup-biet-thu-vuon',
      priceInUSD: 0,
      isFree: true,
      price: 0,
      productCode: 'KTH-KT-003',
      _status: 'published' as const,
      categories: kienTrucId ? [kienTrucId] : [],
    },
    {
      title: 'Sơ đồ nguyên lý điện chiếu sáng MEP',
      slug: 'so-do-nguyen-ly-dien-mep',
      priceInUSD: 0,
      isFree: true,
      price: 0,
      productCode: 'KTH-MEP-01',
      _status: 'published' as const,
      categories: mepId ? [mepId] : [],
    },
    {
      title: 'Bản vẽ nhà văn hóa đang soạn thảo',
      slug: 'ban-ve-nha-van-hoa-draft',
      priceInUSD: 15,
      isFree: false,
      price: 150000,
      productCode: 'KTH-DRAFT-005',
      _status: 'draft' as const,
      draft: true,
    },
  ]

  const products: Record<string, Record<string, unknown>> = {}
  for (const prod of productDefs) {
    try {
      const { doc, created } = await findOrCreate(
        payload,
        'products',
        { slug: { equals: prod.slug } },
        async () =>
          (await payload.create({
            collection: 'products',
            draft: prod._status === 'draft',
            data: prod as never,
            overrideAccess: true,
          })) as unknown as Record<string, unknown>,
        { draft: true },
      )

      products[prod.slug] = doc
      if (created) {
        createdProductIds.push(doc.id as string | number)
      }
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

export async function cleanupCatalogData(): Promise<void> {
  const payload = await getTestPayload()

  for (const id of createdProductIds) {
    await payload.delete({ collection: 'products', id, overrideAccess: true }).catch(() => undefined)
  }
  for (const id of createdCategoryIds) {
    await payload.delete({ collection: 'categories', id, overrideAccess: true }).catch(() => undefined)
  }
  for (const id of createdUserIds) {
    await payload.delete({ collection: 'users', id, overrideAccess: true }).catch(() => undefined)
  }
}
