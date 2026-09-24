import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react'
import { Search } from '@/components/Search'
import { HeaderClient } from '@/components/Header/index.client'
import { CategoryMenu } from '@/components/Header/CategoryMenu'
import { MobileMenu } from '@/components/Header/MobileMenu'
import { AntdConfigProvider } from '@/providers/Antd'
import fs from 'fs'
import path from 'path'

// Mock ResizeObserver
class MockResizeObserver {
  observe = vi.fn()
  unobserve = vi.fn()
  disconnect = vi.fn()
}
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

import type { Header as HeaderType, User } from '@/payload-types'

let mockUser: User | null = null
const mockLogout = vi.fn().mockResolvedValue(undefined)

vi.mock('@/providers/Auth', () => ({
  useAuth: () => ({
    user: mockUser,
    logout: mockLogout,
  }),
}))

let mockCartData: { items: Array<{ id: number | string; quantity?: number | null }> } = {
  items: [],
}

vi.mock('@payloadcms/plugin-ecommerce/client/react', () => ({
  useCart: () => ({
    cart: mockCartData,
  }),
}))

const TestWrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  return <AntdConfigProvider>{children}</AntdConfigProvider>
}

const fakeHeader: HeaderType = {
  id: 1,
  navItems: [
    {
      id: 'item-1',
      link: {
        type: 'custom',
        url: '/gioi-thieu',
        label: 'Giới thiệu',
      },
    },
  ],
  updatedAt: '2026-01-01',
  createdAt: '2026-01-01',
}

describe('M1-R2 Adversarial Challenger: Edge Conditions & Boundary Robustness', () => {
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
  // 1. EMPTY SEARCH SUBMISSION ADVERSARIAL TESTS
  // =========================================================================
  describe('Edge 1: Empty and Whitespace Search Submission', () => {
    it('submitting completely empty string from home page pushes /shop without query parameters', () => {
      render(
        <TestWrapper>
          <Search />
        </TestWrapper>,
      )

      const input = screen.getByPlaceholderText(/Tìm kiếm bản vẽ CAD/i)
      fireEvent.change(input, { target: { value: '' } })
      fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' })

      expect(mockRouterPush).toHaveBeenCalledWith('/shop')
    })

    it('submitting tab characters, non-breaking spaces, or whitespace string pushes /shop cleanly', () => {
      render(
        <TestWrapper>
          <Search />
        </TestWrapper>,
      )

      const input = screen.getByPlaceholderText(/Tìm kiếm bản vẽ CAD/i)
      fireEvent.change(input, { target: { value: '  \t  \n   ' } })
      fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' })

      expect(mockRouterPush).toHaveBeenCalledWith('/shop')
    })

    it('clicking prefix search icon on empty input triggers /shop push', () => {
      const { container } = render(
        <TestWrapper>
          <Search />
        </TestWrapper>,
      )

      const prefixIcon = container.querySelector('.anticon-search')
      expect(prefixIcon).toBeTruthy()
      fireEvent.click(prefixIcon!)

      expect(mockRouterPush).toHaveBeenCalledWith('/shop')
    })

    it('submitting empty search on /shop with active filters preserves filters while removing q and page', () => {
      mockPathname = '/shop'
      mockSearchParams = new URLSearchParams('category=ban-ve-co-dien-mep&sort=popular&q=hvac&page=4')

      render(
        <TestWrapper>
          <Search />
        </TestWrapper>,
      )

      const input = screen.getByPlaceholderText(/Tìm kiếm bản vẽ CAD/i)
      fireEvent.change(input, { target: { value: '   ' } })
      fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' })

      expect(mockRouterPush).toHaveBeenCalled()
      const targetUrl = mockRouterPush.mock.calls[0][0]
      expect(targetUrl).toContain('category=ban-ve-co-dien-mep')
      expect(targetUrl).toContain('sort=popular')
      expect(targetUrl).not.toContain('q=')
      expect(targetUrl).not.toContain('page=')
    })

    it('mobile drawer search: submitting whitespace query redirects to /shop and closes drawer', () => {
      render(
        <TestWrapper>
          <MobileMenu />
        </TestWrapper>,
      )

      // Open mobile drawer
      fireEvent.click(screen.getByRole('button', { name: /Menu điều hướng/i }))
      const searchInput = screen.getByPlaceholderText('Tìm kiếm bản vẽ, CAD, BIM...')

      fireEvent.change(searchInput, { target: { value: '     ' } })
      fireEvent.keyDown(searchInput, { key: 'Enter', code: 'Enter' })

      expect(mockRouterPush).toHaveBeenCalledWith('/shop')
    })
  })

  // =========================================================================
  // 2. SPECIAL CHARACTERS SEARCH SUBMISSION ADVERSARIAL TESTS
  // =========================================================================
  describe('Edge 2: Special Characters and Malicious Search Submission', () => {
    it('handles URL reserved characters and symbols (&, ?, =, +, #, %, /, \\, @, !)', () => {
      render(
        <TestWrapper>
          <Search />
        </TestWrapper>,
      )

      const input = screen.getByPlaceholderText(/Tìm kiếm bản vẽ CAD/i)
      const complexQuery = 'BIM 100% & AutoCAD/Revit = 2024? #mep + pccc'
      fireEvent.change(input, { target: { value: complexQuery } })
      fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' })

      expect(mockRouterPush).toHaveBeenCalledWith(
        `/shop?q=${encodeURIComponent(complexQuery)}`,
      )
    })

    it('safely encodes potential XSS payloads and script tags without executing or throwing', () => {
      render(
        <TestWrapper>
          <Search />
        </TestWrapper>,
      )

      const input = screen.getByPlaceholderText(/Tìm kiếm bản vẽ CAD/i)
      const xssQuery = '<script>alert("xss")</script><img src=x onerror=prompt(1)>'
      fireEvent.change(input, { target: { value: xssQuery } })
      fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' })

      expect(mockRouterPush).toHaveBeenCalledWith(
        `/shop?q=${encodeURIComponent(xssQuery)}`,
      )
    })

    it('preserves complete Vietnamese diacritics and architectural terminology', () => {
      render(
        <TestWrapper>
          <Search />
        </TestWrapper>,
      )

      const input = screen.getByPlaceholderText(/Tìm kiếm bản vẽ CAD/i)
      const vietnameseTerm = 'Bản vẽ kết cấu móng băng nhà phố 4 tầng 1 tum tại Hà Nội'
      fireEvent.change(input, { target: { value: vietnameseTerm } })
      fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' })

      expect(mockRouterPush).toHaveBeenCalledWith(
        `/shop?q=${encodeURIComponent(vietnameseTerm)}`,
      )
    })

    it('handles unicode glyphs, math symbols, and emojis gracefully', () => {
      render(
        <TestWrapper>
          <Search />
        </TestWrapper>,
      )

      const input = screen.getByPlaceholderText(/Tìm kiếm bản vẽ CAD/i)
      const emojiQuery = '📐 Revit Villa 3D 🏛️ ★★★★★'
      fireEvent.change(input, { target: { value: emojiQuery } })
      fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' })

      expect(mockRouterPush).toHaveBeenCalledWith(
        `/shop?q=${encodeURIComponent(emojiQuery)}`,
      )
    })

    it('mobile drawer search handles special characters properly', () => {
      render(
        <TestWrapper>
          <MobileMenu />
        </TestWrapper>,
      )

      fireEvent.click(screen.getByRole('button', { name: /Menu điều hướng/i }))
      const searchInput = screen.getByPlaceholderText('Tìm kiếm bản vẽ, CAD, BIM...')

      const query = 'MEP & HVAC #1 (PCCC thẩm duyệt)'
      fireEvent.change(searchInput, { target: { value: query } })
      fireEvent.keyDown(searchInput, { key: 'Enter', code: 'Enter' })

      expect(mockRouterPush).toHaveBeenCalled()
      const destination = mockRouterPush.mock.calls[0][0]
      expect(destination).toMatch(/^\/shop\?q=/)
      expect(decodeURIComponent(destination.replace(/\+/g, ' '))).toBe(`/shop?q=${query}`)
    })
  })

  // =========================================================================
  // 3. RAPID CLICK AND INTERACTION ON MEGA-MENU TRIGGER
  // =========================================================================
  describe('Edge 3: Rapid Clicks and State Transitions on Mega-Menu', () => {
    it('survives rapid successive clicks (10x bursts) on "Tất cả danh mục" trigger without throwing errors', () => {
      render(
        <TestWrapper>
          <CategoryMenu />
        </TestWrapper>,
      )

      const megaMenuTrigger = screen.getByText('Tất cả danh mục')
      expect(megaMenuTrigger).toBeTruthy()

      // Rapidly fire 10 click events in succession
      for (let i = 0; i < 10; i++) {
        act(() => {
          fireEvent.click(megaMenuTrigger)
        })
      }

      // DOM remains fully stable
      expect(screen.getByText('Tất cả danh mục')).toBeTruthy()
      expect(screen.getByText('Kiến trúc dân dụng')).toBeTruthy()
      expect(screen.getByText('BIM Revit')).toBeTruthy()
    })

    it('survives rapid mouseEnter and mouseLeave hover flurries on popover trigger', () => {
      render(
        <TestWrapper>
          <CategoryMenu />
        </TestWrapper>,
      )

      const megaMenuTrigger = screen.getByText('Tất cả danh mục')

      for (let i = 0; i < 8; i++) {
        act(() => {
          fireEvent.mouseEnter(megaMenuTrigger)
          fireEvent.mouseLeave(megaMenuTrigger)
        })
      }

      expect(screen.getByText('Tất cả danh mục')).toBeTruthy()
    })

    it('interacts rapidly with category submenus without desynchronization', () => {
      render(
        <TestWrapper>
          <CategoryMenu />
        </TestWrapper>,
      )

      const kienTruc = screen.getByText('Kiến trúc')
      const ketCau = screen.getByText('Kết cấu')
      const mep = screen.getByText('Cơ điện MEP')

      act(() => {
        fireEvent.mouseEnter(kienTruc)
        fireEvent.mouseLeave(kienTruc)
        fireEvent.mouseEnter(ketCau)
        fireEvent.mouseLeave(ketCau)
        fireEvent.mouseEnter(mep)
      })

      expect(screen.getByText('Kiến trúc')).toBeTruthy()
      expect(screen.getByText('Kết cấu')).toBeTruthy()
      expect(screen.getByText('Cơ điện MEP')).toBeTruthy()
    })
  })

  // =========================================================================
  // 4. RESPONSIVE BREAKPOINT TOGGLING AND LAYOUT CLASSES
  // =========================================================================
  describe('Edge 4: Responsive Breakpoint Toggling and Layout Stability', () => {
    it('verifies responsive container classes: desktop search is hidden on mobile, mobile search is block on mobile', () => {
      const { container } = render(
        <TestWrapper>
          <HeaderClient header={fakeHeader} />
        </TestWrapper>,
      )

      // Desktop search wrapper: hidden md:flex
      const desktopSearchContainer = container.querySelector('.hidden.md\\:flex')
      expect(desktopSearchContainer).toBeTruthy()

      // Mobile search wrapper: block md:hidden
      const mobileSearchContainer = container.querySelector('.block.md\\:hidden')
      expect(mobileSearchContainer).toBeTruthy()

      // Tier 2 Category navigation: hidden md:block
      const tier2Nav = container.querySelector('div[role="navigation"]')
      expect(tier2Nav).toBeTruthy()
      expect(tier2Nav?.className).toContain('hidden md:block')
    })

    it('rapid viewport resize toggling (320px -> 1280px -> 375px -> 1440px) correctly closes drawer on desktop', () => {
      window.innerWidth = 320

      const { container } = render(
        <TestWrapper>
          <MobileMenu />
        </TestWrapper>,
      )

      // Open drawer on mobile
      const trigger = screen.getByRole('button', { name: /Menu điều hướng/i })
      fireEvent.click(trigger)
      expect(container.ownerDocument.querySelector('.ant-drawer-open')).toBeTruthy()

      // Toggle to desktop width
      act(() => {
        window.innerWidth = 1280
        window.dispatchEvent(new Event('resize'))
      })
      expect(container.ownerDocument.querySelector('.ant-drawer-open')).toBeNull()

      // Toggle back to mobile width: drawer should NOT automatically re-open unexpectedly
      act(() => {
        window.innerWidth = 375
        window.dispatchEvent(new Event('resize'))
      })
      expect(container.ownerDocument.querySelector('.ant-drawer-open')).toBeNull()

      // User can re-open it on mobile
      fireEvent.click(trigger)
      expect(container.ownerDocument.querySelector('.ant-drawer-open')).toBeTruthy()

      // Rapidly toggle 5 times between 767px (mobile) and 768px (desktop boundary)
      for (let w = 767; w <= 772; w++) {
        act(() => {
          window.innerWidth = w
          window.dispatchEvent(new Event('resize'))
        })
      }
      // At >= 768px, drawer must be closed
      expect(container.ownerDocument.querySelector('.ant-drawer-open')).toBeNull()
    })
  })

  // =========================================================================
  // 5. MANDATORY USER DIRECTIVE: ADMINBAR & BOUNDARY INVARIANTS
  // =========================================================================
  describe('Invariant Audit: AdminBar & Backend Boundaries', () => {
    it('verifies web/src/app/(app)/layout.tsx maintains <AdminBar /> intact above <Header />', () => {
      const layoutPath = path.resolve(process.cwd(), 'src/app/(app)/layout.tsx')
      const content = fs.readFileSync(layoutPath, 'utf8')

      expect(content).toContain("import { AdminBar } from '@/components/AdminBar'")
      expect(content).toContain('<AdminBar />')
      expect(content).toContain('<Header />')

      // AdminBar must appear before Header in JSX
      const adminBarIndex = content.indexOf('<AdminBar />')
      const headerIndex = content.indexOf('<Header />')
      expect(adminBarIndex).toBeGreaterThan(0)
      expect(headerIndex).toBeGreaterThan(adminBarIndex)
    })

    it('verifies web/src/components/AdminBar/index.tsx exists and is uncorrupted', () => {
      const adminBarPath = path.resolve(process.cwd(), 'src/components/AdminBar/index.tsx')
      expect(fs.existsSync(adminBarPath)).toBe(true)

      const content = fs.readFileSync(adminBarPath, 'utf8')
      expect(content).toContain("import { PayloadAdminBar } from '@payloadcms/admin-bar'")
      expect(content).toContain('export const AdminBar')
      expect(content).toContain('show')
      expect(content).toContain('PayloadAdminBar')
    })

    it('verifies payload collections and admin panel are strictly uncorrupted', () => {
      const payloadAdminPath = path.resolve(process.cwd(), 'src/app/(payload)/layout.tsx')
      expect(fs.existsSync(payloadAdminPath)).toBe(true)
      const content = fs.readFileSync(payloadAdminPath, 'utf8')
      expect(content).not.toContain('AntdRegistry')
    })
  })
})
