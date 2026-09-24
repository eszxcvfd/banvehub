'use client'

import React, { useState } from 'react'
import Link from 'next/link'
import { Form, Input, Button, Result, Alert } from 'antd'
import {
  MailOutlined,
  ArrowLeftOutlined,
  RedoOutlined,
} from '@ant-design/icons'
import { getClientSideURL } from '@/utilities/getURL'

// Polyfill window.matchMedia for headless/JSDOM testing environments
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

interface ForgotPasswordFormValues {
  email: string
}

export const ForgotPasswordForm: React.FC = () => {
  const [form] = Form.useForm<ForgotPasswordFormValues>()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [submittedEmail, setSubmittedEmail] = useState<string>('')

  const onFinish = async (values: ForgotPasswordFormValues) => {
    setLoading(true)
    setError(null)

    const cleanEmail = values.email?.trim()

    try {
      const serverUrl = getClientSideURL()
      const response = await fetch(`${serverUrl}/api/users/forgot-password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email: cleanEmail }),
      })

      if (response.ok) {
        setSubmittedEmail(cleanEmail)
        setSuccess(true)
        setError(null)
      } else {
        const data = await response.json().catch(() => null)
        const errorMsg =
          data?.errors?.[0]?.message ||
          'Có lỗi xảy ra khi gửi email đặt lại mật khẩu. Vui lòng kiểm tra lại địa chỉ email hoặc thử lại sau.'
        setError(errorMsg)
      }
    } catch {
      setError(
        'Không thể kết nối đến máy chủ. Vui lòng kiểm tra kết nối mạng và thử lại sau.',
      )
    } finally {
      setLoading(false)
    }
  }

  const handleRetry = () => {
    setSuccess(false)
    setError(null)
    form.resetFields()
  }

  if (success) {
    return (
      <div className="w-full">
        <Result
          status="success"
          title="Yêu cầu đặt lại mật khẩu đã được gửi"
          subTitle={
            <div className="space-y-2 text-sm text-muted-foreground mt-2">
              <p>
                Chúng tôi đã gửi liên kết xác thực đặt lại mật khẩu đến địa chỉ email:
              </p>
              <p className="font-semibold text-foreground bg-muted/60 py-1.5 px-3 rounded-md inline-block">
                {submittedEmail}
              </p>
              <p>
                Vui lòng kiểm tra hộp thư đến (và cả thư mục Spam/Rác) để tiếp tục thiết lập mật khẩu mới.
              </p>
            </div>
          }
          extra={[
            <Link key="login" href="/login">
              <Button type="primary" size="large" className="!bg-[#1677ff]" icon={<ArrowLeftOutlined />}>
                Quay lại Đăng nhập
              </Button>
            </Link>,
            <Button
              key="retry"
              size="large"
              icon={<RedoOutlined />}
              onClick={handleRetry}
            >
              Thử email khác
            </Button>,
          ]}
        />
      </div>
    )
  }

  return (
    <div className="w-full">
      <div className="mb-6">
        <Link
          href="/login"
          className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors mb-4 group"
        >
          <ArrowLeftOutlined className="transition-transform group-hover:-translate-x-1" />
          <span>Quay lại đăng nhập</span>
        </Link>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
          Quên mật khẩu?
        </h1>
        <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
          Nhập địa chỉ email đăng ký tài khoản KienTaoHub của bạn. Chúng tôi sẽ gửi một liên kết an toàn để bạn thiết lập lại mật khẩu mới.
        </p>
      </div>

      {error && (
        <Alert
          type="error"
          showIcon
          title={error}
          className="mb-5 text-sm"
          closable
          onClose={() => setError(null)}
        />
      )}

      <Form
        form={form}
        layout="vertical"
        onFinish={onFinish}
        requiredMark={false}
        autoComplete="off"
        className="space-y-4"
        noValidate
      >
        <Form.Item
          name="email"
          label={<span className="text-sm font-semibold text-foreground">Địa chỉ Email</span>}
          rules={[
            { required: true, message: 'Vui lòng nhập địa chỉ email.' },
            {
              type: 'email',
              message: 'Địa chỉ email không hợp lệ (ví dụ: name@example.com).',
            },
            {
              validator: (_, value) => {
                if (value && typeof value === 'string' && value.trim().length === 0) {
                  return Promise.reject(new Error('Email không được chỉ chứa khoảng trắng.'))
                }
                return Promise.resolve()
              },
            },
          ]}
        >
          <Input
            id="email"
            name="email"
            type="email"
            size="large"
            disabled={loading}
            placeholder="name@example.com"
            autoComplete="email"
            prefix={<MailOutlined className="text-muted-foreground mr-1" />}
            allowClear
            className="h-11 text-sm bg-background border-input transition-all"
          />
        </Form.Item>

        <Form.Item className="!mb-2">
          <Button
            type="primary"
            htmlType="submit"
            size="large"
            block
            loading={loading}
            icon={<MailOutlined />}
            className="h-11 font-semibold text-sm cursor-pointer shadow-xs !bg-[#1677ff]"
          >
            {loading ? 'Đang gửi yêu cầu...' : 'Gửi hướng dẫn đặt lại mật khẩu'}
          </Button>
        </Form.Item>
      </Form>

      {/* Auxiliary navigation links */}
      <div className="mt-6 pt-5 border-t border-border/70 space-y-3 text-center text-sm">
        <p className="text-muted-foreground">
          Chưa có tài khoản?{' '}
          <Link
            href="/create-account"
            className="font-semibold text-foreground hover:text-primary underline underline-offset-4 transition-colors"
          >
            Đăng ký tài khoản mới
          </Link>
        </p>

        <div className="pt-2 text-xs text-muted-foreground">
          Bạn là quản trị viên hệ thống?{' '}
          <Link
            href="/admin/collections/users"
            className="font-medium text-foreground underline underline-offset-4 hover:text-primary transition-colors"
          >
            Đăng nhập trang quản trị
          </Link>
        </div>
      </div>
    </div>
  )
}
