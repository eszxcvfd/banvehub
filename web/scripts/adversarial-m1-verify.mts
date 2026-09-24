import { chromium } from '@playwright/test'

async function runAdversarialVerification() {
  console.log('--- START ADVERSARIAL VERIFICATION FOR MILESTONE 1 ---')
  const results: Record<string, any> = {}

  // =========================================================================
  // 1. SSR vs Client Hydration Checks (HTTP curl / fetch)
  // =========================================================================
  console.log('\n[TEST 1] SSR vs Client Hydration on http://localhost:3000/')
  const ssrRes = await fetch('http://localhost:3000/')
  const ssrHtml = await ssrRes.text()

  const expectedStyleTag = '<style id="antd-cssinjs" data-rc-order="prepend" data-rc-priority="-1000">'
  const hasStyleTag = ssrHtml.includes(expectedStyleTag)
  const hasPrimaryColor = ssrHtml.includes('#1677ff')
  
  // Extract style tag content
  const styleMatch = ssrHtml.match(/<style id="antd-cssinjs"[^>]*>(.*?)<\/style>/s)
  const styleLength = styleMatch ? styleMatch[1].length : 0

  console.log(`- Exact <style id="antd-cssinjs" ...> tag present: ${hasStyleTag}`)
  console.log(`- Extracted SSR stylesheet size: ${styleLength} bytes`)
  console.log(`- Primary color #1677ff present in server-rendered stylesheet: ${hasPrimaryColor}`)

  results.test1_ssr = {
    hasStyleTag,
    styleLength,
    hasPrimaryColor,
    status: hasStyleTag && hasPrimaryColor ? 'PASS' : 'FAIL',
  }

  // =========================================================================
  // 2. Route Isolation Checks (Admin vs App)
  // =========================================================================
  console.log('\n[TEST 2] Route Isolation on http://localhost:3000/admin & /admin/login')
  const adminRes = await fetch('http://localhost:3000/admin')
  const adminHtml = await adminRes.text()

  const adminLoginRes = await fetch('http://localhost:3000/admin/login')
  const adminLoginHtml = await adminLoginRes.text()

  const adminHasStyleTag = adminHtml.includes('antd-cssinjs') || adminLoginHtml.includes('antd-cssinjs')
  const adminAntClasses = (adminHtml.match(/class="[^"]*\bant-[a-zA-Z0-9_-]+/g) || []).concat(
    adminLoginHtml.match(/class="[^"]*\bant-[a-zA-Z0-9_-]+/g) || []
  )

  console.log(`- Admin HTML contains antd-cssinjs style tag: ${adminHasStyleTag}`)
  console.log(`- Admin HTML ant-* class occurrences: ${adminAntClasses.length}`)

  results.test2_isolation = {
    adminHasStyleTag,
    adminAntClassCount: adminAntClasses.length,
    status: !adminHasStyleTag && adminAntClasses.length === 0 ? 'PASS' : 'FAIL',
  }

  // =========================================================================
  // 3. Live Browser: Hydration Mismatch & Dynamic Theme Switching
  // =========================================================================
  console.log('\n[TEST 3] Live Browser Hydration & Theme Switching')
  const browser = await chromium.launch({
    executablePath: '/usr/bin/google-chrome',
    headless: true,
  })

  const pageErrors: string[] = []
  const consoleErrors: string[] = []
  const consoleWarnings: string[] = []
  const hydrationErrors: string[] = []

  const context = await browser.newContext()
  const page = await context.newPage()

  page.on('pageerror', (err) => {
    pageErrors.push(err.message)
    console.error('  [PageError]:', err.message)
  })

  page.on('console', (msg) => {
    const text = msg.text()
    if (msg.type() === 'error') {
      consoleErrors.push(text)
      if (
        text.toLowerCase().includes('hydration') ||
        text.toLowerCase().includes('mismatch') ||
        text.toLowerCase().includes('did not match') ||
        text.toLowerCase().includes('server html')
      ) {
        hydrationErrors.push(text)
      }
    } else if (msg.type() === 'warning') {
      consoleWarnings.push(text)
      if (
        text.toLowerCase().includes('hydration') ||
        text.toLowerCase().includes('mismatch')
      ) {
        hydrationErrors.push(text)
      }
    }
  })

  // Navigate to storefront root
  await page.goto('http://localhost:3000/', { waitUntil: 'networkidle' })
  console.log(`- Page loaded: ${await page.title()}`)
  console.log(`- Hydration errors detected on initial load: ${hydrationErrors.length}`)

  // Check Ant Design App wrapper
  const antAppCount = await page.locator('.ant-app').count()
  console.log(`- Ant Design <App> wrapper (.ant-app) present: ${antAppCount > 0}`)

  // Dynamic Theme Switching test
  console.log('\n- Testing dynamic theme switching: light -> dark -> light')
  
  // Switch to dark
  await page.evaluate(() => {
    window.localStorage.setItem('payload-theme', 'dark')
    document.documentElement.setAttribute('data-theme', 'dark')
    window.dispatchEvent(new Event('theme-change'))
  })
  await page.waitForTimeout(500)

  const docThemeAfterDark = await page.evaluate(() =>
    document.documentElement.getAttribute('data-theme')
  )
  console.log(`- Theme after dark switch: ${docThemeAfterDark}`)

  // Switch back to light
  await page.evaluate(() => {
    window.localStorage.setItem('payload-theme', 'light')
    document.documentElement.setAttribute('data-theme', 'light')
    window.dispatchEvent(new Event('theme-change'))
  })
  await page.waitForTimeout(500)

  const docThemeAfterLight = await page.evaluate(() =>
    document.documentElement.getAttribute('data-theme')
  )
  console.log(`- Theme after light switch: ${docThemeAfterLight}`)

  console.log(`- Total hydration mismatch errors after switching: ${hydrationErrors.length}`)
  console.log(`- Total fatal page errors: ${pageErrors.length}`)

  results.test3_theme_switching = {
    docThemeAfterDark,
    docThemeAfterLight,
    hydrationErrorsCount: hydrationErrors.length,
    pageErrorsCount: pageErrors.length,
    status:
      docThemeAfterDark === 'dark' &&
      docThemeAfterLight === 'light' &&
      hydrationErrors.length === 0 &&
      pageErrors.length === 0
        ? 'PASS'
        : 'FAIL',
  }

  // =========================================================================
  // 3b. Adversarial Scenario: Client arrives with pre-existing dark theme in localStorage
  // =========================================================================
  console.log('\n[TEST 3b] Adversarial Scenario: Client with pre-existing dark theme in localStorage')
  const darkContext = await browser.newContext()
  await darkContext.addInitScript(() => {
    window.localStorage.setItem('payload-theme', 'dark')
  })

  const darkPageHydrationErrors: string[] = []
  const darkPageErrors: string[] = []
  const darkPage = await darkContext.newPage()

  darkPage.on('pageerror', (err) => {
    darkPageErrors.push(err.message)
    console.error('  [Pre-dark PageError]:', err.message)
  })

  darkPage.on('console', (msg) => {
    const text = msg.text()
    if (
      msg.type() === 'error' &&
      (text.toLowerCase().includes('hydration') ||
       text.toLowerCase().includes('mismatch') ||
       text.toLowerCase().includes('did not match') ||
       text.toLowerCase().includes('server html'))
    ) {
      darkPageHydrationErrors.push(text)
      console.error('  [Pre-dark Hydration Error]:', text)
    }
  })

  await darkPage.goto('http://localhost:3000/', { waitUntil: 'networkidle' })
  const finalDarkTheme = await darkPage.evaluate(() => document.documentElement.getAttribute('data-theme'))
  console.log(`- Pre-configured dark theme active on page: ${finalDarkTheme}`)
  console.log(`- Pre-dark load hydration errors: ${darkPageHydrationErrors.length}`)
  console.log(`- Pre-dark load fatal errors: ${darkPageErrors.length}`)

  results.test3b_preexisting_dark = {
    finalDarkTheme,
    hydrationErrorsCount: darkPageHydrationErrors.length,
    pageErrorsCount: darkPageErrors.length,
    status:
      finalDarkTheme === 'dark' &&
      darkPageHydrationErrors.length === 0 &&
      darkPageErrors.length === 0
        ? 'PASS'
        : 'FAIL',
  }

  await darkContext.close()

  await browser.close()

  // =========================================================================
  // Summary
  // =========================================================================
  console.log('\n=== EMPIRICAL VERIFICATION SUMMARY ===')
  console.log(JSON.stringify(results, null, 2))
}

runAdversarialVerification().catch((err) => {
  console.error('Verification failed with unhandled exception:', err)
  process.exit(1)
})
