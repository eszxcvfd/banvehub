'use client'

import React, { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Modal, Form, Input, InputNumber, Button, Alert, App, Space } from 'antd'
import { PlusOutlined, BankOutlined, WalletOutlined } from '@ant-design/icons'

interface WithdrawalModalProps {
  availableBalance: number
  open?: boolean
  onOpenChange?: (open: boolean) => void
  trigger?: React.ReactNode
  variant?: 'green-pill' | 'primary-button' | 'custom'
}

export function WithdrawalModal({
  availableBalance,
  open: controlledOpen,
  onOpenChange,
  trigger,
  variant = 'green-pill',
}: WithdrawalModalProps) {
  const { message } = App.useApp()
  const router = useRouter()
  const [internalOpen, setInternalOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [form] = Form.useForm()

  const isControlled = controlledOpen !== undefined
  const isOpen = isControlled ? controlledOpen : internalOpen

  const handleOpen = () => {
    if (isControlled) {
      onOpenChange?.(true)
    } else {
      setInternalOpen(true)
    }
    setError(null)
  }

  const handleClose = () => {
    if (loading) return
    if (isControlled) {
      onOpenChange?.(false)
    } else {
      setInternalOpen(false)
    }
    setError(null)
    form.resetFields()
  }

  const handleSubmit = async (values: any) => {
    setError(null)

    const trimmedBankName = (values.bankName || '').trim()
    const trimmedAccountNumber = (values.accountNumber || '').trim()
    const trimmedAccountHolderName = (values.accountHolderName || '').trim()
    const numAmount = Number(values.amount)

    if (!trimmedBankName || !trimmedAccountNumber || !trimmedAccountHolderName) {
      setError('Vui lòng điền đầy đủ thông tin ngân hàng.')
      return
    }

    if (isNaN(numAmount) || numAmount < 50000) {
      setError('Số tiền rút tối thiểu là 50.000 đ.')
      return
    }

    if (numAmount > 50000000) {
      setError('Số tiền rút tối đa là 50.000.000 đ cho mỗi giao dịch.')
      return
    }

    if (numAmount > availableBalance) {
      setError(
        `Số tiền rút (${numAmount.toLocaleString('vi-VN')} đ) vượt quá số dư khả dụng (${availableBalance.toLocaleString('vi-VN')} đ).`,
      )
      return
    }

    setLoading(true)

    try {
      const res = await fetch('/api/v1/seller/withdrawals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: numAmount,
          bankInfo: {
            bankName: trimmedBankName,
            accountNumber: trimmedAccountNumber,
            accountHolderName: trimmedAccountHolderName.toUpperCase(),
          },
        }),
      })

      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.message || data.error || 'Không thể tạo yêu cầu rút tiền.')
      }

      message.success('Yêu cầu rút tiền thành công! Đang chuyển tiếp thẩm định.')
      handleClose()
      router.refresh()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Có lỗi xảy ra khi gửi yêu cầu.'
      setError(msg)
    } finally {
      setLoading(false)
    }
  }

  const renderTrigger = () => {
    if (trigger) {
      return (
        <span onClick={handleOpen} className="inline-block cursor-pointer">
          {trigger}
        </span>
      )
    }

    if (variant === 'green-pill') {
      return (
        <button
          type="button"
          onClick={handleOpen}
          disabled={availableBalance < 50000}
          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold transition-colors ${
            availableBalance >= 50000
              ? 'bg-[#e6f7ec] text-[#059669] hover:bg-[#d1fae5] border border-[#a7f3d0] cursor-pointer'
              : 'bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed'
          }`}
        >
          <PlusOutlined className="text-[10px]" />
          Yêu cầu rút tiền
        </button>
      )
    }

    return (
      <Button
        type="primary"
        icon={<WalletOutlined />}
        onClick={handleOpen}
        disabled={availableBalance < 50000}
        className="bg-[#1677ff] hover:bg-blue-600 font-medium rounded-lg"
      >
        Rút tiền
      </Button>
    )
  }

  return (
    <>
      {renderTrigger()}

      <Modal
        title={
          <div className="flex items-center gap-2 pb-1 border-b border-slate-100">
            <div className="w-8 h-8 rounded-lg bg-blue-50 text-[#1677ff] flex items-center justify-center text-base">
              <BankOutlined />
            </div>
            <div>
              <div className="text-base font-bold text-slate-800">Yêu cầu rút tiền về ngân hàng</div>
              <div className="text-xs text-slate-400 font-normal">
                Số dư khả dụng:{' '}
                <span className="font-semibold text-emerald-600">
                  {availableBalance.toLocaleString('vi-VN')} đ
                </span>
              </div>
            </div>
          </div>
        }
        open={isOpen}
        onCancel={handleClose}
        footer={null}
        destroyOnHidden
        centered
        width={480}
      >
        <div className="pt-3">
          {error && (
            <Alert
              title={error}
              type="error"
              showIcon
              className="mb-4 rounded-lg text-xs"
            />
          )}

          <Form
            form={form}
            layout="vertical"
            onFinish={handleSubmit}
            initialValues={{
              amount: availableBalance >= 50000 ? Math.min(availableBalance, 1000000) : 50000,
            }}
          >
            <Form.Item
              name="bankName"
              label={<span className="text-xs font-semibold text-slate-700">Ngân hàng thụ hưởng</span>}
              rules={[{ required: true, message: 'Vui lòng nhập tên ngân hàng' }]}
            >
              <Input
                placeholder="Ví dụ: Vietcombank, Techcombank, MB Bank, ACB..."
                size="large"
                className="rounded-lg text-sm"
              />
            </Form.Item>

            <Form.Item
              name="accountNumber"
              label={<span className="text-xs font-semibold text-slate-700">Số tài khoản</span>}
              rules={[{ required: true, message: 'Vui lòng nhập số tài khoản' }]}
            >
              <Input
                placeholder="Nhập chính xác số tài khoản ngân hàng"
                size="large"
                className="rounded-lg text-sm font-mono"
              />
            </Form.Item>

            <Form.Item
              name="accountHolderName"
              label={<span className="text-xs font-semibold text-slate-700">Tên chủ tài khoản</span>}
              rules={[{ required: true, message: 'Vui lòng nhập tên chủ tài khoản' }]}
            >
              <Input
                placeholder="VIẾT HOA KHÔNG DẤU (ví dụ: NGUYEN VAN A)"
                size="large"
                className="rounded-lg text-sm uppercase"
              />
            </Form.Item>

            <Form.Item
              label={<span className="text-xs font-semibold text-slate-700">Số tiền muốn rút (VND)</span>}
              extra={
                <span className="text-[11px] text-slate-400">
                  Hạn mức: 50.000 đ – 50.000.000 đ / giao dịch. Tiền sẽ tạm khóa trong lúc chờ xử lý.
                </span>
              }
            >
              <Space.Compact block>
                <Form.Item
                  name="amount"
                  noStyle
                  rules={[
                    { required: true, message: 'Vui lòng nhập số tiền rút' },
                    {
                      validator: (_, val) => {
                        if (val && val < 50000) {
                          return Promise.reject(new Error('Tối thiểu 50.000 đ'))
                        }
                        if (val && val > availableBalance) {
                          return Promise.reject(new Error('Vượt quá số dư khả dụng'))
                        }
                        return Promise.resolve()
                      },
                    },
                  ]}
                >
                  <InputNumber<number>
                    style={{ width: '100%' }}
                    size="large"
                    step={10000}
                    formatter={(val) => `${val}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
                    parser={(val) => Number(val ? val.replace(/\$\s?|(,*)/g, '') : 0)}
                    className="rounded-l-lg text-sm"
                  />
                </Form.Item>
                <Button size="large" disabled className="!bg-slate-100 !text-slate-700 !border-slate-300 rounded-r-lg font-semibold text-sm">
                  đ
                </Button>
              </Space.Compact>
            </Form.Item>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100 mt-2">
              <Button onClick={handleClose} disabled={loading} className="rounded-lg">
                Hủy bỏ
              </Button>
              <Button
                type="primary"
                htmlType="submit"
                loading={loading}
                className="bg-[#1677ff] hover:bg-blue-600 rounded-lg font-medium"
              >
                Xác nhận rút tiền
              </Button>
            </div>
          </Form>
        </div>
      </Modal>
    </>
  )
}
