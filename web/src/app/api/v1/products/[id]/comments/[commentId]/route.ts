import { NextResponse } from 'next/server'
import { getPayload } from 'payload'
import configPromise from '@payload-config'
import { headers as getHeaders } from 'next/headers'

type RouteContext = {
  params: Promise<{
    id: string
    commentId: string
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
 * PATCH /api/v1/products/[id]/comments/[commentId]
 *
 * Update comment content or moderation/visibility status.
 * Author can edit content or soft-delete (status = 'hidden').
 * Admin/Moderator can change moderation status ('published', 'pending', 'hidden').
 */
export async function PATCH(req: Request, context: RouteContext) {
  try {
    const { id: paramId, commentId: paramCommentId } = await context.params

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
          message: 'Yêu cầu đăng nhập để cập nhật bình luận.',
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

    const commentId = Number(paramCommentId)
    if (!Number.isInteger(commentId) || commentId <= 0) {
      return NextResponse.json(
        {
          error: 'INVALID_ID',
          message: 'Mã bình luận không hợp lệ.',
        },
        { status: 400 },
      )
    }

    let commentDoc: any = null
    try {
      commentDoc = await payload.findByID({
        collection: 'comments',
        id: commentId,
        depth: 0,
        overrideAccess: true,
      })
    } catch {
      commentDoc = null
    }

    if (!commentDoc) {
      return NextResponse.json(
        {
          error: 'COMMENT_NOT_FOUND',
          message: 'Không tìm thấy bình luận.',
        },
        { status: 404 },
      )
    }

    const commentProductId =
      typeof commentDoc.product === 'object' && commentDoc.product !== null
        ? commentDoc.product.id
        : commentDoc.product

    if (String(commentProductId) !== String(productId)) {
      return NextResponse.json(
        {
          error: 'PRODUCT_MISMATCH',
          message: 'Bình luận không thuộc sản phẩm này.',
        },
        { status: 400 },
      )
    }

    const commentAuthorId =
      typeof commentDoc.user === 'object' && commentDoc.user !== null
        ? commentDoc.user.id
        : commentDoc.user

    const isAuthor = String(user.id) === String(commentAuthorId)
    const isAdmin = Boolean(user.roles?.includes('admin'))
    const isModerator = Boolean(user.roles?.includes('moderator'))

    if (!isAuthor && !isAdmin && !isModerator) {
      return NextResponse.json(
        {
          error: 'FORBIDDEN',
          message: 'Bạn không có quyền chỉnh sửa bình luận này.',
        },
        { status: 403 },
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

    const updateData: Record<string, any> = {}

    // Content update
    if (body.content !== undefined) {
      if (typeof body.content !== 'string') {
        return NextResponse.json(
          {
            error: 'INVALID_CONTENT',
            message: 'Nội dung bình luận phải là chuỗi ký tự.',
          },
          { status: 400 },
        )
      }

      const trimmedContent = body.content.trim()
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

      updateData.content = trimmedContent
    }

    // Status / Moderation update
    if (body.status !== undefined) {
      const validStatuses = ['published', 'pending', 'hidden']
      if (!validStatuses.includes(body.status)) {
        return NextResponse.json(
          {
            error: 'INVALID_STATUS',
            message: 'Trạng thái bình luận không hợp lệ.',
          },
          { status: 400 },
        )
      }

      // Non-admin / non-moderator author can only change status to 'hidden' (soft-delete / hide)
      if (!isAdmin && !isModerator && body.status !== commentDoc.status && body.status !== 'hidden') {
        return NextResponse.json(
          {
            error: 'FORBIDDEN',
            message: 'Chỉ quản trị viên mới có quyền thay đổi trạng thái kiểm duyệt này.',
          },
          { status: 403 },
        )
      }

      updateData.status = body.status
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json(
        {
          error: 'NO_CHANGES',
          message: 'Không có dữ liệu nào được cung cấp để cập nhật.',
        },
        { status: 400 },
      )
    }

    const updatedDoc = await payload.update({
      collection: 'comments',
      id: commentId,
      data: updateData,
      user,
      overrideAccess: true,
    })

    const populatedDoc = await payload.findByID({
      collection: 'comments',
      id: updatedDoc.id,
      depth: 1,
      overrideAccess: true,
    })

    return NextResponse.json(
      {
        success: true,
        comment: formatComment(populatedDoc),
      },
      { status: 200 },
    )
  } catch (error: any) {
    console.error('Error updating comment:', error)
    return NextResponse.json(
      {
        error: 'INTERNAL_ERROR',
        message: error?.message || 'Đã xảy ra lỗi khi cập nhật bình luận.',
      },
      { status: 500 },
    )
  }
}

/**
 * DELETE /api/v1/products/[id]/comments/[commentId]
 *
 * Author soft-deletes (sets status = 'hidden').
 * Admin can hard-delete or soft-delete.
 */
export async function DELETE(req: Request, context: RouteContext) {
  try {
    const { id: paramId, commentId: paramCommentId } = await context.params

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
          message: 'Yêu cầu đăng nhập.',
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

    const commentId = Number(paramCommentId)
    if (!Number.isInteger(commentId) || commentId <= 0) {
      return NextResponse.json(
        {
          error: 'INVALID_ID',
          message: 'Mã bình luận không hợp lệ.',
        },
        { status: 400 },
      )
    }

    let commentDoc: any = null
    try {
      commentDoc = await payload.findByID({
        collection: 'comments',
        id: commentId,
        depth: 0,
        overrideAccess: true,
      })
    } catch {
      commentDoc = null
    }

    if (!commentDoc) {
      return NextResponse.json(
        {
          error: 'COMMENT_NOT_FOUND',
          message: 'Không tìm thấy bình luận.',
        },
        { status: 404 },
      )
    }

    const commentProductId =
      typeof commentDoc.product === 'object' && commentDoc.product !== null
        ? commentDoc.product.id
        : commentDoc.product

    if (String(commentProductId) !== String(productId)) {
      return NextResponse.json(
        {
          error: 'PRODUCT_MISMATCH',
          message: 'Bình luận không thuộc sản phẩm này.',
        },
        { status: 400 },
      )
    }

    const commentAuthorId =
      typeof commentDoc.user === 'object' && commentDoc.user !== null
        ? commentDoc.user.id
        : commentDoc.user

    const isAuthor = String(user.id) === String(commentAuthorId)
    const isAdmin = Boolean(user.roles?.includes('admin'))

    if (!isAuthor && !isAdmin) {
      return NextResponse.json(
        {
          error: 'FORBIDDEN',
          message: 'Bạn không có quyền xóa bình luận này.',
        },
        { status: 403 },
      )
    }

    if (isAdmin) {
      await payload.delete({
        collection: 'comments',
        id: commentId,
        overrideAccess: true,
      })
      return NextResponse.json(
        {
          success: true,
          message: 'Đã xóa vĩnh viễn bình luận thành công.',
        },
        { status: 200 },
      )
    } else {
      // Author soft-delete / hide
      const updated = await payload.update({
        collection: 'comments',
        id: commentId,
        data: {
          status: 'hidden',
        },
        user,
        overrideAccess: true,
      })

      const populated = await payload.findByID({
        collection: 'comments',
        id: updated.id,
        depth: 1,
        overrideAccess: true,
      })

      return NextResponse.json(
        {
          success: true,
          message: 'Đã ẩn bình luận thành công.',
          comment: formatComment(populated),
        },
        { status: 200 },
      )
    }
  } catch (error: any) {
    console.error('Error deleting comment:', error)
    return NextResponse.json(
      {
        error: 'INTERNAL_ERROR',
        message: error?.message || 'Đã xảy ra lỗi khi xóa bình luận.',
      },
      { status: 500 },
    )
  }
}
