'use client'

import React, { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import {
  Tabs,
  Form,
  Input,
  Button,
  Avatar,
  Upload,
  Switch,
  Typography,
  Tag,
  Row,
  Col,
  Alert,
} from 'antd'
import {
  UserOutlined,
  LockOutlined,
  BellOutlined,
  MailOutlined,
  PhoneOutlined,
  UploadOutlined,
  SaveOutlined,
  KeyOutlined,
  CheckOutlined,
  SafetyCertificateOutlined,
  InfoCircleOutlined,
  FileProtectOutlined,
} from '@ant-design/icons'
import { useAuth } from '@/providers/Auth'
import { useAntdApp } from '@/providers/Antd'

export const AccountForm: React.FC = () => {
  const { user, setUser } = useAuth()
  const { message } = useAntdApp()
  const router = useRouter()

  const [profileForm] = Form.useForm()
  const [passwordForm] = Form.useForm()

  const [isUpdatingProfile, setIsUpdatingProfile] = useState(false)
  const [isUpdatingPassword, setIsUpdatingPassword] = useState(false)

  // Notification preferences state
  const [notifPreferences, setNotifPreferences] = useState({
    orders: true,
    wallet: true,
    downloads: true,
    promotions: false,
  })

  useEffect(() => {
    if (user === null) {
      router.push(
        `/login?error=${encodeURIComponent(
          'You must be logged in to view this page.',
        )}&redirect=${encodeURIComponent('/account')}`,
      )
    }

    if (user) {
      profileForm.setFieldsValue({
        name: user.name || '',
        email: user.email || '',
        phone: '',
        bio: '',
      })
    }
  }, [user, router, profileForm])

  // Profile submission handler
  const handleProfileSubmit = async (values: any) => {
    if (!user) return
    setIsUpdatingProfile(true)

    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_SERVER_URL}/api/users/${user.id}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: values.name,
          email: values.email,
        }),
      })

      if (response.ok) {
        const json = await response.json()
        setUser(json.doc)
        message.success('Cập nhật thông tin tài khoản thành công!')
      } else {
        const json = await response.json().catch(() => ({}))
        message.error(json?.errors?.[0]?.message || 'Có lỗi xảy ra khi cập nhật thông tin.')
      }
    } catch {
      message.error('Không thể kết nối đến máy chủ.')
    } finally {
      setIsUpdatingProfile(false)
    }
  }

  // Password submission handler
  const handlePasswordSubmit = async (values: any) => {
    if (!user) return

    if (values.newPassword !== values.confirmPassword) {
      message.error('Mật khẩu xác nhận không khớp!')
      return
    }

    if (values.newPassword.length < 6) {
      message.error('Mật khẩu mới phải có tối thiểu 6 ký tự!')
      return
    }

    setIsUpdatingPassword(true)

    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_SERVER_URL}/api/users/${user.id}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          password: values.newPassword,
          passwordConfirm: values.confirmPassword,
        }),
      })

      if (response.ok) {
        const json = await response.json()
        setUser(json.doc)
        message.success('Đổi mật khẩu thành công! Mật khẩu mới đã được cập nhật.')
        passwordForm.resetFields()
      } else {
        const json = await response.json().catch(() => ({}))
        message.error(json?.errors?.[0]?.message || 'Có lỗi xảy ra khi đổi mật khẩu.')
      }
    } catch {
      message.error('Không thể kết nối đến máy chủ.')
    } finally {
      setIsUpdatingPassword(false)
    }
  }

  const displayName = user?.name || (user?.email ? user.email.split('@')[0] : 'U')
  const userInitial = displayName.charAt(0).toUpperCase()

  const tabItems = [
    {
      key: 'personal-info',
      label: (
        <span className="flex items-center gap-2 font-medium">
          <UserOutlined />
          <span>Thông tin tài khoản</span>
        </span>
      ),
      children: (
        <div className="py-2">
          <Form
            form={profileForm}
            layout="vertical"
            onFinish={handleProfileSubmit}
            requiredMark="optional"
          >
            {/* Avatar Upload Container */}
            <div className="flex flex-col sm:flex-row items-center gap-5 p-4 sm:p-5 rounded-2xl bg-gradient-to-r from-blue-50/40 via-slate-50/60 to-white border border-slate-200/80 mb-6 shadow-2xs">
              <Avatar
                size={72}
                style={{ backgroundColor: '#0f172a' }}
                className="shrink-0 shadow-sm font-bold text-2xl text-white ring-4 ring-white"
              >
                {userInitial}
              </Avatar>
              <div className="text-center sm:text-left space-y-1">
                <div className="font-bold text-sm text-slate-900">
                  Ảnh đại diện thành viên
                </div>
                <div className="text-xs text-slate-400">
                  Hỗ trợ định dạng PNG, JPG hoặc WEBP. Dung lượng tối đa 2MB.
                </div>
                <div className="pt-2">
                  <Upload
                    showUploadList={false}
                    beforeUpload={(file) => {
                      message.info(`Ảnh ${file.name} đã được chọn (tính năng tải lên avatar demo).`)
                      return false
                    }}
                  >
                    <Button icon={<UploadOutlined />} size="small" className="rounded-lg text-xs border-slate-300 font-medium">
                      Tải ảnh mới
                    </Button>
                  </Upload>
                </div>
              </div>
            </div>

            <Row gutter={[20, 4]}>
              <Col xs={24} md={12}>
                <Form.Item
                  name="name"
                  label={<span className="text-xs font-semibold text-slate-700">Họ và tên</span>}
                  rules={[{ required: true, message: 'Vui lòng nhập họ và tên của bạn' }]}
                >
                  <Input
                    prefix={<UserOutlined className="text-slate-400 text-xs" />}
                    placeholder="Nguyễn Văn A"
                    size="middle"
                    className="rounded-lg text-xs"
                  />
                </Form.Item>
              </Col>

              <Col xs={24} md={12}>
                <Form.Item
                  name="email"
                  label={<span className="text-xs font-semibold text-slate-700">Địa chỉ Email</span>}
                  rules={[
                    { required: true, message: 'Vui lòng nhập địa chỉ email' },
                    { type: 'email', message: 'Địa chỉ email không hợp lệ' },
                  ]}
                >
                  <Input
                    prefix={<MailOutlined className="text-slate-400 text-xs" />}
                    placeholder="email@example.com"
                    size="middle"
                    className="rounded-lg text-xs"
                  />
                </Form.Item>
              </Col>

              <Col xs={24} md={12}>
                <Form.Item
                  name="phone"
                  label={<span className="text-xs font-semibold text-slate-700">Số điện thoại (Tùy chọn)</span>}
                >
                  <Input
                    prefix={<PhoneOutlined className="text-slate-400 text-xs" />}
                    placeholder="0912 345 678"
                    size="middle"
                    className="rounded-lg text-xs"
                  />
                </Form.Item>
              </Col>

              <Col xs={24} md={12}>
                <Form.Item label={<span className="text-xs font-semibold text-slate-700">Vai trò tài khoản (Tùy chọn)</span>}>
                  <div className="py-1 flex flex-wrap gap-2">
                    {user?.roles?.map((role) => (
                      <span
                        key={role}
                        className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-blue-50 text-[#1677ff] border border-blue-200"
                      >
                        {role === 'admin'
                          ? 'Quản trị viên'
                          : role === 'seller'
                            ? 'Người bán uy tín'
                            : role === 'financeAdmin'
                              ? 'Kế toán'
                              : 'Khách hàng'}
                      </span>
                    )) || (
                      <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-blue-50 text-[#1677ff] border border-blue-200">
                        Khách hàng
                      </span>
                    )}
                  </div>
                </Form.Item>
              </Col>

              <Col xs={24}>
                <Form.Item
                  name="bio"
                  label={<span className="text-xs font-semibold text-slate-700">Tiểu sử / Lĩnh vực chuyên môn (Tùy chọn)</span>}
                >
                  <Input.TextArea
                    rows={3}
                    placeholder="Giới thiệu chuyên môn của bạn: Kiến trúc công trình, Kết cấu thép, MEP..."
                    showCount
                    maxLength={300}
                    className="rounded-xl text-xs"
                  />
                </Form.Item>
              </Col>
            </Row>

            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-4 border-t border-slate-100 mt-4">
              <span className="text-xs text-slate-400 hidden sm:inline-block">
                Thông tin được bảo mật và áp dụng cho toàn bộ hoạt động giao dịch trên KienTaoHub.
              </span>
              <Button
                type="primary"
                htmlType="submit"
                loading={isUpdatingProfile}
                icon={<SaveOutlined />}
                className="bg-[#1677ff] hover:bg-blue-600 rounded-lg text-xs font-semibold px-5 h-9 shadow-sm"
              >
                Lưu thay đổi
              </Button>
            </div>
          </Form>
        </div>
      ),
    },
    {
      key: 'security',
      label: (
        <span className="flex items-center gap-2 font-medium">
          <LockOutlined />
          <span>Đổi mật khẩu</span>
        </span>
      ),
      children: (
        <div className="py-2 max-w-xl">
          <Alert
            title="Bảo vệ tài khoản của bạn"
            description="Mật khẩu mạnh bao gồm chữ hoa, chữ thường, chữ số và ký tự đặc biệt nhằm bảo vệ tài khoản và ví kỹ thuật số của bạn."
            type="info"
            showIcon
            icon={<InfoCircleOutlined className="text-[#1677ff]" />}
            className="mb-6 rounded-xl border-blue-100 bg-blue-50/50 text-xs"
          />

          <Form
            form={passwordForm}
            layout="vertical"
            onFinish={handlePasswordSubmit}
            requiredMark="optional"
            className="space-y-1"
          >
            <Form.Item
              name="currentPassword"
              label={<span className="text-xs font-semibold text-slate-700">Mật khẩu hiện tại</span>}
              rules={[{ required: true, message: 'Vui lòng nhập mật khẩu hiện tại' }]}
            >
              <Input.Password
                prefix={<KeyOutlined className="text-slate-400 text-xs" />}
                placeholder="••••••••"
                size="middle"
                className="rounded-lg text-xs"
              />
            </Form.Item>

            <Form.Item
              name="newPassword"
              label={<span className="text-xs font-semibold text-slate-700">Mật khẩu mới</span>}
              rules={[
                { required: true, message: 'Vui lòng nhập mật khẩu mới' },
                { min: 6, message: 'Mật khẩu mới phải có tối thiểu 6 ký tự' },
              ]}
            >
              <Input.Password
                prefix={<LockOutlined className="text-slate-400 text-xs" />}
                placeholder="••••••••"
                size="middle"
                className="rounded-lg text-xs"
              />
            </Form.Item>

            <Form.Item
              name="confirmPassword"
              label={<span className="text-xs font-semibold text-slate-700">Xác nhận mật khẩu mới</span>}
              rules={[{ required: true, message: 'Vui lòng xác nhận lại mật khẩu mới' }]}
            >
              <Input.Password
                prefix={<SafetyCertificateOutlined className="text-slate-400 text-xs" />}
                placeholder="••••••••"
                size="middle"
                className="rounded-lg text-xs"
              />
            </Form.Item>

            <div className="pt-3">
              <Button
                type="primary"
                htmlType="submit"
                loading={isUpdatingPassword}
                icon={<CheckOutlined />}
                className="bg-[#1677ff] hover:bg-blue-600 rounded-lg text-xs font-semibold px-5 h-9 shadow-sm"
              >
                Cập nhật mật khẩu
              </Button>
            </div>
          </Form>
        </div>
      ),
    },
    {
      key: 'notifications',
      label: (
        <span className="flex items-center gap-2 font-medium">
          <BellOutlined />
          <span>Tùy chọn thông báo</span>
        </span>
      ),
      children: (
        <div className="py-2 max-w-xl">
          <div className="divide-y divide-slate-100">
            {[
              {
                key: 'orders',
                title: 'Đơn hàng & Thanh toán',
                desc: 'Nhận thông báo khi đơn hàng được đặt thành công hoặc có cập nhật trạng thái.',
                checked: notifPreferences.orders,
              },
              {
                key: 'wallet',
                title: 'Biến động số dư ví số',
                desc: 'Thông báo tức thì khi nạp tiền, trừ tiền giao dịch hoặc rút tiền.',
                checked: notifPreferences.wallet,
              },
              {
                key: 'downloads',
                title: 'Bản quyền & Tệp cập nhật',
                desc: 'Nhận thông báo khi bản vẽ bạn đã mua có bản cập nhật mới từ tác giả.',
                checked: notifPreferences.downloads,
              },
              {
                key: 'promotions',
                title: 'Bản vẽ nổi bật & Khuyến mãi',
                desc: 'Các chương trình khuyến mãi, voucher giảm giá và bản tin kỹ thuật số.',
                checked: notifPreferences.promotions,
              },
            ].map((item) => (
              <div
                key={item.key}
                className="py-4 flex items-center justify-between gap-4 border-b border-slate-100 last:border-none"
              >
                <div className="flex flex-col">
                  <span className="text-xs font-bold text-slate-800">{item.title}</span>
                  <span className="text-xs text-slate-400">{item.desc}</span>
                </div>
                <Switch
                  checked={item.checked}
                  onChange={(checked) => {
                    setNotifPreferences((prev) => ({ ...prev, [item.key]: checked }))
                    message.success('Đã cập nhật cài đặt thông báo!')
                  }}
                />
              </div>
            ))}
          </div>

          <div className="pt-4">
            <Button
              type="primary"
              onClick={() => message.success('Đã lưu cài đặt thông báo!')}
              className="bg-[#1677ff] hover:bg-blue-600 rounded-lg text-xs font-semibold px-5 h-9 shadow-sm"
            >
              Lưu cài đặt thông báo
            </Button>
          </div>
        </div>
      ),
    },
  ]

  return (
    <div>
      <Tabs defaultActiveKey="personal-info" items={tabItems} className="custom-account-tabs" />
    </div>
  )
}
