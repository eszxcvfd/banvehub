import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'
import { Gallery } from '@/components/product/Gallery'
import { TechnicalSpecsTable } from '@/components/product/TechnicalSpecsTable'
import { DigitalProductCTA } from '@/components/product/DigitalProductCTA'
import { ProductStickyBar } from '@/components/product/ProductStickyBar'
import { ProductReviewsSection } from '@/components/product/ProductReviewsSection'
import { ProductCommentsSection } from '@/components/product/ProductCommentsSection'
import { ProductReportDialog } from '@/components/product/ProductReportDialog'
import type { Category, Media, Product, ProductPreview, SoftwareType, Tag } from '@/payload-types'

// Mock useAuth
const mockUseAuth = vi.fn()
vi.mock('@/providers/Auth', () => ({
  useAuth: () => mockUseAuth(),
}))

// Mock next/navigation
vi.mock('next/navigation', () => ({
  usePathname: () => '/products/biet-thu-hien-dai',
  useRouter: () => ({ push: vi.fn() }),
}))

// Mock sonner toast
const { mockToast } = vi.hoisted(() => ({
  mockToast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}))
vi.mock('sonner', () => ({
  toast: mockToast,
}))

// Mock next/image
vi.mock('next/image', () => ({
  default: ({ src, alt, className, ...props }: any) => (
    <img
      src={typeof src === 'object' ? src?.src || src?.url : src}
      alt={alt || ''}
      className={className}
      {...props}
    />
  ),
}))

// Mock next/link
vi.mock('next/link', () => ({
  default: ({ href, children, className, ...props }: any) => (
    <a href={href} className={className} {...props}>
      {children}
    </a>
  ),
}))

// Mock matchMedia & ResizeObserver for antd
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

describe('M3 Challenger 2: Empirical Stress Test Suite (Features F19 - F24)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    global.fetch = vi.fn()
    mockUseAuth.mockReturnValue({ user: null })
  })

  afterEach(() => {
    cleanup()
  })

  // -------------------------------------------------------------
  // Feature F19: Gallery watermark overlay & preview group
  // -------------------------------------------------------------
  describe('F19: Gallery Watermark Overlay & Preview Navigation', () => {
    const media1: Media = {
      id: 10,
      url: '/media/drawing-1.png',
      alt: 'Bản vẽ phối cảnh 1',
      width: 1920,
      height: 1080,
      mimeType: 'image/png',
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    }

    const media2: Media = {
      id: 20,
      url: '/media/drawing-2.png',
      alt: 'Bản vẽ mặt bằng 2',
      width: 1920,
      height: 1080,
      mimeType: 'image/png',
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    }

    const media3: Media = {
      id: 30,
      url: '/media/model-3d.png',
      alt: 'Mô hình BIM 3D',
      width: 1920,
      height: 1080,
      mimeType: 'image/png',
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    }

    const watermarkedPreview: ProductPreview = {
      id: 101,
      title: 'Watermarked Drawing',
      previewImage: media1,
      previewType: 'image',
      isWatermarked: true,
      caption: 'Bản vẽ kỹ thuật có đóng dấu bảo vệ',
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    }

    const pdfPreview: ProductPreview = {
      id: 102,
      title: 'PDF Spec Sheet',
      previewImage: media2,
      previewType: 'pdf',
      isWatermarked: true,
      caption: 'Trang PDF hồ sơ kỹ thuật',
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    }

    const model3dPreview: ProductPreview = {
      id: 103,
      title: '3D BIM Model',
      previewImage: media3,
      previewType: 'model_viewer',
      isWatermarked: false,
      caption: null,
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    }

    it('F19.1: displays exact watermark overlay text "KienTaoHub Preview • Bản quyền số" and tag when preview is watermarked', () => {
      render(<Gallery previewGallery={[watermarkedPreview]} />)

      // Exact watermark overlay text
      const watermarkText = screen.getByText('KienTaoHub Preview • Bản quyền số')
      expect(watermarkText).toBeDefined()
      expect(watermarkText.className).toContain('uppercase')

      // Watermark badge tag
      expect(screen.getByText('Bản xem trước có Watermark')).toBeDefined()
      expect(screen.getByText('Bản vẽ kỹ thuật có đóng dấu bảo vệ')).toBeDefined()
    })

    it('F19.2: toggles watermark overlay accurately when switching between watermarked and clean thumbnails', () => {
      render(<Gallery previewGallery={[watermarkedPreview, model3dPreview]} />)

      // Initial active item is watermarkedPreview
      expect(screen.getByText('KienTaoHub Preview • Bản quyền số')).toBeDefined()
      expect(screen.getByText('Bản xem trước có Watermark')).toBeDefined()

      // Click second thumbnail (model3dPreview)
      const thumbs = screen.getAllByRole('button', { name: /Xem ảnh/i })
      expect(thumbs.length).toBe(2)
      fireEvent.click(thumbs[1])

      // Watermark overlay and badge should disappear; 3D tag appears
      expect(screen.queryByText('KienTaoHub Preview • Bản quyền số')).toBeNull()
      expect(screen.queryByText('Bản xem trước có Watermark')).toBeNull()
      expect(screen.getByText('Mô hình 3D')).toBeDefined()

      // Switch back to first thumbnail
      fireEvent.click(thumbs[0])
      expect(screen.getByText('KienTaoHub Preview • Bản quyền số')).toBeDefined()
      expect(screen.getByText('Bản xem trước có Watermark')).toBeDefined()
    })

    it('F19.3: renders PDF badge and handles thumbnail switching correctly', () => {
      render(<Gallery previewGallery={[watermarkedPreview, pdfPreview]} />)

      expect(screen.getByText('PDF')).toBeDefined()
      const thumbs = screen.getAllByRole('button', { name: /Xem ảnh/i })
      fireEvent.click(thumbs[1])

      expect(screen.getByText('Trang PDF mẫu')).toBeDefined()
      expect(screen.getByText('Trang PDF hồ sơ kỹ thuật')).toBeDefined()
    })

    it('F19.4: falls back to Empty placeholder when no preview items or fallback images are supplied', () => {
      render(<Gallery previewGallery={[]} gallery={[]} fallbackImage={null} />)

      expect(screen.getByText('Bản xem trước đang được cập nhật')).toBeDefined()
      expect(screen.getByText('Tài liệu kỹ thuật sẵn sàng tải xuống sau khi phát hành')).toBeDefined()
    })

    it('F19.5: filters out broken previews with null media gracefully without crashing', () => {
      const brokenList = [
        { id: 'b1', previewImage: null as any, previewType: 'image' as const },
        { id: 'b2', previewImage: 'invalid-id' as any, previewType: 'image' as const },
        watermarkedPreview,
      ]

      render(<Gallery previewGallery={brokenList as any} />)
      expect(screen.getByText('KienTaoHub Preview • Bản quyền số')).toBeDefined()
    })
  })

  // -------------------------------------------------------------
  // Feature F20: Technical Specs descriptions table
  // -------------------------------------------------------------
  describe('F20: Technical Specs Descriptions Table (id="specs-section")', () => {
    const testProduct: Product = {
      id: 55,
      title: 'Hồ sơ thiết kế kỹ thuật thi công',
      slug: 'ho-so-thiet-ke',
      price: 350000,
      _status: 'published',
      technicalSpecs: {
        fileFormat: '.dwg, .rvt',
        softwareVersion: 'AutoCAD 2024 / Revit 2024',
        fileSize: '124.5 MB',
        unit: 'metric',
      },
      categories: [
        {
          id: 1,
          title: 'Kết Cấu',
          slug: 'ket-cau',
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
      tags: [
        {
          id: 3,
          title: 'Nhà Phố',
          slug: 'nha-pho',
          createdAt: '2026-01-01T00:00:00Z',
          updatedAt: '2026-01-01T00:00:00Z',
        } as Tag,
      ],
      updatedAt: '2026-09-18T12:00:00.000Z',
      createdAt: '2026-09-01T00:00:00.000Z',
    }

    it('F20.1: renders container with id="specs-section" and descriptions bordered table', () => {
      const { container } = render(<TechnicalSpecsTable product={testProduct} />)

      const section = container.querySelector('#specs-section')
      expect(section).not.toBeNull()
      expect(screen.getByText('Thông số kỹ thuật tài nguyên (Technical Specifications)')).toBeDefined()

      // Ant Design descriptions table items
      expect(screen.getByText('.dwg, .rvt')).toBeDefined()
      expect(screen.getByText('AutoCAD 2024 / Revit 2024')).toBeDefined()
      expect(screen.getByText('124.5 MB')).toBeDefined()
      // the unit row renders only the record's own unit (this fixture carries unit: 'metric')
      // No technical-review claim: no record carries one (decision 0018 clause 2)
      expect(screen.queryByText('Đã kiểm duyệt cấu trúc layer, xref và kích thước chuẩn')).toBeNull()
    })

    it('F20.2: generates correct filtered catalog links for categories and software types', () => {
      render(<TechnicalSpecsTable product={testProduct} />)

      const categoryLink = screen.getByRole('link', { name: 'Kết Cấu' })
      expect(categoryLink.getAttribute('href')).toBe('/shop?category=ket-cau')

      const softwareLink = screen.getByRole('link', { name: 'Revit' })
      expect(softwareLink.getAttribute('href')).toBe('/shop?softwareType=revit')

      expect(screen.getByText('#Nhà Phố')).toBeDefined()
    })

    it('F20.3: maps imperial and other unit options correctly', () => {
      const imperialProduct: Product = {
        ...testProduct,
        technicalSpecs: { ...testProduct.technicalSpecs, unit: 'imperial' },
      }
      const { rerender } = render(<TechnicalSpecsTable product={imperialProduct} />)
      expect(screen.getByText('Hệ Inch / Feet (Imperial)')).toBeDefined()

      const otherProduct: Product = {
        ...testProduct,
        technicalSpecs: { ...testProduct.technicalSpecs, unit: 'other' },
      }
      rerender(<TechnicalSpecsTable product={otherProduct} />)
      expect(screen.getByText('Hệ đơn vị khác')).toBeDefined()
    })

    it('F20.4: gracefully handles missing technical specs with localized defaults', () => {
      const bareProduct: Product = {
        id: 56,
        title: 'Bản vẽ cơ bản',
        slug: 'ban-ve-co-ban',
        price: 0,
        _status: 'published',
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
      }

      render(<TechnicalSpecsTable product={bareProduct} />)

      expect(screen.queryByText('Tệp kỹ thuật chuẩn')).toBeNull() // omitted when the record has no value
      expect(screen.queryByText('Tương thích mọi phiên bản')).toBeNull() // omitted when the record has no value
      expect(screen.queryByText('Đang cập nhật')).toBeNull() // omitted when the record has no value
      // the unit row renders only the record's own unit (this fixture carries unit: 'metric')
      expect(screen.queryByText('Đa nền tảng CAD/BIM')).toBeNull() // omitted when the record has no value
      expect(screen.queryByText('Hồ sơ kỹ thuật tổng hợp')).toBeNull() // omitted when the record has no value
    })
  })

  // -------------------------------------------------------------
  // Feature F21: DigitalProductCTA financial state & modals & sync
  // -------------------------------------------------------------
  describe('F21: DigitalProductCTA Financial States, Modals & BroadcastChannel Sync', () => {
    it('F21.1: renders free product state and opens login modal when guest clicks free download', () => {
      mockUseAuth.mockReturnValue({ user: null })

      render(
        <DigitalProductCTA
          productId={77}
          sellerId={999}
          isFree={true}
          price={0}
          productTitle="Bản vẽ kết cấu móng miễn phí"
        />,
      )

      expect(screen.getAllByText('Miễn phí').length).toBeGreaterThanOrEqual(1)
      expect(screen.getByText('0 ₫')).toBeDefined()

      const freeBtn = screen.getByRole('button', { name: /Tải xuống ngay \(Miễn phí\)/i })
      fireEvent.click(freeBtn)

      // Guest Login Modal should appear
      expect(screen.getByText('Yêu cầu đăng nhập')).toBeDefined()
      expect(screen.getByText(/tải xuống tài nguyên miễn phí/i)).toBeDefined()
      expect(screen.getByRole('button', { name: 'Đăng nhập ngay' })).toBeDefined()
    })

    it('F21.2: triggers insufficient funds modal on INSUFFICIENT_FUNDS response with shortfall calculation and retry flow', async () => {
      mockUseAuth.mockReturnValue({
        user: { id: 301, email: 'engineer@kientao.vn' },
      })

      // Initial entitlement query returns false
      ;(global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, hasEntitlement: false }),
      })

      // Purchase call returns 400 INSUFFICIENT_FUNDS
      ;(global.fetch as any).mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: async () => ({
          error: 'INSUFFICIENT_FUNDS',
          message: 'Số dư ví không đủ',
          required: 500000,
          balance: 150000,
        }),
      })

      render(
        <DigitalProductCTA
          productId={77}
          sellerId={999}
          isFree={false}
          price={500000}
          productTitle="Hồ sơ full kiến trúc"
        />,
      )

      const buyBtn = screen.getByRole('button', { name: /Mua ngay — 500\.000\s*₫/i })
      fireEvent.click(buyBtn)

      await waitFor(() => {
        expect(screen.getByText('Số dư ví không đủ')).toBeDefined()
        expect(screen.getByText(/350\.000\s*₫/)).toBeDefined() // Shortfall = 500k - 150k = 350k
        expect(screen.getByText('Nạp tiền vào ví')).toBeDefined()
        expect(screen.getByText('Đã nạp tiền, thử lại')).toBeDefined()
      })

      // Simulate clicking "Đã nạp tiền, thử lại"
      ;(global.fetch as any).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ success: true, orderId: 'ORD-SUCCESS', entitlementId: 777 }),
      })
      ;(global.fetch as any).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ success: true, data: { downloadUrl: '/downloads/token-123' } }),
      })

      const retryBtn = screen.getByRole('button', { name: /Đã nạp tiền, thử lại/i })
      fireEvent.click(retryBtn)

      await waitFor(() => {
        expect(screen.getByText('Tải xuống ngay')).toBeDefined()
        expect(screen.getByText('Đã sở hữu')).toBeDefined()
      })
    })

    it('F21.3: synchronizes cross-tab purchase via BroadcastChannel event', async () => {
      mockUseAuth.mockReturnValue({
        user: { id: 301, email: 'engineer@kientao.vn' },
      })

      // Initial entitlement query returns false
      ;(global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, hasEntitlement: false }),
      })

      let channelHandler: ((e: any) => void) | null = null
      class MockBroadcastChannel {
        name: string
        constructor(name: string) {
          this.name = name
        }
        set onmessage(fn: (e: any) => void) {
          channelHandler = fn
        }
        postMessage(msg: any) {
          if (channelHandler) channelHandler({ data: msg })
        }
        close() {}
      }
      const originalBC = (window as any).BroadcastChannel
      ;(window as any).BroadcastChannel = MockBroadcastChannel

      try {
        render(
          <DigitalProductCTA
            productId={88}
            sellerId={999}
            isFree={false}
            price={300000}
            productTitle="Mô hình BIM cao ốc"
          />,
        )

        expect(screen.getByRole('button', { name: /Mua ngay — 300\.000\s*₫/i })).toBeDefined()

        // Tab B dispatches PURCHASE_COMPLETED
        if (channelHandler) {
          ;(channelHandler as any)({
            data: {
              type: 'PURCHASE_COMPLETED',
              productId: 88,
              userId: 301,
            },
          })
        }

        await waitFor(() => {
          expect(screen.getByText('Tải xuống ngay')).toBeDefined()
          expect(screen.getByText('Đã sở hữu')).toBeDefined()
        })
      } finally {
        ;(window as any).BroadcastChannel = originalBC
      }
    })

    it('F21.4: prevents author from purchasing own product (seller safety gate)', () => {
      mockUseAuth.mockReturnValue({
        user: { id: 999, email: 'architect-seller@kientao.vn' },
      })

      render(
        <DigitalProductCTA
          productId={88}
          sellerId={999}
          isFree={false}
          price={300000}
          productTitle="Mô hình BIM cao ốc"
        />,
      )

      const sellerBtn = screen.getByRole('button', { name: /Sản phẩm của bạn/i })
      expect((sellerBtn as HTMLButtonElement).disabled).toBe(true)
      expect(
        screen.getByText(/Bạn là tác giả của sản phẩm này. Bạn không thể tự mua sản phẩm của chính mình./i),
      ).toBeDefined()
    })
  })

  // -------------------------------------------------------------
  // Feature F22: ProductStickyBar appearance on 400px+ scroll
  // -------------------------------------------------------------
  describe('F22: ProductStickyBar Scroll Threshold & Actions', () => {
    it('F22.1: remains hidden at scrollY <= 400 and mounts when scrollY > 400', () => {
      // Mock window.scrollY = 250
      Object.defineProperty(window, 'scrollY', { value: 250, writable: true })

      render(
        <ProductStickyBar
          productTitle="Bản vẽ kết cấu thép nhà xưởng"
          price={450000}
          isFree={false}
          fileFormat=".dwg"
        />,
      )

      // Bar is hidden
      expect(screen.queryByText('Bản vẽ kết cấu thép nhà xưởng')).toBeNull()

      // Scroll past 400px threshold
      Object.defineProperty(window, 'scrollY', { value: 450, writable: true })
      fireEvent.scroll(window)

      // Bar is now visible
      expect(screen.getByText('Bản vẽ kết cấu thép nhà xưởng')).toBeDefined()
      expect(screen.getByText('450.000 ₫')).toBeDefined()
      expect(screen.getByText('.dwg')).toBeDefined()
      expect(screen.getByRole('button', { name: /Mua ngay — 450\.000 ₫/i })).toBeDefined()

      // Scroll back up <= 400px
      Object.defineProperty(window, 'scrollY', { value: 100, writable: true })
      fireEvent.scroll(window)

      // Bar hides again
      expect(screen.queryByText('Bản vẽ kết cấu thép nhà xưởng')).toBeNull()
    })

    it('F22.2: renders free download button and invokes onAction callback', () => {
      Object.defineProperty(window, 'scrollY', { value: 500, writable: true })
      const actionSpy = vi.fn()

      render(
        <ProductStickyBar
          productTitle="Mẫu đồ án miễn phí"
          price={0}
          isFree={true}
          onAction={actionSpy}
        />,
      )

      fireEvent.scroll(window)

      expect(screen.getByText('Miễn phí')).toBeDefined()
      const downloadBtn = screen.getByRole('button', { name: /Tải xuống ngay \(Miễn phí\)/i })
      fireEvent.click(downloadBtn)

      expect(actionSpy).toHaveBeenCalledTimes(1)
    })

    it('F22.3: disables action button when viewer is the seller', () => {
      Object.defineProperty(window, 'scrollY', { value: 500, writable: true })

      render(
        <ProductStickyBar
          productTitle="Bản vẽ của tôi"
          price={200000}
          isSeller={true}
        />,
      )

      fireEvent.scroll(window)

      const sellerBtn = screen.getByRole('button', { name: 'Sản phẩm của bạn' })
      expect((sellerBtn as HTMLButtonElement).disabled).toBe(true)
    })

    it('F22.4: invokes smooth scroll to hero CTA when onAction is omitted', () => {
      Object.defineProperty(window, 'scrollY', { value: 500, writable: true })
      const scrollToSpy = vi.fn()
      window.scrollTo = scrollToSpy

      render(
        <ProductStickyBar
          productTitle="Bản vẽ biệt thự"
          price={200000}
          isFree={false}
        />,
      )

      fireEvent.scroll(window)

      const buyBtn = screen.getByRole('button', { name: /Mua ngay — 200\.000 ₫/i })
      fireEvent.click(buyBtn)

      expect(scrollToSpy).toHaveBeenCalledWith({ top: 200, behavior: 'smooth' })
    })
  })

  // -------------------------------------------------------------
  // Feature F23: ProductReviewsSection rate summary, distribution, modal
  // -------------------------------------------------------------
  describe('F23: ProductReviewsSection Rating Breakdown & Submission Modal', () => {
    it('F23.1: renders review summary rating score and 5-tier distribution percentages', async () => {
      mockUseAuth.mockReturnValue({ user: null })

      ;(global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          reviews: [],
          summary: {
            averageRating: 4.5,
            totalCount: 10,
            distribution: { 5: 6, 4: 3, 3: 1, 2: 0, 1: 0 },
          },
          canReview: false,
        }),
      })

      render(
        <ProductReviewsSection
          productId={99}
          productTitle="Bản vẽ biệt thự vườn"
        />,
      )

      await waitFor(() => {
        expect(screen.getByText('4.5')).toBeDefined()
        expect(screen.getByText('Dựa trên 10 lượt đánh giá')).toBeDefined()
        expect(screen.getByText('6 (60%)')).toBeDefined()
        expect(screen.getByText('3 (30%)')).toBeDefined()
        expect(screen.getByText('1 (10%)')).toBeDefined()
        expect(screen.getAllByText('0 (0%)').length).toBe(2)
      })
    })

    it('F23.2: opens modal for eligible buyer and enforces >= 5 characters review validation', async () => {
      mockUseAuth.mockReturnValue({
        user: { id: 505, name: 'Khách hàng A' },
      })

      ;(global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          reviews: [],
          summary: { averageRating: 0, totalCount: 0, distribution: {} },
          canReview: true,
        }),
      })

      render(
        <ProductReviewsSection
          productId={99}
          productTitle="Bản vẽ biệt thự vườn"
        />,
      )

      const reviewBtn = await screen.findByRole('button', { name: /Viết đánh giá/i })
      fireEvent.click(reviewBtn)

      // Review modal is visible
      expect(screen.getByText('Viết đánh giá sản phẩm')).toBeDefined()

      // Submit with short content (< 5 characters)
      const contentTextarea = screen.getByLabelText(/Nội dung chi tiết/i)
      fireEvent.change(contentTextarea, { target: { value: 'Tốt' } })

      const submitBtn = screen.getByRole('button', { name: 'Gửi đánh giá' })
      fireEvent.click(submitBtn)

      // Form validation error appears
      expect(screen.getByText('Nội dung đánh giá phải có ít nhất 5 ký tự.')).toBeDefined()
    })

    it('F23.3: displays pending review badge and allows editing existing review via PUT', async () => {
      mockUseAuth.mockReturnValue({
        user: { id: 505, name: 'Khách hàng A' },
      })

      ;(global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          reviews: [],
          summary: { averageRating: 5, totalCount: 1, distribution: { 5: 1 } },
          canReview: false,
          userReview: {
            id: 88,
            rating: 5,
            title: 'Hồ sơ tuyệt vời',
            content: 'Bản vẽ chi tiết từng kết cấu cột dầm.',
            status: 'pending',
            createdAt: '2026-09-19T10:00:00Z',
            verifiedPurchase: true,
            user: { id: 505, name: 'Khách hàng A', initials: 'KA' },
          },
        }),
      })

      render(
        <ProductReviewsSection
          productId={99}
          productTitle="Bản vẽ biệt thự vườn"
        />,
      )

      await waitFor(() => {
        expect(screen.getByText('Đánh giá của bạn')).toBeDefined()
        expect(screen.getByText('Chờ kiểm duyệt')).toBeDefined()
        expect(screen.getByText('Hồ sơ tuyệt vời')).toBeDefined()
      })

      const editBtn = screen.getByRole('button', { name: /Chỉnh sửa đánh giá của bạn/i })
      fireEvent.click(editBtn)

      // Pre-filled modal appears in edit mode
      expect(screen.getAllByText('Chỉnh sửa đánh giá của bạn').length).toBeGreaterThanOrEqual(1)
      const contentInput = screen.getByLabelText(/Nội dung chi tiết/i) as HTMLTextAreaElement
      expect(contentInput.value).toBe('Bản vẽ chi tiết từng kết cấu cột dầm.')

      // Update content and submit PUT
      fireEvent.change(contentInput, {
        target: { value: 'Bản vẽ chi tiết từng kết cấu cột dầm, bổ sung thêm dự toán.' },
      })

      ;(global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true }),
      })
      ;(global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, reviews: [], summary: { averageRating: 5, totalCount: 1 } }),
      })

      const submitBtn = screen.getByRole('button', { name: 'Lưu cập nhật' })
      fireEvent.click(submitBtn)

      await waitFor(() => {
        expect(mockToast.success).toHaveBeenCalledWith('Cập nhật đánh giá thành công!')
      })
    })
  })

  // -------------------------------------------------------------
  // Feature F24: ProductCommentsSection Q&A, nested replies, role badges & Ctrl+Enter
  // -------------------------------------------------------------
  describe('F24: ProductCommentsSection Q&A, Replies, Role Badges & Ctrl+Enter Trigger', () => {
    it('F24.1: triggers question submission via Ctrl+Enter shortcut', async () => {
      mockUseAuth.mockReturnValue({
        user: { id: 701, name: 'KTS Trần Long', roles: ['buyer'] },
      })

      // Initial comments fetch
      ;(global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          comments: [],
          totalComments: 0,
          pagination: { page: 1, limit: 10, totalPages: 1 },
        }),
      })

      render(
        <ProductCommentsSection
          productId={150}
          productTitle="Hồ sơ MEP khách sạn"
        />,
      )

      const input = await screen.findByLabelText('Đặt câu hỏi về tài nguyên này')
      fireEvent.change(input, {
        target: { value: 'File Revit MEP có chia worksets sẵn không ạ?' },
      })

      // Mock POST submission
      ;(global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          comment: {
            id: 1,
            productId: 150,
            content: 'File Revit MEP có chia worksets sẵn không ạ?',
            status: 'published',
            createdAt: new Date().toISOString(),
            user: { id: 701, name: 'KTS Trần Long', initials: 'TL' },
            replies: [],
          },
        }),
      })

      // Mock re-fetch
      ;(global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          comments: [
            {
              id: 1,
              productId: 150,
              content: 'File Revit MEP có chia worksets sẵn không ạ?',
              status: 'published',
              createdAt: new Date().toISOString(),
              user: { id: 701, name: 'KTS Trần Long', initials: 'TL' },
              replies: [],
            },
          ],
          totalComments: 1,
          pagination: { page: 1, limit: 10, totalPages: 1 },
        }),
      })

      // Trigger Ctrl+Enter
      fireEvent.keyDown(input, { key: 'Enter', code: 'Enter', ctrlKey: true })

      await waitFor(() => {
        expect(mockToast.success).toHaveBeenCalledWith('Đã gửi câu hỏi thành công!')
      })
    })

    it('F24.2: renders 1-level nested replies with Seller and Admin role badges', async () => {
      mockUseAuth.mockReturnValue({ user: null })

      ;(global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          comments: [
            {
              id: 10,
              productId: 150,
              content: 'Có hỗ trợ bóc tách khối lượng vật tư không?',
              status: 'published',
              isSellerReply: false,
              isAdminReply: false,
              createdAt: new Date(Date.now() - 3600000).toISOString(),
              user: { id: 801, name: 'Nhà thầu xây dựng', initials: 'NT' },
              replies: [
                {
                  id: 11,
                  productId: 150,
                  parentId: 10,
                  content: 'Đã có sẵn bảng Schedule thống kê thiết bị và đường ống nhé bạn.',
                  status: 'published',
                  isSellerReply: true,
                  isAdminReply: false,
                  createdAt: new Date(Date.now() - 1800000).toISOString(),
                  user: { id: 999, name: 'MEP Engineering Studio', initials: 'ME' },
                },
                {
                  id: 12,
                  productId: 150,
                  parentId: 10,
                  content: 'Bản vẽ này thuộc danh mục kiểm định VIP của KienTaoHub.',
                  status: 'published',
                  isSellerReply: false,
                  isAdminReply: true,
                  createdAt: new Date(Date.now() - 900000).toISOString(),
                  user: { id: 1, name: 'Ban Quản Trị', initials: 'QT' },
                },
              ],
            },
          ],
          totalComments: 3,
          pagination: { page: 1, limit: 10, totalPages: 1 },
        }),
      })

      render(
        <ProductCommentsSection
          productId={150}
          productTitle="Hồ sơ MEP khách sạn"
        />,
      )

      await waitFor(() => {
        expect(screen.getByText('Có hỗ trợ bóc tách khối lượng vật tư không?')).toBeDefined()
        expect(screen.getByText('Đã có sẵn bảng Schedule thống kê thiết bị và đường ống nhé bạn.')).toBeDefined()
        expect(screen.getByText('Bản vẽ này thuộc danh mục kiểm định VIP của KienTaoHub.')).toBeDefined()

        // Verify role badges
        expect(screen.getByText('Tác giả / Người bán')).toBeDefined()
        expect(screen.getByText('Quản trị viên')).toBeDefined()
      })
    })

    it('F24.3: validates minimum length and rejects whitespace-only questions', async () => {
      mockUseAuth.mockReturnValue({
        user: { id: 701, name: 'KTS Trần Long', roles: ['buyer'] },
      })

      ;(global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          comments: [],
          totalComments: 0,
          pagination: { page: 1, limit: 10, totalPages: 1 },
        }),
      })

      render(
        <ProductCommentsSection
          productId={150}
          productTitle="Hồ sơ MEP khách sạn"
        />,
      )

      const input = await screen.findByLabelText('Đặt câu hỏi về tài nguyên này')
      fireEvent.change(input, { target: { value: '   ' } })

      // Submit button should be disabled for < 3 characters
      const submitBtn = screen.getByText('Gửi câu hỏi')
      expect((submitBtn as HTMLButtonElement).disabled).toBe(true)
    })
  })

  // -------------------------------------------------------------
  // Feature F24 Extension: ProductReportDialog accessibility & options
  // -------------------------------------------------------------
  describe('ProductReportDialog Native Select Accessibility & Values', () => {
    it('renders native select with exactly the 7 expected moderation reason values', async () => {
      mockUseAuth.mockReturnValue({
        user: { id: 888, email: 'reporter@kientao.vn' },
      })

      render(
        <ProductReportDialog
          productId={200}
          productTitle="Bản vẽ kết cấu biệt thự"
        />,
      )

      const triggerBtn = screen.getByRole('button', { name: /Báo cáo sản phẩm/i })
      fireEvent.click(triggerBtn)

      const select = (await screen.findByLabelText(/Lý do báo cáo/i)) as HTMLSelectElement
      expect(select.tagName).toBe('SELECT')

      const optionValues = Array.from(select.options).map((opt) => opt.value)
      expect(optionValues).toEqual([
        'FILE_CORRUPTED',
        'CONTENT_MISMATCH',
        'COPYRIGHT_VIOLATION',
        'SPAM',
        'PROHIBITED_CONTENT',
        'MISLEADING_PREVIEW',
        'OTHER',
      ])
    })

    it('surfaces API 409 duplicate report response inside the dialog gracefully', async () => {
      mockUseAuth.mockReturnValue({
        user: { id: 888, email: 'reporter@kientao.vn' },
      })

      render(
        <ProductReportDialog
          productId={200}
          productTitle="Bản vẽ kết cấu biệt thự"
        />,
      )

      fireEvent.click(screen.getByRole('button', { name: /Báo cáo sản phẩm/i }))

      ;(global.fetch as any).mockResolvedValueOnce({
        ok: false,
        status: 409,
        json: async () => ({
          success: false,
          error: 'DUPLICATE_REPORT',
          message: 'Bạn đã gửi một báo cáo đang chờ xử lý cho sản phẩm này.',
        }),
      })

      fireEvent.click(screen.getByRole('button', { name: 'Gửi báo cáo' }))

      await waitFor(() => {
        expect(
          screen.getByText('Bạn đã gửi một báo cáo đang chờ xử lý cho sản phẩm này.'),
        ).toBeDefined()
      })
    })
  })
})
