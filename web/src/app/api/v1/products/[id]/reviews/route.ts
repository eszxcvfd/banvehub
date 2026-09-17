import { NextResponse } from 'next/server'
import { getPayload } from 'payload'
import configPromise from '@payload-config'
import { headers as getHeaders } from 'next/headers'
import { sql } from '@payloadcms/db-postgres'

type RouteContext = {
  params: Promise<{
    id: string
  }>
}

/**
 * Helper to resolve product ID from route param (which could be an integer ID or slug).
 */
async function resolveProductId(payload: any, paramId: string): Promise<number | null> {
  const trimmed = paramId?.trim()
  if (!trimmed) return null

  // If numeric, check if product exists with this id
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

  // Otherwise, attempt lookup by slug
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

/**
 * GET /api/v1/products/[id]/reviews
 *
 * Query published reviews for a product with:
 * - Paginated list of reviews
 * - Summary statistics (average rating, total count, 1-5 star breakdown)
 * - User review status if authenticated
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

    // Optional auth check to identify user's own review
    let currentUser: any = null
    try {
      let headers: Headers
      try {
        headers = await getHeaders()
      } catch {
        headers = req.headers
      }
      const authResult = await payload.auth({ headers })
      currentUser = authResult.user
    } catch {
      currentUser = null
    }

    // 1. Fetch summary statistics (performant database aggregation with fallback)
    let totalCount = 0
    let averageRating = 0
    const distribution: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }

    let aggregationDone = false
    try {
      const dTx = (payload.db as any)?.drizzle
      if (dTx && typeof dTx.execute === 'function') {
        const result = await dTx.execute(sql`
          SELECT
            COUNT(*)::int AS total_count,
            COALESCE(ROUND(AVG(rating)::numeric, 1), 0)::float AS average_rating,
            COUNT(*) FILTER (WHERE ROUND(rating) = 1)::int AS count_1,
            COUNT(*) FILTER (WHERE ROUND(rating) = 2)::int AS count_2,
            COUNT(*) FILTER (WHERE ROUND(rating) = 3)::int AS count_3,
            COUNT(*) FILTER (WHERE ROUND(rating) = 4)::int AS count_4,
            COUNT(*) FILTER (WHERE ROUND(rating) = 5)::int AS count_5
          FROM "reviews"
          WHERE "product_id" = ${productId} AND "status" = 'published';
        `)
        const rows = result?.rows || result
        if (rows && rows.length > 0) {
          const row = rows[0]
          totalCount = Number(row.total_count) || 0
          averageRating = Number(row.average_rating) || 0
          distribution[1] = Number(row.count_1) || 0
          distribution[2] = Number(row.count_2) || 0
          distribution[3] = Number(row.count_3) || 0
          distribution[4] = Number(row.count_4) || 0
          distribution[5] = Number(row.count_5) || 0
          aggregationDone = true
        }
      }
    } catch {
      aggregationDone = false
    }

    if (!aggregationDone) {
      const allPublishedReviews = await payload.find({
        collection: 'reviews',
        where: {
          and: [
            {
              product: {
                equals: productId,
              },
            },
            {
              status: {
                equals: 'published',
              },
            },
          ],
        },
        limit: 10000,
        pagination: false,
        depth: 0,
        overrideAccess: true,
      })

      totalCount = allPublishedReviews.totalDocs ?? allPublishedReviews.docs.length
      let totalScore = 0

      for (const doc of allPublishedReviews.docs) {
        const r = Math.round(Number((doc as any).rating))
        if (r >= 1 && r <= 5) {
          distribution[r] = (distribution[r] || 0) + 1
          totalScore += r
        }
      }

      averageRating = totalCount > 0 ? Math.round((totalScore / totalCount) * 10) / 10 : 0
    }

    // 2. Fetch paginated published reviews with author details
    const paginated = await payload.find({
      collection: 'reviews',
      where: {
        and: [
          {
            product: {
              equals: productId,
            },
          },
          {
            status: {
              equals: 'published',
            },
          },
        ],
      },
      sort: '-createdAt',
      page,
      limit,
      depth: 1,
      overrideAccess: true,
    })

    const reviews = paginated.docs.map((doc: any) => {
      const userObj = typeof doc.user === 'object' && doc.user !== null ? doc.user : null
      const userName = userObj?.name?.trim() || 'Khách hàng'
      const nameParts = userName.split(/\s+/).filter(Boolean)
      const userInitials = (
        nameParts.length > 1
          ? nameParts[0][0] + nameParts[nameParts.length - 1][0]
          : userName.slice(0, 2)
      ).toUpperCase() || 'KH'

      return {
        id: doc.id,
        rating: Number(doc.rating),
        title: doc.title || null,
        content: doc.content,
        status: doc.status,
        createdAt: doc.createdAt,
        updatedAt: doc.updatedAt,
        verifiedPurchase: true, // BR-05 ensures all reviews are verified purchases
        user: {
          id: userObj ? userObj.id : doc.user,
          name: userName,
          initials: userInitials,
        },
        sellerReply: doc.sellerReply?.comment
          ? {
              comment: doc.sellerReply.comment,
              repliedAt: doc.sellerReply.repliedAt || null,
            }
          : null,
      }
    })

    // 3. If authenticated, check whether current user has an existing review and active entitlement
    let userReview: any = null
    let canReview = false

    if (currentUser) {
      const currentUserId = typeof currentUser.id === 'string' ? parseInt(currentUser.id, 10) : Number(currentUser.id)

      // Find user's review if any
      const existingUserReviews = await payload.find({
        collection: 'reviews',
        where: {
          and: [
            {
              product: {
                equals: productId,
              },
            },
            {
              user: {
                equals: currentUserId,
              },
            },
          ],
        },
        limit: 1,
        depth: 0,
        overrideAccess: true,
      })

      if (existingUserReviews.totalDocs > 0) {
        const myReview = existingUserReviews.docs[0] as any
        userReview = {
          id: myReview.id,
          rating: Number(myReview.rating),
          title: myReview.title || null,
          content: myReview.content,
          status: myReview.status,
          createdAt: myReview.createdAt,
          updatedAt: myReview.updatedAt,
          sellerReply: myReview.sellerReply?.comment
            ? {
                comment: myReview.sellerReply.comment,
                repliedAt: myReview.sellerReply.repliedAt || null,
              }
            : null,
        }
      }

      // Check active entitlement
      const userEntitlements = await payload.find({
        collection: 'entitlements',
        where: {
          and: [
            {
              user: {
                equals: currentUserId,
              },
            },
            {
              product: {
                equals: productId,
              },
            },
            {
              status: {
                equals: 'active',
              },
            },
          ],
        },
        limit: 1,
        depth: 0,
        overrideAccess: true,
      })

      canReview = userEntitlements.totalDocs > 0 && !userReview
    }

    return NextResponse.json({
      success: true,
      summary: {
        averageRating,
        totalCount,
        distribution,
      },
      reviews,
      pagination: {
        page: paginated.page,
        limit: paginated.limit,
        totalPages: paginated.totalPages,
        totalDocs: paginated.totalDocs,
      },
      userReview,
      canReview,
    })
  } catch (error: any) {
    return NextResponse.json(
      {
        error: 'INTERNAL_ERROR',
        message: error?.message || 'Có lỗi xảy ra khi tải danh sách đánh giá.',
      },
      { status: 500 },
    )
  }
}

/**
 * POST /api/v1/products/[id]/reviews
 *
 * Submit a new verified review for a product:
 * - 401 if unauthenticated
 * - 404 if product not found
 * - 400 if input invalid (rating not 1-5, content < 5 chars)
 * - 403 if user lacks active entitlement for the product (BR-05)
 * - 409 if user has already reviewed this product
 * - 201 on success
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
          message: 'Yêu cầu đăng nhập để gửi đánh giá.',
        },
        { status: 401 },
      )
    }

    const userId = typeof user.id === 'string' ? parseInt(user.id, 10) : Number(user.id)
    if (!userId || isNaN(userId) || userId <= 0) {
      return NextResponse.json(
        {
          error: 'UNAUTHORIZED',
          message: 'Yêu cầu đăng nhập để gửi đánh giá.',
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
          message: 'Dữ liệu yêu cầu không hợp lệ (yêu cầu định dạng JSON object).',
        },
        { status: 400 },
      )
    }

    // 1. Rating validation (1 to 5 integer)
    const rawRating = body?.rating
    if (rawRating === undefined || rawRating === null) {
      return NextResponse.json(
        {
          error: 'INVALID_REQUEST',
          message: 'Đánh giá số sao (rating) là bắt buộc.',
        },
        { status: 400 },
      )
    }

    const numRating = Number(rawRating)
    if (typeof rawRating === 'boolean' || !Number.isInteger(numRating) || numRating < 1 || numRating > 5) {
      return NextResponse.json(
        {
          error: 'INVALID_REQUEST',
          message: 'Đánh giá phải là số nguyên từ 1 đến 5 sao.',
        },
        { status: 400 },
      )
    }

    // 2. Content validation (min 5 characters after trimming, max 5000)
    const rawContent = body?.content
    if (typeof rawContent !== 'string' || rawContent.trim().length < 5) {
      return NextResponse.json(
        {
          error: 'INVALID_REQUEST',
          message: 'Nội dung đánh giá phải có ít nhất 5 ký tự.',
        },
        { status: 400 },
      )
    }
    const content = rawContent.trim()
    if (content.length > 5000) {
      return NextResponse.json(
        {
          error: 'INVALID_REQUEST',
          message: 'Nội dung đánh giá không được vượt quá 5000 ký tự.',
        },
        { status: 400 },
      )
    }

    // Title validation (optional, max 200 chars)
    const rawTitle = typeof body?.title === 'string' ? body.title.trim() : null
    if (rawTitle && rawTitle.length > 200) {
      return NextResponse.json(
        {
          error: 'INVALID_REQUEST',
          message: 'Tiêu đề đánh giá không được vượt quá 200 ký tự.',
        },
        { status: 400 },
      )
    }
    const title = rawTitle && rawTitle.length > 0 ? rawTitle : null

    // 3. BR-05 Verified Purchase Check: must possess an active entitlement
    const activeEntitlements = await payload.find({
      collection: 'entitlements',
      where: {
        and: [
          {
            user: {
              equals: userId,
            },
          },
          {
            product: {
              equals: productId,
            },
          },
          {
            status: {
              equals: 'active',
            },
          },
        ],
      },
      limit: 1,
      depth: 0,
      overrideAccess: true,
    })

    if (activeEntitlements.totalDocs === 0) {
      return NextResponse.json(
        {
          error: 'VERIFIED_PURCHASE_REQUIRED',
          message: 'Chỉ khách hàng đã mua sản phẩm mới có thể gửi đánh giá (BR-05).',
        },
        { status: 403 },
      )
    }

    const entitlementId = activeEntitlements.docs[0].id

    // 4. Duplicate Check: single review per buyer-product pair
    const existingReviews = await payload.find({
      collection: 'reviews',
      where: {
        and: [
          {
            user: {
              equals: userId,
            },
          },
          {
            product: {
              equals: productId,
            },
          },
        ],
      },
      limit: 1,
      depth: 0,
      overrideAccess: true,
    })

    if (existingReviews.totalDocs > 0) {
      return NextResponse.json(
        {
          error: 'ALREADY_REVIEWED',
          message: 'Bạn đã gửi đánh giá cho sản phẩm này.',
          existingReviewId: existingReviews.docs[0].id,
        },
        { status: 409 },
      )
    }

    // 5. Create Review
    const newReview = await payload.create({
      collection: 'reviews',
      data: {
        product: productId,
        user: userId,
        entitlement: entitlementId,
        rating: numRating,
        title,
        content,
        status: 'published',
      },
      user,
      overrideAccess: true,
    })

    return NextResponse.json(
      {
        success: true,
        message: 'Đánh giá đã được gửi thành công.',
        review: {
          id: newReview.id,
          productId,
          userId,
          rating: newReview.rating,
          title: newReview.title,
          content: newReview.content,
          status: newReview.status,
          createdAt: newReview.createdAt,
        },
      },
      { status: 201 },
    )
  } catch (error: any) {
    const errMsg = String(error?.message || '').toLowerCase()
    const errorDataStr = JSON.stringify(
      error?.data || error?.errors || error?.cause || '',
    ).toLowerCase()

    const isDuplicate =
      errMsg.includes('duplicate') ||
      errMsg.includes('user_id, product_id') ||
      errMsg.includes('reviews_user_product_idx') ||
      errMsg.includes('value must be unique') ||
      errorDataStr.includes('user_id, product_id') ||
      errorDataStr.includes('value must be unique') ||
      errorDataStr.includes('reviews_user_product_idx') ||
      error?.code === '23505' ||
      error?.cause?.code === '23505'

    if (isDuplicate) {
      return NextResponse.json(
        {
          error: 'ALREADY_REVIEWED',
          message: 'Bạn đã gửi đánh giá cho sản phẩm này.',
        },
        { status: 409 },
      )
    }

    if (errMsg.includes('br-05') || errMsg.includes('verified purchase')) {
      return NextResponse.json(
        {
          error: 'VERIFIED_PURCHASE_REQUIRED',
          message: 'Chỉ khách hàng đã mua sản phẩm mới có thể gửi đánh giá (BR-05).',
        },
        { status: 403 },
      )
    }

    return NextResponse.json(
      {
        error: 'INTERNAL_ERROR',
        message: error?.message || 'Có lỗi xảy ra khi gửi đánh giá.',
      },
      { status: 500 },
    )
  }
}

/**
 * PUT /api/v1/products/[id]/reviews
 *
 * Update an existing review by the authenticated author:
 * - 401 if unauthenticated
 * - 404 if review does not exist
 * - 400 if validation fails
 * - 200 on success
 */
export async function PUT(req: Request, context: RouteContext) {
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
          message: 'Yêu cầu đăng nhập để chỉnh sửa đánh giá.',
        },
        { status: 401 },
      )
    }

    const userId = typeof user.id === 'string' ? parseInt(user.id, 10) : Number(user.id)
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

    const existingReviews = await payload.find({
      collection: 'reviews',
      where: {
        and: [
          {
            user: {
              equals: userId,
            },
          },
          {
            product: {
              equals: productId,
            },
          },
        ],
      },
      limit: 1,
      overrideAccess: true,
    })

    if (existingReviews.totalDocs === 0) {
      return NextResponse.json(
        {
          error: 'NOT_FOUND',
          message: 'Không tìm thấy đánh giá của bạn cho sản phẩm này.',
        },
        { status: 404 },
      )
    }

    const existingDoc = existingReviews.docs[0]

    let body: any
    try {
      body = await req.json()
    } catch {
      return NextResponse.json(
        {
          error: 'INVALID_REQUEST',
          message: 'Dữ liệu yêu cầu không hợp lệ.',
        },
        { status: 400 },
      )
    }

    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return NextResponse.json(
        {
          error: 'INVALID_REQUEST',
          message: 'Dữ liệu yêu cầu không hợp lệ (yêu cầu định dạng JSON object).',
        },
        { status: 400 },
      )
    }

    if (body.rating === undefined && body.content === undefined && body.title === undefined) {
      return NextResponse.json(
        {
          error: 'INVALID_REQUEST',
          message: 'Cần cung cấp ít nhất một trường để cập nhật (rating, content hoặc title).',
        },
        { status: 400 },
      )
    }

    const updateData: Record<string, any> = {}

    if (body.rating !== undefined) {
      const numRating = Number(body.rating)
      if (typeof body.rating === 'boolean' || body.rating === null || !Number.isInteger(numRating) || numRating < 1 || numRating > 5) {
        return NextResponse.json(
          {
            error: 'INVALID_REQUEST',
            message: 'Đánh giá phải là số nguyên từ 1 đến 5 sao.',
          },
          { status: 400 },
        )
      }
      updateData.rating = numRating
    }

    if (body.content !== undefined) {
      if (typeof body.content !== 'string' || body.content.trim().length < 5) {
        return NextResponse.json(
          {
            error: 'INVALID_REQUEST',
            message: 'Nội dung đánh giá phải có ít nhất 5 ký tự.',
          },
          { status: 400 },
        )
      }
      const trimmed = body.content.trim()
      if (trimmed.length > 5000) {
        return NextResponse.json(
          {
            error: 'INVALID_REQUEST',
            message: 'Nội dung đánh giá không được vượt quá 5000 ký tự.',
          },
          { status: 400 },
        )
      }
      updateData.content = trimmed
    }

    if (body.title !== undefined) {
      if (body.title === null) {
        updateData.title = null
      } else {
        const rawTitle = typeof body.title === 'string' ? body.title.trim() : null
        if (rawTitle && rawTitle.length > 200) {
          return NextResponse.json(
            {
              error: 'INVALID_REQUEST',
              message: 'Tiêu đề đánh giá không được vượt quá 200 ký tự.',
            },
            { status: 400 },
          )
        }
        updateData.title = rawTitle && rawTitle.length > 0 ? rawTitle : null
      }
    }

    const updatedReview = await payload.update({
      collection: 'reviews',
      id: existingDoc.id,
      data: updateData,
      user,
      overrideAccess: true,
    })

    return NextResponse.json({
      success: true,
      message: 'Đánh giá đã được cập nhật thành công.',
      review: {
        id: updatedReview.id,
        rating: updatedReview.rating,
        title: updatedReview.title,
        content: updatedReview.content,
        updatedAt: updatedReview.updatedAt,
      },
    })
  } catch (error: any) {
    return NextResponse.json(
      {
        error: 'INTERNAL_ERROR',
        message: error?.message || 'Có lỗi xảy ra khi cập nhật đánh giá.',
      },
      { status: 500 },
    )
  }
}
