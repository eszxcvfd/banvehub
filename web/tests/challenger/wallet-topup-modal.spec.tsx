/**
 * web/tests/challenger/wallet-topup-modal.spec.tsx
 *
 * Repair instrument for `t12`: `WalletClient` must keep the top-up modal it had before the fabricated
 * loyalty-points card was removed — not a compile-only shell. This exercises the page the way a buyer
 * does and states what it renders:
 *
 *   1. 'Mở cửa sổ nạp tiền' opens the modal with its top-up content: the VietQR title, the five
 *      preset amounts, the custom amount field and the "Tạo mã QR nạp …" action.
 *   2. The action POSTs `/api/v1/payments/topup` (decision 0004's rail) and the modal then renders the
 *      live intent: the QR image, the bank, account number, account name, the amount and the transfer
 *      reference the buyer must keep.
 *   3. 'Hủy và tạo giao dịch khác' (`handleResetTopup`) drops the intent and returns to the presets.
 *
 * jsdom only: no browser, no dev server, no database.
 */
import React from 'react'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { WalletClient, type WalletData } from '@/components/wallet/WalletClient'
import { AntdConfigProvider } from '@/providers/Antd'

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

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/wallet',
  useSearchParams: () => new URLSearchParams(),
}))

const intent = {
  id: 44,
  code: 'KTHMUAMPFRA382',
  amount: 100000,
  currency: 'VND',
  status: 'PENDING',
  expiresAt: '2026-09-21T03:00:00.000Z',
  checkoutUrl: 'https://img.vietqr.io/image/MB-0987654321-compact2.png?amount=100000&addInfo=KTHMUAMPFRA382',
  bankCode: 'MB',
  accountNo: '0987654321',
  accountName: 'KIENTAOHUB',
}

const wallet: WalletData = {
  id: 16,
  balance: 0,
  pendingBalance: 0,
  currency: 'VND',
  status: 'active',
}

const originalFetch = global.fetch
let calls: string[] = []

const installFetch = () => {
  calls = []
  global.fetch = vi.fn(async (input: unknown, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : String((input as { url?: string })?.url ?? '')
    calls.push(`${(init?.method ?? 'GET').toUpperCase()} ${url}`)

    const body = url.includes('/api/v1/payments/topup') ? { success: true, intent } : { success: true }
    return {
      ok: true,
      status: 200,
      json: async () => body,
      text: async () => JSON.stringify(body),
    } as unknown as Response
  }) as unknown as typeof fetch
}

const renderWallet = () =>
  render(
    <AntdConfigProvider>
      <WalletClient initialWallet={wallet} initialLedger={[]} />
    </AntdConfigProvider>,
  )

const openTopup = () => {
  fireEvent.click(screen.getByRole('button', { name: /mở cửa sổ nạp tiền/i }))
}

describe('t12: the wallet top-up modal still renders its content', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    installFetch()
  })

  afterEach(() => {
    cleanup()
    global.fetch = originalFetch
  })

  it('opens from the top-up button with the presets, the amount field and the action', async () => {
    renderWallet()
    openTopup()

    expect(await screen.findByText('Nạp tiền vào ví qua VietQR (Tự động 24/7)')).toBeDefined()
    expect(screen.getByText('Chọn mệnh giá nạp')).toBeDefined()
    for (const preset of ['50.000₫', '100.000₫', '200.000₫', '500.000₫', '1.000.000₫']) {
      expect(screen.getByText(preset)).toBeDefined()
    }
    expect(screen.getByText('Hoặc nhập số tiền khác')).toBeDefined()
    expect(screen.getByText(/Tạo mã QR nạp/)).toBeDefined()
    expect(screen.getByText(/Quét mã QR từ ứng dụng ngân hàng bất kỳ/)).toBeDefined()
  })

  it('posts the top-up and renders the live intent: QR, bank details, amount and reference', async () => {
    renderWallet()
    openTopup()
    await screen.findByText('Nạp tiền vào ví qua VietQR (Tự động 24/7)')

    fireEvent.click(screen.getByRole('button', { name: /tạo mã qr nạp/i }))

    await waitFor(() =>
      expect(calls.some((call) => call === 'POST /api/v1/payments/topup')).toBe(true),
    )

    // the modal renders what the buyer needs to pay: the QR, the account, the amount and the reference
    await waitFor(() => expect(screen.getByAltText('VietQR Chuyển khoản')).toBeDefined())
    expect(screen.getByAltText('VietQR Chuyển khoản').getAttribute('src')).toBe(intent.checkoutUrl)
    expect(screen.getByText('Ngân hàng')).toBeDefined()
    expect(screen.getByText('MB')).toBeDefined()
    expect(screen.getByText('0987654321')).toBeDefined()
    expect(screen.getByText('KIENTAOHUB')).toBeDefined()
    expect(screen.getByText('100.000₫')).toBeDefined()
    expect(screen.getByText(intent.code)).toBeDefined()
    expect(screen.getByText(/Giữ nguyên nội dung chuyển khoản/)).toBeDefined()
  })

  it('handleResetTopup drops the intent and returns to the presets', async () => {
    renderWallet()
    openTopup()
    await screen.findByText('Nạp tiền vào ví qua VietQR (Tự động 24/7)')
    fireEvent.click(screen.getByRole('button', { name: /tạo mã qr nạp/i }))
    await waitFor(() => expect(screen.getByText(intent.code)).toBeDefined())

    fireEvent.click(screen.getByRole('button', { name: /hủy và tạo giao dịch khác/i }))

    await waitFor(() => expect(screen.queryByText(intent.code)).toBeNull())
    expect(screen.getByText('Chọn mệnh giá nạp')).toBeDefined()
    expect(screen.getByText(/Tạo mã QR nạp/)).toBeDefined()
  })
})
