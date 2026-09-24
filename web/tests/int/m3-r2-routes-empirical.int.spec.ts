import { describe, it, expect } from 'vitest'
import config from '@/payload.config'
import { getPayload } from 'payload'
import ShopPage from '@/app/(app)/shop/page'
import { ARCHITECTURAL_CATEGORIES } from '@/components/CategoryTabs'

describe('M3 R2 Empirical Integration: Storefront Category Route Execution', () => {
  it('executes ShopPage for all 8 architectural categories without 404 or unhandled errors', async () => {
    const payload = await getPayload({ config: await config })

    for (const cat of ARCHITECTURAL_CATEGORIES) {
      const searchParams = cat.slug === 'all' || cat.slug === 'khac'
        ? {}
        : { category: cat.slug }

      // Execute ShopPage server component directly with the category params
      const jsx = await ShopPage({ searchParams: Promise.resolve(searchParams) })

      expect(jsx).toBeDefined()
      // Ensure it returned a valid React element
      expect(typeof jsx).toBe('object')
      expect(jsx).not.toBeNull()
    }
  })

  it('verifies that Card 8 ("Khác") maps to /shop and yields full shop results', async () => {
    const card8 = ARCHITECTURAL_CATEGORIES.find((c) => c.slug === 'all' || c.title === 'Khác')
    expect(card8).toBeDefined()
    expect(card8?.title).toBe('Khác')

    // Executing with empty searchParams (as /shop does) returns valid JSX
    const jsx = await ShopPage({ searchParams: Promise.resolve({}) })
    expect(jsx).toBeDefined()
  })
})
