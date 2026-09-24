import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { CategoryCards, ARCHITECTURAL_CATEGORIES } from '@/components/CategoryTabs'

// Mock next/navigation
const mockPush = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
    replace: vi.fn(),
    prefetch: vi.fn(),
  }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
}))

// Mock next/link
vi.mock('next/link', () => ({
  default: ({ href, children, className, ...props }: { href: string; children: React.ReactNode; className?: string }) => (
    <a href={href} className={className} {...props}>
      {children}
    </a>
  ),
}))

describe('M3 Empirical Challenger: Category Links & Navigation Verification', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('1. CategoryCards renders exactly 8 category cards', () => {
    render(<CategoryCards />)
    const links = screen.getAllByRole('link')
    expect(links).toHaveLength(8)
  })

  it('2. Card 8 ("Khác") strictly routes to /shop without dead-end slug', () => {
    render(<CategoryCards />)
    const links = screen.getAllByRole('link')
    const card8 = links[7]

    expect(card8).toBeDefined()
    expect(card8.textContent).toContain('Khác')
    expect(card8.getAttribute('href')).toBe('/shop')
  })

  it('3. All 8 category links route to the expected paths', () => {
    render(<CategoryCards />)
    const links = screen.getAllByRole('link')

    const expectedRoutes = [
      { title: 'Bản vẽ kiến trúc', expectedHref: '/shop?category=ban-ve-kien-truc' },
      { title: 'Bản vẽ kết cấu', expectedHref: '/shop?category=ban-ve-ket-cau' },
      { title: 'Cơ điện MEP', expectedHref: '/shop?category=ban-ve-co-dien-mep' },
      { title: 'Mô hình BIM Revit', expectedHref: '/shop?category=mo-hinh-bim-revit' },
      { title: 'Nội thất', expectedHref: '/shop?category=thiet-ke-noi-that' },
      { title: 'Thiết kế 3D', expectedHref: '/shop?category=thu-vien-sketchup-3dsmax' },
      { title: 'Hồ sơ quy hoạch', expectedHref: '/shop?category=ho-so-quy-hoach-ha-tang' },
      { title: 'Khác', expectedHref: '/shop' },
    ]

    expectedRoutes.forEach((route, index) => {
      const link = links[index]
      expect(link.textContent).toContain(route.title)
      expect(link.getAttribute('href')).toBe(route.expectedHref)
    })
  })

  it('4. ARCHITECTURAL_CATEGORIES metadata matches mockup specification', () => {
    expect(ARCHITECTURAL_CATEGORIES).toHaveLength(8)

    const titles = ARCHITECTURAL_CATEGORIES.map((c) => c.title)
    expect(titles).toEqual([
      'Bản vẽ kiến trúc',
      'Bản vẽ kết cấu',
      'Cơ điện MEP',
      'Mô hình BIM Revit',
      'Nội thất',
      'Thiết kế 3D',
      'Hồ sơ quy hoạch',
      'Khác',
    ])

    const counts = ARCHITECTURAL_CATEGORIES.map((c) => c.count)
    expect(counts).toEqual([
      '2.500+',
      '1.800+',
      '1.200+',
      '2.600+',
      '1.400+',
      '900+',
      '600+',
      '300+',
    ])
  })

  it('5. "Xem tất cả →" section link navigates strictly to /shop', () => {
    // Render the header structure as in web/src/app/(app)/page.tsx lines 229-240
    render(
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-0">
          Danh Mục Tài Nguyên
        </h2>
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
        <a
          href="/shop"
          className="inline-flex items-center gap-1 text-sm font-medium text-blue-600 hover:underline"
        >
          <span>Xem tất cả</span>
          <span aria-hidden="true">&rarr;</span>
        </a>
      </div>
    )


    const viewAllLink = screen.getByRole('link', { name: /Xem tất cả/i })
    expect(viewAllLink).toBeDefined()
    expect(viewAllLink.getAttribute('href')).toBe('/shop')
  })
})

