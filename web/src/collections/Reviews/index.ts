import type { CollectionConfig } from 'payload'
import {
  reviewCreateAccess,
  reviewDeleteAccess,
  reviewReadAccess,
  reviewUpdateAccess,
} from '@/access/reviewAccess'
import { enforceReviewInvariants } from './hooks/enforceReviewInvariants'

export const Reviews: CollectionConfig = {
  slug: 'reviews',
  access: {
    create: reviewCreateAccess,
    delete: reviewDeleteAccess,
    read: reviewReadAccess,
    update: reviewUpdateAccess,
  },
  admin: {
    defaultColumns: ['id', 'product', 'user', 'rating', 'status', 'createdAt'],
    group: 'Commerce',
    useAsTitle: 'id',
    description:
      'Đánh giá và xếp hạng sản phẩm đã xác minh mua hàng (Reviews & Ratings - PLAN.md FR-20, BR-05)',
  },
  hooks: {
    beforeValidate: [enforceReviewInvariants],
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
        description: 'Sản phẩm được đánh giá',
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
        description: 'Người mua gửi đánh giá',
      },
    },
    {
      name: 'entitlement',
      type: 'relationship',
      relationTo: 'entitlements',
      required: true,
      index: true,
      admin: {
        position: 'sidebar',
        description: 'Quyền sở hữu xác minh mua hàng (BR-05)',
      },
    },
    {
      name: 'rating',
      type: 'number',
      required: true,
      min: 1,
      max: 5,
      admin: {
        position: 'sidebar',
        description: 'Đánh giá số sao (1 đến 5 sao)',
      },
    },
    {
      name: 'title',
      type: 'text',
      required: false,
      admin: {
        description: 'Tiêu đề đánh giá (tùy chọn)',
      },
    },
    {
      name: 'content',
      type: 'textarea',
      required: true,
      admin: {
        description: 'Nội dung nhận xét chi tiết (tối thiểu 5 ký tự)',
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
        { label: 'Bị từ chối (rejected)', value: 'rejected' },
      ],
      admin: {
        position: 'sidebar',
        description: 'Trạng thái kiểm duyệt đánh giá',
      },
    },
    {
      name: 'sellerReply',
      type: 'group',
      label: 'Phản hồi từ người bán',
      fields: [
        {
          name: 'comment',
          type: 'textarea',
          required: false,
          label: 'Nội dung phản hồi',
        },
        {
          name: 'repliedAt',
          type: 'date',
          required: false,
          label: 'Thời điểm phản hồi',
        },
      ],
    },
  ],
}
