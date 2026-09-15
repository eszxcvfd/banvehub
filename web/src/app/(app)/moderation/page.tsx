import { redirect } from 'next/navigation'
import { getPayload } from 'payload'
import configPromise from '@payload-config'
import { headers as getHeaders } from 'next/headers'
import { checkRole } from '@/access/utilities'
import { ModerationQueue } from './ModerationQueue'

export const metadata = {
  title: 'Hàng đợi kiểm duyệt (Moderation Queue) | KienTaoHub',
  description: 'Thẩm định và phê duyệt bản vẽ kỹ thuật số trước khi phát hành công khai.',
}

export default async function ModerationPage() {
  const headers = await getHeaders()
  const payload = await getPayload({ config: configPromise })
  const { user } = await payload.auth({ headers })

  if (!user || !checkRole(['admin', 'moderator'], user)) {
    redirect('/login?warning=' + encodeURIComponent('Yêu cầu quyền Moderator hoặc Admin để truy cập hàng đợi kiểm duyệt.'))
  }

  // Fetch pending submissions
  const pendingRes = await payload.find({
    collection: 'products',
    where: {
      moderationStatus: {
        in: ['submitted', 'in_review'],
      },
    },
    overrideAccess: true,
    sort: 'createdAt',
    limit: 100,
    depth: 2,
  })

  const formattedProducts = pendingRes.docs.map((doc: any) => ({
    id: doc.id,
    title: doc.title,
    slug: doc.slug,
    price: doc.price || 0,
    isFree: Boolean(doc.isFree),
    moderationStatus: doc.moderationStatus || 'submitted',
    createdAt: doc.createdAt,
    seller: typeof doc.seller === 'object' ? doc.seller : null,
    technicalSpecs: doc.technicalSpecs || null,
    originalFiles: Array.isArray(doc.originalFiles)
      ? doc.originalFiles.map((f: any) => (typeof f === 'object' ? f : { id: f }))
      : null,
    previewGallery: Array.isArray(doc.previewGallery)
      ? doc.previewGallery.map((p: any) => (typeof p === 'object' ? p : { id: p }))
      : null,
  }))

  return (
    <div className="container max-w-6xl py-10 px-4 mx-auto space-y-8">
      <div className="border-b pb-4 space-y-1">
        <span className="text-xs uppercase font-bold tracking-wider text-primary px-2 py-0.5 rounded bg-primary/10 inline-block">
          Moderation Center
        </span>
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-foreground">
          Hàng đợi kiểm duyệt bản vẽ (Moderation Queue)
        </h1>
        <p className="text-sm text-muted-foreground">
          Kiểm tra thông số kỹ thuật CAD/BIM, xem trước bản vẽ, mã băm tệp gốc và thẩm định bản quyền trước khi xuất bản ra thị trường.
        </p>
      </div>

      <ModerationQueue initialProducts={formattedProducts} />
    </div>
  )
}
