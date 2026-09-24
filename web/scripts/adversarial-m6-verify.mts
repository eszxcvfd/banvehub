import { chromium, type Browser, type Page } from '@playwright/test'
import fs from 'fs'
import path from 'path'

const BASE_URL = process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:3000'

interface TestResult {
  name: string
  pass: boolean
  details: any
}

async function runM6EmpiricalVerification() {
  console.log('===================================================================')
  console.log('=== STARTING EMPIRICAL CHALLENGER VERIFICATION FOR MILESTONE M6 ===')
  console.log('===================================================================')

  const results: TestResult[] = []

  const browser: Browser = await chromium.launch({
    executablePath: '/usr/bin/google-chrome',
    headless: true,
  })

  try {
    const page: Page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
    console.log(`\nNavigating to ${BASE_URL}...`)
    await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 30000 })

    // -----------------------------------------------------------------------
    // TEST 1: FOOTER INTERACTIVITY & SELECTORS
    // -----------------------------------------------------------------------
    console.log('\n--- [TEST 1] Footer Structure & Content ---')
    const footer = page.locator('footer.ant-layout-footer, footer[role="contentinfo"]').first()
    const footerVisible = await footer.isVisible()
    console.log(`- Footer container visible: ${footerVisible}`)

    // 1.1 Brand & Slogan
    const brandName = await footer.locator('text=Kiến Tạo Hub').first().isVisible()
    const subTitle = await footer.locator('text=Bản vẽ & Tài nguyên BIM').first().isVisible()
    const slogan = await footer.locator('text=Bản vẽ chất lượng - Kiến tạo giá trị').first().isVisible()
    const copyright = await footer.locator('text=/Copyright © 2026/').first().isVisible()

    console.log(`- Brand name visible: ${brandName}`)
    console.log(`- Subtitle visible: ${subTitle}`)
    console.log(`- Slogan visible: ${slogan}`)
    console.log(`- Copyright visible: ${copyright}`)

    results.push({
      name: 'Footer Brand & Slogan',
      pass: brandName && subTitle && slogan && copyright,
      details: { brandName, subTitle, slogan, copyright },
    })

    // 1.2 Verified Contact Info
    const hotlineHref = await footer.locator('a[href^="tel:"]').first().getAttribute('href')
    const emailHref = await footer.locator('a[href^="mailto:"]').first().getAttribute('href')
    const addressText = await footer.locator('text=123 Phố Xã Đàn').first().isVisible()

    console.log(`- Hotline href: ${hotlineHref} (Matches tel:19006868: ${hotlineHref === 'tel:19006868'})`)
    console.log(`- Email href: ${emailHref} (Matches mailto:hotro@kientaohub.vn: ${emailHref === 'mailto:hotro@kientaohub.vn'})`)
    console.log(`- Address text visible: ${addressText}`)

    results.push({
      name: 'Footer Contact Info',
      pass: hotlineHref === 'tel:19006868' && emailHref === 'mailto:hotro@kientaohub.vn' && addressText,
      details: { hotlineHref, emailHref, addressText },
    })

    // 1.3 Categories 2-Subcolumn Layout
    const catTitles = ['Kiến trúc dân dụng', 'Bản vẽ Kết cấu', 'Cơ điện (MEP)', 'Mô hình BIM Revit', 'Nội thất', '3D & Phối cảnh']
    let allCatsFound = true
    for (const cat of catTitles) {
      const isVis = await footer.locator(`a:has-text("${cat}")`).first().isVisible()
      if (!isVis) {
        allCatsFound = false
        console.warn(`! Missing category link: ${cat}`)
      }
    }
    console.log(`- 8 Technical Categories present in Footer: ${allCatsFound}`)
    results.push({
      name: 'Footer Drawing Categories',
      pass: allCatsFound,
      details: { catTitles, allCatsFound },
    })

    // 1.4 Policies & Guides
    const policyTitles = ['Quy trình mua bản vẽ', 'Hướng dẫn nạp ví', 'Chính sách hoàn tiền 100%', 'Chính sách bảo mật', 'Điều khoản sử dụng']
    let allPoliciesFound = true
    for (const pol of policyTitles) {
      const isVis = await footer.locator(`a:has-text("${pol}")`).first().isVisible()
      if (!isVis) {
        allPoliciesFound = false
        console.warn(`! Missing policy link: ${pol}`)
      }
    }
    console.log(`- Policy Links present in Footer: ${allPoliciesFound}`)
    results.push({
      name: 'Footer Policy Links',
      pass: allPoliciesFound,
      details: { policyTitles, allPoliciesFound },
    })

    // 1.5 Social Media Links
    const fb = footer.locator('a[aria-label="Facebook"], a[href*="facebook.com"]').first()
    const yt = footer.locator('a[aria-label="YouTube"], a[href*="youtube.com"]').first()
    const li = footer.locator('a[aria-label="LinkedIn"], a[href*="linkedin.com"]').first()
    const zalo = footer.locator('a[aria-label="Zalo"], a[href*="zalo.me"]').first()

    const fbTarget = await fb.getAttribute('target')
    const fbRel = await fb.getAttribute('rel')
    const ytTarget = await yt.getAttribute('target')
    const liTarget = await li.getAttribute('target')
    const zaloTarget = await zalo.getAttribute('target')

    const socialsValid =
      (await fb.isVisible()) &&
      (await yt.isVisible()) &&
      (await li.isVisible()) &&
      (await zalo.isVisible()) &&
      fbTarget === '_blank' &&
      ytTarget === '_blank' &&
      liTarget === '_blank' &&
      zaloTarget === '_blank' &&
      fbRel?.includes('noopener')

    console.log(`- Social links (FB, YT, LI, Zalo) target=_blank & noopener: ${socialsValid}`)
    results.push({
      name: 'Footer Social Links',
      pass: Boolean(socialsValid),
      details: { fbTarget, ytTarget, liTarget, zaloTarget, fbRel },
    })

    // 1.6 Newsletter Interactivity
    console.log('\n--- [TEST 2] Footer Newsletter Interactivity ---')
    const newsletterInput = footer.locator('input[placeholder="Nhập email của bạn"]').first()
    const subscribeBtn = footer.locator('button:has-text("Đăng ký")').first()

    // Sub-test A: Empty input submit
    await newsletterInput.fill('')
    await subscribeBtn.click()
    await page.waitForTimeout(400)
    const emptyNoMessage = (await page.locator('.ant-message-notice').count()) === 0
    console.log(`- Submitting empty input does not show success message: ${emptyNoMessage}`)

    // Sub-test B: Invalid email (no @)
    await newsletterInput.fill('kientaohub-no-at-sign')
    await subscribeBtn.click()
    await page.waitForTimeout(400)
    const invalidNoMessage = (await page.locator('.ant-message-notice').count()) === 0
    console.log(`- Submitting email without @ does not show success message: ${invalidNoMessage}`)

    // Sub-test C: Valid email submission
    await newsletterInput.fill('architect.pro@kientaohub.vn')
    await subscribeBtn.click()
    await page.waitForSelector('.ant-message-success, .ant-message-notice', { timeout: 5000 })
    const successMsg = await page.locator('.ant-message-notice').first().innerText()
    const inputValAfter = await newsletterInput.inputValue()
    const validSuccess = successMsg.includes('Cảm ơn bạn đã đăng ký nhận tin') && inputValAfter === ''

    console.log(`- Submitting valid email displays: "${successMsg}" & clears input: ${validSuccess}`)
    results.push({
      name: 'Footer Newsletter Interactivity',
      pass: emptyNoMessage && invalidNoMessage && validSuccess,
      details: { emptyNoMessage, invalidNoMessage, validSuccess, successMsg },
    })

    // -----------------------------------------------------------------------
    // TEST 3: HEADER NAVBAR STRUCTURE, ROW INTEGRITY & COLOR NEUTRALITY
    // -----------------------------------------------------------------------
    console.log('\n--- [TEST 3] Header Navbar Structure & Colors ---')
    const header = page.locator('header').first()

    // 3.1 Single row ☰ + "Tất cả danh mục" + caret
    const allCatLink = header.locator('a:has-text("Tất cả danh mục")').first()
    const allCatVisible = await allCatLink.isVisible()
    const hasHamburgerSvg = (await allCatLink.locator('svg').count()) > 0
    const allCatClasses = (await allCatLink.getAttribute('class')) || ''
    const isSingleRowFlex = allCatClasses.includes('inline-flex') && allCatClasses.includes('items-center')

    console.log(`- "Tất cả danh mục" link visible: ${allCatVisible}`)
    console.log(`- Hamburger icon inside link: ${hasHamburgerSvg}`)
    console.log(`- Has inline-flex items-center (single row layout): ${isSingleRowFlex}`)

    results.push({
      name: 'Header Navbar Single Row ☰ + Tất cả danh mục',
      pass: allCatVisible && hasHamburgerSvg && isSingleRowFlex,
      details: { allCatVisible, hasHamburgerSvg, isSingleRowFlex, allCatClasses },
    })

    // 3.2 Category Menu Link Neutral Colors
    const kienTrucLink = header.locator('.category-nav-menu a:has-text("Kiến trúc")').first()
    const kienTrucColor = await kienTrucLink.evaluate((el) => window.getComputedStyle(el).color)
    console.log(`- Category "Kiến trúc" computed color: ${kienTrucColor}`)
    // Neutral slate is rgb(51, 65, 85) (#334155) or similar slate tone, NOT bright blue rgb(22, 119, 255)
    const isNeutralColor = kienTrucColor === 'rgb(51, 65, 85)' || !kienTrucColor.includes('119')
    console.log(`- Is neutral slate (not blue #1677ff): ${isNeutralColor}`)

    // 3.3 Quick links "Đăng bán" & "Đã mua"
    const dangBanLink = header.locator('a:has-text("Đăng bán")').first()
    const daMuaLink = header.locator('a:has-text("Đã mua")').first()
    const dangBanColor = await dangBanLink.evaluate((el) => window.getComputedStyle(el).color)
    const daMuaColor = await daMuaLink.evaluate((el) => window.getComputedStyle(el).color)
    console.log(`- "Đăng bán" computed color: ${dangBanColor}`)
    console.log(`- "Đã mua" computed color: ${daMuaColor}`)
    const quickLinksNeutral = !dangBanColor.includes('119') && !daMuaColor.includes('119')

    results.push({
      name: 'Header Navbar Link Color Neutrality',
      pass: isNeutralColor && quickLinksNeutral,
      details: { kienTrucColor, isNeutralColor, dangBanColor, daMuaColor, quickLinksNeutral },
    })

    // 3.4 Search Bar Pill Styling & Submission
    console.log('\n--- [TEST 4] Header Search Bar Pill & Functionality ---')
    const searchWrapper = header.locator('.header-search-wrapper, .header-search-pill-wrapper').first()
    const searchInput = header.locator('input[placeholder*="Tìm kiếm bản vẽ"]').first()
    const placeholder = await searchInput.getAttribute('placeholder')
    const searchWrapperClass = (await searchWrapper.getAttribute('class')) || ''
    const isPill = searchWrapperClass.includes('header-search-pill')

    console.log(`- Search bar placeholder: "${placeholder}"`)
    console.log(`- Has pill wrapper class: ${isPill}`)

    // Test search execution
    const testQuery = 'Biệt thự tân cổ điển'
    await searchInput.fill(testQuery)
    await searchInput.press('Enter')
    await page.waitForURL(/\/shop\?q=/, { timeout: 10000 })
    const targetUrl = page.url()
    const searchWorks = targetUrl.includes('/shop?q=') && decodeURIComponent(targetUrl).includes(testQuery)
    console.log(`- Pressing Enter redirected to: ${targetUrl} (Pass: ${searchWorks})`)

    results.push({
      name: 'Header Search Bar Pill & Query Submission',
      pass: Boolean(isPill && placeholder?.includes('Tìm kiếm bản vẽ') && searchWorks),
      details: { placeholder, isPill, targetUrl, searchWorks },
    })

    // -----------------------------------------------------------------------
    // TEST 5: RESPONSIVE BEHAVIOR & ZERO HORIZONTAL OVERFLOW
    // -----------------------------------------------------------------------
    console.log('\n--- [TEST 5] Responsive Layout & Horizontal Overflow ---')
    const viewports = [
      { name: 'Desktop (1280px)', width: 1280, height: 800 },
      { name: 'Tablet (768px)', width: 768, height: 1024 },
      { name: 'Mobile (375px - iPhone SE)', width: 375, height: 667 },
      { name: 'Mobile (390px - iPhone 12/13/14)', width: 390, height: 844 },
    ]

    let responsivePass = true
    const viewportDetails: any[] = []

    for (const vp of viewports) {
      await page.setViewportSize({ width: vp.width, height: vp.height })
      await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' })
      await page.waitForTimeout(500)

      const overflowCheck = await page.evaluate(() => {
        const docWidth = document.documentElement.scrollWidth
        const winWidth = window.innerWidth
        return { docWidth, winWidth, hasOverflow: docWidth > winWidth }
      })

      console.log(`- Viewport ${vp.name}: docWidth=${overflowCheck.docWidth}px, innerWidth=${overflowCheck.winWidth}px -> Overflow: ${overflowCheck.hasOverflow}`)
      viewportDetails.push({ ...vp, ...overflowCheck })

      if (overflowCheck.hasOverflow) {
        responsivePass = false
        console.error(`! Horizontal overflow detected on ${vp.name}!`)
      }
    }

    results.push({
      name: 'Responsive Viewports & Zero Horizontal Overflow',
      pass: responsivePass,
      details: viewportDetails,
    })

    // -----------------------------------------------------------------------
    // TEST 6: MANDATORY INVARIANTS PRESERVATION AUDIT
    // -----------------------------------------------------------------------
    console.log('\n--- [TEST 6] Mandatory Invariants Preservation ---')
    const layoutPath = path.resolve(process.cwd(), 'src/app/(app)/layout.tsx')
    const layoutContent = fs.readFileSync(layoutPath, 'utf8')
    const hasAdminBarImport = layoutContent.includes("import { AdminBar } from '@/components/AdminBar'")
    const hasAdminBarElement = layoutContent.includes('<AdminBar />')
    const isNotCommented = !layoutContent.includes('{/* <AdminBar')

    const adminBarIntact = hasAdminBarImport && hasAdminBarElement && isNotCommented
    console.log(`- AdminBar intact in layout.tsx: ${adminBarIntact}`)

    // Payload admin boundary isolation
    const payloadLayoutPath = path.resolve(process.cwd(), 'src/app/(payload)/layout.tsx')
    const payloadContent = fs.readFileSync(payloadLayoutPath, 'utf8')
    const zeroAntdInAdmin =
      !payloadContent.includes('antd') &&
      !payloadContent.includes('@ant-design') &&
      !payloadContent.includes('AntdConfigProvider')
    console.log(`- Payload Admin zero Ant Design imports: ${zeroAntdInAdmin}`)

    results.push({
      name: 'Mandatory Invariants (AdminBar & Backend Isolation)',
      pass: adminBarIntact && zeroAntdInAdmin,
      details: { adminBarIntact, zeroAntdInAdmin },
    })
  } finally {
    await browser.close()
  }

  // -----------------------------------------------------------------------
  // SUMMARY
  // -----------------------------------------------------------------------
  console.log('\n===================================================================')
  console.log('=== EMPIRICAL VERIFICATION SUMMARY ===')
  console.log('===================================================================')
  let allPassed = true
  for (const r of results) {
    const status = r.pass ? '✓ PASS' : '✗ FAIL'
    console.log(`[${status}] ${r.name}`)
    if (!r.pass) allPassed = false
  }

  console.log(`\nOVERALL STATUS: ${allPassed ? 'ALL TESTS PASSED' : 'TESTS FAILED'}`)
  if (!allPassed) {
    process.exit(1)
  }
}

runM6EmpiricalVerification().catch((err) => {
  console.error('Empirical verification failed with error:', err)
  process.exit(1)
})
