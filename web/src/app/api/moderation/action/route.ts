import { NextResponse } from 'next/server'
import { getPayload } from 'payload'
import configPromise from '@payload-config'
import { headers as getHeaders } from 'next/headers'
import { checkRole } from '@/access/utilities'

export async function POST(req: Request) {
  try {
    const headers = await getHeaders()
    const payload = await getPayload({ config: configPromise })
    const { user } = await payload.auth({ headers })

    if (!user || !checkRole(['admin', 'moderator'], user)) {
      return NextResponse.json({ error: 'Chỉ ban kiểm duyệt (Moderator/Admin) mới có quyền thực hiện thao tác này.' }, { status: 403 })
    }

    const body = await req.json()
    const { productId, action, note = '' } = body

    if (!productId) {
      return NextResponse.json({ error: 'Mã sản phẩm là bắt buộc.' }, { status: 400 })
    }

    const validActions = ['approved', 'changes_requested', 'rejected', 'in_review']
    if (!validActions.includes(action)) {
      return NextResponse.json({ error: `Hành động không hợp lệ. Cho phép: ${validActions.join(', ')}` }, { status: 400 })
    }

    const updated = await payload.update({
      collection: 'products',
      id: productId,
      data: {
        moderationStatus: action,
        moderationNotes: note,
        _status: action === 'approved' ? 'published' : 'draft',
      },
      user,
      overrideAccess: false,
    })

    return NextResponse.json({ success: true, product: updated }, { status: 200 })
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Lỗi xử lý kiểm duyệt sản phẩm.' }, { status: 500 })
  }
}
