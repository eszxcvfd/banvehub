'use client'

import React, { useRef } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { Carousel, Button, Tag, Typography, Space, Row, Col } from 'antd'
import type { CarouselRef } from 'antd/es/carousel'
import {
  LeftOutlined,
  RightOutlined,
  EyeOutlined,
  DownloadOutlined,
  CheckCircleOutlined,
  ApartmentOutlined,
  BuildOutlined,
  DeploymentUnitOutlined,
} from '@ant-design/icons'
import type { Product, Media } from '@/payload-types'
import { Price } from '@/components/Price'

const { Title, Paragraph } = Typography

interface CarouselClientProps {
  products?: Product[]
}

const FALLBACK_SLIDES = [
  {
    id: 'fb-1',
    title: 'Hồ sơ thiết kế Biệt thự phố 3 tầng Tân Cổ Điển',
    subtitle: 'Full hồ sơ kiến trúc, kết cấu, điện nước MEP và phối cảnh 3D Max hoàn chỉnh',
    format: 'AutoCAD .DWG / Revit',
    tag: 'Kiến trúc & Kết cấu',
    icon: <ApartmentOutlined />,
    price: 350000,
    isFree: false,
    slug: 'ho-so-kien-truc-biet-thu-pho-3-tang-tan-co-dien-phap-tai-vinhomes-riverside',
    image: 'https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?auto=format&fit=crop&w=1200&q=80',
  },
  {
    id: 'fb-2',
    title: 'Mô hình BIM Revit Bệnh viện đa khoa 500 giường',
    subtitle: 'Mô hình thông tin công trình BIM chuẩn LOD 400 đồng bộ kiến trúc, kết cấu và hệ thống HVAC PCCC',
    format: 'Revit .RVT / Navisworks',
    tag: 'Mô hình BIM LOD 400',
    icon: <DeploymentUnitOutlined />,
    price: 850000,
    isFree: false,
    slug: 'mo-hinh-bim-revit-benh-vien-da-khoa',
    image: 'https://images.unsplash.com/photo-1586023492125-27b2c045efd7?auto=format&fit=crop&w=1200&q=80',
  },
  {
    id: 'fb-3',
    title: 'Bản vẽ Kết cấu Nhà xưởng thép tiền chế khẩu độ 36m',
    subtitle: 'Bản vẽ chi tiết vì kèo thép, móng bulong neo, hệ giằng và bảng tính nội lực SAP2000',
    format: 'AutoCAD .DWG / SAP2000',
    tag: 'Kết cấu công trình',
    icon: <BuildOutlined />,
    price: 0,
    isFree: true,
    slug: 'ban-ve-ket-cau-nha-xuong-thep-tien-che',
    image: 'https://images.unsplash.com/photo-1541888946425-d0fbb18086f6?auto=format&fit=crop&w=1200&q=80',
  },
]

export const CarouselClient: React.FC<CarouselClientProps> = ({ products }) => {
  const carouselRef = useRef<CarouselRef>(null)
  const hasProducts = products && products.length > 0

  return (
    <div className="relative w-full overflow-hidden rounded-2xl bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 text-white shadow-xl">
      {/* Navigation Arrows */}
      <button
        aria-label="Previous Slide"
        className="absolute left-4 top-1/2 -translate-y-1/2 z-20 flex h-11 w-11 items-center justify-center rounded-full bg-white/20 backdrop-blur-md text-white hover:bg-white/40 transition-all border border-white/30 cursor-pointer shadow-md"
        onClick={() => carouselRef.current?.prev()}
        type="button"
      >
        <LeftOutlined style={{ fontSize: 18 }} />
      </button>

      <button
        aria-label="Next Slide"
        className="absolute right-4 top-1/2 -translate-y-1/2 z-20 flex h-11 w-11 items-center justify-center rounded-full bg-white/20 backdrop-blur-md text-white hover:bg-white/40 transition-all border border-white/30 cursor-pointer shadow-md"
        onClick={() => carouselRef.current?.next()}
        type="button"
      >
        <RightOutlined style={{ fontSize: 18 }} />
      </button>

      <Carousel
        autoplay={{ dotDuration: true }}
        autoplaySpeed={5000}
        dots={{ className: 'custom-carousel-dots bottom-4' }}
        effect="fade"
        ref={carouselRef}
      >
        {hasProducts
          ? products.map((product, idx) => {
              const imageResource = product.meta?.image as Media | undefined
              const imageUrl =
                typeof imageResource === 'object' && imageResource?.url
                  ? imageResource.url
                  : FALLBACK_SLIDES[idx % FALLBACK_SLIDES.length]?.image

              return (
                <div key={product.id || idx}>
                  <div className="relative min-h-[440px] md:min-h-[480px] p-8 md:p-14 flex items-center">
                    {/* Background Blueprint Grid Overlay */}
                    <div
                      className="absolute inset-0 opacity-15 bg-[radial-gradient(#38bdf8_1px,transparent_1px)] [background-size:24px_24px] pointer-events-none"
                    />

                    <Row align="middle" className="w-full relative z-10" gutter={[32, 32]}>
                      <Col md={14} xs={24}>
                        <Space className="mb-3" wrap>
                          <Tag color="#1677ff" icon={<CheckCircleOutlined />}>
                            Bản vẽ CAD/BIM tuyển chọn
                          </Tag>
                          <Tag color="cyan">AutoCAD / Revit / 3D</Tag>
                          {product.isFree ? (
                            <Tag color="success">Miễn phí</Tag>
                          ) : (
                            <Tag color="gold">Bản quyền</Tag>
                          )}
                        </Space>

                        <Title
                          className="!text-white !font-bold tracking-tight !mb-3 !text-2xl md:!text-4xl"
                          level={2}
                        >
                          {product.title}
                        </Title>

                        <Paragraph className="!text-slate-300 !text-base md:!text-lg !mb-6 line-clamp-2 max-w-2xl">
                          {product.meta?.description ||
                            'Hồ sơ kỹ thuật số chất lượng cao dành cho kỹ sư xây dựng và kiến trúc sư.'}
                        </Paragraph>

                        <div className="flex items-center gap-4 mb-6">
                          <div className="text-sm text-slate-300">Giá tài nguyên:</div>
                          {product.isFree || product.price === 0 ? (
                            <span className="text-emerald-400 font-bold text-2xl">0 ₫ (Miễn phí)</span>
                          ) : (
                            <div className="text-amber-400 font-bold text-2xl">
                              <Price amount={product.price ?? 0} />
                            </div>
                          )}
                        </div>

                        <Space size="middle" wrap>
                          <Link href={`/products/${product.slug}`}>
                            <Button
                              className="!h-12 !px-7 !font-semibold !rounded-lg !bg-[#1677ff] hover:!bg-[#4096ff]"
                              icon={<EyeOutlined />}
                              size="large"
                              type="primary"
                            >
                              Xem Chi Tiết Bản Vẽ
                            </Button>
                          </Link>
                          <Link href="/shop">
                            <Button
                              className="!h-12 !px-6 !font-semibold !rounded-lg !border-white/40 !text-white hover:!border-white hover:!bg-white/10"
                              ghost
                              icon={<DownloadOutlined />}
                              size="large"
                            >
                              Khám Phá Toàn Bộ Kho
                            </Button>
                          </Link>
                        </Space>
                      </Col>

                      <Col className="hidden md:flex justify-center" md={10} xs={24}>
                        <div className="relative w-full aspect-[4/3] max-w-[420px] rounded-xl overflow-hidden border-2 border-white/20 shadow-2xl group">
                          {imageUrl && (
                            <Image
                              alt={product.title}
                              className="object-cover transition-transform duration-500 group-hover:scale-105"
                              fill
                              priority
                              sizes="(max-width: 768px) 100vw, 420px"
                              src={imageUrl}
                              unoptimized
                            />
                          )}
                          <div className="absolute top-3 right-3 bg-black/60 backdrop-blur-sm px-3 py-1 rounded text-xs text-white border border-white/20">
                            Kiến Tạo Hub Verified
                          </div>
                        </div>
                      </Col>
                    </Row>
                  </div>
                </div>
              )
            })
          : FALLBACK_SLIDES.map((slide) => (
              <div key={slide.id}>
                <div className="relative min-h-[440px] md:min-h-[480px] p-8 md:p-14 flex items-center">
                  <div
                    className="absolute inset-0 opacity-15 bg-[radial-gradient(#38bdf8_1px,transparent_1px)] [background-size:24px_24px] pointer-events-none"
                  />
                  <Row align="middle" className="w-full relative z-10" gutter={[32, 32]}>
                    <Col md={14} xs={24}>
                      <Space className="mb-3" wrap>
                        <Tag color="#1677ff" icon={slide.icon}>
                          {slide.tag}
                        </Tag>
                        <Tag color="cyan">{slide.format}</Tag>
                        {slide.isFree ? (
                          <Tag color="success">Miễn phí</Tag>
                        ) : (
                          <Tag color="gold">Bản quyền</Tag>
                        )}
                      </Space>

                      <Title
                        className="!text-white !font-bold tracking-tight !mb-3 !text-2xl md:!text-4xl"
                        level={2}
                      >
                        {slide.title}
                      </Title>

                      <Paragraph className="!text-slate-300 !text-base md:!text-lg !mb-6 line-clamp-2 max-w-2xl">
                        {slide.subtitle}
                      </Paragraph>

                      <div className="flex items-center gap-4 mb-6">
                        <div className="text-sm text-slate-300">Giá phát hành:</div>
                        {slide.isFree ? (
                          <span className="text-emerald-400 font-bold text-2xl">0 ₫ (Miễn phí)</span>
                        ) : (
                          <span className="text-amber-400 font-bold text-2xl">
                            {new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(
                              slide.price,
                            )}
                          </span>
                        )}
                      </div>

                      <Space size="middle" wrap>
                        <Link href="/shop">
                          <Button
                            className="!h-12 !px-7 !font-semibold !rounded-lg !bg-[#1677ff] hover:!bg-[#4096ff]"
                            icon={<EyeOutlined />}
                            size="large"
                            type="primary"
                          >
                            Khám Phá Bản Vẽ Ngay
                          </Button>
                        </Link>
                        <Link href="/shop">
                          <Button
                            className="!h-12 !px-6 !font-semibold !rounded-lg !border-white/40 !text-white hover:!border-white hover:!bg-white/10"
                            ghost
                            icon={<DownloadOutlined />}
                            size="large"
                          >
                            Tải Bản Vẽ Mẫu
                          </Button>
                        </Link>
                      </Space>
                    </Col>

                    <Col className="hidden md:flex justify-center" md={10} xs={24}>
                      <div className="relative w-full aspect-[4/3] max-w-[420px] rounded-xl overflow-hidden border-2 border-white/20 shadow-2xl">
                        <Image
                          alt={slide.title}
                          className="object-cover"
                          fill
                          priority
                          sizes="(max-width: 768px) 100vw, 420px"
                          src={slide.image}
                          unoptimized
                        />
                        <div className="absolute top-3 right-3 bg-black/60 backdrop-blur-sm px-3 py-1 rounded text-xs text-white border border-white/20">
                          Bản vẽ chuẩn kiểm duyệt
                        </div>
                      </div>
                    </Col>
                  </Row>
                </div>
              </div>
            ))}
      </Carousel>
    </div>
  )
}
