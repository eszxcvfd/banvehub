'use client'

import React, { useEffect, useState } from 'react'
import Link from 'next/link'
import {
  Drawer,
  Button,
  Empty,
  Typography,
  Space,
  Badge,
  Popconfirm,
  Tag,
} from 'antd'
import {
  ShoppingCartOutlined,
  DeleteOutlined,
  ArrowRightOutlined,
  SafetyCertificateFilled,
} from '@ant-design/icons'
import { useCart } from '@/providers/Cart'
import { Media } from '@/components/Media'
import type { Product, Media as MediaType } from '@/payload-types'

const { Text } = Typography

export const OPEN_CART_EVENT = 'open-cart-drawer'

export const openCartDrawer = () => {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(OPEN_CART_EVENT))
  }
}

export type CartDrawerProps = {
  open?: boolean
  onClose?: () => void
}

export function CartDrawer({ open: controlledOpen, onClose: controlledOnClose }: CartDrawerProps) {
  const [internalOpen, setInternalOpen] = useState(false)
  const isControlled = controlledOpen !== undefined
  const open = isControlled ? controlledOpen : internalOpen

  const handleClose = () => {
    if (isControlled && controlledOnClose) {
      controlledOnClose()
    } else {
      setInternalOpen(false)
    }
  }

  useEffect(() => {
    const handleEvent = () => setInternalOpen(true)
    window.addEventListener(OPEN_CART_EVENT, handleEvent)
    return () => window.removeEventListener(OPEN_CART_EVENT, handleEvent)
  }, [])

  const { cart, isLoading, removeItem, incrementItem, decrementItem } = useCart()

  const items = cart?.items || []
  const totalItems = items.reduce(
    (acc: number, item: { quantity?: number | null }) => acc + (item?.quantity || 1),
    0,
  )
  const subtotal =
    cart?.subtotal ||
    items.reduce((acc: number, item: any) => {
      const price = typeof item.product === 'object' ? item.product?.price || 0 : 0
      return acc + price * (item.quantity || 1)
    }, 0)

  return (
    <Drawer
      title={
        <Space>
          <ShoppingCartOutlined className="text-[#1677ff] text-xl" />
          <span className="font-semibold text-base">Giỏ hàng của bạn</span>
          <Badge count={totalItems} style={{ backgroundColor: '#1677ff' }} />
        </Space>
      }
      placement="right"
      size={420}
      open={open}
      onClose={handleClose}
      className="cart-drawer"
      footer={
        items.length > 0 ? (
          <div className="p-2">
            <div className="flex justify-between items-center mb-3">
              <Text type="secondary" className="text-sm">
                Tạm tính:
              </Text>
              <Text strong className="text-xl text-[#1677ff] font-mono">
                {subtotal.toLocaleString('vi-VN')} ₫
              </Text>
            </div>
            <div className="text-xs text-neutral-500 dark:text-neutral-400 mb-4 flex items-center gap-1.5 bg-blue-50 dark:bg-blue-950/40 p-2.5 rounded border border-blue-100 dark:border-blue-900/30">
              <SafetyCertificateFilled className="text-emerald-500 shrink-0" />
              <span>Bản quyền kỹ thuật đã kiểm duyệt — Tải ngay sau thanh toán.</span>
            </div>
            <Space orientation="vertical" className="w-full">
              <Button
                type="primary"
                size="large"
                block
                href="/checkout"
                onClick={handleClose}
                icon={<ArrowRightOutlined />}
                className="!bg-[#1677ff]"
              >
                Tiến hành thanh toán
              </Button>
              <Button block href="/cart" onClick={handleClose}>
                Xem chi tiết giỏ hàng
              </Button>
            </Space>
          </div>
        ) : null
      }
    >
      {items.length === 0 ? (
        <div className="py-16 text-center">
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description={
              <span className="text-neutral-500">Giỏ hàng của bạn đang trống</span>
            }
          >
            <Button
              type="primary"
              href="/shop"
              onClick={handleClose}
              className="mt-4 !bg-[#1677ff]"
            >
              Khám phá bản vẽ kỹ thuật
            </Button>
          </Empty>
        </div>
      ) : (
        <div className="divide-y divide-neutral-100 dark:divide-neutral-800">
          {items.map((item: any, idx: number) => {
            const product = (typeof item.product === 'object' ? item.product : null) as Product | null
            if (!product) return null

            const image = (product.gallery?.[0]?.image || product.meta?.image) as MediaType | undefined
            const price = product.price || 0
            const quantity = item.quantity || 1
            const itemTotal = price * quantity
            const fileFormat = product.technicalSpecs?.fileFormat

            return (
              <div
                key={item.id || idx}
                className="py-4 border-b border-neutral-100 dark:border-neutral-800 last:border-none"
              >
                <div className="flex items-start gap-3 w-full">
                  {/* Product thumbnail */}
                  <div className="w-16 h-16 rounded-md overflow-hidden bg-neutral-100 dark:bg-neutral-800 shrink-0 border border-neutral-200 dark:border-neutral-700 relative">
                    {image && typeof image !== 'string' && (
                      <Media fill imgClassName="object-cover" resource={image} />
                    )}
                  </div>

                  {/* Product Info */}
                  <div className="grow min-w-0">
                    <div className="flex justify-between items-start gap-1">
                      <Link
                        href={`/products/${product.slug}`}
                        onClick={handleClose}
                        className="font-medium text-sm text-neutral-900 dark:text-neutral-100 hover:text-[#1677ff] line-clamp-2 leading-snug"
                      >
                        {product.title}
                      </Link>
                      <Popconfirm
                        title="Xóa bản vẽ này?"
                        okText="Xóa"
                        cancelText="Hủy"
                        okButtonProps={{ danger: true, size: 'small' }}
                        cancelButtonProps={{ size: 'small' }}
                        onConfirm={() => item.id && removeItem(item.id)}
                      >
                        <Button
                          type="text"
                          danger
                          size="small"
                          icon={<DeleteOutlined />}
                          aria-label="Xóa khỏi giỏ hàng"
                          disabled={isLoading}
                        />
                      </Popconfirm>
                    </div>

                    {fileFormat && (
                      <Tag color="blue" className="mt-1 font-mono text-[10px] leading-tight">
                        {fileFormat}
                      </Tag>
                    )}

                    <div className="flex justify-between items-center mt-2.5">
                      {/* Quantity Stepper */}
                      <div className="flex items-center gap-1 border border-neutral-200 dark:border-neutral-700 rounded">
                        <Button
                          type="text"
                          size="small"
                          disabled={isLoading || quantity <= 1}
                          onClick={() => item.id && decrementItem(item.id)}
                          className="!h-6 !w-6 !p-0"
                        >
                          -
                        </Button>
                        <span className="text-xs font-mono px-1 min-w-[20px] text-center">
                          {quantity}
                        </span>
                        <Button
                          type="text"
                          size="small"
                          disabled={isLoading}
                          onClick={() => item.id && incrementItem(item.id)}
                          className="!h-6 !w-6 !p-0"
                        >
                          +
                        </Button>
                      </div>

                      <Text strong className="text-sm font-mono text-[#1677ff]">
                        {itemTotal.toLocaleString('vi-VN')} ₫
                      </Text>
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </Drawer>
  )
}
