'use client'

import React, { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Table, Tag, Button, Popconfirm, App } from 'antd'
import type { ColumnsType } from 'antd/es/table'

export interface WithdrawalItem {
  id: number
  code: string
  amount: number
  currency?: string
  status: string
  bankInfo?: {
    bankName?: string
    accountNumber?: string
    accountHolderName?: string
  } | null
  requestedAt?: string
  createdAt?: string
}

interface Props {
  initialWithdrawals: WithdrawalItem[]
}

export function WalletEmptyState() {
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
          {/* Credit card peeking */}
          <rect
            x="11"
            y="9"
            width="26"
            height="18"
            rx="3"
            stroke="#93c5fd"
            strokeWidth="2.2"
            fill="white"
          />
          <line x1="16" y1="14" x2="22" y2="14" stroke="#93c5fd" strokeWidth="2.2" strokeLinecap="round" />
          {/* Wallet main body */}
          <rect
            x="7"
            y="15"
            width="34"
            height="24"
            rx="5"
            stroke="#2563eb"
            strokeWidth="2.4"
            fill="white"
          />
          {/* Wallet flap / latch */}
          <path
            d="M30 22H39C40.6569 22 42 23.3431 42 25V29C42 30.6569 40.6569 32 39 32H30C28.3431 32 27 30.6569 27 29V25C27 23.3431 28.3431 22 30 22Z"
            stroke="#2563eb"
            strokeWidth="2.4"
            fill="#eff6ff"
          />
          {/* Latch circle button */}
          <circle cx="34" cy="27" r="2" fill="#2563eb" />
        </svg>
      </div>
      <p className="text-xs text-slate-500 font-normal">Bạn chưa thực hiện yêu cầu rút tiền nào.</p>
    </div>
  )
}

export function WithdrawalHistoryTable({ initialWithdrawals }: Props) {
  const { message } = App.useApp()
  const router = useRouter()
  const [withdrawals, setWithdrawals] = useState<WithdrawalItem[]>(initialWithdrawals)
  const [cancellingId, setCancellingId] = useState<number | null>(null)

  const handleCancel = async (id: number) => {
    setCancellingId(id)

    try {
      const res = await fetch(`/api/v1/seller/withdrawals/${id}/cancel`, {
        method: 'POST',
      })
      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.message || data.error || 'Không thể hủy yêu cầu rút tiền.')
      }

      message.success('Đã hủy yêu cầu rút tiền. Tiền tạm giữ đã hoàn về số dư.')
      setWithdrawals((prev) =>
        prev.map((w) => (w.id === id ? { ...w, status: 'CANCELLED' } : w)),
      )
      router.refresh()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Lỗi khi hủy yêu cầu.'
      message.error(msg)
    } finally {
      setCancellingId(null)
    }
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'REQUESTED':
        return <Tag color="processing">Chờ thẩm định</Tag>
      case 'UNDER_REVIEW':
        return <Tag color="warning">Đang thẩm định</Tag>
      case 'APPROVED':
        return <Tag color="cyan">Đã duyệt chi</Tag>
      case 'PROCESSING':
        return <Tag color="purple">Đang chuyển khoản</Tag>
      case 'PAID':
        return <Tag color="success">Đã thanh toán</Tag>
      case 'REJECTED':
        return <Tag color="error">Bị từ chối</Tag>
      case 'CANCELLED':
        return <Tag color="default">Đã hủy</Tag>
      default:
        return <Tag>{status}</Tag>
    }
  }

  if (withdrawals.length === 0) {
    return <WalletEmptyState />
  }

  const columns: ColumnsType<WithdrawalItem> = [
    {
      title: 'Mã GD',
      dataIndex: 'code',
      key: 'code',
      width: 140,
      render: (code: string) => (
        <span className="font-mono text-xs font-semibold text-slate-700">{code}</span>
      ),
    },
    {
      title: 'Số tiền',
      dataIndex: 'amount',
      key: 'amount',
      width: 140,
      render: (amount: number) => (
        <span className="font-bold text-slate-900 text-sm">
          {Number(amount).toLocaleString('vi-VN')} đ
        </span>
      ),
    },
    {
      title: 'Thông tin tài khoản',
      key: 'bankInfo',
      render: (_: any, record: WithdrawalItem) => {
        if (!record.bankInfo) {
          return <span className="text-xs text-slate-400 italic">Không có</span>
        }
        return (
          <div className="text-xs">
            <div className="font-semibold text-slate-800">{record.bankInfo.bankName}</div>
            <div className="text-slate-500 font-mono text-[11px]">
              {record.bankInfo.accountNumber} • {record.bankInfo.accountHolderName}
            </div>
          </div>
        )
      },
    },
    {
      title: 'Trạng thái',
      dataIndex: 'status',
      key: 'status',
      width: 140,
      render: (status: string) => getStatusBadge(status),
    },
    {
      title: 'Thời gian',
      key: 'time',
      width: 160,
      render: (_: any, record: WithdrawalItem) => {
        const rawDate = record.requestedAt || record.createdAt
        return (
          <span className="text-xs text-slate-400">
            {rawDate ? new Date(rawDate).toLocaleString('vi-VN') : '—'}
          </span>
        )
      },
    },
    {
      title: 'Thao tác',
      key: 'action',
      width: 100,
      align: 'right',
      render: (_: any, record: WithdrawalItem) => {
        const isCancellable = record.status === 'REQUESTED' || record.status === 'UNDER_REVIEW'
        if (!isCancellable) return <span className="text-xs text-slate-300">—</span>

        return (
          <Popconfirm
            title="Hủy yêu cầu rút tiền"
            description="Số tiền đang tạm giữ sẽ được hoàn lại vào số dư khả dụng của bạn."
            onConfirm={() => handleCancel(record.id)}
            okText="Xác nhận hủy"
            cancelText="Đóng"
            okButtonProps={{ danger: true }}
          >
            <Button
              size="small"
              danger
              loading={cancellingId === record.id}
              className="text-xs rounded-md"
            >
              Hủy
            </Button>
          </Popconfirm>
        )
      },
    },
  ]

  return (
    <Table
      columns={columns}
      dataSource={withdrawals.map((w) => ({ ...w, key: w.id }))}
      pagination={{ pageSize: 5, size: 'small', showSizeChanger: false }}
      size="middle"
      className="ant-table-clean"
    />
  )
}
