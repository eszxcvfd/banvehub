import { redirect } from 'next/navigation'
import { getPayload } from 'payload'
import configPromise from '@payload-config'
import { headers as getHeaders } from 'next/headers'
import { checkRole } from '@/access/utilities'
import { ProductEditorForm } from './ProductEditorForm'

export const metadata = {
  title: 'Đăng tải bản vẽ mới | KienTaoHub Seller',
  description: 'Tạo tài nguyên số và gửi kiểm duyệt bản vẽ kiến trúc, kết cấu, MEP.',
}

export default async function NewProductPage() {
  const headers = await getHeaders()
  const payload = await getPayload({ config: configPromise })
  const { user } = await payload.auth({ headers })

  if (!user) {
    redirect(`/login?warning=${encodeURIComponent('Vui lòng đăng nhập để đăng bản vẽ.')}`)
  }

  if (!checkRole(['seller', 'admin'], user)) {
    redirect('/seller/register')
  }

  // Fetch taxonomies for the editor
  const [categoriesRes, softwareRes, tagsRes] = await Promise.all([
    payload.find({ collection: 'categories', limit: 100, pagination: false, overrideAccess: true }),
    payload.find({ collection: 'software_types', limit: 100, pagination: false, overrideAccess: true }),
    payload.find({ collection: 'tags', limit: 100, pagination: false, overrideAccess: true }),
  ])

  return (
    <div className="container max-w-4xl py-10 px-4 mx-auto space-y-6">
      <div className="border-b pb-4 space-y-1">
        <span className="text-xs uppercase font-bold tracking-wider text-primary">
          Seller Product Studio
        </span>
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-foreground">
          Đăng tải tài nguyên & Bản vẽ mới
        </h1>
        <p className="text-sm text-muted-foreground">
          Cung cấp đầy đủ thông số kỹ thuật, ảnh xem trước và tệp bản vẽ gốc để ban kiểm duyệt thẩm định nhanh nhất.
        </p>
      </div>

      <div className="border rounded-xl p-6 md:p-8 bg-card shadow-sm">
        <ProductEditorForm
          categories={categoriesRes.docs.map((c) => ({ id: c.id, title: c.title }))}
          softwareTypes={softwareRes.docs.map((s) => ({ id: s.id, title: s.title }))}
          tags={tagsRes.docs.map((t) => ({ id: t.id, title: t.title }))}
        />
      </div>
    </div>
  )
}
