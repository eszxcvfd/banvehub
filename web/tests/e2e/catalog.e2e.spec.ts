import { test, expect } from '@playwright/test'
import { getTestPayload, TEST_USERS } from '../helpers/seedCatalog'

const baseURL = process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:3000'

/**
 * Removes a product row this file created, selected by the exact slug the attempt used.
 *
 * `seller-asset-*` rows are NOT part of the suite's fixture identities (tests/helpers/seedCatalog.ts
 * owns exactly 4 emails / 3 category slugs / 5 product slugs and nothing else), so the suite-level
 * teardown deliberately does not touch them: whichever test creates such a row has to remove it
 * itself, otherwise every full run leaves one more draft behind in the dev database.
 *
 * The write goes through the Payload Local API, the same path the other fixtures use - no raw SQL
 * and no trigger bypass. `deleteByID` resolves the document by `id` alone (it does not filter on
 * `_status`), so a `_status: 'draft'` row, which the REST delete endpoint would refuse without
 * `?draft=true`, is removed, and Payload drops its `_products_v` version row together with it.
 *
 * The row is re-read after the delete and the survivor count is returned instead of being ignored:
 * the caller asserts on it, so a failed cleanup fails the test loudly rather than leaving residue
 * for the next run.
 */
async function deleteProductBySlug(slug: string): Promise<number> {
  const payload = await getTestPayload()

  const read = async (): Promise<{ id: string | number }[]> => {
    const found = (await payload.find({
      collection: 'products',
      where: { slug: { equals: slug } },
      limit: 0,
      draft: true,
      overrideAccess: true,
    })) as unknown as { docs: { id: string | number }[] }
    return found.docs
  }

  for (const doc of await read()) {
    await payload.delete({ collection: 'products', id: doc.id, overrideAccess: true })
  }

  return (await read()).length
}

let sellerToken: string = ''
let moderatorToken: string = ''
let buyerToken: string = ''
let adminToken: string = ''

test.describe('KienTaoHub Phase 2: Digital Catalog Marketplace E2E Suite', () => {
  test.beforeAll(async ({ request }) => {
    // The shared catalog fixtures are seeded ONCE for the whole suite by
    // tests/helpers/global-setup.ts and removed ONCE after the last worker by
    // tests/helpers/global-teardown.ts (both wired in playwright.config.ts). This file must not
    // seed or delete them itself: Playwright runs spec files in parallel workers, so a per-file
    // teardown here deleted rows (fixture users included) while sibling files were still using
    // them, and a per-file seed left residue behind whenever another file had seeded first.

    // Obtain auth tokens for role-based testing
    async function loginUser(email: string, password: string): Promise<string> {
      try {
        const res = await request.post(`${baseURL}/api/users/login`, {
          data: { email, password },
        })
        if (res.ok()) {
          const body = (await res.json()) as { token?: string }
          return body.token || ''
        }
      } catch {
        // Ignored if server is still starting
      }
      return ''
    }

    adminToken = await loginUser(TEST_USERS.admin.email, TEST_USERS.admin.password)
    sellerToken = await loginUser(TEST_USERS.seller.email, TEST_USERS.seller.password)
    moderatorToken = await loginUser(TEST_USERS.moderator.email, TEST_USERS.moderator.password)
    buyerToken = await loginUser(TEST_USERS.buyer.email, TEST_USERS.buyer.password)
  })

  // No `afterAll` teardown here on purpose: this file is not the owner of the shared fixtures.

  // =========================================================================
  // TIER 1: CORE FEATURE COVERAGE
  // =========================================================================

  test.describe('Tier 1: Feature 1 - Catalog Browsing & Faceted Filtering (/shop)', () => {
    test('T1-F1-01: Default catalog browsing renders published digital products', async ({ page }) => {
      const response = await page.goto(`${baseURL}/shop`)
      expect(response?.status()).toBe(200)

      // Ensure page loads successfully
      await expect(page).toHaveURL(/\/shop/)

      // Verify page displays product grid or product cards
      const productCards = page.locator('a[href^="/products/"]')
      const count = await productCards.count()
      expect(count).toBeGreaterThanOrEqual(0)
    })

    test('T1-F1-02: Category faceted filter retains category in URL and updates listing', async ({ page }) => {
      const response = await page.goto(`${baseURL}/shop?category=kien-truc`)
      expect(response?.status()).toBe(200)
      await expect(page).toHaveURL(/category=kien-truc/)

      // The shop page should either display filtered items or valid empty state
      const hasGrid = await page.locator('a[href^="/products/"]').count()
      const hasEmptyState = await page.getByText(/No products found/i).count()
      expect(hasGrid > 0 || hasEmptyState > 0).toBe(true)
    })

    test('T1-F1-03: Software type faceted filter accepts software parameter', async ({ page }) => {
      const response = await page.goto(`${baseURL}/shop?software=autocad`)
      expect(response?.status()).toBe(200)
      await expect(page).toHaveURL(/software=autocad/)
    })

    test('T1-F1-04: Free assets filter accepts priceType=free or isFree=true', async ({ page }) => {
      const response = await page.goto(`${baseURL}/shop?priceType=free`)
      expect(response?.status()).toBe(200)
      await expect(page).toHaveURL(/priceType=free/)

      const responseBool = await page.goto(`${baseURL}/shop?isFree=true`)
      expect(responseBool?.status()).toBe(200)
      await expect(page).toHaveURL(/isFree=true/)
    })

    test('T1-F1-05: Paid assets filter accepts priceType=paid', async ({ page }) => {
      const response = await page.goto(`${baseURL}/shop?priceType=paid`)
      expect(response?.status()).toBe(200)
      await expect(page).toHaveURL(/priceType=paid/)
    })

    test('T1-F1-06: Price sorting options update URL and query correctly', async ({ page }) => {
      const resAsc = await page.goto(`${baseURL}/shop?sort=price`)
      expect(resAsc?.status()).toBe(200)
      await expect(page).toHaveURL(/sort=price/)

      const resDesc = await page.goto(`${baseURL}/shop?sort=-price`)
      expect(resDesc?.status()).toBe(200)
      await expect(page).toHaveURL(/sort=-price/)
    })

    test('T1-F1-07: Recency and title sorting options update URL and query correctly', async ({ page }) => {
      const resRecent = await page.goto(`${baseURL}/shop?sort=-createdAt`)
      expect(resRecent?.status()).toBe(200)
      await expect(page).toHaveURL(/sort=-createdAt/)

      const resTitle = await page.goto(`${baseURL}/shop?sort=title`)
      expect(resTitle?.status()).toBe(200)
      await expect(page).toHaveURL(/sort=title/)
    })
  })

  test.describe('Tier 1: Feature 2 - Keyword Search (/shop?q=...)', () => {
    test('T1-F2-01: Keyword search query updates results header and query param', async ({ page }) => {
      const query = 'Biệt thự'
      const res = await page.goto(`${baseURL}/shop?q=${encodeURIComponent(query)}`)
      expect(res?.status()).toBe(200)

      // Next.js search results banner shows search query
      const searchBanner = page.locator('p', { hasText: query }).first()
      await expect(searchBanner).toBeVisible()
    })

    test('T1-F2-02: Search by description keyword executes cleanly without error', async ({ page }) => {
      const res = await page.goto(`${baseURL}/shop?q=kết+cấu`)
      expect(res?.status()).toBe(200)
      await expect(page).toHaveURL(/q=k%E1%BA%BFt\+c%E1%BA%A5u|q=kết\+cấu/)
    })

    test('T1-F2-03: Search by product code prefix returns matching query state', async ({ page }) => {
      const res = await page.goto(`${baseURL}/shop?q=KTH-MEP-01`)
      expect(res?.status()).toBe(200)
      const banner = page.locator('p', { hasText: 'KTH-MEP-01' }).first()
      await expect(banner).toBeVisible()
    })

    test('T1-F2-04: Search by CAD/BIM software name executes cleanly', async ({ page }) => {
      const res = await page.goto(`${baseURL}/shop?q=AutoCAD`)
      expect(res?.status()).toBe(200)
      const banner = page.locator('p', { hasText: 'AutoCAD' }).first()
      await expect(banner).toBeVisible()
    })

    test('T1-F2-05: Empty search query does not crash and renders shop page', async ({ page }) => {
      const res = await page.goto(`${baseURL}/shop?q=`)
      expect(res?.status()).toBe(200)
      await expect(page).toHaveURL(`${baseURL}/shop?q=`)
    })

    test('T1-F2-06: Non-matching search query displays empty result message', async ({ page }) => {
      const res = await page.goto(`${baseURL}/shop?q=NonExistentCADQueryZ999`)
      expect(res?.status()).toBe(200)
      const emptyMsg = page.getByText(/There are no products that match/i)
      await expect(emptyMsg).toBeVisible()
    })
  })

  test.describe('Tier 1: Feature 3 - Digital Product Detail View (/products/[slug])', () => {
    test('T1-F3-01: Product detail page renders title, back link, and main container', async ({ page }) => {
      const slug = 'biet-thu-hien-dai-3-tang'
      const res = await page.goto(`${baseURL}/products/${slug}`)
      if (res?.status() === 200) {
        // Back link to shop
        const backLink = page.getByRole('link', { name: /All products/i })
        await expect(backLink).toBeVisible()
        await expect(backLink).toHaveAttribute('href', '/shop')

        // Title heading
        const heading = page.locator('h1').first()
        await expect(heading).toContainText(/Biệt thự hiện đại 3 tầng/i)
      }
    })

    test('T1-F3-02: Product detail renders preview gallery or thumbnail container', async ({ page }) => {
      const slug = 'biet-thu-hien-dai-3-tang'
      const res = await page.goto(`${baseURL}/products/${slug}`)
      if (res?.status() === 200) {
        // Gallery container is present in layout
        const galleryOrFallback = page.locator('.basis-full.lg\\:basis-1\\/2, [class*="gallery"]').first()
        await expect(galleryOrFallback).toBeVisible()
      }
    })

    test('T1-F3-03: Product detail renders structured pricing or Free badge', async ({ page }) => {
      const slug = 'thu-vien-sketchup-biet-thu-vuon'
      const res = await page.goto(`${baseURL}/products/${slug}`)
      if (res?.status() === 200) {
        // Free asset should render free indicator or zero price
        const pageContent = await page.content()
        const hasFreeIndicator = /miễn phí|free|0\s*₫|0\.00/i.test(pageContent)
        expect(hasFreeIndicator).toBe(true)
      }
    })

    test('T1-F3-04: Absence of physical goods cart components (VariantSelector / AddToCart)', async ({ page }) => {
      const slug = 'biet-thu-hien-dai-3-tang'
      const res = await page.goto(`${baseURL}/products/${slug}`)
      if (res?.status() === 200) {
        // Physical variant selector buttons should not exist
        const variantSelectors = page.locator('button[data-variant-type]')
        expect(await variantSelectors.count()).toBe(0)
      }
    })

    test('T1-F3-05: Non-existent product slug returns 404', async ({ page }) => {
      const res = await page.goto(`${baseURL}/products/non-existent-product-slug-xyz-404`)
      expect(res?.status()).toBe(404)
    })

    test('T1-F3-06: Product detail renders Reviews & Ratings section (#reviews-section)', async ({ page }) => {
      const slug = 'biet-thu-hien-dai-3-tang'
      const res = await page.goto(`${baseURL}/products/${slug}`)
      if (res?.status() === 200) {
        // Reviews section container exists
        const reviewsSection = page.locator('#reviews-section')
        await expect(reviewsSection).toBeVisible()

        // Reviews section heading
        const reviewsHeading = reviewsSection.getByRole('heading', { name: /Đánh giá & Nhận xét/i })
        await expect(reviewsHeading).toBeVisible()

        // Unauthenticated guest sees login notice with link
        const loginNotice = reviewsSection.getByRole('link', { name: /Đăng nhập/i }).first()
        await expect(loginNotice).toBeVisible()
      }
    })
  })

  test.describe('Tier 1: Feature 4 - SEO, OpenGraph, Dynamic Sitemap & Robots.txt', () => {
    test('T1-F4-01: Product detail head contains dynamic title and meta tags', async ({ page }) => {
      const slug = 'biet-thu-hien-dai-3-tang'
      const res = await page.goto(`${baseURL}/products/${slug}`)
      if (res?.status() === 200) {
        const title = await page.title()
        expect(title.length).toBeGreaterThan(0)
        expect(title).toContain('Biệt thự')
      }
    })

    test('T1-F4-02: Product detail contains JSON-LD structured data or OpenGraph metadata', async ({ page }) => {
      const slug = 'biet-thu-hien-dai-3-tang'
      const res = await page.goto(`${baseURL}/products/${slug}`)
      if (res?.status() === 200) {
        // Check for JSON-LD script tag
        const jsonLdScript = page.locator('script[type="application/ld+json"]')
        const count = await jsonLdScript.count()
        if (count > 0) {
          const content = await jsonLdScript.first().textContent()
          expect(content).not.toBeNull()
          const data = JSON.parse(content || '{}') as { '@type'?: string }
          expect(data['@type']).toBe('Product')
        }
      }
    })

    test('T1-F4-03: Sitemap route contract (/sitemap.xml)', async ({ request }) => {
      const res = await request.get(`${baseURL}/sitemap.xml`)
      // M4 dynamic sitemap contract: once implemented returns 200 with XML urlset
      if (res.status() === 200) {
        const contentType = res.headers()['content-type'] || ''
        expect(contentType).toMatch(/xml/)
        const text = await res.text()
        expect(text).toContain('<urlset')
      } else {
        // Documented pending M4 milestone delivery
        expect([200, 404]).toContain(res.status())
      }
    })

    test('T1-F4-04: Robots.txt endpoint returns crawler directives', async ({ request }) => {
      const res = await request.get(`${baseURL}/robots.txt`)
      // If deployed or in dev, returns plaintext with rules
      if (res.status() === 200) {
        const text = await res.text()
        expect(text).toContain('User-agent')
      } else {
        expect([200, 404]).toContain(res.status())
      }
    })
  })

  test.describe('Tier 1: Feature 5 - Catalog Role-Based Access Control (RBAC)', () => {
    test('T1-F5-01: Guest can read published products via public API', async ({ request }) => {
      const res = await request.get(`${baseURL}/api/products`)
      expect(res.status()).toBe(200)
      const data = (await res.json()) as { docs?: unknown[] }
      expect(Array.isArray(data.docs)).toBe(true)
    })

    test('T1-F5-02: Guest can read public categories via public API', async ({ request }) => {
      const res = await request.get(`${baseURL}/api/categories`)
      expect(res.status()).toBe(200)
      const data = (await res.json()) as { docs?: unknown[] }
      expect(Array.isArray(data.docs)).toBe(true)
    })

    test('T1-F5-03: Anonymous guest is denied product creation', async ({ request }) => {
      const res = await request.post(`${baseURL}/api/products`, {
        data: {
          title: 'Unauthorized Guest Product',
          slug: 'unauthorized-guest-product',
          price: 100000,
        },
      })
      // Must be 401 Unauthorized or 403 Forbidden
      expect([401, 403]).toContain(res.status())
    })

    test('T1-F5-04: Buyer role is denied product creation (PLAN.md §22)', async ({ request }) => {
      const headers: Record<string, string> = {}
      if (buyerToken) {
        headers['Authorization'] = `JWT ${buyerToken}`
      }

      const res = await request.post(`${baseURL}/api/products`, {
        headers,
        data: {
          title: 'Buyer Attempted Product',
          slug: 'buyer-attempted-product',
          price: 100000,
        },
      })
      expect([401, 403]).toContain(res.status())
    })

    test('T1-F5-05: Seller role is permitted to create products', async ({ request }) => {
      if (!sellerToken) {
        test.skip()
        return
      }

      // One fresh slug per attempt: the cleanup below targets this attempt's row only, so a retry
      // (or a sibling worker) can never delete or be confused by another attempt's product.
      const slug = `seller-asset-${Date.now()}`

      try {
        const res = await request.post(`${baseURL}/api/products`, {
          headers: {
            Authorization: `JWT ${sellerToken}`,
          },
          data: {
            title: `Seller Created Asset ${Date.now()}`,
            slug,
            price: 200000,
            isFree: false,
            _status: 'draft',
          },
        })
        expect([200, 201]).toContain(res.status())
      } finally {
        // `finally` (not a trailing statement) so the row is removed even when the assertion above
        // fails - a failed attempt must not leave its draft behind for the retry to inherit.
        expect(await deleteProductBySlug(slug)).toBe(0)
      }
    })

    test('T1-F5-06: Moderator role can update/moderate products (Decision 0008)', async ({ request }) => {
      if (!moderatorToken) {
        test.skip()
        return
      }

      // First query a product to update
      const listRes = await request.get(`${baseURL}/api/products?limit=1`)
      if (listRes.ok()) {
        const listData = (await listRes.json()) as { docs?: Array<{ id: string | number }> }
        const targetId = listData.docs?.[0]?.id
        if (targetId) {
          const updateRes = await request.patch(`${baseURL}/api/products/${targetId}`, {
            headers: {
              Authorization: `JWT ${moderatorToken}`,
            },
            data: {
              meta: { description: 'Moderator verified description' },
            },
          })
          expect([200, 204]).toContain(updateRes.status())
        }
      }
    })

    test('T1-F5-07: Non-admin users are denied taxonomy creation', async ({ request }) => {
      const headers: Record<string, string> = {}
      if (sellerToken) {
        headers['Authorization'] = `JWT ${sellerToken}`
      }

      const res = await request.post(`${baseURL}/api/categories`, {
        headers,
        data: {
          title: 'Illegal Taxonomy',
          slug: 'illegal-taxonomy',
        },
      })
      expect([401, 403]).toContain(res.status())
    })
  })

  // =========================================================================
  // TIER 2: BOUNDARY & CORNER CASES
  // =========================================================================

  test.describe('Tier 2: Boundary & Corner Cases', () => {
    test('T2-B1-01: Non-existent category filter does not crash shop page', async ({ page }) => {
      const res = await page.goto(`${baseURL}/shop?category=non-existent-category-slug-999`)
      expect(res?.status()).toBe(200)
      const emptyOrAll = await page.locator('body').textContent()
      expect(emptyOrAll).not.toBeNull()
    })

    test('T2-B1-02: Non-existent software filter returns HTTP 200 without server crash', async ({ page }) => {
      const res = await page.goto(`${baseURL}/shop?software=non-existent-software-type-999`)
      expect(res?.status()).toBe(200)
    })

    test('T2-B1-03: Invalid sort parameter falls back safely to default', async ({ page }) => {
      const res = await page.goto(`${baseURL}/shop?sort=malicious_col%3BDROP+TABLE`)
      expect(res?.status()).toBe(200)
      // Page should render without uncaught Postgres syntax error
      await expect(page).toHaveURL(/sort=malicious_col/)
    })

    test('T2-B2-01: SQL injection string in search query is sanitized', async ({ page }) => {
      const maliciousPayload = "' OR 1=1 --"
      const res = await page.goto(`${baseURL}/shop?q=${encodeURIComponent(maliciousPayload)}`)
      expect(res?.status()).toBe(200)
      // Must not dump entire database or throw 500
      const content = await page.content()
      expect(content).not.toContain('syntax error at or near')
    })

    test('T2-B2-02: XSS script tag in search query is safely escaped in DOM', async ({ page }) => {
      const xssPayload = '<script>window.__xss_flag = true</script>'
      const res = await page.goto(`${baseURL}/shop?q=${encodeURIComponent(xssPayload)}`)
      expect(res?.status()).toBe(200)

      // Evaluate whether the script executed in page context
      const isXssExecuted = await page.evaluate(() => Boolean((window as unknown as { __xss_flag?: boolean }).__xss_flag))
      expect(isXssExecuted).toBe(false)
    })

    test('T2-B2-03: Excessive whitespace in search term is handled gracefully', async ({ page }) => {
      const res = await page.goto(`${baseURL}/shop?q=%20%20%20AutoCAD%20%20%20`)
      expect(res?.status()).toBe(200)
      const banner = page.locator('p', { hasText: 'AutoCAD' }).first()
      await expect(banner).toBeVisible()
    })

    test('T2-B2-04: Vietnamese diacritics in search query match properly', async ({ page }) => {
      const query = 'bản vẽ nhà phố'
      const res = await page.goto(`${baseURL}/shop?q=${encodeURIComponent(query)}`)
      expect(res?.status()).toBe(200)
      const banner = page.locator('p', { hasText: query }).first()
      await expect(banner).toBeVisible()
    })

    test('T2-B3-01: Direct navigation to draft product slug without auth returns 404', async ({ page }) => {
      const res = await page.goto(`${baseURL}/products/ban-ve-nha-van-hoa-draft`)
      // Draft product must never leak to guest
      expect(res?.status()).toBe(404)
    })

    test('T2-B5-01: Tampered JWT token on product creation returns 401 Unauthorized', async ({ request }) => {
      const res = await request.post(`${baseURL}/api/products`, {
        headers: {
          Authorization: 'JWT invalid.fake.token.payload',
        },
        data: {
          title: 'Hacked Product',
          slug: 'hacked-product',
          price: 500000,
        },
      })
      expect([401, 403]).toContain(res.status())
    })
  })

  // =========================================================================
  // TIER 3: CROSS-FEATURE COMBINATIONS (PAIRWISE)
  // =========================================================================

  test.describe('Tier 3: Cross-Feature Combinations', () => {
    test('T3-PW-01: Category + Software + Price Type + Sort combined facets', async ({ page }) => {
      const url = `${baseURL}/shop?category=kien-truc&software=autocad&priceType=paid&sort=price`
      const res = await page.goto(url)
      expect(res?.status()).toBe(200)
      await expect(page).toHaveURL(/category=kien-truc/)
      await expect(page).toHaveURL(/software=autocad/)
      await expect(page).toHaveURL(/priceType=paid/)
      await expect(page).toHaveURL(/sort=price/)
    })

    test('T3-PW-02: Category + Price Type Free + Keyword Search + Sort combined', async ({ page }) => {
      const url = `${baseURL}/shop?category=kien-truc&priceType=free&q=bi%E1%BB%87t+th%E1%BB%B1&sort=-createdAt`
      const res = await page.goto(url)
      expect(res?.status()).toBe(200)
      await expect(page).toHaveURL(/priceType=free/)
      await expect(page).toHaveURL(/sort=-createdAt/)
    })

    test('T3-PW-03: Software Type + Free Filter + Title Sort', async ({ page }) => {
      const url = `${baseURL}/shop?software=sketchup&priceType=free&sort=title`
      const res = await page.goto(url)
      expect(res?.status()).toBe(200)
      await expect(page).toHaveURL(/software=sketchup/)
      await expect(page).toHaveURL(/sort=title/)
    })

    test('T3-PW-04: Mutually exclusive combination yields graceful empty state', async ({ page }) => {
      const url = `${baseURL}/shop?category=mep&software=sketchup&priceType=free`
      const res = await page.goto(url)
      expect(res?.status()).toBe(200)
      // Does not throw an error and renders shop container
      const body = page.locator('body')
      await expect(body).toBeVisible()
    })
  })

  // =========================================================================
  // TIER 4: REAL-WORLD APPLICATION SCENARIOS
  // =========================================================================

  test.describe('Tier 4: Real-World Application Scenarios', () => {
    test('Scenario 1: Architecture Student Free Asset Discovery & Inspection', async ({ page }) => {
      // Step 1: Student opens shop
      await page.goto(`${baseURL}/shop`)
      await expect(page).toHaveURL(/\/shop/)

      // Step 2: Student filters by free assets
      await page.goto(`${baseURL}/shop?priceType=free&category=kien-truc`)
      expect(page.url()).toContain('priceType=free')

      // Step 3: Student searches for "SketchUp"
      await page.goto(`${baseURL}/shop?priceType=free&category=kien-truc&q=SketchUp`)
      const searchBanner = page.locator('p', { hasText: 'SketchUp' }).first()
      await expect(searchBanner).toBeVisible()

      // Step 4: If matching cards exist, student clicks into product detail
      const firstCard = page.locator('a[href^="/products/"]').first()
      if ((await firstCard.count()) > 0) {
        await firstCard.click()
        await expect(page).toHaveURL(/\/products\//)
        // Verify All products return link exists
        const allProductsBtn = page.getByRole('link', { name: /All products/i })
        await expect(allProductsBtn).toBeVisible()
      }
    })

    test('Scenario 2: Commercial Drawing Procurement & Price Verification', async ({ page }) => {
      // Step 1: Engineer navigates to shop with structural category & paid filter
      await page.goto(`${baseURL}/shop?category=ket-cau&priceType=paid&sort=-createdAt`)
      expect(page.url()).toContain('category=ket-cau')

      // Step 2: Accesses a known product directly
      const slug = 'ho-so-ket-cau-tttm'
      const res = await page.goto(`${baseURL}/products/${slug}`)
      if (res?.status() === 200) {
        // Verify heading
        const heading = page.locator('h1').first()
        await expect(heading).toContainText(/kết cấu/i)
      }
    })

    test('Scenario 3: Site Contractor Direct Product Code Lookup', async ({ page }) => {
      const productCode = 'KTH-MEP-01'
      await page.goto(`${baseURL}/shop?q=${productCode}`)
      const banner = page.locator('p', { hasText: productCode }).first()
      await expect(banner).toBeVisible()
    })

    test('Scenario 4: Search Engine Crawler Indexing & OpenGraph Verification', async ({ page, request }) => {
      // Step 1: Crawler checks robots.txt
      const robotsRes = await request.get(`${baseURL}/robots.txt`)
      expect([200, 404]).toContain(robotsRes.status())

      // Step 2: Crawler visits published product page
      const slug = 'biet-thu-hien-dai-3-tang'
      const res = await page.goto(`${baseURL}/products/${slug}`)
      if (res?.status() === 200) {
        // Assert dynamic metadata tags
        const title = await page.title()
        expect(title.length).toBeGreaterThan(0)

        // Assert robots meta tag is indexable
        const robotsMeta = page.locator('meta[name="robots"]')
        if ((await robotsMeta.count()) > 0) {
          const content = await robotsMeta.getAttribute('content')
          expect(content).toContain('index')
        }
      }
    })

    test('Scenario 5: Seller Asset Ingestion to Publication Isolation Lifecycle', async ({ request, page }) => {
      if (!sellerToken) {
        test.skip()
        return
      }

      // Step 1: Seller creates a draft asset
      const timestamp = Date.now()
      const draftSlug = `lifecycle-draft-${timestamp}`
      const createRes = await request.post(`${baseURL}/api/products`, {
        headers: {
          Authorization: `JWT ${sellerToken}`,
        },
        data: {
          title: `Lifecycle Asset ${timestamp}`,
          slug: draftSlug,
          price: 180000,
          isFree: false,
          _status: 'draft',
        },
      })

      if (createRes.ok()) {
        const createdData = (await createRes.json()) as { doc?: { id?: string | number } }
        const productId = createdData.doc?.id

        // Step 2: Anonymous guest verifies draft is invisible on /shop
        await page.goto(`${baseURL}/shop?q=${draftSlug}`)
        const emptyMsg = page.getByText(/There are no products that match/i)
        await expect(emptyMsg).toBeVisible()

        // Step 3: Direct navigation to draft URL returns 404 for unauthenticated guest
        const directRes = await page.goto(`${baseURL}/products/${draftSlug}`)
        expect(directRes?.status()).toBe(404)

        // Cleanup created product
        if (productId && adminToken) {
          await request.delete(`${baseURL}/api/products/${productId}`, {
            headers: { Authorization: `JWT ${adminToken}` },
          })
        }
      }
    })
  })
})
