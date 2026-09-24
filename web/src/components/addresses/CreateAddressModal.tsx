'use client'

import React, { useState } from 'react'
import { Modal, Button } from 'antd'
import { PlusOutlined } from '@ant-design/icons'
import { AddressForm } from '@/components/forms/AddressForm'
import type { Address } from '@/payload-types'
import type { DefaultDocumentIDType } from 'payload'

type Props = {
  addressID?: DefaultDocumentIDType
  initialData?: Partial<Omit<Address, 'country'>> & { country?: string }
  buttonText?: string
  modalTitle?: string
  callback?: (address: Partial<Address>) => void
  skipSubmission?: boolean
  disabled?: boolean
  children?: React.ReactNode
  open?: boolean
  onOpenChange?: (open: boolean) => void
}

export const CreateAddressModal: React.FC<Props> = ({
  addressID,
  initialData,
  buttonText = 'Thêm địa chỉ mới',
  modalTitle = 'Thêm địa chỉ mới',
  callback,
  skipSubmission,
  disabled,
  children,
  open: controlledOpen,
  onOpenChange,
}) => {
  const [internalOpen, setInternalOpen] = useState(false)
  const isControlled = controlledOpen !== undefined
  const open = isControlled ? controlledOpen : internalOpen

  const setOpen = (state: boolean) => {
    if (!isControlled) {
      setInternalOpen(state)
    }
    if (onOpenChange) {
      onOpenChange(state)
    }
  }

  const handleCallback = (data: Partial<Address>) => {
    setOpen(false)
    if (callback) {
      callback(data)
    }
  }

  return (
    <>
      {children ? (
        <span onClick={() => !disabled && setOpen(true)} className="cursor-pointer">
          {children}
        </span>
      ) : buttonText ? (
        <Button
          type="primary"
          icon={<PlusOutlined />}
          disabled={disabled}
          onClick={() => setOpen(true)}
          className="!bg-[#1677ff]"
        >
          {buttonText}
        </Button>
      ) : null}

      <Modal
        title={
          <div className="text-base font-bold text-neutral-900 dark:text-neutral-100">
            {modalTitle}
          </div>
        }
        open={open}
        onCancel={() => setOpen(false)}
        footer={null}
        destroyOnHidden
        width={640}
        centered
      >
        <div className="py-2">
          <p className="text-xs text-neutral-500 mb-6">
            Địa chỉ này sẽ được lưu vào sổ địa chỉ tài khoản của bạn để dùng cho thanh toán và nhận chứng từ.
          </p>

          <AddressForm
            addressID={addressID}
            initialData={initialData}
            callback={handleCallback}
            skipSubmission={skipSubmission}
            onCancel={() => setOpen(false)}
          />
        </div>
      </Modal>
    </>
  )
}
