import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'
import {
  FinanceOperations,
  type AdminOrderWindowItem,
} from '@/app/(app)/finance/FinanceOperations'

/**
 * Decision 0012 in the operator console (component level).
 *
 * The finance console is the only caller of POST /api/v1/admin/refunds, and after decision 0012 that
 * route requires a fault basis and refuses an out-of-window refund without an explicit override.
 * These four behaviours are what must hold in the UI itself:
 *
 *   1. no basis is preselected and the action cannot be submitted without one;
 *   2. an order outside the 5-day window states the policy and requires the override;
 *   3. a route refusal is rendered inside the modal (a message, never a dead button);
 *   4. a window verdict the console does not hold (`inWindow === null`) reads as UNKNOWN, not as
 *      out of policy — the defect the e2e work exposed.
 *
 * jsdom + the repository's own challenger instrument (no browser, no dev server, no fixtures), so
 * the proof does not depend on the shared e2e environment.
 */

const { mockRefresh } = vi.hoisted(() => ({ mockRefresh: vi.fn() }))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: mockRefresh, push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
}))

const element = (id: string) => document.getElementById(id) as HTMLInputElement | null
const required = (id: string) => {
  const found = element(id)
  if (!found) throw new Error(`expected #${id} to be rendered`)
  return found
}
const submitButton = () =>
  screen.getByRole('button', { name: 'Xác nhận hoàn tiền' }) as HTMLButtonElement

const orderRow = (over: Partial<AdminOrderWindowItem> = {}): AdminOrderWindowItem => ({
  id: 101,
  code: 'ORD-REF-CONSOLE-101',
  status: 'COMPLETED',
  totalAmount: 150000,
  paidAt: '2026-09-19T00:00:00.000Z',
  inWindow: true,
  windowClosesAt: '2026-09-24T00:00:00.000Z',
  ...over,
})

const renderConsole = (orders: AdminOrderWindowItem[]) =>
  render(
    <FinanceOperations
      initialWithdrawals={[]}
      initialRefunds={[]}
      initialOrders={orders}
      refundWindowDays={5}
    />,
  )

const openRefundModal = () => {
  fireEvent.click(screen.getByRole('button', { name: /Lịch sử bồi hoàn/i }))
  fireEvent.click(screen.getByRole('button', { name: /Thực hiện hoàn tiền bồi hoàn/i }))
}

const fillForm = (orderId: number, reason = 'File bàn giao lỗi kỹ thuật') => {
  fireEvent.change(required('refundOrderId'), { target: { value: String(orderId) } })
  fireEvent.change(required('refundReason'), { target: { value: reason } })
}

const refundPosts = () =>
  (global.fetch as unknown as { mock: { calls: unknown[][] } }).mock.calls.filter((call) => {
    const [url, init] = call as [string, RequestInit | undefined]
    return String(url).includes('/api/v1/admin/refunds') && init?.method === 'POST'
  })

describe('Decision 0012: the finance console refund action (component level)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ docs: [] }),
    }) as unknown as typeof fetch
  })

  afterEach(() => {
    cleanup()
  })

  it('preselects no fault basis and cannot submit until one is chosen', () => {
    renderConsole([orderRow()])
    openRefundModal()
    fillForm(101)

    expect(required('faultBasisSeller').checked).toBe(false)
    expect(required('faultBasisPlatform').checked).toBe(false)
    expect(submitButton().disabled).toBe(true)
    expect(screen.getByTestId('refund-blocked-reason').textContent).toContain('chọn cơ sở lỗi')

    // Submitting the form directly must not reach the route either: the guard is in the action,
    // not only in the disabled attribute.
    fireEvent.submit(submitButton().closest('form') as HTMLFormElement)
    expect(refundPosts()).toHaveLength(0)

    fireEvent.click(required('faultBasisPlatform'))
    expect(submitButton().disabled).toBe(false)
    fireEvent.click(submitButton())

    return waitFor(() => expect(refundPosts()).toHaveLength(1)).then(() => {
      const body = JSON.parse((refundPosts()[0][1] as RequestInit).body as string)
      expect(body.faultBasis).toBe('PLATFORM')
      expect(body.overrideWindow).toBeUndefined()
    })
  })

  it('states the out-of-policy window and requires the override before submitting', () => {
    renderConsole([orderRow({ id: 202, inWindow: false })])
    openRefundModal()
    fillForm(202)

    const panel = screen.getByTestId('refund-window-status')
    expect(panel.textContent).toContain('Ngoài cửa sổ 5 ngày')
    expect(panel.textContent).toContain('ngoài chính sách')
    expect(required('overrideWindow')).toBeTruthy()

    fireEvent.click(required('faultBasisSeller'))
    expect(submitButton().disabled).toBe(true)
    expect(screen.getByTestId('refund-blocked-reason').textContent).toContain(
      'cần bật xác nhận ghi đè',
    )

    fireEvent.click(required('overrideWindow'))
    expect(required('overrideWindow').checked).toBe(true)
    expect(submitButton().disabled).toBe(false)
    fireEvent.click(submitButton())

    return waitFor(() => expect(refundPosts()).toHaveLength(1)).then(() => {
      const body = JSON.parse((refundPosts()[0][1] as RequestInit).body as string)
      expect(body.faultBasis).toBe('SELLER')
      expect(body.overrideWindow).toBe(true)
    })
  })

  it('renders a route refusal inside the modal and turns it into a usable retry', async () => {
    renderConsole([orderRow({ id: 303, inWindow: true })])
    openRefundModal()
    fillForm(303)
    fireEvent.click(required('faultBasisSeller'))

    // The console believed the order was in policy; the route disagrees and says why.
    ;(global.fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: false,
      status: 400,
      json: async () => ({
        error: 'BAD_REQUEST',
        message:
          'Refund is out of the 5-day window (paid at 2026-09-14T00:00:00.000Z, window closed at 2026-09-19T00:00:00.000Z); pass overrideWindow to refund it out of policy',
      }),
    })

    fireEvent.click(submitButton())

    await waitFor(() => {
      expect(screen.getByTestId('refund-error').textContent).toContain('window')
    })
    // The refusal reveals the override, so the operator can act instead of staring at a dead button.
    expect(required('overrideWindow')).toBeTruthy()

    ;(global.fetch as unknown as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ success: true }) })
      .mockResolvedValue({ ok: true, status: 200, json: async () => ({ docs: [] }) })

    fireEvent.click(required('overrideWindow'))
    fireEvent.click(submitButton())

    await waitFor(() => {
      expect(screen.getByText(/Đã thực hiện bồi hoàn đơn hàng/)).toBeTruthy()
    })

    const retry = refundPosts()[refundPosts().length - 1]
    const retryBody = JSON.parse((retry[1] as RequestInit).body as string)
    expect(retryBody.overrideWindow).toBe(true)
    expect(retryBody.faultBasis).toBe('SELLER')
  })

  it('renders an unjudged window verdict as unknown, not as out of policy', () => {
    renderConsole([orderRow({ id: 404, inWindow: null, paidAt: null, windowClosesAt: null })])
    openRefundModal()
    fillForm(404)

    const panel = screen.getByTestId('refund-window-status')
    expect(panel.textContent).toContain('Chưa xác định được cửa sổ 5 ngày')
    expect(panel.textContent).not.toContain('Ngoài cửa sổ')

    // The route is the authority for a verdict the console does not hold, so no override is forced.
    fireEvent.click(required('faultBasisSeller'))
    expect(element('overrideWindow')).toBeNull()
    expect(submitButton().disabled).toBe(false)
  })
})
