import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'
import { ProductCommentsSection } from '@/components/product/ProductCommentsSection'

// Mock useAuth
const mockUseAuth = vi.fn()
vi.mock('@/providers/Auth', () => ({
  useAuth: () => mockUseAuth(),
}))

// Mock next/navigation
vi.mock('next/navigation', () => ({
  usePathname: () => '/products/cad-model-test',
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

describe('ProductCommentsSection Storefront Q&A & Comments Suite (R3, FR-21)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    global.fetch = vi.fn()
  })

  afterEach(() => {
    cleanup()
  })

  it('R3: renders empty comments state when product has 0 comments', async () => {
    mockUseAuth.mockReturnValue({ user: null })
    ;(global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        success: true,
        comments: [],
        totalComments: 0,
        pagination: { page: 1, limit: 10, totalPages: 1, totalDocs: 0 },
      }),
    })

    render(<ProductCommentsSection productId={101} productTitle="Bản vẽ biệt thự hiện đại" />)

    await waitFor(() => {
      expect(screen.getByText('Hỏi đáp & Bình luận')).toBeDefined()
      expect(screen.getByText('Chưa có câu hỏi nào')).toBeDefined()
      expect(screen.getByText('Hãy là người đầu tiên đặt câu hỏi cho người bán về tài nguyên này!')).toBeDefined()
    })
  })

  it('R3: renders login CTA when user is unauthenticated', async () => {
    mockUseAuth.mockReturnValue({ user: null })
    ;(global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        success: true,
        comments: [],
        totalComments: 0,
        pagination: { page: 1, limit: 10, totalPages: 1, totalDocs: 0 },
      }),
    })

    render(<ProductCommentsSection productId={101} productTitle="Bản vẽ biệt thự hiện đại" />)

    await waitFor(() => {
      expect(screen.getByText('Bạn có thắc mắc về tài nguyên này?')).toBeDefined()
      expect(screen.getByText('Đăng nhập ngay')).toBeDefined()
    })
  })

  it('R3: renders interactive question input form when user is authenticated', async () => {
    mockUseAuth.mockReturnValue({
      user: { id: 201, name: 'Kỹ sư Nguyễn', roles: ['buyer'] },
    })
    ;(global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        success: true,
        comments: [],
        totalComments: 0,
        pagination: { page: 1, limit: 10, totalPages: 1, totalDocs: 0 },
      }),
    })

    render(<ProductCommentsSection productId={101} productTitle="Bản vẽ biệt thự hiện đại" />)

    await waitFor(() => {
      expect(screen.getByPlaceholderText('Đặt câu hỏi về tài nguyên này...')).toBeDefined()
      expect(screen.getByText('Gửi câu hỏi')).toBeDefined()
    })
  })

  it('R3: allows authenticated user to submit a valid question', async () => {
    mockUseAuth.mockReturnValue({
      user: { id: 201, name: 'Kỹ sư Nguyễn', roles: ['buyer'] },
    })
    // Initial fetch
    ;(global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        success: true,
        comments: [],
        totalComments: 0,
        pagination: { page: 1, limit: 10, totalPages: 1, totalDocs: 0 },
      }),
    })

    render(<ProductCommentsSection productId={101} productTitle="Bản vẽ biệt thự hiện đại" />)

    const textarea = await screen.findByPlaceholderText('Đặt câu hỏi về tài nguyên này...')
    fireEvent.change(textarea, {
      target: { value: 'File này có mở được bằng AutoCAD 2020 không shop?' },
    })

    // Mock POST submission
    ;(global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        success: true,
        comment: {
          id: 1,
          productId: 101,
          content: 'File này có mở được bằng AutoCAD 2020 không shop?',
          status: 'published',
          isSellerReply: false,
          isAdminReply: false,
          roleBadge: null,
          createdAt: new Date().toISOString(),
          user: { id: 201, name: 'Kỹ sư Nguyễn', initials: 'KN' },
          replies: [],
        },
      }),
    })

    // Mock re-fetch after submit
    ;(global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        success: true,
        comments: [
          {
            id: 1,
            productId: 101,
            content: 'File này có mở được bằng AutoCAD 2020 không shop?',
            status: 'published',
            isSellerReply: false,
            isAdminReply: false,
            roleBadge: null,
            createdAt: new Date().toISOString(),
            user: { id: 201, name: 'Kỹ sư Nguyễn', initials: 'KN' },
            replies: [],
          },
        ],
        totalComments: 1,
        pagination: { page: 1, limit: 10, totalPages: 1, totalDocs: 1 },
      }),
    })

    const submitBtn = screen.getByText('Gửi câu hỏi')
    fireEvent.click(submitBtn)

    await waitFor(() => {
      expect(mockToast.success).toHaveBeenCalledWith('Đã gửi câu hỏi thành công!')
    })
  })

  it('R3: renders comments list with role badges and 1-level reply threads', async () => {
    mockUseAuth.mockReturnValue({
      user: { id: 201, name: 'Kỹ sư Nguyễn', roles: ['buyer'] },
    })
    ;(global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        success: true,
        comments: [
          {
            id: 1,
            productId: 101,
            content: 'Bản vẽ có bao gồm mặt cắt móng không?',
            status: 'published',
            isSellerReply: false,
            isAdminReply: false,
            roleBadge: null,
            createdAt: new Date(Date.now() - 3600000).toISOString(),
            user: { id: 201, name: 'Kỹ sư Nguyễn', initials: 'KN' },
            replies: [
              {
                id: 2,
                productId: 101,
                parentId: 1,
                content: 'Đầy đủ mặt cắt móng và bố trí thép dầm sàn nhé bạn!',
                status: 'published',
                isSellerReply: true,
                isAdminReply: false,
                roleBadge: 'Tác giả / Người bán',
                createdAt: new Date(Date.now() - 1800000).toISOString(),
                user: { id: 50, name: 'Studio Kiến Trúc', initials: 'SK' },
              },
              {
                id: 3,
                productId: 101,
                parentId: 1,
                content: 'Hồ sơ đã được kiểm tra kỹ thuật đạt chuẩn KienTaoHub.',
                status: 'published',
                isSellerReply: false,
                isAdminReply: true,
                roleBadge: 'Quản trị viên',
                createdAt: new Date(Date.now() - 900000).toISOString(),
                user: { id: 1, name: 'Admin KienTao', initials: 'AK' },
              },
            ],
          },
        ],
        totalComments: 3,
        pagination: { page: 1, limit: 10, totalPages: 1, totalDocs: 1 },
      }),
    })

    render(<ProductCommentsSection productId={101} productTitle="Bản vẽ biệt thự hiện đại" />)

    await waitFor(() => {
      expect(screen.getByText('Bản vẽ có bao gồm mặt cắt móng không?')).toBeDefined()
      expect(screen.getByText('Đầy đủ mặt cắt móng và bố trí thép dầm sàn nhé bạn!')).toBeDefined()
      expect(screen.getByText('Hồ sơ đã được kiểm tra kỹ thuật đạt chuẩn KienTaoHub.')).toBeDefined()

      // Role badges
      expect(screen.getByText('Tác giả / Người bán')).toBeDefined()
      expect(screen.getByText('Quản trị viên')).toBeDefined()
    })
  })

  it('R3: allows replying directly to a question with inline reply form', async () => {
    mockUseAuth.mockReturnValue({
      user: { id: 50, name: 'Studio Kiến Trúc', roles: ['seller'] },
    })
    ;(global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        success: true,
        comments: [
          {
            id: 10,
            productId: 101,
            content: 'Có file SketchUp đi kèm không ạ?',
            status: 'published',
            isSellerReply: false,
            isAdminReply: false,
            roleBadge: null,
            createdAt: new Date().toISOString(),
            user: { id: 202, name: 'Lê Văn C', initials: 'LC' },
            replies: [],
          },
        ],
        totalComments: 1,
        pagination: { page: 1, limit: 10, totalPages: 1, totalDocs: 1 },
      }),
    })

    render(
      <ProductCommentsSection
        productId={101}
        productTitle="Bản vẽ biệt thự hiện đại"
        sellerId={50}
      />,
    )

    const replyButton = await screen.findByText('Trả lời')
    fireEvent.click(replyButton)

    const replyTextarea = await screen.findByPlaceholderText('Viết câu trả lời...')
    fireEvent.change(replyTextarea, {
      target: { value: 'Có kèm cả file SketchUp và 3ds Max bạn nhé!' },
    })

    // Mock POST reply
    ;(global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        success: true,
        comment: {
          id: 11,
          productId: 101,
          parentId: 10,
          content: 'Có kèm cả file SketchUp và 3ds Max bạn nhé!',
          status: 'published',
          isSellerReply: true,
          isAdminReply: false,
          roleBadge: 'Tác giả / Người bán',
          createdAt: new Date().toISOString(),
          user: { id: 50, name: 'Studio Kiến Trúc', initials: 'SK' },
        },
      }),
    })

    // Mock re-fetch
    ;(global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        success: true,
        comments: [
          {
            id: 10,
            productId: 101,
            content: 'Có file SketchUp đi kèm không ạ?',
            status: 'published',
            isSellerReply: false,
            isAdminReply: false,
            roleBadge: null,
            createdAt: new Date().toISOString(),
            user: { id: 202, name: 'Lê Văn C', initials: 'LC' },
            replies: [
              {
                id: 11,
                productId: 101,
                parentId: 10,
                content: 'Có kèm cả file SketchUp và 3ds Max bạn nhé!',
                status: 'published',
                isSellerReply: true,
                isAdminReply: false,
                roleBadge: 'Tác giả / Người bán',
                createdAt: new Date().toISOString(),
                user: { id: 50, name: 'Studio Kiến Trúc', initials: 'SK' },
              },
            ],
          },
        ],
        totalComments: 2,
        pagination: { page: 1, limit: 10, totalPages: 1, totalDocs: 1 },
      }),
    })

    const sendReplyBtn = screen.getByText('Gửi phản hồi')
    fireEvent.click(sendReplyBtn)

    await waitFor(() => {
      expect(mockToast.success).toHaveBeenCalledWith('Đã gửi câu trả lời thành công!')
    })
  })

  it('R3: allows author to hide/soft-delete their comment', async () => {
    mockUseAuth.mockReturnValue({
      user: { id: 201, name: 'Kỹ sư Nguyễn', roles: ['buyer'] },
    })
    ;(global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        success: true,
        comments: [
          {
            id: 1,
            productId: 101,
            content: 'Câu hỏi cần ẩn.',
            status: 'published',
            isSellerReply: false,
            isAdminReply: false,
            roleBadge: null,
            createdAt: new Date().toISOString(),
            user: { id: 201, name: 'Kỹ sư Nguyễn', initials: 'KN' },
            replies: [],
          },
        ],
        totalComments: 1,
        pagination: { page: 1, limit: 10, totalPages: 1, totalDocs: 1 },
      }),
    })

    render(<ProductCommentsSection productId={101} productTitle="Bản vẽ biệt thự hiện đại" />)

    const hideButton = await screen.findByTitle('Ẩn bình luận')
    expect(hideButton).toBeDefined()

    // Mock PATCH response
    ;(global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        success: true,
        comment: { id: 1, status: 'hidden' },
      }),
    })

    // Mock re-fetch
    ;(global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        success: true,
        comments: [],
        totalComments: 0,
        pagination: { page: 1, limit: 10, totalPages: 1, totalDocs: 0 },
      }),
    })

    fireEvent.click(hideButton)

    await waitFor(() => {
      expect(mockToast.success).toHaveBeenCalledWith('Đã ẩn bình luận.')
    })
  })

  it('R3: renders pagination controls and switches page', async () => {
    mockUseAuth.mockReturnValue({ user: null })
    ;(global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        success: true,
        comments: [
          {
            id: 1,
            productId: 101,
            content: 'Bình luận trang 1',
            status: 'published',
            isSellerReply: false,
            isAdminReply: false,
            roleBadge: null,
            createdAt: new Date().toISOString(),
            user: { id: 10, name: 'User 1', initials: 'U1' },
            replies: [],
          },
        ],
        totalComments: 15,
        pagination: { page: 1, limit: 10, totalPages: 2, totalDocs: 15 },
      }),
    })

    render(<ProductCommentsSection productId={101} productTitle="Bản vẽ biệt thự hiện đại" />)

    await waitFor(() => {
      expect(screen.getByText('Trang 1 / 2')).toBeDefined()
      expect(screen.getByText('Trang sau')).toBeDefined()
    })

    // Mock page 2 fetch
    ;(global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        success: true,
        comments: [
          {
            id: 2,
            productId: 101,
            content: 'Bình luận trang 2',
            status: 'published',
            isSellerReply: false,
            isAdminReply: false,
            roleBadge: null,
            createdAt: new Date().toISOString(),
            user: { id: 11, name: 'User 2', initials: 'U2' },
            replies: [],
          },
        ],
        totalComments: 15,
        pagination: { page: 2, limit: 10, totalPages: 2, totalDocs: 15 },
      }),
    })

    const nextBtn = screen.getByText('Trang sau')
    fireEvent.click(nextBtn)

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/v1/products/101/comments?page=2&limit=10',
        expect.anything(),
      )
    })
  })

  it('R3: displays seller role context badge inside inline reply form when seller responds', async () => {
    mockUseAuth.mockReturnValue({
      user: { id: 50, name: 'Studio Kiến Trúc', roles: ['seller'] },
    })
    ;(global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        success: true,
        comments: [
          {
            id: 20,
            productId: 101,
            content: 'Câu hỏi từ khách hàng cần người bán phản hồi.',
            status: 'published',
            isSellerReply: false,
            isAdminReply: false,
            roleBadge: null,
            createdAt: new Date().toISOString(),
            user: { id: 300, name: 'Khách hàng A', initials: 'KA' },
            replies: [],
          },
        ],
        totalComments: 1,
        pagination: { page: 1, limit: 10, totalPages: 1, totalDocs: 1 },
      }),
    })

    render(
      <ProductCommentsSection
        productId={101}
        productTitle="Bản vẽ biệt thự hiện đại"
        sellerId={50}
      />,
    )

    const replyButton = await screen.findByText('Trả lời')
    fireEvent.click(replyButton)

    await waitFor(() => {
      expect(screen.getByText('Phản hồi với tư cách Người bán')).toBeDefined()
    })
  })

  it('R3: displays admin role context badge inside inline reply form when admin responds', async () => {
    mockUseAuth.mockReturnValue({
      user: { id: 1, name: 'Admin KienTao', roles: ['admin'] },
    })
    ;(global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        success: true,
        comments: [
          {
            id: 21,
            productId: 101,
            content: 'Câu hỏi cần ban quản trị giải đáp.',
            status: 'published',
            isSellerReply: false,
            isAdminReply: false,
            roleBadge: null,
            createdAt: new Date().toISOString(),
            user: { id: 301, name: 'Khách hàng B', initials: 'KB' },
            replies: [],
          },
        ],
        totalComments: 1,
        pagination: { page: 1, limit: 10, totalPages: 1, totalDocs: 1 },
      }),
    })

    render(
      <ProductCommentsSection
        productId={101}
        productTitle="Bản vẽ biệt thự hiện đại"
        sellerId={50}
      />,
    )

    const replyButton = await screen.findByText('Trả lời')
    fireEvent.click(replyButton)

    await waitFor(() => {
      expect(screen.getByText('Phản hồi với tư cách Quản trị viên')).toBeDefined()
    })
  })

  it('R3: clears reply form draft content when user cancels the reply form', async () => {
    mockUseAuth.mockReturnValue({
      user: { id: 201, name: 'Kỹ sư Nguyễn', roles: ['buyer'] },
    })
    ;(global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        success: true,
        comments: [
          {
            id: 25,
            productId: 101,
            content: 'Câu hỏi cần trả lời.',
            status: 'published',
            isSellerReply: false,
            isAdminReply: false,
            roleBadge: null,
            createdAt: new Date().toISOString(),
            user: { id: 302, name: 'Khách hàng C', initials: 'KC' },
            replies: [],
          },
        ],
        totalComments: 1,
        pagination: { page: 1, limit: 10, totalPages: 1, totalDocs: 1 },
      }),
    })

    render(
      <ProductCommentsSection
        productId={101}
        productTitle="Bản vẽ biệt thự hiện đại"
        sellerId={50}
      />,
    )

    // Open reply form
    const replyButton = await screen.findByText('Trả lời')
    fireEvent.click(replyButton)

    // Type into reply textarea
    const textarea = await screen.findByPlaceholderText('Viết câu trả lời...')
    fireEvent.change(textarea, { target: { value: 'Bản nháp phản hồi chưa hoàn tất' } })
    expect((textarea as HTMLTextAreaElement).value).toBe('Bản nháp phản hồi chưa hoàn tất')

    // Click Cancel (Hủy)
    const cancelBtn = screen.getByText('Hủy')
    fireEvent.click(cancelBtn)

    // Verify reply box is closed
    expect(screen.queryByPlaceholderText('Viết câu trả lời...')).toBeNull()

    // Reopen reply box
    fireEvent.click(screen.getByText('Trả lời'))

    // Verify textarea is empty and fresh
    const reopenedTextarea = await screen.findByPlaceholderText('Viết câu trả lời...')
    expect((reopenedTextarea as HTMLTextAreaElement).value).toBe('')
  })

  it('R3: allows submitting question via Ctrl+Enter keyboard shortcut', async () => {
    mockUseAuth.mockReturnValue({
      user: { id: 201, name: 'Kỹ sư Nguyễn', roles: ['buyer'] },
    })
    ;(global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        success: true,
        comments: [],
        totalComments: 0,
        pagination: { page: 1, limit: 10, totalPages: 1, totalDocs: 0 },
      }),
    })

    render(<ProductCommentsSection productId={101} productTitle="Bản vẽ biệt thự hiện đại" />)

    const textarea = await screen.findByPlaceholderText('Đặt câu hỏi về tài nguyên này...')
    fireEvent.change(textarea, {
      target: { value: 'Câu hỏi gửi nhanh bằng phím tắt Ctrl+Enter' },
    })

    // Mock POST submission
    ;(global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        success: true,
        comment: {
          id: 99,
          productId: 101,
          content: 'Câu hỏi gửi nhanh bằng phím tắt Ctrl+Enter',
          status: 'published',
          isSellerReply: false,
          isAdminReply: false,
          roleBadge: null,
          createdAt: new Date().toISOString(),
          user: { id: 201, name: 'Kỹ sư Nguyễn', initials: 'KN' },
          replies: [],
        },
      }),
    })

    // Mock re-fetch
    ;(global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        success: true,
        comments: [
          {
            id: 99,
            productId: 101,
            content: 'Câu hỏi gửi nhanh bằng phím tắt Ctrl+Enter',
            status: 'published',
            isSellerReply: false,
            isAdminReply: false,
            roleBadge: null,
            createdAt: new Date().toISOString(),
            user: { id: 201, name: 'Kỹ sư Nguyễn', initials: 'KN' },
            replies: [],
          },
        ],
        totalComments: 1,
        pagination: { page: 1, limit: 10, totalPages: 1, totalDocs: 1 },
      }),
    })

    // Press Ctrl+Enter
    fireEvent.keyDown(textarea, { key: 'Enter', code: 'Enter', ctrlKey: true })

    await waitFor(() => {
      expect(mockToast.success).toHaveBeenCalledWith('Đã gửi câu hỏi thành công!')
    })
  })
})
