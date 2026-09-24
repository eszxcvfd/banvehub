import React from 'react'
import type { Metadata } from 'next'
import { RefundPolicyView } from './RefundPolicyView'

export const metadata: Metadata = {
  title: 'Chính Sách Hoàn Tiền 100% — Cam Kết Chất Lượng | Kiến Tạo Hub',
  description:
    'Kiến Tạo Hub cam kết hoàn tiền 100% nếu tệp tin bản vẽ, mô hình BIM bị lỗi kỹ thuật, sai mô tả hoặc không thể mở bằng phần mềm tiêu chuẩn.',
}

export default function RefundPolicyPage() {
  return <RefundPolicyView />
}
