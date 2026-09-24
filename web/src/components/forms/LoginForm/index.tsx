'use client'

import React, { useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { Form, Input, Button, Alert, Divider } from 'antd'
import {
  MailOutlined,
  LockOutlined,
  EyeOutlined,
  EyeInvisibleOutlined,
  ArrowRightOutlined,
} from '@ant-design/icons'
import { useAuth } from '@/providers/Auth'
import { toast } from 'sonner'

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
}

export const isSafeRedirect = (url: string | null): boolean => {
  if (!url) return false
  // Must be a relative path starting with a single '/'
  if (!url.startsWith('/') || url.startsWith('//') || url.includes('\\')) return false
  // Reject control characters, tabs, newlines
  if (/[\u0000-\u001f\u007f-\u009f]/.test(url)) return false
  try {
    const parsed = new URL(url, 'http://localhost')
    return parsed.origin === 'http://localhost' && parsed.pathname.startsWith('/')
  } catch {
    return false
  }
}

export const LoginForm: React.FC = () => {
  const searchParams = useSearchParams()
  const allParams = searchParams.toString() ? `?${searchParams.toString()}` : ''
  const redirect = searchParams.get('redirect')
  const { login } = useAuth()
  const router = useRouter()
  const [form] = Form.useForm<FormData>()
  const [error, setError] = useState<null | string>(null)
  const [showPassword, setShowPassword] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const onFinish = async (values: FormData) => {
    setError(null)
    setIsSubmitting(true)
    try {
      const trimmedEmail = typeof values.email === 'string' ? values.email.trim() : values.email
      await login({
        email: trimmedEmail,
        password: values.password,
      })
      const target =
        redirect && isSafeRedirect(redirect) && !redirect.startsWith('/login')
          ? redirect
          : '/account'
      router.push(target)
    } catch (_) {
      setError('Thông tin đăng nhập không chính xác. Vui lòng kiểm tra lại email hoặc mật khẩu.')
      setIsSubmitting(false)
    }
  }

  const handleSocialLogin = (provider: 'Google' | 'Facebook') => {
    toast.info(
      `Tính năng đăng nhập nhanh qua ${provider} đang được chuẩn bị. Vui lòng sử dụng email và mật khẩu.`,
    )
  }

  return (
    <div className="w-full">
      {/* Social Quick Login (Ready-UI) */}
      <div className="grid grid-cols-2 gap-3 mb-5">
        <Button
          type="default"
          size="large"
          disabled={isSubmitting}
          onClick={() => handleSocialLogin('Google')}
          className="h-11 rounded-xl border-slate-200 hover:border-slate-300 hover:!bg-slate-50 flex items-center justify-center gap-2.5 font-semibold text-xs sm:text-sm text-slate-700 transition-all shadow-2xs cursor-pointer"
          icon={<GoogleIcon className="shrink-0" />}
        >
          Google
        </Button>
        <Button
          type="default"
          size="large"
          disabled={isSubmitting}
          onClick={() => handleSocialLogin('Facebook')}
          className="h-11 rounded-xl border-slate-200 hover:border-slate-300 hover:!bg-slate-50 flex items-center justify-center gap-2.5 font-semibold text-xs sm:text-sm text-slate-700 transition-all shadow-2xs cursor-pointer"
          icon={<FacebookIcon className="shrink-0" />}
        >
          Facebook
        </Button>
      </div>

      {/* Modern Ant Design Divider */}
      <Divider plain className="!my-5 !text-xs !text-slate-400 font-medium">
        Hoặc đăng nhập bằng Email
      </Divider>

      {/* Backend / Auth Error Notice using Ant Design Alert */}
      {error && (
        <Alert
          title={error}
          type="error"
          showIcon
          className="!my-0 mb-5 text-sm font-medium rounded-xl"
        />
      )}

      {/* Main Interactive Ant Design Form */}
      <Form
        form={form}
        layout="vertical"
        onFinish={onFinish}
        requiredMark={false}
        className="space-y-4"
        noValidate
      >
        {/* Email Field */}
        <Form.Item
          name="email"
          label={<span className="text-xs font-bold uppercase tracking-wider text-slate-600">Địa chỉ Email</span>}
          rules={[
            {
              validator: async (_, value) => {
                if (!value || (typeof value === 'string' && value.trim() === '')) {
                  return Promise.reject(new Error('Vui lòng nhập địa chỉ email.'))
                }
                const trimmed = typeof value === 'string' ? value.trim() : ''
                const emailRegex = /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i
                if (!emailRegex.test(trimmed)) {
                  return Promise.reject(
                    new Error('Địa chỉ email không hợp lệ (ví dụ: name@example.com).'),
                  )
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
            autoComplete="email"
            disabled={isSubmitting}
            placeholder="name@example.com"
            size="large"
            className="h-11 text-sm bg-slate-50/50 hover:bg-white focus:bg-white border-slate-200 rounded-xl focus:border-[#1677ff] transition-all shadow-2xs"
            prefix={<MailOutlined className="text-slate-400 mr-1.5" />}
          />
        </Form.Item>

        {/* Password Field */}
        <div className="relative">
          <div className="absolute right-0 top-0 z-10">
            <Link
              href={`/forgot-password${allParams}`}
              className="text-xs font-semibold text-slate-400 hover:text-[#1677ff] transition-colors"
            >
              Quên mật khẩu?
            </Link>
          </div>
          <Form.Item
            name="password"
            label={<span className="text-xs font-bold uppercase tracking-wider text-slate-600">Mật khẩu</span>}
            rules={[
              {
                validator: async (_, value) => {
                  if (!value || value === '') {
                    return Promise.reject(new Error('Vui lòng nhập mật khẩu.'))
                  }
                  return Promise.resolve()
                },
              },
            ]}
          >
            <Input.Password
              id="password"
              name="password"
              autoComplete="current-password"
              disabled={isSubmitting}
              placeholder="••••••••"
              size="large"
              className="h-11 text-sm bg-slate-50/50 hover:bg-white focus:bg-white border-slate-200 rounded-xl focus:border-[#1677ff] transition-all shadow-2xs"
              prefix={<LockOutlined className="text-slate-400 mr-1.5" />}
              visibilityToggle={{
                visible: showPassword,
                onVisibleChange: (visible) => setShowPassword(visible),
              }}
              iconRender={(visible) => (
                <button
                  type="button"
                  disabled={isSubmitting}
                  onClick={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    setShowPassword(!visible)
                  }}
                  className="p-1.5 text-slate-400 hover:text-slate-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors rounded-md cursor-pointer border-none bg-transparent flex items-center justify-center"
                  aria-label={visible ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
                  title={visible ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
                >
                  {visible ? (
                    <EyeInvisibleOutlined className="size-4 text-slate-400" />
                  ) : (
                    <EyeOutlined className="size-4 text-slate-400" />
                  )}
                </button>
              )}
            />
          </Form.Item>
        </div>

        {/* Primary Submit CTA using Ant Design Button */}
        <Button
          type="primary"
          htmlType="submit"
          size="large"
          block
          loading={isSubmitting}
          disabled={isSubmitting}
          className="h-11 mt-2 text-sm font-bold shadow-md hover:shadow-lg flex items-center justify-center gap-2 transition-all cursor-pointer disabled:cursor-not-allowed !bg-[#1677ff] hover:!bg-blue-600 rounded-xl text-white"
          icon={!isSubmitting ? <ArrowRightOutlined className="size-4" /> : undefined}
          iconPlacement="end"
        >
          {isSubmitting ? 'Đang đăng nhập...' : 'Đăng nhập'}
        </Button>
      </Form>

      {/* Switch to Register */}
      <div className="mt-5 pt-4 border-t border-slate-100 text-center">
        <p className="text-xs sm:text-sm text-slate-500">
          Chưa có tài khoản KienTaoHub?{' '}
          <Link
            href={`/create-account${allParams}`}
            className="font-bold text-[#1677ff] hover:underline underline-offset-4 transition-colors"
          >
            Đăng ký tài khoản mới
          </Link>
        </p>
      </div>
    </div>
  )
}
