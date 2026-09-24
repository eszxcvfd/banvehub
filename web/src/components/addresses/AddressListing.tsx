'use client'

import React, { useState, useEffect } from 'react'
import { useAddresses } from '@payloadcms/plugin-ecommerce/client/react'
import {
  Row,
  Col,
  Card,
  Tag,
  Button,
  Popconfirm,
  Empty,
  Typography,
  Badge,
} from 'antd'
import {
  EditOutlined,
  DeleteOutlined,
  CheckCircleOutlined,
  CheckCircleFilled,
  PhoneOutlined,
  BankOutlined,
  EnvironmentOutlined,
} from '@ant-design/icons'
import { useAntdApp } from '@/providers/Antd'
import { CreateAddressModal } from '@/components/addresses/CreateAddressModal'
import type { Address } from '@/payload-types'

const DEFAULT_ADDRESS_STORAGE_KEY = 'kientaohub_default_address_id'

export const AddressListing: React.FC = () => {
  const { addresses } = useAddresses()
  const { message } = useAntdApp()
  const [defaultId, setDefaultId] = useState<number | null>(null)
  const [editingAddress, setEditingAddress] = useState<Address | null>(null)
  const [isEditModalOpen, setIsEditModalOpen] = useState(false)
  const [deletingId, setDeletingId] = useState<number | null>(null)

  // Initialize default address from localStorage
  useEffect(() => {
    try {
      const stored = localStorage.getItem(DEFAULT_ADDRESS_STORAGE_KEY)
      queueMicrotask(() => {
        if (stored) {
          setDefaultId(Number(stored))
        } else if (addresses && addresses.length > 0) {
          setDefaultId(addresses[0].id)
        }
      })
    } catch {
      // Ignore storage errors
    }
  }, [addresses])

  const handleSetDefault = (id: number) => {
    setDefaultId(id)
    try {
      localStorage.setItem(DEFAULT_ADDRESS_STORAGE_KEY, String(id))
      message.success('Đã đặt làm địa chỉ mặc định!')
    } catch {
      message.error('Không thể lưu địa chỉ mặc định.')
    }
  }

  const handleDelete = async (id: number) => {
    setDeletingId(id)
    try {
      const response = await fetch(`/api/addresses/${id}`, {
        method: 'DELETE',
        credentials: 'include',
      })

      if (response.ok) {
        message.success('Đã xóa địa chỉ thành công!')
        if (defaultId === id) {
          localStorage.removeItem(DEFAULT_ADDRESS_STORAGE_KEY)
          setDefaultId(null)
        }
        window.location.reload()
      } else {
        message.error('Không thể xóa địa chỉ này.')
      }
    } catch {
      message.error('Có lỗi xảy ra khi kết nối máy chủ.')
    } finally {
      setDeletingId(null)
    }
  }

  const handleEdit = (address: Address) => {
    setEditingAddress(address)
    setIsEditModalOpen(true)
  }

  if (!addresses || addresses.length === 0) {
    return (
      <div className="py-12 text-center">
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description="Bạn chưa lưu địa chỉ nhận tài liệu hoặc hóa đơn nào."
        >
          <CreateAddressModal buttonText="Thêm địa chỉ đầu tiên" />
        </Empty>
      </div>
    )
  }

  return (
    <div>
      <Row gutter={[20, 20]}>
        {addresses.map((address) => {
          const isDefault = defaultId === address.id

          return (
            <Col xs={24} sm={24} lg={12} key={address.id}>
              <Badge.Ribbon
                text="Mặc định"
                color="#1677ff"
                style={{ display: isDefault ? 'block' : 'none' }}
              >
                <Card
                  hoverable
                  className={`h-full border transition-all rounded-2xl overflow-hidden ${
                    isDefault
                      ? 'border-[#1677ff] shadow-sm bg-blue-50/20'
                      : 'border-slate-200/80 shadow-2xs hover:shadow-sm'
                  }`}
                  styles={{
                    body: { padding: '22px' },
                    actions: { background: '#f8fafc', borderTop: '1px solid #f1f5f9' },
                  }}
                  actions={[
                    <Button
                      type="text"
                      key="edit"
                      icon={<EditOutlined />}
                      onClick={() => handleEdit(address as Address)}
                      className="text-xs"
                    >
                      Sửa
                    </Button>,
                    !isDefault ? (
                      <Button
                        type="text"
                        key="setDefault"
                        icon={<CheckCircleOutlined />}
                        onClick={() => handleSetDefault(address.id)}
                        className="text-xs text-[#1677ff]"
                      >
                        Đặt làm mặc định
                      </Button>
                    ) : (
                      <span
                        key="defaultStatus"
                        className="text-xs text-[#1677ff] font-medium flex items-center justify-center gap-1"
                      >
                        <CheckCircleFilled /> Mặc định
                      </span>
                    ),
                    <Popconfirm
                      key="delete"
                      title="Xóa địa chỉ"
                      description="Bạn có chắc chắn muốn xóa địa chỉ này khỏi sổ địa chỉ?"
                      okText="Xóa"
                      cancelText="Hủy"
                      okButtonProps={{ danger: true, loading: deletingId === address.id }}
                      onConfirm={() => handleDelete(address.id)}
                    >
                      <Button type="text" danger icon={<DeleteOutlined />} className="text-xs">
                        Xóa
                      </Button>
                    </Popconfirm>,
                  ]}
                >
                  <div className="flex flex-col gap-2">
                    <div className="flex items-center gap-2">
                      <Typography.Text strong className="text-base text-neutral-900 dark:text-neutral-100">
                        {address.title ? `${address.title} ` : ''}
                        {address.firstName} {address.lastName}
                      </Typography.Text>
                      {isDefault && (
                        <Tag color="blue" className="text-[11px] px-1.5 py-0">
                          Mặc định
                        </Tag>
                      )}
                    </div>

                    {address.phone && (
                      <Typography.Text type="secondary" className="flex items-center gap-1.5 text-xs">
                        <PhoneOutlined className="text-neutral-400" />
                        <span>{address.phone}</span>
                      </Typography.Text>
                    )}

                    {address.company && (
                      <Typography.Text type="secondary" className="flex items-center gap-1.5 text-xs">
                        <BankOutlined className="text-neutral-400" />
                        <span>{address.company}</span>
                      </Typography.Text>
                    )}

                    <div className="mt-2 text-sm text-neutral-600 dark:text-neutral-400 leading-relaxed">
                      <p className="mb-0 flex items-start gap-1.5">
                        <EnvironmentOutlined className="text-neutral-400 mt-1 shrink-0" />
                        <span>
                          {address.addressLine1}
                          {address.addressLine2 ? `, ${address.addressLine2}` : ''}
                        </span>
                      </p>
                      <p className="mb-0 ml-5 text-xs text-neutral-500">
                        {address.city}
                        {address.state ? `, ${address.state}` : ''}
                        {address.postalCode ? ` - ${address.postalCode}` : ''}
                      </p>
                      <p className="mb-0 ml-5 text-xs font-semibold text-neutral-400 mt-0.5">
                        {address.country}
                      </p>
                    </div>
                  </div>
                </Card>
              </Badge.Ribbon>
            </Col>
          )
        })}
      </Row>

      {/* Edit Address Modal */}
      {editingAddress && (
        <CreateAddressModal
          addressID={editingAddress.id}
          initialData={editingAddress}
          modalTitle="Chỉnh sửa địa chỉ"
          buttonText=""
          open={isEditModalOpen}
          onOpenChange={(open) => {
            setIsEditModalOpen(open)
            if (!open) setEditingAddress(null)
          }}
        />
      )}
    </div>
  )
}
