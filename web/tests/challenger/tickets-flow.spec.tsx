import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'
import { OrderDisputeModal } from '@/components/dispute/OrderDisputeModal'
import { OrderTicketsSection } from '@/components/dispute/OrderTicketsSection'

// Mock sonner
const { mockToast } = vi.hoisted(() => ({
  mockToast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}))

vi.mock('sonner', () => ({
  toast: mockToast,
}))

describe('Storefront Order Dispute & Support Tickets Challenger Suite (R3, FLOW-U09, FR-23)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    global.fetch = vi.fn()
  })

  afterEach(() => {
    cleanup()
  })

  describe('OrderDisputeModal Storefront Component', () => {
    it('renders the "Báo lỗi / Khiếu nại" trigger button', () => {
      render(
        <OrderDisputeModal
          orderId={1001}
          orderCode="ORD-2026-001"
          products={[{ id: 201, title: 'Bản vẽ kiến trúc Villa' }]}
        />,
      )

      const triggerBtn = screen.getByRole('button', { name: /báo lỗi \/ khiếu nại/i })
      expect(triggerBtn).toBeDefined()
    })

    it('opens modal dialog when trigger button is clicked', async () => {
      render(
        <OrderDisputeModal
          orderId={1001}
          orderCode="ORD-2026-001"
          products={[{ id: 201, title: 'Bản vẽ kiến trúc Villa' }]}
        />,
      )

      fireEvent.click(screen.getByRole('button', { name: /báo lỗi \/ khiếu nại/i }))

      await waitFor(() => {
        expect(screen.getByText('Báo lỗi / Khiếu nại đơn hàng')).toBeDefined()
        expect(screen.getByLabelText(/lý do khiếu nại/i)).toBeDefined()
        expect(screen.getByLabelText(/tiêu đề sự cố/i)).toBeDefined()
        expect(screen.getByLabelText(/mô tả chi tiết/i)).toBeDefined()
      })
    })

    it('validates empty subject and displays error alert', async () => {
      render(
        <OrderDisputeModal
          orderId={1001}
          orderCode="ORD-2026-001"
          products={[{ id: 201, title: 'Bản vẽ kiến trúc Villa' }]}
        />,
      )

      fireEvent.click(screen.getByRole('button', { name: /báo lỗi \/ khiếu nại/i }))

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /gửi khiếu nại/i })).toBeDefined()
      })

      // Try submitting with empty fields
      fireEvent.click(screen.getByRole('button', { name: /gửi khiếu nại/i }))

      await waitFor(() => {
        expect(screen.getByRole('alert')).toBeDefined()
        expect(screen.getByText('Vui lòng nhập tiêu đề khiếu nại.')).toBeDefined()
      })
      expect(global.fetch).not.toHaveBeenCalled()
    })

    it('submits valid dispute form and displays success state with ticket code', async () => {
      const onSuccessMock = vi.fn()
      ;(global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          ticket: {
            id: 55,
            code: 'TCK-20260917-ABC123',
            status: 'OPEN',
            subject: 'File không mở được trong 3ds Max',
            description: 'Báo lỗi missing plugin khi import mô hình.',
          },
        }),
      })

      render(
        <OrderDisputeModal
          orderId={1001}
          orderCode="ORD-2026-001"
          products={[{ id: 201, title: 'Bản vẽ kiến trúc Villa' }]}
          onSuccess={onSuccessMock}
        />,
      )

      fireEvent.click(screen.getByRole('button', { name: /báo lỗi \/ khiếu nại/i }))

      await waitFor(() => {
        expect(screen.getByLabelText(/tiêu đề sự cố/i)).toBeDefined()
      })

      fireEvent.change(screen.getByLabelText(/tiêu đề sự cố/i), {
        target: { value: 'File không mở được trong 3ds Max' },
      })
      fireEvent.change(screen.getByLabelText(/mô tả chi tiết/i), {
        target: { value: 'Báo lỗi missing plugin khi import mô hình.' },
      })

      fireEvent.click(screen.getByRole('button', { name: /gửi khiếu nại/i }))

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith('/api/v1/tickets', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            orderId: 1001,
            productId: 201,
            reason: 'FILE_CORRUPTED',
            subject: 'File không mở được trong 3ds Max',
            description: 'Báo lỗi missing plugin khi import mô hình.',
            priority: 'NORMAL',
          }),
        })
        expect(screen.getByText('Đã tạo khiếu nại thành công!')).toBeDefined()
        expect(screen.getByText('TCK-20260917-ABC123')).toBeDefined()
        expect(mockToast.success).toHaveBeenCalled()
        expect(onSuccessMock).toHaveBeenCalled()
      })
    })

    it('renders error alert when API returns 403 Forbidden (dispute someone elses order)', async () => {
      ;(global.fetch as any).mockResolvedValueOnce({
        ok: false,
        json: async () => ({
          error: 'FORBIDDEN',
          message: 'Bạn không có quyền khiếu nại đơn hàng của người khác.',
        }),
      })

      render(
        <OrderDisputeModal
          orderId={9999}
          orderCode="ORD-FORBIDDEN"
          products={[{ id: 201, title: 'Bản vẽ kiến trúc Villa' }]}
        />,
      )

      fireEvent.click(screen.getByRole('button', { name: /báo lỗi \/ khiếu nại/i }))

      await waitFor(() => {
        expect(screen.getByLabelText(/tiêu đề sự cố/i)).toBeDefined()
      })

      fireEvent.change(screen.getByLabelText(/tiêu đề sự cố/i), {
        target: { value: 'Thử nghiệm khiếu nại đơn hàng người khác' },
      })
      fireEvent.change(screen.getByLabelText(/mô tả chi tiết/i), {
        target: { value: 'Chi tiết bất hợp pháp' },
      })

      fireEvent.click(screen.getByRole('button', { name: /gửi khiếu nại/i }))

      await waitFor(() => {
        expect(screen.getByRole('alert')).toBeDefined()
        expect(screen.getByText('Bạn không có quyền khiếu nại đơn hàng của người khác.')).toBeDefined()
      })
    })

    it('requires an explicit product choice for a multi-product order (never guesses the first product)', async () => {
      render(
        <OrderDisputeModal
          orderId={1001}
          orderCode="ORD-2026-MULTI"
          products={[
            { id: 201, title: 'Bản vẽ kiến trúc Villa' },
            { id: 202, title: 'Revit Family Cửa sổ' },
          ]}
        />,
      )

      fireEvent.click(screen.getByRole('button', { name: /báo lỗi \/ khiếu nại/i }))

      await waitFor(() => {
        expect(screen.getByLabelText(/sản phẩm gặp sự cố/i)).toBeDefined()
      })

      fireEvent.change(screen.getByLabelText(/tiêu đề sự cố/i), {
        target: { value: 'Đơn hàng nhiều sản phẩm' },
      })
      fireEvent.change(screen.getByLabelText(/mô tả chi tiết/i), {
        target: { value: 'Cần chọn đúng sản phẩm gặp lỗi.' },
      })

      fireEvent.click(screen.getByRole('button', { name: /gửi khiếu nại/i }))

      await waitFor(() => {
        expect(screen.getByRole('alert')).toBeDefined()
        expect(
          screen.getByText('Vui lòng chọn sản phẩm gặp sự cố trước khi gửi khiếu nại.'),
        ).toBeDefined()
      })
      expect(global.fetch).not.toHaveBeenCalled()
    })

    it('sends the product the user explicitly selected on a multi-product order', async () => {
      ;(global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          ticket: { id: 56, code: 'TCK-20260917-MULTI01', status: 'OPEN' },
        }),
      })

      render(
        <OrderDisputeModal
          orderId={1001}
          orderCode="ORD-2026-MULTI"
          products={[
            { id: 201, title: 'Bản vẽ kiến trúc Villa' },
            { id: 202, title: 'Revit Family Cửa sổ' },
          ]}
        />,
      )

      fireEvent.click(screen.getByRole('button', { name: /báo lỗi \/ khiếu nại/i }))

      await waitFor(() => {
        expect(screen.getByLabelText(/sản phẩm gặp sự cố/i)).toBeDefined()
      })

      fireEvent.change(screen.getByLabelText(/sản phẩm gặp sự cố/i), { target: { value: '202' } })
      fireEvent.change(screen.getByLabelText(/tiêu đề sự cố/i), {
        target: { value: 'Cửa sổ Revit bị lỗi tham số' },
      })
      fireEvent.change(screen.getByLabelText(/mô tả chi tiết/i), {
        target: { value: 'Family bị lỗi khi load vào project.' },
      })

      fireEvent.click(screen.getByRole('button', { name: /gửi khiếu nại/i }))

      await waitFor(() => {
        expect(screen.getByText('Đã tạo khiếu nại thành công!')).toBeDefined()
      })

      const [url, init] = (global.fetch as any).mock.calls[0]
      expect(url).toBe('/api/v1/tickets')
      expect(JSON.parse(init.body).productId).toBe(202)
    })

    it('treats repeated rows of the same product as a single product', async () => {
      ;(global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          ticket: { id: 57, code: 'TCK-20260917-SAME01', status: 'OPEN' },
        }),
      })

      render(
        <OrderDisputeModal
          orderId={1001}
          orderCode="ORD-2026-SAME"
          products={[
            { id: 201, title: 'Bản vẽ kiến trúc Villa' },
            { id: 201, title: 'Bản vẽ kiến trúc Villa' },
          ]}
        />,
      )

      fireEvent.click(screen.getByRole('button', { name: /báo lỗi \/ khiếu nại/i }))

      await waitFor(() => {
        expect(screen.getByLabelText(/tiêu đề sự cố/i)).toBeDefined()
      })
      expect(screen.queryByLabelText(/sản phẩm gặp sự cố/i)).toBeNull()

      fireEvent.change(screen.getByLabelText(/tiêu đề sự cố/i), {
        target: { value: 'Đơn chỉ có một sản phẩm' },
      })
      fireEvent.change(screen.getByLabelText(/mô tả chi tiết/i), {
        target: { value: 'Hai dòng đơn hàng cùng một sản phẩm.' },
      })

      fireEvent.click(screen.getByRole('button', { name: /gửi khiếu nại/i }))

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalled()
      })

      const [, init] = (global.fetch as any).mock.calls[0]
      expect(JSON.parse(init.body).productId).toBe(201)
    })

    it('surfaces the API rejection when the order has multiple products and no product could be chosen', async () => {
      ;(global.fetch as any).mockResolvedValueOnce({
        ok: false,
        json: async () => ({
          error: 'BAD_REQUEST',
          code: 'TICKET_PRODUCT_SELECTION_REQUIRED',
          message:
            'Đơn hàng có nhiều sản phẩm khác nhau. Vui lòng chọn sản phẩm cụ thể (productId) cần khiếu nại trước khi tạo yêu cầu hỗ trợ.',
        }),
      })

      render(<OrderDisputeModal orderId={1001} orderCode="ORD-2026-MULTI" />)

      fireEvent.click(screen.getByRole('button', { name: /báo lỗi \/ khiếu nại/i }))

      await waitFor(() => {
        expect(screen.getByLabelText(/tiêu đề sự cố/i)).toBeDefined()
      })

      fireEvent.change(screen.getByLabelText(/tiêu đề sự cố/i), {
        target: { value: 'Khiếu nại từ danh sách đơn hàng' },
      })
      fireEvent.change(screen.getByLabelText(/mô tả chi tiết/i), {
        target: { value: 'Không chọn được sản phẩm ở màn hình này.' },
      })

      fireEvent.click(screen.getByRole('button', { name: /gửi khiếu nại/i }))

      await waitFor(() => {
        expect(screen.getByRole('alert')).toBeDefined()
        expect(
          screen.getByText(/Vui lòng chọn sản phẩm cụ thể \(productId\) cần khiếu nại/),
        ).toBeDefined()
      })
      expect(mockToast.error).toHaveBeenCalled()
    })

    it('deep-links to the order detail page when the order products are unknown', async () => {
      render(<OrderDisputeModal orderId={1001} orderCode="ORD-2026-MULTI" />)

      fireEvent.click(screen.getByRole('button', { name: /báo lỗi \/ khiếu nại/i }))

      await waitFor(() => {
        expect(screen.getByLabelText(/tiêu đề sự cố/i)).toBeDefined()
      })

      const link = screen.getByRole('link', { name: /mở chi tiết đơn hàng/i })
      expect(link.getAttribute('href')).toBe('/orders/1001')
    })

    it('derives the product selection when the order products arrive after mount', async () => {
      ;(global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          ticket: { id: 58, code: 'TCK-20260917-LATE01', status: 'OPEN' },
        }),
      })

      const { rerender } = render(
        <OrderDisputeModal orderId={1001} orderCode="ORD-2026-SINGLE" products={[]} />,
      )

      // products are loaded asynchronously and only become available later
      rerender(
        <OrderDisputeModal
          orderId={1001}
          orderCode="ORD-2026-SINGLE"
          products={[{ id: 301, title: 'Bản vẽ kết cấu thép' }]}
        />,
      )

      fireEvent.click(screen.getByRole('button', { name: /báo lỗi \/ khiếu nại/i }))

      await waitFor(() => {
        expect(screen.getByText(/Bản vẽ kết cấu thép/)).toBeDefined()
      })

      fireEvent.change(screen.getByLabelText(/tiêu đề sự cố/i), {
        target: { value: 'Sản phẩm nạp muộn' },
      })
      fireEvent.change(screen.getByLabelText(/mô tả chi tiết/i), {
        target: { value: 'Danh sách sản phẩm chỉ có sau khi mount.' },
      })

      fireEvent.click(screen.getByRole('button', { name: /gửi khiếu nại/i }))

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalled()
      })

      const [, init] = (global.fetch as any).mock.calls[0]
      expect(JSON.parse(init.body).productId).toBe(301)
    })
  })

  describe('OrderTicketsSection Conversation & Lifecycle Component', () => {
    const mockTickets: any[] = [
      {
        id: 77,
        code: 'TCK-20260917-XYZ789',
        reason: 'FILE_CORRUPTED',
        subject: 'Lỗi giải nén tệp tin RAR',
        description: 'Tệp tải về báo corrupt archive.',
        status: 'OPEN',
        priority: 'NORMAL',
        createdAt: '2026-09-17T08:00:00Z',
        updatedAt: '2026-09-17T08:00:00Z',
        messages: [
          {
            id: 'm1',
            senderRole: 'buyer',
            message: 'Tệp tải về báo corrupt archive.',
            createdAt: '2026-09-17T08:00:00Z',
          },
        ],
      },
    ]

    it('renders null when there are no tickets for the order', () => {
      const { container } = render(<OrderTicketsSection orderId={1001} initialTickets={[]} />)
      expect(container.firstChild).toBeNull()
    })

    it('renders ticket details, status badge, and conversation thread', () => {
      render(<OrderTicketsSection orderId={1001} initialTickets={mockTickets} />)

      expect(screen.getByText('TCK-20260917-XYZ789')).toBeDefined()
      expect(screen.getByText('Lỗi giải nén tệp tin RAR')).toBeDefined()
      expect(screen.getByText('Mới mở')).toBeDefined()
      expect(screen.getByText('Người mua (Bạn)')).toBeDefined()
      expect(screen.getByText('Tệp tải về báo corrupt archive.')).toBeDefined()
    })

    it('allows posting a new reply to the ticket thread', async () => {
      ;(global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          message: {
            id: 'm2',
            senderRole: 'buyer',
            message: 'Mình đã thử tải lại bằng IDM nhưng vẫn gặp lỗi tương tự.',
            createdAt: '2026-09-17T08:15:00Z',
          },
          ticket: {
            ...mockTickets[0],
            status: 'OPEN',
            messages: [
              ...mockTickets[0].messages,
              {
                id: 'm2',
                senderRole: 'buyer',
                message: 'Mình đã thử tải lại bằng IDM nhưng vẫn gặp lỗi tương tự.',
                createdAt: '2026-09-17T08:15:00Z',
              },
            ],
          },
        }),
      })

      render(<OrderTicketsSection orderId={1001} initialTickets={mockTickets} />)

      const replyInput = screen.getByPlaceholderText(/nhập nội dung phản hồi/i)
      fireEvent.change(replyInput, {
        target: { value: 'Mình đã thử tải lại bằng IDM nhưng vẫn gặp lỗi tương tự.' },
      })

      const sendBtn = screen.getByRole('button', { name: /gửi tin nhắn/i })
      fireEvent.click(sendBtn)

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith('/api/v1/tickets/77/messages', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: 'Mình đã thử tải lại bằng IDM nhưng vẫn gặp lỗi tương tự.' }),
        })
        expect(screen.getByText('Mình đã thử tải lại bằng IDM nhưng vẫn gặp lỗi tương tự.')).toBeDefined()
        expect(mockToast.success).toHaveBeenCalled()
      })
    })

    it('allows closing a ticket and transitions state to CLOSED', async () => {
      ;(global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          ticket: {
            ...mockTickets[0],
            status: 'CLOSED',
          },
        }),
      })

      render(<OrderTicketsSection orderId={1001} initialTickets={mockTickets} />)

      const closeBtn = screen.getByRole('button', { name: /đóng khiếu nại này/i })
      fireEvent.click(closeBtn)

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith('/api/v1/tickets/77', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: 'CLOSED' }),
        })
        expect(screen.getByText('Đã đóng')).toBeDefined()
        expect(screen.getByText(/khiếu nại này đã được đóng/i)).toBeDefined()
        expect(mockToast.success).toHaveBeenCalled()
      })
    })
  })
})
