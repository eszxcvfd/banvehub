import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import fs from 'node:fs'
import path from 'node:path'
import { ProductGridItem } from '@/components/ProductGridItem'
import type { Category, Product, SoftwareType, User } from '@/payload-types'

// Mock next/image
vi.mock('next/image', () => ({
  default: ({ src, alt, className, fill, ...props }: any) => (
    <img
      src={typeof src === 'object' ? src?.src || src?.url : src}
      alt={alt || ''}
      className={className}
      data-fill={fill ? 'true' : undefined}
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

describe('Milestone M4 Challenger: Product Card Stress & Empirical Verification', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    cleanup()
  })

  // =========================================================================
  // SUITE 1: SELECTOR CONTRACTS & DOM STRUCTURE
  // =========================================================================
  describe('1. Selector Contracts & Visual Hierarchy Markers', () => {
    const mockProduct: Partial<Product> = {
      id: 101,
      title: 'Hồ sơ thiết kế Biệt thự 3 tầng Hiện đại',
      slug: 'ho-so-thiet-ke-biet-thu-3-tang',
      price: 1500000,
      isFree: false,
      technicalSpecs: {
        fileFormat: 'Revit .RVT, AutoCAD',
        fileSize: '45.8 MB',
      },
      categories: [
        {
          id: 1,
          title: 'Bản vẽ Kiến trúc',
          slug: 'ban-ve-kien-truc',
          createdAt: '2026-01-01T00:00:00Z',
          updatedAt: '2026-01-01T00:00:00Z',
        } as Category,
      ],
      software_types: [
        {
          id: 2,
          title: 'Revit',
          slug: 'revit',
          createdAt: '2026-01-01T00:00:00Z',
          updatedAt: '2026-01-01T00:00:00Z',
        } as SoftwareType,
      ],
      seller: {
        id: 99,
        name: 'KTS. Lê Quang Huy',
      } as unknown as User,
    }

    it('enforces exact root link contract with data-slot="product-card" and href target', () => {
      const { container } = render(<ProductGridItem product={mockProduct} />)

      const cardLink = container.querySelector('a[data-slot="product-card"]')
      expect(cardLink).not.toBeNull()
      expect(cardLink?.getAttribute('href')).toBe('/products/ho-so-thiet-ke-biet-thu-3-tang')
    })

    it('enforces exact CTA button contract with data-slot="product-download-btn" and aria-label', () => {
      const { container } = render(<ProductGridItem product={mockProduct} />)

      const downloadBtn = container.querySelector('[data-slot="product-download-btn"]')
      expect(downloadBtn).not.toBeNull()
      expect(downloadBtn?.getAttribute('aria-label')).toBe('Tải về')
      expect(downloadBtn?.textContent).toContain('Tải về')
      // Must be a button element or role button, NOT an anchor tag
      expect(downloadBtn?.tagName.toLowerCase()).toBe('button')
    })

    it('enforces verified quality badge with exact aria-label', () => {
      render(<ProductGridItem product={mockProduct} />)

      const verifiedBadge = screen.getByLabelText('Đã kiểm định kỹ thuật 100%')
      expect(verifiedBadge).toBeDefined()
    })

    it('renders 16:10 aspect ratio container for card thumbnail', () => {
      const { container } = render(<ProductGridItem product={mockProduct} />)

      const coverContainer = container.querySelector('.aspect-\\[16\\/10\\]')
      expect(coverContainer).not.toBeNull()
    })

    it('renders the real file format and size, and no download count without a real one', () => {
      render(<ProductGridItem product={mockProduct} />)

      // The record's own technicalSpecs, and nothing else: `download_events` has no rows for it. The
      // format badge carries the format, so the spec line adds the size only.
      expect(screen.getByText('Revit .RVT')).toBeDefined() // the format badge
      expect(screen.getByText('Revit .RVT · 45.8 MB')).toBeDefined() // the spec line adds the size
      expect(screen.queryByText(/lượt tải/)).toBeNull()
    })

    it('renders the download count only when the real aggregate has one', () => {
      render(
        <ProductGridItem
          product={mockProduct}
          stats={{ downloads: 7, reviewCount: 0, ratingAverage: null }}
        />,
      )

      expect(screen.getByText('Revit .RVT · 45.8 MB · 7 lượt tải')).toBeDefined()
    })

    it('renders author avatar circle and name', () => {
      render(<ProductGridItem product={mockProduct} />)

      expect(screen.getByText('KTS. Lê Quang Huy')).toBeDefined()
      // Initial of 'KTS. Lê Quang Huy' is 'K'
      expect(screen.getByText('K')).toBeDefined()
    })

    it('renders the star block only from the real review aggregate', () => {
      cleanup()
      render(<ProductGridItem product={mockProduct} />)
      // `reviews` holds no row for this product, so there is no star block to show
      expect(screen.queryByText('★')).toBeNull()

      cleanup()
      render(
        <ProductGridItem
          product={mockProduct}
          stats={{ downloads: 0, reviewCount: 4, ratingAverage: 4.75 }}
        />,
      )
      expect(screen.getByText('★')).toBeDefined()
      expect(screen.getByText('4.8')).toBeDefined()
      expect(screen.getByText('(4)')).toBeDefined()
    })
  })

  // =========================================================================
  // SUITE 2: SINGLE ROOT LINK CONSTRAINT (NO NESTED LINKS / HYDRATION HAZARDS)
  // =========================================================================
  describe('2. Single Root Link Constraint & No Nested Interactive Elements', () => {
    it('contains strictly ONE link (<a>) element per card to prevent nested link hydration errors', () => {
      const mockProduct: Partial<Product> = {
        id: 202,
        title: 'Mẫu nhà phố mái Thái',
        slug: 'nha-pho-mai-thai',
        price: 500000,
      }

      render(<ProductGridItem product={mockProduct} />)

      // getByRole('link') throws if more than 1 link is found
      const links = screen.getAllByRole('link')
      expect(links.length).toBe(1)
      expect(links[0].getAttribute('href')).toBe('/products/nha-pho-mai-thai')
    })

    it('does not wrap download button in nested link', () => {
      const mockProduct: Partial<Product> = {
        id: 203,
        title: 'Bản vẽ kết cấu móng đơn',
        slug: 'ket-cau-mong-don',
        price: 0,
        isFree: true,
      }

      const { container } = render(<ProductGridItem product={mockProduct} />)

      const btn = container.querySelector('[data-slot="product-download-btn"]')
      expect(btn).not.toBeNull()
      // Button must NOT be inside another anchor tag within the card (apart from the root link)
      const parentAnchors = []
      let curr = btn?.parentElement
      while (curr && curr !== container) {
        if (curr.tagName.toLowerCase() === 'a' && curr.getAttribute('data-slot') !== 'product-card') {
          parentAnchors.push(curr)
        }
        curr = curr.parentElement
      }
      expect(parentAnchors.length).toBe(0)
    })
  })

  // =========================================================================
  // SUITE 3: TEXT COLLISION PREVENTION (PREVENTS TestingLibraryElementError)
  // =========================================================================
  describe('3. Text Collision Prevention & Accessibility Invariants', () => {
    it('prevents text collision when specFormat === softwareTitle (AutoCAD .DWG)', () => {
      const mockProduct: Partial<Product> = {
        id: 301,
        title: 'Bản vẽ chi tiết móng cọc',
        slug: 'chi-tiet-mong-coc',
        price: 250000,
        technicalSpecs: {
          fileFormat: 'AutoCAD .DWG',
        },
        software_types: [
          {
            id: 10,
            title: 'AutoCAD .DWG',
            slug: 'autocad-dwg',
            createdAt: '2026-01-01T00:00:00Z',
            updatedAt: '2026-01-01T00:00:00Z',
          } as SoftwareType,
        ],
      }

      render(<ProductGridItem product={mockProduct} />)

      // getByText must succeed without "Found multiple elements with the text: AutoCAD .DWG"
      const matched = screen.getAllByText('AutoCAD .DWG')
      expect(matched.length).toBe(1)
    })

    it('prevents text collision when specFormat === softwareTitle (Revit)', () => {
      const mockProduct: Partial<Product> = {
        id: 302,
        title: 'Mô hình Revit MEP khách sạn',
        slug: 'revit-mep-khach-san',
        price: 600000,
        technicalSpecs: {
          fileFormat: 'Revit',
        },
        software_types: [
          {
            id: 11,
            title: 'Revit',
            slug: 'revit',
            createdAt: '2026-01-01T00:00:00Z',
            updatedAt: '2026-01-01T00:00:00Z',
          } as SoftwareType,
        ],
      }

      render(<ProductGridItem product={mockProduct} />)

      // Revit should only appear once as badge (spec line has "Revit · ...", not exact "Revit")
      const matched = screen.getAllByText('Revit')
      expect(matched.length).toBe(1)
    })

    it('gracefully handles missing software types and categories without collision or crash', () => {
      const bareProduct: Partial<Product> = {
        id: 303,
        title: 'Hồ sơ kết cấu đơn giản',
        slug: 'ket-cau-don-gian',
        price: 100000,
        categories: undefined,
        software_types: undefined,
        technicalSpecs: undefined,
      }

      render(<ProductGridItem product={bareProduct} />)

      expect(screen.getByText('Hồ sơ kết cấu đơn giản')).toBeDefined()
      expect(screen.getByText('Bản quyền')).toBeDefined()
    })
  })

  // =========================================================================
  // SUITE 4: RATING MODULO DISTRIBUTION ORACLE & PROPERTY TESTING
  // =========================================================================
  describe('4. Invented values are gone: no id formula reaches the DOM', () => {
    it('never renders a fabricated download count or star rating, whatever the id is', () => {
      const testIds = [1, 30, -1, -15, 100, 255, 999, 1024, 7777, 8888, 9999]

      for (const numId of testIds) {
        cleanup()
        render(
          <ProductGridItem
            product={{ id: numId, title: `Product ID ${numId}`, slug: `prod-${numId}`, price: 200000 }}
          />,
        )

        // The old code derived "1000 + (id*137 % 900) lượt tải" and 4.7/4.8/4.9 stars from the id.
        // Neither `download_events` nor `reviews` has a row here, so neither element may render.
        expect(screen.queryByText(/lượt tải/)).toBeNull()
        expect(screen.queryByText('★')).toBeNull()
        expect(screen.queryByText(/^4\.[789]$/)).toBeNull()
      }
    })

    it('shows the aggregate the record really has, per product', () => {
      cleanup()
      render(
        <ProductGridItem
          product={{ id: 1, title: 'A', slug: 'a', price: 200000 }}
          stats={{ downloads: 12, reviewCount: 3, ratingAverage: 4.5 }}
        />,
      )
      expect(screen.getByText(/12 lượt tải/)).toBeDefined()
      expect(screen.getByText('4.5')).toBeDefined()
      expect(screen.getByText('(3)')).toBeDefined()

      cleanup()
      render(
        <ProductGridItem
          product={{ id: 2, title: 'B', slug: 'b', price: 200000 }}
          stats={{ downloads: 0, reviewCount: 0, ratingAverage: null }}
        />,
      )
      expect(screen.queryByText(/lượt tải/)).toBeNull()
      expect(screen.queryByText('★')).toBeNull()
    })
  })

  describe('4b. Product-first: the card shows the record it links to', () => {
    it('renders the product\'s own title and price for eight different products', () => {
      for (let i = 0; i < 8; i++) {
        cleanup()
        render(
          <ProductGridItem
            product={{ id: 1000 + i, title: `Seed Product ${i}`, slug: `seed-product-${i}`, price: 999999 + i }}
          />,
        )

        expect(screen.getByText(`Seed Product ${i}`)).toBeDefined()
        expect(screen.getByText(/999\.999 ₫|1\.000\.00[0-9] ₫/)).toBeDefined()
        // no curated bestseller content can appear, whatever the position is
        expect(screen.queryByText('KTS. Nguyễn Văn A')).toBeNull()
        expect(screen.queryByText(/1268|lượt tải/)).toBeNull()
      }
    })

    it('never substitutes a curated photo for the product\'s own cover', () => {
      const { container } = render(
        <ProductGridItem product={{ id: 999, title: 'No cover', slug: 'no-cover', price: 1000 }} />,
      )

      expect(container.innerHTML.includes('/media/curated/')).toBe(false)
    })
  })

  // =========================================================================
  // SUITE 6: MANDATORY USER DIRECTIVE: ADMINBAR PRESERVATION
  // =========================================================================
  describe('6. Mandatory User Directive: AdminBar 100% Preservation', () => {
    it('confirms <AdminBar /> is imported and rendered in web/src/app/(app)/layout.tsx', () => {
      const layoutPath = path.resolve(process.cwd(), 'src/app/(app)/layout.tsx')
      expect(fs.existsSync(layoutPath)).toBe(true)

      const layoutContent = fs.readFileSync(layoutPath, 'utf8')
      expect(layoutContent).toContain("import { AdminBar } from '@/components/AdminBar'")
      expect(layoutContent).toContain('<AdminBar />')
    })

    it('confirms web/src/components/AdminBar/index.tsx imports PayloadAdminBar and handles onAuthChange', () => {
      const adminBarPath = path.resolve(process.cwd(), 'src/components/AdminBar/index.tsx')
      expect(fs.existsSync(adminBarPath)).toBe(true)

      const adminBarContent = fs.readFileSync(adminBarPath, 'utf8')
      expect(adminBarContent).toContain("from '@payloadcms/admin-bar'")
      expect(adminBarContent).toContain('<PayloadAdminBar')
      expect(adminBarContent).toContain('onAuthChange={onAuthChange}')
    })
  })
})
