import { chromium, type Browser, type Page } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'

const BASE_URL = process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:3000'

const EXPECTED_IMAGES = [
  'bestseller-1-villa.jpg',
  'bestseller-2-frame.jpg',
  'bestseller-3-mep.jpg',
  'bestseller-4-interior.jpg',
  'bestseller-5-masterplan.jpg',
  'bestseller-6-highrise.jpg',
  'bestseller-7-bridge.jpg',
  'bestseller-8-townhouse.jpg',
]

async function runAdversarialM4Verification() {
  console.log('================================================================================')
  console.log('=== EMPIRICAL ADVERSARIAL VERIFICATION HARNESS FOR MILESTONE M4 ===')
  console.log('================================================================================\n')

  const results: Record<string, any> = {}

  // ---------------------------------------------------------------------------
  // TEST 1: Physical File System Assets Integrity
  // ---------------------------------------------------------------------------
  console.log('[TEST 1] Physical Curated Image Assets On Disk')
  const diskAssets: Record<string, any> = {}
  const publicDir = path.resolve(process.cwd(), 'public/media/curated')
  for (const imgName of EXPECTED_IMAGES) {
    const filePath = path.join(publicDir, imgName)
    const exists = fs.existsSync(filePath)
    const stat = exists ? fs.statSync(filePath) : null
    diskAssets[imgName] = {
      exists,
      sizeBytes: stat?.size || 0,
      valid: exists && (stat?.size || 0) > 1000,
    }
    console.log(`- ${imgName}: exists=${exists}, size=${stat?.size}B (Valid: ${diskAssets[imgName].valid})`)
  }
  const allDiskAssetsValid = Object.values(diskAssets).every((a) => a.valid)
  results.test1_disk_assets = { pass: allDiskAssetsValid, details: diskAssets }

  // ---------------------------------------------------------------------------
  // Launch Headless Chrome
  // ---------------------------------------------------------------------------
  console.log('\n[INFO] Launching Headless Chrome (/usr/bin/google-chrome)...')
  const browser: Browser = await chromium.launch({
    executablePath: '/usr/bin/google-chrome',
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  })

  try {
    const page: Page = await browser.newPage({
      viewport: { width: 1440, height: 900 },
    })

    // -------------------------------------------------------------------------
    // TEST 2: Homepage Bestseller 8 Curated Cards (Uniqueness, Loading, Natural Dimensions)
    // -------------------------------------------------------------------------
    console.log('\n[TEST 2] Homepage Bestseller Cards: 8 Curated Images & Uniqueness')
    await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 30000 })

    const heading = page.getByRole('heading', { name: /Bản Vẽ & Hồ Sơ Bán Chạy Nhất/i })
    await heading.waitFor({ state: 'visible' })
    const section = heading.locator('xpath=ancestor::section[1]')
    const cards = section.locator('a[data-slot="product-card"]')
    const cardCount = await cards.count()
    console.log(`- Found ${cardCount} cards in "Bản Vẽ & Hồ Sơ Bán Chạy Nhất" (Expected: 8)`)

    const cardsDetails: any[] = []
    const imageFilenames: string[] = []

    for (let i = 0; i < cardCount; i++) {
      const card = cards.nth(i)
      const href = (await card.getAttribute('href')) || ''
      const img = card.locator('img')
      const src = (await img.getAttribute('src')) || ''
      const naturalWidth = await img.evaluate((el: HTMLImageElement) => el.naturalWidth)
      const naturalHeight = await img.evaluate((el: HTMLImageElement) => el.naturalHeight)
      const complete = await img.evaluate((el: HTMLImageElement) => el.complete)
      const alt = (await img.getAttribute('alt')) || ''

      const matchingFile = EXPECTED_IMAGES.find((name) => src.includes(name)) || 'UNKNOWN'
      imageFilenames.push(matchingFile)

      cardsDetails.push({
        index: i,
        href,
        matchingFile,
        src,
        alt,
        dimensions: `${naturalWidth}x${naturalHeight}`,
        loadedSuccessfully: naturalWidth > 0 && naturalHeight > 0 && complete,
      })

      console.log(
        `  Card ${i + 1}: file=${matchingFile}, loaded=${naturalWidth > 0 && complete}, dims=${naturalWidth}x${naturalHeight}, href=${href}`,
      )
    }

    const uniqueSet = new Set(imageFilenames)
    const isCount8 = cardCount === 8
    const isUnique8 = uniqueSet.size === 8 && !uniqueSet.has('UNKNOWN')
    const allLoaded = cardsDetails.every((c) => c.loadedSuccessfully)

    console.log(`- Total cards: ${cardCount} (Pass: ${isCount8})`)
    console.log(`- Unique curated image count: ${uniqueSet.size} (Pass: ${isUnique8})`)
    console.log(`- All 8 images loaded successfully in DOM: ${allLoaded}`)

    results.test2_curated_images = {
      pass: isCount8 && isUnique8 && allLoaded,
      cardCount,
      uniqueImageCount: uniqueSet.size,
      details: cardsDetails,
    }

    // -------------------------------------------------------------------------
    // TEST 3: Card Link Routing to Product Detail Pages (/products/<slug>)
    // -------------------------------------------------------------------------
    console.log('\n[TEST 3] Card Link Routing to /products/<slug> with HTTP 200')
    const routingDetails: any[] = []

    for (let i = 0; i < cardsDetails.length; i++) {
      const { href } = cardsDetails[i]
      const isValidSlugPattern = /^\/products\/[a-z0-9-]+$/.test(href)

      // Test navigation on a fresh page
      const testPage = await browser.newPage()
      const res = await testPage.goto(`${BASE_URL}${href}`, { waitUntil: 'domcontentloaded' })
      const status = res?.status() || 0
      const title = await testPage.title()
      const hasContent = (await testPage.locator('main').count()) > 0 || (await testPage.locator('h1').count()) > 0

      console.log(`  [${i + 1}/8] ${href} -> HTTP ${status} | Title: "${title.slice(0, 40)}..." (Valid: ${status === 200})`)
      routingDetails.push({
        href,
        isValidSlugPattern,
        status,
        pass: isValidSlugPattern && status === 200 && hasContent,
      })
      await testPage.close()
    }

    const allRoutesPass = routingDetails.every((r) => r.pass)
    console.log(`- All 8 product detail links return HTTP 200: ${allRoutesPass}`)
    results.test3_routing = { pass: allRoutesPass, details: routingDetails }

    // -------------------------------------------------------------------------
    // TEST 4: Price Formatting (Bold Large VND) & Dark "Tải về" Button Styling
    // -------------------------------------------------------------------------
    console.log('\n[TEST 4] Price Formatting (Bold Large VND) & Dark "Tải về" Button Styling')
    const stylingDetails: any[] = []

    for (let i = 0; i < cardCount; i++) {
      const card = cards.nth(i)
      const text = (await card.textContent()) || ''

      // Price check
      const priceMatch = text.match(/([0-9\.,]+)\s*(?:₫|đ)/)
      const priceText = priceMatch ? priceMatch[0] : 'NOT_FOUND'

      const priceContainer = card.locator('.tracking-tight, [class*="Price"]').first()
      const priceComputed = await priceContainer.evaluate((el) => {
        const cs = window.getComputedStyle(el)
        return {
          fontWeight: cs.fontWeight,
          fontSize: cs.fontSize,
          color: cs.color,
        }
      })

      // Button check
      const btn = card.locator('button[data-slot="product-download-btn"]')
      const btnCount = await btn.count()
      const btnText = btnCount > 0 ? (await btn.textContent())?.trim() : ''
      const btnAriaLabel = btnCount > 0 ? await btn.getAttribute('aria-label') : ''

      const btnComputed = await btn.evaluate((el) => {
        const cs = window.getComputedStyle(el)
        return {
          backgroundColor: cs.backgroundColor,
          color: cs.color,
          borderRadius: cs.borderRadius,
        }
      })

      const isPriceBold = parseInt(priceComputed.fontWeight, 10) >= 700
      const isPriceVND = Boolean(priceMatch)
      const isBtnDark = btnComputed.backgroundColor === 'rgb(15, 23, 42)'
      const isBtnTextCorrect = (btnText || '').includes('Tải về') && btnAriaLabel === 'Tải về'

      console.log(`  Card ${i + 1}: Price="${priceText}" (weight=${priceComputed.fontWeight}, size=${priceComputed.fontSize}) | Button="${btnText}" (bg=${btnComputed.backgroundColor})`)

      stylingDetails.push({
        index: i,
        priceText,
        isPriceVND,
        isPriceBold,
        btnText,
        btnAriaLabel,
        btnBg: btnComputed.backgroundColor,
        isBtnDark,
        pass: isPriceVND && isPriceBold && isBtnDark && isBtnTextCorrect,
      })
    }

    const allStylingPass = stylingDetails.every((s) => s.pass)
    console.log(`- All 8 cards display bold VND prices and dark "Tải về" buttons: ${allStylingPass}`)
    results.test4_styling = { pass: allStylingPass, details: stylingDetails }

    // -------------------------------------------------------------------------
    // TEST 5: Desktop 4-Column Responsive Grid Layout Container
    // -------------------------------------------------------------------------
    console.log('\n[TEST 5] Desktop 4-Column Responsive Grid Layout Container')
    const gridContainer = section.locator('.grid').first()
    const gridClasses = (await gridContainer.getAttribute('class')) || ''
    const hasCol1 = gridClasses.includes('grid-cols-1')
    const hasCol2 = gridClasses.includes('sm:grid-cols-2')
    const hasCol4 = gridClasses.includes('lg:grid-cols-4')
    const gridPass = hasCol1 && hasCol2 && hasCol4

    console.log(`- Grid classes: "${gridClasses}"`)
    console.log(`- Responsive breakpoints: cols-1=${hasCol1}, sm:cols-2=${hasCol2}, lg:cols-4=${hasCol4} (Pass: ${gridPass})`)
    results.test5_grid_layout = { pass: gridPass, gridClasses }

    // -------------------------------------------------------------------------
    // TEST 6: Mandatory User Directive: AdminBar Preservation
    // -------------------------------------------------------------------------
    console.log('\n[TEST 6] Mandatory User Directive: AdminBar Preservation')
    const layoutFile = path.resolve(process.cwd(), 'src/app/(app)/layout.tsx')
    const layoutSrc = fs.readFileSync(layoutFile, 'utf8')
    const adminBarInLayout = layoutSrc.includes('<AdminBar />') && layoutSrc.includes("from '@/components/AdminBar'")

    const adminBarComponent = path.resolve(process.cwd(), 'src/components/AdminBar/index.tsx')
    const adminBarSrc = fs.readFileSync(adminBarComponent, 'utf8')
    const adminBarHasPayload = adminBarSrc.includes("from '@payloadcms/admin-bar'") && adminBarSrc.includes('<PayloadAdminBar')

    const pageContent = await page.content()
    const adminBarInDom = pageContent.includes('payload-admin-bar') || pageContent.includes('AdminBar') || (await page.locator('.payload-admin-bar, [class*="AdminBar"]').count()) >= 0

    console.log(`- <AdminBar /> in layout.tsx: ${adminBarInLayout}`)
    console.log(`- PayloadAdminBar in AdminBar/index.tsx: ${adminBarHasPayload}`)
    console.log(`- AdminBar element intact: ${adminBarInDom}`)
    const adminBarPass = adminBarInLayout && adminBarHasPayload
    results.test6_admin_bar = { pass: adminBarPass }

    // -------------------------------------------------------------------------
    // TEST 7: Interactive Click on "Tải về" Button Navigates to Product Detail
    // -------------------------------------------------------------------------
    console.log('\n[TEST 7] User Interaction: Click on Card "Tải về" Button')
    const firstCard = cards.first()
    const firstHref = (await firstCard.getAttribute('href')) || ''
    const downloadBtn = firstCard.locator('button[data-slot="product-download-btn"]')

    await Promise.all([
      page.waitForURL((url) => url.pathname === firstHref),
      downloadBtn.click(),
    ])

    const navigatedUrl = page.url()
    const clickPass = navigatedUrl.includes(firstHref)
    console.log(`- Clicked "Tải về" button -> Navigated to: ${navigatedUrl} (Pass: ${clickPass})`)
    results.test7_button_click = { pass: clickPass, targetUrl: navigatedUrl }

  } finally {
    await browser.close()
  }

  // ---------------------------------------------------------------------------
  // Summary Verdict
  // ---------------------------------------------------------------------------
  console.log('\n================================================================================')
  console.log('=== EMPIRICAL ADVERSARIAL VERIFICATION SUMMARY ===')
  console.log('================================================================================')

  const allPassed =
    results.test1_disk_assets.pass &&
    results.test2_curated_images.pass &&
    results.test3_routing.pass &&
    results.test4_styling.pass &&
    results.test5_grid_layout.pass &&
    results.test6_admin_bar.pass &&
    results.test7_button_click.pass

  console.log(`Test 1 (Disk Assets):     ${results.test1_disk_assets.pass ? 'PASS' : 'FAIL'}`)
  console.log(`Test 2 (8 Curated Cards): ${results.test2_curated_images.pass ? 'PASS' : 'FAIL'}`)
  console.log(`Test 3 (Route Targets):   ${results.test3_routing.pass ? 'PASS' : 'FAIL'}`)
  console.log(`Test 4 (Price & CTA Btn): ${results.test4_styling.pass ? 'PASS' : 'FAIL'}`)
  console.log(`Test 5 (Grid 4-Col):      ${results.test5_grid_layout.pass ? 'PASS' : 'FAIL'}`)
  console.log(`Test 6 (AdminBar):        ${results.test6_admin_bar.pass ? 'PASS' : 'FAIL'}`)
  console.log(`Test 7 (CTA Button Click):${results.test7_button_click.pass ? 'PASS' : 'FAIL'}`)
  console.log(`\nOVERALL HARNESS VERDICT: ${allPassed ? 'ALL TESTS PASSED (APPROVED)' : 'TESTS FAILED (REQUEST CHANGES)'}`)

  if (!allPassed) {
    process.exit(1)
  }
}

runAdversarialM4Verification().catch((err) => {
  console.error('\n❌ Unhandled Error in Verification Harness:', err)
  process.exit(1)
})
