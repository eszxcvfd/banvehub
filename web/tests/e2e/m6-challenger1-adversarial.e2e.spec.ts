import { test, expect } from '@playwright/test'

/**
 * Challenger 1 Adversarial Edge-Case Suite for Milestone 6
 *
 * Specific empirical challenges:
 * 1. Empty search input, extreme query strings (length, unicode, SQLi, XSS, URL encoding).
 * 2. Viewport responsiveness: Mobile (375px, 390px) vs Desktop (1280px), layout overflow, drawer.
 * 3. Route isolation: access /admin and /admin/login and assert zero Ant Design style tags / classes.
 */

const baseURL = process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:3000'

test.describe('Challenger 1 Adversarial Suite (Milestone 6)', () => {

  // =========================================================================
  // 1. SEARCH INPUT & EXTREME QUERY STRINGS
  // =========================================================================
  test.describe('Search Edge Cases & Extreme Inputs', () => {

    test('Edge 1.1: Empty search input submission does not break storefront', async ({ page }) => {
      // Direct navigation with empty query
      const res1 = await page.goto(`${baseURL}/shop?q=`)
      expect(res1?.status()).toBe(200)
      await expect(page.locator('main').first()).toBeVisible()

      // Header search input with empty submit
      await page.goto(`${baseURL}/shop`)
      const searchInput = page.locator('input[name="search"], input[name="q"], .ant-input-search input, input[type="search"]').first()
      if (await searchInput.isVisible()) {
        await searchInput.fill('')
        await searchInput.press('Enter')
        await page.waitForTimeout(500)
        expect(page.url()).toMatch(/\/shop(\?q=)?$/)
        await expect(page.locator('main').first()).toBeVisible()
      }
    })

    test('Edge 1.2: Whitespace-only search input handles gracefully', async ({ page }) => {
      const res = await page.goto(`${baseURL}/shop?q=%20%20%20%20`)
      expect(res?.status()).toBe(200)
      await expect(page.locator('main').first()).toBeVisible()
    })

    test('Edge 1.3: Extreme length query strings (2,000+ chars with unicode and emojis)', async ({ page }) => {
      const longQuery = 'Kiến-trúc-biệt-thự-BIM-CAD-📐-🏢-'.repeat(70)
      const res = await page.goto(`${baseURL}/shop?q=${encodeURIComponent(longQuery)}`)
      expect(res?.status()).toBe(200)

      // Main content still renders without unhandled exception or 500
      await expect(page.locator('main').first()).toBeVisible()
      // Zero unhandled Next.js error overlays or fatal dialogs
      await expect(page.locator('[data-nextjs-dialog-overlay], [data-nextjs-terminal], .nextjs-container-build-error')).toHaveCount(0)
    })

    test('Edge 1.4: Special characters, SQLi, and script injection strings are strictly sanitized in DOM', async ({ page }) => {
      const maliciousPayloads = [
        `" OR 1=1 --`,
        `admin'--`,
        `<script id="exploit-payload">window.__pwned = true;</script>`,
        `<img src="invalid_image.jpg" onerror="window.__xss = true;" />`,
        `%27%22%3E%3Cscript%3E`,
      ]

      for (const payload of maliciousPayloads) {
        const res = await page.goto(`${baseURL}/shop?q=${encodeURIComponent(payload)}`)
        expect(res?.status()).toBe(200)

        // Script tag must never be injected as executable DOM element
        const injectedScript = page.locator('#exploit-payload')
        await expect(injectedScript).toHaveCount(0)

        // Window variables must remain undefined
        const pwned = await page.evaluate(() => (window as unknown as { __pwned?: boolean }).__pwned)
        expect(pwned).toBeUndefined()

        const xss = await page.evaluate(() => (window as unknown as { __xss?: boolean }).__xss)
        expect(xss).toBeUndefined()
      }
    })
  })

  // =========================================================================
  // 2. VIEWPORT RESPONSIVENESS (Mobile 375px/390px vs Desktop 1280px)
  // =========================================================================
  test.describe('Viewport Responsiveness & Layout Integrity', () => {

    test('Edge 2.1: Desktop (1280px) viewport shows full navigation without horizontal overflow', async ({ page }) => {
      await page.setViewportSize({ width: 1280, height: 800 })
      await page.goto(baseURL)

      // Verify header visibility
      const header = page.locator('header, nav, [role="banner"]').first()
      await expect(header).toBeVisible()

      // Horizontal overflow check: document width should not exceed viewport width
      const hasHorizontalScroll = await page.evaluate(() => {
        return document.documentElement.scrollWidth > window.innerWidth
      })
      expect(hasHorizontalScroll, 'Desktop 1280px layout must not have horizontal scrollbar').toBe(false)
    })

    test('Edge 2.2: Mobile (375px iPhone SE) viewport responsive drawer and zero overflow', async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 667 })
      await page.goto(baseURL)

      // Header is visible
      const header = page.locator('header, nav, [role="banner"]').first()
      await expect(header).toBeVisible()

      // Horizontal overflow check on 375px
      const hasHorizontalScroll = await page.evaluate(() => {
        return document.documentElement.scrollWidth > window.innerWidth + 2
      })
      expect(hasHorizontalScroll, 'Mobile 375px homepage must not have horizontal page overflow').toBe(false)

      // Mobile menu toggle button exists and opens Ant Design Drawer
      const menuBtn = page.locator('button[aria-label*="menu" i], button.ant-btn, nav button, header button').first()
      await expect(menuBtn).toBeVisible()
      await menuBtn.click()

      // Verify Ant Design Drawer is opened
      const drawer = page.locator('.ant-drawer').first()
      await expect(drawer).toBeVisible()

      // Drawer contains navigation items
      await expect(drawer.locator('a[href*="/shop"], a[href="/"], .ant-menu-item').first()).toBeVisible()

      // Close drawer (clicking mask or close button)
      const closeBtn = drawer.locator('.ant-drawer-close, button[aria-label="Close"]').first()
      if (await closeBtn.isVisible()) {
        await closeBtn.click()
        await expect(drawer).not.toBeVisible()
      }
    })

    test('Edge 2.3: Mobile (390px) Shop catalog responsiveness and product cards wrapping', async ({ page }) => {
      await page.setViewportSize({ width: 390, height: 844 })
      await page.goto(`${baseURL}/shop`)

      const main = page.locator('main').first()
      await expect(main).toBeVisible()

      // Verify horizontal overflow on /shop at 390px
      const hasHorizontalScroll = await page.evaluate(() => {
        return document.documentElement.scrollWidth > window.innerWidth + 2
      })
      expect(hasHorizontalScroll, 'Mobile 390px /shop catalog must not overflow horizontally').toBe(false)

      // Product cards are visible
      const productCard = page.locator('a[href*="/products/"]').first()
      await expect(productCard).toBeVisible()
    })
  })

  // =========================================================================
  // 3. ROUTE ISOLATION & ZERO ANTD CONTAMINATION IN /admin
  // =========================================================================
  test.describe('Route Isolation & Zero Ant Design Contamination', () => {

    test('Edge 3.1: Payload Admin (/admin/login) has STRICTLY ZERO Ant Design style tags or CSS-in-JS hashes', async ({ page }) => {
      await page.goto(`${baseURL}/admin/login`)
      await expect(page).toHaveURL(/\/admin\/login/)

      // Ensure admin login page renders
      const adminForm = page.locator('form, #field-email, .login__form').first()
      await expect(adminForm).toBeVisible()

      // Query for Ant Design CSS-in-JS style tags
      const antdStyleTags = await page.locator('style[data-css-hash], style[id*="antd"]').count()
      expect(antdStyleTags, 'Payload Admin must have 0 Ant Design style tags').toBe(0)

      // Query for Ant Design component classes in DOM
      const antdElements = await page.locator('.ant-layout, .ant-btn, .ant-menu, .ant-input, .ant-card').count()
      expect(antdElements, 'Payload Admin must have 0 Ant Design component elements').toBe(0)

      // Check full DOM content for antd-cssinjs markers
      const html = await page.content()
      expect(html.includes('antd-cssinjs'), 'Admin HTML must not contain antd-cssinjs SSR registry').toBe(false)
    })

    test('Edge 3.2: Storefront routes (/ and /login) DO have Ant Design styles and components active', async ({ page }) => {
      // Storefront Homepage
      await page.goto(baseURL)
      const homeHtml = await page.content()
      const homeHasAntd = homeHtml.includes('ant-') || homeHtml.includes('antd-cssinjs')
      expect(homeHasAntd, 'Storefront homepage must have Ant Design styles active').toBe(true)

      // Storefront Login
      await page.goto(`${baseURL}/login`)
      const loginHtml = await page.content()
      const loginHasAntd = loginHtml.includes('ant-') || loginHtml.includes('antd-cssinjs')
      expect(loginHasAntd, 'Storefront /login must have Ant Design styles active').toBe(true)
    })
  })
})
