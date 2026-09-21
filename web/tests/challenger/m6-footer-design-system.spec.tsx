import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react'
import { FooterClient } from '@/components/Footer/index.client'
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

describe('Milestone M6 Challenger: Footer Mockup Parity, Design System Polish & Invariant Audit', () => {
  const mockFooterData = {
    contactPhone: '1900 6868',
    contactEmail: 'hotro@kientaohub.vn',
    contactNote: '8:00 - 18:00 (Thứ 2 - Thứ 7)',
    navItems: [
      {
        id: 'cms-nav-1',
        link: {
          type: 'custom',
          url: '/lien-he',
          label: 'Liên hệ hợp tác',
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
  })

  afterEach(() => {
    cleanup()
  })

  // -------------------------------------------------------------------------
  // 1. FOOTER COLUMN 1: BRAND LOGO K, NAME, SUBTEXT & CONTACT CHANNELS
  // -------------------------------------------------------------------------
  describe('1. Column 1: Brand & Verified Contact Info', () => {
    it('1.1 renders GeometricKLogo, brand title "Kiến Tạo Hub", and subtext "Bản vẽ & Tài nguyên BIM"', () => {
      const { container } = render(
        <AntdConfigProvider>
          <FooterClient footer={mockFooterData} />
        </AntdConfigProvider>,
      )

      expect(screen.getByText('Kiến Tạo Hub')).toBeTruthy()
      expect(screen.getByText('Bản vẽ & Tài nguyên BIM')).toBeTruthy()

      // Brand Geometric K Logo icon exists inside dark rounded container
      const logoSvg = container.querySelector('svg')
      expect(logoSvg).toBeTruthy()

      // Platform intro text
      expect(
        screen.getByText(/Nền tảng thương mại & chia sẻ tài nguyên bản vẽ kỹ thuật kiến trúc, kết cấu, MEP và mô hình BIM/),
      ).toBeTruthy()
    })

    it('1.2 renders verified contact channels with proper tel, mailto, and address', () => {
      render(
        <AntdConfigProvider>
          <FooterClient footer={mockFooterData} />
        </AntdConfigProvider>,
      )

      const hotline = screen.getByText('1900 6868').closest('a')
      expect(hotline).toBeTruthy()
      expect(hotline?.getAttribute('href')).toBe('tel:19006868')

      const email = screen.getByText('hotro@kientaohub.vn').closest('a')
      expect(email).toBeTruthy()
      expect(email?.getAttribute('href')).toBe('mailto:hotro@kientaohub.vn')

      expect(screen.getByText(/123 Phố Xã Đàn/)).toBeTruthy()
      expect(screen.getByText(/8:00 - 18:00/)).toBeTruthy()
    })
  })

  // -------------------------------------------------------------------------
  // 2. FOOTER COLUMN 2: 2-SUBCOLUMN CATEGORIES GRID
  // -------------------------------------------------------------------------
  describe('2. Column 2: 2-Subcolumn Categories Grid', () => {
    it('2.1 renders all 8 drawing categories distributed across 2 subcolumns', () => {
      render(
        <AntdConfigProvider>
          <FooterClient footer={mockFooterData} />
        </AntdConfigProvider>,
      )

      expect(screen.getByText('Danh mục bản vẽ')).toBeTruthy()

      const mandatoryCategories = [
        { label: 'Kiến trúc dân dụng', href: '/shop?category=ban-ve-kien-truc' },
        { label: 'Bản vẽ Kết cấu', href: '/shop?category=ban-ve-ket-cau' },
        { label: 'Cơ điện (MEP)', href: '/shop?category=ban-ve-co-dien-mep' },
        { label: 'Mô hình BIM Revit', href: '/shop?category=mo-hinh-bim-revit' },
        { label: 'Thư viện 3ds Max / Sketchup', href: '/shop?category=thu-vien-sketchup-3dsmax' },
        { label: 'Nội thất', href: '/shop?category=noi-that' },
        { label: '3D & Phối cảnh', href: '/shop?category=thiet-ke-3d' },
        { label: 'Hồ sơ quy hoạch', href: '/shop?category=ho-so-quy-hoach' },
      ]

      for (const item of mandatoryCategories) {
        const link = screen.getByText(item.label).closest('a')
        expect(link, `Category "${item.label}" must exist`).toBeTruthy()
        expect(link?.getAttribute('href')).toBe(item.href)
      }
    })
  })

  // -------------------------------------------------------------------------
  // 3. FOOTER COLUMN 3: POLICY & SUPPORT LINKS
  // -------------------------------------------------------------------------
  describe('3. Column 3: Policy & Support Links', () => {
    it('3.1 renders policy and support navigation links plus CMS dynamic items', () => {
      render(
        <AntdConfigProvider>
          <FooterClient footer={mockFooterData} />
        </AntdConfigProvider>,
      )

      expect(screen.getByText('Hướng dẫn & Chính sách')).toBeTruthy()

      const policies = [
        { label: 'Quy trình mua bản vẽ', href: '/find-order' },
        { label: 'Hướng dẫn nạp ví', href: '/wallet' },
        { label: 'Chính sách hoàn tiền 100%', href: '/chinh-sach-hoan-tien' },
        { label: 'Điều khoản tác giả & Kênh bán', href: '/seller' },
        { label: 'Chính sách bảo mật', href: '/chinh-sach-bao-mat' },
        { label: 'Điều khoản sử dụng', href: '/terms' },
      ]

      for (const item of policies) {
        const link = screen.getByText(item.label).closest('a')
        expect(link, `Policy "${item.label}" must exist`).toBeTruthy()
        expect(link?.getAttribute('href')).toBe(item.href)
      }

      // CMS dynamic nav item rendered
      expect(screen.getByText('Liên hệ hợp tác')).toBeTruthy()
    })
  })

  // -------------------------------------------------------------------------
  // 4. FOOTER COLUMN 4: NEWSLETTER SIGNUP, SOCIAL ICONS & PAYMENT/SECURITY
  // -------------------------------------------------------------------------
  describe('4. Column 4: Newsletter Form, Social Media Icons & Utilities', () => {
    it('4.1 renders Newsletter subscription block with input and dark "Đăng ký" button', () => {
      render(
        <AntdConfigProvider>
          <FooterClient footer={mockFooterData} />
        </AntdConfigProvider>,
      )

      expect(screen.getByText('Đăng ký nhận tin')).toBeTruthy()
      expect(
        screen.getByText(/Nhận thông báo về tài nguyên mới và ưu đãi đặc biệt/),
      ).toBeTruthy()

      const emailInput = screen.getByPlaceholderText('Nhập email của bạn')
      expect(emailInput).toBeTruthy()

      const subscribeBtn = screen.getByRole('button', { name: /Đăng ký/i })
      expect(subscribeBtn).toBeTruthy()
    })

    it('4.2 allows typing email and subscribing in newsletter input', () => {
      render(
        <AntdConfigProvider>
          <FooterClient footer={mockFooterData} />
        </AntdConfigProvider>,
      )

      const emailInput = screen.getByPlaceholderText('Nhập email của bạn') as HTMLInputElement
      const subscribeBtn = screen.getByRole('button', { name: /Đăng ký/i })

      fireEvent.change(emailInput, { target: { value: 'architect@kientaohub.vn' } })
      expect(emailInput.value).toBe('architect@kientaohub.vn')

      act(() => {
        fireEvent.click(subscribeBtn)
      })

      // Input resets after successful subscription
      expect(emailInput.value).toBe('')
    })

    it('4.3 renders social media icon links (Facebook, YouTube, LinkedIn, Zalo)', () => {
      render(
        <AntdConfigProvider>
          <FooterClient footer={mockFooterData} />
        </AntdConfigProvider>,
      )

      const fbLink = screen.getByRole('link', { name: /facebook/i })
      expect(fbLink).toBeTruthy()
      expect(fbLink.getAttribute('href')).toContain('facebook.com')
      expect(fbLink.getAttribute('target')).toBe('_blank')

      const ytLink = screen.getByRole('link', { name: /youtube/i })
      expect(ytLink).toBeTruthy()
      expect(ytLink.getAttribute('href')).toContain('youtube.com')

      const inLink = screen.getByRole('link', { name: /linkedin/i })
      expect(inLink).toBeTruthy()
      expect(inLink.getAttribute('href')).toContain('linkedin.com')

      const zaloLink = screen.getByRole('link', { name: /zalo/i })
      expect(zaloLink).toBeTruthy()
      expect(zaloLink.getAttribute('href')).toContain('zalo.me')
    })

    it('4.4 preserves payment and security tags and ThemeSelector', () => {
      render(
        <AntdConfigProvider>
          <FooterClient footer={mockFooterData} />
        </AntdConfigProvider>,
      )

      expect(screen.getByText('Thanh toán & Tiện ích')).toBeTruthy()
      // No Stripe rail exists (decision 0013 removed it): the list shows only what can be processed
      expect(screen.queryByText('Stripe')).toBeNull()
      expect(screen.getByText('VietQR')).toBeTruthy()
      expect(screen.getByText('Thẻ ATM/Visa')).toBeTruthy()

      expect(screen.getByText('Bảo mật SSL')).toBeTruthy()
      expect(screen.getByText('Cam kết 100%')).toBeTruthy()
      expect(screen.getByText('Chế độ hiển thị')).toBeTruthy()
    })
  })

  // -------------------------------------------------------------------------
  // 5. FOOTER BOTTOM BAR: COPYRIGHT & SLOGAN
  // -------------------------------------------------------------------------
  describe('5. Bottom Bar: Copyright & Brand Slogan', () => {
    it('5.1 renders official copyright notice and slogan "Bản vẽ chất lượng - Kiến tạo giá trị"', () => {
      render(
        <AntdConfigProvider>
          <FooterClient footer={mockFooterData} />
        </AntdConfigProvider>,
      )

      expect(screen.getByText(/Copyright © 2026/i)).toBeTruthy()
      expect(screen.getByText(/Kiến Tạo Hub \(KienTaoHub\)/i)).toBeTruthy()
      expect(screen.getByText('Bản vẽ chất lượng - Kiến tạo giá trị')).toBeTruthy()
    })
  })

  // -------------------------------------------------------------------------
  // 6. DESIGN SYSTEM SPACING & CONTAINER ALIGNMENT AUDIT
  // -------------------------------------------------------------------------
  describe('6. Design System Rhythm & Container Integrity Audit', () => {
    it('6.1 page.tsx uses 48px vertical margin rhythm (my-12) and max-w-7xl container', () => {
      const pagePath = path.resolve(process.cwd(), 'src/app/(app)/page.tsx')
      const content = fs.readFileSync(pagePath, 'utf8')

      // Verifies container has max-w-7xl with standard horizontal gutters
      expect(content).toContain('max-w-7xl mx-auto px-4 sm:px-6 lg:px-8')

      // Verifies all sections use my-12 (48px rhythm)
      expect(content).toContain('<section className="my-12">')
      expect(content).not.toContain('className="my-14"')
      expect(content).not.toContain('className="my-10"')
    })

    it('6.2 CreatorBanner does not have conflicting nested container margins', () => {
      const creatorBannerPath = path.resolve(
        process.cwd(),
        'src/components/CreatorBanner/index.tsx',
      )
      const content = fs.readFileSync(creatorBannerPath, 'utf8')

      // Verifies inner section does not stack a redundant my-10 margin
      expect(content).not.toContain('className="my-10')
      expect(content).toContain('<section className="w-full"')
    })
  })

  // -------------------------------------------------------------------------
  // 7. MANDATORY INVARIANTS PRESERVATION AUDIT
  // -------------------------------------------------------------------------
  describe('7. Mandatory Invariants Preservation Audit', () => {
    it('7.1 AdminBar component is 100% preserved in storefront layout.tsx', () => {
      const layoutPath = path.resolve(process.cwd(), 'src/app/(app)/layout.tsx')
      const content = fs.readFileSync(layoutPath, 'utf8')

      // AdminBar import and usage must be intact
      expect(content).toContain("import { AdminBar } from '@/components/AdminBar'")
      expect(content).toContain('<AdminBar')
      expect(content).not.toContain('{/* <AdminBar')
    })

    it('7.2 Payload admin routes (payload) have strictly 0 Ant Design imports', () => {
      const payloadLayoutPath = path.resolve(
        process.cwd(),
        'src/app/(payload)/layout.tsx',
      )
      const content = fs.readFileSync(payloadLayoutPath, 'utf8')

      expect(content).not.toContain('AntdRegistry')
      expect(content).not.toContain('AntdConfigProvider')
      expect(content).not.toContain("from 'antd'")
      expect(content).not.toContain("from '@ant-design")
    })
  })
})
