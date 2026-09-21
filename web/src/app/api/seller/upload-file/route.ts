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
      return NextResponse.json({ error: 'Chỉ người bán hoặc quản trị viên mới có quyền tải lên tệp sản phẩm.' }, { status: 403 })
    }

    const formData = await req.formData()
    // `FormData.get` returns a plain string when the part is not a file, and the old `!file` guard
    // passed for that shape so `.arrayBuffer()` below answered 500. A non-file part is a bad request.
    const filePart = formData.get('file')
    const file =
      filePart && typeof (filePart as Blob).arrayBuffer === 'function' ? (filePart as File) : null

    if (!file) {
      return NextResponse.json({ error: 'Không tìm thấy tệp đính kèm.' }, { status: 400 })
    }

    const buffer = Buffer.from(await file.arrayBuffer())
    const filename = file.name
    const mimeType = file.type || 'application/octet-stream'

    // Create product_files document in Payload
    const fileDoc = await payload.create({
      collection: 'product_files',
      data: {
        seller: user.id,
        originalFilename: filename,
        fileFormat: filename.includes('.') ? `.${filename.split('.').pop()?.toLowerCase()}` : '.bin',
      },
      file: {
        data: buffer,
        name: filename,
        mimetype: mimeType,
        size: buffer.length,
      },
      user,
      overrideAccess: false,
    })

    return NextResponse.json({
      success: true,
      file: {
        id: fileDoc.id,
        filename: fileDoc.filename,
        checksum: fileDoc.checksum,
        fileSize: fileDoc.fileSize,
        status: fileDoc.status,
      },
    }, { status: 201 })
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Lỗi tải lên tệp gốc.' }, { status: 500 })
  }
}
