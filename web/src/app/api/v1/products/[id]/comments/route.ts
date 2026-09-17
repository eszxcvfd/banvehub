import { NextResponse } from 'next/server'
import { getPayload } from 'payload'
import configPromise from '@payload-config'
import { headers as getHeaders } from 'next/headers'

type RouteContext = {
  params: Promise<{
    id: string
  }>
}

/**
 * Helper to resolve product ID from route param (numeric ID or slug).
 */
async function resolveProductId(payload: any, paramId: string): Promise<number | null> {
  const trimmed = paramId?.trim()
  if (!trimmed) return null

  if (/^\d+$/.test(trimmed)) {
    const id = parseInt(trimmed, 10)
    if (id > 0) {
      const prodRes = await payload.find({
        collection: 'products',
        where: {
          id: {
            equals: id,
          },
        },
        limit: 1,
        depth: 0,
        overrideAccess: true,
      })
      if (prodRes.totalDocs > 0) {
        return prodRes.docs[0].id
      }
    }
  }

  const prods = await payload.find({
    collection: 'products',
    where: {
      slug: {
        equals: trimmed,
      },
    },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  })

  if (prods.totalDocs > 0) {
    return prods.docs[0].id
  }

  return null
}

function formatComment(doc: any) {
  const userObj = typeof doc.user === 'object' && doc.user !== null ? doc.user : null
  const userName = userObj?.name?.trim() || 'Thành viên'
  const nameParts = userName.split(/\s+/).filter(Boolean)
  const userInitials = (
    nameParts.length > 1
      ? nameParts[0][0] + nameParts[nameParts.length - 1][0]
      : userName.slice(0, 2)
  ).toUpperCase() || 'TV'

  let roleBadge: string | null = null
  if (doc.isAdminReply) {
    roleBadge = 'Quản trị viên'
  } else if (doc.isSellerReply) {
    roleBadge = 'Tác giả / Người bán'
  }

  const parentId =
    typeof doc.parent === 'object' && doc.parent !== null
      ? doc.parent.id
      : (doc.parent || null)

  const productId =
    typeof doc.product === 'object' && doc.product !== null
      ? doc.product.id
      : doc.product

  return {
    id: doc.id,
    productId,
    content: doc.content,
    status: doc.status,
    parentId,
    isSellerReply: Boolean(doc.isSellerReply),
    isAdminReply: Boolean(doc.isAdminReply),
    roleBadge,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
    user: {
      id: userObj ? userObj.id : doc.user,
      name: userName,
      initials: userInitials,
      avatar: null,
    },
  }
}

/**
 * GET /api/v1/products/[id]/comments
 *
 * Returns top-level published comments with nested replies,
 * author attribution with role badges, total count, and pagination.
 */
export async function GET(req: Request, context: RouteContext) {
  try {
    const { id: paramId } = await context.params
    const payload = await getPayload({ config: configPromise })

    const productId = await resolveProductId(payload, paramId)
    if (!productId) {
      return NextResponse.json(
        {
          error: 'PRODUCT_NOT_FOUND',
          message: 'Không tìm thấy sản phẩm.',
        },
        { status: 404 },
      )
    }

    const { searchParams } = new URL(req.url)
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10) || 1)
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '10', 10) || 10))

    // 1. Total published comments count for the product (including replies)
    const countRes = await payload.count({
      collection: 'comments',
      where: {
        and: [
          { product: { equals: productId } },
          { status: { equals: 'published' } },
        ],
      },
      overrideAccess: true,
    })
    const totalComments = countRes.totalDocs

    // 2. Fetch top-level published comments (parent is null / doesn't exist)
    const topLevelComments = await payload.find({
      collection: 'comments',
      where: {
        and: [
          { product: { equals: productId } },
          { status: { equals: 'published' } },
          { parent: { exists: false } },
        ],
      },
      sort: '-createdAt',
      page,
      limit,
      depth: 1,
      overrideAccess: true,
    })

    const topDocs = topLevelComments.docs || []
    const parentIds = topDocs.map((c: any) => c.id)

    // 3. Fetch all nested replies for current page's top-level comments
    const repliesByParent: Record<number, any[]> = {}
    if (parentIds.length > 0) {
      const repliesRes = await payload.find({
        collection: 'comments',
        where: {
          and: [
            { product: { equals: productId } },
            { status: { equals: 'published' } },
            { parent: { in: parentIds } },
          ],
        },
        sort: 'createdAt',
        limit: 500,
        depth: 1,
        overrideAccess: true,
      })

      for (const r of repliesRes.docs) {
        const pId = typeof r.parent === 'object' && r.parent !== null ? r.parent.id : r.parent
        if (pId) {
          if (!repliesByParent[pId]) {
            repliesByParent[pId] = []
          }
          repliesByParent[pId].push(formatComment(r))
        }
      }
    }

    const comments = topDocs.map((doc: any) => ({
      ...formatComment(doc),
      replies: repliesByParent[doc.id] || [],
    }))

    return NextResponse.json({
      success: true,
      comments,
      totalComments,
      pagination: {
        page: topLevelComments.page || 1,
        limit: topLevelComments.limit || limit,
        totalPages: topLevelComments.totalPages || 1,
        totalDocs: topLevelComments.totalDocs || 0,
      },
    })
  } catch (error: any) {
    console.error('Error fetching comments:', error)
    return NextResponse.json(
      {
        error: 'INTERNAL_ERROR',
        message: 'Đã xảy ra lỗi khi lấy danh sách bình luận.',
      },
      { status: 500 },
    )
  }
}

/**
 * POST /api/v1/products/[id]/comments
 *
 * Creates a comment or a reply to an existing comment.
 * Authenticated users only (401).
 * Validates non-empty content (>= 3 chars).
 * Supports 1-level threading (parentId validation).
 * Detects seller/admin role badges.
 */
export async function POST(req: Request, context: RouteContext) {
  try {
    const { id: paramId } = await context.params

    let headers: Headers
    try {
      headers = await getHeaders()
    } catch {
      headers = req.headers
    }

    const payload = await getPayload({ config: configPromise })
    const { user } = await payload.auth({ headers })

    if (!user) {
      return NextResponse.json(
        {
          error: 'UNAUTHORIZED',
          message: 'Yêu cầu đăng nhập để gửi bình luận.',
        },
        { status: 401 },
      )
    }

    const productId = await resolveProductId(payload, paramId)
    if (!productId) {
      return NextResponse.json(
        {
          error: 'PRODUCT_NOT_FOUND',
          message: 'Không tìm thấy sản phẩm.',
        },
        { status: 404 },
      )
    }

    let body: any
    try {
      body = await req.json()
    } catch {
      return NextResponse.json(
        {
          error: 'INVALID_REQUEST',
          message: 'Dữ liệu yêu cầu không hợp lệ (yêu cầu định dạng JSON).',
        },
        { status: 400 },
      )
    }

    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return NextResponse.json(
        {
          error: 'INVALID_REQUEST',
          message: 'Dữ liệu yêu cầu không hợp lệ.',
        },
        { status: 400 },
      )
    }

    // Validate content (required, min 3 characters after trim, max 5000)
    const rawContent = body.content
    if (typeof rawContent !== 'string') {
      return NextResponse.json(
        {
          error: 'INVALID_CONTENT',
          message: 'Nội dung bình luận là bắt buộc.',
        },
        { status: 400 },
      )
    }

    const trimmedContent = rawContent.trim()
    if (trimmedContent.length < 3) {
      return NextResponse.json(
        {
          error: 'INVALID_CONTENT',
          message: 'Nội dung bình luận phải có ít nhất 3 ký tự.',
        },
        { status: 400 },
      )
    }

    if (trimmedContent.length > 5000) {
      return NextResponse.json(
        {
          error: 'INVALID_CONTENT',
          message: 'Nội dung bình luận không được vượt quá 5000 ký tự.',
        },
        { status: 400 },
      )
    }

    // Validate parentId if provided
    const parentIdRaw = body.parentId !== undefined ? body.parentId : body.parent
    let parentId: number | null = null

    if (parentIdRaw !== undefined && parentIdRaw !== null && parentIdRaw !== '') {
      const parsedParentId = Number(parentIdRaw)
      if (!Number.isInteger(parsedParentId) || parsedParentId <= 0) {
        return NextResponse.json(
          {
            error: 'INVALID_PARENT',
            message: 'Mã bình luận cha không hợp lệ.',
          },
          { status: 400 },
        )
      }

      let parentDoc: any = null
      try {
        parentDoc = await payload.findByID({
          collection: 'comments',
          id: parsedParentId,
          depth: 0,
          overrideAccess: true,
        })
      } catch {
        parentDoc = null
      }

      if (!parentDoc) {
        return NextResponse.json(
          {
            error: 'PARENT_NOT_FOUND',
            message: 'Không tìm thấy bình luận cha.',
          },
          { status: 404 },
        )
      }

      if (parentDoc.status !== 'published') {
        return NextResponse.json(
          {
            error: 'PARENT_NOT_AVAILABLE',
            message: 'Không thể trả lời bình luận đã bị ẩn hoặc chưa được phê duyệt.',
          },
          { status: 400 },
        )
      }

      const parentProductId =
        typeof parentDoc.product === 'object' && parentDoc.product !== null
          ? parentDoc.product.id
          : parentDoc.product

      if (String(parentProductId) !== String(productId)) {
        return NextResponse.json(
          {
            error: 'PRODUCT_MISMATCH',
            message: 'Bình luận trả lời không cùng sản phẩm.',
          },
          { status: 400 },
        )
      }

      // Enforce 1-level threading: cannot reply to a reply
      if (parentDoc.parent) {
        return NextResponse.json(
          {
            error: 'NESTING_NOT_ALLOWED',
            message: 'Chỉ hỗ trợ trả lời bình luận cấp 1.',
          },
          { status: 400 },
        )
      }

      parentId = parsedParentId
    }

    // Detect role context (seller or platform admin)
    const productDoc = await payload.findByID({
      collection: 'products',
      id: productId,
      depth: 0,
      overrideAccess: true,
    })

    const sellerId =
      typeof productDoc?.seller === 'object' && productDoc.seller !== null
        ? productDoc.seller.id
        : productDoc?.seller

    const isSeller = Boolean(user.id && String(user.id) === String(sellerId))
    const isAdmin = Boolean(user.roles?.includes('admin'))

    // Create comment record
    const createdDoc = await payload.create({
      collection: 'comments',
      data: {
        product: productId,
        user: user.id,
        parent: parentId || undefined,
        content: trimmedContent,
        status: 'published',
        isSellerReply: isSeller,
        isAdminReply: isAdmin,
      },
      user,
      overrideAccess: true,
    })

    // Fetch created comment with depth 1 to populate author user details
    const populatedDoc = await payload.findByID({
      collection: 'comments',
      id: createdDoc.id,
      depth: 1,
      overrideAccess: true,
    })

    return NextResponse.json(
      {
        success: true,
        comment: {
          ...formatComment(populatedDoc),
          replies: [],
        },
      },
      { status: 201 },
    )
  } catch (error: any) {
    console.error('Error creating comment:', error)
    return NextResponse.json(
      {
        error: 'INTERNAL_ERROR',
        message: error?.message || 'Đã xảy ra lỗi khi tạo bình luận.',
      },
      { status: 500 },
    )
  }
}
