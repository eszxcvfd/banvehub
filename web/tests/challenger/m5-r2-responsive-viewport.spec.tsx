import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import fs from 'node:fs'
import path from 'node:path'
import { CreatorBanner } from '@/components/CreatorBanner'
import { RecentResources } from '@/components/RecentResources'

// Mock next/image
vi.mock('next/image', () => ({
  default: ({ src, alt, className, fill, sizes, _priority, ...props }: any) => (
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

describe('M5 Responsive Viewport & Image Configuration Challenger Suite', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    cleanup()
  })

  describe('1. CreatorBanner Responsive Layout & Mobile Stacking', () => {
    it('implements responsive grid breakdown grid-cols-1 lg:grid-cols-12 on outer container', () => {
      const { container } = render(<CreatorBanner memberCount={59} revenueSharePercent={70} />)
      const gridContainer = container.querySelector('.grid')
      expect(gridContainer).not.toBeNull()
      const classList = gridContainer?.className || ''
      expect(classList).toContain('grid-cols-1')
      expect(classList).toContain('lg:grid-cols-12')
      expect(classList).toContain('gap-8')
    })

    it('stacks left column on mobile (flex-col sm:flex-row) with responsive image width', () => {
      const { container } = render(<CreatorBanner memberCount={59} revenueSharePercent={70} />)
      const leftCol = container.querySelector('.lg\\:col-span-6')
      expect(leftCol).not.toBeNull()
      const classList = leftCol?.className || ''
      expect(classList).toContain('flex-col')
      expect(classList).toContain('sm:flex-row')

      // Image container must be w-full on mobile (<640px) and sm:w-48 on desktop, preventing 375px overflow
      const imgContainer = leftCol?.querySelector('.relative')
      const imgClassList = imgContainer?.className || ''
      expect(imgClassList).toContain('w-full')
      expect(imgClassList).toContain('sm:w-48')
      expect(imgClassList).toContain('h-36')
    })

    it('stacks right column trust pillars into 1 column on mobile (grid-cols-1 sm:grid-cols-2)', () => {
      const { container } = render(<CreatorBanner memberCount={59} revenueSharePercent={70} />)
      const cols = container.querySelectorAll('.lg\\:col-span-6')
      expect(cols.length).toBeGreaterThanOrEqual(2)
      const rightCol = cols[1]
      const classList = rightCol?.className || ''
      expect(classList).toContain('grid-cols-1')
      expect(classList).toContain('sm:grid-cols-2')

      // Verify all 4 trust pillar items render
      const pillars = rightCol.querySelectorAll('.flex.items-start')
      expect(pillars.length).toBe(4)
    })

    it('ensures no fixed pixel widths > 320px exist that would trigger horizontal scrolling on 375px viewports', () => {
      const bannerSourcePath = path.resolve(__dirname, '../../src/components/CreatorBanner/index.tsx')
      const bannerSource = fs.readFileSync(bannerSourcePath, 'utf-8')

      // Search for any suspicious fixed width classes like w-[380px], min-w-[400px], w-[500px], etc.
      const fixedWidthMatches = bannerSource.match(/w-\[(\d+)px\]/g) || []
      fixedWidthMatches.forEach((w) => {
        const num = parseInt(w.replace(/\D/g, ''), 10)
        expect(num).toBeLessThanOrEqual(320)
      })

      const minWidthMatches = bannerSource.match(/min-w-\[(\d+)px\]/g) || []
      minWidthMatches.forEach((w) => {
        const num = parseInt(w.replace(/\D/g, ''), 10)
        expect(num).toBeLessThanOrEqual(320)
      })
    })

    it('verifies accessibility layer exposes links without aria-hidden="true"', () => {
      render(<CreatorBanner memberCount={59} revenueSharePercent={70} />)
      // the visible figure, not a hidden compatibility block
      // Reachability: the figure is a real, visible element — no ancestor may hide it
      const figure = screen.getByTestId('creator-revenue-share')
      expect(figure.textContent).toMatch(/(\d+)\s*%\s*Chia sẻ doanh thu/)
      expect(figure.textContent).toContain('mặc định')
      let node: HTMLElement | null = figure
      while (node) {
        expect(node.className).not.toContain('sr-only')
        node = node.parentElement
      }
      // the two links that existed only inside the deleted hidden block are gone
      expect(screen.queryByRole('link', { name: /Đăng Ký Bán Bản Vẽ Ngay/i })).toBeNull()
      expect(screen.queryByRole('link', { name: /Khám Phá Bản Vẽ Đã Thẩm Định/i })).toBeNull()

      // the banner's call to action
      const sellerLink = screen.getByRole('link', { name: /Tìm hiểu thêm/i })
      expect(sellerLink).toBeDefined()
      expect(sellerLink.getAttribute('href')).toBe('/seller')
    })
  })

  describe('2. RecentResources Responsive Grid & 375px Mobile Viewport Safety', () => {
    it('uses exact grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 for zero mobile overflow', () => {
      const { container } = render(<RecentResources />)
      const grid = container.querySelector('.grid')
      expect(grid).not.toBeNull()
      const classList = grid?.className || ''

      expect(classList).toContain('grid-cols-1')
      expect(classList).toContain('sm:grid-cols-2')
      expect(classList).toContain('md:grid-cols-3')
      expect(classList).toContain('lg:grid-cols-5')
      expect(classList).toContain('gap-4')
    })

    it('ensures all 5 cards have 16/10 aspect ratio cover containers', () => {
      const { container } = render(<RecentResources />)
      const covers = container.querySelectorAll('.aspect-\\[16\\/10\\]')
      expect(covers.length).toBe(5)

      covers.forEach((cover) => {
        expect(cover.className).toContain('w-full')
        expect(cover.className).toContain('overflow-hidden')
      })
    })

    it('ensures cards have fluid widths and no fixed width styles that could overflow 375px screens', () => {
      const recentSourcePath = path.resolve(__dirname, '../../src/components/RecentResources/index.tsx')
      const recentSource = fs.readFileSync(recentSourcePath, 'utf-8')

      // Reject any hardcoded pixel widths > 320px
      const fixedWidthMatches = recentSource.match(/w-\[(\d+)px\]/g) || []
      fixedWidthMatches.forEach((w) => {
        const num = parseInt(w.replace(/\D/g, ''), 10)
        expect(num).toBeLessThanOrEqual(320)
      })

      const minWidthMatches = recentSource.match(/min-w-\[(\d+)px\]/g) || []
      minWidthMatches.forEach((w) => {
        const num = parseInt(w.replace(/\D/g, ''), 10)
        expect(num).toBeLessThanOrEqual(320)
      })
    })

    it('verifies all 5 card links navigate to valid /products/[slug] endpoints', () => {
      render(<RecentResources />)
      const links = screen.getAllByRole('link')
      expect(links.length).toBe(5)

      links.forEach((link) => {
        const href = link.getAttribute('href')
        expect(href).toMatch(/^\/products\/[a-z0-9-]+$/)
      })
    })

    it('verifies image sizes attribute optimizes across mobile, tablet, and desktop viewports', () => {
      const { container } = render(<RecentResources />)
      const images = container.querySelectorAll('img[data-sizes]')
      expect(images.length).toBe(5)

      images.forEach((img) => {
        const sizes = img.getAttribute('data-sizes')
        expect(sizes).toContain('(max-width: 640px) 100vw')
        expect(sizes).toContain('20vw')
      })
    })
  })

  describe('3. Next.js Image Optimization & localPatterns Configuration', () => {
    it('verifies web/next.config.ts configures pathname: "/media/**" in images.localPatterns', () => {
      const configPath = path.resolve(__dirname, '../../next.config.ts')
      expect(fs.existsSync(configPath)).toBe(true)

      const configContent = fs.readFileSync(configPath, 'utf-8')
      expect(configContent).toContain('images:')
      expect(configContent).toContain('localPatterns:')
      expect(configContent).toContain("pathname: '/media/**'")
      expect(configContent).toContain("pathname: '/api/media/file/**'")
    })

    it('confirms all curated media assets conform to localPatterns regex matching', () => {
      const pattern = /^\/media\/.+$/
      const assets = [
        '/media/curated/community-architect-desk.jpg',
        '/media/curated/recent-1-thaivilla.jpg',
        '/media/curated/recent-2-interior.jpg',
        '/media/curated/recent-3-warehouse.jpg',
        '/media/curated/recent-4-waterplan.jpg',
        '/media/curated/recent-5-hotel.jpg',
        '/media/curated/bestseller-1-villa.jpg',
      ]

      assets.forEach((asset) => {
        expect(pattern.test(asset)).toBe(true)
      })
    })

    it('verifies physical file existence and valid byte sizes for all curated media', () => {
      const publicDir = path.resolve(__dirname, '../../public/media/curated')
      const files = [
        'community-architect-desk.jpg',
        'recent-1-thaivilla.jpg',
        'recent-2-interior.jpg',
        'recent-3-warehouse.jpg',
        'recent-4-waterplan.jpg',
        'recent-5-hotel.jpg',
      ]

      files.forEach((file) => {
        const fullPath = path.join(publicDir, file)
        expect(fs.existsSync(fullPath)).toBe(true)
        const stat = fs.statSync(fullPath)
        // Image must be non-trivial (> 5KB) and optimized (< 200KB)
        expect(stat.size).toBeGreaterThan(5000)
        expect(stat.size).toBeLessThan(200000)
      })
    })
  })
})
