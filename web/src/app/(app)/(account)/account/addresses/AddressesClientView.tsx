'use client'

import React from 'react'
import Link from 'next/link'
import { Card } from 'antd'
import { EnvironmentOutlined } from '@ant-design/icons'
import { AddressListing } from '@/components/addresses/AddressListing'
import { CreateAddressModal } from '@/components/addresses/CreateAddressModal'

export const AddressesClientView: React.FC = () => {
  return (
    <div className="flex flex-col gap-6">
      {/* Top Breadcrumb */}
      <div className="flex items-center gap-1.5 text-xs text-slate-400">
        <Link href="/" className="hover:text-slate-600 transition-colors">
          Trang chủ
        </Link>
        <span>&gt;</span>
        <Link href="/account" className="text-slate-600 font-medium hover:text-slate-900 transition-colors">
          Tài khoản
        </Link>
        <span>&gt;</span>
        <span className="text-slate-900 font-semibold">Sổ địa chỉ</span>
      </div>

      <Card
        className="shadow-sm border-slate-200/80 rounded-2xl bg-white overflow-hidden"
        styles={{ body: { padding: '24px 28px' } }}
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 pb-5 border-b border-slate-100">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-xl bg-blue-50 text-[#1677ff] border border-blue-100/60 flex items-center justify-center shrink-0 shadow-xs text-xl">
              <EnvironmentOutlined />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 !mb-0">
                Sổ địa chỉ của tôi
              </h1>
              <p className="text-xs sm:text-sm text-slate-400 mt-1 mb-0">
                Quản lý danh sách địa chỉ nhận tài liệu, hồ sơ kỹ thuật, hợp đồng và hóa đơn VAT
              </p>
            </div>
          </div>

          <CreateAddressModal buttonText="Thêm địa chỉ mới" />
        </div>

        <AddressListing />
      </Card>
    </div>
  )
}
