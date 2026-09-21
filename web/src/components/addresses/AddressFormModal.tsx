'use client'

import React, { useState } from 'react'
import {
  Modal,
  Form,
  Input,
  Select,
  Row,
  Col,
  Button,
  message,
} from 'antd'
import {
  UserOutlined,
  PhoneOutlined,
  HomeOutlined,
  BankOutlined,
} from '@ant-design/icons'
import {
  useAddresses,
  defaultCountries as supportedCountries,
} from '@payloadcms/plugin-ecommerce/client/react'
import type { Address } from '@/payload-types'

export type AddressFormModalProps = {
  open: boolean
  onCancel: () => void
  onSuccess?: (address: Partial<Address>) => void
  addressID?: number | string
  initialData?: Partial<Address>
  modalTitle?: string
  skipSubmission?: boolean
}

const VIETNAM_PROVINCES = [
  { value: 'Hà Nội', label: 'Hà Nội' },
  { value: 'TP. Hồ Chí Minh', label: 'TP. Hồ Chí Minh' },
  { value: 'Đà Nẵng', label: 'Đà Nẵng' },
  { value: 'Hải Phòng', label: 'Hải Phòng' },
  { value: 'Cần Thơ', label: 'Cần Thơ' },
  { value: 'Quảng Ninh', label: 'Quảng Ninh' },
  { value: 'Bình Dương', label: 'Bình Dương' },
  { value: 'Đồng Nai', label: 'Đồng Nai' },
  { value: 'Khánh Hòa', label: 'Khánh Hòa' },
  { value: 'Lâm Đồng', label: 'Lâm Đồng' },
  { value: 'Thừa Thiên Huế', label: 'Thừa Thiên Huế' },
  { value: 'Bắc Ninh', label: 'Bắc Ninh' },
]

export function AddressFormModal({
  open,
  onCancel,
  onSuccess,
  addressID,
  initialData,
  modalTitle,
  skipSubmission = false,
}: AddressFormModalProps) {
  const [form] = Form.useForm()
  const [submitting, setSubmitting] = useState(false)
  const { createAddress, updateAddress } = useAddresses()

  // The addresses collection validates `country` against this same plugin list; a value outside it can
  // never be saved, so the form offers the list and defaults to its first value ('VN' used to be the
  // default and every submit answered 400 invalid selection).
  const countryOptions = supportedCountries.map((c: any) => {
    const val = typeof c === 'string' ? c : c.value
    const lbl = typeof c === 'string' ? c : typeof c.label === 'string' ? c.label : val
    return { label: lbl, value: val }
  })
  const defaultCountry = String(countryOptions[0]?.value ?? '')

  const handleFinish = async (values: any) => {
    setSubmitting(true)
    try {
      const addressData: Partial<Address> = {
        firstName: values.firstName,
        lastName: values.lastName,
        phone: values.phone,
        company: values.company || null,
        addressLine1: values.addressLine1,
        addressLine2: values.addressLine2 || null,
        city: values.city,
        state: values.state || null,
        postalCode: values.postalCode || '100000',
        country: (values.country as any) || defaultCountry,
      }

      if (!skipSubmission) {
        if (addressID) {
          await updateAddress(Number(addressID), addressData)
          message.success('Cập nhật địa chỉ thành công!')
        } else {
          await createAddress(addressData)
          message.success('Thêm địa chỉ mới thành công!')
        }
      }

      form.resetFields()
      if (onSuccess) {
        onSuccess(addressData)
      }
      onCancel()
    } catch (err: any) {
      message.error(err?.message || 'Có lỗi xảy ra khi lưu địa chỉ.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal
      title={modalTitle || (addressID ? 'Chỉnh sửa địa chỉ' : 'Thêm địa chỉ thanh toán / liên hệ')}
      open={open}
      onCancel={onCancel}
      footer={null}
      destroyOnHidden
      width={600}
    >
      <Form
        form={form}
        layout="vertical"
        initialValues={initialData || { country: defaultCountry }}
        onFinish={handleFinish}
        className="mt-4"
      >
        <Row gutter={16}>
          <Col xs={24} sm={12}>
            <Form.Item
              name="firstName"
              label="Họ & tên đệm"
              rules={[{ required: true, message: 'Vui lòng nhập họ!' }]}
            >
              <Input placeholder="Nguyễn Văn" prefix={<UserOutlined />} />
            </Form.Item>
          </Col>
          <Col xs={24} sm={12}>
            <Form.Item
              name="lastName"
              label="Tên"
              rules={[{ required: true, message: 'Vui lòng nhập tên!' }]}
            >
              <Input placeholder="An" />
            </Form.Item>
          </Col>
        </Row>

        <Row gutter={16}>
          <Col xs={24} sm={12}>
            <Form.Item
              name="phone"
              label="Số điện thoại"
              rules={[
                { required: true, message: 'Vui lòng nhập số điện thoại!' },
                { pattern: /^[0-9+ ]{9,15}$/, message: 'Số điện thoại không hợp lệ!' },
              ]}
            >
              <Input placeholder="0912 345 678" prefix={<PhoneOutlined />} />
            </Form.Item>
          </Col>
          <Col xs={24} sm={12}>
            <Form.Item name="company" label="Công ty / Đơn vị (tùy chọn)">
              <Input placeholder="Công ty Kiến trúc X" prefix={<BankOutlined />} />
            </Form.Item>
          </Col>
        </Row>

        <Form.Item
          name="addressLine1"
          label="Địa chỉ chi tiết (Số nhà, tên đường, phường/xã)"
          rules={[{ required: true, message: 'Vui lòng nhập địa chỉ!' }]}
        >
          <Input placeholder="Tầng 5, Tòa nhà Keangnam, Phạm Hùng" prefix={<HomeOutlined />} />
        </Form.Item>

        <Row gutter={16}>
          <Col xs={24} sm={12}>
            <Form.Item
              name="city"
              label="Tỉnh / Thành phố"
              rules={[{ required: true, message: 'Vui lòng chọn Tỉnh/Thành!' }]}
            >
              <Select
                placeholder="Chọn Tỉnh / Thành phố"
                showSearch
                options={VIETNAM_PROVINCES}
              />
            </Form.Item>
          </Col>
          <Col xs={24} sm={12}>
            <Form.Item name="state" label="Quận / Huyện">
              <Input placeholder="Quận Nam Từ Liêm" />
            </Form.Item>
          </Col>
        </Row>

        <Row gutter={16}>
          <Col xs={24} sm={12}>
            <Form.Item name="postalCode" label="Mã bưu chính (Zip code)">
              <Input placeholder="100000" />
            </Form.Item>
          </Col>
          <Col xs={24} sm={12}>
            <Form.Item name="country" label="Quốc gia" initialValue={defaultCountry}>
              <Select options={countryOptions} />
            </Form.Item>
          </Col>
        </Row>

        <Form.Item name="notes" label="Ghi chú giao nhận / Xuất hóa đơn VAT">
          <Input.TextArea rows={3} placeholder="Ghi chú thêm về đơn hàng hoặc mã số thuế xuất hóa đơn..." />
        </Form.Item>

        <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-neutral-100 dark:border-neutral-800">
          <Button onClick={onCancel} disabled={submitting}>
            Hủy
          </Button>
          <Button type="primary" htmlType="submit" loading={submitting} className="!bg-[#1677ff]">
            {addressID ? 'Lưu thay đổi' : 'Thêm địa chỉ'}
          </Button>
        </div>
      </Form>
    </Modal>
  )
}
