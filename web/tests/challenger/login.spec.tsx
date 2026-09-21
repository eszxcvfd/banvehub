import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'
import { LoginForm, isSafeRedirect } from '@/components/forms/LoginForm'
import { LoginBanner } from '@/app/(app)/login/LoginBanner'
import Login, { metadata } from '@/app/(app)/login/page'

// Mock next/navigation
const mockRouterPush = vi.fn()
const mockRedirect = vi.fn()
let mockSearchParams = new URLSearchParams()

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockRouterPush,
  }),
  useSearchParams: () => mockSearchParams,
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
    // The login page states the real published-product count (no fabricated "50.000+")
    count: vi.fn(async () => ({ totalDocs: 140 })),
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

// Mock sonner toast
const { mockToast } = vi.hoisted(() => ({
  mockToast: {
    info: vi.fn(),
    error: vi.fn(),
    success: vi.fn(),
  },
}))

vi.mock('sonner', () => ({
  toast: mockToast,
}))

// Mock useAuth provider
const mockLogin = vi.fn()
vi.mock('@/providers/Auth', () => ({
  useAuth: () => ({
    login: mockLogin,
    user: null,
  }),
}))

describe('Challenger Suite: E-commerce Modern Login Redesign (R1, R2, R3)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSearchParams = new URLSearchParams()
    mockAuth.mockResolvedValue({ user: null })
  })

  afterEach(() => {
    cleanup()
  })

  describe('R1: Modern Split-Screen Branding Column (LoginBanner)', () => {
    it('renders platform branding, headline, and 4 core value propositions', () => {
      render(<LoginBanner totalProducts={140} />)

      // Branding & headline
      expect(screen.getByText('KienTaoHub')).toBeDefined()
      expect(screen.getByText('Kho tài nguyên bản vẽ CAD, BIM & mô hình 3D bản quyền')).toBeDefined()
      expect(screen.getByText('Sàn giao dịch số 1 cho Kỹ sư & KTS')).toBeDefined()

      // 4 Core Value Propositions
      expect(screen.getByText('Tải xuống tức thì & Lưu trữ vĩnh viễn')).toBeDefined()
      expect(screen.getByText('Kiểm duyệt kỹ thuật chuẩn xác 100%')).toBeDefined()
      expect(screen.getByText('Bảo vệ quyền lợi & Hỗ trợ kỹ thuật 24/7')).toBeDefined()

      // Trust metrics: the resource count is the one passed in, never a fabricated 50.000+
      expect(screen.getByText('140+')).toBeDefined()
      expect(screen.getByText('Tài nguyên CAD/3D')).toBeDefined()
      expect(screen.getByText('Thẩm định an toàn')).toBeDefined()

      // No fabricated social proof: `reviews` holds no rows, and no points model exists
      expect(screen.queryByText('4.9 / 5.0')).toBeNull()
      expect(screen.queryByText('12.000+ đánh giá tin cậy')).toBeNull()
      expect(screen.queryByText('Đã xác thực')).toBeNull()
      expect(screen.queryByText('Tích xu thưởng & Quyền lợi thành viên')).toBeNull()
    })
  })

  describe('R1: Split-Screen Page Container & Support Features (Login page.tsx)', () => {
    it('redirects already authenticated user to /account with warning parameter', async () => {
      mockAuth.mockResolvedValueOnce({ user: { id: 'user-123', email: 'user@kientaohub.vn' } })

      await Login()

      expect(mockRedirect).toHaveBeenCalledWith(
        `/account?warning=${encodeURIComponent('You are already logged in.')}`,
      )
    })

    it('renders split-screen layout with support hotline, admin link, and back-to-home for unauthenticated visitors', async () => {
      mockAuth.mockResolvedValueOnce({ user: null })

      const page = await Login()
      render(page)

      // Heading and subheader
      expect(screen.getByText('Đăng nhập tài khoản')).toBeDefined()
      expect(
        screen.getByText('Truy cập kho tài nguyên bản vẽ CAD, BIM và quản lý đơn hàng của bạn trên KienTaoHub.'),
      ).toBeDefined()

      // Back to home link
      const backHomeLink = screen.getByRole('link', { name: /Về trang chủ/i })
      expect(backHomeLink.getAttribute('href')).toBe('/')

      // Support Hotline link (clickable telephone link)
      const hotlineLink = screen.getByRole('link', { name: '1900 6868' })
      expect(hotlineLink.getAttribute('href')).toBe('tel:19006868')

      // Shop explore link
      const shopLink = screen.getByRole('link', { name: /Khám phá bản vẽ/i })
      expect(shopLink.getAttribute('href')).toBe('/shop')

      // Admin access link
      const adminLink = screen.getByRole('link', { name: /Đăng nhập trang quản trị/i })
      expect(adminLink.getAttribute('href')).toBe('/admin/collections/users')

      // Mobile trust badges
      expect(screen.getByText('Bản vẽ chuẩn')).toBeDefined()
      expect(screen.getByText('Tải tức thì')).toBeDefined()
      expect(screen.getByText('Hỗ trợ 24/7')).toBeDefined()
    })

    it('exports metadata configured with standard mergeOpenGraph and Vietnamese title', () => {
      expect(metadata.title).toBe('Đăng nhập')
      expect(metadata.description).toContain('KienTaoHub')
      expect(metadata.openGraph?.title).toBe('Đăng nhập')
      expect(metadata.openGraph?.url).toBe('/login')
    })
  })

  describe('R2: Interactive Form Elements & Ready-UI Experience', () => {
    it('renders email input, password input, social login buttons, and auxiliary links', () => {
      render(<LoginForm />)

      // Email field
      const emailInput = screen.getByLabelText('Địa chỉ Email')
      expect(emailInput).toBeDefined()
      expect(emailInput.getAttribute('type')).toBe('email')
      expect(emailInput.getAttribute('placeholder')).toBe('name@example.com')

      // Password field
      const passwordInput = screen.getByLabelText('Mật khẩu')
      expect(passwordInput).toBeDefined()
      expect(passwordInput.getAttribute('type')).toBe('password')

      // Social login buttons (Ready-UI)
      expect(screen.getByRole('button', { name: /Google/i })).toBeDefined()
      expect(screen.getByRole('button', { name: /Facebook/i })).toBeDefined()

      // Auxiliary navigation links
      const forgotLink = screen.getByRole('link', { name: /Quên mật khẩu\?/i })
      expect(forgotLink.getAttribute('href')).toBe('/forgot-password')

      const registerLink = screen.getByRole('link', { name: /Đăng ký tài khoản mới/i })
      expect(registerLink.getAttribute('href')).toBe('/create-account')

      // Primary CTA
      expect(screen.getByRole('button', { name: /Đăng nhập/i })).toBeDefined()
    })

    it('toggles password visibility between password and text with dynamic icon and aria-label', async () => {
      render(<LoginForm />)

      const passwordInput = screen.getByLabelText('Mật khẩu')
      expect(passwordInput.getAttribute('type')).toBe('password')

      const toggleButton = screen.getByRole('button', { name: 'Hiện mật khẩu' })
      expect(toggleButton).toBeDefined()

      // Click to reveal password
      fireEvent.click(toggleButton)
      expect(passwordInput.getAttribute('type')).toBe('text')
      expect(screen.getByRole('button', { name: 'Ẩn mật khẩu' })).toBeDefined()

      // Click again to conceal password
      fireEvent.click(screen.getByRole('button', { name: 'Ẩn mật khẩu' }))
      expect(passwordInput.getAttribute('type')).toBe('password')
      expect(screen.getByRole('button', { name: 'Hiện mật khẩu' })).toBeDefined()
    })

    it('triggers informational toast when clicking social login buttons without submitting form', async () => {
      render(<LoginForm />)

      const googleBtn = screen.getByRole('button', { name: /Google/i })
      const fbBtn = screen.getByRole('button', { name: /Facebook/i })

      fireEvent.click(googleBtn)
      expect(mockToast.info).toHaveBeenCalledWith(
        expect.stringContaining('Tính năng đăng nhập nhanh qua Google đang được chuẩn bị'),
      )
      expect(mockLogin).not.toHaveBeenCalled()

      fireEvent.click(fbBtn)
      expect(mockToast.info).toHaveBeenCalledWith(
        expect.stringContaining('Tính năng đăng nhập nhanh qua Facebook đang được chuẩn bị'),
      )
      expect(mockLogin).not.toHaveBeenCalled()
    })

    it('validates required fields and invalid email format with inline warnings', async () => {
      render(<LoginForm />)

      const submitBtn = screen.getByRole('button', { name: /Đăng nhập/i })
      fireEvent.click(submitBtn)

      // Required validation
      await waitFor(() => {
        expect(screen.getByText('Vui lòng nhập địa chỉ email.')).toBeDefined()
        expect(screen.getByText('Vui lòng nhập mật khẩu.')).toBeDefined()
      })
      expect(mockLogin).not.toHaveBeenCalled()

      // Invalid email format validation
      const emailInput = screen.getByLabelText('Địa chỉ Email')
      fireEvent.change(emailInput, { target: { value: 'invalid-email-string' } })
      fireEvent.click(submitBtn)

      await waitFor(() => {
        expect(screen.getByText('Địa chỉ email không hợp lệ (ví dụ: name@example.com).')).toBeDefined()
      })
      expect(mockLogin).not.toHaveBeenCalled()
    })

    it('automatically trims leading/trailing whitespace on email field and rejects whitespace-only email', async () => {
      mockLogin.mockResolvedValueOnce(undefined)
      render(<LoginForm />)

      const emailInput = screen.getByLabelText('Địa chỉ Email')
      const passwordInput = screen.getByLabelText('Mật khẩu')
      const submitBtn = screen.getByRole('button', { name: /Đăng nhập/i })

      // Test whitespace-only email
      fireEvent.change(emailInput, { target: { value: '   ' } })
      fireEvent.click(submitBtn)
      await waitFor(() => {
        expect(screen.getByText('Vui lòng nhập địa chỉ email.')).toBeDefined()
      })
      expect(mockLogin).not.toHaveBeenCalled()

      // Test email with trailing space (e.g. mobile autocomplete)
      fireEvent.change(emailInput, { target: { value: '  architect@kientaohub.vn  ' } })
      fireEvent.change(passwordInput, { target: { value: 'SecretPass123' } })
      fireEvent.click(submitBtn)

      await waitFor(() => {
        expect(mockLogin).toHaveBeenCalledWith({
          email: 'architect@kientaohub.vn',
          password: 'SecretPass123',
        })
      })
    })

    it('submits form via standard form submit event without interference from toggle button', async () => {
      mockLogin.mockResolvedValueOnce(undefined)
      const { container } = render(<LoginForm />)

      const emailInput = screen.getByLabelText('Địa chỉ Email')
      const passwordInput = screen.getByLabelText('Mật khẩu')
      const form = container.querySelector('form')!

      fireEvent.change(emailInput, { target: { value: 'engineer@kientaohub.vn' } })
      fireEvent.change(passwordInput, { target: { value: 'Revit2026' } })
      fireEvent.submit(form)

      await waitFor(() => {
        expect(mockLogin).toHaveBeenCalledWith({
          email: 'engineer@kientaohub.vn',
          password: 'Revit2026',
        })
        expect(mockRouterPush).toHaveBeenCalledWith('/account')
      })
    })
  })

  describe('R3: Auth Contract, Navigation & Open-Redirect Protection', () => {
    it('calls useAuth().login with valid credentials, redirects to /account by default, and keeps button disabled during navigation', async () => {
      mockLogin.mockResolvedValueOnce(undefined)
      render(<LoginForm />)

      const emailInput = screen.getByLabelText('Địa chỉ Email')
      const passwordInput = screen.getByLabelText('Mật khẩu')
      const submitBtn = screen.getByRole('button', { name: /Đăng nhập/i })

      fireEvent.change(emailInput, { target: { value: 'architect@kientaohub.vn' } })
      fireEvent.change(passwordInput, { target: { value: 'AutoCAD2026!' } })
      fireEvent.click(submitBtn)

      await waitFor(() => {
        expect(mockLogin).toHaveBeenCalledWith({
          email: 'architect@kientaohub.vn',
          password: 'AutoCAD2026!',
        })
        expect(mockRouterPush).toHaveBeenCalledWith('/account')
      })

      // Submit button should stay disabled during transition to prevent double submission
      expect(submitBtn.hasAttribute('disabled')).toBe(true)
    })

    it('honors standard redirect query parameter when provided', async () => {
      mockSearchParams = new URLSearchParams('redirect=/checkout')
      mockLogin.mockResolvedValueOnce(undefined)
      render(<LoginForm />)

      const emailInput = screen.getByLabelText('Địa chỉ Email')
      const passwordInput = screen.getByLabelText('Mật khẩu')
      const submitBtn = screen.getByRole('button', { name: /Đăng nhập/i })

      fireEvent.change(emailInput, { target: { value: 'buyer@kientaohub.vn' } })
      fireEvent.change(passwordInput, { target: { value: 'SecurePass123' } })
      fireEvent.click(submitBtn)

      await waitFor(() => {
        expect(mockLogin).toHaveBeenCalledTimes(1)
        expect(mockRouterPush).toHaveBeenCalledWith('/checkout')
      })
    })

    it('honors nested encoded redirect parameter (e.g. /checkout?step=2&voucher=DISCOUNT)', async () => {
      mockSearchParams = new URLSearchParams('redirect=%2Fcheckout%3Fstep%3D2%26voucher%3DDISCOUNT')
      mockLogin.mockResolvedValueOnce(undefined)
      render(<LoginForm />)

      // Links should preserve query parameters
      const forgotLink = screen.getByRole('link', { name: /Quên mật khẩu\?/i })
      expect(forgotLink.getAttribute('href')).toContain('redirect=')

      const emailInput = screen.getByLabelText('Địa chỉ Email')
      const passwordInput = screen.getByLabelText('Mật khẩu')
      const submitBtn = screen.getByRole('button', { name: /Đăng nhập/i })

      fireEvent.change(emailInput, { target: { value: 'vip@kientaohub.vn' } })
      fireEvent.change(passwordInput, { target: { value: 'VipPassword999' } })
      fireEvent.click(submitBtn)

      await waitFor(() => {
        expect(mockRouterPush).toHaveBeenCalledWith('/checkout?step=2&voucher=DISCOUNT')
      })
    })

    it('avoids redundant self-redirect loops when redirect query param points back to /login', async () => {
      mockSearchParams = new URLSearchParams('redirect=/login')
      mockLogin.mockResolvedValueOnce(undefined)
      render(<LoginForm />)

      const emailInput = screen.getByLabelText('Địa chỉ Email')
      const passwordInput = screen.getByLabelText('Mật khẩu')
      const submitBtn = screen.getByRole('button', { name: /Đăng nhập/i })

      fireEvent.change(emailInput, { target: { value: 'user@kientaohub.vn' } })
      fireEvent.change(passwordInput, { target: { value: 'UserPass123' } })
      fireEvent.click(submitBtn)

      await waitFor(() => {
        expect(mockRouterPush).toHaveBeenCalledWith('/account')
      })
    })

    it('safely falls back to /account on malicious external redirect attempts (Open Redirect Protection)', async () => {
      mockSearchParams = new URLSearchParams('redirect=https://evil-phishing.com/steal')
      mockLogin.mockResolvedValueOnce(undefined)
      render(<LoginForm />)

      const emailInput = screen.getByLabelText('Địa chỉ Email')
      const passwordInput = screen.getByLabelText('Mật khẩu')
      const submitBtn = screen.getByRole('button', { name: /Đăng nhập/i })

      fireEvent.change(emailInput, { target: { value: 'user@kientaohub.vn' } })
      fireEvent.change(passwordInput, { target: { value: 'UserPass123' } })
      fireEvent.click(submitBtn)

      await waitFor(() => {
        expect(mockRouterPush).toHaveBeenCalledWith('/account')
      })
    })

    it('safely falls back to /account on protocol-relative redirect attempts (//evil.com)', async () => {
      mockSearchParams = new URLSearchParams('redirect=//evil-phishing.com')
      mockLogin.mockResolvedValueOnce(undefined)
      render(<LoginForm />)

      const emailInput = screen.getByLabelText('Địa chỉ Email')
      const passwordInput = screen.getByLabelText('Mật khẩu')
      const submitBtn = screen.getByRole('button', { name: /Đăng nhập/i })

      fireEvent.change(emailInput, { target: { value: 'user@kientaohub.vn' } })
      fireEvent.change(passwordInput, { target: { value: 'UserPass123' } })
      fireEvent.click(submitBtn)

      await waitFor(() => {
        expect(mockRouterPush).toHaveBeenCalledWith('/account')
      })
    })

    it('safely falls back to /account on redirect attempts with backslashes or control characters', async () => {
      mockSearchParams = new URLSearchParams('redirect=/account\\evil.com')
      mockLogin.mockResolvedValueOnce(undefined)
      render(<LoginForm />)

      const emailInput = screen.getByLabelText('Địa chỉ Email')
      const passwordInput = screen.getByLabelText('Mật khẩu')
      const submitBtn = screen.getByRole('button', { name: /Đăng nhập/i })

      fireEvent.change(emailInput, { target: { value: 'user@kientaohub.vn' } })
      fireEvent.change(passwordInput, { target: { value: 'UserPass123' } })
      fireEvent.click(submitBtn)

      await waitFor(() => {
        expect(mockRouterPush).toHaveBeenCalledWith('/account')
      })
    })

    it('displays error message and re-enables submit button when login fails', async () => {
      mockLogin.mockRejectedValueOnce(new Error('Invalid credentials'))
      render(<LoginForm />)

      const emailInput = screen.getByLabelText('Địa chỉ Email')
      const passwordInput = screen.getByLabelText('Mật khẩu')
      const submitBtn = screen.getByRole('button', { name: /Đăng nhập/i })

      fireEvent.change(emailInput, { target: { value: 'wrong@kientaohub.vn' } })
      fireEvent.change(passwordInput, { target: { value: 'WrongPassword' } })
      fireEvent.click(submitBtn)

      await waitFor(() => {
        expect(
          screen.getByText('Thông tin đăng nhập không chính xác. Vui lòng kiểm tra lại email hoặc mật khẩu.'),
        ).toBeDefined()
      })
      expect(mockRouterPush).not.toHaveBeenCalled()
      expect(submitBtn.hasAttribute('disabled')).toBe(false)
    })
  })

  describe('R3: Unit Verification of isSafeRedirect Helper', () => {
    it('accurately distinguishes safe internal paths from dangerous or malformed redirect targets', () => {
      // Safe paths
      expect(isSafeRedirect('/account')).toBe(true)
      expect(isSafeRedirect('/checkout?step=2&voucher=DISCOUNT')).toBe(true)
      expect(isSafeRedirect('/shop#catalog')).toBe(true)
      expect(isSafeRedirect('/')).toBe(true)

      // Dangerous paths
      expect(isSafeRedirect(null)).toBe(false)
      expect(isSafeRedirect('')).toBe(false)
      expect(isSafeRedirect('//evil.com')).toBe(false)
      expect(isSafeRedirect('///evil.com')).toBe(false)
      expect(isSafeRedirect('/\\evil.com')).toBe(false)
      expect(isSafeRedirect('/account\\evil.com')).toBe(false)
      expect(isSafeRedirect('https://evil.com')).toBe(false)
      expect(isSafeRedirect('http://evil.com')).toBe(false)
      expect(isSafeRedirect('javascript:alert(1)')).toBe(false)
      expect(isSafeRedirect('/\tevil.com')).toBe(false)
      expect(isSafeRedirect('/\nevil.com')).toBe(false)
    })
  })
})
