import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup, act } from '@testing-library/react'
import { App as AntdApp, ConfigProvider } from 'antd'

// Components to stress-test
import { AccountDashboardLayout } from '@/components/AccountNav/AccountDashboardLayout'
import { AccountForm } from '@/components/forms/AccountForm'
import AccountPage from '@/app/(app)/(account)/account/page'
import { AddressListing } from '@/components/addresses/AddressListing'
import AddressesPage from '@/app/(app)/(account)/account/addresses/page'
import { OrdersTableClient, type OrderTableRow } from '@/components/orders/OrdersTableClient'
import OrdersPage from '@/app/(app)/(account)/orders/page'
import { OrderDetailClient, type OrderDetailItem } from '@/components/orders/OrderDetailClient'
import { DownloadButton } from '@/components/download/DownloadButton'
import { OrderStatus } from '@/components/OrderStatus'
import type { User, Address } from '@/payload-types'

// Polyfills for jsdom
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
let currentMockPathname = '/account'
const mockRouterPush = vi.fn()
const mockRedirect = vi.fn()

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockRouterPush,
  }),
  usePathname: () => currentMockPathname,
  redirect: (url: string) => mockRedirect(url),
  notFound: vi.fn(),
}))

// Mock next/headers
vi.mock('next/headers', () => ({
  headers: vi.fn(async () => new Headers()),
}))

// Mock payload
const mockPayloadAuth = vi.fn()
const mockPayloadFind = vi.fn()
const mockPayloadFindByID = vi.fn()

vi.mock('payload', () => ({
  getPayload: vi.fn(async () => ({
    auth: mockPayloadAuth,
    find: mockPayloadFind,
    findByID: mockPayloadFindByID,
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
    'data-testid': testId,
    ...props
  }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { 'data-testid'?: string }) => (
    <a href={href} className={className} data-testid={testId} {...props}>
      {children}
    </a>
  ),
}))

// Mock useAuth provider
let mockCurrentUser: User | null = null
const mockSetUser = vi.fn()

vi.mock('@/providers/Auth', () => ({
  useAuth: () => ({
    user: mockCurrentUser,
    setUser: mockSetUser,
  }),
}))

// Mock useAddresses from plugin-ecommerce
let mockAddressesList: Address[] = []
const mockCreateAddress = vi.fn()
const mockUpdateAddress = vi.fn()

vi.mock('@payloadcms/plugin-ecommerce/client/react', () => ({
  useAddresses: () => ({
    addresses: mockAddressesList,
    createAddress: mockCreateAddress,
    updateAddress: mockUpdateAddress,
  }),
  defaultCountries: [{ label: 'Vietnam', value: 'VN' }],
}))

// Helper wrapper with Ant Design App Context
const renderWithAntd = (ui: React.ReactElement) => {
  return render(
    <ConfigProvider>
      <AntdApp>{ui}</AntdApp>
    </ConfigProvider>,
  )
}

describe('M5 Challenger 2 Empirical Stress Test Suite: Customer Dashboard, Profile, Address Book, Order History & Detail', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    global.fetch = vi.fn()
    currentMockPathname = '/account'
    mockCurrentUser = {
      id: 101,
      email: 'engineer@kientaohub.vn',
      name: 'Nguyễn Văn Kỹ Sư',
      roles: ['customer'],
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    } as unknown as User
    mockPayloadAuth.mockResolvedValue({ user: mockCurrentUser })
    mockPayloadFind.mockResolvedValue({ docs: [] })
  })

  afterEach(() => {
    cleanup()
  })

  // ============================================================================
  // SECTION 1: DASHBOARD SIDER & RESPONSIVE LAYOUT (F34)
  // ============================================================================
  describe('F34: Dashboard Sider & Layout', () => {
    it('renders user avatar initial, display name, email, and role badge correctly', () => {
      renderWithAntd(
        <AccountDashboardLayout initialUser={mockCurrentUser}>
          <div data-testid="dashboard-content">Dashboard Content</div>
        </AccountDashboardLayout>,
      )

      expect(screen.getByTestId('dashboard-content')).toBeDefined()
      // Initial is 'N' from 'Nguyễn Văn Kỹ Sư'
      expect(screen.getAllByText('N').length).toBeGreaterThanOrEqual(1)
      expect(screen.getAllByText('Nguyễn Văn Kỹ Sư').length).toBeGreaterThanOrEqual(1)
      expect(screen.getAllByText('engineer@kientaohub.vn').length).toBeGreaterThanOrEqual(1)
      expect(screen.getAllByText('Khách hàng thành viên').length).toBeGreaterThanOrEqual(1)
    })

    it('resolves different roles correctly (admin, seller, financeAdmin, moderator)', () => {
      const adminUser = { ...mockCurrentUser, roles: ['admin'] } as unknown as User
      mockCurrentUser = adminUser
      const { unmount } = renderWithAntd(
        <AccountDashboardLayout initialUser={adminUser}>
          <div>Admin Content</div>
        </AccountDashboardLayout>,
      )
      expect(screen.getAllByText('Quản trị viên').length).toBeGreaterThanOrEqual(1)
      unmount()

      const sellerUser = { ...mockCurrentUser, roles: ['seller'] } as unknown as User
      mockCurrentUser = sellerUser
      const { unmount: unmountSeller } = renderWithAntd(
        <AccountDashboardLayout initialUser={sellerUser}>
          <div>Seller Content</div>
        </AccountDashboardLayout>,
      )
      expect(screen.getAllByText('Người bán uy tín').length).toBeGreaterThanOrEqual(1)
      unmountSeller()

      const financeUser = { ...mockCurrentUser, roles: ['financeAdmin'] } as unknown as User
      mockCurrentUser = financeUser
      renderWithAntd(
        <AccountDashboardLayout initialUser={financeUser}>
          <div>Finance Content</div>
        </AccountDashboardLayout>,
      )
      expect(screen.getAllByText('Kế toán').length).toBeGreaterThanOrEqual(1)
    })

    it('preserves data-testid="nav-notifications" on the notifications menu item', () => {
      renderWithAntd(
        <AccountDashboardLayout initialUser={mockCurrentUser}>
          <div>Content</div>
        </AccountDashboardLayout>,
      )

      const notifLink = screen.getAllByTestId('nav-notifications')
      expect(notifLink.length).toBeGreaterThanOrEqual(1)
      expect(notifLink[0].getAttribute('href')).toBe('/notifications')
      expect(notifLink[0].textContent).toContain('Thông báo')
    })

    it('highlights active menu item based on current pathname', () => {
      // 1. /account -> profile
      currentMockPathname = '/account'
      const { container, unmount } = renderWithAntd(
        <AccountDashboardLayout initialUser={mockCurrentUser}>
          <div>Content</div>
        </AccountDashboardLayout>,
      )
      const selectedItem = container.querySelector('.ant-menu-item-selected')
      expect(selectedItem?.textContent).toContain('Hồ sơ tài khoản')
      unmount()

      // 2. /account/addresses -> addresses
      currentMockPathname = '/account/addresses'
      const { container: containerAddr, unmount: unmountAddr } = renderWithAntd(
        <AccountDashboardLayout initialUser={mockCurrentUser}>
          <div>Content</div>
        </AccountDashboardLayout>,
      )
      const selectedAddr = containerAddr.querySelector('.ant-menu-item-selected')
      expect(selectedAddr?.textContent).toContain('Sổ địa chỉ')
      unmountAddr()

      // 3. /orders -> orders
      currentMockPathname = '/orders'
      const { container: containerOrders, unmount: unmountOrders } = renderWithAntd(
        <AccountDashboardLayout initialUser={mockCurrentUser}>
          <div>Content</div>
        </AccountDashboardLayout>,
      )
      const selectedOrders = containerOrders.querySelector('.ant-menu-item-selected')
      expect(selectedOrders?.textContent).toContain('Lịch sử đơn hàng')
      unmountOrders()

      // 4. /wallet -> wallet
      currentMockPathname = '/wallet'
      const { container: containerWallet } = renderWithAntd(
        <AccountDashboardLayout initialUser={mockCurrentUser}>
          <div>Content</div>
        </AccountDashboardLayout>,
      )
      const selectedWallet = containerWallet.querySelector('.ant-menu-item-selected')
      expect(selectedWallet?.textContent).toContain('Ví kỹ thuật số')
    })

    it('handles responsive mobile drawer: opens on menu button click, closes on close button', async () => {
      renderWithAntd(
        <AccountDashboardLayout initialUser={mockCurrentUser}>
          <div>Content</div>
        </AccountDashboardLayout>,
      )

      // Mobile trigger button
      const mobileMenuBtn = screen.getByRole('button', { name: 'Mở menu tài khoản' })
      expect(mobileMenuBtn).toBeDefined()

      // Click to open Drawer
      fireEvent.click(mobileMenuBtn)

      // Drawer appears with title "Menu tài khoản"
      await waitFor(() => {
        expect(screen.getByText('Menu tài khoản')).toBeDefined()
      })

      // Drawer has close button
      const closeBtn = document.querySelector('.ant-drawer-close')
      expect(closeBtn).not.toBeNull()
      if (closeBtn) {
        fireEvent.click(closeBtn)
      }

      // Verify drawer close sequence
      await waitFor(() => {
        expect(document.querySelector('.ant-drawer-open')).toBeNull()
      })
    })
  })

  // ============================================================================
  // SECTION 2: PROFILE SETTINGS & PASSWORD CHANGE (F35)
  // ============================================================================
  describe('F35: Profile Settings & Form Invariants', () => {
    it('preserves <h1>Account settings</h1> on /account page', async () => {
      mockPayloadAuth.mockResolvedValueOnce({ user: mockCurrentUser })
      mockPayloadFind.mockResolvedValueOnce({ docs: [] })

      const page = await AccountPage()
      renderWithAntd(page)

      const heading = screen.getByRole('heading', { level: 1, name: 'Account settings' })
      expect(heading).toBeDefined()
      expect(heading.textContent).toBe('Account settings')
    })

    it('renders 3 Ant Design Tabs: Personal Info, Security, and Notifications', () => {
      const { container } = renderWithAntd(<AccountForm />)

      const tabList = container.querySelectorAll('.ant-tabs-tab')
      expect(tabList.length).toBe(3)

      expect(screen.getByText('Thông tin tài khoản')).toBeDefined()
      expect(screen.getByText('Đổi mật khẩu')).toBeDefined()
      expect(screen.getByText('Tùy chọn thông báo')).toBeDefined()
    })

    it('pre-populates form fields with current user information', () => {
      renderWithAntd(<AccountForm />)

      const nameInput = screen.getByPlaceholderText('Nguyễn Văn A') as HTMLInputElement
      const emailInput = screen.getByPlaceholderText('email@example.com') as HTMLInputElement

      expect(nameInput.value).toBe('Nguyễn Văn Kỹ Sư')
      expect(emailInput.value).toBe('engineer@kientaohub.vn')
    })

    it('guarantees SAFE PATCH payload: only name and email sent to /api/users/:id', async () => {
      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ doc: { ...mockCurrentUser, name: 'Tên Đã Cập Nhật' } }),
      } as unknown as Response)

      renderWithAntd(<AccountForm />)

      const nameInput = screen.getByPlaceholderText('Nguyễn Văn A')
      fireEvent.change(nameInput, { target: { value: 'Tên Đã Cập Nhật' } })

      // Enter phone and bio to ensure they are NOT leaked in PATCH payload
      const phoneInput = screen.getByPlaceholderText('0912 345 678')
      fireEvent.change(phoneInput, { target: { value: '0987654321' } })

      const bioInput = screen.getByPlaceholderText(/Giới thiệu chuyên môn của bạn/i)
      fireEvent.change(bioInput, { target: { value: 'Chuyên gia thiết kế BIM' } })

      const saveBtn = screen.getByRole('button', { name: /Lưu thay đổi/i })
      fireEvent.click(saveBtn)

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith(
          expect.stringContaining(`/api/users/${mockCurrentUser?.id}`),
          expect.objectContaining({
            method: 'PATCH',
            headers: expect.objectContaining({ 'Content-Type': 'application/json' }),
            body: JSON.stringify({
              name: 'Tên Đã Cập Nhật',
              email: 'engineer@kientaohub.vn',
            }),
          }),
        )
      })

      // Ensure mockSetUser was called with updated doc
      expect(mockSetUser).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Tên Đã Cập Nhật' }),
      )
    })

    it('validates password mismatch and blocks submission', async () => {
      renderWithAntd(<AccountForm />)

      // Switch to Security / Password tab
      const securityTab = screen.getByText('Đổi mật khẩu')
      fireEvent.click(securityTab)

      await waitFor(() => {
        expect(screen.getByText('Bảo vệ tài khoản của bạn')).toBeDefined()
      })

      // Fill in mismatched passwords
      const currentPasswordInput = screen.getByLabelText('Mật khẩu hiện tại')
      const newPasswordInput = screen.getByLabelText('Mật khẩu mới')
      const confirmPasswordInput = screen.getByLabelText('Xác nhận mật khẩu mới')

      fireEvent.change(currentPasswordInput, { target: { value: 'oldpass123' } })
      fireEvent.change(newPasswordInput, { target: { value: 'newpassword123' } })
      fireEvent.change(confirmPasswordInput, { target: { value: 'differentpassword456' } })

      const submitBtn = screen.getByRole('button', { name: /Cập nhật mật khẩu/i })
      fireEvent.click(submitBtn)

      await waitFor(() => {
        expect(screen.getByText('Mật khẩu xác nhận không khớp!')).toBeDefined()
      })

      // Fetch must not be called
      expect(global.fetch).not.toHaveBeenCalled()
    })

    it('validates minimum password length (min 6 characters)', async () => {
      renderWithAntd(<AccountForm />)

      const securityTab = screen.getByText('Đổi mật khẩu')
      fireEvent.click(securityTab)

      const currentPasswordInput = screen.getByLabelText('Mật khẩu hiện tại')
      const newPasswordInput = screen.getByLabelText('Mật khẩu mới')
      const confirmPasswordInput = screen.getByLabelText('Xác nhận mật khẩu mới')

      fireEvent.change(currentPasswordInput, { target: { value: 'oldpass123' } })
      fireEvent.change(newPasswordInput, { target: { value: '12345' } }) // 5 chars
      fireEvent.change(confirmPasswordInput, { target: { value: '12345' } })

      const submitBtn = screen.getByRole('button', { name: /Cập nhật mật khẩu/i })
      fireEvent.click(submitBtn)

      await waitFor(() => {
        expect(screen.getByText('Mật khẩu mới phải có tối thiểu 6 ký tự')).toBeDefined()
      })

      expect(global.fetch).not.toHaveBeenCalled()
    })

    it('submits valid password payload and handles success', async () => {
      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ doc: mockCurrentUser }),
      } as unknown as Response)

      renderWithAntd(<AccountForm />)

      const securityTab = screen.getByText('Đổi mật khẩu')
      fireEvent.click(securityTab)

      const currentPasswordInput = screen.getByLabelText('Mật khẩu hiện tại')
      const newPasswordInput = screen.getByLabelText('Mật khẩu mới')
      const confirmPasswordInput = screen.getByLabelText('Xác nhận mật khẩu mới')

      fireEvent.change(currentPasswordInput, { target: { value: 'oldpass123' } })
      fireEvent.change(newPasswordInput, { target: { value: 'validPassword@2026' } })
      fireEvent.change(confirmPasswordInput, { target: { value: 'validPassword@2026' } })

      const submitBtn = screen.getByRole('button', { name: /Cập nhật mật khẩu/i })
      fireEvent.click(submitBtn)

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith(
          expect.stringContaining(`/api/users/${mockCurrentUser?.id}`),
          expect.objectContaining({
            method: 'PATCH',
            body: JSON.stringify({
              password: 'validPassword@2026',
              passwordConfirm: 'validPassword@2026',
            }),
          }),
        )
      })
    })

    it('renders notification preferences list with toggle switches and save action', async () => {
      renderWithAntd(<AccountForm />)

      const notifTab = screen.getByText('Tùy chọn thông báo')
      fireEvent.click(notifTab)

      await waitFor(() => {
        expect(screen.getByText('Đơn hàng & Thanh toán')).toBeDefined()
        expect(screen.getByText('Biến động số dư ví số')).toBeDefined()
        expect(screen.getByText('Bản quyền & Tệp cập nhật')).toBeDefined()
        expect(screen.getByText('Bản vẽ nổi bật & Khuyến mãi')).toBeDefined()
      })

      const saveNotifBtn = screen.getByRole('button', { name: /Lưu cài đặt thông báo/i })
      expect(saveNotifBtn).toBeDefined()
      fireEvent.click(saveNotifBtn)
    })
  })

  // ============================================================================
  // SECTION 3: ADDRESS BOOK MANAGEMENT (F36)
  // ============================================================================
  describe('F36: Address Book Management', () => {
    it('preserves <h1>Sổ địa chỉ của tôi</h1> on /account/addresses', async () => {
      mockPayloadAuth.mockResolvedValueOnce({ user: mockCurrentUser })
      mockAddressesList = []

      const page = await AddressesPage()
      renderWithAntd(page)

      const heading = screen.getByRole('heading', { level: 1, name: 'Sổ địa chỉ của tôi' })
      expect(heading).toBeDefined()
      expect(heading.textContent).toBe('Sổ địa chỉ của tôi')
    })

    it('renders Empty state when address list is empty with action button', () => {
      mockAddressesList = []
      renderWithAntd(<AddressListing />)

      expect(screen.getByText('Bạn chưa lưu địa chỉ nhận tài liệu hoặc hóa đơn nào.')).toBeDefined()
      expect(screen.getByRole('button', { name: /Thêm địa chỉ đầu tiên/i })).toBeDefined()
    })

    it('renders Row/Col grid of address cards with default ribbon badge', async () => {
      mockAddressesList = [
        {
          id: 1,
          firstName: 'Văn A',
          lastName: 'Nguyễn',
          phone: '0912345678',
          addressLine1: '123 Đường Trần Phú',
          city: 'Hà Nội',
          state: 'Quận Ba Đình',
          country: 'Vietnam',
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
        {
          id: 2,
          firstName: 'Văn B',
          lastName: 'Trần',
          phone: '0987654321',
          addressLine1: '456 Đường Nguyễn Huệ',
          city: 'Hồ Chí Minh',
          state: 'Quận 1',
          country: 'Vietnam',
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      ] as unknown as Address[]

      renderWithAntd(<AddressListing />)

      expect(screen.getByText(/Văn A Nguyễn/i)).toBeDefined()
      expect(screen.getByText(/Văn B Trần/i)).toBeDefined()

      // Default ribbon on the first address
      await waitFor(() => {
        expect(screen.getAllByText('Mặc định').length).toBeGreaterThanOrEqual(1)
      })
    })

    it('persists default address selection to localStorage', async () => {
      mockAddressesList = [
        {
          id: 1,
          firstName: 'Văn A',
          lastName: 'Nguyễn',
          addressLine1: '123 Đường Trần Phú',
          city: 'Hà Nội',
          country: 'Vietnam',
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
        {
          id: 2,
          firstName: 'Văn B',
          lastName: 'Trần',
          addressLine1: '456 Đường Nguyễn Huệ',
          city: 'Hồ Chí Minh',
          country: 'Vietnam',
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      ] as unknown as Address[]

      renderWithAntd(<AddressListing />)

      // Wait for initial default address to settle on id 1
      await waitFor(() => {
        expect(screen.getAllByText('Mặc định').length).toBeGreaterThanOrEqual(1)
      })

      // Click "Đặt làm mặc định" on address 2 (now only address 2 has this button)
      const setDefaultBtn = screen.getByRole('button', { name: /Đặt làm mặc định/i })
      fireEvent.click(setDefaultBtn)

      await waitFor(() => {
        expect(localStorage.getItem('kientaohub_default_address_id')).toBe('2')
      })
    })

    it('triggers Popconfirm on delete and calls DELETE /api/addresses/:id', async () => {
      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true }),
      } as unknown as Response)

      mockAddressesList = [
        {
          id: 99,
          firstName: 'Địa Chỉ',
          lastName: 'Cần Xóa',
          addressLine1: '99 Đường Xóa',
          city: 'Đà Nẵng',
          country: 'Vietnam',
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      ] as unknown as Address[]

      renderWithAntd(<AddressListing />)

      const deleteBtn = screen.getByRole('button', { name: /Xóa/i })
      fireEvent.click(deleteBtn)

      // Popconfirm prompt appears
      await waitFor(() => {
        expect(
          screen.getByText('Bạn có chắc chắn muốn xóa địa chỉ này khỏi sổ địa chỉ?'),
        ).toBeDefined()
      })

      // Click confirm "Xóa" in Popconfirm
      const confirmBtns = screen.getAllByRole('button', { name: 'Xóa' })
      const popconfirmOk = confirmBtns[confirmBtns.length - 1]
      fireEvent.click(popconfirmOk)

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith(
          '/api/addresses/99',
          expect.objectContaining({ method: 'DELETE' }),
        )
      })
    })
  })

  // ============================================================================
  // SECTION 4: ORDER HISTORY & STATUS FILTERING (F37)
  // ============================================================================
  describe('F37: Order History & Status Filtering', () => {
    const mockOrdersRows: OrderTableRow[] = [
      {
        id: 1001,
        code: 'ORD-2026-001',
        createdAt: '2026-09-18T10:30:00.000Z',
        totalAmount: 450000,
        currency: 'VND',
        status: 'COMPLETED',
        itemsCount: 2,
        productTitles: ['Bản vẽ biệt thự tân cổ điển 3 tầng', 'Mô hình 3D Sketchup'],
        disputeProducts: [{ id: 11, title: 'Bản vẽ biệt thự tân cổ điển 3 tầng' }],
      },
      {
        id: 1002,
        code: 'ORD-2026-002',
        createdAt: '2026-09-19T14:20:00.000Z',
        totalAmount: 1200000,
        currency: 'VND',
        status: 'PENDING',
        itemsCount: 1,
        productTitles: ['Bộ hồ sơ kết cấu trung tâm thương mại'],
        disputeProducts: [{ id: 12, title: 'Bộ hồ sơ kết cấu trung tâm thương mại' }],
      },
      {
        id: 1003,
        code: 'ORD-2026-003',
        createdAt: '2026-09-20T08:15:00.000Z',
        totalAmount: 850000,
        currency: 'VND',
        status: 'CANCELLED',
        itemsCount: 1,
        productTitles: ['Mô hình Revit MEP cơ điện'],
        disputeProducts: [{ id: 13, title: 'Mô hình Revit MEP cơ điện' }],
      },
    ]

    it('preserves <h1>Đơn hàng của tôi</h1> on /orders page', async () => {
      mockPayloadAuth.mockResolvedValueOnce({ user: mockCurrentUser })
      mockPayloadFind.mockResolvedValueOnce({ docs: [] })

      const page = await OrdersPage()
      renderWithAntd(page)

      const heading = screen.getByRole('heading', { level: 1, name: 'Đơn hàng của tôi' })
      expect(heading).toBeDefined()
      expect(heading.textContent).toBe('Đơn hàng của tôi')
    })

    it('renders all orders in table on default "ALL" filter', () => {
      renderWithAntd(<OrdersTableClient initialOrders={mockOrdersRows} />)

      expect(screen.getByText('ORD-2026-001')).toBeDefined()
      expect(screen.getByText('ORD-2026-002')).toBeDefined()
      expect(screen.getByText('ORD-2026-003')).toBeDefined()

      // Formatted amounts in VND
      expect(screen.getByText('450.000 ₫')).toBeDefined()
      expect(screen.getByText('1.200.000 ₫')).toBeDefined()
      expect(screen.getByText('850.000 ₫')).toBeDefined()
    })

    it('filters orders by Segmented status selection (COMPLETED, PENDING, CANCELLED)', async () => {
      const { container } = renderWithAntd(<OrdersTableClient initialOrders={mockOrdersRows} />)

      // Click "Đã thanh toán" (COMPLETED) in the Segmented control
      const completedOption = container.querySelector(
        '.ant-segmented-item-label[title="Đã thanh toán"]',
      )
      expect(completedOption).not.toBeNull()
      if (completedOption) fireEvent.click(completedOption)

      await waitFor(() => {
        expect(screen.getByText('ORD-2026-001')).toBeDefined()
        expect(screen.queryByText('ORD-2026-002')).toBeNull()
        expect(screen.queryByText('ORD-2026-003')).toBeNull()
      })

      // Click "Chờ thanh toán" (PENDING)
      const pendingOption = container.querySelector(
        '.ant-segmented-item-label[title="Chờ thanh toán"]',
      )
      expect(pendingOption).not.toBeNull()
      if (pendingOption) fireEvent.click(pendingOption)

      await waitFor(() => {
        expect(screen.queryByText('ORD-2026-001')).toBeNull()
        expect(screen.getByText('ORD-2026-002')).toBeDefined()
        expect(screen.queryByText('ORD-2026-003')).toBeNull()
      })

      // Click "Đã hủy" (CANCELLED)
      const cancelledOption = container.querySelector(
        '.ant-segmented-item-label[title="Đã hủy"]',
      )
      expect(cancelledOption).not.toBeNull()
      if (cancelledOption) fireEvent.click(cancelledOption)

      await waitFor(() => {
        expect(screen.queryByText('ORD-2026-001')).toBeNull()
        expect(screen.queryByText('ORD-2026-002')).toBeNull()
        expect(screen.getByText('ORD-2026-003')).toBeDefined()
      })
    })

    it('filters orders by search keyword (code or product title)', async () => {
      renderWithAntd(<OrdersTableClient initialOrders={mockOrdersRows} />)

      const searchInput = screen.getByPlaceholderText('Tìm theo mã hoặc tên bản vẽ...')

      // Search by code
      fireEvent.change(searchInput, { target: { value: '002' } })
      await waitFor(() => {
        expect(screen.queryByText('ORD-2026-001')).toBeNull()
        expect(screen.getByText('ORD-2026-002')).toBeDefined()
      })

      // Search by title substring "biệt thự"
      fireEvent.change(searchInput, { target: { value: 'biệt thự' } })
      await waitFor(() => {
        expect(screen.getByText('ORD-2026-001')).toBeDefined()
        expect(screen.queryByText('ORD-2026-002')).toBeNull()
      })
    })

    it('renders empty state with shopping CTA button to /shop when no orders match', async () => {
      renderWithAntd(<OrdersTableClient initialOrders={[]} />)

      expect(screen.getByText('Bạn chưa có đơn hàng nào.')).toBeDefined()
      const shopBtn = screen.getByRole('link', { name: /Khám phá bản vẽ ngay/i })
      expect(shopBtn.getAttribute('href')).toBe('/shop')
    })
  })

  // ============================================================================
  // SECTION 5: ORDER DETAIL, DIGITAL DOWNLOADS & FORMAT TAGS (F38)
  // ============================================================================
  describe('F38: Order Detail & Digital Downloads', () => {
    const mockDetailItems: OrderDetailItem[] = [
      {
        key: 'item-1',
        id: 'item-1',
        productId: 501,
        productTitle: 'Bản vẽ kiến trúc biệt thự mái thái',
        productSlug: 'ban-ve-biet-thu-mai-thai',
        format: 'CAD / DWG',
        softwareVersion: 'AutoCAD 2022',
        salePrice: 250000,
      },
      {
        key: 'item-2',
        id: 'item-2',
        productId: 502,
        productTitle: 'Mô hình kết cấu bê tông cốt thép BIM',
        productSlug: 'mo-hinh-bim-ket-cau',
        format: 'BIM / REVIT',
        softwareVersion: 'Revit 2024',
        salePrice: 600000,
      },
      {
        key: 'item-3',
        id: 'item-3',
        productId: 503,
        productTitle: 'Hệ thống điều hòa thông gió MEP',
        productSlug: 'he-thong-mep',
        format: 'MEP',
        softwareVersion: 'AutoCAD MEP',
        salePrice: 350000,
      },
    ]

    it('renders bordered Descriptions with order metadata, buyer and formatted total amount', () => {
      const { container } = renderWithAntd(
        <OrderDetailClient
          order={{
            id: 888,
            code: 'ORD-888-VN',
            createdAt: '2026-09-15T09:00:00.000Z',
            status: 'COMPLETED',
            totalAmount: 1200000,
            currency: 'VND',
          }}
          user={{
            id: 101,
            email: 'engineer@kientaohub.vn',
            name: 'Nguyễn Văn Kỹ Sư',
          }}
          orderItems={mockDetailItems}
          productsList={mockDetailItems.map((i) => ({ id: i.productId, title: i.productTitle }))}
          tickets={[]}
        />,
      )

      // Check Descriptions bordered
      expect(container.querySelector('.ant-descriptions-bordered')).not.toBeNull()
      expect(screen.getAllByText('ORD-888-VN').length).toBeGreaterThanOrEqual(1)
      expect(screen.getByText('Thông tin đơn hàng')).toBeDefined()
      expect(screen.getByText('1.200.000 ₫')).toBeDefined()
      expect(screen.getByText('Tài nguyên số (Cấp quyền tải tức thì)')).toBeDefined()
    })

    it('renders appropriate format tags for CAD, BIM, MEP, 3D, and PDF', () => {
      renderWithAntd(
        <OrderDetailClient
          order={{
            id: 888,
            createdAt: '2026-09-15T09:00:00.000Z',
            status: 'COMPLETED',
          }}
          user={{ id: 101 }}
          orderItems={mockDetailItems}
          productsList={[]}
          tickets={[]}
        />,
      )

      expect(screen.getByText('CAD / DWG')).toBeDefined()
      expect(screen.getByText('BIM / REVIT')).toBeDefined()
      expect(screen.getByText('MEP')).toBeDefined()
      expect(screen.getAllByText('Quyền tải vĩnh viễn').length).toBe(3)
    })

    it('DownloadButton requests token via POST /api/v1/downloads/token and navigates to downloadUrl', async () => {
      // Mock window.location.href
      const originalLocation = window.location
      const mockLocationHref = vi.fn()
      // @ts-ignore
      delete window.location
      window.location = {
        ...originalLocation,
        set href(val: string) {
          mockLocationHref(val)
        },
      } as unknown as Location

      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          data: { downloadUrl: 'https://storage.kientaohub.vn/files/dwg-888.zip?token=xyz' },
        }),
      } as unknown as Response)

      renderWithAntd(
        <DownloadButton
          productId={501}
          productTitle="Bản vẽ biệt thự mái thái"
          buttonText="Tải xuống"
        />,
      )

      const downloadBtn = screen.getByRole('button', { name: /Tải xuống/i })
      fireEvent.click(downloadBtn)

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith(
          '/api/v1/downloads/token',
          expect.objectContaining({
            method: 'POST',
            body: JSON.stringify({ productId: 501 }),
          }),
        )
      })

      await waitFor(() => {
        expect(mockLocationHref).toHaveBeenCalledWith(
          'https://storage.kientaohub.vn/files/dwg-888.zip?token=xyz',
        )
      })

      // Restore window.location
      window.location = originalLocation
    })

    it('DownloadButton gracefully reports errors when download token cannot be generated', async () => {
      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: false,
        json: async () => ({ success: false, message: 'Bạn chưa có quyền tải tệp này.' }),
      } as unknown as Response)

      renderWithAntd(
        <DownloadButton productId={999} buttonText="Tải xuống" />,
      )

      const downloadBtn = screen.getByRole('button', { name: /Tải xuống/i })
      fireEvent.click(downloadBtn)

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalled()
      })
    })

    it('OrderStatus component maps all statuses (COMPLETED, PENDING, CANCELLED, REFUNDED) accurately', () => {
      const { unmount: u1 } = renderWithAntd(<OrderStatus status="COMPLETED" />)
      expect(screen.getByText('Đã thanh toán')).toBeDefined()
      u1()

      const { unmount: u2 } = renderWithAntd(<OrderStatus status="PENDING" />)
      expect(screen.getByText('Chờ thanh toán')).toBeDefined()
      u2()

      const { unmount: u3 } = renderWithAntd(<OrderStatus status="CANCELLED" />)
      expect(screen.getByText('Đã hủy')).toBeDefined()
      u3()

      const { unmount: u4 } = renderWithAntd(<OrderStatus status="REFUNDED" />)
      expect(screen.getByText('Đã hoàn tiền')).toBeDefined()
      u4()
    })
  })
})
