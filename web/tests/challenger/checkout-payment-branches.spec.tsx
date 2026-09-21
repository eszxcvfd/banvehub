/**
 * web/tests/challenger/checkout-payment-branches.spec.tsx
 *
 * Challenger instrument for `t7`: the checkout's three payment branches must reach APIs that exist and
 * never tell the buyer something that did not happen.
 *
 * What it asserts, per branch, with a mocked `fetch` that records URL, method and body:
 *   1. **VietQR** posts a real wallet top-up to decision 0004's rail (`POST /api/v1/payments/topup`,
 *      the route `/wallet` itself uses), renders the created intent's code, hands the buyer to the
 *      wallet's payment step (`/wallet?topup=<code>`) and leaves the cart alone — the purchase happens
 *      later through the wallet. Its failure path (the route's own 400 message) is rendered too, and
 *      the removed sentence "Đơn hàng đã được ghi nhận" appears nowhere on it.
 *   2. **Card** posts to the rail's own endpoint, `POST /api/v1/payments/card/initiate`, which answers a
 *      deterministic **501**; the checkout renders that message on its existing error surface and never
 *      reaches `/api/payments/stripe/initiate` (the route decision 0013 removed).
 *   3. **Wallet** keeps calling `POST /api/v1/orders/purchase` once per cart item and clears the cart
 *      only after every call succeeded; when one fails, nothing is cleared and the failure is rendered.
 *   4. **Hand-off**: the wallet page resumes the top-up intent handed over in the URL, so the payment
 *      step the VietQR branch navigates to is a real one.
 *   5. **Cart drawer**: the add-to-cart click mounts exactly one drawer — the one the application
 *      renders, owned (controlled) by `OpenCartButton` — and that drawer shows the added item. Measured
 *      before the fix: 0 drawers.
 *
 * jsdom only: no browser, no dev server, no database. The cart under test is the real session store of
 * decision 0014 (`@/providers/Cart`), seeded through `sessionStorage`.
 */
import React from 'react'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { CartPageClient } from '@/components/Cart/CartPageClient'
import { OpenCartButton } from '@/components/Cart/OpenCart'
import { CheckoutPage } from '@/components/checkout/CheckoutPage'
import { DigitalProductCTA } from '@/components/product/DigitalProductCTA'
import { WalletClient } from '@/components/wallet/WalletClient'
import { AntdConfigProvider } from '@/providers/Antd'
import { CART_SESSION_STORAGE_KEY, CartProvider } from '@/providers/Cart'

// ---------------------------------------------------------------------------
// JSDOM POLYFILLS
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
const mockRouterPush = vi.fn()
let mockSearchParams = new URLSearchParams()

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockRouterPush, replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/products/san-pham-159-ban-ve-canh-quan-san-vuon',
  useSearchParams: () => mockSearchParams,
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
    <img src={String(src)} alt={alt ?? ''} {...props} />
  ),
}))

const buyer = { id: 10, email: 'buyer01@kientaohub.vn', name: 'Nguyễn Văn An' }
vi.mock('@/providers/Auth', () => ({ useAuth: () => ({ user: buyer }) }))
vi.mock('@/providers/Theme', () => ({ useTheme: () => ({ theme: 'light' }) }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() } }))

const billingAddress = {
  id: 1,
  customer: 10,
  firstName: 'Nguyễn',
  lastName: 'Văn An',
  addressLine1: '12 Lê Lợi',
  city: 'Hồ Chí Minh',
  state: 'Hồ Chí Minh',
  postalCode: '700000',
  country: 'Việt Nam',
  phone: '0900000000',
}

vi.mock('@payloadcms/plugin-ecommerce/client/react', () => ({
  useAddresses: () => ({ addresses: [billingAddress] }),
}))

// ---------------------------------------------------------------------------
// FETCH RECORDER — one route table, per test overrides
// ---------------------------------------------------------------------------
type Call = { url: string; method: string; body: unknown; path: string }

let calls: Call[] = []
let walletBalance = 5_000_000
let purchaseHandler: (productId: number, index: number) => { status: number; body: unknown }
let topupResponse: { status: number; body: unknown }
let intentLookup: { status: number; body: unknown }
const originalFetch = global.fetch

const intent = {
  id: 44,
  code: 'KTHMUAMPFRA382',
  amount: 1_330_000,
  currency: 'VND',
  status: 'PENDING',
  expiresAt: '2026-09-21T03:00:00.000Z',
  checkoutUrl: 'https://img.vietqr.io/image/MB-0987654321-compact2.png?amount=1330000&addInfo=KTHMUAMPFRA382',
  bankCode: 'MB',
  accountNo: '0987654321',
  accountName: 'KIENTAOHUB',
}

const installFetch = () => {
  calls = []

  global.fetch = vi.fn(async (input: unknown, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : String((input as { url?: string })?.url ?? '')
    const method = (init?.method ?? 'GET').toUpperCase()
    let body: unknown = null
    if (typeof init?.body === 'string') {
      try {
        body = JSON.parse(init.body)
      } catch {
        body = init.body
      }
    }
    const path = url.startsWith('http') ? new URL(url).pathname + new URL(url).search : url
    calls.push({ url, method, body, path })

    const respond = (status: number, payload: unknown) =>
      ({
        ok: status >= 200 && status < 300,
        status,
        json: async () => payload,
        text: async () => JSON.stringify(payload),
      }) as unknown as Response

    if (path.startsWith('/api/v1/me/wallet')) {
      return respond(200, {
        success: true,
        wallet: { id: 16, balance: walletBalance, pendingBalance: 0, currency: 'VND', status: 'active' },
      })
    }

    if (path.startsWith('/api/v1/orders/purchase')) {
      const index = calls.filter((call) => call.path.startsWith('/api/v1/orders/purchase')).length - 1
      const productId = Number((body as { productId?: number } | null)?.productId)
      const { status, body: payload } = purchaseHandler(productId, index)
      return respond(status, payload)
    }

    if (path.startsWith('/api/v1/payments/topup')) {
      return respond(topupResponse.status, topupResponse.body)
    }

    if (path.startsWith('/api/v1/payments/card/initiate')) {
      // The rail's own endpoint: it exists and answers a deterministic refusal (decision 0014 §5).
      return respond(501, {
        error: 'PAYMENT_METHOD_NOT_IMPLEMENTED',
        message:
          'Thanh toán bằng thẻ quốc tế chưa được hỗ trợ. Vui lòng chọn Ví KienTaoHub hoặc chuyển khoản VietQR.',
      })
    }

    if (path.includes('/api/v1/payments/')) {
      return respond(intentLookup.status, intentLookup.body)
    }

    if (path.startsWith('/api/v1/me/entitlements')) {
      return respond(200, { success: true, isAuthenticated: false, hasEntitlement: false, docs: [] })
    }

    return respond(200, { success: true, docs: [] })
  }) as unknown as typeof fetch
}

const callsTo = (needle: string): Call[] => calls.filter((call) => call.path.includes(needle))

// ---------------------------------------------------------------------------
// HARNESS
// ---------------------------------------------------------------------------
const cartItems = [
  { id: '159', product: { id: 159, title: 'Bản vẽ cảnh quan', price: 430_000, technicalSpecs: { fileFormat: 'DWG' } }, quantity: 1 },
  { id: '158', product: { id: 158, title: 'Bản vẽ nhà phố', price: 900_000, technicalSpecs: { fileFormat: 'DWG' } }, quantity: 1 },
]
const subtotal = 1_330_000

const seedCart = (items = cartItems) =>
  window.sessionStorage.setItem(CART_SESSION_STORAGE_KEY, JSON.stringify({ items }))

const renderCheckout = () =>
  render(
    <AntdConfigProvider>
      <CartProvider>
        <CheckoutPage />
      </CartProvider>
    </AntdConfigProvider>,
  )

const advanceToPayments = async () => {
  const next = await screen.findByRole('button', { name: /tiếp tục: chọn phương thức thanh toán/i })
  await waitFor(() => expect(next.hasAttribute('disabled')).toBe(false))
  fireEvent.click(next)
  await screen.findByText('Chọn phương thức thanh toán')
}

/** Radio order in the payment group: 0 wallet, 1 VietQR, 2 card. */
const selectMethod = (index: number) => fireEvent.click(screen.getAllByRole('radio')[index])

const advanceToReview = async () => {
  fireEvent.click(screen.getByRole('button', { name: /tiếp tục: xác nhận đơn hàng/i }))
  await screen.findByText('Xác nhận thông tin & Hoàn tất đơn hàng')
}

const cartStorage = (): { items?: unknown[] } | null => {
  const raw = window.sessionStorage.getItem(CART_SESSION_STORAGE_KEY)
  return raw ? JSON.parse(raw) : null
}

// ---------------------------------------------------------------------------
// TESTS
// ---------------------------------------------------------------------------
describe('t7: the checkout pays through APIs that exist', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    window.sessionStorage.clear()
    window.localStorage.clear()
    mockSearchParams = new URLSearchParams()
    walletBalance = 5_000_000
    purchaseHandler = (productId) => ({ status: 200, body: { success: true, orderId: `order-${productId}` } })
    topupResponse = { status: 200, body: { success: true, intent } }
    intentLookup = { status: 200, body: { success: true, intent } }
    installFetch()
  })

  afterEach(() => {
    cleanup()
    global.fetch = originalFetch
  })

  describe('1. VietQR: a real top-up on decision 0004’s rail, then the payment step', () => {
    it('posts the top-up, renders its code, hands off to /wallet?topup=… and keeps the cart', async () => {
      seedCart()
      renderCheckout()
      await advanceToPayments()
      selectMethod(1)
      await advanceToReview()

      fireEvent.click(screen.getByRole('button', { name: /xác nhận đặt hàng với vietqr/i }))

      await waitFor(() => expect(callsTo('/api/v1/payments/topup').length).toBe(1))
      expect(callsTo('/api/v1/payments/topup')[0]).toMatchObject({
        method: 'POST',
        body: { amount: subtotal },
      })

      await waitFor(() =>
        expect(mockRouterPush).toHaveBeenCalledWith(`/wallet?topup=${intent.code}`),
      )
      expect(await screen.findByText(new RegExp(intent.code))).toBeDefined()

      // no order was created and the cart is untouched: the purchase happens later, through the wallet
      expect(callsTo('/api/v1/orders/purchase')).toEqual([])
      expect(cartStorage()?.items).toHaveLength(2)
    })

    it('renders the route’s own failure message and navigates nowhere', async () => {
      topupResponse = {
        status: 400,
        body: { error: 'Số tiền nạp tối thiểu là 10.000₫ và phải là số nguyên (VND).' },
      }
      seedCart()
      renderCheckout()
      await advanceToPayments()
      selectMethod(1)
      await advanceToReview()

      fireEvent.click(screen.getByRole('button', { name: /xác nhận đặt hàng với vietqr/i }))

      expect(
        await screen.findByText(/Số tiền nạp tối thiểu là 10\.000₫ và phải là số nguyên \(VND\)\./),
      ).toBeDefined()
      expect(mockRouterPush).not.toHaveBeenCalled()
      expect(cartStorage()?.items).toHaveLength(2)
    })

    it('never announces an order it did not record', async () => {
      seedCart()
      renderCheckout()
      await advanceToPayments()
      selectMethod(1)
      await advanceToReview()

      expect(screen.queryByText(/Đơn hàng đã được ghi nhận/)).toBeNull()

      fireEvent.click(screen.getByRole('button', { name: /xác nhận đặt hàng với vietqr/i }))
      await waitFor(() => expect(callsTo('/api/v1/payments/topup').length).toBe(1))

      expect(screen.queryByText(/Đơn hàng đã được ghi nhận/)).toBeNull()
      expect(screen.queryByText(/nhận bản vẽ/)).toBeNull()
    })
  })

  describe('2. Card: a deterministic refusal from the rail’s own endpoint', () => {
    it('posts to /api/v1/payments/card/initiate (501) and renders its message', async () => {
      seedCart()
      renderCheckout()
      await advanceToPayments()
      selectMethod(2)
      await advanceToReview()

      await waitFor(() => expect(callsTo('/api/v1/payments/card/initiate').length).toBe(1))
      expect(callsTo('/api/v1/payments/card/initiate')[0].method).toBe('POST')

      expect(await screen.findByText(/chưa được hỗ trợ/i)).toBeDefined()

      // never the route decision 0013 removed, and no rail switch: no purchase, no top-up
      expect(calls.filter((call) => call.path.includes('/api/payments/stripe'))).toEqual([])
      expect(callsTo('/api/v1/orders/purchase')).toEqual([])
      expect(callsTo('/api/v1/payments/topup')).toEqual([])
    })

    it('leaves the card’s final action unavailable, because no client secret ever arrives', async () => {
      seedCart()
      renderCheckout()
      await advanceToPayments()
      selectMethod(2)
      await advanceToReview()

      await waitFor(() => expect(callsTo('/api/v1/payments/card/initiate').length).toBe(1))
      const finish = screen.getByRole('button', { name: /hoàn tất thanh toán qua thẻ/i })
      expect(finish.hasAttribute('disabled')).toBe(true)
    })
  })

  describe('3. Wallet: one purchase per item, cart cleared only on success', () => {
    it('purchases every cart item and clears the cart after the last success', async () => {
      seedCart()
      renderCheckout()
      await advanceToPayments()
      selectMethod(0)
      await advanceToReview()

      fireEvent.click(screen.getByRole('button', { name: /xác nhận thanh toán ví/i }))

      await waitFor(() => expect(callsTo('/api/v1/orders/purchase').length).toBe(2))
      expect(callsTo('/api/v1/orders/purchase').map((call) => call.body)).toEqual([
        { productId: 159 },
        { productId: 158 },
      ])
      expect(callsTo('/api/v1/orders/purchase').every((call) => call.method === 'POST')).toBe(true)

      await waitFor(() => expect(cartStorage()).toBeNull())
      expect(await screen.findByText(/Thanh toán thành công/i)).toBeDefined()
      expect(mockRouterPush).toHaveBeenCalledWith('/orders/order-158')
    })

    it('renders the failure and leaves the cart untouched when a purchase fails', async () => {
      seedCart()
      purchaseHandler = (_productId, index) =>
        index === 1
          ? { status: 400, body: { error: 'INSUFFICIENT_FUNDS', message: 'Số dư ví không đủ để thanh toán.' } }
          : { status: 200, body: { success: true, orderId: 'order-159' } }

      renderCheckout()
      await advanceToPayments()
      selectMethod(0)
      await advanceToReview()

      fireEvent.click(screen.getByRole('button', { name: /xác nhận thanh toán ví/i }))

      expect(await screen.findByText(/Số dư ví không đủ để thanh toán\./)).toBeDefined()
      expect(cartStorage()?.items).toHaveLength(2)
      expect(mockRouterPush).not.toHaveBeenCalled()
    })
  })

  describe('4. The wallet page resumes the handed-over top-up', () => {
    it('reads ?topup=<code>, looks the intent up and opens the payment step on it', async () => {
      mockSearchParams = new URLSearchParams(`topup=${intent.code}`)

      render(
        <AntdConfigProvider>
          <WalletClient
            initialWallet={{ id: 16, balance: 0, pendingBalance: 0, currency: 'VND', status: 'active' }}
            initialLedger={[]}
          />
        </AntdConfigProvider>,
      )

      await waitFor(() => expect(callsTo(`/api/v1/payments/${intent.code}`).length).toBe(1))
      expect(callsTo(`/api/v1/payments/${intent.code}`)[0].method).toBe('GET')

      // the payment step renders the intent: its transfer reference and the QR payload
      expect(await screen.findByText(intent.code)).toBeDefined()
      expect(screen.getByText('Nạp tiền vào ví qua VietQR (Tự động 24/7)')).toBeDefined()
    })
  })

  describe('5. The add-to-cart click opens the drawer the app renders', () => {
    it('mounts exactly one drawer and shows the added item in it', async () => {
      render(
        <AntdConfigProvider>
          <CartProvider>
            <OpenCartButton />
            <DigitalProductCTA
              productId={159}
              price={430_000}
              productTitle="Bản vẽ cảnh quan"
              fileFormat="DWG"
            />
          </CartProvider>
        </AntdConfigProvider>,
      )

      expect(document.querySelectorAll('.ant-drawer').length).toBe(0)

      fireEvent.click(screen.getByRole('button', { name: /thêm vào giỏ hàng/i }))

      await waitFor(() => expect(document.querySelectorAll('.ant-drawer').length).toBe(1))
      await waitFor(() => expect(screen.getByText('Bản vẽ cảnh quan')).toBeDefined())
      expect(cartStorage()?.items).toHaveLength(1)
    })
  })

  describe('6. The cart page still renders the session cart', () => {
    it('shows the seeded row, so the branch surfaces share one cart', async () => {
      seedCart()

      render(
        <AntdConfigProvider>
          <CartProvider>
            <CartPageClient />
          </CartProvider>
        </AntdConfigProvider>,
      )

      await waitFor(() => expect(screen.getByText('Bản vẽ cảnh quan')).toBeDefined())
      expect(screen.getByText('2 bản vẽ')).toBeDefined()
    })
  })
})
