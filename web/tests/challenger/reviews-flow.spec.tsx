import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'
import { ProductReviewsSection } from '@/components/product/ProductReviewsSection'

// Mock useAuth
const mockUseAuth = vi.fn()
vi.mock('@/providers/Auth', () => ({
  useAuth: () => mockUseAuth(),
}))

// Mock next/navigation
vi.mock('next/navigation', () => ({
  usePathname: () => '/products/cad-villa-drawing',
  useRouter: () => ({ push: vi.fn() }),
}))

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

describe('ProductReviewsSection Storefront Reviews & Ratings Suite (R3, FR-20, BR-05)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    global.fetch = vi.fn()
  })

  afterEach(() => {
    cleanup()
  })

  it('R3: renders empty reviews state when product has 0 reviews', async () => {
    mockUseAuth.mockReturnValue({ user: null })
    ;(global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        success: true,
        summary: {
          averageRating: 0,
          totalCount: 0,
          distribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
        },
        reviews: [],
        pagination: { page: 1, limit: 6, totalPages: 1, totalDocs: 0 },
        canReview: false,
      }),
    })

    render(<ProductReviewsSection productId={101} productTitle="Bản vẽ biệt thự hiện đại" />)

    await waitFor(() => {
      expect(screen.getByText('Đánh giá & Nhận xét')).toBeDefined()
      expect(screen.getByText('Chưa có đánh giá nào')).toBeDefined()
    })
  })

  it('R3: renders summary statistics, 5-bar distribution, and verified badges', async () => {
    mockUseAuth.mockReturnValue({ user: null })
    ;(global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        success: true,
        summary: {
          averageRating: 4.5,
          totalCount: 2,
          distribution: { 1: 0, 2: 0, 3: 0, 4: 1, 5: 1 },
        },
        reviews: [
          {
            id: 1,
            rating: 5,
            title: 'File CAD rất chuẩn',
            content: 'Bản vẽ chi tiết, đầy đủ mặt cắt và mặt đứng.',
            createdAt: '2026-09-17T00:00:00.000Z',
            verifiedPurchase: true,
            user: { id: 10, name: 'Nguyễn Văn A', initials: 'NA' },
            sellerReply: null,
          },
          {
            id: 2,
            rating: 4,
            title: null,
            content: 'Dùng tốt cho thiết kế thi công.',
            createdAt: '2026-09-16T00:00:00.000Z',
            verifiedPurchase: true,
            user: { id: 11, name: 'Trần Thị B', initials: 'TB' },
            sellerReply: {
              comment: 'Cảm ơn bạn đã tin tưởng ủng hộ shop!',
              repliedAt: '2026-09-16T12:00:00.000Z',
            },
          },
        ],
        pagination: { page: 1, limit: 6, totalPages: 1, totalDocs: 2 },
        canReview: false,
      }),
    })

    render(<ProductReviewsSection productId={101} productTitle="Bản vẽ biệt thự hiện đại" />)

    await waitFor(() => {
      expect(screen.getByText('4.5')).toBeDefined()
      expect(screen.getByText('Dựa trên 2 lượt đánh giá')).toBeDefined()
      expect(screen.getByText('File CAD rất chuẩn')).toBeDefined()
      expect(screen.getByText('Bản vẽ chi tiết, đầy đủ mặt cắt và mặt đứng.')).toBeDefined()
      expect(screen.getByText('Dùng tốt cho thiết kế thi công.')).toBeDefined()
      expect(screen.getAllByText('Đã mua hàng').length).toBe(2)
      expect(screen.getByText('Phản hồi từ người bán')).toBeDefined()
      expect(screen.getByText('Cảm ơn bạn đã tin tưởng ủng hộ shop!')).toBeDefined()
    })
  })

  it('R3: unauthenticated users see notice with login button', async () => {
    mockUseAuth.mockReturnValue({ user: null })
    ;(global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        success: true,
        summary: { averageRating: 0, totalCount: 0, distribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 } },
        reviews: [],
        canReview: false,
      }),
    })

    render(<ProductReviewsSection productId={101} productTitle="Bản vẽ biệt thự" />)

    await waitFor(() => {
      expect(
        screen.getByText(/Chỉ khách hàng đã mua sản phẩm mới có thể gửi đánh giá/i),
      ).toBeDefined()
      expect(screen.getByText('Đăng nhập để đánh giá')).toBeDefined()
    })
  })

  it('R3: authenticated buyers holding active entitlement see "Viết đánh giá" button', async () => {
    mockUseAuth.mockReturnValue({ user: { id: 20, name: 'Người mua VIP' } })
    ;(global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        success: true,
        summary: { averageRating: 0, totalCount: 0, distribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 } },
        reviews: [],
        canReview: true,
      }),
    })

    render(<ProductReviewsSection productId={101} productTitle="Bản vẽ biệt thự" />)

    await waitFor(() => {
      expect(screen.getByText('Viết đánh giá')).toBeDefined()
    })
  })

  it('R3: opens review modal when "Viết đánh giá" is clicked and validates short content', async () => {
    mockUseAuth.mockReturnValue({ user: { id: 20, name: 'Người mua VIP' } })
    ;(global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        success: true,
        summary: { averageRating: 0, totalCount: 0, distribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 } },
        reviews: [],
        canReview: true,
      }),
    })

    render(<ProductReviewsSection productId={101} productTitle="Bản vẽ biệt thự" />)

    await waitFor(() => {
      expect(screen.getByText('Viết đánh giá')).toBeDefined()
    })

    fireEvent.click(screen.getByText('Viết đánh giá'))

    await waitFor(() => {
      expect(screen.getByText('Viết đánh giá sản phẩm')).toBeDefined()
    })

    // Submit with short content
    const textarea = screen.getByLabelText(/Nội dung chi tiết/i)
    fireEvent.change(textarea, { target: { value: 'hi' } })

    const submitBtn = screen.getByRole('button', { name: 'Gửi đánh giá' })
    fireEvent.click(submitBtn)

    await waitFor(() => {
      expect(screen.getByText('Nội dung đánh giá phải có ít nhất 5 ký tự.')).toBeDefined()
    })
  })

  it('R3: submits valid review successfully via POST and displays feedback toast', async () => {
    mockUseAuth.mockReturnValue({ user: { id: 20, name: 'Người mua VIP' } })
    ;(global.fetch as any)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          summary: { averageRating: 0, totalCount: 0, distribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 } },
          reviews: [],
          canReview: true,
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          message: 'Đánh giá đã được gửi thành công.',
          review: { id: 99, rating: 5, content: 'Bản vẽ rất sắc nét và chuẩn!' },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          summary: { averageRating: 5, totalCount: 1, distribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 1 } },
          reviews: [
            {
              id: 99,
              rating: 5,
              content: 'Bản vẽ rất sắc nét và chuẩn!',
              createdAt: '2026-09-17T00:00:00.000Z',
              verifiedPurchase: true,
              user: { id: 20, name: 'Người mua VIP', initials: 'NV' },
            },
          ],
          userReview: { id: 99, rating: 5, content: 'Bản vẽ rất sắc nét và chuẩn!' },
          canReview: false,
        }),
      })

    render(<ProductReviewsSection productId={101} productTitle="Bản vẽ biệt thự" />)

    await waitFor(() => {
      expect(screen.getByText('Viết đánh giá')).toBeDefined()
    })

    fireEvent.click(screen.getByText('Viết đánh giá'))

    await waitFor(() => {
      expect(screen.getByText('Viết đánh giá sản phẩm')).toBeDefined()
    })

    const titleInput = screen.getByLabelText(/Tiêu đề nhận xét/i)
    fireEvent.change(titleInput, { target: { value: 'Rất tuyệt vời' } })

    const textarea = screen.getByLabelText(/Nội dung chi tiết/i)
    fireEvent.change(textarea, { target: { value: 'Bản vẽ rất sắc nét và chuẩn!' } })

    const submitBtn = screen.getByRole('button', { name: 'Gửi đánh giá' })
    fireEvent.click(submitBtn)

    await waitFor(() => {
      expect(mockToast.success).toHaveBeenCalledWith('Đánh giá đã được gửi thành công!')
    })
  })

  it('R3: displays user review highlight when user has already reviewed', async () => {
    mockUseAuth.mockReturnValue({ user: { id: 20, name: 'Người mua VIP' } })
    ;(global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        success: true,
        summary: { averageRating: 5, totalCount: 1, distribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 1 } },
        reviews: [],
        userReview: {
          id: 50,
          rating: 5,
          title: 'Đánh giá mẫu của tôi',
          content: 'Nội dung đánh giá đã gửi trước đó.',
          createdAt: '2026-09-17T00:00:00.000Z',
        },
        canReview: false,
      }),
    })

    render(<ProductReviewsSection productId={101} productTitle="Bản vẽ biệt thự" />)

    await waitFor(() => {
      expect(screen.getByText('Đánh giá của bạn')).toBeDefined()
      expect(screen.getByText('Đánh giá mẫu của tôi')).toBeDefined()
      expect(screen.getByText('Nội dung đánh giá đã gửi trước đó.')).toBeDefined()
      expect(screen.getByText('Chỉnh sửa đánh giá của bạn')).toBeDefined()
    })
  })

  it('R3: displays seller reply inside the userReview highlight card', async () => {
    mockUseAuth.mockReturnValue({ user: { id: 20, name: 'Người mua VIP' } })
    ;(global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        success: true,
        summary: { averageRating: 5, totalCount: 1, distribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 1 } },
        reviews: [],
        userReview: {
          id: 50,
          rating: 5,
          title: 'Đánh giá kèm phản hồi',
          content: 'Nội dung nhận xét gốc của người mua.',
          createdAt: '2026-09-17T00:00:00.000Z',
          sellerReply: {
            comment: 'Cảm ơn bạn đã phản hồi! Shop sẽ tiếp tục nâng cấp file.',
            repliedAt: '2026-09-17T02:00:00.000Z',
          },
        },
        canReview: false,
      }),
    })

    render(<ProductReviewsSection productId={101} productTitle="Bản vẽ biệt thự" />)

    await waitFor(() => {
      expect(screen.getByText('Đánh giá của bạn')).toBeDefined()
      expect(screen.getByText('Phản hồi từ người bán')).toBeDefined()
      expect(
        screen.getByText('Cảm ơn bạn đã phản hồi! Shop sẽ tiếp tục nâng cấp file.'),
      ).toBeDefined()
    })
  })

  it('R3: handles API fetch errors gracefully without hanging in infinite loading state', async () => {
    mockUseAuth.mockReturnValue({ user: null })
    ;(global.fetch as any).mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: async () => ({ success: false, error: 'SERVER_ERROR' }),
    })

    render(<ProductReviewsSection productId={101} productTitle="Bản vẽ biệt thự" />)

    await waitFor(() => {
      // The loading spinner should stop
      expect(screen.queryByText('Đang tải đánh giá...')).toBeNull()
      // Component still renders header
      expect(screen.getByText('Đánh giá & Nhận xét')).toBeDefined()
    })
  })

  it('R3: displays moderation status badges when review is pending or rejected', async () => {
    mockUseAuth.mockReturnValue({ user: { id: 20, name: 'Người mua VIP' } })
    ;(global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        success: true,
        summary: { averageRating: 0, totalCount: 0, distribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 } },
        reviews: [],
        userReview: {
          id: 50,
          rating: 4,
          content: 'Nội dung đang chờ xét duyệt.',
          status: 'pending',
          createdAt: '2026-09-17T00:00:00.000Z',
        },
        canReview: false,
      }),
    })

    render(<ProductReviewsSection productId={101} productTitle="Bản vẽ biệt thự" />)

    await waitFor(() => {
      expect(screen.getByText('Đánh giá của bạn')).toBeDefined()
      expect(screen.getByText('Chờ kiểm duyệt')).toBeDefined()
    })
  })

  it('R3: allows clearing review title on edit and passes title: null in request body', async () => {
    mockUseAuth.mockReturnValue({ user: { id: 20, name: 'Người mua VIP' } })
    ;(global.fetch as any)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          summary: { averageRating: 5, totalCount: 1, distribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 1 } },
          reviews: [],
          userReview: {
            id: 50,
            rating: 5,
            title: 'Tiêu đề cũ cần xóa',
            content: 'Nội dung vẫn giữ nguyên chất lượng cao.',
            createdAt: '2026-09-17T00:00:00.000Z',
          },
          canReview: false,
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          message: 'Đánh giá đã được cập nhật thành công.',
          review: { id: 50, rating: 5, title: null, content: 'Nội dung vẫn giữ nguyên chất lượng cao.' },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          summary: { averageRating: 5, totalCount: 1, distribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 1 } },
          reviews: [],
          userReview: {
            id: 50,
            rating: 5,
            title: null,
            content: 'Nội dung vẫn giữ nguyên chất lượng cao.',
          },
          canReview: false,
        }),
      })

    render(<ProductReviewsSection productId={101} productTitle="Bản vẽ biệt thự" />)

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Chỉnh sửa đánh giá của bạn/i })).toBeDefined()
    })

    fireEvent.click(screen.getByRole('button', { name: /Chỉnh sửa đánh giá của bạn/i }))

    await waitFor(() => {
      expect(screen.getAllByText('Chỉnh sửa đánh giá của bạn').length).toBeGreaterThanOrEqual(2)
      const titleInput = screen.getByLabelText(/Tiêu đề nhận xét/i) as HTMLInputElement
      expect(titleInput.value).toBe('Tiêu đề cũ cần xóa')
    })

    // Clear the title
    const titleInput = screen.getByLabelText(/Tiêu đề nhận xét/i)
    fireEvent.change(titleInput, { target: { value: '' } })

    const saveBtn = screen.getByRole('button', { name: 'Lưu cập nhật' })
    fireEvent.click(saveBtn)

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/v1/products/101/reviews',
        expect.objectContaining({
          method: 'PUT',
          body: JSON.stringify({
            rating: 5,
            title: null,
            content: 'Nội dung vẫn giữ nguyên chất lượng cao.',
          }),
        }),
      )
      expect(mockToast.success).toHaveBeenCalledWith('Cập nhật đánh giá thành công!')
    })
  })

  it('R3: star rating picker buttons have accessible aria-labels', async () => {
    mockUseAuth.mockReturnValue({ user: { id: 20, name: 'Người mua VIP' } })
    ;(global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        success: true,
        summary: { averageRating: 0, totalCount: 0, distribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 } },
        reviews: [],
        canReview: true,
      }),
    })

    render(<ProductReviewsSection productId={101} productTitle="Bản vẽ biệt thự" />)

    await waitFor(() => {
      expect(screen.getByText('Viết đánh giá')).toBeDefined()
    })

    fireEvent.click(screen.getByText('Viết đánh giá'))

    await waitFor(() => {
      expect(screen.getByRole('button', { name: '5 sao — Rất tuyệt vời' })).toBeDefined()
      expect(screen.getByRole('button', { name: '1 sao — Rất không hài lòng' })).toBeDefined()
    })
  })

  it('R3: handles non-JSON error response (e.g. 502 HTML) during submission gracefully without crash', async () => {
    mockUseAuth.mockReturnValue({ user: { id: 20, name: 'Người mua VIP' } })
    ;(global.fetch as any)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          summary: { averageRating: 0, totalCount: 0, distribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 } },
          reviews: [],
          canReview: true,
        }),
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 502,
        // Calling json() throws SyntaxError simulating HTML error body
        json: async () => {
          throw new SyntaxError('Unexpected token < in JSON at position 0')
        },
      })

    render(<ProductReviewsSection productId={101} productTitle="Bản vẽ biệt thự" />)

    await waitFor(() => {
      expect(screen.getByText('Viết đánh giá')).toBeDefined()
    })

    fireEvent.click(screen.getByText('Viết đánh giá'))

    await waitFor(() => {
      expect(screen.getByText('Viết đánh giá sản phẩm')).toBeDefined()
    })

    const textarea = screen.getByLabelText(/Nội dung chi tiết/i)
    fireEvent.change(textarea, { target: { value: 'Nội dung kiểm tra lỗi mạng gateway' } })

    const submitBtn = screen.getByRole('button', { name: 'Gửi đánh giá' })
    fireEvent.click(submitBtn)

    await waitFor(() => {
      expect(mockToast.error).toHaveBeenCalledWith('Gửi đánh giá không thành công.')
    })
  })

  it('R3: renders summary safely even when summary distribution is missing or partial', async () => {
    mockUseAuth.mockReturnValue({ user: null })
    ;(global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        success: true,
        summary: {
          averageRating: 5,
          totalCount: 1,
          // partial distribution
          distribution: { 5: 1 },
        },
        reviews: [],
        pagination: { page: 1, limit: 6, totalPages: 1, totalDocs: 1 },
        canReview: false,
      }),
    })

    render(<ProductReviewsSection productId={101} productTitle="Bản vẽ biệt thự" />)

    await waitFor(() => {
      expect(screen.getByText('5.0')).toBeDefined()
      expect(screen.getByText('Dựa trên 1 lượt đánh giá')).toBeDefined()
    })
  })
})
