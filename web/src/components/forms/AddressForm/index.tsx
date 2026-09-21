'use client'

import React, { useState, useCallback } from 'react'
import { Form, Input, Select, Button, Row, Col, Divider, message } from 'antd'
import { useAddresses } from '@payloadcms/plugin-ecommerce/client/react'
import { SUPPORTED_COUNTRIES } from '@/constants/countries'
import { Address, Config } from '@/payload-types'
import { titles } from './constants'
import { deepMergeSimple } from 'payload/shared'

type Props = {
  addressID?: Config['db']['defaultIDType']
  initialData?: Omit<Address, 'country' | 'id' | 'updatedAt' | 'createdAt'> & { country?: string }
  callback?: (data: Partial<Address>) => void
  skipSubmission?: boolean
  onCancel?: () => void
}

export const AddressForm: React.FC<Props> = ({
  addressID,
  initialData,
  callback,
  skipSubmission,
  onCancel,
}) => {
  const [form] = Form.useForm()
  const { createAddress, updateAddress } = useAddresses()
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleSubmit = useCallback(
    async (values: any) => {
      setIsSubmitting(true)
      try {
        const newData = deepMergeSimple(initialData || {}, values)

        if (!skipSubmission) {
          if (addressID) {
            await updateAddress(addressID, newData)
            message.success('Cập nhật địa chỉ thành công!')
          } else {
            await createAddress(newData)
            message.success('Thêm địa chỉ mới thành công!')
          }
        }

        if (callback) {
          callback(newData)
        }
      } catch (error: any) {
        message.error(error?.message || 'Có lỗi xảy ra khi lưu địa chỉ.')
      } finally {
        setIsSubmitting(false)
      }
    },
    [initialData, skipSubmission, addressID, updateAddress, createAddress, callback],
  )

  // One list, one owner: the same `SUPPORTED_COUNTRIES` the plugin config hands to the addresses
  // collection (decision 0015), so every option this form offers is a value the API accepts.
  const countryOptions = SUPPORTED_COUNTRIES.map(({ label, value }) => ({ label, value }))
  // `VN` leads the shared list, so a new address starts on Vietnam instead of the United States —
  // the default that used to exist here was `US` only because the collection rejected `VN`.
  const defaultCountry = SUPPORTED_COUNTRIES[0].value

  return (
    <Form
      form={form}
      layout="vertical"
      initialValues={{
        title: initialData?.title || undefined,
        firstName: initialData?.firstName || '',
        lastName: initialData?.lastName || '',
        phone: initialData?.phone || '',
        company: initialData?.company || '',
        addressLine1: initialData?.addressLine1 || '',
        addressLine2: initialData?.addressLine2 || '',
        city: initialData?.city || '',
        state: initialData?.state || '',
        postalCode: initialData?.postalCode || '',
        country: initialData?.country || defaultCountry,
      }}
      onFinish={handleSubmit}
      requiredMark="optional"
    >
      <Row gutter={16}>
        <Col xs={24} sm={8}>
          <Form.Item name="title" label="Danh xưng">
            <Select
              placeholder="Chọn"
              allowClear
              options={titles.map((t) => ({ label: t, value: t }))}
            />
          </Form.Item>
        </Col>

        <Col xs={24} sm={8}>
          <Form.Item
            name="firstName"
            label="Tên"
            rules={[{ required: true, message: 'Vui lòng nhập tên' }]}
          >
            <Input placeholder="Văn A" />
          </Form.Item>
        </Col>

        <Col xs={24} sm={8}>
          <Form.Item
            name="lastName"
            label="Họ & Tên đệm"
            rules={[{ required: true, message: 'Vui lòng nhập họ' }]}
          >
            <Input placeholder="Nguyễn" />
          </Form.Item>
        </Col>
      </Row>

      <Row gutter={16}>
        <Col xs={24} sm={12}>
          <Form.Item name="phone" label="Số điện thoại">
            <Input placeholder="0912 345 678" />
          </Form.Item>
        </Col>

        <Col xs={24} sm={12}>
          <Form.Item name="company" label="Tên công ty (tùy chọn)">
            <Input placeholder="Công ty Kiến Trúc ABC" />
          </Form.Item>
        </Col>
      </Row>

      <Row gutter={16}>
        <Col xs={24}>
          <Form.Item
            name="addressLine1"
            label="Địa chỉ dòng 1"
            rules={[{ required: true, message: 'Vui lòng nhập địa chỉ dòng 1' }]}
          >
            <Input placeholder="Số 123 đường Giải Phóng, Phường Đồng Tâm" />
          </Form.Item>
        </Col>

        <Col xs={24}>
          <Form.Item name="addressLine2" label="Địa chỉ dòng 2 (tùy chọn)">
            <Input placeholder="Tòa nhà Landmark, Tầng 5, Phòng 502" />
          </Form.Item>
        </Col>
      </Row>

      <Row gutter={16}>
        <Col xs={24} sm={8}>
          <Form.Item
            name="city"
            label="Thành phố / Tỉnh"
            rules={[{ required: true, message: 'Vui lòng nhập thành phố' }]}
          >
            <Input placeholder="Hà Nội" />
          </Form.Item>
        </Col>

        <Col xs={24} sm={8}>
          <Form.Item name="state" label="Quận / Huyện">
            <Input placeholder="Hai Bà Trưng" />
          </Form.Item>
        </Col>

        <Col xs={24} sm={8}>
          <Form.Item
            name="postalCode"
            label="Mã bưu chính (Zip code)"
            rules={[{ required: true, message: 'Vui lòng nhập mã bưu chính' }]}
          >
            <Input placeholder="100000" />
          </Form.Item>
        </Col>
      </Row>

      <Row gutter={16}>
        <Col xs={24}>
          <Form.Item
            name="country"
            label="Quốc gia"
            rules={[{ required: true, message: 'Vui lòng chọn quốc gia' }]}
          >
            <Select
              showSearch
              placeholder="Chọn quốc gia"
              optionFilterProp="label"
              options={countryOptions}
            />
          </Form.Item>
        </Col>
      </Row>

      <Divider className="my-4" />

      <div className="flex justify-end gap-3">
        {onCancel && (
          <Button onClick={onCancel} disabled={isSubmitting}>
            Hủy
          </Button>
        )}
        <Button type="primary" htmlType="submit" loading={isSubmitting} className="!bg-[#1677ff]">
          {addressID ? 'Cập nhật địa chỉ' : 'Lưu địa chỉ mới'}
        </Button>
      </div>
    </Form>
  )
}
