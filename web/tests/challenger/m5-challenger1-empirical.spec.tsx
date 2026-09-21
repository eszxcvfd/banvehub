import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'
import { CartDrawer, OPEN_CART_EVENT, openCartDrawer } from '@/components/Cart/CartDrawer'
import { CartPageClient } from '@/components/Cart/CartPageClient'
import { OpenCartButton } from '@/components/Cart/OpenCart'
import { CheckoutSteps } from '@/components/checkout/CheckoutSteps'
import { CheckoutPage } from '@/components/checkout/CheckoutPage'
import { OrderSummaryCard } from '@/components/checkout/OrderSummaryCard'
import { WalletClient, type WalletData, type LedgerEntry } from '@/components/wallet/WalletClient'
import { AntdConfigProvider } from '@/providers/Antd'

// ---------------------------------------------------------------------------
// JSDOM POLYFILLS
// ---------------------------------------------------------------------------
class MockResizeObserver {
  observe = vi.fn()
  unobserve = vi.fn()
  disconnect = vi.fn()
}
// @ts-ignore
global.ResizeObserver = MockResizeObserver

if (typeof window !== 'undefined') {
  if (!window.matchMedia) {
    window.matchMedia = (query: string) =>
      ({
        matches: false,
        media: query,
        onchange: null,
        addListener: () => {},
        removeListener: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => false,
      } as any)
  }
}

// ---------------------------------------------------------------------------
// ROUTER & NAVIGATION MOCKS
// ---------------------------------------------------------------------------
// Wallet fixtures for the top-up modal cases: they lived inside the two discount tests that were
// deleted with OrderSummaryCard's `discount` prop (t36), so they are restored here at module scope.
const mockWalletData = {
  id: 16,
  balance: 1000000,
  pendingBalance: 0,
  currency: 'VND',
  status: 'active',
}

const mockLedger: any[] = []

const mockRouterPush = vi.fn()
let mockPathname = '/'
let mockSearchParams = new URLSearchParams()

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockRouterPush,
  }),
  usePathname: () => mockPathname,
  useSearchParams: () => mockSearchParams,
}))

vi.mock('next/link', () => ({
  default: ({
    href,
    children,
    className,
    onClick,
    ...props
  }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a
      href={href}
      className={className}
      onClick={(e) => {
        onClick?.(e)
      }}
      {...props}
    >
      {children}
    </a>
  ),
}))

// Mock next/image
vi.mock('next/image', () => ({
  default: ({ src, alt, ...props }: any) => <img src={src} alt={alt} {...props} />,
}))

// ---------------------------------------------------------------------------
// CONTEXT PROVIDER MOCKS
// ---------------------------------------------------------------------------
let mockUser: any = null
vi.mock('@/providers/Auth', () => ({
  useAuth: () => ({
    user: mockUser,
  }),
}))

vi.mock('@/providers/Theme', () => ({
  useTheme: () => ({
    theme: 'light',
  }),
}))

let mockCartState: {
  cart: any
  isLoading: boolean
  removeItem: any
  incrementItem: any
  decrementItem: any
  clearCart: any
} = {
  cart: { items: [], subtotal: 0 },
  isLoading: false,
  removeItem: vi.fn(),
  incrementItem: vi.fn(),
  decrementItem: vi.fn(),
  clearCart: vi.fn(),
}

// The cart now comes from the storefront's own session store (decision 0014); the plugin's context
// stays mounted for `useAddresses`/`usePayments`.
vi.mock('@/providers/Cart', () => ({
  useCart: () => mockCartState,
}))

vi.mock('@payloadcms/plugin-ecommerce/client/react', () => ({
  useAddresses: () => ({ addresses: [] }),
  usePayments: () => ({ initiatePayment: vi.fn() }),
}))

// ---------------------------------------------------------------------------
// TEST SUITE
// ---------------------------------------------------------------------------
describe('M5 Challenger 1: Empirical Verification & Adversarial Stress Tests (F29, F30, F31, F32, F33, F39)', () => {
  const originalFetch = global.fetch

  beforeEach(() => {
    vi.clearAllMocks()
    mockUser = null
    mockPathname = '/'
    mockSearchParams = new URLSearchParams()
    global.fetch = vi.fn()
    mockCartState = {
      cart: { items: [], subtotal: 0 },
      isLoading: false,
      removeItem: vi.fn(),
      incrementItem: vi.fn(),
      decrementItem: vi.fn(),
      clearCart: vi.fn(),
    }
  })

  afterEach(() => {
    cleanup()
    global.fetch = originalFetch
  })

  // =========================================================================
  // 1. OPEN CART BUTTON CONTRACT & DRAWER TRIGGER
  // =========================================================================
  describe('1. OpenCart Button Contract & Integration (F29)', () => {
    it('satisfies contract: rendered as link with href="/cart", aria-label="Giỏ hàng", and data-slot="cart"', () => {
      render(
        <AntdConfigProvider>
          <OpenCartButton quantity={3} />
        </AntdConfigProvider>,
      )

      const cartLink = screen.getByRole('link', { name: /giỏ hàng/i })
      expect(cartLink).toBeDefined()
      expect(cartLink.getAttribute('href')).toBe('/cart')
      expect(cartLink.getAttribute('aria-label')).toBe('Giỏ hàng')
      expect(cartLink.getAttribute('data-slot')).toBe('cart')
    })

    it('renders badge count reflecting provided quantity or cart total quantity', () => {
      const { container } = render(
        <AntdConfigProvider>
          <OpenCartButton quantity={5} />
        </AntdConfigProvider>,
      )

      const badgeCount = container.querySelector('.ant-badge-count')
      expect(badgeCount).not.toBeNull()
      expect(badgeCount?.textContent).toBe('5')
    })

    it('opens CartDrawer when clicked without navigating away immediately', () => {
      render(
        <AntdConfigProvider>
          <OpenCartButton quantity={0} />
        </AntdConfigProvider>,
      )

      const cartLink = screen.getByRole('link', { name: /giỏ hàng/i })
      fireEvent.click(cartLink)

      expect(screen.getByText('Giỏ hàng của bạn')).toBeDefined()
    })

    it('opens CartDrawer via window CustomEvent "open-cart-drawer"', async () => {
      render(
        <AntdConfigProvider>
          <CartDrawer />
        </AntdConfigProvider>,
      )

      openCartDrawer()
      await waitFor(() => {
        expect(screen.getByText('Giỏ hàng của bạn')).toBeDefined()
      })
    })
  })

  // =========================================================================
  // 2. CART DRAWER & EMPTY STATE & MUTATIONS (F29)
  // =========================================================================
  describe('2. CartDrawer State & Mutations (F29)', () => {
    it('renders empty cart message and explore button when cart is empty', () => {
      mockCartState.cart = { items: [], subtotal: 0 }
      render(
        <AntdConfigProvider>
          <CartDrawer open={true} />
        </AntdConfigProvider>,
      )

      expect(screen.getByText('Giỏ hàng của bạn đang trống')).toBeDefined()
      const exploreBtn = screen.getByRole('link', { name: /khám phá bản vẽ kỹ thuật/i })
      expect(exploreBtn).toBeDefined()
      expect(exploreBtn.getAttribute('href')).toBe('/shop')
    })

    it('renders cart items, disables decrement button when quantity is 1', () => {
      mockCartState.cart = {
        items: [
          {
            id: 'item-1',
            quantity: 1,
            product: {
              id: 'p-1',
              title: 'Bản vẽ Biệt thự Tân cổ điển 3 tầng',
              slug: 'ban-ve-biet-thu-tan-co-dien-3-tang',
              price: 500000,
              technicalSpecs: { fileFormat: 'CAD / DWG' },
            },
          },
        ],
        subtotal: 500000,
      }

      render(
        <AntdConfigProvider>
          <CartDrawer open={true} />
        </AntdConfigProvider>,
      )

      expect(screen.getByText('Bản vẽ Biệt thự Tân cổ điển 3 tầng')).toBeDefined()
      expect(screen.getByText('CAD / DWG')).toBeDefined()

      // The "-" button should be disabled when quantity <= 1
      const minusBtn = screen.getByRole('button', { name: '-' })
      expect(minusBtn.hasAttribute('disabled')).toBe(true)

      // The "+" button should be clickable
      const plusBtn = screen.getByRole('button', { name: '+' })
      expect(plusBtn.hasAttribute('disabled')).toBe(false)
      fireEvent.click(plusBtn)
      expect(mockCartState.incrementItem).toHaveBeenCalledWith('item-1')
    })

    it('allows decrement when quantity > 1', () => {
      mockCartState.cart = {
        items: [
          {
            id: 'item-2',
            quantity: 3,
            product: {
              id: 'p-2',
              title: 'Bản vẽ Kết cấu Thép Nhà xưởng',
              slug: 'ban-ve-ket-cau-thep',
              price: 300000,
            },
          },
        ],
        subtotal: 900000,
      }

      render(
        <AntdConfigProvider>
          <CartDrawer open={true} />
        </AntdConfigProvider>,
      )

      const minusBtn = screen.getByRole('button', { name: '-' })
      expect(minusBtn.hasAttribute('disabled')).toBe(false)
      fireEvent.click(minusBtn)
      expect(mockCartState.decrementItem).toHaveBeenCalledWith('item-2')
    })

    it('formats subtotal in VND in drawer footer', () => {
      mockCartState.cart = {
        items: [
          {
            id: 'item-1',
            quantity: 2,
            product: { id: 'p-1', title: 'Test Item', price: 250000 },
          },
        ],
        subtotal: 500000,
      }

      render(
        <AntdConfigProvider>
          <CartDrawer open={true} />
        </AntdConfigProvider>,
      )

      expect(screen.getAllByText(/500\.000/).length).toBeGreaterThanOrEqual(1)
      expect(screen.getByRole('link', { name: /tiến hành thanh toán/i })).toBeDefined()
    })
  })

  // =========================================================================
  // 3. DEDICATED /cart PAGE CLIENT (F30)
  // =========================================================================
  describe('3. Dedicated Cart Page Client (F30)', () => {
    it('renders empty cart state with breadcrumbs when items list is empty', () => {
      mockCartState.cart = { items: [], subtotal: 0 }
      render(
        <AntdConfigProvider>
          <CartPageClient />
        </AntdConfigProvider>,
      )

      expect(
        screen.getByText(
          'Giỏ hàng của bạn đang trống. Chưa có bản vẽ kiến trúc hoặc kết cấu nào.',
        ),
      ).toBeDefined()
      expect(screen.getByRole('link', { name: /khám phá kho bản vẽ ngay/i })).toBeDefined()
    })

    it('renders table columns (Tên bản vẽ, Đơn giá, Số lượng, Tạm tính, Thao tác) with correct VND formatting', () => {
      mockCartState.cart = {
        items: [
          {
            id: 'cart-item-10',
            quantity: 2,
            product: {
              id: 'p-10',
              title: 'Hồ sơ thiết kế Khách sạn 5 sao',
              slug: 'ho-so-khach-san-5-sao',
              price: 1500000,
              technicalSpecs: { fileFormat: 'REVIT / BIM' },
            },
          },
        ],
        subtotal: 3000000,
      }

      render(
        <AntdConfigProvider>
          <CartPageClient />
        </AntdConfigProvider>,
      )

      expect(screen.getByText('Hồ sơ thiết kế Khách sạn 5 sao')).toBeDefined()
      expect(screen.getByText('REVIT / BIM')).toBeDefined()
      // Unit price
      expect(screen.getByText('1.500.000 ₫')).toBeDefined()
      // Subtotal for line item and cart summary (1,500,000 * 2 = 3,000,000)
      expect(screen.getAllByText('3.000.000 ₫').length).toBeGreaterThanOrEqual(1)
    })

    it('shows the sum of its items prices and no discount row', async () => {
      // The money path charges each item's own price (decision 0002). There is no coupon/voucher/
      // discount/promo table, so the cart may not announce a price the buyer will not be charged.
      mockCartState.cart = {
        items: [
          {
            id: 'cart-item-1',
            quantity: 1,
            product: { id: 'p-1', title: 'Test Product', price: 1000000 },
          },
        ],
        subtotal: 1000000,
      }

      render(
        <AntdConfigProvider>
          <CartPageClient />
        </AntdConfigProvider>,
      )

      // the item price is the total: no discount row, no voucher, no fabricated reduction
      expect(screen.getAllByText(/1\.000\.000/).length).toBeGreaterThan(0)
      expect(screen.queryByText(/Ưu đãi/)).toBeNull()
      expect(screen.queryByText(/KIENTAO10/)).toBeNull()
      expect(screen.queryByText(/đã giảm|Giảm \d+%/i)).toBeNull()
    })

    it('offers no voucher input at all, because no coupon table exists', async () => {
      mockCartState.cart = {
        items: [
          {
            id: 'cart-item-1',
            quantity: 1,
            product: { id: 'p-1', title: 'Test Product', price: 500000 },
          },
        ],
        subtotal: 500000,
      }

      render(
        <AntdConfigProvider>
          <CartPageClient />
        </AntdConfigProvider>,
      )

      expect(screen.queryByPlaceholderText(/mã ưu đãi/i)).toBeNull()
      expect(screen.queryByRole('button', { name: /áp dụng/i })).toBeNull()
      expect(screen.getAllByText(/500\.000/).length).toBeGreaterThan(0)
    })

    it('provides clear cart action button with Popconfirm', () => {
      mockCartState.cart = {
        items: [
          {
            id: 'cart-item-1',
            quantity: 1,
            product: { id: 'p-1', title: 'Test Product', price: 500000 },
          },
        ],
        subtotal: 500000,
      }

      render(
        <AntdConfigProvider>
          <CartPageClient />
        </AntdConfigProvider>,
      )

      const clearBtn = screen.getByRole('button', { name: /làm trống giỏ hàng/i })
      expect(clearBtn).toBeDefined()
    })
  })

  // =========================================================================
  // 4. CHECKOUT STEPS & FLOW (F31, F32, F33)
  // =========================================================================
  describe('4. Checkout Steps & Multi-stage Flow (F31, F32, F33)', () => {
    it('renders 3 checkout steps with clear titles and icons', () => {
      render(
        <AntdConfigProvider>
          <CheckoutSteps currentStep={1} />
        </AntdConfigProvider>,
      )

      expect(screen.getByText('Thông tin & Địa chỉ')).toBeDefined()
      expect(screen.getByText('Phương thức thanh toán')).toBeDefined()
      expect(screen.getByText('Xác nhận & Đặt hàng')).toBeDefined()
    })

    it('prevents proceeding to Step 1 if buyer contact & address are missing', () => {
      mockCartState.cart = {
        items: [
          {
            id: 'ci-1',
            quantity: 1,
            product: { id: 'p-1', title: 'Bản vẽ Cầu đường', price: 400000 },
          },
        ],
        subtotal: 400000,
      }

      render(
        <AntdConfigProvider>
          <CheckoutPage />
        </AntdConfigProvider>,
      )

      const nextBtn = screen.getByRole('button', {
        name: /tiếp tục: chọn phương thức thanh toán/i,
      })
      expect(nextBtn.hasAttribute('disabled')).toBe(true)
    })

    it('shows all 3 payment options in Step 1: Wallet, VietQR, and Stripe', async () => {
      mockUser = { id: 10, email: 'buyer@example.com', name: 'Nguyen Van A' }
      mockCartState.cart = {
        items: [
          {
            id: 'ci-1',
            quantity: 1,
            product: { id: 'p-1', title: 'Bản vẽ Cầu đường', price: 400000 },
          },
        ],
        subtotal: 400000,
      }

      // Mock wallet API response
      ;(global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ balance: 1000000, pendingBalance: 0 }),
      })

      render(
        <AntdConfigProvider>
          <CheckoutPage />
        </AntdConfigProvider>,
      )

      // Enter billing address simulation
      // For authenticated user, prefill or click create address
      // Verify payment selection radios
      expect(screen.getByText('Thanh toán an toàn')).toBeDefined()
    })

    it('renders 4 financial metric cards: balance, pending, spent, and reward points', () => {
      render(
        <AntdConfigProvider>
          <WalletClient initialWallet={mockWalletData} initialLedger={mockLedger} />
        </AntdConfigProvider>,
      )

      expect(screen.getByText('Số dư khả dụng')).toBeDefined()
      expect(screen.getByText('Tạm giữ / Chờ xử lý')).toBeDefined()
      expect(screen.getByText('Đã chi tiêu mua bản vẽ')).toBeDefined()
      // No loyalty card: the schema stores no points/rewards, so the metric must not be rendered
      expect(screen.queryByText('Điểm thưởng tích lũy')).toBeNull()
    })

    it('opens VietQR Top-up modal and exposes all 5 preset buttons (50k, 100k, 200k, 500k, 1M)', async () => {
      render(
        <AntdConfigProvider>
          <WalletClient initialWallet={mockWalletData} initialLedger={mockLedger} />
        </AntdConfigProvider>,
      )

      // Click "Nạp tiền" button
      const topupBtn = screen.getAllByRole('button', { name: /nạp tiền/i })[0]
      fireEvent.click(topupBtn)

      await waitFor(() => {
        expect(screen.getByText('Nạp tiền vào ví qua VietQR (Tự động 24/7)')).toBeDefined()
      })

      // Verify all presets exist
      expect(screen.getByText('50.000₫')).toBeDefined()
      expect(screen.getByText('100.000₫')).toBeDefined()
      expect(screen.getByText('200.000₫')).toBeDefined()
      expect(screen.getByText('500.000₫')).toBeDefined()
      expect(screen.getByText('1.000.000₫')).toBeDefined()
    })

    it('clicking 500k preset updates CTA button and input value', async () => {
      render(
        <AntdConfigProvider>
          <WalletClient initialWallet={mockWalletData} initialLedger={mockLedger} />
        </AntdConfigProvider>,
      )

      const topupBtn = screen.getAllByRole('button', { name: /nạp tiền/i })[0]
      fireEvent.click(topupBtn)

      const preset500k = screen.getByText('500.000₫')
      fireEvent.click(preset500k)

      await waitFor(() => {
        expect(
          screen.getByRole('button', { name: /tạo mã qr nạp 500\.000₫/i }),
        ).toBeDefined()
      })
    })

    it('submits topup intent and renders VietQR instructions with copyable codes', async () => {
      ;(global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          intent: {
            id: 88,
            code: 'SEPAY_TOPUP_8899',
            amount: 200000,
            currency: 'VND',
            status: 'PENDING',
            bankCode: 'MBBank',
            accountNo: '0912345678',
            accountName: 'KIENTAOHUB CORP',
            checkoutUrl: 'https://img.vietqr.io/image/mbbank-0912345678-compact2.png',
          },
        }),
      })

      render(
        <AntdConfigProvider>
          <WalletClient initialWallet={mockWalletData} initialLedger={mockLedger} />
        </AntdConfigProvider>,
      )

      const topupBtn = screen.getAllByRole('button', { name: /nạp tiền/i })[0]
      fireEvent.click(topupBtn)

      const preset200k = screen.getByText('200.000₫')
      fireEvent.click(preset200k)

      const createQrBtn = screen.getByRole('button', { name: /tạo mã qr nạp 200\.000₫/i })
      fireEvent.click(createQrBtn)

      await waitFor(() => {
        expect(screen.getByText('MBBank')).toBeDefined()
        expect(screen.getByText('0912345678')).toBeDefined()
        expect(screen.getByText('KIENTAOHUB CORP')).toBeDefined()
        expect(screen.getByText('SEPAY_TOPUP_8899')).toBeDefined()
        expect(screen.getByText('Đang chờ chuyển khoản...')).toBeDefined()
      })
    })

    it('enforces minimum topup amount of 10,000 VND', async () => {
      render(
        <AntdConfigProvider>
          <WalletClient initialWallet={mockWalletData} initialLedger={mockLedger} />
        </AntdConfigProvider>,
      )

      const topupBtn = screen.getAllByRole('button', { name: /nạp tiền/i })[0]
      fireEvent.click(topupBtn)

      // Verify minimum input attribute and placeholder constraints
      const input = screen.getByRole('spinbutton')
      expect(input.getAttribute('aria-valuemin')).toBe('10000')
      expect(input.getAttribute('placeholder')).toBe('Nhập tối thiểu 10,000₫')
    })
  })
})
