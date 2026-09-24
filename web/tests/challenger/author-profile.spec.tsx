import React from 'react'
import { render, screen, cleanup } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { SellerAttribution } from '@/components/product/SellerAttribution'
import { ProductDescription } from '@/components/product/ProductDescription'
import type { Product } from '@/payload-types'

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

// Mock next/navigation
vi.mock('next/navigation', () => ({
  usePathname: () => '/products/test-slug',
  notFound: vi.fn(),
}))

// Mock Cart and Auth providers
vi.mock('@/providers/Cart', () => ({
  useCart: () => ({ addItem: vi.fn() }),
}))

vi.mock('@/providers/Auth', () => ({
  useAuth: () => ({ user: null }),
}))

const mockPayloadFind = vi.fn()
vi.mock('payload', () => ({
  getPayload: vi.fn(async () => ({
    find: mockPayloadFind,
  })),
}))

vi.mock('@payload-config', () => ({
  default: {},
}))

vi.mock('@/components/product/productStats', () => ({
  getProductStats: vi.fn(async () => ({
    '101': { downloads: 15, reviewCount: 2, ratingAverage: 4.5 },
  })),
}))

describe('Author Profile & Seller Attribution Link Integrity', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  afterEach(() => {
    cleanup()
  })

  describe('1. SellerAttribution Navigation Links', () => {
    it('links to /authors/[slug] when sellerSlug is provided', () => {
      render(
        <SellerAttribution
          sellerName="KTS. Nguyễn Văn Nam"
          sellerSlug="kts-nguyen-van-nam"
        />,
      )

      const authorLink = screen.getByRole('link', { name: /Xem thông tin tác giả/i })
      expect(authorLink).toBeDefined()
      expect(authorLink.getAttribute('href')).toBe('/authors/kts-nguyen-van-nam')

      // Avatar and display name should also link to author profile
      const avatarLink = screen.getByRole('link', { name: /Ảnh đại diện tác giả KTS\. Nguyễn Văn Nam/i })
      expect(avatarLink).toBeDefined()
      expect(avatarLink.getAttribute('href')).toBe('/authors/kts-nguyen-van-nam')

      const nameLink = screen.getByRole('link', { name: /^KTS\. Nguyễn Văn Nam$/ })
      expect(nameLink).toBeDefined()
      expect(nameLink.getAttribute('href')).toBe('/authors/kts-nguyen-van-nam')
    })

    it('links to custom authorHref when provided', () => {
      render(
        <SellerAttribution
          sellerName="Studio Diễn Họa 3D"
          authorHref="/authors/studio-dien-hoa-3d"
        />,
      )

      const authorLink = screen.getByRole('link', { name: /Xem thông tin tác giả/i })
      expect(authorLink.getAttribute('href')).toBe('/authors/studio-dien-hoa-3d')
    })

    it('falls back to /shop when neither sellerSlug nor authorHref is provided', () => {
      render(<SellerAttribution sellerName="Tác giả ẩn danh" />)

      const authorLink = screen.getByRole('link', { name: /Xem thông tin tác giả/i })
      expect(authorLink.getAttribute('href')).toBe('/shop')
    })

    it('renders nothing when sellerName is null or undefined', () => {
      const { container } = render(<SellerAttribution />)
      expect(container.firstChild).toBeNull()
    })
  })

  describe('2. ProductDescription Integration', () => {
    const mockProduct: Product = {
      id: 99,
      title: 'Hồ sơ thiết kế nhà phố 4 tầng',
      slug: 'ho-so-thiet-ke-nha-pho-4-tang',
      price: 150000,
      isFree: false,
      _status: 'published',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      seller: {
        id: 15,
        email: 'seller15@kientaohub.vn',
        name: 'Công Ty CP Kiến Trúc Mới',
        collection: 'users',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
    }

    it('wires sellerProfile.slug down to SellerAttribution link', () => {
      render(
        <ProductDescription
          product={mockProduct}
          sellerProfile={{
            id: 8,
            slug: 'cong-ty-cp-kien-truc-moi',
            displayName: 'Công Ty CP Kiến Trúc Mới',
            bio: 'Chuyên thiết kế nhà phố, biệt thự sân vườn tại Hà Nội.',
          }}
        />,
      )

      const authorLink = screen.getByRole('link', { name: /Xem thông tin tác giả/i })
      expect(authorLink).toBeDefined()
      expect(authorLink.getAttribute('href')).toBe('/authors/cong-ty-cp-kien-truc-moi')
    })

    it('falls back to sellerProfile.id when slug is absent', () => {
      render(
        <ProductDescription
          product={mockProduct}
          sellerProfile={{
            id: 8,
            displayName: 'Công Ty CP Kiến Trúc Mới',
            bio: 'Chuyên thiết kế nhà phố.',
          }}
        />,
      )

      const authorLink = screen.getByRole('link', { name: /Xem thông tin tác giả/i })
      expect(authorLink).toBeDefined()
      expect(authorLink.getAttribute('href')).toBe('/authors/8')
    })
  })

  describe('3. AuthorProfilePage Rendering', () => {
    it('renders author profile card with real stats and products', async () => {
      const AuthorProfilePage = (await import('@/app/(app)/authors/[slug]/page')).default

      mockPayloadFind.mockImplementation(async ({ collection }: { collection: string }) => {
        if (collection === 'seller_profiles') {
          return {
            docs: [
              {
                id: 12,
                displayName: 'Nội Thất Gỗ Việt ArtDécor',
                slug: 'noi-that-go-viet-artdecor',
                bio: 'Hồ sơ bản vẽ sản xuất đồ gỗ nội thất chất lượng cao.',
                createdAt: '2026-03-01T00:00:00.000Z',
                user: { id: 36, name: 'Nội Thất Gỗ Việt ArtDécor', collection: 'users' },
              },
            ],
          }
        }
        if (collection === 'products') {
          return {
            totalDocs: 1,
            docs: [
              {
                id: 101,
                title: 'Chi tiết bàn làm việc gỗ tự nhiên',
                slug: 'chi-tiet-ban-lam-viec-go-tu-nhien',
                price: 120000,
                isFree: false,
                _status: 'published',
                createdAt: '2026-03-05T00:00:00.000Z',
                updatedAt: '2026-03-05T00:00:00.000Z',
              },
            ],
          }
        }
        return { docs: [], totalDocs: 0 }
      })

      const pageElement = await AuthorProfilePage({
        params: Promise.resolve({ slug: 'noi-that-go-viet-artdecor' }),
      })

      render(pageElement)

      expect(screen.getByRole('heading', { level: 1, name: 'Nội Thất Gỗ Việt ArtDécor' })).toBeDefined()
      expect(screen.getByText('Hồ sơ bản vẽ sản xuất đồ gỗ nội thất chất lượng cao.')).toBeDefined()
      expect(screen.getByText(/tài nguyên đã đăng/i)).toBeDefined()
      expect(screen.getAllByText(/lượt tải/i).length).toBeGreaterThanOrEqual(1)
      expect(screen.getByText('Chi tiết bàn làm việc gỗ tự nhiên')).toBeDefined()
    })

    it('generates dynamic SEO metadata for the author', async () => {
      const { generateMetadata } = await import('@/app/(app)/authors/[slug]/page')

      mockPayloadFind.mockImplementation(async ({ collection }: { collection: string }) => {
        if (collection === 'seller_profiles') {
          return {
            docs: [
              {
                id: 12,
                displayName: 'Nội Thất Gỗ Việt ArtDécor',
                slug: 'noi-that-go-viet-artdecor',
                bio: 'Hồ sơ bản vẽ sản xuất đồ gỗ.',
                user: 36,
              },
            ],
          }
        }
        return { docs: [] }
      })

      const meta = await generateMetadata({
        params: Promise.resolve({ slug: 'noi-that-go-viet-artdecor' }),
      })

      expect(meta.title).toBe('Nội Thất Gỗ Việt ArtDécor - Thông tin tác giả | KienTaoHub')
      expect(meta.description).toBe('Hồ sơ bản vẽ sản xuất đồ gỗ.')
    })
  })
})
