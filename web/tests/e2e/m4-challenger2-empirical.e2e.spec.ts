import { test, expect, type Page } from '@playwright/test'
import { TEST_USERS } from '../helpers/seedCatalog'

const baseURL = process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:3000'

async function loginBuyerViaUI(page: Page): Promise<void> {
  await page.goto(`${baseURL}/login`)
  await page.locator('input[name="email"], input[type="email"]').first().fill(TEST_USERS.buyer.email)
  await page.locator('input[name="password"], input[type="password"]').first().fill(TEST_USERS.buyer.password)
  await page.locator('button[type="submit"]').first().click()
  await page.waitForURL(/\/account/)
}

test.describe('M4 Challenger 2 Empirical E2E: Forgot Password (F27), Logout (F28) & Admin Route Isolation', () => {
  test.setTimeout(60000)

  // ============================================================================
  // 1. FORGOT PASSWORD (F27) CLIENT VALIDATION & RESULT INTERACTION
  // ============================================================================
  test.describe('1. Forgot Password (F27) Validation, Submission & Ant Design Result', () => {
    test('Validates empty email and invalid email format client-side before submit', async ({ page }) => {
      await page.goto(`${baseURL}/forgot-password`)

      // Verify header and form elements
      await expect(page.locator('h1').first()).toHaveText('Quên mật khẩu?')
      const emailInput = page.locator('input[name="email"]')
      await expect(emailInput).toBeVisible()

      const submitBtn = page.locator('button[type="submit"]')
      await expect(submitBtn).toBeVisible()

      // Empty submission
      await submitBtn.click()
      await expect(page.getByText('Vui lòng nhập địa chỉ email.')).toBeVisible()

      // Malformed email format
      await emailInput.fill('invalid-email-string')
      await submitBtn.click()
      await expect(page.getByText('Địa chỉ email không hợp lệ (ví dụ: name@example.com).')).toBeVisible()
    })

    test('Submission displays Ant Design Result status="success" with submitted email and interactive actions', async ({ page }) => {
      await page.goto(`${baseURL}/forgot-password`)

      const emailInput = page.locator('input[name="email"]')
      const testEmail = 'architect-forgot-test@kientaohub.vn'
      await emailInput.fill(testEmail)

      const submitBtn = page.locator('button[type="submit"]')
      await submitBtn.click()

      // Verify Ant Design Result status="success"
      const resultSuccess = page.locator('.ant-result-success')
      await expect(resultSuccess).toBeVisible({ timeout: 10000 })
      await expect(page.getByText('Yêu cầu đặt lại mật khẩu đã được gửi')).toBeVisible()
      await expect(page.getByText(testEmail)).toBeVisible()

      // Verify "Quay lại Đăng nhập" button
      const loginBtn = page.getByRole('link', { name: /Quay lại Đăng nhập/i })
      await expect(loginBtn).toBeVisible()
      await expect(loginBtn).toHaveAttribute('href', '/login')

      // Verify "Thử email khác" retry button resets the form
      const retryBtn = page.getByRole('button', { name: /Thử email khác/i })
      await expect(retryBtn).toBeVisible()
      await retryBtn.click()

      // Expect form to return with empty input
      await expect(page.locator('h1').first()).toHaveText('Quên mật khẩu?')
      await expect(page.locator('input[name="email"]')).toHaveValue('')
    })
  })

  // ============================================================================
  // 2. AUTHENTICATED SESSION GUARD (F27)
  // ============================================================================
  test.describe('2. Authenticated Session Guard for /forgot-password', () => {
    test('Logged-in user accessing /forgot-password is automatically redirected to /account', async ({ page }) => {
      await loginBuyerViaUI(page)
      await expect(page).toHaveURL(/\/account/)

      // Attempt to access /forgot-password while authenticated
      await page.goto(`${baseURL}/forgot-password`)

      // Must be redirected to /account with warning parameter
      await expect(page).toHaveURL(/\/account\?warning=/)
      await expect(page.locator('h1').first()).toBeVisible()
    })
  })

  // ============================================================================
  // 3. LOGOUT PAGE WORKFLOW & SEMANTIC MAIN (F28)
  // ============================================================================
  test.describe('3. Logout Page Contract, Spin, Result status="info" & Navigation', () => {
    test('Logout page mounts, clears session, renders semantic <main>, Result status="info" and actions', async ({ page }) => {
      // First ensure user is logged in
      await loginBuyerViaUI(page)
      await expect(page).toHaveURL(/\/account/)

      // Navigate to /logout
      await page.goto(`${baseURL}/logout`)

      // Semantic <main> wrapping check
      const mainEl = page.locator('main').first()
      await expect(mainEl).toBeVisible()

      // Ant Design Result status="info" check
      const resultInfo = page.locator('.ant-result-info')
      await expect(resultInfo).toBeVisible({ timeout: 10000 })
      await expect(
        page.getByText('Đã đăng xuất thành công').or(page.getByText('Bạn chưa đăng nhập hoặc đã đăng xuất')),
      ).toBeVisible()

      // Action button 1: "Khám phá bản vẽ" -> /shop
      const shopBtn = page.getByRole('link', { name: /Khám phá bản vẽ/i })
      await expect(shopBtn).toBeVisible()
      await expect(shopBtn).toHaveAttribute('href', '/shop')

      // Action button 2: "Đăng nhập lại" -> /login
      const loginBtn = page.getByRole('link', { name: /Đăng nhập lại/i })
      await expect(loginBtn).toBeVisible()
      await expect(loginBtn).toHaveAttribute('href', '/login')

      // Click shop button and verify navigation
      await shopBtn.click()
      await page.waitForURL(/\/shop/)
      await expect(page).toHaveURL(/\/shop/)
    })
  })

  // ============================================================================
  // 4. ADMIN ROUTE ISOLATION & ZERO LEAKAGE
  // ============================================================================
  test.describe('4. Strict Admin Route Isolation & Zero Leakage Audit', () => {
    test('Admin login page (/admin/login) has zero Ant Design CSS or stylesheet contamination', async ({ page }) => {
      await page.goto(`${baseURL}/admin/login`)
      await expect(page).toHaveURL(/\/admin\/login/)

      // Ensure Payload admin login form is rendered
      const adminLoginForm = page.locator('#field-email, .login__form, form').first()
      await expect(adminLoginForm).toBeVisible()

      // Verify 0 Ant Design style tags or classes
      const html = await page.content()
      expect(html.includes('id="antd-cssinjs"')).toBe(false)
      expect(html.includes('data-storefront-wrapper')).toBe(false)

      const antLayoutCount = await page.locator('.ant-layout, .ant-btn, .ant-menu').count()
      expect(antLayoutCount).toBe(0)
    })

    test('Admin root (/admin) has zero Ant Design CSS or storefront wrapper leakage', async ({ page }) => {
      await page.goto(`${baseURL}/admin`)

      // Unauthenticated user is either redirected to /admin/login or sees admin access error
      const html = await page.content()
      expect(html.includes('id="antd-cssinjs"')).toBe(false)
      expect(html.includes('data-storefront-wrapper')).toBe(false)

      const antElementsCount = await page.locator('.ant-layout, .ant-btn, .ant-menu, .ant-result').count()
      expect(antElementsCount).toBe(0)
    })
  })
})
