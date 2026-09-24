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
  Avatar,
  Breadcrumb,
} from 'antd'
import {
  UserOutlined,
  WalletOutlined,
  QrcodeOutlined,
  ArrowLeftOutlined,
  ArrowRightOutlined,
  CheckCircleOutlined,
  SafetyCertificateFilled,
  LockOutlined,
  ShoppingCartOutlined,
  EditOutlined,
} from '@ant-design/icons'
import { Elements } from '@stripe/react-stripe-js'
import { loadStripe } from '@stripe/stripe-js'
import { useAuth } from '@/providers/Auth'
import { useTheme } from '@/providers/Theme'
import { useAntdApp } from '@/providers/Antd'
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

const { Title, Text } = Typography

const apiKey = `${process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY}`
const stripe = loadStripe(apiKey)

type PaymentMethodType = 'wallet' | 'vietqr' | 'stripe'

export const CheckoutPage: React.FC = () => {
  const { message } = useAntdApp()
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

  // User display credentials matching Header and Account layout
  const displayName = user?.name || (user?.email ? user.email.split('@')[0] : 'Khách hàng')
  const userInitial = displayName.charAt(0).toUpperCase()

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
    } catch {
      const msg = 'Đã có lỗi xảy ra khi khởi tạo phiên thanh toán thẻ.'
      setError(msg)
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
    <div className="min-h-[85vh] py-8 md:py-10 pb-20 md:pb-28 bg-slate-50/70 dark:bg-[#0c0e12]">
      <div className="container mx-auto px-4 max-w-7xl">
        {/* Breadcrumb Navigation */}
        <div className="mb-4">
          <Breadcrumb
            items={[
              {
                title: <Link href="/" className="text-slate-500 dark:text-neutral-400 hover:text-[#1677ff]">Trang chủ</Link>,
              },
              {
                title: <Link href="/cart" className="text-slate-500 dark:text-neutral-400 hover:text-[#1677ff]">Giỏ hàng</Link>,
              },
              {
                title: <span className="font-medium text-slate-800 dark:text-neutral-200">Thanh toán</span>,
              },
            ]}
          />
        </div>

        {/* Page Header */}
        <div className="mb-6 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <Title level={2} className="!mb-1 !text-2xl md:!text-3xl !font-bold text-slate-900 dark:text-white">
              Thanh toán an toàn
            </Title>
            <Text type="secondary" className="text-sm">
              Cấp quyền sở hữu và kích hoạt tải hồ sơ kỹ thuật số tức thì.
            </Text>
          </div>

          <div className="flex items-center gap-3 self-start md:self-auto">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200/80 dark:border-emerald-800/50 text-emerald-700 dark:text-emerald-300 text-xs font-medium">
              <LockOutlined className="text-emerald-600 dark:text-emerald-400" />
              <span>Mã hóa SSL 256-bit</span>
            </div>
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-blue-50 dark:bg-blue-950/40 border border-blue-200/80 dark:border-blue-800/50 text-[#1677ff] dark:text-blue-300 text-xs font-medium">
              <SafetyCertificateFilled className="text-[#1677ff]" />
              <span>Bảo vệ quyền tác giả</span>
            </div>
          </div>
        </div>

        {/* 3-Stage Steps Progress */}
        <div className="mb-8">
          <CheckoutSteps
            currentStep={currentStep}
            onChange={(step) => {
              if (step < currentStep || (step === 1 && canGoToPayment)) {
                setCurrentStep(step)
              }
            }}
          />
        </div>

        <Row gutter={[24, 24]} align="top">
          {/* Main Checkout Area */}
          <Col xs={24} lg={15}>
            {/* STEP 0: Contact and Address */}
            {currentStep === 0 && (
              <Card
                className="rounded-2xl border-slate-200/80 dark:border-neutral-800 shadow-sm bg-white dark:bg-neutral-900 overflow-hidden"
                styles={{ body: { padding: '24px 28px' } }}
              >
                {/* Section 1: Buyer Info */}
                <div className="pb-6 border-b border-slate-100 dark:border-neutral-800">
                  <div className="flex items-center justify-between mb-3.5">
                    <div className="flex items-center gap-2.5">
                      <span className="w-6 h-6 rounded-md bg-blue-50 dark:bg-blue-950/60 text-[#1677ff] flex items-center justify-center font-bold text-xs">
                        1
                      </span>
                      <h3 className="font-semibold text-base text-slate-900 dark:text-neutral-100 m-0">
                        Thông tin người mua
                      </h3>
                    </div>
                    {user && (
                      <Tag color="blue" className="!rounded-md !text-[11px] !px-2.5 !py-0.5 m-0 font-medium">
                        Tài khoản đã đăng nhập
                      </Tag>
                    )}
                  </div>

                  {user ? (
                    <div className="flex items-center justify-between p-3.5 bg-slate-50/80 dark:bg-neutral-800/40 border border-slate-200/70 dark:border-neutral-800 rounded-xl">
                      <div className="flex items-center gap-3">
                        <Avatar
                          size={40}
                          style={{ backgroundColor: '#0f172a' }}
                          className="font-bold shadow-xs text-white shrink-0 ring-2 ring-slate-200 dark:ring-neutral-700"
                          icon={!userInitial ? <UserOutlined /> : undefined}
                        >
                          {userInitial || undefined}
                        </Avatar>
                        <div>
                          <div className="font-semibold text-sm text-slate-900 dark:text-neutral-100">
                            {displayName}
                          </div>
                          <Text type="secondary" className="text-xs">
                            {user.email}
                          </Text>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <Alert
                        type="info"
                        showIcon
                        message="Đã có tài khoản KienTaoHub?"
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
                            className="!rounded-l-xl"
                          />
                          {emailEditable ? (
                            <Button
                              type="primary"
                              disabled={!email || !email.includes('@')}
                              onClick={() => setEmailEditable(false)}
                              className="!rounded-r-xl !bg-[#1677ff]"
                            >
                              Xác nhận
                            </Button>
                          ) : (
                            <Button onClick={() => setEmailEditable(true)} className="!rounded-r-xl">Sửa</Button>
                          )}
                        </Space.Compact>
                      </div>
                    </div>
                  )}
                </div>

                {/* Section 2: Address */}
                <div className="py-6 border-b border-slate-100 dark:border-neutral-800">
                  <div className="flex items-center gap-2.5 mb-3.5">
                    <span className="w-6 h-6 rounded-md bg-blue-50 dark:bg-blue-950/60 text-[#1677ff] flex items-center justify-center font-bold text-xs">
                      2
                    </span>
                    <h3 className="font-semibold text-base text-slate-900 dark:text-neutral-100 m-0">
                      Địa chỉ thanh toán & xuất chứng từ
                    </h3>
                  </div>

                  {billingAddress ? (
                    <div className="p-4 border border-slate-200/80 dark:border-neutral-800 rounded-xl bg-slate-50/50 dark:bg-neutral-800/40">
                      <AddressItem
                        address={billingAddress as Address}
                        actions={
                          <Button
                            size="middle"
                            icon={<EditOutlined />}
                            className="hover:!text-[#1677ff] hover:!border-[#1677ff] !rounded-lg"
                            disabled={Boolean(paymentData)}
                            onClick={() => setBillingAddress(undefined)}
                          >
                            Thay đổi
                          </Button>
                        }
                      />
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

                  {/* Shipping same as billing */}
                  <div className="mt-4 flex items-center gap-2">
                    <Checkbox
                      id="shippingSame"
                      checked={billingAddressSameAsShipping}
                      onChange={(e) => setBillingAddressSameAsShipping(e.target.checked)}
                      className="text-xs text-slate-700 dark:text-slate-300"
                    >
                      Địa chỉ nhận liên hệ trùng với địa chỉ thanh toán
                    </Checkbox>
                  </div>

                  {!billingAddressSameAsShipping && (
                    <div className="mt-4 pt-4 border-t border-dashed border-slate-200 dark:border-neutral-800">
                      {shippingAddress ? (
                        <div className="p-4 border border-slate-200/80 dark:border-neutral-800 rounded-xl bg-slate-50/50 dark:bg-neutral-800/40">
                          <AddressItem
                            address={shippingAddress as Address}
                            actions={
                              <Button
                                size="middle"
                                icon={<EditOutlined />}
                                className="hover:!text-[#1677ff] hover:!border-[#1677ff] !rounded-lg"
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
                </div>

                {/* Section 3: Navigation Footer */}
                <div className="pt-6 flex items-center justify-between">
                  <Link
                    href="/cart"
                    className="inline-flex items-center gap-2 text-sm font-medium text-slate-600 dark:text-neutral-400 hover:text-[#1677ff] transition-colors"
                  >
                    <ShoppingCartOutlined />
                    <span>Quay lại giỏ hàng</span>
                  </Link>
                  <Button
                    type="primary"
                    size="large"
                    disabled={!canGoToPayment}
                    icon={<ArrowRightOutlined />}
                    className="!bg-[#1677ff] !h-11 !px-6 !rounded-xl !font-semibold shadow-md hover:!shadow-lg transition-all"
                    onClick={() => setCurrentStep(1)}
                  >
                    Tiếp tục: Chọn phương thức thanh toán
                  </Button>
                </div>
              </Card>
            )}

            {/* STEP 1: Payment Method Selection */}
            {currentStep === 1 && (
              <Card
                className="rounded-2xl border-slate-200/80 dark:border-neutral-800 shadow-sm bg-white dark:bg-neutral-900 overflow-hidden"
                styles={{ body: { padding: '24px 28px' } }}
              >
                <div className="flex items-center gap-2.5 pb-5 mb-5 border-b border-slate-100 dark:border-neutral-800">
                  <span className="w-6 h-6 rounded-md bg-blue-50 dark:bg-blue-950/60 text-[#1677ff] flex items-center justify-center font-bold text-xs">
                    <WalletOutlined />
                  </span>
                  <h3 className="font-semibold text-base text-slate-900 dark:text-neutral-100 m-0">
                    Chọn phương thức thanh toán
                  </h3>
                </div>

                <Radio.Group
                  className="w-full space-y-3.5"
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value)}
                >
                  {/* Method 1: KienTaoHub Wallet */}
                  <div
                    className={`p-4 rounded-xl border-2 transition-all cursor-pointer ${
                      paymentMethod === 'wallet'
                        ? 'border-[#1677ff] bg-blue-50/40 dark:bg-blue-950/30 shadow-xs'
                        : 'border-slate-200/80 dark:border-neutral-800 hover:border-slate-300 dark:hover:border-neutral-700 bg-white dark:bg-neutral-900'
                    }`}
                    onClick={() => setPaymentMethod('wallet')}
                  >
                    <Radio value="wallet" className="w-full">
                      <div className="ml-2.5">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-sm text-slate-900 dark:text-neutral-100">
                            Ví KienTaoHub (Khuyên dùng)
                          </span>
                          <Tag color="green" className="!rounded-md !text-[11px] !font-medium">Kích hoạt tức thì</Tag>
                        </div>
                        <Text type="secondary" className="text-xs block mt-1">
                          Thanh toán an toàn, khấu trừ trực tiếp và cấp quyền tải bản vẽ ngay lập tức.
                        </Text>

                        {user ? (
                          <div className="mt-2.5 p-2.5 bg-slate-50 dark:bg-neutral-800/60 rounded-lg border border-slate-200/60 dark:border-neutral-700/60 text-xs font-mono">
                            {isLoadingWallet ? (
                              <Spin size="small" />
                            ) : (
                              <span>
                                Số dư khả dụng:{' '}
                                <strong className={isWalletSufficient ? 'text-emerald-600 dark:text-emerald-400 font-bold' : 'text-red-500 font-bold'}>
                                  {walletBalance.toLocaleString('vi-VN')} ₫
                                </strong>
                                {!isWalletSufficient && (
                                  <span className="text-red-500 ml-2">
                                    (Thiếu {(subtotal - walletBalance).toLocaleString('vi-VN')} ₫ —{' '}
                                    <Link href="/wallet" target="_blank" className="underline text-[#1677ff] font-medium">
                                      Nạp thêm ví
                                    </Link>
                                    )
                                  </span>
                                )}
                              </span>
                            )}
                          </div>
                        ) : (
                          <Text type="warning" className="text-xs block mt-1.5">
                            Vui lòng đăng nhập để sử dụng số dư ví.
                          </Text>
                        )}
                      </div>
                    </Radio>
                  </div>

                  {/* Method 2: VietQR Bank Transfer */}
                  <div
                    className={`p-4 rounded-xl border-2 transition-all cursor-pointer ${
                      paymentMethod === 'vietqr'
                        ? 'border-[#1677ff] bg-blue-50/40 dark:bg-blue-950/30 shadow-xs'
                        : 'border-slate-200/80 dark:border-neutral-800 hover:border-slate-300 dark:hover:border-neutral-700 bg-white dark:bg-neutral-900'
                    }`}
                    onClick={() => setPaymentMethod('vietqr')}
                  >
                    <Radio value="vietqr" className="w-full">
                      <div className="ml-2.5">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-sm text-slate-900 dark:text-neutral-100">
                            Chuyển khoản VietQR 24/7
                          </span>
                          <Tag color="blue" className="!rounded-md !text-[11px] !font-medium">Tất cả ngân hàng VN</Tag>
                        </div>
                        <Text type="secondary" className="text-xs block mt-1">
                          Quét mã QR qua ứng dụng ngân hàng (Vietcombank, Techcombank, MB, BIDV, ACB, v.v.).
                        </Text>
                      </div>
                    </Radio>
                  </div>

                  {/* Method 3: Stripe Card */}
                  <div
                    className={`p-4 rounded-xl border-2 transition-all cursor-pointer ${
                      paymentMethod === 'stripe'
                        ? 'border-[#1677ff] bg-blue-50/40 dark:bg-blue-950/30 shadow-xs'
                        : 'border-slate-200/80 dark:border-neutral-800 hover:border-slate-300 dark:hover:border-neutral-700 bg-white dark:bg-neutral-900'
                    }`}
                    onClick={() => setPaymentMethod('stripe')}
                  >
                    <Radio value="stripe" className="w-full">
                      <div className="ml-2.5">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-sm text-slate-900 dark:text-neutral-100">
                            Thẻ thanh toán quốc tế
                          </span>
                          <Tag className="!rounded-md !text-[11px]">Visa / MasterCard / JCB</Tag>
                        </div>
                        <Text type="secondary" className="text-xs block mt-1">
                          Cổng thanh toán Stripe bảo mật chuẩn quốc tế PCI-DSS Level 1.
                        </Text>
                      </div>
                    </Radio>
                  </div>
                </Radio.Group>

                {/* Stripe Elements Form if Stripe selected and ready */}
                {paymentMethod === 'stripe' && Boolean(paymentData?.['clientSecret']) && (
                  <div className="mt-4 p-4 rounded-xl border border-slate-200/80 dark:border-neutral-800 bg-slate-50/50 dark:bg-neutral-800/40">
                    <Suspense fallback={<Spin />}>
                      <Elements
                        options={{
                          appearance: {
                            theme: 'stripe',
                            variables: {
                              borderRadius: '8px',
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
                          <Button onClick={() => setPaymentData(null)} className="!rounded-lg">Hủy phiên thẻ</Button>
                        </div>
                      </Elements>
                    </Suspense>
                  </div>
                )}

                {/* Navigation Buttons for Step 1 */}
                <div className="pt-6 mt-6 border-t border-slate-100 dark:border-neutral-800 flex items-center justify-between">
                  <Button
                    size="large"
                    icon={<ArrowLeftOutlined />}
                    onClick={() => setCurrentStep(0)}
                    className="!rounded-xl !h-11 !px-5"
                  >
                    Quay lại địa chỉ
                  </Button>

                  <Button
                    type="primary"
                    size="large"
                    icon={<ArrowRightOutlined />}
                    className="!bg-[#1677ff] !h-11 !px-6 !rounded-xl !font-semibold shadow-md hover:!shadow-lg transition-all"
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
              </Card>
            )}

            {/* STEP 2: Review and Place Order */}
            {currentStep === 2 && (
              <Card
                className="rounded-2xl border-slate-200/80 dark:border-neutral-800 shadow-sm bg-white dark:bg-neutral-900 overflow-hidden"
                styles={{ body: { padding: '24px 28px' } }}
              >
                <div className="flex items-center gap-2.5 pb-5 mb-5 border-b border-slate-100 dark:border-neutral-800">
                  <span className="w-6 h-6 rounded-md bg-blue-50 dark:bg-blue-950/60 text-[#1677ff] flex items-center justify-center font-bold text-xs">
                    <CheckCircleOutlined />
                  </span>
                  <h3 className="font-semibold text-base text-slate-900 dark:text-neutral-100 m-0">
                    Xác nhận thông tin & Hoàn tất đơn hàng
                  </h3>
                </div>

                <div className="space-y-4">
                  {/* Buyer Summary */}
                  <div className="p-4 bg-slate-50/70 dark:bg-neutral-800/40 rounded-xl border border-slate-200/80 dark:border-neutral-800 text-sm">
                    <div className="font-semibold text-slate-800 dark:text-neutral-200 mb-2 flex items-center gap-2">
                      <UserOutlined className="text-[#1677ff]" />
                      <span>Thông tin người nhận & xuất hóa đơn:</span>
                    </div>
                    <div className="text-xs text-slate-600 dark:text-neutral-400 space-y-1.5 pl-6">
                      <div>
                        Email nhận file: <strong className="text-slate-900 dark:text-white">{user?.email || email}</strong>
                      </div>
                      {billingAddress && (
                        <div>
                          Địa chỉ chứng từ:{' '}
                          <strong className="text-slate-900 dark:text-white">
                            {billingAddress.firstName} {billingAddress.lastName} — {billingAddress.addressLine1},{' '}
                            {billingAddress.city}
                          </strong>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Chosen Method Confirmation */}
                  <div className="p-4 bg-slate-50/70 dark:bg-neutral-800/40 rounded-xl border border-slate-200/80 dark:border-neutral-800 text-sm">
                    <div className="font-semibold text-slate-800 dark:text-neutral-200 mb-2 flex items-center gap-2">
                      <WalletOutlined className="text-[#1677ff]" />
                      <span>Phương thức thanh toán đã chọn:</span>
                    </div>
                    <div className="text-xs text-slate-600 dark:text-neutral-400 pl-6">
                      {paymentMethod === 'wallet' && (
                        <div className="flex items-center gap-2 flex-wrap">
                          <Tag color="green" className="!rounded-md font-medium">Ví KienTaoHub</Tag>
                          <span>Khấu trừ <strong className="text-slate-900 dark:text-white font-mono">{subtotal.toLocaleString('vi-VN')} ₫</strong> từ số dư ví</span>
                        </div>
                      )}
                      {paymentMethod === 'vietqr' && (
                        <div className="space-y-2.5">
                          <div className="flex items-center gap-2 flex-wrap">
                            <Tag color="blue" className="!rounded-md font-medium">VietQR 24/7</Tag>
                            <span>Chuyển khoản qua quét mã QR</span>
                          </div>
                          <div className="p-3.5 bg-blue-50/60 dark:bg-blue-950/30 rounded-xl border border-blue-100 dark:border-blue-900/40 text-xs">
                            <p className="font-semibold text-blue-900 dark:text-blue-200 mb-1">
                              Hướng dẫn quét mã QR:
                            </p>
                            <p className="text-slate-600 dark:text-neutral-400 leading-relaxed m-0">
                              Sau khi bấm xác nhận, hệ thống tạo yêu cầu nạp tiền trên ví của bạn và
                              chuyển bạn tới bước thanh toán kèm mã VietQR. Sau khi tiền vào ví, quay
                              lại đây để thanh toán đơn hàng bằng số dư ví.
                            </p>
                          </div>
                        </div>
                      )}
                      {paymentMethod === 'stripe' && (
                        <div className="flex items-center gap-2 flex-wrap">
                          <Tag color="purple" className="!rounded-md font-medium">Thẻ quốc tế (Stripe)</Tag>
                          <span>Thanh toán qua thẻ Visa / Mastercard / JCB</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {error && (
                    <Alert
                      type="error"
                      showIcon
                      message={error}
                      className="!rounded-xl"
                    />
                  )}

                  {/* Guarantees note */}
                  <div className="text-xs text-slate-500 dark:text-neutral-400 flex items-center gap-2 pt-1">
                    <LockOutlined className="text-emerald-500" />
                    <span>
                      Dữ liệu giao dịch được mã hóa SSL 256-bit an toàn. Cam kết hoàn tiền nếu hồ sơ bản vẽ lỗi.
                    </span>
                  </div>
                </div>

                {/* Step 2 Navigation and Action Buttons */}
                <div className="pt-6 mt-6 border-t border-slate-100 dark:border-neutral-800 flex flex-col sm:flex-row justify-between items-center gap-4">
                  <Button
                    size="large"
                    icon={<ArrowLeftOutlined />}
                    onClick={() => setCurrentStep(1)}
                    className="!rounded-xl !h-11 !px-5 w-full sm:w-auto"
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
                      className="!bg-[#1677ff] !h-11 !px-6 !rounded-xl !font-semibold shadow-md hover:!shadow-lg transition-all w-full sm:w-auto"
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
                      className="!bg-[#1677ff] !h-11 !px-6 !rounded-xl !font-semibold shadow-md hover:!shadow-lg transition-all w-full sm:w-auto"
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
                      className="!bg-[#1677ff] !h-11 !px-6 !rounded-xl !font-semibold shadow-md hover:!shadow-lg transition-all w-full sm:w-auto"
                    >
                      Hoàn tất thanh toán qua thẻ
                    </Button>
                  )}
                </div>
              </Card>
            )}
          </Col>

          {/* Sticky Order Summary Column */}
          <Col xs={24} lg={9}>
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
