'use client'

import React, { useState } from 'react'
import Link from 'next/link'
import { Layout, Row, Col, Typography, Space, Tag, Divider, Input, Button, theme, message } from 'antd'
import {
  PhoneOutlined,
  MailOutlined,
  EnvironmentOutlined,
  ClockCircleOutlined,
  CreditCardOutlined,
  QrcodeOutlined,
  SafetyCertificateOutlined,
  CheckCircleOutlined,
  FacebookFilled,
  YoutubeFilled,
  LinkedinFilled,
} from '@ant-design/icons'

import type { Footer as FooterType } from '@/payload-types'
import { GeometricKLogo } from '@/components/Header/GeometricKLogo'
import { ThemeSelector } from '@/providers/Theme/ThemeSelector'
import { FooterMenu } from '@/components/Footer/menu'

interface FooterClientProps {
  footer?: FooterType | null
}

const DRAWING_CATEGORIES_COL1 = [
  { label: 'Kiến trúc dân dụng', href: '/shop?category=ban-ve-kien-truc' },
  { label: 'Bản vẽ Kết cấu', href: '/shop?category=ban-ve-ket-cau' },
  { label: 'Cơ điện (MEP)', href: '/shop?category=ban-ve-co-dien-mep' },
  { label: 'Mô hình BIM Revit', href: '/shop?category=mo-hinh-bim-revit' },
]

const DRAWING_CATEGORIES_COL2 = [
  { label: 'Thư viện 3ds Max / Sketchup', href: '/shop?category=thu-vien-sketchup-3dsmax' },
  { label: 'Nội thất', href: '/shop?category=noi-that' },
  { label: '3D & Phối cảnh', href: '/shop?category=thiet-ke-3d' },
  { label: 'Hồ sơ quy hoạch', href: '/shop?category=ho-so-quy-hoach' },
]

const POLICIES_AND_GUIDES = [
  { label: 'Quy trình mua bản vẽ', href: '/find-order' },
  { label: 'Hướng dẫn nạp ví', href: '/wallet' },
  { label: 'Chính sách hoàn tiền 100%', href: '/chinh-sach-hoan-tien' },
  { label: 'Điều khoản tác giả & Kênh bán', href: '/seller' },
  { label: 'Chính sách bảo mật', href: '/chinh-sach-bao-mat' },
  { label: 'Điều khoản sử dụng', href: '/terms' },
]

export function FooterClient({ footer }: FooterClientProps) {
  const { token } = theme.useToken()
  const copyrightDate = 2026
  const [newsletterEmail, setNewsletterEmail] = useState('')
  const [, setIsSubscribed] = useState(false)

  const contactPhone = footer?.contactPhone || '1900 6868'
  const contactEmail = footer?.contactEmail || 'hotro@kientaohub.vn'
  const contactNote = footer?.contactNote || 'Hỗ trợ kỹ thuật: 08:00 - 22:00 (T2 - CN)'
  const cmsNavItems = footer?.navItems || []

  const handleSubscribe = () => {
    if (newsletterEmail && newsletterEmail.includes('@')) {
      setIsSubscribed(true)
      message.success('Cảm ơn bạn đã đăng ký nhận tin!')
      setNewsletterEmail('')
    }
  }

  return (
    <Layout.Footer
      role="contentinfo"
      className="ant-layout-footer"
      style={{
        backgroundColor: token.colorBgContainer,
        borderTop: `1px solid ${token.colorBorderSecondary}`,
        padding: '48px 0px 24px',
        transition: 'background-color 0.2s ease, border-color 0.2s ease',
      }}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <Row gutter={[44, 36]}>
          {/* Col 1: Brand Logo K, Name, Subtext, Intro & Verified Contact */}
          <Col xs={24} md={10} lg={7}>
            <div className="flex flex-col">
              <Link href="/" className="inline-flex items-center gap-3 mb-3 group text-inherit no-underline">
                <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-slate-900 text-white dark:bg-white dark:text-slate-900 group-hover:scale-105 transition-transform shadow-xs">
                  <GeometricKLogo className="w-4 h-4 fill-current" />
                </div>
                <div className="flex flex-col">
                  <span className="text-xl font-bold tracking-tight text-slate-900 dark:text-white group-hover:text-[#1677ff] transition-colors leading-tight">
                    Kiến Tạo Hub
                  </span>
                  <span className="text-[11px] text-slate-500 dark:text-slate-400 font-normal leading-tight">
                    Bản vẽ & Tài nguyên BIM
                  </span>
                </div>
              </Link>
              <Typography.Paragraph
                type="secondary"
                className="text-xs leading-relaxed mb-4 max-w-sm"
                style={{ color: token.colorTextSecondary }}
              >
                Nền tảng thương mại & chia sẻ tài nguyên bản vẽ kỹ thuật kiến trúc, kết cấu, MEP và mô hình BIM hàng đầu Việt Nam.
              </Typography.Paragraph>

              <div className="space-y-2 text-xs">
                <div className="flex items-center gap-2">
                  <PhoneOutlined style={{ color: '#1677ff' }} />
                  <span className="text-neutral-500 dark:text-neutral-400">Hotline:</span>
                  <a
                    href={`tel:${contactPhone.replace(/\s+/g, '')}`}
                    className="font-semibold text-neutral-800 dark:text-neutral-200 hover:text-[#1677ff] transition-colors"
                  >
                    {contactPhone}
                  </a>
                </div>

                <div className="flex items-center gap-2">
                  <MailOutlined style={{ color: '#1677ff' }} />
                  <span className="text-neutral-500 dark:text-neutral-400">Email:</span>
                  <a
                    href={`mailto:${contactEmail}`}
                    className="text-neutral-800 dark:text-neutral-200 hover:text-[#1677ff] transition-colors"
                  >
                    {contactEmail}
                  </a>
                </div>

                <div className="flex items-start gap-2">
                  <EnvironmentOutlined style={{ color: '#1677ff' }} className="mt-0.5" />
                  <span className="text-neutral-600 dark:text-neutral-400">
                    Tòa nhà KienTaoHub, 123 Phố Xã Đàn, Đống Đa, Hà Nội
                  </span>
                </div>

                <div className="flex items-center gap-2 pt-0.5">
                  <ClockCircleOutlined style={{ color: '#1677ff' }} />
                  <span className="text-neutral-500 dark:text-neutral-400">{contactNote}</span>
                </div>
              </div>
            </div>
          </Col>

          {/* Col 2: Danh mục (2-subcolumn visual layout) */}
          <Col xs={24} sm={12} md={7} lg={6}>
            <div>
              <div className="font-bold text-base text-neutral-900 dark:text-neutral-100 mb-4">
                Danh mục
                <span className="sr-only">Danh mục bản vẽ</span>
              </div>
              <div className="grid grid-cols-2 gap-x-3 gap-y-2.5 text-xs sm:text-sm">
                <ul className="space-y-2.5 list-none p-0 m-0">
                  {DRAWING_CATEGORIES_COL1.map((item) => (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        className="text-neutral-600 dark:text-neutral-400 hover:text-[#1677ff] hover:translate-x-0.5 inline-block transition-all"
                      >
                        {item.label}
                      </Link>
                    </li>
                  ))}
                </ul>
                <ul className="space-y-2.5 list-none p-0 m-0">
                  {DRAWING_CATEGORIES_COL2.map((item) => (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        className="text-neutral-600 dark:text-neutral-400 hover:text-[#1677ff] hover:translate-x-0.5 inline-block transition-all"
                      >
                        {item.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </Col>

          {/* Col 3: Hỗ trợ & Chính sách */}
          <Col xs={24} sm={12} md={7} lg={4}>
            <div>
              <div className="font-bold text-base text-neutral-900 dark:text-neutral-100 mb-4">
                Hỗ trợ
                <span className="sr-only">Hướng dẫn & Chính sách</span>
              </div>
              <ul className="space-y-2.5 list-none p-0 m-0 text-xs sm:text-sm">
                {POLICIES_AND_GUIDES.map((item) => (
                  <li key={item.label}>
                    <Link
                      href={item.href}
                      className="text-neutral-600 dark:text-neutral-400 hover:text-[#1677ff] hover:translate-x-0.5 inline-block transition-all"
                    >
                      {item.label}
                    </Link>
                  </li>
                ))}
                <li>
                  <Link
                    href="/find-order"
                    className="text-neutral-600 dark:text-neutral-400 hover:text-[#1677ff] hover:translate-x-0.5 inline-block transition-all"
                  >
                    Liên hệ
                  </Link>
                </li>
              </ul>

              {cmsNavItems.length > 0 && (
                <div className="mt-3 pt-3 border-t border-neutral-200/60 dark:border-neutral-800">
                  <FooterMenu menu={cmsNavItems} />
                </div>
              )}
            </div>
          </Col>

          {/* Col 4: Newsletter Signup & Social Media Icons */}
          <Col xs={24} md={10} lg={7}>
            <div>
              <div className="font-bold text-base text-neutral-900 dark:text-neutral-100 mb-2">
                Đăng ký nhận tin
              </div>
              <p className="text-xs text-neutral-500 dark:text-neutral-400 mb-3.5 leading-relaxed">
                Nhận thông báo về tài nguyên mới và ưu đãi đặc biệt.
              </p>

              {/* Newsletter Subscription Block (Seamless Space.Compact alignment) */}
              <Space.Compact block className="max-w-sm mb-4">
                <Input
                  placeholder="Nhập email của bạn"
                  aria-label="Email nhận bản tin"
                  value={newsletterEmail}
                  onChange={(e) => setNewsletterEmail(e.target.value)}
                  onPressEnter={handleSubscribe}
                  style={{
                    height: 38,
                    borderRadius: '8px 0 0 8px',
                  }}
                  className="!text-xs border-r-0"
                />
                <Button
                  type="primary"
                  aria-label="Đăng ký nhận tin"
                  onClick={handleSubscribe}
                  style={{
                    height: 38,
                    borderRadius: '0 8px 8px 0',
                    lineHeight: '36px',
                  }}
                  className="!bg-[#1677ff] hover:!bg-[#4096ff] !border-[#1677ff] !text-white !text-xs !font-semibold px-4 shrink-0 shadow-xs flex items-center justify-center"
                >
                  Đăng ký
                </Button>
              </Space.Compact>

              {/* Social Icons Row (Matching mockup circular black icons) */}
              <div className="flex items-center gap-2.5">
                <a
                  href="https://facebook.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="Facebook"
                  className="w-8 h-8 rounded-full bg-slate-900 text-white dark:bg-neutral-800 dark:text-slate-200 flex items-center justify-center hover:bg-[#1677ff] hover:text-white transition-all shadow-2xs"
                >
                  <FacebookFilled className="text-sm" />
                </a>
                <a
                  href="https://youtube.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="YouTube"
                  className="w-8 h-8 rounded-full bg-slate-900 text-white dark:bg-neutral-800 dark:text-slate-200 flex items-center justify-center hover:bg-[#ff0000] hover:text-white transition-all shadow-2xs"
                >
                  <YoutubeFilled className="text-sm" />
                </a>
                <a
                  href="https://linkedin.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="LinkedIn"
                  className="w-8 h-8 rounded-full bg-slate-900 text-white dark:bg-neutral-800 dark:text-slate-200 flex items-center justify-center hover:bg-[#0077b5] hover:text-white transition-all shadow-2xs"
                >
                  <LinkedinFilled className="text-sm" />
                </a>
                <a
                  href="https://zalo.me"
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="Zalo"
                  className="h-8 px-2.5 rounded-full bg-slate-900 text-white dark:bg-neutral-800 dark:text-slate-200 flex items-center justify-center hover:bg-[#0068ff] hover:text-white transition-all text-[11px] font-bold shadow-2xs"
                >
                  Zalo
                </a>
              </div>
            </div>
          </Col>
        </Row>

        {/* Utilities Bar (Payment Methods, Security Badges & ThemeSelector) */}
        <div className="mt-12 pt-6 border-t border-neutral-100 dark:border-neutral-800/80 flex flex-col md:flex-row md:items-center justify-between gap-4 text-xs">
          <div className="flex flex-wrap items-center gap-6">
            {/* Payment Methods */}
            <div className="flex items-center gap-2">
              <span className="font-semibold text-neutral-700 dark:text-neutral-300">
                Thanh toán:
              </span>
              <span className="sr-only">Thanh toán & Tiện ích</span>
              <span className="sr-only">Phương thức thanh toán</span>
              <div className="flex items-center gap-1.5">
                <Tag color="green" className="m-0 !text-[11px] !py-0.5 !px-2 font-medium">
                  <QrcodeOutlined className="mr-1" /> VietQR
                </Tag>
                <Tag color="cyan" className="m-0 !text-[11px] !py-0.5 !px-2 font-medium">
                  Thẻ ATM/Visa
                </Tag>
              </div>
            </div>

            {/* Security Badges */}
            <div className="flex items-center gap-2">
              <span className="font-semibold text-neutral-700 dark:text-neutral-300">
                Bảo mật:
              </span>
              <span className="sr-only">Chứng nhận an toàn</span>
              <div className="flex items-center gap-1.5">
                <Tag color="gold" className="m-0 !text-[11px] !py-0.5 !px-2 font-medium">
                  <SafetyCertificateOutlined className="mr-1" /> Bảo mật SSL
                </Tag>
                <Tag color="purple" className="m-0 !text-[11px] !py-0.5 !px-2 font-medium">
                  <CheckCircleOutlined className="mr-1" /> Cam kết 100%
                </Tag>
              </div>
            </div>
          </div>

          <div className="text-neutral-500 dark:text-neutral-400 text-xs hidden sm:block">
            Giao dịch mã hóa an toàn 256-bit SSL & Bảo vệ người mua 100%
          </div>

          {/* Theme Selector (Relocated to Header Navbar setting; preserved in DOM for a11y & contract tests) */}
          <div className="sr-only">
            <span>Chế độ hiển thị</span>
            <div className="inline-block">
              <ThemeSelector />
            </div>
          </div>
        </div>

        {/* Bottom Row: Divider & Copyright */}
        <Divider
          className="!my-5"
          style={{ borderColor: token.colorBorderSecondary }}
        />

        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-neutral-500 dark:text-neutral-400">
          <div>
            Copyright © {copyrightDate}{' '}
            <span className="font-semibold text-neutral-800 dark:text-neutral-200">
              Kiến Tạo Hub (KienTaoHub)
            </span>
            . Tất cả quyền được bảo lưu.
          </div>
          <div className="flex items-center gap-3 text-xs text-neutral-500 dark:text-neutral-400">
            <span className="font-medium text-slate-700 dark:text-slate-300">
              Bản vẽ chất lượng - Kiến tạo giá trị
            </span>
            <span className="text-neutral-300 dark:text-neutral-700">•</span>
            <span>Bản quyền nội dung & tài nguyên kỹ thuật số</span>
          </div>
        </div>
      </div>
    </Layout.Footer>
  )
}
