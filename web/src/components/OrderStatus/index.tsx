'use client'

import React from 'react'
import { Tag } from 'antd'
import {
  CheckCircleOutlined,
  ClockCircleOutlined,
  CloseCircleOutlined,
  RollbackOutlined,
  QuestionCircleOutlined,
} from '@ant-design/icons'
import type { Order } from '@/payload-types'

export type StatusOptions = Order['status']

type Props = {
  status: StatusOptions
  className?: string
  showIcon?: boolean
}

export const ORDER_STATUS_MAP: Record<
  string,
  { label: string; color: string; icon: React.ReactNode }
> = {
  COMPLETED: {
    label: 'Đã thanh toán',
    color: 'green',
    icon: <CheckCircleOutlined />,
  },
  PENDING: {
    label: 'Chờ thanh toán',
    color: 'orange',
    icon: <ClockCircleOutlined />,
  },
  CANCELLED: {
    label: 'Đã hủy',
    color: 'red',
    icon: <CloseCircleOutlined />,
  },
  REFUNDED: {
    label: 'Đã hoàn tiền',
    color: 'purple',
    icon: <RollbackOutlined />,
  },
}

export const OrderStatus: React.FC<Props> = ({ status, className, showIcon = true }) => {
  const config = (status && ORDER_STATUS_MAP[status]) || {
    label: status || 'Không xác định',
    color: 'default',
    icon: <QuestionCircleOutlined />,
  }

  return (
    <Tag
      color={config.color}
      icon={showIcon ? config.icon : undefined}
      className={`font-mono text-xs font-semibold uppercase ${className || ''}`}
      style={{ margin: 0, padding: '2px 8px', borderRadius: 12 }}
    >
      {config.label}
    </Tag>
  )
}
