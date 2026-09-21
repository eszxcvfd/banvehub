import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react'
import { MobileMenu } from '@/components/Header/MobileMenu'
import { FooterClient } from '@/components/Footer/index.client'
import { AntdConfigProvider } from '@/providers/Antd'
import { ThemeProvider, useTheme } from '@/providers/Theme'
import fs from 'fs'
import path from 'path'

// ---------------------------------------------------------------------------
// GLOBAL JSDOM POLYFILLS & MOCKS
// ---------------------------------------------------------------------------

class MockResizeObserver {
  observe = vi.fn()
  unobserve = vi.fn()
  disconnect = vi.fn()
}
// @ts-ignore
global.ResizeObserver = MockResizeObserver

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

describe('M2 Challenger 2: Mobile Drawer, Footer, Theme & Boundary Verification', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockPathname = '/'
    mockSearchParams = new URLSearchParams()
    mockUser = null
    localStorage.clear()
    document.documentElement.removeAttribute('data-theme')

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
  // 1. MOBILE DRAWER EMPIRICAL TESTS
  // =========================================================================
  describe('1. Mobile Drawer Navigation & Auto-Close Logic', () => {
    it('1.1. Renders trigger button with aria-label="Menu điều hướng" and opens drawer on click', () => {
      const { container } = render(
        <AntdConfigProvider>
          <MobileMenu />
        </AntdConfigProvider>,
      )

      const trigger = screen.getByRole('button', { name: /Menu điều hướng/i })
      expect(trigger).toBeTruthy()

      // Click trigger to open drawer
      fireEvent.click(trigger)

      // Drawer title should appear in document
      expect(screen.getByText('Kiến Tạo Hub')).toBeTruthy()
      expect(screen.getByText('Sàn giao dịch CAD/BIM')).toBeTruthy()
    })

    it('1.2. Guest mode displays login and register CTA buttons in drawer footer', () => {
      mockUser = null
      render(
        <AntdConfigProvider>
          <MobileMenu />
        </AntdConfigProvider>,
      )

      fireEvent.click(screen.getByRole('button', { name: /Menu điều hướng/i }))

      const loginBtn = screen.getByRole('button', { name: /Đăng nhập/i })
      const registerBtn = screen.getByRole('button', { name: /Đăng ký tài khoản/i })
      expect(loginBtn).toBeTruthy()
      expect(registerBtn).toBeTruthy()

      // Click login button
      fireEvent.click(loginBtn)
      expect(mockRouterPush).toHaveBeenCalledWith('/login')
    })

    it('1.3. Authenticated mode displays user avatar, name, orders, account, and logout buttons', () => {
      mockUser = {
        name: 'KTS Minh Quân',
        email: 'quan@kientaohub.vn',
        roles: ['seller'],
      }

      render(
        <AntdConfigProvider>
          <MobileMenu />
        </AntdConfigProvider>,
      )

      fireEvent.click(screen.getByRole('button', { name: /Menu điều hướng/i }))

      expect(screen.getByText('KTS Minh Quân')).toBeTruthy()
      expect(screen.getByText('quan@kientaohub.vn')).toBeTruthy()
      expect(screen.getByText('Người bán')).toBeTruthy()

      const ordersBtn = screen.getByRole('button', { name: /Đơn hàng/i })
      const accountBtn = screen.getByRole('button', { name: /Tài khoản/i })
      const logoutBtn = screen.getByRole('button', { name: /Đăng xuất/i })

      expect(ordersBtn).toBeTruthy()
      expect(accountBtn).toBeTruthy()
      expect(logoutBtn).toBeTruthy()

      fireEvent.click(ordersBtn)
      expect(mockRouterPush).toHaveBeenCalledWith('/orders')
    })

    it('1.4. Search inside drawer: pushes to /shop?q=... with properly trimmed query and closes drawer', () => {
      render(
        <AntdConfigProvider>
          <MobileMenu />
        </AntdConfigProvider>,
      )

      fireEvent.click(screen.getByRole('button', { name: /Menu điều hướng/i }))

      const searchInput = screen.getByPlaceholderText('Tìm kiếm bản vẽ, CAD, BIM...')
      expect(searchInput).toBeTruthy()

      fireEvent.change(searchInput, { target: { value: '  bản vẽ móng cọc  ' } })
      fireEvent.keyDown(searchInput, { key: 'Enter', code: 'Enter' })

      const destination = mockRouterPush.mock.calls[0][0]
      expect(destination).toMatch(/^\/shop\?q=/)
      expect(decodeURIComponent(destination.replace(/\+/g, ' '))).toBe('/shop?q=bản vẽ móng cọc')
    })

    it('1.5. Viewport resize auto-close: expands window from mobile to desktop (1280px) and closes drawer', () => {
      // Start at mobile width
      window.innerWidth = 375

      const { container } = render(
        <AntdConfigProvider>
          <MobileMenu />
        </AntdConfigProvider>,
      )

      // Open drawer
      fireEvent.click(screen.getByRole('button', { name: /Menu điều hướng/i }))
      expect(container.ownerDocument.querySelector('.ant-drawer-open')).toBeTruthy()

      // Simulate window resize to mobile width (500px) -> should stay open
      act(() => {
        window.innerWidth = 500
        window.dispatchEvent(new Event('resize'))
      })
      expect(container.ownerDocument.querySelector('.ant-drawer-open')).toBeTruthy()

      // Simulate window resize to desktop width (1280px >= 768px) -> should auto-close!
      act(() => {
        window.innerWidth = 1280
        window.dispatchEvent(new Event('resize'))
      })

      expect(container.ownerDocument.querySelector('.ant-drawer-open')).toBeNull()
    })
  })

  // =========================================================================
  // 2. 4-COLUMN FOOTER EMPIRICAL TESTS
  // =========================================================================
  describe('2. 4-Column Footer Structure & Navigation Links', () => {
    const mockFooterData = {
      contactPhone: '1900 6868',
      contactEmail: 'hotro@kientaohub.vn',
      contactNote: 'Hỗ trợ kỹ thuật: 08:00 - 22:00 (T2 - CN)',
      navItems: [],
    } as any

    it('2.1. Renders Column 1 with brand slogan and verified contact hrefs (tel, mailto)', () => {
      render(
        <AntdConfigProvider>
          <FooterClient footer={mockFooterData} />
        </AntdConfigProvider>,
      )

      expect(screen.getByText('Kiến Tạo Hub')).toBeTruthy()
      expect(
        screen.getByText(/Nền tảng thương mại & chia sẻ tài nguyên bản vẽ kỹ thuật/),
      ).toBeTruthy()

      const telLink = screen.getByText('1900 6868').closest('a')
      expect(telLink?.getAttribute('href')).toBe('tel:19006868')

      const mailLink = screen.getByText('hotro@kientaohub.vn').closest('a')
      expect(mailLink?.getAttribute('href')).toBe('mailto:hotro@kientaohub.vn')

      expect(screen.getByText(/123 Phố Xã Đàn/)).toBeTruthy()
    })

    it('2.2. Renders Column 2 with all 5 mandatory drawing category links', () => {
      render(
        <AntdConfigProvider>
          <FooterClient footer={mockFooterData} />
        </AntdConfigProvider>,
      )

      expect(screen.getByText('Danh mục bản vẽ')).toBeTruthy()

      const expectedCategories = [
        { label: 'Kiến trúc dân dụng', href: '/shop?category=ban-ve-kien-truc' },
        { label: 'Bản vẽ Kết cấu', href: '/shop?category=ban-ve-ket-cau' },
        { label: 'Cơ điện (MEP)', href: '/shop?category=ban-ve-co-dien-mep' },
        { label: 'Mô hình BIM Revit', href: '/shop?category=mo-hinh-bim-revit' },
        { label: 'Thư viện 3ds Max / Sketchup', href: '/shop?category=thu-vien-sketchup-3dsmax' },
      ]

      for (const item of expectedCategories) {
        const link = screen.getByText(item.label).closest('a')
        expect(link, `Category link "${item.label}" must exist`).toBeTruthy()
        expect(link?.getAttribute('href')).toBe(item.href)
      }
    })

    it('2.3. Renders Column 3 with all 4 policy & guide links', () => {
      render(
        <AntdConfigProvider>
          <FooterClient footer={mockFooterData} />
        </AntdConfigProvider>,
      )

      expect(screen.getByText('Hướng dẫn & Chính sách')).toBeTruthy()

      const expectedPolicies = [
        { label: 'Quy trình mua bản vẽ', href: '/find-order' },
        { label: 'Hướng dẫn nạp ví', href: '/wallet' },
        { label: 'Chính sách hoàn tiền 100%', href: '/chinh-sach-hoan-tien' },
        { label: 'Điều khoản tác giả & Kênh bán', href: '/seller' },
      ]

      for (const item of expectedPolicies) {
        const link = screen.getByText(item.label).closest('a')
        expect(link, `Policy link "${item.label}" must exist`).toBeTruthy()
        expect(link?.getAttribute('href')).toBe(item.href)
      }
    })

    it('2.4. Renders Column 4 with payment badges, security badges and ThemeSelector', () => {
      render(
        <AntdConfigProvider>
          <FooterClient footer={mockFooterData} />
        </AntdConfigProvider>,
      )

      expect(screen.getByText('Thanh toán & Tiện ích')).toBeTruthy()
      expect(screen.getByText('Phương thức thanh toán')).toBeTruthy()
      // No Stripe rail exists (decision 0013): the footer shows only processable methods
      expect(screen.queryByText('Stripe')).toBeNull()
      expect(screen.getByText('VietQR')).toBeTruthy()
      expect(screen.getByText('Thẻ ATM/Visa')).toBeTruthy()

      expect(screen.getByText('Chứng nhận an toàn')).toBeTruthy()
      expect(screen.getByText('Bảo mật SSL')).toBeTruthy()
      expect(screen.getByText('Cam kết 100%')).toBeTruthy()

      expect(screen.getByText('Chế độ hiển thị')).toBeTruthy()
    })
  })

  // =========================================================================
  // 3. THEME TOKEN SYNCHRONIZATION EMPIRICAL TESTS
  // =========================================================================
  describe('3. Footer Theme Switching & Token Transition', () => {
    it('3.1. Footer applies smooth CSS transition for background-color and border-color', () => {
      const { container } = render(
        <ThemeProvider>
          <AntdConfigProvider>
            <FooterClient />
          </AntdConfigProvider>
        </ThemeProvider>,
      )

      const footerEl = container.querySelector('footer.ant-layout-footer') as HTMLElement
      expect(footerEl).toBeTruthy()
      expect(footerEl.style.transition).toContain('background-color 0.2s ease')
      expect(footerEl.style.transition).toContain('border-color 0.2s ease')
    })

    it('3.2. Switching from light to dark dynamically alters footer background and border style attributes', () => {
      const TestThemeHarness = () => {
        const { setTheme } = useTheme()
        return (
          <div>
            <button data-testid="set-dark" onClick={() => setTheme('dark')}>
              Dark
            </button>
            <button data-testid="set-light" onClick={() => setTheme('light')}>
              Light
            </button>
            <FooterClient />
          </div>
        )
      }

      const { container } = render(
        <ThemeProvider>
          <AntdConfigProvider>
            <TestThemeHarness />
          </AntdConfigProvider>
        </ThemeProvider>,
      )

      const footerEl = container.querySelector('footer.ant-layout-footer') as HTMLElement
      const initialBg = footerEl.style.backgroundColor

      // Switch to Dark mode
      act(() => {
        screen.getByTestId('set-dark').click()
      })

      const darkBg = footerEl.style.backgroundColor
      expect(darkBg).not.toBe(initialBg)

      // Switch back to Light mode
      act(() => {
        screen.getByTestId('set-light').click()
      })

      const revertedBg = footerEl.style.backgroundColor
      expect(revertedBg).toBe(initialBg)
    })
  })

  // =========================================================================
  // 4. BOUNDARY ISOLATION ARCHITECTURAL AUDIT
  // =========================================================================
  describe('4. Strict Boundary Isolation Architectural Audit', () => {
    it('4.1. Admin layout (payload)/layout.tsx does NOT import AntdRegistry, AntdConfigProvider, or antd css', () => {
      const adminLayoutPath = path.resolve(
        process.cwd(),
        'src/app/(payload)/layout.tsx',
      )
      const content = fs.readFileSync(adminLayoutPath, 'utf8')

      expect(content).not.toContain('AntdRegistry')
      expect(content).not.toContain('AntdConfigProvider')
      expect(content).not.toContain("from 'antd'")
      expect(content).not.toContain("from '@ant-design")
      expect(content).not.toContain('antd.css')
    })

    it('4.2. Storefront layout (app)/layout.tsx DOES wrap children with AntdRegistry', () => {
      const storefrontLayoutPath = path.resolve(
        process.cwd(),
        'src/app/(app)/layout.tsx',
      )
      const content = fs.readFileSync(storefrontLayoutPath, 'utf8')

      expect(content).toContain('AntdRegistry')
      expect(content).toContain('<AntdRegistry>')
      expect(content).toContain('</AntdRegistry>')
    })
  })
})
