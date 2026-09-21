import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react'
import { EditorialHero, EDITORIAL_SLIDES } from '@/components/Hero/EditorialHero'
import type { Product, Media } from '@/payload-types'

// Mock next/navigation
const mockPush = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
  }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
}))

// Mock next/image
vi.mock('next/image', () => ({
  default: ({ src, alt, className, ...props }: React.ComponentProps<'img'>) => {
    const resolvedSrc =
      typeof src === 'object' && src !== null
        ? (src as { src?: string; url?: string }).src || (src as { src?: string; url?: string }).url
        : src
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={resolvedSrc} alt={alt || ''} className={className} {...props} />
    )
  },
}))

// Mock next/link
vi.mock('next/link', () => ({
  default: ({
    href,
    children,
    className,
    ...props
  }: {
    href: string
    children: React.ReactNode
    className?: string
  }) => (
    <a href={href} className={className} {...props}>
      {children}
    </a>
  ),
}))

// Mock Ant Design Carousel to control slide transitions and expose ref methods
let mockAfterChangeCallback: ((current: number) => void) | undefined

vi.mock('antd', async (importOriginal) => {
  const actual = await importOriginal<typeof import('antd')>()
  const MockCarousel = React.forwardRef<
    { next: () => void; prev: () => void; goTo: (slide: number) => void },
    {
      children: React.ReactNode
      afterChange?: (current: number) => void
      [key: string]: any
    }
  >(({ children, afterChange }, ref) => {
    const [current, setCurrent] = React.useState(0)
    const childArray = React.Children.toArray(children)
    const total = childArray.length

    mockAfterChangeCallback = afterChange

    React.useImperativeHandle(ref, () => ({
      next: () => {
        const nextSlide = (current + 1) % (total || 1)
        setCurrent(nextSlide)
        afterChange?.(nextSlide)
      },
      prev: () => {
        const prevSlide = (current - 1 + (total || 1)) % (total || 1)
        setCurrent(prevSlide)
        afterChange?.(prevSlide)
      },
      goTo: (slide: number) => {
        setCurrent(slide)
        afterChange?.(slide)
      },
    }))

    return (
      <div data-testid="mock-carousel" data-current-slide={current}>
        {childArray[current] || children}
      </div>
    )
  })
  MockCarousel.displayName = 'MockCarousel'

  return {
    ...actual,
    Carousel: MockCarousel,
  }
})

describe('Milestone M2 Round 2: Adversarial Verification of Editorial Hero Banner', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAfterChangeCallback = undefined
  })

  afterEach(() => {
    cleanup()
  })

  // =========================================================================
  // 1. SEARCH QUERY ROUTING ADVERSARIAL CHALLENGES
  // =========================================================================
  describe('1. Search Query Routing Verification', () => {
    it('routes empty query to /shop without search param', () => {
      render(<EditorialHero />)
      const input = screen.getByRole('textbox', { name: 'Tìm kiếm tài nguyên bản vẽ' })
      const form = screen.getByRole('search')

      fireEvent.change(input, { target: { value: '' } })
      fireEvent.submit(form)

      expect(mockPush).toHaveBeenCalledTimes(1)
      expect(mockPush).toHaveBeenCalledWith('/shop')
    })

    it('routes whitespace-only query to /shop without empty q param', () => {
      render(<EditorialHero />)
      const input = screen.getByRole('textbox', { name: 'Tìm kiếm tài nguyên bản vẽ' })
      const form = screen.getByRole('search')

      fireEvent.change(input, { target: { value: '   \t\n  ' } })
      fireEvent.submit(form)

      expect(mockPush).toHaveBeenCalledTimes(1)
      expect(mockPush).toHaveBeenCalledWith('/shop')
    })

    it('trims leading and trailing whitespace from valid keyword', () => {
      render(<EditorialHero />)
      const input = screen.getByRole('textbox', { name: 'Tìm kiếm tài nguyên bản vẽ' })
      const form = screen.getByRole('search')

      fireEvent.change(input, { target: { value: '   Biệt thự tân cổ điển   ' } })
      fireEvent.submit(form)

      expect(mockPush).toHaveBeenCalledTimes(1)
      expect(mockPush).toHaveBeenCalledWith(
        `/shop?q=${encodeURIComponent('Biệt thự tân cổ điển')}`,
      )
    })

    it('handles special characters and URL delimiters with proper URI encoding', () => {
      render(<EditorialHero />)
      const input = screen.getByRole('textbox', { name: 'Tìm kiếm tài nguyên bản vẽ' })
      const form = screen.getByRole('search')

      const specialQuery = 'Revit & CAD / 3D #1? + <script>alert(1)</script>'
      fireEvent.change(input, { target: { value: specialQuery } })
      fireEvent.submit(form)

      expect(mockPush).toHaveBeenCalledTimes(1)
      expect(mockPush).toHaveBeenCalledWith(`/shop?q=${encodeURIComponent(specialQuery)}`)
    })

    it('triggers search routing when clicking the search button directly', () => {
      render(<EditorialHero />)
      const input = screen.getByRole('textbox', { name: 'Tìm kiếm tài nguyên bản vẽ' })
      const searchButton = screen.getByRole('button', { name: 'Tìm kiếm' })

      fireEvent.change(input, { target: { value: 'Kết cấu thép' } })
      fireEvent.click(searchButton)

      expect(mockPush).toHaveBeenCalledTimes(1)
      expect(mockPush).toHaveBeenCalledWith(`/shop?q=${encodeURIComponent('Kết cấu thép')}`)
    })
  })

  // =========================================================================
  // 2. SLIDE NAVIGATION & WRAP-AROUND ADVERSARIAL CHALLENGES
  // =========================================================================
  describe('2. Slide Navigation, Cycle & Wrap-around Verification', () => {
    it('initializes at slide 1 of 3 with correct metadata and link', () => {
      render(<EditorialHero />)

      // Initial indicator
      expect(screen.getByText('1 / 3')).toBeDefined()

      // Initial slide short title and specs
      expect(screen.getByText(EDITORIAL_SLIDES[0].shortTitle)).toBeDefined()
      expect(
        screen.getByText(`${EDITORIAL_SLIDES[0].format} · ${EDITORIAL_SLIDES[0].size}`),
      ).toBeDefined()

      // Overlay link targets product slug
      const overlayLink = screen.getByRole('link', {
        name: new RegExp(EDITORIAL_SLIDES[0].shortTitle, 'i'),
      })
      expect(overlayLink.getAttribute('href')).toBe(`/products/${EDITORIAL_SLIDES[0].slug}`)
    })

    it('cycles sequentially: 1/3 -> 2/3 -> 3/3 and wraps around to 1/3 on Next button clicks', () => {
      render(<EditorialHero />)
      const nextBtn = screen.getByRole('button', { name: 'Next Slide' })

      // Step 1: Click Next -> Slide 2 (index 1)
      fireEvent.click(nextBtn)
      expect(screen.getByText('2 / 3')).toBeDefined()
      expect(screen.getByText(EDITORIAL_SLIDES[1].shortTitle)).toBeDefined()
      expect(
        screen.getByText(`${EDITORIAL_SLIDES[1].format} · ${EDITORIAL_SLIDES[1].size}`),
      ).toBeDefined()

      // Step 2: Click Next -> Slide 3 (index 2)
      fireEvent.click(nextBtn)
      expect(screen.getByText('3 / 3')).toBeDefined()
      expect(screen.getByText(EDITORIAL_SLIDES[2].shortTitle)).toBeDefined()
      expect(
        screen.getByText(`${EDITORIAL_SLIDES[2].format} · ${EDITORIAL_SLIDES[2].size}`),
      ).toBeDefined()

      // Step 3: Click Next from Slide 3 -> Wraps around to Slide 1 (index 0)
      fireEvent.click(nextBtn)
      expect(screen.getByText('1 / 3')).toBeDefined()
      expect(screen.getByText(EDITORIAL_SLIDES[0].shortTitle)).toBeDefined()
    })

    it('cycles backwards and wraps around: 1/3 -> 3/3 on Previous button click', () => {
      render(<EditorialHero />)
      const prevBtn = screen.getByRole('button', { name: 'Previous Slide' })

      // Click Prev from Slide 1 -> Wraps around to Slide 3 (index 2)
      fireEvent.click(prevBtn)
      expect(screen.getByText('3 / 3')).toBeDefined()
      expect(screen.getByText(EDITORIAL_SLIDES[2].shortTitle)).toBeDefined()

      // Click Prev from Slide 3 -> Goes to Slide 2 (index 1)
      fireEvent.click(prevBtn)
      expect(screen.getByText('2 / 3')).toBeDefined()
      expect(screen.getByText(EDITORIAL_SLIDES[1].shortTitle)).toBeDefined()
    })
  })

  // =========================================================================
  // 3. SCANNING FOR LEAKED LIFECYCLE STRINGS OR TIMESTAMPS
  // =========================================================================
  describe('3. Sanitation against Leaked Lifecycle / Timestamp Strings', () => {
    it('filters out dirty test products with "Lifecycle Asset" and timestamp strings', () => {
      const dirtyProducts: Product[] = [
        {
          id: 9991,
          title: 'Lifecycle Asset 1789896978582',
          slug: 'lifecycle-asset-1789896978582',
          _status: 'draft',
          createdAt: '2026-09-20T00:00:00.000Z',
          updatedAt: '2026-09-20T00:00:00.000Z',
        } as unknown as Product,
        {
          id: 9992,
          title: 'Lifecycle Asset 1789900310287',
          slug: 'lifecycle-asset-1789900310287',
          _status: 'published',
          createdAt: '2026-09-20T00:00:00.000Z',
          updatedAt: '2026-09-20T00:00:00.000Z',
        } as unknown as Product,
        {
          id: 9993,
          title: 'Draft Product Without Title Match',
          slug: 'draft-product',
          _status: 'draft',
          createdAt: '2026-09-20T00:00:00.000Z',
          updatedAt: '2026-09-20T00:00:00.000Z',
        } as unknown as Product,
      ]

      const { container } = render(<EditorialHero products={dirtyProducts} />)

      // Fallback clean slides should be used because all input products are dirty
      expect(screen.getByText(EDITORIAL_SLIDES[0].shortTitle)).toBeDefined()

      // Absolute guarantee: no "Lifecycle", "Asset", or 13-digit epoch timestamp exists anywhere in the DOM
      const renderedHtml = container.innerHTML
      expect(renderedHtml).not.toMatch(/lifecycle/i)
      expect(renderedHtml).not.toMatch(/1789896978582/)
      expect(renderedHtml).not.toMatch(/1789900310287/)
      expect(renderedHtml).not.toMatch(/\b1789\d{9}\b/)
    })

    it('renders clean architectural products when legitimate published items are passed', () => {
      const cleanCustomProduct: Product = {
        id: 7001,
        title: 'Hồ sơ thiết kế Cung văn hóa thiếu nhi 4 tầng',
        slug: 'ho-so-thiet-ke-cung-van-hoa-thieu-nhi',
        _status: 'published',
        price: 550000,
        isFree: false,
        technicalSpecs: {
          fileFormat: 'Revit 2024 / CAD',
          fileSize: '65.4 MB',
        },
        meta: {
          description: 'Hồ sơ thiết kế bản vẽ thi công đầy đủ kiến trúc và cảnh quan.',
        },
        createdAt: '2026-09-20T00:00:00.000Z',
        updatedAt: '2026-09-20T00:00:00.000Z',
      } as unknown as Product

      const { container } = render(<EditorialHero products={[cleanCustomProduct]} />)

      // The slide links a real product, so its short title is that product's own title (shortened),
      // not curated copy: 'Hồ sơ thiết kế Cung văn hóa thiếu nhi 4 tầng' -> first 28 chars + '...'
      expect(screen.getByText('Hồ sơ thiết kế Cung văn hóa ...')).toBeDefined()
      // Specs resolved from custom product
      expect(screen.getByText('Revit 2024 · 65.4 MB')).toBeDefined()
      // No dirty data
      expect(container.innerHTML).not.toMatch(/lifecycle/i)
    })
  })

  // =========================================================================
  // 4. MOCKUP FIDELITY & BRANDING VISUAL ACCENTS
  // =========================================================================
  describe('4. Mockup Design Tokens & Core Value Promises', () => {
    it('renders the pill badge, H1 headline, description, and 3 value promises', () => {
      render(<EditorialHero />)

      // Pill badge
      expect(screen.getByText('THƯ VIỆN BẢN VẼ CHUYÊN NGHIỆP')).toBeDefined()

      // H1 text
      const h1 = screen.getByRole('heading', { level: 1 })
      expect(h1.textContent).toContain('Bản vẽ chất lượng cao')
      expect(h1.textContent).toContain('cho kiến trúc sư & kỹ sư')

      // Description
      expect(
        screen.getByText(
          'Tài nguyên BIM, CAD, bản vẽ thiết kế, mô hình 3D được kiểm duyệt, sẵn sàng cho dự án của bạn.',
        ),
      ).toBeDefined()

      // 3 Value Promises
      expect(screen.getByText('Tài nguyên chất lượng')).toBeDefined()
      expect(screen.getByText('Kiểm duyệt kỹ thuật')).toBeDefined()
      expect(screen.getByText('Tải về nhanh chóng')).toBeDefined()
    })
  })
})
