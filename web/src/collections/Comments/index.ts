import type { CollectionConfig } from 'payload'
import {
  commentCreateAccess,
  commentDeleteAccess,
  commentReadAccess,
  commentUpdateAccess,
} from '@/access/commentAccess'
import { enforceCommentInvariants } from './hooks/enforceCommentInvariants'
import { cascadeCommentStatus } from './hooks/cascadeCommentStatus'

export const Comments: CollectionConfig = {
  labels: {
    singular: 'Comment',
    plural: 'Comments',
  },
  slug: 'comments',
  access: {
    create: commentCreateAccess,
    delete: commentDeleteAccess,
    read: commentReadAccess,
    update: commentUpdateAccess,
  },
  admin: {
    defaultColumns: ['id', 'product', 'user', 'parent', 'status', 'createdAt'],
    group: 'Commerce',
    useAsTitle: 'id',
    description: 'Hỏi đáp & Bình luận sản phẩm (Q&A / Comments - PLAN.md FR-21)',
  },
  hooks: {
    beforeValidate: [enforceCommentInvariants],
    afterChange: [cascadeCommentStatus],
  },
  fields: [
    {
      name: 'product',
      type: 'relationship',
      relationTo: 'products',
      required: true,
      index: true,
      admin: {
        position: 'sidebar',
        description: 'Sản phẩm được bình luận',
      },
    },
    {
      name: 'user',
      type: 'relationship',
      relationTo: 'users',
      required: true,
      index: true,
      admin: {
        position: 'sidebar',
        description: 'Người gửi bình luận',
      },
    },
    {
      name: 'parent',
      type: 'relationship',
      relationTo: 'comments',
      required: false,
      index: true,
      admin: {
        position: 'sidebar',
        description: 'Bình luận cha (nếu là câu trả lời 1 cấp)',
      },
    },
    {
      name: 'content',
      type: 'textarea',
      required: true,
      admin: {
        description: 'Nội dung bình luận / câu hỏi (tối thiểu 3 ký tự)',
      },
    },
    {
      name: 'status',
      type: 'select',
      required: true,
      defaultValue: 'published',
      index: true,
      options: [
        { label: 'Đã xuất bản (published)', value: 'published' },
        { label: 'Chờ duyệt (pending)', value: 'pending' },
        { label: 'Đã ẩn (hidden)', value: 'hidden' },
      ],
      admin: {
        position: 'sidebar',
        description: 'Trạng thái kiểm duyệt bình luận',
      },
    },
    {
      name: 'isSellerReply',
      type: 'checkbox',
      defaultValue: false,
      admin: {
        position: 'sidebar',
        description: 'Đánh dấu phản hồi từ người bán sản phẩm',
      },
    },
    {
      name: 'isAdminReply',
      type: 'checkbox',
      defaultValue: false,
      admin: {
        position: 'sidebar',
        description: 'Đánh dấu phản hồi từ quản trị viên',
      },
    },
  ],
}
