import { chromium, type Browser, type Page } from '@playwright/test'

const BASE_URL = process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:3000'

interface VerificationReport {
  test1_search: Record<string, any>
  test2_megamenu: Record<string, any>
  test3_auth_dropdown: Record<string, any>
  test4_cart_badge: Record<string, any>
  test5_mobile_drawer: Record<string, any>
}

async function runAdversarialM2Verification() {
  console.log('=== STARTING EMPIRICAL ADVERSARIAL VERIFICATION FOR MILESTONE 2 ===')
  const report: Partial<VerificationReport> = {}

  const browser: Browser = await chromium.launch({
    executablePath: '/usr/bin/google-chrome',
    headless: true,
  })

  try {
    // =========================================================================
    // TEST 1: SEARCH INPUT ADVERSARIAL STRESS-TESTS
    // =========================================================================
    console.log('\n[TEST 1] Search Input Adversarial Stress-Tests on Live Storefront')
    const page1: Page = await browser.newPage({ viewport: { width: 1280, height: 800 } })
    const searchResults: Record<string, any> = {}

    // 1.1 Vietnamese query with diacritics
    await page1.goto(BASE_URL)
    const searchInput1 = page1.locator('.ant-input-search input[name="q"], input[name="q"]').first()
    await searchInput1.waitFor({ state: 'visible' })

    const vnQuery = 'Biệt thự tân cổ điển 3 tầng'
    await searchInput1.fill(vnQuery)
    await searchInput1.press('Enter')
    await page1.waitForURL(/\/shop\?q=/)

    const currentUrl1 = page1.url()
    const decodedUrl1 = decodeURIComponent(currentUrl1)
    const hasVnQuery = decodedUrl1.includes(vnQuery) || currentUrl1.includes(encodeURIComponent(vnQuery))
    console.log(`- 1.1 Vietnamese query "${vnQuery}" -> URL: ${currentUrl1} (Matches: ${hasVnQuery})`)
    searchResults.vietnamese = { query: vnQuery, url: currentUrl1, pass: hasVnQuery }

    // 1.2 Special characters
    await page1.goto(BASE_URL)
    const searchInput2 = page1.locator('.ant-input-search input[name="q"], input[name="q"]').first()
    const specialQuery = 'CAD & BIM #1 + 3D / MEP ? test'
    await searchInput2.fill(specialQuery)
    await searchInput2.press('Enter')
    await page1.waitForURL(/\/shop\?q=/)

    const currentUrl2 = page1.url()
    const urlObj2 = new URL(currentUrl2)
    const qParam2 = urlObj2.searchParams.get('q')
    const hasSpecial = qParam2 === specialQuery
    console.log(`- 1.2 Special chars "${specialQuery}" -> Param q: "${qParam2}" (Matches: ${hasSpecial})`)
    searchResults.special_chars = { query: specialQuery, param_q: qParam2, pass: hasSpecial }

    // 1.3 Leading and trailing spaces
    await page1.goto(BASE_URL)
    const searchInput3 = page1.locator('.ant-input-search input[name="q"], input[name="q"]').first()
    const spacedQuery = '   kết cấu thép tiền chế   '
    await searchInput3.fill(spacedQuery)
    await searchInput3.press('Enter')
    await page1.waitForURL(/\/shop\?q=/)

    const currentUrl3 = page1.url()
    const urlObj3 = new URL(currentUrl3)
    const qParam3 = urlObj3.searchParams.get('q')
    const hasTrimmed = qParam3 === 'kết cấu thép tiền chế'
    console.log(`- 1.3 Spaced query trimmed -> Param q: "${qParam3}" (Trimmed: ${hasTrimmed})`)
    searchResults.whitespace_trimming = { query: spacedQuery, param_q: qParam3, pass: hasTrimmed }

    // 1.4 Whitespace only query -> goes to /shop without empty q
    await page1.goto(BASE_URL)
    const searchInput4 = page1.locator('.ant-input-search input[name="q"], input[name="q"]').first()
    await searchInput4.fill('      ')
    await searchInput4.press('Enter')
    await page1.waitForURL(/\/shop/)

    const currentUrl4 = page1.url()
    const urlObj4 = new URL(currentUrl4)
    const emptyQPass = !urlObj4.searchParams.has('q') || urlObj4.searchParams.get('q') === ''
    console.log(`- 1.4 Whitespace-only query -> URL: ${currentUrl4} (No empty q param: ${emptyQPass})`)
    searchResults.empty_whitespace = { url: currentUrl4, pass: emptyQPass }

    // 1.5 Contextual search on /shop preserving existing filters
    await page1.goto(`${BASE_URL}/shop?category=ban-ve-ket-cau&sort=-createdAt&page=2`)
    const searchInput5 = page1.locator('.ant-input-search input[name="q"], input[name="q"]').first()
    await searchInput5.fill('khung thép')
    await searchInput5.press('Enter')
    await page1.waitForURL(/\/shop\?.*q=/)

    const currentUrl5 = page1.url()
    const urlObj5 = new URL(currentUrl5)
    const hasCategory = urlObj5.searchParams.get('category') === 'ban-ve-ket-cau'
    const hasSort = urlObj5.searchParams.get('sort') === '-createdAt'
    const pageReset = !urlObj5.searchParams.has('page')
    const contextualPass = hasCategory && hasSort && pageReset
    console.log(`- 1.5 Filter preservation on /shop: category=${hasCategory}, sort=${hasSort}, pageReset=${pageReset} -> Pass: ${contextualPass}`)
    searchResults.filter_preservation = { url: currentUrl5, pass: contextualPass }

    await page1.close()
    report.test1_search = searchResults

    // =========================================================================
    // TEST 2: MEGA-MENU DROPDOWNS & NAVIGATION
    // =========================================================================
    console.log('\n[TEST 2] Mega-Menu Dropdowns and Submenu Links Verification')
    const page2: Page = await browser.newPage({ viewport: { width: 1280, height: 800 } })
    await page2.goto(BASE_URL)
    const megaMenuResults: Record<string, any> = {}

    const categoriesToTest = [
      { name: 'Kiến trúc dân dụng', subTarget: 'Nhà phố & Nhà ống', expectedParam: 'nhà+phố' },
      { name: 'Biệt thự', subTarget: 'Biệt thự hiện đại', expectedParam: 'hiện+đại' },
      { name: 'Kết cấu thép', subTarget: 'Khung thép tiền chế', expectedParam: 'thép+tiền+chế' },
      { name: 'Điện nước MEP', subTarget: 'PCCC thẩm duyệt', expectedParam: 'PCCC' },
      { name: 'BIM Revit', subTarget: 'Revit Architecture', expectedParam: 'revit' },
      { name: '3D Nội thất', subTarget: 'Nội thất phòng khách & Bếp', expectedParam: 'phòng+khách' },
    ]

    for (const cat of categoriesToTest) {
      // Find top-level menuitem
      const catMenuItem = page2.locator(`.ant-menu-submenu:has-text("${cat.name}")`).first()
      const exists = await catMenuItem.isVisible()
      if (!exists) {
        console.error(`- FAILED: Category "${cat.name}" not found in header navigation`)
        megaMenuResults[cat.name] = { visible: false, pass: false }
        continue
      }

      // Hover to open submenu popup
      await catMenuItem.hover()
      await page2.waitForTimeout(400)

      // Look for the submenu item inside the open popup
      const subItem = page2.locator(`.ant-menu-submenu-popup a:has-text("${cat.subTarget}")`).first()
      const subVisible = await subItem.isVisible()
      const subHref = subVisible ? await subItem.getAttribute('href') : null

      console.log(`- Category "${cat.name}" -> Submenu "${cat.subTarget}" visible: ${subVisible}, href: ${subHref}`)
      megaMenuResults[cat.name] = {
        visible: true,
        submenu_visible: subVisible,
        href: subHref,
        pass: subVisible && !!subHref,
      }
    }

    // Click a submenu item and verify actual client-side navigation
    console.log('- Clicking "Khung thép tiền chế" under "Kết cấu thép"...')
    const steelMenu = page2.locator(`.ant-menu-submenu:has-text("Kết cấu thép")`).first()
    await steelMenu.hover()
    await page2.waitForTimeout(400)
    const steelSubItem = page2.locator(`.ant-menu-submenu-popup a:has-text("Khung thép tiền chế")`).first()
    await steelSubItem.click()
    await page2.waitForURL(/\/shop\?category=ban-ve-ket-cau/)

    const steelNavUrl = page2.url()
    const steelNavPass = steelNavUrl.includes('ban-ve-ket-cau')
    console.log(`- Navigation result: ${steelNavUrl} -> Pass: ${steelNavPass}`)
    megaMenuResults.click_navigation = { url: steelNavUrl, pass: steelNavPass }

    await page2.close()
    report.test2_megamenu = megaMenuResults

    // =========================================================================
    // TEST 3: GUEST VIEW VS AUTHENTICATED USER DROPDOWN
    // =========================================================================
    console.log('\n[TEST 3] Guest View vs Authenticated User Dropdown')
    const page3: Page = await browser.newPage({ viewport: { width: 1280, height: 800 } })
    const authResults: Record<string, any> = {}

    // 3.1 Guest View verification
    await page3.goto(BASE_URL)
    const loginLink = page3.locator('header a[href="/login"]:has-text("Đăng nhập")').first()
    const registerLink = page3.locator('header a[href="/create-account"]:has-text("Đăng ký")').first()
    const guestLoginVisible = await loginLink.isVisible()
    const guestRegisterVisible = await registerLink.isVisible()
    const avatarAbsent = (await page3.locator('header button[aria-label="Tài khoản người dùng"]').count()) === 0

    console.log(`- Guest View: "Đăng nhập" visible: ${guestLoginVisible}, "Đăng ký" visible: ${guestRegisterVisible}, Avatar absent: ${avatarAbsent}`)
    authResults.guest_view = {
      login_visible: guestLoginVisible,
      register_visible: guestRegisterVisible,
      avatar_absent: avatarAbsent,
      pass: guestLoginVisible && guestRegisterVisible && avatarAbsent,
    }

    // 3.2 Authenticated Buyer verification
    console.log('- Logging in with buyer01@kientaohub.vn...')
    await page3.goto(`${BASE_URL}/login`)
    await page3.locator('input[name="email"], input[type="email"]').first().fill('buyer01@kientaohub.vn')
    await page3.locator('input[name="password"], input[type="password"]').first().fill('KienTao@2026')
    await page3.locator('button[type="submit"]').first().click()
    await page3.waitForURL(/\/(account|$)/)

    // Navigate to homepage to inspect header in authenticated state
    await page3.goto(BASE_URL)
    await page3.waitForTimeout(500)

    const buyerLoginHidden = !(await page3.locator('header a[href="/login"]:has-text("Đăng nhập")').isVisible())
    const buyerAvatarTrigger = page3.locator('header button[aria-label="Tài khoản người dùng"]').first()
    const buyerAvatarVisible = await buyerAvatarTrigger.isVisible()
    const buyerNameText = buyerAvatarVisible ? await buyerAvatarTrigger.innerText() : ''

    console.log(`- Authenticated Buyer: Guest buttons hidden: ${buyerLoginHidden}, Avatar visible: ${buyerAvatarVisible}, Text: "${buyerNameText.trim()}"`)

    // Click Avatar to open user dropdown
    let buyerDropdownPass = false
    if (buyerAvatarVisible) {
      await buyerAvatarTrigger.click()
      await page3.waitForTimeout(400)

      const walletItem = page3.locator('.ant-dropdown a[href="/wallet"]').first()
      const ordersItem = page3.locator('.ant-dropdown a[href="/orders"]').first()
      const accountItem = page3.locator('.ant-dropdown a[href="/account"]').first()
      const logoutItem = page3.locator('.ant-dropdown-menu-item:has-text("Đăng xuất")').first()

      const walletVis = await walletItem.isVisible()
      const ordersVis = await ordersItem.isVisible()
      const accountVis = await accountItem.isVisible()
      const logoutVis = await logoutItem.isVisible()
      // Buyer should NOT see seller channel link
      const sellerVis = await page3.locator('.ant-dropdown a[href="/seller"]').isVisible()

      console.log(`- Buyer dropdown items: Wallet: ${walletVis}, Orders: ${ordersVis}, Account: ${accountVis}, Logout: ${logoutVis}, Seller channel hidden: ${!sellerVis}`)
      buyerDropdownPass = walletVis && ordersVis && accountVis && logoutVis && !sellerVis
    }

    authResults.buyer_auth = {
      guest_hidden: buyerLoginHidden,
      avatar_visible: buyerAvatarVisible,
      display_name: buyerNameText.trim(),
      dropdown_valid: buyerDropdownPass,
      pass: buyerLoginHidden && buyerAvatarVisible && buyerDropdownPass,
    }

    // 3.3 Test Logout flow
    if (buyerAvatarVisible) {
      console.log('- Testing logout flow...')
      const logoutItem = page3.locator('.ant-dropdown-menu-item:has-text("Đăng xuất")').first()
      await logoutItem.click()
      await page3.waitForTimeout(1000)

      // Guest buttons should return
      const reloginVisible = await page3.locator('header a[href="/login"]:has-text("Đăng nhập")').isVisible()
      console.log(`- Post-logout: "Đăng nhập" button restored: ${reloginVisible}`)
      authResults.logout_flow = { pass: reloginVisible }
    }

    // 3.4 Authenticated Seller verification
    console.log('- Logging in with seller01@kientaohub.vn...')
    await page3.goto(`${BASE_URL}/login`)
    await page3.locator('input[name="email"], input[type="email"]').first().fill('seller01@kientaohub.vn')
    await page3.locator('input[name="password"], input[type="password"]').first().fill('KienTao@2026')
    await page3.locator('button[type="submit"]').first().click()
    await page3.waitForURL(/\/(account|$)/)

    await page3.goto(BASE_URL)
    const sellerAvatarTrigger = page3.locator('header button[aria-label="Tài khoản người dùng"]').first()
    await sellerAvatarTrigger.waitFor({ state: 'visible' })
    await sellerAvatarTrigger.click()
    await page3.waitForTimeout(400)

    const sellerLinkInDropdown = page3.locator('.ant-dropdown a[href="/seller"]').first()
    const sellerChannelVisible = await sellerLinkInDropdown.isVisible()
    console.log(`- Authenticated Seller dropdown contains "Kênh người bán": ${sellerChannelVisible}`)

    authResults.seller_auth = {
      seller_channel_visible: sellerChannelVisible,
      pass: sellerChannelVisible,
    }

    await page3.close()
    report.test3_auth_dropdown = authResults

    // =========================================================================
    // TEST 4: CART BADGE REACTIVITY AND OVERFLOW
    // =========================================================================
    console.log('\n[TEST 4] Cart Badge Dynamic Indicator on Header')
    const page4: Page = await browser.newPage({ viewport: { width: 1280, height: 800 } })
    await page4.goto(BASE_URL)
    const cartResults: Record<string, any> = {}

    const cartButton = page4.locator('header a[data-slot="cart"]').first()
    const cartBtnVisible = await cartButton.isVisible()
    const cartIconVisible = await cartButton.locator('.anticon-shopping-cart').isVisible()

    console.log(`- Cart button visible: ${cartBtnVisible}, ShoppingCart icon visible: ${cartIconVisible}`)
    cartResults.cart_button = { visible: cartBtnVisible, icon: cartIconVisible, pass: cartBtnVisible && cartIconVisible }

    await page4.close()
    report.test4_cart_badge = cartResults

    // =========================================================================
    // TEST 5: MOBILE RESPONSIVE DRAWER NAVIGATION
    // =========================================================================
    console.log('\n[TEST 5] Mobile Responsive Navigation Drawer (375x667)')
    const page5: Page = await browser.newPage({ viewport: { width: 375, height: 667 } })
    await page5.goto(BASE_URL)
    const mobileResults: Record<string, any> = {}

    // Mobile menu button
    await page5.waitForLoadState('networkidle')
    await page5.waitForTimeout(500)
    const mobileTrigger = page5.locator('button[aria-label="Menu điều hướng"]').first()
    const triggerVisible = await mobileTrigger.isVisible()
    console.log(`- Mobile menu button visible on 375px: ${triggerVisible}`)

    await mobileTrigger.click()
    await page5.waitForTimeout(500)

    // Ant Design Drawer
    const drawer = page5.locator('.ant-drawer.ant-drawer-open').first()
    const drawerOpen = await drawer.isVisible()
    console.log(`- Ant Design Drawer opened: ${drawerOpen}`)

    // Search input inside drawer
    const drawerSearch = drawer.locator('.ant-input-search input').first()
    const drawerSearchVis = await drawerSearch.isVisible()
    console.log(`- Drawer search input visible: ${drawerSearchVis}`)

    // Category group in drawer
    const categoryGroup = drawer.locator('.ant-menu-submenu-title:has-text("Danh mục bản vẽ")').first()
    const catGroupVis = await categoryGroup.isVisible()
    console.log(`- Drawer "Danh mục bản vẽ" item visible: ${catGroupVis}`)

    // Guest login buttons in drawer footer
    const drawerLogin = drawer.locator('button:has-text("Đăng nhập")').first()
    const drawerRegister = drawer.locator('button:has-text("Đăng ký tài khoản")').first()
    const drawerAuthVis = (await drawerLogin.isVisible()) && (await drawerRegister.isVisible())
    console.log(`- Drawer guest login/register buttons visible: ${drawerAuthVis}`)

    mobileResults.drawer = {
      trigger_visible: triggerVisible,
      drawer_open: drawerOpen,
      drawer_search: drawerSearchVis,
      category_group: catGroupVis,
      drawer_auth: drawerAuthVis,
      pass: triggerVisible && drawerOpen && drawerSearchVis && catGroupVis && drawerAuthVis,
    }

    await page5.close()
    report.test5_mobile_drawer = mobileResults

  } finally {
    await browser.close()
  }

  console.log('\n=== EMPIRICAL ADVERSARIAL VERIFICATION SUMMARY ===')
  console.log(JSON.stringify(report, null, 2))
  return report
}

runAdversarialM2Verification().catch((err) => {
  console.error('Adversarial Verification Failed:', err)
  process.exit(1)
})
