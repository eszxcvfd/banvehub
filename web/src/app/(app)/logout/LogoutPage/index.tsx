'use client'

import React, { useEffect, useState } from 'react'
import Link from 'next/link'
import { Result, Button, Spin } from 'antd'
import {
  ShopOutlined,
  LoginOutlined,
  HomeOutlined,
  CheckCircleOutlined,
  InfoCircleOutlined,
} from '@ant-design/icons'
import { useAuth } from '@/providers/Auth'

export const LogoutPage: React.FC = () => {
  const { logout } = useAuth()
  const [loading, setLoading] = useState(true)
  const [status, setStatus] = useState<'success' | 'already_logged_out'>('success')

  useEffect(() => {
    let isMounted = true

    const performLogout = async () => {
      try {
        await logout()
        if (isMounted) {
          setStatus('success')
          setLoading(false)
        }
      } catch (_) {
        if (isMounted) {
          setStatus('already_logged_out')
          setLoading(false)
        }
      }
    }

    void performLogout()

    return () => {
      isMounted = false
    }
  }, [logout])

  if (loading) {
    return (
      <div className="py-16 flex flex-col items-center justify-center gap-4">
        <Spin size="large" />
        <span className="text-sm text-muted-foreground font-medium">Đang xử lý đăng xuất an toàn...</span>
      </div>
    )
  }

  return (
    <Result
      status="info"
      icon={
        status === 'success' ? (
          <CheckCircleOutlined className="!text-[#1677ff]" />
        ) : (
          <InfoCircleOutlined className="!text-[#1677ff]" />
        )
      }
      title={
        status === 'success'
          ? 'Đã đăng xuất thành công'
          : 'Bạn chưa đăng nhập hoặc đã đăng xuất'
      }
      subTitle={
        status === 'success'
          ? 'Tài khoản của bạn đã được đăng xuất an toàn khỏi hệ thống KienTaoHub. Phiên làm việc đã kết thúc.'
          : 'Hiện không có phiên làm việc nào đang hoạt động trên thiết bị này.'
      }
      extra={[
        <Button
          type="primary"
          key="shop"
          size="large"
          className="!bg-[#1677ff] font-medium"
          icon={<ShopOutlined />}
        >
          <Link href="/shop">Khám phá bản vẽ</Link>
        </Button>,
        <Button
          key="login"
          size="large"
          className="font-medium"
          icon={<LoginOutlined />}
        >
          <Link href="/login">Đăng nhập lại</Link>
        </Button>,
        <Button
          type="text"
          key="home"
          size="large"
          className="font-medium text-muted-foreground hover:text-foreground"
          icon={<HomeOutlined />}
        >
          <Link href="/">Về trang chủ</Link>
        </Button>,
      ]}
    />
  )
}
