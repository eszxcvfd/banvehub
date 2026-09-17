import { getPayload, type Payload } from 'payload'
import config from '@/payload.config'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import type { User, Product } from '@/payload-types'
import { GET, POST } from '@/app/api/v1/products/[id]/comments/route'
import { PATCH, DELETE } from '@/app/api/v1/products/[id]/comments/[commentId]/route'

describe('Product Comments & Q&A Subsystem (FR-21)', () => {
  let payload: Payload
  let sellerUser: User
  let regularUser1: User
  let regularUser2: User
  let adminUser: User
  let testProduct: Product
  let secondProduct: Product
  let emptyProduct: Product

  const cleanup = {
    comments: [] as (number | string)[],
    products: [] as (number | string)[],
    users: [] as (number | string)[],
  }

  let seq = 0
  const getSeq = () => ++seq

  const createUser = async (email: string, roles: User['roles']): Promise<User> => {
    const user = (await payload.create({
      collection: 'users',
      data: {
        email,
        password: 'test-password-comments-123',
        name: email.split('@')[0],
        roles,
      },
      overrideAccess: true,
    })) as User
    cleanup.users.push(user.id)
    return user
  }

  beforeAll(async () => {
    payload = await getPayload({ config })
    const timestamp = Date.now()

    sellerUser = await createUser(`seller-com-${timestamp}-${getSeq()}@kientaohub.local`, ['seller'])
    regularUser1 = await createUser(`buyer1-com-${timestamp}-${getSeq()}@kientaohub.local`, ['buyer'])
    regularUser2 = await createUser(`buyer2-com-${timestamp}-${getSeq()}@kientaohub.local`, ['buyer'])
    adminUser = await createUser(`admin-com-${timestamp}-${getSeq()}@kientaohub.local`, ['admin'])

    // Primary product
    const prodDoc = await payload.create({
      collection: 'products',
      data: {
        title: `CAD Comments Test Resource ${getSeq()}`,
        slug: `cad-comments-test-${timestamp}`,
        price: 120000,
        isFree: false,
        seller: sellerUser.id,
        copyrightDeclared: true,
        moderationStatus: 'approved',
        _status: 'published',
      },
      overrideAccess: true,
    })
    testProduct = prodDoc as Product
    cleanup.products.push(testProduct.id)

    // Second product for mismatched product testing
    const secondProdDoc = await payload.create({
      collection: 'products',
      data: {
        title: `Second CAD Resource ${getSeq()}`,
        slug: `second-cad-resource-${timestamp}`,
        price: 150000,
        isFree: false,
        seller: sellerUser.id,
        copyrightDeclared: true,
        moderationStatus: 'approved',
        _status: 'published',
      },
      overrideAccess: true,
    })
    secondProduct = secondProdDoc as Product
    cleanup.products.push(secondProduct.id)

    // Empty product with 0 comments
    const emptyProdDoc = await payload.create({
      collection: 'products',
      data: {
        title: `Empty Comments Resource ${getSeq()}`,
        slug: `empty-comments-resource-${timestamp}`,
        price: 50000,
        isFree: false,
        seller: sellerUser.id,
        copyrightDeclared: true,
        moderationStatus: 'approved',
        _status: 'published',
      },
      overrideAccess: true,
    })
    emptyProduct = emptyProdDoc as Product
    cleanup.products.push(emptyProduct.id)
  })

  afterAll(async () => {
    for (const id of cleanup.comments) {
      try {
        await payload.delete({ collection: 'comments', id, overrideAccess: true })
      } catch {}
    }
    for (const id of cleanup.products) {
      try {
        await payload.delete({ collection: 'products', id, overrideAccess: true })
      } catch {}
    }
    for (const id of cleanup.users) {
      try {
        await payload.delete({ collection: 'users', id, overrideAccess: true })
      } catch {}
    }
  })

  const makeContext = (id: string | number) => ({
    params: Promise.resolve({ id: String(id) }),
  })

  const makeDetailContext = (id: string | number, commentId: string | number) => ({
    params: Promise.resolve({ id: String(id), commentId: String(commentId) }),
  })

  describe('R2: POST /api/v1/products/[id]/comments (Creation & Invariants)', () => {
    let topLevelCommentId: number

    it('returns 401 Unauthorized when unauthenticated', async () => {
      vi.spyOn(payload, 'auth').mockResolvedValueOnce({ user: null } as any)

      const req = new Request(`http://localhost:3000/api/v1/products/${testProduct.id}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: 'Tôi muốn hỏi bản vẽ này có kèm file DWG không?' }),
      })

      const res = await POST(req, makeContext(testProduct.id))
      expect(res.status).toBe(401)
      const data = await res.json()
      expect(data.error).toBe('UNAUTHORIZED')
    })

    it('returns 404 Not Found for non-existent product ID', async () => {
      vi.spyOn(payload, 'auth').mockResolvedValueOnce({ user: regularUser1 } as any)

      const req = new Request('http://localhost:3000/api/v1/products/9999999/comments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: 'Câu hỏi cho sản phẩm không tồn tại.' }),
      })

      const res = await POST(req, makeContext(9999999))
      expect(res.status).toBe(404)
      const data = await res.json()
      expect(data.error).toBe('PRODUCT_NOT_FOUND')
    })

    it('returns 400 Bad Request for blank or short content (< 3 characters)', async () => {
      vi.spyOn(payload, 'auth').mockResolvedValueOnce({ user: regularUser1 } as any)

      const reqBlank = new Request(`http://localhost:3000/api/v1/products/${testProduct.id}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: '   ' }),
      })

      const resBlank = await POST(reqBlank, makeContext(testProduct.id))
      expect(resBlank.status).toBe(400)
      const dataBlank = await resBlank.json()
      expect(dataBlank.error).toBe('INVALID_CONTENT')

      vi.spyOn(payload, 'auth').mockResolvedValueOnce({ user: regularUser1 } as any)
      const reqShort = new Request(`http://localhost:3000/api/v1/products/${testProduct.id}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: 'Hi' }),
      })
      const resShort = await POST(reqShort, makeContext(testProduct.id))
      expect(resShort.status).toBe(400)
    })

    it('returns 400 Bad Request for non-string or missing content', async () => {
      vi.spyOn(payload, 'auth').mockResolvedValueOnce({ user: regularUser1 } as any)

      const reqMissing = new Request(`http://localhost:3000/api/v1/products/${testProduct.id}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })

      const resMissing = await POST(reqMissing, makeContext(testProduct.id))
      expect(resMissing.status).toBe(400)
      const dataMissing = await resMissing.json()
      expect(dataMissing.error).toBe('INVALID_CONTENT')
    })

    it('returns 400 Bad Request when comment content exceeds 5000 characters', async () => {
      vi.spyOn(payload, 'auth').mockResolvedValueOnce({ user: regularUser1 } as any)

      const excessivelyLongContent = 'A'.repeat(5001)
      const reqLong = new Request(`http://localhost:3000/api/v1/products/${testProduct.id}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: excessivelyLongContent }),
      })

      const resLong = await POST(reqLong, makeContext(testProduct.id))
      expect(resLong.status).toBe(400)
      const dataLong = await resLong.json()
      expect(dataLong.error).toBe('INVALID_CONTENT')
      expect(dataLong.message).toContain('5000')
    })

    it('returns 201 Created for valid top-level comment by regular user', async () => {
      vi.spyOn(payload, 'auth').mockResolvedValueOnce({ user: regularUser1 } as any)

      const req = new Request(`http://localhost:3000/api/v1/products/${testProduct.id}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: 'Bản vẽ kết cấu thép này dùng cho Revit phiên bản nào?' }),
      })

      const res = await POST(req, makeContext(testProduct.id))
      expect(res.status).toBe(201)
      const data = await res.json()
      expect(data.success).toBe(true)
      expect(data.comment).toBeDefined()
      expect(data.comment.content).toBe('Bản vẽ kết cấu thép này dùng cho Revit phiên bản nào?')
      expect(data.comment.isSellerReply).toBe(false)
      expect(data.comment.isAdminReply).toBe(false)
      expect(data.comment.roleBadge).toBeNull()
      expect(data.comment.status).toBe('published')
      expect(data.comment.user.id).toBe(regularUser1.id)

      topLevelCommentId = data.comment.id
      cleanup.comments.push(topLevelCommentId)
    })

    it('returns 201 Created when seller replies to comment with role badge auto-detection', async () => {
      vi.spyOn(payload, 'auth').mockResolvedValueOnce({ user: sellerUser } as any)

      const req = new Request(`http://localhost:3000/api/v1/products/${testProduct.id}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          parentId: topLevelCommentId,
          content: 'Chào bạn, bản vẽ tương thích tốt từ Revit 2022 đến 2025 nhé!',
        }),
      })

      const res = await POST(req, makeContext(testProduct.id))
      expect(res.status).toBe(201)
      const data = await res.json()
      expect(data.success).toBe(true)
      expect(data.comment.isSellerReply).toBe(true)
      expect(data.comment.isAdminReply).toBe(false)
      expect(data.comment.roleBadge).toBe('Tác giả / Người bán')
      expect(data.comment.parentId).toBe(topLevelCommentId)

      cleanup.comments.push(data.comment.id)
    })

    it('returns 201 Created when admin replies to comment with admin badge auto-detection', async () => {
      vi.spyOn(payload, 'auth').mockResolvedValueOnce({ user: adminUser } as any)

      const req = new Request(`http://localhost:3000/api/v1/products/${testProduct.id}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          parentId: topLevelCommentId,
          content: 'Đội ngũ kiểm duyệt KienTaoHub đã xác nhận file CAD hợp lệ.',
        }),
      })

      const res = await POST(req, makeContext(testProduct.id))
      expect(res.status).toBe(201)
      const data = await res.json()
      expect(data.success).toBe(true)
      expect(data.comment.isAdminReply).toBe(true)
      expect(data.comment.roleBadge).toBe('Quản trị viên')
      expect(data.comment.parentId).toBe(topLevelCommentId)

      cleanup.comments.push(data.comment.id)
    })

    it('returns 404 when replying to a non-existent parent comment ID', async () => {
      vi.spyOn(payload, 'auth').mockResolvedValueOnce({ user: regularUser2 } as any)

      const req = new Request(`http://localhost:3000/api/v1/products/${testProduct.id}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          parentId: 9999999,
          content: 'Phản hồi bình luận không tồn tại.',
        }),
      })

      const res = await POST(req, makeContext(testProduct.id))
      expect(res.status).toBe(404)
      const data = await res.json()
      expect(data.error).toBe('PARENT_NOT_FOUND')
    })

    it('returns 400 when replying with parentId belonging to a different product', async () => {
      vi.spyOn(payload, 'auth').mockResolvedValueOnce({ user: regularUser2 } as any)

      // Attempt to reply under secondProduct using topLevelCommentId (which belongs to testProduct)
      const req = new Request(`http://localhost:3000/api/v1/products/${secondProduct.id}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          parentId: topLevelCommentId,
          content: 'Cố tình trả lời với parent ID từ sản phẩm khác.',
        }),
      })

      const res = await POST(req, makeContext(secondProduct.id))
      expect(res.status).toBe(400)
      const data = await res.json()
      expect(data.error).toBe('PRODUCT_MISMATCH')
    })

    it('returns 400 when attempting to reply to a reply (nested threading forbidden)', async () => {
      // First create a reply
      vi.spyOn(payload, 'auth').mockResolvedValueOnce({ user: regularUser2 } as any)
      const reqReply = new Request(`http://localhost:3000/api/v1/products/${testProduct.id}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          parentId: topLevelCommentId,
          content: 'Cảm ơn người bán đã giải đáp thắc mắc!',
        }),
      })
      const resReply = await POST(reqReply, makeContext(testProduct.id))
      expect(resReply.status).toBe(201)
      const replyData = await resReply.json()
      const replyId = replyData.comment.id
      cleanup.comments.push(replyId)

      // Now attempt to reply to the reply
      vi.spyOn(payload, 'auth').mockResolvedValueOnce({ user: regularUser1 } as any)
      const reqNested = new Request(`http://localhost:3000/api/v1/products/${testProduct.id}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          parentId: replyId,
          content: 'Cố tình reply vào reply cấp 2.',
        }),
      })
      const resNested = await POST(reqNested, makeContext(testProduct.id))
      expect(resNested.status).toBe(400)
      const nestedData = await resNested.json()
      expect(nestedData.error).toBe('NESTING_NOT_ALLOWED')
    })

    it('returns 400 when attempting to reply to a hidden parent comment', async () => {
      // Create a hidden parent comment
      const hiddenParentDoc = await payload.create({
        collection: 'comments',
        data: {
          product: testProduct.id,
          user: regularUser1.id,
          content: 'Câu hỏi đã bị ẩn bởi người dùng.',
          status: 'hidden',
        },
        overrideAccess: true,
      })
      cleanup.comments.push(hiddenParentDoc.id)

      vi.spyOn(payload, 'auth').mockResolvedValueOnce({ user: regularUser2 } as any)
      const req = new Request(`http://localhost:3000/api/v1/products/${testProduct.id}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          parentId: hiddenParentDoc.id,
          content: 'Cố tình trả lời vào câu hỏi đã bị ẩn.',
        }),
      })

      const res = await POST(req, makeContext(testProduct.id))
      expect(res.status).toBe(400)
      const data = await res.json()
      expect(data.error).toBe('PARENT_NOT_AVAILABLE')
    })

    it('safely handles Vietnamese diacritics, emojis, and XSS script tags without corruption', async () => {
      vi.spyOn(payload, 'auth').mockResolvedValueOnce({ user: regularUser1 } as any)

      const richContent = 'Bản vẽ có đủ chi tiết cốt thép móng & dầm không ạ? 🏗️📐 <script>alert("xss")</script>'
      const req = new Request(`http://localhost:3000/api/v1/products/${testProduct.id}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: richContent }),
      })

      const res = await POST(req, makeContext(testProduct.id))
      expect(res.status).toBe(201)
      const data = await res.json()
      expect(data.success).toBe(true)
      expect(data.comment.content).toBe(richContent)
      cleanup.comments.push(data.comment.id)
    })
  })

  describe('R2: GET /api/v1/products/[id]/comments (Listing & Hierarchy)', () => {
    it('returns top-level comments with nested replies and accurate count', async () => {
      const req = new Request(`http://localhost:3000/api/v1/products/${testProduct.id}/comments`, {
        method: 'GET',
      })

      const res = await GET(req, makeContext(testProduct.id))
      expect(res.status).toBe(200)
      const data = await res.json()
      expect(data.success).toBe(true)
      expect(data.totalComments).toBeGreaterThanOrEqual(4) // 1 top-level + 3 replies created in previous tests
      expect(data.comments.length).toBeGreaterThanOrEqual(1)

      const topComment = data.comments.find((c: any) => c.replies && c.replies.length > 0)
      expect(topComment).toBeDefined()
      expect(topComment.replies.length).toBeGreaterThanOrEqual(2)

      // Check author attribution and role badges on nested replies
      const sellerReply = topComment.replies.find((r: any) => r.isSellerReply)
      expect(sellerReply).toBeDefined()
      expect(sellerReply.roleBadge).toBe('Tác giả / Người bán')

      const adminReply = topComment.replies.find((r: any) => r.isAdminReply)
      expect(adminReply).toBeDefined()
      expect(adminReply.roleBadge).toBe('Quản trị viên')
    })

    it('returns empty array and 0 count gracefully when product has no comments', async () => {
      const req = new Request(`http://localhost:3000/api/v1/products/${emptyProduct.id}/comments`, {
        method: 'GET',
      })

      const res = await GET(req, makeContext(emptyProduct.id))
      expect(res.status).toBe(200)
      const data = await res.json()
      expect(data.success).toBe(true)
      expect(data.comments).toEqual([])
      expect(data.totalComments).toBe(0)
      expect(data.pagination.totalDocs).toBe(0)
    })

    it('returns 404 for non-existent product on GET', async () => {
      const req = new Request('http://localhost:3000/api/v1/products/9999999/comments', {
        method: 'GET',
      })

      const res = await GET(req, makeContext(9999999))
      expect(res.status).toBe(404)
    })
  })

  describe('R2: PATCH & DELETE /api/v1/products/[id]/comments/[commentId]', () => {
    let authorCommentId: number

    beforeAll(async () => {
      // Create a dedicated comment by regularUser1 for editing/soft-delete tests
      const doc = await payload.create({
        collection: 'comments',
        data: {
          product: testProduct.id,
          user: regularUser1.id,
          content: 'Nội dung ban đầu của câu hỏi cần chỉnh sửa.',
          status: 'published',
        },
        overrideAccess: true,
      })
      authorCommentId = doc.id
      cleanup.comments.push(authorCommentId)
    })

    it('returns 401 when updating unauthenticated', async () => {
      vi.spyOn(payload, 'auth').mockResolvedValueOnce({ user: null } as any)

      const req = new Request(
        `http://localhost:3000/api/v1/products/${testProduct.id}/comments/${authorCommentId}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content: 'Cập nhật không đăng nhập' }),
        },
      )

      const res = await PATCH(req, makeDetailContext(testProduct.id, authorCommentId))
      expect(res.status).toBe(401)
    })

    it('returns 403 when another user attempts to update the comment', async () => {
      vi.spyOn(payload, 'auth').mockResolvedValueOnce({ user: regularUser2 } as any)

      const req = new Request(
        `http://localhost:3000/api/v1/products/${testProduct.id}/comments/${authorCommentId}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content: 'Cố tình sửa bình luận của người khác' }),
        },
      )

      const res = await PATCH(req, makeDetailContext(testProduct.id, authorCommentId))
      expect(res.status).toBe(403)
      const data = await res.json()
      expect(data.error).toBe('FORBIDDEN')
    })

    it('allows author to update their comment content', async () => {
      vi.spyOn(payload, 'auth').mockResolvedValueOnce({ user: regularUser1 } as any)

      const req = new Request(
        `http://localhost:3000/api/v1/products/${testProduct.id}/comments/${authorCommentId}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content: 'Nội dung đã được tác giả chỉnh sửa chính xác hơn.' }),
        },
      )

      const res = await PATCH(req, makeDetailContext(testProduct.id, authorCommentId))
      expect(res.status).toBe(200)
      const data = await res.json()
      expect(data.success).toBe(true)
      expect(data.comment.content).toBe('Nội dung đã được tác giả chỉnh sửa chính xác hơn.')
    })

    it('allows author to update comment content when body includes current status: published without returning 403', async () => {
      vi.spyOn(payload, 'auth').mockResolvedValueOnce({ user: regularUser1 } as any)

      const req = new Request(
        `http://localhost:3000/api/v1/products/${testProduct.id}/comments/${authorCommentId}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            content: 'Nội dung cập nhật kèm trạng thái published hiện tại.',
            status: 'published',
          }),
        },
      )

      const res = await PATCH(req, makeDetailContext(testProduct.id, authorCommentId))
      expect(res.status).toBe(200)
      const data = await res.json()
      expect(data.success).toBe(true)
      expect(data.comment.content).toBe('Nội dung cập nhật kèm trạng thái published hiện tại.')
      expect(data.comment.status).toBe('published')
    })

    it('allows author to soft-delete/hide their comment (status = hidden)', async () => {
      vi.spyOn(payload, 'auth').mockResolvedValueOnce({ user: regularUser1 } as any)

      const req = new Request(
        `http://localhost:3000/api/v1/products/${testProduct.id}/comments/${authorCommentId}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: 'hidden' }),
        },
      )

      const res = await PATCH(req, makeDetailContext(testProduct.id, authorCommentId))
      expect(res.status).toBe(200)
      const data = await res.json()
      expect(data.comment.status).toBe('hidden')

      // Verify that hidden comment is no longer returned in public GET
      const getReq = new Request(`http://localhost:3000/api/v1/products/${testProduct.id}/comments`)
      const getRes = await GET(getReq, makeContext(testProduct.id))
      const getData = await getRes.json()
      const found = getData.comments.some((c: any) => c.id === authorCommentId)
      expect(found).toBe(false)
    })

    it('rejects author attempting to change status to anything other than hidden', async () => {
      vi.spyOn(payload, 'auth').mockResolvedValueOnce({ user: regularUser1 } as any)

      const req = new Request(
        `http://localhost:3000/api/v1/products/${testProduct.id}/comments/${authorCommentId}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: 'published' }),
        },
      )

      const res = await PATCH(req, makeDetailContext(testProduct.id, authorCommentId))
      expect(res.status).toBe(403)
    })

    it('allows admin to change moderation status back to published', async () => {
      vi.spyOn(payload, 'auth').mockResolvedValueOnce({ user: adminUser } as any)

      const req = new Request(
        `http://localhost:3000/api/v1/products/${testProduct.id}/comments/${authorCommentId}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: 'published' }),
        },
      )

      const res = await PATCH(req, makeDetailContext(testProduct.id, authorCommentId))
      expect(res.status).toBe(200)
      const data = await res.json()
      expect(data.comment.status).toBe('published')
    })

    it('allows author to soft-delete via DELETE endpoint', async () => {
      vi.spyOn(payload, 'auth').mockResolvedValueOnce({ user: regularUser1 } as any)

      const req = new Request(
        `http://localhost:3000/api/v1/products/${testProduct.id}/comments/${authorCommentId}`,
        { method: 'DELETE' },
      )

      const res = await DELETE(req, makeDetailContext(testProduct.id, authorCommentId))
      expect(res.status).toBe(200)
      const data = await res.json()
      expect(data.success).toBe(true)
      expect(data.comment.status).toBe('hidden')
    })

    it('allows admin to hard-delete comment via DELETE endpoint', async () => {
      // Create a temporary comment to hard-delete
      const tempDoc = await payload.create({
        collection: 'comments',
        data: {
          product: testProduct.id,
          user: regularUser2.id,
          content: 'Bình luận spam cần xóa vĩnh viễn.',
          status: 'published',
        },
        overrideAccess: true,
      })

      vi.spyOn(payload, 'auth').mockResolvedValueOnce({ user: adminUser } as any)

      const req = new Request(
        `http://localhost:3000/api/v1/products/${testProduct.id}/comments/${tempDoc.id}`,
        { method: 'DELETE' },
      )

      const res = await DELETE(req, makeDetailContext(testProduct.id, tempDoc.id))
      expect(res.status).toBe(200)
      const data = await res.json()
      expect(data.success).toBe(true)
      expect(data.message).toContain('vĩnh viễn')

      // Verify row is deleted from DB
      const findRes = await payload.find({
        collection: 'comments',
        where: { id: { equals: tempDoc.id } },
        overrideAccess: true,
      })
      expect(findRes.totalDocs).toBe(0)
    })

    it('cascades hidden status to all child replies when a parent comment is hidden', async () => {
      // Create a top-level comment
      const parentDoc = await payload.create({
        collection: 'comments',
        data: {
          product: testProduct.id,
          user: regularUser1.id,
          content: 'Câu hỏi kiểm tra cascade ẩn bình luận con.',
          status: 'published',
        },
        overrideAccess: true,
      })
      cleanup.comments.push(parentDoc.id)

      // Create two replies under this parent comment
      const reply1 = await payload.create({
        collection: 'comments',
        data: {
          product: testProduct.id,
          user: sellerUser.id,
          parent: parentDoc.id,
          content: 'Phản hồi 1 từ người bán.',
          status: 'published',
          isSellerReply: true,
        },
        overrideAccess: true,
      })
      cleanup.comments.push(reply1.id)

      const reply2 = await payload.create({
        collection: 'comments',
        data: {
          product: testProduct.id,
          user: regularUser2.id,
          parent: parentDoc.id,
          content: 'Phản hồi 2 từ người mua khác.',
          status: 'published',
        },
        overrideAccess: true,
      })
      cleanup.comments.push(reply2.id)

      // Author hides the parent comment via PATCH
      vi.spyOn(payload, 'auth').mockResolvedValueOnce({ user: regularUser1 } as any)
      const req = new Request(
        `http://localhost:3000/api/v1/products/${testProduct.id}/comments/${parentDoc.id}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: 'hidden' }),
        },
      )
      const res = await PATCH(req, makeDetailContext(testProduct.id, parentDoc.id))
      expect(res.status).toBe(200)

      // Verify that child replies have also been updated to 'hidden'
      const updatedReply1 = await payload.findByID({
        collection: 'comments',
        id: reply1.id,
        overrideAccess: true,
      })
      const updatedReply2 = await payload.findByID({
        collection: 'comments',
        id: reply2.id,
        overrideAccess: true,
      })
      expect(updatedReply1.status).toBe('hidden')
      expect(updatedReply2.status).toBe('hidden')
    })

    it('cascades pending status to replies when parent comment is held for moderation, and restores to published when re-approved', async () => {
      // Create top-level published comment
      const parentDoc = await payload.create({
        collection: 'comments',
        data: {
          product: testProduct.id,
          user: regularUser1.id,
          content: 'Câu hỏi kiểm tra cascade trạng thái pending.',
          status: 'published',
        },
        overrideAccess: true,
      })
      cleanup.comments.push(parentDoc.id)

      // Create a reply
      const replyDoc = await payload.create({
        collection: 'comments',
        data: {
          product: testProduct.id,
          user: sellerUser.id,
          parent: parentDoc.id,
          content: 'Câu trả lời sẽ bị pending theo câu hỏi.',
          status: 'published',
          isSellerReply: true,
        },
        overrideAccess: true,
      })
      cleanup.comments.push(replyDoc.id)

      // Moderator/Admin sets parent to 'pending'
      vi.spyOn(payload, 'auth').mockResolvedValueOnce({ user: adminUser } as any)
      const reqPending = new Request(
        `http://localhost:3000/api/v1/products/${testProduct.id}/comments/${parentDoc.id}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: 'pending' }),
        },
      )
      const resPending = await PATCH(reqPending, makeDetailContext(testProduct.id, parentDoc.id))
      expect(resPending.status).toBe(200)

      // Verify reply was cascaded to 'pending'
      const pendingReply = await payload.findByID({
        collection: 'comments',
        id: replyDoc.id,
        overrideAccess: true,
      })
      expect(pendingReply.status).toBe('pending')

      // Now Admin approves parent comment back to 'published'
      vi.spyOn(payload, 'auth').mockResolvedValueOnce({ user: adminUser } as any)
      const reqApprove = new Request(
        `http://localhost:3000/api/v1/products/${testProduct.id}/comments/${parentDoc.id}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: 'published' }),
        },
      )
      const resApprove = await PATCH(reqApprove, makeDetailContext(testProduct.id, parentDoc.id))
      expect(resApprove.status).toBe(200)

      // Verify reply was restored to 'published'
      const restoredReply = await payload.findByID({
        collection: 'comments',
        id: replyDoc.id,
        overrideAccess: true,
      })
      expect(restoredReply.status).toBe('published')
    })

    it('returns 400 PRODUCT_MISMATCH when updating a comment under a mismatched product ID', async () => {
      vi.spyOn(payload, 'auth').mockResolvedValueOnce({ user: regularUser1 } as any)

      const req = new Request(
        `http://localhost:3000/api/v1/products/${secondProduct.id}/comments/${authorCommentId}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content: 'Cố tình sửa với mismatched product' }),
        },
      )

      const res = await PATCH(req, makeDetailContext(secondProduct.id, authorCommentId))
      expect(res.status).toBe(400)
      const data = await res.json()
      expect(data.error).toBe('PRODUCT_MISMATCH')
    })

    it('returns 400 INVALID_STATUS when updating with an invalid status value', async () => {
      vi.spyOn(payload, 'auth').mockResolvedValueOnce({ user: adminUser } as any)

      const req = new Request(
        `http://localhost:3000/api/v1/products/${testProduct.id}/comments/${authorCommentId}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: 'archived_invalid' }),
        },
      )

      const res = await PATCH(req, makeDetailContext(testProduct.id, authorCommentId))
      expect(res.status).toBe(400)
      const data = await res.json()
      expect(data.error).toBe('INVALID_STATUS')
    })

    it('returns 400 NO_CHANGES when updating with empty body or irrelevant fields', async () => {
      vi.spyOn(payload, 'auth').mockResolvedValueOnce({ user: regularUser1 } as any)

      const req = new Request(
        `http://localhost:3000/api/v1/products/${testProduct.id}/comments/${authorCommentId}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ unhandledProperty: 'ignored' }),
        },
      )

      const res = await PATCH(req, makeDetailContext(testProduct.id, authorCommentId))
      expect(res.status).toBe(400)
      const data = await res.json()
      expect(data.error).toBe('NO_CHANGES')
    })

    it('returns 403 FORBIDDEN when non-author non-admin user attempts to DELETE comment', async () => {
      vi.spyOn(payload, 'auth').mockResolvedValueOnce({ user: regularUser2 } as any)

      const req = new Request(
        `http://localhost:3000/api/v1/products/${testProduct.id}/comments/${authorCommentId}`,
        { method: 'DELETE' },
      )

      const res = await DELETE(req, makeDetailContext(testProduct.id, authorCommentId))
      expect(res.status).toBe(403)
      const data = await res.json()
      expect(data.error).toBe('FORBIDDEN')
    })
  })

  describe('R1: Payload Collection Hooks & Access Boundaries', () => {
    it('enforces content minimum length in collection hook', async () => {
      await expect(
        payload.create({
          collection: 'comments',
          data: {
            product: testProduct.id,
            user: regularUser1.id,
            content: 'ab',
          } as any,
          overrideAccess: true,
        }),
      ).rejects.toThrow(/at least 3 characters/i)
    })

    it('prevents non-admin user from hard-deleting comment via Payload API', async () => {
      const doc = await payload.create({
        collection: 'comments',
        data: {
          product: testProduct.id,
          user: regularUser1.id,
          content: 'Bình luận thử nghiệm xóa bảo mật.',
          status: 'published',
        },
        overrideAccess: true,
      })
      cleanup.comments.push(doc.id)

      await expect(
        payload.delete({
          collection: 'comments',
          id: doc.id,
          user: regularUser1,
          overrideAccess: false,
        }),
      ).rejects.toThrow(/not allowed|forbidden/i)
    })

    it('allows admin user to hard-delete comment via Payload API', async () => {
      const doc = await payload.create({
        collection: 'comments',
        data: {
          product: testProduct.id,
          user: regularUser1.id,
          content: 'Bình luận admin xóa qua Payload API.',
          status: 'published',
        },
        overrideAccess: true,
      })

      const deleteRes = await payload.delete({
        collection: 'comments',
        id: doc.id,
        user: adminUser,
        overrideAccess: false,
      })
      expect(deleteRes.id).toBe(doc.id)
    })

    it('ensures guest user only sees published comments in access control query', async () => {
      const hiddenDoc = await payload.create({
        collection: 'comments',
        data: {
          product: testProduct.id,
          user: regularUser1.id,
          content: 'Bình luận bị ẩn khỏi khách vãng lai.',
          status: 'hidden',
        },
        overrideAccess: true,
      })
      cleanup.comments.push(hiddenDoc.id)

      const guestResult = await payload.find({
        collection: 'comments',
        where: {
          id: {
            equals: hiddenDoc.id,
          },
        },
        overrideAccess: false,
      })

      expect(guestResult.totalDocs).toBe(0)
    })

    it('strictly prevents role badge spoofing when non-privileged user provides isSellerReply or isAdminReply', async () => {
      // Regular user attempts to spoof both seller and admin badges
      const forgedDoc = await payload.create({
        collection: 'comments',
        data: {
          product: testProduct.id,
          user: regularUser1.id,
          content: 'Bình luận giả mạo tác giả và admin.',
          status: 'published',
          isSellerReply: true,
          isAdminReply: true,
        } as any,
        user: regularUser1,
        overrideAccess: false,
      })
      cleanup.comments.push(forgedDoc.id)

      expect(forgedDoc.isSellerReply).toBe(false)
      expect(forgedDoc.isAdminReply).toBe(false)
    })

    it('rejects replying to a non-published parent comment in collection hook', async () => {
      const hiddenParent = await payload.create({
        collection: 'comments',
        data: {
          product: testProduct.id,
          user: regularUser1.id,
          content: 'Bình luận ẩn thử nghiệm hook reply.',
          status: 'hidden',
        },
        overrideAccess: true,
      })
      cleanup.comments.push(hiddenParent.id)

      await expect(
        payload.create({
          collection: 'comments',
          data: {
            product: testProduct.id,
            user: regularUser2.id,
            parent: hiddenParent.id,
            content: 'Cố tình reply vào bình luận ẩn.',
            status: 'published',
          },
          overrideAccess: true,
        }),
      ).rejects.toThrow(/not published|hidden/i)
    })

    it('rejects setting a comment as its own parent on update (cycle detection)', async () => {
      const commentDoc = await payload.create({
        collection: 'comments',
        data: {
          product: testProduct.id,
          user: regularUser1.id,
          content: 'Bình luận thử nghiệm tự tham chiếu.',
          status: 'published',
        },
        overrideAccess: true,
      })
      cleanup.comments.push(commentDoc.id)

      await expect(
        payload.update({
          collection: 'comments',
          id: commentDoc.id,
          data: {
            parent: commentDoc.id,
          } as any,
          overrideAccess: true,
        }),
      ).rejects.toThrow(/cannot be its own parent/i)
    })

    it('strictly prevents changing product relationship on comment update', async () => {
      const commentDoc = await payload.create({
        collection: 'comments',
        data: {
          product: testProduct.id,
          user: regularUser1.id,
          content: 'Bình luận không thể chuyển sang sản phẩm khác.',
          status: 'published',
        },
        overrideAccess: true,
      })
      cleanup.comments.push(commentDoc.id)

      // Try updating product with elevated privilege (overrideAccess: true)
      const updated = await payload.update({
        collection: 'comments',
        id: commentDoc.id,
        data: {
          product: secondProduct.id,
        } as any,
        overrideAccess: true,
      })

      const finalProductId =
        typeof updated.product === 'object' && updated.product !== null
          ? (updated.product as any).id
          : updated.product
      expect(String(finalProductId)).toBe(String(testProduct.id))
    })

    it('evaluates isPrivileged as true when internalOperation context is provided even if req.user is a regular user', async () => {
      // System operation that specifies internalOperation context but has req.user = regularUser1
      const doc = await payload.create({
        collection: 'comments',
        data: {
          product: testProduct.id,
          user: regularUser2.id, // specify different author
          content: 'Bình luận hệ thống được tạo với context: { internalOperation: true }.',
          status: 'published',
          isSellerReply: true, // privileged role flag assignment
        },
        user: regularUser1, // non-admin user attached to request
        context: {
          internalOperation: true,
        },
        overrideAccess: true, // elevated system bypass
      })
      cleanup.comments.push(doc.id)

      const docUserId = typeof doc.user === 'object' && doc.user !== null ? (doc.user as any).id : doc.user
      expect(docUserId).toBe(regularUser2.id)
      expect(doc.isSellerReply).toBe(true)
    })
  })

  describe('Adversarial & Concurrency Suite (R0-3, R0-4)', () => {
    it('handles 10 concurrent question and reply submissions on the same product without database lock contention', async () => {
      const concurrentUsers = [regularUser1, regularUser2, sellerUser, adminUser]

      // 1. Concurrently submit 5 top-level questions
      const questionPromises = Array.from({ length: 5 }, async (_, i) => {
        const u = concurrentUsers[i % concurrentUsers.length]
        vi.spyOn(payload, 'auth').mockResolvedValueOnce({ user: u } as any)

        const req = new Request(`http://localhost:3000/api/v1/products/${testProduct.id}/comments`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            content: `Concurrent stress question #${i + 1} - ${Date.now()}`,
          }),
        })

        return POST(req, makeContext(testProduct.id))
      })

      const questionResponses = await Promise.all(questionPromises)
      const createdQuestionIds: number[] = []
      for (const res of questionResponses) {
        expect(res.status).toBe(201)
        const body = await res.json()
        createdQuestionIds.push(body.comment.id)
        cleanup.comments.push(body.comment.id)
      }

      // Pick the first created question and submit 5 concurrent replies to it
      const targetQuestionId = createdQuestionIds[0]

      const replyPromises = Array.from({ length: 5 }, async (_, i) => {
        const u = concurrentUsers[(i + 1) % concurrentUsers.length]
        vi.spyOn(payload, 'auth').mockResolvedValueOnce({ user: u } as any)

        const req = new Request(`http://localhost:3000/api/v1/products/${testProduct.id}/comments`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            parentId: targetQuestionId,
            content: `Concurrent stress reply #${i + 1} - ${Date.now()}`,
          }),
        })

        return POST(req, makeContext(testProduct.id))
      })

      const replyResponses = await Promise.all(replyPromises)
      for (const res of replyResponses) {
        expect(res.status).toBe(201)
        const body = await res.json()
        expect(body.comment.parentId).toBe(targetQuestionId)
        cleanup.comments.push(body.comment.id)
      }
    })
  })
})
