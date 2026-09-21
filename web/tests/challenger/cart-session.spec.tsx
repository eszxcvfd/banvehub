/**
 * web/tests/challenger/cart-session.spec.tsx
 *
 * Challenger instrument for `t6` / decision 0014: the storefront cart is browser-session state, so
 * that the drawer, `/cart`, the header badge, the checkout and the "Thêm vào giỏ hàng" control all
 * show and mutate a real cart with no `/api/carts` route behind them.
 *
 * What this proves, and with what:
 *   1. the store's own contract — add (quantity 1) → increment → decrement (floored at one) → remove
 *      by item id → clear, and `isLoading` settling back to false;
 *   2. persistence inside the session — a cart added before a remount is read back after it (the
 *      jsdom stand-in for a page reload), and a session whose `sessionStorage` is gone starts empty;
 *   3. storage hygiene — JSON that does not parse, and items that are not objects, degrade to an empty
 *      cart instead of throwing;
 *   4. the surfaces the buyer sees — clicking the real DigitalProductCTA button puts the product in
 *      the cart at quantity 1, the header badge follows it, the drawer lists it and its stepper/remove
 *      controls mutate it by item id, and `/cart` renders the row and empties the cart through its own
 *      "Làm trống giỏ hàng" control;
 *   5. no `/api/carts` request comes out of the cart path, and the plugin provider (which stays mounted
 *      for `useAddresses`/`usePayments`) does not issue one with the props the app mounts it with —
 *      with a guard proving that assertion can fail: the same provider without `syncLocalStorage={false}`
 *      *does* fetch `/api/carts/{id}` when localStorage holds a cart id.
 *
 * jsdom only: no browser, no dev server, no database.
 */
import React, { useEffect } from 'react'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { CartPageClient } from '@/components/Cart/CartPageClient'
import { OpenCartButton } from '@/components/Cart/OpenCart'
import { DigitalProductCTA } from '@/components/product/DigitalProductCTA'
import { AntdConfigProvider } from '@/providers/Antd'
import { CART_SESSION_STORAGE_KEY, CartProvider, useCart, type CartContextValue } from '@/providers/Cart'
import { EcommerceProvider } from '@payloadcms/plugin-ecommerce/client/react'

// ---------------------------------------------------------------------------
// JSDOM POLYFILLS (antd measures and observes)
// ---------------------------------------------------------------------------
class MockResizeObserver {
  observe = vi.fn()
  unobserve = vi.fn()
  disconnect = vi.fn()
}
global.ResizeObserver = MockResizeObserver

if (typeof window !== 'undefined' && !window.matchMedia) {
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

// ---------------------------------------------------------------------------
// MODULE MOCKS
// ---------------------------------------------------------------------------
const PRODUCT_SLUG = 'mau-thiet-ke-canh-quan'
const mockPathname = `/products/${PRODUCT_SLUG}`

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => mockPathname,
  useSearchParams: () => new URLSearchParams(),
}))

vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}))

vi.mock('next/image', () => ({
  default: ({ src, alt, ...props }: { src?: unknown; alt?: string }) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={typeof src === 'object' && src !== null ? String((src as { src?: string }).src) : String(src)} alt={alt ?? ''} {...props} />
  ),
}))

vi.mock('@/components/Media', () => ({ Media: () => <div data-testid="cart-media" /> }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() } }))
vi.mock('@/providers/Auth', () => ({ useAuth: () => ({ user: null }) }))

// ---------------------------------------------------------------------------
// FETCH RECORDER — the point of criterion 4 is that this never sees /api/carts
// ---------------------------------------------------------------------------
const originalFetch = global.fetch
let fetchCalls: string[] = []

const installFetchStub = () => {
  fetchCalls = []
  global.fetch = vi.fn(async (input: unknown) => {
    const url = typeof input === 'string' ? input : String((input as { url?: string })?.url ?? '')
    fetchCalls.push(url)

    const body = url.includes('/api/v1/me/entitlements')
      ? { success: true, isAuthenticated: false, hasEntitlement: false, docs: [] }
      : {}

    return {
      ok: true,
      status: 200,
      json: async () => body,
      text: async () => JSON.stringify(body),
    } as unknown as Response
  }) as unknown as typeof fetch
}

const cartCalls = (): string[] => fetchCalls.filter((url) => url.includes('/api/carts'))

// ---------------------------------------------------------------------------
// HARNESS
// ---------------------------------------------------------------------------
/**
 * The latest context value, captured through an effect rather than during render: reading a module
 * variable on render is what `react-hooks/immutability` refuses, and the effect runs on every render
 * this component sees, so the test always reads the value the last commit produced.
 */
const cartProbe: { value: CartContextValue | null } = { value: null }

const CartProbe: React.FC = () => {
  const value = useCart()

  useEffect(() => {
    cartProbe.value = value
  })

  return null
}

const renderStore = () =>
  render(
    <CartProvider>
      <CartProbe />
    </CartProvider>,
  )

const api = (): CartContextValue => {
  if (!cartProbe.value) throw new Error('the cart provider is not mounted')
  return cartProbe.value
}

const state = () => ({
  items: api().cart?.items ?? [],
  subtotal: api().cart?.subtotal ?? 0,
  quantities: (api().cart?.items ?? []).map((item) => item.quantity),
})

const readSession = (): { items?: Array<{ id?: string; quantity?: number }> } | null => {
  const raw = window.sessionStorage.getItem(CART_SESSION_STORAGE_KEY)
  return raw ? JSON.parse(raw) : null
}

const buttonWithText = (text: string): HTMLElement => {
  const button = screen
    .getAllByRole('button')
    .find((candidate) => candidate.textContent?.trim() === text)
  if (!button) throw new Error(`no button with text "${text}"`)
  return button
}

/**
 * antd keeps the previous digit in the DOM while the badge number transitions, so `textContent` can
 * read "12" for a count of 2. The sup carries the count in its `title`, and its current digit unit
 * carries `.current`; both are read before the text fallback.
 */
const badgeCount = (container: HTMLElement): string | null => {
  const badge = container.querySelector('.ant-badge-count')
  if (!badge) return null
  const title = badge.getAttribute('title')
  if (title) return title
  const current = badge.querySelector('.ant-scroll-number-only-unit.current')
  return (current?.textContent ?? badge.textContent ?? '').trim()
}

const priceTexts = (): string[] => screen.getAllByText('430.000 ₫').map((node) => node.textContent ?? '')

const product = { id: 159, title: 'Mẫu thiết kế cảnh quan', price: 430000 }

/**
 * The app's header mounts `OpenCartButton`, which owns the drawer and renders it **controlled**; the
 * storefront page does not mount a second, uncontrolled drawer. Opening it the way a buyer does (the
 * header cart link) is what this mirrors. Since t7 the instance also subscribes to `OPEN_CART_EVENT`,
 * so the CTA's own `openCartDrawer()` opens this drawer too — see the t7 instrument,
 * `tests/challenger/checkout-payment-branches.spec.tsx`, which asserts exactly one mounted drawer after
 * the add-to-cart click.
 */
const renderHeaderAndCta = () =>
  render(
    <AntdConfigProvider>
      <CartProvider>
        <OpenCartButton />
        <DigitalProductCTA
          productId={159}
          price={430000}
          productTitle="Mẫu thiết kế cảnh quan"
          fileFormat="DWG"
        />
      </CartProvider>
    </AntdConfigProvider>,
  )

/**
 * The add-to-cart click opens this drawer by itself (the `OPEN_CART_EVENT` subscription `OpenCartButton`
 * gained in t7), so the tests below wait for the drawer's content instead of clicking the header link.
 */
const waitForDrawer = () => waitFor(() => expect(screen.getByText(product.title)).toBeDefined())

const renderCtaOnly = () =>
  render(
    <AntdConfigProvider>
      <CartProvider>
        <DigitalProductCTA
          productId={159}
          price={430000}
          productTitle="Mẫu thiết kế cảnh quan"
          fileFormat="DWG"
        />
      </CartProvider>
    </AntdConfigProvider>,
  )

// ---------------------------------------------------------------------------
// TESTS
// ---------------------------------------------------------------------------
describe('t6 / decision 0014: the cart lives in the browser session', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    window.sessionStorage.clear()
    window.localStorage.clear()
    cartProbe.value = null
    installFetchStub()
  })

  afterEach(() => {
    cleanup()
    global.fetch = originalFetch
  })

  describe('1. the store contract', () => {
    it('adds a product at quantity 1, with the price the cart surfaces read', async () => {
      renderStore()

      await act(async () => {
        await api().addItem({ product })
      })

      const current = state()
      expect(current.items).toHaveLength(1)
      expect(current.items[0].id).toBe('159')
      expect(current.items[0].quantity).toBe(1)
      expect(current.items[0].product).toMatchObject({ id: 159, title: product.title, price: 430000 })
      expect(current.subtotal).toBe(430000)
      expect(api().isLoading).toBe(false)
    })

    it('treats a second add of the same product as a quantity change, not a second line', async () => {
      renderStore()

      await act(async () => {
        await api().addItem({ product })
        await api().addItem({ product })
      })

      expect(state().items).toHaveLength(1)
      expect(state().quantities).toEqual([2])
      expect(state().subtotal).toBe(860000)
    })

    it('increments, decrements and never drops below one unit', async () => {
      renderStore()

      await act(async () => {
        await api().addItem({ product })
      })

      await act(async () => {
        await api().incrementItem('159')
      })
      expect(state().quantities).toEqual([2])

      await act(async () => {
        await api().decrementItem('159')
      })
      expect(state().quantities).toEqual([1])

      await act(async () => {
        await api().decrementItem('159')
      })
      expect(state().quantities).toEqual([1])
      expect(state().items).toHaveLength(1)
    })

    it('removes by item id, and clears the whole cart', async () => {
      renderStore()

      await act(async () => {
        await api().addItem({ product })
        await api().addItem({ product: { id: 158, title: 'Bản vẽ nhà phố', price: 900000 } })
      })
      expect(state().items).toHaveLength(2)

      await act(async () => {
        await api().removeItem('159')
      })
      expect(state().items.map((item) => item.id)).toEqual(['158'])

      await act(async () => {
        await api().clearCart()
      })
      expect(api().cart).toBeNull()
      expect(readSession()).toBeNull()
    })
  })

  describe('2. the session it is persisted in', () => {
    it('reads the cart back after a remount — a reload in the same browser session', async () => {
      const first = renderStore()
      await act(async () => {
        await api().addItem({ product })
      })

      first.unmount()
      renderStore()

      await waitFor(() => expect(state().items).toHaveLength(1))
      expect(state().items[0].id).toBe('159')
      expect(state().quantities).toEqual([1])
      expect(state().subtotal).toBe(430000)
    })

    it('starts empty when the session is a new one', async () => {
      const first = renderStore()
      await act(async () => {
        await api().addItem({ product })
      })
      expect(state().items).toHaveLength(1)

      first.unmount()
      window.sessionStorage.clear() // what a new browser session looks like
      renderStore()

      await waitFor(() => expect(cartProbe.value).not.toBeNull())
      expect(api().cart).toBeNull()
    })

    it('empties the stored cart when clearCart runs', async () => {
      renderStore()
      await act(async () => {
        await api().addItem({ product })
      })
      expect(readSession()?.items).toHaveLength(1)

      await act(async () => {
        await api().clearCart()
      })

      expect(window.sessionStorage.getItem(CART_SESSION_STORAGE_KEY)).toBeNull()
    })

    it('degrades to an empty cart when the stored JSON does not parse', async () => {
      window.sessionStorage.setItem(CART_SESSION_STORAGE_KEY, '{not json at all')

      renderStore()
      await waitFor(() => expect(cartProbe.value).not.toBeNull())
      expect(api().cart).toBeNull()

      // and the next mutation writes a cart this store can read back
      await act(async () => {
        await api().addItem({ product })
      })
      expect(state().items).toHaveLength(1)
      expect(readSession()?.items).toHaveLength(1)
    })

    it('ignores stored items that are not objects', async () => {
      window.sessionStorage.setItem(CART_SESSION_STORAGE_KEY, JSON.stringify({ items: [null, 'x', 7] }))

      renderStore()
      await waitFor(() => expect(cartProbe.value).not.toBeNull())
      expect(api().cart).toBeNull()
    })
  })

  describe('3. the surfaces the buyer uses', () => {
    it('add-to-cart fills the cart the badge and the drawer render, at quantity 1', async () => {
      const { container } = renderHeaderAndCta()
      expect(container.querySelector('.ant-badge-count')).toBeNull()

      fireEvent.click(screen.getByRole('button', { name: /thêm vào giỏ hàng/i }))

      // the badge follows the cart
      await waitFor(() => expect(badgeCount(container)).toBe('1'))

      // one line, quantity 1, and the snapshot carries what the drawer links with
      await waitFor(() => expect(readSession()?.items).toHaveLength(1))
      const stored = readSession()?.items ?? []
      expect(stored[0].id).toBe('159')
      expect(stored[0].quantity).toBe(1)

      await waitForDrawer()
      expect(screen.getByText(product.title).closest('a')?.getAttribute('href')).toBe(
        `/products/${PRODUCT_SLUG}`,
      )
      expect(priceTexts().length).toBeGreaterThan(0)
    })

    it('the drawer stepper and remove control mutate the item by its id', async () => {
      const { container } = renderHeaderAndCta()
      fireEvent.click(screen.getByRole('button', { name: /thêm vào giỏ hàng/i }))
      await waitFor(() => expect(readSession()?.items).toHaveLength(1))

      await waitForDrawer()

      fireEvent.click(buttonWithText('+'))
      await waitFor(() => expect(readSession()?.items?.[0]?.quantity).toBe(2))
      expect(badgeCount(container)).toBe('2')

      fireEvent.click(buttonWithText('-'))
      await waitFor(() => expect(readSession()?.items?.[0]?.quantity).toBe(1))

      fireEvent.click(screen.getByLabelText('Xóa khỏi giỏ hàng'))
      fireEvent.click(await screen.findByRole('button', { name: 'Xóa' }))

      await waitFor(() => expect(container.querySelector('.ant-badge-count')).toBeNull())
      expect(readSession()).toBeNull()
    })

    it('/cart renders the stored row and empties the cart through its own control', async () => {
      window.sessionStorage.setItem(
        CART_SESSION_STORAGE_KEY,
        JSON.stringify({ items: [{ id: '159', product, quantity: 1 }] }),
      )

      render(
        <AntdConfigProvider>
          <CartProvider>
            <CartPageClient />
          </CartProvider>
        </AntdConfigProvider>,
      )

      await waitFor(() => expect(screen.getByText(product.title)).toBeDefined())
      expect(priceTexts().length).toBeGreaterThan(0)
      expect(screen.getByText('1 bản vẽ')).toBeDefined()

      fireEvent.click(screen.getByRole('button', { name: /làm trống giỏ hàng/i }))
      fireEvent.click(await screen.findByRole('button', { name: 'Xóa tất cả' }))

      await waitFor(() =>
        expect(screen.getByText(/giỏ hàng của bạn đang trống/i)).toBeDefined(),
      )
      expect(readSession()).toBeNull()
    })
  })

  describe('4. nothing in the cart path asks the server for a cart', () => {
    it('the store never fetches, and never touches /api/carts', async () => {
      renderStore()

      await act(async () => {
        await api().addItem({ product })
        await api().incrementItem('159')
        await api().decrementItem('159')
        await api().removeItem('159')
        await api().addItem({ product })
        await api().clearCart()
      })

      expect(fetchCalls).toEqual([])
      expect(cartCalls()).toEqual([])
    })

    it('the add-to-cart flow issues no /api/carts request', async () => {
      renderCtaOnly()

      fireEvent.click(screen.getByRole('button', { name: /thêm vào giỏ hàng/i }))
      await waitFor(() => expect(readSession()?.items).toHaveLength(1))

      expect(cartCalls()).toEqual([])
    })

    it('the plugin provider, with the props the app mounts it with, does not fetch a cart either', async () => {
      // A session where an old template cart id is still in localStorage: the exact state in which the
      // plugin provider would go looking for a cart the schema no longer has.
      window.localStorage.setItem('cart', '7')

      render(<EcommerceProvider syncLocalStorage={false}>{null}</EcommerceProvider>)

      await waitFor(() => expect(fetchCalls.some((url) => url.includes('/api/users/me'))).toBe(true))
      expect(cartCalls()).toEqual([])
    })

    it('guard: without syncLocalStorage={false} the plugin provider does fetch /api/carts/{id}', async () => {
      window.localStorage.setItem('cart', '7')

      render(<EcommerceProvider>{null}</EcommerceProvider>)

      await waitFor(() => expect(cartCalls().some((url) => url.includes('/api/carts/7'))).toBe(true))
    })
  })
})
