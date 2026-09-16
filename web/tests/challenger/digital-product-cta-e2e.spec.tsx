import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'
import { DigitalProductCTA } from '@/components/product/DigitalProductCTA'

// Mock useAuth
const mockUseAuth = vi.fn()
vi.mock('@/providers/Auth', () => ({
  useAuth: () => mockUseAuth(),
}))

// Mock next/navigation
vi.mock('next/navigation', () => ({
  usePathname: () => '/products/test-product',
  useRouter: () => ({ push: vi.fn() }),
}))

// Mock sonner
vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}))

describe('DigitalProductCTA Storefront Purchase & Download Suite', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    global.fetch = vi.fn()
  })

  afterEach(() => {
    cleanup()
  })

  it('R1 & R3: renders free product button "Tải xuống ngay (Miễn phí)"', () => {
    mockUseAuth.mockReturnValue({ user: null, status: 'loggedOut' })

    render(
      <DigitalProductCTA
        productId={10}
        sellerId={99}
        isFree={true}
        price={0}
        productTitle="Free CAD Drawing"
      />
    )

    expect(screen.getByText('Tải xuống ngay (Miễn phí)')).toBeDefined()
    expect(screen.getAllByText('Miễn phí').length).toBeGreaterThan(0)
  })

  it('R1: renders commercial product button "Mua ngay" for unowned item', () => {
    mockUseAuth.mockReturnValue({
      user: { id: 1, email: 'buyer@example.com' },
      status: 'loggedIn',
    })

    // Mock entitlement query returning hasEntitlement: false
    ;(global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true, hasEntitlement: false }),
    })

    render(
      <DigitalProductCTA
        productId={10}
        sellerId={99}
        isFree={false}
        price={250000}
        productTitle="Commercial 3D Villa"
      />
    )

    expect(screen.getByText(/Mua ngay — 250.000\s*₫/)).toBeDefined()
    expect(screen.getByText('Bản quyền thương mại')).toBeDefined()
  })

  it('R1: renders "Sản phẩm của bạn" and disables purchase if current user is seller', () => {
    mockUseAuth.mockReturnValue({
      user: { id: 99, email: 'seller@example.com' },
      status: 'loggedIn',
    })

    render(
      <DigitalProductCTA
        productId={10}
        sellerId={99}
        isFree={false}
        price={250000}
        productTitle="Commercial 3D Villa"
      />
    )

    const sellerBtn = screen.getByRole('button', { name: /Sản phẩm của bạn/ })
    expect(sellerBtn).toBeDefined()
    expect((sellerBtn as HTMLButtonElement).disabled).toBe(true)
    expect(
      screen.getByText(/Bạn là tác giả của sản phẩm này. Bạn không thể tự mua sản phẩm của chính mình./)
    ).toBeDefined()
  })

  it('R1: renders "Tải xuống ngay" immediately when user owns active entitlement', async () => {
    mockUseAuth.mockReturnValue({
      user: { id: 1, email: 'buyer@example.com' },
      status: 'loggedIn',
    })

    // Mock entitlement query returning hasEntitlement: true
    ;(global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true, hasEntitlement: true }),
    })

    render(
      <DigitalProductCTA
        productId={10}
        sellerId={99}
        isFree={false}
        price={250000}
        productTitle="Commercial 3D Villa"
      />
    )

    await waitFor(() => {
      expect(screen.getByText('Tải xuống ngay')).toBeDefined()
      expect(screen.getByText('Đã sở hữu')).toBeDefined()
    })
  })

  it('R4: opens Login Modal when guest clicks "Mua ngay"', () => {
    mockUseAuth.mockReturnValue({ user: null, status: 'loggedOut' })

    render(
      <DigitalProductCTA
        productId={10}
        sellerId={99}
        isFree={false}
        price={150000}
        productTitle="Commercial Blueprint"
      />
    )

    const buyBtn = screen.getByRole('button', { name: /Mua ngay/ })
    fireEvent.click(buyBtn)

    expect(screen.getByText('Yêu cầu đăng nhập')).toBeDefined()
    expect(screen.getByText('Đăng nhập ngay')).toBeDefined()
  })

  it('R4: opens Insufficient Funds Modal when purchase returns INSUFFICIENT_FUNDS', async () => {
    mockUseAuth.mockReturnValue({
      user: { id: 1, email: 'buyer@example.com' },
      status: 'loggedIn',
    })

    // Entitlement check: false
    ;(global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true, hasEntitlement: false }),
    })

    // Purchase request: INSUFFICIENT_FUNDS
    ;(global.fetch as any).mockResolvedValueOnce({
      ok: false,
      status: 400,
      json: async () => ({
        error: 'INSUFFICIENT_FUNDS',
        message: 'Số dư ví không đủ',
        required: 200000,
        balance: 50000,
      }),
    })

    render(
      <DigitalProductCTA
        productId={10}
        sellerId={99}
        isFree={false}
        price={200000}
        productTitle="Commercial Blueprint"
      />
    )

    const buyBtn = screen.getByRole('button', { name: /Mua ngay/ })
    fireEvent.click(buyBtn)

    await waitFor(() => {
      expect(screen.getByText('Số dư ví không đủ')).toBeDefined()
      expect(screen.getByText(/150.000\s*₫/)).toBeDefined() // shortfall = 200000 - 50000 = 150000
      expect(screen.getByText('Nạp tiền vào ví')).toBeDefined()
    })
  })

  it('R2: transitions button to "Tải xuống ngay" upon successful purchase', async () => {
    mockUseAuth.mockReturnValue({
      user: { id: 1, email: 'buyer@example.com' },
      status: 'loggedIn',
    })

    // Entitlement check: false
    ;(global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true, hasEntitlement: false }),
    })

    // Purchase request: success
    ;(global.fetch as any).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        success: true,
        orderId: 'ORD-123',
        entitlementId: 456,
      }),
    })

    // Auto-trigger download token request: success
    ;(global.fetch as any).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        success: true,
        data: {
          token: 'jwt-token-123',
          downloadUrl: '/api/v1/downloads/jwt-token-123',
        },
      }),
    })

    render(
      <DigitalProductCTA
        productId={10}
        sellerId={99}
        isFree={false}
        price={100000}
        productTitle="Commercial Blueprint"
      />
    )

    const buyBtn = screen.getByRole('button', { name: /Mua ngay/ })
    fireEvent.click(buyBtn)

    await waitFor(() => {
      expect(screen.getByText('Tải xuống ngay')).toBeDefined()
      expect(screen.getByText('Đã sở hữu')).toBeDefined()
    })
  })

  it('R1 Adversarial: resets owned state when productId changes during navigation', async () => {
    mockUseAuth.mockReturnValue({
      user: { id: 1, email: 'buyer@example.com' },
      status: 'loggedIn',
    })

    // Product 10: hasEntitlement: true
    ;(global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true, hasEntitlement: true }),
    })

    const { rerender } = render(
      <DigitalProductCTA
        productId={10}
        sellerId={99}
        isFree={false}
        price={100000}
        productTitle="Owned Villa"
      />
    )

    await waitFor(() => {
      expect(screen.getByText('Tải xuống ngay')).toBeDefined()
      expect(screen.getByText('Đã sở hữu')).toBeDefined()
    })

    // Navigate to Product 11: hasEntitlement: false
    ;(global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true, hasEntitlement: false }),
    })

    rerender(
      <DigitalProductCTA
        productId={11}
        sellerId={99}
        isFree={false}
        price={150000}
        productTitle="Unowned Tower"
      />
    )

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Mua ngay — 150\.000\s*₫/ })).toBeDefined()
      expect(screen.queryByText('Đã sở hữu')).toBeNull()
    })
  })

  it('R1 Adversarial: unauthenticated guest never inherits owned state', async () => {
    // User is logged out
    mockUseAuth.mockReturnValue({
      user: null,
      status: 'loggedOut',
    })

    render(
      <DigitalProductCTA
        productId={10}
        sellerId={99}
        isFree={false}
        price={200000}
        productTitle="Commercial Tower"
      />
    )

    expect(screen.getByRole('button', { name: /Mua ngay — 200\.000\s*₫/ })).toBeDefined()
    expect(screen.queryByText('Đã sở hữu')).toBeNull()
    expect(screen.queryByText('Tải xuống ngay')).toBeNull()
  })

  it('R3 & R4: clicking free product download as guest opens Login Modal', () => {
    mockUseAuth.mockReturnValue({ user: null, status: 'loggedOut' })

    render(
      <DigitalProductCTA
        productId={10}
        sellerId={99}
        isFree={true}
        price={0}
        productTitle="Free Architectural Spec"
      />
    )

    const downloadBtn = screen.getByRole('button', { name: /Tải xuống ngay \(Miễn phí\)/ })
    fireEvent.click(downloadBtn)

    expect(screen.getByText('Yêu cầu đăng nhập')).toBeDefined()
    expect(screen.getByText(/tải xuống tài nguyên miễn phí/)).toBeDefined()
  })

  it('R1: prevents self-purchase when sellerId is passed as string', () => {
    mockUseAuth.mockReturnValue({
      user: { id: 42, email: 'architect@example.com' },
      status: 'loggedIn',
    })

    render(
      <DigitalProductCTA
        productId={10}
        sellerId="42"
        isFree={false}
        price={500000}
        productTitle="My Own Masterpiece"
      />
    )

    const sellerBtn = screen.getByRole('button', { name: /Sản phẩm của bạn/ })
    expect(sellerBtn).toBeDefined()
    expect((sellerBtn as HTMLButtonElement).disabled).toBe(true)
  })

  it('R2: prevents duplicate concurrent requests on rapid double-clicks', async () => {
    mockUseAuth.mockReturnValue({
      user: { id: 1, email: 'buyer@example.com' },
      status: 'loggedIn',
    })

    // Entitlement query
    ;(global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true, hasEntitlement: false }),
    })

    // Simulated slow purchase response
    let resolvePurchase: any
    const purchasePromise = new Promise((resolve) => {
      resolvePurchase = resolve
    })
    ;(global.fetch as any).mockImplementationOnce(() => purchasePromise)

    render(
      <DigitalProductCTA
        productId={10}
        sellerId={99}
        isFree={false}
        price={100000}
        productTitle="Commercial Blueprint"
      />
    )

    const buyBtn = screen.getByRole('button', { name: /Mua ngay/ })
    fireEvent.click(buyBtn)
    fireEvent.click(buyBtn) // rapid second click

    // Only 1 purchase fetch call should have been dispatched (alongside initial entitlement fetch)
    const purchaseCalls = (global.fetch as any).mock.calls.filter((call: any[]) =>
      call[0] === '/api/v1/orders/purchase'
    )
    expect(purchaseCalls.length).toBe(1)

    // Complete purchase
    resolvePurchase({
      ok: true,
      status: 200,
      json: async () => ({ success: true, orderId: 'ORD-1', entitlementId: 1 }),
    })
  })

  it('R1 Adversarial: user switch in same tab prevents User 2 from inheriting User 1 ownership', async () => {
    // User 1 owns Product 10
    mockUseAuth.mockReturnValue({
      user: { id: 1, email: 'user1@example.com' },
      status: 'loggedIn',
    })

    ;(global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true, hasEntitlement: true }),
    })

    const { rerender } = render(
      <DigitalProductCTA
        productId={10}
        sellerId={99}
        isFree={false}
        price={200000}
        productTitle="Shared Workstation"
      />
    )

    await waitFor(() => {
      expect(screen.getByText('Tải xuống ngay')).toBeDefined()
      expect(screen.getByText('Đã sở hữu')).toBeDefined()
    })

    // User 1 logs out and User 2 logs in (same tab)
    mockUseAuth.mockReturnValue({
      user: { id: 2, email: 'user2@example.com' },
      status: 'loggedIn',
    })

    // User 2 does NOT own Product 10
    ;(global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true, hasEntitlement: false }),
    })

    rerender(
      <DigitalProductCTA
        productId={10}
        sellerId={99}
        isFree={false}
        price={200000}
        productTitle="Shared Workstation"
      />
    )

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Mua ngay — 200\.000\s*₫/ })).toBeDefined()
      expect(screen.queryByText('Đã sở hữu')).toBeNull()
      expect(screen.queryByText('Tải xuống ngay')).toBeNull()
    })
  })

  it('R4 Adversarial: insufficient funds modal allows direct retry via "Đã nạp tiền, thử lại"', async () => {
    mockUseAuth.mockReturnValue({
      user: { id: 1, email: 'buyer@example.com' },
      status: 'loggedIn',
    })

    // Initial entitlement check: false
    ;(global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true, hasEntitlement: false }),
    })

    // First purchase attempt: INSUFFICIENT_FUNDS
    ;(global.fetch as any).mockResolvedValueOnce({
      ok: false,
      status: 400,
      json: async () => ({
        error: 'INSUFFICIENT_FUNDS',
        message: 'Số dư ví không đủ',
        required: 100000,
        balance: 20000,
      }),
    })

    render(
      <DigitalProductCTA
        productId={10}
        sellerId={99}
        isFree={false}
        price={100000}
        productTitle="Commercial Asset"
      />
    )

    const buyBtn = screen.getByRole('button', { name: /Mua ngay/ })
    fireEvent.click(buyBtn)

    await waitFor(() => {
      expect(screen.getByText('Số dư ví không đủ')).toBeDefined()
      expect(screen.getByText('Đã nạp tiền, thử lại')).toBeDefined()
    })

    // Second purchase attempt (after topup): SUCCESS
    ;(global.fetch as any).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        success: true,
        orderId: 'ORD-999',
        entitlementId: 888,
      }),
    })

    // Download token generation for auto-download: SUCCESS
    ;(global.fetch as any).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        success: true,
        data: { downloadUrl: '/api/v1/downloads/token-abc' },
      }),
    })

    const retryBtn = screen.getByRole('button', { name: /Đã nạp tiền, thử lại/ })
    fireEvent.click(retryBtn)

    await waitFor(() => {
      expect(screen.getByText('Tải xuống ngay')).toBeDefined()
      expect(screen.getByText('Đã sở hữu')).toBeDefined()
      expect(screen.queryByText('Số dư ví không đủ')).toBeNull()
    })
  })

  it('R1 & Robustness: renders without crashing when price is null or zero', () => {
    mockUseAuth.mockReturnValue({ user: null, status: 'loggedOut' })

    render(
      <DigitalProductCTA
        productId={10}
        sellerId={99}
        isFree={null}
        price={null as any}
        productTitle="Null Price Asset"
      />
    )

    expect(screen.getByText('Tải xuống ngay (Miễn phí)')).toBeDefined()
  })

  it('R1 & Robustness: fallback alert handles unpopulated productId with null price gracefully', () => {
    mockUseAuth.mockReturnValue({ user: null, status: 'loggedOut' })
    const alertMock = vi.spyOn(window, 'alert').mockImplementation(() => {})

    render(
      <DigitalProductCTA
        productId={undefined}
        isFree={false}
        price={null as any}
        productTitle="Missing ID Asset"
      />
    )

    // Since isFree is false and price is null (fallback numericPrice = 0), free is true
    const btn = screen.getByRole('button', { name: /Tải xuống ngay \(Miễn phí\)/i })
    fireEvent.click(btn)

    expect(alertMock).toHaveBeenCalledWith('Đang chuẩn bị tệp tải xuống: Missing ID Asset')
    alertMock.mockRestore()
  })

  it('R2 Cross-Tab: BroadcastChannel message synchronizes purchase state across tabs in real-time', async () => {
    mockUseAuth.mockReturnValue({
      user: { id: 1, email: 'buyer@example.com' },
      status: 'loggedIn',
    })

    // Entitlement initial check: false
    ;(global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true, hasEntitlement: false }),
    })

    // Mock BroadcastChannel in jsdom
    let broadcastHandler: ((e: any) => void) | null = null
    class MockBroadcastChannel {
      name: string
      constructor(name: string) {
        this.name = name
      }
      set onmessage(handler: (e: any) => void) {
        broadcastHandler = handler
      }
      postMessage(msg: any) {
        if (broadcastHandler) {
          broadcastHandler({ data: msg })
        }
      }
      close() {}
    }
    const origBroadcastChannel = (window as any).BroadcastChannel
    ;(window as any).BroadcastChannel = MockBroadcastChannel

    try {
      render(
        <DigitalProductCTA
          productId={10}
          sellerId={99}
          isFree={false}
          price={200000}
          productTitle="Multi-Tab Asset"
        />
      )

      expect(screen.getByRole('button', { name: /Mua ngay — 200\.000\s*₫/ })).toBeDefined()

      // Simulate Tab A broadcasting purchase completion
      if (broadcastHandler) {
        ;(broadcastHandler as any)({
          data: {
            type: 'PURCHASE_COMPLETED',
            productId: 10,
            userId: 1,
          },
        })
      }

      await waitFor(() => {
        expect(screen.getByText('Tải xuống ngay')).toBeDefined()
        expect(screen.getByText('Đã sở hữu')).toBeDefined()
      })
    } finally {
      ;(window as any).BroadcastChannel = origBroadcastChannel
    }
  })

  it('R2 Cross-Tab: window focus revalidates entitlement when user switches to tab', async () => {
    mockUseAuth.mockReturnValue({
      user: { id: 1, email: 'buyer@example.com' },
      status: 'loggedIn',
    })

    // Entitlement initial check: false
    ;(global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true, hasEntitlement: false }),
    })

    render(
      <DigitalProductCTA
        productId={10}
        sellerId={99}
        isFree={false}
        price={200000}
        productTitle="Multi-Tab Focus Asset"
      />
    )

    expect(screen.getByRole('button', { name: /Mua ngay — 200\.000\s*₫/ })).toBeDefined()

    // Next fetch on tab focus returns hasEntitlement: true
    ;(global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true, hasEntitlement: true }),
    })

    // Simulate switching to tab (focus event)
    Object.defineProperty(document, 'visibilityState', {
      value: 'visible',
      configurable: true,
    })
    window.dispatchEvent(new Event('focus'))

    await waitFor(() => {
      expect(screen.getByText('Tải xuống ngay')).toBeDefined()
      expect(screen.getByText('Đã sở hữu')).toBeDefined()
    })
  })
})
