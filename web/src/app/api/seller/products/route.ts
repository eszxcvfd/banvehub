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
      return NextResponse.json({ error: 'Chỉ người bán hoặc quản trị viên mới có quyền tạo sản phẩm.' }, { status: 403 })
    }

    const body = await req.json()
    const {
      title,
      price = 0,
      isFree = false,
      fileFormat,
      softwareVersion,
      fileSize,
      unit = 'metric',
      categories = [],
      software_types = [],
      tags = [],
      previewGallery = [],
      originalFiles = [],
      copyrightDeclared = false,
      submitForReview = false,
    } = body

    if (!title || typeof title !== 'string' || title.trim().length === 0) {
      return NextResponse.json({ error: 'Tiêu đề sản phẩm là bắt buộc.' }, { status: 400 })
    }

    if (submitForReview && !copyrightDeclared) {
      return NextResponse.json({ error: 'Bạn phải cam kết bản quyền hợp pháp trước khi gửi duyệt sản phẩm.' }, { status: 400 })
    }

    const cleanSlug = `${title
      .toLowerCase()
      .trim()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')}-${Date.now()}`

    const productDoc = await payload.create({
      collection: 'products',
      data: {
        title: title.trim(),
        slug: cleanSlug,
        price: Number(price) || 0,
        isFree: Boolean(isFree),
        seller: user.id,
        technicalSpecs: {
          fileFormat: fileFormat || '',
          softwareVersion: softwareVersion || '',
          fileSize: fileSize || '',
          unit: unit || 'metric',
        },
        categories: categories.length > 0 ? categories : undefined,
        software_types: software_types.length > 0 ? software_types : undefined,
        tags: tags.length > 0 ? tags : undefined,
        previewGallery: previewGallery.length > 0 ? previewGallery : undefined,
        originalFiles: originalFiles.length > 0 ? originalFiles : undefined,
        copyrightDeclared: Boolean(copyrightDeclared),
        moderationStatus: submitForReview ? 'submitted' : 'draft',
        _status: 'draft',
      },
      user,
      overrideAccess: false,
    })

    return NextResponse.json({ success: true, product: productDoc }, { status: 201 })
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Lỗi tạo sản phẩm.' }, { status: 500 })
  }
}
