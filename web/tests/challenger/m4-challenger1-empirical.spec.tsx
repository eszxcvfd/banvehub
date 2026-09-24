import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'
import { LoginForm, isSafeRedirect } from '@/components/forms/LoginForm'
import { CreateAccountForm } from '@/components/forms/CreateAccountForm'

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

describe('Milestone 4 Challenger 1: Empirical Authentication Stress Tests', () => {
  const originalFetch = global.fetch

  beforeEach(() => {
    vi.clearAllMocks()
    mockSearchParams = new URLSearchParams()
    global.fetch = vi.fn()
  })

  afterEach(() => {
    cleanup()
    global.fetch = originalFetch
  })

  // =========================================================================
  // TASK 1 & 7: Login Form Field Validation & Exact Attributes
  // =========================================================================
  describe('Task 1 & 7: Login Form Validation & Input Attributes', () => {
    it('declares exact name="email" and name="password" attributes on rendered inputs', () => {
      const { container } = render(<LoginForm />)

      const emailInput = container.querySelector('input[name="email"]')
      const passwordInput = container.querySelector('input[name="password"]')

      expect(emailInput).not.toBeNull()
      expect(emailInput?.getAttribute('name')).toBe('email')
      expect(emailInput?.getAttribute('id')).toBe('email')
      expect(emailInput?.getAttribute('type')).toBe('email')

      expect(passwordInput).not.toBeNull()
      expect(passwordInput?.getAttribute('name')).toBe('password')
      expect(passwordInput?.getAttribute('id')).toBe('password')
      expect(passwordInput?.getAttribute('type')).toBe('password')
    })

    it('rejects empty submission with localized required error messages', async () => {
      render(<LoginForm />)

      const submitBtn = screen.getByRole('button', { name: /Đăng nhập/i })
      fireEvent.click(submitBtn)

      await waitFor(() => {
        expect(screen.getByText('Vui lòng nhập địa chỉ email.')).toBeDefined()
        expect(screen.getByText('Vui lòng nhập mật khẩu.')).toBeDefined()
      })

      expect(mockLogin).not.toHaveBeenCalled()
    })

    it('rejects whitespace-only email string', async () => {
      render(<LoginForm />)

      const emailInput = screen.getByLabelText('Địa chỉ Email')
      const submitBtn = screen.getByRole('button', { name: /Đăng nhập/i })

      fireEvent.change(emailInput, { target: { value: '    ' } })
      fireEvent.click(submitBtn)

      await waitFor(() => {
        expect(screen.getByText('Vui lòng nhập địa chỉ email.')).toBeDefined()
      })

      expect(mockLogin).not.toHaveBeenCalled()
    })

    it('rejects various malformed email format permutations', async () => {
      const malformedEmails = [
        'plainaddress',
        '@missingusername.com',
        'username@.com',
        'username@domain',
        'username@domain,com',
      ]

      for (const badEmail of malformedEmails) {
        cleanup()
        render(<LoginForm />)

        const emailInput = screen.getByLabelText('Địa chỉ Email')
        const submitBtn = screen.getByRole('button', { name: /Đăng nhập/i })

        fireEvent.change(emailInput, { target: { value: badEmail } })
        fireEvent.click(submitBtn)

        await waitFor(() => {
          expect(
            screen.getByText('Địa chỉ email không hợp lệ (ví dụ: name@example.com).'),
          ).toBeDefined()
        })
        expect(mockLogin).not.toHaveBeenCalled()
      }
    })

    it('trims leading and trailing whitespace on valid email before submitting to login API', async () => {
      mockLogin.mockResolvedValueOnce(undefined)
      render(<LoginForm />)

      const emailInput = screen.getByLabelText('Địa chỉ Email')
      const passwordInput = screen.getByLabelText('Mật khẩu')
      const submitBtn = screen.getByRole('button', { name: /Đăng nhập/i })

      fireEvent.change(emailInput, { target: { value: '   engineer@kientaohub.vn   ' } })
      fireEvent.change(passwordInput, { target: { value: 'StrongPassword123' } })
      fireEvent.click(submitBtn)

      await waitFor(() => {
        expect(mockLogin).toHaveBeenCalledTimes(1)
        expect(mockLogin).toHaveBeenCalledWith({
          email: 'engineer@kientaohub.vn',
          password: 'StrongPassword123',
        })
        expect(mockRouterPush).toHaveBeenCalledWith('/account')
      })
    })
  })

  // =========================================================================
  // TASK 2: Password Toggle Button Accessibility
  // =========================================================================
  describe('Task 2: Password Toggle Button Accessibility', () => {
    it('provides accessible toggle with exact aria-label="Hiện mật khẩu" and "Ẩn mật khẩu"', async () => {
      render(<LoginForm />)

      const passwordInput = screen.getByLabelText('Mật khẩu')
      expect(passwordInput.getAttribute('type')).toBe('password')

      // Initial state: password hidden, button invites to show
      const showBtn = screen.getByRole('button', { name: 'Hiện mật khẩu' })
      expect(showBtn).toBeDefined()
      expect(showBtn.getAttribute('aria-label')).toBe('Hiện mật khẩu')
      expect(showBtn.getAttribute('title')).toBe('Hiện mật khẩu')
      expect(showBtn.getAttribute('type')).toBe('button')

      // Click to reveal password
      fireEvent.click(showBtn)
      expect(passwordInput.getAttribute('type')).toBe('text')

      // Revealed state: password shown, button invites to hide
      const hideBtn = screen.getByRole('button', { name: 'Ẩn mật khẩu' })
      expect(hideBtn).toBeDefined()
      expect(hideBtn.getAttribute('aria-label')).toBe('Ẩn mật khẩu')
      expect(hideBtn.getAttribute('title')).toBe('Ẩn mật khẩu')

      // Click again to conceal password
      fireEvent.click(hideBtn)
      expect(passwordInput.getAttribute('type')).toBe('password')
      expect(screen.getByRole('button', { name: 'Hiện mật khẩu' })).toBeDefined()
    })
  })

  // =========================================================================
  // TASK 3: isSafeRedirect Open Redirect Prevention
  // =========================================================================
  describe('Task 3: isSafeRedirect Open Redirect Attack Defense', () => {
    it('accepts legitimate internal application paths', () => {
      expect(isSafeRedirect('/account')).toBe(true)
      expect(isSafeRedirect('/checkout')).toBe(true)
      expect(isSafeRedirect('/checkout?step=2&voucher=DISCOUNT')).toBe(true)
      expect(isSafeRedirect('/shop?sort=-createdAt&category=cad-drawings')).toBe(true)
      expect(isSafeRedirect('/products/ban-ve-biet-thu-2-tang')).toBe(true)
      expect(isSafeRedirect('/')).toBe(true)
    })

    it('rejects protocol-relative open redirects (//evil.com)', () => {
      expect(isSafeRedirect('//evil.com')).toBe(false)
      expect(isSafeRedirect('//evil.com/phishing')).toBe(false)
      expect(isSafeRedirect('///evil.com')).toBe(false)
      expect(isSafeRedirect('////evil.com')).toBe(false)
    })

    it('rejects absolute URLs pointing to external domains', () => {
      expect(isSafeRedirect('https://phishing.com')).toBe(false)
      expect(isSafeRedirect('https://evil.com/steal-credentials')).toBe(false)
      expect(isSafeRedirect('http://phishing.com')).toBe(false)
      expect(isSafeRedirect('ftp://evil.com')).toBe(false)
    })

    it('rejects backslash path traversal and evasion attacks', () => {
      expect(isSafeRedirect('/\\evil.com')).toBe(false)
      expect(isSafeRedirect('/account\\evil.com')).toBe(false)
      expect(isSafeRedirect('\\evil.com')).toBe(false)
      expect(isSafeRedirect('\\\\evil.com')).toBe(false)
    })

    it('rejects control characters, newlines, and tabs', () => {
      expect(isSafeRedirect('/\tevil.com')).toBe(false)
      expect(isSafeRedirect('/\nevil.com')).toBe(false)
      expect(isSafeRedirect('/\revil.com')).toBe(false)
      expect(isSafeRedirect('/account\u0000evil.com')).toBe(false)
      expect(isSafeRedirect('/account\u001fevil.com')).toBe(false)
      expect(isSafeRedirect('/account\u007fevil.com')).toBe(false)
    })

    it('rejects null, empty, or whitespace strings', () => {
      expect(isSafeRedirect(null)).toBe(false)
      expect(isSafeRedirect('')).toBe(false)
      expect(isSafeRedirect('   ')).toBe(false)
    })

    it('rejects javascript: and data: pseudo-protocols', () => {
      expect(isSafeRedirect('javascript:alert(1)')).toBe(false)
      expect(isSafeRedirect('data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==')).toBe(
        false,
      )
    })

    it('safely redirects to /account when login query param contains open redirect attack vector', async () => {
      mockSearchParams = new URLSearchParams('redirect=//evil-attacker.com/steal')
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
  })

  // =========================================================================
  // TASK 4: Credential Error Alert on 401 Response
  // =========================================================================
  describe('Task 4: Credential Error Alert Display on 401 Response', () => {
    it('displays Ant Design Alert with error message and re-enables submit button', async () => {
      mockLogin.mockRejectedValueOnce(new Error('Unauthorized: Invalid credentials'))
      render(<LoginForm />)

      const emailInput = screen.getByLabelText('Địa chỉ Email')
      const passwordInput = screen.getByLabelText('Mật khẩu')
      const submitBtn = screen.getByRole('button', { name: /Đăng nhập/i })

      fireEvent.change(emailInput, { target: { value: 'wrong@kientaohub.vn' } })
      fireEvent.change(passwordInput, { target: { value: 'WrongPassword999' } })
      fireEvent.click(submitBtn)

      await waitFor(() => {
        const alertMsg = screen.getByText(
          'Thông tin đăng nhập không chính xác. Vui lòng kiểm tra lại email hoặc mật khẩu.',
        )
        expect(alertMsg).toBeDefined()
        // Check Ant Design Alert container
        const alertEl = alertMsg.closest('.ant-alert-error')
        expect(alertEl).not.toBeNull()
      })

      // Ensure button is re-enabled to allow retry
      expect(submitBtn.hasAttribute('disabled')).toBe(false)
      expect(mockRouterPush).not.toHaveBeenCalled()

      // Subsequent successful submission clears error
      mockLogin.mockResolvedValueOnce(undefined)
      fireEvent.change(passwordInput, { target: { value: 'CorrectPassword123' } })
      fireEvent.click(submitBtn)

      await waitFor(() => {
        expect(mockRouterPush).toHaveBeenCalledWith('/account')
        expect(
          screen.queryByText(
            'Thông tin đăng nhập không chính xác. Vui lòng kiểm tra lại email hoặc mật khẩu.',
          ),
        ).toBeNull()
      })
    })
  })

  // =========================================================================
  // TASK 5 & 7: Registration Form Password Confirmation Mismatch (T2-B2)
  // =========================================================================
  describe('Task 5 & 7: Registration Form & Password Confirmation Validator', () => {
    it('declares exact name="email", name="password", and name="passwordConfirm" attributes', () => {
      const { container } = render(<CreateAccountForm />)

      const emailInput = container.querySelector('input[name="email"]')
      const passwordInput = container.querySelector('input[name="password"]')
      const confirmInput = container.querySelector('input[name="passwordConfirm"]')

      expect(emailInput).not.toBeNull()
      expect(emailInput?.getAttribute('name')).toBe('email')
      expect(emailInput?.getAttribute('id')).toBe('email')

      expect(passwordInput).not.toBeNull()
      expect(passwordInput?.getAttribute('name')).toBe('password')
      expect(passwordInput?.getAttribute('id')).toBe('password')

      expect(confirmInput).not.toBeNull()
      expect(confirmInput?.getAttribute('name')).toBe('passwordConfirm')
      expect(confirmInput?.getAttribute('id')).toBe('passwordConfirm')
    })

    it('blocks submission when password and passwordConfirm do not match (T2-B2)', async () => {
      render(<CreateAccountForm />)

      const emailInput = screen.getByLabelText('Địa chỉ Email')
      const passwordInput = screen.getByLabelText('Mật khẩu')
      const confirmInput = screen.getByLabelText('Xác nhận mật khẩu')
      const submitBtn = screen.getByRole('button', { name: /Create Account/i })

      fireEvent.change(emailInput, { target: { value: 'newuser@kientaohub.vn' } })
      fireEvent.change(passwordInput, { target: { value: 'SecretPass123' } })
      fireEvent.change(confirmInput, { target: { value: 'MismatchedPass999' } })
      fireEvent.click(submitBtn)

      await waitFor(() => {
        expect(screen.getByText('Mật khẩu xác nhận không khớp!')).toBeDefined()
      })

      // Crucial: fetch must NOT be called when validation fails
      expect(global.fetch).not.toHaveBeenCalled()
      expect(mockLogin).not.toHaveBeenCalled()
    })

    it('dynamically triggers mismatch error when password is changed after matching confirm', async () => {
      render(<CreateAccountForm />)

      const passwordInput = screen.getByLabelText('Mật khẩu')
      const confirmInput = screen.getByLabelText('Xác nhận mật khẩu')

      // Set initially matching values
      fireEvent.change(passwordInput, { target: { value: 'SamePass123' } })
      fireEvent.change(confirmInput, { target: { value: 'SamePass123' } })

      // Error should not appear
      expect(screen.queryByText('Mật khẩu xác nhận không khớp!')).toBeNull()

      // Now alter password field so they mismatch
      fireEvent.change(passwordInput, { target: { value: 'DifferentPass456' } })

      // Due to dependencies={['password']}, validator re-runs
      await waitFor(() => {
        expect(screen.getByText('Mật khẩu xác nhận không khớp!')).toBeDefined()
      })
    })

    it('enforces minimum 6-character password constraint', async () => {
      render(<CreateAccountForm />)

      const passwordInput = screen.getByLabelText('Mật khẩu')
      const submitBtn = screen.getByRole('button', { name: /Create Account/i })

      fireEvent.change(passwordInput, { target: { value: '12345' } })
      fireEvent.click(submitBtn)

      await waitFor(() => {
        expect(screen.getByText('Mật khẩu phải có ít nhất 6 ký tự.')).toBeDefined()
      })
      expect(global.fetch).not.toHaveBeenCalled()
    })
  })

  // =========================================================================
  // TASK 6: Successful Registration Auto-Login and Session Redirect
  // =========================================================================
  describe('Task 6: Registration Auto-Login & Session Redirection', () => {
    it('registers user, executes auto-login, and redirects to /account with success query param', async () => {
      const mockUserDoc = { id: 'user-new-456', email: 'newcreator@kientaohub.vn' }
      ;(global.fetch as any).mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: async () => ({ doc: mockUserDoc }),
      })
      mockLogin.mockResolvedValueOnce(undefined)

      render(<CreateAccountForm />)

      const emailInput = screen.getByLabelText('Địa chỉ Email')
      const passwordInput = screen.getByLabelText('Mật khẩu')
      const confirmInput = screen.getByLabelText('Xác nhận mật khẩu')
      const submitBtn = screen.getByRole('button', { name: /Create Account/i })

      fireEvent.change(emailInput, { target: { value: '  newcreator@kientaohub.vn  ' } })
      fireEvent.change(passwordInput, { target: { value: 'CreatorPass2026!' } })
      fireEvent.change(confirmInput, { target: { value: 'CreatorPass2026!' } })
      fireEvent.click(submitBtn)

      await waitFor(() => {
        // Verify POST payload sends trimmed email
        expect(global.fetch).toHaveBeenCalledTimes(1)
        const fetchCall = (global.fetch as any).mock.calls[0]
        const requestBody = JSON.parse(fetchCall[1].body)
        expect(requestBody.email).toBe('newcreator@kientaohub.vn')
        expect(requestBody.password).toBe('CreatorPass2026!')
        expect(requestBody.passwordConfirm).toBe('CreatorPass2026!')

        // Verify auto-login was called
        expect(mockLogin).toHaveBeenCalledTimes(1)
        expect(mockLogin).toHaveBeenCalledWith({
          email: 'newcreator@kientaohub.vn',
          password: 'CreatorPass2026!',
        })

        // Verify router push to /account?success=...
        expect(mockRouterPush).toHaveBeenCalledWith(
          '/account?success=Account%20created%20successfully',
        )
      })
    })

    it('honors safe redirect query parameter on registration auto-login', async () => {
      mockSearchParams = new URLSearchParams('redirect=/shop')
      ;(global.fetch as any).mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: async () => ({ doc: { id: 'user-789' } }),
      })
      mockLogin.mockResolvedValueOnce(undefined)

      render(<CreateAccountForm />)

      const emailInput = screen.getByLabelText('Địa chỉ Email')
      const passwordInput = screen.getByLabelText('Mật khẩu')
      const confirmInput = screen.getByLabelText('Xác nhận mật khẩu')
      const submitBtn = screen.getByRole('button', { name: /Create Account/i })

      fireEvent.change(emailInput, { target: { value: 'shopper@kientaohub.vn' } })
      fireEvent.change(passwordInput, { target: { value: 'ShopperPass2026' } })
      fireEvent.change(confirmInput, { target: { value: 'ShopperPass2026' } })
      fireEvent.click(submitBtn)

      await waitFor(() => {
        expect(mockRouterPush).toHaveBeenCalledWith('/shop')
      })
    })

    it('sanitizes malicious open-redirect parameter on registration and defaults to /account', async () => {
      mockSearchParams = new URLSearchParams('redirect=https://phishing.attacker.com/steal')
      ;(global.fetch as any).mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: async () => ({ doc: { id: 'user-789' } }),
      })
      mockLogin.mockResolvedValueOnce(undefined)

      render(<CreateAccountForm />)

      const emailInput = screen.getByLabelText('Địa chỉ Email')
      const passwordInput = screen.getByLabelText('Mật khẩu')
      const confirmInput = screen.getByLabelText('Xác nhận mật khẩu')
      const submitBtn = screen.getByRole('button', { name: /Create Account/i })

      fireEvent.change(emailInput, { target: { value: 'safeuser@kientaohub.vn' } })
      fireEvent.change(passwordInput, { target: { value: 'SafePassword123' } })
      fireEvent.change(confirmInput, { target: { value: 'SafePassword123' } })
      fireEvent.click(submitBtn)

      await waitFor(() => {
        expect(mockRouterPush).toHaveBeenCalledWith(
          '/account?success=Account%20created%20successfully',
        )
      })
    })

    it('displays error Alert when backend registration returns 400 (e.g. duplicate email)', async () => {
      ;(global.fetch as any).mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: async () => ({
          errors: [{ message: 'Email đã được đăng ký trong hệ thống.' }],
        }),
      })

      render(<CreateAccountForm />)

      const emailInput = screen.getByLabelText('Địa chỉ Email')
      const passwordInput = screen.getByLabelText('Mật khẩu')
      const confirmInput = screen.getByLabelText('Xác nhận mật khẩu')
      const submitBtn = screen.getByRole('button', { name: /Create Account/i })

      fireEvent.change(emailInput, { target: { value: 'existing@kientaohub.vn' } })
      fireEvent.change(passwordInput, { target: { value: 'ExistingPass123' } })
      fireEvent.change(confirmInput, { target: { value: 'ExistingPass123' } })
      fireEvent.click(submitBtn)

      await waitFor(() => {
        const errorMsg = screen.getByText('Email đã được đăng ký trong hệ thống.')
        expect(errorMsg).toBeDefined()
        const alertContainer = errorMsg.closest('.ant-alert-error')
        expect(alertContainer).not.toBeNull()
      })

      expect(mockLogin).not.toHaveBeenCalled()
      expect(mockRouterPush).not.toHaveBeenCalled()
    })

    it('handles auto-login failure gracefully when account creation succeeds but auto-login fails', async () => {
      ;(global.fetch as any).mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: async () => ({ doc: { id: 'u1' } }),
      })
      mockLogin.mockRejectedValueOnce(new Error('Auth service temporarily unavailable'))

      render(<CreateAccountForm />)

      const emailInput = screen.getByLabelText('Địa chỉ Email')
      const passwordInput = screen.getByLabelText('Mật khẩu')
      const confirmInput = screen.getByLabelText('Xác nhận mật khẩu')
      const submitBtn = screen.getByRole('button', { name: /Create Account/i })

      fireEvent.change(emailInput, { target: { value: 'autologinfail@kientaohub.vn' } })
      fireEvent.change(passwordInput, { target: { value: 'ValidPassword123' } })
      fireEvent.change(confirmInput, { target: { value: 'ValidPassword123' } })
      fireEvent.click(submitBtn)

      await waitFor(() => {
        expect(
          screen.getByText(
            'Tài khoản đã tạo thành công nhưng không thể tự động đăng nhập. Vui lòng đăng nhập thủ công.',
          ),
        ).toBeDefined()
      })
    })
  })
})
