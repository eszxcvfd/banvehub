'use client'

import React, { useState } from 'react'
import { Modal, Button, Card, Space, Tag } from 'antd'
import { EnvironmentOutlined, CheckOutlined } from '@ant-design/icons'
import { CreateAddressModal } from '@/components/addresses/CreateAddressModal'
import { Address } from '@/payload-types'
import { useAddresses } from '@payloadcms/plugin-ecommerce/client/react'

type Props = {
  selectedAddress?: Address
  setAddress: React.Dispatch<React.SetStateAction<Partial<Address> | undefined>>
  heading?: string
  description?: string
  setSubmit?: React.Dispatch<React.SetStateAction<() => void | Promise<void>>>
}

export const CheckoutAddresses: React.FC<Props> = ({
  setAddress,
  heading = 'Địa chỉ giao nhận & thanh toán',
  description = 'Vui lòng chọn địa chỉ từ sổ địa chỉ của bạn hoặc thêm mới.',
}) => {
  const { addresses } = useAddresses()

  if (!addresses || addresses.length === 0) {
    return (
      <div className="p-4 border border-dashed border-slate-300 dark:border-neutral-700 rounded-xl text-center bg-slate-50/50 dark:bg-neutral-800/30">
        <p className="text-neutral-500 dark:text-neutral-400 mb-3 text-xs">Chưa có địa chỉ nào trong tài khoản. Vui lòng thêm mới địa chỉ.</p>
        <CreateAddressModal callback={(addr) => setAddress(addr)} />
      </div>
    )
  }

  return (
    <div className="p-4 border border-slate-200/80 dark:border-neutral-800 rounded-xl bg-slate-50/50 dark:bg-neutral-800/30 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
      <div>
        <h4 className="text-sm font-semibold mb-0.5 text-slate-900 dark:text-neutral-100">{heading}</h4>
        <p className="text-xs text-slate-500 dark:text-neutral-400 m-0">{description}</p>
      </div>
      <AddressesModal setAddress={setAddress} />
    </div>
  )
}

const AddressesModal: React.FC<Props> = ({ setAddress }) => {
  const [open, setOpen] = useState(false)
  const { addresses } = useAddresses()

  if (!addresses || addresses.length === 0) {
    return <p className="text-sm text-neutral-500">Chưa có địa chỉ nào. Vui lòng thêm địa chỉ mới.</p>
  }

  return (
    <>
      <Button
        type="default"
        icon={<EnvironmentOutlined />}
        onClick={() => setOpen(true)}
      >
        Chọn địa chỉ từ sổ địa chỉ
      </Button>

      <Modal
        title="Chọn địa chỉ giao nhận / thanh toán"
        open={open}
        onCancel={() => setOpen(false)}
        footer={null}
        destroyOnHidden
        width={600}
      >
        <div className="py-2 space-y-4">
          <div className="divide-y divide-neutral-100 dark:divide-neutral-800">
            {addresses.map((address) => (
              <div
                key={address.id}
                className="py-3 flex items-start justify-between gap-3 border-b border-neutral-100 dark:border-neutral-800 last:border-none"
              >
                <div className="min-w-0 flex-1">
                  <Space>
                    <span className="font-semibold text-sm">
                      {address.firstName} {address.lastName}
                    </span>
                    {address.phone && <Tag>{address.phone}</Tag>}
                  </Space>
                  <div className="text-xs text-neutral-600 dark:text-neutral-400 mt-1">
                    <div>{address.addressLine1}</div>
                    <div>
                      {address.city}
                      {address.state ? `, ${address.state}` : ''}
                      {address.postalCode ? ` - ${address.postalCode}` : ''}
                    </div>
                  </div>
                </div>
                <Button
                  type="primary"
                  size="small"
                  icon={<CheckOutlined />}
                  className="!bg-[#1677ff] shrink-0"
                  onClick={() => {
                    setAddress(address)
                    setOpen(false)
                  }}
                >
                  Chọn
                </Button>
              </div>
            ))}
          </div>

          <div className="pt-2 flex justify-end">
            <CreateAddressModal
              callback={(newAddr) => {
                setAddress(newAddr)
                setOpen(false)
              }}
            />
          </div>
        </div>
      </Modal>
    </>
  )
}
