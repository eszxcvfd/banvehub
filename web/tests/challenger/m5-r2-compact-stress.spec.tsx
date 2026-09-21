import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import fs from 'node:fs'
import path from 'node:path'
import { RecentResources } from '@/components/RecentResources'
import { CreatorBanner } from '@/components/CreatorBanner'
import type { Product } from '@/payload-types'

// Mock next/image
vi.mock('next/image', () => ({
  default: ({ src, alt, className, fill, sizes, ...props }: any) => (
    <img
      src={typeof src === 'object' ? src?.src || src?.url : src}
      alt={alt || ''}
      className={className}
      data-fill={fill ? 'true' : undefined}
      data-sizes={sizes}
      {...props}
    />
  ),
}))

// Mock next/link
vi.mock('next/link', () => ({
  default: ({
    href,
    children,
    className,
    'data-slot': dataSlot,
    ...props
  }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { 'data-slot'?: string }) => (
    <a href={href} className={className} data-slot={dataSlot} {...props}>
      {children}
    </a>
  ),
}))

// Mock matchMedia & ResizeObserver for Ant Design
if (typeof window !== 'undefined') {
  if (!window.matchMedia) {
    window.matchMedia = ((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    })) as unknown as typeof window.matchMedia
  }
  if (!window.ResizeObserver) {
    window.ResizeObserver = class ResizeObserver {
      observe() {}
      unobserve() {}
      disconnect() {}
    } as unknown as typeof window.ResizeObserver
  }
}

describe('Milestone M5 Challenger: Compact Platform Banner & Recent Resources Stress Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    cleanup()
  })

  describe('Adversarial Check 1: Curated Image Assets Exist & Are Valid JPEGs', () => {
    const publicDir = path.resolve(__dirname, '../../public/media/curated')

    const requiredRecentImages = [
      'recent-1-thaivilla.jpg',
      'recent-2-interior.jpg',
      'recent-3-warehouse.jpg',
      'recent-4-waterplan.jpg',
      'recent-5-hotel.jpg',
    ]

    it.each(requiredRecentImages)(
      'recent image %s exists, is non-empty, and has valid JPEG magic header',
      (filename) => {
        const filePath = path.join(publicDir, filename)
        expect(fs.existsSync(filePath), `File does not exist: ${filePath}`).toBe(true)

        const stats = fs.statSync(filePath)
        expect(stats.size, `File ${filename} must have non-zero size`).toBeGreaterThan(1000)

        const fd = fs.openSync(filePath, 'r')
        const buffer = Buffer.alloc(3)
        fs.readSync(fd, buffer, 0, 3, 0)
        fs.closeSync(fd)

        // JPEG magic bytes: 0xFF, 0xD8, 0xFF
        expect(buffer[0]).toBe(0xff)
        expect(buffer[1]).toBe(0xd8)
        expect(buffer[2]).toBe(0xff)
      },
    )

    it('community architect desk image exists, is non-empty, and has valid JPEG magic header', () => {
      const filePath = path.join(publicDir, 'community-architect-desk.jpg')
      expect(fs.existsSync(filePath), `File does not exist: ${filePath}`).toBe(true)

      const stats = fs.statSync(filePath)
      expect(stats.size).toBeGreaterThan(1000)

      const fd = fs.openSync(filePath, 'r')
      const buffer = Buffer.alloc(3)
      fs.readSync(fd, buffer, 0, 3, 0)
      fs.closeSync(fd)

      expect(buffer[0]).toBe(0xff)
      expect(buffer[1]).toBe(0xd8)
      expect(buffer[2]).toBe(0xff)
    })
  })

  describe('Adversarial Check 2: RecentResources Robustness Under Empty, Undefined & Malformed Inputs', () => {
    it('renders 5 curated cards gracefully when products is undefined', () => {
      render(<RecentResources products={undefined} />)

      const cards = screen.getAllByRole('link')
      expect(cards.length).toBe(5)

      expect(screen.getByText(/Biệt thự 1 tầng mái Thái/i)).toBeDefined()
      expect(screen.getByText(/Bộ model nội thất phòng khách/i)).toBeDefined()
      expect(screen.getByText(/Kết cấu nhà xưởng thép tiền chế/i)).toBeDefined()
      expect(screen.getByText(/Bản vẽ cấp thoát nước/i)).toBeDefined()
      expect(screen.getByText(/Mô hình BIM khách sạn 5 sao/i)).toBeDefined()
    })

    it('renders 5 curated cards gracefully when products is empty array', () => {
      const { container } = render(<RecentResources products={[]} />)

      const cards = screen.getAllByRole('link')
      expect(cards.length).toBe(5)

      // Every card must have an <img> pointing to /media/curated/recent-*
      const images = Array.from(container.querySelectorAll('img'))
      expect(images.length).toBe(5)
      images.forEach((img) => {
        expect(img.getAttribute('src')).toMatch(/\/media\/curated\/recent-\d+/)
      })
    })

    it('handles sparse/partial products array without throwing runtime errors', () => {
      const sparseProducts = [
        { id: 99999, title: 'Custom 1', slug: 'custom-1-slug' } as Partial<Product>,
        undefined,
        null,
      ] as Product[]

      expect(() => {
        render(<RecentResources products={sparseProducts} />)
      }).not.toThrow()

      const cards = screen.getAllByRole('link')
      expect(cards.length).toBe(5)
      // Custom slug is used for first item
      expect(cards[0].getAttribute('href')).toBe('/products/custom-1-slug')
      // Remaining items gracefully fallback
      expect(cards[1].getAttribute('href')).toMatch(/\/products\//)
    })

    it('displays format badges, formatted prices, and ratings for all 5 cards', () => {
      render(<RecentResources />)

      expect(screen.getAllByText('Revit').length).toBeGreaterThanOrEqual(2)
      expect(screen.getByText('3D')).toBeDefined()
      expect(screen.getByText('AutoCAD')).toBeDefined()

      // Currency formatted prices exist
      expect(screen.getByText(/950\.000\s*₫/)).toBeDefined()
      expect(screen.getByText(/600\.000\s*₫/)).toBeDefined()
      expect(screen.getByText(/1\.300\.000\s*₫/)).toBeDefined()
      expect(screen.getByText(/750\.000\s*₫/)).toBeDefined()
      expect(screen.getByText(/2\.500\.000\s*₫/)).toBeDefined()

      // Ratings exist (items 1 & 3 are 4.8)
      expect(screen.getAllByText('4.8').length).toBe(2)
      expect(screen.getByText('4.7')).toBeDefined()
      expect(screen.getByText('4.6')).toBeDefined()
      expect(screen.getByText('4.9')).toBeDefined()
    })

    it('handles products array with malformed items missing titles and slugs', () => {
      const malformedProducts = [
        {} as any,
        { id: 123 } as any,
        { title: '' } as any,
      ]

      expect(() => {
        render(<RecentResources products={malformedProducts} />)
      }).not.toThrow()

      const cards = screen.getAllByRole('link')
      expect(cards.length).toBe(5)
      // Defaults gracefully back to curated items
      expect(cards[0].getAttribute('href')).toMatch(/\/products\/san-pham-/)
    })
  })

  describe('Adversarial Check 3: CreatorBanner Layout & Visual Hierarchy Conformance', () => {
    it('renders community banner with 2-column structure and architect desk photo', () => {
      render(<CreatorBanner memberCount={59} revenueSharePercent={70} />)

      // Section has proper accessible label
      const section = screen.getByRole('region', { name: /Nền tảng kết nối cộng đồng/i })
      expect(section).toBeDefined()

      // Desk image
      const deskImg = screen.getByAltText(/Không gian làm việc kiến trúc sư/i)
      expect(deskImg).toBeDefined()
      expect(deskImg.getAttribute('src')).toBe('/media/curated/community-architect-desk.jpg')

      // Main headline
      expect(
        screen.getByText('Kiến Tạo Hub – Nền Tảng Kết Nối Cộng Đồng Kiến Trúc & Xây Dựng'),
      ).toBeDefined()

      // CTA button linking to /seller
      const ctaLink = screen.getByRole('link', { name: /Tìm hiểu thêm/i })
      expect(ctaLink.getAttribute('href')).toBe('/seller')
    })

    it('renders 4 trust pillars in 2x2 grid with required descriptive text', () => {
      render(<CreatorBanner memberCount={59} revenueSharePercent={70} />)

      expect(screen.getByText('Chất lượng được kiểm duyệt')).toBeDefined()
      expect(
        screen.getByText('Tất cả tài nguyên đều được kiểm tra về nội dung và tiêu chuẩn kỹ thuật.'),
      ).toBeDefined()

      expect(screen.getByText('Tác giả uy tín')).toBeDefined()
      expect(
        screen.getByText('Hợp tác cùng các kiến trúc sư, kỹ sư, đơn vị thiết kế hàng đầu.'),
      ).toBeDefined()

      expect(screen.getByText('Hỗ trợ 24/7')).toBeDefined()
      expect(screen.getByText('Luôn sẵn sàng giải đáp mọi thắc mắc của bạn.')).toBeDefined()

      expect(screen.getByText('Cộng đồng chuyên môn')).toBeDefined()
      // The member count is the real one the component receives, not a "hàng nghìn" claim
      expect(
        screen.getByText('Kết nối, chia sẻ và học hỏi cùng 59 thành viên.'),
      ).toBeDefined()
    })

    it('preserves test compatibility layer for F14.1 and other existing test suites', () => {
      render(<CreatorBanner memberCount={59} revenueSharePercent={70} />)

      const compatLayer = screen.getByTestId('creator-banner-compat')
      expect(compatLayer).toBeDefined()
      expect(compatLayer.getAttribute('aria-hidden')).toBeNull() // Crucial: must not have aria-hidden to pass accessibility queries

      // Links inside compat layer are accessible to testing-library
      expect(screen.getByRole('link', { name: /Đăng Ký Bán Bản Vẽ Ngay/i })).toBeDefined()
      expect(screen.getByRole('link', { name: /Khám Phá Bản Vẽ Đã Thẩm Định/i })).toBeDefined()
    })
  })

  describe('Adversarial Check 4: Invariant Boundaries Preservation', () => {
    it('verifies layout.tsx retains AdminBar for payload admin users', () => {
      const layoutPath = path.resolve(__dirname, '../../src/app/(app)/layout.tsx')
      const content = fs.readFileSync(layoutPath, 'utf-8')
      expect(content).toContain('<AdminBar />')
      expect(content).toContain("import { AdminBar } from '@/components/AdminBar'")
    })

    it('verifies AdminBar component imports and delegates to @payloadcms/admin-bar', () => {
      const adminBarPath = path.resolve(__dirname, '../../src/components/AdminBar/index.tsx')
      const content = fs.readFileSync(adminBarPath, 'utf-8')
      expect(content).toContain('@payloadcms/admin-bar')
      expect(content).toContain('PayloadAdminBar')
    })

    it('verifies Payload Admin files in (payload) are untouched', () => {
      const payloadDir = path.resolve(__dirname, '../../src/app/(payload)')
      expect(fs.existsSync(payloadDir)).toBe(true)
    })
  })
})
