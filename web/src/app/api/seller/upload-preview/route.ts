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

    if (!user || !checkRole(['seller', 'admin'], user)) {
      return NextResponse.json({ error: 'Yêu cầu quyền người bán.' }, { status: 403 })
    }

    const formData = await req.formData()
    // `FormData.get` returns a plain string when the part is not a file, and the old `!file` guard
    // passed for that shape so `.arrayBuffer()` below answered 500. A non-file part is a bad request.
    const filePart = formData.get('file')
    const file =
      filePart && typeof (filePart as Blob).arrayBuffer === 'function' ? (filePart as File) : null
    const title = (formData.get('title') as string) || file?.name || 'Preview'

    if (!file) {
      return NextResponse.json({ error: 'Không tìm thấy ảnh xem trước.' }, { status: 400 })
    }

    const buffer = Buffer.from(await file.arrayBuffer())
    const filename = file.name
    const mimeType = file.type || 'image/jpeg'

    // 1. Create Media doc (public preview)
    const mediaDoc = await payload.create({
      collection: 'media',
      data: {
        alt: title,
      },
      file: {
        data: buffer,
        name: filename,
        mimetype: mimeType,
        size: buffer.length,
      },
      overrideAccess: true, // adminOnly on media collection
    })

    // 2. Create ProductPreviews doc
    const previewDoc = await payload.create({
      collection: 'product_previews',
      data: {
        title,
        previewImage: mediaDoc.id,
        previewType: 'image',
        isWatermarked: true,
      },
      user,
      overrideAccess: false,
    })

    return NextResponse.json({
      success: true,
      preview: {
        id: previewDoc.id,
        title: previewDoc.title,
        url: mediaDoc.url,
      },
    }, { status: 201 })
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Lỗi tải lên ảnh xem trước.' }, { status: 500 })
  }
}
