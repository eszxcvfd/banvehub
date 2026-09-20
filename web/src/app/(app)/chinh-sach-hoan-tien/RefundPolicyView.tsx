'use client'

import React from 'react'
import Link from 'next/link'
import { Card, Typography, Row, Col, Steps, Alert, Button, Space } from 'antd'
import {
  SafetyCertificateOutlined,
  CheckCircleOutlined,
  CustomerServiceOutlined,
  RollbackOutlined,
  HomeOutlined,
  ShopOutlined,
} from '@ant-design/icons'

const { Title, Paragraph, Text } = Typography

export function RefundPolicyView() {
  return (
    <div className="container mx-auto px-4 py-12 max-w-5xl">
      <div className="mb-8">
        <Space className="mb-3 text-sm text-slate-500">
          <Link href="/" className="hover:text-[#1677ff]">
            <HomeOutlined /> Trang chủ
          </Link>
          <span>/</span>
          <Text type="secondary">Chính sách hoàn tiền</Text>
        </Space>

        <Title level={1} className="!text-slate-900 dark:!text-white !mb-2">
          Chính Sách Hoàn Tiền — Cam Kết Chất Lượng Kỹ Thuật
        </Title>
        <Paragraph className="!text-slate-500 dark:!text-slate-400 !text-base">
          Tại Kiến Tạo Hub, chúng tôi đặt sự chính xác và độ tin cậy của tài nguyên kỹ thuật lên hàng đầu.
        </Paragraph>
      </div>

      <Alert
        type="success"
        showIcon
        icon={<SafetyCertificateOutlined className="text-xl" />}
        message={
          <span className="font-semibold text-base">Hỗ trợ kỹ thuật và hoàn tiền theo chính sách</span>
        }
        description="Mọi bản vẽ AutoCAD, Revit, SketchUp, 3ds Max tải xuống từ Kiến Tạo Hub đều được hỗ trợ kỹ thuật. Nếu tệp tin lỗi thuộc về người bán và không thể khắc phục, bạn được hoàn 100% số tiền đã thanh toán vào số dư ví."
        className="mb-8 !rounded-xl !p-4"
      />

      <div className="space-y-8">
        {/* Conditions */}
        <Card
          className="!rounded-xl shadow-xs border-slate-200 dark:border-slate-800"
          title={
            <div className="flex items-center gap-2 text-[#1677ff]">
              <CheckCircleOutlined />
              <span>1. Điều Kiện Áp Dụng Hoàn Tiền</span>
            </div>
          }
        >
          <Paragraph>
            Hoàn tiền do bộ phận vận hành của Kiến Tạo Hub thực hiện và ghi lại căn cứ lỗi — hệ thống
            không tự động hoàn tiền. Yêu cầu chỉ được chấp nhận khi lỗi thuộc về người bán hoặc thuộc
            về nền tảng (không áp dụng cho trường hợp đổi ý), và phải được gửi trong vòng 5 ngày kể từ
            thời điểm thanh toán. Các trường hợp được xem xét:
          </Paragraph>
          <ul className="list-disc pl-6 space-y-2 text-slate-600 dark:text-slate-300">
            <li>
              <strong>Tệp tin bị lỗi hoặc hỏng:</strong> File tải về không thể mở được bằng phiên bản phần mềm tiêu chuẩn được ghi chú trong thông số kỹ thuật (ví dụ: file .dwg bị lỗi Fatal Error, file .rvt bị corrupt).
            </li>
            <li>
              <strong>Sai lệch nội dung nghiêm trọng:</strong> Nội dung bên trong bản vẽ không đúng với mô tả, tiêu đề hoặc hình ảnh xem trước (Preview Gallery) do người bán cung cấp.
            </li>
            <li>
              <strong>Thiếu thành phần thiết yếu:</strong> Hồ sơ thiếu các thành phần quan trọng được cam kết trong phần mô tả (ví dụ: thiếu mặt cắt, thiếu bảng thống kê thép, thiếu bản vẽ MEP).
            </li>
            <li>
              <strong>Tệp tin trùng lặp:</strong> Hệ thống ghi nhận giao dịch mua bị lặp lại đối với cùng một sản phẩm số do lỗi kết nối mạng.
            </li>
          </ul>
        </Card>

        {/* Process */}
        <Card
          className="!rounded-xl shadow-xs border-slate-200 dark:border-slate-800"
          title={
            <div className="flex items-center gap-2 text-[#1677ff]">
              <RollbackOutlined />
              <span>2. Quy Trình Yêu Cầu Hoàn Tiền</span>
            </div>
          }
        >
          <Steps
            direction="vertical"
            current={-1}
            items={[
              {
                title: 'Bước 1: Liên hệ bộ phận vận hành',
                description: 'Gửi yêu cầu qua kênh liên hệ ở chân trang (email hoặc điện thoại) kèm mã đơn hàng và ảnh chụp màn hình lỗi. Yêu cầu cần được gửi trong vòng 5 ngày kể từ khi bạn thanh toán.',
              },
              {
                title: 'Bước 2: Vận hành xác minh',
                description: 'Bộ phận vận hành kiểm tra tệp tin, đối chiếu với mô tả và hình xem trước do người bán cung cấp, rồi xác định lỗi thuộc về người bán hay thuộc về nền tảng.',
              },
              {
                title: 'Bước 3: Quyết định hoàn tiền',
                description: 'Nếu lỗi thuộc về người bán hoặc thuộc về nền tảng, vận hành thực hiện hoàn tiền và ghi lại căn cứ lỗi. Yêu cầu gửi quá 5 ngày chỉ được hoàn khi vận hành chấp thuận ngoại lệ và ghi rõ ngoại lệ đó.',
              },
              {
                title: 'Bước 4: Nhận tiền hoàn vào ví',
                description: 'Số tiền được hoàn vào Số dư Ví Kiến Tạo Hub của bạn. Người bán chỉ được chi trả sau 7 ngày kể từ khi bản vẽ được nhận.',
              },
            ]}
          />
        </Card>

        {/* Support CTA */}
        <Card className="!rounded-xl bg-slate-50 dark:bg-slate-900/50 border-dashed border-slate-300 dark:border-slate-700 text-center !p-6">
          <CustomerServiceOutlined className="text-4xl text-[#1677ff] mb-3" />
          <Title level={4} className="!mb-2">
            Cần Hỗ Trợ Kỹ Thuật Trực Tiếp?
          </Title>
          <Paragraph className="!text-slate-500 max-w-lg mx-auto mb-6">
            Nếu bạn gặp bất kỳ trở ngại nào trong quá trình tải xuống hoặc sử dụng bản vẽ, đội ngũ hỗ trợ kỹ thuật luôn sẵn sàng hỗ trợ bạn 24/7.
          </Paragraph>
          <Row gutter={[16, 16]} justify="center">
            <Col>
              <Link href="/shop">
                <Button type="primary" icon={<ShopOutlined />} size="large" className="!bg-[#1677ff]">
                  Khám phá kho bản vẽ
                </Button>
              </Link>
            </Col>
            <Col>
              <Link href="/account">
                <Button size="large">
                  Quản lý đơn hàng của bạn
                </Button>
              </Link>
            </Col>
          </Row>
        </Card>
      </div>
    </div>
  )
}
