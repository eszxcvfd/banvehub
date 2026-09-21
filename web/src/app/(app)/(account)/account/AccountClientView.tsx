'use client'

import React from 'react'
import Link from 'next/link'
import { Card, Button } from 'antd'
import { RightOutlined, UserOutlined, ShoppingOutlined } from '@ant-design/icons'
import { AccountForm } from '@/components/forms/AccountForm'
import { OrderItem } from '@/components/OrderItem'
import type { Order } from '@/payload-types'

interface AccountClientViewProps {
  orders: Order[] | null
}

// Vector illustration for empty orders state matching KienTaoHub design language
function EmptyOrdersState() {
  return (
    <div className="py-12 flex flex-col items-center justify-center text-center">
      <div className="w-16 h-16 rounded-full bg-blue-50/80 border border-blue-100 flex items-center justify-center mb-3">
        <svg
          width="36"
          height="36"
          viewBox="0 0 48 48"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="text-[#1677ff]"
        >
          {/* Shopping bag handles */}
          <path
            d="M16 16V12C16 7.58172 19.5817 4 24 4C28.4183 4 32 7.58172 32 12V16"
            stroke="#2563eb"
            strokeWidth="2.4"
            strokeLinecap="round"
          />
          {/* Bag body */}
          <rect
            x="9"
            y="14"
            width="30"
            height="28"
            rx="6"
            stroke="#2563eb"
            strokeWidth="2.4"
            fill="white"
          />
          {/* Handle dots */}
          <circle cx="18" cy="20" r="1.8" fill="#93c5fd" />
          <circle cx="30" cy="20" r="1.8" fill="#93c5fd" />
          {/* Smile line */}
          <path
            d="M20 27C20 27 21.5 29 24 29C26.5 29 28 27 28 27"
            stroke="#2563eb"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </svg>
      </div>
      <h3 className="text-sm font-bold text-slate-800">Bạn chưa có đơn hàng nào gần đây.</h3>
      <p className="text-xs text-slate-400 mt-1 max-w-sm">
        Khám phá kho bản vẽ kiến trúc, kết cấu và MEP chất lượng cao được kiểm duyệt trên KienTaoHub.
      </p>
      <Button
        type="primary"
        href="/shop"
        className="bg-[#1677ff] hover:bg-blue-600 rounded-lg text-xs font-semibold h-9 px-5 mt-4 shadow-sm"
      >
        Khám phá bản vẽ & mô hình
      </Button>
    </div>
  )
}

export const AccountClientView: React.FC<AccountClientViewProps> = ({ orders }) => {
  return (
    <div className="flex flex-col gap-6">
      {/* Top Breadcrumb */}
      <div className="flex items-center gap-1.5 text-xs text-slate-400">
        <Link href="/" className="hover:text-slate-600 transition-colors">
          Trang chủ
        </Link>
        <span>&gt;</span>
        <span className="text-slate-600 font-medium">Tài khoản</span>
        <span>&gt;</span>
        <span className="text-slate-900 font-semibold">Cài đặt tài khoản</span>
      </div>

      {/* Account Settings Card */}
      <Card
        className="shadow-sm border-slate-200/80 rounded-2xl bg-white overflow-hidden"
        styles={{ body: { padding: '24px 28px' } }}
      >
        <div className="flex items-center justify-between mb-5 pb-4 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-50 text-[#1677ff] flex items-center justify-center text-xl flex-shrink-0 border border-blue-100/60 shadow-xs">
              <UserOutlined />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-slate-900 leading-tight !mb-0">
                Account settings
              </h1>
              <p className="text-xs text-slate-400 mt-1 !mb-0">
                Quản lý thông tin tài khoản, bảo mật đăng nhập và tùy chọn thông báo
              </p>
            </div>
          </div>
          <span className="hidden sm:inline-flex items-center px-3 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-600 border border-slate-200">
            Hồ sơ cá nhân
          </span>
        </div>

        <AccountForm />
      </Card>

      {/* Recent Orders Card */}
      <Card
        className="shadow-sm border-slate-200/80 rounded-2xl bg-white overflow-hidden"
        styles={{ body: { padding: '24px 28px' } }}
      >
        <div className="flex items-center justify-between mb-5 pb-4 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-50 text-[#1677ff] flex items-center justify-center text-xl flex-shrink-0 border border-blue-100/60 shadow-xs">
              <ShoppingOutlined />
            </div>
            <div>
              <h2 className="text-base font-bold tracking-tight text-slate-900 leading-tight !mb-0">
                Đơn hàng gần đây
              </h2>
              <p className="text-xs text-slate-400 mt-1 !mb-0">
                Các đơn hàng và tài nguyên kỹ thuật số bạn vừa mua gần đây
              </p>
            </div>
          </div>
          <Button
            type="link"
            href="/orders"
            icon={<RightOutlined className="text-xs" />}
            iconPlacement="end"
            className="text-xs font-medium text-[#1677ff] hover:underline"
          >
            Xem tất cả
          </Button>
        </div>

        {!orders || orders.length === 0 ? (
          <EmptyOrdersState />
        ) : (
          <div className="flex flex-col gap-3">
            <ul className="flex flex-col gap-3 list-none p-0 m-0">
              {orders.map((order) => (
                <li key={order.id}>
                  <OrderItem order={order} />
                </li>
              ))}
            </ul>
          </div>
        )}
      </Card>
    </div>
  )
}
