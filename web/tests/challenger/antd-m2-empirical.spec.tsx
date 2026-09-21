import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { Search } from '@/components/Search'
import { CategoryMenu } from '@/components/Header/CategoryMenu'
import { HeaderClient } from '@/components/Header/index.client'
import { OpenCartButton } from '@/components/Cart/OpenCart'
import { AntdConfigProvider } from '@/providers/Antd'

// ---------------------------------------------------------------------------
// GLOBAL JSDOM POLYFILLS
// ---------------------------------------------------------------------------

class MockResizeObserver {
  observe = vi.fn()
  unobserve = vi.fn()
  disconnect = vi.fn()
}
// @ts-ignore
global.ResizeObserver = MockResizeObserver

// ---------------------------------------------------------------------------
// MOCKS
// ---------------------------------------------------------------------------

const mockRouterPush = vi.fn()
let mockPathname = '/'
let mockSearchParams = new URLSearchParams()

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockRouterPush,
  }),
  usePathname: () => mockPathname,
  useSearchParams: () => mockSearchParams,
}))

vi.mock('next/link', () => ({
  default: ({
    href,
    children,
    className,
    onClick,
    ...props
  }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a
      href={href}
      className={className}
      onClick={(e) => {
        onClick?.(e)
      }}
      {...props}
    >
      {children}
    </a>
  ),
}))

// Mock Auth Provider
let mockUser: any = null
const mockLogout = vi.fn().mockResolvedValue(undefined)

vi.mock('@/providers/Auth', () => ({
  useAuth: () => ({
    user: mockUser,
    logout: mockLogout,
  }),
}))

// Mock Cart Provider — the storefront's cart lives in `@/providers/Cart` (decision 0014), not in the
// plugin's context, whose `/api/carts` route this repository does not register.
let mockCartData: any = { items: [] }

vi.mock('@/providers/Cart', () => ({
  useCart: () => ({
    cart: mockCartData,
  }),
}))

// Wrapper component to supply AntdConfigProvider
const TestWrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  return <AntdConfigProvider>{children}</AntdConfigProvider>
}

// ---------------------------------------------------------------------------
// TEST SUITE
// ---------------------------------------------------------------------------

describe('M2 Challenger: Header, Navigation, Search & Mega-Menu Empirical Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockPathname = '/'
    mockSearchParams = new URLSearchParams()
    mockUser = null
    mockCartData = { items: [] }

    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn().mockImplementation((query) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    })
  })

  afterEach(() => {
    cleanup()
  })

  // =========================================================================
  // 1. SEARCH INPUT ADVERSARIAL STRESS-TESTS
  // =========================================================================
  describe('1. Search Input Adversarial Tests', () => {
    it('redirects to /shop?q=... with Vietnamese text and diacritics', () => {
      render(
        <TestWrapper>
          <Search />
        </TestWrapper>,
      )

      const input = screen.getByPlaceholderText(/Tìm kiếm bản vẽ CAD/i)
      fireEvent.change(input, { target: { value: 'Bản vẽ biệt thự 3 tầng hiện đại' } })
      fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' })

      expect(mockRouterPush).toHaveBeenCalledWith(
        `/shop?q=${encodeURIComponent('Bản vẽ biệt thự 3 tầng hiện đại')}`,
      )
    })

    it('adversarial input: handles special characters without URL corruption', () => {
      render(
        <TestWrapper>
          <Search />
        </TestWrapper>,
      )

      const input = screen.getByPlaceholderText(/Tìm kiếm bản vẽ CAD/i)
      const specialQuery = 'CAD & BIM / MEP + 3D #1 ? "test" <script>alert(1)</script>'
      fireEvent.change(input, { target: { value: specialQuery } })
      fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' })

      expect(mockRouterPush).toHaveBeenCalledWith(
        `/shop?q=${encodeURIComponent(specialQuery)}`,
      )
    })

    it('adversarial input: trims multiple leading, trailing, and redundant spaces', () => {
      render(
        <TestWrapper>
          <Search />
        </TestWrapper>,
      )

      const input = screen.getByPlaceholderText(/Tìm kiếm bản vẽ CAD/i)
      fireEvent.change(input, { target: { value: '   kết cấu thép tiền chế   ' } })
      fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' })

      expect(mockRouterPush).toHaveBeenCalledWith(
        `/shop?q=${encodeURIComponent('kết cấu thép tiền chế')}`,
      )
    })

    it('adversarial input: submits whitespace-only query and redirects safely to /shop without empty q param', () => {
      render(
        <TestWrapper>
          <Search />
        </TestWrapper>,
      )

      const input = screen.getByPlaceholderText(/Tìm kiếm bản vẽ CAD/i)
      fireEvent.change(input, { target: { value: '     ' } })
      fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' })

      expect(mockRouterPush).toHaveBeenCalledWith('/shop')
    })

    it('search on /shop page: preserves existing query parameters while setting q and removing page', () => {
      mockPathname = '/shop'
      mockSearchParams = new URLSearchParams('category=ban-ve-kien-truc&sort=-createdAt&page=3')

      render(
        <TestWrapper>
          <Search />
        </TestWrapper>,
      )

      const input = screen.getByPlaceholderText(/Tìm kiếm bản vẽ CAD/i)
      fireEvent.change(input, { target: { value: 'nhà ống' } })
      fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' })

      expect(mockRouterPush).toHaveBeenCalled()
      const destination = mockRouterPush.mock.calls[0][0]
      expect(destination).toContain('category=ban-ve-kien-truc')
      expect(destination).toContain('sort=-createdAt')
      expect(destination).toContain('q=nh%C3%A0+%E1%BB%91ng')
      expect(destination).not.toContain('page=')
    })

    it('search on /shop page: clears q and resets page when submitting empty search', () => {
      mockPathname = '/shop'
      mockSearchParams = new URLSearchParams('category=ban-ve-ket-cau&q=nha-xuong&page=2')

      render(
        <TestWrapper>
          <Search />
        </TestWrapper>,
      )

      const input = screen.getByPlaceholderText(/Tìm kiếm bản vẽ CAD/i)
      fireEvent.change(input, { target: { value: '' } })
      fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' })

      expect(mockRouterPush).toHaveBeenCalledWith('/shop?category=ban-ve-ket-cau')
    })

    it('triggers onSearchSubmit callback when provided', () => {
      const onSubmit = vi.fn()
      render(
        <TestWrapper>
          <Search onSearchSubmit={onSubmit} />
        </TestWrapper>,
      )

      const input = screen.getByPlaceholderText(/Tìm kiếm bản vẽ CAD/i)
      fireEvent.change(input, { target: { value: 'BIM Revit' } })
      fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' })

      expect(onSubmit).toHaveBeenCalledTimes(1)
    })
  })

  // =========================================================================
  // 2. MEGA-MENU CATEGORIES AND SUBMENUS STRESS-TESTS
  // =========================================================================
  describe('2. Mega-Menu Dropdowns and Navigation Tests', () => {
    it('renders all 6 architectural category items plus all-drawings in desktop Menu', () => {
      const { container } = render(
        <TestWrapper>
          <CategoryMenu />
        </TestWrapper>,
      )

      // Top-level menu items
      expect(screen.getByText('Tất cả bản vẽ')).toBeTruthy()
      expect(screen.getByText('Kiến trúc dân dụng')).toBeTruthy()
      expect(screen.getByText('Biệt thự')).toBeTruthy()
      expect(screen.getByText('Kết cấu thép')).toBeTruthy()
      expect(screen.getByText('Điện nước MEP')).toBeTruthy()
      expect(screen.getByText('BIM Revit')).toBeTruthy()
      expect(screen.getByText('3D Nội thất')).toBeTruthy()

      // Verify menu structure contains 7 top-level menuitems
      const menuItems = container.querySelectorAll('.ant-menu-item, .ant-menu-submenu')
      expect(menuItems.length).toBeGreaterThanOrEqual(7)
    })

    it('verifies all 6 category submenus have valid routing targets to /shop', () => {
      render(
        <TestWrapper>
          <CategoryMenu />
        </TestWrapper>,
      )

      // Submenu 1: Kiến trúc dân dụng links
      const kienTrucLink = screen.getByText('Kiến trúc dân dụng').closest('a')
      expect(kienTrucLink?.getAttribute('href')).toBe('/shop?category=ban-ve-kien-truc')

      // Submenu 2: Biệt thự links
      const villaLink = screen.getByText('Biệt thự').closest('a')
      expect(decodeURIComponent(villaLink?.getAttribute('href') || '')).toBe('/shop?category=ban-ve-kien-truc&q=biệt+thự')

      // Submenu 3: Kết cấu thép links
      const steelLink = screen.getByText('Kết cấu thép').closest('a')
      expect(steelLink?.getAttribute('href')).toBe('/shop?category=ban-ve-ket-cau')

      // Submenu 4: Điện nước MEP links
      const mepLink = screen.getByText('Điện nước MEP').closest('a')
      expect(mepLink?.getAttribute('href')).toBe('/shop?category=ban-ve-co-dien-mep')

      // Submenu 5: BIM Revit links
      const bimLink = screen.getByText('BIM Revit').closest('a')
      expect(bimLink?.getAttribute('href')).toBe('/shop?category=mo-hinh-bim-revit')

      // Submenu 6: 3D Nội thất links
      const interiorLink = screen.getByText('3D Nội thất').closest('a')
      expect(interiorLink?.getAttribute('href')).toBe('/shop?category=thiet-ke-noi-that')
    })

    it('detects activeCategoryKey accurately based on pathname and search params', () => {
      // Test category: ban-ve-kien-truc
      mockPathname = '/shop'
      mockSearchParams = new URLSearchParams('category=ban-ve-kien-truc')

      const { container, rerender } = render(
        <TestWrapper>
          <CategoryMenu />
        </TestWrapper>,
      )

      let activeSubmenu = container.querySelector('.ant-menu-submenu-selected')
      expect(activeSubmenu).toBeTruthy()

      // Test category: villa (ban-ve-kien-truc + biệt thự)
      mockSearchParams = new URLSearchParams('category=ban-ve-kien-truc&q=biệt thự')
      rerender(
        <TestWrapper>
          <CategoryMenu />
        </TestWrapper>,
      )
      activeSubmenu = container.querySelector('.ant-menu-submenu-selected')
      expect(activeSubmenu).toBeTruthy()

      // Test category: ban-ve-ket-cau
      mockSearchParams = new URLSearchParams('category=ban-ve-ket-cau')
      rerender(
        <TestWrapper>
          <CategoryMenu />
        </TestWrapper>,
      )
      activeSubmenu = container.querySelector('.ant-menu-submenu-selected')
      expect(activeSubmenu).toBeTruthy()

      // Test category: all drawings (/shop with no params)
      mockSearchParams = new URLSearchParams('')
      rerender(
        <TestWrapper>
          <CategoryMenu />
        </TestWrapper>,
      )
      const activeItem = container.querySelector('.ant-menu-item-selected')
      expect(activeItem).toBeTruthy()
      expect(activeItem?.textContent).toContain('Tất cả bản vẽ')
    })
  })

  // =========================================================================
  // 3. USER DROPDOWN VS GUEST BUTTONS TESTS
  // =========================================================================
  describe('3. User Dropdown vs Guest Buttons Tests', () => {
    const fakeHeader = {
      id: 1,
      navItems: [],
      updatedAt: '2026-01-01',
      createdAt: '2026-01-01',
    } as any

    it('guest view: renders "Đăng nhập" and "Đăng ký" buttons, hides avatar dropdown', () => {
      mockUser = null

      render(
        <TestWrapper>
          <HeaderClient header={fakeHeader} />
        </TestWrapper>,
      )

      const loginBtn = screen.getByText('Đăng nhập').closest('a')
      const registerBtn = screen.getByText('Đăng ký').closest('a')

      expect(loginBtn).toBeTruthy()
      expect(registerBtn).toBeTruthy()
      expect(loginBtn?.getAttribute('href')).toBe('/login')
      expect(registerBtn?.getAttribute('href')).toBe('/create-account')

      // User avatar must NOT be rendered in guest mode
      expect(screen.queryByLabelText('Tài khoản người dùng')).toBeNull()
    })

    it('guest buttons: clicking "Đăng nhập" triggers router.push("/login")', () => {
      mockUser = null

      render(
        <TestWrapper>
          <HeaderClient header={fakeHeader} />
        </TestWrapper>,
      )

      const loginBtn = screen.getByText('Đăng nhập').closest('a')!
      fireEvent.click(loginBtn)

      expect(mockRouterPush).toHaveBeenCalledWith('/login')
    })

    it('guest buttons: clicking "Đăng ký" triggers router.push("/create-account")', () => {
      mockUser = null

      render(
        <TestWrapper>
          <HeaderClient header={fakeHeader} />
        </TestWrapper>,
      )

      const registerBtn = screen.getByText('Đăng ký').closest('a')!
      fireEvent.click(registerBtn)

      expect(mockRouterPush).toHaveBeenCalledWith('/create-account')
    })

    it('authenticated buyer view: renders avatar and displayName, hides guest buttons', () => {
      mockUser = {
        id: 9,
        name: 'Nguyễn Văn An',
        email: 'buyer01@kientaohub.vn',
        roles: ['buyer'],
      }

      render(
        <TestWrapper>
          <HeaderClient header={fakeHeader} />
        </TestWrapper>,
      )

      // Guest buttons must be gone
      expect(screen.queryByText('Đăng nhập')).toBeNull()
      expect(screen.queryByText('Đăng ký')).toBeNull()

      // User trigger button must exist
      const userTrigger = screen.getByLabelText('Tài khoản người dùng')
      expect(userTrigger).toBeTruthy()
      expect(userTrigger.textContent).toContain('Nguyễn Văn An')
      expect(userTrigger.textContent).toContain('N') // Initial
    })

    it('authenticated user fallback: resolves email prefix when name is missing', () => {
      mockUser = {
        id: 10,
        name: null,
        email: 'engineer99@kientaohub.vn',
        roles: ['buyer'],
      }

      render(
        <TestWrapper>
          <HeaderClient header={fakeHeader} />
        </TestWrapper>,
      )

      const userTrigger = screen.getByLabelText('Tài khoản người dùng')
      expect(userTrigger.textContent).toContain('engineer99')
      expect(userTrigger.textContent).toContain('E')
    })

    it('authenticated seller view: renders "KTS ArcStudio" and initial avatar', () => {
      mockUser = {
        id: 4,
        name: 'KTS ArcStudio',
        email: 'seller01@kientaohub.vn',
        roles: ['seller'],
      }

      render(
        <TestWrapper>
          <HeaderClient header={fakeHeader} />
        </TestWrapper>,
      )

      const userTrigger = screen.getByLabelText('Tài khoản người dùng')
      expect(userTrigger).toBeTruthy()
      expect(userTrigger.textContent).toContain('KTS ArcStudio')
      expect(userTrigger.textContent).toContain('K')
    })

    it('theme setting on navbar: renders ThemeNavSetting button with aria-label "Chế độ hiển thị"', () => {
      render(
        <TestWrapper>
          <HeaderClient header={fakeHeader} />
        </TestWrapper>,
      )

      const themeBtn = screen.getByLabelText('Chế độ hiển thị')
      expect(themeBtn).toBeTruthy()
    })
  })

  // =========================================================================
  // 4. CART BADGE REACTIVITY AND OVERFLOW TESTS
  // =========================================================================
  describe('4. Cart Badge Reactivity and Overflow Tests', () => {
    it('renders shopping cart link with aria-label and data-slot="cart"', () => {
      render(
        <TestWrapper>
          <OpenCartButton />
        </TestWrapper>,
      )

      const cartLink = screen.getByRole('link', { name: /giỏ hàng/i })
      expect(cartLink).toBeTruthy()
      expect(cartLink.getAttribute('href')).toBe('/cart')
      expect(cartLink.getAttribute('data-slot')).toBe('cart')
    })

    it('cart quantity 0: Ant Design Badge hides count by default (no zero badge clutter)', () => {
      mockCartData = { items: [] }

      const { container } = render(
        <TestWrapper>
          <OpenCartButton />
        </TestWrapper>,
      )

      const countBadge = container.querySelector('.ant-badge-count')
      expect(countBadge).toBeNull()
    })

    it('cart quantity updates reactively when cart items exist', () => {
      mockCartData = {
        items: [
          { id: 1, quantity: 2 },
          { id: 2, quantity: 3 },
        ],
      }

      const { container, rerender } = render(
        <TestWrapper>
          <OpenCartButton />
        </TestWrapper>,
      )

      let countBadge = container.querySelector('.ant-badge-count')
      expect(countBadge).not.toBeNull()
      // Ant Design Badge sets title attribute to the count number
      expect(countBadge?.getAttribute('title')).toBe('5')

      // Now update cart quantity to 10
      mockCartData = {
        items: [{ id: 1, quantity: 10 }],
      }

      rerender(
        <TestWrapper>
          <OpenCartButton />
        </TestWrapper>,
      )

      countBadge = container.querySelector('.ant-badge-count')
      expect(countBadge?.getAttribute('title')).toBe('10')
    })

    it('cart quantity overflow: renders 99+ title when total items exceed 99', () => {
      mockCartData = {
        items: [{ id: 1, quantity: 150 }],
      }

      const { container } = render(
        <TestWrapper>
          <OpenCartButton />
        </TestWrapper>,
      )

      const countBadge = container.querySelector('.ant-badge-count')
      expect(countBadge).not.toBeNull()
      // overflowCount={99} renders 99+ title or text
      expect(countBadge?.getAttribute('title')).toBe('150')
      expect(countBadge?.textContent).toContain('99+')
    })

    it('handles undefined item quantity by defaulting to 1 per item', () => {
      mockCartData = {
        items: [{ id: 1, quantity: null }, { id: 2 }],
      }

      const { container } = render(
        <TestWrapper>
          <OpenCartButton />
        </TestWrapper>,
      )

      const countBadge = container.querySelector('.ant-badge-count')
      expect(countBadge).not.toBeNull()
      expect(countBadge?.getAttribute('title')).toBe('2')
    })

    it('supports direct quantity prop override', () => {
      const { container } = render(
        <TestWrapper>
          <OpenCartButton quantity={7} />
        </TestWrapper>,
      )

      const countBadge = container.querySelector('.ant-badge-count')
      expect(countBadge).not.toBeNull()
      expect(countBadge?.getAttribute('title')).toBe('7')
    })
  })
})
