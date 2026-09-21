/**
 * web/tests/challenger/recent-resources-fallback.spec.tsx
 *
 * Challenger instrument for `t8`: the homepage section `components/RecentResources` must show the
 * product each card links to, and `CURATED_RECENT_ITEMS` must go back to being what it claims — the
 * fallback for when there are no products (empty or short list) — instead of a mask over real ones.
 *
 * It exercises the component directly, with products that do NOT share the curated values, so a card
 * that keeps a curated number is impossible to miss:
 *   - no products (undefined and `[]`)  -> the five curated items still render, ratings included
 *   - a short product list              -> the filled positions carry the product's own title, price,
 *                                          format and size, the rest stay curated
 *   - a free product                    -> renders its own 0 ₫
 *   - a product-backed card             -> renders no rating or review count (this schema stores none)
 *
 * jsdom only: no browser, no dev server, no database.
 */
import React from 'react'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { RecentResources } from '@/components/RecentResources'
import type { Product } from '@/payload-types'

vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}))

vi.mock('next/image', () => ({
  default: ({ src, alt, fill, sizes, ...props }: { src?: unknown; alt?: string; fill?: boolean; sizes?: string }) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={String(src)} alt={alt ?? ''} {...props} />
  ),
}))

const product = (overrides: Partial<Product> & { id: number; slug: string }): Product =>
  ({
    title: 'Sản phẩm thật',
    price: 510_000,
    isFree: false,
    technicalSpecs: { fileFormat: '.dwg', fileSize: '44.6 MB' },
    ...overrides,
  }) as unknown as Product

const cards = (container: HTMLElement): HTMLAnchorElement[] =>
  Array.from(container.querySelectorAll('a[data-slot="recent-resource-card"]'))

const cardSlugs = (container: HTMLElement): string[] =>
  cards(container).map((card) => card.getAttribute('href') ?? '')

const CURATED_PRICES = ['950.000 ₫', '600.000 ₫', '1.300.000 ₫', '750.000 ₫', '2.500.000 ₫']

describe('t8: RecentResources shows the product it links to, not the curated mask', () => {
  afterEach(cleanup)

  describe('1. the curated list is the fallback', () => {
    it('renders the five curated items when no products are given', () => {
      const { container } = render(<RecentResources />)

      expect(cards(container)).toHaveLength(5)
      expect(screen.getByText('Biệt thự 1 tầng mái Thái – Full hồ sơ')).toBeDefined()
      expect(screen.getByText('950.000 ₫')).toBeDefined()
      // the curated ratings belong to the curated items when they are the whole list
      expect(screen.getAllByText('★')).toHaveLength(5)
      expect(screen.getByText('(45)')).toBeDefined()
      expect(cardSlugs(container)[0]).toBe(
        '/products/san-pham-1-ho-so-thiet-ke-ban-ve-thi-cong-biet-thu-vuon-2-tang-hien-dai-12x15m',
      )
    })

    it('renders the curated items for an empty product list too', () => {
      const { container } = render(<RecentResources products={[]} />)

      expect(cards(container)).toHaveLength(5)
      for (const price of CURATED_PRICES) expect(screen.getByText(price)).toBeDefined()
      expect(screen.getAllByText('★')).toHaveLength(5)
    })
  })

  describe('2. a product-backed card carries that product’s values', () => {
    it('takes title, price, format and size from the product, never from the curated item', () => {
      const { container } = render(
        <RecentResources
          products={[
            product({
              id: 159,
              slug: 'san-pham-159-ban-ve-canh-quan-san-vuon',
              title: 'Bản vẽ cảnh quan khu lăng mộ gia tộc',
              price: 510_000,
              technicalSpecs: { fileFormat: '.dwg,.pdf', fileSize: '44.6 MB' },
            }),
          ]}
        />,
      )

      expect(cards(container)[0].getAttribute('href')).toBe(
        '/products/san-pham-159-ban-ve-canh-quan-san-vuon',
      )
      expect(screen.getByText('Bản vẽ cảnh quan khu lăng mộ gia tộc')).toBeDefined()
      expect(screen.getByText('510.000 ₫')).toBeDefined()
      expect(screen.getByText('.dwg · 44.6 MB')).toBeDefined()

      // the curated values are gone from the product-backed card...
      expect(screen.queryByText('Biệt thự 1 tầng mái Thái – Full hồ sơ')).toBeNull()
      expect(screen.queryByText('950.000 ₫')).toBeNull()
      // ...and the positions the list does not fill stay curated (a short list keeps the section full)
      expect(screen.getAllByText('★')).toHaveLength(4)
      expect(screen.getByText('600.000 ₫')).toBeDefined()
    })

    it('renders a free product as its own 0 ₫', () => {
      render(
        <RecentResources
          products={[
            product({
              id: 157,
              slug: 'san-pham-157-ban-ve-canh-quan-san-vuon',
              title: 'Bản vẽ thiết kế tiểu cảnh giếng trời',
              price: 0,
              isFree: true,
              technicalSpecs: { fileFormat: '.skp', fileSize: '38.9 MB' },
            }),
          ]}
        />,
      )

      expect(screen.getByText('0 ₫')).toBeDefined()
      expect(screen.getByText('.skp · 38.9 MB')).toBeDefined()
      expect(screen.queryByText('950.000 ₫')).toBeNull()
    })

    it('shows no rating or review count on a product-backed card', () => {
      render(
        <RecentResources
          products={[product({ id: 155, slug: 'san-pham-155-ban-ve-canh-quan-san-vuon' })]}
        />,
      )

      const card = cards(document.body as HTMLElement)[0]
      expect(card.textContent).not.toContain('★')
      expect(card.textContent).not.toContain('(45)')
      // the curated items after it keep theirs
      expect(cards(document.body as HTMLElement).slice(1).some((c) => c.textContent?.includes('★'))).toBe(true)
    })
  })
})
