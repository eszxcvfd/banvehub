'use client'

import React from 'react'
import { Steps } from 'antd'
import {
  UserOutlined,
  WalletOutlined,
  CheckCircleOutlined,
} from '@ant-design/icons'

export type CheckoutStepsProps = {
  currentStep: number
  onChange?: (step: number) => void
}

export function CheckoutSteps({ currentStep, onChange }: CheckoutStepsProps) {
  return (
    <div className="mb-8 p-4 sm:p-6 bg-white dark:bg-neutral-900 rounded-2xl shadow-xs border border-slate-200/80 dark:border-neutral-800">
      <Steps
        current={currentStep}
        onChange={onChange}
        responsive
        className="checkout-progress-steps"
        items={[
          {
            title: <span className="font-semibold text-sm">Thông tin & Địa chỉ</span>,
            content: <span className="text-xs text-slate-400 dark:text-slate-500">Người mua & Giao nhận</span>,
            icon: <UserOutlined className="text-base" />,
          },
          {
            title: <span className="font-semibold text-sm">Phương thức thanh toán</span>,
            content: <span className="text-xs text-slate-400 dark:text-slate-500">Ví số / VietQR / Thẻ</span>,
            icon: <WalletOutlined className="text-base" />,
          },
          {
            title: <span className="font-semibold text-sm">Xác nhận & Đặt hàng</span>,
            content: <span className="text-xs text-slate-400 dark:text-slate-500">Kiểm tra & Hoàn tất</span>,
            icon: <CheckCircleOutlined className="text-base" />,
          },
        ]}
      />
    </div>
  )
}
