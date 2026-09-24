'use client'

import React, { useState } from 'react'
import { Alert, Button, Divider, Form, Input } from 'antd'
import { LockOutlined, MailOutlined } from '@ant-design/icons'
import { useAuth } from '@/providers/Auth'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { toast } from 'sonner'
import { isSafeRedirect } from '@/components/forms/LoginForm'

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

function GoogleIcon(props: React.ComponentProps<'svg'>) {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" {...props}>
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
      />
    </svg>
  )
}

function FacebookIcon(props: React.ComponentProps<'svg'>) {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="#1877F2" aria-hidden="true" {...props}>
      <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
    </svg>
  )
}

type FormData = {
  email: string
  password: string
  passwordConfirm: string
}

export const CreateAccountForm: React.FC = () => {
  const [form] = Form.useForm<FormData>()
  const searchParams = useSearchParams()
  const allParams = searchParams.toString() ? `?${searchParams.toString()}` : ''
  const redirect = searchParams.get('redirect')
  const { login } = useAuth()
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<null | string>(null)

  const handleSocialRegister = (provider: 'Google' | 'Facebook') => {
    toast.info(
      `Tính năng đăng ký nhanh qua ${provider} đang được hoàn thiện. Vui lòng đăng ký bằng email.`,
    )
  }

  const onFinish = async (values: FormData) => {
    setError(null)
    setLoading(true)

    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_SERVER_URL}/api/users`, {
        body: JSON.stringify({
          email: values.email?.trim(),
          password: values.password,
          passwordConfirm: values.passwordConfirm,
        }),
        headers: {
          'Content-Type': 'application/json',
        },
        method: 'POST',
      })

      if (!response.ok) {
        let message = 'Có lỗi xảy ra khi tạo tài khoản. Vui lòng thử lại.'
        try {
          const resData = await response.json()
          if (resData?.errors?.[0]?.message) {
            message = resData.errors[0].message
          } else if (resData?.message) {
            message = resData.message
          }
        } catch {
          if (response.statusText) {
            message = response.statusText
          }
        }
        setError(message)
        setLoading(false)
        return
      }

      // Automatically log the user in after registration
      try {
        await login({
          email: values.email?.trim(),
          password: values.password,
        })
        const target =
          redirect && isSafeRedirect(redirect) && !redirect.startsWith('/login') && !redirect.startsWith('/create-account')
            ? redirect
            : `/account?success=${encodeURIComponent('Account created successfully')}`
        router.push(target)
      } catch (_) {
        setError('Tài khoản đã tạo thành công nhưng không thể tự động đăng nhập. Vui lòng đăng nhập thủ công.')
        setLoading(false)
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Có lỗi xảy ra khi tạo tài khoản. Vui lòng kiểm tra lại kết nối.')
      setLoading(false)
    }
  }

  return (
    <div className="w-full">
      {/* Social Quick Registration (Ready-UI) */}
      <div className="grid grid-cols-2 gap-3 mb-5">
        <Button
          type="default"
          size="large"
          disabled={loading}
          onClick={() => handleSocialRegister('Google')}
          className="h-11 rounded-xl border-slate-200 hover:border-slate-300 hover:!bg-slate-50 flex items-center justify-center gap-2.5 font-semibold text-xs sm:text-sm text-slate-700 transition-all shadow-2xs cursor-pointer"
          icon={<GoogleIcon className="shrink-0" />}
        >
          Google
        </Button>
        <Button
          type="default"
          size="large"
          disabled={loading}
          onClick={() => handleSocialRegister('Facebook')}
          className="h-11 rounded-xl border-slate-200 hover:border-slate-300 hover:!bg-slate-50 flex items-center justify-center gap-2.5 font-semibold text-xs sm:text-sm text-slate-700 transition-all shadow-2xs cursor-pointer"
          icon={<FacebookIcon className="shrink-0" />}
        >
          Facebook
        </Button>
      </div>

      <Divider plain className="!my-5 !text-xs !text-slate-400 font-medium">
        Hoặc đăng ký bằng Email
      </Divider>

      {/* Error Alert */}
      {error && (
        <Alert
          type="error"
          title={error}
          showIcon
          className="!my-0 mb-5 text-sm font-medium rounded-xl"
        />
      )}

      {/* Ant Design Form */}
      <Form
        form={form}
        layout="vertical"
        onFinish={onFinish}
        requiredMark={false}
        className="w-full space-y-4"
        noValidate
      >
        <Form.Item
          name="email"
          label={<span className="text-xs font-bold uppercase tracking-wider text-slate-600">Địa chỉ Email</span>}
          rules={[
            {
              required: true,
              message: 'Vui lòng nhập địa chỉ email.',
            },
            {
              type: 'email',
              message: 'Địa chỉ email không hợp lệ (ví dụ: name@example.com).',
            },
            {
              validator: (_, value) => {
                if (value && typeof value === 'string' && value.trim().length === 0) {
                  return Promise.reject(new Error('Vui lòng nhập địa chỉ email.'))
                }
                return Promise.resolve()
              },
            },
          ]}
        >
          <Input
            name="email"
            id="email"
            type="email"
            autoComplete="email"
            disabled={loading}
            placeholder="name@example.com"
            size="large"
            prefix={<MailOutlined className="text-slate-400 mr-1.5" />}
            className="h-11 text-sm bg-slate-50/50 hover:bg-white focus:bg-white border-slate-200 rounded-xl focus:border-[#1677ff] transition-all shadow-2xs"
          />
        </Form.Item>

        <Form.Item
          name="password"
          label={<span className="text-xs font-bold uppercase tracking-wider text-slate-600">Mật khẩu</span>}
          rules={[
            {
              required: true,
              message: 'Vui lòng nhập mật khẩu.',
            },
            {
              min: 6,
              message: 'Mật khẩu phải có ít nhất 6 ký tự.',
            },
          ]}
        >
          <Input.Password
            name="password"
            id="password"
            autoComplete="new-password"
            disabled={loading}
            placeholder="Nhập mật khẩu (tối thiểu 6 ký tự)"
            size="large"
            prefix={<LockOutlined className="text-slate-400 mr-1.5" />}
            className="h-11 text-sm bg-slate-50/50 hover:bg-white focus:bg-white border-slate-200 rounded-xl focus:border-[#1677ff] transition-all shadow-2xs"
          />
        </Form.Item>

        <Form.Item
          name="passwordConfirm"
          label={<span className="text-xs font-bold uppercase tracking-wider text-slate-600">Xác nhận mật khẩu</span>}
          dependencies={['password']}
          rules={[
            {
              required: true,
              message: 'Vui lòng xác nhận mật khẩu.',
            },
            ({ getFieldValue }) => ({
              validator(_, value) {
                if (!value || getFieldValue('password') === value) {
                  return Promise.resolve()
                }
                return Promise.reject(new Error('Mật khẩu xác nhận không khớp!'))
              },
            }),
          ]}
        >
          <Input.Password
            name="passwordConfirm"
            id="passwordConfirm"
            autoComplete="new-password"
            disabled={loading}
            placeholder="Nhập lại mật khẩu"
            size="large"
            prefix={<LockOutlined className="text-slate-400 mr-1.5" />}
            className="h-11 text-sm bg-slate-50/50 hover:bg-white focus:bg-white border-slate-200 rounded-xl focus:border-[#1677ff] transition-all shadow-2xs"
          />
        </Form.Item>

        <Button
          type="primary"
          htmlType="submit"
          size="large"
          block
          loading={loading}
          disabled={loading}
          className="h-11 mt-2 text-sm font-bold shadow-md hover:shadow-lg flex items-center justify-center gap-2 transition-all cursor-pointer disabled:cursor-not-allowed !bg-[#1677ff] hover:!bg-blue-600 rounded-xl text-white"
        >
          {loading ? 'Đang tạo tài khoản...' : 'Create Account'}
        </Button>
      </Form>

      {/* Switch to Login Link */}
      <div className="mt-5 pt-4 border-t border-slate-100 text-center">
        <p className="text-xs sm:text-sm text-slate-500">
          Đã có tài khoản KienTaoHub?{' '}
          <Link
            href={`/login${allParams}`}
            className="font-bold text-[#1677ff] hover:underline underline-offset-4 transition-colors"
          >
            Đăng nhập ngay
          </Link>
        </p>
      </div>
    </div>
  )
}
