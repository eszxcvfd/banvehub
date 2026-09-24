import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react'
import { FooterClient } from '@/components/Footer/index.client'
import { CategoryMenu } from '@/components/Header/CategoryMenu'
import { AntdConfigProvider } from '@/providers/Antd'
import fs from 'fs'
import path from 'path'

// Global Mocks for Next.js & Auth
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    prefetch: vi.fn(),
  }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
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

vi.mock('@/providers/Auth', () => ({
  useAuth: () => ({
    user: null,
    logout: vi.fn(),
  }),
}))

describe('Milestone M6 Challenger 2: Adversarial Stress, Theme Switching & Invariant Guard', () => {
  const mockFooterData = {
    contactPhone: '1900 6868',
    contactEmail: 'hotro@kientaohub.vn',
    contactNote: '8:00 - 18:00 (Thứ 2 - Thứ 7)',
    navItems: [
      {
        id: 'cms-nav-1',
        link: {
          type: 'custom',
          url: '/trang-chu',
          label: 'Trang chủ',
          newTab: false,
        },
      },
    ],
  } as any

  beforeEach(() => {
    vi.clearAllMocks()
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

    class MockResizeObserver {
      observe = vi.fn()
      unobserve = vi.fn()
      disconnect = vi.fn()
    }
    ;(global as any).ResizeObserver = MockResizeObserver
    ;(window as any).ResizeObserver = MockResizeObserver
  })

  afterEach(() => {
    cleanup()
  })

  // =========================================================================
  // 1. ADVERSARIAL NEWSLETTER INPUT TESTING (EDGE CASES & XSS)
  // =========================================================================
  describe('1. Adversarial Newsletter Input Stress', () => {
    it('1.1 rejects empty string submission without triggering subscription', () => {
      render(
        <AntdConfigProvider>
          <FooterClient footer={mockFooterData} />
        </AntdConfigProvider>,
      )

      const emailInput = screen.getByPlaceholderText('Nhập email của bạn') as HTMLInputElement
      const subscribeBtn = screen.getByRole('button', { name: /Đăng ký/i })

      expect(emailInput.value).toBe('')

      act(() => {
        fireEvent.click(subscribeBtn)
      })

      // Input remains empty, no crash
      expect(emailInput.value).toBe('')
    })

    it('1.2 rejects whitespace-only submission without triggering subscription', () => {
      render(
        <AntdConfigProvider>
          <FooterClient footer={mockFooterData} />
        </AntdConfigProvider>,
      )

      const emailInput = screen.getByPlaceholderText('Nhập email của bạn') as HTMLInputElement
      const subscribeBtn = screen.getByRole('button', { name: /Đăng ký/i })

      fireEvent.change(emailInput, { target: { value: '     ' } })
      expect(emailInput.value).toBe('     ')

      act(() => {
        fireEvent.click(subscribeBtn)
      })

      // Not subscribed, whitespace remains in input because it was not accepted
      expect(emailInput.value).toBe('     ')
    })

    it('1.3 rejects email strings lacking "@" symbol', () => {
      render(
        <AntdConfigProvider>
          <FooterClient footer={mockFooterData} />
        </AntdConfigProvider>,
      )

      const emailInput = screen.getByPlaceholderText('Nhập email của bạn') as HTMLInputElement
      const subscribeBtn = screen.getByRole('button', { name: /Đăng ký/i })

      fireEvent.change(emailInput, { target: { value: 'architect.kientaohub.vn' } })
      act(() => {
        fireEvent.click(subscribeBtn)
      })

      // Still in input because invalid email does not trigger subscription reset
      expect(emailInput.value).toBe('architect.kientaohub.vn')
    })

    it('1.4 handles ultra-long email strings (5,000+ characters) safely without crash', () => {
      render(
        <AntdConfigProvider>
          <FooterClient footer={mockFooterData} />
        </AntdConfigProvider>,
      )

      const emailInput = screen.getByPlaceholderText('Nhập email của bạn') as HTMLInputElement
      const subscribeBtn = screen.getByRole('button', { name: /Đăng ký/i })

      const longString = 'a'.repeat(2500) + '@' + 'b'.repeat(2500) + '.com'
      fireEvent.change(emailInput, { target: { value: longString } })
      expect(emailInput.value.length).toBe(5005)

      act(() => {
        fireEvent.click(subscribeBtn)
      })

      // Successfully processed long string and reset input
      expect(emailInput.value).toBe('')
    })

    it('1.5 safely neutralizes XSS payloads as escaped string values without executing or creating raw elements', () => {
      const { container } = render(
        <AntdConfigProvider>
          <FooterClient footer={mockFooterData} />
        </AntdConfigProvider>,
      )

      const emailInput = screen.getByPlaceholderText('Nhập email của bạn') as HTMLInputElement
      const subscribeBtn = screen.getByRole('button', { name: /Đăng ký/i })

      const xssPayloads = [
        '<script>alert("xss")</script>@test.com',
        '<img src=x onerror=alert(1)>@test.com',
        '"><svg onload=alert(1)>@test.com',
      ]

      for (const payload of xssPayloads) {
        fireEvent.change(emailInput, { target: { value: payload } })
        expect(emailInput.value).toBe(payload)

        act(() => {
          fireEvent.click(subscribeBtn)
        })

        // Verify no raw script or malicious svg tag was injected into the DOM
        expect(container.querySelectorAll('script').length).toBe(0)
        expect(container.querySelector('img[src="x"]')).toBeNull()
        expect(container.querySelector('svg[onload]')).toBeNull()
      }
    })

    it('1.6 safely handles SQL injection payloads without throwing errors', () => {
      render(
        <AntdConfigProvider>
          <FooterClient footer={mockFooterData} />
        </AntdConfigProvider>,
      )

      const emailInput = screen.getByPlaceholderText('Nhập email của bạn') as HTMLInputElement
      const subscribeBtn = screen.getByRole('button', { name: /Đăng ký/i })

      const sqliPayload = "' OR '1'='1' -- @domain.com"
      fireEvent.change(emailInput, { target: { value: sqliPayload } })

      act(() => {
        fireEvent.click(subscribeBtn)
      })

      expect(emailInput.value).toBe('')
    })

    it('1.7 allows Enter key press to submit valid email and clears input', () => {
      render(
        <AntdConfigProvider>
          <FooterClient footer={mockFooterData} />
        </AntdConfigProvider>,
      )

      const emailInput = screen.getByPlaceholderText('Nhập email của bạn') as HTMLInputElement
      fireEvent.change(emailInput, { target: { value: 'user@example.com' } })
      expect(emailInput.value).toBe('user@example.com')

      act(() => {
        fireEvent.keyDown(emailInput, { key: 'Enter', code: 'Enter', charCode: 13 })
      })

      expect(emailInput.value).toBe('')
    })

    it('1.8 maintains component resilience across rapid repeated submissions', () => {
      render(
        <AntdConfigProvider>
          <FooterClient footer={mockFooterData} />
        </AntdConfigProvider>,
      )

      const emailInput = screen.getByPlaceholderText('Nhập email của bạn') as HTMLInputElement
      const subscribeBtn = screen.getByRole('button', { name: /Đăng ký/i })

      for (let i = 0; i < 5; i++) {
        fireEvent.change(emailInput, { target: { value: `user${i}@example.com` } })
        act(() => {
          fireEvent.click(subscribeBtn)
        })
        expect(emailInput.value).toBe('')
      }
    })
  })

  // =========================================================================
  // 2. THEME SWITCHING & TOKEN INTEGRITY IN FOOTER AND HEADER
  // =========================================================================
  describe('2. Theme Switching & Token Integrity', () => {
    it('2.1 FooterClient renders container with valid style properties', () => {
      const { container } = render(
        <AntdConfigProvider>
          <FooterClient footer={mockFooterData} />
        </AntdConfigProvider>,
      )

      const footerElement = container.querySelector('footer.ant-layout-footer') as HTMLElement
      expect(footerElement).toBeTruthy()
      expect(footerElement.style.padding).toBe('48px 0px 24px')
      expect(footerElement.style.borderTop).toContain('solid')
      expect(footerElement.style.transition).toContain('background-color')
    })

    it('2.2 Header index.css specifies neutral slate link colors and dark mode variants', () => {
      const cssPath = path.resolve(process.cwd(), 'src/components/Header/index.css')
      const cssContent = fs.readFileSync(cssPath, 'utf8')

      // Neutral slate color in light mode
      expect(cssContent).toContain('.category-nav-menu a {')
      expect(cssContent).toContain('color: #334155 !important;')

      // Slate light in dark mode
      expect(cssContent).toContain(':where(.dark) .category-nav-menu a {')
      expect(cssContent).toContain('color: #e2e8f0 !important;')

      // Hover color is tech blue accent
      expect(cssContent).toContain('.category-nav-menu a:hover')
      expect(cssContent).toContain('color: #1677ff !important;')
    })

    it('2.3 Footer renders ThemeSelector component inside styled container', () => {
      render(
        <AntdConfigProvider>
          <FooterClient footer={mockFooterData} />
        </AntdConfigProvider>,
      )

      expect(screen.getByText('Chế độ hiển thị')).toBeTruthy()
      // ThemeSelector element is rendered
      const themeContainer = screen.getByText('Chế độ hiển thị').nextElementSibling
      expect(themeContainer).toBeTruthy()
    })
  })

  // =========================================================================
  // 3. 48PX VERTICAL RHYTHM & CONTAINER INTEGRITY IN PAGE.TSX
  // =========================================================================
  describe('3. 48px Vertical Rhythm & Container Integrity in page.tsx', () => {
    it('3.1 all primary sections inside main container in page.tsx adhere strictly to 48px margin rhythm (my-12)', () => {
      const pagePath = path.resolve(process.cwd(), 'src/app/(app)/page.tsx')
      const content = fs.readFileSync(pagePath, 'utf8')

      // Extract main content container
      const mainContainerPart = content.split('max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8')[1]
      expect(mainContainerPart).toBeTruthy()

      // Extract all section occurrences inside main container
      const sectionMatches = mainContainerPart.match(/<section className="([^"]+)">/g) || []
      const sectionClasses = sectionMatches.map((m) => m.replace('<section className="', '').replace('">', ''))

      expect(sectionClasses.length).toBeGreaterThanOrEqual(4)
      for (const cls of sectionClasses) {
        // Every content section must use my-12
        expect(cls).toBe('my-12')
      }
    })

    it('3.2 no section in page.tsx uses non-standard vertical margin classes', () => {
      const pagePath = path.resolve(process.cwd(), 'src/app/(app)/page.tsx')
      const content = fs.readFileSync(pagePath, 'utf8')

      expect(content).not.toContain('className="my-10"')
      expect(content).not.toContain('className="my-14"')
      expect(content).not.toContain('className="my-16"')
      expect(content).not.toContain('className="my-8"')
    })

    it('3.3 page.tsx container uses max-w-7xl with standard responsive horizontal padding', () => {
      const pagePath = path.resolve(process.cwd(), 'src/app/(app)/page.tsx')
      const content = fs.readFileSync(pagePath, 'utf8')

      expect(content).toContain('max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8')
    })

    it('3.4 CreatorBanner container does not stack redundant outer vertical margins', () => {
      const bannerPath = path.resolve(process.cwd(), 'src/components/CreatorBanner/index.tsx')
      const content = fs.readFileSync(bannerPath, 'utf8')

      expect(content).toContain('<section className="w-full"')
      expect(content).not.toContain('my-10')
      expect(content).not.toContain('my-12')
    })
  })

  // =========================================================================
  // 4. CATEGORYMENU INTERACTION, MEGAMENU & ACCESSIBILITY
  // =========================================================================
  describe('4. CategoryMenu Interaction & Keyboard Accessibility', () => {
    it('4.1 renders "Tất cả danh mục" unified with hamburger icon (MenuOutlined) in a single row link', () => {
      render(
        <AntdConfigProvider>
          <CategoryMenu />
        </AntdConfigProvider>,
      )

      const allCatLink = screen.getByText('Tất cả danh mục').closest('a')
      expect(allCatLink).toBeTruthy()
      expect(allCatLink?.getAttribute('href')).toBe('/shop')
      expect(allCatLink?.className).toContain('inline-flex items-center')

      // Svg icon exists inside the link
      const icon = allCatLink?.querySelector('svg')
      expect(icon).toBeTruthy()
    })

    it('4.2 CategoryMenu contains all 6 core engineering taxonomies with correct links', () => {
      render(
        <AntdConfigProvider>
          <CategoryMenu />
        </AntdConfigProvider>,
      )

      const expectedTaxonomies = [
        { name: 'Kiến trúc', href: '/shop?category=ban-ve-kien-truc' },
        { name: 'Kết cấu', href: '/shop?category=ban-ve-ket-cau' },
        { name: 'Cơ điện MEP', href: '/shop?category=ban-ve-co-dien-mep' },
        { name: 'BIM Revit', href: '/shop?category=mo-hinh-bim-revit' },
        { name: 'Nội thất', href: '/shop?category=thiet-ke-noi-that' },
        { name: '3D & Phối cảnh', href: '/shop?category=thu-vien-sketchup-3dsmax' },
      ]

      for (const tax of expectedTaxonomies) {
        const link = screen.getByText(tax.name).closest('a')
        expect(link, `Category link "${tax.name}" must exist`).toBeTruthy()
        expect(link?.getAttribute('href')).toBe(tax.href)
      }
    })

    it('4.3 CategoryMenu hides CMS nav items visually using sr-only', () => {
      const cmsItems = [
        {
          id: 'cms-1',
          link: {
            type: 'custom' as const,
            url: '/trang-chu',
            label: 'Trang chủ',
            newTab: false,
          },
        },
      ]

      const { container } = render(
        <AntdConfigProvider>
          <CategoryMenu cmsNavItems={cmsItems} />
        </AntdConfigProvider>,
      )

      // The cms nav item is placed inside a sr-only div to prevent visual clutter
      const srOnlyContainer = container.querySelector('.sr-only')
      expect(srOnlyContainer).toBeTruthy()
    })
  })

  // =========================================================================
  // 5. MANDATORY INVARIANTS PRESERVATION AUDIT
  // =========================================================================
  describe('5. Mandatory Invariants Preservation Audit', () => {
    it('5.1 AdminBar component is strictly preserved in storefront layout.tsx inside Providers', () => {
      const layoutPath = path.resolve(process.cwd(), 'src/app/(app)/layout.tsx')
      const content = fs.readFileSync(layoutPath, 'utf8')

      // Must import AdminBar
      expect(content).toContain("import { AdminBar } from '@/components/AdminBar'")

      // Must render <AdminBar />
      expect(content).toMatch(/<Providers>\s*<AdminBar \/>/)
    })

    it('5.2 AdminBar component implementation exists and renders PayloadAdminBar', () => {
      const adminBarPath = path.resolve(process.cwd(), 'src/components/AdminBar/index.tsx')
      const content = fs.readFileSync(adminBarPath, 'utf8')

      expect(content).toContain("import { PayloadAdminBar } from '@payloadcms/admin-bar'")
      expect(content).toContain('<PayloadAdminBar')
      expect(content).toContain('onAuthChange={onAuthChange}')
    })

    it('5.3 Payload admin routes (payload) have strictly 0 Ant Design imports', () => {
      const payloadLayoutPath = path.resolve(process.cwd(), 'src/app/(payload)/layout.tsx')
      const content = fs.readFileSync(payloadLayoutPath, 'utf8')

      expect(content).not.toContain('AntdRegistry')
      expect(content).not.toContain('AntdConfigProvider')
      expect(content).not.toContain("from 'antd'")
      expect(content).not.toContain("from '@ant-design")
    })
  })
})
