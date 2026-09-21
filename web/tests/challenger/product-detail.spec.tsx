import React from 'react'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { TechnicalSpecsTable } from '@/components/product/TechnicalSpecsTable'
import { Gallery } from '@/components/product/Gallery'
import { SellerAttribution } from '@/components/product/SellerAttribution'
import { DigitalProductCTA } from '@/components/product/DigitalProductCTA'
import { ProductDescription } from '@/components/product/ProductDescription'
import type { Category, Media, Product, ProductPreview, SoftwareType, Tag } from '@/payload-types'

// Mock RichText to avoid SCSS import from @payloadcms/ui in vitest
vi.mock('@/components/RichText', () => ({
  RichText: ({ data }: any) => <div data-testid="richtext">{JSON.stringify(data)}</div>,
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

// Mock embla-carousel-react for jsdom compatibility
vi.mock('embla-carousel-react', () => ({
  default: () => [
    () => {},
    {
      scrollTo: vi.fn(),
      scrollPrev: vi.fn(),
      scrollNext: vi.fn(),
      canScrollPrev: vi.fn(() => false),
      canScrollNext: vi.fn(() => false),
      on: vi.fn(),
      off: vi.fn(),
    },
  ],
}))

describe('Challenger M3: Product Detail Data Rendering & Integrity', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  afterEach(() => {
    cleanup()
  })

  describe('1. TechnicalSpecsTable', () => {
    const mockCategory: Category = {
      id: 101,
      title: 'Thiết Kế Kiến Trúc',
      slug: 'kien-truc',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    }

    const mockSoftware: SoftwareType = {
      id: 201,
      title: 'AutoCAD',
      slug: 'autocad',
      fileExtensions: ['.dwg', '.dxf'],
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    }

    const mockTag: Tag = {
      id: 301,
      title: 'Biệt Thự',
      slug: 'biet-thu',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    }

    const fullProduct: Product = {
      id: 1,
      title: 'Bản vẽ biệt thự cổ điển 3 tầng',
      slug: 'ban-ve-biet-thu-co-dien-3-tang',
      price: 250000,
      isFree: false,
      _status: 'published',
      categories: [mockCategory],
      software_types: [mockSoftware],
      tags: [mockTag],
      technicalSpecs: {
        fileFormat: '.dwg',
        softwareVersion: 'AutoCAD 2024',
        fileSize: '48.2 MB',
        unit: 'metric',
      },
      updatedAt: '2026-09-15T10:00:00.000Z',
      createdAt: '2026-09-01T00:00:00.000Z',
    }

    it('renders technical specifications (fileFormat, softwareVersion, fileSize, unit) correctly', () => {
      render(<TechnicalSpecsTable product={fullProduct} />)

      // Heading
      expect(screen.getByText(/Thông số kỹ thuật tài nguyên/i)).toBeDefined()

      // Format
      expect(screen.getByText('.dwg')).toBeDefined()

      // Version
      expect(screen.getByText('AutoCAD 2024')).toBeDefined()

      // File Size
      expect(screen.getByText('48.2 MB')).toBeDefined()

      // Unit mapped to Vietnamese label
      expect(screen.getByText('Hệ Mét (mm / m)')).toBeDefined()
    })

    it('maps imperial, other, and custom units correctly', () => {
      const imperialProduct: Product = {
        ...fullProduct,
        technicalSpecs: {
          ...fullProduct.technicalSpecs,
          unit: 'imperial',
        },
      }
      const { rerender } = render(<TechnicalSpecsTable product={imperialProduct} />)
      expect(screen.getByText('Hệ Inch / Feet (Imperial)')).toBeDefined()

      const otherProduct: Product = {
        ...fullProduct,
        technicalSpecs: {
          ...fullProduct.technicalSpecs,
          unit: 'other',
        },
      }
      rerender(<TechnicalSpecsTable product={otherProduct} />)
      expect(screen.getByText('Hệ đơn vị khác')).toBeDefined()

      const customUnitProduct: Product = {
        ...fullProduct,
        technicalSpecs: {
          ...fullProduct.technicalSpecs,
          unit: 'custom-cubits' as any,
        },
      }
      rerender(<TechnicalSpecsTable product={customUnitProduct} />)
      expect(screen.getByText('custom-cubits')).toBeDefined()
    })

    it('links to filtered catalog pages for software types and categories', () => {
      render(<TechnicalSpecsTable product={fullProduct} />)

      // Software type link
      const swLink = screen.getByRole('link', { name: 'AutoCAD' })
      expect(swLink).toBeDefined()
      expect(swLink.getAttribute('href')).toBe('/shop?softwareType=autocad')

      // Category link
      const catLink = screen.getByRole('link', { name: 'Thiết Kế Kiến Trúc' })
      expect(catLink).toBeDefined()
      expect(catLink.getAttribute('href')).toBe('/shop?category=kien-truc')

      // Tag badge
      expect(screen.getByText('#Biệt Thự')).toBeDefined()
    })

    it('omits every spec row when the record carries no specification', () => {
      const emptyProduct: Product = {
        id: 2,
        title: 'Tài nguyên chưa có specs',
        slug: 'empty-specs',
        price: 0,
        isFree: true,
        _status: 'published',
        createdAt: '2026-09-01T00:00:00.000Z',
        updatedAt: '2026-09-01T00:00:00.000Z',
      }

      render(<TechnicalSpecsTable product={emptyProduct} />)

      // No row stands in for a value the record does not carry — no format, version, size, unit,
      // software-type or category row, and none of the invented fallbacks this component used to print.
      for (const invented of [
        'Tệp kỹ thuật chuẩn',
        'Tương thích mọi phiên bản',
        'Đang cập nhật',
        'Hệ Mét (mm / m)',
        'Đa nền tảng CAD/BIM',
        'Hồ sơ kỹ thuật tổng hợp',
        'Đã kiểm duyệt cấu trúc layer, xref và kích thước chuẩn',
      ]) {
        expect(screen.queryByText(invented)).toBeNull()
      }
      // The only row left is the one the record really carries (its update date)
      expect(screen.getByText('Ngày cập nhật hồ sơ (Last Updated)')).toBeDefined()
      for (const label of [
        'Định dạng tệp tin (Format)',
        'Phiên bản phần mềm (Software Version)',
        'Dung lượng tệp (File Size)',
        'Hệ đơn vị thiết kế (Unit)',
      ]) {
        expect(screen.queryByText(label)).toBeNull()
      }
    })

    it('renders the honest empty state when the record carries nothing at all', () => {
      const bareProduct = {
        id: 4,
        title: 'Bản ghi trống hoàn toàn',
        slug: 'bare',
        price: 0,
        isFree: true,
        _status: 'published',
      } as unknown as Product

      render(<TechnicalSpecsTable product={bareProduct} />)
      expect(
        screen.getByText('Người bán chưa khai báo thông số kỹ thuật cho tài nguyên này.'),
      ).toBeDefined()
    })

    it('gracefully handles unpopulated relation IDs (raw numbers/strings) and null elements without crashing', () => {
      const rawRelProduct: Product = {
        id: 3,
        title: 'Unpopulated Relations Product',
        slug: 'unpopulated',
        price: 100000,
        _status: 'published',
        categories: [999 as any, null as any, undefined as any],
        software_types: ['raw-software-id' as any, null as any],
        tags: [888 as any, null as any],
        createdAt: '2026-09-01T00:00:00.000Z',
        updatedAt: '2026-09-01T00:00:00.000Z',
      }

      const { container } = render(<TechnicalSpecsTable product={rawRelProduct} />)
      expect(container).toBeDefined()
      // Unpopulated relations are not software types or categories, so those rows are omitted too
      expect(screen.queryByText('Đa nền tảng CAD/BIM')).toBeNull()
      expect(screen.queryByText('Hồ sơ kỹ thuật tổng hợp')).toBeNull()
    })

    it('renders the record own spec values and no invented audit badge', () => {
      render(<TechnicalSpecsTable product={fullProduct} />)
      // The values come from the product's own technicalSpecs (fullProduct: .dwg / AutoCAD 2024 / 48.2 MB)
      expect(screen.getByText('.dwg')).toBeDefined()
      expect(screen.getByText('AutoCAD 2024')).toBeDefined()
      expect(screen.getByText('48.2 MB')).toBeDefined()
      // …and nothing asserts a technical review no record carries
      expect(
        screen.queryByText('Đã kiểm duyệt cấu trúc layer, xref và kích thước chuẩn'),
      ).toBeNull()
    })
  })

  describe('2. Gallery', () => {
    const mockMedia1: Media = {
      id: 501,
      alt: 'Bản vẽ mặt bằng',
      url: '/media/mat-bang.png',
      width: 1920,
      height: 1080,
      mimeType: 'image/png',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    }

    const mockMedia2: Media = {
      id: 502,
      alt: 'Bản vẽ mặt đứng',
      url: '/media/mat-dung.png',
      width: 1920,
      height: 1080,
      mimeType: 'image/png',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    }

    const mockMedia3: Media = {
      id: 503,
      alt: 'Mô hình 3D Revit',
      url: '/media/model-3d.png',
      width: 1920,
      height: 1080,
      mimeType: 'image/png',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    }

    const mockWatermarkedPreview: ProductPreview = {
      id: 601,
      title: 'Watermarked Floorplan Preview',
      previewImage: mockMedia1,
      previewType: 'image',
      isWatermarked: true,
      caption: 'Bản xem trước có đóng dấu bản quyền KienTaoHub',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    }

    const mockPdfPreview: ProductPreview = {
      id: 602,
      title: 'Sample PDF Specification',
      previewImage: mockMedia2,
      previewType: 'pdf',
      isWatermarked: true,
      caption: 'Tập mẫu PDF 5 trang',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    }

    const mock3dPreview: ProductPreview = {
      id: 603,
      title: '3D BIM Viewer Asset',
      previewImage: mockMedia3,
      previewType: 'model_viewer',
      isWatermarked: false,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    }

    it('renders watermarked preview with badge and security overlay pattern', () => {
      render(<Gallery previewGallery={[mockWatermarkedPreview]} />)

      // Watermark badge
      expect(screen.getByText('Bản xem trước có Watermark')).toBeDefined()

      // Diagonal watermark text overlay
      expect(screen.getByText(/KienTaoHub Preview • Bản quyền số/i)).toBeDefined()

      // Caption
      expect(screen.getByText('Bản xem trước có đóng dấu bản quyền KienTaoHub')).toBeDefined()
    })

    it('renders PDF preview badge and thumbnail badge', () => {
      render(<Gallery previewGallery={[mockWatermarkedPreview, mockPdfPreview]} />)

      // Thumbnail badge for PDF exists
      expect(screen.getByText('PDF')).toBeDefined()

      // Click PDF thumbnail
      const thumbs = screen.getAllByRole('button', { name: /Xem ảnh/i })
      fireEvent.click(thumbs[1])

      // Main viewport badge
      expect(screen.getByText('Trang PDF mẫu')).toBeDefined()
    })

    it('renders 3D model viewer preview badge', () => {
      render(<Gallery previewGallery={[mock3dPreview]} />)

      expect(screen.getByText('Mô hình 3D')).toBeDefined()
      // Since isWatermarked is false, watermark badge must NOT be present
      expect(screen.queryByText('Bản xem trước có Watermark')).toBeNull()
    })

    it('handles direct media gallery items alongside previewGallery', () => {
      const directGallery = [
        {
          id: 'dg-1',
          image: mockMedia2,
          caption: 'Ảnh phối cảnh 3D',
        },
      ]

      render(<Gallery previewGallery={[mockWatermarkedPreview]} gallery={directGallery} />)

      // Both thumbnails should be rendered
      const thumbs = screen.getAllByRole('button', { name: /Xem ảnh/i })
      expect(thumbs.length).toBe(2)

      // Switching thumbnail to direct gallery item
      fireEvent.click(thumbs[1])

      // Direct gallery item has no watermark
      expect(screen.queryByText('Bản xem trước có Watermark')).toBeNull()
      expect(screen.getByText('Ảnh phối cảnh 3D')).toBeDefined()

      // Switch back to watermarked thumbnail
      fireEvent.click(thumbs[0])
      expect(screen.getByText('Bản xem trước có Watermark')).toBeDefined()
    })

    it('falls back to fallbackImage when galleries are empty', () => {
      render(<Gallery fallbackImage={mockMedia1} />)

      // Should render image without watermark
      expect(screen.queryByText('Bản xem trước có Watermark')).toBeNull()
      expect(screen.queryByText(/Bản xem trước đang được cập nhật/i)).toBeNull()
    })

    it('renders empty placeholder when all preview sources are absent', () => {
      render(<Gallery previewGallery={[]} gallery={[]} fallbackImage={null} />)

      expect(screen.getByText('Bản xem trước đang được cập nhật')).toBeDefined()
      expect(screen.getByText('Tài liệu kỹ thuật sẵn sàng tải xuống sau khi phát hành')).toBeDefined()
    })

    it('filters out broken preview items with null or unpopulated media gracefully', () => {
      const brokenPreviewGallery = [
        {
          id: 'broken-1',
          previewImage: null as any,
          previewType: 'image' as const,
        },
        {
          id: 'broken-2',
          previewImage: 9999 as any,
          previewType: 'image' as const,
        },
        mockWatermarkedPreview,
      ]

      render(<Gallery previewGallery={brokenPreviewGallery as any} />)
      // Only the valid preview item should be rendered
      expect(screen.getByText('Bản xem trước có Watermark')).toBeDefined()
      // Only 1 item, so thumbnails carousel shouldn't even need multiple thumbs
      expect(screen.queryAllByRole('button', { name: /Xem ảnh/i }).length).toBe(0)
    })
  })

  describe('3. SellerAttribution', () => {
    it('renders the seller record it is given, never an invented creator name', () => {
      const { unmount } = render(<SellerAttribution sellerName="Thiết Kế Nội Thất An Cường" />)

      expect(screen.getByText('Thiết Kế Nội Thất An Cường')).toBeDefined()
      // No verification field exists on seller_profiles, so no seller carries the badge
      expect(screen.queryByText('Đã xác minh')).toBeNull()
      expect(screen.queryByText('Chuyên gia')).toBeNull()
      // the fabricated default must not appear anywhere, with or without a seller
      expect(screen.queryByText('KienTaoHub Studio & Creators')).toBeNull()
      unmount()

      render(<SellerAttribution />)
      // without a seller record the block renders nothing at all — no invented creator
      expect(screen.queryByText('KienTaoHub Studio & Creators')).toBeNull()
      expect(screen.queryByRole('link', { name: /Tất cả tài nguyên/i })).toBeNull()
    })

    it('renders custom author attribution with derived initials', () => {
      render(
        <SellerAttribution
          sellerName="KTS. Nguyễn Văn Nam"
          sellerTitle="Kiến trúc sư trưởng"
          sellerBio="10 năm kinh nghiệm thiết kế quy hoạch đô thị và nhà phố hiện đại."
          isVerified={true}
        />,
      )

      expect(screen.getByText('KTS. Nguyễn Văn Nam')).toBeDefined()
      expect(screen.getByText('Kiến trúc sư trưởng')).toBeDefined()
      expect(screen.getByText('10 năm kinh nghiệm thiết kế quy hoạch đô thị và nhà phố hiện đại.')).toBeDefined()
      // Initials from "Văn Nam" -> "VN"
      expect(screen.getByText('VN')).toBeDefined()
    })

    it('handles single-word author names and multi-whitespace cleanly', () => {
      const { rerender } = render(<SellerAttribution sellerName="ArchMaster" />)
      expect(screen.getByText('A')).toBeDefined()

      rerender(<SellerAttribution sellerName="   Tran    Bao   Son   " />)
      expect(screen.getByText('BS')).toBeDefined()
    })

    it('hides verification badge when isVerified is false', () => {
      render(
        <SellerAttribution
          sellerName="Guest Designer"
          isVerified={false}
        />,
      )

      expect(screen.getByText('Guest Designer')).toBeDefined()
      expect(screen.queryByText('Đã xác minh')).toBeNull()
    })
  })

  describe('4. DigitalProductCTA', () => {
    it('renders free product state with green badge and strikethrough 0 ₫', () => {
      render(
        <DigitalProductCTA
          isFree={true}
          price={0}
          fileFormat=".dwg"
          fileSize="15 MB"
          productTitle="File Bản Vẽ Miễn Phí"
        />,
      )

      // Free badges
      const freeBadges = screen.getAllByText('Miễn phí')
      expect(freeBadges.length).toBeGreaterThanOrEqual(1)

      // Strikethrough 0 ₫
      expect(screen.getByText('0 ₫')).toBeDefined()

      // Free CTA Button
      expect(screen.getByRole('button', { name: /Tải xuống ngay \(Miễn phí\)/i })).toBeDefined()

      // Format trust indicators
      expect(screen.getByText(/Bao gồm file gốc \(\.dwg\) • 15 MB/i)).toBeDefined()
      expect(screen.getByText(/Tải xuống tức thì/i)).toBeDefined()
      expect(screen.getByText(/Bảo mật tuyệt đối, hoàn tiền 100%/i)).toBeDefined()
    })

    it('treats price: 0 with isFree: false as free product', () => {
      render(
        <DigitalProductCTA
          isFree={false}
          price={0}
          productTitle="Zero Price Item"
        />,
      )

      expect(screen.getByRole('button', { name: /Tải xuống ngay \(Miễn phí\)/i })).toBeDefined()
      expect(screen.getByText('0 ₫')).toBeDefined()
    })

    it('renders commercial product with VND formatting (₫) and purchase action', () => {
      render(
        <DigitalProductCTA
          isFree={false}
          price={450000}
          fileFormat=".rvt"
          fileSize="89 MB"
          productTitle="Mô Hình Revit Biệt Thự"
        />,
      )

      // Commercial badge
      expect(screen.getByText('Bản quyền thương mại')).toBeDefined()

      // Formatted VND price
      expect(screen.getByText('450.000')).toBeDefined()
      expect(screen.getByText('₫')).toBeDefined()

      // Purchase button
      const buyBtn = screen.getByRole('button', { name: /Mua ngay — 450\.000 ₫/i })
      expect(buyBtn).toBeDefined()

      // File format and size
      expect(screen.getByText(/Bao gồm file gốc \(\.rvt\) • 89 MB/i)).toBeDefined()
    })

    it('triggers alert on button interaction for both free and paid modes', () => {
      const alertMock = vi.spyOn(window, 'alert').mockImplementation(() => {})

      // Test Free click
      const { rerender } = render(
        <DigitalProductCTA
          isFree={true}
          price={0}
          productTitle="Bản Vẽ Free"
        />,
      )

      fireEvent.click(screen.getByRole('button', { name: /Tải xuống ngay/i }))
      expect(alertMock).toHaveBeenCalledWith('Đang chuẩn bị tệp tải xuống: Bản Vẽ Free')

      // Test Paid click
      alertMock.mockClear()
      rerender(
        <DigitalProductCTA
          isFree={false}
          price={200000}
          productTitle="Bản Vẽ Có Phí"
        />,
      )

      fireEvent.click(screen.getByRole('button', { name: /Mua ngay/i }))
      expect(alertMock).toHaveBeenCalledWith('Khởi tạo thanh toán số cho: Bản Vẽ Có Phí (200.000 ₫)')
    })
  })

  describe('5. ProductDescription Integration', () => {
    it('renders taxonomy pills linking to catalog filters alongside title and CTA', () => {
      const mockCategory: Category = {
        id: 101,
        title: 'Thiết Kế Kiến Trúc',
        slug: 'kien-truc',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      }

      const mockSoftware: SoftwareType = {
        id: 201,
        title: 'AutoCAD',
        slug: 'autocad',
        fileExtensions: ['.dwg'],
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      }

      const sampleProduct: Product = {
        id: 99,
        title: 'Hồ sơ bản vẽ thi công biệt thự',
        slug: 'ho-so-ban-ve',
        price: 500000,
        isFree: false,
        _status: 'published',
        categories: [mockCategory],
        software_types: [mockSoftware],
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      }

      render(<ProductDescription product={sampleProduct} />)

      // Category filter pill link
      const catLink = screen.getByRole('link', { name: 'Thiết Kế Kiến Trúc' })
      expect(catLink.getAttribute('href')).toBe('/shop?category=kien-truc')

      // Software filter pill link
      const swLink = screen.getByRole('link', { name: 'AutoCAD' })
      expect(swLink.getAttribute('href')).toBe('/shop?softwareType=autocad')

      // Title
      expect(screen.getByRole('heading', { level: 1, name: 'Hồ sơ bản vẽ thi công biệt thự' })).toBeDefined()

      // No seller record in this fixture, so no attribution block is rendered (never an invented one)
      expect(screen.queryByText('KienTaoHub Studio & Creators')).toBeNull()

      // CTA included
      expect(screen.getByText('500.000')).toBeDefined()
    })
  })
})
