import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup, act } from '@testing-library/react'
import { ForgotPasswordForm } from '@/components/forms/ForgotPasswordForm'
import ForgotPasswordPage, { metadata as forgotPasswordMetadata } from '@/app/(app)/forgot-password/page'
import { LogoutPage } from '@/app/(app)/logout/LogoutPage'
import Logout, { metadata as logoutMetadata } from '@/app/(app)/logout/page'

// Polyfill window.matchMedia and ResizeObserver
if (typeof window !== 'undefined') {
  if (!window.matchMedia) {
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
  if (!window.ResizeObserver) {
    window.ResizeObserver = class ResizeObserver {
      observe() {}
      unobserve() {}
      disconnect() {}
    } as unknown as typeof window.ResizeObserver
  }
}

// Mock next/navigation
const mockRouterPush = vi.fn()
const mockRedirect = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockRouterPush,
  }),
  redirect: (url: string) => mockRedirect(url),
}))

// Mock next/headers
vi.mock('next/headers', () => ({
  headers: vi.fn(async () => new Headers()),
}))

// Mock payload
const mockAuth = vi.fn()
vi.mock('payload', () => ({
  getPayload: vi.fn(async () => ({
    auth: mockAuth,
  })),
}))

vi.mock('@payload-config', () => ({
  default: {},
}))

// Mock next/link
vi.mock('next/link', () => ({
  default: ({
    href,
    children,
    className,
    ...props
  }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a href={href} className={className} {...props}>
      {children}
    </a>
  ),
}))

// Mock useAuth provider
const mockLogout = vi.fn()
vi.mock('@/providers/Auth', () => ({
  useAuth: () => ({
    logout: mockLogout,
    user: null,
  }),
}))

describe('M4 Challenger 2 Empirical Stress Test: Forgot Password (F27) & Logout (F28)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    global.fetch = vi.fn()
    mockAuth.mockResolvedValue({ user: null })
  })

  afterEach(() => {
    cleanup()
  })

  // ============================================================================
  // SECTION 1: FORGOT PASSWORD VALIDATION & SUBMISSION (F27)
  // ============================================================================
  describe('F27: Forgot Password Form Field Validation', () => {
    it('renders initial form with email input, submit button, back-to-login link and admin link', () => {
      render(<ForgotPasswordForm />)

      expect(screen.getByRole('heading', { level: 1, name: 'Quên mật khẩu?' })).toBeDefined()
      expect(
        screen.getByText(/Nhập địa chỉ email đăng ký tài khoản KienTaoHub của bạn/i),
      ).toBeDefined()

      // Back to login links
      const backLinks = screen.getAllByRole('link', { name: /Quay lại đăng nhập/i })
      expect(backLinks.length).toBeGreaterThanOrEqual(1)
      expect(backLinks[0].getAttribute('href')).toBe('/login')

      // Email field with input id="email" and name="email"
      const emailInput = screen.getByLabelText('Địa chỉ Email')
      expect(emailInput).toBeDefined()
      expect(emailInput.getAttribute('type')).toBe('email')
      expect(emailInput.getAttribute('name')).toBe('email')
      expect(emailInput.getAttribute('placeholder')).toBe('name@example.com')

      // Submit button
      const submitBtn = screen.getByRole('button', { name: /Gửi hướng dẫn đặt lại mật khẩu/i })
      expect(submitBtn).toBeDefined()

      // Admin access link
      const adminLink = screen.getByRole('link', { name: /Đăng nhập trang quản trị/i })
      expect(adminLink.getAttribute('href')).toBe('/admin/collections/users')
    })

    it('blocks submission and displays inline warning when email is empty', async () => {
      render(<ForgotPasswordForm />)

      const submitBtn = screen.getByRole('button', { name: /Gửi hướng dẫn đặt lại mật khẩu/i })
      fireEvent.click(submitBtn)

      await waitFor(() => {
        expect(screen.getByText('Vui lòng nhập địa chỉ email.')).toBeDefined()
      })
      expect(global.fetch).not.toHaveBeenCalled()
    })

    it('blocks submission and displays inline warning when email contains only whitespace', async () => {
      const { container } = render(<ForgotPasswordForm />)

      const emailInput = screen.getByLabelText('Địa chỉ Email')
      const submitBtn = screen.getByRole('button', { name: /Gửi hướng dẫn đặt lại mật khẩu/i })

      fireEvent.change(emailInput, { target: { value: '    ' } })
      fireEvent.click(submitBtn)

      await waitFor(() => {
        const errorEl = container.querySelector('.ant-form-item-explain')
        expect(errorEl).not.toBeNull()
        // Check that submission was blocked and an error message is visible
        expect(
          screen.queryByText('Email không được chỉ chứa khoảng trắng.') ||
          screen.queryByText('Địa chỉ email không hợp lệ (ví dụ: name@example.com).') ||
          screen.queryByText('Vui lòng nhập địa chỉ email.')
        ).not.toBeNull()
      })
      expect(global.fetch).not.toHaveBeenCalled()
    })

    it('rejects malformed email formats and shows validation message', async () => {
      render(<ForgotPasswordForm />)

      const emailInput = screen.getByLabelText('Địa chỉ Email')
      const submitBtn = screen.getByRole('button', { name: /Gửi hướng dẫn đặt lại mật khẩu/i })

      const invalidEmails = [
        'invalid-email',
        'architect@',
        '@kientaohub.vn',
        'user@domain',
        'user space@domain.com',
      ]

      for (const invalid of invalidEmails) {
        fireEvent.change(emailInput, { target: { value: invalid } })
        fireEvent.click(submitBtn)

        await waitFor(() => {
          expect(
            screen.getByText('Địa chỉ email không hợp lệ (ví dụ: name@example.com).'),
          ).toBeDefined()
        })
        expect(global.fetch).not.toHaveBeenCalled()
      }
    })

    it('automatically trims leading and trailing whitespace upon submission', async () => {
      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ message: 'Success' }),
      } as unknown as Response)

      render(<ForgotPasswordForm />)

      const emailInput = screen.getByLabelText('Địa chỉ Email')
      const submitBtn = screen.getByRole('button', { name: /Gửi hướng dẫn đặt lại mật khẩu/i })

      fireEvent.change(emailInput, { target: { value: '   architect@kientaohub.vn   ' } })
      fireEvent.click(submitBtn)

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith(
          expect.stringContaining('/api/users/forgot-password'),
          expect.objectContaining({
            method: 'POST',
            body: JSON.stringify({ email: 'architect@kientaohub.vn' }),
          }),
        )
      })
    })
  })

  // ============================================================================
  // SECTION 2: FORGOT PASSWORD RESULT STATUS="SUCCESS" & ACTIONS (F27)
  // ============================================================================
  describe('F27: Forgot Password Submission & Ant Design Result View', () => {
    it('displays Ant Design Result status="success" with submitted email and navigation actions', async () => {
      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ message: 'Success' }),
      } as unknown as Response)

      const { container } = render(<ForgotPasswordForm />)

      const emailInput = screen.getByLabelText('Địa chỉ Email')
      const submitBtn = screen.getByRole('button', { name: /Gửi hướng dẫn đặt lại mật khẩu/i })

      fireEvent.change(emailInput, { target: { value: 'engineer@kientaohub.vn' } })
      fireEvent.click(submitBtn)

      await waitFor(() => {
        // Ant Design Result success verification
        expect(container.querySelector('.ant-result-success')).not.toBeNull()
        expect(screen.getByText('Yêu cầu đặt lại mật khẩu đã được gửi')).toBeDefined()
        expect(screen.getByText('engineer@kientaohub.vn')).toBeDefined()
      })

      // Action 1: Back to login button
      const loginLink = screen.getByRole('link', { name: /Quay lại Đăng nhập/i })
      expect(loginLink.getAttribute('href')).toBe('/login')
      const loginBtn = loginLink.querySelector('button')
      expect(loginBtn).not.toBeNull()
      expect(loginBtn?.classList.contains('ant-btn-primary')).toBe(true)

      // Action 2: Retry email button
      const retryBtn = screen.getByRole('button', { name: /Thử email khác/i })
      expect(retryBtn).toBeDefined()
    })

    it('resets the form and returns to input view when clicking "Thử email khác"', async () => {
      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ message: 'Success' }),
      } as unknown as Response)

      const { container } = render(<ForgotPasswordForm />)

      const emailInput = screen.getByLabelText('Địa chỉ Email')
      const submitBtn = screen.getByRole('button', { name: /Gửi hướng dẫn đặt lại mật khẩu/i })

      fireEvent.change(emailInput, { target: { value: 'test@kientaohub.vn' } })
      fireEvent.click(submitBtn)

      await waitFor(() => {
        expect(container.querySelector('.ant-result-success')).not.toBeNull()
      })

      // Click retry
      const retryBtn = screen.getByRole('button', { name: /Thử email khác/i })
      fireEvent.click(retryBtn)

      // Verify form view is restored and input field is empty
      await waitFor(() => {
        expect(screen.getByRole('heading', { level: 1, name: 'Quên mật khẩu?' })).toBeDefined()
        const restoredEmailInput = screen.getByLabelText('Địa chỉ Email') as HTMLInputElement
        expect(restoredEmailInput.value).toBe('')
      })
    })

    it('renders Ant Design Alert error when server returns an API error response', async () => {
      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: false,
        json: async () => ({
          errors: [{ message: 'Địa chỉ email này chưa được đăng ký trong hệ thống.' }],
        }),
      } as unknown as Response)

      render(<ForgotPasswordForm />)

      const emailInput = screen.getByLabelText('Địa chỉ Email')
      const submitBtn = screen.getByRole('button', { name: /Gửi hướng dẫn đặt lại mật khẩu/i })

      fireEvent.change(emailInput, { target: { value: 'unknown@kientaohub.vn' } })
      fireEvent.click(submitBtn)

      await waitFor(() => {
        expect(
          screen.getByText('Địa chỉ email này chưa được đăng ký trong hệ thống.'),
        ).toBeDefined()
      })
    })

    it('renders fallback error Alert when server returns failure without message', async () => {
      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: false,
        json: async () => ({}),
      } as unknown as Response)

      render(<ForgotPasswordForm />)

      const emailInput = screen.getByLabelText('Địa chỉ Email')
      const submitBtn = screen.getByRole('button', { name: /Gửi hướng dẫn đặt lại mật khẩu/i })

      fireEvent.change(emailInput, { target: { value: 'error@kientaohub.vn' } })
      fireEvent.click(submitBtn)

      await waitFor(() => {
        expect(
          screen.getByText(
            'Có lỗi xảy ra khi gửi email đặt lại mật khẩu. Vui lòng kiểm tra lại địa chỉ email hoặc thử lại sau.',
          ),
        ).toBeDefined()
      })
    })

    it('renders network connection error Alert when fetch throws', async () => {
      vi.mocked(global.fetch).mockRejectedValueOnce(new Error('Network error'))

      render(<ForgotPasswordForm />)

      const emailInput = screen.getByLabelText('Địa chỉ Email')
      const submitBtn = screen.getByRole('button', { name: /Gửi hướng dẫn đặt lại mật khẩu/i })

      fireEvent.change(emailInput, { target: { value: 'network@kientaohub.vn' } })
      fireEvent.click(submitBtn)

      await waitFor(() => {
        expect(
          screen.getByText(
            'Không thể kết nối đến máy chủ. Vui lòng kiểm tra kết nối mạng và thử lại sau.',
          ),
        ).toBeDefined()
      })
    })
  })

  // ============================================================================
  // SECTION 3: AUTHENTICATED SESSION GUARD (F27)
  // ============================================================================
  describe('F27: Authenticated Session Guard & Page Component', () => {
    it('redirects already logged-in users accessing /forgot-password to /account', async () => {
      mockAuth.mockResolvedValueOnce({
        user: { id: 'user-auth-123', email: 'authenticated@kientaohub.vn' },
      })

      await ForgotPasswordPage()

      expect(mockRedirect).toHaveBeenCalledTimes(1)
      expect(mockRedirect).toHaveBeenCalledWith(
        `/account?warning=${encodeURIComponent('Bạn đã đăng nhập vào hệ thống.')}`,
      )
    })

    it('renders page layout with trust indicators and support hotline for unauthenticated visitor', async () => {
      mockAuth.mockResolvedValueOnce({ user: null })

      const page = await ForgotPasswordPage()
      render(page)

      // Hotline
      const phoneLink = screen.getByRole('link', { name: '1900 6868' })
      expect(phoneLink.getAttribute('href')).toBe('tel:19006868')

      // Security badge
      expect(screen.getByText('Bảo mật 100%')).toBeDefined()

      // Explore shop link
      const shopLink = screen.getByRole('link', { name: 'Khám phá bản vẽ' })
      expect(shopLink.getAttribute('href')).toBe('/shop')
    })

    it('exports metadata with correct title and OpenGraph url', () => {
      expect(forgotPasswordMetadata.title).toBe('Quên mật khẩu | KienTaoHub')
      expect(forgotPasswordMetadata.openGraph?.title).toBe('Quên mật khẩu | KienTaoHub')
      expect(forgotPasswordMetadata.openGraph?.url).toBe('/forgot-password')
    })
  })

  // ============================================================================
  // SECTION 4: LOGOUT PAGE & WORKFLOW (F28)
  // ============================================================================
  describe('F28: Logout Execution, Spin Indicator & Ant Design Result status="info"', () => {
    it('displays Spin indicator while logout operation is pending', async () => {
      let resolveLogout: () => void = () => {}
      const logoutPromise = new Promise<void>((resolve) => {
        resolveLogout = resolve
      })
      mockLogout.mockReturnValueOnce(logoutPromise)

      const { container } = render(<LogoutPage />)

      // Initial loading state displays Ant Design Spin
      expect(container.querySelector('.ant-spin')).not.toBeNull()
      expect(screen.getByText('Đang xử lý đăng xuất an toàn...')).toBeDefined()

      // Resolve logout
      await act(async () => {
        resolveLogout()
      })

      // After resolution, loading indicator is gone
      await waitFor(() => {
        expect(container.querySelector('.ant-spin')).toBeNull()
      })
    })

    it('renders Ant Design Result status="info" and success title after successful logout', async () => {
      mockLogout.mockResolvedValueOnce(undefined)

      const { container } = render(<LogoutPage />)

      await waitFor(() => {
        expect(container.querySelector('.ant-result-info')).not.toBeNull()
        expect(screen.getByText('Đã đăng xuất thành công')).toBeDefined()
        expect(
          screen.getByText(
            'Tài khoản của bạn đã được đăng xuất an toàn khỏi hệ thống KienTaoHub. Phiên làm việc đã kết thúc.',
          ),
        ).toBeDefined()
      })
    })

    it('renders Ant Design Result status="info" and friendly message when user is already logged out', async () => {
      mockLogout.mockRejectedValueOnce(new Error('Already logged out'))

      const { container } = render(<LogoutPage />)

      await waitFor(() => {
        expect(container.querySelector('.ant-result-info')).not.toBeNull()
        expect(screen.getByText('Bạn chưa đăng nhập hoặc đã đăng xuất')).toBeDefined()
        expect(
          screen.getByText('Hiện không có phiên làm việc nào đang hoạt động trên thiết bị này.'),
        ).toBeDefined()
      })
    })

    it('renders action buttons routing to /shop, /login, and /', async () => {
      mockLogout.mockResolvedValueOnce(undefined)

      render(<LogoutPage />)

      await waitFor(() => {
        expect(screen.getByText('Đã đăng xuất thành công')).toBeDefined()
      })

      // Shop button
      const shopLink = screen.getByRole('link', { name: /Khám phá bản vẽ/i })
      expect(shopLink.getAttribute('href')).toBe('/shop')
      const shopBtn = shopLink.closest('button')
      expect(shopBtn?.classList.contains('ant-btn-primary')).toBe(true)

      // Login button
      const loginLink = screen.getByRole('link', { name: /Đăng nhập lại/i })
      expect(loginLink.getAttribute('href')).toBe('/login')

      // Home button
      const homeLink = screen.getByRole('link', { name: /Về trang chủ/i })
      expect(homeLink.getAttribute('href')).toBe('/')
    })
  })

  // ============================================================================
  // SECTION 5: SEMANTIC <main> WRAP & METADATA (F28)
  // ============================================================================
  describe('F28: Semantic <main> Wrapping & Layout Contract', () => {
    it('wraps logout view in a semantic <main> element with appropriate layout classes', async () => {
      mockLogout.mockResolvedValueOnce(undefined)

      const page = await Logout()
      const { container } = render(page)

      const mainEl = container.querySelector('main')
      expect(mainEl).not.toBeNull()
      expect(mainEl?.tagName.toLowerCase()).toBe('main')
      expect(mainEl?.className).toContain('w-full')
      expect(mainEl?.className).toContain('min-h-[calc(100vh-200px)]')

      // Nested card container
      const cardEl = mainEl?.querySelector('.bg-card')
      expect(cardEl).not.toBeNull()
    })

    it('exports metadata with correct title and description', () => {
      expect(logoutMetadata.title).toBe('Đăng xuất')
      expect(logoutMetadata.openGraph?.title).toBe('Đăng xuất')
      expect(logoutMetadata.openGraph?.url).toBe('/logout')
      expect(logoutMetadata.description).toContain('đăng xuất an toàn')
    })
  })
})
