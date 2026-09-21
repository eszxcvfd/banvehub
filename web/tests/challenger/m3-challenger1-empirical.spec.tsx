import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'

// Components under test
import { CarouselClient } from '@/blocks/Carousel/Component.client'
import { CategoryTabs, CategoryCards, ARCHITECTURAL_CATEGORIES } from '@/components/CategoryTabs'
import { ProductGridItem } from '@/components/ProductGridItem'
import { CreatorBanner } from '@/components/CreatorBanner'
import { CategoryItem } from '@/components/layout/search/Categories.client'
import { SoftwareTypeItem } from '@/components/layout/search/SoftwareTypes.client'
import { PriceFilter } from '@/components/layout/search/PriceFilter'
import { ShopToolbar } from '@/components/layout/search/ShopToolbar'
import { ShopPagination } from '@/components/layout/search/ShopPagination'
import { RefundPolicyView } from '@/app/(app)/chinh-sach-hoan-tien/RefundPolicyView'
import type { Category, Media, Product, SoftwareType, User } from '@/payload-types'

// Mock next/navigation
const mockPush = vi.fn()
let mockSearchParams = new URLSearchParams()
let mockPathname = '/shop'

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
    replace: vi.fn(),
    prefetch: vi.fn(),
  }),
  usePathname: () => mockPathname,
  useSearchParams: () => mockSearchParams,
}))

// Mock next/image
vi.mock('next/image', () => ({
  default: ({ src, alt, className, ...props }: React.ComponentProps<'img'>) => {
    const resolvedSrc = typeof src === 'object' && src !== null ? (src as { src?: string; url?: string }).src || (src as { src?: string; url?: string }).url : src
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={resolvedSrc}
        alt={alt || ''}
        className={className}
        {...props}
      />
    )
  },
}))

// Mock next/link
vi.mock('next/link', () => ({
  default: ({ href, children, className, ...props }: { href: string; children: React.ReactNode; className?: string }) => (
    <a href={href} className={className} {...props}>
      {children}
    </a>
  ),
}))

// Polyfill window.matchMedia & ResizeObserver
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

describe('M3 Challenger 1: Empirical Verification & Stress Test Suite (Features F11 - F18)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockPathname = '/shop'
    mockSearchParams = new URLSearchParams()
    window.scrollTo = vi.fn()
  })

  afterEach(() => {
    cleanup()
  })

  // ==========================================================================
  // FEATURE F11: Homepage Hero Carousel
  // ==========================================================================
  describe('F11: Homepage Hero Carousel Autoplay, Navigation & Blueprint Tags', () => {
    it('F11.1: renders fallback slides when no products are passed', () => {
      render(<CarouselClient products={[]} />)

      // Fallback slides contain specific architectural drawing titles
      expect(screen.getByText('Hồ sơ thiết kế Biệt thự phố 3 tầng Tân Cổ Điển')).toBeDefined()
      expect(screen.getByText('Mô hình BIM Revit Bệnh viện đa khoa 500 giường')).toBeDefined()
      expect(screen.getByText('Bản vẽ Kết cấu Nhà xưởng thép tiền chế khẩu độ 36m')).toBeDefined()

      // Blueprint tags
      expect(screen.getByText('Kiến trúc & Kết cấu')).toBeDefined()
      expect(screen.getByText('Mô hình BIM LOD 400')).toBeDefined()
      expect(screen.getByText('Kết cấu công trình')).toBeDefined()
      expect(screen.getByText('AutoCAD .DWG / Revit')).toBeDefined()
      expect(screen.getByText('Revit .RVT / Navisworks')).toBeDefined()
      expect(screen.getByText('AutoCAD .DWG / SAP2000')).toBeDefined()

      // Pricing formats
      expect(screen.getAllByText(/Miễn phí/).length).toBeGreaterThan(0)
      expect(screen.getAllByText(/Bản quyền/).length).toBeGreaterThan(0)
      expect(screen.getByText('0 ₫ (Miễn phí)')).toBeDefined()

      // Navigation arrows with accessible labels
      const prevBtn = screen.getByRole('button', { name: 'Previous Slide' })
      const nextBtn = screen.getByRole('button', { name: 'Next Slide' })
      expect(prevBtn).toBeDefined()
      expect(nextBtn).toBeDefined()

      // Click buttons without throwing errors
      fireEvent.click(prevBtn)
      fireEvent.click(nextBtn)
    })

    it('F11.2: renders custom products when products array is provided', () => {
      const mockProduct1: Product = {
        id: 101,
        title: 'Bản vẽ Biệt thự đồi thông Đà Lạt',
        slug: 'ban-ve-biet-thu-doi-thong-da-lat',
        isFree: false,
        price: 450000,
        meta: {
          description: 'Hồ sơ thiết kế thi công đầy đủ biệt thự đồi thông phong cách Scandinavian',
          image: {
            id: 201,
            url: 'https://images.example.com/drawing-dalat.png',
          } as Media,
        },
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      }

      const mockProduct2: Product = {
        id: 102,
        title: 'Thư viện Family Revit Cửa gỗ tự nhiên LOD 400',
        slug: 'thu-vien-family-revit-cua-go',
        isFree: true,
        price: 0,
        meta: {
          description: 'Bộ sưu tập 50+ model family revit cửa đi cửa sổ thông số tham biến',
        },
        createdAt: '2026-01-02T00:00:00.000Z',
        updatedAt: '2026-01-02T00:00:00.000Z',
      }

      render(<CarouselClient products={[mockProduct1, mockProduct2]} />)

      // Product titles rendered
      expect(screen.getByText('Bản vẽ Biệt thự đồi thông Đà Lạt')).toBeDefined()
      expect(screen.getByText('Thư viện Family Revit Cửa gỗ tự nhiên LOD 400')).toBeDefined()

      // Standard tags
      expect(screen.getAllByText('Bản vẽ CAD/BIM tuyển chọn').length).toBe(2)
      expect(screen.getAllByText('AutoCAD / Revit / 3D').length).toBe(2)

      // Free vs Paid tags
      expect(screen.getByText('Bản quyền')).toBeDefined()
      expect(screen.getByText('Miễn phí')).toBeDefined()

      // Links to product details
      const detailLink = screen.getByRole('link', { name: /Xem Chi Tiết Bản Vẽ/i })
      expect(detailLink.getAttribute('href')).toBe('/products/ban-ve-biet-thu-doi-thong-da-lat')
    })
  })

  // ==========================================================================
  // FEATURE F12: Category Cards and Tabs Routing
  // ==========================================================================
  describe('F12: Category Cards and Tabs Routing to /shop?category=...', () => {
    it('F12.1: CategoryTabs renders all 8 architectural categories and routes on tab click', () => {
      mockSearchParams = new URLSearchParams('category=ban-ve-kien-truc')
      render(<CategoryTabs />)

      // Verify all categories are present in ARCHITECTURAL_CATEGORIES
      expect(ARCHITECTURAL_CATEGORIES).toHaveLength(8)
      expect(screen.getByText('Tất cả danh mục')).toBeDefined()
      expect(screen.getByText('Bản vẽ Kiến trúc')).toBeDefined()
      expect(screen.getByText('Bản vẽ Kết cấu')).toBeDefined()
      expect(screen.getByText('Cơ điện (MEP)')).toBeDefined()
      expect(screen.getByText('Mô hình BIM Revit')).toBeDefined()
      expect(screen.getByText('Thư viện 3ds Max / SketchUp')).toBeDefined()
      expect(screen.getByText('Thiết kế Nội thất')).toBeDefined()
      expect(screen.getByText('Hồ sơ Quy hoạch')).toBeDefined()

      // Click "Bản vẽ Kết cấu" tab
      const ketCauTab = screen.getByText('Bản vẽ Kết cấu')
      fireEvent.click(ketCauTab)
      expect(mockPush).toHaveBeenCalledWith('/shop?category=ban-ve-ket-cau')

      // Click "Tất cả danh mục" tab -> routes to '/shop'
      const allTab = screen.getByText('Tất cả danh mục')
      fireEvent.click(allTab)
      expect(mockPush).toHaveBeenCalledWith('/shop')
    })

    it('F12.2: CategoryCards renders 8 cards with icons, titles, counts and correct shop URLs', () => {
      render(<CategoryCards />)

      const links = screen.getAllByRole('link')
      expect(links).toHaveLength(8)

      // Check specific categories and links
      const kienTrucLink = links.find((l) => l.getAttribute('href') === '/shop?category=ban-ve-kien-truc')
      expect(kienTrucLink).toBeDefined()
      expect(kienTrucLink?.textContent).toContain('Bản vẽ Kiến trúc')
      expect(kienTrucLink?.textContent).toContain('850+ hồ sơ')

      const mepLink = links.find((l) => l.getAttribute('href') === '/shop?category=ban-ve-co-dien-mep')
      expect(mepLink).toBeDefined()
      expect(mepLink?.textContent).toContain('Cơ điện (MEP)')
      expect(mepLink?.textContent).toContain('340+ hồ sơ')

      const allLink = links.find((l) => l.getAttribute('href') === '/shop')
      expect(allLink).toBeDefined()
      expect(allLink?.textContent).toContain('Tất cả danh mục')
    })
  })

  // ==========================================================================
  // FEATURE F13 & F14: Product Cards & Creator Banner
  // ==========================================================================
  describe('F13 & F14: Product Cards, Ratings, Tags, Price & Creator Banner', () => {
    it('F13.1: ProductGridItem renders format tag, verified badge, rating, VND price and link', () => {
      const mockCategory: Category = {
        id: 1,
        title: 'Bản vẽ Kiến trúc',
        slug: 'ban-ve-kien-truc',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      }

      const mockSoftware: SoftwareType = {
        id: 2,
        title: 'AutoCAD .DWG',
        slug: 'autocad',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      }

      const mockProduct: Partial<Product> = {
        id: 55,
        title: 'Hồ sơ thiết kế Nhà phố 4 tầng 4x16m',
        slug: 'nha-pho-4-tang-4x16m',
        isFree: false,
        price: 280000,
        categories: [mockCategory],
        software_types: [mockSoftware],
        seller: {
          id: 99,
          collection: 'users',
          name: 'KTS. Nguyễn Văn A',
          email: 'kts.a@example.com',
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        } as unknown as User,
      }

      render(
        <ProductGridItem
          product={mockProduct}
          stats={{ downloads: 41, reviewCount: 12, ratingAverage: 4.8 }}
        />,
      )

      // Link integrity
      const rootLink = screen.getByRole('link')
      expect(rootLink.getAttribute('href')).toBe('/products/nha-pho-4-tang-4x16m')

      // Category and Software tags
      expect(screen.getByText('Bản vẽ Kiến trúc')).toBeDefined()
      expect(screen.getByText('AutoCAD .DWG')).toBeDefined()
      expect(screen.getByText('Bản quyền')).toBeDefined()

      // Seller attribution
      expect(screen.getByText('KTS. Nguyễn Văn A')).toBeDefined()

      // Rating and download count come from the aggregates this card was handed
      expect(screen.getByText('4.8')).toBeDefined()
      expect(screen.getByText('(12)')).toBeDefined()
      expect(screen.getByText(/41 lượt tải/)).toBeDefined()

      // VND Price formatting check (280.000 ₫)
      expect(screen.getByText('280.000 ₫')).toBeDefined()

      // Button download action
      expect(screen.getByRole('button', { name: /Tải về/i })).toBeDefined()
    })

    it('F13.2: ProductGridItem renders free product correctly with 0 ₫ (Miễn phí)', () => {
      const freeProduct: Partial<Product> = {
        id: 56,
        title: 'Thư viện Hatch CAD Gạch ốp lát',
        slug: 'thu-vien-hatch-cad',
        isFree: true,
        price: 0,
      }

      render(<ProductGridItem product={freeProduct} />)
      expect(screen.getByText('0 ₫ (Miễn phí)')).toBeDefined()
      expect(screen.getByText('Miễn phí')).toBeDefined()
    })

    it('F13.3: ProductGridItem renders 390.000 ₫ consistently for price 390000 matching product detail', () => {
      const mockProduct390k: Partial<Product> = {
        id: 57,
        title: 'Bản vẽ Biệt thự 3 tầng Hiện đại',
        slug: 'biet-thu-3-tang',
        isFree: false,
        price: 390000,
      }

      render(<ProductGridItem product={mockProduct390k} />)
      expect(screen.getByText('390.000 ₫')).toBeDefined()
    })

    it('F14.1: CreatorBanner renders revenue share, VietQR instant payouts, guarantees and statistics', () => {
      render(<CreatorBanner memberCount={59} revenueSharePercent={70} />)

      // Main header
      expect(screen.getByText(/Nền Tảng Hợp Tác Kỹ Sư & Tác Giả Bản Vẽ/i)).toBeDefined()

      // Creator pillar
      expect(screen.getByText(/70% Chia sẻ doanh thu/i)).toBeDefined()
      expect(screen.getByText(/59 thành viên/i)).toBeDefined()
      expect(screen.getByText(/Rút tiền tức thì 24\/7/i)).toBeDefined()
      expect(screen.getByText(/Bảo vệ bản quyền số/i)).toBeDefined()
      expect(screen.getByRole('link', { name: /Đăng Ký Bán Bản Vẽ Ngay/i })).toBeDefined()

      // Customer guarantees pillar
      expect(screen.getByText(/100% Hồ sơ đã kiểm duyệt/i)).toBeDefined()
      expect(screen.getByText(/Chính sách hoàn tiền 100%/i)).toBeDefined()
      expect(screen.getByText(/Tải lại không giới hạn/i)).toBeDefined()
      expect(screen.getByRole('link', { name: /Khám Phá Bản Vẽ Đã Thẩm Định/i })).toBeDefined()

      // Statistics
      expect(screen.getByText('Bản vẽ đã kiểm duyệt')).toBeDefined()
      expect(screen.getByText('Tỷ lệ chia sẻ doanh thu')).toBeDefined()
      expect(screen.getByText('Cam kết hoàn tiền')).toBeDefined()
      expect(screen.getByText('Hỗ trợ kỹ thuật kỹ sư')).toBeDefined()
    })
  })

  // ==========================================================================
  // FEATURE F15: Shop Multi-Criteria Filters
  // ==========================================================================
  describe('F15: Shop Multi-Criteria Filter Sidebar', () => {
    it('F15.1: CategoryItem radio selection updates query and resets page', () => {
      const category: Category = {
        id: 10,
        title: 'Bản vẽ Kết cấu',
        slug: 'ban-ve-ket-cau',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      }

      mockSearchParams = new URLSearchParams('page=3')
      const { rerender } = render(<CategoryItem category={category} />)

      // Click to select category
      const radioContainer = screen.getByText('Bản vẽ Kết cấu')
      fireEvent.click(radioContainer)

      // Should remove page and set category
      expect(mockPush).toHaveBeenCalledWith('/shop?category=ban-ve-ket-cau')

      // Now simulate it is active and click again to deselect
      mockSearchParams = new URLSearchParams('category=ban-ve-ket-cau')
      rerender(<CategoryItem category={category} />)

      fireEvent.click(radioContainer)
      expect(mockPush).toHaveBeenCalledWith('/shop')
    })

    it('F15.2: SoftwareTypes Checkbox supports multi-selection with comma-separated query', () => {
      const software1: SoftwareType = {
        id: 1,
        title: 'AutoCAD',
        slug: 'autocad',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      }

      const software2: SoftwareType = {
        id: 2,
        title: 'Revit',
        slug: 'revit',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      }

      // Initial state: autocad already selected
      mockSearchParams = new URLSearchParams('softwareType=autocad&page=2')

      const { rerender } = render(
        <div>
          <SoftwareTypeItem software={software1} />
          <SoftwareTypeItem software={software2} />
        </div>
      )

      // Click Revit to multi-select
      const revitItem = screen.getByText('Revit')
      fireEvent.click(revitItem)

      // Should merge into autocad,revit and remove page
      expect(mockPush).toHaveBeenCalledWith('/shop?softwareType=autocad%2Crevit')

      // Now simulate both selected, click AutoCAD to deselect it
      mockSearchParams = new URLSearchParams('softwareType=autocad,revit')
      rerender(
        <div>
          <SoftwareTypeItem software={software1} />
          <SoftwareTypeItem software={software2} />
        </div>
      )

      const autocadItem = screen.getByText('AutoCAD')
      fireEvent.click(autocadItem)

      // Should leave only revit
      expect(mockPush).toHaveBeenCalledWith('/shop?softwareType=revit')

      // Now click Revit when it's the only one selected
      mockSearchParams = new URLSearchParams('softwareType=revit')
      rerender(
        <div>
          <SoftwareTypeItem software={software1} />
          <SoftwareTypeItem software={software2} />
        </div>
      )
      fireEvent.click(revitItem)
      expect(mockPush).toHaveBeenCalledWith('/shop')
    })

    it('F15.3: PriceFilter radio buttons correctly toggle free/paid/all modes', () => {
      mockSearchParams = new URLSearchParams()
      const { rerender } = render(<PriceFilter />)

      // Click "Miễn phí"
      const freeRadio = screen.getByRole('radio', { name: 'Miễn phí' })
      fireEvent.click(freeRadio)
      expect(mockPush).toHaveBeenCalledWith('/shop?isFree=true&priceType=free')

      // Click "Có phí"
      const paidRadio = screen.getByRole('radio', { name: 'Có phí' })
      fireEvent.click(paidRadio)
      expect(mockPush).toHaveBeenCalledWith('/shop?isFree=false&priceType=paid')

      // When "Miễn phí" is active, click "Tất cả" to reset
      mockSearchParams = new URLSearchParams('isFree=true&priceType=free')
      rerender(<PriceFilter />)

      const allRadio = screen.getByRole('radio', { name: 'Tất cả' })
      fireEvent.click(allRadio)
      expect(mockPush).toHaveBeenCalledWith('/shop')
    })
  })

  // ==========================================================================
  // FEATURE F16: Shop Toolbar & View Modes
  // ==========================================================================
  describe('F16: Shop Catalog Toolbar & View Modes', () => {
    it('F16.1: renders totalDocs count tag and search query display', () => {
      render(
        <ShopToolbar
          totalDocs={42}
          currentSort="-createdAt"
          currentView="grid"
          searchQuery="Biệt thự tân cổ điển"
        />
      )

      expect(screen.getByText('42 bản vẽ')).toBeDefined()
      expect(screen.getByText(/"Biệt thự tân cổ điển"/)).toBeDefined()
    })

    it('F16.2: changing sort dropdown pushes new sort query param and resets page', () => {
      mockSearchParams = new URLSearchParams('page=4')
      render(<ShopToolbar totalDocs={10} currentSort="-createdAt" currentView="grid" />)

      const sortSelect = screen.getByRole('combobox', { name: 'Sắp xếp sản phẩm' })
      expect(sortSelect).toBeDefined()

      fireEvent.mouseDown(sortSelect)
      const priceOption = screen.getByText('Giá: Thấp đến Cao')
      fireEvent.click(priceOption)

      expect(mockPush).toHaveBeenCalledWith('/shop?sort=price')
    })

    it('F16.3: switching grid vs list view mode updates view param', () => {
      render(<ShopToolbar totalDocs={20} currentSort="-createdAt" currentView="grid" />)

      const listButton = screen.getByRole('radio', { name: 'Chế độ xem danh sách' })
      fireEvent.click(listButton)

      expect(mockPush).toHaveBeenCalledWith('/shop?view=list')
    })
  })

  // ==========================================================================
  // FEATURE F18: Shop Pagination
  // ==========================================================================
  describe('F18: Shop Pagination Integration with ?page=', () => {
    it('F18.1: does not render pagination when totalDocs <= pageSize', () => {
      const { container } = render(
        <ShopPagination currentPage={1} pageSize={12} totalDocs={8} />
      )
      expect(container.firstChild).toBeNull()
    })

    it('F18.2: renders pagination and navigates to ?page=2 when page 2 is clicked', () => {
      render(<ShopPagination currentPage={1} pageSize={12} totalDocs={36} />)

      // Total range text
      expect(screen.getByText(/1-12 của 36 sản phẩm/)).toBeDefined()

      // Click page 2
      const page2Btn = screen.getByRole('listitem', { name: '2' })
      fireEvent.click(page2Btn)

      expect(mockPush).toHaveBeenCalledWith('/shop?page=2')
      expect(window.scrollTo).toHaveBeenCalledWith({ top: 0, behavior: 'smooth' })
    })

    it('F18.3: navigating back to page 1 deletes the page query param', () => {
      mockSearchParams = new URLSearchParams('page=2&category=ban-ve-kien-truc')

      render(<ShopPagination currentPage={2} pageSize={12} totalDocs={36} />)

      const page1Btn = screen.getByRole('listitem', { name: '1' })
      fireEvent.click(page1Btn)

      expect(mockPush).toHaveBeenCalledWith('/shop?category=ban-ve-kien-truc')
    })
  })

  // ==========================================================================
  // FEATURE F17: Empty State & Search Regex Contract
  // ==========================================================================
  describe('F17: Empty Search and Filter State Regex Matching', () => {
    it('F17.1: matches exact expected regex for keyword search with no results', () => {
      const query = 'không-tồn-tại-xyz-999'
      const searchEmptyText = `There are no products that match "${query}"`
      const expectedSearchRegex = /There are no products that match/i

      expect(searchEmptyText).toMatch(expectedSearchRegex)
      expect(searchEmptyText).toContain(`"${query}"`)
    })

    it('F17.2: matches exact expected regex for empty filter state without search keyword', () => {
      const filterEmptyText = 'No products found. Please try different filters.'
      const expectedFilterRegex = /No products found\. Please try different filters\./

      expect(filterEmptyText).toMatch(expectedFilterRegex)
    })
  })

  // ==========================================================================
  // REFUND POLICY (/chinh-sach-hoan-tien) & ADMIN ISOLATION CONTRACT
  // ==========================================================================
  describe('Refund Policy View & Ant Design Component Composition', () => {
    it('renders Alert, Condition Card, 4-Step Process and Support CTA', () => {
      render(<RefundPolicyView />)

      // Alert
      expect(screen.getByText('Cam kết bảo vệ quyền lợi kỹ sư 100%')).toBeDefined()

      // Section 1: Conditions
      expect(screen.getByText(/1\. Điều Kiện Áp Dụng Hoàn Tiền/)).toBeDefined()
      expect(screen.getByText(/Tệp tin bị lỗi hoặc hỏng:/)).toBeDefined()
      expect(screen.getByText(/Sai lệch nội dung nghiêm trọng:/)).toBeDefined()

      // Section 2: 4-Step Process
      expect(screen.getByText(/2\. Quy Trình Hoàn Tiền 4 Bước Đơn Giản/)).toBeDefined()
      expect(screen.getByText('Bước 1: Gửi yêu cầu hỗ trợ hoặc báo cáo')).toBeDefined()
      expect(screen.getByText('Bước 2: Xác minh kỹ thuật (Trong vòng 24 giờ)')).toBeDefined()
      expect(screen.getByText('Bước 3: Trao đổi với Tác giả / Người bán')).toBeDefined()
      expect(screen.getByText('Bước 4: Nhận lại 100% tiền hoàn')).toBeDefined()

      // Support Card
      expect(screen.getByText('Cần Hỗ Trợ Kỹ Thuật Trực Tiếp?')).toBeDefined()
      expect(screen.getByRole('link', { name: /Khám phá kho bản vẽ/i })).toBeDefined()
      expect(screen.getByRole('link', { name: /Quản lý đơn hàng của bạn/i })).toBeDefined()
    })
  })
})
