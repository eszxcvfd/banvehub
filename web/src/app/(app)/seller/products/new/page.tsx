import { redirect } from 'next/navigation'

export const metadata = {
  title: 'Đăng tải bản vẽ mới | KienTaoHub Seller',
  description: 'Tạo tài nguyên số và gửi kiểm duyệt bản vẽ kiến trúc, kết cấu, MEP.',
}

export default function NewProductPage() {
  // Redirect directly to the seller dashboard with modal popup trigger
  redirect('/seller?modal=new-product')
}
