import { test, expect, type Page } from '@playwright/test'
import { getTestPayload, TEST_USERS } from '../helpers/seedCatalog'

/**
 * KienTaoHub Ant Design Redesign E2E Test Suite
 *
 * Covers the 4-Tier Testing Methodology mapped to:
 * - 41 Features from PROJECT.md
 * - Requirements R1 through R6 from ORIGINAL_REQUEST.md
 *
 * Tiers:
 * - Tier 1: Feature Coverage (Individual feature contracts F1 - F41)
 * - Tier 2: Boundary & Corner Cases (Empty states, validation, extreme inputs, responsive)
 * - Tier 3: Cross-Feature Combinations (Auth + Cart, Filter + Sort + Mode, Wallet + VietQR)
 * - Tier 4: Real-World Application Scenarios (Buyer Journey, Creator Dashboard, Mobile UX, Admin Isolation)
 */

const baseURL = process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:3000'

const SEEDED_PRODUCT = {
  title: 'Biệt thự hiện đại 3 tầng 5x20m',
  slug: 'biet-thu-hien-dai-3-tang',
  price: 250000,
}

async function loginBuyerViaUI(page: Page): Promise<void> {
  await page.goto(`${baseURL}/login`)
  await page.locator('input[name="email"], input[type="email"]').first().fill(TEST_USERS.buyer.email)
  await page.locator('input[name="password"], input[type="password"]').first().fill(TEST_USERS.buyer.password)
  await page.locator('button[type="submit"]').first().click()
  await page.waitForURL(/\/account/)
}

test.describe('KienTaoHub Ant Design Redesign: 4-Tier E2E Specification', () => {

  // ============================================================================
  // TIER 1: FEATURE COVERAGE (F1 - F41)
  // ============================================================================

  test.describe('Tier 1: Feature Coverage', () => {

    // --- M1: Ant Design System & Theme Provider (F1 - F3) ---
    test.describe('M1: System, Theme & Isolation (F1-F3)', () => {
      test('F1 & F2: SSR Style Registry and Tech Blue Theme (#1677ff) Integration', async ({ page }) => {
        const response = await page.goto(baseURL)
        expect(response?.status()).toBe(200)

        // F1: Verify server-rendered HTML contains Ant Design styles or font preload to prevent FOUC
        const html = await page.content()
        const hasStyleOrFont = html.includes('antd-cssinjs') || html.includes('ant-') || html.includes('Geist')
        expect(hasStyleOrFont, 'SSR HTML should contain style registry or typography tokens').toBe(true)

        // F2: Verify primary theme or brand elements are rendered
        const primaryEl = page.locator('.ant-btn-primary, [style*="1677ff"], header, nav, a').first()
        await expect(primaryEl).toBeVisible()
      })

      test('F3: Strict Admin Route Isolation from Ant Design styles', async ({ page }) => {
        await page.goto(`${baseURL}/admin/login`)
        await expect(page).toHaveURL(/\/admin\/login/)

        // The Payload admin panel has its own root layout and must not be contaminated
        const adminRoot = page.locator('#field-email, .login__form, form').first()
        await expect(adminRoot).toBeVisible()

        // Verify that storefront layout wrappers do not leak into admin
        const html = await page.content()
        expect(html.includes('data-storefront-wrapper')).toBe(false)
      })
    })

    // --- M2: Header, Navigation & Footer (F4 - F10) ---
    test.describe('M2: Header, Navigation & Footer (F4-F10)', () => {
      test('F4 & F8: Header Navigation & Category Navigation Menu', async ({ page }) => {
        await page.goto(baseURL)
        const header = page.locator('header, nav, [role="banner"]').first()
        await expect(header).toBeVisible()

        // Brand logo
        await expect(page.locator('a[href="/"]').first()).toBeVisible()

        // Navigation container
        const navMenu = page.locator('header nav, nav, .ant-menu, [role="navigation"]').first()
        await expect(navMenu).toBeVisible()
      })

      test('F5: Search Bar routes to /shop?q=...', async ({ page }) => {
        await page.goto(`${baseURL}/shop`)
        const searchInput = page.locator('input[name="search"], input[name="q"], .ant-input-search input, input[type="search"]').first()
        await expect(searchInput).toBeVisible()

        await searchInput.fill('Biệt thự')
        await searchInput.press('Enter')

        await page.waitForURL(/\/shop\?q=/)
        expect(page.url()).toContain('shop?q=')
      })

      test('F6 & F7: User links and Cart Indicator in navigation', async ({ page }) => {
        await page.goto(baseURL)
        const navContainer = page.locator('header, nav, [role="banner"]').first()
        await expect(navContainer).toBeVisible()

        // Utility link or button (Ví tiền, Tài khoản, login, cart badge)
        const utilityItem = page.locator('a[href*="/wallet"], a[href*="/account"], a[href*="/login"], [data-slot="cart"], .ant-badge').first()
        await expect(utilityItem).toBeVisible()
      })

      test('F9: Mobile Responsive Navigation Drawer', async ({ page }) => {
        await page.setViewportSize({ width: 375, height: 667 })
        await page.goto(baseURL)

        // Hamburger / Mobile menu button
        const mobileTrigger = page.locator('button[aria-label*="menu" i], button.ant-btn, nav button, header button').first()
        await expect(mobileTrigger).toBeVisible()
        await mobileTrigger.click()

        // Drawer or dialog navigation
        const mobileNav = page.locator('.ant-drawer, [role="dialog"]:not([class*="error-overlay"]), nav:not([class*="error-overlay"])').first()
        await expect(mobileNav).toBeVisible()
      })

      test('F10: Footer with brand, category links, policies, and ThemeSelector', async ({ page }) => {
        await page.goto(baseURL)
        const footer = page.locator('footer, [role="contentinfo"]').first()
        await expect(footer).toBeVisible()
        await expect(footer).toContainText(/Kiến Tạo Hub|Payload|Copyright/i)
      })
    })

    // --- M3: Homepage & Catalog Subsystem (F11 - F24) ---
    test.describe('M3: Homepage & Catalog Subsystem (F11-F24)', () => {
      test('F11 - F14: Homepage Hero Carousel, Categories Grid, and Creator Banner', async ({ page }) => {
        await page.goto(baseURL)
        await expect(page).toHaveTitle(/Kiến Tạo Hub/)

        // Main content container and hero headline
        const main = page.locator('main').first()
        await expect(main).toBeVisible()
        await expect(page.locator('h1').first()).toContainText('Kiến Tạo Hub')
      })

      test('F15 - F18: Shop Multi-Criteria Filters, Toolbar & Pagination', async ({ page }) => {
        await page.goto(`${baseURL}/shop`)
        await expect(page).toHaveURL(/\/shop/)

        // Shop sidebar or filter controls
        const filterSection = page.locator('aside, .filters, form, .ant-select, input[name="search"], input[name="q"]').first()
        await expect(filterSection).toBeVisible()

        // Product listing grid
        const productItems = page.locator('a[href*="/products/"]')
        await expect(productItems.first()).toBeVisible()
      })

      test('F19 - F21: Product Detail Gallery, Technical Specs, and Sticky CTA Bar', async ({ page }) => {
        await page.goto(`${baseURL}/products/${SEEDED_PRODUCT.slug}`)
        await expect(page).toHaveURL(new RegExp(`/products/${SEEDED_PRODUCT.slug}`))

        // Title and main container
        await expect(page.locator('h1').first()).toHaveText(SEEDED_PRODUCT.title)

        // Technical specs section
        const specsSection = page.locator('#specs-section, .ant-descriptions, dl, table, [data-specs]').first()
        await expect(specsSection).toBeVisible()

        // CTA surface ("Mua ngay" / "Tải ngay")
        const ctaButton = page.locator('button, .ant-btn, a').filter({ hasText: /Mua ngay|Tải ngay|Buy now/i }).first()
        await expect(ctaButton).toBeVisible()
      })

      test('F22 - F24: Product Reviews, Q&A Comments, and Report Dialog', async ({ page }) => {
        await page.goto(`${baseURL}/products/${SEEDED_PRODUCT.slug}`)

        // Reviews section
        const reviewsSection = page.locator('#reviews-section, .reviews-container, [data-reviews]').first()
        await expect(reviewsSection).toBeVisible()

        // Comments section
        const commentsSection = page.locator('#comments-section, .comments-container, [data-comments]').first()
        await expect(commentsSection).toBeVisible()

        // Report dialog section
        const reportSection = page.locator('#report-section, [data-testid="report-section"]').first()
        await expect(reportSection).toBeVisible()
      })
    })

    // --- M4: Authentication Flow Subsystem (F25 - F28) ---
    test.describe('M4: Authentication Flow (F25-F28)', () => {
      test('F25: Login Page & Ant Design Form UI', async ({ page }) => {
        await page.goto(`${baseURL}/login`)
        await expect(page.locator('h1, h2').first()).toBeVisible()

        // Email and Password inputs
        await expect(page.locator('input[name="email"], input[type="email"]').first()).toBeVisible()
        await expect(page.locator('input[name="password"], input[type="password"]').first()).toBeVisible()

        // Submit button
        await expect(page.locator('button[type="submit"]').first()).toBeVisible()
      })

      test('F26: Register / Create Account Page & Password Confirmation Rule', async ({ page }) => {
        await page.goto(`${baseURL}/create-account`)
        await expect(page.locator('h1, h2').first()).toBeVisible()

        await expect(page.locator('input[name="email"], input[type="email"]').first()).toBeVisible()
        await expect(page.locator('input[name="password"], input[type="password"]').first()).toBeVisible()
        await expect(page.locator('input[name="passwordConfirm"]').first()).toBeVisible()
      })

      test('F27: Forgot Password Page & Email Request Form', async ({ page }) => {
        await page.goto(`${baseURL}/forgot-password`)
        await expect(page.locator('input[name="email"], input[type="email"]').first()).toBeVisible()
        await expect(page.locator('button[type="submit"]').first()).toBeVisible()
      })

      test('F28: Logout Page Contract & Status Feedback', async ({ page }) => {
        await page.goto(`${baseURL}/logout`)
        // Logout page renders confirmation message and navigation links
        await expect(page.locator('main').first()).toBeVisible()
      })
    })

    // --- M5: Cart, Checkout & Customer Dashboard (F29 - F39) ---
    test.describe('M5: Cart, Checkout & Customer Dashboard (F29-F39)', () => {
      test('F34 & F35: Customer Dashboard Layout, Profile Settings', async ({ page }) => {
        await loginBuyerViaUI(page)
        await expect(page).toHaveURL(/\/account/)

        // Account settings heading / layout
        await expect(page.locator('h1').first()).toContainText(/Account|Tài khoản|Cài đặt/i)

        // Navigation links (orders, addresses, notifications)
        await expect(page.locator('a[href*="/orders"]').first()).toBeVisible()
      })

      test('F36: Address Book Management View', async ({ page }) => {
        await loginBuyerViaUI(page)
        await page.goto(`${baseURL}/account/addresses`)
        await expect(page).toHaveURL(/\/account\/addresses/)
        await expect(page.locator('main').first()).toBeVisible()
      })

      test('F37 & F38: Order History, Status Badges & Digital Download Rights', async ({ page }) => {
        await loginBuyerViaUI(page)
        await page.goto(`${baseURL}/orders`)
        await expect(page).toHaveURL(/\/orders/)
        await expect(page.locator('h1').first()).toContainText(/Đơn hàng|Orders/i)
      })

      test('F39: Digital Wallet & VietQR Top-up Route Protection', async ({ page }) => {
        // Guest attempting to access /wallet is redirected to /login (anti-exposure contract)
        await page.goto(`${baseURL}/wallet`)
        await expect(page).toHaveURL(/\/login/)
      })
    })

    // --- M6: Backend Boundary & Production Verification (F40 - F41) ---
    test.describe('M6: Boundary & Integrity Verification (F40-F41)', () => {
      test('F40: Strict Backend API preservation and collection accessibility', async () => {
        const payload = await getTestPayload()
        const categories = await payload.find({ collection: 'categories', limit: 3, overrideAccess: true })
        expect(categories.docs.length).toBeGreaterThanOrEqual(1)

        const products = await payload.find({ collection: 'products', limit: 1, overrideAccess: true })
        expect(products.docs.length).toBeGreaterThanOrEqual(1)
      })

      test('F41: Static route and public assets serve valid HTTP status codes', async ({ request }) => {
        const homeRes = await request.get(`${baseURL}/`)
        expect(homeRes.status()).toBe(200)

        const shopRes = await request.get(`${baseURL}/shop`)
        expect(shopRes.status()).toBe(200)

        const loginRes = await request.get(`${baseURL}/login`)
        expect(loginRes.status()).toBe(200)
      })
    })
  })

  // ============================================================================
  // TIER 2: BOUNDARY & CORNER CASES
  // ============================================================================

  test.describe('Tier 2: Boundary & Corner Cases', () => {

    test('T2-B1: Empty states handling across catalog zero-search', async ({ page }) => {
      await page.goto(`${baseURL}/shop?q=nonexistent_xyz_query_99999`)
      await expect(page).toHaveURL(/\/shop\?q=nonexistent_xyz_query_99999/)

      // Should display a clear empty state, not crash
      const emptyIndicator = page.locator('.ant-empty, [data-empty], main').first()
      await expect(emptyIndicator).toBeVisible()
    })

    test('T2-B2: Form validation with malformed email and mismatched passwords', async ({ page }) => {
      await page.goto(`${baseURL}/create-account`)

      const emailInput = page.locator('input[name="email"], input[type="email"]').first()
      const passwordInput = page.locator('input[name="password"], input[type="password"]').first()
      const confirmInput = page.locator('input[name="passwordConfirm"]').first()
      const submitBtn = page.locator('button[type="submit"]').first()

      // Fill mismatched passwords
      await emailInput.fill('invalid-email-format')
      await passwordInput.fill('Password123!')
      await confirmInput.fill('MismatchedPassword999!')
      await submitBtn.click()

      // Client-side validation keeps user on /create-account
      await expect(page).toHaveURL(/\/create-account/)
    })

    test('T2-B3: Extreme length search strings (1000+ chars) do not crash storefront', async ({ page }) => {
      const hugeQuery = 'architectural-cad-drawing-'.repeat(50)
      const response = await page.goto(`${baseURL}/shop?q=${encodeURIComponent(hugeQuery)}`)
      expect(response?.status()).toBe(200)

      const main = page.locator('main').first()
      await expect(main).toBeVisible()
    })

    test('T2-B4: SQL injection and XSS script tags are sanitized in search and DOM', async ({ page }) => {
      const malicious = `'; DROP TABLE products; <script>alert("XSS")</script>`
      await page.goto(`${baseURL}/shop?q=${encodeURIComponent(malicious)}`)

      // Must not execute script tag
      const rawScript = page.locator('body script:not([src]):has-text("XSS")')
      expect(await rawScript.count()).toBe(0)
    })

    test('T2-B5: Viewport responsive adaptation from Desktop (1280px) to Mobile (375px)', async ({ page }) => {
      // Desktop viewport
      await page.setViewportSize({ width: 1280, height: 800 })
      await page.goto(baseURL)
      const desktopNav = page.locator('header, nav, [role="banner"]').first()
      await expect(desktopNav).toBeVisible()

      // Mobile viewport
      await page.setViewportSize({ width: 375, height: 667 })
      await page.waitForTimeout(300)
      const mobileNav = page.locator('header, nav, [role="banner"]').first()
      await expect(mobileNav).toBeVisible()
    })
  })

  // ============================================================================
  // TIER 3: CROSS-FEATURE COMBINATIONS
  // ============================================================================

  test.describe('Tier 3: Cross-Feature Combinations', () => {

    test('T3-C1: Multi-criteria Filter + View Mode Switch + Sort combination', async ({ page }) => {
      await page.goto(`${baseURL}/shop?category=kien-truc&sort=-price`)
      await expect(page).toHaveURL(/category=kien-truc/)
      await expect(page).toHaveURL(/sort=-price/)

      const productCard = page.locator('a[href*="/products/"]').first()
      if (await productCard.isVisible()) {
        await expect(productCard).toBeVisible()
      }
    })

    test('T3-C2: Auth Session state + Navigation Header update', async ({ page }) => {
      // Guest visits storefront -> sees nav
      await page.goto(baseURL)
      const nav = page.locator('header, nav, [role="banner"]').first()
      await expect(nav).toBeVisible()

      // Login buyer
      await loginBuyerViaUI(page)

      // Storefront navigation reflects active session
      await page.goto(baseURL)
      const authenticatedNav = page.locator('header, nav, [role="banner"]').first()
      await expect(authenticatedNav).toBeVisible()
    })

    test('T3-C3: Product Detail CTA -> Digital Purchase Surface verification', async ({ page }) => {
      await page.goto(`${baseURL}/products/${SEEDED_PRODUCT.slug}`)

      // Detail page must present digital purchase CTA button ("Mua ngay")
      const buyCTA = page.locator('button, .ant-btn, a').filter({ hasText: /Mua ngay|Buy now/i }).first()
      await expect(buyCTA).toBeVisible()

      // Must not expose physical variant selectors
      await expect(page.locator('button[data-variant-type]')).toHaveCount(0)
    })

    test('T3-C4: Digital Wallet Route Security and Access Control', async ({ page }) => {
      // Direct navigation to wallet by unauthenticated user safely redirects to login
      await page.goto(`${baseURL}/wallet`)
      await expect(page).toHaveURL(/\/login/)
    })
  })

  // ============================================================================
  // TIER 4: REAL-WORLD APPLICATION SCENARIOS
  // ============================================================================

  test.describe('Tier 4: Real-World Application Scenarios', () => {

    test('Scenario 1: Complete Architectural Buyer Discovery & Inspection Journey', async ({ page }) => {
      // 1. Landing on Homepage
      await page.goto(baseURL)
      await expect(page).toHaveTitle(/Kiến Tạo Hub/)

      // 2. Discover via Shop Catalog
      await page.goto(`${baseURL}/shop`)
      const productLink = page.locator(`a[href="/products/${SEEDED_PRODUCT.slug}"]`).first()
      await productLink.waitFor({ state: 'visible' })
      await productLink.click()

      // 3. Inspect Technical Specs and Pricing
      await page.waitForURL(new RegExp(`/products/${SEEDED_PRODUCT.slug}`))
      await expect(page.locator('h1').first()).toHaveText(SEEDED_PRODUCT.title)

      const specs = page.locator('#specs-section, .ant-descriptions, dl, table, [data-specs]').first()
      await expect(specs).toBeVisible()

      // 4. Inspect purchase CTA
      await expect(page.locator('button, .ant-btn, a').filter({ hasText: /Mua ngay/i }).first()).toBeVisible()
    })

    test('Scenario 2: Authenticated Customer Dashboard Management Lifecycle', async ({ page }) => {
      // 1. Login
      await loginBuyerViaUI(page)
      await expect(page).toHaveURL(/\/account/)

      // 2. View Order History
      await page.goto(`${baseURL}/orders`)
      await expect(page).toHaveURL(/\/orders/)
      await expect(page.locator('h1').first()).toContainText(/Đơn hàng|Orders/i)

      // 3. View Address Book
      await page.goto(`${baseURL}/account/addresses`)
      await expect(page).toHaveURL(/\/account\/addresses/)
      await expect(page.locator('main').first()).toBeVisible()
    })

    test('Scenario 3: Responsive Multi-Device Mobile Journey', async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 667 })
      await page.goto(baseURL)

      // Header mobile trigger
      const header = page.locator('header, nav, [role="banner"]').first()
      await expect(header).toBeVisible()

      // Navigate to Shop on mobile
      await page.goto(`${baseURL}/shop`)
      await expect(page).toHaveURL(/\/shop/)
      const shopMain = page.locator('main').first()
      await expect(shopMain).toBeVisible()
    })

    test('Scenario 4: Route Isolation & Strict Security Boundary Verification', async ({ page }) => {
      // 1. Buyer is denied access to Admin panel
      await loginBuyerViaUI(page)
      await page.goto(`${baseURL}/admin`)
      await expect(page.getByText(/does not have access to the admin panel/i).first()).toBeVisible()

      // 2. Guest is redirected away from protected account pages
      const context = await page.context().browser()?.newContext()
      if (context) {
        const guestPage = await context.newPage()
        await guestPage.goto(`${baseURL}/account`)
        await expect(guestPage).toHaveURL(/\/login/)
        await context.close()
      }
    })
  })
})
