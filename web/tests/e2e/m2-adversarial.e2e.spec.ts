import { test, expect } from '@playwright/test'

const baseURL = process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:3000'

test.describe('Adversarial Critic M2: Header, Drawer & Footer Stress Test', () => {
  test('Strict Ant Design Drawer opens, renders content, and auto-closes on resize >= 768px', async ({ page }) => {
    // Collect console errors or warnings
    const consoleErrors: string[] = []
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text())
      }
    })

    // 1. Mobile viewport
    await page.setViewportSize({ width: 375, height: 667 })
    await page.goto(baseURL, { waitUntil: 'domcontentloaded' })

    // Locate the mobile trigger button
    const trigger = page.locator('button[aria-label="Menu điều hướng"]')
    await expect(trigger).toBeVisible()

    // Ant Design Drawer should not be open initially
    await expect(page.locator('.ant-drawer.ant-drawer-open')).toHaveCount(0)

    // Click trigger to open Drawer
    await trigger.click()

    // Verify Ant Design Drawer is actually open with its class
    const drawerOpen = page.locator('.ant-drawer.ant-drawer-open')
    await expect(drawerOpen).toBeVisible()

    // Verify inner Ant Design components within Drawer:
    // Search input
    const drawerSearch = drawerOpen.locator('.ant-input-search input')
    await expect(drawerSearch).toBeVisible()

    // Ant Design inline Menu
    const drawerMenu = drawerOpen.locator('.ant-menu.ant-menu-root')
    await expect(drawerMenu).toBeVisible()

    // Verify category group in Drawer
    await expect(drawerOpen.getByText('Bản vẽ Kiến trúc')).toBeVisible()

    // 2. Test auto-close on resize to >= 768px
    await page.setViewportSize({ width: 800, height: 800 })

    // Wait for resize event to propagate and close drawer
    await expect(page.locator('.ant-drawer.ant-drawer-open')).toHaveCount(0, { timeout: 3000 })

    // 3. Test Drawer manual close button when reopened on mobile
    await page.setViewportSize({ width: 375, height: 667 })
    await trigger.click()
    await expect(page.locator('.ant-drawer.ant-drawer-open')).toBeVisible()

    const closeBtn = page.locator('.ant-drawer-close')
    await expect(closeBtn).toBeVisible()
    await closeBtn.click()
    await expect(page.locator('.ant-drawer.ant-drawer-open')).toHaveCount(0)

    // Check that no React hydration or crash errors occurred
    const criticalErrors = consoleErrors.filter(
      (err) =>
        err.includes('Hydration') ||
        err.includes('Minified React error') ||
        err.includes('Cannot read properties of undefined')
    )
    expect(criticalErrors).toEqual([])
  })

  test('Adversarial check: /admin isolation against any antd leakage', async ({ request }) => {
    // Direct SSR check of /admin HTML
    const adminRes = await request.get(`${baseURL}/admin`)
    expect(adminRes.status()).toBe(200)
    const adminHtml = await adminRes.text()

    // Must NOT contain antd style registry
    expect(adminHtml.includes('antd-cssinjs')).toBe(false)
    expect(adminHtml.includes('id="antd-cssinjs"')).toBe(false)

    // Must NOT contain any Ant Design component classes
    const antClassMatch = adminHtml.match(/class="[^"]*\bant-[a-z0-9-]+[^"]*"/g)
    expect(antClassMatch).toBeNull()

    // Direct SSR check of storefront / for comparison
    const storefrontRes = await request.get(`${baseURL}`)
    expect(storefrontRes.status()).toBe(200)
    const storefrontHtml = await storefrontRes.text()

    // Storefront MUST contain antd style registry
    expect(storefrontHtml.includes('antd-cssinjs')).toBe(true)
  })

  test('Adversarial check: Header & Footer Server Components contract and Search interaction', async ({ page }) => {
    await page.goto(baseURL)

    // Verify search interaction on Desktop
    const searchInput = page.locator('header .ant-input-search input').first()
    await expect(searchInput).toBeVisible()
    await searchInput.fill('kết cấu thép')
    await searchInput.press('Enter')

    await page.waitForURL(/\/shop\?q=k%E1%BA%BFt\+c%E1%BA%A5u\+th%C3%A9p|\/shop\?q=/)
    expect(page.url()).toContain('/shop?q=')

    // Verify CategoryMenu active key or dropdown navigation
    await page.goto(`${baseURL}/shop?category=ban-ve-kien-truc`)
    const activeMenuItem = page.locator('header .ant-menu-item-selected, header .ant-menu-submenu-selected')
    await expect(activeMenuItem.first()).toBeVisible()

    // Verify Footer 4-column structure and theme selector
    const footer = page.locator('footer.ant-layout-footer')
    await expect(footer).toBeVisible()
    const footerCols = footer.locator('.ant-col')
    expect(await footerCols.count()).toBeGreaterThanOrEqual(4)

    // Verify payment tags
    await expect(footer.getByText('Stripe')).toBeVisible()
    await expect(footer.getByText('VietQR')).toBeVisible()
  })
})
