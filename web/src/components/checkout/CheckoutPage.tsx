'use client'

import React, { Suspense, useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  Row,
  Col,
  Card,
  Button,
  Input,
  Radio,
  Typography,
  Tag,
  Alert,
  Spin,
  Checkbox,
  Space,
  Divider,
  Result,
  message,
} from 'antd'
import {
  UserOutlined,
  WalletOutlined,
  CreditCardOutlined,
  QrcodeOutlined,
  ArrowLeftOutlined,
  ArrowRightOutlined,
  CheckCircleOutlined,
  SafetyCertificateFilled,
  LockOutlined,
  EnvironmentOutlined,
  ShoppingCartOutlined,
} from '@ant-design/icons'
import { Elements } from '@stripe/react-stripe-js'
import { loadStripe } from '@stripe/stripe-js'
import { useAuth } from '@/providers/Auth'
import { useTheme } from '@/providers/Theme'
import { cssVariables } from '@/cssVariables'
import { useAddresses } from '@payloadcms/plugin-ecommerce/client/react'
import { useCart } from '@/providers/Cart'
import { CheckoutAddresses } from '@/components/checkout/CheckoutAddresses'
import { CreateAddressModal } from '@/components/addresses/CreateAddressModal'
import { CheckoutSteps } from '@/components/checkout/CheckoutSteps'
import { OrderSummaryCard } from '@/components/checkout/OrderSummaryCard'
import { CheckoutForm } from '@/components/forms/CheckoutForm'
import { AddressItem } from '@/components/addresses/AddressItem'
import type { Address } from '@/payload-types'

const { Title, Text, Paragraph } = Typography

const apiKey = `${process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY}`
const stripe = loadStripe(apiKey)

type PaymentMethodType = 'wallet' | 'vietqr' | 'stripe'

export const CheckoutPage: React.FC = () => {
  const { user } = useAuth()
  const router = useRouter()
  const { cart, clearCart } = useCart()
  const { theme } = useTheme()
  const { addresses } = useAddresses()

  const [currentStep, setCurrentStep] = useState(0)
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethodType>('wallet')
  const [email, setEmail] = useState('')
  const [emailEditable, setEmailEditable] = useState(true)
  const [billingAddress, setBillingAddress] = useState<Partial<Address>>()
  const [shippingAddress, setShippingAddress] = useState<Partial<Address>>()
  const [billingAddressSameAsShipping, setBillingAddressSameAsShipping] = useState(true)
  const [paymentData, setPaymentData] = useState<null | Record<string, unknown>>(null)
  const [isProcessingPayment, setProcessingPayment] = useState(false)
  const [hasPrefilled, setHasPrefilled] = useState(false)
  const [error, setError] = useState<null | string>(null)

  // Wallet data state
  const [wallet, setWallet] = useState<{ balance: number; pendingBalance: number } | null>(null)
  const [isLoadingWallet, setIsLoadingWallet] = useState(false)

  // Fetch wallet balance when authenticated
  useEffect(() => {
    if (user) {
      queueMicrotask(() => setIsLoadingWallet(true))
      fetch('/api/v1/me/wallet')
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          // The route nests the wallet under `wallet` (`{success, wallet:{balance,…}}`), the same
          // shape WalletClient reads; storing the whole envelope made `wallet.balance` below read
          // `undefined`, so the wallet rail was permanently refused (inventory row A1).
          if (data?.wallet) setWallet(data.wallet)
        })
        .catch(() => {})
        .finally(() => setIsLoadingWallet(false))
    }
  }, [user])

  // Prefill default address if available
  useEffect(() => {
    if (!hasPrefilled && !billingAddress && addresses && addresses.length > 0) {
      const defaultAddress = addresses[0]
      queueMicrotask(() => {
        setHasPrefilled(true)
        if (defaultAddress) {
          setBillingAddress(defaultAddress)
        }
      })
    }
  }, [addresses, billingAddress, hasPrefilled])

  const cartIsEmpty = !cart || !cart.items || !cart.items.length
  const items = cart?.items || []
  const subtotal =
    cart?.subtotal ||
    items.reduce((acc: number, item: any) => {
      const price = typeof item.product === 'object' ? item.product?.price || 0 : 0
      return acc + price * (item.quantity || 1)
    }, 0)

  const canGoToPayment = Boolean(
    (email || user) && billingAddress && (billingAddressSameAsShipping || shippingAddress),
  )

  const walletBalance = wallet?.balance ?? 0
  const isWalletSufficient = walletBalance >= subtotal

  // The card rail is out of P0 (decision 0004) and decision 0013 removed the plugin's
  // `/api/payments/stripe/initiate`, so the plugin's `initiatePayment` used to POST into a route that
  // no longer exists and the buyer read a 404. The card option now asks the rail's own endpoint, which
  // exists and answers a deterministic refusal (501 PAYMENT_METHOD_NOT_IMPLEMENTED, decision 0014 §5);
  // that message is rendered by the error surface this step already has. Nothing here switches the
  // option to another rail, and no Stripe adapter is involved.
  const initiateStripePayment = useCallback(async () => {
    setProcessingPayment(true)
    try {
      const res = await fetch('/api/v1/payments/card/initiate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: Math.round(subtotal) }),
      })

      const data = (await res.json().catch(() => ({}))) as { error?: string; message?: string }
      const msg =
        data.message ||
        data.error ||
        'Thanh toán bằng thẻ quốc tế chưa được hỗ trợ. Vui lòng chọn Ví KienTaoHub hoặc chuyển khoản VietQR.'

      setError(msg)
      message.error(msg)
    } catch {
      const msg = 'Đã có lỗi xảy ra khi khởi tạo phiên thanh toán thẻ.'
      setError(msg)
      message.error(msg)
    } finally {
      setProcessingPayment(false)
    }
  }, [subtotal])

  // Handle direct wallet purchase
  const handleWalletPurchase = async () => {
    if (!user) {
      message.warning('Vui lòng đăng nhập để thanh toán bằng số dư Ví!')
      router.push('/login?redirect=/checkout')
      return
    }

    if (!isWalletSufficient) {
      message.error('Số dư ví không đủ để thanh toán đơn hàng này!')
      return
    }

    setProcessingPayment(true)
    try {
      let lastOrderId: string | number | null = null

      for (const item of items) {
        const prodId = typeof item.product === 'object' ? item.product?.id : item.product
        if (!prodId) continue

        const res = await fetch('/api/v1/orders/purchase', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ productId: prodId }),
        })

        if (!res.ok) {
          const errBody = await res.json().catch(() => ({}))
          throw new Error(errBody.message || 'Giao dịch qua ví không thành công.')
        }

        const data = await res.json()
        if (data.orderId) {
          lastOrderId = data.orderId
        }
      }

      await clearCart()
      message.success('Thanh toán thành công! Quyền tải xuống đã được kích hoạt.')
      if (lastOrderId) {
        router.push(`/orders/${lastOrderId}`)
      } else {
        router.push('/orders')
      }
    } catch (err: any) {
      message.error(err.message || 'Lỗi xử lý thanh toán qua ví.')
      setError(err.message)
    } finally {
      setProcessingPayment(false)
    }
  }

  // The VietQR branch pays through the SePay rail of decision 0004: it asks for a real wallet top-up
  // intent on the same route the wallet page uses, hands the code to the wallet's payment step (which
  // renders the QR and polls until the transfer lands) and leaves the cart alone — the purchase itself
  // happens through the wallet branch below once the wallet is credited. It used to announce
  // "Đơn hàng đã được ghi nhận", clear the cart and navigate to /orders while calling nothing, so the
  // buyer lost the cart and no order, intent or payment existed (inventory A3).
  const handleVietQROrder = async () => {
    setProcessingPayment(true)
    setError(null)
    try {
      const res = await fetch('/api/v1/payments/topup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: Math.round(subtotal) }),
      })

      const data = (await res.json().catch(() => ({}))) as {
        error?: string
        message?: string
        intent?: { code?: string }
      }

      if (!res.ok || !data?.intent?.code) {
        const msg =
          data.message ||
          data.error ||
          'Không thể tạo yêu cầu nạp tiền để thanh toán bằng VietQR. Vui lòng thử lại.'
        message.error(msg)
        setError(msg)
        return
      }

      message.success(
        `Đã tạo yêu cầu nạp tiền ${data.intent.code}. Vui lòng hoàn tất quét mã VietQR để nạp ví, sau đó thanh toán đơn hàng bằng số dư ví.`,
      )
      router.push(`/wallet?topup=${encodeURIComponent(data.intent.code)}`)
    } catch {
      const msg = 'Có lỗi xảy ra khi tạo yêu cầu nạp tiền qua VietQR.'
      message.error(msg)
      setError(msg)
    } finally {
      setProcessingPayment(false)
    }
  }

  if (cartIsEmpty && isProcessingPayment) {
    return (
      <div className="py-24 text-center max-w-xl mx-auto">
        <Spin size="large" />
        <Title level={4} className="mt-4">
          Đang xử lý đơn hàng của bạn...
        </Title>
        <Text type="secondary">Vui lòng không đóng hoặc tải lại trang trình duyệt.</Text>
      </div>
    )
  }

  if (cartIsEmpty) {
    return (
      <div className="py-16 text-center max-w-xl mx-auto">
        <Result
          icon={<ShoppingCartOutlined style={{ color: '#1677ff', fontSize: 64 }} />}
          title="Giỏ hàng của bạn đang trống"
          subTitle="Bạn chưa có bản vẽ kỹ thuật nào trong giỏ hàng để tiến hành thanh toán."
          extra={
            <Button type="primary" size="large" href="/shop" className="!bg-[#1677ff]">
              Khám phá kho bản vẽ kỹ thuật
            </Button>
          }
        />
      </div>
    )
  }

  return (
    <div className="min-h-[85vh] py-8 bg-neutral-50 dark:bg-neutral-950">
      <div className="container mx-auto px-4 max-w-7xl">
        <div className="mb-6">
          <Title level={2} className="!mb-1">
            Thanh toán an toàn
          </Title>
          <Text type="secondary">
            Cấp quyền sở hữu và kích hoạt tải hồ sơ kỹ thuật số tức thì.
          </Text>
        </div>

        {/* 3-Stage Steps Progress */}
        <CheckoutSteps
          currentStep={currentStep}
          onChange={(step) => {
            if (step < currentStep || (step === 1 && canGoToPayment)) {
              setCurrentStep(step)
            }
          }}
        />

        <Row gutter={[24, 24]}>
          {/* Main Checkout Area */}
          <Col xs={24} lg={16}>
            {/* STEP 0: Contact and Address */}
            {currentStep === 0 && (
              <div className="space-y-6">
                {/* Contact Card */}
                <Card
                  title={
                    <Space>
                      <UserOutlined className="text-[#1677ff]" />
                      <span>1. Thông tin người mua</span>
                    </Space>
                  }
                  className="shadow-sm"
                >
                  {user ? (
                    <div className="flex items-center justify-between p-3 bg-blue-50/50 dark:bg-blue-950/20 border border-blue-100 dark:border-blue-900/30 rounded-lg">
                      <div>
                        <span className="font-semibold text-sm block">{user.name || 'Khách hàng'}</span>
                        <Text type="secondary" className="text-xs">
                          {user.email}
                        </Text>
                      </div>
                      <Tag color="blue">Tài khoản đã đăng nhập</Tag>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <Alert
                        type="info"
                        showIcon
                        title="Đã có tài khoản KienTaoHub?"
                        description={
                          <div className="text-xs mt-1">
                            <Link href="/login?redirect=/checkout" className="text-[#1677ff] font-medium underline">
                              Đăng nhập ngay
                            </Link>{' '}
                            để đồng bộ lịch sử đơn hàng và dùng số dư ví, hoặc tiếp tục thanh toán dạng khách.
                          </div>
                        }
                      />
                      <div>
                        <label className="block text-xs font-medium text-neutral-600 dark:text-neutral-300 mb-1.5">
                          Địa chỉ Email nhận liên kết tải hồ sơ:
                        </label>
                        <Space.Compact className="w-full">
                          <Input
                            placeholder="email@example.com"
                            value={email}
                            disabled={!emailEditable}
                            onChange={(e) => setEmail(e.target.value)}
                            type="email"
                          />
                          {emailEditable ? (
                            <Button
                              type="primary"
                              disabled={!email || !email.includes('@')}
                              onClick={() => setEmailEditable(false)}
                            >
                              Xác nhận
                            </Button>
                          ) : (
                            <Button onClick={() => setEmailEditable(true)}>Sửa</Button>
                          )}
                        </Space.Compact>
                      </div>
                    </div>
                  )}
                </Card>

                {/* Address Card */}
                <Card
                  title={
                    <Space>
                      <EnvironmentOutlined className="text-[#1677ff]" />
                      <span>2. Địa chỉ thanh toán & xuất chứng từ</span>
                    </Space>
                  }
                  className="shadow-sm"
                >
                  {billingAddress ? (
                    <div className="space-y-4">
                      <div className="p-4 border border-neutral-200 dark:border-neutral-700 rounded-lg bg-white dark:bg-neutral-900">
                        <AddressItem
                          address={billingAddress as Address}
                          actions={
                            <Button
                              size="small"
                              danger
                              disabled={Boolean(paymentData)}
                              onClick={() => setBillingAddress(undefined)}
                            >
                              Thay đổi
                            </Button>
                          }
                        />
                      </div>
                    </div>
                  ) : user ? (
                    <CheckoutAddresses heading="Địa chỉ thanh toán" setAddress={setBillingAddress} />
                  ) : (
                    <div className="space-y-3">
                      <Text type="secondary" className="text-xs block">
                        Nhập thông tin địa chỉ để xuất chứng từ thanh toán và hóa đơn điện tử:
                      </Text>
                      <CreateAddressModal
                        disabled={!email || Boolean(emailEditable)}
                        callback={(address) => setBillingAddress(address)}
                        skipSubmission={true}
                        buttonText="Nhập thông tin địa chỉ"
                      />
                    </div>
                  )}

                  <Divider className="my-4" />

                  {/* Shipping same as billing */}
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="shippingSame"
                      checked={billingAddressSameAsShipping}
                      onChange={(e) => setBillingAddressSameAsShipping(e.target.checked)}
                    >
                      Địa chỉ nhận liên hệ trùng với địa chỉ thanh toán
                    </Checkbox>
                  </div>

                  {!billingAddressSameAsShipping && (
                    <div className="mt-4 pt-4 border-t border-neutral-100 dark:border-neutral-800">
                      {shippingAddress ? (
                        <div className="p-3 border rounded-lg">
                          <AddressItem
                            address={shippingAddress as Address}
                            actions={
                              <Button
                                size="small"
                                danger
                                onClick={() => setShippingAddress(undefined)}
                              >
                                Đổi địa chỉ khác
                              </Button>
                            }
                          />
                        </div>
                      ) : user ? (
                        <CheckoutAddresses
                          heading="Địa chỉ liên hệ khác"
                          setAddress={setShippingAddress}
                        />
                      ) : (
                        <CreateAddressModal
                          disabled={!email || Boolean(emailEditable)}
                          callback={(address) => setShippingAddress(address)}
                          skipSubmission={true}
                          buttonText="Thêm địa chỉ liên hệ"
                        />
                      )}
                    </div>
                  )}
                </Card>

                {/* Step 0 Navigation Button */}
                <div className="flex justify-end">
                  <Button
                    type="primary"
                    size="large"
                    disabled={!canGoToPayment}
                    icon={<ArrowRightOutlined />}
                    className="!bg-[#1677ff]"
                    onClick={() => setCurrentStep(1)}
                  >
                    Tiếp tục: Chọn phương thức thanh toán
                  </Button>
                </div>
              </div>
            )}

            {/* STEP 1: Payment Method Selection */}
            {currentStep === 1 && (
              <div className="space-y-6">
                <Card
                  title={
                    <Space>
                      <WalletOutlined className="text-[#1677ff]" />
                      <span>Chọn phương thức thanh toán</span>
                    </Space>
                  }
                  className="shadow-sm"
                >
                  <Radio.Group
                    className="w-full space-y-3"
                    value={paymentMethod}
                    onChange={(e) => setPaymentMethod(e.target.value)}
                  >
                    {/* Method 1: KienTaoHub Wallet */}
                    <div
                      className={`p-4 rounded-lg border transition-all cursor-pointer ${
                        paymentMethod === 'wallet'
                          ? 'border-[#1677ff] bg-blue-50/40 dark:bg-blue-950/20 shadow-xs'
                          : 'border-neutral-200 dark:border-neutral-800 hover:border-neutral-300'
                      }`}
                      onClick={() => setPaymentMethod('wallet')}
                    >
                      <Radio value="wallet" className="w-full">
                        <div className="ml-2">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-sm text-neutral-900 dark:text-neutral-100">
                              Ví KienTaoHub (Khuyên dùng)
                            </span>
                            <Tag color="green">Kích hoạt tức thì</Tag>
                          </div>
                          <Text type="secondary" className="text-xs block mt-0.5">
                            Thanh toán an toàn, khấu trừ trực tiếp và tải bản vẽ ngay lập tức.
                          </Text>

                          {user ? (
                            <div className="mt-2 text-xs font-mono">
                              {isLoadingWallet ? (
                                <Spin size="small" />
                              ) : (
                                <span>
                                  Số dư khả dụng:{' '}
                                  <strong className={isWalletSufficient ? 'text-emerald-600' : 'text-red-500'}>
                                    {walletBalance.toLocaleString('vi-VN')} ₫
                                  </strong>
                                  {!isWalletSufficient && (
                                    <span className="text-red-500 ml-2">
                                      (Thiếu {(subtotal - walletBalance).toLocaleString('vi-VN')} ₫ —{' '}
                                      <Link href="/wallet" target="_blank" className="underline text-[#1677ff]">
                                        Nạp thêm ví
                                      </Link>
                                      )
                                    </span>
                                  )}
                                </span>
                              )}
                            </div>
                          ) : (
                            <Text type="warning" className="text-xs block mt-1">
                              Vui lòng đăng nhập để sử dụng số dư ví.
                            </Text>
                          )}
                        </div>
                      </Radio>
                    </div>

                    {/* Method 2: VietQR Bank Transfer */}
                    <div
                      className={`p-4 rounded-lg border transition-all cursor-pointer ${
                        paymentMethod === 'vietqr'
                          ? 'border-[#1677ff] bg-blue-50/40 dark:bg-blue-950/20 shadow-xs'
                          : 'border-neutral-200 dark:border-neutral-800 hover:border-neutral-300'
                      }`}
                      onClick={() => setPaymentMethod('vietqr')}
                    >
                      <Radio value="vietqr" className="w-full">
                        <div className="ml-2">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-sm text-neutral-900 dark:text-neutral-100">
                              Chuyển khoản VietQR 24/7
                            </span>
                            <Tag color="blue">Tất cả ngân hàng VN</Tag>
                          </div>
                          <Text type="secondary" className="text-xs block mt-0.5">
                            Quét mã QR qua app ngân hàng (Vietcombank, Techcombank, MB, BIDV, v.v.).
                          </Text>
                        </div>
                      </Radio>
                    </div>

                    {/* Method 3: Stripe Card */}
                    <div
                      className={`p-4 rounded-lg border transition-all cursor-pointer ${
                        paymentMethod === 'stripe'
                          ? 'border-[#1677ff] bg-blue-50/40 dark:bg-blue-950/20 shadow-xs'
                          : 'border-neutral-200 dark:border-neutral-800 hover:border-neutral-300'
                      }`}
                      onClick={() => setPaymentMethod('stripe')}
                    >
                      <Radio value="stripe" className="w-full">
                        <div className="ml-2">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-sm text-neutral-900 dark:text-neutral-100">
                              Thẻ thanh toán quốc tế
                            </span>
                            <Tag>Visa / MasterCard / JCB</Tag>
                          </div>
                          <Text type="secondary" className="text-xs block mt-0.5">
                            Cổng thanh toán Stripe bảo mật chuẩn PCI-DSS Level 1.
                          </Text>
                        </div>
                      </Radio>
                    </div>
                  </Radio.Group>
                </Card>

                {/* Stripe Elements Form if Stripe selected and ready */}
                {paymentMethod === 'stripe' && Boolean(paymentData?.['clientSecret']) && (
                  <Card title="Chi tiết thẻ thanh toán" className="shadow-sm">
                    <Suspense fallback={<Spin />}>
                      <Elements
                        options={{
                          appearance: {
                            theme: 'stripe',
                            variables: {
                              borderRadius: '6px',
                              colorPrimary: '#1677ff',
                              colorBackground: theme === 'dark' ? '#0a0a0a' : cssVariables.colors.base0,
                              colorDanger: cssVariables.colors.error500,
                              colorText: theme === 'dark' ? '#d4d4d4' : cssVariables.colors.base1000,
                              fontFamily: 'system-ui, sans-serif',
                            },
                          },
                          clientSecret: paymentData?.['clientSecret'] as string,
                        }}
                        stripe={stripe}
                      >
                        <div className="space-y-4">
                          <CheckoutForm
                            customerEmail={email || user?.email || ''}
                            billingAddress={billingAddress}
                            setProcessingPayment={setProcessingPayment}
                          />
                          <Button onClick={() => setPaymentData(null)}>Hủy phiên thẻ</Button>
                        </div>
                      </Elements>
                    </Suspense>
                  </Card>
                )}

                {/* Navigation Buttons for Step 1 */}
                <div className="flex justify-between">
                  <Button
                    size="large"
                    icon={<ArrowLeftOutlined />}
                    onClick={() => setCurrentStep(0)}
                  >
                    Quay lại địa chỉ
                  </Button>

                  <Button
                    type="primary"
                    size="large"
                    icon={<ArrowRightOutlined />}
                    className="!bg-[#1677ff]"
                    onClick={() => {
                      if (paymentMethod === 'stripe' && !paymentData) {
                        void initiateStripePayment()
                      }
                      setCurrentStep(2)
                    }}
                  >
                    Tiếp tục: Xác nhận đơn hàng
                  </Button>
                </div>
              </div>
            )}

            {/* STEP 2: Review and Place Order */}
            {currentStep === 2 && (
              <div className="space-y-6">
                <Card
                  title={
                    <Space>
                      <CheckCircleOutlined className="text-[#1677ff]" />
                      <span>Xác nhận thông tin & Hoàn tất đơn hàng</span>
                    </Space>
                  }
                  className="shadow-sm"
                >
                  <div className="space-y-4">
                    {/* Buyer Summary */}
                    <div className="p-3.5 bg-neutral-50 dark:bg-neutral-900 rounded-lg border border-neutral-200 dark:border-neutral-800 text-sm">
                      <div className="font-semibold text-neutral-800 dark:text-neutral-200 mb-1">
                        Thông tin người nhận & xuất hóa đơn:
                      </div>
                      <div className="text-xs text-neutral-600 dark:text-neutral-400 space-y-0.5">
                        <div>
                          Email: <strong>{user?.email || email}</strong>
                        </div>
                        {billingAddress && (
                          <div>
                            Địa chỉ:{' '}
                            <strong>
                              {billingAddress.firstName} {billingAddress.lastName} — {billingAddress.addressLine1},{' '}
                              {billingAddress.city}
                            </strong>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Chosen Method Confirmation */}
                    <div className="p-3.5 bg-neutral-50 dark:bg-neutral-900 rounded-lg border border-neutral-200 dark:border-neutral-800 text-sm">
                      <div className="font-semibold text-neutral-800 dark:text-neutral-200 mb-1">
                        Phương thức thanh toán đã chọn:
                      </div>
                      <div className="text-xs text-neutral-600 dark:text-neutral-400">
                        {paymentMethod === 'wallet' && (
                          <div className="flex items-center gap-2">
                            <Tag color="green">Ví KienTaoHub</Tag>
                            <span>Khấu trừ {subtotal.toLocaleString('vi-VN')} ₫ từ số dư ví</span>
                          </div>
                        )}
                        {paymentMethod === 'vietqr' && (
                          <div className="space-y-2">
                            <div className="flex items-center gap-2">
                              <Tag color="blue">VietQR 24/7</Tag>
                              <span>Chuyển khoản qua quét mã QR</span>
                            </div>
                            <div className="p-3 bg-blue-50/50 dark:bg-blue-950/30 rounded border border-blue-100 dark:border-blue-900/30 text-xs">
                              <p className="font-medium text-blue-900 dark:text-blue-200">
                                Hướng dẫn quét mã QR:
                              </p>
                              <p className="text-neutral-600 dark:text-neutral-400">
                                Sau khi bấm xác nhận, hệ thống tạo yêu cầu nạp tiền trên ví của bạn và
                                chuyển bạn tới bước thanh toán kèm mã VietQR. Sau khi tiền vào ví, quay
                                lại đây để thanh toán đơn hàng bằng số dư ví.
                              </p>
                            </div>
                          </div>
                        )}
                        {paymentMethod === 'stripe' && (
                          <div className="flex items-center gap-2">
                            <Tag color="purple">Thẻ quốc tế (Stripe)</Tag>
                            <span>Thanh toán qua thẻ Visa / Mastercard</span>
                          </div>
                        )}
                      </div>
                    </div>

                    {error && <Alert type="error" showIcon title={error} />}

                    {/* Guarantees note */}
                    <div className="text-xs text-neutral-500 dark:text-neutral-400 flex items-center gap-2">
                      <LockOutlined className="text-emerald-500" />
                      <span>
                        Dữ liệu giao dịch được mã hóa SSL 256-bit an toàn. Cam kết hoàn tiền nếu hồ sơ bản vẽ lỗi.
                      </span>
                    </div>
                  </div>
                </Card>

                {/* Step 2 Navigation and Action Buttons */}
                <div className="flex justify-between items-center">
                  <Button
                    size="large"
                    icon={<ArrowLeftOutlined />}
                    onClick={() => setCurrentStep(1)}
                  >
                    Đổi phương thức thanh toán
                  </Button>

                  {paymentMethod === 'wallet' && (
                    <Button
                      type="primary"
                      size="large"
                      loading={isProcessingPayment}
                      disabled={!isWalletSufficient || !user}
                      onClick={handleWalletPurchase}
                      icon={<CheckCircleOutlined />}
                      className="!bg-[#1677ff]"
                    >
                      Xác nhận thanh toán Ví ({subtotal.toLocaleString('vi-VN')} ₫)
                    </Button>
                  )}

                  {paymentMethod === 'vietqr' && (
                    <Button
                      type="primary"
                      size="large"
                      loading={isProcessingPayment}
                      onClick={handleVietQROrder}
                      icon={<QrcodeOutlined />}
                      className="!bg-[#1677ff]"
                    >
                      Xác nhận đặt hàng với VietQR
                    </Button>
                  )}

                  {paymentMethod === 'stripe' && (
                    <Button
                      type="primary"
                      size="large"
                      loading={isProcessingPayment}
                      disabled={!paymentData?.['clientSecret']}
                      className="!bg-[#1677ff]"
                    >
                      Hoàn tất thanh toán qua thẻ
                    </Button>
                  )}
                </div>
              </div>
            )}
          </Col>

          {/* Sticky Order Summary Column */}
          <Col xs={24} lg={8}>
            <OrderSummaryCard
              items={items}
              subtotal={subtotal}
              walletDeduction={paymentMethod === 'wallet' && isWalletSufficient ? subtotal : 0}
            />
          </Col>
        </Row>
      </div>
    </div>
  )
}
